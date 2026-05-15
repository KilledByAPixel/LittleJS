import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noise1D, noise2D } from '../dist/littlejs.esm.js';

const inRange = v => v >= 0 && v <= 1;

test('noise1D returns values in [0, 1]', () =>
{
    for (let i = 0; i < 100; ++i)
    {
        const x = (i - 50) * 0.37;
        assert.equal(inRange(noise1D(x)), true, `noise1D(${x}) = ${noise1D(x)}`);
    }
});

test('noise1D is deterministic and continuous', () =>
{
    // same input -> same output
    assert.equal(noise1D(3.14), noise1D(3.14));
    assert.equal(noise1D(0), noise1D(0));

    // tiny step should produce a tiny change (continuity check)
    const a = noise1D(2.5);
    const b = noise1D(2.5 + 1e-6);
    assert.ok(Math.abs(a - b) < 1e-3, `expected continuity, got ${a} vs ${b}`);
});

test('noise2D returns values in [0, 1]', () =>
{
    for (let i = 0; i < 20; ++i)
    for (let j = 0; j < 20; ++j)
    {
        const x = (i - 10) * 0.31, y = (j - 10) * 0.29;
        assert.equal(inRange(noise2D(x, y)), true, `noise2D(${x},${y}) = ${noise2D(x, y)}`);
    }
});

test('noise2D is deterministic', () =>
{
    assert.equal(noise2D(1.5, 2.5), noise2D(1.5, 2.5));
    assert.equal(noise2D(0, 0), noise2D(0, 0));
});

test('noise2D rows are decorrelated', () =>
{
    // same x, different y rows should not produce identical sequences
    const rowA = [0, 1, 2, 3].map(x => noise2D(x, 0));
    const rowB = [0, 1, 2, 3].map(x => noise2D(x, 1));
    assert.notDeepEqual(rowA, rowB);
});
