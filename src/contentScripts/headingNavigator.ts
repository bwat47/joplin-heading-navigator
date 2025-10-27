import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { HeadingItem } from '../types';
import { extractHeadings } from '../headingExtractor';

const PANEL_STYLE_ID = 'heading-navigator-styles';
const PANEL_CSS = `
.heading-navigator-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 320px;
    max-height: 60%;
    display: flex;
    flex-direction: column;
    background-color: var(--joplin-editor-background-color, var(--joplin-color-background, #ffffff));
    color: var(--joplin-editor-foreground-color, var(--joplin-color, #2f3136));
    border: 1px solid var(--joplin-color2);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 2000;
    overflow: hidden;
}

.heading-navigator-input {
    padding: 8px;
    border: none;
    border-bottom: 1px solid var(--joplin-color2);
    background-color: inherit;
    color: inherit;
    font-size: 14px;
    outline: none;
}

.heading-navigator-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    font-size: 13px;
    background-color: inherit;
}

.heading-navigator-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    cursor: pointer;
    background-color: inherit;
}

.heading-navigator-item.is-selected {
    background-color: var(--joplin-color3);
    color: var(--joplin-color-background);
}

.heading-navigator-item-level {
    font-size: 11px;
    opacity: 0.75;
}

.heading-navigator-item-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.heading-navigator-empty {
    padding: 12px;
    opacity: 0.7;
    text-align: center;
}
`;

interface PanelCallbacks {
    onPreview: (heading: HeadingItem) => void;
    onSelect: (heading: HeadingItem) => void;
    onClose: () => void;
}

class HeadingPanel {
    private readonly view: EditorView;

    private readonly container: HTMLDivElement;

    private readonly input: HTMLInputElement;

    private readonly list: HTMLUListElement;

    private headings: HeadingItem[] = [];

    private filtered: HeadingItem[] = [];

    private selectedHeadingId: string | null = null;

    private lastPreviewedId: string | null = null;

    private readonly onPreview: (heading: HeadingItem) => void;

    private readonly onSelect: (heading: HeadingItem) => void;

    private readonly onClose: () => void;

    private readonly handleInputListener: () => void;

    private readonly handleKeyDownListener: (event: KeyboardEvent) => void;

    private readonly handleListClickListener: (event: MouseEvent) => void;

    private readonly handleDocumentMouseDownListener: (event: MouseEvent) => void;

    public constructor(view: EditorView, callbacks: PanelCallbacks) {
        this.view = view;
        this.onPreview = callbacks.onPreview;
        this.onSelect = callbacks.onSelect;
        this.onClose = callbacks.onClose;

        this.container = document.createElement('div');
        this.container.className = 'heading-navigator-panel';

        this.input = document.createElement('input');
        this.input.type = 'search';
        this.input.placeholder = 'Filter headings';
        this.input.className = 'heading-navigator-input';
        this.container.appendChild(this.input);

        this.list = document.createElement('ul');
        this.list.className = 'heading-navigator-list';
        this.container.appendChild(this.list);

        this.handleInputListener = () => {
            this.applyFilter(this.input.value);
            this.notifyPreview();
        };

        this.handleKeyDownListener = (event: KeyboardEvent) => {
            this.handleKeyDown(event);
        };

        this.handleListClickListener = (event: MouseEvent) => {
            this.handleListClick(event);
        };

        this.handleDocumentMouseDownListener = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) {
                return;
            }

            if (this.container.contains(target)) {
                return;
            }

