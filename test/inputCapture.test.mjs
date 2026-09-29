import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The free camera and the 3D editor take the keyboard and mouse from the game: the game's reads come back as
// nothing pressed, the reads of the one that took them work as always, and gamepads stay the game's.
const reads = `[keyIsDown('KeyW'), keyWasPressed('KeyW'), keyWasReleased('KeyW'), mouseIsDown(0), mouseWasPressed(0)]`;

test('with the input taken the game reads keys and mouse buttons as up', ()=>
{
    const { run, handlers } = loadEngine();
    handlers.keydown(keyEvent('KeyW'));
    run('inputData[0][0] = 3'); // the left button, down and pressed
    assert.deepEqual([...run(reads)], [true, true, false, true, true]);
    run('inputCapture(true)');
    assert.deepEqual([...run(reads)], [false, false, false, false, false]);
    run('inputCapture(false)');
    assert.deepEqual([...run(reads)], [true, true, false, true, true]);
});

test('the one that took the input reads it inside inputCaptureRead, and the game does not after it', ()=>
{
    const { run, handlers } = loadEngine();
    handlers.keydown(keyEvent('KeyW'));
    run('inputCapture(true)');
    assert.equal(run(`inputCaptureRead(()=> keyIsDown('KeyW'))`), true);
    assert.equal(run(`keyIsDown('KeyW')`), false);
    // a read that throws still hands the reading back
    assert.throws(()=> run(`inputCaptureRead(()=> { throw new Error('stop'); })`));
    assert.equal(run(`keyIsDown('KeyW')`), false);
});

test('a gamepad is still the game\'s while the keyboard and mouse are taken', ()=>
{
    const { run } = loadEngine();
    run('inputCapture(true); inputData[1] = [3]');
    assert.equal(run('keyIsDown(0, 1)'), true);
});

test('the mouse movement and wheel go to the one that took the input', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); inputCapture(true); mouseDeltaScreen = vec2(5, 3); mouseWheel = 2; inputUpdate()');
    assert.deepEqual([...run('[mouseDeltaScreen.x, mouseDeltaScreen.y, mouseWheel]')], [0, 0, 0]);
    assert.deepEqual([...run('[inputCaptureDeltaScreen.x, inputCaptureDeltaScreen.y, inputCaptureWheel]')], [5, 3, 2]);
    run('inputCapture(false); mouseDeltaScreen = vec2(5, 3); mouseWheel = 2; inputUpdate()');
    assert.deepEqual([...run('[mouseDeltaScreen.x, mouseWheel, inputCaptureDeltaScreen.x]')], [5, 2, 0]);
});

test('the release build reads keys as always and has no input capture', ()=>
{
    const { run, handlers } = loadEngine({}, '', 'littlejs.release.js');
    handlers.keydown(keyEvent('KeyW'));
    assert.equal(run(`keyIsDown('KeyW')`), true);
    assert.equal(run('typeof inputCapture'), 'undefined');
});
