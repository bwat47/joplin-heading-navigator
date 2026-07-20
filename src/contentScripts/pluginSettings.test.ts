import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_PANEL_TOP_OFFSET, MAX_PANEL_WIDTH, MIN_PANEL_HEIGHT_PERCENTAGE } from '../panelDimensions';
import { DEFAULT_PANEL_DIMENSIONS } from '../types';
import {
    applyContentScriptSettings,
    createSettingsExtension,
    DEFAULT_CONTENT_SCRIPT_SETTINGS,
    getContentScriptSettings,
    normalizeContentScriptSettings,
} from './pluginSettings';

describe('content script settings', () => {
    it('falls back to defaults for malformed settings', () => {
        expect(normalizeContentScriptSettings(null)).toEqual(DEFAULT_CONTENT_SCRIPT_SETTINGS);
        expect(normalizeContentScriptSettings('bad')).toEqual(DEFAULT_CONTENT_SCRIPT_SETTINGS);
        expect(normalizeContentScriptSettings({ dimensions: null, compactMode: 'true' })).toEqual(
            DEFAULT_CONTENT_SCRIPT_SETTINGS
        );
    });

    it('normalizes dimensions and accepts only boolean compact mode', () => {
        expect(
            normalizeContentScriptSettings({
                dimensions: { width: 999, maxHeightRatio: 0.1 },
                compactMode: true,
                topOffset: 44,
            })
        ).toEqual({
            dimensions: {
                width: MAX_PANEL_WIDTH,
                maxHeightRatio: MIN_PANEL_HEIGHT_PERCENTAGE / 100,
            },
            compactMode: true,
            topOffset: 44,
        });

        expect(
            normalizeContentScriptSettings({ dimensions: DEFAULT_PANEL_DIMENSIONS, compactMode: 1 }).compactMode
        ).toBe(false);
    });

    it('normalizes the top offset and falls back to default when invalid', () => {
        expect(normalizeContentScriptSettings({ topOffset: 40 }).topOffset).toBe(40);
        expect(normalizeContentScriptSettings({ topOffset: 5000 }).topOffset).toBe(200);
        expect(normalizeContentScriptSettings({ topOffset: 'nope' }).topOffset).toBe(DEFAULT_PANEL_TOP_OFFSET);
        expect(normalizeContentScriptSettings({ dimensions: DEFAULT_PANEL_DIMENSIONS }).topOffset).toBe(
            DEFAULT_PANEL_TOP_OFFSET
        );
    });

    it('provides defaults and reconfigures the facet', () => {
        const view = new EditorView({
            state: EditorState.create({ extensions: createSettingsExtension() }),
        });

        expect(getContentScriptSettings(view.state)).toEqual(DEFAULT_CONTENT_SCRIPT_SETTINGS);

        const applied = applyContentScriptSettings(view, {
            dimensions: { width: 480, maxHeightRatio: 0.6 },
            compactMode: true,
        });
        expect(getContentScriptSettings(view.state)).toEqual(applied);

        view.destroy();
    });
});
