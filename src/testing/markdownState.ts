/**
 * Test-only helpers for building editor states whose syntax tree mirrors production.
 *
 * In production the heading extractor reads the live tree maintained by Joplin's own
 * markdown language configuration, which is not published to npm (`@joplin/editor` is
 * app-internal). Tests use the closest published approximation instead:
 * `markdownLanguage` from @codemirror/lang-markdown, i.e. GFM plus subscript,
 * superscript and emoji extensions. This file is the single place that prod-vs-test
 * grammar divergence lives; keep any grammar tweaks here.
 */

import { EditorState, type Extension } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { extractHeadingsFromTree } from '../headingExtractor';
import type { HeadingItem } from '../types';

/** Generous budget so helper-driven full parses never come back partial in tests. */
const FULL_PARSE_BUDGET_MS = 10_000;

/** Markdown language extension approximating Joplin's editor grammar. */
export function markdownEditorExtension(): Extension {
    return markdown({ base: markdownLanguage });
}

/** Creates a headless editor state carrying the markdown syntax tree. */
export function createMarkdownState(doc: string, extraExtensions: Extension[] = []): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdownEditorExtension(), ...extraExtensions],
    });
}

/**
 * Extracts headings from a markdown string through the production tree-based path.
 * Replaces the removed string-based extractHeadings API for tests.
 */
export function extractHeadingsFromMarkdown(content: string): HeadingItem[] {
    const state = createMarkdownState(content);
    const tree = ensureSyntaxTree(state, state.doc.length, FULL_PARSE_BUDGET_MS);
    if (!tree) {
        throw new Error('Failed to fully parse markdown fixture within the test budget');
    }
    return extractHeadingsFromTree(tree, state.doc);
}
