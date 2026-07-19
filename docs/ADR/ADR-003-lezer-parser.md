# ADR-003: Lezer Parser for Heading Extraction

**Status**: Accepted

## Context

The heading navigator needs to extract headings from markdown documents. As a content script running inside CodeMirror, two parsing approaches are available:

1. **Direct Lezer parsing**: Import `@lezer/markdown` and parse the document text directly
2. **CodeMirror syntax tree**: Access the editor's live `syntaxTree(state)` which is maintained incrementally

## Decision

Use direct `@lezer/markdown` parsing instead of CodeMirror's syntax tree API.

## Rationale

### 1. Bounded Parsing Frequency

The document is parsed:

- Synchronously when the panel first opens
- 150 ms after document changes stop while the panel remains open

Pinned desktop panels can remain open during continuous editing, debouncing prevents a full parse on every transaction and keeps the implementation synchronous and complete.

Direct parsing remains acceptable for now, but large-document typing performance should be monitored. If profiling shows noticeable latency, extraction should move to CodeMirror's incremental syntax tree.

### 2. Avoids Syntax Tree Complexity

CodeMirror's syntax tree has async considerations:

- Tree may be incomplete if parsing hasn't finished (`ensureSyntaxTree` with timeout)
- Need to handle partial tree states gracefully
- Parser scheduling depends on editor activity

Direct Lezer parsing is synchronous and always returns a complete tree.

### 3. Easier Testing

Direct parsing from document text enables simple unit tests:

```typescript
const headings = extractHeadings('# Test\n## Section');
expect(headings).toHaveLength(2);
```

No CodeMirror editor state mocking required.

### 4. AST-Based Clean Text Extraction

Lezer provides a syntax tree with typed nodes (`Emphasis`, `Strong`, `Link`, `HeaderMark`, etc.). This enables precise text extraction:

```typescript
// Skip formatting marks, keep content
if (node.type.name === 'EmphasisMark') return false;
if (node.type.name === 'HeaderMark') return false;
```

### 5. Code Block Exclusion

Lezer's tree structure naturally excludes headings inside fenced code blocks. The `# comment` line below is inside a `FencedCode` node, not parsed as a heading:

    # Real Heading

    ```python
    # This is a comment, not a heading
    ```

## When CodeMirror Syntax Tree Would Be Better

- **Permanently open panel with live updates**: If the panel stayed open during typing and updated continuously, the incremental tree would be more efficient
- **Syntax configuration conflicts**: If Joplin's editor used custom Lezer extensions that affected heading parsing (unlikely for headings)

Neither applies to this plugin's design.

## Alternatives Considered

### Regex patterns

- **Rejected**: Cannot reliably handle:
    - Nested inline formatting
    - Setext headings with varying underline lengths
    - Code block exclusion

### markdown-it parser

- **Rejected**:
    - Adds dependency
    - Returns HTML-focused AST, not byte offsets
    - May interpret syntax differently than the editor

## Consequences

### Positive

- Synchronous, complete parsing
- Simple testing without editor mocking
- No timeout/scheduling complexity
- Byte-accurate offsets for cursor positioning

### Negative

- Full document parse (acceptable given infrequent parsing)
- Must import Lezer separately (already bundled with Joplin)
