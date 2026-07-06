/**
 * Panel dimension validation and normalization utilities.
 *
 * Enforces min/max constraints on panel dimensions to ensure usability:
 * - Width: 240-640px (too narrow = unusable, too wide = blocks editor)
 * - Height: 40-90% of viewport (too short = not enough headings visible, too tall = blocks content)
 *
 * User settings from plugin configuration are untrusted and must be validated
 * before being applied to the UI. Invalid values fall back to defaults (320px × 75%).
 */

import type { PanelDimensions } from './types';
import { DEFAULT_PANEL_DIMENSIONS } from './types';

export const MIN_PANEL_WIDTH = 240;
export const MAX_PANEL_WIDTH = 640;
export const MIN_PANEL_HEIGHT_PERCENTAGE = 40;
export const MAX_PANEL_HEIGHT_PERCENTAGE = 90;

export const DEFAULT_PANEL_WIDTH = DEFAULT_PANEL_DIMENSIONS.width;
export const DEFAULT_PANEL_HEIGHT_PERCENTAGE = Math.round(DEFAULT_PANEL_DIMENSIONS.maxHeightRatio * 100);

const MIN_PANEL_HEIGHT_RATIO = MIN_PANEL_HEIGHT_PERCENTAGE / 100;
const MAX_PANEL_HEIGHT_RATIO = MAX_PANEL_HEIGHT_PERCENTAGE / 100;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

export function normalizePanelWidth(raw: unknown): { value: number; changed: boolean } {
    const fallback = DEFAULT_PANEL_WIDTH;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return { value: fallback, changed: true };
    }
    const clamped = clamp(Math.round(raw), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
    return { value: clamped, changed: clamped !== raw };
}

export function normalizePanelHeightPercentage(raw: unknown): { value: number; changed: boolean } {
    const fallback = DEFAULT_PANEL_HEIGHT_PERCENTAGE;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return { value: fallback, changed: true };
    }
    const clamped = clamp(Math.round(raw), MIN_PANEL_HEIGHT_PERCENTAGE, MAX_PANEL_HEIGHT_PERCENTAGE);
    return { value: clamped, changed: clamped !== raw };
}

export function normalizePanelHeightRatio(raw: unknown): { value: number; changed: boolean } {
    const fallback = DEFAULT_PANEL_DIMENSIONS.maxHeightRatio;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return { value: fallback, changed: true };
    }
    const clamped = clamp(raw, MIN_PANEL_HEIGHT_RATIO, MAX_PANEL_HEIGHT_RATIO);
    return { value: clamped, changed: clamped !== raw };
}

/**
 * Normalizes and validates panel dimension settings.
 *
 * Clamps values to acceptable ranges, rounds width to integer, and replaces
 * invalid/missing values with defaults. Used when loading user settings and
 * receiving dimension updates from the plugin host.
 *
 * @param dimensions - Partial dimension configuration (may contain invalid or missing values)
 * @returns Validated and normalized panel dimensions with all required fields
 */
export function normalizePanelDimensions(dimensions?: Partial<PanelDimensions>): PanelDimensions {
    const widthResult = normalizePanelWidth(dimensions?.width);
    const heightResult = normalizePanelHeightRatio(dimensions?.maxHeightRatio);
    return {
        width: widthResult.value,
        maxHeightRatio: heightResult.value,
    };
}
