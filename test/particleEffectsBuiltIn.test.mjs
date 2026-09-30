import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { particleEffect, particleEffect3D, particleEffectsGet, particleEffectsBuiltIn, particleEffectShapes,
    Render3DPlugin, vec2, vec3 } = LJS;

// the built-in effects: 24 of them, each tuned around a one unit emitter, each building in 2D and 3D

new Render3DPlugin;
const oneShots = ['explosion', 'hit', 'dust', 'debris', 'muzzle', 'blood', 'confetti', 'splash'];

test('the 24 built-in effects are there, each with a shape of the sheet', ()=>
{
    assert.equal(particleEffectsBuiltIn.length, 24);
    for (const name of particleEffectsBuiltIn)
    {
        const e = particleEffectsGet(name);
        assert.ok(e, name);
        assert.ok(particleEffectShapes.includes(e.settings.shape), name + ' shape ' + e.settings.shape);
        assert.equal(e.settings.gravityScale, 0, name + ' falls by its own gravity');
        assert.equal(e.settings.emitTime > 0, oneShots.includes(name), name + ' one-shot or not');
    }
});

test('every built-in builds in 2D and 3D headless, untextured, and runs a second without trouble', ()=>
{
    for (const name of particleEffectsBuiltIn)
    {
        const a = particleEffect(name, vec2()), b = particleEffect3D(name, vec3());
        for (let i = 0; i < 60; ++i) a.update(), b.update();
        assert.ok(a.particles.every(p=> Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)), name);
        a.destroy(), b.destroy();
    }
});

test('every built-in fits about one unit: its particles start within one unit of the emitter', ()=>
{
    for (const name of particleEffectsBuiltIn)
    {
        const e = particleEffect(name, vec2());
        for (let i = 0; i < 50; ++i) e.emitParticle();
        const far = Math.max(...e.particles.map(p=> p.pos.length()));
        assert.ok(far <= 1, name + ' spawns ' + far + ' out'); // spawn areas are at most one unit across
        e.destroy();
    }
});
