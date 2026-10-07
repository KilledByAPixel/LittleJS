import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// An object drawn through parts of its own, a glTF model's parts, an attached prefab's, a voxel map's see through
// blocks, draws with the settings set on it: each part draws with the owner's where the owner set it away from the
// default, and its own otherwise, so a model's unlit or rough part keeps what its file gave it. The part keeps its
// own values as plain properties, linked to its owner by drawOwner, and the renderer reads both (render3DSetting).
function engine()
{
    const { run } = loadEngine({ atob, Response, fetch, Blob, TextDecoder, DataView, ArrayBuffer, Uint16Array, Uint32Array, Int8Array, Int16Array });
    run(`setHeadlessMode(true); new Render3DPlugin;
        // the settings set away from the default on an owner, which its parts should draw with
        var setOwner = (o)=>
        {
            o.reflectivity = .8; o.specular = .5; o.receiveShadow = false; o.castShadow = false; o.renderAfter2D = true;
            o.renderOrder = 5; o.shader = new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }');
            o.environment = makeCubeMap(1, ()=> WHITE);
        };
        var drawsAs = (part, owner)=> ['reflectivity', 'specular', 'receiveShadow', 'castShadow', 'renderAfter2D',
            'renderOrder', 'shader', 'environment'].every((name)=> render3DSetting(part, name) === owner[name]);
        // a one triangle glTF whose single material is unlit, so its part starts with emissive 1
        var unlitModel = ()=> parseGLTF({asset: {version: '2.0'}, extensionsUsed: ['KHR_materials_unlit'],
            buffers: [{byteLength: 36, uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA'}],
            bufferViews: [{buffer: 0, byteLength: 36}], accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'}],
            meshes: [{primitives: [{attributes: {POSITION: 0}, material: 0}]}],
            materials: [{extensions: {KHR_materials_unlit: {}}}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]});`);
    return run;
}

test('a glTF model\'s parts draw with the settings set on the model, and keep their own material otherwise', async ()=>
{
    const run = engine();
    await run('unlitModel().then((model)=> { globalThis.object = model.createObject(); globalThis.part = object.parts[0]; })');
    assert.equal(run(`render3DSetting(part, 'emissive')`), 1, 'unlit in its file');
    run('setOwner(object)');
    assert.equal(run('drawsAs(part, object)'), true);
    assert.equal(run(`render3DSetting(part, 'emissive')`), 1, 'the model left at emissive 0 keeps the part\'s own');
    run('object.emissive = .5');
    assert.equal(run(`render3DSetting(part, 'emissive')`), .5, 'set on the model, the model\'s');
    run('render3DSetObjectState(part)');
    assert.equal(run('render3D.emissive'), .5, 'the draw state is the model\'s');
    assert.equal(run('render3D.reflectivity'), .8);
    assert.equal(run('render3DIsAfter2D(part)'), true, 'drawn in the model\'s stage');
});

test('a part keeps its own values as plain properties, and draws with them once taken off', async ()=>
{
    const run = engine();
    await run('unlitModel().then((model)=> { globalThis.object = model.createObject(); globalThis.part = object.parts[0]; })');
    assert.equal(run(`'value' in Object.getOwnPropertyDescriptor(part, 'emissive')`), true, 'no accessor on the part');
    run('object.emissive = .5; part.emissive = 2;');
    assert.equal(run('part.emissive'), 2, 'reads back what was set on it');
    assert.equal(run(`render3DSetting(part, 'emissive')`), .5, 'while it draws with the model\'s');
    run('object.removeChild(part)');
    assert.equal(run('part.drawOwner'), undefined);
    assert.equal(run(`render3DSetting(part, 'emissive')`), 2, 'its own once taken off');
});

test('a part of a class with an accessor of its own for a setting keeps it', ()=>
{
    const run = engine();
    run(`class Glowing extends EngineObject3D { get emissive() { return ++this.reads && .3; } set emissive(v) {} }
        var owner = new EngineObject3D, glow = new Glowing; glow.reads = 0;
        render3DShareSettings(glow, owner); owner.addChild(glow);`);
    assert.equal(run(`render3DSetting(glow, 'emissive')`), .3);
    assert.ok(run('glow.reads') > 0, 'its getter is asked');
});

test('an attached prefab\'s parts draw with the settings set on the handle, a nested one\'s too', ()=>
{
    const run = engine();
    run(`level3DAddPrefab('Lamp', {attached: true, objects: [{type: 'Box', pos: [0, .5, 0]}]});
        level3DAddPrefab('Pair', {attached: true, objects: [{type: 'Lamp', pos: [0, 0, 0]}, {type: 'Box', pos: [2, .5, 0]}]});
        var handle = level3DSpawn('Lamp', vec3()), outer = level3DSpawn('Pair', vec3(5, 0, 0));
        setOwner(handle); setOwner(outer);`);
    assert.equal(run('drawsAs(handle.parts[0], handle)'), true);
    assert.equal(run('drawsAs(outer.parts[0].parts[0], outer)'), true, 'a part of a prefab inside a prefab');
});

test('a voxel map\'s see through blocks draw in its render order too', ()=>
{
    const run = engine();
    run('var map = new VoxelMap(vec3(), vec3(2)); map.renderOrder = 7;');
    assert.equal(run(`render3DSetting(map.children[0], 'renderOrder')`), 7);
    assert.equal(run('map.children[0].transparent'), true, 'still blended');
});
