import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A one shot emitter gives the same count wherever it is made: 1 at once and then its rate for its emit time, where
// the frame it ended on was decided by the rounding of time, and an explosion gave 61 particles on some frames and 71
// on others; 2D and 3D alike.

async function engine()
{
    const e = loadEngine();
    e.run('setHeadlessMode(true); setEngineManualStep(true)');
    await e.run('engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

test('a 2D one shot gives 1 + rate times time particles, made on any frame', async ()=>
{
    const { run } = await engine();
    const counts = JSON.parse(run(`(()=> { const counts = new Set;
        for (let f = 0; f < 200; ++f)
        {
            let n = 0;
            const e = new ParticleEmitter(vec2(), 0, 0, .1, 600); // 60 over its .1 seconds
            e.particleCreateCallback = ()=> ++n;
            engineStep(12);
            counts.add(n);
            engineStep(f % 7); // the next one starts on another frame
        }
        return JSON.stringify([...counts]); })()`));
    assert.deepEqual(counts, [61]);
});

test('a 3D one shot does the same', async ()=>
{
    const { run } = await engine();
    const counts = JSON.parse(run(`(()=> { const counts = new Set;
        for (let f = 0; f < 200; ++f)
        {
            let n = 0;
            const e = new ParticleEmitter3D(vec3(), 0, .1, 600);
            e.particleCreateCallback = ()=> ++n;
            engineStep(12);
            counts.add(n);
            engineStep(f % 7);
        }
        return JSON.stringify([...counts]); })()`));
    assert.deepEqual(counts, [61]);
});
