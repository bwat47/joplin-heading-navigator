/**
 * @jest-environment jsdom
 */

import { fuzzyFilter, highlightMatch } from './fuzzyFilter';
import type { HeadingItem } from '../../types';

function createHeading(text: string, id: string): HeadingItem {
    return {
        id,
        text,
        level: 1,
        from: 0,
        to: text.length,
        line: 0,
        anchor: text.toLowerCase().replace(/\s+/g, '-'),
    };
}

describe('fuzzyFilter', () => {
    const headings: HeadingItem[] = [
        createHeading('Introduction', 'h1'),
        createHeading('Getting Started', 'h2'),
        createHeading('API Reference', 'h3'),
        createHeading('Configuration', 'h4'),
        createHeading('Troubleshooting Guide', 'h5'),
    ];

    it('returns all headings when query is empty', () => {
        expect(fuzzyFilter('', headings)).toEqual(headings);
        expect(fuzzyFilter('   ', headings)).toEqual(headings);
    });

    it('filters headings by fuzzy match', () => {
        const results = fuzzyFilter('api', headings);
        expect(results).toHaveLength(1);
        expect(results[0].text).toBe('API Reference');
    });

    it('ranks word-start matches higher', () => {
        const results = fuzzyFilter('con', headings);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toBe('Configuration');
    });

    it('matches acronyms and sequential characters', () => {
        const results = fuzzyFilter('gs', headings);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toBe('Getting Started');
    });

    it('returns empty array when no matches', () => {
        const results = fuzzyFilter('xyz123', headings);
        expect(results).toEqual([]);
    });

    it('handles case-insensitive matching', () => {
        const results = fuzzyFilter('INTRO', headings);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toBe('Introduction');
    });

    it('does not mutate original array', () => {
        const original = [...headings];
        fuzzyFilter('api', headings);
        expect(headings).toEqual(original);
    });
});

describe('highlightMatch', () => {
    it('returns plain text when query is empty', () => {
        const fragment = highlightMatch('Hello World', '');
        expect(fragment.childNodes).toHaveLength(1);
        expect(fragment.textContent).toBe('Hello World');
        expect(fragment.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it('wraps matched characters in bold tags', () => {
        const fragment = highlightMatch('Hello', 'hel');
        const html = fragmentToHtml(fragment);
        expect(html).toBe('<b>Hel</b>lo');
    });

    it('handles non-consecutive matches', () => {
        const fragment = highlightMatch('Configuration', 'cfg');
        const text = fragment.textContent;
        expect(text).toBe('Configuration');
        // Should have bold elements for matched chars
        const boldElements = Array.from(fragment.childNodes).filter((node) => node.nodeName === 'B');
        expect(boldElements.length).toBeGreaterThan(0);
    });

    it('returns plain text when no match found', () => {
        const fragment = highlightMatch('Hello', 'xyz');
        expect(fragment.childNodes).toHaveLength(1);
        expect(fragment.textContent).toBe('Hello');
        expect(fragment.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it('handles special characters in text', () => {
        const fragment = highlightMatch('Hello & World', 'hel');
        expect(fragment.textContent).toBe('Hello & World');
    });

    it('preserves full text content regardless of matches', () => {
        const text = 'API Reference Guide';
        const fragment = highlightMatch(text, 'api');
        expect(fragment.textContent).toBe(text);
    });
});

function fragmentToHtml(fragment: DocumentFragment): string {
    const div = document.createElement('div');
    div.appendChild(fragment.cloneNode(true));
    return div.innerHTML;
}
