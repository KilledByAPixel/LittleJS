import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { particleEffect3D, particleEffectApply3D, particleEffectsGet, Render3DPlugin, vec3 } = LJS;

// a 3D emitter takes an effect live, the way particleEffectApply does in 2D, keeping its particles

new Render3DPlugin;

const fields = (e)=> JSON.stringify({emitSize: e.emitSize, emitTime: e.emitTime, emitRate: e.emitRate,
    cone: e.emitConeAngle, colors: [e.colorStartA, e.colorStartB, e.colorEndA, e.colorEndB], time: e.particleTime,
    sizes: [e.sizeStart, e.sizeEnd], speed: e.speed, damping: e.damping, gravity: e.gravity, fade: e.fadeRate,
    randomness: e.randomness, additive: e.additive, gravityScale: e.gravityScale, angleSpeed: e.angleSpeed,
    angleDamping: e.angleDamping, trail: e.trailTime, collide: e.collideLevel, restitution: e.restitution,
    friction: e.friction, rotation: e.rotation3D, callback: !!e.particleUpdateCallback});

test('particleEffectApply3D sets a live emitter to an effect, as particleEffect3D would make it', ()=>
{
    const live = particleEffect3D('fire', vec3(1, 2, 3), {scale: 2, flatten: true});
    for (let i = 0; i < 20; ++i) live.emitParticle();
    const count = live.particleCount;
    for (const name of ['smoke', 'blood', 'rain', 'magic'])
    {
        particleEffectApply3D(live, particleEffectsGet(name));
        const made = particleEffect3D(name);
        assert.equal(fields(live), fields(made), name);
        made.destroy();
    }
    assert.equal(live.particleCount, count, 'its particles stay');
    assert.deepEqual([live.pos3D.x, live.scale3D.x, live.emitFlat], [1, 2, true], 'place, scale and flatten stay');
    live.destroy();
});

test('particleEffectApply3D takes an effect written by hand', ()=>
{
    const e = particleEffect3D('fire');
    particleEffectApply3D(e, {settings: {emitRate: 7, emitRect: true, emitSize: 2, emitHeight: 1}});
    assert.equal(e.emitRate, 7);
    assert.deepEqual([e.emitSize.x, e.emitSize.y, e.emitSize.z], [2, 1, 2]);
    e.destroy();
});

test('applying an effect to an emitter winding down after destroy keeps it winding down, 2D and 3D', ()=>
{
    const { particleEffect, particleEffectApply } = LJS;
    const flat = particleEffect('fire');
    for (let i = 0; i < 5; ++i) flat.emitParticle();
    flat.destroy();
    particleEffectApply(flat, particleEffectsGet('smoke'));
    assert.equal(flat.emitTime, -1, '2D stays ended');
    flat.destroy(true);

    const deep = particleEffect3D('fire');
    for (let i = 0; i < 5; ++i) deep.emitParticle();
    deep.destroy();
    particleEffectApply3D(deep, particleEffectsGet('smoke'));
    assert.equal(deep.emitTime, -1, '3D stays ended');
    deep.destroy(true);
});
