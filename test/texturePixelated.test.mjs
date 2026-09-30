import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a texture can be smooth or pixelated on its own, whatever tilesPixelated says for the rest: a soft glow in a pixel
// art game, or pixel art in a smooth one

// a vm engine on a GL stand in that records how each texture is made
function setup()
{
    const engine = loadEngine();
    engine.run(`
        glEnable = true; tilesPixelated = true;
        var made = [];
        const constants = {TEXTURE_2D: 'T2D', NEAREST: 'NEAREST', LINEAR: 'LINEAR', LINEAR_MIPMAP_LINEAR: 'LINEAR_MIPMAP',
            NEAREST_MIPMAP_LINEAR: 'NEAREST_MIPMAP', TEXTURE_MAG_FILTER: 'MAG', TEXTURE_MIN_FILTER: 'MIN',
            UNPACK_PREMULTIPLY_ALPHA_WEBGL: 'PREMULTIPLY'};
        let current;
        glContext = new Proxy(constants, { get: (t, key)=> key in t ? t[key] :
            key == 'createTexture' ? ()=> (current = {params: {}}, made.push(current), current) :
            key == 'texParameteri' ? (target, name, value)=> current && (current.params[name] = value) :
            key == 'pixelStorei' ? (name, value)=> value && current && (current.premultiplied = true) :
            key == 'generateMipmap' ? ()=> current && (current.mipmaps = true) :
            key == 'createSampler' ? ()=> ({params: {}}) :
            key == 'samplerParameteri' ? (s, name, value)=> s.params[name] = value :
            key == 'getExtension' ? ()=> undefined : ()=> {} });
        var image = { width: 4, height: 4 };
    `);
    return engine;
}
const plain = (x)=> JSON.parse(JSON.stringify(x));

test('a texture follows tilesPixelated unless it says otherwise', ()=>
{
    const { run } = setup();
    const result = plain(run(`
        made = [];
        new TextureInfo(image);                     // follows the setting, pixelated
        new TextureInfo(image, true, false, false); // smooth on its own
        new TextureInfo(image, true, false, true);  // pixelated on its own
        made.map((t)=> ({mag: t.params.MAG, min: t.params.MIN, mipmaps: !!t.mipmaps, premultiplied: !!t.premultiplied}))
    `));
    assert.deepEqual(result, [
        {mag: 'NEAREST', min: 'NEAREST', mipmaps: false, premultiplied: false},
        {mag: 'LINEAR', min: 'LINEAR_MIPMAP', mipmaps: true, premultiplied: true},
        {mag: 'NEAREST', min: 'NEAREST', mipmaps: false, premultiplied: false}]);
});

test('setPixelated remakes a texture smooth or sharp, and undefined follows the setting again', ()=>
{
    const { run } = setup();
    const result = plain(run(`
        const info = new TextureInfo(image);
        made = [];
        info.setPixelated(false);
        const smooth = made.at(-1).params.MAG;
        info.setPixelated(undefined);
        [smooth, made.at(-1).params.MAG, info.pixelated === undefined]
    `));
    assert.deepEqual(result, ['LINEAR', 'NEAREST', true]);
});

test('the 3D pass samples a smooth texture smoothly in a pixelated game', ()=>
{
    const { run } = setup();
    const result = plain(run(`
        render3D = {samplers: new Map, anisotropy: 1}; // what the sampler reads, the plugin needs a real GL
        const sharp = render3DSampler(false, false), smooth = render3DSampler(false, false, false);
        [sharp.params.MAG, smooth.params.MAG, smooth.params.MIN, sharp !== smooth]
    `));
    assert.deepEqual(result, ['NEAREST', 'LINEAR', 'LINEAR_MIPMAP', true]);
});

test('the engine\'s soft textures, the light glow and the particle shapes, are smooth in a pixel art game', ()=>
{
    const { run } = setup();
    const result = plain(run(`
        OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; }
            getContext() { return new Proxy({ canvas: this }, { get: (t, k)=> k in t ? t[k] :
                k == 'createRadialGradient' ? ()=> ({ addColorStop() {} }) : ()=> {},
                set: (t, k, v)=> (t[k] = v, true) }); } };
        [engineGlowTexture(1).pixelated, particleEffectShapeTile('glow').textureInfo.pixelated]
    `));
    assert.deepEqual(result, [false, false]);
});
