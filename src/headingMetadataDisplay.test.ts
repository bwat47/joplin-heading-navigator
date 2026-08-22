import {
    DEFAULT_HEADING_METADATA_DISPLAY,
    HEADING_METADATA_DISPLAY,
    normalizeHeadingMetadataDisplay,
} from './headingMetadataDisplay';

describe('normalizeHeadingMetadataDisplay', () => {
    it('accepts every supported mode unchanged', () => {
        for (const mode of Object.values(HEADING_METADATA_DISPLAY)) {
            expect(normalizeHeadingMetadataDisplay(mode)).toEqual({ value: mode, changed: false });
        }
    });

    it('falls back to the default for unknown or non-string values', () => {
        const fallback = { value: DEFAULT_HEADING_METADATA_DISPLAY, changed: true };

        expect(normalizeHeadingMetadataDisplay('COMPACT')).toEqual(fallback);
        expect(normalizeHeadingMetadataDisplay('')).toEqual(fallback);
        expect(normalizeHeadingMetadataDisplay(true)).toEqual(fallback);
        expect(normalizeHeadingMetadataDisplay(undefined)).toEqual(fallback);
        expect(normalizeHeadingMetadataDisplay(null)).toEqual(fallback);
    });

    it('defaults to full so upgrading users keep the existing row layout', () => {
        expect(DEFAULT_HEADING_METADATA_DISPLAY).toBe(HEADING_METADATA_DISPLAY.full);
    });
});
