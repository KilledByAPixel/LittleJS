import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// An emitter's finishCallback is called once, with the emitter, when it finishes: done emitting and its last particle
// gone, or destroyed with none left; not when destroyed immediately, as a scene clear does; 2D and 3D alike.

const { run } = loadEngine();
run('setHeadlessMode(true); setEngineManualStep(true)');
await run('engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');

for (const [name, make] of [['2D', 'new ParticleEmitter(vec2(), 0, 0, .1, 100)'],
    ['3D', 'new ParticleEmitter3D(vec3(), 0, .1, 100)']])
{
    // what the callback saw, by the frames stepped
    const finished = (setup, ...steps)=> JSON.parse(run(`(()=> { const calls = [];
        const e = ${make};
        e.particleTime = .2;
        e.finishCallback = (emitter)=> calls.push([emitter === e, e.destroyed, emitter.particles?.length ?? emitter.particleCount]);
        ${setup}
        const seen = [];
        for (const step of ${JSON.stringify(steps)})
        {
            typeof step === 'number' ? engineStep(step) : eval(step);
            seen.push(calls.length);
        }
        e.destroy(true);
        return JSON.stringify({seen, calls}); })()`));

    test(`${name}: a burst calls it once its last particle is gone, given itself destroyed`, ()=>
    {
        const {seen, calls} = finished('', 6, 30, 60);
        assert.deepEqual(seen, [0, 1, 1], 'not while emitting, once when its particles are gone, never again');
        assert.deepEqual(calls, [[true, true, 0]]);
    });

    test(`${name}: destroy waits for the particles, then calls it`, ()=>
    {
        const {seen} = finished('e.emitTime = 0', 3, 'e.destroy()', 30);
        assert.deepEqual(seen, [0, 0, 1], 'an endless emitter finishes after destroy, when its particles are gone');
    });

    test(`${name}: destroy with no particles calls it at once`, ()=>
    {
        const {seen} = finished('e.emitTime = 0; e.emitRate = 0', 1, 'e.destroy()');
        assert.deepEqual(seen, [0, 1]);
    });

    test(`${name}: destroyed immediately, as a scene clear does, it is not called`, ()=>
    {
        assert.deepEqual(finished('', 3, 'e.destroy(true)', 30).seen, [0, 0, 0]);
        assert.deepEqual(finished('', 3, 'engineObjectsDestroy()', 30).seen, [0, 0, 0]);
    });
}
