import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGLTF, vec3, setEngineManualStep, engineInit, engineStep }
    from '../dist/littlejs.esm.js';

// Skinned glTF: a mesh moved by its joints, each vertex by up to four of them, posed by the model's animations, and
// a cross-fade between two animations. The model is made here: two joints, a root at the origin and a child one
// unit up, and a quad two units tall whose bottom two vertices follow the root and top two follow the child.

setEngineManualStep(true);
await engineInit(()=> {}, ()=> {}, ()=> {});

// a buffer of typed arrays end to end, as a data uri, and an accessor for each
function gltfOf({ nodes, animations=[], skins, extra })
{
    const arrays = [], views = [], accessors = [];
    let offset = 0;
    const add = (array, type, componentType, more={})=>
    {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        arrays.push(bytes);
        views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
        offset += bytes.length + (4 - bytes.length % 4) % 4;
        arrays.push(new Uint8Array((4 - bytes.length % 4) % 4));
        const count = array.length / { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
        accessors.push({ bufferView: views.length - 1, componentType, count, type, ...more });
        return accessors.length - 1;
    };
    const f32 = (a, type)=> add(new Float32Array(a), type, 5126);
    const position = f32([0, 0, 0,  1, 0, 0,  0, 2, 0,  1, 2, 0], 'VEC3');
    const normal = f32([0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1], 'VEC3');
    const joints = add(new Uint16Array([0, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0]), 'VEC4', 5123);
    const weights = f32(extra?.weights ?? [1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0], 'VEC4');
    const indices = add(new Uint16Array([0, 1, 2,  2, 1, 3]), 'SCALAR', 5123);
    const inverseBind = f32([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1,   1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-1,0,1], 'MAT4');
    // the child joint turns about z: a quarter turn at time 1, or none, as each animation says
    const times = f32([0, 1], 'SCALAR');
    const turns = (angle)=> f32([0, 0, 0, 1,  0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], 'VEC4');
    const anims = animations.map(({ name, angle })=> ({ name, samplers: [{ input: times, output: turns(angle) }],
        channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }] }));
    const size = arrays.reduce((n, a)=> n + a.length, 0), all = new Uint8Array(size);
    let at = 0;
    for (const a of arrays) all.set(a, at), at += a.length;
    return {
        asset: { version: '2.0' }, scenes: [{ nodes: [0, 1] }], nodes,
        meshes: [{ primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joints, WEIGHTS_0: weights },
            indices }] }],
        skins: skins ?? [{ joints: [1, 2], inverseBindMatrices: inverseBind }],
        animations: anims, accessors, bufferViews: views,
        buffers: [{ byteLength: size, uri: 'data:application/octet-stream;base64,' + Buffer.from(all).toString('base64') }],
    };
}
const nodesOf = (meshNode={})=> [{ mesh: 0, skin: 0, ...meshNode }, { children: [2] }, { translation: [0, 1, 0] }];
const round = (v)=> [v.x, v.y, v.z].map((n)=> Math.round(n * 1e6) / 1e6 + 0);
const points = (mesh)=> mesh.points.map(round);

test('a skinned mesh rests as its joints place it, and its node\'s own transform is left out, as the format says', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf({ translation: [5, 0, 0], scale: [3, 3, 3] }) }));
    assert.deepEqual(points(model.parts[0].mesh), [[0, 0, 0], [1, 0, 0], [0, 2, 0], [1, 2, 0]]);
    assert.ok(model.parts[0].skin, 'the part keeps its skin');
});

test('a skinned object follows its joints through an animation, each vertex by its own joint', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(), animations: [{ name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3());
    o.play('bend', false);
    o.setAnimationTime(1);
    // the top two turn a quarter about the child joint at (0, 1): (0, 2) to (-1, 1), (1, 2) to (-1, 2)
    assert.deepEqual(points(o.parts[0].mesh), [[0, 0, 0], [1, 0, 0], [-1, 1, 0], [-1, 2, 0]]);
    assert.deepEqual(round(o.parts[0].mesh.normals[2]), [0, 0, 1], 'normals turn with them, about z they stay');
    assert.deepEqual(points(model.parts[0].mesh), [[0, 0, 0], [1, 0, 0], [0, 2, 0], [1, 2, 0]], 'the model is not posed');
    o.destroy(true);
});

