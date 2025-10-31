import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem, PanelDimensions } from '../types';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel, type PanelCloseReason } from './ui/headingPanel';
import { createPanelTheme } from './theme/panelTheme';
import { normalizePanelDimensions } from '../panelDimensions';
import logger from '../logger';

const HIGHLIGHT_STYLE_ID = 'heading-navigator-highlight-style';

const headingHighlightMark = Decoration.mark({
    class: 'heading-navigator-highlight',
});

const headingHighlightEffect = StateEffect.define<{ from: number; to: number } | null>();

const headingHighlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, transaction) {
        let mapped = decorations.map(transaction.changes);
        for (const effect of transaction.effects) {
            if (effect.is(headingHighlightEffect)) {
                if (!effect.value) {
                    mapped = Decoration.none;
                } else {
                    mapped = Decoration.set([headingHighlightMark.range(effect.value.from, effect.value.to)]);
                }
            }
        }
        return mapped;
    },
    provide: (field) => EditorView.decorations.from(field),
});

const headingHighlightTheme = EditorView.baseTheme({
    '.heading-navigator-highlight': {
        borderRadius: '4px',
        padding: '0 2px',
        transition: 'background-color 120ms ease-out',
    },
});

const pendingScrollVerifications = new WeakMap<EditorView, number>();
const SCROLL_VERIFY_DELAY_MS = 160;
const SCROLL_VERIFY_RETRY_DELAY_MS = 260;
const SCROLL_VERIFY_TOLERANCE_PX = 12;
const SCROLL_VERIFY_MAX_ATTEMPTS = 3;
const VIEWPORT_SNAPSHOT_MEASURE_KEY = { id: 'headingNavigatorViewportSnapshot' };

type ViewportSnapshot = {
    selectionFrom: number;
    selectionTo: number;
    blockTopOffset: number;
    blockBottomOffset: number;
};

type ScrollVerificationMeasurement =
    | {
          status: 'geometry';
          selectionFrom: number;
          selectionTo: number;
          viewportTop: number;
          viewportBottom: number;
          blockTop: number;
          blockBottom: number;
      }
    | {
          status: 'retry';
          selectionFrom: number;
          selectionTo: number;
      };

type ScrollContainer = HTMLElement & {
    scrollTo?: (options: ScrollToOptions) => void;
};

function applyScrollTop(element: ScrollContainer, desiredTop: number): void {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const clampedTop = Math.max(0, Math.min(desiredTop, maxScrollTop));

    if (typeof element.scrollTo === 'function') {
        element.scrollTo({ top: clampedTop });
    } else {
        element.scrollTop = clampedTop;
    }
}

function restoreScroll(view: EditorView, targetTop: number | null, fallbackTop: number | null): void {
    const scrollElement = view.scrollDOM as ScrollContainer;
    if (targetTop !== null) {
        applyScrollTop(scrollElement, targetTop);
        return;
    }

    if (fallbackTop !== null) {
        applyScrollTop(scrollElement, fallbackTop);
    }
}

