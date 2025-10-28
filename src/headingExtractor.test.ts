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
});
