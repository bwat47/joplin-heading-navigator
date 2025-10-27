## Build, Test, and Development Commands

- `npm test` Run Jest test suite with coverage.
- `npm run test:watch` Run tests in watch mode during development.
- `npm run dist` Build plugin and create archive at `publish/*.jpl`.
- `npm run lint` Lint TypeScript with ESLint.
- `npm run lint:fix` Auto-fix lint issues.
- `npm run format` Format code with Prettier.
- `npm run updateVersion` Sync plugin version metadata.

## Design Principles

- **Simple over complex:** prefer focused, single-responsibility modules.
- **One clear way**: Single detection/validation path; avoid multiple competing approaches.
- **Separation of concerns**: Each module handles one aspect (detection, sizing, building, etc.).
- **Fail fast**: Validate inputs early; provide clear error messages to users.
- **Preserve user data**: Never lose alt text, titles, or formatting during conversions.

## Coding Style & Naming Conventions

- **Language**: TypeScript with strict settings; 4-space indentation; semicolons required.
- **Filenames**: `camelCase.ts` for modules; tests mirror names: `module.test.ts`.
- **Exports**: Prefer explicit types and narrow public exports.
- **Style enforcement**: Run `eslint.config.js`, `.prettierrc.js` before commits.
- **Documentation**: Use JSDoc for complex functions; document regex patterns with examples.

## Logging

User Joplin logger instead of console.log, usage example:

`import logger from './logger';`

`logger.info('Plugin started');`
`logger.warn('error test', err);`
