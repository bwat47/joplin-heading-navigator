import joplin from 'api';
import { SettingItemType } from 'api/types';
import logger from './logger';
import type { PanelDimensions } from './types';
import { DEFAULT_PANEL_DIMENSIONS } from './types';

const SECTION_ID = 'headingNavigator';
const SETTING_PANEL_WIDTH = 'headingNavigator.panelWidth';
const SETTING_PANEL_MAX_HEIGHT = 'headingNavigator.panelMaxHeightPercentage';

const DEFAULT_PANEL_WIDTH = DEFAULT_PANEL_DIMENSIONS.width;
const DEFAULT_PANEL_MAX_HEIGHT_PERCENTAGE = Math.round(DEFAULT_PANEL_DIMENSIONS.maxHeightRatio * 100);
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;
const MIN_PANEL_MAX_HEIGHT_PERCENTAGE = 40;
const MAX_PANEL_MAX_HEIGHT_PERCENTAGE = 90;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function normalizeWidth(raw: unknown): { value: number; changed: boolean } {
    const fallback = DEFAULT_PANEL_WIDTH;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return { value: fallback, changed: true };
    }
    const clamped = clamp(Math.round(raw), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
    return { value: clamped, changed: clamped !== raw };
}

function normalizeHeightPercentage(raw: unknown): { value: number; changed: boolean } {
    const fallback = DEFAULT_PANEL_MAX_HEIGHT_PERCENTAGE;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return { value: fallback, changed: true };
    }
    const clamped = clamp(Math.round(raw), MIN_PANEL_MAX_HEIGHT_PERCENTAGE, MAX_PANEL_MAX_HEIGHT_PERCENTAGE);
    return { value: clamped, changed: clamped !== raw };
}

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
            value: DEFAULT_PANEL_MAX_HEIGHT_PERCENTAGE,
            type: SettingItemType.Int,
            public: true,
            section: SECTION_ID,
            label: 'Panel max height (% of editor)',
            description: 'Set the maximum height for the panel relative to the editor viewport (min: 40%, max: 90%).',
            minimum: MIN_PANEL_MAX_HEIGHT_PERCENTAGE,
            maximum: MAX_PANEL_MAX_HEIGHT_PERCENTAGE,
            step: 5,
        },
    });
}

export async function loadPanelDimensions(): Promise<PanelDimensions> {
    const values = await joplin.settings.values([SETTING_PANEL_WIDTH, SETTING_PANEL_MAX_HEIGHT]);

    const widthResult = normalizeWidth(values[SETTING_PANEL_WIDTH]);
    if (widthResult.changed) {
        logger.warn(`Invalid panel width setting detected. Using ${widthResult.value}px.`);
    }

    const heightResult = normalizeHeightPercentage(values[SETTING_PANEL_MAX_HEIGHT]);
    if (heightResult.changed) {
        logger.warn(`Invalid panel height setting detected. Using ${heightResult.value}%.`);
    }

    return {
        width: widthResult.value,
        maxHeightRatio: heightResult.value / 100,
    };
}
