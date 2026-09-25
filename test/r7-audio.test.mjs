import { test } from 'node:test';
import assert from 'node:assert/strict';

// review round 7: a SoundInstance's onendedCallback is only the game's, the instance keeps its own bookkeeping.
// This file loads its own copy of the bundle with headless mode off, against Web Audio stubs whose sources can
// be ended by hand like a real one that played to its end.

const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createGain = function()
{
    return {
        connect(node) { return node; },
        disconnect() {},
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
    };
};
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
const sources = [];
ctxProto.createBufferSource = function()
{
    const source = {
        playbackRate: { value: 1 },
        connect(node) { return node; },
        addEventListener(type, fn) { if (type === 'ended') this.ended = fn; },
        start() {},
        stop() { this.stopped = true; },
    };
    sources.push(source);
    return source;
};
globalThis.StereoPannerNode = class StereoPannerNode
{
    constructor(context, options) { this.pan = { value: options?.pan ?? 0 }; }
    connect(node) { return node; }
    disconnect() {}
};

const LJS = await import('../dist/littlejs.esm.js?r7-audio');
LJS.setHeadlessMode(false);
LJS.audioContext.state = 'running';
const sound = new LJS.Sound([1, 0, 220, 0, .5, .1]);
const endLast = ()=> sources[sources.length - 1].ended();

test('an onendedCallback set after play is called when the sound ends', () =>
{
    const instance = sound.play();
    let calls = 0;
    instance.onendedCallback = ()=> ++calls;
    endLast();
    assert.equal(calls, 1);
    assert.equal(instance.isPlaying(), false);
});

test('an onendedCallback set before start keeps the instance bookkeeping', () =>
{
    const instance = new LJS.SoundInstance(sound, 1, 1, 0, false, true);
    let calls = 0;
    instance.onendedCallback = ()=> ++calls;
    instance.start();
    assert.equal(instance.isPlaying(), true);
    endLast();
    assert.equal(calls, 1);
    assert.equal(instance.isPlaying(), false, 'it knows it ended');
    assert.equal(instance.getSource(), undefined);
    instance.resume();
    assert.equal(instance.isPlaying(), true, 'and can play again');
    instance.stop();
});

test('a stopped sound does not call onendedCallback, and a late ended event leaves a new playback alone', () =>
{
    const instance = sound.play();
    let calls = 0;
    instance.onendedCallback = ()=> ++calls;
    const first = sources[sources.length - 1];
    instance.stop();
    instance.start();
    first.ended(); // the stopped source's event arrives after the restart
    assert.equal(calls, 0);
    assert.equal(instance.isPlaying(), true, 'the new playback goes on');
    endLast();
    assert.equal(calls, 1);
});

test('a sound that plays to its end lets go of its gain and panner nodes, as a stopped one does', () =>
{
    const instance = sound.play();
    assert.ok(instance.gainNode && instance.pannerNode);
    endLast();
    assert.equal(instance.gainNode, undefined);
    assert.equal(instance.pannerNode, undefined);
    instance.setVolume(.5); // kept for the next start
    instance.start();
    assert.ok(instance.gainNode, 'a new start makes new ones');
    assert.equal(instance.gainNode.gain.value, .5);
    instance.stop();
});
