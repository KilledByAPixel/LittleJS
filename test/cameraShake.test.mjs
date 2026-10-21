import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// cameraShake adds trauma that fades by cameraShakeDecay a second; the view moves by smooth noise scaled by the
// trauma squared, only while a frame draws, so cameraPos and cameraAngle are the game's own again after it

test('cameraShake adds trauma capped at 1', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`cameraShake(.7); cameraShake(.7); cameraShakeTrauma`), 1);
    assert.equal(run(`cameraShakeTrauma = 0; cameraShake(); cameraShakeTrauma`), .5);
});

test('the shake fades to nothing in 1/decay seconds and then is exactly still', () =>
{
    const { run } = loadEngine();
    run(`cameraShake(1); timeDelta = 1/60; for (let i = 0; i < 60; ++i) cameraShakeUpdate();`);
    assert.ok(run(`cameraShakeTrauma`) < 1e-9);
    run(`for (let i = 0; i < 2; ++i) cameraShakeUpdate(); time = 1.234;`);
    assert.equal(run(`cameraShakeTrauma`), 0);
    assert.deepEqual(JSON.parse(run(`const o = cameraShakeOffset(); JSON.stringify([o.pos.x, o.pos.y, o.angle])`)),
        [0, 0, 0]);
});

test('the offset stays within the distance and angle scaled by trauma squared, and moves', () =>
{
    const { run } = loadEngine();
    const [maxPos, maxAngle] = JSON.parse(run(`cameraShake(.5); let p = 0, a = 0;
        for (let i = 0; i < 200; ++i)
        {
            time = i * .01;
            const o = cameraShakeOffset();
            p = max(p, abs(o.pos.x), abs(o.pos.y)); a = max(a, abs(o.angle));
        }
        JSON.stringify([p, a])`));
    const [distance, angle] = JSON.parse(run(`JSON.stringify([cameraShakeDistance, cameraShakeAngle])`));
    assert.ok(maxPos <= .25 * distance + 1e-12 && maxPos > .025 * distance, `pos ${maxPos}`);
    assert.ok(maxAngle <= .25 * angle + 1e-12 && maxAngle > .025 * angle, `angle ${maxAngle}`);
});

test('begin and end shake the view for the draw and leave the game its own cameraPos and cameraAngle', () =>
{
    const { run } = loadEngine();
    run(`cameraPos = vec2(3, 4); cameraAngle = .2; cameraShake(1); time = .37; cameraShakeBegin();`);
    assert.notDeepEqual(JSON.parse(run(`JSON.stringify([cameraPos.x, cameraPos.y, cameraAngle])`)), [3, 4, .2]);
    run(`cameraShakeEnd();`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([cameraPos.x, cameraPos.y, cameraAngle])`)), [3, 4, .2]);
});

test('a game that sets cameraPos every frame keeps its own value with a shake going', () =>
{
    const { run } = loadEngine();
    run(`cameraShake(1); time = .5;`);
    for (let frame = 0; frame < 3; ++frame)
    {
        run(`cameraPos = vec2(${frame}, 1); cameraShakeBegin(); cameraShakeEnd();`);
        assert.deepEqual(JSON.parse(run(`JSON.stringify([cameraPos.x, cameraPos.y])`)), [frame, 1]);
    }
});

test('the shake neither fades nor moves while paused', () =>
{
    const { run } = loadEngine();
    run(`cameraShake(1); paused = true; timeDelta = 1/60; time = .5;`);
    const before = run(`JSON.stringify(cameraShakeOffset())`);
    run(`for (let i = 0; i < 30; ++i) cameraShakeUpdate();`);
    assert.equal(run(`cameraShakeTrauma`), 1);
    assert.equal(run(`JSON.stringify(cameraShakeOffset())`), before);
});

test('the settings have setters', () =>
{
    const { run } = loadEngine();
    run(`setCameraShakeDistance(2); setCameraShakeAngle(.1); setCameraShakeDecay(3);`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([cameraShakeDistance, cameraShakeAngle, cameraShakeDecay])`)),
        [2, .1, 3]);
});

test('a camera set while a frame draws shaken is kept, not put back', () =>
{
    const { run } = loadEngine();
    run(`cameraPos = vec2(3, 4); cameraShake(1); time = .37; cameraShakeBegin();
        setCameraPos(vec2(9, 9)); cameraAngle = .5; cameraShakeEnd();`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([cameraPos.x, cameraPos.y, cameraAngle])`)), [9, 9, .5]);
});

test('a shake with a direction moves the view only along its axes, and the turn by the larger', () =>
{
    const { run } = loadEngine();
    const offsets = JSON.parse(run(`cameraShake(1, vec2(0, 1)); const list = [];
        for (let i = 0; i < 50; ++i) { time = i * .01; const o = cameraShakeOffset(); list.push([o.pos.x, o.pos.y, o.angle]); }
        JSON.stringify(list)`));
    assert.ok(offsets.every(o => o[0] === 0), 'nothing along x');
    assert.ok(offsets.some(o => o[1] !== 0), 'it moves along y');
    assert.ok(offsets.some(o => o[2] !== 0), 'it turns');
});

test('each axis takes its own share and fades on its own, and the whole shake is never less than either', () =>
{
    const { run } = loadEngine();
    run(`cameraShake(.4, vec2(1, .5)); cameraShake(.4, vec2(0, 1));`);
    const [x, y, trauma] = JSON.parse(run(`JSON.stringify([cameraShakeAxes.x, cameraShakeAxes.y, cameraShakeTrauma])`));
    assert.ok(Math.abs(x - .4) < 1e-12 && Math.abs(y - .6) < 1e-12 && Math.abs(trauma - .8) < 1e-12, `${x} ${y} ${trauma}`);
    run(`timeDelta = 1/60; for (let i = 0; i < 30; ++i) cameraShakeUpdate();`);
    const after = JSON.parse(run(`JSON.stringify([cameraShakeAxes.x, cameraShakeAxes.y, cameraShakeTrauma])`));
    assert.equal(after[0], 0);
    assert.ok(Math.abs(after[1] - .1) < 1e-9 && Math.abs(after[2] - .3) < 1e-9, `${after}`);
});

test('with no direction both axes take all of it, as before', () =>
{
    const { run } = loadEngine();
    assert.deepEqual(JSON.parse(run(`cameraShake(.3);
        JSON.stringify([cameraShakeAxes.x, cameraShakeAxes.y, cameraShakeTrauma])`)), [.3, .3, .3]);
});
