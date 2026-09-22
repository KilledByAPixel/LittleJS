import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// Audio effect graph tests. Each stub node records what it connects to so
// tests can check how an effect is wired without a real Web Audio context.

function makeParam(value=0)
{
    return {
        value,
        scheduled: [],
        cancelScheduledValues() { this.scheduled.length = 0; },
        setValueAtTime(v, t) { this.scheduled.push(['set', v, t]); },
        linearRampToValueAtTime(v, t) { this.scheduled.push(['ramp', v, t]); },
    };
}
function makeNode(name, params={})
{
    const node = {
        name, connections: [],
        connect(target) { this.connections.push(target); return target; },
        disconnect() { this.connections.length = 0; },
    };
    for (const [key, value] of Object.entries(params))
        node[key] = makeParam(value);
    return node;
}
const ctxProto = globalThis.AudioContext.prototype;
ctxProto.createGain = ()=> makeNode('gain', { gain: 1 });
ctxProto.createBiquadFilter = ()=> makeNode('filter', { frequency: 350, Q: 1 });
ctxProto.createConvolver = ()=> makeNode('convolver');
ctxProto.createDelay = (maxDelayTime)=> Object.assign(makeNode('delay', { delayTime: 0 }), { maxDelayTime });
ctxProto.createWaveShaper = ()=> makeNode('waveShaper');
ctxProto.createDynamicsCompressor = ()=> makeNode('compressor', { threshold: -24, ratio: 12 });
ctxProto.createBuffer = (numberOfChannels, length, sampleRate)=>
{
    const channels = [];
    for (let i = numberOfChannels; i--;)
        channels.push(new Float32Array(length));
    return { numberOfChannels, length, sampleRate, getChannelData(i) { return channels[i]; } };
};

const audioContext = LJS.audioContext;
audioContext.sampleRate = 1000;
audioContext.currentTime = 10;
const near = (a, b, eps=1e-9)=> assert.ok(Math.abs(a - b) <= eps, a + ' != ' + b);

test('effect classes are exported from the bundle', () =>
{
    assert.equal(typeof LJS.AudioEffect, 'function');
    assert.equal(typeof LJS.AudioFilter, 'function');
});

test('AudioEffect wires a dry path and a wet path into its output', () =>
{
    const effect = new LJS.AudioEffect;
    assert.deepEqual(effect.input.connections, [effect.dryGain]);
    assert.deepEqual(effect.dryGain.connections, [effect.output]);
    assert.deepEqual(effect.wetGain.connections, [effect.output]);
    assert.deepEqual(effect.output.connections, [LJS.audioMasterGain]);
    assert.equal(effect.mix, 1);
    near(effect.dryGain.gain.value, 0);
    near(effect.wetGain.gain.value, 1);
});

test('setMix balances the dry and wet gains, ramping when given a fade', () =>
{
    const effect = new LJS.AudioEffect(.5);
    near(effect.dryGain.gain.value, .5);
    near(effect.wetGain.gain.value, .5);
    effect.setMix(.25);
    near(effect.dryGain.gain.value, .75);
    near(effect.wetGain.gain.value, .25);
    effect.setMix(2); // clamped
    assert.equal(effect.mix, 1);

    // a fade anchors the current value then ramps, mix is 1 here so dry starts at 0
    effect.setMix(0, .5);
    assert.deepEqual(effect.dryGain.gain.scheduled, [['set', 0, 10], ['ramp', 1, 10.5]]);
    assert.deepEqual(effect.wetGain.gain.scheduled, [['set', 1, 10], ['ramp', 0, 10.5]]);
});

test('connect replaces the output connection and returns the target', () =>
{
    const a = new LJS.AudioEffect;
    const b = new LJS.AudioEffect;
    assert.equal(a.connect(b), b);
    assert.deepEqual(a.output.connections, [b.input]);
    const node = audioContext.createGain();
    assert.equal(a.connect(node), node);
    assert.deepEqual(a.output.connections, [node]);
    a.disconnect();
    assert.deepEqual(a.output.connections, []);
});

test('AudioFilter wraps a biquad filter between the input and the wet gain', () =>
{
    const filter = new LJS.AudioFilter('highpass', 800, 3, .5);
    assert.equal(filter.node.type, 'highpass');
    assert.equal(filter.node.frequency.value, 800);
    assert.equal(filter.node.Q.value, 3);
    assert.equal(filter.mix, .5);
    assert.deepEqual(filter.input.connections, [filter.dryGain, filter.node]);
    assert.deepEqual(filter.node.connections, [filter.wetGain]);

    const defaults = new LJS.AudioFilter;
    assert.equal(defaults.node.type, 'lowpass');
    assert.equal(defaults.node.frequency.value, 1000);
    assert.equal(defaults.node.Q.value, 1);
});

