import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject3D, Matrix4, Tween, tweenUpdate, tweenStopAll, isPowerOfTwo, engineObjectsUpdate, vec3 } = LJS;

// review round 7: a matrix driven 3D object keeps its place through attach and removeChild, tweens restarted while
// active, and isPowerOfTwo past 32 bits

test('a 3D object driven by localMatrix stays where it is when it is detached or reattached', () =>
{
    const parent = new EngineObject3D(vec3(10, 0, 0)), other = new EngineObject3D(vec3(20, 0, 0));
    const child = new EngineObject3D();
    child.localMatrix = Matrix4.translation(vec3(2, 0, 0));
    try
    {
        parent.addChild(child);
        assert.equal(child.getWorldPos3D().x, 12);
        parent.removeChild(child);
        assert.equal(child.getWorldPos3D().x, 12, 'detached where it was');
        other.attach(child);
        assert.ok(Math.abs(child.getWorldPos3D().x - 12) < 1e-9, 'attached where it was');
    }
    finally { parent.destroy(); other.destroy(); child.destroy(); engineObjectsUpdate(); }
});

test('a tween restarted by its own last value callback keeps running', () =>
{
    tweenStopAll();
    let tween;
    const values = [];
    tween = new Tween(value=> { values.push(value); value === 1 && tween.restart(); }, 0, 1, 1);
    tweenUpdate(1);
    assert.deepEqual(values, [0, 1, 0]);
    assert.equal(tween.isActive(), true, 'the new run goes on');
    tweenUpdate(.25);
    assert.equal(tween.life, .75);
    tweenStopAll();
});

test('an active tween restarted by another tween moves on from the next update', () =>
{
    tweenStopAll();
    const older = new Tween(()=>{}, 0, 10, 1);
    let armed = false;
    new Tween(()=> armed && older.restart(), 0, 1, 1);
    armed = true;
    tweenUpdate(.25);
    assert.equal(older.life, 1);
    assert.equal(older.getValue(), 0);
    armed = false;
    tweenUpdate(.25);
    assert.equal(older.life, .75);
    tweenStopAll();
});

test('isPowerOfTwo is right past 32 bits', () =>
{
    for (let n = 0; n <= 52; ++n)
    {
        const p = 2**n;
        assert.equal(isPowerOfTwo(p), true, '2^' + n);
        n > 1 && assert.equal(isPowerOfTwo(p + 1), false, '2^' + n + '+1');
        n > 1 && assert.equal(isPowerOfTwo(p - 1), false, '2^' + n + '-1');
    }
    assert.equal(isPowerOfTwo(3 * 2**32), false);
    assert.equal(isPowerOfTwo(0), false);
    assert.equal(isPowerOfTwo(-4), false);
    assert.equal(isPowerOfTwo(.5), false);
});
