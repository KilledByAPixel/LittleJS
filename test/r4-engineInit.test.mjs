import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// engineStep waits for gameInit, and objects destroyed while paused still leave the list;
// engineInit runs once in this file, with a gameInit that finishes only when the test says so
LJS.setEngineManualStep(true);
let finishInit, updates = 0;
const initDone = new Promise(resolve=> finishInit = resolve);
const started = LJS.engineInit(()=> initDone, ()=> ++updates);

test('engineStep before gameInit has finished does not update the game', async () =>
{
    await new Promise(resolve=> setTimeout(resolve, 10)); // engineInit is waiting on gameInit
    assert.throws(()=> LJS.engineStep(3), /Assert/, 'debug asserts, release returns');
    assert.equal(updates, 0, 'updated before gameInit finished');
    finishInit();
    await started;
    LJS.engineStep(3);
    assert.ok(updates > 0, 'updates once set up');
});

test('an object destroyed while paused leaves the object list', async () =>
{
    await started;
    LJS.setPaused(true);
    const o = new LJS.EngineObject;
    o.destroy();
    LJS.engineStep(1);
    assert.equal(LJS.engineObjects.includes(o), false);
    LJS.setPaused(false);
});
