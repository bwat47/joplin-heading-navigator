## Project Architecture Documentation

docs/Architecture/

- Internal documentation about project architecture.
- Keep up to date with significant architecture changes. Keep documentation concise, avoid repeating information.

Architecture overview: docs/Architecture/Overview.md

## Guidelines

- Stop being agreeable: be direct and honest; no flattery, no validation, no sugar-coating.
- Challenge weak reasoning; point out missing assumptions and trade-offs.
- If something is underspecified/contradictory/risky — say so and list what must be clarified.

## Rules

- Never guess or invent. If unsure, say "I don't know" and propose how to verify.
- Never commit secrets, keys, connection strings
- Never force push to main
- Never approve or merge (human decision)

## Key Entry Points

Start here when exploring the codebase:

| File                                     | Responsibility                                                 |
| ---------------------------------------- | -------------------------------------------------------------- |
| `src/index.ts`                           | Plugin entry point, command registration, API message handling |
| `src/contentScripts/headingNavigator.ts` | CodeMirror integration, panel lifecycle, scroll verification   |
| `src/contentScripts/ui/headingPanel.ts`  | Floating panel DOM, keyboard/mouse interactions, filtering     |
| `src/contentScripts/ui/fuzzyFilter.ts`   | Fuzzy search ranking and match highlighting                    |
| `src/contentScripts/theme/panelTheme.ts` | CSS generation using Joplin theme variables                    |
| `src/headingExtractor.ts`                | Lezer-based heading parsing and anchor generation              |
| `src/linkFormatting.ts`                  | Markdown link formatting for copy functionality                |

## Common Pitfalls

- **Build command**: Use `npm run dist`, not `npm run build` or `npx tsc`.

## Build, Test, and Development Commands

- `npm test` Run Jest test suite with coverage.
- `npm run test:watch` Run tests in watch mode during development.
- `npm run dist` Build plugin and create archive at `publish/*.jpl`.
- `npm run lint` Lint TypeScript with ESLint.
- `npm run lint:fix` Auto-fix lint issues.
- `npm run format` Format code with Prettier.
- `npm run updateVersion` Sync plugin version metadata.

## Design Principles

- **Simple over complex:** Prefer focused, single-responsibility modules.
- **One clear way**: Avoid multiple competing approaches.
- **Separation of concerns**: Each module handles one aspect.
- **Fail fast**: Validate inputs early; provide clear error messages to users.

## Coding Style & Naming Conventions

- **Language**: TypeScript with strict settings; 4-space indentation; semicolons required.
- **Filenames**: `camelCase.ts` for modules; tests mirror names: `module.test.ts`.
- **Exports**: Prefer explicit types and narrow public exports.
- **Style enforcement**: Run `npm run format` before commits or if you encounter formatting errors from prettier.
- **Documentation**: Use JSDoc for complex functions; document regex patterns with examples.
- **Constants and configuration**: No magic literals — extract to constants, enums, config objects, or dedicated types.
- **Structure and Testability**: Pure logic lives in small, focused units when internal behaviour is non-trivial. Global state and hidden side effects are avoided in favour of explicit dependencies.

## Log messages

- Use `src/logger.ts` wrapper
