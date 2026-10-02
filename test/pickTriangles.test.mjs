import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// render3D.pick and engineObjectsRaycast3D hit a mesh on its triangles, the ones that face the ray as the pass draws
// them, and not on the box around it.

const { vec3, Ray3D, Mesh, EngineObject3D, buildSphere, buildBox, buildCone, PI } = LJS;
new LJS.Render3DPlugin;
const render3D = LJS.render3D;
const pick = (o, origin, direction)=> render3D.pick(new Ray3D(origin, direction), [o])?.distance;
const near = (a, b, epsilon=1e-6)=> assert.ok(Math.abs(a - b) < epsilon, `${a} is not ${b}`);
const made = [];
const object = (pos, mesh)=> { const o = new EngineObject3D(pos, mesh); made.push(o); return o; };
const clear = ()=> { for (const o of made.splice(0)) o.destroy(); };
const down = vec3(0, -1, 0), back = vec3(0, 0, -1);

// one triangle in the z = 0 plane, the half of its box below the line from (0,0) to (2,2) empty, facing +z
function corner(doubleSided=false)
{
    const mesh = new Mesh;
    mesh.addTriangles([vec3(0, 0, 0), vec3(2, 2, 0), vec3(0, 2, 0)], [0, 1, 2]);
    mesh.doubleSided = doubleSided;
    return mesh;
}

test('a ray through the box of a mesh that misses its triangles misses it', ()=>
{
    try
    {
        const ball = object(vec3(), buildSphere(2, 32, 16));
        near(pick(ball, vec3(0, 0, 10), back), 9, .01);
        assert.equal(pick(ball, vec3(.9, .9, 10), back), undefined, 'by the corner of its box, outside the ball');
        const cone = object(vec3(20, 0, 0), buildCone(2, 2));
        assert.ok(pick(cone, vec3(20, -.9, 10), back) !== undefined, 'the wide foot of a cone');
        assert.equal(pick(cone, vec3(20.8, .8, 10), back), undefined, 'beside its tip');
        const flat = object(vec3(40, 0, 0), corner());
        near(pick(flat, vec3(40.5, 1.5, 10), back), 10);
        assert.equal(pick(flat, vec3(41.5, .5, 10), back), undefined, 'the empty half of its box');
    }
    finally { clear(); }
});

test('a face is hit from the side it shows, both sides when the mesh is doubleSided', ()=>
{
    try
    {
        const flat = object(vec3(), corner());
        assert.equal(pick(flat, vec3(.5, 1.5, -10), vec3(0, 0, 1)), undefined, 'from behind');
        const sheet = object(vec3(10, 0, 0), corner(true));
        near(pick(sheet, vec3(10.5, 1.5, -10), vec3(0, 0, 1)), 10);
        near(pick(sheet, vec3(10.5, 1.5, 10), back), 10);

        // from inside a box its walls are not drawn, and not hit; an open one is hit where the ray leaves
        const room = object(vec3(30, 0, 0), buildBox(vec3(20, 4, 20)));
        assert.equal(pick(room, vec3(30, 0, 0), back), undefined);
        room.mesh.doubleSided = true;
        near(pick(room, vec3(30, 0, 0), back), 10);
    }
    finally { clear(); }
});

test('the distance is in the world, whatever the object\'s scale, turn or mirroring', ()=>
{
    try
    {
        const slab = object(vec3(0, 0, 0), buildBox());
        slab.scale3D = vec3(4, 2, 6);
        slab.rotation3D = vec3(0, PI / 2, 0); // its 6 long side now along x
        near(pick(slab, vec3(10, 0, 0), vec3(-1, 0, 0)), 7);
        near(pick(slab, vec3(0, 10, 0), down), 9);
        near(pick(slab, vec3(0, 10, 0), down.scale(2)), 4.5, 1e-6); // a direction twice as long, half the count
        assert.equal(pick(slab, vec3(2.5, 0, 2.5), down), undefined, 'the turned box is not at its unturned corner');

        const mirrored = object(vec3(20, 0, 0), buildSphere(2));
        mirrored.scale3D = vec3(-1, 1, 1);
        assert.ok(pick(mirrored, vec3(20, 0, 10), back) < 9.1, 'its outside is still its outside');
    }
    finally { clear(); }
});

test('a strip mesh and the same mesh as an indexed list are hit the same', ()=>
{
    try
    {
        const strip = object(vec3(), buildSphere(2, 12, 6)), list = object(vec3(), buildSphere(2, 12, 6).toIndexed());
        assert.ok(list.mesh.indices && !strip.mesh.indices);
        for (const [x, y] of [[0, 0], [.3, .5], [-.7, .2], [.6, -.6], [.95, 0], [.8, .8]])
        {
            const a = pick(strip, vec3(x, y, 10), back), b = pick(list, vec3(x, y, 10), back);
            a === undefined ? assert.equal(b, undefined) : near(a, b, 1e-9);
        }
    }
    finally { clear(); }
});

test('the nearest face wins, and a ray of no length is where it starts', ()=>
{
    try
    {
        const ball = object(vec3(), buildSphere(2, 32, 16));
        ball.mesh.doubleSided = true;
        near(pick(ball, vec3(0, 0, 10), back), 9, .01); // the near side, not the far one
        assert.equal(pick(ball, vec3(0, 0, -10), back), undefined, 'behind the ray');
        assert.equal(pick(ball, vec3(.2, 0, 0), vec3()), 0);
    }
    finally { clear(); }
});
