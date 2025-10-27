### Project Snapshot

- Goal: provide a quick “Go to heading” workflow inside Joplin’s CodeMirror 6 markdown editor, inspired by Sublime Text’s symbol palette.
- Two major parts: the plugin entry point (`src/index.ts`) and the CodeMirror content script (`src/contentScripts/headingNavigator.ts`) compiled via `plugin.config.json`.
- Shared helpers: `src/constants.ts` (string IDs), `src/types.ts` (`HeadingItem` DTO), `src/headingExtractor.ts` (Lezer-based heading parser), `src/logger.ts`.
- Build/packaging is the standard yo-joplin scaffold using Webpack, `plugin.config.json` (extra script compilation), and `src/manifest.json` (exposes command + content script).

### Entry Point (`src/index.ts`)

- Registers the CodeMirror content script (`headingNavigator.js`) and the command `headingNavigator.goToHeading`.
- Command handler calls `joplin.commands.execute('editor.execCommand', { name: EDITOR_COMMAND_TOGGLE_PANEL })`, delegating all UI logic to the editor-side script.
- Adds a menu item under Edit so the command appears in Joplin’s keyboard shortcut settings.

### Content Script (`src/contentScripts/headingNavigator.ts`)

- Implements a CodeMirror plugin that registers `headingNavigator.togglePanel`, renders the floating panel, and manages its lifecycle.
- Builds a panel UI (filter input + list) with keyboard navigation, filtering, arrow/tab cycling, Enter/Escape handling, and click-to-select support.
- Highlights the current heading, centers the editor preview (`scrollIntoView`), and closes when the user clicks outside or presses Escape.
- Observes editor state via `EditorView.updateListener` to refresh headings after document edits or caret moves.
- Uses `extractHeadings` to parse the note body into `HeadingItem` objects on the client side; caches selections to avoid unnecessary work.
- Injects theme-aware CSS at runtime (`ensurePanelStyles`) so no static assets are required.

### Utilities & Data

- `src/headingExtractor.ts`: wraps the Lezer Markdown parser to detect ATX/Setext headings, normalizes text, and records byte offsets + line numbers.
- `src/types.ts`: defines the `HeadingItem` shape shared between modules.
- `src/constants.ts`: centralizes string identifiers (command name, CodeMirror content script id, editor command name).
- `src/logger.ts`: bootstraps the Joplin logger namespace (`heading-navigator`) for consistent diagnostics.
