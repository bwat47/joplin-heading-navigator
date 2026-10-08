/**
 * Heading Navigator plugin entry point and host orchestrator.
 *
 * This file runs in the Joplin plugin host context with full API access. It:
 * - Registers the CodeMirror content script (runs in editor context)
 * - Handles messages from the content script (clipboard operations, data fetching)
 * - Registers commands, menu items, and toolbar buttons
 * - Manages plugin settings and configuration
 *
 * Architecture:
 * - Plugin host (this file): Has Joplin API access, handles privileged operations
 * - Content script (headingNavigator.ts): Runs in editor, has CodeMirror access but no Joplin API
 * - Communication: Content script → plugin host via postMessage bridge
 *
 * See:
 * - headingNavigator.ts - Content script that sends messages to this host
 * - messages.ts - Message protocol definitions
 */

import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { CODEMIRROR_CONTENT_SCRIPT_ID, COMMAND_GO_TO_HEADING, EDITOR_COMMAND_TOGGLE_PANEL } from './constants';
import logger from './logger';
import {
    loadContentScriptSettings,
    loadCopyLinkSettings,
    loadPinnedState,
    registerPanelSettings,
    savePinnedState,
} from './settings';
import type { ContentScriptToPluginMessage, CopyHeadingLinkMessage, PanelRestoreState } from './messages';
import { formatExternalHeadingLink, formatInternalHeadingLink } from './linkFormatting';
import type { ContentScriptSettings } from './types';

/**
 * Desktop when-clause: true only when the CodeMirror (markdown) editor pane is shown,
 * i.e. not in the Rich Text editor and not in viewer-only layout.
 *
 * Not used on mobile: the mobile note toolbar menu caches its enabled state and doesn't
 * refresh it when switching between the viewer and editor, so the button is placed in
 * the editor toolbar there instead (which only shows in the markdown editor).
 */
const DESKTOP_ENABLED_CONDITION = 'markdownEditorPaneVisible';

async function isMobilePlatform(): Promise<boolean> {
    const versionInfo = await joplin.versionInfo();
    return versionInfo.platform === 'mobile';
}

async function handleCopyHeadingLink(message: CopyHeadingLinkMessage): Promise<void> {
    const { noteId, headingText, headingAnchor } = message;

    try {
        const copyLinkSettings = await loadCopyLinkSettings();
        if (copyLinkSettings.copyInternalAnchorLinks) {
            const markdown = formatInternalHeadingLink(headingText, headingAnchor);
            await joplin.clipboard.writeText(markdown);
            logger.info('Copied internal heading link to clipboard', { noteId, headingAnchor });
            return;
        }

        const note: unknown = await joplin.data.get(['notes', noteId], { fields: ['id', 'title'] });

        if (!note || typeof note !== 'object' || !('id' in note) || typeof note.id !== 'string') {
            logger.warn('Unable to copy heading link because note could not be resolved', { noteId, headingAnchor });
            return;
        }

        const noteTitle = 'title' in note && typeof note.title === 'string' && note.title ? note.title : 'Untitled';
        const markdown = formatExternalHeadingLink(headingText, noteTitle, noteId, headingAnchor);

        await joplin.clipboard.writeText(markdown);
        logger.info('Copied heading link to clipboard', { noteId, headingAnchor });
    } catch (error) {
        logger.error('Failed to copy heading link to clipboard', error);
    }
}

async function handleGetPanelRestoreState(): Promise<PanelRestoreState> {
    const [pinned, isMobile] = await Promise.all([loadPinnedState(), isMobilePlatform()]);

    return {
        pinned,
        isMobile,
    };
}

async function registerContentScripts(): Promise<void> {
    await joplin.contentScripts.register(
        ContentScriptType.CodeMirrorPlugin,
        CODEMIRROR_CONTENT_SCRIPT_ID,
        './contentScripts/headingNavigator.js'
    );

    await joplin.contentScripts.onMessage(
        CODEMIRROR_CONTENT_SCRIPT_ID,
        async (message: ContentScriptToPluginMessage): Promise<ContentScriptSettings | PanelRestoreState | void> => {
            if (!message || typeof message !== 'object') {
                return;
            }

            switch (message.type) {
                case 'copyHeadingLink':
                    await handleCopyHeadingLink(message);
                    return;
                case 'persistPinnedState':
                    await savePinnedState(message.pinned);
                    return;
                case 'getPanelRestoreState':
                    return handleGetPanelRestoreState();
                case 'getContentScriptSettings':
                    return loadContentScriptSettings();
                default:
                    logger.warn('Received unsupported message from content script', message);
            }
        }
    );
}

async function registerCommands(isMobile: boolean): Promise<void> {
    await joplin.commands.register({
        name: COMMAND_GO_TO_HEADING,
        label: 'Go to Heading',
        iconName: 'fas fa-heading',
        enabledCondition: isMobile ? undefined : DESKTOP_ENABLED_CONDITION,
        execute: async () => {
            logger.info('Go to Heading command triggered');

            await joplin.commands.execute('editor.execCommand', {
                name: EDITOR_COMMAND_TOGGLE_PANEL,
                args: [isMobile],
            });
        },
    });
}

async function registerMenuItems(): Promise<void> {
    await joplin.views.menuItems.create('headingNavigatorMenuItem', COMMAND_GO_TO_HEADING, MenuItemLocation.Edit);
}

async function registerToolbarButton(isMobile: boolean): Promise<void> {
    const location = isMobile ? ToolbarButtonLocation.EditorToolbar : ToolbarButtonLocation.NoteToolbar;
    await joplin.views.toolbarButtons.create('headingNavigatorToolbarButton', COMMAND_GO_TO_HEADING, location);
}

void joplin.plugins.register({
    onStart: async () => {
        logger.info('Heading Navigator plugin starting');
        const isMobile = await isMobilePlatform();
        await registerPanelSettings();
        await registerContentScripts();
        await registerCommands(isMobile);
        await registerMenuItems();
        await registerToolbarButton(isMobile);
    },
});
