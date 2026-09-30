import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Render3DPlugin, InstancedMesh3D, buildBox, vec3 } from '../dist/littlejs.esm.js';

// the bulk path: setTransforms takes a game's arrays of positions, rotations and scales and writes every instance's
// matrix in one loop, and markDirtyRange marks a run of instances written into matrixData directly

new Render3DPlugin;
const cleared = (set)=> (set.dirtyStart = set.boundsStart = Infinity, set.dirtyEnd = set.boundsEnd = 0, set);

test('setTransforms writes what setTransformAt writes, from plain or typed arrays, at any start', ()=>
{
    const n = 6, x = [], y = [], z = [], rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
    const sx = [], sy = [], sz = [];
    for (let i = 0; i < n; ++i)
    {
        x.push(i - 3), y.push(i * .5), z.push(-i);
        rx[i] = .3 + i * .7, ry[i] = -1.1 + i * .4, rz[i] = .2 * i + .1;
        sx.push(1 + i * .1), sy.push(-.5 + i * .3 || 1), sz.push(2);
    }
    for (const scaled of [false, true])
    {
        const bulk = new InstancedMesh3D(buildBox(), n), each = new InstancedMesh3D(buildBox(), n);
        scaled ? bulk.setTransforms(1, 4, x, y, z, rx, ry, rz, sx, sy, sz) : bulk.setTransforms(1, 4, x, y, z, rx, ry, rz);
        for (let i = 1; i < 5; ++i)
            each.setTransformAt(i, vec3(x[i], y[i], z[i]), vec3(rx[i], ry[i], rz[i]),
                scaled ? vec3(sx[i], sy[i], sz[i]) : undefined);
        assert.deepEqual([...bulk.matrixData], [...each.matrixData], 'scaled ' + scaled);
        bulk.destroy(), each.destroy();
    }
});

test('without rotation arrays the instances are placed upright, as setTransformAt places them', ()=>
{
    const bulk = new InstancedMesh3D(buildBox(), 2), each = new InstancedMesh3D(buildBox(), 2);
    bulk.setTransforms(0, 2, [1, 2], [3, 4], [5, 6]);
    each.setTransformAt(0, vec3(1, 3, 5)), each.setTransformAt(1, vec3(2, 4, 6));
    assert.deepEqual([...bulk.matrixData], [...each.matrixData]);
    // a zero rotation goes through the trig, which gives the same matrix, a -0 where upright writes 0
    bulk.setTransforms(0, 2, [1, 2], [3, 4], [5, 6], [0, 0], [0, 0], [0, 0]);
    assert.ok(bulk.matrixData.every((v, i)=> v == each.matrixData[i]));
    bulk.destroy(), each.destroy();
});

test('setTransforms marks the run it wrote, to upload and for the bounds', ()=>
{
    const set = cleared(new InstancedMesh3D(buildBox(), 8));
    set.setTransforms(2, 3, [0, 0, 0, 0, 40, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]);
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [2, 5]);
    assert.deepEqual([set.colorDirtyStart, set.colorDirtyEnd], [0, 8], 'the colors as they were');
    assert.ok(set.radius >= 40, 'the bounds take in the far one');
    set.destroy();
});

test('markDirtyRange marks instances written into matrixData directly', ()=>
{
    const set = cleared(new InstancedMesh3D(buildBox(), 8));
    set.matrixData[5 * 16 + 12] = 60;
    set.markDirtyRange(3, 6);
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [3, 6]);
    assert.ok(set.radius >= 60);
    set.markDirtyRange(1, 2);
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [1, 6], 'ranges widen');
    set.destroy();
});
