import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';

// Review 4 regressions for input, audio and debug.
// Each test file runs in its own process, so this one can turn headless mode
// off and drive the real audio code against richer Web Audio stubs, the way
// soundInstance.test.mjs does. The input event handlers and the debug render
// only run with a real canvas and document, so they are not covered here.

// gain nodes that record what was scheduled on them
const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createGain = function()
{
    return {
        connect(node) { return node; },
        disconnect() {},
        gain: {
            value: 0,
            cancels: 0,
            ramps: [],
            cancelScheduledValues() { ++this.cancels; },
            setValueAtTime() {},
            linearRampToValueAtTime(value, time) { this.ramps.push([value, time]); },
        },
    };
};
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
ctxProto.createBufferSource = function()
{
    return {
        playbackRate: { value: 1 },
        connect(node) { return node; },
        disconnect() {},
        addEventListener() {},
        start() {},
        stop() {},
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

// a positioned sound pans by its place on screen, which needs a canvas size
LJS.mainCanvasSize.x = LJS.mainCanvasSize.y = 100;

// zzfx sound with ~.6 seconds of samples and no pitch randomness
const zzfxSound = [1, 0, 220, 0, .5, .1];

test('a sound with taper 1 plays at full volume inside its range', () =>
{
    // taper 1 means no fade: full volume right up to the range
    const sound = new LJS.Sound(zzfxSound, 0, 10, 1);
    const instance = sound.play(LJS.vec2(5, 0));
    assert.ok(instance, 'in range, so it plays');
    assert.equal(instance.volume, 1);
    instance.stop();

    // a taper below 1 is still full volume inside it and fades past it
    const tapered = new LJS.Sound(zzfxSound, 0, 10, .5);
    const inside = tapered.play(LJS.vec2(4, 0));
    assert.equal(inside.volume, 1);
    inside.stop();
    const fading = tapered.play(LJS.vec2(7.5, 0));
    assert.ok(Math.abs(fading.volume - .5) < 1e-9, 'half way through the fade');
    fading.stop();
    assert.equal(tapered.play(LJS.vec2(11, 0)), undefined, 'out of range');
});

test('setVolume after stop with a fade leaves the fade alone', () =>
{
    audioContext.currentTime = 10;
    const sound = new LJS.Sound(zzfxSound);
    const instance = sound.play(undefined, .5);
    const gain = instance.gainNode.gain;
    instance.stop(.5);
    assert.equal(gain.cancels, 1, 'the stop scheduled its fade');
    assert.deepEqual(gain.ramps, [[0, 10.5]]);

    // an options slider applying volume to every tracked instance must not undo the fade
    instance.setVolume(1);
    assert.equal(instance.volume, 1, 'the volume is kept for a later start');
    assert.equal(gain.cancels, 1, 'the fade was not cancelled');
    assert.equal(gain.value, .5, 'the fading gain was not jumped back up');
    assert.deepEqual(gain.ramps, [[0, 10.5]]);

    // starting again plays at the volume set meanwhile
    instance.start();
    assert.equal(instance.gainNode.gain.value, 1);
    instance.stop();
});

test('setVolume while paused applies on resume without touching the old gain', () =>
{
    const sound = new LJS.Sound(zzfxSound);
    const instance = sound.play(undefined, .5);
    const gain = instance.gainNode.gain;
    instance.pause();
    instance.setVolume(.8);
    assert.equal(gain.value, .5);
    assert.equal(gain.cancels, 0);
    instance.resume();
    assert.equal(instance.isPlaying(), true);
    assert.notEqual(instance.gainNode.gain, gain, 'resume plays through a new gain node');
    assert.equal(instance.gainNode.gain.value, .8);
    instance.stop();
});

test('debugVideoCaptureStart where capture is unsupported does not throw', () =>
{
    // there is no canvas to capture here, as where captureStream or webm recording is missing:
    // the failure is logged and cleaned up instead of escaping into the game loop
    const log = console.log;
    console.log = ()=> {};
    try
    {
        assert.doesNotThrow(()=> LJS.debugVideoCaptureStart());
    }
    finally { console.log = log; }
    assert.equal(LJS.debugVideoCaptureIsActive(), false);
});

test('types: sound play results, SoundInstance fields and lastInputDevice include what they can be', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const classBlock = (name)=>
    {
        const start = dts.indexOf(`export class ${name} {`);
        assert.ok(start >= 0, name + ' is declared');
        return dts.slice(start, dts.indexOf('\n    }', start));
    };
    const sound = classBlock('Sound'), instance = classBlock('SoundInstance');

    assert.match(sound, /\n\s+randomness: number;/);
    for (const method of ['play', 'playLoop', 'playMusic', 'playNote'])
        assert.match(sound, new RegExp(`\\n\\s+${method}\\([^\\n]*\\): SoundInstance \\| undefined;`), method);

    assert.match(instance, /\n\s+pausedTime: number \| undefined;/);
    assert.match(instance, /\n\s+gainNode: GainNode \| undefined;/);
    assert.match(instance, /\n\s+source: AudioBufferSourceNode \| undefined;/);
    assert.match(instance, /\n\s+onendedCallback: AudioEndedCallback;/);

    assert.match(dts, /export let lastInputDevice: (["'])mouse\1 \| \1keyboard\1 \| \1gamepad\1;/);
});
