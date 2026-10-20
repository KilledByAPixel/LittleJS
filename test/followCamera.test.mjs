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
