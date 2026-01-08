# Heading Parsing

`src/headingExtractor.ts` - Lezer Markdown parser integration.

## Parser Usage

```typescript
import { parser } from '@lezer/markdown';

const tree = parser.parse(content);
tree.iterate({
    enter(node) {
        const level = parseHeadingLevel(node.type.name);
        // Process ATXHeading1-6 and SetextHeading1-2 nodes
    },
});
```

## Heading Types

| Syntax            | Node Type      | Level |
| ----------------- | -------------- | ----- |
| `# Heading`       | ATXHeading1    | 1     |
| `## Heading`      | ATXHeading2    | 2     |
| `Heading` + `===` | SetextHeading1 | 1     |
| `Heading` + `---` | SetextHeading2 | 2     |

## Text Extraction

`extractInlineText()` walks AST recursively:

| Element                  | Handling                       |
| ------------------------ | ------------------------------ |
| Text/CodeText            | Included verbatim              |
| EmphasisMark, StrongMark | Skipped (marks only)           |
| HeaderMark               | Skipped                        |
| Escape nodes             | Backslash removed (`\*` → `*`) |
| HTMLTag                  | Skipped                        |
| Links                    | URL skipped, text included     |
| Images                   | Skipped entirely               |

Gap handling captures text between inline elements:

```typescript
if (from > lastPos) {
    out += doc.slice(lastPos, from);
}
```

## HeadingItem Structure

```typescript
interface HeadingItem {
    id: string; // "heading-{from}"
    text: string; // Clean text without markdown
    level: number; // 1-6
    from: number; // Byte offset (start)
    to: number; // Byte offset (end)
    line: number; // 0-indexed line number
    anchor: string; // GitHub-compatible slug
}
```

## Anchor Generation

Uses `@joplin/fork-uslug`:

```typescript
const anchor = uslug(headingText); // "My Heading" -> "my-heading"
```

Duplicate anchors suffixed: `introduction`, `introduction-2`, `introduction-3`

## Line Number Conversion

```typescript
import { Text } from '@codemirror/state';

const doc = Text.of(content.split('\n'));
const lineNumber = doc.lineAt(byteOffset).number - 1; // 0-indexed
```

## Error Handling

```typescript
try {
    const tree = parser.parse(content);
    // ...
} catch (error) {
    logger.error('Failed to extract headings', error);
    return [];
}
```

## Example

Input:

```markdown
# Introduction

## **Bold** Section

## Bold Section
```

Output:

```javascript
[
    { id: 'heading-0', text: 'Introduction', level: 1, anchor: 'introduction', line: 0 },
    { id: 'heading-16', text: 'Bold Section', level: 2, anchor: 'bold-section', line: 1 },
    { id: 'heading-37', text: 'Bold Section', level: 2, anchor: 'bold-section-2', line: 2 },
];
```
