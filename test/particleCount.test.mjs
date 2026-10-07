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

test('round rates and times give 1 + rate times time, the last particle not lost to rounding, 2D and 3D', async ()=>
{
    // the sum of the steps comes out a hair under the emit time, and rate 30 for a second gave 30 where it is 31
    const { run } = await engine();
    const pairs = [[30, 1], [30, .3], [30, .6], [30, .7], [30, .8], [30, .9], [60, 1/3], [60, .7]];
    for (let t = 1; t <= 100; ++t)
        pairs.push([100, t / 100]);
    const wrong = JSON.parse(run(`(()=> { const wrong = [];
        for (const [rate, time] of ${JSON.stringify(pairs)})
        for (const make of [()=> new ParticleEmitter(vec2(), 0, 0, time, rate), ()=> new ParticleEmitter3D(vec3(), 0, time, rate)])
        {
            let n = 0;
            const e = make();
            e.particleCreateCallback = ()=> ++n;
            engineStep(ceil(time * 60) + 3);
            const want = 1 + round(rate * time);
            n === want || wrong.push([rate, time, n, want]);
        }
        return JSON.stringify(wrong); })()`));
    assert.deepEqual(wrong, []);
});

test('a moving emitter spreads a frame\'s particles along its move, 2D and 3D, not in a clump where it is', async ()=>
{
    // 600 a second moving 1 a frame is 10 a frame, a tenth apart from where it was to where it is
    const { run } = await engine();
    const spread = JSON.parse(run(`(()=> {
        const xs2 = [], xs3 = [];
        const e2 = new ParticleEmitter(vec2(), 0, 0, 0, 600, 0, undefined, WHITE, WHITE, WHITE, WHITE, 1, .1, .1, 0);
        const e3 = new ParticleEmitter3D(vec3(), 0, 0, 600); e3.speed = 0;
        engineStep(2);
        e2.particleCreateCallback = (p)=> xs2.push(p.pos.x);
        e3.particleCreateCallback = (p)=> xs3.push(p.pos.x);
        e2.pos.x += 1; e3.pos3D.x += 1;
        engineStep(1);
        const gaps = (xs)=> xs.slice().sort((a, b)=> a - b).map((x, i, s)=> i ? +(x - s[i - 1]).toFixed(6) : +x.toFixed(6));
        return JSON.stringify([gaps(xs2), gaps(xs3)]); })()`));
    for (const gaps of spread)
        assert.deepEqual(gaps, [.1, .1, .1, .1, .1, .1, .1, .1, .1, .1], 'from a tenth past where it was, a tenth apart');
});

test('an emitter that jumps, teleported or respawned, starts its particles where it is, not along the jump', async ()=>
{
    // a move larger than anything can travel in one update is no travel, 2D and 3D
    const { run } = await engine();
    const xs = JSON.parse(run(`(()=> {
        const xs2 = [], xs3 = [];
        const e2 = new ParticleEmitter(vec2(), 0, 0, 0, 600, 0, undefined, WHITE, WHITE, WHITE, WHITE, 1, .1, .1, 0);
        const e3 = new ParticleEmitter3D(vec3(), 0, 0, 600); e3.speed = 0;
        engineStep(2);
        e2.particleCreateCallback = (p)=> xs2.push(p.pos.x);
        e3.particleCreateCallback = (p)=> xs3.push(p.pos.x);
        e2.pos.x += 1000; e3.pos3D.x += 1000;
        engineStep(1);
        return JSON.stringify([Math.min(...xs2), Math.min(...xs3)]); })()`));
    assert.ok(xs[0] > 999 && xs[1] > 999, 'all at the new place: ' + xs);
});
