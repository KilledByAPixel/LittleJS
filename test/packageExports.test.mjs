import { test } from 'node:test';
import assert from 'node:assert/strict';

// The package lets a game import the plugin and engine source it ships, as well as the builds, by the package's
// name: package.json's exports listed only the builds, so littlejsengine/plugins/x.js threw ERR_PACKAGE_PATH_NOT_EXPORTED

test('the builds, the plugins and the source resolve by the package name', ()=>
{
    for (const path of ['littlejsengine', 'littlejsengine/dist/littlejs.js', 'littlejsengine/plugins/lightSystem.js',
        'littlejsengine/src/engine.js', 'littlejsengine/package.json'])
        assert.doesNotThrow(()=> import.meta.resolve(path), path);
});
