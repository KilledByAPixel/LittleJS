import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// The 2D build: the engine with every plugin a 2D game uses and none of the 3D ones or Box2D, as littlejs.2d.js
// with its debug features and littlejs.2d.min.js for release, about half the size of the full build.

const dist = (file)=> new URL('../dist/' + file, import.meta.url);

test('the 2D build is in dist, debug and minified', () =>
{
    assert.ok(existsSync(dist('littlejs.2d.js')));
    assert.ok(existsSync(dist('littlejs.2d.min.js')));
    assert.ok(!existsSync(dist('littlejs.2d.release.js')), 'the release step on the way to the minified one is not kept');
});

test('the 2D build is well under the full one', () =>
{
    const ratio = statSync(dist('littlejs.2d.min.js')).size / statSync(dist('littlejs.min.js')).size;
    assert.ok(ratio < .7, 'the 2D minified build is ' + (ratio * 100).toFixed(0) + '% of the full one');
});

for (const file of ['littlejs.2d.js', 'littlejs.2d.min.js'])
test(`${file} has the 2D engine and plugins and nothing 3D or Box2D, and runs`, async () =>
{
    const { run } = loadEngine({}, '', file);
    for (const name of ['EngineObject', 'ParticleEmitter', 'TileLayer', 'Sound', 'UISystemPlugin', 'Tween',
        'PathFinder', 'LightSystemPlugin', 'PostProcessPlugin', 'ParallaxLayer', 'loadTiles', 'particleEffect',
        'setScene', 'drawNineSlice', 'medalsInit', 'NewgroundsPlugin', 'AudioEffect', 'levelEditor'])
        assert.notEqual(run(`typeof ${name}`), 'undefined', name);
    for (const name of ['render3D', 'Render3DPlugin', 'Vector3', 'Mesh', 'EngineObject3D', 'level3DLoad',
        'loadGLTF', 'VoxelMap', 'ThreeJSPlugin', 'box2d', 'Box2dObject'])
        assert.equal(run(`typeof ${name}`), 'undefined', name);
    assert.equal(run('engineVersion'), loadEngine().run('engineVersion'));
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> {
        new EngineObject(vec2(), vec2(1)).setCollision();
        new ParticleEmitter(vec2(), 0, 1, .2, 50);
        new Tween(()=> {}, 0, 1, 1);
    }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run('engineStep(30)');
    assert.equal(run('frame'), 30);
});

test('the 2D debug build has the debug tools, its 2D editor and tweakables', () =>
{
    const { run } = loadEngine({}, '', 'littlejs.2d.js');
    assert.equal(run('debug'), true);
    assert.equal(run('typeof tweak'), 'function');
    assert.equal(run('typeof editorPaint'), 'function');
});
