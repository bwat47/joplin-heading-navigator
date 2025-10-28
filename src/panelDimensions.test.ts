import {
    MAX_PANEL_HEIGHT_PERCENTAGE,
    MAX_PANEL_WIDTH,
    MIN_PANEL_HEIGHT_PERCENTAGE,
    MIN_PANEL_WIDTH,
    normalizePanelDimensions,
    normalizePanelHeightPercentage,
    normalizePanelHeightRatio,
    normalizePanelWidth,
} from './panelDimensions';
import { DEFAULT_PANEL_DIMENSIONS } from './types';

describe('normalizePanelWidth', () => {
    it('clamps width to valid range', () => {
        expect(normalizePanelWidth(MIN_PANEL_WIDTH - 50)).toEqual({ value: MIN_PANEL_WIDTH, changed: true });
        expect(normalizePanelWidth(MAX_PANEL_WIDTH + 100)).toEqual({ value: MAX_PANEL_WIDTH, changed: true });
        expect(normalizePanelWidth(DEFAULT_PANEL_DIMENSIONS.width)).toEqual({
            value: DEFAULT_PANEL_DIMENSIONS.width,
            changed: false,
        });
    });

    it('handles invalid input gracefully', () => {
        expect(normalizePanelWidth(Number.NaN)).toEqual({
            value: DEFAULT_PANEL_DIMENSIONS.width,
            changed: true,
        });
        expect(normalizePanelWidth('not a number')).toEqual({
            value: DEFAULT_PANEL_DIMENSIONS.width,
            changed: true,
        });
        expect(normalizePanelWidth(null)).toEqual({
            value: DEFAULT_PANEL_DIMENSIONS.width,
            changed: true,
        });
    });
});

describe('normalizePanelHeightPercentage', () => {
    it('clamps percentage to valid range', () => {
        expect(normalizePanelHeightPercentage(MIN_PANEL_HEIGHT_PERCENTAGE - 10)).toEqual({
            value: MIN_PANEL_HEIGHT_PERCENTAGE,
            changed: true,
        });
        expect(normalizePanelHeightPercentage(MAX_PANEL_HEIGHT_PERCENTAGE + 15)).toEqual({
            value: MAX_PANEL_HEIGHT_PERCENTAGE,
            changed: true,
        });
        expect(normalizePanelHeightPercentage(DEFAULT_PANEL_DIMENSIONS.maxHeightRatio * 100)).toEqual({
            value: Math.round(DEFAULT_PANEL_DIMENSIONS.maxHeightRatio * 100),
            changed: false,
        });
    });
});

describe('normalizePanelHeightRatio', () => {
    it('clamps ratio to valid range', () => {
        expect(normalizePanelHeightRatio(-0.5)).toEqual({
            value: MIN_PANEL_HEIGHT_PERCENTAGE / 100,
            changed: true,
        });
        expect(normalizePanelHeightRatio(2)).toEqual({
            value: MAX_PANEL_HEIGHT_PERCENTAGE / 100,
            changed: true,
        });
        expect(normalizePanelHeightRatio(DEFAULT_PANEL_DIMENSIONS.maxHeightRatio)).toEqual({
            value: DEFAULT_PANEL_DIMENSIONS.maxHeightRatio,
            changed: false,
        });
    });
});

describe('normalizePanelDimensions', () => {
    it('normalizes both width and height ratio', () => {
        expect(
            normalizePanelDimensions({
                width: MIN_PANEL_WIDTH - 1,
                maxHeightRatio: MAX_PANEL_HEIGHT_PERCENTAGE / 100 + 0.5,
            })
        ).toEqual({
            width: MIN_PANEL_WIDTH,
            maxHeightRatio: MAX_PANEL_HEIGHT_PERCENTAGE / 100,
        });

        expect(
            normalizePanelDimensions({
                width: MAX_PANEL_WIDTH + 50,
                maxHeightRatio: MIN_PANEL_HEIGHT_PERCENTAGE / 100 - 0.2,
            })
        ).toEqual({
            width: MAX_PANEL_WIDTH,
            maxHeightRatio: MIN_PANEL_HEIGHT_PERCENTAGE / 100,
        });
    });
});
