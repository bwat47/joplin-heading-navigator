# ADR-002: One-Pass Scroll Stabilization

**Status**: Accepted, supersedes the previous two-phase scroll verification decision

## Context

When navigating to a heading, the plugin scrolls the target heading to the viewport top using
`EditorView.scrollIntoView`. A single immediate call can still land incorrectly because Rich Markdown widgets,
images, syntax highlighting, and other editor decorations may change layout shortly after selection changes.

The previous solution used a two-phase verification system with retry timing, manual `scrollTop` correction,
and measurement failure retries. It worked, but the implementation was more complex than the behavior needed.

## Decision

Use a single delayed stabilization pass:

```
Initial Scroll -> Wait 160ms -> Measure -> Correct once if needed
```

The content script keeps the initial `EditorView.scrollIntoView(selection, { y: 'start' })`. After 160ms it
uses `requestMeasure` to read the target heading position and dispatches one more CodeMirror `scrollIntoView`
only when the heading drift exceeds the tolerance.

No code assigns `scrollDOM.scrollTop` directly, and no recursive retry is scheduled.

## Rationale

### 1. Preserve the Important Guard

The delayed pass still handles the common case where the target moves after the initial scroll because editor
widgets or rich content settle late.

### 2. Prefer CodeMirror-Native Correction

Letting CodeMirror handle corrective scrolling avoids fighting its internal height map and viewport measurement
logic.

### 3. Reduce Complexity

One pass removes retry state, second-delay constants, manual scroll forcing, and measurement-failure recursion.
The behavior is easier to reason about during rapid preview navigation.

### 4. Preserve User Intent

Stabilization aborts when the selection no longer matches the target, including immediately before deferred
corrective dispatch. This prevents stale preview scrolls from overriding later user navigation.

## Consequences

### Positive

- Simpler heading navigation code
- No direct `scrollTop` mutation
- Fewer delayed callbacks during rapid panel navigation
- Still guards against common async layout shifts

### Negative

- Very late shifts after the single pass may still move the heading
- Manual Joplin testing remains important because layout shifts depend on editor widgets and loaded assets
