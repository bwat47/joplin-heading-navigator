# ADR-001: Custom DOM Panel vs CodeMirror Panel/Gutter APIs

**Status**: Accepted

## Context

The heading navigator needs a floating UI overlay to display a filterable list of headings. CodeMirror 6 provides several built-in APIs for UI overlays:

- **Panel API** (`showPanel` facet): Docks panels to editor edges (top/bottom)
- **Gutter API**: Adds content in the left margin alongside line numbers
- **Tooltip API**: Positions content relative to document positions

## Decision

Use a custom HTML `<div>` manually injected into the editor's DOM (`view.scrollDOM.parentElement`) instead of CodeMirror's built-in panel APIs.

## Rationale

### 1. Positioning Requirements

The heading navigator requires **absolute positioning in the top-right corner** of the editor viewport. CodeMirror's Panel API only supports **docked positioning** (top or bottom edge, full width). There is no built-in support for floating overlays in arbitrary positions.

### 2. Mobile Layout Switching

On mobile, the panel switches to `position: fixed` with centered viewport positioning to act as a modal. CodeMirror panels don't support dynamic layout mode switching between docked and fixed positioning.

### 3. Z-Index Control

The panel needs `z-index: 2000` to float above CodeMirror's content layers (selections, cursors, decorations). CodeMirror panels participate in the editor's layout flow and don't provide direct z-index control for overlay behavior.

### 4. View Isolation

By appending to `view.scrollDOM.parentElement`, the panel stays strictly associated with its editor instance.

### 5. Lifecycle Simplicity

Manual DOM management provides explicit control over creation/destruction timing. The panel is created on command invocation and destroyed on close, avoiding the complexity of facet-based conditional rendering.

## Alternatives Considered

### CodeMirror Panel API

- **Rejected**: Only supports top/bottom docking, not floating overlay positioning

### CodeMirror Tooltip API

- **Rejected**: Designed for document-position-relative tooltips, not viewport-fixed UI

### React Portal / Framework Integration

- **Rejected**: Adds framework dependency for a single floating element; plugin uses vanilla DOM

## Consequences

### Positive

- Full control over positioning, z-index, and layout mode
- Clean mobile/desktop layout switching
- Proper split view isolation

### Negative

- Manual DOM lifecycle management required
- Must handle style injection separately (`<style>` block in document head)
- No automatic integration with CodeMirror's focus/blur handling
