import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.min.js';

// An AudioParam throws on a value that is not finite, as Chrome's does, so in a release build, with no asserts, a sound
// played or changed with NaN or Infinity threw from inside the engine; such a value is taken as silent, centered or
// at its normal rate instead. Its own file, for the release build and the stand in nodes below.

// an audio param that throws as a browser's does
const param = (value)=>
{
    let v = value;
    return {
        get value() { return v; },
        set value(x) { if (!Number.isFinite(x)) throw new TypeError('non-finite value ' + x); v = x; },
        cancelScheduledValues() {}, setValueAtTime(x) { this.value = x; }, linearRampToValueAtTime(x) { this.value = x; },
    };
};
const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createGain = function()
{
    return { gain: param(1), connect(node) { return node; }, disconnect() {} };
};
ctxProto.createBuffer = function() { return { getChannelData() { return { set() {} }; } }; };
const sources = [];
ctxProto.createBufferSource = function()
{
    const source = { playbackRate: param(1), loop: false, connect(node) { return node; }, disconnect() {},
        addEventListener() {}, start() {}, stop() {} };
    sources.push(source);
    return source;
};
globalThis.StereoPannerNode = class StereoPannerNode
{
    constructor(context, options)
    {
        this.pan = param(0);
        this.pan.value = options?.pan ?? 0;
    }
    connect(node) { return node; }
    disconnect() {}
};

LJS.setHeadlessMode(false);
const sound = new LJS.Sound([1, 0, 220, 0, .5, .1]);

test('a sound played with a volume, rate or pan that is not finite plays without a throw', () =>
{
    for (const [name, play] of [
        ['NaN volume', ()=> sound.play(undefined, NaN)],
        ['Infinity volume', ()=> sound.play(undefined, Infinity)],
        ['NaN pitch', ()=> sound.play(undefined, 1, NaN)],
        ['a NaN place', ()=> sound.play(LJS.vec2(NaN, 0))],
    ])
        assert.doesNotThrow(play, name);
    const last = sources[sources.length - 1];
    assert.ok(Number.isFinite(last.playbackRate.value));
});

test('a playing instance set to a volume, rate or pan that is not finite does not throw', () =>
{
    const instance = sound.play();
    assert.doesNotThrow(()=> instance.setVolume(NaN), 'volume');
    assert.doesNotThrow(()=> instance.setRate(Infinity), 'rate');
    assert.doesNotThrow(()=> instance.setPan(NaN), 'pan');
    assert.doesNotThrow(()=> LJS.playAudioBuffer(sound.sampleBuffer, NaN, NaN, NaN), 'playAudioBuffer');
});
