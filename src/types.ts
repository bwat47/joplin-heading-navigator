import type { HeadingMetadataDisplay } from './headingMetadataDisplay';

export interface HeadingItem {
    /** Internal positional ID for panel selection and DOM reconciliation. */
    id: string;
    /** Cleaned, readable panel and copied-link label. */
    text: string;
    level: number;
    from: number;
    to: number;
    line: number;
    /** Editor-oriented Markdown link fragment; empty when no usable fragment exists. */
    anchor: string;
}

export interface PanelDimensions {
    width: number;
    maxHeightRatio: number;
}

export interface ContentScriptSettings {
    dimensions: PanelDimensions;
    /** What each heading row shows alongside its text. */
    metadataDisplay: HeadingMetadataDisplay;
    /** Whether keyboard and filter navigation preview headings in the editor. */
    previewHeadings: boolean;
    /** Distance in px from the top of the editor to the panel (desktop only). */
    topOffset: number;
}

export const DEFAULT_PREVIEW_HEADINGS = true;

export const DEFAULT_PANEL_DIMENSIONS: PanelDimensions = {
    width: 320,
    // Represents 75% of the editor viewport height
    maxHeightRatio: 0.75,
};
