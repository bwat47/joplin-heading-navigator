/**
 * Heading Navigator content script for CodeMirror 6 integration.
 *
 * This file runs in the CodeMirror editor context with direct access to the editor DOM and state,
 * but without access to Joplin APIs (clipboard, data store, etc.). It:
 * - Integrates with CodeMirror 6 as a plugin extension
 * - Manages the floating heading panel UI lifecycle
 * - Handles editor state changes (document edits, cursor movement)
 * - Implements scroll stabilization for reliable heading navigation with dynamic content
 * - Sends messages to the plugin host for privileged operations (clipboard, note data)
 *
 * Architecture:
 * - Content script (this file): Has CodeMirror access, manages editor UI, limited API access
 * - Plugin host (index.ts): Has Joplin API access, handles clipboard/data operations
 * - Communication: Content script → plugin host via postMessage bridge (see messages.ts)
 *
 * Key challenge: Documents with dynamic content (images, rich markdown) cause layout shifts
 * after initial scroll. The scroll stabilization pass re-measures once after
 * the initial navigation and lets CodeMirror correct meaningful drift.
 *
 * See:
 * - index.ts - Plugin host that receives messages from this content script
 * - messages.ts - Message protocol definitions
 * - ui/headingPanel.ts - Floating panel UI implementation
 */

import { EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { forceParsing, language, syntaxTree } from '@codemirror/language';
import type { CodeMirrorControl, ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem } from '../types';
import type { ContentScriptToPluginMessage, PanelRestoreState } from '../messages';
import { computeHeadingState } from '../headingExtractor';
import { HeadingPanel, type PanelCloseReason } from './ui/headingPanel';
import logger from '../logger';
import { createSettingsExtension, getContentScriptSettings, syncInitialContentScriptSettings } from './pluginSettings';

// Track active stabilization timeouts per editor. WeakMap ensures automatic
// cleanup when editor instances are destroyed (e.g., note close, plugin reload).
const scrollStabilizationTimeouts = new WeakMap<EditorView, number>();

function cancelPendingScrollStabilization(view: EditorView): void {
    const timeoutId = scrollStabilizationTimeouts.get(view);
    if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        scrollStabilizationTimeouts.delete(view);
    }
}

/**
 * Scroll Stabilization Constants
 *
 * Tuned timing and tolerance values for the single delayed stabilization pass.
 *
 * - SCROLL_STABILIZE_DELAY_MS: Stabilization delay after initial scroll
 * - SCROLL_STABILIZE_TOLERANCE_PX: Acceptable offset below viewport top
 * - SCROLL_STABILIZE_NEGATIVE_TOLERANCE_PX: Stricter tolerance above viewport top
 */
const SCROLL_STABILIZE_DELAY_MS = 160;
const SCROLL_STABILIZE_TOLERANCE_PX = 12;
const SCROLL_STABILIZE_NEGATIVE_TOLERANCE_PX = 1.5;
const HEADING_REPARSE_DEBOUNCE_MS = 150;
// Per-slice budget for driving the parser forward while the heading list is incomplete,
// and the pause between slices that keeps the editor responsive.
const FORCE_PARSE_SLICE_MS = 100;
const FORCE_PARSE_RETRY_DELAY_MS = 150;
// How far each slice advances the parse target. forceParsing only publishes a new
// syntax tree when it reaches its target, so bounded targets are what make the heading
// list fill in progressively instead of jumping from the opening snapshot to complete.
const FORCE_PARSE_CHUNK_CHARS = 250_000;

type ScrollStabilizationMeasurement = {
    selectionFrom: number;
    selectionTo: number;
    offsetFromViewportTop: number | null;
    needsScroll: boolean;
};

function ensureEditorFocus(view: EditorView, shouldFocus: boolean): void {
    if (!shouldFocus) {
        return;
    }

    view.focus();
}

