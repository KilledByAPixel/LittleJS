import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// a time scale of 0 freezes the game like a pause: time stands still and gameUpdate waits, but gameUpdatePost and
// the plugins still run, so the game can read input and set the scale back
LJS.setEngineManualStep(true);
let updates = 0, postUpdates = 0;
await LJS.engineInit(()=>{}, ()=> ++updates, ()=> ++postUpdates);

test('timeScale 0 still runs gameUpdatePost, and time and gameUpdate stand still', () =>
{
    LJS.engineStep(2);
    LJS.setTimeScale(0);
    const time = LJS.time, updatesBefore = updates, postBefore = postUpdates;
    LJS.engineStep(5);
    assert.equal(LJS.time, time, 'time stood still');
    assert.equal(updates, updatesBefore, 'gameUpdate waited');
    assert.ok(postUpdates > postBefore, 'gameUpdatePost ran');
    LJS.setTimeScale(1);
    LJS.engineStep(2);
    assert.ok(LJS.time > time && updates > updatesBefore, 'and it runs again at scale 1');
});
