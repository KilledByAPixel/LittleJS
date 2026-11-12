import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a display time of 0 shows the touch gamepad from the start on a touch device, as its doc says, not only after the
// first touch; a real gamepad still takes over and hides it until the screen is touched again

function loadTouch()
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: [{ pressed: false, value: 0 }] };
    const engine = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [pad] } });
    engine.run('touchGamepadInit = ()=> {}'); // the overlay needs a DOM, the timer is what decides it shows
    return { ...engine, pad };
}

test('a touch gamepad with a display time of 0 shows from the start', () =>
{
    const { run } = loadTouch();
    run('setTouchGamepadEnable(true); setTouchGamepadDisplayTime(0); inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), true, 'shown before any touch');
    assert.equal(run('gamepadPrimary'), 0, 'and owns gamepad 0');
});

test('with the default display time the touch gamepad waits for a touch', () =>
{
    const { run } = loadTouch();
    run('setTouchGamepadEnable(true); inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), false);
});

test('a real gamepad hides a touch gamepad always shown, until the screen is touched again', () =>
{
    const { run, pad } = loadTouch();
    run('setTouchGamepadEnable(true); setTouchGamepadDisplayTime(0); inputUpdate()');
    pad.buttons[0] = { pressed: true, value: 1 };
    run('inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), false, 'the real gamepad took over');
    pad.buttons[0] = { pressed: false, value: 0 };
    run('inputUpdate(); inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), false, 'and stays hidden while the pad rests');

    // pressed as the start button while paused, which needs no stage to place it
    run(`setTouchGamepadCenterButtonSize(50); paused = true;
        touchGamepadPointerDown({ pointerType: 'touch', pointerId: 1, preventDefault() {} },
            { setPointerCapture() {} });
        paused = false; inputUpdate()`);
    assert.equal(run('touchGamepadTimer.isSet()'), true, 'a touch brings it back');
});
