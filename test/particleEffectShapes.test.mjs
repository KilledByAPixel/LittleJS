import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the built-in effects' shapes, drawn once on a canvas: one cell each, with a pixel of space around every shape

test('every shape has a tile on one sheet made once, 30 pixels inside its 32 pixel cell', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`
        glContext = {}; var made = 0;
        OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; ++made; }
            getContext() { return new Proxy({ canvas: this }, { get: (t, k)=> k in t ? t[k] :
                k == 'createRadialGradient' ? ()=> ({ addColorStop() {} }) : ()=> {},
                set: (t, k, v)=> (t[k] = v, true) }); } };
        glRegisterTextureInfo = ()=> {};
        const tiles = particleEffectShapes.map(particleEffectShapeTile);
        JSON.stringify({made, count: tiles.length, same: tiles.every(t=> t.textureInfo === tiles[0].textureInfo),
            pos: tiles.map(t=> [t.pos.x, t.pos.y]), size: tiles.map(t=> [t.size.x, t.size.y]),
            again: particleEffectShapeTile('glow') === tiles[2], unknown: particleEffectShapeTile('nope') === undefined})`));
    assert.equal(result.made, 1);
    assert.equal(result.count, 10);
    assert.ok(result.same);
    assert.deepEqual(result.pos, result.pos.map((_, i)=> [i*32 + 1, 1]));
    assert.ok(result.size.every(s=> s[0] == 30 && s[1] == 30));
    assert.ok(result.again && result.unknown);
});

test('headless there is no sheet and no tile', ()=>
{
    const { run } = loadEngine();
    assert.equal(run('setHeadlessMode(true); particleEffectShapeTile("glow")'), undefined);
});
