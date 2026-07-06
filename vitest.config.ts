import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            api: new URL('./api/index.ts', import.meta.url).pathname,
            'api/': new URL('./api/', import.meta.url).pathname,
        },
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
