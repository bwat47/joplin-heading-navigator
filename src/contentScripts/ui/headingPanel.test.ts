import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { HeadingItem } from '../../types';
import { HeadingPanel, type PanelCallbacks } from './headingPanel';

const headings: HeadingItem[] = [
    { id: 'heading-0', text: 'One', level: 1, from: 0, to: 5, line: 0, anchor: 'one' },
    { id: 'heading-6', text: 'Two', level: 2, from: 6, to: 12, line: 1, anchor: 'two' },
];

class ResizeObserverMock {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
}

function createCallbacks() {
    return {
        onPreview: vi.fn<PanelCallbacks['onPreview']>(),
        onSelect: vi.fn<PanelCallbacks['onSelect']>(),
        onClose: vi.fn<PanelCallbacks['onClose']>(),
        onCopy: vi.fn<PanelCallbacks['onCopy']>(),
        onPinChange: vi.fn<PanelCallbacks['onPinChange']>(),
        onRequestEditorFocus: vi.fn<PanelCallbacks['onRequestEditorFocus']>(),
    } satisfies PanelCallbacks;
}

describe('HeadingPanel pinned mode', () => {
    let view: EditorView;
    let panel: HeadingPanel;
    let callbacks: ReturnType<typeof createCallbacks>;

    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({ state: EditorState.create({ doc: '# One\n## Two' }), parent });
        callbacks = createCallbacks();
        panel = new HeadingPanel(view, callbacks, { width: 320, maxHeightRatio: 0.75 });
        panel.open(headings, headings[0].id);
    });

    afterEach(() => {
        panel.destroy();
        view.destroy();
        document.body.textContent = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('renders accessible desktop pin controls and toggles pinned state', () => {
        const pinButton = document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button');
        const closeButton = document.querySelector<HTMLButtonElement>('.heading-navigator-close-button');

        expect(pinButton?.getAttribute('aria-label')).toBe('Pin headings panel');
        expect(pinButton?.getAttribute('aria-pressed')).toBe('false');
        expect(closeButton?.hidden).toBe(true);

        pinButton?.click();

        expect(panel.isPinned()).toBe(true);
        expect(pinButton?.getAttribute('aria-label')).toBe('Unpin headings panel');
        expect(pinButton?.getAttribute('aria-pressed')).toBe('true');
        expect(closeButton?.hidden).toBe(false);
        expect(callbacks.onPinChange).toHaveBeenCalledWith(true);
        expect(document.activeElement).toBe(document.querySelector('.heading-navigator-input'));
    });

    it('stays open and clears filtering on outside clicks while pinned', () => {
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input');
        expect(input).not.toBeNull();
        input!.value = 'two';
        input!.dispatchEvent(new Event('input', { bubbles: true }));

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(input!.value).toBe('');
        expect(callbacks.onClose).not.toHaveBeenCalled();

        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(callbacks.onClose).toHaveBeenCalledWith('blur');
    });

    it('returns focus to the editor on Escape and selects without closing when pinned', () => {
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        const input = document.querySelector<HTMLInputElement>('.heading-navigator-input')!;
        input.value = 'two';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(input.value).toBe('');
        expect(callbacks.onRequestEditorFocus).toHaveBeenCalledOnce();
        expect(callbacks.onClose).not.toHaveBeenCalled();

        document.querySelectorAll<HTMLLIElement>('.heading-navigator-item')[1].click();
        expect(callbacks.onSelect).toHaveBeenCalledWith(headings[1]);
        expect(panel.isOpen()).toBe(true);
        const selectedItems = document.querySelectorAll<HTMLLIElement>('.heading-navigator-item.is-selected');
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0]).toBe(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item')[1]);
    });

    it('closes explicitly and updates the active marker without replacing list nodes', () => {
        document.querySelector<HTMLButtonElement>('.heading-navigator-pin-button')?.click();
        const itemsBefore = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));

        panel.setActiveHeading(headings[1].id);

        const itemsAfter = Array.from(document.querySelectorAll<HTMLLIElement>('.heading-navigator-item'));
        expect(itemsAfter).toEqual(itemsBefore);
        expect(itemsAfter[0].classList.contains('is-selected')).toBe(false);
        expect(itemsAfter[1].classList.contains('is-selected')).toBe(true);

        document.querySelector<HTMLButtonElement>('.heading-navigator-close-button')?.click();
        expect(callbacks.onClose).toHaveBeenCalledWith('explicit');
    });

    it('does not render pin controls on mobile', () => {
        panel.destroy();
        panel = new HeadingPanel(view, callbacks, { width: 320, maxHeightRatio: 0.75 }, true);
        panel.open(headings, headings[0].id);

        expect(document.querySelector('.heading-navigator-pin-button')).toBeNull();
        expect(document.querySelector('.heading-navigator-close-button')).toBeNull();
        panel.setPinned(true);
        expect(panel.isPinned()).toBe(false);
    });
});
