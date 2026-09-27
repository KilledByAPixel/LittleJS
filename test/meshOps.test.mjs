import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, buildBox, buildCylinder, buildCone, buildSphere, buildGrid, buildLathe, buildMatrix, vec2, vec3, PI }
    from '../dist/littlejs.esm.js';

// mesh operations: bevels on the builders, CSG, mirror and spin

// the mesh as an indexed triangle list, whatever form it was built in
const triangles = (mesh)=> new Mesh().combine(mesh).toIndexed();

// signed volume, positive for a closed mesh whose faces point out
function volume(mesh)
{
    const m = triangles(mesh);
    let v = 0;
    for (let t = 0; t < m.indices.length; t += 3)
    {
        const a = m.points[m.indices[t]], b = m.points[m.indices[t+1]], c = m.points[m.indices[t+2]];
        v += a.dot(b.cross(c)) / 6;
    }
    return v;
}

// closed and wound one way: every edge between two places is run as often one way as the other
function isClosed(mesh)
{
    const m = triangles(mesh), edges = new Map;
    const key = (p)=> `${Math.round(p.x*1e5)},${Math.round(p.y*1e5)},${Math.round(p.z*1e5)}`;
    for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; ++e)
    {
        const a = key(m.points[m.indices[t+e]]), b = key(m.points[m.indices[t+(e+1)%3]]);
        if (a !== b)
            edges.set(a + '|' + b, (edges.get(a + '|' + b) || 0) + 1);
    }
    if (!edges.size) return false;
    for (const [edge, count] of edges)
    {
        const [a, b] = edge.split('|');
        if (edges.get(b + '|' + a) !== count) return false;
    }
    return true;
}

const near = (a, b, epsilon=1e-6, message='')=> assert.ok(Math.abs(a - b) < epsilon, `${message} ${a} != ${b}`);

test('the helpers: a plain box is closed and has its volume', () =>
{
    assert.equal(isClosed(buildBox(2)), true);
    near(volume(buildBox(vec3(1, 2, 3))), 6);
    assert.equal(isClosed(buildGrid(vec2(2))), false);
});

test('a box with no bevel is exactly the box it was', () =>
{
    const plain = buildBox(vec3(2, 4, 6)), none = buildBox(vec3(2, 4, 6), 0, 3);
    assert.deepEqual(none.points, plain.points);
    assert.deepEqual(none.normals, plain.normals);
    assert.deepEqual(none.uvs, plain.uvs);
});

test('a chamfered box keeps its size, is closed, and has the volume the cut leaves', () =>
{
    const box = buildBox(2, .5);
    const {min, max} = box.getBounds();
    near(min.x, -1); near(max.y, 1); near(max.z, 1);
    assert.equal(isClosed(box), true);
    // inner cube 1, six face slabs 3, twelve edge prisms 1.5, eight corner tetrahedra 1/6
    near(volume(box), 17/3, 1e-6);
    for (const n of box.normals)
        near(n.length(), 1);
});

test('a rounded box is closed, rounder than the chamfer and just under the smooth volume', () =>
{
    const box = buildBox(2, .5, 16);
    assert.equal(isClosed(box), true);
    const smooth = 1 + 3 + 12 * .25 * PI / 4 + 4 / 3 * PI * .125; // quarter cylinders and a whole sphere
    const v = volume(box);
    assert.ok(v < smooth && v > smooth * .99, 'volume ' + v);
    for (const n of box.normals)
        near(n.length(), 1);
});

test('a bevel too big is clamped, and one that closes an axis still makes a closed box', () =>
{
    const octahedron = buildBox(2, 5, 1); // clamped to 1, every face and edge gone, the corners meet
    near(volume(octahedron), 4 / 3);
    assert.equal(isClosed(octahedron), true);
    const {min, max} = octahedron.getBounds();
    near(min.x, -1); near(max.x, 1);
    const flat = buildBox(vec3(2, 2, 1), .5, 3); // z closes, its faces and edges along z have no size
    assert.equal(isClosed(flat), true);
    assert.equal(isClosed(buildBox(2, .3, 0)), true); // no segments is one
    assert.equal(isClosed(buildBox(2, .3, 2.7)), true); // a fraction is whole
});

test('a beveled face keeps the uvs a plain box face has', () =>
{
    const box = buildBox(2, .5);
    // the +z face's inner corner at (.5, .5, 1) sits three quarters across and a quarter down its face
    const i = box.points.findIndex((p, i)=> Math.abs(p.x - .5) < 1e-9 && Math.abs(p.y - .5) < 1e-9 &&
        Math.abs(p.z - 1) < 1e-9 && box.normals[i].z > .999);
    assert.ok(i >= 0);
    near(box.uvs[i].x, .75); near(box.uvs[i].y, .25);
});
