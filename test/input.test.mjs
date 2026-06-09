import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// The removed floating-top-margin knob must be gone from the public surface.
test('setTouchGamepadFloatingTopMargin is no longer exported', () =>
{
    assert.equal(LJS.setTouchGamepadFloatingTopMargin, undefined);
    assert.equal(LJS.touchGamepadFloatingTopMargin, undefined);
});

// Key state queries are safe with no input system running: everything reads
// as not-down / not-pressed / not-released, and keyDirection is the zero vector.
test('key state defaults to inactive', () =>
{
    for (const key of ['ArrowUp', 'KeyW', 'Space'])
    {
        assert.equal(LJS.keyIsDown(key), false);
        assert.equal(LJS.keyWasPressed(key), false);
        assert.equal(LJS.keyWasReleased(key), false);
    }
    const dir = LJS.keyDirection();
    assert.equal(dir.x, 0);
    assert.equal(dir.y, 0);
});

// Mouse state queries are safe with no input system running.
test('mouse state defaults to inactive', () =>
{
    for (const button of [0, 1, 2])
    {
        assert.equal(LJS.mouseIsDown(button), false);
        assert.equal(LJS.mouseWasPressed(button), false);
        assert.equal(LJS.mouseWasReleased(button), false);
    }
    assert.equal(LJS.mouseWheel, 0);
});

// inputClear and inputClearKey are callable any time and leave input inactive.
test('inputClear and inputClearKey are safe to call', () =>
{
    assert.doesNotThrow(() =>
    {
        LJS.inputClearKey('Space');
        LJS.inputClearKey('Space', 0, true, false, false);
        LJS.inputClearKey('Space', 9); // device with no state
        LJS.inputClear();
    });
    assert.equal(LJS.keyIsDown('Space'), false);
});

// All retained touch-gamepad setters stay exported and are callable in headless
// mode without throwing or creating DOM (headless guards short-circuit).
test('retained touch gamepad setters are exported and headless-safe', () =>
{
    const setters = [
        'setTouchGamepadEnable', 'setTouchGamepadPassthrough',
        'setTouchGamepadCenterButtonSize', 'setTouchGamepadButtonCount',
        'setTouchGamepadLeftStick', 'setTouchGamepadLeftButtonCount',
        'setTouchGamepadRightStick', 'setTouchGamepadAnalog',
        'setTouchGamepadFloating', 'setTouchGamepadSize',
        'setTouchGamepadAlpha', 'setTouchGamepadDisplayTime',
        'setTouchGamepadVibration',
    ];
    for (const name of setters)
        assert.equal(typeof LJS[name], 'function', `${name} should be exported`);

    assert.doesNotThrow(() =>
    {
        LJS.setTouchGamepadEnable(true);
        LJS.setTouchGamepadPassthrough(true);
        LJS.setTouchGamepadSize(120);
        LJS.setTouchGamepadButtonCount(2);
        LJS.setTouchGamepadFloating(true);
        LJS.setTouchGamepadAnalog(false);
        LJS.setTouchGamepadLeftStick(true);
        LJS.setTouchGamepadLeftButtonCount(4);
        LJS.setTouchGamepadRightStick(true);
        LJS.setTouchGamepadCenterButtonSize(50);
        LJS.setTouchGamepadAlpha(0.5);
        LJS.setTouchGamepadDisplayTime(0);
        LJS.setTouchGamepadVibration(0);
        LJS.setTouchGamepadEnable(false);
    });
});
