import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('debug shapes are not kept in headless mode, where nothing draws them', () =>
{
    // the script build, so its top level list of debug shapes can be read
    const context = vm.createContext({ console, window: {}, document: { body: {} }, setTimeout, clearTimeout, performance });
    vm.runInContext(readFileSync(new URL('../dist/littlejs.js', import.meta.url), 'utf8'), context);
    vm.runInContext(`
        setHeadlessMode(true);
        for (let i = 0; i < 100; ++i)
        {
            debugRect(vec2(), vec2(1));
            debugCircle(vec2(), 1);
            debugPoly(vec2(), [vec2(), vec2(1, 0), vec2(0, 1)]);
            debugText('x', vec2());
            debugLine(vec2(), vec2(1));
            debugPoint(vec2());
        }`, context);
    assert.equal(vm.runInContext('debugPrimitives.length', context), 0);
});
