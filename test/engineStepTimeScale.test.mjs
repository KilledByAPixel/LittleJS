import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// each engineStep frame runs as many fixed updates as the time scale says, from the first step after a change, so a
// test that steps under a time scale can count on its frame and time

let updates = 0;
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=> ++updates, ()=>{}, ()=>{}, ()=>{});

const stepped = (frames)=> { const before = updates; LJS.engineStep(frames); return updates - before; };

test('at time scale 1 a step is one update', () =>
{
    assert.equal(stepped(4), 4);
});

test('at time scale 2 a step is two, the first step after the change too', () =>
{
    LJS.setTimeScale(2);
    assert.equal(stepped(1), 2);
    assert.equal(stepped(3), 6);
    LJS.setTimeScale(1);
    assert.equal(stepped(3), 3);
});

test('at time scale .5 two steps are one update', () =>
{
    LJS.setTimeScale(.5);
    assert.equal(stepped(6), 3);
    LJS.setTimeScale(1);
    stepped(1); // back on the whole frame
    assert.equal(stepped(2), 2);
});
