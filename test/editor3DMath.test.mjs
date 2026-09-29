import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D editor's handles are dragged with the mouse's ray: how far along an axis, where on a plane, what angle
// around a ring. Snapping goes by the corner of an object's box so faces land on grid lines.

async function loadGame()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true); engineInit(()=> { new Render3DPlugin; }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    engine.run('var ray = (o, d)=> new Ray3D(vec3(...o), vec3(...d)); var list = (v)=> [v.x, v.y, v.z]');
    return engine;
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);
const nearList = (a, b)=> { assert.equal(a.length, b.length); a.forEach((v, i)=> near(v, b[i], `${[...a]} is not ${b}`)); };

test('a drag along an axis is how far along it the point nearest the mouse ray is', async ()=>
{
    const { run } = await loadGame();
    // looking down -Z from z 10, a ray through x 3 is 3 along the X axis from the origin
    near(run('editor3DAxisDistance(ray([3, 0, 10], [0, 0, -1]), vec3(), vec3(1, 0, 0))'), 3);
    near(run('editor3DAxisDistance(ray([3, 5, 10], [0, 0, -1]), vec3(1, 0, 0), vec3(1, 0, 0))'), 2, 'from the origin given');
    near(run('editor3DAxisDistance(ray([0, 4, 10], [0, 0, -1]), vec3(), vec3(0, 1, 0))'), 4);
    // a slanted ray: from (0, 10, 10) toward the origin's X axis at x 2
    near(run('editor3DAxisDistance(ray([2, 10, 10], [0, -1, -1]), vec3(), vec3(1, 0, 0))'), 2);
    // a ray along the axis has no nearest point, it stays where it is
    near(run('editor3DAxisDistance(ray([0, 0, 10], [1, 0, 0]), vec3(), vec3(1, 0, 0))'), 0);
});

test('a drag in a plane is where the mouse ray meets it', async ()=>
{
    const { run } = await loadGame();
    nearList([...run('list(editor3DPlanePoint(ray([1, 5, 2], [0, -1, 0]), vec3(0, 1, 0), vec3(0, 1, 0)))')], [1, 1, 2]);
    assert.equal(run('editor3DPlanePoint(ray([1, 5, 2], [1, 0, 0]), vec3(), vec3(0, 1, 0))'), undefined, 'along the plane');
    assert.equal(run('editor3DPlanePoint(ray([1, 5, 2], [0, 1, 0]), vec3(), vec3(0, 1, 0))'), undefined, 'away from it');
});

test('the rings are the pitch, yaw and roll of the rotation, each turning the way its number does', async ()=>
{
    const { run } = await loadGame();
    // for each ring: a small step of its number turns a point on the ring from across toward along
    for (const [ring, k] of [['x', 0], ['y', 1], ['z', 2]])
    {
        const ok = run(`{
            const rotation = vec3(.3, .7, .2), axes = editor3DRingAxes(rotation, '${ring}');
            const more = rotation.copy(); more['${ring}'] += .01;
            const local = buildMatrix(vec3(), rotation).invert().transformDirection(axes.across);
            const moved = buildMatrix(vec3(), more).transformDirection(local);
            const unit = Math.abs(axes.axis.length() - 1) < 1e-6 && Math.abs(axes.across.length() - 1) < 1e-6 &&
                Math.abs(axes.axis.dot(axes.across)) < 1e-6 && Math.abs(axes.axis.dot(axes.along)) < 1e-6;
            [unit, moved.dot(axes.along) > 0, Math.abs(moved.dot(axes.axis)) < 1e-6];
        }`);
        assert.deepEqual([...ok], [true, true, true], 'ring ' + ring + ' ' + k);
    }
    nearList([...run(`list(editor3DRingAxes(vec3(), 'y').axis)`)], [0, 1, 0]);
});

test('the angle around a ring is the angle of the mouse ray\'s point on its plane', async ()=>
{
    const { run } = await loadGame();
    run(`var axes = {axis: vec3(0, 1, 0), across: vec3(0, 0, 1), along: vec3(1, 0, 0)}`);
    near(run('editor3DRingAngle(ray([0, 5, 2], [0, -1, 0]), vec3(), axes)'), 0);
    near(run('editor3DRingAngle(ray([2, 5, 0], [0, -1, 0]), vec3(), axes)'), Math.PI / 2);
    near(run('editor3DRingAngle(ray([3, 5, 3], [0, -1, 0]), vec3(1, 0, 1), axes)'), Math.PI / 4);
    assert.equal(run('editor3DRingAngle(ray([2, 5, 0], [1, 0, 0]), vec3(), axes)'), undefined);
});

