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
        connections: [],
        connect(node) { this.connections.push(node); return node; },
        disconnect(node)
        {
            // like a real node, disconnecting something not connected throws
            if (node === undefined)
                return void (this.connections.length = 0);
            const i = this.connections.indexOf(node);
            if (i < 0)
                throw new Error('InvalidAccessError: node is not connected');
            this.connections.splice(i, 1);
        },
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
const near = (a, b)=> assert.ok(Math.abs(a - b) < epsilon, a + ' != ' + b);

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

test('playLoop plays the sound on a loop', () =>
{
    const instance = sound.playLoop(undefined, .5);
    assert.equal(instance.loop, true);
    assert.equal(lastSource.loop, true, 'the source itself loops');
    assert.equal(instance.volume, .5);
    instance.stop();
    assert.equal(sound.play().loop, false, 'play still does not');
});

test('setVolume updates the gain node', () =>
{
    const instance = sound.play();
    instance.setVolume(.4);
    assert.equal(instance.volume, .4);
    assert.equal(instance.gainNode.gain.value, .4);
    assert.deepEqual(instance.gainNode.gain.ramps, [], 'no fade means no ramp');
    instance.stop();
});

test('setVolume with a fade ramps the gain, and a plain set cancels a fade in flight', () =>
{
    audioContext.currentTime = 90;
    const instance = sound.play();
    const gain = instance.gainNode.gain;
    instance.setVolume(.2, .5);
    assert.equal(instance.volume, .2, 'the target is the new volume right away');
    assert.deepEqual(gain.ramps, [[.2, 90.5]], 'gain should ramp to the volume at end of fade');

    // a second fade replaces the first, a plain set drops it and jumps
    instance.setVolume(.8, 1);
    assert.deepEqual(gain.ramps, [[.2, 90.5], [.8, 91]]);
    instance.setVolume(.6);
    assert.equal(gain.value, .6);
    instance.stop();
});

test('setRate changes the speed while playing and keeps the place in the sound', () =>
{
    audioContext.currentTime = 50;
    const instance = sound.play();
    audioContext.currentTime = 50.2;
    near(instance.getCurrentTime(), .2);

    // twice as fast from here: the place stays at .2 seconds of sound, which is .1 at the new rate
    instance.setRate(2);
    assert.equal(instance.rate, 2);
    assert.equal(lastSource.playbackRate.value, 2);
    near(instance.getCurrentTime(), .1);
    audioContext.currentTime = 50.25; // another .05 seconds, which plays .1 of sound
    near(instance.getCurrentTime(), .15);
    instance.stop();

    // a stopped instance just keeps the rate for when it starts
    instance.setRate(.5);
    assert.equal(instance.rate, .5);
});

test('sound ending naturally clears the playing state and its time is 0', () =>
{
    audioContext.currentTime = 100;
    const instance = sound.play();
    assert.equal(instance.isPlaying(), true);
    lastSource.listeners.ended(); // simulate the source finishing
    assert.equal(instance.isPlaying(), false);
    assert.equal(instance.getCurrentTime(), 0);
});

test('resume on a suspended context keeps the paused position', () =>
{
    audioContext.currentTime = 110;
    const instance = sound.play();
    audioContext.currentTime = 110.3;
    instance.pause();
    audioContext.state = 'suspended';
    instance.resume(); // cannot start, the place must survive
    assert.equal(instance.isPlaying(), false);
    near(instance.getCurrentTime(), .3);
    audioContext.state = 'running';
    instance.resume();
    assert.equal(instance.isPlaying(), true);
    near(instance.getCurrentTime(), .3);
    instance.stop();
});

test('the master gain is at soundVolume from load', () =>
{
    // engineInit never runs here, the gain is set where the node is made
    assert.equal(LJS.audioMasterGain.gain.value, LJS.soundVolume);
});

test('ZzFXMusic is loaded as soon as it is made and plays as music', () =>
{
    // generated in place like a zzfx sound, so the loaded gate the music examples use passes
    const music = new LJS.ZzFXMusic([[[,0,400]], [[[0,-1,1,0,9,1]]], [0], 90]);
    assert.equal(music.isLoaded(), true);
    assert.equal(music.loadedPercent, 1);
    assert.ok(music.getDuration() > 0);
    const instance = music.playMusic();
    assert.equal(instance.isPlaying(), true);
    assert.equal(instance.loop, true);
    instance.stop();
});

test('play returns undefined when sound is disabled', () =>
{
    LJS.setSoundEnable(false);
    assert.equal(sound.play(), undefined);
    LJS.setSoundEnable(true);
    assert.ok(sound.play());
});

test('sound output routes the gain node through it, and again on resume', () =>
{
    const effectInput = audioContext.createGain();
    const routed = new LJS.Sound([1, 0, 220, 0, .5, .1]);
    routed.output = effectInput;
    const instance = routed.play();
    assert.equal(instance.output, effectInput);
    assert.deepEqual(instance.gainNode.connections, [effectInput]);
    instance.pause();
    instance.resume();
    assert.deepEqual(instance.gainNode.connections, [effectInput]);
    instance.stop();
});

test('sound output accepts an effect and routes to its input node', () =>
{
    const effect = { input: audioContext.createGain(), output: audioContext.createGain() };
    const routed = new LJS.Sound([1, 0, 220, 0, .5, .1]);
    routed.output = effect;
    const instance = routed.play();
    assert.equal(instance.output, effect);
    assert.deepEqual(instance.gainNode.connections, [effect.input]);
    instance.stop();
});

test('sounds without an output connect to the master gain', () =>
{
    const instance = sound.play();
    assert.equal(instance.output, undefined);
    assert.ok(LJS.audioMasterGain, 'the master gain exists from load, before engineInit');
    assert.deepEqual(instance.gainNode.connections, [LJS.audioMasterGain]);
    instance.stop();
});

test('setAudioMasterEffect reroutes the master gain through an effect and back', () =>
{
    const master = LJS.audioMasterGain;
    const destination = audioContext.destination;
    assert.deepEqual(master.connections, [destination]);

    // two raw nodes as the ends of a chain; the output starts on the master gain
    // the way a plugin effect does, and must end up feeding only the speakers
    const input = audioContext.createGain();
    const output = audioContext.createGain();
    output.connect(master);
    LJS.setAudioMasterEffect(input, output);
    assert.deepEqual(master.connections, [input]);
    assert.deepEqual(output.connections, [destination]);

    // an effect object replaces it, and the old route is fully undone (raw nodes get no default back)
    const effect = { input: audioContext.createGain(), output: audioContext.createGain() };
    effect.output.connect(master); // the way a plugin effect starts
    LJS.setAudioMasterEffect(effect);
    assert.deepEqual(master.connections, [effect.input]);
    assert.deepEqual(output.connections, []);
    assert.deepEqual(effect.output.connections, [destination]);

    // one node is both ends, and the displaced effect goes back to feeding the master gain
    const node = audioContext.createGain();
    LJS.setAudioMasterEffect(node);
    assert.deepEqual(master.connections, [node]);
    assert.deepEqual(node.connections, [destination]);
    assert.deepEqual(effect.output.connections, [master]);

    // the same effect set twice does not double up
    LJS.setAudioMasterEffect(effect);
    LJS.setAudioMasterEffect(effect);
    assert.deepEqual(master.connections, [effect.input]);
    assert.deepEqual(effect.output.connections, [destination]);
    assert.deepEqual(node.connections, []);

    // clearing restores the direct route, and the effect its default route
    LJS.setAudioMasterEffect();
    assert.deepEqual(master.connections, [destination]);
    assert.deepEqual(effect.output.connections, [master]);
});
