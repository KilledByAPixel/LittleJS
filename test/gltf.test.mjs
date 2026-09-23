import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGLTF, GLTFModel, GLTFPart, vec3, EngineObject3D, engineObjects } from '../dist/littlejs.esm.js';

const near = (a, b, msg)=> assert.ok(Math.abs(a - b) < 1e-4, `${msg || ''} ${a} vs ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x, 'x'); near(v.y, y, 'y'); near(v.z, z, 'z'); };

// a hand made model: a quad with normals and uvs at mesh 0, and at mesh 1 a triangle over the quad's first three
// corners with no normals, in one buffer
// node 0 is the quad moved up one, node 1 its child, the quad again turned a quarter around y and doubled,
// node 2 the triangle; the quad's material is red and double sided
const buffer = new ArrayBuffer(160), f = new Float32Array(buffer), u16 = new Uint16Array(buffer, 48, 6);
f.set([-1, -1, 0,  1, -1, 0,  1, 1, 0,  -1, 1, 0], 0);           // positions at 0, 48 bytes
u16.set([0, 1, 2, 0, 2, 3]);                                      // indices at 48, 12 bytes
f.set([0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1], 16);              // normals at 64, 48 bytes
f.set([0, 1,  1, 1,  1, 0,  0, 0], 28);                          // uvs at 112, 32 bytes
const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 160 }],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 48 },
        { buffer: 0, byteOffset: 48, byteLength: 12 },
        { buffer: 0, byteOffset: 64, byteLength: 48 },
        { buffer: 0, byteOffset: 112, byteLength: 32 },
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
        { bufferView: 2, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 3, componentType: 5126, count: 4, type: 'VEC2' },
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, // the first three quad corners as a triangle
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, doubleSided: true }],
    meshes: [
        { name: 'quad', primitives: [{ attributes: { POSITION: 0, NORMAL: 2, TEXCOORD_0: 3 }, indices: 1, material: 0 }] },
        { name: 'tri', primitives: [{ attributes: { POSITION: 4 } }] },
    ],
    nodes: [
        { name: 'up', mesh: 0, translation: [0, 1, 0], children: [1] },
        { name: 'turned', mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 2, 2] },
        { mesh: 1 },
    ],
    scenes: [{ nodes: [0, 2] }],
    scene: 0,
};
const base64 = Buffer.from(buffer).toString('base64');
const withDataUri = { ...json, buffers: [{ byteLength: 160, uri: 'data:application/octet-stream;base64,' + base64 }] };

function checkModel(model)
{
    assert.ok(model instanceof GLTFModel);
    assert.equal(model.parts.length, 3);
    const [up, turned, tri] = model.parts;
    assert.ok(up instanceof GLTFPart);
    assert.equal(up.name, 'up');
    assert.equal(up.mesh.vertexCount, 4);
    assert.deepEqual(up.mesh.indices, [0, 1, 2, 0, 2, 3]);
    nearVec(up.mesh.points[0], -1, 0, 0); // moved up one
    nearVec(up.mesh.normals[0], 0, 0, 1);
    near(up.mesh.uvs[2].y, 0);
    assert.equal(up.color.r, 1); assert.equal(up.color.g, 0);
    assert.equal(up.mesh.doubleSided, true);
    assert.equal(up.transparent, false);
    // the child: doubled, turned a quarter around y, then its parent's move: (1, -1, 0) -> (2, -2, 0) -> (0, -2, -2) -> (0, -1, -2)
    assert.equal(turned.name, 'turned');
    nearVec(turned.mesh.points[1], 0, -1, -2);
    nearVec(turned.mesh.normals[1], 1, 0, 0); // the normal turned with it, z to x
    // the triangle had no normals, so it got flat ones
    assert.equal(tri.mesh.vertexCount, 3);
    nearVec(tri.mesh.normals[0], 0, 0, 1);
    assert.equal(tri.color.r, 1); assert.equal(tri.color.b, 1); // no material, white
    // everything as one mesh
    assert.equal(model.mesh.vertexCount, 11);
    assert.equal(model.mesh.indices.length, 15);
    assert.equal(model.mesh.colors[0].r, 1); assert.equal(model.mesh.colors[0].g, 0, 'the quad tinted red');
    assert.equal(model.textureInfo, undefined);
}

test('parseGLTF reads a glTF with a data uri buffer: nodes, transforms, materials and flat normals', async () =>
{
    checkModel(await parseGLTF(withDataUri));
    checkModel(await parseGLTF(JSON.stringify(withDataUri)));
});

test('parseGLTF reads a GLB with the buffer in its binary chunk', async () =>
{
    const text = new TextEncoder().encode(JSON.stringify(json)), jsonLength = text.length + 3 & ~3, binLength = buffer.byteLength;
    const glb = new ArrayBuffer(12 + 8 + jsonLength + 8 + binLength), view = new DataView(glb), bytes = new Uint8Array(glb);
    view.setUint32(0, 0x46546C67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4E4F534A, true);
    bytes.fill(0x20, 20, 20 + jsonLength); bytes.set(text, 20); // padded with spaces
    view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004E4942, true);
    bytes.set(new Uint8Array(buffer), 28 + jsonLength);
    checkModel(await parseGLTF(glb));
    await assert.rejects(parseGLTF({ asset: { version: '1.0' } }), /glTF 2.0/);
});

test('a model makes an object with a child per part, and reads strips, fans and interleaved normalized attributes', async () =>
{
    const model = await parseGLTF(withDataUri);
    const root = model.createObject(vec3(5, 0, 0));
    try
    {
        assert.ok(root instanceof EngineObject3D);
        assert.equal(root.children.length, 3);
        assert.equal(root.children[0].mesh, model.parts[0].mesh);
        assert.equal(root.children[0].color.r, 1);
        assert.equal(root.children[0].color.g, 0);
        nearVec(root.children[1].getWorldPos3D(), 5, 0, 0);
    }
    finally { root.destroy(true); engineObjects.length = 0; }

    // center and fit move every part and the combined mesh together
    const fitted = await parseGLTF(withDataUri);
    fitted.center().fit(2);
    const bounds = fitted.getBounds(), extent = bounds.max.subtract(bounds.min);
    near(Math.max(extent.x, extent.y, extent.z), 2);
    near(bounds.min.x + bounds.max.x, 0); near(bounds.min.y + bounds.max.y, 0);
    nearVec(fitted.parts[0].mesh.points[0], fitted.mesh.points[0].x, fitted.mesh.points[0].y, fitted.mesh.points[0].z);

    // a strip of four vertices with interleaved position and a normalized byte color, and a fan over the same vertices
    const data = new ArrayBuffer(4 * 16), dv = new DataView(data);
    [[-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 1, 0]].forEach((p, i)=>
    {
        p.forEach((v, k)=> dv.setFloat32(i * 16 + k * 4, v, true));
        dv.setUint8(i * 16 + 12, 255); dv.setUint8(i * 16 + 13, 0); dv.setUint8(i * 16 + 14, 0); dv.setUint8(i * 16 + 15, 128);
    });
    const strip = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 64, uri: 'data:application/octet-stream;base64,' + Buffer.from(data).toString('base64') }],
        bufferViews: [{ buffer: 0, byteLength: 64, byteStride: 16 }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
            { bufferView: 0, byteOffset: 12, componentType: 5121, count: 4, type: 'VEC4', normalized: true },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, mode: 5 }, { attributes: { POSITION: 0 }, mode: 6 }] }],
        nodes: [{ mesh: 0 }],
    };
    const m = await parseGLTF(strip);
    assert.equal(m.parts.length, 2, 'no scene, the one node is a root');
    // no normals in the file, so both get flat ones, a vertex per corner: the strip's triangles are (0 1 2) and (2 1 3)
    const [strips, fan] = m.parts;
    assert.equal(strips.mesh.vertexCount, 6);
    assert.deepEqual(strips.mesh.indices, [0, 1, 2, 3, 4, 5]);
    nearVec(strips.mesh.points[3], -1, 1, 0); nearVec(strips.mesh.points[4], 1, -1, 0); nearVec(strips.mesh.points[5], 1, 1, 0);
    nearVec(strips.mesh.normals[2], 0, 0, 1);
    near(strips.mesh.colors[0].r, 1); near(strips.mesh.colors[0].g, 0); near(strips.mesh.colors[0].a, 128 / 255);
    near(strips.mesh.colors[4].a, 128 / 255, 'the color went with its vertex');
    // the fan's are (0 1 2) and (0 2 3)
    assert.equal(fan.mesh.vertexCount, 6);
    nearVec(fan.mesh.points[3], -1, -1, 0); nearVec(fan.mesh.points[5], 1, 1, 0);
});
