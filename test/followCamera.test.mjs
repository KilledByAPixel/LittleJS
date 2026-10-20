import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// FollowCamera, the 2D camera of the camera plugin: it follows a target with smoothing in seconds, an offset, a dead
// zone, a forward look, level bounds and zoom, and the newest camera made drives the view

const near = (a, b, message, epsilon=1e-9)=> assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} is not ${b}`);

// a fresh engine with an 800 by 600 canvas at 50 pixels a unit, so the view is 16 by 12 units, stepping at 1/60
function engine()
{
    const { run } = loadEngine();
    run(`mainCanvasSize = vec2(800, 600); cameraScale = 50; timeDelta = 1/60;
        var target = new EngineObject(vec2()), step = (n=1)=> { for (let i = 0; i < n; ++i) cameraUpdatePost(); };`);
    const view = ()=> JSON.parse(run(`JSON.stringify([cameraPos.x, cameraPos.y])`));
    return { run, view };
}

test('a new FollowCamera puts the view on its target', () =>
{
    const { run, view } = engine();
    run(`target.pos = vec2(5, 3); var camera = new FollowCamera(target); step();`);
    assert.deepEqual(view(), [5, 3]);
});

test('smoothing closes 1 - exp(-t/smoothing) of the gap', () =>
{
    const { run, view } = engine();
    run(`target.pos = vec2(0, 3); var camera = new FollowCamera(target, .5); target.pos = vec2(10, 3); step(60);`);
    near(view()[0], 10 * (1 - Math.exp(-2)), 'x');
    near(view()[1], 3, 'y');
});

test('smoothing comes out the same at 1/30 and at 1/60', () =>
{
    const a = engine(), b = engine();
    a.run(`var camera = new FollowCamera(target, .3); target.pos = vec2(7, -2); timeDelta = 1/30; step(30);`);
    b.run(`var camera = new FollowCamera(target, .3); target.pos = vec2(7, -2); timeDelta = 1/60; step(60);`);
    near(a.view()[0], b.view()[0], 'x');
    near(a.view()[1], b.view()[1], 'y');
});

test('the dead zone holds the view until the target leaves it', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.deadZone = vec2(4, 2);
        target.pos = vec2(1.9, .9); step();`);
    assert.deepEqual(view(), [0, 0]);
    run(`target.pos = vec2(3, -2); step();`);
    assert.deepEqual(view(), [1, -1]);
});

test('offset moves the view off the target', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.offset = vec2(0, 2); target.pos = vec2(1, 1); step();`);
    assert.deepEqual(view(), [1, 3]);
});

test('bounds keep the view inside', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.boundsMin = vec2(0, 0); camera.boundsMax = vec2(40, 30);
        target.pos = vec2(1, 1); step();`);
    assert.deepEqual(view(), [8, 6]);
    run(`target.pos = vec2(39, 29); step();`);
    assert.deepEqual(view(), [32, 24]);
});

test('a level smaller than the view is centered on that axis, the other still clamps', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.boundsMin = vec2(0, 0); camera.boundsMax = vec2(10, 30);
        target.pos = vec2(1, 1); step();`);
    assert.deepEqual(view(), [5, 6]);
    run(`target.pos = vec2(9, 20); step();`);
    assert.deepEqual(view(), [5, 20]);
});

test('scale eases cameraScale, and left undefined leaves the game its own', () =>
{
    const { run } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.scaleSmoothing = 0; camera.scale = 100; step();`);
    assert.equal(run(`cameraScale`), 100);
    run(`camera.scale = undefined; cameraScale = 70; step();`);
    assert.equal(run(`cameraScale`), 70);
});

test('a destroyed or missing target holds the view where it is', () =>
{
    const { run, view } = engine();
    run(`target.pos = vec2(4, 4); var camera = new FollowCamera(target, .2); target.destroy(); step(10);`);
    assert.deepEqual(view(), [4, 4]);
    run(`camera.target = undefined; step(10);`);
    assert.deepEqual(view(), [4, 4]);
});

