import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A pinch of two fingers is the touch screen's mouse wheel: touchPinch is how far the fingers moved together or
// apart this frame, a wheel click for every 50 pixels, and it is added to mouseWheel unless touchPinchWheel is off.

function load()
{
    const engine = loadEngine({ window: { ontouchstart: null } });
    const finger = (identifier, x, y=100)=> ({ identifier, clientX: x, clientY: y, target: {} });
    const fire = (type, touches, changed=touches)=> engine.handlers[type]({ type, touches, changedTouches: changed,
        target: {}, cancelable: true, preventDefault() {} });
    return { ...engine, finger, fire };
}

test('two fingers moving apart turn the wheel up, a click for every 50 pixels, and together turn it down', ()=>
{
    const { run, finger, fire } = load();
    fire('touchstart', [finger(1, 100), finger(2, 200)]);
    assert.deepEqual([run('touchPinch'), run('mouseWheel')], [0, 0], 'two fingers down is no pinch yet');
    fire('touchmove', [finger(1, 50), finger(2, 250)]); // 100 apart, then 200
    assert.deepEqual([run('touchPinch'), run('mouseWheel')], [-2, -2], 'up is negative, as the wheel\'s is');
    fire('touchmove', [finger(1, 75), finger(2, 225)]); // back to 150
    assert.deepEqual([run('touchPinch'), run('mouseWheel')], [-1, -1], 'what moved in a frame adds up');
});

test('a pinch is not a press or a drag: the button a first finger pressed lets go, and the mouse is between them', ()=>
{
    const { run, finger, fire } = load();
    fire('touchstart', [finger(1, 100)]);
    assert.equal(run('mouseIsDown(0)'), true);
    run('var before = mousePosScreen.copy(); mouseDeltaScreen = vec2();');
    fire('touchstart', [finger(1, 100), finger(2, 200)], [finger(2, 200)]);
    assert.deepEqual([run('mouseIsDown(0)'), run('mouseWasReleased(0)')], [false, true]);
    fire('touchmove', [finger(1, 50), finger(2, 250)]);
    assert.deepEqual([run('mouseDeltaScreen.x'), run('mouseDeltaScreen.y')], [0, 0], 'no drag');
    run('var middle = mousePosScreen.copy()');
    fire('touchmove', [finger(1, 150), finger(2, 350)]);
    assert.ok(run('mousePosScreen.x > middle.x'), 'the mouse is at the middle of the two, to zoom about');
    assert.equal(run('touchPinch'), -2, 'and both moving the same way is no more pinch');

    // one finger lifts, a frame later: the mouse goes to the other with no press and no jump, and follows it
    run('inputData[0][0] &= 1');
    fire('touchend', [finger(2, 350)], [finger(1, 150)]);
    assert.deepEqual([run('mouseIsDown(0)'), run('mouseWasPressed(0)'), run('mouseDeltaScreen.x')], [false, false, 0]);
    fire('touchmove', [finger(2, 360)]);
    assert.deepEqual([run('mouseIsDown(0)'), run('mouseDeltaScreen.x > 0')], [false, true]);
});

test('two fingers landing at once press nothing', ()=>
{
    const { run, finger, fire } = load();
    fire('touchstart', [finger(1, 100), finger(2, 200)]);
    assert.deepEqual([run('mouseIsDown(0)'), run('mouseWasPressed(0)')], [false, false]);
});

test('with touchPinchWheel off the pinch is read by itself and the wheel stays still', ()=>
{
    const { run, finger, fire } = load();
    run('setTouchPinchWheel(false)');
    fire('touchstart', [finger(1, 100), finger(2, 200)]);
    fire('touchmove', [finger(1, 50), finger(2, 250)]);
    assert.deepEqual([run('touchPinch'), run('mouseWheel')], [-2, 0]);
});

test('a finger changed for another starts the pinch over, with no jump', ()=>
{
    const { run, finger, fire } = load();
    fire('touchstart', [finger(1, 100), finger(2, 200)]);
    fire('touchend', [finger(1, 100)], [finger(2, 200)]);
    fire('touchstart', [finger(1, 100), finger(3, 500)], [finger(3, 500)]);
    assert.equal(run('touchPinch'), 0);
    fire('touchmove', [finger(1, 100), finger(3, 450)]);
    assert.equal(run('touchPinch'), 1, 'together is down');
});

test('with touchPinchWheel off a second finger leaves the first finger pressing and dragging as before', ()=>
{
    const { run, finger, fire } = load();
    run('setTouchPinchWheel(false)');
    fire('touchstart', [finger(1, 100)]);
    run('mouseDeltaScreen = vec2()');
    fire('touchstart', [finger(1, 100), finger(2, 200)], [finger(2, 200)]);
    fire('touchmove', [finger(1, 110), finger(2, 200)]);
    assert.deepEqual([run('mouseIsDown(0)'), run('mouseDeltaScreen.x > 0')], [true, true], 'the first finger still drags');
    assert.ok(run('touchPinch') > 0, 'and the pinch can still be read');
});
