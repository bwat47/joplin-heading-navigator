/**
 * Test-only helpers for building editor states whose syntax tree mirrors production.
 *
 * In production the heading extractor reads the live tree maintained by Joplin's own
 * markdown language configuration, which is not published to npm (`@joplin/editor` is
 * app-internal). Tests use the closest published approximation instead:
 * `markdownLanguage` from @codemirror/lang-markdown, i.e. GFM plus subscript,
 * superscript and emoji extensions, plus an approximation of Joplin's inline math extension.
 * This file is the single place that prod-vs-test grammar divergence lives; keep any
 * grammar tweaks here.
 */

import { EditorState, type Extension } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { InlineContext, MarkdownConfig } from '@lezer/markdown';
import { extractHeadingsFromTree } from '../contentScripts/headingExtractor';
import type { HeadingItem } from '../types';

/** Generous budget so helper-driven full parses never come back partial in tests. */
const FULL_PARSE_BUDGET_MS = 10_000;

const DOLLAR_SIGN_CHARCODE = 36;
const BACKSLASH_CHARCODE = 92;

/**
 * Joplin marks `$...$` as an `InlineMath` node wrapping an `InlineMathContent` node, and
 * hands the content to a TeX parser. The TeX parse is omitted here: the extractor copies
 * `InlineMath` verbatim from the source, so nothing below that node is ever visited.
 *
 * @see https://github.com/laurent22/joplin/blob/dev/packages/editor/CodeMirror/extensions/markdownMathExtension.ts
 */
const inlineMathConfig: MarkdownConfig = {
    defineNodes: [{ name: 'InlineMath' }, { name: 'InlineMathContent' }],
    parseInline: [
        {
            name: 'InlineMath',
            after: 'InlineCode',
            parse(cx: InlineContext, current: number, pos: number): number {
                const prevCharCode = pos - 1 >= 0 ? cx.char(pos - 1) : -1;
                const nextCharCode = cx.char(pos + 1);
                if (
                    current !== DOLLAR_SIGN_CHARCODE ||
                    prevCharCode === DOLLAR_SIGN_CHARCODE ||
                    nextCharCode === DOLLAR_SIGN_CHARCODE ||
                    /\s/.test(String.fromCharCode(nextCharCode))
                ) {
                    return -1;
                }

                const start = pos;
                const end = cx.end;
                let escaped = false;

                // Scan ahead for the next unescaped '$'
                for (pos++; pos < end && (escaped || cx.char(pos) !== DOLLAR_SIGN_CHARCODE); pos++) {
                    escaped = !escaped && cx.char(pos) === BACKSLASH_CHARCODE;
                }

                // Not math when the region is unterminated or the closing '$' follows a space
                if (pos === end || /\s/.test(String.fromCharCode(cx.char(pos - 1)))) {
                    return -1;
                }

                pos++;
                const content = cx.elt('InlineMathContent', start + 1, pos - 1);
                cx.addElement(cx.elt('InlineMath', start, pos, [content]));

                return pos + 1;
            },
        },
    ],
};

/** Markdown language extension approximating Joplin's editor grammar. */
export function markdownEditorExtension(): Extension {
    return markdown({ base: markdownLanguage, extensions: [inlineMathConfig] });
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
