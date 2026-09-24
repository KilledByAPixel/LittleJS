import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineInit, setEngineManualStep } from '../dist/littlejs.esm.js';

// engineInit once per file at module scope: frame and time are module globals
let inits = 0;
setEngineManualStep(true);
await engineInit(()=> ++inits, ()=> {}, ()=> {}, ()=> {}, ()=> {});

test('a second engineInit is refused in headless mode too, the same as with a canvas', async () =>
{
    // the debug bundle asserts, which throws; the release bundle returns without doing anything
    await assert.rejects(engineInit(()=> ++inits, ()=> {}, ()=> {}, ()=> {}, ()=> {}), /Assert/);
    assert.equal(inits, 1);
});
