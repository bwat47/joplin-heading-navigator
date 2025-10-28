import joplin from 'api';
import { SettingItemType } from 'api/types';
import logger from './logger';
import type { PanelDimensions } from './types';
import {
    DEFAULT_PANEL_HEIGHT_PERCENTAGE,
    DEFAULT_PANEL_WIDTH,
    MAX_PANEL_HEIGHT_PERCENTAGE,
    MAX_PANEL_WIDTH,
    MIN_PANEL_HEIGHT_PERCENTAGE,
    MIN_PANEL_WIDTH,
    normalizePanelHeightPercentage,
    normalizePanelWidth,
} from './panelDimensions';

const SECTION_ID = 'headingNavigator';
const SETTING_PANEL_WIDTH = 'headingNavigator.panelWidth';
const SETTING_PANEL_MAX_HEIGHT = 'headingNavigator.panelMaxHeightPercentage';

export async function registerPanelSettings(): Promise<void> {
    await joplin.settings.registerSection(SECTION_ID, {
        label: 'Heading Navigator',
        iconName: 'fas fa-heading',
        description: 'Heading Navigator options',
    });

    await joplin.settings.registerSettings({
        [SETTING_PANEL_WIDTH]: {
            value: DEFAULT_PANEL_WIDTH,
            type: SettingItemType.Int,
            public: true,
            section: SECTION_ID,
            label: 'Panel width (px)',
            description: 'Set the width of the heading navigator panel (min: 240px, max: 640px).',
            minimum: MIN_PANEL_WIDTH,
            maximum: MAX_PANEL_WIDTH,
            step: 10,
        },
        [SETTING_PANEL_MAX_HEIGHT]: {
            value: DEFAULT_PANEL_HEIGHT_PERCENTAGE,
            type: SettingItemType.Int,
            public: true,
            section: SECTION_ID,
            label: 'Panel max height (% of editor)',
            description: 'Set the maximum height for the panel relative to the editor viewport (min: 40%, max: 90%).',
            minimum: MIN_PANEL_HEIGHT_PERCENTAGE,
            maximum: MAX_PANEL_HEIGHT_PERCENTAGE,
            step: 5,
        },
    });
}

export async function loadPanelDimensions(): Promise<PanelDimensions> {
    const values = await joplin.settings.values([SETTING_PANEL_WIDTH, SETTING_PANEL_MAX_HEIGHT]);

    const widthResult = normalizePanelWidth(values[SETTING_PANEL_WIDTH]);
    if (widthResult.changed) {
        logger.warn(`Invalid panel width setting detected. Using ${widthResult.value}px.`);
    }

    const heightResult = normalizePanelHeightPercentage(values[SETTING_PANEL_MAX_HEIGHT]);
    if (heightResult.changed) {
        logger.warn(`Invalid panel height setting detected. Using ${heightResult.value}%.`);
    }

    return {
        width: widthResult.value,
        maxHeightRatio: heightResult.value / 100,
    };
}
