import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// The variable step with manual step from the start, as a test or a server runs it: engineStep's frames are exactly
// 1/60, the first included, which has no frame time before it
LJS.setEngineManualStep(true);
LJS.setEngineVariableStep(true);
let updates = 0;
const deltas = [];
await LJS.engineInit(()=>{}, ()=> { ++updates; deltas.push(LJS.timeDelta); }, ()=>{}, ()=>{}, ()=>{});

test('engineStep in the variable step from the start runs one update of exactly 1/60 per step', ()=>
{
    LJS.engineStep(600);
    assert.equal(updates, 600);
    assert.deepEqual(deltas.filter(d=> d !== 1/60), []);
});
