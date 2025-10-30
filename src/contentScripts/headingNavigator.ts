import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem, PanelDimensions } from '../types';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel } from './ui/headingPanel';
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

const pendingScrollFrames = new WeakMap<EditorView, number>();
const pendingScrollVerifications = new WeakMap<EditorView, number>();
const SCROLL_VERIFY_DELAY_MS = 160;
const SCROLL_VERIFY_TOLERANCE_PX = 12;

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

function setEditorSelection(view: EditorView, heading: HeadingItem, focusEditor: boolean): void {
    try {
        ensureHighlightStyles(view);
        const targetSelection = EditorSelection.single(heading.from);

        const pendingId = pendingScrollFrames.get(view);
        if (typeof pendingId === 'number') {
            cancelAnimationFrame(pendingId);
            pendingScrollFrames.delete(view);
        }

        const pendingVerificationId = pendingScrollVerifications.get(view);
        if (typeof pendingVerificationId === 'number') {
            window.clearTimeout(pendingVerificationId);
            pendingScrollVerifications.delete(view);
        }

        view.dispatch({
            selection: targetSelection,
            effects: [headingHighlightEffect.of({ from: heading.from, to: heading.to })],
        });

        const frameId = requestAnimationFrame(() => {
            pendingScrollFrames.delete(view);
            const currentSelection = view.state.selection.main;
            if (
                currentSelection.from !== targetSelection.main.from ||
                currentSelection.to !== targetSelection.main.to
            ) {
                return;
            }

            try {
                view.dispatch({
                    effects: EditorView.scrollIntoView(currentSelection, { y: 'center' }),
                });
                if (focusEditor) {
                    view.focus();
                }
            } catch (error) {
                logger.warn('Failed to scroll editor to heading', error);
            }
        });
        pendingScrollFrames.set(view, frameId);

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
                            onClose: () => {
                                closePanel(true);
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

            const closePanel = (focusEditor = false): void => {
                applyHeadingHighlight(view, null);
                panel?.destroy();
                panel = null;
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
