import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// The variable step turned on and off again before engineInit, as a game's settings might do, leaves the fixed step
// starting where it always does
LJS.setEngineVariableStep(true);
LJS.setEngineVariableStep(false);
LJS.setEngineManualStep(true);
const times = [];
await LJS.engineInit(()=>{}, ()=> times.push(LJS.time), ()=>{}, ()=>{}, ()=>{});

test('the variable step on and off before engineInit starts fixed time at 0', ()=>
{
    LJS.engineStep(2);
    assert.deepEqual(times, [0, 1/60]);
});
