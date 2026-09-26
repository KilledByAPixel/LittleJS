import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGLTF, GLTFModel, GLTFPart, GLTFObject, GLTFAnimation, vec3, buildMatrix, EngineObject3D, engineObjects } from '../dist/littlejs.esm.js';

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

test('glass made with KHR_materials_transmission comes in see through, a faint tint of its base color', async () =>
{
    const glass = (transmissionFactor)=> ({ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
        extensions: { KHR_materials_transmission: { transmissionFactor } } });
    const model = await parseGLTF({ ...withDataUri, materials: [glass(1)] });
    const [up] = model.parts;
    assert.equal(up.transparent, true, 'transmission is see through, though the file says opaque');
    near(up.color.a, .2, 'full transmission keeps a faint tint');
    assert.equal(up.color.r, 1);
    const half = (await parseGLTF({ ...withDataUri, materials: [glass(.5)] })).parts[0];
    near(half.color.a, .6, 'half transmission');
    const none = (await parseGLTF({ ...withDataUri, materials: [glass(0)] })).parts[0];
    assert.equal(none.transparent, false, 'no transmission stays opaque');
    near(none.color.a, 1);
});

test('a mirrored node keeps its faces pointing out, an opaque material ignores its alpha, compressed files say why they fail', async () =>
{
    const mirrored = { ...withDataUri, nodes: [{ mesh: 0, scale: [-1, 1, 1] }], scenes: [{ nodes: [0] }] };
    const [part] = (await parseGLTF(mirrored)).parts;
    assert.deepEqual(part.mesh.indices, [0, 2, 1, 0, 3, 2], 'every triangle turned the other way round');

    const faded = (alphaMode)=> parseGLTF({ ...withDataUri, materials: [{ alphaMode, pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, .5] } }] });
    near((await faded('OPAQUE')).parts[0].color.a, 1, 'opaque is opaque whatever the alpha');
    near((await faded(undefined)).parts[0].color.a, 1, 'opaque is the default');
    near((await faded('MASK')).parts[0].color.a, 1, 'a mask cuts by the texture');
    near((await faded('BLEND')).parts[0].color.a, .5, 'blend keeps it');

    await assert.rejects(parseGLTF({ ...withDataUri, extensionsRequired: ['KHR_draco_mesh_compression'] }), /KHR_draco_mesh_compression/);
    await assert.rejects(parseGLTF({ ...withDataUri, extensionsRequired: ['EXT_meshopt_compression'] }), /EXT_meshopt_compression/);
    await assert.doesNotReject(parseGLTF({ ...withDataUri, extensionsRequired: ['KHR_materials_transmission', 'EXT_texture_webp'] }));
});

test('an empty scene loads as an empty model, and an absolute uri is fetched as it is', async () =>
{
    const empty = await parseGLTF({ asset: { version: '2.0' }, scenes: [{}], scene: 0 });
    assert.equal(empty.parts.length, 0);
    assert.equal(empty.mesh.vertexCount, 0);

    const urls = [], realFetch = globalThis.fetch;
    globalThis.fetch = async (url)=> { urls.push(url); return { ok: true, arrayBuffer: async ()=> buffer }; };
    try
    {
        await parseGLTF({ ...json, buffers: [{ byteLength: 160, uri: 'https://cdn.test/model.bin' }] }, 'https://host.test/assets/');
        await parseGLTF({ ...json, buffers: [{ byteLength: 160, uri: 'model.bin' }] }, 'https://host.test/assets/');
    }
    finally { globalThis.fetch = realFetch; }
    assert.deepEqual(urls, ['https://cdn.test/model.bin', 'https://host.test/assets/model.bin']);
});

