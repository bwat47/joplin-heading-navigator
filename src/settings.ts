/**
 * Joplin settings registration and loading for heading panel configuration.
 *
 * Integrates panel configuration into Joplin's preferences UI.
 *
 * See:
 * - panelDimensions.ts - Validation and normalization utilities
 * - index.ts - Calls registerPanelSettings() on plugin startup and forwards loaded values
 */

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
const SETTING_COMPACT_MODE = 'headingNavigator.compactMode';
const SETTING_COPY_INTERNAL_ANCHOR_LINKS = 'headingNavigator.copyInternalAnchorLinks';
const SETTING_PANEL_PINNED = 'headingNavigator.panelPinned';

export interface PanelSettings {
    dimensions: PanelDimensions;
    compactMode: boolean;
}

export interface CopyLinkSettings {
    copyInternalAnchorLinks: boolean;
}

function normalizeBooleanSetting(value: unknown, defaultValue: boolean): { value: boolean; changed: boolean } {
    if (typeof value === 'boolean') {
        return { value, changed: false };
    }

    return { value: defaultValue, changed: true };
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
            description: '[Desktop Only] Set the width of the heading navigator panel (min: 240px, max: 640px).',
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
            description:
                '[Desktop Only] Set the maximum height for the panel relative to the editor viewport (min: 40%, max: 90%).',
            minimum: MIN_PANEL_HEIGHT_PERCENTAGE,
            maximum: MAX_PANEL_HEIGHT_PERCENTAGE,
            step: 5,
        },
        [SETTING_COMPACT_MODE]: {
            value: false,
            type: SettingItemType.Bool,
            public: true,
            section: SECTION_ID,
            label: 'Compact mode',
            description: '[Desktop Only] Hide heading metadata row and reduce list item height.',
        },
        [SETTING_COPY_INTERNAL_ANCHOR_LINKS]: {
            value: false,
            type: SettingItemType.Bool,
            public: true,
            section: SECTION_ID,
            label: 'Copy internal anchor links',
            description: 'Copy [Heading](#heading-anchor) instead of [Heading @ Note](:/noteId#heading-anchor).',
        },
        // UI state, not a user preference: tracks whether the panel was pinned so it
        // can be restored after an editor reload. Hidden from the options screen.
        [SETTING_PANEL_PINNED]: {
            value: false,
            type: SettingItemType.Bool,
            public: false,
            section: SECTION_ID,
            label: 'Panel pinned',
        },
    });
}

export async function loadPanelSettings(): Promise<PanelSettings> {
    const values = await joplin.settings.values([SETTING_PANEL_WIDTH, SETTING_PANEL_MAX_HEIGHT, SETTING_COMPACT_MODE]);

    const widthResult = normalizePanelWidth(values[SETTING_PANEL_WIDTH]);
    if (widthResult.changed) {
        logger.warn(`Invalid panel width setting: ${values[SETTING_PANEL_WIDTH]}. Using ${widthResult.value}px.`);
    }

    const heightResult = normalizePanelHeightPercentage(values[SETTING_PANEL_MAX_HEIGHT]);
    if (heightResult.changed) {
        logger.warn(`Invalid panel height setting: ${values[SETTING_PANEL_MAX_HEIGHT]}. Using ${heightResult.value}%.`);
    }

    const compactModeResult = normalizeBooleanSetting(values[SETTING_COMPACT_MODE], false);
    if (compactModeResult.changed) {
        logger.warn(`Invalid compact mode setting: ${values[SETTING_COMPACT_MODE]}. Using ${compactModeResult.value}.`);
    }

    return {
        dimensions: {
            width: widthResult.value,
            maxHeightRatio: heightResult.value / 100,
        },
        compactMode: compactModeResult.value,
    };
}

export async function loadPinnedState(): Promise<boolean> {
    const values = await joplin.settings.values([SETTING_PANEL_PINNED]);
    const pinnedResult = normalizeBooleanSetting(values[SETTING_PANEL_PINNED], false);

    if (pinnedResult.changed) {
        logger.warn(`Invalid panel pinned setting: ${values[SETTING_PANEL_PINNED]}. Using ${pinnedResult.value}.`);
    }

    return pinnedResult.value;
}

export async function savePinnedState(pinned: boolean): Promise<void> {
    await joplin.settings.setValue(SETTING_PANEL_PINNED, pinned);
}

export async function loadCopyLinkSettings(): Promise<CopyLinkSettings> {
    const value = await joplin.settings.value(SETTING_COPY_INTERNAL_ANCHOR_LINKS);
    const copyInternalAnchorLinksResult = normalizeBooleanSetting(value, false);

    if (copyInternalAnchorLinksResult.changed) {
        logger.warn(
            `Invalid copy internal anchor links setting: ${value}. Using ${copyInternalAnchorLinksResult.value}.`
        );
    }

    return {
        copyInternalAnchorLinks: copyInternalAnchorLinksResult.value,
    };
}
