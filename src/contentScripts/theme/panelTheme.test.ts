import { createPanelCss } from './panelTheme';

describe('createPanelCss', () => {
    it('includes the provided panel dimensions', () => {
        const css = createPanelCss({ width: 480, maxHeightRatio: 0.65 });

        expect(css).toContain('width: 480px;');
        expect(css).toMatch(/max-height: min\(\s*65\.00%,/);
    });

    it('includes all required CSS classes', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });

        expect(css).toContain('.heading-navigator-panel');
        expect(css).toContain('.heading-navigator-panel.is-compact .heading-navigator-item-level');
        expect(css).toContain('.heading-navigator-panel.is-compact:not(.is-mobile) .heading-navigator-item');
        expect(css).toContain('.heading-navigator-level-badge');
        expect(css).toContain('.heading-navigator-panel.is-compact .heading-navigator-level-badge');
        expect(css).toContain('.heading-navigator-panel.is-compact.hide-level-badges .heading-navigator-level-badge');
        expect(css).toContain('.heading-navigator-panel.is-compact:not(.hide-level-badges) .heading-navigator-item');
        expect(css).toContain('.heading-navigator-input');
        expect(css).toContain('.heading-navigator-header');
        expect(css).toContain('.heading-navigator-header-button');
        expect(css).toContain('.heading-navigator-pin-button');
        expect(css).toContain('.heading-navigator-list');
        expect(css).toContain('.heading-navigator-item');
        expect(css).toContain('.heading-navigator-item-level');
        expect(css).toContain('.heading-navigator-item-text');
        expect(css).toContain('.heading-navigator-item.is-copied');
        expect(css).toContain('.heading-navigator-empty');
    });

    it('prevents native text selection and callouts across the panel', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });
        const panelRule = css.match(/\.heading-navigator-panel \{[^}]*\}/)?.[0];

        expect(panelRule).toContain('-webkit-touch-callout: none;');
        expect(panelRule).toContain('-webkit-user-select: none;');
        // Anchored so the shorthand assertion cannot be satisfied by the -webkit- prefixed line.
        expect(panelRule).toMatch(/(?:^|\s)user-select: none;/);
    });

    it('keeps the filter input selectable so clipboard actions still work', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });
        const inputRule = css.match(/(?:^|\n)\.heading-navigator-input \{[^}]*\}/)?.[0];

        expect(inputRule).toContain('-webkit-touch-callout: default;');
        expect(inputRule).toContain('-webkit-user-select: text;');
        expect(inputRule).toMatch(/(?:^|\s)user-select: text;/);
    });

    it('positions the panel top via a CSS custom property so the offset can change without a restyle', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.7 });

        expect(css).toContain('top: var(--heading-navigator-top-offset, 12px);');
    });

    it('caps the panel height to the space remaining below the configured top offset', () => {
        const css = createPanelCss({ width: 400, maxHeightRatio: 0.9 });

        expect(css).toContain('max(0px, calc(100% - var(--heading-navigator-top-offset, 12px) - 12px))');
    });

    it('rounds dimensions appropriately', () => {
        const css = createPanelCss({ width: 450.7, maxHeightRatio: 0.6543 });

        expect(css).toContain('width: 451px;');
        expect(css).toMatch(/max-height: min\(\s*65\.43%,/);
    });
});
