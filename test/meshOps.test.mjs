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

test('a cylinder and cone with no bevel are exactly what they were', () =>
{
    assert.deepEqual(buildCylinder(2, 3, 12, true, true, 0).points, buildCylinder(2, 3, 12, true).points);
    assert.deepEqual(buildCone(2, 3, 12, false, true, 0).points, buildCone(2, 3, 12, false).points);
});

test('a beveled cylinder keeps its size, is closed, and loses a little volume at each rim', () =>
{
    for (const segments of [1, 4])
    for (const smooth of [true, false])
    {
        const plain = buildCylinder(2, 2, 24, smooth), beveled = buildCylinder(2, 2, 24, smooth, true, .25, segments);
        const {min, max} = beveled.getBounds();
        near(min.y, -1); near(max.y, 1); near(max.x, 1, 1e-6);
        assert.equal(isClosed(beveled), true, `segments ${segments} smooth ${smooth}`);
        const v = volume(beveled), full = volume(plain);
        assert.ok(v < full && v > full * .9, `volume ${v} of ${full}`);
        for (const n of beveled.normals)
            near(n.length(), 1);
    }
});

test('a bevel as big as the cylinder allows is clamped, and still closed', () =>
{
    const round = buildCylinder(2, 1, 16, true, true, 5, 4); // clamped to the half height .5
    assert.equal(isClosed(round), true);
    const {min, max} = round.getBounds();
    near(min.y, -.5); near(max.y, .5); near(max.x, 1, 1e-6);
    assert.ok(volume(round) < volume(buildCylinder(2, 1, 16, true)), 'the clamped bevel still cuts');
});

test('a beveled cone rounds only its base rim, keeps its size and is closed', () =>
{
    for (const segments of [1, 4])
    {
        const plain = buildCone(2, 2, 24, true), beveled = buildCone(2, 2, 24, true, true, .3, segments);
        const {min, max} = beveled.getBounds();
        near(min.y, -1); near(max.y, 1);
        assert.ok(max.x < 1 && max.x > .8, 'the rim, the widest place, is cut back ' + max.x);
        assert.equal(isClosed(beveled), true);
        assert.ok(volume(beveled) < volume(plain));
        assert.equal(isClosed(buildCone(2, 2, 24, true, true, 5, segments)), true); // clamped
    }
});

test('mirror adds the mirror image, the right way out, and leaves the mesh as it was', () =>
{
    const half = new Mesh().combine(buildBox(1), vec3(1, 0, 0));
    const count = half.points.length;
    const whole = half.mirror(vec3(1, 0, 0));
    assert.equal(half.points.length, count);
    assert.equal(triangles(whole).indices.length, triangles(half).indices.length * 2);
    near(volume(whole), 2);
    assert.equal(isClosed(whole), true);
    const {min, max} = whole.getBounds();
    near(min.x, -1.5); near(max.x, 1.5);
    near(volume(buildBox(1).combine(buildBox(1), vec3(0, 2, 0)).mirror(vec3(0, 1, 1))), 4); // any axis, unit or not
});

test('spin makes count copies turned evenly around the axis', () =>
{
    const arm = new Mesh().combine(buildBox(1), vec3(2, 0, 0));
    const ring = arm.spin(4);
    near(volume(ring), 4);
    assert.equal(isClosed(ring), true);
    const {min, max} = ring.getBounds();
    near(min.x, -2.5); near(max.z, 2.5);
    const upright = arm.spin(2, vec3(0, 0, 1)); // around z, the copy lands at -2 on x
    near(upright.getBounds().min.x, -2.5);
    near(volume(arm.spin(1)), 1);
});

test('subtract cuts one box out of another, and the result is closed and indexed', () =>
{
    const outer = buildBox(2), inner = buildBox(1), count = outer.points.length;
    const hollow = outer.subtract(inner);
    near(volume(hollow), 7, 1e-6);
    assert.equal(isClosed(hollow), true);
    assert.ok(hollow.indices, 'indexed');
    assert.equal(outer.points.length, count, 'the inputs are left as they were');
    for (const n of hollow.normals)
        near(n.length(), 1);
});

test('union and intersect of two overlapping cubes, faces coplanar on four sides', () =>
{
    const a = buildBox(1);
    near(volume(a.intersect(a, vec3(.5, 0, 0))), .5);
    near(volume(a.union(a, vec3(.5, 0, 0))), 1.5);
    assert.equal(isClosed(a.intersect(a, vec3(.5, 0, 0))), true);
    assert.equal(isClosed(a.union(a, vec3(.5, 0, 0))), true);
});

test('a disjoint subtract changes nothing, and a disjoint intersect is empty', () =>
{
    const a = buildBox(1);
    near(volume(a.subtract(a, vec3(5, 0, 0))), 1);
    assert.equal(a.intersect(a, vec3(5, 0, 0)).points.length, 0);
});

test('the other mesh is placed by a Matrix4, a turned cube meets a cube in an octagon', () =>
{
    const a = buildBox(1);
    const octagon = a.intersect(a, buildMatrix(vec3(), vec3(0, PI / 4, 0)));
    near(volume(octagon), 2 * (Math.SQRT2 - 1), 1e-5); // a unit square and one turned 45 degrees overlap in an octagon
    assert.equal(isClosed(octagon), true);
});

test('a hole as deep as the wall, cut faces coplanar with both sides', () =>
{
    const wall = buildBox(vec3(2, 2, .4)).subtract(buildBox(vec3(1, 1, .4)));
    near(volume(wall), 1.6 - .4, 1e-6);
    assert.equal(isClosed(wall), true);
});

test('CSG on its own results stays closed: two boxes joined, then a cylinder drilled through', () =>
{
    const block = buildBox(1).union(buildBox(1), vec3(.8, 0, 0));
    const drilled = block.subtract(buildCylinder(.5, 2, 16));
    assert.equal(isClosed(drilled), true);
    assert.ok(volume(drilled) < volume(block) && volume(drilled) > 0);
});

test('a mirroring matrix places the cutter the right way out', () =>
{
    const cutter = new Mesh().combine(buildBox(1), vec3(.5, 0, 0)); // from 0 to 1 on x
    const cut = buildBox(2).subtract(cutter, buildMatrix(vec3(), vec3(), vec3(-1, 1, 1))); // flipped to -1..0
    near(volume(cut), 7, 1e-6);
    assert.equal(isClosed(cut), true);
    near(cut.getBounds().max.x, 1);
});

test('big smooth meshes do not overflow the stack and stay closed', () =>
{
    const ball = buildSphere(2, 64, 32);
    const bitten = ball.subtract(ball, vec3(.8, .3, 0));
    assert.equal(isClosed(bitten), true);
    assert.ok(volume(bitten) > 0 && volume(bitten) < volume(ball));
});

test('a spun ring of cylinders drills a ring of holes in one subtract', () =>
{
    const pins = new Mesh().combine(buildCylinder(.2, 2, 12), vec3(.8, 0, 0)).spin(6);
    const disc = buildCylinder(2.4, .3, 32).subtract(pins);
    assert.equal(isClosed(disc), true);
    assert.ok(volume(disc) < volume(buildCylinder(2.4, .3, 32)));
});

test('CSG with an open or doubleSided mesh asserts', () =>
{
    assert.throws(()=> buildBox(1).subtract(buildGrid(vec2(2))), /Assert failed/);
    assert.throws(()=> buildBox(1).union(buildLathe([[1, -1], [1, 1]], 8, true, false)), /Assert failed/);
    const open = new Mesh().addQuad(vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0));
    assert.throws(()=> buildBox(1).intersect(open), /Assert failed/);
});
