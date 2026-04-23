# Heading Navigator

A Joplin plugin providing heading-based document navigation for CodeMirror 6.

## Features

- **Fuzzy Filtering**: Fuzzy search with match relevance ranking
- **Live Preview**: Scroll to headings during navigation without committing
- **Keyboard Navigation**: Arrow keys, Tab cycling, Escape to cancel
- **Copy Heading Links**: Generate markdown anchor links
- **Theme Integration**: Uses Joplin CSS variables
- **Mobile Support**: Modal layout with long-press copy

## Documentation

- [Content-Script](Content-Script.md) - CodeMirror integration
- [Panel-UI](Panel-UI.md) - Floating panel implementation
- [Heading-Parsing](Heading-Parsing.md) - Lezer-based heading extraction
- [Scroll-Verification](Scroll-Verification.md) - Layout shift compensation

---

## Architecture

Two-layer architecture: plugin host with Joplin API access and content script inside CodeMirror.

### Components

| File                                     | Responsibility                                               |
| ---------------------------------------- | ------------------------------------------------------------ |
| `src/index.ts`                           | Plugin entry, command registration, API message handling     |
| `src/contentScripts/headingNavigator.ts` | CodeMirror integration, panel lifecycle, scroll verification |
| `src/contentScripts/ui/headingPanel.ts`  | Panel DOM, keyboard/mouse interactions, filtering            |
| `src/contentScripts/ui/fuzzyFilter.ts`   | Fuzzy search ranking and match highlighting                  |
| `src/contentScripts/theme/panelTheme.ts` | CSS generation using Joplin theme variables                  |
| `src/headingExtractor.ts`                | Lezer-based heading parsing and anchor generation            |
| `src/linkFormatting.ts`                  | Markdown link formatting for copy functionality              |

### Plugin Host

`src/index.ts` - Runs with full Joplin API access for privileged operations:

- Clipboard writes
- Note metadata retrieval
- Platform detection

### Content Script

`src/contentScripts/headingNavigator.ts` - Runs inside CodeMirror:

- Direct editor access
- Panel lifecycle management
- Message bridge to plugin host via `postMessage`

### Panel Injection

Panel appended to `view.scrollDOM.parentElement` to stay associated with specific editor instance.

**Desktop**: `position: absolute; top: 12px; right: 12px;`
**Mobile**: `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);`
**Z-Index**: 2000 (above CodeMirror content layers)

## Data Flow

1. **Command Trigger**: User invokes "Go to Heading" → plugin host loads settings and forwards to content script
2. **Panel Display**: Content script extracts headings via Lezer, opens panel with active heading highlighted
3. **Navigation**: Filter/navigate updates editor selection and scrolls heading into view
4. **Selection**: Panel closes, cursor positioned at heading (Escape restores original state)
5. **Copy**: Request sent to plugin host → reads copy-link setting → formats markdown link → writes to clipboard

## State Management

- **Panel State**: `HeadingPanel` class (filtered list, selection index, debounce timers)
- **Editor State**: Selection/scroll position snapshots for restoration on cancel
- **Heading Cache**: Recomputed on document changes while panel open

## Build System

Standard Joplin yo-joplin scaffold with Webpack:

- `plugin.config.json`: Content script compilation config
- `src/manifest.json`: Command and content script registration
- Output: `./contentScripts/headingNavigator.js`
