import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// mesh.setVertexData takes a mesh's vertices already in the GPU layout and sends them as they are: the same bytes a
// points mesh packs, its triangles turned round for the pass as they are copied, its radius and box measured from
// the data, and picked from it; the methods that work on points assert on it

// the script build with GL stood in, every buffer upload kept as a plain copy of what was sent
function engine()
{
    const { run } = loadEngine();
    run(`
        new Render3DPlugin;
        var uploads = [], deleted = [], bound = {}, made = 0;
        glContext = new Proxy({ ARRAY_BUFFER: 'ARRAY', ELEMENT_ARRAY_BUFFER: 'ELEMENT', STATIC_DRAW: 1, DYNAMIC_DRAW: 2,
            UNSIGNED_SHORT: 'SHORT', UNSIGNED_INT: 'INT' }, { get: (t, key)=>
            key in t ? t[key] :
            key == 'createBuffer' ? ()=> ({ id: made++ }) :
            key == 'bindBuffer' ? (target, b)=> bound[target] = b :
            key == 'bufferData' ? (target, data)=> uploads.push({ target, buffer: bound[target]?.id,
                type: data.constructor.name, bytes: Array.from(new Uint8Array(data.buffer || data, data.byteOffset || 0,
                data.byteLength)) }) :
            key == 'deleteBuffer' ? (b)=> deleted.push(b?.id) :
            ()=> {} });
        render3D.program = {};
        // a points mesh's packed data and its triangles counter clockwise, the form setVertexData takes
        var packed = (mesh)=>
        {
            uploads = [];
            mesh.upload();
            const data = new Float32Array(new Uint8Array(uploads[0].bytes).buffer);
            const gpu = Array.from(new Uint16Array(new Uint8Array(uploads[1].bytes).buffer));
            const indices = new Uint32Array(gpu.length);
            for (let t = 0; t < gpu.length; t += 3)
                indices[t] = gpu[t], indices[t+1] = gpu[t+2], indices[t+2] = gpu[t+1];
            return { data, indices };
        };
    `);
    return run;
}

test('a mesh given the packed data and triangles of a points mesh sends the GPU the same bytes', () =>
{
    const run = engine();
    const same = run(`
        const box = buildBox(vec3(2, 1, 3)), { data, indices } = packed(box), sent = uploads;
        const copy = Uint32Array.from(indices);
        uploads = [];
        const mesh = new Mesh().setVertexData(data, indices);
        mesh.upload();
        JSON.stringify([sent.map((u)=> u.bytes), uploads.map((u)=> u.bytes), uploads.map((u)=> u.type),
            [mesh.indexType, mesh.bufferCount, box.bufferCount, mesh.dirty, mesh.vertexCount],
            Array.from(indices).join() == Array.from(copy).join()])
    `);
    const [before, after, types, fields, unchanged] = JSON.parse(same);
    assert.deepEqual(after, before, 'the vertex bytes and the index bytes');
    assert.deepEqual(types, ['Float32Array', 'Uint16Array']);
    assert.deepEqual(fields, ['SHORT', 36, 36, false, 24]);
    assert.ok(unchanged, "the game's index array is never changed");
});

test('over 65535 vertices the triangles go up as 32 bit indices', () =>
{
    const run = engine();
    const [type, indexType, count] = JSON.parse(run(`
        const count = 65537, data = new Float32Array(count * RENDER3D_VERTEX_FLOATS);
        const mesh = new Mesh().setVertexData(data, new Uint32Array([0, 1, 65536]));
        uploads = [];
        mesh.upload();
        JSON.stringify([uploads[1].type, mesh.indexType, mesh.vertexCount])
    `));
    assert.deepEqual([type, indexType, count], ['Uint32Array', 'INT', 65537]);
});

test('only vertexCount vertices of a longer array are sent', () =>
{
    const run = engine();
    const bytes = JSON.parse(run(`
        const mesh = new Mesh().setVertexData(new Float32Array(10 * RENDER3D_VERTEX_FLOATS), new Uint16Array([0, 1, 2]), 3);
        uploads = [];
        mesh.upload();
        uploads[0].bytes.length
    `));
    assert.equal(bytes, 3 * RENDER3D_VERTEX_FLOATS_BYTES);
});
const RENDER3D_VERTEX_FLOATS_BYTES = 9 * 4;

test('the radius and box are measured from the data, as a points mesh measures them', () =>
{
    const run = engine();
    const [a, b] = JSON.parse(run(`
        const box = buildSphere(3).transform(vec3(1, 2, 0)), { data, indices } = packed(box);
        const mesh = new Mesh().setVertexData(data, indices);
        const pick = (m)=> [m.computeRadius(), m.getBounds().min.toString(), m.getBounds().max.toString()];
        JSON.stringify([pick(box), pick(mesh)])
    `));
    assert.ok(Math.abs(a[0] - b[0]) < 1e-5, a[0] + ' ' + b[0]);
    assert.deepEqual(b.slice(1), a.slice(1));
});

test('meshWriteVertex writes the layout a points mesh packs', () =>
{
    const run = engine();
    const [written, wanted] = JSON.parse(run(`
        const box = buildBox(), { data } = packed(box);
        const floats = new Float32Array(RENDER3D_VERTEX_FLOATS), ints = new Uint32Array(floats.buffer), d = data, i = new Uint32Array(d.buffer);
        meshWriteVertex(floats, ints, 0, d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], i[8]);
        JSON.stringify([Array.from(ints), Array.from(i.subarray(0, 9))])
    `));
    assert.deepEqual(written, wanted);
});

