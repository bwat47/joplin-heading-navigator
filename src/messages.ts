/**
 * Message protocol for content script → plugin host communication.
 *
 * The content script runs in Joplin's CodeMirror editor context and cannot directly
 * access Joplin APIs (clipboard, data store, etc.). Messages defined here are sent
 * via the postMessage bridge to the plugin host, which handles the actual operations.
 *
 * See:
 * - headingNavigator.ts - Content script that sends these messages
 * - index.ts - Plugin host that receives and processes messages
 */

import type { PanelDimensions } from './types';

export interface CopyHeadingLinkMessage {
    type: 'copyHeadingLink';
    noteId: string;
    headingText: string;
    headingAnchor: string;
}

/** Fire-and-forget: persists the panel pinned state so it survives editor reloads. */
export interface PersistPinnedStateMessage {
    type: 'persistPinnedState';
    pinned: boolean;
}

/** Request/response: fetches the state needed to restore a pinned panel at editor startup. */
export interface GetPanelRestoreStateMessage {
    type: 'getPanelRestoreState';
}

/**
 * Host response to GetPanelRestoreStateMessage. Carries panel settings alongside the
 * pinned flag because on auto-restore the toggle command (which normally supplies
 * dimensions/compact/isMobile as args) has not run yet.
 */
export interface PanelRestoreState {
    pinned: boolean;
    dimensions: PanelDimensions;
    compactMode: boolean;
    isMobile: boolean;
}

export type ContentScriptToPluginMessage =
    | CopyHeadingLinkMessage
    | PersistPinnedStateMessage
    | GetPanelRestoreStateMessage;
