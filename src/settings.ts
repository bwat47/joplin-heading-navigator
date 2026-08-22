/**
 * Joplin settings registration and loading for heading panel configuration.
 *
 * Integrates panel configuration into Joplin's preferences UI.
 *
 * See:
 * - panelDimensions.ts - Validation and normalization utilities
 * - index.ts - Registers settings and serves editor-facing values on request
 */

import joplin from 'api';
import { SettingItemType } from 'api/types';
import logger from './logger';
import {
    DEFAULT_HEADING_METADATA_DISPLAY,
    HEADING_METADATA_DISPLAY,
    normalizeHeadingMetadataDisplay,
} from './headingMetadataDisplay';
import type { ContentScriptSettings } from './types';
import {
    DEFAULT_PANEL_HEIGHT_PERCENTAGE,
    DEFAULT_PANEL_TOP_OFFSET,
    DEFAULT_PANEL_WIDTH,
    MAX_PANEL_HEIGHT_PERCENTAGE,
    MAX_PANEL_TOP_OFFSET,
    MAX_PANEL_WIDTH,
    MIN_PANEL_HEIGHT_PERCENTAGE,
    MIN_PANEL_TOP_OFFSET,
    MIN_PANEL_WIDTH,
    normalizePanelHeightPercentage,
    normalizePanelTopOffset,
    normalizePanelWidth,
} from './panelDimensions';

const SECTION_ID = 'headingNavigator';
const SETTING_PANEL_WIDTH = 'headingNavigator.panelWidth';
const SETTING_PANEL_MAX_HEIGHT = 'headingNavigator.panelMaxHeightPercentage';
const SETTING_PANEL_TOP_OFFSET = 'headingNavigator.panelTopOffset';
const SETTING_HEADING_METADATA_DISPLAY = 'headingNavigator.headingMetadataDisplay';
const LEGACY_SETTING_COMPACT_MODE = 'headingNavigator.compactMode';
const SETTING_COPY_INTERNAL_ANCHOR_LINKS = 'headingNavigator.copyInternalAnchorLinks';
const SETTING_PANEL_PINNED = 'headingNavigator.panelPinned';

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
        [SETTING_PANEL_TOP_OFFSET]: {
            value: DEFAULT_PANEL_TOP_OFFSET,
            type: SettingItemType.Int,
            public: true,
            section: SECTION_ID,
            label: 'Panel top offset (px)',
            description:
                '[Desktop Only] Push the panel down from the top of the editor to avoid overlapping other top-right editor decorations, such as a backlinks indicator (min: 0px, max: 200px).',
            minimum: MIN_PANEL_TOP_OFFSET,
            maximum: MAX_PANEL_TOP_OFFSET,
            step: 4,
        },
        [SETTING_HEADING_METADATA_DISPLAY]: {
            value: DEFAULT_HEADING_METADATA_DISPLAY,
            type: SettingItemType.String,
            public: true,
            section: SECTION_ID,
            isEnum: true,
            options: {
                [HEADING_METADATA_DISPLAY.full]: 'Full (heading level and line number)',
                [HEADING_METADATA_DISPLAY.compact]: 'Compact (heading level badge)',
                [HEADING_METADATA_DISPLAY.none]: 'None',
            },
            label: 'Heading metadata display',
            description:
                'What each heading row shows alongside its text. Compact and None also reduce row height on desktop; mobile keeps its larger touch targets.',
        },
        // Deprecated: replaced by headingMetadataDisplay. Kept hidden so an existing
        // compact mode choice can be migrated once, then reset.
        [LEGACY_SETTING_COMPACT_MODE]: {
            value: false,
            type: SettingItemType.Bool,
            public: false,
            section: SECTION_ID,
            label: 'Compact mode (deprecated)',
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

    await migrateLegacyCompactMode();
}

/**
 * One-time migration: compactMode=true becomes headingMetadataDisplay='compact'.
 *
 * The legacy key stays registered (hidden) because `joplin.settings.value` throws on
 * unregistered keys. Resetting it to its default afterwards makes this run at most once.
 */
async function migrateLegacyCompactMode(): Promise<void> {
    if (await joplin.settings.value(LEGACY_SETTING_COMPACT_MODE)) {
        await joplin.settings.setValue(SETTING_HEADING_METADATA_DISPLAY, HEADING_METADATA_DISPLAY.compact);
        await joplin.settings.setValue(LEGACY_SETTING_COMPACT_MODE, false);
    }
}

export async function loadContentScriptSettings(): Promise<ContentScriptSettings> {
    const values = await joplin.settings.values([
        SETTING_PANEL_WIDTH,
        SETTING_PANEL_MAX_HEIGHT,
        SETTING_PANEL_TOP_OFFSET,
        SETTING_HEADING_METADATA_DISPLAY,
    ]);

    const widthResult = normalizePanelWidth(values[SETTING_PANEL_WIDTH]);
    if (widthResult.changed) {
        logger.warn(`Invalid panel width setting: ${values[SETTING_PANEL_WIDTH]}. Using ${widthResult.value}px.`);
    }

    const heightResult = normalizePanelHeightPercentage(values[SETTING_PANEL_MAX_HEIGHT]);
    if (heightResult.changed) {
        logger.warn(`Invalid panel height setting: ${values[SETTING_PANEL_MAX_HEIGHT]}. Using ${heightResult.value}%.`);
    }

    const topOffsetResult = normalizePanelTopOffset(values[SETTING_PANEL_TOP_OFFSET]);
    if (topOffsetResult.changed) {
        logger.warn(
            `Invalid panel top offset setting: ${values[SETTING_PANEL_TOP_OFFSET]}. Using ${topOffsetResult.value}px.`
        );
    }

    const metadataDisplayResult = normalizeHeadingMetadataDisplay(values[SETTING_HEADING_METADATA_DISPLAY]);
    if (metadataDisplayResult.changed) {
        logger.warn(
            `Invalid heading metadata display setting: ${values[SETTING_HEADING_METADATA_DISPLAY]}. Using ${metadataDisplayResult.value}.`
        );
    }

    return {
        dimensions: {
            width: widthResult.value,
            maxHeightRatio: heightResult.value / 100,
        },
        metadataDisplay: metadataDisplayResult.value,
        topOffset: topOffsetResult.value,
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
