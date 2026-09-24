import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, engineObjectsUpdate, Tween, tweenUpdate, tweenStopAll, parseGLTF, vec2 } = LJS;

// review round 6: tweens without the 3D plugin, a tween restarted mid update, sync2D children, glTF urls and
// animated shear; the texture upload order is checked in headless Chrome

test('a numeric tween runs with no 3D math plugin loaded', () =>
{
    // the core math and the tween plugin alone, as a source build without math3d.js has them
    const context = vm.createContext({console});
    vm.runInContext('const ASSERT=(ok,msg)=>{if(!ok) throw Error(msg)}; const engineAddPlugin=()=>{};' +
        'const debugProtectConstant=Object.freeze; let time=0, timeReal=0;', context);
    for (const file of ['src/engineMath.js', 'plugins/tweenSystem.js'])
        vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, {filename: file});
    const value = vm.runInContext('let v; new Tween(x=> v = x, 0, 1, 1); tweenUpdate(.5); v', context);
    assert.equal(value, .5);
});

test('a tween stopped and restarted by another tween in an update moves on from the next update', () =>
{
    tweenStopAll();
    const old = new Tween(()=>{}, 0, 10, 1);
    let armed = false;
    new Tween(()=> { if (armed) { old.stop(); old.restart(); } }, 0, 1, 1);
    armed = true;
    tweenUpdate(.25);
    assert.equal(old.life, 1, 'the restarted run has not moved yet');
    assert.equal(old.getValue(), 0);
    armed = false;
    tweenUpdate(.25);
    assert.equal(old.life, .75, 'and moves on the next update');
    tweenStopAll();
});

test('a sync2D child copies where its parent puts it this update, not where it was', () =>
{
    const parent = new EngineObject(vec2(10, 20));
    parent.mass = 0;
    const child = new EngineObject3D();
    child.sync2D = true;
    parent.addChild(child, vec2(2, 3));
    parent.pos.x = 20;
    engineObjectsUpdate();
    assert.equal(child.pos.x, 22);
    assert.equal(child.pos3D.x, 22, 'pos3D follows the 2D pos');
    assert.equal(child.pos3D.y, 23);
    parent.angle = .5;
    engineObjectsUpdate();
    assert.equal(child.rotation3D.z, -child.angle, 'and the angle');

    // a game placing the tree itself, with one call
    parent.pos.x = 30;
    parent.angle = 0;
    parent.updateTransforms();
    assert.equal(child.pos.x, 32);
    assert.equal(child.pos3D.x, 32, 'pos3D follows a single updateTransforms too');
    parent.destroy(true);
    engineObjectsUpdate();
});

test('glTF buffers resolve root relative, scheme relative and parent relative uris like a browser does', async () =>
{
    const savedFetch = globalThis.fetch, requests = [];
    globalThis.fetch = async url=> { requests.push(String(url)); return new Response(new ArrayBuffer(0)); };
    const uris = ['/shared/a.bin', '//cdn.example.com/b.bin', '../c.bin', 'd.bin', 'https://other.com/e.bin'];
    try
    {
        await parseGLTF({asset: {version: '2.0'}, buffers: uris.map(uri=> ({uri, byteLength: 0}))},
            'https://example.com/models/');
    }
    finally { globalThis.fetch = savedFetch; }
    assert.deepEqual(requests.sort(), [
        'https://cdn.example.com/b.bin',
        'https://example.com/c.bin',
        'https://example.com/models/d.bin',
        'https://example.com/shared/a.bin',
        'https://other.com/e.bin',
    ]);
});

test('an animated glTF part under a nonuniform scale draws with its full pose, shear included', async () =>
{
    const data = new Float32Array([
        0,0,0, 1,0,0, 0,1,0, // triangle
        0,1, // key times
        0,0,0,1, 0,0,Math.SQRT1_2,Math.SQRT1_2, // rotations
    ]);
    const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: data.byteLength,
            uri: 'data:application/octet-stream;base64,' + Buffer.from(data.buffer).toString('base64')}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 36},
            {buffer: 0, byteOffset: 36, byteLength: 8}, {buffer: 0, byteOffset: 44, byteLength: 32}],
        accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'},
            {bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR'},
            {bufferView: 2, componentType: 5126, count: 2, type: 'VEC4'}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
        nodes: [{scale: [2,1,1], children: [1]}, {mesh: 0}], scenes: [{nodes: [0]}],
        animations: [{samplers: [{input: 1, output: 2}], channels: [{sampler: 0, target: {node: 1, path: 'rotation'}}]}],
    };
    const model = await parseGLTF(json), object = model.createObject();
    try
    {
        object.play(0, false);
        object.setAnimationTime(.5);
        const point = model.parts[0].mesh.points[1];
        const expected = model.getPose(model.animations[0], .5)[0].transformPoint(point);
        const actual = object.parts[0].getMatrix().transformPoint(point);
        assert.ok(actual.distance(expected) < 1e-5, 'off by ' + actual.distance(expected));
    }
    finally { object.destroy(true); }
});
