/**
 * Markdown heading extraction from a Lezer syntax tree.
 *
 * Reads ATX (`# Heading`) and Setext (underlined) headings from the editor's live
 * syntax tree, strips inline formatting (bold, italic, links, code), and generates
 * stable IDs and GitHub-compatible anchor slugs.
 *
 * Implementation details:
 * - Consumes the incrementally-maintained tree from @codemirror/language instead of
 *   re-parsing the document, with a bounded ensureSyntaxTree pass for completeness
 * - Stable IDs based on byte position (`heading-{from}`)
 * - Anchor deduplication (e.g., "intro" → "intro-2" → "intro-3")
 * - CodeMirror Text class for position → line number conversion and slicing
 * - Preserves snake_case in headings (doesn't break on underscores)
 *
 * @see extractInlineText - Recursive tree walker for extracting clean text
 */

import { EditorState, Text } from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { SyntaxNode, Tree } from '@lezer/common';
import logger from './logger';
import { HeadingItem } from './types';
import uslug from '@joplin/fork-uslug';

const UNSUPPORTED_INLINE_FORMATTING_PATTERN = /(==|\+\+)(?=\S)([\s\S]*?\S)\1/g;

/**
 * Time budget for the synchronous ensureSyntaxTree pass in computeHeadingState.
 * Covers multi-megabyte documents in one shot (@lezer/markdown parses roughly
 * 1 MB in under 100 ms); exceeded only by pathological documents, which then
 * fall back to the partial tree. Parse progress persists in CodeMirror's parse
 * context, so the budget is effectively a one-time cost per document.
 */
const HEADING_PARSE_BUDGET_MS = 250;

export interface HeadingComputation {
    headings: HeadingItem[];
    /** False when the syntax tree did not yet cover the whole document. */
    complete: boolean;
}

function parseHeadingLevel(nodeName: string): number | null {
    if (nodeName.startsWith('ATXHeading')) {
        const level = Number(nodeName.replace('ATXHeading', ''));
        return Number.isNaN(level) ? null : level;
    }

    if (nodeName.startsWith('SetextHeading')) {
        const level = Number(nodeName.replace('SetextHeading', ''));
        if (level === 1 || level === 2) {
            return level;
        }
    }

    return null;
}

/**
 * Extracts readable inline text from a Lezer node.
 * - Recursively collects Text + CodeText
 * - Skips syntax marks and heading markers
 * - Handles "gaps" (ranges not covered by any child nodes)
 * - Processes escape sequences and HTML tags
 *
 * @param node - Lezer syntax node (heading or inline element)
 * @param doc - Source markdown document
 * @returns Cleaned text content without markdown formatting
 *
 * @example
 * ```typescript
 * // For heading: "## **bold** and `code`"
 * // Returns: "bold and code"
 * ```
 */
function extractInlineText(node: SyntaxNode, doc: Text): string {
    let out = '';
    const cursor = node.cursor();

    if (!cursor.firstChild()) {
        // Leaf node case — include only text-bearing nodes
        if (cursor.name === 'Text' || cursor.name === 'CodeText' || cursor.name === 'Emoji') {
            return doc.sliceString(cursor.from, cursor.to);
        }
        return '';
    }

    // Start from node beginning to capture Setext heading text before underlines.
    // ATX HeaderMark (#) is always first child at node.from, so no gap is detected before it.
    let lastPos = node.from;

    do {
        const name = cursor.name;
        const from = cursor.from;
        const to = cursor.to;

        // --- Handle gaps (plain unformatted text between inline elements) ---
        if (from > lastPos) {
            out += doc.sliceString(lastPos, from);
        }

        // A URL node is a hidden link destination only inside a Link/Image
        // (e.g. [text](url) / ![alt](url)). An autolink target (<https://...>)
        // is visible heading text, so it must be kept (matches Joplin's heading IDs).
        const parentName = cursor.node.parent?.name;
        const isLinkDestination = name === 'URL' && (parentName === 'Link' || parentName === 'Image');

        // --- Skip non-content tokens ---
        if (
            name.endsWith('Mark') || // EmphasisMark, StrongMark, CodeMark, LinkMark, ImageMark...
            name === 'HeaderMark' || // ATX heading # symbols and Setext underlines
            name === 'Image' || // Skip images entirely (no alt text extraction)
            name === 'LinkLabel' ||
            name === 'LinkTitle' ||
            isLinkDestination
        ) {
            lastPos = to;
            continue;
        }

        // --- Handle escaped characters (e.g., \* → *) ---
        if (name === 'Escape') {
            // Escape node contains both backslash and character, extract just the character
            out += doc.sliceString(from + 1, to);
            lastPos = to;
            continue;
        }

        // --- Skip HTML tags (matches behavior of Obsidian and other apps) ---
        if (name === 'HTMLTag') {
            lastPos = to;
            continue;
        }

        // --- Leaf text (incl. visible autolink targets, which reach here as URL, and
        // emoji shortcodes like :fire:, which stay visible text for anchor stability) ---
        if (name === 'Text' || name === 'CodeText' || name === 'URL' || name === 'Emoji') {
            out += doc.sliceString(from, to);
            lastPos = to;
            continue;
        }

        // --- Recurse into inline containers (Emphasis, Link, InlineCode, etc.) ---
        out += extractInlineText(cursor.node, doc);
        lastPos = to;
    } while (cursor.nextSibling());

    // Include any trailing gap. Whitespace is normalized by trim() in normalizeHeadingText.
    if (lastPos < node.to) {
        out += doc.sliceString(lastPos, node.to);
    }

    return out;
}

