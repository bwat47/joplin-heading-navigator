import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem, PanelDimensions } from '../types';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel, type PanelCloseReason } from './ui/headingPanel';
import { normalizePanelDimensions } from '../panelDimensions';
import logger from '../logger';

const pendingScrollVerifications = new WeakMap<EditorView, number>();
const SCROLL_VERIFY_DELAY_MS = 160;
const SCROLL_VERIFY_RETRY_DELAY_MS = 260;
const SCROLL_VERIFY_TOLERANCE_PX = 12;
const SCROLL_VERIFY_MAX_ATTEMPTS = 2;

type ScrollVerificationMeasurement =
    | {
          status: 'geometry';
          selectionFrom: number;
          selectionTo: number;
          viewportTop: number;
          blockTop: number;
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
        pendingScrollVerifications.delete(view);
        run();
    }, delay);

    pendingScrollVerifications.set(view, timeoutId);
}

function ensureEditorFocus(view: EditorView, shouldFocus: boolean): void {
    if (!shouldFocus) {
        return;
    }

    view.focus();
}

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
                        blockTop: blockMeasurement.blockTopOffset + blockMeasurement.viewportTop,
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

                        measureView.dispatch({
                            effects: EditorView.scrollIntoView(selection, { y: 'start' }),
                        });

                        ensureEditorFocus(measureView, focusEditor);

                        verify(attempt + 1);
                        return;
                    }

                    const tolerance = SCROLL_VERIFY_TOLERANCE_PX;
                    const needsScroll = measurement.blockTop < measurement.viewportTop + tolerance;

                    if (!needsScroll) {
                        // Stay on guard for late layout shifts (e.g. images loading) that can push the heading
                        // below the viewport top—extra checks keep it pinned even when content settles.
                        if (attempt + 1 < SCROLL_VERIFY_MAX_ATTEMPTS) {
                            verify(attempt + 1);
                        }
                        return;
                    }

                    measureView.dispatch({
                        effects: EditorView.scrollIntoView(selection, { y: 'start' }),
                    });
                    ensureEditorFocus(measureView, focusEditor);

                    if (attempt + 1 < SCROLL_VERIFY_MAX_ATTEMPTS) {
                        verify(attempt + 1);
                    }
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

        const pendingVerificationId = pendingScrollVerifications.get(view);
        if (typeof pendingVerificationId === 'number') {
            window.clearTimeout(pendingVerificationId);
            pendingScrollVerifications.delete(view);
        }

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
        // shifts push the target outside the viewport. Start alignment is more resilient to
        // content changes above the heading since it doesn't depend on relative centering math.
        runVerification(0);
    } catch (error) {
        logger.error('Failed to set editor selection', error);
    }
}

export default function headingNavigator(): MarkdownEditorContentScriptModule {
    return {
        plugin: (editorControl: CodeMirrorControl) => {
            // Note: Extensions and listeners are scoped to this EditorView instance.
            // When Joplin destroys the editor (note close, plugin disable),
            // all resources are automatically cleaned up. No explicit disposal needed.
            const view = editorControl.editor as EditorView;
            let panel: HeadingPanel | null = null;
            let headings: HeadingItem[] = [];
            let selectedHeadingId: string | null = null;
            let panelDimensions: PanelDimensions = normalizePanelDimensions();
            let initialSelectionRange: { from: number; to: number } | null = null;
            let initialScrollSnapshot: ReturnType<EditorView['scrollSnapshot']> | null = null;

            const ensurePanel = (): HeadingPanel => {
                if (!panel) {
                    panel = new HeadingPanel(
                        view,
                        {
                            onPreview: (heading) => {
                                selectedHeadingId = heading.id;
                                setEditorSelection(view, heading, false);
                            },
                            onSelect: (heading) => {
                                selectedHeadingId = heading.id;
                                setEditorSelection(view, heading, true);
                                closePanel(true);
                            },
                            onClose: (reason: PanelCloseReason) => {
                                closePanel(true, reason === 'escape');
                            },
                        },
                        panelDimensions
                    );
                }

                return panel;
            };

            const openPanel = (): void => {
                headings = computeHeadings(view.state);
                selectedHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                const selection = view.state.selection.main;
                initialSelectionRange = { from: selection.from, to: selection.to };
                initialScrollSnapshot = view.scrollSnapshot();

                ensurePanel().open(headings, selectedHeadingId);
            };

            const updatePanel = (): void => {
                if (!panel || !panel.isOpen()) {
                    return;
                }

                selectedHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                panel.update(headings, selectedHeadingId);
            };

            const closePanel = (focusEditor = false, restoreOriginalPosition = false): void => {
                panel?.destroy();
                panel = null;

                if (restoreOriginalPosition && initialSelectionRange) {
                    const pendingVerificationId = pendingScrollVerifications.get(view);
                    if (typeof pendingVerificationId === 'number') {
                        window.clearTimeout(pendingVerificationId);
                        pendingScrollVerifications.delete(view);
                    }

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

            const togglePanel = (dimensions?: PanelDimensions): void => {
                if (dimensions) {
                    panelDimensions = normalizePanelDimensions(dimensions);
                    if (panel) {
                        panel.setOptions(panelDimensions);
                    }
                }

                if (panel?.isOpen()) {
                    closePanel(true);
                } else {
                    openPanel();
                }
            };

            const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
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
