import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Read through the module namespace so the live binding for engineManualStep
// is observed after the setter mutates it.
//
// This file deliberately never calls engineInit. `node --test` gives each
// test file its own process, which is the only way to observe the flag's
// false default — test/engineStep.test.mjs enables it at module scope.

test('engineManualStep defaults to false', () =>
{
    assert.equal(LJS.engineManualStep, false);
});

test('setEngineManualStep toggles the flag and defaults to true', () =>
{
    LJS.setEngineManualStep(true);
    assert.equal(LJS.engineManualStep, true);
    LJS.setEngineManualStep(false);
    assert.equal(LJS.engineManualStep, false);
    LJS.setEngineManualStep();                  // default arg is true
    assert.equal(LJS.engineManualStep, true);
});
