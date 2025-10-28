import { extractHeadings } from './headingExtractor';

describe('extractHeadings', () => {
    it('parses ATX and Setext headings including nested structures', () => {
        const content = [
            '# Title',
            '',
            'Intro paragraph',
            '',
            '## Section 1',
            '',
            '- ### Nested Heading',
            '',
            'Details paragraph',
            '',
            'Landing',
            '======',
            '',
            'Trailing text',
        ].join('\n');

        const headings = extractHeadings(content);

        expect(headings).toHaveLength(4);

        const [h1, h2, h3, h4] = headings;

        expect(h1).toMatchObject({
            text: 'Title',
            level: 1,
            line: 0,
        });

        expect(h2).toMatchObject({
            text: 'Section 1',
            level: 2,
            line: 4,
        });

        expect(h3).toMatchObject({
            text: 'Nested Heading',
            level: 3,
            line: 6,
        });

        expect(h4).toMatchObject({
            text: 'Landing',
            level: 1,
            line: 10,
        });

        // Ensure ids are stable offsets
        headings.forEach((heading) => {
            expect(heading.id).toBe(`heading-${heading.from}`);
            expect(heading.to).toBeGreaterThan(heading.from);
        });
    });

    it('returns an empty array when no headings exist', () => {
        expect(extractHeadings('Plain text only')).toEqual([]);
    });

    it('retains special characters inside heading text', () => {
        const headings = extractHeadings('## Hello & <world>');
        expect(headings).toHaveLength(1);
        expect(headings[0]).toMatchObject({
            text: 'Hello & <world>',
            level: 2,
            line: 0,
        });
    });

    it('handles sequences of deeply nested headings by capping at level six', () => {
        const content = Array.from({ length: 10 }, (_, index) => {
            const level = Math.min(index + 1, 6);
            return `${'#'.repeat(level)} Heading ${index + 1}`;
        }).join('\n');

        const headings = extractHeadings(content);
        expect(headings).toHaveLength(10);

        headings.forEach((heading, index) => {
            const expectedLevel = Math.min(index + 1, 6);
            expect(heading).toMatchObject({
                text: `Heading ${index + 1}`,
                level: expectedLevel,
            });
        });
    });

    it('handles very long heading text', () => {
        const longHeading = `# ${'A'.repeat(120)}`;
        const headings = extractHeadings(longHeading);
        expect(headings).toHaveLength(1);
        expect(headings[0]).toMatchObject({
            text: 'A'.repeat(120),
            level: 1,
        });
    });
});
