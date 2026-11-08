import assert from 'node:assert/strict';
import { createRequire, isBuiltin } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
    contentScriptExternals,
    createBuildOptions,
    createContentScriptBuildOptions,
    readPluginConfig,
} from '@bwat47/joplin-plugin-scripts';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const { extraScripts, mainBuildOptions } = await readPluginConfig(root);

/** Builds `options` in memory and returns the bundle text. */
async function bundle(options) {
    const result = await build({ ...options, write: false, logLevel: 'silent' });
    return result.outputFiles[0].text;
}

for (const script of extraScripts) {
    test(`content script ${script} exports a factory and only requires host editor libraries`, async () => {
        const text = await bundle(createContentScriptBuildOptions(root, script));
        const module = { exports: {} };
        // Execute our production bundle with the real host-library instances, without installing it.
        // eslint-disable-next-line sonarjs/code-eval -- Executes only the bundle built from this repository, with a controlled host stub.
        runInNewContext(text, {
            module,
            exports: module.exports,
            console,
            require: (name) => {
                assert.ok(contentScriptExternals.includes(name), `Unexpected runtime dependency: ${name}`);
                return require(name);
            },
        });
        assert.equal(typeof module.exports.default, 'function');
    });
}

test('the production bundle registers with Joplin, requiring only Node built-ins', async () => {
    const text = await bundle(createBuildOptions(root, mainBuildOptions));
    let registered = false;
    // Desktop's plugin runtime provides Node built-ins; anything else must be bundled.
    // eslint-disable-next-line sonarjs/code-eval -- Executes only the bundle built from this repository, with a controlled host stub.
    runInNewContext(text, {
        joplin: {
            plugins: {
                register: (plugin) => {
                    registered = typeof plugin.onStart === 'function';
                },
            },
        },
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        TextEncoder,
        TextDecoder,
        URL,
        URLSearchParams,
        process,
        require: (name) => {
            if (name.startsWith('node:')) throw new Error(`Unexpected node: prefix: ${name}`);
            if (isBuiltin(name)) return require(name);
            throw new Error(`Unexpected runtime dependency: ${name}`);
        },
    });
    assert.equal(registered, true);
});
