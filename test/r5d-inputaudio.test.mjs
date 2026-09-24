import { test } from 'node:test';
import assert from 'node:assert/strict';

// Review 5 decisions for input and audio.
// Each test file runs in its own process. This one loads its own copy of the
// bundle with headless mode off, against Web Audio stubs whose context can be
// suspended and fires statechange, so sounds really start or wait.
// The keyboard and right click changes live in input event handlers that only
// run in a browser, so they are checked there instead.

const ctxProto = globalThis.AudioContext.prototype;
ctxProto.addEventListener = function(type, fn) { (this.listeners ??= {})[type] = fn; };
ctxProto.createGain = function()
{
    return {
        connect(node) { return node; },
        disconnect() {},
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
    };
};
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
ctxProto.createBufferSource = function()
{
    return {
        playbackRate: { value: 1 },
        connectedTo: undefined,
        connect(node) { return this.connectedTo = node; },
        addEventListener() {},
        start() {},
        stop() {},
    };
};
globalThis.StereoPannerNode = class StereoPannerNode
{
    constructor(context, options) { this.pan = { value: options?.pan ?? 0 }; }
    connect(node) { return node; }
    disconnect() {}
};

const LJS = await import('../dist/littlejs.esm.js?r5d-inputaudio');
LJS.setHeadlessMode(false);
const audioContext = LJS.audioContext;

// a context that is suspended until the first input, then starts running
const suspend = ()=> audioContext.state = 'suspended';
const run = ()=>
{
    audioContext.state = 'running';
    audioContext.listeners?.statechange?.();
};

// a clock the waiting list reads, so a test can let time pass
let now = 1e6;
performance.now = ()=> now;

// zzfx sound with ~.6 seconds of samples (attack 0, sustain .5, release .1)
const sound = new LJS.Sound([1, 0, 220, 0, .5, .1]);
const makeSound = ()=> new LJS.Sound([1, 0, 220, 0, .5, .1]); // only the newest play of each sound waits

test('an explicit randomness wins over the zzfx array', () =>
{
    assert.equal(new LJS.Sound([1, .1, 440], 0).randomness, 0);
    assert.equal(new LJS.Sound([1, .1, 440], .3).randomness, .3);

    // left out, the array's own randomness is used, then the zzfx default
    assert.equal(new LJS.Sound([1, .1, 440]).randomness, .1);
    assert.equal(new LJS.Sound([1, , 440]).randomness, .05);
    assert.equal(new LJS.Sound([1, , 440], .2).randomness, .2);
});

test('setPan changes the pan of a playing instance, clamped to -1..1', () =>
{
    run();
    const instance = sound.play(undefined, 1, 1, 0, true);
    assert.ok(instance.isPlaying());
    const panner = instance.pannerNode;
    assert.ok(panner, 'the panner is kept on the instance');
    assert.equal(instance.getSource().connectedTo, panner, 'the source plays through that panner');

    instance.setPan(-.5);
    assert.equal(instance.pan, -.5);
    assert.equal(panner.pan.value, -.5);
    instance.setPan(3);
    assert.equal(panner.pan.value, 1);
    instance.setPan(-3);
    assert.equal(panner.pan.value, -1);

    // set while paused, it plays at the new pan when it resumes
    instance.pause();
    assert.equal(instance.pannerNode, undefined);
    instance.setPan(.25);
    instance.resume();
    assert.equal(instance.pannerNode.pan.value, .25);
    instance.stop();
    assert.equal(instance.pannerNode, undefined);
});

test('music played before audio runs starts on its own once it does', () =>
{
    suspend();
    const music = sound.playMusic();
    assert.ok(music, 'play still returns an instance');
    assert.equal(music.isPlaying(), false, 'it waits while audio is not running');

    run();
    assert.equal(music.isPlaying(), true);
    assert.equal(music.getCurrentTime(), 0, 'from the start');
    music.stop();
});

test('a sound paused or stopped while waiting does not start', () =>
{
    suspend();
    const paused = makeSound().playMusic();
    const stopped = makeSound().playMusic();
    const kept = makeSound().playMusic();
    paused.pause();
    stopped.stop();

    run();
    assert.equal(paused.isPlaying(), false);
    assert.equal(stopped.isPlaying(), false);
    assert.equal(kept.isPlaying(), true);
    kept.stop();

    // and a later running again does not start them either
    suspend();
    run();
    assert.equal(paused.isPlaying(), false);
    assert.equal(stopped.isPlaying(), false);
    assert.equal(kept.isPlaying(), false);
});

test('a one shot that would have ended by the time audio runs is dropped', () =>
{
    suspend();
    const early = makeSound().play();
    const loop = makeSound().playLoop();
    now += 5e3; // five seconds, longer than the sound
    const late = makeSound().play();
    assert.equal(early.isPlaying(), false);

    run();
    assert.equal(early.isPlaying(), false, 'too late to play');
    assert.equal(loop.isPlaying(), true, 'a loop still starts');
    assert.equal(late.isPlaying(), true, 'a one shot still in its time starts');
    loop.stop();
    late.stop();
});

test('a paused instance that is never resumed stays paused when audio runs', () =>
{
    // play(..., paused) never tried to start, so it has nothing to retry
    suspend();
    const instance = sound.play(undefined, 1, 1, 0, true, true);
    run();
    assert.equal(instance.isPlaying(), false);
});

test('a loop played again each frame before audio runs waits as one loop, the newest', () =>
{
    // like a car engine a game restarts while it is not playing
    suspend();
    const engine = makeSound();
    const plays = [];
    for (let i = 0; i < 60; ++i)
        plays.push(engine.playLoop());
    run();
    assert.equal(plays.filter(p=> p.isPlaying()).length, 1, 'one starts');
    assert.equal(plays[59].isPlaying(), true, 'the one the game holds');
    plays[59].stop();
});
