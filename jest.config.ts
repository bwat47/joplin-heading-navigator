import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src'],
    moduleNameMapper: {
        '^api/(.*)$': '<rootDir>/api/$1',
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts', '!src/manifest.json'],
};

export default config;
