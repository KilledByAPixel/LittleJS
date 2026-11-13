import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A Render3DPlugin made again in a release build, as a scene's enter does, gives back what the old one made on the
// GPU. Passes 5 and 6 each found one it left behind, since the GPU objects are listed in two places, render3DFreeGL
// and render3DContextLost; this runs a scene with every kind made, then checks each GPU object the old plugin holds
// is deleted, read from the plugin itself so a new one is checked without being listed here.

// a WebGL context that records what is made and deleted, enough for the 3D pass to run
function makeGL()
{
    let id = 0;
    const made = new Set, deleted = new Set, state = {fb: null, depthMask: true};
    const make = (kind)=> { const o = {kind, id: ++id}; made.add(o); return o; };
    const constants = {
        TEXTURE0: 33984, TEXTURE_2D: 3553, TEXTURE_CUBE_MAP: 34067, FRAMEBUFFER: 36160, ARRAY_BUFFER: 34962,
        FRAMEBUFFER_COMPLETE: 36053, MAX_TEXTURE_SIZE: 3379, FRAMEBUFFER_BINDING: 36006, DEPTH_WRITEMASK: 2930,
        MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_RENDERBUFFER_SIZE: 34024, TEXTURE_CUBE_MAP_POSITIVE_X: 34069,
    };
    const calls = {
        createTexture: ()=> make('texture'), createFramebuffer: ()=> make('framebuffer'),
        createBuffer: ()=> make('buffer'), createVertexArray: ()=> make('vertexArray'),
        createSampler: ()=> make('sampler'), createRenderbuffer: ()=> make('renderbuffer'),
        createProgram: ()=> make('program'), createShader: ()=> make('shader'),
        bindFramebuffer: (target, fb)=> { state.fb = fb; },
        depthMask: (mask)=> { state.depthMask = mask; },
        getParameter: (p)=> p === 3379 || p === 34076 || p === 34024 ? 4096 : p === 36006 ? state.fb :
            p === 2930 ? state.depthMask : 0,
        checkFramebufferStatus: ()=> 36053,
        getShaderParameter: ()=> true, getProgramParameter: ()=> true, isContextLost: ()=> false,
        getUniformLocation: (program, name)=> ({program, name}), getExtension: ()=> null,
    };
    const gl = new Proxy({...constants}, {get: (target, key)=>
    {
        if (key in target) return target[key];
        if (typeof key === 'symbol') return undefined;
        return (...args)=>
        {
            if (typeof key === 'string' && key.startsWith('delete') && args[0]) deleted.add(args[0]);
            return calls[key]?.(...args);
        };
    }});
    return {gl, made, deleted};
}

test('a Render3DPlugin made again deletes every GPU object the old one held, and keeps its pending captures', ()=>
{
    const {gl, made, deleted} = makeGL();
    const { run } = loadEngine({gl}, '', 'littlejs.release.js');
    run(`setHeadlessMode(false); engineInitialized = true; glEnable = true; glContext = gl;
        glCanvas = {width: 800, height: 600}; mainCanvasSize = vec2(800, 600); glMaxTextureSize = 4096;
        glArrayBuffer = {kind: 'arrayBuffer'};`);
    run(`new Render3DPlugin;
        render3D.shadows = true; render3D.depthTexture = true; render3D.camera.pos = vec3(0, 1, 5);
        const cube = new CubeMap(16); cube.capture(vec3()); render3D.environment = cube;
        render3D.skyBox = makeCubeMap(4, ()=> WHITE);
        new EngineObject3D(vec3(), render3D.boxMesh).reflectivity = 1;
        render3D.updateMatrices(); render3DRenderPass(false);
        var pending = new CubeMap(8); pending.capture(vec3(1, 0, 0));`);
    // every GPU object the plugin holds, in its fields and in its lists and maps
    const held = run(`(()=>
    {
        const held = [];
        const look = (value)=> value && typeof value === 'object' && 'kind' in value && 'id' in value &&
            held.push(value);
        for (const value of Object.values(render3D))
        {
            look(value);
            if (Array.isArray(value)) value.forEach(look);
            if (value instanceof Map) value.forEach(look);
        }
        return held;
    })()`);
    assert.ok(held.length > 10, 'the scene made the plugin\'s objects: ' + held.length);
    assert.ok(held.every((o)=> made.has(o)));
    run('new Render3DPlugin');
    const left = Array.from(held).filter((o)=> !deleted.has(o)).map((o)=> o.kind + ' ' + o.id); // an array of this realm
    assert.deepEqual(left, [], 'every one is deleted');
    assert.equal(run('render3D.cubeCaptures.has(pending)'), true, 'a capture asked for is still to be drawn');
});
