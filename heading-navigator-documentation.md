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
- Delegates all DOM rendering to `HeadingPanel`, injects editor highlight decorations for the active heading, and ensures the panel opens/closes based on command toggles.

### Panel UI Modules

- `src/contentScripts/ui/headingPanel.ts`: renders the floating panel DOM, wires keyboard/mouse interactions, manages filtering, and emits preview/select callbacks.
- `src/contentScripts/theme/panelTheme.ts`: derives theme-aware colors from the current editor styles and produces the CSS injected by `HeadingPanel`.

### Utilities & Data

- `src/headingExtractor.ts`: wraps the Lezer Markdown parser to detect ATX/Setext headings, normalizes text, and records byte offsets + line numbers.
- `src/settings.ts`: registers plugin settings and normalizes values for the content script.
- `src/types.ts`: defines shared DTOs (`HeadingItem`, `PanelDimensions`, `DEFAULT_PANEL_DIMENSIONS`) used by both plugin and editor bundles.
- `src/constants.ts`: centralizes string identifiers (command name, CodeMirror content script id, editor command name).
- `src/logger.ts`: bootstraps the Joplin logger namespace (`heading-navigator`) for consistent diagnostics.

### Configuration

- Panel width defaults to 320px (range 240–640). Panel height defaults to 75% of the editor viewport (range 40–90%). Both values are exposed via the Joplin configuration screen (`Heading Navigator` section) and are validated before being applied in the editor.


