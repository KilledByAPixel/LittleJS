import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGLTF, vec3, engineObjects } from '../dist/littlejs.esm.js';

const near = (a, b, msg)=> assert.ok(Math.abs(a - b) < 1e-4, `${msg || ''} ${a} vs ${b}`);
const nearVec = (v, w, msg)=> { near(v.x, w.x, msg + ' x'); near(v.y, w.y, msg + ' y'); near(v.z, w.z, msg + ' z'); };

// a pop in: node 0 is a quad moved up one and turned a quarter about y, resting at a scale, with a child quad moved
// right two; its one animation scales node 0 from 0 at the start to 1 at one second
function popModel(restScale)
{
    const buffer = new ArrayBuffer(96), f = new Float32Array(buffer);
    f.set([-1, -1, 0,  1, -1, 0,  1, 1, 0,  -1, 1, 0], 0);   // positions at 0, 48 bytes
    new Uint16Array(buffer, 48, 6).set([0, 1, 2, 0, 2, 3]);  // indices at 48, 12 bytes
    f.set([0, 1,  0, 0, 0,  1, 1, 1], 16);                   // key times at 64, scales at 72
    return parseGLTF({
        asset: { version: '2.0' },
        buffers: [{ byteLength: 96, uri: 'data:application/octet-stream;base64,' + Buffer.from(buffer).toString('base64') }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 48 },
            { buffer: 0, byteOffset: 48, byteLength: 12 },
            { buffer: 0, byteOffset: 64, byteLength: 8 },
            { buffer: 0, byteOffset: 72, byteLength: 24 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
            { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
            { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR' },
            { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        nodes: [
            { name: 'pop', mesh: 0, translation: [0, 1, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: restScale, children: [1] },
            { name: 'kid', mesh: 0, translation: [2, 0, 0] },
        ],
        scenes: [{ nodes: [0] }],
        animations: [{ name: 'grow', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'scale' } }] }],
    });
}

test('a node resting at scale 0 is baked at full size, its child too, and not onto a point', async () =>
{
    const zero = await popModel([0, 0, 0]), full = await popModel([1, 1, 1]);
    assert.equal(zero.parts.length, 2);
    for (let i = 0; i < 2; ++i)
    for (let k = 0; k < 4; ++k)
    {
        nearVec(zero.parts[i].mesh.points[k], full.parts[i].mesh.points[k], `part ${i} point ${k}`);
        nearVec(zero.parts[i].mesh.normals[k], full.parts[i].mesh.normals[k], `part ${i} normal ${k}`);
    }
});

test('the pose of a node resting at scale 0 grows it as the animation says, like one authored at scale 1', async () =>
{
    const zero = await popModel([0, 0, 0]), full = await popModel([1, 1, 1]);
    const grow = zero.getAnimation('grow'), fullGrow = full.getAnimation('grow');
    for (const time of [0, .5, 1])
    {
        const pose = zero.getPose(grow, time), fullPose = full.getPose(fullGrow, time);
        for (let i = 0; i < 2; ++i)
        for (let k = 0; k < 4; ++k)
        {
            const p = pose[i].transformPoint(zero.parts[i].mesh.points[k]);
            const q = fullPose[i].transformPoint(full.parts[i].mesh.points[k]);
            nearVec(p, q, `time ${time} part ${i} point ${k}`);
        }
    }
    // at the end it is at its full size, where its parts are baked
    nearVec(zero.getPose(grow, 1)[0].getScale(), vec3(1, 1, 1), 'full size');
    nearVec(zero.getPose(grow, 0)[0].getScale(), vec3(0, 0, 0), 'nothing at the start');
});

test('a model resting at scale 0 still shows it so, as one mesh and as an object before it plays', async () =>
{
    const zero = await popModel([0, 0, 0]), full = await popModel([1, 1, 1]);
    // every point of both parts rests on the pop node's place, as the file has it
    for (const p of zero.mesh.points)
        nearVec(p, vec3(0, 1, 0), 'combined mesh');

    const o = zero.createObject(), f = full.createObject();
    try
    {
        const worldPoint = (part, p)=> part.getMatrix().transformPoint(p);
        for (let i = 0; i < 2; ++i)
            nearVec(worldPoint(o.parts[i], zero.parts[i].mesh.points[2]), vec3(0, 1, 0), `part ${i} before it plays`);
        o.play('grow'); o.setAnimationTime(1);
        f.play('grow'); f.setAnimationTime(1);
        for (let i = 0; i < 2; ++i)
        for (let k = 0; k < 4; ++k)
            nearVec(worldPoint(o.parts[i], zero.parts[i].mesh.points[k]), worldPoint(f.parts[i], full.parts[i].mesh.points[k]),
                `part ${i} point ${k} grown`);
    }
    finally { o.destroy(true); f.destroy(true); engineObjects.length = 0; }
});