/**
 * Schedules one delayed scroll stabilization pass for heading navigation.
 *
 * Dynamic content (images, code blocks, selection-driven widgets) may shift after
 * the initial scroll. Re-measuring once after CodeMirror has a chance to update
 * catches common drift without maintaining a recursive retry system.
 *
 * @param options - Configuration for scroll stabilization
 * @param options.view - CodeMirror editor view instance
 * @param options.targetRange - Target selection range to stabilize (from/to positions)
 * @param options.focusEditor - Whether to restore editor focus after stabilization
 */
function scheduleScrollStabilization(options: {
    view: EditorView;
    targetRange: { from: number; to: number };
    focusEditor: boolean;
}): void {
    const { view, targetRange, focusEditor } = options;

    cancelPendingScrollStabilization(view);

    const timeoutId = window.setTimeout(() => {
        try {
            view.requestMeasure({
                read(measureView): ScrollStabilizationMeasurement | null {
                    const selection = measureView.state.selection.main;
                    if (!isSameSelection(selection, targetRange)) {
                        return null;
                    }

                    const scrollDOM = measureView.scrollDOM;
                    const scrollRect = scrollDOM.getBoundingClientRect();
                    const start = measureView.coordsAtPos(selection.from);
                    if (!start) {
                        return {
                            selectionFrom: selection.from,
                            selectionTo: selection.to,
                            offsetFromViewportTop: null,
                            needsScroll: true,
                        };
                    }

                    const offsetFromViewportTop = start.top - scrollRect.top;
                    const needsScroll =
                        offsetFromViewportTop < 0
                            ? Math.abs(offsetFromViewportTop) > SCROLL_STABILIZE_NEGATIVE_TOLERANCE_PX
                            : offsetFromViewportTop > SCROLL_STABILIZE_TOLERANCE_PX;

                    return {
                        selectionFrom: selection.from,
                        selectionTo: selection.to,
                        offsetFromViewportTop,
                        needsScroll,
                    };
                },
                write(measurement, measureView) {
                    if (!measurement) {
                        return;
                    }

                    const selection = measureView.state.selection.main;
                    if (!isSameSelection(selection, measurement)) {
                        return;
                    }

                    logger.debug('Scroll stabilization measurement', measurement);

                    if (!measurement.needsScroll) {
                        return;
                    }

                    // Defer dispatch to avoid "update is in progress" errors on mobile.
                    // Mobile WebViews can have different event timing that causes the
                    // write phase to overlap with other CodeMirror updates.
                    setTimeout(() => {
                        const currentSelection = measureView.state.selection.main;
                        if (!isSameSelection(currentSelection, measurement)) {
                            return;
                        }

                        measureView.dispatch({
                            effects: EditorView.scrollIntoView(currentSelection, { y: 'start', yMargin: 0 }),
                        });
                        ensureEditorFocus(measureView, focusEditor);
                    }, 0);
                },
            });
        } finally {
            scrollStabilizationTimeouts.delete(view);
        }
    }, SCROLL_STABILIZE_DELAY_MS);

    scrollStabilizationTimeouts.set(view, timeoutId);
}

type SelectionLike = { from: number; to: number } | { selectionFrom: number; selectionTo: number } | null;

function normalizeSelection(selection: SelectionLike): { from: number; to: number } | null {
    if (!selection) {
        return null;
    }

    if ('from' in selection && 'to' in selection) {
        return { from: selection.from, to: selection.to };
    }

    if ('selectionFrom' in selection && 'selectionTo' in selection) {
        return { from: selection.selectionFrom, to: selection.selectionTo };
    }

    return null;
}

function isSameSelection(a: SelectionLike, b: SelectionLike): boolean {
    const normalizedA = normalizeSelection(a);
    const normalizedB = normalizeSelection(b);

    if (!normalizedA || !normalizedB) {
        return false;
    }

    return normalizedA.from === normalizedB.from && normalizedA.to === normalizedB.to;
}