            this.onClose();
        };

        this.input.addEventListener('input', this.handleInputListener);
        this.input.addEventListener('keydown', this.handleKeyDownListener);
        this.list.addEventListener('mousedown', this.handleListClickListener);
        this.ownerDocument().addEventListener('mousedown', this.handleDocumentMouseDownListener, true);
    }

    public open(headings: HeadingItem[], selectedId: string | null): void {
        this.mount();
        this.input.value = '';
        this.selectedHeadingId = selectedId;
        this.lastPreviewedId = null;
        this.setHeadings(headings, '', true);
        setTimeout(() => this.input.focus(), 0);
    }

    public update(headings: HeadingItem[], selectedId: string | null, preserveFilter = true): void {
        const filterText = preserveFilter ? this.input.value : '';
        if (!preserveFilter) {
            this.input.value = '';
        }
        this.selectedHeadingId = selectedId ?? this.selectedHeadingId;
        this.setHeadings(headings, filterText, false);
    }

    public destroy(): void {
        this.input.removeEventListener('input', this.handleInputListener);
        this.input.removeEventListener('keydown', this.handleKeyDownListener);
        this.list.removeEventListener('mousedown', this.handleListClickListener);
        this.ownerDocument().removeEventListener('mousedown', this.handleDocumentMouseDownListener, true);
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }

    public isOpen(): boolean {
        return Boolean(this.container.parentElement);
    }

    private ownerDocument(): Document {
        return this.view.dom.ownerDocument ?? document;
    }

    private mount(): void {
        ensurePanelStyles(this.view);

        if (!this.container.parentElement) {
            const root = this.view.scrollDOM.parentElement ?? this.view.dom.parentElement ?? this.view.dom;
            root.appendChild(this.container);
        }
    }

    private setHeadings(headings: HeadingItem[], filterText = '', emitPreview = true): void {
        this.headings = headings;
        this.applyFilter(filterText);
        if (emitPreview) {
            this.notifyPreview();
        } else {
            this.updatePreviewMarker();
        }
    }

    private applyFilter(filterText: string): void {
        const normalized = filterText.trim().toLowerCase();
        if (!normalized) {
            this.filtered = [...this.headings];
        } else {
            this.filtered = this.headings.filter((heading) => heading.text.toLowerCase().includes(normalized));
        }

        if (this.filtered.length === 0) {
            this.selectedHeadingId = null;
        } else if (this.selectedHeadingId) {
            const match = this.filtered.find((heading) => heading.id === this.selectedHeadingId);
            if (!match) {
                this.selectedHeadingId = this.filtered[0].id;
            }
        } else {
            this.selectedHeadingId = this.filtered[0].id;
        }

        this.render();
    }

    private notifyPreview(): void {
        if (!this.selectedHeadingId) {
            this.lastPreviewedId = null;
            return;
        }

        if (this.selectedHeadingId === this.lastPreviewedId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        if (!heading) {
            this.lastPreviewedId = null;
            return;
        }

        this.lastPreviewedId = heading.id;
        this.onPreview(heading);
    }

    private updatePreviewMarker(): void {
        if (!this.selectedHeadingId) {
            this.lastPreviewedId = null;
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        this.lastPreviewedId = heading?.id ?? null;
    }

    private handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowDown':
            case 'Tab':
                event.preventDefault();
                this.moveSelection(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection(-1);
                break;
            case 'Enter':
                event.preventDefault();
                this.confirmSelection();
                break;
            case 'Escape':
                event.preventDefault();
                this.onClose();
                break;
            default:
                break;
        }
    }

    private moveSelection(delta: number): void {
        if (!this.filtered.length) {
            this.selectedHeadingId = null;
            this.render();
            return;
        }

        const currentIndex = this.filtered.findIndex((heading) => heading.id === this.selectedHeadingId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + delta + this.filtered.length) % this.filtered.length : 0;
        this.selectedHeadingId = this.filtered[nextIndex].id;
        this.updateSelection();
        this.scrollActiveItemIntoView();
        this.notifyPreview();
    }

    private confirmSelection(): void {
        if (!this.selectedHeadingId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        if (heading) {
            this.onSelect(heading);
        }
    }

    private handleListClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        const itemElement = target?.closest<HTMLLIElement>('.heading-navigator-item');
        if (!itemElement) {
            return;
        }

        const headingId = itemElement.dataset.headingId;
        if (!headingId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === headingId);
        if (heading) {
            this.selectedHeadingId = heading.id;
            this.confirmSelection();
        }
    }

    private render(): void {
        this.list.innerHTML = '';

        if (!this.filtered.length) {
            const empty = document.createElement('li');
            empty.className = 'heading-navigator-empty';
            empty.textContent = 'No headings found';
            this.list.appendChild(empty);
            return;
        }

        this.filtered.forEach((heading) => {
            const item = document.createElement('li');
            item.className = 'heading-navigator-item';
            item.dataset.headingId = heading.id;
            item.style.paddingLeft = `${12 + (heading.level - 1) * 12}px`;

            const level = document.createElement('span');
            level.className = 'heading-navigator-item-level';
            level.textContent = `H${heading.level} · line ${heading.line + 1}`;

            const text = document.createElement('span');
            text.className = 'heading-navigator-item-text';
            text.textContent = heading.text;

            item.appendChild(level);
            item.appendChild(text);

            if (heading.id === this.selectedHeadingId) {
                item.classList.add('is-selected');
            }

            this.list.appendChild(item);
        });

        this.scrollActiveItemIntoView();
    }

    private updateSelection(): void {
        const items = this.list.querySelectorAll<HTMLLIElement>('.heading-navigator-item');
        items.forEach((item) => {
            if (item.dataset.headingId === this.selectedHeadingId) {
                item.classList.add('is-selected');
            } else {
                item.classList.remove('is-selected');
            }
        });
    }

    private scrollActiveItemIntoView(): void {
        const activeItem = this.list.querySelector<HTMLLIElement>('.heading-navigator-item.is-selected');
        activeItem?.scrollIntoView({ block: 'nearest' });
    }
}

function ensurePanelStyles(view: EditorView): void {
    const doc = view.dom.ownerDocument ?? document;
    if (doc.getElementById(PANEL_STYLE_ID)) {
        return;
    }

    const style = doc.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent = PANEL_CSS;
    (doc.head ?? doc.body).appendChild(style);
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
    view.dispatch({
        selection: EditorSelection.single(heading.from),
        scrollIntoView: true,
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