function planScrollVerification(view: EditorView, attempt: number, run: () => void): void {
    const delay = attempt === 0 ? SCROLL_VERIFY_DELAY_MS : SCROLL_VERIFY_RETRY_DELAY_MS;

    const timeoutId = window.setTimeout(() => {
        pendingScrollVerifications.delete(view);
        run();
    }, delay);

    pendingScrollVerifications.set(view, timeoutId);
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
                    if (selection.from !== targetRange.from || selection.to !== targetRange.to) {
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

                    const blockTop = blockMeasurement.blockTopOffset + blockMeasurement.viewportTop;
                    const blockBottom = blockMeasurement.blockBottomOffset + blockMeasurement.viewportTop;

                    return {
                        status: 'geometry',
                        selectionFrom: blockMeasurement.selectionFrom,
                        selectionTo: blockMeasurement.selectionTo,
                        viewportTop: blockMeasurement.viewportTop,
                        viewportBottom: blockMeasurement.viewportBottom,
                        blockTop,
                        blockBottom,
                    };
                },
                write(measurement, measureView) {
                    if (!measurement) {
                        return;
                    }

                    const selection = measureView.state.selection.main;
                    if (selection.from !== measurement.selectionFrom || selection.to !== measurement.selectionTo) {
                        return;
                    }

                    if (measurement.status === 'retry') {
                        measureView.dispatch({
                            effects: EditorView.scrollIntoView(selection, { y: 'center' }),
                        });

                        if (focusEditor) {
                            measureView.focus();
                        }

                        verify(attempt + 1);
                        return;
                    }

                    const tolerance = SCROLL_VERIFY_TOLERANCE_PX;
                    const needsScroll =
                        measurement.blockTop < measurement.viewportTop + tolerance ||
                        measurement.blockBottom > measurement.viewportBottom - tolerance;

                    if (!needsScroll) {
                        if (attempt + 1 < SCROLL_VERIFY_MAX_ATTEMPTS) {
                            verify(attempt + 1);
                        }
                        return;
                    }

                    const blockHeight = Math.max(measurement.blockBottom - measurement.blockTop, 1);
                    const centeredTop =
                        measurement.blockTop - Math.max(0, (measureView.scrollDOM.clientHeight - blockHeight) / 2);
                    applyScrollTop(measureView.scrollDOM as ScrollContainer, centeredTop);
                    if (focusEditor) {
                        measureView.focus();
                    }

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
    selectionTo: number;
    blockTopOffset: number;
    blockBottomOffset: number;
    viewportTop: number;
    viewportBottom: number;
};

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
    const end = view.coordsAtPos(selection.to);
    if (!start || !end) {
        return null;
    }

    const blockTopOffset = Math.min(start.top, end.top) - rect.top;
    const blockBottomOffset = Math.max(start.bottom, end.bottom) - rect.top;
    const viewportTop = scrollDOM.scrollTop;
    const viewportBottom = viewportTop + scrollDOM.clientHeight;

    return {
        selectionFrom: selection.from,
        selectionTo: selection.to,
        blockTopOffset,
        blockBottomOffset,
        viewportTop,
        viewportBottom,
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

function ensureHighlightStyles(view: EditorView): void {
    const doc = view.dom.ownerDocument ?? document;
    const theme = createPanelTheme(view);
    const signature = `${theme.background}|${theme.highlightBackground}`;

    let style = doc.getElementById(HIGHLIGHT_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = doc.createElement('style');
        style.id = HIGHLIGHT_STYLE_ID;
        (doc.head ?? doc.body).appendChild(style);
    }

    if (style.getAttribute('data-theme-signature') === signature) {
        return;
    }

    style.setAttribute('data-theme-signature', signature);
    style.textContent = `
.cm-content .heading-navigator-highlight {
    background-color: ${theme.highlightBackground};
}
`;
}

function applyHeadingHighlight(view: EditorView, heading: HeadingItem | null): void {
    if (heading) {
        ensureHighlightStyles(view);
    }

    view.dispatch({
        effects: headingHighlightEffect.of(heading ? { from: heading.from, to: heading.to } : null),
    });
}

function restoreEditorViewport(
    view: EditorView,
    snapshot: ViewportSnapshot | null,
    fallbackScrollTop: number | null
): void {
    if (snapshot) {
        view.requestMeasure({
            read(measureView): { targetTop: number } | null {
                const selection = measureView.state.selection.main;
                if (selection.from !== snapshot.selectionFrom || selection.to !== snapshot.selectionTo) {
                    return null;
                }

                const scrollDOM = measureView.scrollDOM;
                const rect = scrollDOM.getBoundingClientRect();
                if (Number.isNaN(rect.top)) {
                    return null;
                }

                const start = measureView.coordsAtPos(selection.from);
                const end = measureView.coordsAtPos(selection.to);
                if (!start || !end) {
                    return null;
                }

                const blockTop = Math.min(start.top, end.top) - rect.top;
                const blockBottom = Math.max(start.bottom, end.bottom) - rect.top;
                const absoluteTop = scrollDOM.scrollTop + blockTop;
                const absoluteBottom = scrollDOM.scrollTop + blockBottom;
                const desiredTop = absoluteTop - snapshot.blockTopOffset;
                const desiredBottom = absoluteBottom - snapshot.blockBottomOffset;
                const clientHeight = scrollDOM.clientHeight;
                const maxScrollTop = Math.max(0, scrollDOM.scrollHeight - clientHeight);

                let targetTop = Math.max(0, Math.min(desiredTop, maxScrollTop));
                if (desiredBottom > targetTop + clientHeight) {
                    targetTop = Math.max(0, Math.min(desiredBottom - clientHeight, maxScrollTop));
                }

                if (!Number.isFinite(targetTop)) {
                    return null;
                }

                return { targetTop };
            },
            write(measurement: { targetTop: number } | null, measureView) {
                const targetTop = measurement ? measurement.targetTop : null;
                restoreScroll(measureView, targetTop, fallbackScrollTop);
            },
        });
    } else if (fallbackScrollTop !== null) {
        // Defer the scroll restoration so it runs after CodeMirror finishes any
        // selection-driven adjustments triggered by the close dispatch above.
        view.requestMeasure({
            read: () => null,
            write(_measure, measureView) {
                restoreScroll(measureView, null, fallbackScrollTop);
            },
        });
    }
}

function setEditorSelection(view: EditorView, heading: HeadingItem, focusEditor: boolean): void {
    try {
        ensureHighlightStyles(view);
        const targetSelection = EditorSelection.single(heading.from);

        const pendingVerificationId = pendingScrollVerifications.get(view);
        if (typeof pendingVerificationId === 'number') {
            window.clearTimeout(pendingVerificationId);
            pendingScrollVerifications.delete(view);
        }

        view.dispatch({
            selection: targetSelection,
            effects: [
                headingHighlightEffect.of({ from: heading.from, to: heading.to }),
                EditorView.scrollIntoView(targetSelection.main, { y: 'center' }),
            ],
        });

        if (focusEditor) {
            view.focus();
        }

        const runVerification = createScrollVerifier({
            view,
            targetRange: targetSelection.main,
            focusEditor,
        });

        // Trigger visibility checks to catch cases where scrollIntoView bails or later layout
        // shifts push the target outside the viewport. Retrying with a 'start' alignment ensures
        // the heading at least becomes visible before we attempt to re-center it.
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
            let initialScrollTop: number | null = null;
            let initialViewportSnapshot: ViewportSnapshot | null = null;

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
                initialScrollTop = view.scrollDOM.scrollTop;
                initialViewportSnapshot = null;
                const snapshotSelection = initialSelectionRange;

                if (snapshotSelection) {
                    view.requestMeasure({
                        key: VIEWPORT_SNAPSHOT_MEASURE_KEY,
                        read(measureView): ViewportSnapshot | null {
                            const selectionView = measureView.state.selection.main;
                            if (
                                selectionView.from !== snapshotSelection.from ||
                                selectionView.to !== snapshotSelection.to
                            ) {
                                return null;
                            }

                            const blockMeasurement = measureSelectionBlock(measureView, selectionView);
                            if (!blockMeasurement) {
                                return null;
                            }

                            return {
                                selectionFrom: selectionView.from,
                                selectionTo: selectionView.to,
                                blockTopOffset: blockMeasurement.blockTopOffset,
                                blockBottomOffset: blockMeasurement.blockBottomOffset,
                            };
                        },
                        write(measurement: ViewportSnapshot | null) {
                            if (!measurement) {
                                return;
                            }

                            initialViewportSnapshot = measurement;
                        },
                    });
                }

                ensurePanel().open(headings, selectedHeadingId);
                if (!headings.length) {
                    applyHeadingHighlight(view, null);
                }
            };

            const updatePanel = (): void => {
                if (!panel || !panel.isOpen()) {
                    return;
                }

                selectedHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                panel.update(headings, selectedHeadingId);
                const activeHeading = headings.find((heading) => heading.id === selectedHeadingId) ?? null;
                applyHeadingHighlight(view, activeHeading);
            };

            const closePanel = (focusEditor = false, restoreOriginalPosition = false): void => {
                applyHeadingHighlight(view, null);
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
                        view.dispatch({ selection: selectionToRestore });
                    } catch (error) {
                        logger.warn('Failed to restore editor selection after closing panel', error);
                    }

                    const snapshot = initialViewportSnapshot;
                    const fallbackScrollTop = initialScrollTop;
                    initialViewportSnapshot = null;

                    restoreEditorViewport(view, snapshot, fallbackScrollTop);
                }

                initialSelectionRange = null;
                initialScrollTop = null;
                initialViewportSnapshot = null;

                if (focusEditor) {
                    view.focus();
                }
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

            editorControl.addExtension([headingHighlightField, headingHighlightTheme]);
            editorControl.addExtension(updateListener);
            editorControl.registerCommand(EDITOR_COMMAND_TOGGLE_PANEL, togglePanel);
        },
    };
}
