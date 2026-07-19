# Heading Navigator

A Joplin plugin providing heading-based document navigation for CodeMirror 6.

## Features

- **Fuzzy Filtering**: Fuzzy search with match relevance ranking
- **Live Preview**: Scroll to headings during navigation without committing
- **Keyboard Navigation**: Arrow keys, Tab cycling, Escape to cancel
- **Pinned Navigation**: Desktop panel can remain visible and follow the editor cursor
- **Copy Heading Links**: Generate markdown anchor links
- **Theme Integration**: Uses Joplin CSS variables
- **Mobile Support**: Modal layout with long-press copy

---

## Architecture

Two-layer architecture: plugin host with Joplin API access and content script inside CodeMirror.

### Components

| File                                     | Responsibility                                                |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/index.ts`                           | Plugin entry, command registration, API message handling      |
| `src/contentScripts/headingNavigator.ts` | CodeMirror integration, panel lifecycle, scroll stabilization |
| `src/contentScripts/ui/headingPanel.ts`  | Panel DOM, keyboard/mouse interactions, filtering             |
| `src/contentScripts/ui/fuzzyFilter.ts`   | Fuzzy search ranking and match highlighting                   |
| `src/contentScripts/theme/panelTheme.ts` | CSS generation using Joplin theme variables                   |
| `src/headingExtractor.ts`                | Lezer-based heading parsing and anchor generation             |
| `src/linkFormatting.ts`                  | Markdown link formatting for copy functionality               |

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
2. **Panel Display**: Content script extracts headings via Lezer, opens an unpinned panel with the active heading highlighted
3. **Navigation**: Filter/navigate updates editor selection and scrolls the heading into view
4. **Transient Selection**: Selection closes the panel; Escape restores the original state if the panel was never pinned
5. **Pinned Selection**: Selection returns focus to the editor while the mounted panel follows cursor movement
6. **Copy**: Request sent to plugin host → reads copy-link setting → formats markdown link → writes to clipboard

## State Management

- **Panel State**: `HeadingPanel` class (pin state, filtered list, active heading, debounce timers)
- **Editor State**: Selection/scroll snapshots support transient cancellation and are discarded when pinning
- **Heading Cache**: Recomputed 150 ms after document changes stop while the panel is open
- **Cursor Following**: Selection-only updates change the active DOM marker without refiltering or reconciling the list

## Build System

Standard Joplin yo-joplin scaffold with Webpack:

- `plugin.config.json`: Content script compilation config
- `src/manifest.json`: Command and content script registration
- Output: `./contentScripts/headingNavigator.js`
