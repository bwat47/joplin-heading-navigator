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
import { loadPanelDimensions, registerPanelSettings } from './settings';
import type { ContentScriptToPluginMessage, CopyHeadingLinkMessage } from './messages';
import { formatHeadingLink } from './linkFormatting';

async function handleCopyHeadingLink(message: CopyHeadingLinkMessage): Promise<void> {
    const { noteId, headingText, headingAnchor } = message;

    try {
        const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'title'] });

        if (!note || typeof note.id !== 'string') {
            logger.warn('Unable to copy heading link because note could not be resolved', { noteId, headingAnchor });
            return;
        }

        const noteTitle = typeof note.title === 'string' && note.title ? note.title : 'Untitled';
        const markdown = formatHeadingLink(headingText, noteTitle, noteId, headingAnchor);

        await joplin.clipboard.writeText(markdown);
        logger.info('Copied heading link to clipboard', { noteId, headingAnchor });
    } catch (error) {
        logger.error('Failed to copy heading link to clipboard', error);
    }
}

async function registerContentScripts(): Promise<void> {
    await joplin.contentScripts.register(
        ContentScriptType.CodeMirrorPlugin,
        CODEMIRROR_CONTENT_SCRIPT_ID,
        './contentScripts/headingNavigator.js'
    );

    await joplin.contentScripts.onMessage(
        CODEMIRROR_CONTENT_SCRIPT_ID,
        async (message: ContentScriptToPluginMessage): Promise<void> => {
            if (!message || typeof message !== 'object') {
                return;
            }

            switch (message.type) {
                case 'copyHeadingLink':
                    await handleCopyHeadingLink(message);
                    return;
                default:
                    logger.warn('Received unsupported message from content script', message);
            }
        }
    );
}

async function registerCommands(): Promise<void> {
    await joplin.commands.register({
        name: COMMAND_GO_TO_HEADING,
        label: 'Go to Heading',
        iconName: 'fas fa-heading',
        execute: async () => {
            logger.info('Go to Heading command triggered');
            const panelDimensions = await loadPanelDimensions();
            const versionInfo = await joplin.versionInfo();
            const isMobile = versionInfo.platform === 'mobile';

            await joplin.commands.execute('editor.execCommand', {
                name: EDITOR_COMMAND_TOGGLE_PANEL,
                args: [panelDimensions, isMobile],
            });
        },
    });
}

async function registerMenuItems(): Promise<void> {
    await joplin.views.menuItems.create('headingNavigatorMenuItem', COMMAND_GO_TO_HEADING, MenuItemLocation.Edit);
}

async function registerToolbarButton(): Promise<void> {
    await joplin.views.toolbarButtons.create(
        'headingNavigatorToolbarButton',
        COMMAND_GO_TO_HEADING,
        ToolbarButtonLocation.EditorToolbar
    );
}

joplin.plugins.register({
    onStart: async () => {
        logger.info('Heading Navigator plugin starting');
        await registerPanelSettings();
        await registerContentScripts();
        await registerCommands();
        await registerMenuItems();
        await registerToolbarButton();
    },
});
