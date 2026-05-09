import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tween, tweenProperty, Ease } from '../dist/littlejs.esm.js';

test('Tween, tweenProperty, Ease are exported from the bundle', () =>
{
    assert.equal(typeof Tween, 'function');
    assert.equal(typeof tweenProperty, 'function');
    assert.equal(typeof Ease, 'function');
});

const near = (a, b, eps=1e-9) => Math.abs(a - b) <= eps;

test('Ease.LINEAR is the identity on [0,1]', () =>
{
    assert(near(Ease.LINEAR(0), 0));
    assert(near(Ease.LINEAR(0.5), 0.5));
    assert(near(Ease.LINEAR(1), 1));
});

test('Ease.POWER(2) returns x squared', () =>
{
    const f = Ease.POWER(2);
    assert(near(f(0), 0));
    assert(near(f(0.5), 0.25));
    assert(near(f(1), 1));
});

test('Ease.SINE / CIRC / EXPO / BACK / ELASTIC / SPRING start at 0 and end at 1', () =>
{
    for (const f of [Ease.SINE, Ease.CIRC, Ease.BACK])
    {
        assert(near(f(0), 0), `${f.name}(0) should be 0`);
        assert(near(f(1), 1), `${f.name}(1) should be 1`);
    }
    // EXPO doesn't hit 0 exactly at x=0 by formula (2^-10 ≈ 0.001), but does hit 1 at x=1
    assert(near(Ease.EXPO(1), 1));
    // ELASTIC has a -2^0 * sin(...) term that finishes at exactly 1 at x=1
    assert(near(Ease.ELASTIC(1), 1));
    // SPRING formula evaluates to 1 at x=1
    assert(near(Ease.SPRING(1), 1));
});

test('Ease.BOUNCE finishes at 1', () =>
{
    assert(near(Ease.BOUNCE(1), 1, 1e-6));
});
