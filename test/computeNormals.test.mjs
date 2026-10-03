import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, buildSphere, buildBox, buildTorus, buildCylinder, parseOBJ, Vector3, vec2, vec3, clamp }
    from '../dist/littlejs.esm.js';

// Mesh.computeNormals works in numbers, grouping the points at one place by their rounded position: its normals must
// be what the version of Vector3 methods and text keys gave, to the last bit, which this file keeps to compare with.

const DEFAULT = Object.freeze(vec3(0, 1, 0));
const placeKey = (p)=> `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
function addCorner(sums, a, b, c, normal)
{
    const u = b.subtract(a), v = c.subtract(a);
    const angle = Math.acos(clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
    const k = placeKey(a);
    sums.set(k, (sums.get(k) || vec3()).add(normal.scale(angle)));
}

// the smooth normals as computeNormals(true) gave them before
function oldSmooth(mesh)
{
    const points = mesh.points, indices = mesh.indices, sums = new Map;
    if (indices)
    {
        for (let t = 0; t < indices.length; t += 3)
        {
            const a = points[indices[t]], b = points[indices[t+1]], c = points[indices[t+2]];
            const cross = b.subtract(a).cross(c.subtract(a));
            if (!cross.lengthSquared()) continue;
            const normal = cross.normalize();
            for (let j = 0; j < 3; ++j)
                addCorner(sums, points[indices[t+j]], points[indices[t+(j+1)%3]], points[indices[t+(j+2)%3]], normal);
        }
        return points.map((p)=> { const s = sums.get(placeKey(p)); return s && s.lengthSquared() ? s.normalize() : DEFAULT; });
    }
    const n = points.length;
    for (let i = 0; i + 2 < n; ++i)
    {
        const normal = points[i+1].subtract(points[i]).cross(points[i+2].subtract(points[i]));
        if (!normal.lengthSquared()) continue;
        const f = normal.normalize(i & 1 ? 1 : -1);
        for (let j = 0; j < 3; ++j)
            addCorner(sums, points[i+j], points[i+(j+1)%3], points[i+(j+2)%3], f);
    }
    return points.map((p)=> (sums.get(placeKey(p)) || DEFAULT).normalize());
}

// the flat normals as computeNormals(false) gave them before, for a strip
function oldFlatStrip(points)
{
    const normals = points.map(()=> DEFAULT);
    for (let i = 0; i + 2 < points.length; ++i)
    {
        const normal = points[i+1].subtract(points[i]).cross(points[i+2].subtract(points[i]));
        if (normal.lengthSquared())
            normals[i] = normals[i+1] = normals[i+2] = normal.normalize(i & 1 ? 1 : -1);
    }
    return normals;
}

// a flag waved as the trails short waves it, points moved off their grid
function wavedFlag()
{
    const mesh = buildGrid(vec2(4, 2.5), vec2(16, 10));
    mesh.points = mesh.points.map((p)=> vec3(p.x, p.y, Math.sin(p.x * 3 + 1.7) * .3 * (p.x + 2)));
    return mesh;
}
const house = `v -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv -1 1.2 -1\nv 1 1.2 -1\nv 1 1.2 1\nv -1 1.2 1\n` +
    `v 0 2.2 -.8\nv 0 2.2 .8\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\nf 1 2 3 4\nf 5 8 10 9\nf 7 6 9 10\n` +
    `f 5 9 6\nf 7 10 8`;
const meshes = ()=> ({ flag: wavedFlag(), sphere: buildSphere(1, 12, 8), box: buildBox(vec3(1, 2, 3)),
    torus: buildTorus(2, .5, 16, 8), cylinder: buildCylinder(1, 2, 10), house: parseOBJ(house, false), smoothHouse: parseOBJ(house, true) });
const bits = (normals)=> normals.map((n)=> [n.x, n.y, n.z]);

test('smooth normals are what they were, to the last bit, on strips and on indexed meshes', () =>
{
    for (const [name, mesh] of Object.entries(meshes()))
    {
        const expected = bits(oldSmooth(mesh));
        assert.deepEqual(bits(mesh.computeNormals(true).normals), expected, name);
    }
});

test('flat normals are what they were on a strip, and every one is a Vector3 of its own or the default', () =>
{
    const mesh = wavedFlag(), expected = bits(oldFlatStrip(mesh.points));
    assert.deepEqual(bits(mesh.computeNormals(false).normals), expected);
    assert.ok(mesh.normals.every((n)=> n instanceof Vector3));
});

test('smooth normals of a mesh where faces meet back to back at a place are still what they were', () =>
{
    // two triangles on one plane facing apart share their points, so their normals cancel there
    const mesh = buildGrid(vec2(1), 1);
    mesh.points = [...mesh.points, ...[...mesh.points].reverse()];
    mesh.normals = mesh.points.map(()=> DEFAULT), mesh.uvs = mesh.points.map(()=> vec2());
    mesh.colors = mesh.points.map(()=> undefined);
    const expected = bits(oldSmooth(mesh));
    assert.deepEqual(bits(mesh.computeNormals(true).normals), expected);
});

test('smooth normals make one vector a point and none for each triangle', () =>
{
    const mesh = wavedFlag(), proto = Vector3.prototype;
    let made = 0;
    const methods = ['subtract', 'add', 'scale', 'cross', 'normalize', 'copy'], saved = methods.map((m)=> proto[m]);
    methods.forEach((m, i)=> proto[m] = function(...a) { ++made; return saved[i].apply(this, a); });
    try { mesh.computeNormals(true); }
    finally { methods.forEach((m, i)=> proto[m] = saved[i]); }
    assert.ok(made <= mesh.points.length, `${made} for ${mesh.points.length} points`);
});
