import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Pins the default path: with manual step off, engineInit must still run its
// startup frame and schedule the requestAnimationFrame loop. node --test gives
// this file its own process, so engineManualStep is false here and nothing
// else has touched the engine. Node has no requestAnimationFrame, so the stub
// is required as well as observed.
let rafCalls = 0;
globalThis.requestAnimationFrame = ()=> { ++rafCalls; };

await LJS.engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

test('engineInit runs one startup frame when manual step is off', () =>
{
    assert.equal(LJS.engineManualStep, false);
    assert.equal(LJS.frame, 1);
});

test('engineInit schedules the requestAnimationFrame loop when manual step is off', () =>
{
    assert.equal(rafCalls, 1);
});
