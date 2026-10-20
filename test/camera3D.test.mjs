import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D side of the camera plugin: cameraShake moves render3D.camera only while the 3D pass draws, and the 3D
// cameras drive the view through the camera list like FollowCamera, the newest made driving

// a fresh headless engine with the 3D plugin
function engine()
{
    const { run } = loadEngine();
    run(`headlessMode = true; new Render3DPlugin; timeDelta = 1/60;`);
    return run;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

test('the 3D camera is shaken while the pass draws and put back after', () =>
{
    const run = engine();
    run(`render3D.camera.pos = vec3(1, 2, 3); render3D.camera.rotation = vec3(.1, .2, 0);
        cameraShake(1); time = .37; render3DShakeBegin();`);
    const shaken = json(run, `[render3D.camera.pos, render3D.camera.rotation]`);
    assert.notDeepEqual(shaken[0], {x: 1, y: 2, z: 3});
    assert.notEqual(shaken[1].z, 0);
    assert.equal(shaken[1].x, .1, 'only rolled');
    run(`render3DShakeEnd();`);
    assert.deepEqual(json(run, `[render3D.camera.pos, render3D.camera.rotation]`),
        [{x: 1, y: 2, z: 3}, {x: .1, y: .2, z: 0}]);
});

test('with no shake the 3D camera is left exactly as it is', () =>
{
    const run = engine();
    run(`render3D.camera.pos = vec3(1, 2, 3); var before = render3D.camera.pos; render3DShakeBegin();`);
    assert.equal(run(`render3D.camera.pos === before`), true);
    run(`render3DShakeEnd();`);
    assert.equal(run(`render3D.camera.pos === before`), true);
});

test('an align2D camera is not shaken twice, it copies the shaken 2D view', () =>
{
    const run = engine();
    run(`render3D.camera.align2D = true; render3D.camera.pos = vec3(1, 2, 3); cameraShake(1); time = .37;
        render3DShakeBegin();`);
    assert.deepEqual(json(run, `render3D.camera.pos`), {x: 1, y: 2, z: 3});
    run(`render3DShakeEnd();`);
});

test('the newest 3D camera drives, and the one before takes over when it goes', () =>
{
    const run = engine();
    run(`var orbit = new CameraControl3D(vec3(0, 1, 0), 12, .3), eye = new FirstPersonCamera3D(vec3(4, 5, 6), 0, 0);
        cameraUpdatePost();`);
    assert.deepEqual(json(run, `render3D.camera.pos`), {x: 4, y: 5, z: 6});
    run(`eye.destroy(); cameraUpdatePost();`);
    assert.ok(Math.abs(run(`render3D.camera.pos.distance(vec3(0, 1, 0))`) - 12) < 1e-9, 'back on the orbit');
});

test('a 3D camera does not drive the view while paused', () =>
{
    const run = engine();
    run(`var eye = new FirstPersonCamera3D(vec3(4, 5, 6), 0, 0); cameraUpdatePost(); paused = true;
        eye.pos3D = vec3(9, 9, 9); cameraUpdatePost();`);
    assert.deepEqual(json(run, `render3D.camera.pos`), {x: 4, y: 5, z: 6});
});

test('a pass that threw before its shake was taken back does not leave the camera shaken', () =>
{
    const run = engine();
    run(`render3D.camera.pos = vec3(1, 2, 3); cameraShake(1); time = .37;
        render3DShakeBegin(); time = .5; render3DShakeBegin(); render3DShakeEnd();`);
    assert.deepEqual(json(run, `render3D.camera.pos`), {x: 1, y: 2, z: 3});
});

test('the shake is taken back from the camera it was put on, even when another is swapped in', () =>
{
    const run = engine();
    run(`var game = render3D.camera; game.pos = vec3(1, 2, 3); cameraShake(1); time = .37; render3DShakeBegin();
        render3D.camera = new Camera3D; render3D.camera.pos = vec3(7, 7, 7); render3DShakeEnd();`);
    assert.deepEqual(json(run, `game.pos`), {x: 1, y: 2, z: 3});
    assert.deepEqual(json(run, `render3D.camera.pos`), {x: 7, y: 7, z: 7});
});
