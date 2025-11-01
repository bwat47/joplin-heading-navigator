import { parser } from '@lezer/markdown';
import logger from './logger';
import { HeadingItem } from './types';

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

function stripInlineMarkdown(text: string): string {
    return (
        text
            // Inline images: keep alt text if present.
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // Inline and reference links: keep link label only.
            .replace(/\[([^\]]*?)\]\s*(\([^)]+\)|\[[^\]]*\])/g, '$1')
            // Bold/italic markers.
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            // Inline code.
            .replace(/`([^`]+)`/g, '$1')
            // Escaped characters.
            .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
            // Collapse repeated whitespace.
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function normalizeHeadingText(nodeName: string, raw: string): string {
    if (nodeName.startsWith('ATXHeading')) {
        return stripInlineMarkdown(
            raw
                .replace(/^#{1,6}[ \t]*/, '')
                .replace(/[ \t]*#{0,}\s*$/, '')
                .trim()
        );
    }

    if (nodeName.startsWith('SetextHeading')) {
        const lines = raw.split('\n');
        return stripInlineMarkdown(lines[0]?.trim() ?? '');
    }

    return stripInlineMarkdown(raw.trim());
}

function createLineResolver(content: string): (position: number) => number {
    const lineStartIndices: number[] = [0];

    for (let index = 0; index < content.length; index += 1) {
        if (content[index] === '\n') {
            lineStartIndices.push(index + 1);
        }
    }

    return (position: number): number => {
        let low = 0;
        let high = lineStartIndices.length - 1;
        let result = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (lineStartIndices[mid] <= position) {
                result = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return result;
    };
}

export function extractHeadings(content: string): HeadingItem[] {
    try {
        const tree = parser.parse(content);
        const headings: HeadingItem[] = [];
        const resolveLineNumber = createLineResolver(content);

        tree.iterate({
            enter(node) {
                const level = parseHeadingLevel(node.type.name);
                if (level === null) {
                    return;
                }

                const from = node.from;
                const to = node.to;
                const text = normalizeHeadingText(node.type.name, content.slice(from, to));

                if (!text) {
                    return;
                }

                headings.push({
                    id: `heading-${from}`,
                    text,
                    level,
                    from,
                    to,
                    line: resolveLineNumber(from),
                });
            },
        });

        return headings;
    } catch (error) {
        logger.error('Failed to extract headings', error);
        return [];
    }
}
