import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A plugin's updatePost runs each tick after the objects move and before gameUpdatePost, paused included, so
// something that follows an object, a camera, sees where it is this tick

// one engineInit for the file, stepped by hand, as test/engineStep.test.mjs does
const log = [];
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=> log.push('game'), ()=>{}, ()=>{});

let postCount = 0;
LJS.engineAddPlugin(undefined, undefined, undefined, undefined, undefined, ()=> { ++postCount; log.push('post'); });

test('updatePost runs after the objects update and before gameUpdatePost', () =>
{
    const o = new LJS.EngineObject;
    o.update = ()=> log.push('object');
    log.length = 0;
    LJS.engineStep();
    o.destroy();
    assert.deepEqual(log, ['object', 'post', 'game']);
});

test('updatePost runs while paused', () =>
{
    const count = postCount;
    LJS.setPaused(true);
    LJS.engineStep();
    LJS.setPaused(false);
    assert.equal(postCount, count + 1);
});

test('engineAddPlugin with only updatePost is allowed, and the same one twice is refused', () =>
{
    const f = ()=>{};
    assert.doesNotThrow(()=> LJS.engineAddPlugin(undefined, undefined, undefined, undefined, undefined, f));
    assert.throws(()=> LJS.engineAddPlugin(undefined, undefined, undefined, undefined, undefined, f));
});
