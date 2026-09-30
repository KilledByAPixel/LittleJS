import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { ParticleEmitter, vec2, setGravity } = LJS;

// an emitter at scale s makes the same effect blown up: its spawn area, sizes, speed and fall grow by s

const make = (scale)=>
{
    // emitSize 2, sizes .4 to .2, speed .1, no randomness so every particle is the same
    const e = new ParticleEmitter(vec2(), 0, 2, 0, 0, 0, undefined, undefined, undefined, undefined, undefined,
        1, .4, .2, .1, 0, 1, 1, 0, 0, .1, 0);
    e.scale = scale;
    return e;
};

test('scale and gravity default to 1 and 0', ()=>
{
    const e = new ParticleEmitter(vec2());
    assert.deepEqual([e.scale, e.gravity], [1, 0]);
    e.destroy();
});

test('a scaled emitter spawns its particles scaled: area, sizes, speed', ()=>
{
    for (const scale of [1, 3])
    {
        const e = make(scale);
        for (let i = 0; i < 200; ++i) e.emitParticle();
        const p = e.particles;
        assert.ok(p.every(q=> q.pos.length() <= 1 * scale + 1e-9), 'inside the scaled circle');
        assert.ok(p.some(q=> q.pos.length() > .9 * scale), 'and filling it');
        assert.ok(p.every(q=> Math.abs(q.sizeStart - .4 * scale) < 1e-9 && Math.abs(q.sizeEnd - .2 * scale) < 1e-9));
        assert.ok(p.every(q=> Math.abs(q.velocity.length() - .1 * scale) < 1e-9));
        assert.ok(p.every(q=> q.scale === scale));
        e.destroy();
    }
});

test('the fall is the emitter gravity plus world gravity times gravityScale, times the particle scale', ()=>
{
    const saved = LJS.gravity.copy();
    setGravity(vec2(0, -.02));
    try
    {
        const e = make(2);
        e.gravity = .004, e.gravityScale = .5, e.speed = 0;
        const p = e.emitParticle();
        p.update();
        // (.004 + -.02 * .5) * 2 = -.012
        assert.ok(Math.abs(p.velocity.y - -.012) < 1e-12, String(p.velocity.y));
        e.destroy();
    }
    finally { setGravity(saved); }
});

test('changing scale while particles fly leaves them as they were born', ()=>
{
    const e = make(1);
    e.gravity = -.01, e.speed = 0;
    const early = e.emitParticle();
    e.scale = 4;
    const late = e.emitParticle();
    early.update(), late.update();
    assert.ok(Math.abs(early.velocity.y - -.01) < 1e-12, 'falls at its own scale');
    assert.ok(Math.abs(late.velocity.y - -.04) < 1e-12);
    assert.equal(early.sizeStart, .4);
    e.destroy();
});

test('a local space emitter scales its spawn offsets too', ()=>
{
    const e = make(5);
    e.localSpace = true;
    for (let i = 0; i < 100; ++i) e.emitParticle();
    assert.ok(e.particles.every(q=> q.pos.length() <= 5 + 1e-9));
    assert.ok(e.particles.some(q=> q.pos.length() > 4));
    e.destroy();
});
