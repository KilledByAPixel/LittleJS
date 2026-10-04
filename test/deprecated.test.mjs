import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The names and the argument order deprecated in 1.20 are gone in 1.25: collideTiles, the weld joint's spring
// damping names, NewgroundsPlugin.logView and the screen slice draws' old order, which a debug build now asserts on
// rather than reading a number in the color's place as a border size.

test('collideTiles is gone, collideLevel is the flag', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`'collideTiles' in EngineObject.prototype`), false);
    assert.equal(run(`particleEffectSanitize({settings: {collideTiles: true}}).settings.collideLevel`), false,
        'a saved effect is read by the name it has now, the old one left as the default');
});

test('the weld joint has only setDampingRatio and getDampingRatio, the wheel joint keeps its spring names', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`'setSpringDampingRatio' in Box2dWeldJoint.prototype`), false);
    assert.equal(run(`'getSpringDampingRatio' in Box2dWeldJoint.prototype`), false);
    assert.equal(run(`'setSpringDampingRatio' in Box2dWheelJoint.prototype`), true, 'Box2D\'s own name for it');
});

test('NewgroundsPlugin.logView is gone, the view is logged on start', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`'logView' in NewgroundsPlugin.prototype`), false);
});

test('the screen slice draws take a color after the tile, a number there asserts', () =>
{
    const { run } = loadEngine();
    run(`var calls = []; drawNineSlice = drawThreeSlice = (...a)=> calls.push(a);
        var sliceTile = new TileInfo(vec2(), vec2(8));`);
    assert.throws(()=> run('drawNineSliceScreen(vec2(), vec2(64), sliceTile, 20)'), /Assert failed/);
    assert.throws(()=> run('drawThreeSliceScreen(vec2(), vec2(64), sliceTile, 20)'), /Assert failed/);
    run('drawNineSliceScreen(vec2(), vec2(64), sliceTile, RED, 20, BLUE, 3, .5)');
    assert.equal(run('calls.length'), 1);
    assert.equal(run('calls[0][3] === RED && calls[0][4] === 20 && calls[0][5] === BLUE'), true);
});
