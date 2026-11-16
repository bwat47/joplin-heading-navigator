/**
 * Heading metadata display validation and normalization.
 *
 * Controls what each heading row shows alongside its text. Stored values predate the
 * user-facing labels and are kept stable so saved settings keep working:
 * - `full` ("Level and line number"): the `H# - line #` metadata row (two-line rows)
 * - `compact` ("Level badge"): an `H#` badge at the right edge of the row
 * - `atx` ("Markdown prefix"): a Markdown heading prefix (`#` through `######`) before the text
 * - `none` ("None"): no level indicator at all
 *
 * Every mode except `full` uses single-line rows. The metadata choice applies on both
 * desktop and mobile; the shorter row height is desktop-only, so mobile keeps its larger
 * touch targets.
 *
 * Replaces the legacy `compactMode` boolean, which is migrated once in settings.ts.
 * User settings are untrusted and must be normalized before reaching the UI.
 */

export const HEADING_METADATA_DISPLAY = {
    full: 'full',
    compact: 'compact',
    atx: 'atx',
    none: 'none',
} as const;

export type HeadingMetadataDisplay = (typeof HEADING_METADATA_DISPLAY)[keyof typeof HEADING_METADATA_DISPLAY];

export const DEFAULT_HEADING_METADATA_DISPLAY: HeadingMetadataDisplay = HEADING_METADATA_DISPLAY.full;

const HEADING_METADATA_DISPLAY_VALUES: readonly string[] = Object.values(HEADING_METADATA_DISPLAY);

function isHeadingMetadataDisplay(raw: unknown): raw is HeadingMetadataDisplay {
    return typeof raw === 'string' && HEADING_METADATA_DISPLAY_VALUES.includes(raw);
}

export function normalizeHeadingMetadataDisplay(raw: unknown): { value: HeadingMetadataDisplay; changed: boolean } {
    if (isHeadingMetadataDisplay(raw)) {
        return { value: raw, changed: false };
    }
    return { value: DEFAULT_HEADING_METADATA_DISPLAY, changed: true };
}
