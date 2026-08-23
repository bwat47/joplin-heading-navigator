/**
 * Theme styling for the heading navigator panel.
 *
 * Uses Joplin's CSS variables to automatically integrate with the active theme.
 *
 * @see createPanelCss - Generates panel styles using CSS variables
 */

import { DEFAULT_PANEL_TOP_OFFSET } from '../../panelDimensions';
import type { PanelDimensions } from '../../types';

/** Inline CSS custom property carrying the panel's distance from the top of the editor. */
export const PANEL_TOP_OFFSET_VAR = '--heading-navigator-top-offset';

const PANEL_BOTTOM_GAP_PX = 12;

const SEARCH_CANCEL_MASK_DATA_URI =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 2l8 8m0-8L2 10' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E";

function formatPanelWidth(width: number): string {
    return `${Math.round(width)}px`;
}

function formatMaxHeight(ratio: number): string {
    const percentage = (ratio * 100).toFixed(2);
    return `${percentage}%`;
}

export function createPanelCss(dimensions: PanelDimensions): string {
    const panelWidth = formatPanelWidth(dimensions.width);
    const maxHeight = formatMaxHeight(dimensions.maxHeightRatio);

    return `
.heading-navigator-panel {
    position: absolute;
    top: var(${PANEL_TOP_OFFSET_VAR}, ${DEFAULT_PANEL_TOP_OFFSET}px);
    right: 12px;
    width: ${panelWidth};
    max-height: min(
        ${maxHeight},
        max(0px, calc(100% - var(${PANEL_TOP_OFFSET_VAR}, ${DEFAULT_PANEL_TOP_OFFSET}px) - ${PANEL_BOTTOM_GAP_PX}px))
    );
    display: flex;
    flex-direction: column;
    font-family: system-ui, sans-serif !important;
    background-color: var(--joplin-background-color3, #f4f5f6);
    color: var(--joplin-color, #32373f);
    border: 1px solid var(--joplin-divider-color, #dddddd);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    transition: box-shadow 160ms ease-out;
    z-index: 2000;
    overflow: hidden;
    /*
     * The panel is a control surface, not document text: dragging across rows only ever produced
     * stray selections. On mobile this is also what keeps the WebView from turning the long-press
     * copy gesture into a text selection and callout. The filter input opts back in below.
     */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
}

/*
 * A pinned panel stays open while focus is in the editor. Soften its shadow
 * in that unfocused state so it reads as inactive. Unpinned panels close on
 * blur, so they are always focused while visible and keep the full shadow.
 */
.heading-navigator-panel.is-pinned:not(:focus-within) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.heading-navigator-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--joplin-divider-color, #dddddd);
    background-color: inherit;
}

.heading-navigator-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px;
    border: none;
    background-color: inherit;
    color: inherit;
    font-size: 14px;
    outline: none;
    -webkit-touch-callout: default;
    -webkit-user-select: text;
    user-select: text;
}

.heading-navigator-panel > .heading-navigator-input {
    border-bottom: 1px solid var(--joplin-divider-color, #dddddd);
}

.heading-navigator-header-button {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    margin-right: 2px;
    padding: 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--joplin-color, #32373f);
    cursor: pointer;
    opacity: 0.7;
}

.heading-navigator-header-button:hover,
.heading-navigator-header-button:focus-visible,
.heading-navigator-pin-button[aria-pressed='true'] {
    background-color: var(--joplin-background-color-hover3, rgba(0, 0, 0, 0.08));
    opacity: 1;
    outline: none;
}

.heading-navigator-header-button svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.heading-navigator-input::placeholder {
    color: var(--joplin-color-faded, #7c8b9e);
}

.heading-navigator-input::-webkit-search-cancel-button {
    appearance: none;
    -webkit-appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    color: var(--joplin-color, #32373f);
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 120ms ease-out;
    /* Render X icon via mask so it inherits currentColor */
    background-color: currentColor;
    -webkit-mask-image: url("${SEARCH_CANCEL_MASK_DATA_URI}");
    mask-image: url("${SEARCH_CANCEL_MASK_DATA_URI}");
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: 14px 14px;
    mask-size: 14px 14px;
}

.heading-navigator-input::-webkit-search-cancel-button:hover {
    opacity: 1;
    color: var(--joplin-color, #131313);
}

.heading-navigator-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    font-size: 13px;
    background-color: inherit;
}

.heading-navigator-list::-webkit-scrollbar {
    width: 8px;
}

/* Hide the scrollbar up/down arrow buttons (Chromium renders these by default) */
.heading-navigator-list::-webkit-scrollbar-button {
    display: none;
}

.heading-navigator-list::-webkit-scrollbar-thumb {
    background-color: var(--joplin-scrollbar-thumb-color, rgba(50, 55, 63, 0.54));
    border-radius: 4px;
}

.heading-navigator-list::-webkit-scrollbar-thumb:hover {
    background-color: var(--joplin-scrollbar-thumb-color-hover, rgba(50, 55, 63, 0.63));
}

.heading-navigator-item {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    cursor: pointer;
    background-color: transparent;
}

.heading-navigator-item:hover {
    background-color: color-mix(in srgb, var(--joplin-selected-color, #e5e5e5) 50%, transparent);
}

.heading-navigator-item.is-selected {
    background-color: var(--joplin-selected-color, #e5e5e5);
    color: var(--joplin-color, #131313);
}

.heading-navigator-item-level {
    font-size: 11px;
    color: var(--joplin-color-faded, #7c8b9e);
}

.heading-navigator-item.is-selected .heading-navigator-item-level {
    color: inherit;
    opacity: 0.85;
}

.heading-navigator-panel.is-compact .heading-navigator-item-level {
    display: none;
}

/*
 * Compact row geometry is desktop-only: mobile keeps the larger padding defined in the
 * .is-mobile block below so touch targets and the long-press copy gesture stay usable.
 * The :not(.is-mobile) guard makes that explicit rather than relying on source order.
 */
.heading-navigator-panel.is-compact:not(.is-mobile) .heading-navigator-item {
    gap: 0;
    padding-top: 6px;
    padding-bottom: 6px;
}

.heading-navigator-item-text {
    white-space: normal;
    overflow-wrap: break-word;
    font-weight: 400;
}

.heading-navigator-item-text b {
    font-weight: 700;
    color: var(--joplin-color-bright, inherit);
}

.heading-navigator-level-badge {
    display: none;
}

.heading-navigator-panel.is-compact .heading-navigator-level-badge {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 11px;
    width: 22px;
    height: 18px;
    padding: 0;
    border-radius: 6px;
    background-color: var(--joplin-background-color-hover3, rgba(203, 218, 241, 0.3));
    color: var(--joplin-color, #32373f);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.02em;
    opacity: 1;
    pointer-events: none;
    transition: opacity 160ms ease-out, background-color 120ms ease-out, color 120ms ease-out;
}

.heading-navigator-panel.is-compact.hide-level-badges .heading-navigator-level-badge {
    display: none;
}

.heading-navigator-panel.is-compact .heading-navigator-item.is-selected .heading-navigator-level-badge {
    color: inherit;
}

/* Copy confirmation, shared by desktop right-click and mobile long-press. */
.heading-navigator-item.is-copied {
    animation: heading-navigator-flash 300ms ease-out;
    background-color: var(--joplin-background-color-hover3, #cbdaf1) !important;
}

@keyframes heading-navigator-flash {
    0% { background-color: var(--joplin-background-color-hover3, #cbdaf1); }
    100% { background-color: transparent; }
}

.heading-navigator-empty {
    padding: 12px;
    color: var(--joplin-color-faded, #7c8b9e);
    text-align: center;
}

/* Mobile Mode Overrides */
.heading-navigator-panel.is-mobile {
    position: fixed;
    top: 50%;
    left: 50%;
    right: auto;
    width: 90vw;
    max-height: 80vh;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45); /* Backdrop dimming */
}

/* Prevent scroll chaining to editor behind panel */
.heading-navigator-panel.is-mobile .heading-navigator-list {
    overscroll-behavior: contain;
}

/* Larger touch targets on mobile */
.heading-navigator-panel.is-mobile .heading-navigator-item {
    padding: 14px 16px;
    gap: 4px;
}

.heading-navigator-panel.is-mobile .heading-navigator-input {
    padding: 12px;
    font-size: 16px; /* Prevents iOS zoom on focus */
}

/*
 * Row right gutter. Reserved only where a level badge is actually rendered: rows carry no copy
 * button, so Full and None modes give the full row width to heading text.
 *
 * Deliberately last. It outranks both the base and the mobile padding rules on specificity, and
 * placing it after them keeps it winning under source order too, so the gutter does not depend on
 * which of the two a renderer weighs more heavily.
 */
.heading-navigator-panel.is-compact:not(.hide-level-badges) .heading-navigator-item {
    padding-right: 40px;
}
`;
}
