import { createPanelCss } from './panelTheme';

describe('createPanelCss', () => {
    it('includes the provided panel dimensions', () => {
        const css = createPanelCss({ width: 480, maxHeightRatio: 0.65 });

        expect(css).toContain('width: 480px;');
        expect(css).toContain('max-height: 65.00%;');
    });

    it('includes all required CSS classes', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });

        expect(css).toContain('.heading-navigator-panel');
        expect(css).toContain('.heading-navigator-panel.is-compact .heading-navigator-item-level');
        expect(css).toContain('.heading-navigator-panel.is-compact .heading-navigator-item');
        expect(css).toContain('.heading-navigator-level-badge');
        expect(css).toContain('.heading-navigator-panel.is-compact .heading-navigator-level-badge');
        expect(css).toContain(
            '.heading-navigator-panel.is-compact .heading-navigator-item:hover .heading-navigator-level-badge'
        );
        expect(css).toContain('.heading-navigator-input');
        expect(css).toContain('.heading-navigator-header');
        expect(css).toContain('.heading-navigator-header-button');
        expect(css).toContain('.heading-navigator-pin-button');
        expect(css).toContain('.heading-navigator-list');
        expect(css).toContain('.heading-navigator-item');
        expect(css).toContain('.heading-navigator-item-level');
        expect(css).toContain('.heading-navigator-item-text');
        expect(css).toContain('.heading-navigator-copy-button');
        expect(css).toContain('.heading-navigator-empty');
    });

    it('positions the panel top via a CSS custom property so the offset can change without a restyle', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });

        expect(css).toContain('top: var(--heading-navigator-top-offset, 12px);');
    });

    it('rounds dimensions appropriately', () => {
        const css = createPanelCss({ width: 450.7, maxHeightRatio: 0.6543 });

        expect(css).toContain('width: 451px;');
        expect(css).toContain('max-height: 65.43%;');
    });
});
