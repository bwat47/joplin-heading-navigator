/**
 * Fuzzy search filtering and highlighting for headings.
 *
 * Uses fuzzysort for Sublime Text-like fuzzy matching with:
 * - Word-start and acronym prioritization
 * - Sequential character matching
 * - Relevance-based ranking
 */

import fuzzysort from 'fuzzysort';
import type { HeadingItem } from '../../types';

const FUZZY_THRESHOLD = -10000;
const FUZZY_LIMIT = 100;

/**
 * Filters and ranks headings by fuzzy match score.
 *
 * When query is empty, returns headings in original order.
 * When query is provided, returns headings ranked by match relevance.
 *
 * @param query - Search query string
 * @param headings - Array of headings to filter
 * @returns Filtered and ranked headings
 */
export function fuzzyFilter(query: string, headings: HeadingItem[]): HeadingItem[] {
    const normalized = query.trim();

    if (!normalized) {
        return [...headings];
    }

    const results = fuzzysort.go(normalized, headings, {
        key: 'text',
        limit: FUZZY_LIMIT,
        threshold: FUZZY_THRESHOLD,
    });

    return results.map((result) => result.obj);
}

/**
 * Creates a DocumentFragment with highlighted match characters.
 *
 * Uses DOM manipulation instead of innerHTML for security.
 * Matched characters are wrapped in <b> elements.
 *
 * @param text - The heading text to highlight
 * @param query - The search query that produced the match
 * @returns DocumentFragment with highlighted text, or plain text if no match
 */
export function highlightMatch(text: string, query: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const normalized = query.trim();

    if (!normalized) {
        fragment.appendChild(document.createTextNode(text));
        return fragment;
    }

    const result = fuzzysort.single(normalized, text);

    if (!result || !result.indexes || result.indexes.length === 0) {
        fragment.appendChild(document.createTextNode(text));
        return fragment;
    }

    const matchIndexes = new Set(result.indexes);
    let i = 0;

    while (i < text.length) {
        if (matchIndexes.has(i)) {
            // Collect consecutive matched characters
            const bold = document.createElement('b');
            let matchedChars = '';
            while (i < text.length && matchIndexes.has(i)) {
                matchedChars += text[i];
                i++;
            }
            bold.textContent = matchedChars;
            fragment.appendChild(bold);
        } else {
            // Collect consecutive non-matched characters
            let normalChars = '';
            while (i < text.length && !matchIndexes.has(i)) {
                normalChars += text[i];
                i++;
            }
            fragment.appendChild(document.createTextNode(normalChars));
        }
    }

    return fragment;
}
