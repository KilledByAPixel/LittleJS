import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';
const { particleEffect, particleEffect3D, particleEffectSanitize, particleEffectsAddBehavior, Render3DPlugin,
    vec2, vec3, RED } = LJS;

// an effect's settings overridden for one play by the options, and the batch of review minors on the plugin

new Render3DPlugin;

test('any setting in the options replaces the effect\'s own for that play, in 2D and 3D', ()=>
{
    const a = particleEffect('fire', vec2(), {emitTime: .5, emitRate: 30, speed: .05});
    assert.deepEqual([a.emitTime, a.emitRate, a.speed], [.5, 30, .05]);
    const b = particleEffect3D('confetti', vec3(), {emitTime: 0, emitRate: 20});
    assert.deepEqual([b.emitTime, b.emitRate], [0, 20]);
    const c = particleEffect('fire');
    assert.equal(c.emitTime, 0, 'the effect itself is unchanged');
    a.destroy(), b.destroy(), c.destroy();
});

test('an override is sanitized like any setting, a color can be a Color, and the hue turns it too', ()=>
{
    const e = particleEffect('fire', vec2(), {damping: 5, colorStartA: RED, hue: .5});
    assert.equal(e.damping, 1, 'clamped');
    assert.ok(Math.abs(e.colorStartA.HSLA()[0] - .5) < 1e-3, 'red turned half way round');
    e.destroy();
});

test('a behavior a game adds after an effect names it still runs', ()=>
{
    const effect = particleEffectSanitize({settings: {speed: 0, emitRate: 0}, behaviors: [{name: 'rise', strength: .5}]});
    assert.deepEqual(effect.behaviors, [{name: 'rise', strength: .5}], 'kept though unknown yet');
    particleEffectsAddBehavior('rise', (p, s)=> p.velocity.y += s * .01);
    const e = particleEffect(effect), p = e.emitParticle();
    p.update();
    assert.ok(p.velocity.y > 0);
    e.destroy();
});

test('2D wobble adds nothing to a particle, it keeps the shape it was made with', ()=>
{
    const e = particleEffect(particleEffectSanitize({settings: {emitRate: 0}, behaviors: [{name: 'wobble', strength: 1}]}));
    const p = e.emitParticle(), keys = Object.keys(p).join();
    p.update();
    assert.equal(Object.keys(p).join(), keys);
    e.destroy();
});

test('3D behaviors read the emitter once an update, not once a particle', ()=>
{
    const { run } = loadEngine();
    const counts = run(`
        new Render3DPlugin;
        let reads = 0;
        const matrixOf = render3DObjectMatrix;
        render3DObjectMatrix = (o)=> (++reads, matrixOf(o));
        const e = particleEffect3D(particleEffectSanitize({settings: {emitRate: 0, particleTime: 9},
            behaviors: [{name: 'wobble', strength: 1}, {name: 'attract', strength: 1}, {name: 'wind', strength: 1}]}));
        for (let i = 0; i < 50; ++i) e.emitParticle();
        reads = 0;
        e.update();
        [reads, e.particleView.scale];
    `);
    assert.ok(counts[0] <= 2, counts[0] + ' matrix reads for 50 particles');
    assert.equal(counts[1], 1, 'the view carries the scale');
});
