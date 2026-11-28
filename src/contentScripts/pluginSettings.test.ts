import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ContentScriptContext } from 'api/types';
import { DEFAULT_HEADING_METADATA_DISPLAY, HEADING_METADATA_DISPLAY } from '../headingMetadataDisplay';
import logger from '../logger';
import { DEFAULT_PANEL_TOP_OFFSET, MAX_PANEL_WIDTH, MIN_PANEL_HEIGHT_PERCENTAGE } from '../panelDimensions';
import { DEFAULT_PANEL_DIMENSIONS, DEFAULT_PREVIEW_HEADINGS, type ContentScriptSettings } from '../types';
import { createSettingsExtension, getContentScriptSettings, syncInitialContentScriptSettings } from './pluginSettings';

const EXPECTED_DEFAULTS: ContentScriptSettings = {
    dimensions: { ...DEFAULT_PANEL_DIMENSIONS },
    metadataDisplay: DEFAULT_HEADING_METADATA_DISPLAY,
    previewHeadings: DEFAULT_PREVIEW_HEADINGS,
    topOffset: DEFAULT_PANEL_TOP_OFFSET,
};

function createContext(postMessage: ReturnType<typeof vi.fn>): ContentScriptContext {
    return { postMessage } as unknown as ContentScriptContext;
}

describe('content script settings', () => {
    let view: EditorView;

    beforeEach(() => {
        view = new EditorView({
            state: EditorState.create({ extensions: createSettingsExtension() }),
        });
    });

    afterEach(() => {
        view.destroy();
        vi.restoreAllMocks();
    });

    async function syncWithResponse(response: unknown): Promise<ContentScriptSettings | null> {
        const postMessage = vi.fn().mockResolvedValue(response);
        return syncInitialContentScriptSettings(createContext(postMessage), view);
    }

    it('provides defaults before syncing', () => {
        expect(getContentScriptSettings(view.state)).toEqual(EXPECTED_DEFAULTS);
    });

    it('falls back to defaults for malformed settings', async () => {
        expect(await syncWithResponse(null)).toEqual(EXPECTED_DEFAULTS);
        expect(await syncWithResponse('bad')).toEqual(EXPECTED_DEFAULTS);
        expect(await syncWithResponse({ dimensions: null, metadataDisplay: 'tiny' })).toEqual(EXPECTED_DEFAULTS);
    });

    it('normalizes dimensions and accepts only known metadata display modes', async () => {
        expect(
            await syncWithResponse({
                dimensions: { width: 999, maxHeightRatio: 0.1 },
                metadataDisplay: HEADING_METADATA_DISPLAY.none,
                previewHeadings: false,
                topOffset: 44,
            })
        ).toEqual({
            dimensions: {
                width: MAX_PANEL_WIDTH,
                maxHeightRatio: MIN_PANEL_HEIGHT_PERCENTAGE / 100,
            },
            metadataDisplay: HEADING_METADATA_DISPLAY.none,
            previewHeadings: false,
            topOffset: 44,
        });

        expect(
            (await syncWithResponse({ dimensions: DEFAULT_PANEL_DIMENSIONS, metadataDisplay: 1 }))?.metadataDisplay
        ).toBe(HEADING_METADATA_DISPLAY.full);
        expect((await syncWithResponse({ metadataDisplay: 'Compact' }))?.metadataDisplay).toBe(
            HEADING_METADATA_DISPLAY.full
        );
    });

    it('accepts only boolean preview preferences and otherwise enables previews by default', async () => {
        expect((await syncWithResponse({ previewHeadings: false }))?.previewHeadings).toBe(false);
        expect((await syncWithResponse({ previewHeadings: true }))?.previewHeadings).toBe(true);
        expect((await syncWithResponse({ previewHeadings: 'false' }))?.previewHeadings).toBe(true);
        expect((await syncWithResponse({}))?.previewHeadings).toBe(true);
    });

    it('normalizes the top offset and falls back to default when invalid', async () => {
        expect((await syncWithResponse({ topOffset: 40 }))?.topOffset).toBe(40);
        expect((await syncWithResponse({ topOffset: 5000 }))?.topOffset).toBe(200);
        expect((await syncWithResponse({ topOffset: 'nope' }))?.topOffset).toBe(DEFAULT_PANEL_TOP_OFFSET);
        expect((await syncWithResponse({ dimensions: DEFAULT_PANEL_DIMENSIONS }))?.topOffset).toBe(
            DEFAULT_PANEL_TOP_OFFSET
        );
    });

    it('fetches settings from the plugin host and reconfigures the facet', async () => {
        const postMessage = vi.fn().mockResolvedValue({
            dimensions: { width: 480, maxHeightRatio: 0.6 },
            metadataDisplay: HEADING_METADATA_DISPLAY.compact,
            previewHeadings: false,
            topOffset: 24,
        });

        const applied = await syncInitialContentScriptSettings(createContext(postMessage), view);

        expect(postMessage).toHaveBeenCalledWith({ type: 'getContentScriptSettings' });
        expect(applied).toEqual({
            dimensions: { width: 480, maxHeightRatio: 0.6 },
            metadataDisplay: HEADING_METADATA_DISPLAY.compact,
            previewHeadings: false,
            topOffset: 24,
        });
        expect(getContentScriptSettings(view.state)).toEqual(applied);
    });

    it('does not apply fetched settings when shouldApply returns false', async () => {
        const postMessage = vi.fn().mockResolvedValue({
            dimensions: { width: 480, maxHeightRatio: 0.6 },
            metadataDisplay: HEADING_METADATA_DISPLAY.compact,
            previewHeadings: false,
            topOffset: 24,
        });

        const applied = await syncInitialContentScriptSettings(createContext(postMessage), view, () => false);

        expect(applied).toBeNull();
        expect(getContentScriptSettings(view.state)).toEqual(EXPECTED_DEFAULTS);
    });

    it('logs a warning and returns null when fetching settings fails', async () => {
        const error = new Error('host unavailable');
        const postMessage = vi.fn().mockRejectedValue(error);
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

        const applied = await syncInitialContentScriptSettings(createContext(postMessage), view);

        expect(applied).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith('Failed to fetch content script settings', error);
        expect(getContentScriptSettings(view.state)).toEqual(EXPECTED_DEFAULTS);
    });
});
