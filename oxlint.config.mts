import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'import', 'vitest', 'unicorn'],
    categories: {
        correctness: 'error',
        suspicious: 'error',
    },
    options: {
        typeAware: true,
    },
    env: {
        node: true,
    },
    ignorePatterns: ['api/**', '.api-staging-*/**', 'dist/**', 'coverage/**'],
    rules: {
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'typescript/no-unsafe-type-assertion': 'off',
        'vitest/require-mock-type-parameters': 'off',
        'import/no-cycle': 'error',
        'import/no-self-import': 'error',
        'import/no-duplicates': ['error', { preferInline: true }],
        // `Array#toSorted()` is ES2023; this plugin targets ES2020. Sorts operate on local copies.
        'unicorn/no-array-sort': 'off',
        // Every `postMessage` call here is Joplin's content-script `context.postMessage`, not `window.postMessage`.
        'unicorn/require-post-message-target-origin': 'off',
    },
    overrides: [
        {
            files: ['**/*.ts', '**/*.tsx'],
            rules: {
                'typescript/no-explicit-any': 'error',
                'typescript/explicit-module-boundary-types': 'error',
                'typescript/no-inferrable-types': 'error',
                'typescript/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
                'typescript/no-import-type-side-effects': 'error',
                'typescript/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
                'typescript/no-unnecessary-condition': 'error',
                'typescript/no-misused-promises': 'error',
                'typescript/no-unsafe-assignment': 'error',
                'typescript/no-unsafe-call': 'error',
                'typescript/no-unsafe-member-access': 'error',
                'typescript/no-unsafe-return': 'error',
                'typescript/no-unsafe-argument': 'error',
                'typescript/only-throw-error': 'error',
                'typescript/require-await': 'error',
                'typescript/no-unnecessary-type-assertion': 'error',
                'typescript/restrict-plus-operands': 'error',
                'typescript/prefer-promise-reject-errors': 'error',
                'typescript/no-unsafe-enum-comparison': 'error',
            },
        },
        {
            files: ['src/**/*.test.ts'],
            env: {
                vitest: true,
            },
            rules: {
                'typescript/unbound-method': 'off',
                'vitest/no-disabled-tests': 'warn',
            },
        },
    ],
});
