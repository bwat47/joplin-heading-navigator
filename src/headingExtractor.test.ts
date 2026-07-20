import { computeHeadingState } from './headingExtractor';
import { createMarkdownState, extractHeadingsFromMarkdown } from './testing/markdownState';

describe('heading extraction', () => {
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

        const headings = extractHeadingsFromMarkdown(content);

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
        expect(extractHeadingsFromMarkdown('Plain text only')).toEqual([]);
    });

    it('strips HTML tags but retains other special characters', () => {
        const headings = extractHeadingsFromMarkdown('## Hello & <world>');
        expect(headings).toHaveLength(1);
        expect(headings[0]).toMatchObject({
            text: 'Hello &',
            level: 2,
            line: 0,
        });
    });

    it('handles sequences of deeply nested headings by capping at level six', () => {
        const content = Array.from({ length: 10 }, (_, index) => {
            const level = Math.min(index + 1, 6);
            return `${'#'.repeat(level)} Heading ${index + 1}`;
        }).join('\n');

        const headings = extractHeadingsFromMarkdown(content);
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
        const headings = extractHeadingsFromMarkdown(longHeading);
        expect(headings).toHaveLength(1);
        expect(headings[0]).toMatchObject({
            text: 'A'.repeat(120),
            level: 1,
        });
    });

    it('generates correct anchors for duplicate headings', () => {
        const content = `# Introduction
## Introduction
### Introduction`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].anchor).toBe('introduction');
        expect(headings[1].anchor).toBe('introduction-2');
        expect(headings[2].anchor).toBe('introduction-3');
    });

    it('generates anchors with special characters', () => {
        const content = `# Hello World!
## API & Configuration
### Test-Section`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].anchor).toBe('hello-world');
        expect(headings[1].anchor).toBe('api-configuration');
        expect(headings[2].anchor).toBe('test-section');
    });

    it('generates fallback anchor for empty slug', () => {
        const content = '# !!!';
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings).toHaveLength(1);
        expect(headings[0].anchor).toMatch(/^heading-\d+$/);
    });

    it('generates anchors with mixed case normalized to lowercase', () => {
        const content = `# Hello World
## UPPERCASE HEADING
### MixedCase`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].anchor).toBe('hello-world');
        expect(headings[1].anchor).toBe('uppercase-heading');
        expect(headings[2].anchor).toBe('mixedcase');
    });

    it('generates unique anchors for similar headings with different punctuation', () => {
        const content = `# Test: Example
## Test Example`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].anchor).toBe('test-example');
        expect(headings[1].anchor).toBe('test-example-2');
    });

    it('preserves underscores in emoji shortcodes and similar text', () => {
        const content = `## :white_check_mark: *Features*
### snake_case_heading
#### :fire: hot_topic`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe(':white_check_mark: Features');
        expect(headings[0].anchor).toBe('white_check_mark-features');

        expect(headings[1].text).toBe('snake_case_heading');
        expect(headings[1].anchor).toBe('snake_case_heading');

        expect(headings[2].text).toBe(':fire: hot_topic');
        expect(headings[2].anchor).toBe('fire-hot_topic');
    });

    it('removes italic underscores but preserves content underscores', () => {
        const content = `# This is _italic_ text with snake_case
## _Entire heading italic_`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('This is italic text with snake_case');
        expect(headings[1].text).toBe('Entire heading italic');
    });

    it('strips inline markdown formatting while preserving text', () => {
        const content = `# **Bold** Heading
## *Italic* Text
### \`code\` section
#### [Link Text](https://example.com)
##### ![Alt Text](image.png) Image`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Bold Heading');
        expect(headings[1].text).toBe('Italic Text');
        expect(headings[2].text).toBe('code section');
        expect(headings[3].text).toBe('Link Text');
        expect(headings[4].text).toBe('Image');
    });

    it('strips mark and insert formatting while preserving text', () => {
        const content = `# ==Highlighted== Heading
## ++Inserted++ Text
### Mixed ==highlight== and ++insert++ syntax
#### Comparison a == b and c ++ d`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Highlighted Heading');
        expect(headings[1].text).toBe('Inserted Text');
        expect(headings[2].text).toBe('Mixed highlight and insert syntax');
        expect(headings[3].text).toBe('Comparison a == b and c ++ d');
    });

    it('handles nested and mixed inline formatting', () => {
        const content = `# **_Bold and Italic_** Text
## [**Bold Link**](url)
### \`code with_underscore\``;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Bold and Italic Text');
        expect(headings[1].text).toBe('Bold Link');
        expect(headings[2].text).toBe('code with_underscore');
    });

    it('handles escaped characters in headings', () => {
        const content = `# Escaped \\* asterisk
## Escaped \\_ underscore
### Escaped \\# hash`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Escaped * asterisk');
        expect(headings[1].text).toBe('Escaped _ underscore');
        expect(headings[2].text).toBe('Escaped # hash');
    });

    it('handles double underscores as bold markdown (matches Joplin rendering)', () => {
        const content = `# Using __init__.py files
## The __name__ variable
### file_name_with_many_underscores`;
        const headings = extractHeadingsFromMarkdown(content);

        // Note: __text__ is treated as bold per markdown-it (used by Joplin),
        // so we strip the underscores to match what users see in the rendered note.
        // This behavior is consistent with Joplin's markdown viewer and other plugins.
        // While CommonMark has nuanced rules, we mirror Joplin's actual rendering.
        expect(headings[0].text).toBe('Using init.py files');
        expect(headings[1].text).toBe('The name variable');
        expect(headings[2].text).toBe('file_name_with_many_underscores');
    });

    it('collapses whitespace after stripping formatting', () => {
        const content = `# Multiple    spaces    preserved
## Text  with  **bold**  gaps`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Multiple spaces preserved');
        expect(headings[1].text).toBe('Text with bold gaps');
    });

    it('keeps autolink targets and bare URLs as visible heading text', () => {
        const content = `# Visit <https://example.com>
## 6. Resources \`test\` mailto:bwat47@gmail.com`;
        const headings = extractHeadingsFromMarkdown(content);

        // Angle-bracket autolink: the URL is visible text (only the < > marks are stripped).
        expect(headings[0].text).toBe('Visit https://example.com');
        expect(headings[0].anchor).toBe('visit-httpsexamplecom');

        // Bare URL/email: autolinked under GFM, but the URL node stays visible text.
        expect(headings[1].text).toBe('6. Resources test mailto:bwat47@gmail.com');
        expect(headings[1].anchor).toBe('6-resources-test-mailtobwat47gmailcom');
    });

    it('handles reference-style links', () => {
        const content = `# [Reference Link][ref]
## [Another][1]`;
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Reference Link');
        expect(headings[1].text).toBe('Another');
    });

    it('handles images without alt text', () => {
        const content = '# ![](image.png) Icon';
        const headings = extractHeadingsFromMarkdown(content);

        expect(headings[0].text).toBe('Icon');
    });
});

// These tests exercise real parse-time budgets, so they must run with real timers:
// fake timers freeze the clock ensureSyntaxTree measures against, making every
// parse appear to finish instantly and the partial path unreachable.
describe('computeHeadingState', () => {
    it('returns a complete heading list for normal documents within the default budget', () => {
        const state = createMarkdownState('# One\n\nIntro text\n\n## Two\n\nMore text');

        const result = computeHeadingState(state);

        expect(result.complete).toBe(true);
        expect(result.headings.map((heading) => heading.text)).toEqual(['One', 'Two']);
    });

    it('returns an in-order prefix and complete: false when the budget is exhausted', () => {
        const sectionCount = 20000;
        const content = Array.from(
            { length: sectionCount },
            (_, index) => `## Section ${index}\n\n${'Body text for padding the document. '.repeat(5)}\n`
        ).join('\n');
        const state = createMarkdownState(content);

        const result = computeHeadingState(state, 0);

        expect(result.complete).toBe(false);
        expect(result.headings.length).toBeGreaterThan(0);
        expect(result.headings.length).toBeLessThan(sectionCount);
        result.headings.forEach((heading, index) => {
            expect(heading.text).toBe(`Section ${index}`);
        });
    });
});