test('two objects of one model hold two poses', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(), animations: [{ name: 'bend', angle: Math.PI / 2 }] }));
    const a = model.createObject(vec3()), b = model.createObject(vec3());
    a.play('bend', false), b.play('bend', false);
    a.setAnimationTime(1), b.setAnimationTime(0);
    assert.notEqual(a.parts[0].mesh, b.parts[0].mesh);
    assert.deepEqual([points(a.parts[0].mesh)[3], points(b.parts[0].mesh)[3]], [[-1, 2, 0], [1, 2, 0]]);
    a.destroy(true), b.destroy(true);
});

test('weights are made to sum to one, and a model fitted to a size skins at that size', async ()=>
{
    const halves = [.5, 0, 0, 0,  .5, 0, 0, 0,  .5, 0, 0, 0,  .5, 0, 0, 0];
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(), animations: [{ name: 'bend', angle: Math.PI / 2 }],
        extra: { weights: halves } }));
    assert.deepEqual(points(model.parts[0].mesh)[3], [1, 2, 0], 'half weights count as whole');
    model.fit(1); // two units tall becomes one
    const o = model.createObject(vec3());
    o.play('bend', false);
    o.setAnimationTime(1);
    const top = points(o.parts[0].mesh)[3], bottom = points(o.parts[0].mesh)[0];
    assert.deepEqual([top[0] - bottom[0], top[1] - bottom[1]], [-.5, 1], 'the bend at half size');
    o.destroy(true);
});

test('play with a blend time cross-fades from the pose it is in to the new animation', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(),
        animations: [{ name: 'still', angle: 0 }, { name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3());
    o.play('still', false);
    o.setAnimationTime(1);
    o.play('bend', false, 0, 1); // speed 0 holds bend at its start, so only the blend moves it
    o.setAnimationTime(1);
    const step = (seconds)=> { o.blendTime += 0; o.blendElapsed = seconds; o.setAnimationTime(o.animationTime); };
    step(0);
    assert.deepEqual(points(o.parts[0].mesh)[2], [0, 2, 0], 'at its start the old pose');
    step(.5);
    const s = Math.SQRT1_2;
    assert.deepEqual(points(o.parts[0].mesh)[2].map((n)=> Math.round(n * 1e4) / 1e4), [-s, 1 + s, 0].map((n)=> Math.round(n * 1e4) / 1e4),
        'half way, half the turn, the short way round');
    step(1);
    assert.deepEqual(points(o.parts[0].mesh)[2], [-1, 1, 0], 'at its end the new pose');
    o.destroy(true);
});

test('a blend runs on in update and ends, and a joint can be found to hang things on', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: [{ mesh: 0, skin: 0 }, { children: [2] }, { translation: [0, 1, 0], name: 'hand' }],
        animations: [{ name: 'still', angle: 0 }, { name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3(10, 0, 0));
    o.play('bend', false);
    o.setAnimationTime(1);
    o.play('still', false, 1, .5);
    for (let i = 60; i--;) engineStep();
    assert.equal(o.blendFrom, undefined, 'the blend is over');
    const hand = o.getJointMatrix('hand');
    assert.deepEqual(round(hand.getTranslation()), [10, 1, 0], 'the hand joint in the world, where the object put it');
    assert.equal(o.getJointMatrix('foot'), undefined);
    o.destroy(true);
});

test('a fade started during another fades from the mix there, not from the animation it left', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(),
        animations: [{ name: 'still', angle: 0 }, { name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3());
    o.play('still', false, 0);
    o.play('bend', false, 0, 1);
    o.setAnimationTime(1); // bend held at its end, so only the fades move it
    o.blendElapsed = .5, o.setAnimationTime(1);
    const before = points(o.parts[0].mesh)[2];
    o.play('still', false, 0, 1);
    assert.deepEqual(points(o.parts[0].mesh)[2], before, 'the second fade starts where the first had got to');
    o.destroy(true);
});

test('joints outside the scene\'s nodes keep their parents', async ()=>
{
    // the joints' root a node of its own, moved 2 across, with inverse binds to match, and the scene holding only
    // the mesh's node: the mesh rests where it does with them in the scene
    const file = gltfOf({ nodes: [{ mesh: 0, skin: 0 }, { children: [2], translation: [2, 0, 0] }, { translation: [0, 1, 0] }] });
    const bind = file.accessors.findIndex((a)=> a.type === 'MAT4');
    const view = file.bufferViews[file.accessors[bind].bufferView];
    const bytes = Buffer.from(file.buffers[0].uri.split(',')[1], 'base64');
    new Float32Array(bytes.buffer, bytes.byteOffset + view.byteOffset, 32).set([1,0,0,0, 0,1,0,0, 0,0,1,0, -2,0,0,1,
        1,0,0,0, 0,1,0,0, 0,0,1,0, -2,-1,0,1]);
    file.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.toString('base64');
    const inScene = await parseGLTF({ ...file, scenes: [{ nodes: [0, 1] }] });
    const outside = await parseGLTF({ ...file, scenes: [{ nodes: [0] }] });
    assert.deepEqual(points(outside.parts[0].mesh), points(inScene.parts[0].mesh));
    assert.deepEqual(points(outside.parts[0].mesh), [[0, 0, 0], [1, 0, 0], [0, 2, 0], [1, 2, 0]]);
});

