import { formatExternalHeadingLink, formatInternalHeadingLink } from './linkFormatting';

describe('formatExternalHeadingLink', () => {
    it('formats heading link with note title', () => {
        const result = formatExternalHeadingLink('Usage', 'Guide', 'abc123', 'usage');
        expect(result).toBe('[Usage @ Guide](:/abc123#usage)');
    });

    it('escapes special characters in heading and note title', () => {
        const result = formatExternalHeadingLink('[API]', '[Docs]', 'abc', 'api');
        expect(result).toBe('[\\[API\\] @ \\[Docs\\]](:/abc#api)');
    });

    it('escapes HTML tags in heading and note title', () => {
        const result = formatExternalHeadingLink('<div>', 'Section & Links', 'note', 'div');
        expect(result).toBe('[\\<div\\> @ Section \\& Links](:/note#div)');
    });

    it('handles headings with backslashes', () => {
        const result = formatExternalHeadingLink('Path\\to\\file', 'Note\\Title', 'id123', 'path-to-file');
        expect(result).toBe('[Path\\\\to\\\\file @ Note\\\\Title](:/id123#path-to-file)');
    });

    it('formats link with special anchor characters', () => {
        const result = formatExternalHeadingLink('Hello World', 'My Note', 'xyz', 'hello-world-2');
        expect(result).toBe('[Hello World @ My Note](:/xyz#hello-world-2)');
    });
});

describe('formatInternalHeadingLink', () => {
    it('formats internal anchor link with heading text only', () => {
        const result = formatInternalHeadingLink('Usage', 'usage');
        expect(result).toBe('[Usage](#usage)');
    });

    it('escapes special characters in heading text', () => {
        const result = formatInternalHeadingLink('[API] \\<Guide> & Links\\', 'api-guide-links');
        expect(result).toBe('[\\[API\\] \\\\\\<Guide\\> \\& Links\\\\](#api-guide-links)');
    });

    it('handles empty heading text', () => {
        expect(formatInternalHeadingLink('', 'empty')).toBe('[](#empty)');
    });
});
