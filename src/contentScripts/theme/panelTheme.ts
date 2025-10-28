import { EditorView } from '@codemirror/view';
import type { PanelDimensions } from '../../types';

export interface RGBColor {
    r: number;
    g: number;
    b: number;
}

export interface PanelTheme {
    background: string;
    foreground: string;
    border: string;
    divider: string;
    muted: string;
    selectedBackground: string;
    selectedForeground: string;
    scrollbar: string;
    scrollbarHover: string;
    highlightBackground: string;
}

const WHITE: RGBColor = { r: 255, g: 255, b: 255 };
const BLACK: RGBColor = { r: 0, g: 0, b: 0 };

function clampToByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(color: RGBColor): string {
    const toHex = (value: number): string => clampToByte(value).toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function parseHexColor(value: string): RGBColor | null {
    const hex = value.replace('#', '');
    if (hex.length === 3) {
        const [r, g, b] = hex.split('').map((component) => parseInt(component.repeat(2), 16));
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
            return null;
        }
        return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
    }
    if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].some((component) => Number.isNaN(component))) {
            return null;
        }
        return { r, g, b };
    }
    return null;
}

function parseRgbColor(value: string): RGBColor | null {
    const match = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!match) {
        return null;
    }

    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    if ([r, g, b, alpha].some((component) => Number.isNaN(component))) {
        return null;
    }

    if (alpha === 0) {
        return null;
    }

    return { r, g, b };
}

function parseColor(value: string | null | undefined): RGBColor | null {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith('#')) {
        return parseHexColor(trimmed);
    }
    if (trimmed.startsWith('rgb')) {
        return parseRgbColor(trimmed);
    }
    return parseHexColor(trimmed);
}

function mixColors(base: RGBColor, other: RGBColor, weight: number): RGBColor {
    return {
        r: base.r * (1 - weight) + other.r * weight,
        g: base.g * (1 - weight) + other.g * weight,
        b: base.b * (1 - weight) + other.b * weight,
    };
}

function relativeLuminance(color: RGBColor): number {
    const normalize = (channel: number): number => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * normalize(color.r) + 0.7152 * normalize(color.g) + 0.0722 * normalize(color.b);
}

function resolveColorFromStyles(candidates: (string | null | undefined)[], fallback: string): RGBColor {
    for (const candidate of candidates) {
        const parsed = parseColor(candidate);
        if (parsed) {
            return parsed;
        }
    }
    const fallbackColor = parseColor(fallback);
    if (!fallbackColor) {
        return WHITE;
    }
    return fallbackColor;
}

export function createPanelTheme(view: EditorView): PanelTheme {
    const doc = view.dom.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const rootStyle = win.getComputedStyle(doc.documentElement);
    const bodyStyle = win.getComputedStyle(doc.body);
    const editorStyle = win.getComputedStyle(view.dom);
    const parentStyle = view.dom.parentElement ? win.getComputedStyle(view.dom.parentElement) : null;

    const background = resolveColorFromStyles(
        [
            rootStyle.getPropertyValue('--joplin-editor-background-color'),
            rootStyle.getPropertyValue('--joplin-color-background'),
            editorStyle.backgroundColor,
            parentStyle?.backgroundColor,
            bodyStyle.backgroundColor,
        ],
        '#ffffff'
    );

    const foreground = resolveColorFromStyles(
        [
            rootStyle.getPropertyValue('--joplin-editor-foreground-color'),
            rootStyle.getPropertyValue('--joplin-color'),
            editorStyle.color,
            parentStyle?.color,
            bodyStyle.color,
        ],
        '#2f3136'
    );

    const isDark = relativeLuminance(background) < 0.5;
    const panelBackground = isDark ? mixColors(background, WHITE, 0.08) : mixColors(background, BLACK, 0.03);
    const panelForeground = foreground;

    const border = isDark ? mixColors(panelBackground, WHITE, 0.18) : mixColors(panelBackground, BLACK, 0.1);
    const divider = border;
    const muted = mixColors(panelForeground, panelBackground, isDark ? 0.45 : 0.35);
    const selectedBackground = isDark
        ? mixColors(panelBackground, WHITE, 0.16)
        : mixColors(panelBackground, BLACK, 0.12);
    const selectedForeground = isDark ? '#ffffff' : '#111111';
    const scrollbar = mixColors(panelForeground, panelBackground, 0.6);
    const scrollbarHover = mixColors(panelForeground, panelBackground, 0.45);
    const highlightBackground = isDark
        ? mixColors(panelBackground, WHITE, 0.22)
        : mixColors(panelBackground, BLACK, 0.08);

    return {
        background: rgbToHex(panelBackground),
        foreground: rgbToHex(panelForeground),
        border: rgbToHex(border),
        divider: rgbToHex(divider),
        muted: rgbToHex(muted),
        selectedBackground: rgbToHex(selectedBackground),
        selectedForeground,
        scrollbar: rgbToHex(scrollbar),
        scrollbarHover: rgbToHex(scrollbarHover),
        highlightBackground: rgbToHex(highlightBackground),
    };
}

function formatPanelWidth(width: number): string {
    return `${Math.round(width)}px`;
}

function formatMaxHeight(ratio: number): string {
    const percentage = Number((ratio * 100).toFixed(2));
    return `${percentage}%`;
}

export function createPanelCss(theme: PanelTheme, dimensions: PanelDimensions): string {
    const panelWidth = formatPanelWidth(dimensions.width);
    const maxHeight = formatMaxHeight(dimensions.maxHeightRatio);
    return `
.heading-navigator-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: ${panelWidth};
    max-height: ${maxHeight};
    display: flex;
    flex-direction: column;
    background-color: ${theme.background};
    color: ${theme.foreground};
    border: 1px solid ${theme.border};
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 2000;
    overflow: hidden;
}

.heading-navigator-input {
    padding: 8px;
    border: none;
    border-bottom: 1px solid ${theme.divider};
    background-color: inherit;
    color: inherit;
    font-size: 14px;
    outline: none;
}

.heading-navigator-input::placeholder {
    color: ${theme.muted};
}

.heading-navigator-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    font-size: 13px;
    background-color: inherit;
    scrollbar-color: ${theme.scrollbar} transparent;
}

.heading-navigator-list::-webkit-scrollbar {
    width: 8px;
}

.heading-navigator-list::-webkit-scrollbar-thumb {
    background-color: ${theme.scrollbar};
    border-radius: 4px;
}

.heading-navigator-list::-webkit-scrollbar-thumb:hover {
    background-color: ${theme.scrollbarHover};
}

.heading-navigator-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    cursor: pointer;
    background-color: transparent;
}

.heading-navigator-item.is-selected {
    background-color: ${theme.selectedBackground};
    color: ${theme.selectedForeground};
}

.heading-navigator-item-level {
    font-size: 11px;
    color: ${theme.muted};
}

.heading-navigator-item.is-selected .heading-navigator-item-level {
    color: ${theme.selectedForeground};
    opacity: 0.85;
}

.heading-navigator-item-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
}

.heading-navigator-empty {
    padding: 12px;
    color: ${theme.muted};
    text-align: center;
}
`;
}
