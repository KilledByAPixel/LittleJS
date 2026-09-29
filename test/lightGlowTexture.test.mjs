import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the glow's texture: a bell from the middle, full there and nothing at the edge, fading faster the higher the
// falloff; one texture for each falloff, rounded so a glow that changes its falloff every frame makes only a few

const { run } = loadEngine();
const alpha = (r, falloff)=> run(`render3DGlowAlpha(${r}, ${falloff})`);

test('the glow is full in the middle and nothing at the edge, at any falloff', ()=>
{
    for (const falloff of [.5, 1, 3])
    {
        assert.equal(alpha(0, falloff), 1);
        assert.ok(Math.abs(alpha(1, falloff)) < 1e-9);
    }
});

test('a higher falloff fades faster, a lower one is a wider haze', ()=>
{
    assert.ok(alpha(.5, 2) < alpha(.5, 1));
    assert.ok(alpha(.5, .5) > alpha(.5, 1));
});

test('each falloff gets a texture of its own, made once, and close ones share', ()=>
{
    run(`glContext = {}; var made = 0;
        OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; ++made; }
            getContext() { return { createRadialGradient: ()=> ({ addColorStop() {} }), fillRect() {} }; } };
        glRegisterTextureInfo = ()=> {};`);
    assert.equal(run('render3DGlow(1) === render3DGlow(1)'), true);
    assert.equal(run('render3DGlow(1) === render3DGlow(1.01)'), true, 'rounded to a tenth');
    assert.equal(run('render3DGlow(1) === render3DGlow(2)'), false);
    assert.equal(run('made'), 2);
});
