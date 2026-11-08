// Flat config (ESM). Adds ignores, Node globals, and TS-friendly rule tweaks.

import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importPlugin from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import tsdoc from 'eslint-plugin-tsdoc';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores(['api/**', 'dist/**', '.api-staging-*/**']),

    js.configs.recommended,
    sonarjs.configs.recommended,

    // Bundle tests run under node:test.
    {
        files: ['test/*.mjs'],
        languageOptions: { globals: globals.node },
    },

    // Project TS/JS sources
    {
        files: ['**/*.{ts,tsx,js}'],
        extends: [tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            'import-x': importPlugin,
            tsdoc,
        },
        settings: {
            // Without these, import-x silently skips TS imports and rules like no-cycle never fire.
            // Resolve imports the way tsc does (.ts extensions, tsconfig paths)...
            'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
            // ...and parse resolved .ts files when following the import graph.
            'import-x/extensions': ['.ts', '.tsx', '.js'],
            'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
        },
        rules: {
            // report an error if any circular dependency is found
            'import-x/no-cycle': ['error', { maxDepth: Infinity }],
            'import-x/no-self-import': 'error',
            // Merge duplicate imports using inline `type` specifiers, matching consistent-type-imports below
            'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
            '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
            '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
            // Use `import type { A }` rather than `import { type A }` when every specifier is a type
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'tsdoc/syntax': 'error',
        },
    },

    // Root JS config files (e.g. .prettierrc.js) aren't part of the typed source; lint them untyped.
    {
        files: ['**/*.js'],
        extends: [tseslint.configs.disableTypeChecked],
    },

    // Vitest tests use an assertion-aware version of the unbound-method rule.
    {
        files: ['src/**/*.test.ts'],
        extends: [vitest.configs.recommended],
        languageOptions: {
            globals: vitest.environments.env.globals,
        },
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            'vitest/unbound-method': 'error',
        },
    },

    // Prettier compatibility
    prettier,
]);
