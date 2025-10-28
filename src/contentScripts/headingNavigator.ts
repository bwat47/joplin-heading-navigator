import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem } from '../types';
import { extractHeadings } from '../headingExtractor';
import { HeadingPanel } from './ui/headingPanel';

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
    const selection = EditorSelection.single(heading.from);
    view.dispatch({
        selection,
        effects: EditorView.scrollIntoView(selection.main, { y: 'center' }),
    });
    if (focusEditor) {
        view.focus();
    }
}

export default function headingNavigator(): MarkdownEditorContentScriptModule {
    return {
        plugin: (editorControl: CodeMirrorControl) => {
            const view = editorControl.editor as EditorView;
            let panel: HeadingPanel | null = null;
            let headings: HeadingItem[] = [];
            let selectedHeadingId: string | null = null;

            const ensurePanel = (): HeadingPanel => {
                if (!panel) {
                    panel = new HeadingPanel(view, {
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
                    });
                }

                return panel;
            };

            const openPanel = (): void => {
                headings = computeHeadings(view.state);
                selectedHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);

                if (!headings.length) {
                    closePanel(true);
                    return;
                }

                ensurePanel().open(headings, selectedHeadingId);
            };

            const updatePanel = (): void => {
                if (!panel || !panel.isOpen()) {
                    return;
                }

                selectedHeadingId = findActiveHeadingId(headings, view.state.selection.main.head);
                panel.update(headings, selectedHeadingId);
            };

            const closePanel = (focusEditor = false): void => {
                panel?.destroy();
                panel = null;
                if (focusEditor) {
                    view.focus();
                }
            };

            const togglePanel = (): void => {
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
