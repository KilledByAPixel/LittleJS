import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// glTF textures on a stand-in for WebGL: every one a load makes is freed by dispose, or by a load that fails, and a
// sampler's wrap modes reach the texture as they are

// a triangle in each of two scenes, only the second textured; scene 0 is the one loaded
const triangle = {
    asset: {version: '2.0'},
    buffers: [{byteLength: 36, uri: 'data:application/octet-stream;base64,' +
        Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).toString('base64')}],
    bufferViews: [{buffer: 0, byteLength: 36}],
    accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'}],
    meshes: [{primitives: [{attributes: {POSITION: 0}}]}, {primitives: [{attributes: {POSITION: 0}, material: 0}]}],
    nodes: [{mesh: 0}, {mesh: 1}],
    scenes: [{nodes: [0]}, {nodes: [1]}],
    scene: 0,
    images: [{uri: 'data:image/jpeg;base64,AA=='}],
    textures: [{source: 0}],
    materials: [{pbrMetallicRoughness: {baseColorTexture: {index: 0}}}],
};

// an engine whose textures are counted as they are made and deleted
function textureEngine(json)
{
    const counts = {created: 0, deleted: 0};
    const engine = loadEngine({atob, Response, Blob, gltfJSON: json, counts,
        createImageBitmap: async ()=> ({width: 8, height: 8})});
    engine.run(`glContext = {}; glCreateTexture = ()=> ({id: ++counts.created}); glDeleteTexture = ()=> ++counts.deleted;`);
    return {...engine, counts};
}

test('a texture only another scene uses is freed with the model, not kept by the engine', async () =>
{
    const {run, counts} = textureEngine(triangle);
    const before = run('glTextureInfos.size');
    for (let i = 0; i < 3; ++i)
        await run('parseGLTF(gltfJSON).then(model=> model.dispose())');
    assert.equal(counts.deleted, counts.created, 'each texture made is deleted');
    assert.equal(run('glTextureInfos.size'), before);
});

test('a load that fails after its textures are made frees them', async () =>
{
    const broken = structuredClone(triangle);
    broken.scene = 1; // the textured scene, its triangle reading an accessor that is not there
    broken.meshes[1].primitives[0].attributes.POSITION = 5;
    const {run, counts} = textureEngine(broken);
    const before = run('glTextureInfos.size');
    await assert.rejects(run('parseGLTF(gltfJSON)'));
    assert.ok(counts.created > 0, 'the texture was made before the failure');
    assert.equal(counts.deleted, counts.created);
    assert.equal(run('glTextureInfos.size'), before);
});

// a stand-in for WebGL with the constants texture setup reads, keeping each wrap mode it is given
const REPEAT = 10497, CLAMP = 33071, MIRRORED = 33648, WRAP_S = 10242, WRAP_T = 10243;
function wrapGL()
{
    const gl = {TEXTURE_2D: 3553, TEXTURE_WRAP_S: WRAP_S, TEXTURE_WRAP_T: WRAP_T, TEXTURE_MAG_FILTER: 10240,
        TEXTURE_MIN_FILTER: 10241, NEAREST: 9728, LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987,
        NEAREST_MIPMAP_LINEAR: 9986, REPEAT, CLAMP_TO_EDGE: CLAMP, MIRRORED_REPEAT: MIRRORED, wraps: [],
        createTexture: ()=> ({}), deleteTexture() {}, bindTexture() {}, generateMipmap() {},
        texParameteri: (target, parameter, value)=> (parameter === WRAP_S || parameter === WRAP_T) &&
            gl.wraps.push([parameter, value]),
        createSampler: ()=> ({parameters: []}), deleteSampler() {}, getExtension: ()=> null,
        samplerParameteri: (sampler, parameter, value)=> sampler.parameters.push([parameter, value])};
    return gl;
}

test('a glTF sampler wraps each axis its own way, mirrored repeat included', async () =>
{
    for (const sampler of [{wrapS: CLAMP, wrapT: REPEAT}, {wrapS: MIRRORED, wrapT: MIRRORED}, {}])
    {
        const json = structuredClone(triangle);
        json.scene = 1; // the textured one
        json.textures[0].sampler = 0;
        json.samplers = [sampler];
        const gl = wrapGL();
        const {run} = loadEngine({atob, Response, Blob, gltfJSON: json, gl,
            createImageBitmap: async ()=> ({width: 8, height: 8})});
        run('glContext = gl; glSetTextureData = ()=> {};');
        await run('parseGLTF(gltfJSON).then(model=> model.dispose())');
        const s = sampler.wrapS ?? REPEAT, t = sampler.wrapT ?? REPEAT; // repeat when the file says nothing
        assert.deepEqual(gl.wraps, [[WRAP_S, s], [WRAP_T, t]]);
    }
});

test('the 3D pass samples a texture with its own wrap modes, and a true or false wrap does both axes', () =>
{
    const gl = wrapGL();
    const {run} = loadEngine({gl});
    run('setHeadlessMode(true); new Render3DPlugin; glContext = gl; render3DUpdateSamplers();');
    const wraps = (wrap)=> run(`render3DSampler(${JSON.stringify(wrap)}, false).parameters`)
        .filter(([p])=> p === WRAP_S || p === WRAP_T).map(([p, v])=> [p, v]);
    assert.deepEqual(wraps([CLAMP, MIRRORED]), [[WRAP_S, CLAMP], [WRAP_T, MIRRORED]]);
    assert.deepEqual(wraps(true), [[WRAP_S, REPEAT], [WRAP_T, REPEAT]]);
    assert.deepEqual(wraps(false), [[WRAP_S, CLAMP], [WRAP_T, CLAMP]]);
    assert.equal(run('render3DSampler(true, false) === render3DSampler(true, false)'), true, 'made once');
    assert.equal(run('render3DSampler(true, false) === render3DSampler(true, true)'), false, 'hard edged apart');
});

test('a TextureInfo made with true or false wrap still repeats or clamps both axes', () =>
{
    const gl = wrapGL();
    const {run} = loadEngine({gl});
    run('glContext = gl; glSetTextureData = ()=> {};');
    run('new TextureInfo({width: 8, height: 8}, true, true); new TextureInfo({width: 8, height: 8}, true, false)');
    assert.deepEqual(gl.wraps, [[WRAP_S, REPEAT], [WRAP_T, REPEAT], [WRAP_S, CLAMP], [WRAP_T, CLAMP]]);
});
