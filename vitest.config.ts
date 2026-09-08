import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^api\/(.+)$/,
                replacement: `${fileURLToPath(new URL('./api/', import.meta.url))}$1`,
            },
            {
                find: 'api',
                replacement: fileURLToPath(new URL('./api/index.ts', import.meta.url)),
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
