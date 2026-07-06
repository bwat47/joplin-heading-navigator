/**
 * Utilities for formatting Joplin note links to headings.
 *
 * Creates markdown links to headings in either Joplin note-link format
 * or local anchor-link format.
 * Used by the copy-to-clipboard feature to generate shareable heading links.
 *
 * @example
 * ```typescript
 * formatExternalHeadingLink('Introduction', 'My Note', 'abc123', 'introduction')
 * // Returns: "[Introduction @ My Note](:/abc123#introduction)"
 *
 * formatInternalHeadingLink('Introduction', 'introduction')
 * // Returns: "[Introduction](#introduction)"
 * ```
 */

// Backslashes, brackets: Required by Markdown syntax
// HTML chars (<, >, &): Prevents Joplin from rendering HTML tags in link text
export function escapeLinkText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/&/g, '\\&')
        .replace(/</g, '\\<')
        .replace(/>/g, '\\>')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}

export function formatExternalHeadingLink(
    headingText: string,
    noteTitle: string,
    noteId: string,
    headingAnchor: string
): string {
    const label = `${escapeLinkText(headingText)} @ ${escapeLinkText(noteTitle)}`;
    const target = `:/${noteId}#${headingAnchor}`;
    return `[${label}](${target})`;
}

export function formatInternalHeadingLink(headingText: string, headingAnchor: string): string {
    const label = escapeLinkText(headingText);
    return `[${label}](#${headingAnchor})`;
}
