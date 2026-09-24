import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, vec3, PI, buildCone, buildSphere, buildLathe, EngineObject3D,
    engineObjectsUpdate, parseGLTF } from '../dist/littlejs.esm.js';

// review round 5 owner decisions in the 3D plugins: render3d, render3dExtras and gltf
const near = (a, b, msg, e=1e-5)=> assert.ok(Math.abs(a - b) < e, `${msg || ''} ${a} != ${b}`);

new Render3DPlugin; // headless, the plugin is a module singleton for the whole file

///////////////////////////////////////////////////////////////////////////////
// render3d.js

test('transparent draws sort by depth along the view, so an orthographic camera orders them right', () =>
{
    // looking at the origin from (0, 10, 10): (1, 0, .03) is farther by distance but nearer in depth
    const camera = render3D.camera, pos = camera.pos, rotation = camera.rotation, orthographic = camera.orthographic;
    camera.pos = vec3(0, 10, 10);
    camera.lookAt(vec3());
    camera.orthographic = 10;
    render3D.updateMatrices(1);
    const order = [];
    render3D.transparentQueue = []; // as the transparent stage sets it
    try
    {
        render3D.queueTransparent(vec3(1, 0, .03), ()=> order.push('nearer'));
        render3D.queueTransparent(vec3(), ()=> order.push('farther'));
        render3D.flushTransparentQueue();
    }
    finally
    {
        render3D.transparentQueue = undefined;
        camera.pos = pos, camera.rotation = rotation, camera.orthographic = orthographic;
        render3D.updateMatrices(1);
    }
    assert.deepEqual(order, ['farther', 'nearer'], 'far to near by depth');
});

test('a smooth cone tip shades as a point with the side normal, a sphere pole still points along the axis', () =>
{
    // the side of a cone of size 1 and height 1 leans out .894 and up .447
    const cone = buildCone(1, 1, 8, true);
    let tips = 0;
    for (let i = 0; i < cone.points.length; ++i)
    {
        if (cone.points[i].y < .499) continue;
        const n = cone.normals[i];
        near(n.y, 1 / Math.sqrt(5), 'tip normal up');
        near(Math.hypot(n.x, n.z), 2 / Math.sqrt(5), 'tip normal out');
        ++tips;
    }
    assert.ok(tips >= 8, 'every column has a tip vertex');

    const sphere = buildSphere(2, 12, 6, true);
    for (let i = 0; i < sphere.points.length; ++i)
        if (Math.abs(sphere.points[i].y) > .999)
            near(Math.abs(sphere.normals[i].y), 1, 'a sphere pole points along the axis');

    // a lathe that meets the axis at exactly 45 degrees is still a pole, a steeper one is a point
    const vase = buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 12, true);
    for (let i = 0; i < vase.points.length; ++i)
        if (vase.points[i].y > .999)
            near(vase.normals[i].y, 1, 'the vase top is a pole');
    const spike = buildLathe([[.5, 0], [0, 2]], 6, true, false);
    for (let i = 0; i < spike.points.length; ++i)
        if (spike.points[i].y > 1.999)
            assert.ok(spike.normals[i].y < .3, 'the spike tip leans out: ' + spike.normals[i]);
});

test('3D solid collision against mass 0 bounces the mover by its own restitution, the mass 0 one unmoved', () =>
{
    const wall = new EngineObject3D(vec3()), ball = new EngineObject3D(vec3(.9, 0, 0));
    try
    {
        wall.setCollision();
        ball.setCollision();
        engineObjectsUpdate(); // collects the solid objects
        wall.pos3D = vec3();
        ball.pos3D = vec3(.9, 0, 0);
        wall.mass = 0;
        wall.restitution = 0;
        wall.velocity3D = vec3(0, .5, 0);
        ball.mass = 1;
        ball.restitution = 1;
        ball.velocity3D = vec3(-.2, 0, 0);
        ball.updatePhysics(); // the ball comes after the wall in the list, so it resolves the pair
        near(ball.velocity3D.x, .2, 'the ball bounces back by its restitution');
        near(wall.velocity3D.x, 0, 'the wall is not pushed');
        near(wall.velocity3D.y, .5, 'and keeps its own velocity');
        near(wall.pos3D.x, 0, 'and stays put');
    }
    finally
    {
        wall.destroy(true);
        ball.destroy(true);
        engineObjectsUpdate();
    }
});

///////////////////////////////////////////////////////////////////////////////
// gltf.js

