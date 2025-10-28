import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem, PanelDimensions } from '../types';
import { DEFAULT_PANEL_DIMENSIONS } from '../types';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel } from './ui/headingPanel';
import { createPanelTheme } from './theme/panelTheme';

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

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;
const MIN_PANEL_HEIGHT_RATIO = 0.4;
const MAX_PANEL_HEIGHT_RATIO = 0.9;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function normalizePanelDimensions(dimensions?: PanelDimensions): PanelDimensions {
    const fallback = DEFAULT_PANEL_DIMENSIONS;
    if (!dimensions) {
        return { ...fallback };
    }

    const rawWidth = Number.isFinite(dimensions.width) ? dimensions.width : fallback.width;
    const rawMaxHeight = Number.isFinite(dimensions.maxHeightRatio)
        ? dimensions.maxHeightRatio
        : fallback.maxHeightRatio;

    return {
        width: clamp(Math.round(rawWidth), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH),
        maxHeightRatio: clamp(rawMaxHeight, MIN_PANEL_HEIGHT_RATIO, MAX_PANEL_HEIGHT_RATIO),
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

function setEditorSelection(view: EditorView, heading: HeadingItem, focusEditor: boolean): void {
    ensureHighlightStyles(view);
    const selection = EditorSelection.single(heading.from);
    view.dispatch({
        selection,
        effects: [
            EditorView.scrollIntoView(selection.main, { y: 'center' }),
            headingHighlightEffect.of({ from: heading.from, to: heading.to }),
        ],
    });
    if (focusEditor) {
        view.focus();
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
            let panelDimensions: PanelDimensions = normalizePanelDimensions(DEFAULT_PANEL_DIMENSIONS);

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

                panel.setOptions(panelDimensions);
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
