import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';
const { particleEffect, particleEffect3D, particleEffectApply, particleEffectSanitize, particleEffectsGet,
    particleEffectsBuiltIn, ParticleEmitter, TileCollisionLayer, Render3DPlugin, engineInit, setEngineManualStep,
    setGravity, vec2, vec3, RED, PI } = LJS;

// the final review's findings on the particle effects library, each pinned

setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});
new Render3DPlugin;

test('3D stick leaves particles in open air moving, it is the friction they land with', ()=>
{
    const e = particleEffect3D(particleEffectSanitize({settings: {emitRate: 0, speed: .1, gravity: -.01,
        emitConeAngle: .8, randomness: 0, particleTime: 5}, behaviors: [{name: 'stick', strength: 1}]}));
    for (let i = 0; i < 100; ++i) e.emitParticle();
    for (let i = 0; i < 30; ++i) e.update();
    const d = e.particleData, frozen = [];
    for (let i = 0; i < e.particleCount; ++i)
        d[i*21+3] === 0 && d[i*21+5] === 0 && frozen.push(i);
    assert.equal(frozen.length, 0, frozen.length + ' particles stopped in the air');
    assert.equal(e.friction, 0, 'stick 1 lands with no sliding');
    e.destroy();
});

test('2D stick grips on landing in a game with no world gravity, by the effect\'s own fall', ()=>
{
    setGravity(vec2());
    const floor = new TileCollisionLayer(vec2(), vec2(20, 10));
    for (let x = 0; x < 20; ++x)
        floor.setCollisionData(vec2(x, 0));
    const e = particleEffect(particleEffectSanitize({settings: {emitRate: 0, speed: 0, gravity: -.01,
        collideLevel: true, particleTime: 5, randomness: 0}, behaviors: [{name: 'stick', strength: 1}]}),
        vec2(10, 3));
    const p = e.emitParticle();
    p.velocity.x = .05;
    let landed = false;
    for (let i = 0; i < 120; ++i)
        p.update(), landed ||= p.groundObject === floor;
    assert.ok(landed, 'the particle lands on the floor');
    assert.equal(p.velocity.x, 0, 'and grips it');
    e.destroy(), floor.destroy();
});

test('an effect object written by hand plays in 2D and 3D, and one changed after it was added still plays', ()=>
{
    const raw = {settings: {emitRate: 5, colorStartA: RED}};
    const a = particleEffect(raw, vec2(), {hue: .5}), b = particleEffect3D(raw);
    assert.equal(a.emitRate, 5);
    assert.equal(b.emitRate, 5);
    const c = new ParticleEmitter(vec2());
    particleEffectApply(c, {settings: {colorStartA: RED, sizeStart: .7}});
    assert.equal(c.sizeStart, .7);
    const fire = particleEffectsGet('fire'), saved = fire.settings.colorStartA;
    fire.settings.colorStartA = RED; // a Color, as a game would write it
    try
    {
        const d = particleEffect('fire');
        assert.ok(d.colorStartA.r === 1 && d.colorStartA.g === 0, 'the change is used');
        d.destroy();
    }
    finally { fire.settings.colorStartA = saved; }
    a.destroy(), b.destroy(), c.destroy();
});

test('a fractional emit rate is kept, so a slow effect still emits', ()=>
{
    assert.equal(particleEffectSanitize({settings: {emitRate: .4}}).settings.emitRate, .4);
    assert.equal(particleEffectSanitize({settings: {tileIndex: 2.7}}).settings.tileIndex, 3, 'tiles stay whole');
});

test('REFERENCE says each built-in effect\'s starting hue and whether it is a one-shot', ()=>
{
    const reference = fs.readFileSync(new URL('../REFERENCE.md', import.meta.url), 'utf8');
    for (const name of particleEffectsBuiltIn)
    {
        const e = particleEffectsGet(name), oneShot = e.settings.emitTime > 0;
        const line = reference.split('\n').find((l)=> l.includes("'" + name + "'"));
        assert.ok(line, name + ' has a line');
        assert.match(line, /hue [.0-9]+|no hue/, name + ' says its hue');
        assert.match(line, oneShot ? /one-shot/ : /continuous/, name + (oneShot ? ' is a one-shot' : ' is continuous'));
    }
});
