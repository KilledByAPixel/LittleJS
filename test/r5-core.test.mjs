import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, engineObjectsUpdate, engineObjectsDestroy, engineObjectsCallback, formatTime, debugShowErrors,
    vec2 } = LJS;

// review round 5, core: the collide pair lookup, children seeing this frame's transform, a pause taking effect on the
// next tick, engineObjectsCallback skipping objects destroyed by an earlier callback, formatTime's sign, the typings
// of engineInit, Timer and ASSERT, and debugShowErrors with a promise rejected with nothing

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// engineInit once for the file, stepped by hand; gameUpdate calls whatever a test puts here
LJS.setEngineManualStep(true);
let onGameUpdate = ()=>{};
await LJS.engineInit(()=>{}, ()=> onGameUpdate());

function clearObjects()
{
    engineObjectsDestroy();
    engineObjectsUpdate();
}

test('solid objects piled on one spot update in reasonable time (collide pair lookup is not a list scan)', () =>
{
    // 400 solid objects on nearly the same spot, every pair overlapping and pushed apart, took over 2 seconds a frame
    // when each pair was looked up by scanning a flat list of every pair asked
    for (let i = 0; i < 400; ++i)
        new EngineObject(vec2(300 + i*.001, 300), vec2(1)).setCollision();
    engineObjectsUpdate();
    const start = performance.now();
    engineObjectsUpdate();
    const ms = performance.now() - start;
    clearObjects();
    assert.ok(ms < 1000, `one frame took ${ms.toFixed(0)} ms`);
});

test('a child and a grandchild see the parent where it is this frame in their update (children update transforms)', () =>
{
    const parent = new EngineObject(vec2(200, 0));
    const child = new EngineObject, grandchild = new EngineObject;
    parent.addChild(child);
    child.addChild(grandchild);
    parent.velocity = vec2(1, 0);
    let childX, grandchildX;
    child.update = ()=> { childX = child.pos.x; };
    grandchild.update = ()=> { grandchildX = grandchild.pos.x; };
    engineObjectsUpdate();
    const parentX = parent.pos.x;
    clearObjects();
    assert.equal(parentX, 201, 'the parent moved');
    assert.equal(childX, 201, 'the child saw where the parent moved to');
    assert.equal(grandchildX, 201, 'and so did the grandchild');
});

test('pausing in gameUpdate stops the rest of that frame\'s catch-up ticks (pause read each tick)', () =>
{
    LJS.engineStep(2); // past the first step, which has no time delta
    LJS.setTimeScale(3); // two or more ticks for each step
    let updates = 0;
    onGameUpdate = ()=> { ++updates; LJS.setPaused(true); };
    const frameBefore = LJS.frame;
    try
    {
        LJS.engineStep(1);
        assert.equal(updates, 1, 'gameUpdate did not run again after the pause');
        assert.equal(LJS.frame, frameBefore + 1, 'the frame stopped with it');
    }
    finally
    {
        onGameUpdate = ()=>{};
        LJS.setPaused(false);
        LJS.setTimeScale(1);
    }
});

test('engineObjectsCallback skips an object an earlier callback destroyed (callback checks destroyed)', () =>
{
    const a = new EngineObject(vec2(500, 500)), b = new EngineObject(vec2(500, 500));
    let calls = 0;
    engineObjectsCallback(vec2(500, 500), 2, ()=> { ++calls; a.destroy(); b.destroy(); }, [a, b]);
    clearObjects();
    assert.equal(calls, 1);
});

test('formatTime shows no minus sign for a time that shows as 0:00 (formatTime sign)', () =>
{
    assert.equal(formatTime(-.5), '0:00');
    assert.equal(formatTime(-1.5), '-0:01');
    assert.equal(formatTime(-61), '-1:01');
    assert.equal(formatTime(.5), '0:00');
});

test('the typings take engineInit callbacks as optional, Timer times as maybe undefined, and ASSERT of any value', () =>
{
    const typings = read('dist/littlejs.d.ts');
    const init = typings.match(/function engineInit\(([^)]*)\)/);
    assert.ok(init, 'engineInit is in the typings');
    for (const name of ['gameInit', 'gameUpdate', 'gameUpdatePost', 'gameRender', 'gameRenderPost'])
        assert.ok(init[1].includes(name + '?:'), name + ' is optional');

    const timerStart = typings.indexOf('class Timer');
    const timer = typings.slice(timerStart, typings.indexOf('\n    }', timerStart));
    assert.match(timer, /\btime: number \| undefined;/, 'Timer.time');
    assert.match(timer, /\bsetTime: number \| undefined;/, 'Timer.setTime');

    assert.match(typings, /function ASSERT\(assert: any,/, 'ASSERT(obj) compiles for a TS user');
});

test('debugShowErrors shows a promise rejected with nothing instead of throwing in its own handler', () =>
{
    // debugShowErrors replaces console.assert and sets the window's error handlers, all put back after
    const savedAssert = console.assert, savedDocument = globalThis.document;
    globalThis.document = { body: {} };
    globalThis.onunhandledrejection = globalThis.onerror = null;
    try
    {
        debugShowErrors();
        globalThis.onunhandledrejection({ reason: undefined });
        assert.match(globalThis.document.body.innerHTML, /undefined/);
    }
    finally
    {
        console.assert = savedAssert;
        globalThis.document = savedDocument;
        globalThis.onunhandledrejection = globalThis.onerror = null;
    }
});

test('a deep chain of children places each one a few times a frame, not once per ancestor', () =>
{
    // counts every updateTransforms call, the old early placing ran the whole subtree at every level
    let calls = 0;
    class Link extends EngineObject
    {
        updateTransforms(updateChildren) { ++calls; super.updateTransforms(updateChildren); }
    }
    const root = new Link(vec2(300, 300));
    let parent = root;
    for (let i = 0; i < 200; ++i)
    {
        const link = new Link;
        parent.addChild(link, vec2(0, 1));
        parent = link;
    }
    calls = 0;
    engineObjectsUpdate();
    assert.ok(calls <= 201 * 3, 'placed ' + calls + ' times for 201 objects');
    assert.ok(Math.abs(parent.pos.y - 500) < 1e-6, 'the last link is 200 up, ' + parent.pos.y);
    root.destroy();
    engineObjectsUpdate();
});
