import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the touch gamepad and a locked pointer, and the first person camera on a gamepad, from a game's workarounds

test('a touch gamepad zone takes the touch when the browser refuses the pointer capture', () =>
{
    const { run } = loadEngine();
    run(`setTouchGamepadEnable(true); setTouchGamepadCenterButtonSize(50); paused = true;
        touchGamepadPointerDown({ pointerType: 'touch', pointerId: 1, preventDefault() {} },
            { setPointerCapture() { throw new Error('InvalidStateError'); } })`);
    assert.equal(run('touchGamepadButtons[9]'), 1, 'the press still lands, as the start button while paused');
});

test('a press that came from a touch does not ask for the pointer lock, a mouse press does', () =>
{
    const { run } = loadEngine();
    run(`var locks = 0; mainCanvas = { requestPointerLock() { ++locks; } };
        inputLastTouchTime = performance.now(); pointerLockRequest();`);
    assert.equal(run('locks'), 0, 'not just after a touch');
    run('inputLastTouchTime = -1e9; pointerLockRequest();');
    assert.equal(run('locks'), 1, 'a mouse asks');
});

test('a FirstPersonCamera3D looks with the right stick and moves with the left', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new Render3DPlugin;
        var eye = new FirstPersonCamera3D(vec3(), 0, 0); eye.lockPointer = false;
        gamepadPrimary = 0; gamepadStickData[0] = [vec2(0, 1), vec2(1, 1)];
        eye.update();`);
    const speed = run('eye.stickSpeed * timeDelta');
    assert.ok(Math.abs(run('eye.yaw') + speed) < 1e-9, 'right stick right turns right');
    assert.ok(Math.abs(run('eye.pitch') - speed) < 1e-9, 'right stick up looks up');
    // pushed up, it walks forward, -z at a yaw of about 0
    assert.ok(run('eye.velocity3D.z') < -.09, 'left stick up walks forward');

    run('eye.stick = eye.moveStick = -1; eye.yaw = eye.pitch = 0; eye.update();');
    assert.equal(run('eye.yaw'), 0, 'no stick, no turn');
    assert.equal(run('eye.velocity3D.z'), 0, 'no stick, no walk');
});