/**
 * Strips inline formatting that Joplin supports but the markdown grammar may not parse.
 *
 * Examples:
 * - "==highlight==" -> "highlight"
 * - "++insert++" -> "insert"
 */
function stripUnsupportedInlineFormatting(text: string): string {
    return text.replace(UNSUPPORTED_INLINE_FORMATTING_PATTERN, '$2');
}

/**
 * Normalizes heading text using Lezer AST to extract clean text.
 *
 * @param node - Lezer heading node (ATXHeading or SetextHeading)
 * @param doc - Source markdown document
 * @returns Cleaned heading text without markdown formatting
 */
function normalizeHeadingText(node: SyntaxNode, doc: Text): string {
    return stripUnsupportedInlineFormatting(extractInlineText(node, doc)).replace(/\s+/g, ' ').trim();
}

function createUniqueAnchor(text: string, fallback: string, counts: Map<string, number>): string {
    const anchorBase = (typeof text === 'string' ? uslug(text) : '') || fallback;
    const previousCount = counts.get(anchorBase);
    if (previousCount === undefined) {
        counts.set(anchorBase, 1);
        return anchorBase;
    }
    counts.set(anchorBase, previousCount + 1);
    return `${anchorBase}-${previousCount + 1}`;
}

/**
 * Extracts all headings from a markdown syntax tree with normalized text and metadata.
 *
 * @param tree - Lezer tree covering (a prefix of) the document
 * @param doc - Document the tree was parsed from
 * @returns Array of headings in document order, or empty array if extraction fails
 */
export function extractHeadingsFromTree(tree: Tree, doc: Text): HeadingItem[] {
    try {
        const headings: HeadingItem[] = [];
        const anchorCounts = new Map<string, number>();

        tree.iterate({
            enter(node) {
                const level = parseHeadingLevel(node.type.name);
                if (level === null) {
                    return;
                }

                const from = node.from;
                const to = node.to;
                const text = normalizeHeadingText(node.node, doc);

                if (!text) {
                    return;
                }

                const anchor = createUniqueAnchor(text, `heading-${from}`, anchorCounts);

                headings.push({
                    id: `heading-${from}`,
                    text,
                    level,
                    from,
                    to,
                    line: doc.lineAt(from).number - 1,
                    anchor,
                });
            },
        });

        return headings;
    } catch (error) {
        logger.error('Failed to extract headings', error);
        return [];
    }
}

/**
 * Computes the heading list from the editor's live syntax tree.
 *
 * Attempts to parse the full document within a bounded synchronous budget so normal
 * documents always produce a complete list in one shot. When the budget is exceeded
 * (pathologically large documents), returns whatever prefix of the document the tree
 * covers and reports `complete: false` so the caller can refresh when scrolling or
 * background parsing later extends the tree.
 *
 * @param state - Editor state carrying the markdown language's syntax tree
 * @param budgetMs - Synchronous parse budget for ensureSyntaxTree
 */
export function computeHeadingState(
    state: EditorState,
    budgetMs: number = HEADING_PARSE_BUDGET_MS
): HeadingComputation {
    const full = ensureSyntaxTree(state, state.doc.length, budgetMs);
    const tree = full ?? syntaxTree(state);

    if (tree.length === 0 && state.doc.length > 0) {
        logger.warn('Syntax tree is empty for a non-empty document; is the markdown language extension missing?');
    }

    return {
        headings: extractHeadingsFromTree(tree, state.doc),
        complete: full !== null || tree.length >= state.doc.length,
    };
}
