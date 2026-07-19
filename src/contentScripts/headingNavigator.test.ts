import { EditorSelection, EditorState, StateEffect, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parser } from '@lezer/markdown';
import type { CodeMirrorControl, ContentScriptContext } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { PanelDimensions } from '../types';
import headingNavigator from './headingNavigator';

const panelDimensions: PanelDimensions = { width: 320, maxHeightRatio: 0.75 };

class ResizeObserverMock {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
}

describe('heading navigator panel lifecycle', () => {
    let view: EditorView;
    let togglePanel: (dimensions?: PanelDimensions, isMobile?: boolean, compact?: boolean) => void;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({
            state: EditorState.create({ doc: '# One\n\n## Two' }),
            parent,
        });

        const editorControl = {
            editor: view,
            addExtension: (extension: Extension) => {
                view.dispatch({ effects: StateEffect.appendConfig.of(extension) });
            },
            registerCommand: (name: string, callback: typeof togglePanel) => {
                if (name === EDITOR_COMMAND_TOGGLE_PANEL) {
                    togglePanel = callback;
                }
            },
        } as unknown as CodeMirrorControl;
        const context = { postMessage: vi.fn() } as unknown as ContentScriptContext;

        headingNavigator(context).plugin(editorControl);
    });

    afterEach(() => {
        view.destroy();
        document.body.textContent = '';
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('debounces reparsing until 150ms after the latest document change', () => {
        const parseSpy = vi.spyOn(parser, 'parse');
        togglePanel(panelDimensions, false, false);
        expect(parseSpy).toHaveBeenCalledTimes(1);

        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n### Three' } });
        vi.advanceTimersByTime(149);
        expect(parseSpy).toHaveBeenCalledTimes(1);

        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n#### Four' } });
        vi.advanceTimersByTime(149);
        expect(parseSpy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        expect(parseSpy).toHaveBeenCalledTimes(2);
        expect(document.querySelectorAll('.heading-navigator-item')).toHaveLength(4);
    });

    it('cancels a pending reparse when an unpinned panel closes', () => {
        const parseSpy = vi.spyOn(parser, 'parse');
        togglePanel(panelDimensions, false, false);
        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n### Three' } });

        togglePanel(panelDimensions, false, false);
        vi.advanceTimersByTime(150);

        expect(parseSpy).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('updates cursor-follow selection without reparsing or replacing list items', () => {
        const parseSpy = vi.spyOn(parser, 'parse');
        togglePanel(panelDimensions, false, false);
        const itemsBefore = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));

        view.dispatch({ selection: EditorSelection.cursor(8) });

        const itemsAfter = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));
        expect(parseSpy).toHaveBeenCalledTimes(1);
        expect(itemsAfter).toEqual(itemsBefore);
        expect(itemsAfter[1].classList.contains('is-selected')).toBe(true);
    });

    it('focuses the filter instead of closing when the command is invoked while pinned', () => {
        togglePanel(panelDimensions, false, false);
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        view.focus();

        togglePanel(panelDimensions, false, false);

        expect(document.querySelector('.heading-navigator-panel')).not.toBeNull();
        expect(document.activeElement).toBe(document.querySelector('.heading-navigator-input'));
    });

    it('restores the opening selection on unpinned Escape', () => {
        togglePanel(panelDimensions, false, false);
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        vi.advanceTimersByTime(30);
        expect(view.state.selection.main.head).toBe(7);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(view.state.selection.main.head).toBe(0);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('drops restoration semantics after pinning and leaves the panel open on Escape', () => {
        togglePanel(panelDimensions, false, false);
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        vi.advanceTimersByTime(30);
        expect(view.state.selection.main.head).toBe(7);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(view.state.selection.main.head).toBe(7);
        expect(document.querySelector('.heading-navigator-panel')).not.toBeNull();
        expect(document.activeElement).toBe(view.contentDOM);
    });

    it('does not restore the opening selection after pinning and then unpinning', () => {
        togglePanel(panelDimensions, false, false);
        const pinButton = document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')!;
        pinButton.click();
        pinButton.click();
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        vi.advanceTimersByTime(30);
        expect(view.state.selection.main.head).toBe(7);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(view.state.selection.main.head).toBe(7);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('keeps pinned selections mounted and closes after unpinning and clicking outside', () => {
        togglePanel(panelDimensions, false, false);
        const pinButton = document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')!;
        pinButton.click();

        document.querySelectorAll<HTMLLIElement>('.heading-navigator-item')[1].click();
        expect(view.state.selection.main.head).toBe(7);
        expect(document.querySelector('.heading-navigator-panel')).not.toBeNull();
        expect(document.activeElement).toBe(view.contentDOM);
        let selectedItems = document.querySelectorAll<HTMLLIElement>('.heading-navigator-item.is-selected');
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0]).toBe(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item')[1]);

        view.dispatch({ selection: EditorSelection.cursor(0) });
        selectedItems = document.querySelectorAll<HTMLLIElement>('.heading-navigator-item.is-selected');
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0]).toBe(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item')[0]);

        pinButton.click();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
        expect(document.activeElement).toBe(view.contentDOM);
    });
});
