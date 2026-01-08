# Content Script

`src/contentScripts/headingNavigator.ts` - CodeMirror 6 integration module.

## Entry Point

```typescript
export default function headingNavigator(context: ContentScriptContext): MarkdownEditorContentScriptModule {
    return {
        plugin: (editorControl: CodeMirrorControl) => {
            // Extension and command registration
        },
    };
}
```

## Responsibilities

| Function             | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Command registration | `headingNavigator.togglePanel` invoked via `editor.execCommand`                                |
| Document tracking    | `EditorView.updateListener` recomputes headings on document change (skipped when panel closed) |
| Panel lifecycle      | Open/update/close coordination with selection/scroll state management                          |
| Selection management | Preview (scroll without close), Select (commit + close), Cancel (restore original)             |
| Message bridging     | Forwards copy requests to plugin host                                                          |

## Active Heading Detection

```typescript
function findActiveHeadingId(headings: HeadingItem[], position: number): string | null {
    let candidate: HeadingItem | null = null;
    for (const heading of headings) {
        if (heading.from <= position) {
            candidate = heading;
        } else {
            break;
        }
    }
    return candidate?.id ?? headings[0].id;
}
```

Returns last heading starting at or before cursor position.

## Selection Restoration

On panel cancel (Escape):

1. Selection range restored from `{ from, to }` snapshot
2. Scroll position restored via `view.scrollSnapshot()`

## Message Bridge

```typescript
const message: ContentScriptToPluginMessage = {
    type: 'copyHeadingLink',
    noteId,
    headingText: heading.text,
    headingAnchor: heading.anchor,
};
await context.postMessage(message);
```

## Mobile Detection

```typescript
const versionInfo = await joplin.versionInfo();
const isMobile = versionInfo.platform === 'mobile';
```

Passed to `HeadingPanel` for layout mode selection.
