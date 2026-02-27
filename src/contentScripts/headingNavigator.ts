/**
 * Heading Navigator content script for CodeMirror 6 integration.
 *
 * This file runs in the CodeMirror editor context with direct access to the editor DOM and state,
 * but without access to Joplin APIs (clipboard, data store, etc.). It:
 * - Integrates with CodeMirror 6 as a plugin extension
 * - Manages the floating heading panel UI lifecycle
 * - Handles editor state changes (document edits, cursor movement)
 * - Implements scroll verification for reliable heading navigation with dynamic content
 * - Sends messages to the plugin host for privileged operations (clipboard, note data)
 *
 * Architecture:
 * - Content script (this file): Has CodeMirror access, manages editor UI, limited API access
 * - Plugin host (index.ts): Has Joplin API access, handles clipboard/data operations
 * - Communication: Content script → plugin host via postMessage bridge (see messages.ts)
 *
 * Key challenge: Documents with dynamic content (images, rich markdown) cause layout shifts
 * after initial scroll. The scroll verification system uses retry logic to
 * ensure headings stay pinned to the viewport top despite these shifts.
 *
 * See:
 * - index.ts - Plugin host that receives messages from this content script
 * - messages.ts - Message protocol definitions
 * - ui/headingPanel.ts - Floating panel UI implementation
 */

import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem, PanelDimensions } from '../types';
import type { ContentScriptToPluginMessage } from '../messages';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel, type PanelCloseReason } from './ui/headingPanel';
import { normalizePanelDimensions } from '../panelDimensions';
import logger from '../logger';

// Track active verification timeouts per editor. WeakMap ensures automatic
// cleanup when editor instances are destroyed (e.g., note close, plugin reload).
const scrollVerificationTimeouts = new WeakMap<EditorView, number>();

function cancelPendingVerification(view: EditorView): void {
    const timeoutId = scrollVerificationTimeouts.get(view);
    if (typeof timeoutId === 'number') {
        window.clearTimeout(timeoutId);
        scrollVerificationTimeouts.delete(view);
    }
}

/**
 * Scroll Verification Constants
 *
 * Tuned timing and tolerance values for the scroll verification retry system.
 *
 * - SCROLL_VERIFY_DELAY_MS: Initial verification delay (~2 animation frames)
 * - SCROLL_VERIFY_RETRY_DELAY_MS: Second verification delay (guards against late shifts)
 * - SCROLL_VERIFY_TOLERANCE_PX: Acceptable offset below viewport top (12px)
 * - SCROLL_VERIFY_NEGATIVE_TOLERANCE_PX: Stricter tolerance above viewport top (1.5px)
 * - SCROLL_VERIFY_MAX_ATTEMPTS: Maximum retry attempts (2)
 */
const SCROLL_VERIFY_DELAY_MS = 160;
const SCROLL_VERIFY_RETRY_DELAY_MS = 260;
const SCROLL_VERIFY_TOLERANCE_PX = 12;
const SCROLL_VERIFY_NEGATIVE_TOLERANCE_PX = 1.5;
const SCROLL_VERIFY_MAX_ATTEMPTS = 2;

type ScrollVerificationMeasurement =
    | {
          status: 'geometry';
          selectionFrom: number;
          selectionTo: number;
          viewportTop: number;
          blockTopOffset: number;
      }
    | {
          status: 'retry';
          selectionFrom: number;
          selectionTo: number;
      };

function planScrollVerification(view: EditorView, attempt: number, run: () => void): void {
    // attempt is 0-based: 0 for the first verification pass, 1 for the second, etc.
    const delay = attempt === 0 ? SCROLL_VERIFY_DELAY_MS : SCROLL_VERIFY_RETRY_DELAY_MS;

    const timeoutId = window.setTimeout(() => {
        scrollVerificationTimeouts.delete(view);
        run();
    }, delay);

    scrollVerificationTimeouts.set(view, timeoutId);
}

function ensureEditorFocus(view: EditorView, shouldFocus: boolean): void {
    if (!shouldFocus) {
        return;
    }

    view.focus();
}

