import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

const near = (a, b, eps=1e-9) => Math.abs(a - b) <= eps;

// Read through the module namespace rather than named imports so the live
// bindings for engine globals (frame, time) are observed after the engine
// mutates them.
//
// One engineInit for the whole file: `frame` and `time` are module globals
// and monotonic, and ES module caching gives every test in this file the
// same bundle instance. `node --test` runs each test file in its own
// process, so this does not leak into other test files.
//
// Everything at module scope below runs before any test body, so pre-init
// state has to be captured here rather than inside a test.

// engineManualStep is still false here, so this exercises the
// "manual step not enabled" assert.
let preInitThrew = false;
try { LJS.engineStep(); } catch { preInitThrew = true; }

let updateCount = 0, updatePostCount = 0;
LJS.setEngineManualStep(true);
await LJS.engineInit(
    ()=>{},                      // gameInit
    ()=>{ ++updateCount; },      // gameUpdate
    ()=>{ ++updatePostCount; },  // gameUpdatePost
    ()=>{},                      // gameRender
    ()=>{});                     // gameRenderPost

test('engineStep throws before setup is complete', () =>
{
    assert.equal(preInitThrew, true);
});

test('engineInit does not advance the engine in manual step mode', () =>
{
    // startEngine() normally burns a frame before the caller gets control.
    // Skipping it is what makes post-gameInit state observable.
    assert.equal(LJS.frame, 0);
    assert.equal(updateCount, 0);
});

test('one engineStep advances exactly one frame', () =>
{
    const f0 = LJS.frame, u0 = updateCount;
    LJS.engineStep();
    assert.equal(LJS.frame, f0 + 1);
    assert.equal(updateCount, u0 + 1);
});

test('engineStep(n) advances exactly n frames and n/frameRate seconds', () =>
{
    const f0 = LJS.frame, t0 = LJS.time, u0 = updateCount;
    LJS.engineStep(10);
    assert.equal(LJS.frame, f0 + 10);
    assert.equal(updateCount, u0 + 10);
    assert(near(LJS.time - t0, 10 / LJS.frameRate));
});

test('engineStep stays exact over many frames', () =>
{
    // Guards the delta-smoothing branch: float residue in the frame time
    // buffer must not accumulate into a dropped or doubled tick.
    const f0 = LJS.frame;
    for (let i = 0; i < 600; ++i)
        LJS.engineStep();
    assert.equal(LJS.frame, f0 + 600);
});

test('engineStep(0) is a no-op', () =>
{
    const f0 = LJS.frame, u0 = updateCount;
    LJS.engineStep(0);
    assert.equal(LJS.frame, f0);
    assert.equal(updateCount, u0);
});

test('a Timer elapses on schedule under engineStep', () =>
{
    const t = new LJS.Timer(1);          // 1 second == frameRate frames
    LJS.engineStep(30);
    assert.equal(t.elapsed(), false);    // half a second in
    LJS.engineStep(60);
    assert.equal(t.elapsed(), true);     // well past one second
});

test('engineStep respects paused', () =>
{
    LJS.setPaused(true);
    const f0 = LJS.frame, t0 = LJS.time;
    const u0 = updateCount, p0 = updatePostCount;
    LJS.engineStep(5);
    assert.equal(LJS.frame, f0);              // no fixed updates
    assert.equal(LJS.time, t0);               // time frozen
    assert.equal(updateCount, u0);            // gameUpdate not called
    assert.equal(updatePostCount, p0 + 5);    // gameUpdatePost still runs
    LJS.setPaused(false);
});

test('engineStep resumes cleanly after unpausing', () =>
{
    const f0 = LJS.frame;
    LJS.engineStep(3);
    assert.equal(LJS.frame, f0 + 3);
});

test('engineStep rejects a non-whole or negative frame count', () =>
{
    assert.throws(()=> LJS.engineStep(-1), /Assert failed/);
    assert.throws(()=> LJS.engineStep(1.5), /Assert failed/);
    assert.throws(()=> LJS.engineStep('3'), /Assert failed/);
    assert.throws(()=> LJS.engineStep(NaN), /Assert failed/);
});
