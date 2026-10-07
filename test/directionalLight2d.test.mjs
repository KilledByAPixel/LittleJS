import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 2D directional light, a sun for the light system: one at a time, made after the plugin, its settings and
// their defaults, and the background caster flag every object has

function engine()
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); console.assert = ()=> {}; new LightSystemPlugin;');
    return run;
}
const thrown = (run, code)=> run(`(()=> { try { ${code} } catch (e) { return e.message; } })()`);

test('a DirectionalLight has its direction, color and settings, and is the light system\'s', ()=>
{
    const run = engine();
    const light = JSON.parse(run(`var sun = new DirectionalLight(vec2(2, -1), hsl(.1, .5, .9));
        JSON.stringify({x: sun.direction.x, y: sun.direction.y, castShadow: sun.castShadow,
            shadowLength: sun.shadowLength, backgroundDepth: sun.backgroundDepth, current: lightSystem.directionalLight === sun,
            size: lightSystem.directionalTextureSize})`));
    assert.deepEqual(light, {x: 2, y: -1, castShadow: true, shadowLength: 20, backgroundDepth: 3, current: true, size: 512});
    run('sun.destroy()');
    assert.equal(run('new DirectionalLight().direction.y'), -1, 'down and to the right by default');
});

test('one at a time: a second asserts while the first lives, and destroying it lets another be made', ()=>
{
    const run = engine();
    run('var sun = new DirectionalLight');
    assert.match(thrown(run, 'new DirectionalLight') ?? '', /one DirectionalLight/);
    run('sun.destroy()');
    assert.equal(run('lightSystem.directionalLight'), undefined, 'destroying it clears it');
    assert.equal(thrown(run, 'new DirectionalLight'), undefined);
});

test('it asserts without the plugin, and on a direction that is no vector or zero', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); console.assert = ()=> {};');
    assert.match(thrown(run, 'new DirectionalLight') ?? '', /LightSystemPlugin/);
    run('new LightSystemPlugin');
    assert.match(thrown(run, 'new DirectionalLight(vec2())') ?? '', /direction/);
    assert.match(thrown(run, 'new DirectionalLight(5)') ?? '', /direction/);
});

test('a negative shadowLength or backgroundDepth asserts at its update', ()=>
{
    const run = engine();
    run('var sun = new DirectionalLight');
    assert.equal(thrown(run, 'sun.update()'), undefined);
    assert.match(thrown(run, 'sun.shadowLength = -1; sun.update()') ?? '', /shadowLength/);
    assert.match(thrown(run, 'sun.shadowLength = 2; sun.backgroundDepth = -1; sun.update()') ?? '', /backgroundDepth/);
});

test('every object has castBackgroundShadow, off by default', ()=>
{
    const run = engine();
    assert.equal(run('new EngineObject().castBackgroundShadow'), false);
    assert.equal(run('new TileLayer(vec2(), vec2(4)).castBackgroundShadow'), false);
});