/**
 * Creates a scroll verification function that ensures a heading stays pinned to the viewport top.
 *
 * Why retry logic is needed:
 * - Dynamic content (images, code blocks) may finish rendering after initial scroll
 * - Late layout shifts push the heading out of view despite successful scrollIntoView
 * - Two-phase verification (160ms, 260ms) catches both immediate and deferred shifts
 * - Aborts if user moves cursor or after 2 attempts to prevent infinite loops
 *
 * @param options - Configuration for scroll verification
 * @param options.view - CodeMirror editor view instance
 * @param options.targetRange - Target selection range to verify (from/to positions)
 * @param options.focusEditor - Whether to restore editor focus after verification
 * @returns Verification function that accepts attempt number (0-based)
 */
function createScrollVerifier(options: {
    view: EditorView;
    targetRange: { from: number; to: number };
    focusEditor: boolean;
}): (attempt: number) => void {
    const { view, targetRange, focusEditor } = options;

    const verify = (attempt: number): void => {
        if (attempt >= SCROLL_VERIFY_MAX_ATTEMPTS) {
            return;
        }

        planScrollVerification(view, attempt, () => {
            view.requestMeasure({
                read(measureView): ScrollVerificationMeasurement | null {
                    const selection = measureView.state.selection.main;
                    if (!isSameSelection(selection, targetRange)) {
                        return null;
                    }

                    const blockMeasurement = measureSelectionBlock(measureView, selection);
                    if (!blockMeasurement) {
                        return {
                            status: 'retry',
                            selectionFrom: selection.from,
                            selectionTo: selection.to,
                        };
                    }

                    return {
                        status: 'geometry' as const,
                        selectionFrom: blockMeasurement.selectionFrom,
                        selectionTo: selection.to,
                        viewportTop: blockMeasurement.viewportTop,
                        blockTopOffset: blockMeasurement.blockTopOffset,
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

                    if (measurement.status === 'retry') {
                        if (attempt + 1 >= SCROLL_VERIFY_MAX_ATTEMPTS) {
                            logger.warn('Scroll verification gave up after measurement failures', {
                                selection: targetRange,
                                attempts: attempt + 1,
                            });
                            return;
                        }

                        // Defer dispatch to avoid "update is in progress" errors on mobile.
                        // Mobile WebViews can have different event timing that causes the
                        // write phase to overlap with other CodeMirror updates.
                        setTimeout(() => {
                            measureView.dispatch({
                                effects: EditorView.scrollIntoView(selection, { y: 'start' }),
                            });

                            ensureEditorFocus(measureView, focusEditor);

                            verify(attempt + 1);
                        }, 0);
                        return;
                    }

                    const tolerance = SCROLL_VERIFY_TOLERANCE_PX;
                    const offsetFromViewportTop = measurement.blockTopOffset;
                    const needsScroll =
                        offsetFromViewportTop < 0
                            ? Math.abs(offsetFromViewportTop) > SCROLL_VERIFY_NEGATIVE_TOLERANCE_PX
                            : offsetFromViewportTop > tolerance;

                    if (!needsScroll) {
                        // Stay on guard for late layout shifts (e.g. images loading) that can push the heading
                        // below the viewport top; extra checks keep it pinned even when content settles.
                        if (attempt + 1 < SCROLL_VERIFY_MAX_ATTEMPTS) {
                            verify(attempt + 1);
                        }
                        return;
                    }

                    // Defer dispatch to avoid "update is in progress" errors on mobile.
                    // Mobile WebViews can have different event timing that causes the
                    // write phase to overlap with other CodeMirror updates.
                    setTimeout(() => {
                        const targetScrollTop = Math.max(measurement.viewportTop + offsetFromViewportTop, 0);
                        // Force the scroll position in case CodeMirror bails out when it thinks the range is already visible.
                        if (Math.abs(measureView.scrollDOM.scrollTop - targetScrollTop) > 1) {
                            measureView.scrollDOM.scrollTop = targetScrollTop;
                        }

                        measureView.dispatch({
                            effects: EditorView.scrollIntoView(selection, { y: 'start' }),
                        });
                        ensureEditorFocus(measureView, focusEditor);

                        if (attempt + 1 < SCROLL_VERIFY_MAX_ATTEMPTS) {
                            verify(attempt + 1);
                        }
                    }, 0);
                },
            });
        });
    };

    return verify;
}

type SelectionBlockMeasurement = {
    selectionFrom: number;
    blockTopOffset: number;
    viewportTop: number;
};

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

function measureSelectionBlock(
    view: EditorView,
    selection: { from: number; to: number }
): SelectionBlockMeasurement | null {
    const scrollDOM = view.scrollDOM;
    const rect = scrollDOM.getBoundingClientRect();
    if (Number.isNaN(rect.top)) {
        return null;
    }

    const start = view.coordsAtPos(selection.from);
    if (!start) {
        return null;
    }

    const blockTopOffset = start.top - rect.top;
    const viewportTop = scrollDOM.scrollTop;

    return {
        selectionFrom: selection.from,
        blockTopOffset,
        viewportTop,
    };
}

function computeHeadings(state: EditorState): HeadingItem[] {
    return extractHeadings(state.doc.toString());
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

        cancelPendingVerification(view);

        // Move the real selection so the caret and heading panel stay synchronized.
        // Rich Markdown reacts to this by rebuilding image widgets a moment later,
        // which can nudge the scroll position and force us to verify it afterward.
        view.dispatch({
            selection: targetSelection,
            effects: EditorView.scrollIntoView(targetSelection.main, { y: 'start' }),
        });

        ensureEditorFocus(view, focusEditor);

        const runVerification = createScrollVerifier({
            view,
            targetRange: targetSelection.main,
            focusEditor,
        });

        // Trigger visibility checks to catch cases where scrollIntoView bails or later layout
        // shifts (from those widget rebuilds) push the heading away from the viewport edge.
        // Start alignment is more resilient to content changes above the heading since it
        // doesn't depend on relative centering math.
        runVerification(0);
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
            // Note: Extensions and listeners are scoped to this EditorView instance.
            // When Joplin destroys the editor (note close, plugin disable),
            // all resources are automatically cleaned up. No explicit disposal needed.
            const view = editorControl.editor as EditorView;
            let panel: HeadingPanel | null = null;
            let headings: HeadingItem[] = [];
            let panelDimensions: PanelDimensions = normalizePanelDimensions();
            let compactMode = false;
            let initialSelectionRange: { from: number; to: number } | null = null;
            let initialScrollSnapshot: ReturnType<EditorView['scrollSnapshot']> | null = null;
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
                                closePanel(true);
                            },
                            onClose: (reason: PanelCloseReason) => {
                                closePanel(true, reason === 'escape');
                            },
                            onCopy: (heading) => {
                                void sendCopyRequest(heading);
                            },
                        },
                        panelDimensions,
                        isMobile,
                        compactMode
                    );
                }

                return panel;
            };

            const openPanel = (isMobile: boolean): void => {
                headings = computeHeadings(view.state);
                const activeHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                const selection = view.state.selection.main;
                initialSelectionRange = { from: selection.from, to: selection.to };
                initialScrollSnapshot = view.scrollSnapshot();

                ensurePanel(isMobile).open(headings, activeHeadingId);
            };

            const updatePanel = (): void => {
                if (!panel || !panel.isOpen()) {
                    return;
                }

                const activeHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                panel.update(headings, activeHeadingId);
            };

            const closePanel = (focusEditor = false, restoreOriginalPosition = false): void => {
                panel?.destroy();
                panel = null;

                if (restoreOriginalPosition && initialSelectionRange) {
                    cancelPendingVerification(view);

                    try {
                        const selectionToRestore = EditorSelection.range(
                            initialSelectionRange.from,
                            initialSelectionRange.to
                        );

                        view.dispatch({
                            selection: selectionToRestore,
                            effects: initialScrollSnapshot,
                        });
                    } catch (error) {
                        logger.warn('Failed to restore editor selection after closing panel', error);
                    }
                }

                initialSelectionRange = null;
                initialScrollSnapshot = null;

                ensureEditorFocus(view, focusEditor);
            };

            const togglePanel = (dimensions?: PanelDimensions, isMobile?: boolean, compact?: boolean): void => {
                if (dimensions) {
                    // Update dimensions without re-opening if panel exists
                    panelDimensions = normalizePanelDimensions(dimensions);
                    if (panel) {
                        panel.setOptions(panelDimensions);
                    }
                }

                if (typeof compact === 'boolean') {
                    compactMode = compact;
                }

                if (panel?.isOpen()) {
                    closePanel(true);
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
                    headings = computeHeadings(update.state);
                    updatePanel();
                } else if (update.selectionSet) {
                    updatePanel();
                }
            });

            editorControl.addExtension(updateListener);
            editorControl.registerCommand(EDITOR_COMMAND_TOGGLE_PANEL, togglePanel);
        },
    };
}
