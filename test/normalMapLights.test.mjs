import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the light system's normal maps are opt in, and its lights stand a height above the scene for them

test('normal maps are off until a game turns them on, and make no buffer', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new LightSystemPlugin;`);
    assert.equal(run(`lightSystem.normalMaps`), false);
    assert.equal(run(`lightSystem.normalPass`), false);
    assert.equal(run(`lightSystem.normalTexture`), undefined);
});

test('a light stands 1 unit above the scene', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new LightSystemPlugin;`);
    assert.equal(run(`new Light(vec2(), 3).height`), 1);
});

test('the sun is 45 degrees up, a height of 1', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new LightSystemPlugin;`);
    assert.equal(run(`new DirectionalLight(vec2(1, 0)).height`), 1);
});

test('a light below the scene is caught in a debug build', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new LightSystemPlugin; var light = new Light(vec2(), 3); light.height = -1;`);
    assert.throws(()=> run(`light.update()`), /height/);
    run(`light.height = 0; light.update();`); // on the scene is fine
});
