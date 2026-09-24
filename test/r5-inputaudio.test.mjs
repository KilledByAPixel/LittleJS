import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Review 5 regressions for input and audio.
// Each test file runs in its own process. This one loads a second copy of the
// bundle with no AudioContext at all, the way it loads in a Node server, and
// drives the shared copy with headless mode off against richer Web Audio stubs.
// The input event handlers, the gamepad poll and the touch gamepad only run in
// a browser, so those fixes are checked there instead.

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// a copy of the bundle loaded where there is no AudioContext, like Node
const AudioContextStub = globalThis.AudioContext;
delete globalThis.AudioContext;
const noAudio = await import('../dist/littlejs.esm.js?noaudio');
globalThis.AudioContext = AudioContextStub;
noAudio.setHeadlessMode(true);

// the shared copy plays for real against stubs whose buffers take samples
const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
const LJS = await import('../dist/littlejs.esm.js');
LJS.setHeadlessMode(false);

test('audioIsRunning is false with no audio context, not a throw', () =>
{
    assert.equal(noAudio.audioContext, undefined);
    assert.equal(noAudio.audioIsRunning(), false);
});

test('setAudioMasterEffect does nothing with no audio context, not a throw', () =>
{
    noAudio.setAudioMasterEffect();
    noAudio.setAudioMasterEffect(new noAudio.AudioCompressor);
    noAudio.setAudioMasterEffect();
});

test('audio effects can be made and set with no audio context, like a Node server', () =>
{
    // a game that builds its effects at load shares its code with a headless server
    const filter = new noAudio.AudioFilter('lowpass', 400, 2, .5);
    const reverb = new noAudio.AudioReverb(3, 2);
    const delay = new noAudio.AudioDelay(.4, .5);
    const distortion = new noAudio.AudioDistortion(.8);
    const compressor = new noAudio.AudioCompressor(-20, 4);
    filter.setMix(.25, 1);
    filter.setFrequency(1000, 1);
    filter.setQ(3);
    reverb.setRoom(1, 3);
    delay.setTime(.2, 1);
    delay.setFeedback(.3);
    distortion.setAmount(.3);
    compressor.setThreshold(-10, 1);
    compressor.setRatio(8);

    // the simple values still read back
    assert.equal(filter.mix, .25);
    assert.equal(reverb.mix, .5);
    assert.equal(distortion.amount, .3);

    // chains still return their target, so they read left to right
    assert.equal(filter.connect(reverb), reverb);
    assert.equal(filter.connect(reverb).connect(delay), delay);
    delay.disconnect();

    // and sounds can route through them
    const sound = new noAudio.Sound([.5, .5]);
    sound.output = filter;
    assert.equal(sound.play(), undefined);
});

test('ZzFXMusic hands its samples to an audio buffer when it is made', () =>
{
    // like a zzfx sound, so a long song does not sit in plain arrays until its first play
    const music = new LJS.ZzFXMusic([[[,0,400]], [[[0,-1,1,0,9,1]]], [0], 90]);
    assert.ok(music.sampleBuffer, 'the buffer is built at once');
    assert.ok(music.getDuration() > 0);
    assert.equal(music.isLoaded(), true);
});

test('mouse buttons 3 and 4 (back and forward) can be queried', () =>
{
    // onMouseDown stores them, and the keyboard assert only rejects higher numbers now
    for (const button of [3, 4])
    {
        assert.equal(LJS.mouseIsDown(button), false);
        assert.equal(LJS.mouseWasPressed(button), false);
        assert.equal(LJS.mouseWasReleased(button), false);
    }
});

test('AudioEffect.connect returns the type it was given in the typings', () =>
{
    // a union return type broke a.connect(b).connect(c) in TypeScript
    const typings = read('dist/littlejs.d.ts');
    assert.match(typings, /connect<(\w+) extends (AudioEffect \| AudioNode|AudioNode \| AudioEffect)>\(target: \1\): \1;/);
});

test('gamepadVibrateStop documents its gamepad parameter', () =>
{
    const typings = read('dist/littlejs.d.ts');
    const end = typings.indexOf('export function gamepadVibrateStop(');
    assert.ok(end >= 0, 'gamepadVibrateStop is in the typings');
    const doc = typings.slice(typings.lastIndexOf('/**', end), end);
    assert.match(doc, /@param \{number\} \[gamepad\]/);
});
