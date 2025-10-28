import type { EditorView } from '@codemirror/view';
import { createPanelTheme } from './panelTheme';

function createStubView(): EditorView {
    const container = document.createElement('div');
    container.className = 'cm-editor';
    document.body.appendChild(container);

    return {
        dom: container,
        scrollDOM: container,
    } as unknown as EditorView;
}

describe('createPanelTheme', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        const root = document.documentElement;
        root.removeAttribute('style');
    });

    it('derives a light theme palette from editor variables', () => {
        const root = document.documentElement;
        root.style.setProperty('--joplin-editor-background-color', '#ffffff');
        root.style.setProperty('--joplin-editor-foreground-color', '#222222');

        const view = createStubView();

        const theme = createPanelTheme(view);

        expect(theme).toMatchObject({
            background: '#f7f7f7',
            foreground: '#222222',
            border: '#dfdfdf',
            divider: '#dfdfdf',
            muted: '#6d6d6d',
            selectedBackground: '#dadada',
            selectedForeground: '#111111',
            scrollbar: '#a2a2a2',
            scrollbarHover: '#828282',
        });
    });

    it('derives a dark theme palette when editor background is dark', () => {
        const root = document.documentElement;
        root.style.setProperty('--joplin-editor-background-color', '#1e1e1e');
        root.style.setProperty('--joplin-editor-foreground-color', '#f5f5f5');

        const view = createStubView();

        const theme = createPanelTheme(view);

        expect(theme).toEqual({
            background: '#303030',
            foreground: '#f5f5f5',
            border: '#555555',
            divider: '#555555',
            muted: '#9c9c9c',
            selectedBackground: '#515151',
            selectedForeground: '#ffffff',
            scrollbar: '#7f7f7f',
            scrollbarHover: '#9c9c9c',
        });
    });
});
