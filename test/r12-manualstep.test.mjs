import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setEngineManualStep, setHeadlessMode, engineInit, engineStep, frame } from '../dist/littlejs.esm.js';

// review round 12: turning manual step off after engineInit starts the loop again, from real time, so the time
// engineStep ran ahead is not waited out

setHeadlessMode(true);
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

const waitFor = async (condition)=>
{
    for (let i = 0; i < 300 && !condition(); ++i)
        await new Promise(resolve=> setTimeout(resolve, 20));
    return condition();
};

test('setEngineManualStep(false) after engineInit resumes the loop, even after stepping far ahead', async () =>
{
    engineStep(600); // ten seconds ahead of real time
    const stepped = frame;
    setEngineManualStep(false);
    assert.ok(await waitFor(()=> frame > stepped + 2), 'the loop runs again, frame ' + frame);

    // and back on stops it again
    setEngineManualStep(true);
    await waitFor(()=> false); // let a pending frame pass
    const stopped = frame;
    await new Promise(resolve=> setTimeout(resolve, 100));
    assert.equal(frame, stopped, 'stopped again');
    engineStep(2);
    assert.equal(frame, stopped + 2, 'and engineStep drives it');
});
