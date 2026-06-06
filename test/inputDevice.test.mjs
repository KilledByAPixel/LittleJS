import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// lastInputDevice defaults to 'mouse' before any input has occurred.
test('lastInputDevice defaults to mouse', () =>
{
    assert.equal(LJS.lastInputDevice, 'mouse');
});

// The three predicates are exported functions that agree with lastInputDevice:
// exactly one is true and it matches the current device.
test('using*Input predicates agree with lastInputDevice', () =>
{
    assert.equal(typeof LJS.usingMouseInput, 'function');
    assert.equal(typeof LJS.usingKeyboardInput, 'function');
    assert.equal(typeof LJS.usingGamepadInput, 'function');

    const byDevice = {
        mouse:    LJS.usingMouseInput(),
        keyboard: LJS.usingKeyboardInput(),
        gamepad:  LJS.usingGamepadInput(),
    };
    assert.equal(byDevice[LJS.lastInputDevice], true);
    assert.equal(Object.values(byDevice).filter(Boolean).length, 1);
});

// isUsingGamepad is now the derived view: it always equals usingGamepadInput().
test('isUsingGamepad equals usingGamepadInput()', () =>
{
    assert.equal(LJS.isUsingGamepad, LJS.usingGamepadInput());
});

// inputMouseMoveThreshold is exported with its default and is settable via the setter.
test('setInputMouseMoveThreshold updates inputMouseMoveThreshold', () =>
{
    assert.equal(LJS.inputMouseMoveThreshold, 6); // default
    assert.equal(typeof LJS.setInputMouseMoveThreshold, 'function');
    LJS.setInputMouseMoveThreshold(8);
    assert.equal(LJS.inputMouseMoveThreshold, 8);
    LJS.setInputMouseMoveThreshold(6); // restore default
});
