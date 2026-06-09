import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// SoundInstance playback state machine tests.
// Each test file runs in its own process, so this file can disable
// headless mode and drive the real audio code against richer stubs of
// the Web Audio API than the shared minimal ones in setup.mjs.

// track the most recently created buffer source so tests can inspect it
let lastSource;

const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createGain = function()
{
    return {
        connect() {}, disconnect() {},
        gain: {
            value: 0,
            cancelScheduledValues() {},
            setValueAtTime() {},
            ramps: [],
            linearRampToValueAtTime(value, time) { this.ramps.push([value, time]); },
        },
    };
};
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
ctxProto.createBufferSource = function()
{
    return lastSource = {
        buffer: undefined,
        loop: false,
        playbackRate: { value: 1 },
        listeners: {},
        startCalls: [],
        stopCalls: [],
        connect(node) { return node; },
        disconnect() {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        start(when, offset) { this.startCalls.push([when, offset]); },
        stop(when) { this.stopCalls.push(when); },
    };
};
globalThis.StereoPannerNode = class StereoPannerNode
{
    constructor(context, options) { this.pan = options?.pan; }
    connect(node) { return node; }
    disconnect() {}
};

LJS.setHeadlessMode(false);
const audioContext = LJS.audioContext;

// zzfx sound with ~.6 seconds of samples (attack 0, sustain .5, release .1)
const sound = new LJS.Sound([1, 0, 220, 0, .5, .1]);
const epsilon = 1e-9;

test('zzfx sound generates samples and duration', () =>
{
    assert.ok(sound.isLoaded());
    assert.ok(sound.getDuration() > .5, 'duration should be over half a second');
});

test('play starts in the playing state', () =>
{
    audioContext.currentTime = 10;
    const instance = sound.play();
    assert.ok(instance, 'play should return a SoundInstance');
    assert.equal(instance.isPlaying(), true);
    assert.equal(instance.isPaused(), false);
    assert.ok(instance.getSource(), 'source should be set while playing');
    instance.stop();
});

test('getCurrentTime tracks the audio context clock', () =>
{
    audioContext.currentTime = 20;
    const instance = sound.play();
    assert.ok(Math.abs(instance.getCurrentTime()) < epsilon);
    audioContext.currentTime = 20.25;
    assert.ok(Math.abs(instance.getCurrentTime() - .25) < epsilon);
    instance.stop();
});

test('pause freezes playback position', () =>
{
    audioContext.currentTime = 30;
    const instance = sound.play();
    audioContext.currentTime = 30.2;
    instance.pause();
    assert.equal(instance.isPaused(), true);
    assert.equal(instance.isPlaying(), false);
    assert.ok(Math.abs(instance.getCurrentTime() - .2) < epsilon);

    // advancing the clock must not move a paused sound
    audioContext.currentTime = 31;
    assert.ok(Math.abs(instance.getCurrentTime() - .2) < epsilon);
    instance.stop();
});

test('resume continues from the paused position', () =>
{
    audioContext.currentTime = 40;
    const instance = sound.play();
    audioContext.currentTime = 40.2;
    instance.pause();
    audioContext.currentTime = 45; // time passes while paused
    instance.resume();
    assert.equal(instance.isPlaying(), true);
    assert.ok(Math.abs(instance.getCurrentTime() - .2) < epsilon);
    audioContext.currentTime = 45.1;
    assert.ok(Math.abs(instance.getCurrentTime() - .3) < epsilon);
    instance.stop();
});

test('pause and resume are idempotent', () =>
{
    audioContext.currentTime = 50;
    const instance = sound.play();
    instance.resume(); // resume while playing is a no-op
    assert.equal(instance.isPlaying(), true);
    audioContext.currentTime = 50.1;
    instance.pause();
    instance.pause(); // pause while paused is a no-op
    assert.ok(Math.abs(instance.getCurrentTime() - .1) < epsilon);
    instance.stop();
});

test('stop resets position to the start', () =>
{
    audioContext.currentTime = 60;
    const instance = sound.play();
    audioContext.currentTime = 60.3;
    instance.stop();
    assert.equal(instance.isPlaying(), false);
    assert.equal(instance.getCurrentTime(), 0);
});

test('stop while paused also resets position', () =>
{
    audioContext.currentTime = 70;
    const instance = sound.play();
    audioContext.currentTime = 70.3;
    instance.pause();
    instance.stop();
    assert.equal(instance.getCurrentTime(), 0);
    assert.equal(instance.isPlaying(), false);
});

test('stop with fade schedules a gain ramp and delayed stop', () =>
{
    audioContext.currentTime = 80;
    const instance = sound.play();
    const gain = instance.gainNode.gain;
    const source = instance.getSource();
    instance.stop(.5);
    assert.deepEqual(gain.ramps, [[0, 80.5]], 'gain should ramp to 0 at end of fade');
    assert.deepEqual(source.stopCalls, [80.5], 'source stop should be scheduled at end of fade');
    assert.equal(instance.isPlaying(), false);
});

test('play paused starts in the paused state', () =>
{
    audioContext.currentTime = 90;
    const instance = sound.play(undefined, 1, 1, 1, false, true);
    assert.equal(instance.isPlaying(), false);
    assert.equal(instance.isPaused(), true);
    assert.equal(instance.getCurrentTime(), 0);
    instance.resume();
    assert.equal(instance.isPlaying(), true);
    instance.stop();
});

test('setVolume updates the gain node', () =>
{
    const instance = sound.play();
    instance.setVolume(.4);
    assert.equal(instance.volume, .4);
    assert.equal(instance.gainNode.gain.value, .4);
    instance.stop();
});

test('sound ending naturally clears the playing state', () =>
{
    audioContext.currentTime = 100;
    const instance = sound.play();
    assert.equal(instance.isPlaying(), true);
    lastSource.listeners.ended(); // simulate the source finishing
    assert.equal(instance.isPlaying(), false);
});

test('play returns undefined when sound is disabled', () =>
{
    LJS.setSoundEnable(false);
    assert.equal(sound.play(), undefined);
    LJS.setSoundEnable(true);
    assert.ok(sound.play());
});
