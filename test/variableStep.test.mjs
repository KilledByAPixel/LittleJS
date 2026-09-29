import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Drives the real loop with made-up requestAnimationFrame timestamps and checks the variable step: one update per
// frame, timeDelta the frame's time. Node has no requestAnimationFrame, so the stub keeps the loop's callback.
let rafCallback;
globalThis.requestAnimationFrame = (f)=> { rafCallback = f; };
const random = new LJS.RandomGenerator(11);
let updates = 0, posts = 0, onUpdate = ()=>{};
const deltas = [], times = []; // timeDelta and time at each update
await LJS.engineInit(()=>{}, ()=>
{
    ++updates;
    deltas.push(LJS.timeDelta);
    times.push(LJS.time);
    onUpdate();
}, ()=> ++posts, ()=>{}, ()=>{});

let nowMS = 1000;
function runFrames(hz, count, jitterMS=0)
{
    for (let i = count; i--;)
    {
        nowMS += 1e3 / hz;
        rafCallback(nowMS + (jitterMS ? random.float(-jitterMS, jitterMS) : 0));
    }
}
const frameMS = 1e3 / 144;

test('timeDelta is 1/60 in the fixed step', ()=>
{
    runFrames(60, 10);
    assert.equal(LJS.engineVariableStep, false);
    assert.equal(LJS.timeDelta, 1/60);
});

test('the variable step runs one update per frame with timeDelta the frame time', ()=>
{
    LJS.setEngineVariableStep(true);
    runFrames(144, 120, 1); // settle the frame estimate
    const before = updates, timeBefore = LJS.time;
    deltas.length = 0;
    runFrames(144, 600, 1);
    assert.equal(updates - before, 600);
    for (const d of deltas)
        assert.ok(Math.abs(d * 1e3 - frameMS) < .1, 'timeDelta ' + d * 1e3 + ' ms');
    assert.ok(Math.abs(LJS.time - timeBefore - 600 / 144) < frameMS / 1e3);
});

test('paused or at time scale 0 the variable step does not update, time stands, gameUpdatePost runs', ()=>
{
    const before = updates, postsBefore = posts, time = LJS.time, timeDelta = LJS.timeDelta;
    LJS.setPaused(true);
    runFrames(144, 10);
    LJS.setPaused(false);
    LJS.setTimeScale(0);
    runFrames(144, 10);
    LJS.setTimeScale(1);
    assert.equal(updates, before);
    assert.equal(LJS.time, time);
    assert.equal(posts, postsBefore + 20);
    assert.equal(LJS.timeDelta, timeDelta, 'timeDelta keeps the last update');
});

test('time scale 2 doubles timeDelta in the variable step', ()=>
{
    LJS.setTimeScale(2);
    deltas.length = 0;
    runFrames(144, 20);
    LJS.setTimeScale(1);
    for (const d of deltas)
        assert.ok(Math.abs(d * 1e3 - 2 * frameMS) < .2, 'timeDelta ' + d * 1e3 + ' ms');
});

test('switching the variable step off and on never moves time back or skips it ahead', ()=>
{
    times.length = 0;
    runFrames(144, 30);
    LJS.setEngineVariableStep(false);
    runFrames(144, 30);
    assert.equal(LJS.timeDelta, 1/60);
    LJS.setEngineVariableStep(true);
    runFrames(144, 30);
    for (let i = 1; i < times.length; ++i)
    {
        const step = times[i] - times[i-1];
        assert.ok(step > 0 && step <= 1/60 + 1e-9, 'step ' + step + ' at update ' + i);
    }
});

test('turning the variable step on inside gameUpdate takes over from the next frame', ()=>
{
    LJS.setEngineVariableStep(false);
    runFrames(144, 30);
    onUpdate = ()=> { LJS.setEngineVariableStep(true); onUpdate = ()=>{}; };
    runFrames(144, 3); // the switch happens in one of these
    const before = updates;
    runFrames(144, 10);
    assert.equal(LJS.engineVariableStep, true);
    assert.equal(updates - before, 10);
});

test('a particle emitter emits the same count per second in the fixed and variable steps', ()=>
{
    const emitted = (variable)=>
    {
        LJS.setEngineVariableStep(variable);
        runFrames(144, 30);
        const e = new LJS.ParticleEmitter(LJS.vec2(), 0, 0, 0, 60, LJS.PI, undefined,
            LJS.WHITE, LJS.WHITE, LJS.WHITE, LJS.WHITE, 100);
        runFrames(144, 144);
        const count = e.particles.length;
        e.destroy();
        return count;
    };
    assert.ok(Math.abs(emitted(false) - 60) <= 1, 'fixed');
    assert.ok(Math.abs(emitted(true) - 60) <= 1, 'variable');
});

// last, it turns manual step on for the rest of the file
test('engineStep in the variable step runs one update of 1/60 per frame', ()=>
{
    LJS.setEngineVariableStep(true);
    LJS.setEngineManualStep(true);
    const before = updates;
    deltas.length = 0;
    LJS.engineStep(3);
    assert.equal(updates - before, 3);
    for (const d of deltas)
        assert.ok(Math.abs(d - 1/60) < 1e-9, 'timeDelta ' + d);
});
