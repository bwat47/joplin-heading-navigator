import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^api\/(.+)$/,
                replacement: `${new URL('./api/', import.meta.url).pathname}$1`,
            },
            {
                find: 'api',
                replacement: new URL('./api/index.ts', import.meta.url).pathname,
            },
        ],
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        passWithNoTests: true,
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/manifest.json'],
        },
    },
});
