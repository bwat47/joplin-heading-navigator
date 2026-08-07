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
import logger from '../logger';
import { HeadingItem } from '../types';
import uslug from '@joplin/fork-uslug';

const UNSUPPORTED_INLINE_FORMATTING_PATTERN = /(==|\+\+)(?=\S)([\s\S]*?\S)\1/g;

/**
 * Nodes whose source text is copied verbatim instead of being walked.
 *
 * Joplin's editor grammar wraps `$...$` math in an `InlineMath` node whose content is
 * re-parsed by a TeX parser, so walking it drops every token that parser recognises
 * (`# Maxwell $E=mc^2$` came out as `Maxwell $=$`). Joplin's own in-editor heading links
 * slug the raw heading source, so keeping the formula and its `$` delimiters verbatim is
 * also what produces the anchor Joplin's ctrl+click navigation looks for
 * (`maxwell-emc2`).
 *
 * `BlockMath` cannot start on a heading line, but is listed for the same reason.
 */
const VERBATIM_NODE_NAMES = new Set(['InlineMath', 'BlockMath']);

/**
 * Nodes that carry no readable heading text.
 * `*Mark` nodes (EmphasisMark, StrongMark, CodeMark, LinkMark, ImageMark, HeaderMark...) are
 * matched by suffix instead of being listed here.
 */
const SKIPPED_NODE_NAMES = new Set([
    'Image', // Skip images entirely (no alt text extraction)
    'LinkLabel',
    'LinkTitle',
    'HTMLTag', // Skip HTML tags (matches behavior of Obsidian and other apps)
]);

/**
 * Leaf nodes whose source text is heading content. `URL` is included because an autolink
 * target (`<https://...>`) is visible heading text; link destinations are filtered out
 * earlier by {@link isSkippedNode}. `Emoji` covers shortcodes like `:fire:`, which stay
 * visible text for anchor stability.
 */
const TEXT_NODE_NAMES = new Set(['Text', 'CodeText', 'URL', 'Emoji']);

/** Leaf nodes that are heading content when {@link extractInlineText} is called on them directly. */
const LEAF_TEXT_NODE_NAMES = new Set(['Text', 'CodeText', 'Emoji']);

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
 * Reports whether a node contributes no readable heading text.
 *
 * Covers syntax marks (`*Mark`, incl. the `HeaderMark` for ATX `#` symbols and Setext
 * underlines), the nodes in {@link SKIPPED_NODE_NAMES}, and hidden link destinations.
 * A URL node is a hidden destination only inside a Link/Image (e.g. `[text](url)` /
 * `![alt](url)`); an autolink target (`<https://...>`) is visible heading text, so it must
 * be kept (matches Joplin's heading IDs).
 */
function isSkippedNode(node: SyntaxNode, name: string): boolean {
    if (name.endsWith('Mark') || SKIPPED_NODE_NAMES.has(name)) {
        return true;
    }

    const parentName = node.parent?.name;
    return name === 'URL' && (parentName === 'Link' || parentName === 'Image');
}

/**
 * Extracts the heading text contributed by a single child node.
 *
 * @param node - Child of the node being walked by {@link extractInlineText}
 * @param doc - Source markdown document
 * @returns Text to append, or '' for nodes that carry no heading text
 */
function extractChildText(node: SyntaxNode, doc: Text): string {
    const name = node.name;

    // --- Keep math regions exactly as written (see VERBATIM_NODE_NAMES) ---
    if (VERBATIM_NODE_NAMES.has(name)) {
        return doc.sliceString(node.from, node.to);
    }

    if (isSkippedNode(node, name)) {
        return '';
    }

    // --- Handle escaped characters (e.g., \* → *) ---
    // Escape node contains both backslash and character, extract just the character
    if (name === 'Escape') {
        return doc.sliceString(node.from + 1, node.to);
    }

    if (TEXT_NODE_NAMES.has(name)) {
        return doc.sliceString(node.from, node.to);
    }

    // --- Recurse into inline containers (Emphasis, Link, InlineCode, etc.) ---
    return extractInlineText(node, doc);
}

/**
 * Extracts readable inline text from a Lezer node.
 * - Recursively collects Text + CodeText
 * - Skips syntax marks and heading markers
 * - Handles "gaps" (ranges not covered by any child nodes)
 * - Processes escape sequences and HTML tags
 * - Copies math regions verbatim
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
        return LEAF_TEXT_NODE_NAMES.has(cursor.name) ? doc.sliceString(cursor.from, cursor.to) : '';
    }

    // Start from node beginning to capture Setext heading text before underlines.
    // ATX HeaderMark (#) is always first child at node.from, so no gap is detected before it.
    let lastPos = node.from;

    do {
        // --- Handle gaps (plain unformatted text between inline elements) ---
        if (cursor.from > lastPos) {
            out += doc.sliceString(lastPos, cursor.from);
        }

        out += extractChildText(cursor.node, doc);
        lastPos = cursor.to;
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
