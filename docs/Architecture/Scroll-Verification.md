# Scroll Verification

Compensates for layout shifts caused by async content loading after initial scroll.

## Problem

After `scrollIntoView`, heading can drift due to:

- Rich Markdown image loading
- Async syntax highlighting
- Widget rebuilds on selection change
- Late asset loading

Shifts occur 50-300ms after initial scroll.

## Solution: Two-Phase Verification

```
Initial Scroll → Wait 160ms → Verify → (if needed) Scroll + Wait 260ms → Verify
```

## Timing Constants

| Constant                              | Value | Purpose                      |
| ------------------------------------- | ----- | ---------------------------- |
| `SCROLL_VERIFY_DELAY_MS`              | 160ms | First verification           |
| `SCROLL_VERIFY_RETRY_DELAY_MS`        | 260ms | Second verification          |
| `SCROLL_VERIFY_TOLERANCE_PX`          | 12px  | Max drift below viewport top |
| `SCROLL_VERIFY_NEGATIVE_TOLERANCE_PX` | 1.5px | Max drift above viewport top |
| `SCROLL_VERIFY_MAX_ATTEMPTS`          | 2     | Retry limit                  |

## Implementation

### Measurement

```typescript
view.requestMeasure({
    read(measureView) {
        const blockMeasurement = measureSelectionBlock(measureView, selection);
        return {
            status: 'geometry',
            blockTopOffset: blockMeasurement.blockTopOffset,
            viewportTop: blockMeasurement.viewportTop,
        };
    },
    write(measurement, measureView) {
        if (needsScroll) {
            measureView.scrollDOM.scrollTop = targetScrollTop;
            measureView.dispatch({
                effects: EditorView.scrollIntoView(selection, { y: 'start' }),
            });
        }
    },
});
```

### Position Calculation

```typescript
function measureSelectionBlock(view, selection) {
    const scrollDOM = view.scrollDOM;
    const rect = scrollDOM.getBoundingClientRect();
    const start = view.coordsAtPos(selection.from);

    return {
        blockTopOffset: start.top - rect.top,
        viewportTop: scrollDOM.scrollTop,
    };
}
```

### Scroll Decision

```typescript
const needsScroll =
    offsetFromViewportTop < 0
        ? Math.abs(offsetFromViewportTop) > 1.5 // Above viewport
        : offsetFromViewportTop > 12; // Below viewport
```

## Abort Conditions

- User moved cursor (selection mismatch)
- Max attempts reached
- Measurement failure

```typescript
if (!isSameSelection(selection, targetRange)) {
    return null; // User navigated elsewhere
}
```

## Mobile Considerations

Deferred dispatch via `setTimeout(fn, 0)` to avoid "update is in progress" errors:

```typescript
setTimeout(() => {
    measureView.dispatch({
        effects: EditorView.scrollIntoView(selection, { y: 'start' }),
    });
    verify(attempt + 1);
}, 0);
```

## Timeout Management

```typescript
const scrollVerificationTimeouts = new WeakMap<EditorView, number>();
```

- WeakMap ensures cleanup on editor destroy
- Previous verification cancelled on new navigation
