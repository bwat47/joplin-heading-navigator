# Panel UI

`src/contentScripts/ui/headingPanel.ts` - Floating panel interface.

## DOM Structure

```
.heading-navigator-panel
  └── .heading-navigator-input
  └── .heading-navigator-list
        └── .heading-navigator-item
              ├── .heading-navigator-item-level
              ├── .heading-navigator-item-text
              └── .heading-navigator-copy-button
```

## Initialization

```typescript
const panel = new HeadingPanel(
    view,
    {
        onPreview: (heading) => {
            /* scroll to heading */
        },
        onSelect: (heading) => {
            /* commit selection */
        },
        onClose: (reason) => {
            /* handle escape/blur */
        },
        onCopy: (heading) => {
            /* copy link */
        },
    },
    dimensions,
    isMobile
);
```

## Fuzzy Filtering

Uses `fuzzysort` library:

- **Empty query**: All headings in document order
- **With query**: Ranked by match relevance
- **Highlighting**: Matched characters wrapped in `<b>` via DOM manipulation

```typescript
const results = fuzzysort.go(query, headings, {
    key: 'text',
    limit: 100,
    threshold: -10000,
});
```

## Keyboard Navigation

| Key                  | Action                            |
| -------------------- | --------------------------------- |
| Arrow Down / Tab     | Move selection down (wraps)       |
| Arrow Up / Shift+Tab | Move selection up (wraps)         |
| Enter                | Confirm and close                 |
| Escape               | Cancel, restore original position |

Debounced callbacks (30ms) prevent scroll jitter during key repeat.

## DOM Reconciliation

Keyed incremental updates:

1. Index existing items by heading ID
2. Remove stale items
3. Update/create items
4. Reorder via `insertBefore`

## Copy Button

- **Desktop**: Visible on hover, `CopyButtonController` manages checkmark feedback
- **Mobile**: Hidden, replaced by long-press (600ms, cancels on >10px scroll)

## Mobile Layout

- `position: fixed`, centered in viewport
- Increased touch target padding
- 16px input font to prevent iOS auto-zoom

## Theme Integration

```css
background-color: var(--joplin-background-color3, #f4f5f6);
color: var(--joplin-color, #32373f);
border: 1px solid var(--joplin-divider-color, #dddddd);
```

Dynamic dimensions (width, maxHeight) injected at runtime.

## List Scroll-into-View

Manual scroll positioning (not `scrollIntoView()`) to avoid layout thrash:

```typescript
const itemTop = itemRect.top - containerRect.top + container.scrollTop;
if (itemTop < container.scrollTop) {
    container.scrollTop = itemTop;
}
```
