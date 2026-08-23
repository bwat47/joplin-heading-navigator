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

The measurement takes the effective viewport top as `Math.max(0, scrollDOM.getBoundingClientRect().top)`
rather than the scroller rectangle alone. Desktop constrains the editor height, so CodeMirror's scroller
clips vertically and its rectangle top is the visible edge. Joplin mobile never sets that height: the
scroller grows to the document height and the WebView page scrolls instead, making the rectangle top a
document offset far above the viewport. Left unclamped it reported ~1900px of phantom drift and forced a
correction on every mobile navigation.

Clamping at zero also matches the baseline the corrector uses. CodeMirror's `scrollRectIntoView` walks past
the non-clipping scroller up to the document, where `windowRect` reports a top of zero. Measuring against a
different edge than the corrector aligns to reports drift that cannot be removed, which is the same failure
in a different disguise; that rules out `visualViewport.offsetTop`, which diverges from zero under
pinch-zoom.

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
