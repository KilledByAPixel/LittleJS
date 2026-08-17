import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Sound decode and playback buffer handling. Each test file runs in its own
// process, so this file disables headless mode and stubs fetch plus the Web
// Audio pieces needed to drive the real loading and playback code.
//
// Two things are being guarded here:
//   1. Loading takes the decoded AudioBuffer as is. It used to read the channel
//      data out and copy it element by element into a boxed Array in 1e5 sample
//      chunks separated by setTimeout, stalling the render loop for about a
//      second per track.
//   2. Playing shares that one buffer. It used to build a fresh AudioBuffer and
//      memcpy the samples into it on every single play.

const SAMPLE_RATE = 44100, LENGTH = 4096;

const channelData = [0, 1].map((c)=>
{
    const samples = new Float32Array(LENGTH);
    for (let i = 0; i < LENGTH; i++)
        samples[i] = (i % 100) / 100 * (c ? -1 : 1);
    return samples;
});

// the buffer the fake decoder hands back, playback should use this object
const decodedBuffer = {
    numberOfChannels: channelData.length,
    sampleRate: SAMPLE_RATE,
    length: LENGTH,
    duration: LENGTH / SAMPLE_RATE,
    getChannelData: (i)=> channelData[i],
};

const ctxProto = globalThis.AudioContext.prototype;
ctxProto.decodeAudioData = ()=> Promise.resolve(decodedBuffer);

// record every buffer the engine builds, and every source node it starts
const buffersCreated = [], sourcesStarted = [];
ctxProto.createBuffer = (channels, length)=>
{
    const data = Array.from({length: channels}, ()=> new Float32Array(length));
    const buffer = { numberOfChannels: channels, length, sampleRate: SAMPLE_RATE,
        duration: length / SAMPLE_RATE, getChannelData: (i)=> data[i] };
    buffersCreated.push(buffer);
    return buffer;
};
ctxProto.createBufferSource = ()=>
{
    const node = {
        buffer: undefined, loop: false, playbackRate: { value: 1 },
        connect: ()=> node, disconnect() {}, addEventListener() {},
        start() { sourcesStarted.push(node); }, stop() {},
    };
    return node;
};
ctxProto.createGain = ()=> ({
    connect() {}, disconnect() {},
    gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {},
        linearRampToValueAtTime() {} },
});
globalThis.StereoPannerNode = class { connect(node) { return node; } disconnect() {} };
globalThis.fetch = async ()=> ({ ok: true, arrayBuffer: async ()=> new ArrayBuffer(8) });

// count timers used while loading, the old chunked copy scheduled one per 1e5
// samples per channel and browsers clamped each to about 4ms
let timeoutCount = 0;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms)=> { timeoutCount++; return realSetTimeout(fn, ms); };

LJS.setHeadlessMode(false);

const sound = new LJS.Sound('music.ogg');
await new Promise(resolve => realSetTimeout(resolve, 50));
const buffersAfterLoad = buffersCreated.length;

test('sound finishes loading and reports its duration', () =>
{
    assert.equal(sound.isLoaded(), true);
    assert.equal(sound.loadedPercent, 1);
    assert.equal(sound.getDuration(), LENGTH / SAMPLE_RATE);
    assert.equal(sound.sampleRate, SAMPLE_RATE);
});

test('the decoded buffer is kept as is, not rebuilt', () =>
{
    assert.equal(sound.sampleBuffer, decodedBuffer,
        'the sound should hold the decoded buffer itself');
    assert.equal(buffersAfterLoad, 0,
        'loading should not build an audio buffer of its own');
});

test('loading does not schedule timers', () =>
{
    assert.equal(timeoutCount, 0);
});

test('playing shares the decoded buffer instead of copying it', () =>
{
    const before = buffersCreated.length;
    const instance = sound.play();
    assert.ok(instance, 'play should return a SoundInstance');
    assert.equal(buffersCreated.length, before,
        'playing should not allocate a new audio buffer');
    assert.equal(sourcesStarted.at(-1).buffer, decodedBuffer,
        'the source node should be given the decoded buffer');
    instance.stop();
});

test('overlapping plays all share the one buffer', () =>
{
    const before = buffersCreated.length;
    const instances = [sound.play(), sound.play(), sound.play()];
    assert.ok(instances.every(Boolean), 'all three should start');
    assert.equal(buffersCreated.length, before,
        'three simultaneous plays should still allocate nothing');
    for (const node of sourcesStarted.slice(-3))
        assert.equal(node.buffer, decodedBuffer);
    instances.forEach(i => i.stop());
});

test('sampleChannels still reads back the sample data', () =>
{
    const channels = sound.sampleChannels;
    assert.equal(channels.length, 2);
    for (let i = 0; i < channelData.length; i++)
        assert.deepEqual(channels[i], channelData[i], `channel ${i} should match`);
});

test('reading sampleChannels returns copies playback cannot detach', () =>
{
    // the buffer's own channel arrays get detached when a source acquires them,
    // so the property must hand out copies rather than live views
    assert.notEqual(sound.sampleChannels[0], channelData[0]);
    assert.equal(sound.sampleChannels, sound.sampleChannels, 'and should be cached');
});

// zzfx sounds have no decoded buffer to inherit, so they build one up front and
// release the plain arrays the generator produced
test('zzfx sounds build a shared buffer and release their arrays', () =>
{
    const before = buffersCreated.length;
    const zzfxSound = new LJS.Sound([1, 0, 220, 0, .5, .1]);

    assert.equal(buffersCreated.length, before + 1, 'one buffer built at construction');
    assert.equal(zzfxSound.sampleBuffer, buffersCreated.at(-1));
    assert.ok(zzfxSound.getDuration() > .5, 'duration should survive releasing the arrays');

    const playBefore = buffersCreated.length;
    const instance = zzfxSound.play();
    assert.ok(instance);
    assert.equal(buffersCreated.length, playBefore, 'playing should allocate nothing');
    instance.stop();
});

// assigning new samples has to invalidate the buffer built from the old ones,
// which is how plugins/zzfxm.js hands its generated music to a Sound
test('assigning sampleChannels rebuilds the buffer', () =>
{
    const custom = new LJS.Sound([1, 0, 220, 0, .5, .1]);
    const originalBuffer = custom.sampleBuffer;

    custom.sampleChannels = [new Float32Array(1000), new Float32Array(1000)];
    assert.equal(custom.sampleBuffer, undefined, 'the stale buffer should be dropped');
    assert.equal(custom.getDuration(), 1000 / custom.sampleRate);

    const instance = custom.play();
    assert.ok(instance);
    assert.notEqual(custom.sampleBuffer, originalBuffer, 'a new buffer should be built');
    assert.equal(custom.sampleBuffer, buffersCreated.at(-1));
    instance.stop();
});
