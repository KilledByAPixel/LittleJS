import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProcessBloomShader } from '../dist/littlejs.esm.js';

// the tap counts the generated shader really loops over
const ringCounts = (shader)=> [...shader.matchAll(/k < (\d+);/g)].map(m => +m[1]);

test('the bloom gathers on rings that share no symmetry', () =>
{
    // one ring of evenly spaced taps leaves that many copies of anything bright around it,
    // which is visible as a ring of ghosts; odd unequal counts spread the error out instead
    for (const size of [3, 6, 8, 12, 24])
    {
        const counts = ringCounts(postProcessBloomShader(.6, 1, size));
        assert.equal(counts.length, 3, `size ${size} should gather on three rings`);
        assert.ok(counts.every(c => c % 2), `size ${size} counts should be odd, got ${counts}`);
        assert.ok(counts.every(c => c >= 5), `size ${size} rings need enough taps, got ${counts}`);
        // no factor shared by all three, or the rings line up into that many lobes
        const gcd = (a, b)=> b ? gcd(b, a % b) : a;
        assert.equal(counts.reduce(gcd), 1, `size ${size} rings share a factor: ${counts}`);
    }
});

test('the bloom taps scale with the size and stop at a ceiling', () =>
{
    const taps = (size)=> ringCounts(postProcessBloomShader(.6, 1, size)).reduce((a, b)=> a + b);
    assert.ok(taps(4) < taps(8) && taps(8) < taps(12), 'a wider glow needs more taps to stay smooth');
    assert.ok(taps(100) <= 64, 'but a huge one must not cost hundreds a pixel, got ' + taps(100));
    assert.equal(taps(100), taps(40), 'past the ceiling the count holds steady');
});

test('the bloom shader is built from its settings', () =>
{
    const shader = postProcessBloomShader(.25, 3, 8);
    assert.ok(shader.includes('- 0.2500'), 'the threshold is subtracted from each tap');
    const taps = ringCounts(shader).reduce((a, b)=> a + b);
    assert.ok(shader.includes((3 / taps).toFixed(6)), 'the glow is the mean of the taps times the strength');
    assert.throws(()=> postProcessBloomShader(.6, 1, 0));
    assert.throws(()=> postProcessBloomShader(.6, 1, NaN));
});
