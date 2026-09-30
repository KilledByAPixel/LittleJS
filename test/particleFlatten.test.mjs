import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { ParticleEmitter3D, particleEffect, particleEffect3D, particleEffectSanitize, Render3DPlugin, TileInfo,
    TextureInfo, vec2, vec3, WHITE, PI } = LJS;

// a 3D emitter's spawn area flat across the way it emits: a sphere as a disc, a box as a flat rectangle; and effects
// given a tile of the game's own art

new Render3DPlugin;

// an emitter that makes nothing on its own, spawning where its area says, particles at rest so they stay there
const makeEmitter = (emitSize)=> new ParticleEmitter3D(vec3(), emitSize, 0, 0, PI, undefined, WHITE, WHITE, WHITE,
    WHITE, 5, .1, .1, 0, 1, 0, 0, 0);
const spawned = (e, n=200)=>
{
    for (let i = 0; i < n; ++i) e.emitParticle();
    const d = e.particleData, out = [];
    for (let i = 0; i < e.particleCount; ++i)
        out.push([d[i*21], d[i*21+1], d[i*21+2]]);
    return out;
};

test('emitFlat makes a sphere a disc across the emitter\'s up, filling it', ()=>
{
    const e = makeEmitter(4);
    e.emitFlat = true;
    const points = spawned(e);
    assert.ok(points.every(([x, y, z])=> y === 0 && Math.hypot(x, z) <= 2 + 1e-9));
    assert.ok(points.some(([x, y, z])=> Math.hypot(x, z) > 1.8), 'out to the rim');
    e.destroy();
});

test('emitFlat makes a box flat, and it turns with the emitter', ()=>
{
    const e = makeEmitter(vec3(4, 2, 6));
    e.emitFlat = true;
    assert.ok(spawned(e).every(([x, y, z])=> y === 0 && Math.abs(x) <= 2 && Math.abs(z) <= 3));
    e.destroy();
    const turned = makeEmitter(vec3(4, 2, 6));
    turned.emitFlat = true;
    turned.rotation3D = vec3(0, 0, PI/2); // its up now along -x, the flat area across x
    assert.ok(spawned(turned).every(([x])=> Math.abs(x) < 1e-6));
    turned.destroy();
});

test('an effect\'s rectangle is a box as deep as it is wide in 3D, flat with flatten', ()=>
{
    const rect = particleEffectSanitize({settings: {emitRect: true, emitSize: 2, emitHeight: .5}});
    const box = particleEffect3D(rect), flat = particleEffect3D(rect, vec3(), {flatten: true});
    assert.deepEqual([box.emitSize.x, box.emitSize.y, box.emitSize.z, box.emitFlat], [2, .5, 2, false]);
    assert.equal(flat.emitFlat, true);
    const disc = particleEffect3D('fire', vec3(), {flatten: true});
    assert.ok(typeof disc.emitSize == 'number' && disc.emitFlat, 'a circle is a sphere, flattened a disc');
    box.destroy(), flat.destroy(), disc.destroy();
});

test('an effect draws with a tile given in the options, a whole texture made a tile in 2D', ()=>
{
    const texture = new TextureInfo(undefined, false), mine = new TileInfo(vec2(16), vec2(16), texture);
    const a = particleEffect('fire', vec2(), {tileInfo: mine}), b = particleEffect3D('fire', vec3(), {tileInfo: mine});
    assert.equal(a.tileInfo, mine);
    assert.equal(b.tileInfo, mine);
    const whole = particleEffect('fire', vec2(), {tileInfo: texture});
    assert.ok(whole.tileInfo instanceof TileInfo && whole.tileInfo.textureInfo === texture);
    const whole3D = particleEffect3D('fire', vec3(), {tileInfo: texture});
    assert.equal(whole3D.tileInfo, texture, '3D takes a whole texture as it is');
    a.destroy(), b.destroy(), whole.destroy(), whole3D.destroy();
});
