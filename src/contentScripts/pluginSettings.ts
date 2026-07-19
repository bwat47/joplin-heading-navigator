import { Compartment, Facet, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ContentScriptContext } from 'api/types';
import type { ContentScriptToPluginMessage } from '../messages';
import { normalizePanelDimensions } from '../panelDimensions';
import { DEFAULT_PANEL_DIMENSIONS, type ContentScriptSettings } from '../types';
import logger from '../logger';

export const DEFAULT_CONTENT_SCRIPT_SETTINGS: ContentScriptSettings = {
    dimensions: { ...DEFAULT_PANEL_DIMENSIONS },
    compactMode: false,
};

const settingsFacet = Facet.define<ContentScriptSettings, ContentScriptSettings>({
    combine: (values) => values[0] ?? DEFAULT_CONTENT_SCRIPT_SETTINGS,
});

const settingsCompartment = new Compartment();

export function getContentScriptSettings(state: EditorState): ContentScriptSettings {
    return state.facet(settingsFacet);
}

export function normalizeContentScriptSettings(value: unknown): ContentScriptSettings {
    if (!value || typeof value !== 'object') {
        return DEFAULT_CONTENT_SCRIPT_SETTINGS;
    }

    const candidate = value as { dimensions?: unknown; compactMode?: unknown };
    const dimensions =
        candidate.dimensions && typeof candidate.dimensions === 'object'
            ? normalizePanelDimensions(candidate.dimensions)
            : { ...DEFAULT_PANEL_DIMENSIONS };

    return {
        dimensions,
        compactMode: typeof candidate.compactMode === 'boolean' ? candidate.compactMode : false,
    };
}

export function createSettingsExtension(): Extension {
    return settingsCompartment.of(settingsFacet.of(DEFAULT_CONTENT_SCRIPT_SETTINGS));
}

export function applyContentScriptSettings(view: EditorView, settings: unknown): ContentScriptSettings {
    const normalized = normalizeContentScriptSettings(settings);
    view.dispatch({
        effects: settingsCompartment.reconfigure(settingsFacet.of(normalized)),
    });
    return normalized;
}

export async function syncInitialContentScriptSettings(
    context: ContentScriptContext,
    view: EditorView,
    shouldApply: () => boolean = () => true
): Promise<ContentScriptSettings | null> {
    try {
        const message = {
            type: 'getContentScriptSettings',
        } satisfies ContentScriptToPluginMessage;
        const response = await context.postMessage(message);
        if (!shouldApply()) {
            return null;
        }
        return applyContentScriptSettings(view, response);
    } catch (error) {
        logger.warn('Failed to fetch content script settings', error);
        return null;
    }
}