test('stop during a fade holds the mix shown, and a later play with a blend fades from that mix', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(),
        animations: [{ name: 'still', angle: 0 }, { name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3());
    o.play('still', false, 0);
    o.play('bend', false, 0, 1);
    o.setAnimationTime(1);
    for (let i = 30; i--;) engineStep();
    o.stop();
    const held = points(o.parts[0].mesh)[2];
    for (let i = 30; i--;) engineStep();
    assert.deepEqual(points(o.parts[0].mesh)[2], held, 'it holds, the fade stopped with it');
    assert.ok(held[0] < -.1 && held[0] > -.9, 'part way, ' + held);
    o.play('still', false, 0, 1);
    assert.deepEqual(points(o.parts[0].mesh)[2], held, 'the next fade starts from the held mix');
    o.destroy(true);
});

test('a vertex of more than four joints keeps its four strongest, made to sum to one', async ()=>
{
    // the top two vertices weigh .1 on the child joint in the first set and .9 on the root in a second set
    const file = gltfOf({ nodes: nodesOf(), animations: [{ name: 'bend', angle: Math.PI / 2 }],
        extra: { weights: [1, 0, 0, 0,  1, 0, 0, 0,  .1, 0, 0, 0,  .1, 0, 0, 0] } });
    const bytes = Buffer.from(file.buffers[0].uri.split(',')[1], 'base64');
    const more = (array, type, componentType)=>
    {
        const start = bytes.length, data = Buffer.from(array.buffer);
        const all = Buffer.concat([bytes, data, Buffer.alloc((4 - data.length % 4) % 4)]);
        file.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length });
        file.accessors.push({ bufferView: file.bufferViews.length - 1, componentType, count: 4, type });
        return [all, file.accessors.length - 1];
    };
    let all, joints1, weights1;
    [all, joints1] = more(new Uint16Array([0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0]), 'VEC4', 5123);
    file.buffers[0].uri = 'data:application/octet-stream;base64,' + all.toString('base64'), file.buffers[0].byteLength = all.length;
    const bytes2 = all;
    const start = bytes2.length, w = Buffer.from(new Float32Array([0, 0, 0, 0,  0, 0, 0, 0,  .9, 0, 0, 0,  .9, 0, 0, 0]).buffer);
    const all2 = Buffer.concat([bytes2, w]);
    file.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: w.length });
    file.accessors.push({ bufferView: file.bufferViews.length - 1, componentType: 5126, count: 4, type: 'VEC4' });
    weights1 = file.accessors.length - 1;
    file.buffers[0].uri = 'data:application/octet-stream;base64,' + all2.toString('base64'), file.buffers[0].byteLength = all2.length;
    Object.assign(file.meshes[0].primitives[0].attributes, { JOINTS_1: joints1, WEIGHTS_1: weights1 });
    const model = await parseGLTF(file);
    const o = model.createObject(vec3());
    o.play('bend', false);
    o.setAnimationTime(1);
    // .1 of (-1, 1) where the child turned it and .9 of (0, 2) where the root keeps it
    assert.deepEqual(points(o.parts[0].mesh)[2].map((n)=> Math.round(n * 1e4) / 1e4), [-.1, 1.9, 0]);
    o.destroy(true);
});

test('destroying an object frees its skinned meshes, and play of the animation playing with a blend goes on', async ()=>
{
    const model = await parseGLTF(gltfOf({ nodes: nodesOf(), animations: [{ name: 'bend', angle: Math.PI / 2 }] }));
    const o = model.createObject(vec3()), mesh = o.parts[0].mesh;
    let freed = 0;
    mesh.dispose = ()=> ++freed;
    o.play('bend', true, 1, .2);
    for (let i = 10; i--;)
    {
        o.play('bend', true, 1, .2); // as a game's state code calls it each frame
        engineStep();
    }
    assert.ok(o.animationTime > .1, 'it went on, ' + o.animationTime);
    o.destroy(true);
    assert.equal(freed, 1);
});
