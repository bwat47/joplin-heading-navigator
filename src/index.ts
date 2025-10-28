import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { CODEMIRROR_CONTENT_SCRIPT_ID, COMMAND_GO_TO_HEADING, EDITOR_COMMAND_TOGGLE_PANEL } from './constants';
import logger from './logger';

async function registerContentScripts(): Promise<void> {
    await joplin.contentScripts.register(
        ContentScriptType.CodeMirrorPlugin,
        CODEMIRROR_CONTENT_SCRIPT_ID,
        './contentScripts/headingNavigator.js'
    );
}

async function registerCommands(): Promise<void> {
    await joplin.commands.register({
        name: COMMAND_GO_TO_HEADING,
        label: 'Go to Heading',
        iconName: 'fas fa-heading',
        execute: async () => {
            logger.info('Go to Heading command triggered');
            await joplin.commands.execute('editor.execCommand', {
                name: EDITOR_COMMAND_TOGGLE_PANEL,
                args: [],
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
        await registerContentScripts();
        await registerCommands();
        await registerMenuItems();
        await registerToolbarButton();
    },
});
