import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// The removed floating-top-margin knob must be gone from the public surface.
test('setTouchGamepadFloatingTopMargin is no longer exported', () =>
{
    assert.equal(LJS.setTouchGamepadFloatingTopMargin, undefined);
    assert.equal(LJS.touchGamepadFloatingTopMargin, undefined);
});

// All retained touch-gamepad setters stay exported and are callable in headless
// mode without throwing or creating DOM (headless guards short-circuit).
test('retained touch gamepad setters are exported and headless-safe', () =>
{
    const setters = [
        'setTouchGamepadEnable', 'setTouchGamepadCenterButtonSize',
        'setTouchGamepadButtonCount', 'setTouchGamepadLeftStick',
        'setTouchGamepadAnalog', 'setTouchGamepadFloating',
        'setTouchGamepadSize', 'setTouchGamepadAlpha',
        'setTouchGamepadDisplayTime', 'setTouchGamepadVibration',
    ];
    for (const name of setters)
        assert.equal(typeof LJS[name], 'function', `${name} should be exported`);

    assert.doesNotThrow(() =>
    {
        LJS.setTouchGamepadEnable(true);
        LJS.setTouchGamepadSize(120);
        LJS.setTouchGamepadButtonCount(2);
        LJS.setTouchGamepadFloating(true);
        LJS.setTouchGamepadAnalog(false);
        LJS.setTouchGamepadLeftStick(true);
        LJS.setTouchGamepadCenterButtonSize(50);
        LJS.setTouchGamepadAlpha(0.5);
        LJS.setTouchGamepadDisplayTime(0);
        LJS.setTouchGamepadVibration(0);
        LJS.setTouchGamepadEnable(false);
    });
});