// an arm and a hand: node 0 is the quad moved up one, node 1 its child, the triangle moved right two; three animations
// that key the arm's rotation linearly and its position in steps, and the hand's position on a cubic spline
function animatedModel()
{
    const keys = new Float32Array([
        0, 1,                                   // times, at 0 bytes
        0, 0, 0, 1,  0, Math.SQRT1_2, 0, Math.SQRT1_2, // two rotations, none then a quarter turn about y, at 8
        0, .5,                                  // times, at 40
        0, 1, 0,  0, 3, 0,                      // two positions, at 48
        0, 1,                                   // times, at 72
        // cubic spline keys: in tangent, value, out tangent for each, at 80
        0, 0, 0,  2, 0, 0,  0, 4, 0,
        0, 4, 0,  2, 2, 0,  0, 0, 0,
    ]);
    const bytes = new Uint8Array(160 + keys.byteLength);
    bytes.set(new Uint8Array(buffer), 0);
    bytes.set(new Uint8Array(keys.buffer), 160);
    const view = (offset, length)=> ({ buffer: 0, byteOffset: 160 + offset, byteLength: length });
    return parseGLTF({
        ...json,
        buffers: [{ byteLength: bytes.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64') }],
        bufferViews: [...json.bufferViews, view(0, 8), view(8, 32), view(40, 8), view(48, 24), view(72, 8), view(80, 72)],
        accessors: [...json.accessors,
            { bufferView: 4, componentType: 5126, count: 2, type: 'SCALAR' },  // 5
            { bufferView: 5, componentType: 5126, count: 2, type: 'VEC4' },    // 6
            { bufferView: 6, componentType: 5126, count: 2, type: 'SCALAR' },  // 7
            { bufferView: 7, componentType: 5126, count: 2, type: 'VEC3' },    // 8
            { bufferView: 8, componentType: 5126, count: 2, type: 'SCALAR' },  // 9
            { bufferView: 9, componentType: 5126, count: 6, type: 'VEC3' },    // 10
        ],
        nodes: [
            { name: 'arm', mesh: 0, translation: [0, 1, 0], children: [1] },
            { name: 'hand', mesh: 1, translation: [2, 0, 0] },
        ],
        scenes: [{ nodes: [0] }],
        animations: [
            { name: 'spin', samplers: [{ input: 5, output: 6 }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] },
            { name: 'hop', samplers: [{ input: 7, output: 8, interpolation: 'STEP' }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] },
            { samplers: [{ input: 9, output: 10, interpolation: 'CUBICSPLINE' }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } },
                { sampler: 0, target: { node: 1, path: 'weights' } }] }, // morph weights are not read, the channel is left out
        ],
    });
}

// where a part's rest point is in the world now: the part's object matrix is the world one, the mesh is at rest
const worldPoint = (o, p)=> o.getMatrix().transformPoint(p);

test('a glTF model reads its node animations, names, lengths and the channels it can play', async () =>
{
    const model = await animatedModel();
    assert.equal(model.animations.length, 3);
    const [spin, hop, bob] = model.animations;
    assert.ok(spin instanceof GLTFAnimation);
    assert.equal(spin.name, 'spin');
    assert.equal(hop.name, 'hop');
    assert.equal(bob.name, 'animation 2', 'an unnamed one is named by its place');
    near(spin.duration, 1); near(hop.duration, .5); near(bob.duration, 1);
    assert.equal(bob.channels.length, 1, 'the weights channel is left out');
    assert.equal((await parseGLTF(withDataUri)).animations.length, 0);
});

test('a GLTFObject plays an animation: a rotation turns its part and the child node with it', async () =>
{
    const model = await animatedModel(), o = model.createObject(vec3(10, 0, 0));
    try
    {
        assert.ok(o instanceof GLTFObject && o instanceof EngineObject3D);
        const [arm, hand] = o.children;
        const armPoint = model.parts[0].mesh.points[1], handPoint = model.parts[1].mesh.points[0];
        // at rest, nothing moved
        nearVec(worldPoint(arm, armPoint), armPoint.x + 10, armPoint.y, armPoint.z);

        // half way through the spin, an eighth turn about y: the arm turns about its node, the hand goes around with it
        o.play('spin');
        o.setAnimationTime(.5);
        const eighth = buildMatrix(vec3(10, 1, 0), vec3(0, Math.PI / 4, 0));
        const armRest = armPoint.subtract(vec3(0, 1, 0)); // the point in the arm node's own space
        const a = eighth.transformPoint(armRest);
        nearVec(worldPoint(arm, armPoint), a.x, a.y, a.z);
        const handRest = handPoint.subtract(vec3(2, 1, 0)); // in the hand node's space
        const h = eighth.multiply(buildMatrix(vec3(2, 0, 0))).transformPoint(handRest);
        nearVec(worldPoint(hand, handPoint), h.x, h.y, h.z);
        assert.equal(hand.mesh, model.parts[1].mesh, 'each child draws its part');
    }
    finally { o.destroy(true); engineObjects.length = 0; }
});

