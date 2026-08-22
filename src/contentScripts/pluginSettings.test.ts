import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HEADING_METADATA_DISPLAY } from '../headingMetadataDisplay';
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
        expect(normalizeContentScriptSettings({ dimensions: null, metadataDisplay: 'tiny' })).toEqual(
            DEFAULT_CONTENT_SCRIPT_SETTINGS
        );
    });

    it('normalizes dimensions and accepts only known metadata display modes', () => {
        expect(
            normalizeContentScriptSettings({
                dimensions: { width: 999, maxHeightRatio: 0.1 },
                metadataDisplay: HEADING_METADATA_DISPLAY.none,
                topOffset: 44,
            })
        ).toEqual({
            dimensions: {
                width: MAX_PANEL_WIDTH,
                maxHeightRatio: MIN_PANEL_HEIGHT_PERCENTAGE / 100,
            },
            metadataDisplay: HEADING_METADATA_DISPLAY.none,
            topOffset: 44,
        });

        expect(
            normalizeContentScriptSettings({ dimensions: DEFAULT_PANEL_DIMENSIONS, metadataDisplay: 1 }).metadataDisplay
        ).toBe(HEADING_METADATA_DISPLAY.full);
        expect(normalizeContentScriptSettings({ metadataDisplay: 'Compact' }).metadataDisplay).toBe(
            HEADING_METADATA_DISPLAY.full
        );
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
            metadataDisplay: HEADING_METADATA_DISPLAY.compact,
        });
        expect(getContentScriptSettings(view.state)).toEqual(applied);

        view.destroy();
    });
});
