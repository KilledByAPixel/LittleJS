import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, ParticleEmitter, NewgroundsPlugin, vec2 } from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// names and argument orders renamed since 1.19 that still work, marked deprecated; they go when the owner says so

test('collideTiles reads and writes collideLevel, on objects and particle emitters', () =>
{
    const o = new EngineObject(vec2());
    o.setCollision();
    assert.equal(o.collideLevel, true);
    assert.equal(o.collideTiles, true);
    o.collideTiles = false;
    assert.equal(o.collideLevel, false);

    class Crate extends EngineObject { constructor() { super(vec2()); this.collideTiles = true; } }
    assert.equal(new Crate().collideLevel, true, 'a subclass setting the old name in its constructor');

    const emitter = new ParticleEmitter(vec2());
    emitter.collideTiles = true;
    assert.equal(emitter.collideLevel, true);
    emitter.destroy();
    o.destroy();
});

test('NewgroundsPlugin.logView is still there and does nothing, the view is logged on start', () =>
{
    assert.equal(typeof NewgroundsPlugin.prototype.logView, 'function');
    assert.equal(NewgroundsPlugin.prototype.logView.call({}), undefined);
});

test('the screen slice draws read the order before 1.20, a number where the color goes', () =>
{
    const { run } = loadEngine();
    const calls = JSON.parse(run(`(()=> {
        const calls = [];
        drawNineSlice = (pos, size, tile, color, borderSize, additiveColor, extraSpace, angle)=>
            calls.push([color === WHITE, borderSize, additiveColor, extraSpace, angle]);
        drawThreeSlice = drawNineSlice;
        const tile = new TileInfo(vec2(), vec2(8));
        drawNineSliceScreen(vec2(), vec2(64), tile, 20);            // the old order, with its defaults
        drawNineSliceScreen(vec2(), vec2(64), tile, 20, 3, .5);     // the old order, all given
        drawThreeSliceScreen(vec2(), vec2(64), tile, 20, 3, .5);
        drawNineSliceScreen(vec2(), vec2(64), tile, RED, 20, BLUE, 3, .5); // the order now, as it is
        return JSON.stringify(calls);
    })()`));
    assert.deepEqual(calls.slice(0, 3), [[true, 20, null, 2, 0], [true, 20, null, 3, .5], [true, 20, null, 3, .5]]);
    assert.deepEqual(calls[3].slice(1, 2).concat(calls[3].slice(3)), [20, 3, .5]);
    assert.equal(calls[3][0], false, 'a color is the color');
});
