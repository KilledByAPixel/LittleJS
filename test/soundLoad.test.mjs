import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Sound.loadSound decode path. Each test file runs in its own process, so this
// file disables headless mode and stubs fetch plus decodeAudioData to drive the
// real loading code without touching the network or a decoder.
//
// The point of these tests is that the decoded channel data is handed straight
// to the sound. It used to be copied element by element into a boxed Array in
// 1e5 sample chunks separated by setTimeout, which stalled the render loop for
// about a second per track and allocated twice the bytes of the source data.

const SAMPLE_RATE = 44100, LENGTH = 4096;

// distinct data per channel so a swapped or truncated copy would be caught
const channelData = [0, 1].map((c)=>
{
    const samples = new Float32Array(LENGTH);
    for (let i = 0; i < LENGTH; i++)
        samples[i] = (i % 100) / 100 * (c ? -1 : 1);
    return samples;
});

const ctxProto = globalThis.AudioContext.prototype;
ctxProto.decodeAudioData = ()=> Promise.resolve({
    numberOfChannels: channelData.length,
    sampleRate: SAMPLE_RATE,
    length: LENGTH,
    getChannelData: (i)=> channelData[i],
});

globalThis.fetch = async ()=> ({ ok: true, arrayBuffer: async ()=> new ArrayBuffer(8) });

// count timer usage across loading, the old chunked copy scheduled one
// setTimeout per 1e5 samples per channel and each was clamped to ~4ms
let timeoutCount = 0;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms)=> { timeoutCount++; return realSetTimeout(fn, ms); };

LJS.setHeadlessMode(false);

const sound = new LJS.Sound('music.ogg');
await new Promise(resolve => realSetTimeout(resolve, 50));

test('sound finishes loading and reports its duration', () =>
{
    assert.equal(sound.isLoaded(), true);
    assert.equal(sound.loadedPercent, 1);
    assert.equal(sound.getDuration(), LENGTH / SAMPLE_RATE);
});

test('decoded channel data is used directly, not copied', () =>
{
    assert.equal(sound.sampleChannels.length, 2);
    for (let i = 0; i < channelData.length; i++)
    {
        assert.ok(sound.sampleChannels[i] instanceof Float32Array,
            `channel ${i} should stay a Float32Array`);
        assert.equal(sound.sampleChannels[i], channelData[i],
            `channel ${i} should be the decoded view itself, not a copy`);
    }
});

test('loading does not schedule timers', () =>
{
    assert.equal(timeoutCount, 0);
});

// playSamples writes the channels into an AudioBuffer with TypedArray set(),
// which takes a Float32Array directly, so playback is unaffected by the above
test('samples still reach the audio buffer intact', () =>
{
    const written = [];
    ctxProto.createBuffer = (channels, length)=>
    {
        const data = Array.from({length: channels}, ()=> new Float32Array(length));
        written.push(data);
        return { getChannelData: (i)=> data[i] };
    };
    ctxProto.createBufferSource = ()=>
    {
        const node = {
            buffer: undefined, loop: false, playbackRate: { value: 1 },
            connect: ()=> node, disconnect() {}, addEventListener() {},
            start() {}, stop() {},
        };
        return node;
    };
    ctxProto.createGain = ()=> ({
        connect() {}, disconnect() {},
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {},
            linearRampToValueAtTime() {} },
    });
    globalThis.StereoPannerNode = class { connect(node) { return node; } disconnect() {} };

    assert.ok(sound.play(), 'play should return a SoundInstance');
    const buffer = written.at(-1);
    assert.ok(buffer, 'an audio buffer should have been created');
    for (let i = 0; i < channelData.length; i++)
        assert.deepEqual(buffer[i], channelData[i], `channel ${i} should match`);
});
