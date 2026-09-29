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

test('play(onEnd) calls it once, on the first read after the play ends', () =>
{
    let ended = 0;
    const attack = new LJS.SpriteAnimation(first, 3, .1).play(()=> ++ended);
    LJS.engineStep(15); // .25 s, still on the last frame
    assert.equal(attack.frame, 2);
    assert.equal(ended, 0);
    LJS.engineStep(6); // .35 s, past the end but nothing read yet
    assert.equal(ended, 0);
    assert.equal(attack.tileInfo.pos.x, 32); // the read calls it, the last frame still shows
    assert.equal(ended, 1);
    attack.frame, attack.isDone, attack.tileInfo;
    assert.equal(ended, 1, 'once');
    assert.equal(attack.onEnd, undefined);
});

test('loop, pingPong, stop and a play with no function never call onEnd, a new play replaces it', () =>
{
    let ended = 0;
    const end = ()=> ++ended;
    const walk = new LJS.SpriteAnimation(first, 2, .1).play(end).loop();
    const idle = new LJS.SpriteAnimation(first, 2, .1).play(end).pingPong();
    const plain = new LJS.SpriteAnimation(first, 2, .1).play(end).play();
    const held = new LJS.SpriteAnimation(first, 2, .1).play(end).stop();
    LJS.engineStep(30);
    walk.tileInfo, idle.tileInfo, plain.tileInfo, held.tileInfo;
    assert.equal(ended, 0);
    let second = 0;
    const attack = new LJS.SpriteAnimation(first, 2, .1).play(end).play(()=> ++second);
    LJS.engineStep(30);
    attack.tileInfo;
    assert.deepEqual([ended, second], [0, 1]);
});

test('SpriteAnimator switches clips by name, starting one over only when it changes', () =>
{
    const walk = new LJS.SpriteAnimation(first, 4, .1), idle = new LJS.SpriteAnimation(first.frame(8), 2, .1);
    const hero = new LJS.SpriteAnimator({ idle, walk });
    assert.equal(hero.name, 'idle'); // the first clip
    assert.equal(hero.clip, idle);
    hero.set('walk');
    LJS.engineStep(9);
    assert.equal(hero.frame, 1);
    hero.set('walk'); // the same clip carries on
    assert.equal(hero.frame, 1);
    assert.equal(hero.tileInfo.pos.x, 16);
    hero.set('idle');
    assert.equal(hero.name, 'idle');
    assert.equal(hero.frame, 0);
    assert.equal(hero.tileInfo.pos.x, 128);
    assert.equal(hero.isDone, false);
});

test('SpriteAnimator set with onEnd goes back to idle when an attack ends', () =>
{
    const hero = new LJS.SpriteAnimator({
        idle:   new LJS.SpriteAnimation(first, 2, .1),
        attack: new LJS.SpriteAnimation(first.frame(4), 3, .1).play(),
    });
    hero.set('attack', ()=> hero.set('idle'));
    LJS.engineStep(9);
    assert.equal(hero.name, 'attack');
    assert.equal(hero.frame, 1);
    LJS.engineStep(15); // past the end
    hero.tileInfo; // the read ends it
    assert.equal(hero.name, 'idle');
    assert.equal(hero.frame, 0);
});

test('SpriteAnimator asserts on a clip name it does not have, and needs a clip', () =>
{
    const hero = new LJS.SpriteAnimator({ idle: new LJS.SpriteAnimation(first, 2, .1) });
    assert.throws(()=> hero.set('run'));
    assert.throws(()=> new LJS.SpriteAnimator({}));
});

test('SpriteAnimator set of a play clip that has ended starts it over, one still playing carries on', () =>
{
    const hero = new LJS.SpriteAnimator({ attack: new LJS.SpriteAnimation(first, 3, .1).play() });
    LJS.engineStep(9);
    hero.set('attack'); // still playing
    assert.equal(hero.frame, 1);
    LJS.engineStep(30);
    assert.equal(hero.isDone, true);
    hero.set('attack'); // ended, so again from the start
    assert.equal(hero.frame, 0);
    assert.equal(hero.isDone, false);
});
