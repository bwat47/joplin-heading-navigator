import { EditorSelection, EditorState, StateEffect, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { CodeMirrorControl, ContentScriptContext } from 'api/types';
import { EDITOR_COMMAND_TOGGLE_PANEL } from '../constants';
import type { ContentScriptSettings } from '../types';
import type { PanelRestoreState } from '../messages';
import * as headingExtractor from '../headingExtractor';
import logger from '../logger';
import { markdownEditorExtension } from '../testing/markdownState';
import headingNavigator from './headingNavigator';

// Auto-spy the extractor module so tests can count heading recomputations while
// keeping the real implementations.
vi.mock('../headingExtractor', { spy: true });

const computeHeadingStateSpy = vi.mocked(headingExtractor.computeHeadingState);

class ResizeObserverMock {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
}

describe('heading navigator panel lifecycle', () => {
    let view: EditorView;
    let togglePanel: (isMobile?: boolean) => void;
    let postMessage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        computeHeadingStateSpy.mockClear();
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({
            state: EditorState.create({ doc: '# One\n\n## Two', extensions: [markdownEditorExtension()] }),
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
        postMessage = vi.fn();
        const context = { postMessage } as unknown as ContentScriptContext;

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
        togglePanel(false);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);

        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n### Three' } });
        vi.advanceTimersByTime(149);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);

        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n#### Four' } });
        vi.advanceTimersByTime(149);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(2);
        expect(document.querySelectorAll('.heading-navigator-item')).toHaveLength(4);
    });

    it('cancels a pending reparse when an unpinned panel closes', () => {
        togglePanel(false);
        view.dispatch({ changes: { from: view.state.doc.length, insert: '\n### Three' } });

        togglePanel(false);
        vi.advanceTimersByTime(150);

        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('updates cursor-follow selection without reparsing or replacing list items', () => {
        togglePanel(false);
        const itemsBefore = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));

        view.dispatch({ selection: EditorSelection.cursor(8) });

        const itemsAfter = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);
        expect(itemsAfter).toEqual(itemsBefore);
        expect(itemsAfter[1].classList.contains('is-selected')).toBe(true);
    });

    it('focuses the filter instead of closing when the command is invoked while pinned', () => {
        togglePanel(false);
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        view.focus();

        togglePanel(false);

        expect(document.querySelector('.heading-navigator-panel')).not.toBeNull();
        expect(document.activeElement).toBe(document.querySelector('.heading-navigator-input'));
    });

    it('restores the opening selection on unpinned Escape', () => {
        togglePanel(false);
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        vi.advanceTimersByTime(30);
        expect(view.state.selection.main.head).toBe(7);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(view.state.selection.main.head).toBe(0);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('drops restoration semantics after pinning and leaves the panel open on Escape', () => {
        togglePanel(false);
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
        togglePanel(false);
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

    it('persists pinned state when the user toggles the pin button', () => {
        togglePanel(false);
        const pinButton = document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')!;

        pinButton.click();
        expect(postMessage).toHaveBeenCalledWith({ type: 'persistPinnedState', pinned: true });

        pinButton.click();
        expect(postMessage).toHaveBeenCalledWith({ type: 'persistPinnedState', pinned: false });
    });

    it('keeps pinned selections mounted and closes after unpinning and clicking outside', () => {
        togglePanel(false);
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

describe('pinned panel restoration', () => {
    let view: EditorView;

    const flushRestore = () => new Promise((resolve) => setTimeout(resolve, 0));

    function createEditor(
        restoreState: PanelRestoreState | undefined,
        restoreRespondAfter?: Promise<void>,
        settingsResponse?: ContentScriptSettings | Error,
        settingsRespondAfter?: Promise<void>
    ): ReturnType<typeof vi.fn> {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({
            state: EditorState.create({ doc: '# One\n\n## Two', extensions: [markdownEditorExtension()] }),
            parent,
        });

        const editorControl = {
            editor: view,
            addExtension: (extension: Extension) => {
                view.dispatch({ effects: StateEffect.appendConfig.of(extension) });
            },
            registerCommand: () => {},
        } as unknown as CodeMirrorControl;
        const postMessage = vi.fn(async (message: { type: string }) => {
            if (message.type === 'getContentScriptSettings') {
                if (settingsRespondAfter) {
                    await settingsRespondAfter;
                }
                if (settingsResponse instanceof Error) {
                    throw settingsResponse;
                }
                return settingsResponse;
            }
            if (restoreRespondAfter) {
                await restoreRespondAfter;
            }
            return message.type === 'getPanelRestoreState' ? restoreState : undefined;
        });

        headingNavigator({ postMessage } as unknown as ContentScriptContext).plugin(editorControl);
        return postMessage;
    }

    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
    });

    afterEach(() => {
        view.destroy();
        document.body.textContent = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('reopens the panel pinned without stealing focus when the host reports a pinned state', async () => {
        const postMessage = createEditor(
            {
                pinned: true,
                isMobile: false,
            },
            undefined,
            {
                dimensions: { width: 480, maxHeightRatio: 0.6 },
                compactMode: true,
            }
        );

        await flushRestore();

        const panelElement = document.querySelector('.heading-navigator-panel');
        expect(panelElement).not.toBeNull();
        expect(panelElement!.classList.contains('is-pinned')).toBe(true);
        expect(panelElement!.classList.contains('is-compact')).toBe(true);
        expect(document.getElementById('heading-navigator-styles')?.textContent).toContain('width: 480px;');
        expect(document.activeElement).not.toBe(document.querySelector('.heading-navigator-input'));
        expect(postMessage).not.toHaveBeenCalledWith({ type: 'persistPinnedState', pinned: true });
    });

    it('does not reopen the panel when the persisted state is unpinned', async () => {
        createEditor({
            pinned: false,
            isMobile: false,
        });

        await flushRestore();

        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('does not reopen the panel on mobile', async () => {
        createEditor({
            pinned: true,
            isMobile: true,
        });

        await flushRestore();

        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('does nothing when the host provides no restore state', async () => {
        createEditor(undefined);

        await flushRestore();

        expect(document.querySelector('.heading-navigator-panel')).toBeNull();
    });

    it('updates a restored panel when settings synchronization finishes later', async () => {
        let respondWithSettings!: () => void;
        const settingsGate = new Promise<void>((resolve) => {
            respondWithSettings = resolve;
        });
        createEditor(
            { pinned: true, isMobile: false },
            undefined,
            { dimensions: { width: 500, maxHeightRatio: 0.65 }, compactMode: true },
            settingsGate
        );

        await flushRestore();
        const panelElement = document.querySelector('.heading-navigator-panel')!;
        expect(panelElement.classList.contains('is-pinned')).toBe(true);
        expect(panelElement.classList.contains('is-compact')).toBe(false);

        respondWithSettings();
        await flushRestore();

        expect(document.querySelector('.heading-navigator-panel')).toBe(panelElement);
        expect(panelElement.classList.contains('is-pinned')).toBe(true);
        expect(panelElement.classList.contains('is-compact')).toBe(true);
        expect(document.getElementById('heading-navigator-styles')?.textContent).toContain('width: 500px;');
    });

    it('uses defaults when initial settings synchronization fails', async () => {
        createEditor({ pinned: true, isMobile: false }, undefined, new Error('settings unavailable'));

        await flushRestore();

        const panelElement = document.querySelector('.heading-navigator-panel')!;
        expect(panelElement.classList.contains('is-pinned')).toBe(true);
        expect(panelElement.classList.contains('is-compact')).toBe(false);
        expect(document.getElementById('heading-navigator-styles')?.textContent).toContain('width: 320px;');
    });

    it('does not reopen the panel when the editor is destroyed before restore completes', async () => {
        let respond!: () => void;
        const gate = new Promise<void>((resolve) => {
            respond = resolve;
        });
        createEditor(
            {
                pinned: true,
                isMobile: false,
            },
            gate
        );

        view.destroy();
        // Any mousedown listener registered from here on would come from a zombie
        // panel constructed against the destroyed view.
        const addListenerSpy = vi.spyOn(document, 'addEventListener');
        respond();
        await flushRestore();

        expect(view.dom.querySelector('.heading-navigator-panel')).toBeNull();
        expect(addListenerSpy).not.toHaveBeenCalledWith('mousedown', expect.any(Function), true);
    });
});

describe('heading fill-in on large documents', () => {
    // These tests exercise real parse budgets, so they run with real timers: fake
    // timers freeze the clock CodeMirror's parse budget measures against, making
    // every parse appear to finish instantly and the partial path unreachable.
    // The fixture (~1.2 MB) only needs to exceed the tree coverage at panel open;
    // the zero-budget opening computation below is what guarantees the partial
    // path, independent of fixture size.
    const SECTION_COUNT = 6000;
    const monsterDoc = Array.from(
        { length: SECTION_COUNT },
        (_, index) => `## Section ${index}\n\n${'Body text for padding the document. '.repeat(5)}\n`
    ).join('\n');

    let view: EditorView;
    let togglePanel: (isMobile?: boolean) => void;

    beforeEach(async () => {
        computeHeadingStateSpy.mockClear();
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({
            state: EditorState.create({ doc: monsterDoc, extensions: [markdownEditorExtension()] }),
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
        headingNavigator({ postMessage: vi.fn() } as unknown as ContentScriptContext).plugin(editorControl);

        // Force the opening computation to a zero parse budget so the partial path
        // is taken deterministically regardless of machine speed.
        const actual = await vi.importActual<typeof import('../headingExtractor')>('../headingExtractor');
        computeHeadingStateSpy.mockImplementationOnce((state) => actual.computeHeadingState(state, 0));
    });

    afterEach(() => {
        view.destroy();
        document.body.textContent = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('opens with a partial list and fills in when background parsing extends the tree', async () => {
        togglePanel(false);

        const initialCount = document.querySelectorAll('.heading-navigator-item').length;
        expect(initialCount).toBeGreaterThan(0);
        expect(initialCount).toBeLessThan(SECTION_COUNT);

        // CodeMirror's background parsing extends the tree and publishes it in a
        // transaction; the update listener's tree-growth check then recomputes the
        // list with the real parse budget, which completes the remainder in one shot.
        await vi.waitFor(
            () => {
                expect(document.querySelectorAll('.heading-navigator-item')).toHaveLength(SECTION_COUNT);
            },
            { timeout: 30_000, interval: 100 }
        );
    }, 40_000);

    it('stops recomputing headings when the panel closes while incomplete', async () => {
        togglePanel(false);
        expect(document.querySelectorAll('.heading-navigator-item').length).toBeLessThan(SECTION_COUNT);

        togglePanel(false);
        expect(document.querySelector('.heading-navigator-panel')).toBeNull();

        const callsAfterClose = computeHeadingStateSpy.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(computeHeadingStateSpy.mock.calls.length).toBe(callsAfterClose);
    }, 20_000);
});

describe('opening without a markdown parser', () => {
    let view: EditorView;
    let togglePanel: (isMobile?: boolean) => void;

    beforeEach(() => {
        computeHeadingStateSpy.mockClear();
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        // No markdown language extension: the syntax tree stays empty and can never grow.
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
        headingNavigator({ postMessage: vi.fn() } as unknown as ContentScriptContext).plugin(editorControl);
    });

    afterEach(() => {
        view.destroy();
        document.body.textContent = '';
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('warns, renders an empty list, and schedules no further work', () => {
        const warnSpy = vi.spyOn(logger, 'warn');

        togglePanel(false);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('.heading-navigator-item')).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax tree is empty'));

        // The tree can never grow without a parser, so nothing may keep retrying.
        vi.advanceTimersByTime(5000);
        expect(computeHeadingStateSpy).toHaveBeenCalledTimes(1);
    });
});
