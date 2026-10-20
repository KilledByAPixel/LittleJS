import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A time scale of 0 freezes the game like a pause, the hit stop a shake goes with: the cameras hold and the shake
// neither fades nor moves, through the engine's own ticks

async function engine()
{
    const { run } = loadEngine();
    await run(`headlessMode = true; setEngineManualStep(true); engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{})`);
    return run;
}

test('at time scale 0 the shake neither fades nor moves', async () =>
{
    const run = await engine();
    run(`cameraShake(1); setTimeScale(0); var before = JSON.stringify(cameraShakeOffset()); engineStep(30);`);
    assert.equal(run(`cameraShakeTrauma`), 1);
    assert.equal(run(`JSON.stringify(cameraShakeOffset())`), run(`before`));
    run(`setTimeScale(1); engineStep(30);`);
    assert.ok(run(`cameraShakeTrauma`) < 1, 'it fades again once the game runs');
});

test('at time scale 0 a FollowCamera holds, and goes on when the game runs', async () =>
{
    const run = await engine();
    run(`var target = new EngineObject(vec2()), camera = new FollowCamera(target, .5); engineStep();
        target.pos = vec2(10, 0); setTimeScale(0); engineStep(30);`);
    assert.equal(run(`cameraPos.x`), 0);
    run(`setTimeScale(1); engineStep();`);
    assert.ok(run(`cameraPos.x`) > 0, 'it moves again once the game runs');
});
