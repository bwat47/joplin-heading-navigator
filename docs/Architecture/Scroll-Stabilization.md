# Scroll Stabilization

Compensates for common layout shifts caused by async content loading after heading navigation.

## Problem

After `scrollIntoView`, a heading can drift due to:

- Rich Markdown image loading
- Async syntax highlighting
- Widget rebuilds on selection change
- Late asset loading

A single immediate `scrollIntoView` can land before CodeMirror has fully measured content near the target.

## Solution: One-Pass Stabilization

```
Initial Scroll -> Wait 160ms -> Measure -> Correct once if needed
```

The content script first moves the selection and dispatches `EditorView.scrollIntoView(selection, { y: 'start' })`.
It then schedules one delayed `requestMeasure` pass. If the heading is meaningfully above or below the viewport
top, it asks CodeMirror to scroll the selection to the start again.

## Timing Constants

| Constant                                 | Value | Purpose                         |
| ---------------------------------------- | ----- | ------------------------------- |
| `SCROLL_STABILIZE_DELAY_MS`              | 160ms | Delayed stabilization pass      |
| `SCROLL_STABILIZE_TOLERANCE_PX`          | 12px  | Max drift below viewport top    |
| `SCROLL_STABILIZE_NEGATIVE_TOLERANCE_PX` | 1.5px | Max drift above viewport top    |

## Implementation

### Measurement

```typescript
view.requestMeasure({
    read(measureView) {
        const selection = measureView.state.selection.main;
        const scrollDOM = measureView.scrollDOM;
        const scrollRect = scrollDOM.getBoundingClientRect();
        const start = measureView.coordsAtPos(selection.from);
        const offsetFromViewportTop = start ? start.top - scrollRect.top : null;

        return {
            selectionFrom: selection.from,
            selectionTo: selection.to,
            offsetFromViewportTop,
            needsScroll: offsetFromViewportTop === null || isOutsideTolerance(offsetFromViewportTop),
        };
    },
    write(measurement, measureView) {
        if (measurement.needsScroll) {
            setTimeout(() => {
                const selection = measureView.state.selection.main;
                measureView.dispatch({
                    effects: EditorView.scrollIntoView(selection, { y: 'start', yMargin: 0 }),
                });
            }, 0);
        }
    },
});
```

### Scroll Decision

```typescript
const needsScroll =
    offsetFromViewportTop < 0
        ? Math.abs(offsetFromViewportTop) > 1.5 // Above viewport
        : offsetFromViewportTop > 12; // Below viewport
```

Missing target coordinates are treated as needing a corrective `scrollIntoView`, because CodeMirror may not have
materialized the target block yet.

## Abort Conditions

- User moved cursor before the delayed measurement
- User moved cursor before the deferred corrective dispatch
- Measurement completed and the heading is within tolerance

## Mobile Considerations

Corrective dispatch is deferred via `setTimeout(fn, 0)` to avoid "update is in progress" errors:

```typescript
setTimeout(() => {
    measureView.dispatch({
        effects: EditorView.scrollIntoView(selection, { y: 'start', yMargin: 0 }),
    });
}, 0);
```

## Timeout Management

```typescript
const scrollStabilizationTimeouts = new WeakMap<EditorView, number>();
```

- WeakMap ensures cleanup on editor destroy
- Previous stabilization is cancelled on new navigation
