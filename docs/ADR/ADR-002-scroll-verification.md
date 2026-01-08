# ADR-002: Two-Phase Scroll Verification

**Status**: Accepted

## Context

When navigating to a heading, the plugin scrolls the target heading to the viewport top using `EditorView.scrollIntoView`. However, the heading frequently drifts out of view 50-300ms after the initial scroll due to:

- **Image loading**: Rich markdown images load asynchronously, expanding content above the target
- **Syntax highlighting**: Code block highlighting applied after initial render
- **Widget rebuilds**: CodeMirror decorations rebuilt on selection change
- **Late asset loading**: External content that loads after layout

A single `scrollIntoView` call is insufficient to keep the heading visible.

## Decision

Implement a two-phase verification system that re-checks scroll position after delays and applies corrective scrolls if needed.

```
Initial Scroll → Wait 160ms → Verify → (if drift detected) Scroll + Wait 260ms → Verify
```

## Rationale

### 1. Async Layout Shifts Are Unpredictable

Layout shifts occur at varying times depending on content type and editor state. A fixed delay before scrolling would either:

- Be too short (shifts still occur after scroll)
- Be too long (noticeable lag before navigation)

Verification after scroll handles shifts regardless of timing.

### 2. Two Attempts Cover Common Cases

Trial and error testing showed:

- First verification (160ms) catches ~90% of shifts (image placeholders, fast syntax highlighting)
- Second verification (260ms) catches remaining late shifts

Additional attempts showed diminishing returns and risked scroll jitter.

### 3. Tolerance Thresholds Prevent Jitter

Asymmetric tolerances prevent unnecessary corrections:

- **12px below viewport top**: Acceptable minor drift
- **1.5px above viewport top**: Stricter tolerance for upward drift

This prevents micro-corrections while ensuring meaningful drift is fixed.

### 4. User Intent Detection

Verification aborts if the user moves the cursor during the delay window. This prevents overriding intentional navigation and avoids jarring scroll corrections.

### 5. CodeMirror Integration

Uses `requestMeasure` for safe DOM access during CodeMirror's update cycle:

- Read phase: Measure heading position relative to viewport
- Write phase: Apply corrective scroll if needed

This avoids layout thrash and "update in progress" errors.

## Alternatives Considered

### MutationObserver on content changes

- **Rejected**: High overhead monitoring all DOM changes; difficult to determine when shifts are "done"

### Single fixed delay before scroll

- **Rejected**: Either too slow (poor UX) or too fast (misses late shifts)

### requestAnimationFrame loop

- **Rejected**: Unnecessary polling; timer-based verification is more efficient

## Consequences

### Positive

- Headings reliably stay at viewport top after navigation
- Handles unpredictable async content loading
- Aborts gracefully on user interaction

### Negative

- Adds complexity vs single `scrollIntoView` call
- Timeout management required per editor instance
- Slight delay before heading position is "locked"