test('AudioFilter setters ramp the frequency and Q', () =>
{
    const filter = new LJS.AudioFilter('lowpass', 1000);
    filter.setFrequency(500, .25);
    assert.deepEqual(filter.node.frequency.scheduled, [['set', 1000, 10], ['ramp', 500, 10.25]]);
    filter.setQ(5);
    assert.equal(filter.node.Q.value, 5);
    assert.deepEqual(filter.node.Q.scheduled, []);
});

test('AudioReverb builds a stereo impulse of decaying noise', () =>
{
    const reverb = new LJS.AudioReverb(2, 2);
    assert.equal(reverb.mix, .5);
    assert.deepEqual(reverb.input.connections, [reverb.dryGain, reverb.node]);
    assert.deepEqual(reverb.node.connections, [reverb.wetGain]);

    // setRoom rebuilds the impulse for the new duration
    const first = reverb.node.buffer;
    reverb.setRoom(1, 3);
    assert.notEqual(reverb.node.buffer, first);
    assert.equal(reverb.node.buffer.length, 1000);
    reverb.setRoom(2, 2);

    const buffer = reverb.node.buffer;
    assert.equal(buffer.numberOfChannels, 2);
    assert.equal(buffer.length, 2000); // duration * sampleRate
    for (let channel = 2; channel--;)
    {
        const samples = buffer.getChannelData(channel);
        const meanAbs = (from, to)=>
        {
            let sum = 0;
            for (let i = from; i < to; ++i)
                sum += Math.abs(samples[i]);
            return sum / (to - from);
        };
        assert.ok(meanAbs(0, 100) > meanAbs(1900, 2000), 'impulse should decay');
        assert.ok(meanAbs(0, 100) > 0, 'impulse should not be silent');
        for (let i = 2000; i--;)
            assert.ok(Math.abs(samples[i]) <= 1);
    }
});

test('AudioDelay loops feedback through the delay and clamps it', () =>
{
    const delay = new LJS.AudioDelay(.25, .4, .5);
    assert.equal(delay.node.maxDelayTime, 5);
    assert.equal(delay.node.delayTime.value, .25);
    assert.equal(delay.feedbackGain.gain.value, .4);
    assert.deepEqual(delay.input.connections, [delay.dryGain, delay.node]);
    assert.deepEqual(delay.node.connections, [delay.feedbackGain, delay.wetGain]);
    assert.deepEqual(delay.feedbackGain.connections, [delay.node]);

    delay.setFeedback(2);
    assert.equal(delay.feedbackGain.gain.value, .95);
    delay.setTime(1, .5);
    assert.deepEqual(delay.node.delayTime.scheduled, [['set', .25, 10], ['ramp', 1, 10.5]]);
});

test('AudioDistortion shapes the wave with a rising curve that clips harder with amount', () =>
{
    const distortion = new LJS.AudioDistortion(.5);
    assert.equal(distortion.amount, .5);
    assert.equal(distortion.node.oversample, '2x');
    assert.deepEqual(distortion.input.connections, [distortion.dryGain, distortion.node]);
    assert.deepEqual(distortion.node.connections, [distortion.wetGain]);

    const curve = distortion.node.curve;
    assert.equal(curve.length, 1024);
    near(curve[0], -1, 1e-6);
    near(curve[1023], 1, 1e-6);
    for (let i = 1; i < 1024; ++i)
        assert.ok(curve[i] >= curve[i-1], 'curve should rise');

    // no drive is a straight line, more drive bends it toward the edges
    distortion.setAmount(0);
    const straight = distortion.node.curve;
    near(straight[64], 64*2/1023 - 1, 1e-6);
    distortion.setAmount(1);
    assert.ok(distortion.node.curve[64] < straight[64]);
});

test('AudioCompressor sets threshold and ratio and ramps them', () =>
{
    const compressor = new LJS.AudioCompressor(-30, 20);
    assert.equal(compressor.mix, 1);
    assert.equal(compressor.node.threshold.value, -30);
    assert.equal(compressor.node.ratio.value, 20);
    assert.deepEqual(compressor.input.connections, [compressor.dryGain, compressor.node]);
    assert.deepEqual(compressor.node.connections, [compressor.wetGain]);

    compressor.setThreshold(-10, 1);
    assert.deepEqual(compressor.node.threshold.scheduled, [['set', -30, 10], ['ramp', -10, 11]]);
    compressor.setRatio(4);
    assert.equal(compressor.node.ratio.value, 4);
});
