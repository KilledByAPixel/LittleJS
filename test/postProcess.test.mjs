import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProcessBloomShader } from '../dist/littlejs.esm.js';

// the rings the generated shader really gathers on, as [count, radius in pixels]
const rings = (shader)=>
{
    const counts = [...shader.matchAll(/k < (\d+);/g)].map(m => +m[1]);
    const radii = [...shader.matchAll(/\* ([\d.]+) \/ iResolution/g)].map(m => +m[1]);
    assert.equal(counts.length, radii.length, 'every ring loop should have a radius');
    return counts.map((count, i)=> [count, radii[i]]);
};

test('the bloom keeps a sample every few pixels of every ring, however wide it is', () =>
{
    // this is the whole trick: a gap wider than a few pixels shows up as a ring of copies of
    // anything bright, which is what a single fixed ring of taps leaves behind as the glow grows
    for (const size of [.5, 1, 3, 6, 8, 10, 10.8, 12, 16, 20, 24, 32])
    {
        const gathered = rings(postProcessBloomShader(.6, 1, size));
        assert.equal(gathered.length, 3, `size ${size} should gather on three rings`);
        for (const [count, radius] of gathered)
        {
            assert.ok(count % 2, `size ${size} ring counts should be odd, got ${count}`);
            assert.ok(count >= 5, `size ${size} rings need enough taps, got ${count}`);
            const gap = 2 * Math.PI * radius / count; // pixels between neighboring taps
            assert.ok(gap < 3.3, `size ${size} radius ${radius} leaves a ${gap.toFixed(2)} pixel gap`);
        }
        // three different counts, so what one ring misses the others do not miss in the same places
        const counts = gathered.map(r => r[0]);
        assert.equal(new Set(counts).size, 3, `size ${size} rings should differ, got ${counts}`);
    }
});

test('the bloom taps scale with the size, and a huge one is caught instead', () =>
{
    const taps = (size)=> rings(postProcessBloomShader(.6, 1, size)).reduce((a, r)=> a + r[0], 0);
    assert.ok(taps(4) < taps(8) && taps(8) < taps(16), 'a wider glow needs more taps to stay smooth');
    assert.ok(taps(6) < 40, 'the default size stays cheap, got ' + taps(6));
    assert.throws(()=> postProcessBloomShader(.6, 1, 200)); // hundreds of samples a pixel
});

test('the bloom shader is built from its settings', () =>
{
    const shader = postProcessBloomShader(.25, 3, 8);
    assert.ok(shader.includes('- 0.2500'), 'the threshold is subtracted from each tap');
    const taps = rings(shader).reduce((a, r)=> a + r[0], 0);
    assert.ok(shader.includes((3 / taps).toFixed(6)), 'the glow is the mean of the taps times the strength');
    assert.throws(()=> postProcessBloomShader(.6, 1, 0));
    assert.throws(()=> postProcessBloomShader(.6, 1, NaN));
});