test('the newest camera drives, and the older one takes over from the view when it goes', () =>
{
    const { run, view } = engine();
    run(`var a = new FollowCamera(target, .5), other = new EngineObject(vec2(20, 0)), b = new FollowCamera(other, .5);
        step();`);
    assert.deepEqual(view(), [20, 0]);
    run(`b.destroy(); step();`);
    near(view()[0], 20 * Math.exp(-1/30), 'eased from the view, not snapped');
});

test('paused, the camera does not move', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); paused = true; target.pos = vec2(5, 5); step();`);
    assert.deepEqual(view(), [0, 0]);
    run(`paused = false; step();`);
    assert.deepEqual(view(), [5, 5]);
});

test('a game setting cameraPos with no camera is left alone', () =>
{
    const { run, view } = engine();
    run(`cameraPos = vec2(7, 7); step();`);
    assert.deepEqual(view(), [7, 7]);
});

test('a target can be a position', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(vec2(2, 9), 0); step();`);
    assert.deepEqual(view(), [2, 9]);
});

// the forward look: a camera with no smoothing or dead zone, so the view's distance ahead of the target is the look
function looking(lookAhead, lookAheadSmoothing)
{
    const e = engine();
    e.run(`var camera = new FollowCamera(target, 0); camera.lookAhead = ${lookAhead};
        camera.lookAheadSmoothing = ${lookAheadSmoothing};
        var walk = (dx, dy, n)=> { for (let i = 0; i < n; ++i) { target.pos = target.pos.add(vec2(dx, dy)); step(); } };`);
    e.ahead = ()=> JSON.parse(e.run(`JSON.stringify([cameraPos.x - target.pos.x, cameraPos.y - target.pos.y])`));
    return e;
}

test('moving right, the view shows more ahead', () =>
{
    const { run, ahead } = looking('vec2(3, 0)', 0);
    run(`walk(.1, 0, 20);`);
    near(ahead()[0], 3, 'ahead');
});

test('turning slides the look across, never snapping', () =>
{
    const { run, ahead } = looking('vec2(3, 0)', .5);
    run(`walk(.1, 0, 20); camera.snap();`);
    near(ahead()[0], 3, 'snapped ahead');
    // back the other way less than lookAheadTurn, 1, the look holds
    run(`walk(-.1, 0, 9);`);
    near(ahead()[0], 3, 'held');
    const most = 6 * (1 - Math.exp(-1/60 / .5)) + 1e-9;
    let last = ahead()[0];
    for (let i = 0; i < 300; ++i)
    {
        run(`walk(-.1, 0, 1);`);
        const now = ahead()[0];
        assert.ok(Math.abs(now - last) <= most, `update ${i} moved the look ${now - last}`);
        last = now;
    }
    near(last, -3, 'across', 1e-3);
});

test('jiggling does not flip it', () =>
{
    const { run, ahead } = looking('vec2(3, 0)', 0);
    run(`walk(.1, 0, 20); for (let i = 0; i < 10; ++i) { walk(-.3, 0, 1); walk(.3, 0, 1); }`);
    near(ahead()[0], 3, 'ahead');
});

test('the look works on y the same', () =>
{
    const { run, ahead } = looking('vec2(0, 2)', 0);
    run(`walk(0, .1, 20);`);
    near(ahead()[1], 2, 'above');
    near(ahead()[0], 0, 'no look across');
});

test('snap puts the look on at once', () =>
{
    const { run, ahead } = looking('vec2(3, 0)', .5);
    run(`walk(.1, 0, 5);`);
    assert.ok(ahead()[0] < 3, 'still sliding');
    run(`camera.snap();`);
    near(ahead()[0], 3, 'ahead');
});

test('a velocity given to the camera, as an area effect might, does not move it', () =>
{
    const { run, view } = engine();
    run(`var camera = new FollowCamera(target, 0); camera.deadZone = vec2(100);
        camera.velocity = vec2(5, 5); camera.updatePhysics(); step();`);
    assert.deepEqual(view(), [0, 0]);
});
