# ADR-003: Lezer Parser for Heading Extraction

**Status**: Amended (2026-07) — extraction now reads the editor's live syntax tree; see Addendum

## Addendum (2026-07): Migrated to the live CodeMirror syntax tree

The original decision below (standalone `@lezer/markdown` parse of the full document string)
was revisited once profiling showed blocking parses on very large documents. Extraction now
reads the editor's incrementally-maintained tree via `@codemirror/language`:

- `computeHeadingState(state)` calls `ensureSyntaxTree(state, doc.length, 75ms)`. Normal
  documents finish inside the budget, producing a complete heading list in one shot with no
  full-string materialization and no redundant reparse.
- When the budget is exceeded (very large documents), the partial tree's headings render
  immediately and `headingNavigator.ts` drives a completion loop: `forceParsing()` slices
  (100 ms) advance the parser, each resulting update recomputes the list (150 ms debounce)
  until the tree covers the whole document. There is no UI indicator while the list fills in.
- There is deliberately **no fallback** to a standalone string parse. If the tree is empty
  for a non-empty document (markdown language missing), a warning is logged — one code path.
  The completion loop checks CodeMirror's language facet before starting; when no parser is
  installed it stops instead of polling forever. With a parser present, an incomplete
  `forceParsing` slice is retried because internal parse progress may precede a tree update.
- `@codemirror/language` resolves to Joplin's own instance through the content-script
  webpack externals, so the tree read is the same one the editor maintains.

Testing note: Joplin's exact editor grammar (`@joplin/editor`) is not published to npm.
Tests build trees with `markdownLanguage` from `@codemirror/lang-markdown` (GFM + subscript/
superscript/emoji) as a best-effort mirror; `src/testing/markdownState.ts` is the single
place that divergence lives. The original "easier testing" rationale (§3) is retired —
tests now go through headless `EditorState` trees on the production code path.

The original ADR text is preserved below for historical context.

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

- **Permanently open panel with live updates**: In pinned mode (where the panel remains open during edits), the incremental tree may be more efficient.
- **Syntax configuration conflicts**: If Joplin's editor used custom Lezer extensions that affected heading parsing (unlikely for headings)

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

- Full document parse (acceptable with debouncing)
