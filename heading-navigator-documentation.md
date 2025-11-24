### Project Snapshot

- Goal: provide a quick “Go to heading” workflow inside Joplin’s CodeMirror 6 markdown editor, inspired by Sublime Text’s symbol palette.
- Two major parts: the plugin entry point (`src/index.ts`) and the CodeMirror content script (`src/contentScripts/headingNavigator.ts`) compiled via `plugin.config.json`.
- Shared helpers: `src/constants.ts` (string IDs), `src/types.ts` (`HeadingItem` DTO), `src/headingExtractor.ts` (Lezer-based heading parser), `src/logger.ts`, plus panel-specific support under `src/contentScripts/ui` and `src/contentScripts/theme`.
- Build/packaging is the standard yo-joplin scaffold using Webpack, `plugin.config.json` (extra script compilation), and `src/manifest.json` (exposes command + content script).

### Entry Point (`src/index.ts`)

- Registers the CodeMirror content script (`headingNavigator.js`) and the command `headingNavigator.goToHeading`.
- Registers the plugin settings (`panelWidth`, `panelMaxHeightPercentage`) during startup so panel sizing can be customized by users.
- Command handler calls `joplin.commands.execute('editor.execCommand', { name: EDITOR_COMMAND_TOGGLE_PANEL })`, delegating all UI logic to the editor-side script.
- Adds a menu item under Edit so the command appears in Joplin's keyboard shortcut settings.
- Creates a Markdown editor toolbar button (via `joplin.views.toolbarButtons.create`) for quick access.

### Content Script (`src/contentScripts/headingNavigator.ts`)

- Owns the CodeMirror plugin wiring: registers `headingNavigator.togglePanel`, listens to doc/selection updates, and coordinates panel lifecycle.
- Computes headings via `extractHeadings`, tracks the active heading, and keeps the editor selection in sync with panel navigation.
- Delegates all DOM rendering to `HeadingPanel` and ensures the panel opens/closes based on command toggles.
- Uses the content script messaging bridge to ask the host process for clipboard writes when the panel copy control is clicked.
- Navigation scrolls headings into view with CodeMirror’s `scrollIntoView` using `y: 'start'`, which keeps the heading pinned to the top of the editor. A short retry loop re-runs the scroll if late layout shifts (for example, rich Markdown images loading) nudge the heading out of view.
- When the panel is closed with escape, the original selection and scroll position are restored via a snapshot taken when the panel opened, with a stored `scrollTop` fallback if geometry can’t be measured.

### Panel UI Modules

- `src/contentScripts/ui/headingPanel.ts`: renders the floating panel DOM, wires keyboard/mouse interactions, manages fuzzy filtering, and emits preview/select/copy callbacks. Each heading exposes a hover-only copy button that animates to a confirmation checkmark and fades out after copying.
- `src/contentScripts/ui/fuzzyFilter.ts`: wraps the `fuzzysort` library for Sublime Text-like fuzzy matching. Provides `fuzzyFilter()` for ranking headings by match relevance and `highlightMatch()` for rendering matched characters in bold. Uses DOM manipulation (not innerHTML) for secure highlighting.
- `src/contentScripts/theme/panelTheme.ts`: generates CSS using Joplin's theme variables (e.g., `--joplin-color`, `--joplin-background-color3`, `--joplin-selected-color`) for automatic theme integration. The panel adapts to light/dark themes and custom user themes without JavaScript color computation. Only dynamic panel dimensions (width, maxHeight) are injected at runtime; all colors are handled via CSS variables with fallback values.

### Utilities & Data

- `src/headingExtractor.ts`: wraps the Lezer Markdown parser to detect ATX/Setext headings, normalizes text, and records byte offsets + line numbers. Uses CodeMirror's `Text.lineAt()` for efficient position-to-line number conversion.
- `src/messages.ts`: shared content-script → host message contracts (currently the copy-heading-link request).
- `src/settings.ts`: registers plugin settings and normalizes values for the content script.
- `src/panelDimensions.ts`: centralizes panel sizing defaults, normalization helpers, and min/max bounds shared between the plugin host and content script.
- `src/types.ts`: defines shared DTOs (`HeadingItem`, `PanelDimensions`, `DEFAULT_PANEL_DIMENSIONS`) used by both plugin and editor bundles.
- `src/constants.ts`: centralizes string identifiers (command name, CodeMirror content script id, editor command name).
- `src/logger.ts`: Centralized logging utility. Provides `debug()`, `info()`, `warn()`, and `error()` methods with configurable log levels (DEBUG, INFO, WARN, ERROR, NONE). Log level can be adjusted at runtime via browser console using `console.headingNavigator.setLogLevel(level)` and `console.headingNavigator.getLogLevel()`. Defaults to WARN level.

### Configuration

- Panel width defaults to 320px (range 240–640). Panel height defaults to 75% of the editor viewport (range 40–90%). Both values are exposed via the Joplin configuration screen (`Heading Navigator` section) and are validated before being applied in the editor.
