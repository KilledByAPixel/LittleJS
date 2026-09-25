import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, engineObjectsCollect, engineObjectsCallback, engineObjectsCollect3D,
    engineObjectsCallback3D, engineObjectsUpdate, PathFinder, vec2, vec3 } = LJS;

// review round 5, the last owner calls: area queries test overlap with a testCenters option, the package exports

test('a circle collects the objects whose box reaches into it, testCenters only those whose center is inside', () =>
{
    // a big object whose center is outside the circle but whose edge is inside it
    const big = new EngineObject(vec2(106, 100), vec2(10));
    const small = new EngineObject(vec2(101, 100), vec2(1));
    const far = new EngineObject(vec2(110, 110), vec2(1));
    try
    {
        const pos = vec2(100, 100), objects = [big, small, far];
        assert.deepEqual(engineObjectsCollect(pos, 4, objects), [big, small], 'the big edge is 1 away, inside a radius of 2');
        assert.deepEqual(engineObjectsCollect(pos, 4, objects, true), [small], 'centers only');
        const called = [];
        engineObjectsCallback(pos, 4, o=> called.push(o), objects, true);
        assert.deepEqual(called, [small], 'the callback takes it too');
    }
    finally { big.destroy(); small.destroy(); far.destroy(); engineObjectsUpdate(); }
});

test('a box size collects overlapping boxes, testCenters only the centers inside it', () =>
{
    const big = new EngineObject(vec2(206, 200), vec2(10));
    const small = new EngineObject(vec2(201, 200), vec2(1));
    try
    {
        const objects = [big, small];
        assert.deepEqual(engineObjectsCollect(vec2(200, 200), vec2(4), objects), [big, small]);
        assert.deepEqual(engineObjectsCollect(vec2(200, 200), vec2(4), objects, true), [small]);
    }
    finally { big.destroy(); small.destroy(); engineObjectsUpdate(); }
});

test('in 3D a number is a sphere diameter, testCenters only the centers inside it', () =>
{
    // in the corner of the old cube of size 4 but outside the sphere of diameter 4
    const corner = new EngineObject3D(vec3(1.8, 1.8, 0));
    corner.size3D = vec3(.1);
    // a big box whose center is outside the sphere, its face inside
    const big = new EngineObject3D(vec3(3, 0, 0));
    big.size3D = vec3(4);
    try
    {
        const objects = [corner, big];
        assert.deepEqual(engineObjectsCollect3D(vec3(), 4, objects), [big], 'a sphere, not a cube');
        assert.deepEqual(engineObjectsCollect3D(vec3(), 4, objects, true), [], 'no center inside');
        assert.deepEqual(engineObjectsCollect3D(vec3(), vec3(4), objects, true), [corner], 'a box, centers only');
        const called = [];
        engineObjectsCallback3D(vec3(), 4, o=> called.push(o), objects, true);
        assert.deepEqual(called, []);
    }
    finally { corner.destroy(); big.destroy(); engineObjectsUpdate(); }
});

test('the package lets dist files be imported and ships the Box2D wasm once', () =>
{
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.exports['./dist/*'], './dist/*');
    assert.equal(pkg.exports['.'].default, './dist/littlejs.esm.js', 'the main entry as before');
    assert.ok(pkg.files.some(f=> f.startsWith('!') && f.includes('plugins/box2d.wasm')), 'the plugins copy left out');
});

test('PathFinder searches the whole grid by default, and says when a lower limit made it give up', () =>
{
    // a long wall with one gap at the far end, the path goes all the way round
    const pf = new PathFinder(vec2(120, 60));
    pf.isWalkable = (x, y)=> !(y === 30 && x < 119);
    const path = pf.findPath(vec2(2.5, 2.5), vec2(2.5, 57.5));
    assert.ok(path.length > 1, 'found round the wall');
    assert.equal(pf.searchGaveUp, false);

    pf.maxLoop = 50;
    assert.deepEqual(pf.findPath(vec2(2.5, 2.5), vec2(2.5, 57.5)), []);
    assert.equal(pf.searchGaveUp, true, 'gave up, not no way through');

    // no way through at all is not giving up
    pf.maxLoop = undefined;
    pf.isWalkable = (x, y)=> y !== 30;
    assert.deepEqual(pf.findPath(vec2(2.5, 2.5), vec2(2.5, 57.5)), []);
    assert.equal(pf.searchGaveUp, false);
});
