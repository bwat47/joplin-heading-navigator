/**
 * Heading metadata display validation and normalization.
 *
 * Controls what each heading row shows alongside its text:
 * - `full`: the `H# - line #` metadata row (tallest rows)
 * - `compact`: an `H#` badge in place of the metadata row
 * - `atx`: a Markdown heading prefix (`#` through `######`) before the text
 * - `none`: no level indicator at all
 *
 * `compact`, `atx`, and `none` share the same row height.
 * The metadata choice applies on both desktop and mobile; the reduced row height that
 * comes with these modes is desktop-only, so mobile keeps its larger touch targets.
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