test('snapping goes by the low corner of the box, so faces land on grid lines', async ()=>
{
    const { run } = await loadGame();
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(1), 1))')], [.5, .5, 1.5]);
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(2, 1, 4), 1))')], [0, .5, 1]);
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(1), .5))')], [.5, .5, 1.5]);
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(1), .25))')], [.25, .5, 1.5]);
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(1), 1, true))')], [0, 1, 1], 'turned, by its center');
    nearList([...run('list(editor3DSnapPos(vec3(.3, .6, 1.4), vec3(1), 0))')], [.3, .6, 1.4], 'no step, no snap');
    near(run('editor3DSnap(37, 15)'), 30);
    near(run('editor3DSnap(38, 15)'), 45);
    near(run('editor3DSnap(37, 0)'), 37);
});

test('the view is 2 tan(fov/2) high at depth 1, and a segment\'s distance from the mouse is in pixels', async ()=>
{
    const { run } = await loadGame();
    run('editor3DCameraStart()'); // the game's camera, at z 10 looking down -Z with a fov of 60 degrees
    near(run('editor3DScreenScale(vec3(0, 0, 0))'), 20 * Math.tan(Math.PI / 6));
    near(run('editor3DScreenScale(vec3(5, 3, 5))'), 10 * Math.tan(Math.PI / 6));
    // the canvas is 1000 high: a world unit at depth 10 is 1000 / (20 tan 30) pixels
    const unit = 1000 / (20 * Math.tan(Math.PI / 6));
    // the renderer's matrices are 32 bit floats, a pixel is good to a thousandth
    const pixels = (a, b)=> assert.ok(Math.abs(a - b) < 1e-3, `${a} is not ${b}`);
    pixels(run('editor3DWithView(()=> editor3DSegmentDistance(vec2(500, 500), vec3(), vec3(2, 0, 0)))'), 0);
    pixels(run('editor3DWithView(()=> editor3DSegmentDistance(vec2(500, 400), vec3(), vec3(2, 0, 0)))'), 100);
    pixels(run(`editor3DWithView(()=> editor3DSegmentDistance(vec2(${500 + 3 * unit}, 500), vec3(), vec3(2, 0, 0)))`), unit);
    assert.equal(run('editor3DWithView(()=> editor3DSegmentDistance(vec2(500, 500), vec3(0, 0, 20), vec3(2, 0, 0)))'),
        Infinity, 'an end behind the camera');
});

test('a surface is the first object the ray hits, leaving some out, or the ground plane', async ()=>
{
    const { run } = await loadGame();
    run(`var low = new EngineObject3D(vec3(0, .5, 0), render3D.boxMesh);
        var high = new EngineObject3D(vec3(0, 2.5, 0), render3D.boxMesh)`);
    nearList([...run('list(editor3DSurface(ray([0, 9, 0], [0, -1, 0])))')], [0, 3, 0]);
    nearList([...run('list(editor3DSurface(ray([0, 9, 0], [0, -1, 0]), new Set([high])))')], [0, 1, 0]);
    nearList([...run('list(editor3DSurface(ray([4, 9, 2], [0, -1, 0])))')], [4, 0, 2], 'the ground');
    assert.equal(run('editor3DSurface(ray([4, 9, 2], [0, 1, 0]))'), undefined, 'the sky');
});

test('a box rests with its bottom on a point, and drops onto what is under it', async ()=>
{
    const { run } = await loadGame();
    nearList([...run('list(editor3DRest(vec3(1, 2, 3), vec3(1, 4, 1)))')], [1, 4, 3]);
    run(`var ground = new EngineObject3D(vec3(0, .5, 0), render3D.boxMesh); ground.scale3D = vec3(4, 1, 4);
        var box = new EngineObject3D(vec3(1, 5, 1), render3D.boxMesh)`);
    nearList([...run('list(editor3DDrop(box.pos3D, vec3(1), new Set([box])))')], [1, 1.5, 1]);
    nearList([...run('list(editor3DDrop(vec3(9, 5, 9), vec3(1, 2, 1)))')], [9, 1, 9], 'onto the ground');
    assert.equal(run('editor3DDrop(vec3(9, -5, 9), vec3(1))'), undefined, 'nothing under it');
});
