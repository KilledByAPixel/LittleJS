import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Render3DPlugin, InstancedMesh3D, buildBox, buildMatrix, vec3, hsl } from '../dist/littlejs.esm.js';

// an InstancedMesh3D's culling sphere holds every instance set so far: it grows with each set as cheaply as it can,
// its square roots taken only when the radius is read, and a color change leaves it alone

new Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-5, message ?? `${a} is not ${b}`);

test('the radius is the farthest instance plus the mesh at the largest scale, exactly', ()=>
{
    const mesh = buildBox(), set = new InstancedMesh3D(mesh, 3), meshRadius = mesh.computeRadius();
    set.setMatrixAt(0, buildMatrix(vec3(3, 4, 0)));                      // 5 from the origin
    set.setMatrixAt(1, buildMatrix(vec3(), undefined, vec3(2, 1, 1)));   // stretched 2 across
    near(set.radius, 5 + 2 * meshRadius);
    set.setMatrixAt(2, buildMatrix(vec3(0, 0, -12)));                    // farther, and it grows
    near(set.radius, 12 + 2 * meshRadius);
    set.setMatrixAt(2, buildMatrix(vec3()));                             // it never shrinks
    near(set.radius, 12 + 2 * meshRadius);
    set.destroy();
});

test('a color change marks the instance to upload and leaves the bounds alone', ()=>
{
    const set = new InstancedMesh3D(buildBox(), 4), before = set.radius;
    set.render3D(); // headless it uploads nothing, the dirty range is cleared as after a draw
    set.dirtyStart = Infinity, set.dirtyEnd = 0;
    set.instanceData[2 * 24 + 12] = 50; // moved by hand and not marked, which a color change must not read
    set.setColorAt(2, hsl(0, 1, .5));
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [2, 3], 'the one instance uploads');
    near(set.radius, before, 'the bounds did not take the unmarked move');
    set.markDirty(2);
    assert.ok(set.radius >= 50, 'marking it takes the move in');
    set.destroy();
});