function findActiveHeadingId(headings: HeadingItem[], position: number): string | null {
    if (!headings.length) {
        return null;
    }

    let candidate: HeadingItem | null = null;
    for (const heading of headings) {
        if (heading.from <= position) {
            candidate = heading;
        } else {
            break;
        }
    }

    return candidate?.id ?? headings[0].id;
}

function setEditorSelection(view: EditorView, heading: HeadingItem, focusEditor: boolean): void {
    try {
        const targetSelection = EditorSelection.single(heading.from);

        // Move the real selection so the caret and heading panel stay synchronized.
        // Rich Markdown reacts to this by rebuilding image widgets a moment later,
        // which can nudge the scroll position and force us to verify it afterward.
        view.dispatch({
            selection: targetSelection,
            effects: EditorView.scrollIntoView(targetSelection.main, { y: 'start' }),
        });

        ensureEditorFocus(view, focusEditor);

        // Catch cases where scrollIntoView bails or a later widget rebuild pushes the heading
        // away from the viewport edge.
        scheduleScrollStabilization({
            view,
            targetRange: targetSelection.main,
            focusEditor,
        });
    } catch (error) {
        logger.error('Failed to set editor selection', error);
    }
}

/**
 * Builds the CodeMirror content script module that powers the heading navigator panel.
 *
 * Registers listeners and commands on the provided editor control, keeps the heading list
 * and active selection in sync with document changes, and routes panel actions (preview,
 * select, copy, close) back to the editor or plugin host as needed.
 *
 * @param context - Messaging bridge used when the panel requests privileged actions
 * @returns Content script module consumed by Joplin's editor runtime
 */
