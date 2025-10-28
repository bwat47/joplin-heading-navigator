export interface HeadingItem {
    id: string;
    text: string;
    level: number;
    from: number;
    to: number;
    line: number;
}

export interface PanelDimensions {
    width: number;
    maxHeightRatio: number;
}

export const DEFAULT_PANEL_DIMENSIONS: PanelDimensions = {
    width: 320,
    maxHeightRatio: 0.75,
};