// one quad with two uv sets, drawn with each material in turn
function uvModel(materials)
{
    const buffer = new ArrayBuffer(76), f = new Float32Array(buffer);
    f.set([-1, -1, 0,  1, -1, 0,  1, 1, 0,  -1, 1, 0], 0); // positions at 0, 48 bytes
    new Uint16Array(buffer, 48, 6).set([0, 1, 2, 0, 2, 3]); // indices at 48, 12 bytes
    const uv0 = new ArrayBuffer(32), uv1 = new ArrayBuffer(32);
    new Float32Array(uv0).set([0, 0,  1, 0,  1, 1,  0, 1]);
    new Float32Array(uv1).set([.1, .2,  .3, .4,  .5, .6,  .7, .8]);
    const bytes = new Uint8Array(76 + 64);
    bytes.set(new Uint8Array(buffer));
    bytes.set(new Uint8Array(uv0), 76);
    bytes.set(new Uint8Array(uv1), 108);
    return parseGLTF({
        asset: { version: '2.0' },
        buffers: [{ byteLength: bytes.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64') }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 48 },
            { buffer: 0, byteOffset: 48, byteLength: 12 },
            { buffer: 0, byteOffset: 76, byteLength: 32 },
            { buffer: 0, byteOffset: 108, byteLength: 32 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
            { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
            { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
            { bufferView: 3, componentType: 5126, count: 4, type: 'VEC2' },
        ],
        images: [{ uri: 'missing.png' }],
        textures: [{ source: 0 }],
        materials,
        meshes: [{ primitives: materials.map((_, i)=> ({ attributes: { POSITION: 0, TEXCOORD_0: 2, TEXCOORD_1: 3 }, indices: 1, material: i })) }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
    });
}
const uv0 = [[0, 0], [1, 0], [1, 1], [0, 1]], uv1 = [[.1, .2], [.3, .4], [.5, .6], [.7, .8]];
const uvsOf = (part)=> [0, 1, 2, 3].map(k=> part.mesh.uvs[part.mesh.points.findIndex(p=>
    Math.abs(p.x - (k == 1 || k == 2 ? 1 : -1)) < 1e-6 && Math.abs(p.y - (k > 1 ? 1 : -1)) < 1e-6)]);

test('glTF reads the uv set a base color texture names with texCoord, on its own or in KHR_texture_transform', async () =>
{
    const model = await uvModel([
        { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
        { pbrMetallicRoughness: { baseColorTexture: { index: 0, texCoord: 1 } } },
        { pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { texCoord: 1 } } } } },
    ]);
    const expect = [uv0, uv1, uv1];
    model.parts.forEach((part, i)=> uvsOf(part).forEach((uv, k)=>
    {
        near(uv.x, expect[i][k][0], `material ${i} uv ${k} x`);
        near(uv.y, expect[i][k][1], `material ${i} uv ${k} y`);
    }));
});

test('glTF maps uvs through KHR_texture_transform: offset + rotation * scale', async () =>
{
    const transform = { offset: [.5, .25], scale: [2, 3], rotation: PI / 2 };
    const model = await uvModel([
        { pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: transform } } } },
        { pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [.5, -1], scale: [2, 4] } } } } },
    ]);
    // a quarter turn: u' = 3v + .5 and v' = -2u + .25, as three.js and the extension's matrices have it
    uvsOf(model.parts[0]).forEach((uv, k)=>
    {
        const [u, v] = uv0[k];
        near(uv.x, 3 * v + .5, `turned uv ${k} x`);
        near(uv.y, -2 * u + .25, `turned uv ${k} y`);
    });
    // offset and scale alone, as gltfpack writes to undo its quantizing
    uvsOf(model.parts[1]).forEach((uv, k)=>
    {
        const [u, v] = uv0[k];
        near(uv.x, 2 * u + .5, `scaled uv ${k} x`);
        near(uv.y, 4 * v - 1, `scaled uv ${k} y`);
    });
});

test('glTF KHR_materials_unlit parts come in unlit, and createObject draws them emissive', async () =>
{
    const model = await uvModel([
        { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, extensions: { KHR_materials_unlit: {} } },
        { pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] } },
    ]);
    assert.deepEqual(model.parts.map(p=> p.unlit), [true, false]);
    const object = model.createObject();
    try { assert.deepEqual(object.parts.map(o=> o.emissive), [1, 0]); }
    finally { object.destroy(true); engineObjectsUpdate(); }
});
