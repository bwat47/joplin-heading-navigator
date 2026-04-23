import {
    escapeLinkText,
    formatExternalHeadingLink,
    formatHeadingLink,
    formatInternalHeadingLink,
} from './linkFormatting';

describe('escapeLinkText', () => {
    it('escapes square brackets', () => {
        expect(escapeLinkText('Hello [World]')).toBe('Hello \\[World\\]');
        expect(escapeLinkText('[Complex]')).toBe('\\[Complex\\]');
    });

    it('escapes backslashes', () => {
        expect(escapeLinkText('Path\\to\\file')).toBe('Path\\\\to\\\\file');
    });

    it('escapes both brackets and backslashes', () => {
        expect(escapeLinkText('[Test] \\Example\\')).toBe('\\[Test\\] \\\\Example\\\\');
    });

    it('escapes HTML angle brackets and ampersands', () => {
        expect(escapeLinkText('<div>&Text>')).toBe('\\<div\\>\\&Text\\>');
    });

    it('returns original text when no escaping needed', () => {
        expect(escapeLinkText('Simple text')).toBe('Simple text');
    });

    it('handles empty string', () => {
        expect(escapeLinkText('')).toBe('');
    });
});

describe('formatHeadingLink', () => {
    it('formats heading link with note title', () => {
        const result = formatHeadingLink('Usage', 'Guide', 'abc123', 'usage');
        expect(result).toBe('[Usage @ Guide](:/abc123#usage)');
    });

    it('escapes special characters in heading and note title', () => {
        const result = formatHeadingLink('[API]', '[Docs]', 'abc', 'api');
        expect(result).toBe('[\\[API\\] @ \\[Docs\\]](:/abc#api)');
    });

    it('escapes HTML tags in heading and note title', () => {
        const result = formatHeadingLink('<div>', 'Section & Links', 'note', 'div');
        expect(result).toBe('[\\<div\\> @ Section \\& Links](:/note#div)');
    });

    it('handles headings with backslashes', () => {
        const result = formatHeadingLink('Path\\to\\file', 'Note\\Title', 'id123', 'path-to-file');
        expect(result).toBe('[Path\\\\to\\\\file @ Note\\\\Title](:/id123#path-to-file)');
    });

    it('formats link with special anchor characters', () => {
        const result = formatHeadingLink('Hello World', 'My Note', 'xyz', 'hello-world-2');
        expect(result).toBe('[Hello World @ My Note](:/xyz#hello-world-2)');
    });
});

describe('formatExternalHeadingLink', () => {
    it('formats external heading link with note title', () => {
        const result = formatExternalHeadingLink('Usage', 'Guide', 'abc123', 'usage');
        expect(result).toBe('[Usage @ Guide](:/abc123#usage)');
    });
});

describe('formatInternalHeadingLink', () => {
    it('formats internal anchor link with heading text only', () => {
        const result = formatInternalHeadingLink('Usage', 'usage');
        expect(result).toBe('[Usage](#usage)');
    });

    it('escapes special characters in heading text', () => {
        const result = formatInternalHeadingLink('[API] <Guide> & Links', 'api-guide-links');
        expect(result).toBe('[\\[API\\] \\<Guide\\> \\& Links](#api-guide-links)');
    });
});
