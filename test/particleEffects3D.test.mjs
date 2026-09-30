import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { particleEffect3D, particleEffectSanitize, ParticleEmitter3D, Render3DPlugin, vec3, hsl, PI } = LJS;

// 3D effects: the same effect data builds a ParticleEmitter3D with the same look

new Render3DPlugin;
const effect = particleEffectSanitize({name: 'T', settings: {emitRate: 40, emitSize: .8, emitConeAngle: .4,
    particleTime: .7, sizeStart: .5, sizeEnd: .1, speed: .03, angleSpeed: .1, angleDamping: .98, damping: .95,
    gravity: .002, gravityScale: .5, fadeRate: .3, randomness: .25, additive: true, trailScale: 3, angle: PI/2,
    collideLevel: true, restitution: .3, friction: .6, colorStartA: hsl(.1, 1, .5)},
    behaviors: [{name: 'swirl', strength: 1}]});

test('particleEffect3D builds a 3D emitter with the same look', ()=>
{
    const e = particleEffect3D(effect, vec3(1, 2, 3), {scale: 2});
    assert.ok(e instanceof ParticleEmitter3D);
    assert.deepEqual([e.pos3D.x, e.pos3D.y, e.pos3D.z], [1, 2, 3]);
    assert.deepEqual([e.scale3D.x, e.scale3D.y, e.scale3D.z], [2, 2, 2]);
    for (const [k, v] of Object.entries({emitRate: 40, emitSize: .8, emitConeAngle: .4, particleTime: .7,
        sizeStart: .5, sizeEnd: .1, speed: .03, angleSpeed: .1, angleDamping: .98, damping: .95, gravity: .002,
        gravityScale: .5, fadeRate: .3, randomness: .25, additive: true, collideLevel: true, restitution: .3,
        friction: .6}))
        assert.equal(e[k], v, k);
    assert.ok(Math.abs(e.trailTime - 3/60) < 1e-12, 'a trail the same length');
    assert.ok(Math.abs(e.rotation3D.z - -PI/2) < 1e-12, 'turned about z the way the 2D angle turns');
    assert.equal(typeof e.particleUpdateCallback, 'function');
    e.destroy();
});

test('a turned effect shoots the same way in 3D as in 2D', ()=>
{
    // straight along the angle, a 2D emitter at angle PI/2 shoots toward +x
    const aimed = particleEffectSanitize({settings: {emitRate: 0, emitConeAngle: 0, speed: .1, randomness: 0,
        angle: PI/2}});
    const e = particleEffect3D(aimed);
    e.emitParticle();
    const d = e.particleData;
    assert.ok(d[3] > .09 && Math.abs(d[4]) < 1e-6, [...d.subarray(3, 6)].join());
    e.destroy();
});

test('a rectangle emitter becomes a flat box of the same size', ()=>
{
    const rect = particleEffectSanitize({settings: {emitRect: true, emitSize: 2, emitHeight: .5}});
    const e = particleEffect3D(rect);
    assert.deepEqual([e.emitSize.x, e.emitSize.y, e.emitSize.z], [2, .5, 0]);
    e.destroy();
});

test('every 3D behavior pushes a 3D particle without throwing', ()=>
{
    const with3D = LJS.particleEffectBehaviors.filter(b=> b.update3D);
    assert.ok(with3D.length >= 6, 'every built-in behavior but stick, which is landing friction in 3D, has a 3D push');
    for (const b of with3D)
    {
        const e = particleEffect3D(particleEffectSanitize({settings: {emitRate: 0},
            behaviors: [{name: b.name, strength: 1}]}));
        e.emitParticle();
        e.update();
        assert.ok(Number.isFinite(e.particleData[0]) && Number.isFinite(e.particleData[3]), b.name);
        e.destroy();
    }
});
