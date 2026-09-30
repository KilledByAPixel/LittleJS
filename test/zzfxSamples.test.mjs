import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// ZzFX 1.4.0: the samples are made into a Float32Array of their full length, and noise is a cheap expression of the
// sample index that stays white, no longer the sine of a huge number

test('zzfxG makes a Float32Array as long as the sound, an empty one for no length', () =>
{
    const rate = LJS.audioDefaultSampleRate;
    const samples = LJS.zzfxG(1, 0, 220, 0, .5, .1); // attack 0 is 9 samples, sustain .5, release .1
    assert.ok(samples instanceof Float32Array);
    assert.equal(samples.length, 9 + (.5 + .1) * rate | 0);
    const empty = LJS.zzfxG(1, 0, 220, 0, 0, -1);
    assert.ok(empty instanceof Float32Array);
    assert.equal(empty.length, 0);
});

test('noise changes the sound and keeps every sample finite', () =>
{
    const plain = LJS.zzfxG(1, 0, 220, 0, .2, .1), noisy = LJS.zzfxG(1, 0, 220, 0, .2, .1, 0, 1, 0, 0, 0, 0, 0, 1);
    assert.ok(noisy.every(Number.isFinite));
    assert.ok(noisy.some((s, i)=> Math.abs(s - plain[i]) > .01), 'the noise is heard');
});
