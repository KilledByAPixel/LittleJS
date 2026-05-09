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

test('Ease.SINE / CIRC / BACK / SPRING anchor at both 0 and 1; EXPO and ELASTIC only at 1', () =>
{
    for (const f of [Ease.SINE, Ease.CIRC, Ease.BACK])
    {
        assert(near(f(0), 0), `${f.name}(0) should be 0`);
        assert(near(f(1), 1), `${f.name}(1) should be 1`);
    }
    // EXPO doesn't hit 0 exactly at x=0 by formula (2^-10 ≈ 0.001), but does hit 1 at x=1
    assert(near(Ease.EXPO(1), 1));
    // ELASTIC also doesn't start at 0 (formula gives -2^-10 * sin(37π/6) ≈ -0.0005),
    // but does finish at exactly 1 at x=1.
    assert(near(Ease.ELASTIC(1), 1));
    // SPRING formula evaluates to 1 at x=1
    assert(near(Ease.SPRING(1), 1));
});

test('Ease.BOUNCE finishes at 1', () =>
{
    assert(near(Ease.BOUNCE(1), 1, 1e-6));
});

test('Ease.IN is identity', () =>
{
    assert(near(Ease.IN(0), 0));
    assert(near(Ease.IN(0.5), 0.5));
    assert(near(Ease.IN(1), 1));
});

test('Ease.OUT(LINEAR) is identity', () =>
{
    const f = Ease.OUT(Ease.LINEAR);
    assert(near(f(0), 0));
    assert(near(f(0.5), 0.5));
    assert(near(f(1), 1));
});

test('Ease.OUT(POWER(2)) starts fast, ends slow', () =>
{
    const f = Ease.OUT(Ease.POWER(2));
    assert(near(f(0), 0));
    assert(near(f(1), 1));
    // f(x) = 1 - (1-x)^2; f(0.5) = 1 - 0.25 = 0.75
    assert(near(f(0.5), 0.75));
});

test('Ease.PIECEWISE splits range across the supplied curves', () =>
{
    // PIECEWISE(LINEAR, LINEAR) is equivalent to LINEAR
    const f = Ease.PIECEWISE(Ease.LINEAR, Ease.LINEAR);
    assert(near(f(0), 0));
    assert(near(f(0.25), 0.25));
    assert(near(f(0.5), 0.5));
    assert(near(f(0.75), 0.75));
    assert(near(f(0.9999), 0.9999, 1e-3));
});

test('Ease.IN_OUT(LINEAR) at 0.5 is 0.5 (regression: original referenced undefined Piecewise)', () =>
{
    const f = Ease.IN_OUT(Ease.LINEAR);
    assert(near(f(0), 0));
    assert(near(f(0.5), 0.5));
    assert(near(f(1), 1, 1e-3));
});

test('Ease.BOUNCE is easeOutBounce: peaks at 1 in the first half (matches JSDoc "ease-out")', () =>
{
    // First peak (impact) at x = 4/11 ≈ 0.36 — this is the easeOutBounce signature.
    // If someone refactors BOUNCE to easeInBounce by mistake (e.g., wrapping in Ease.OUT),
    // this test will catch it because easeInBounce stays near 0 until x ≈ 0.64.
    assert(near(Ease.BOUNCE(4/11), 1, 1e-9));
    // At x=0.5 (between first impact at 4/11 and second at 8/11) the value dips back to 0.75.
    // (easeInBounce would be at ~0.234 here.)
    assert(near(Ease.BOUNCE(0.5), 0.765625, 1e-9));
});
