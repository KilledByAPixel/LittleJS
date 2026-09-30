import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';
const { particleEffect, particleEffectFromEmitter, particleEffectSanitize, particleEffectsAdd,
    particleEffectsAddBehavior, ParticleEmitter, vec2, hsl, PI } = LJS;

// 2D effects: particleEffect makes an emitter set to an effect, placed, scaled and recolored, running its behaviors

particleEffectsAdd({name: 'Test', settings: {emitRate: 50, emitSize: .5, gravity: .002, sizeStart: .3,
    colorStartA: hsl(.1, 1, .5), shape: 'glow', trailScale: 2, angleSpeed: .1}, behaviors: [{name: 'wobble', strength: 2}]});

test('particleEffect makes an emitter set to the effect, at a place, scale, angle and color', ()=>
{
    const e = particleEffect('test', vec2(3, 4), {scale: 2, angle: PI/2, hue: .5});
    assert.ok(e instanceof ParticleEmitter);
    assert.deepEqual([e.pos.x, e.pos.y, e.angle, e.scale], [3, 4, PI/2, 2]);
    assert.deepEqual([e.emitRate, e.gravity, e.sizeStart, e.trailScale, e.angleSpeed], [50, .002, .3, 2, .1]);
    assert.ok(Math.abs(e.colorStartA.HSLA()[0] - .6) < 1e-3, 'recolored');
    assert.equal(typeof e.particleUpdateCallback, 'function', 'runs its behaviors');
    e.destroy();
});

test('an effect object works in place of a name; an unknown name asserts in debug and is undefined in release', ()=>
{
    const e = particleEffect(particleEffectSanitize({settings: {emitRate: 9}}));
    assert.equal(e.emitRate, 9);
    e.destroy();
    assert.throws(()=> particleEffect('no such effect')); // the ESM build is the debug one, its ASSERT throws
    const release = loadEngine({}, 'setHeadlessMode(true);', 'littlejs.release.js');
    assert.equal(release.run("particleEffect('no such effect') === undefined"), true);
});

test('a behavior pushes each particle, by more for a bigger effect', ()=>
{
    for (const scale of [1, 4])
    {
        const e = particleEffect(particleEffectSanitize({settings: {speed: 0, emitRate: 0, randomness: 0},
            behaviors: [{name: 'wind', strength: 1}]}), vec2(), {scale});
        const p = e.emitParticle();
        p.spawnTime = LJS.time - p.lifeTime * .999; // nearly its whole life, just short of ending it
        p.update();
        assert.ok(Math.abs(p.velocity.x - .004 * .999 * scale) < 1e-9, String(p.velocity.x));
        e.destroy();
    }
});

test('a game can add a behavior, used by name', ()=>
{
    particleEffectsAddBehavior('lift', (p, s)=> p.velocity.y += s * .01, undefined, 0, 1, 1, 'Up');
    const e = particleEffect(particleEffectSanitize({settings: {speed: 0, emitRate: 0},
        behaviors: [{name: 'lift', strength: .5}]}));
    const p = e.emitParticle();
    p.update();
    assert.ok(p.velocity.y > 0);
    e.destroy();
});

test('an emitter made with the constructor reads back into an effect that makes the same emitter', ()=>
{
    const e = new ParticleEmitter(vec2(), .3, 2, 0, 80, 1, undefined, hsl(.2,1,.5), hsl(.3,1,.5), hsl(.4,1,.5,0),
        hsl(.5,1,.5,0), .9, .4, .1, .05, .02, .97, .99, -.5, .5, .2, .3);
    e.trailScale = 1.5, e.gravity = .001;
    const effect = particleEffectFromEmitter(e), again = particleEffect(effect);
    for (const k of ['emitRate', 'emitConeAngle', 'particleTime', 'sizeStart', 'sizeEnd', 'speed', 'angleSpeed',
        'damping', 'angleDamping', 'gravityScale', 'particleConeAngle', 'fadeRate', 'randomness', 'trailScale', 'gravity'])
        assert.ok(Math.abs(again[k] - e[k]) < 1e-6, k);
    assert.equal(effect.settings.emitSize, 2);
    assert.equal(effect.settings.shape, '');
    assert.equal(effect.settings.tileIndex, -1, 'no tile');
    e.destroy(), again.destroy();
});
