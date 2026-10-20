import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// ThirdPersonCamera3D: a pole from a pivot over the target, turned by yaw and pitch, the camera at its end looking
// back at the pivot; it swings behind the way the target moves, turns by hand, and is pulled in by walls

const near = (a, b, message, epsilon=1e-9)=> assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} is not ${b}`);

// a fresh headless 3D engine with a target at the origin, stepping at 1/60 with time going on
function engine(made=`new ThirdPersonCamera3D(target, 6, .3)`)
{
    const { run } = loadEngine();
    run(`headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
        var target = new EngineObject3D(vec3()), camera = ${made}; camera.smoothing = 0;
        var step = (n=1, move=vec3())=>
        {
            for (let i = 0; i < n; ++i)
                { target.pos3D = target.pos3D.add(move); time += timeDelta; cameraUpdatePost(); }
        };`);
    return run;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

test('it sits behind and above the pivot and looks at it', () =>
{
    const run = engine();
    run(`step();`);
    const pos = json(run, `render3D.camera.pos`);
    near(pos.x, 0, 'x'); near(pos.y, 1 + 6 * Math.sin(.3), 'y'); near(pos.z, 6 * Math.cos(.3), 'z');
    assert.ok(run(`render3D.camera.getForward().dot(vec3(0, 1, 0).subtract(render3D.camera.pos).normalize())`) > .999);
});

test('auto swing turns it behind the way the target moves, eased', () =>
{
    const run = engine();
    run(`step(10, vec3(.05, 0, 0));`);
    const early = run(`camera.yaw`);
    assert.ok(early < 0 && early > -Math.PI/2 + .2, `eased, not snapped: ${early}`);
    run(`step(170, vec3(.05, 0, 0));`);
    near(run(`camera.yaw`), -Math.PI/2, 'behind, facing +x', .05);
});

test('a target standing still or only jumping does not swing it', () =>
{
    const run = engine();
    run(`camera.yaw = .7; step(60, vec3(0, .1, 0)); step(60);`);
    assert.equal(run(`camera.yaw`), .7);
});

test('useFacing swings behind the target\'s own facing', () =>
{
    const run = engine();
    run(`camera.useFacing = true; target.rotation3D = vec3(0, PI/2, 0); step(240);`);
    near(run(`camera.yaw`), Math.PI/2, 'the target\'s yaw', .01);
});

test('turning by hand holds the auto swing for swingDelay seconds', () =>
{
    const run = engine();
    run(`camera.turn(.5, 0); step(50, vec3(.05, 0, 0));`);
    near(run(`camera.yaw`), .5, 'held');
    run(`step(120, vec3(.05, 0, 0));`);
    assert.ok(run(`camera.yaw`) < .4, 'then it swings');
});

test('autoSwing off, the yaw only changes by hand', () =>
{
    const run = engine();
    run(`camera.autoSwing = false; step(120, vec3(.05, 0, 0));`);
    assert.equal(run(`camera.yaw`), 0);
    run(`camera.turn(.2, 0); step();`);
    near(run(`camera.yaw`), .2, 'turned');
});

test('the pitch is held to pitchRange', () =>
{
    const run = engine();
    run(`camera.turn(0, 9); step();`);
    assert.equal(run(`camera.pitch`), run(`camera.pitchRange.y`));
    run(`camera.turn(0, -99); step();`);
    assert.equal(run(`camera.pitch`), run(`camera.pitchRange.x`));
});

test('a wall between pulls it in at once, it eases back out, and the target is never the wall', () =>
{
    const run = engine();
    // the target has a mesh around the pivot, which the pole starts inside of
    run(`target.setMesh(render3D.boxMesh); target.scale3D = vec3(3);
        var wall = new EngineObject3D(vec3(0, 1 + 3 * sin(.3), 3 * cos(.3)), render3D.boxMesh); wall.setCollision();
        step();`);
    const hit = run(`render3D.pick(new Ray3D(vec3(0, 1, 0), vec3(0, sin(.3), cos(.3))), [wall]).distance`);
    const pulled = run(`render3D.camera.pos.distance(vec3(0, 1, 0))`);
    near(pulled, hit - .2, 'in front of the wall by wallMargin', 1e-6);
    run(`wall.destroy(); step();`);
    const out = run(`render3D.camera.pos.distance(vec3(0, 1, 0))`);
    assert.ok(out > pulled && out < 6, `easing back out: ${out}`);
    run(`step(300);`);
    near(run(`render3D.camera.pos.distance(vec3(0, 1, 0))`), 6, 'all the way out', 1e-3);
});

test('collideWalls off, a wall does not pull it in', () =>
{
    const run = engine();
    run(`camera.collideWalls = false;
        var wall = new EngineObject3D(vec3(0, 1 + 3 * sin(.3), 3 * cos(.3)), render3D.boxMesh); step();`);
    near(run(`render3D.camera.pos.distance(vec3(0, 1, 0))`), 6, 'full length');
});

test('pivotOffset sets where the pole starts', () =>
{
    const run = engine();
    run(`camera.pivotOffset = vec3(1, 2, 0); camera.snap();`);
    near(run(`render3D.camera.pos.distance(vec3(1, 2, 0))`), 6, 'from the pivot');
});

test('a destroyed target holds the camera where it is', () =>
{
    const run = engine();
    run(`step(); var before = JSON.stringify(render3D.camera.pos); target.destroy(); step(10);`);
    assert.equal(run(`JSON.stringify(render3D.camera.pos)`), run(`before`));
});

test('with no target it holds the camera where it is', () =>
{
    const { run } = loadEngine();
    run(`headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
        render3D.camera.pos = vec3(50, 5, 50); render3D.camera.rotation = vec3(-.2, .4, 0);
        var camera = new ThirdPersonCamera3D; cameraUpdatePost();`);
    assert.ok(run(`render3D.camera.pos.distance(vec3(50, 5, 50))`) < 1e-6, 'held');
});

test('only the level and solid objects pull it in, not a sprite or a mesh that is not solid', () =>
{
    const run = engine();
    run(`var bush = new EngineObject3D(vec3(0, 1 + 3 * sin(.3), 3 * cos(.3)), render3D.boxMesh); step();`);
    near(run(`render3D.camera.pos.distance(vec3(0, 1, 0))`), 6, 'full length');
});

test('destroying it lets go of a captured pointer', () =>
{
    const run = engine();
    run(`camera.lockPointer = true; var exited = 0; pointerLockIsActive = ()=> true; pointerLockExit = ()=> ++exited;
        camera.destroy();`);
    assert.equal(run(`exited`), 1);
});

test('snap on a third person camera that is not driving leaves the view alone', () =>
{
    const run = engine();
    run(`var other = new EngineObject3D(vec3(30, 0, 0)), newer = new ThirdPersonCamera3D(other); newer.smoothing = 0;
        var before = JSON.stringify(render3D.camera.pos); camera.snap();`);
    assert.equal(run(`JSON.stringify(render3D.camera.pos)`), run(`before`));
});