export default function headingNavigator(context: ContentScriptContext): MarkdownEditorContentScriptModule {
    return {
        plugin: (editorControl: CodeMirrorControl) => {
            // Extensions are scoped to this EditorView instance. Panel-owned DOM listeners
            // and timers are explicitly cleaned up by the lifecycle plugin below.
            const view = editorControl.editor as EditorView;
            let panel: HeadingPanel | null = null;
            let headings: HeadingItem[] = [];
            // False while the syntax tree covers only a prefix of a very large document;
            // drives the forceParsing completion loop until the heading list is full.
            let headingsComplete = true;
            let initialSelectionRange: { from: number; to: number } | null = null;
            let initialScrollSnapshot: ReturnType<EditorView['scrollSnapshot']> | null = null;
            let headingReparseTimer: number | null = null;
            let parseCompletionTimer: number | null = null;
            // Suppresses persistence while programmatically re-pinning during startup restore,
            // so only user-initiated pin toggles write to settings.
            let suppressPinPersist = false;
            // Set on editor teardown so the async startup restore cannot mount a panel
            // (and leak its document-level listeners) against a destroyed view.
            let editorDestroyed = false;
            const noteIdFacet = editorControl.joplinExtensions?.noteIdFacet;

            const resolveNoteId = (): string | null => {
                if (!noteIdFacet) {
                    return null;
                }
                try {
                    const value = view.state.facet(noteIdFacet);
                    if (Array.isArray(value)) {
                        const candidate = value[0];
                        return typeof candidate === 'string' && candidate ? candidate : null;
                    }
                    return typeof value === 'string' && value ? value : null;
                } catch (error) {
                    logger.warn('Failed to resolve active note id from facet', error);
                    return null;
                }
            };

            const sendCopyRequest = async (heading: HeadingItem): Promise<void> => {
                const noteId = resolveNoteId();
                if (!noteId) {
                    logger.warn('Unable to copy heading link because the active note id is unavailable', {
                        headingId: heading.id,
                    });
                    return;
                }

                const message: ContentScriptToPluginMessage = {
                    type: 'copyHeadingLink',
                    noteId,
                    headingText: heading.text,
                    headingAnchor: heading.anchor,
                };

                try {
                    await context.postMessage(message);
                } catch (error) {
                    logger.error('Failed to request heading link copy', error);
                }
            };

            const persistPinnedState = async (pinned: boolean): Promise<void> => {
                const message: ContentScriptToPluginMessage = {
                    type: 'persistPinnedState',
                    pinned,
                };

                try {
                    await context.postMessage(message);
                } catch (error) {
                    logger.error('Failed to persist panel pinned state', error);
                }
            };

            const ensurePanel = (isMobile: boolean): HeadingPanel => {
                if (!panel) {
                    panel = new HeadingPanel(
                        view,
                        {
                            onPreview: (heading) => {
                                setEditorSelection(view, heading, false);
                            },
                            onSelect: (heading) => {
                                setEditorSelection(view, heading, true);
                                if (!panel?.isPinned()) {
                                    closePanel(true);
                                }
                            },
                            onClose: (reason: PanelCloseReason) => {
                                closePanel(true, reason === 'escape');
                            },
                            onCopy: (heading) => {
                                void sendCopyRequest(heading);
                            },
                            onPinChange: (pinned) => {
                                if (pinned) {
                                    initialSelectionRange = null;
                                    initialScrollSnapshot = null;
                                }
                                if (!suppressPinPersist) {
                                    void persistPinnedState(pinned);
                                }
                            },
                            onRequestEditorFocus: () => {
                                ensureEditorFocus(view, true);
                            },
                        },
                        getContentScriptSettings(view.state),
                        isMobile
                    );
                }

                return panel;
            };

            const cancelPendingParseCompletion = (): void => {
                if (parseCompletionTimer !== null) {
                    window.clearTimeout(parseCompletionTimer);
                    parseCompletionTimer = null;
                }
            };

            // forceParsing dispatches a transaction, so it must never run synchronously
            // inside an update listener or another dispatch — always via this timeout.
            const scheduleParseCompletion = (delayMs = 0): void => {
                if (parseCompletionTimer !== null) {
                    return;
                }

                parseCompletionTimer = window.setTimeout(() => {
                    parseCompletionTimer = null;
                    if (!panel || !panel.isOpen() || headingsComplete) {
                        return;
                    }

                    if (view.state.facet(language) === null) {
                        logger.warn('Stopping heading parse completion loop: no language parser is installed');
                        return;
                    }

                    // Advance the target in bounded chunks: forceParsing only publishes a
                    // new tree when it reaches its target, so targeting doc.length directly
                    // would keep the panel frozen on the opening snapshot until the entire
                    // document finished parsing. Each published chunk reaches the update
                    // listener, which folds the newly covered headings into the list.
                    const docLength = view.state.doc.length;
                    const target = Math.min(syntaxTree(view.state).length + FORCE_PARSE_CHUNK_CHARS, docLength);
                    const reachedTarget = forceParsing(view, target, FORCE_PARSE_SLICE_MS);
                    if (reachedTarget && target === docLength) {
                        return;
                    }

                    // Continue with the next chunk, or retry one that exhausted its slice
                    // budget — progress persists in CodeMirror's parse context between
                    // slices, so repeated slices always converge on the target.
                    scheduleParseCompletion(FORCE_PARSE_RETRY_DELAY_MS);
                }, delayMs);
            };

            const refreshHeadings = (): void => {
                const computation = computeHeadingState(view.state);
                headings = computation.headings;
                headingsComplete = computation.complete;

                if (!headingsComplete) {
                    scheduleParseCompletion();
                }
            };

            const openPanel = (isMobile: boolean, focusInput = true): void => {
                refreshHeadings();
                const activeHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                const selection = view.state.selection.main;
                initialSelectionRange = { from: selection.from, to: selection.to };
                initialScrollSnapshot = view.scrollSnapshot();

                ensurePanel(isMobile).open(headings, activeHeadingId, focusInput);
            };

            const updatePanelHeadings = (): void => {
                if (!panel || !panel.isOpen()) {
                    return;
                }

                const activeHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                panel.updateHeadings(headings, activeHeadingId);
            };

            const cancelPendingHeadingReparse = (): void => {
                if (headingReparseTimer !== null) {
                    window.clearTimeout(headingReparseTimer);
                    headingReparseTimer = null;
                }
            };

            const scheduleHeadingReparse = (): void => {
                cancelPendingHeadingReparse();
                headingReparseTimer = window.setTimeout(() => {
                    headingReparseTimer = null;
                    if (!panel || !panel.isOpen()) {
                        return;
                    }

                    refreshHeadings();
                    updatePanelHeadings();
                }, HEADING_REPARSE_DEBOUNCE_MS);
            };

            const closePanel = (focusEditor = false, restoreOriginalPosition = false): void => {
                cancelPendingHeadingReparse();
                cancelPendingParseCompletion();
                panel?.destroy();
                panel = null;

                if (restoreOriginalPosition && initialSelectionRange) {
                    cancelPendingScrollStabilization(view);

                    try {
                        const selectionToRestore = EditorSelection.range(
                            initialSelectionRange.from,
                            initialSelectionRange.to
                        );

                        if (initialScrollSnapshot) {
                            view.dispatch({
                                selection: selectionToRestore,
                                effects: initialScrollSnapshot,
                            });
                        } else {
                            view.dispatch({
                                selection: selectionToRestore,
                            });
                        }
                    } catch (error) {
                        logger.warn('Failed to restore editor selection after closing panel', error);
                    }
                }

                initialSelectionRange = null;
                initialScrollSnapshot = null;

                ensureEditorFocus(view, focusEditor);
            };

            const togglePanel = (isMobile?: boolean): void => {
                if (panel?.isOpen()) {
                    if (panel.isPinned()) {
                        panel.focusFilter();
                    } else {
                        closePanel(true);
                    }
                } else {
                    openPanel(isMobile ?? false);
                }
            };

            const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
                // Skip all work when panel is closed - headings are computed fresh in openPanel()
                if (!panel || !panel.isOpen()) {
                    return;
                }

                if (update.docChanged) {
                    scheduleHeadingReparse();
                } else if (!headingsComplete && syntaxTree(update.state) !== syntaxTree(update.startState)) {
                    // Background parsing extended the tree without a document change;
                    // fold the newly covered headings into the list.
                    scheduleHeadingReparse();
                } else if (update.selectionSet) {
                    const activeHeadingId = findActiveHeadingId(headings, update.state.selection.main.head);
                    panel.setActiveHeading(activeHeadingId);
                }
            });

            const lifecyclePlugin = ViewPlugin.fromClass(
                class {
                    public destroy(): void {
                        editorDestroyed = true;
                        closePanel();
                        cancelPendingScrollStabilization(view);
                    }
                }
            );

            const restorePinnedPanel = async (): Promise<void> => {
                const message: ContentScriptToPluginMessage = { type: 'getPanelRestoreState' };

                try {
                    const state = (await context.postMessage(message)) as PanelRestoreState | null | undefined;
                    if (editorDestroyed || !state?.pinned || state.isMobile) {
                        return;
                    }

                    // The user may have opened the panel before the round-trip finished.
                    if (panel?.isOpen()) {
                        return;
                    }

                    openPanel(false, false);
                    suppressPinPersist = true;
                    try {
                        panel?.setPinned(true);
                    } finally {
                        suppressPinPersist = false;
                    }
                } catch (error) {
                    logger.warn('Failed to restore pinned panel state', error);
                }
            };

            editorControl.addExtension([createSettingsExtension(), updateListener, lifecyclePlugin]);
            editorControl.registerCommand(EDITOR_COMMAND_TOGGLE_PANEL, togglePanel);
            void syncInitialContentScriptSettings(context, view, () => !editorDestroyed).then((settings) => {
                if (settings) {
                    panel?.setSettings(settings);
                }
            });
            void restorePinnedPanel();
        },
    };
}
