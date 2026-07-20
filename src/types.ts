export interface HeadingItem {
    id: string;
    text: string;
    level: number;
    from: number;
    to: number;
    line: number;
    anchor: string;
}

export interface PanelDimensions {
    width: number;
    maxHeightRatio: number;
}

export interface ContentScriptSettings {
    dimensions: PanelDimensions;
    compactMode: boolean;
    /** Distance in px from the top of the editor to the panel (desktop only). */
    topOffset: number;
}

export const DEFAULT_PANEL_DIMENSIONS: PanelDimensions = {
    width: 320,
    // Represents 75% of the editor viewport height
    maxHeightRatio: 0.75,
};
