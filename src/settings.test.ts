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

import { loadContentScriptSettings, registerPanelSettings } from './settings';

describe('panel settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers the compact heading level badge preference as an opt-in hide setting', async () => {
        await registerPanelSettings();

        expect(joplinSettingsMocks.registerSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                'headingNavigator.hideCompactModeHeadingLevelBadges': {
                    value: false,
                    type: SettingItemType.Bool,
                    public: true,
                    section: 'headingNavigator',
                    label: 'Hide heading level badges in compact mode',
                    description: '[Desktop Only] Completely hide the H1-H6 badges shown in compact mode.',
                },
            })
        );
    });

    it('loads the compact heading level badge preference for the content script', async () => {
        joplinSettingsMocks.values.mockResolvedValue({
            'headingNavigator.panelWidth': 400,
            'headingNavigator.panelMaxHeightPercentage': 80,
            'headingNavigator.panelTopOffset': 24,
            'headingNavigator.compactMode': true,
            'headingNavigator.hideCompactModeHeadingLevelBadges': true,
        });

        await expect(loadContentScriptSettings()).resolves.toEqual({
            dimensions: { width: 400, maxHeightRatio: 0.8 },
            compactMode: true,
            hideCompactModeHeadingLevelBadges: true,
            topOffset: 24,
        });
    });
});
