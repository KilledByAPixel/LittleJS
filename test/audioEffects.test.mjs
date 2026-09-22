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
