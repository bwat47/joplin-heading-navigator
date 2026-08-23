# Heading Navigator

A Joplin plugin providing heading-based document navigation for CodeMirror 6.

## Features

- **Fuzzy Filtering**: Fuzzy search with match relevance ranking
- **Live Preview**: Scroll to headings during navigation without committing
- **Keyboard Navigation**: Arrow keys and Tab cycle headings; Escape cancels transient navigation or returns focus to the editor when pinned
- **Pinned Navigation**: Desktop panel can remain visible and follow the editor cursor; pinned state persists across editor reloads
- **Copy Heading Links**: Generate markdown anchor links
- **Theme Integration**: Uses Joplin CSS variables
- **Mobile Support**: Modal layout with long-press copy (desktop uses right-click for the same action)

---

## Architecture

Two-layer architecture: plugin host with Joplin API access and content script inside CodeMirror.

### Components

| File                                     | Responsibility                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                           | Plugin entry, command registration, API message handling                                                         |
| `src/contentScripts/headingNavigator.ts` | CodeMirror integration, pinned/transient lifecycle, debounced extraction, cursor following, scroll stabilization |
| `src/contentScripts/ui/headingPanel.ts`  | Panel DOM, pin and focus state, keyboard/mouse interactions, filtering                                           |
| `src/contentScripts/ui/fuzzyFilter.ts`   | Fuzzy search ranking and match highlighting                                                                      |
| `src/contentScripts/theme/panelTheme.ts` | CSS generation using Joplin theme variables                                                                      |
| `src/contentScripts/headingExtractor.ts` | Heading extraction from the editor's live Lezer syntax tree and anchor generation                                |
| `src/linkFormatting.ts`                  | Markdown link formatting for copy functionality                                                                  |

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

1. **Settings Sync**: Each editor installs a settings facet with safe defaults, then requests normalized panel settings from the plugin host
2. **Command Trigger**: User invokes "Go to Heading" → plugin host forwards the platform flag to the content script
3. **Panel Display**: Content script reads settings from the facet, extracts headings from the editor's live syntax tree (bounded `ensureSyntaxTree` pass; pathologically large documents open with a partial list that fills in as scrolling or background parsing extends the tree), and opens an unpinned panel with the active heading highlighted
4. **Navigation**: On desktop with previews enabled, filter/keyboard navigation updates editor selection and scrolls the heading into view; mobile and preview-disabled desktop sessions only update the panel highlight until selection
5. **Transient Selection**: Selection closes the panel; Escape restores the original state if the panel was never pinned
6. **Pinned Selection**: Selection returns focus to the editor while the mounted panel follows cursor movement
7. **Copy**: Request sent to plugin host → reads copy-link setting → formats markdown link → writes to clipboard
8. **Pin Persistence**: Pin toggles are persisted to a private Joplin setting; at editor startup the content script independently requests the pinned/platform restore state and reopens the panel without stealing focus
9. **Settings Changes**: There is no live push. Joplin recreates the editor (and content script) after the settings screen closes, so the startup settings fetch in step 1 always delivers current values.

## State Management

- **Panel State**: `HeadingPanel` class (pin state, filtered list, active heading, debounce timers)
- **Content Script Settings**: CodeMirror facet and compartment containing normalized panel dimensions, heading metadata display mode, preview preference, and top offset
- **Pinned Persistence**: Private `headingNavigator.panelPinned` setting written by the plugin host on user pin/unpin; read back on editor creation to restore a pinned panel (desktop only)
- **Editor State**: Selection/scroll snapshots support transient cancellation and are discarded when pinning
- **Heading Cache**: Recomputed 150 ms after document changes stop while the panel is open
- **Cursor Following**: Selection-only updates change the active DOM marker without refiltering or reconciling the list

## Build System

Standard Joplin yo-joplin scaffold with Webpack
