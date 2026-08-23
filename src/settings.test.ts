import { SettingItemType } from 'api/types';

const joplinSettingsMocks = vi.hoisted(() => ({
    registerSection: vi.fn(),
    registerSettings: vi.fn(),
    values: vi.fn(),
    value: vi.fn(),
    setValue: vi.fn(),
}));

vi.mock('api', () => ({
    default: {
        settings: joplinSettingsMocks,
    },
}));

import { HEADING_METADATA_DISPLAY } from './headingMetadataDisplay';
import { loadContentScriptSettings, registerPanelSettings } from './settings';

const METADATA_DISPLAY_KEY = 'headingNavigator.headingMetadataDisplay';
const PREVIEW_HEADINGS_KEY = 'headingNavigator.previewHeadings';
const LEGACY_COMPACT_MODE_KEY = 'headingNavigator.compactMode';

function registeredSettings(): Record<string, Record<string, unknown>> {
    return joplinSettingsMocks.registerSettings.mock.calls[0][0];
}

describe('panel settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        joplinSettingsMocks.value.mockResolvedValue(false);
    });

    it('registers heading metadata display as a three-way enum defaulting to full', async () => {
        await registerPanelSettings();

        const setting = registeredSettings()[METADATA_DISPLAY_KEY];
        expect(setting).toMatchObject({
            value: HEADING_METADATA_DISPLAY.full,
            type: SettingItemType.String,
            public: true,
            section: 'headingNavigator',
            isEnum: true,
        });
        expect(Object.keys(setting.options as Record<string, string>)).toEqual([
            HEADING_METADATA_DISPLAY.full,
            HEADING_METADATA_DISPLAY.compact,
            HEADING_METADATA_DISPLAY.none,
        ]);
    });

    it('keeps the legacy compact mode key registered but hidden so it stays readable', async () => {
        await registerPanelSettings();

        expect(registeredSettings()[LEGACY_COMPACT_MODE_KEY]).toMatchObject({
            value: false,
            type: SettingItemType.Bool,
            public: false,
        });
    });

    it('registers heading previews as an enabled desktop preference', async () => {
        await registerPanelSettings();

        expect(registeredSettings()[PREVIEW_HEADINGS_KEY]).toMatchObject({
            value: true,
            type: SettingItemType.Bool,
            public: true,
            section: 'headingNavigator',
            label: 'Preview headings while navigating',
        });
    });

    it('migrates an existing compact mode opt-in and resets the legacy key', async () => {
        joplinSettingsMocks.value.mockResolvedValue(true);

        await registerPanelSettings();

        expect(joplinSettingsMocks.value).toHaveBeenCalledWith(LEGACY_COMPACT_MODE_KEY);
        expect(joplinSettingsMocks.setValue).toHaveBeenCalledWith(
            METADATA_DISPLAY_KEY,
            HEADING_METADATA_DISPLAY.compact
        );
        expect(joplinSettingsMocks.setValue).toHaveBeenCalledWith(LEGACY_COMPACT_MODE_KEY, false);
    });

    it('leaves settings untouched when compact mode was never enabled', async () => {
        await registerPanelSettings();

        expect(joplinSettingsMocks.setValue).not.toHaveBeenCalled();
    });

    it('loads the heading metadata display preference for the content script', async () => {
        joplinSettingsMocks.values.mockResolvedValue({
            'headingNavigator.panelWidth': 400,
            'headingNavigator.panelMaxHeightPercentage': 80,
            'headingNavigator.panelTopOffset': 24,
            [METADATA_DISPLAY_KEY]: HEADING_METADATA_DISPLAY.none,
            [PREVIEW_HEADINGS_KEY]: false,
        });

        await expect(loadContentScriptSettings()).resolves.toEqual({
            dimensions: { width: 400, maxHeightRatio: 0.8 },
            metadataDisplay: HEADING_METADATA_DISPLAY.none,
            previewHeadings: false,
            topOffset: 24,
        });
    });

    it('falls back to full when the stored metadata display value is unusable', async () => {
        joplinSettingsMocks.values.mockResolvedValue({
            'headingNavigator.panelWidth': 400,
            'headingNavigator.panelMaxHeightPercentage': 80,
            'headingNavigator.panelTopOffset': 24,
            [METADATA_DISPLAY_KEY]: 'compact-ish',
            [PREVIEW_HEADINGS_KEY]: 'yes',
        });

        await expect(loadContentScriptSettings()).resolves.toMatchObject({
            metadataDisplay: HEADING_METADATA_DISPLAY.full,
            previewHeadings: true,
        });
    });
});