test('a ray hits the mesh where it hits the points mesh with the same triangles, from behind only when doubleSided', () =>
{
    const run = engine();
    const hits = JSON.parse(run(`
        const sphere = buildSphere(2), { data, indices } = packed(sphere);
        const mesh = new Mesh().setVertexData(data, indices);
        const rays = [new Ray3D(vec3(0, 0, 5), vec3(0, 0, -1)), new Ray3D(vec3(.3, .4, -6), vec3(0, 0, 1)),
            new Ray3D(vec3(5, 5, 5), vec3(-1, -1, -1)), new Ray3D(vec3(0, 3, 0), vec3(1, 0, 0))];
        const out = rays.map((ray)=> [render3DRaycastMesh(ray, sphere), render3DRaycastMesh(ray, mesh)]);
        const inside = new Ray3D(vec3(), vec3(0, 0, 1));
        const behind = [render3DRaycastMesh(inside, mesh)];
        mesh.doubleSided = true;
        behind.push(render3DRaycastMesh(inside, mesh));
        JSON.stringify([out, behind])
    `));
    const [pairs, behind] = hits;
    for (const [a, b] of pairs) // the data holds 32 bit floats
        assert.ok(a === b || Math.abs(a - b) < 1e-5, a + ' ' + b);
    assert.ok(pairs[0][0] > 0 && pairs[3][0] === null, 'one hits and one misses');
    assert.equal(behind[0], null, 'the inside of a closed mesh is not hit');
    assert.ok(behind[1] > 0, 'doubleSided is hit from behind');
});

test('an object takes its size from the mesh, and the pick finds it', () =>
{
    const run = engine();
    const [size, distance] = JSON.parse(run(`
        const { data, indices } = packed(buildBox(vec3(2, 4, 6)));
        const o = new EngineObject3D(vec3(0, 0, -10), new Mesh().setVertexData(data, indices));
        const d = render3DRaycastObject(new Ray3D(vec3(), vec3(0, 0, -1)), o);
        o.destroy();
        JSON.stringify([[o.size3D.x, o.size3D.y, o.size3D.z], d])
    `));
    assert.deepEqual(size, [2, 4, 6]);
    assert.ok(Math.abs(distance - 7) < 1e-6, distance);
});

test('the methods that read or change points assert on a mesh given its vertex data', () =>
{
    const run = engine();
    const thrown = JSON.parse(run(`
        const { data, indices } = packed(buildBox());
        const mesh = new Mesh().setVertexData(data, indices);
        const calls = { transform: ()=> mesh.transform(vec3(1)), combine: ()=> new Mesh().combine(mesh),
            combineInto: ()=> mesh.combine(buildBox()), computeNormals: ()=> mesh.computeNormals(),
            getTriangles: ()=> mesh.getTriangles(), toIndexed: ()=> mesh.toIndexed(), setColor: ()=> mesh.setColor(RED),
            subtract: ()=> buildBox().subtract(mesh), mirror: ()=> mesh.mirror(), addStrip: ()=> mesh.addStrip([vec3(), vec3(1), vec3(2)]) };
        JSON.stringify(Object.entries(calls).filter(([name, f])=> { try { f(); return false; } catch(e) { return true; } })
            .map(([name])=> name))
    `));
    assert.deepEqual(thrown, ['transform', 'combine', 'combineInto', 'computeNormals', 'getTriangles', 'toIndexed',
        'setColor', 'subtract', 'mirror', 'addStrip']);
});

test('setVertexData empties the points, and checks what it is given', () =>
{
    const run = engine();
    const [points, indices, asserts] = JSON.parse(run(`
        const box = buildBox().toIndexed(), { data, indices } = packed(buildBox());
        box.setVertexData(data, indices);
        const bad = [()=> new Mesh().setVertexData([1, 2, 3], new Uint16Array(3)),
            ()=> new Mesh().setVertexData(data, [0, 1, 2]),
            ()=> new Mesh().setVertexData(data, new Uint16Array([0, 1])),
            ()=> new Mesh().setVertexData(data, new Uint16Array([0, 1, 999]))];
        JSON.stringify([box.points.length, box.indices === undefined,
            bad.map((f)=> { try { f(); return false; } catch(e) { return true; } })])
    `));
    assert.equal(points, 0);
    assert.ok(indices);
    assert.deepEqual(asserts, [true, true, true, true]);
});

test('a lost context uploads the kept arrays again, and dispose frees both buffers', () =>
{
    const run = engine();
    const [first, again, freed] = JSON.parse(run(`
        const { data, indices } = packed(buildBox());
        const mesh = new Mesh().setVertexData(data, indices);
        uploads = [];
        mesh.upload();
        const first = uploads.map((u)=> u.bytes);
        const buffers = [mesh.buffer.id, mesh.indexBuffer.id];
        mesh.dispose();
        const freed = deleted.slice(-2).join() == buffers.join();
        ++render3D.contextGeneration; // a context lost and back
        uploads = [];
        mesh.upload();
        JSON.stringify([first, uploads.map((u)=> u.bytes), freed && !!mesh.buffer])
    `));
    assert.deepEqual(again, first);
    assert.ok(freed, 'dispose freed the vertex and index buffers, and the next upload made new ones');
});