test('step keys jump, cubic spline keys follow their tangents, and time loops or stops at the end', async () =>
{
    const model = await animatedModel(), o = model.createObject();
    try
    {
        const [arm, hand] = o.children;
        const armPoint = model.parts[0].mesh.points[0], handPoint = model.parts[1].mesh.points[0];

        // step: the arm holds its first position until the second key, then jumps to it
        o.play('hop', false);
        o.setAnimationTime(.49);
        nearVec(worldPoint(arm, armPoint), armPoint.x, armPoint.y, armPoint.z);
        o.setAnimationTime(.5);
        nearVec(worldPoint(arm, armPoint), armPoint.x, armPoint.y + 2, armPoint.z);

        // cubic spline half way: the hand's node goes from (2, 0, 0) to (2, 2, 0) leaving along +y at 4 a second
        // and arriving along +y at 4, so the hermite curve puts it at y = 1 + (4 - 4) / 8 = 1
        o.play(2);
        o.setAnimationTime(.5);
        nearVec(worldPoint(hand, handPoint), handPoint.x, handPoint.y + 1, handPoint.z);
        o.setAnimationTime(.25); // h00 * 0 + h10 * 4 + h01 * 2 + h11 * 4 at a quarter: .84375 * 0 + .140625 * 4 + .15625 * 2 - .046875 * 4
        nearVec(worldPoint(hand, handPoint), handPoint.x, handPoint.y + .6875, handPoint.z);

        // a looping animation wraps: a second and a half of a one second spin is half way
        o.play('spin', true);
        for (let i = 0; i < 90; ++i) o.update();
        near(o.animationTime, .5, 'wrapped');
        assert.equal(o.animationPlaying, true);

        // one that does not loop stops at its end and holds the last pose
        o.play('spin', false, 2);
        for (let i = 0; i < 60; ++i) o.update();
        near(o.animationTime, 1);
        assert.equal(o.animationPlaying, false);
        const quarter = buildMatrix(vec3(0, 1, 0), vec3(0, Math.PI / 2, 0)).transformPoint(armPoint.subtract(vec3(0, 1, 0)));
        nearVec(worldPoint(arm, armPoint), quarter.x, quarter.y, quarter.z);

        // stop holds where it is
        o.play('spin');
        o.setAnimationTime(.25);
        o.stop();
        o.update();
        near(o.animationTime, .25);
    }
    finally { o.destroy(true); engineObjects.length = 0; }
});

test('an animation plays the same after the model is centered and fitted', async () =>
{
    const plain = await animatedModel(), fitted = await animatedModel();
    const before = plain.parts[1].mesh.points[2];
    fitted.center().fit(4);
    // the fit is a move and an even scale, found from where one point went
    const a = plain.parts[0].mesh.points[0], b = plain.parts[0].mesh.points[1];
    const fa = fitted.parts[0].mesh.points[0], fb = fitted.parts[0].mesh.points[1];
    const scale = fa.distance(fb) / a.distance(b), shift = fa.subtract(a.scale(scale));
    const p = plain.createObject(), f = fitted.createObject();
    try
    {
        p.play('spin'); p.setAnimationTime(.7);
        f.play('spin'); f.setAnimationTime(.7);
        const moved = worldPoint(p.children[1], before), fittedMoved = worldPoint(f.children[1], fitted.parts[1].mesh.points[2]);
        nearVec(fittedMoved, moved.x * scale + shift.x, moved.y * scale + shift.y, moved.z * scale + shift.z);
    }
    finally { p.destroy(true); f.destroy(true); engineObjects.length = 0; }
});

