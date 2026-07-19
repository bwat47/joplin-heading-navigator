/**
 * Theme styling for the heading navigator panel.
 *
 * Uses Joplin's CSS variables to automatically integrate with the active theme.
 *
 * @see createPanelCss - Generates panel styles using CSS variables
 */

import type { PanelDimensions } from '../../types';

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
    top: 12px;
    right: 12px;
    width: ${panelWidth};
    max-height: ${maxHeight};
    display: flex;
    flex-direction: column;
    font-family: system-ui, sans-serif !important;
    background-color: var(--joplin-background-color3, #f4f5f6);
    color: var(--joplin-color, #32373f);
    border: 1px solid var(--joplin-divider-color, #dddddd);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 2000;
    overflow: hidden;
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

.heading-navigator-header-button[hidden] {
    display: none;
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
    padding: 8px 52px 8px 12px;
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

.heading-navigator-panel.is-compact .heading-navigator-item {
    gap: 0;
    padding-top: 6px;
    padding-bottom: 6px;
}

.heading-navigator-item-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

.heading-navigator-panel.is-compact .heading-navigator-item.is-selected .heading-navigator-level-badge {
    color: inherit;
}

.heading-navigator-copy-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 8px;
    width: 28px;
    height: 28px;
    padding: 4px;
    border: none;
    border-radius: 4px;
    background-color: var(--joplin-background-color-hover3, rgba(203, 218, 241, 0.3));
    color: var(--joplin-color, #32373f);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease-out, background-color 120ms ease-out, color 120ms ease-out;
}

.heading-navigator-copy-button svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.heading-navigator-item:hover .heading-navigator-copy-button,
.heading-navigator-item:focus-within .heading-navigator-copy-button {
    opacity: 1;
    pointer-events: auto;
}

.heading-navigator-panel.is-compact .heading-navigator-item:hover .heading-navigator-level-badge,
.heading-navigator-panel.is-compact .heading-navigator-item:focus-within .heading-navigator-level-badge {
    opacity: 0;
}

.heading-navigator-panel.is-compact .heading-navigator-copy-button {
    right: 11px;
    width: 22px;
    height: 22px;
    padding: 3px;
    border-radius: 6px;
}

.heading-navigator-panel.is-compact .heading-navigator-copy-button svg {
    width: 14px;
    height: 14px;
}

.heading-navigator-copy-button:hover,
.heading-navigator-copy-button:focus-visible {
    background-color: var(--joplin-background-color-hover3, #cbdaf1);
    color: var(--joplin-color, #131313);
}

.heading-navigator-item.is-selected .heading-navigator-copy-button {
    color: inherit;
}

.heading-navigator-copy-button.is-copied {
    background-color: var(--joplin-background-color-hover3, #cbdaf1);
    color: var(--joplin-color, #131313);
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease-in 120ms, background-color 120ms ease-out, color 120ms ease-out;
}

.heading-navigator-copy-button.is-copied svg path:first-child {
    display: none;
}

.heading-navigator-copy-button.is-copied svg path:last-child {
    d: path('M20 6L9 17l-5-5');
}

.heading-navigator-item.is-selected .heading-navigator-copy-button.is-copied {
    color: inherit;
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
    padding: 14px 52px 14px 16px;
    gap: 4px;
}

.heading-navigator-panel.is-mobile .heading-navigator-input {
    padding: 12px;
    font-size: 16px; /* Prevents iOS zoom on focus */
}

.heading-navigator-panel.is-mobile .heading-navigator-copy-button {
    display: none;
}

.heading-navigator-item.is-mobile-copied {
    animation: heading-navigator-flash 300ms ease-out;
    background-color: var(--joplin-background-color-hover3, #cbdaf1) !important;
}

@keyframes heading-navigator-flash {
    0% { background-color: var(--joplin-background-color-hover3, #cbdaf1); }
    100% { background-color: transparent; }
}
`;
}
