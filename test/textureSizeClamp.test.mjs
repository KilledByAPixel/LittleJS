import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A texture the engine makes itself, a shadow map say, is never asked for at a size the device can not make: the
// size asked for falls back to the largest the device supports.

// a gl that notes the size of every texture made by size, and says how big a texture may be
function fakeGL(maxSize)
{
    const sizes = [];
    const gl = new Proxy({
        MAX_TEXTURE_SIZE: 3379, FRAMEBUFFER_COMPLETE: 36053,
        getParameter: (name)=> name === 3379 ? maxSize : 0,
        checkFramebufferStatus: ()=> 36053,
        createTexture: ()=> ({}), createFramebuffer: ()=> ({}),
        texImage2D: (...args)=> { typeof args[3] == 'number' && typeof args[4] == 'number' && sizes.push([args[3], args[4]]); },
        getShaderParameter: ()=> true, getProgramParameter: ()=> true, isContextLost: ()=> false,
    }, {get: (target, key)=> key in target ? target[key] : ()=> ({})});
    return {gl, sizes};
}

test('glClampTextureSize gives the size asked for, or the largest the device makes', ()=>
{
    const { run } = loadEngine();
    assert.equal(run('glClampTextureSize(4096)'), 4096, 'without WebGL nothing is known, the size stands');
    run('glMaxTextureSize = 2048');
    assert.equal(run('glClampTextureSize(4096)'), 2048);
    assert.equal(run('glClampTextureSize(1024)'), 1024);
});

test('the 3D shadow map falls back to the largest texture the device makes', ()=>
{
    const { gl, sizes } = fakeGL(2048);
    const { run } = loadEngine({gl});
    run(`setHeadlessMode(false); engineInitialized = true; new Render3DPlugin;
        glEnable = true; glContext = gl; glMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        render3D.shadowMapSize = 4096;
        render3DUpdateShadowMap(render3D.shadowMapSize);`);
    assert.deepEqual(sizes.at(-1), [2048, 2048]);
    assert.equal(run('render3D.shadowTextureSize'), 2048, 'what was made, for the shadow\'s math');
    assert.equal(run('render3D.shadowMapSize'), 4096, 'what was asked stays');
    run('render3DUpdateShadowMap(4096)');
    assert.equal(sizes.filter(([w])=> w === 2048).length, 1, 'not made again every frame');
});

test('the 2D light system clamps its shadow map and shadow textures to what the device makes', ()=>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new LightSystemPlugin; glMaxTextureSize = 2048;
        lightSystem.shadowMapSize = 4096; lightSystem.shadowTextureSize = 8192;
        lightSystem.clampTextureSizes();`);
    assert.deepEqual([...run('[lightSystem.shadowMapSize, lightSystem.shadowTextureSize]')], [2048, 2048]);
    run('lightSystem.textureSize = vec2(5000, 1000); lightSystem.clampTextureSizes();');
    assert.deepEqual([...run('[lightSystem.textureSize.x, lightSystem.textureSize.y]')], [2048, 1000]);
});
