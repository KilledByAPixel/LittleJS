import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// time only advances through engineStep, one 1/60 s frame per step, so a
// frameTime of .1 is 6 steps; the checks land mid frame, clear of the edges
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

const sheet = new LJS.TextureInfo({ width: 256, height: 16 });
const first = new LJS.TileInfo(LJS.vec2(), LJS.vec2(16), sheet); // 16 frames in a row
const framesOver = (animation, steps)=>
{
    const seen = [];
    for (const s of steps)
    {
        LJS.engineStep(s);
        seen.push(animation.frame);
    }
    return seen;
};

test('a new animation loops from the first frame at its frame time, and tileInfo is that frame', () =>
{
    const walk = new LJS.SpriteAnimation(first, 4, .1);
    assert.equal(walk.frame, 0);
    assert.equal(walk.tileInfo.pos.x, 0);
    assert.deepEqual(framesOver(walk, [3, 6, 6, 6, 6, 6]), [0, 1, 2, 3, 0, 1]);
    assert.equal(walk.tileInfo.pos.x, 16); // frame 1 is one tile along
    assert.equal(walk.isDone, false);
});

test('play runs once and holds the last frame, and isDone says so', () =>
{
    const attack = new LJS.SpriteAnimation(first, 3, .1).play();
    assert.deepEqual(framesOver(attack, [3, 6, 6, 6, 6]), [0, 1, 2, 2, 2]);
    assert.equal(attack.isDone, true);
    attack.play(); // from the start again
    assert.equal(attack.frame, 0);
    assert.equal(attack.isDone, false);
});

test('pingPong goes there and back without repeating the ends', () =>
{
    const idle = new LJS.SpriteAnimation(first, 4, .1).pingPong();
    assert.deepEqual(framesOver(idle, [3, 6, 6, 6, 6, 6, 6, 6]), [0, 1, 2, 3, 2, 1, 0, 1]);
    const single = new LJS.SpriteAnimation(first, 1, .1).pingPong();
    assert.deepEqual(framesOver(single, [3, 6, 6]), [0, 0, 0]);
});

test('stop holds the current frame and a mode call restarts, speed scales the rate', () =>
{
    const walk = new LJS.SpriteAnimation(first, 4, .1);
    LJS.engineStep(9);
    assert.equal(walk.frame, 1);
    walk.stop();
    LJS.engineStep(12);
    assert.equal(walk.frame, 1);
    walk.loop();
    assert.equal(walk.frame, 0);
    walk.speed = 2; // frames come twice as fast
    assert.deepEqual(framesOver(walk, [4, 3, 3, 3]), [1, 2, 3, 0]); // .067, .117, .167, .217 s
});

test('a SpriteAnimation needs a TileInfo, at least one frame and a positive frame time', () =>
{
    assert.throws(()=> new LJS.SpriteAnimation(undefined, 4, .1));
    assert.throws(()=> new LJS.SpriteAnimation(first, 0, .1));
    assert.throws(()=> new LJS.SpriteAnimation(first, 4, 0));
});
