import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, engineInit, engineStep, engineObjectsDestroy, setEngineManualStep, setHeadlessMode, setGravity,
    vec2, frame } from '../dist/littlejs.esm.js';

// review round 15: the core engine

setHeadlessMode(true);
setEngineManualStep(true);
await engineInit();

test('crates stacked on a rising static lift are each asked about the other once a frame, and ride it as before', () =>
{
    const asks = new Map;
    class Crate extends EngineObject
    {
        constructor(name, pos, size, mass=1)
        {
            super(pos, size);
            this.name = name;
            this.mass = mass;
            this.setCollision(true, true, false);
        }
        collideWithObject(o)
        {
            const key = frame + ' ' + this.name + '>' + o.name;
            asks.set(key, (asks.get(key) || 0) + 1);
            return true;
        }
    }
    setGravity(vec2(0, -.02));
    const lift = new Crate('lift', vec2(0, 0), vec2(4, 1), 0);
    lift.velocity = vec2(0, .05);
    const bottom = new Crate('bottom', vec2(0, 1.01), vec2(1, 1));
    const top = new Crate('top', vec2(0, 2.02), vec2(1, 1));
    engineStep(60);
    const twice = [...asks].filter(([, count])=> count > 1).map(([key])=> key);
    assert.deepEqual(twice, []);
    assert.deepEqual([lift.pos.y, bottom.pos.y, top.pos.y].map(y=> y.toFixed(6)), ['3.000000', '4.001000', '5.002000']);
    engineObjectsDestroy();
    setGravity(vec2());
});
