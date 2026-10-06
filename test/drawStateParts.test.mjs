import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// An object drawn through parts of its own, a glTF model's parts, an attached prefab's, a voxel map's see through
// blocks, draws with the settings set on it: each part reads the owner's where the owner set it away from the default,
// and its own otherwise, so a model's unlit or rough part keeps what its file gave it.
const { vec3, vec2, parseGLTF, level3DAddPrefab, level3DSpawn, VoxelMap, Shader, makeCubeMap, WHITE } = LJS;
new LJS.Render3DPlugin;

// a one triangle glTF whose single material is unlit, so its part starts with emissive 1
async function unlitModel()
{
    const bytes = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
    return parseGLTF({asset: {version: '2.0'}, extensionsUsed: ['KHR_materials_unlit'],
        buffers: [{byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64')}],
        bufferViews: [{buffer: 0, byteLength: 36}], accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'}],
        meshes: [{primitives: [{attributes: {POSITION: 0}, material: 0}]}],
        materials: [{extensions: {KHR_materials_unlit: {}}}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]});
}

// the settings set away from the default on an owner, which its parts should draw with
function setOwner(o)
{
    o.reflectivity = .8; o.specular = .5; o.receiveShadow = false; o.castShadow = false; o.renderAfter2D = true;
    o.renderOrder = 5; o.shader = new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }');
    o.environment = makeCubeMap(1, ()=> WHITE);
}
const drawsAs = (part, owner)=> ['reflectivity', 'specular', 'receiveShadow', 'castShadow', 'renderAfter2D',
    'renderOrder', 'shader', 'environment'].every((name)=> part[name] === owner[name]);

test('a glTF model\'s parts draw with the settings set on the model, and keep their own material otherwise', async ()=>
{
    const model = await unlitModel(), object = model.createObject(), part = object.parts[0];
    assert.equal(part.emissive, 1, 'unlit in its file');
    setOwner(object);
    assert.ok(drawsAs(part, object));
    assert.equal(part.emissive, 1, 'the model left at emissive 0 keeps the part\'s own');
    object.emissive = .5;
    assert.equal(part.emissive, .5, 'set on the model, the model\'s');
    object.destroy();
});

test('an attached prefab\'s parts draw with the settings set on the handle', ()=>
{
    level3DAddPrefab('Lamp', {attached: true, objects: [{type: 'Box', pos: [0, .5, 0]}]});
    const handle = level3DSpawn('Lamp', vec3()), part = handle.parts[0];
    setOwner(handle);
    assert.ok(drawsAs(part, handle));
    handle.destroy();
});

test('a voxel map\'s see through blocks draw in its render order too', ()=>
{
    const map = new VoxelMap(vec3(), vec3(2));
    map.renderOrder = 7;
    assert.equal(map.children[0].renderOrder, 7);
    assert.equal(map.children[0].transparent, true, 'still blended');
    map.destroy();
});
