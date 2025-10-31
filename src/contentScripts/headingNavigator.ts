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
const SCROLL_VERIFY_TOLERANCE_PX = 12;

type ViewportSnapshot = {
    selectionFrom: number;
    selectionTo: number;
    blockTopOffset: number;
    blockBottomOffset: number;
};

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
                const scrollElement = measureView.scrollDOM;

                if (measurement) {
                    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
                    const clampedTop = Math.max(0, Math.min(measurement.targetTop, maxScrollTop));

                    if (typeof scrollElement.scrollTo === 'function') {
                        scrollElement.scrollTo({ top: clampedTop });
                    } else {
                        scrollElement.scrollTop = clampedTop;
                    }
                    return;
                }

                if (fallbackScrollTop !== null) {
                    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
                    const clampedTop = Math.max(0, Math.min(fallbackScrollTop, maxScrollTop));
                    if (typeof scrollElement.scrollTo === 'function') {
                        scrollElement.scrollTo({ top: clampedTop });
                    } else {
                        scrollElement.scrollTop = clampedTop;
                    }
                }
            },
        });
    } else if (fallbackScrollTop !== null) {
        // Defer the scroll restoration so it runs after CodeMirror finishes any
        // selection-driven adjustments triggered by the close dispatch above.
        view.requestMeasure({
            read: () => null,
            write(_measure, measureView) {
                const scrollElement = measureView.scrollDOM;
                const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
                const clampedTop = Math.max(0, Math.min(fallbackScrollTop, maxScrollTop));
                if (typeof scrollElement.scrollTo === 'function') {
                    scrollElement.scrollTo({ top: clampedTop });
                } else {
                    scrollElement.scrollTop = clampedTop;
                }
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

        // Trigger a one-shot visibility check to catch cases where scrollIntoView bails
        // (CodeMirror can drop the effect in very long docs). If we detect the heading
        // still hugging the viewport edge, re-centering here keeps navigation reliable
        // without second-guessing every scroll.
        const verificationId = window.setTimeout(() => {
            pendingScrollVerifications.delete(view);

            view.requestMeasure({
                read(measureView) {
                    const selection = measureView.state.selection.main;
                    if (selection.from !== targetSelection.main.from || selection.to !== targetSelection.main.to) {
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

                    const viewportTop = scrollDOM.scrollTop;
                    const viewportBottom = viewportTop + scrollDOM.clientHeight;
                    const blockTop = Math.min(start.top, end.top) - rect.top + viewportTop;
                    const blockBottom = Math.max(start.bottom, end.bottom) - rect.top + viewportTop;

                    return {
                        selectionFrom: selection.from,
                        selectionTo: selection.to,
                        viewportTop,
                        viewportBottom,
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

                    const tolerance = SCROLL_VERIFY_TOLERANCE_PX;
                    const needsScroll =
                        measurement.blockTop < measurement.viewportTop + tolerance ||
                        measurement.blockBottom > measurement.viewportBottom - tolerance;

                    if (!needsScroll) {
                        return;
                    }

                    const blockHeight = Math.max(measurement.blockBottom - measurement.blockTop, 1);
                    const centeredTop =
                        measurement.blockTop - Math.max(0, (measureView.scrollDOM.clientHeight - blockHeight) / 2);
                    const maxScrollTop = measureView.scrollDOM.scrollHeight - measureView.scrollDOM.clientHeight;
                    const clampedTop = Math.max(0, Math.min(centeredTop, maxScrollTop));

                    if (typeof measureView.scrollDOM.scrollTo === 'function') {
                        measureView.scrollDOM.scrollTo({ top: clampedTop });
                    } else {
                        measureView.scrollDOM.scrollTop = clampedTop;
                    }

                    if (focusEditor) {
                        measureView.focus();
                    }
                },
            });
        }, SCROLL_VERIFY_DELAY_MS);

        pendingScrollVerifications.set(view, verificationId);
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
            let initialViewportSnapshotToken: symbol | null = null;

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
                const snapshotToken = Symbol('viewportSnapshot');
                initialViewportSnapshotToken = snapshotToken;

                if (snapshotSelection) {
                    view.requestMeasure({
                        read(measureView): ViewportSnapshot | null {
                            const selectionView = measureView.state.selection.main;
                            if (
                                selectionView.from !== snapshotSelection.from ||
                                selectionView.to !== snapshotSelection.to
                            ) {
                                return null;
                            }

                            const scrollDOM = measureView.scrollDOM;
                            const rect = scrollDOM.getBoundingClientRect();
                            if (Number.isNaN(rect.top)) {
                                return null;
                            }

                            const start = measureView.coordsAtPos(selectionView.from);
                            const end = measureView.coordsAtPos(selectionView.to);
                            if (!start || !end) {
                                return null;
                            }

                            const blockTopOffset = Math.min(start.top, end.top) - rect.top;
                            const blockBottomOffset = Math.max(start.bottom, end.bottom) - rect.top;

                            return {
                                selectionFrom: selectionView.from,
                                selectionTo: selectionView.to,
                                blockTopOffset,
                                blockBottomOffset,
                            };
                        },
                        write(measurement: ViewportSnapshot | null) {
                            if (!measurement || initialViewportSnapshotToken !== snapshotToken) {
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
                    initialViewportSnapshotToken = null;

                    restoreEditorViewport(view, snapshot, fallbackScrollTop);
                }

                initialSelectionRange = null;
                initialScrollTop = null;
                initialViewportSnapshot = null;
                initialViewportSnapshotToken = null;

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
