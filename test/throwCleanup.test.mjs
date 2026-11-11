import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a game callback that throws inside an engine draw: the engine's own state is put back on the way out, so a game that
// catches the error and draws on is not left clipped, batched or additive

test('drawCanvas2D restores the context when its callback throws, and passes the error on', () =>
{
    const { run } = loadEngine();
    const result = run(`
        const calls = [];
        const context = { save: ()=> calls.push('save'), restore: ()=> calls.push('restore'),
            translate() {}, rotate() {}, scale() {} };
        let error;
        try { drawCanvas2D(vec2(), vec2(1), 0, false, ()=> { throw new Error('game'); }, true, context); }
        catch (e) { error = e.message; }
        drawCanvas2D(vec2(), vec2(1), 0, false, ()=> {}, true, context);
        JSON.stringify({ calls, error })`);
    assert.deepEqual(JSON.parse(result), { calls: ['save', 'restore', 'save', 'restore'], error: 'game' });
});

test('a particle that throws in render leaves the batch and the blend as they were', () =>
{
    const { run } = loadEngine();
    const result = run(`
        const emitter = new ParticleEmitter(vec2());
        emitter.additive = true;
        emitter.emitParticle().render = ()=> { throw new Error('particle'); };
        let error;
        try { emitter.render(); } catch (e) { error = e.message; }
        JSON.stringify({ error, particleTileBatch, glAdditive })`);
    assert.deepEqual(JSON.parse(result), { error: 'particle', particleTileBatch: false, glAdditive: false });
});
