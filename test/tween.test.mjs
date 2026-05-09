import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tween, tweenProperty, tweenStopAll, tweenUpdate, Ease, vec2, rgb, Vector2, Color } from '../dist/littlejs.esm.js';

test('Tween, tweenProperty, tweenStopAll, tweenUpdate, Ease are exported from the bundle', () =>
{
    assert.equal(typeof Tween, 'function');
    assert.equal(typeof tweenProperty, 'function');
    assert.equal(typeof tweenStopAll, 'function');
    assert.equal(typeof tweenUpdate, 'function');
    assert.equal(typeof Ease, 'object'); // namespace object, not a class
    assert.equal(typeof Ease.LINEAR, 'function');
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

test('Ease.IN is the identity transformer: returns the curve unchanged', () =>
{
    // Direction-modifier shape: takes a curve, returns a curve. Used for
    // programmatic direction picking, e.g. (bouncy ? Ease.OUT : Ease.IN)(curve).
    assert.equal(Ease.IN(Ease.SINE), Ease.SINE);
    assert.equal(Ease.IN(Ease.BACK), Ease.BACK);
    // The implementation is a true identity function, so passing a number
    // also returns it unchanged — meaning Ease.IN doubles as a linear curve.
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

test('Ease.BOUNCE is the ease-in form (slow ramp, bouncing impacts near the end)', () =>
{
    // Mirror of easeOutBounce: where easeOutBounce peaks at 1 at x = 4/11
    // (early), easeInBounce reaches 0 at x = 1 - 4/11 = 7/11 (late dip near
    // the start). This direction matches the other ease-in base curves.
    assert(near(Ease.BOUNCE(7/11), 0, 1e-9));
    // At x=0.5 the ease-in form is 1 - 0.765625 = 0.234375.
    assert(near(Ease.BOUNCE(0.5), 0.234375, 1e-9));
    // Endpoints
    assert(near(Ease.BOUNCE(0), 0, 1e-9));
    assert(near(Ease.BOUNCE(1), 1, 1e-9));
});

test('Ease.OUT(Ease.BOUNCE) is the canonical "ground impact" easeOutBounce', () =>
{
    const f = Ease.OUT(Ease.BOUNCE);
    // Now THIS is the form where the value peaks at 1 at x = 4/11 (early
    // bounce) — the shape users expect when they want a bouncing landing.
    assert(near(f(4/11), 1, 1e-9));
    assert(near(f(0.5), 0.765625, 1e-9));
});

test('Ease.BEZIER(0,0,1,1) is approximately linear', () =>
{
    const f = Ease.BEZIER(0, 0, 1, 1);
    assert(near(f(0), 0, 1e-3));
    assert(near(f(0.25), 0.25, 1e-3));
    assert(near(f(0.5), 0.5, 1e-3));
    assert(near(f(0.75), 0.75, 1e-3));
    assert(near(f(1), 1, 1e-3));
});

test('Ease.BEZIER endpoints are (0,0) and (1,1) for symmetric ease-in-out', () =>
{
    // ease-in-out style control points
    const f = Ease.BEZIER(0.42, 0, 0.58, 1);
    assert(near(f(0), 0, 1e-3));
    assert(near(f(1), 1, 1e-3));
    // crosses 0.5 at x=0.5 due to symmetry
    assert(near(f(0.5), 0.5, 1e-2));
});

test('Tween constructor calls callback once with the start value', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 5, 10, 1);
    assert.deepEqual(calls, [5]);
    t.stop(); // cleanup
});

test('Tween constructor stores duration, ease, useRealTime, paused options', () =>
{
    const t = new Tween(() => {}, 0, 1, 2, { ease: Ease.SINE, useRealTime: true, paused: true });
    assert.equal(t.duration, 2);
    assert.equal(t.life, 2);
    assert.equal(t.ease, Ease.SINE);
    assert.equal(t.useRealTime, true);
    assert.equal(t.paused, true);
    t.stop();
});

test('Tween defaults: start=0 end=1 duration=1 ease=LINEAR useRealTime=false paused=false', () =>
{
    const t = new Tween(() => {});
    assert.equal(t.start, 0);
    assert.equal(t.end, 1);
    assert.equal(t.duration, 1);
    assert.equal(t.ease, Ease.LINEAR);
    assert.equal(t.useRealTime, false);
    assert.equal(t.paused, false);
    t.stop();
});

test('Tween.setEase returns this and updates ease', () =>
{
    const t = new Tween(() => {});
    const ret = t.setEase(Ease.SINE);
    assert.equal(ret, t);
    assert.equal(t.ease, Ease.SINE);
    t.stop();
});

test('Tween advances toward end as tweenUpdate is called', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1); // 1 second, 0 → 10
    // constructor pushed start
    assert.deepEqual(calls, [0]);
    tweenUpdate(0.5); // halfway
    assert.equal(calls.length, 2);
    assert(near(calls[1], 5));
    t.stop();
});

test('Tween completes after duration seconds and fires the end value', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1);
    tweenUpdate(1.0); // exactly one duration
    // expect [start=0, end=10] — final callback fires with the end value
    assert.deepEqual(calls, [0, 10]);
});

test('Tween.then(fn) fires once at completion', () =>
{
    let thenCalls = 0;
    const t = new Tween(() => {}, 0, 1, 1).then(() => thenCalls++);
    tweenUpdate(1.0);
    assert.equal(thenCalls, 1);
    // a second update must not re-fire it (tween is removed from active list)
    tweenUpdate(1.0);
    assert.equal(thenCalls, 1);
});

test('Tween.then returns this for chaining', () =>
{
    const t = new Tween(() => {});
    assert.equal(t.then(() => {}), t);
    t.stop();
});

test('Tween that overshoots its remaining life still fires end value once', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1);
    tweenUpdate(5.0); // way past duration
    assert.deepEqual(calls, [0, 10]);
});

test('useRealTime: true tween advances on realDelta even when gameDelta is 0', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1, { useRealTime: true });
    tweenUpdate(0, 1.0); // game frozen, real time advances 1s
    assert.deepEqual(calls, [0, 10]);
});

test('Default tween (game time) does not advance when gameDelta is 0', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1);
    tweenUpdate(0, 1.0); // game frozen, only real advances; default tween ignores realDelta
    assert.deepEqual(calls, [0]);
    t.stop();
});

test('Multiple tweens complete in a single tweenUpdate without skipping', () =>
{
    const aCalls = [];
    const bCalls = [];
    let aThen = 0;
    let bThen = 0;
    new Tween((v) => aCalls.push(v), 0, 10, 1).then(() => aThen++);
    new Tween((v) => bCalls.push(v), 0, 20, 1).then(() => bThen++);
    tweenUpdate(1.0); // both should finish
    assert.deepEqual(aCalls, [0, 10]);
    assert.deepEqual(bCalls, [0, 20]);
    assert.equal(aThen, 1);
    assert.equal(bThen, 1);
});

test('tweenUpdate skips a tween whose paused field is true', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1, { paused: true });
    tweenUpdate(2.0);
    assert.deepEqual(calls, [0]); // only the constructor start snap
    t.stop();
});

test('Tween.pause prevents advancement', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1);
    t.pause();
    tweenUpdate(0.5);
    assert.deepEqual(calls, [0]); // no advance
    t.stop();
});

test('Tween.resume re-enables advancement', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1, { paused: true });
    tweenUpdate(0.5); // paused, no advance
    assert.deepEqual(calls, [0]);
    t.resume();
    tweenUpdate(0.5);
    assert.equal(calls.length, 2);
    assert(near(calls[1], 5));
    t.stop();
});

test('Tween.stop prevents the then-callback from firing', () =>
{
    let thenCalls = 0;
    const t = new Tween(() => {}, 0, 1, 1).then(() => thenCalls++);
    t.stop();
    tweenUpdate(2.0);
    assert.equal(thenCalls, 0);
});

test('Tween.restart resets life, clears pause, re-snaps to start', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1);
    tweenUpdate(0.6); // partway: calls = [0, 6]
    t.pause();
    t.restart();
    assert.equal(t.life, 1);
    assert.equal(t.paused, false);
    // restart fires callback with start again
    assert.equal(calls[calls.length - 1], 0);
    t.stop();
});

test('Tween.restart re-adds a stopped tween to the active list', () =>
{
    const calls = [];
    const t = new Tween((v) => calls.push(v), 0, 10, 1);
    t.stop();
    assert.equal(t.isActive(), false);
    t.restart();
    assert.equal(t.isActive(), true);
    t.stop();
});

test('Tween.isActive reflects active list + pause', () =>
{
    const t = new Tween(() => {}, 0, 1, 1);
    assert.equal(t.isActive(), true);
    t.pause();
    assert.equal(t.isActive(), false);
    t.resume();
    assert.equal(t.isActive(), true);
    t.stop();
    assert.equal(t.isActive(), false);
});

test('Tween.loop(3) runs 3 total iterations', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1).loop(3);
    // iteration 1: constructor pushes 0; tweenUpdate(1.0) pushes 10
    tweenUpdate(1.0);
    // then-callback fires, creates iteration 2; that constructor pushes 0
    // iteration 2: tweenUpdate below pushes 10, etc
    tweenUpdate(1.0);
    tweenUpdate(1.0);
    // 3 iterations × 2 callback fires (start, end) each = 6 calls
    assert.deepEqual(calls, [0, 10, 0, 10, 0, 10]);
});

test('Tween.loop(1) is the same as no loop (chain ends after first iteration)', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1).loop(1);
    tweenUpdate(1.0);
    tweenUpdate(1.0); // no second iteration scheduled
    assert.deepEqual(calls, [0, 10]);
});

test('Tween.loop returns this for chaining', () =>
{
    const t = new Tween(() => {});
    assert.equal(t.loop(2), t);
    t.stop();
});

test('Calling Tween.then after Tween.loop overrides the loop (last call wins)', () =>
{
    let thenCalls = 0;
    const calls = [];
    new Tween((v) => { calls.push(v); }, 0, 10, 1)
        .loop(5)
        .then(() => thenCalls++);
    tweenUpdate(1.0); // iteration 1 ends; then() fires its callback; loop chain is replaced
    assert.equal(thenCalls, 1);
    tweenUpdate(1.0); // no further iterations
    assert.deepEqual(calls, [0, 10]);
});

test('Tween.pingPong(3) swaps start/end between iterations', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1).pingPong(3);
    tweenUpdate(1.0); // iter 1 (0→10) completes; iter 2 (10→0) starts (snaps to 10)
    tweenUpdate(1.0); // iter 2 completes (→0); iter 3 (0→10) starts (snaps to 0)
    tweenUpdate(1.0); // iter 3 completes (→10); chain ends
    assert.deepEqual(calls, [0, 10, 10, 0, 0, 10]);
});

test('Tween.pingPong returns this for chaining', () =>
{
    const t = new Tween(() => {});
    assert.equal(t.pingPong(2), t);
    t.stop();
});

test('Tween.pingPong(1) ends after one iteration', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), 0, 10, 1).pingPong(1);
    tweenUpdate(1.0);
    tweenUpdate(1.0);
    assert.deepEqual(calls, [0, 10]);
});

test('tweenProperty drives a flat property by name', () =>
{
    const obj = { x: 0 };
    const t = tweenProperty(obj, 'x', 0, 10, 1);
    assert.equal(obj.x, 0); // constructor snaps to start
    tweenUpdate(0.5);
    assert(near(obj.x, 5));
    tweenUpdate(0.5);
    assert(near(obj.x, 10));
});

test('tweenProperty walks dot paths into nested objects', () =>
{
    const obj = { pos: { x: 0, y: 0 } };
    tweenProperty(obj, 'pos.x', 0, 10, 1);
    assert.equal(obj.pos.x, 0);
    assert.equal(obj.pos.y, 0); // unaffected
    tweenUpdate(1.0);
    assert(near(obj.pos.x, 10));
    assert.equal(obj.pos.y, 0);
});

test('tweenProperty returns the underlying Tween for chaining', () =>
{
    const obj = { x: 0 };
    const t = tweenProperty(obj, 'x', 0, 10, 1);
    assert(t instanceof Tween);
    // chain methods work
    assert.equal(t.setEase(Ease.SINE), t);
    t.stop();
});

test('tweenProperty supports options like useRealTime', () =>
{
    const obj = { x: 0 };
    const t = tweenProperty(obj, 'x', 0, 10, 1, { useRealTime: true });
    assert.equal(t.useRealTime, true);
    tweenUpdate(0, 1.0); // game frozen, real advances
    assert(near(obj.x, 10));
});

test('integration: chain setEase + then + tweenProperty + useRealTime', () =>
{
    const obj = { value: 0 };
    let chainFinished = false;

    tweenProperty(obj, 'value', 0, 100, 2, { useRealTime: true })
        .setEase(Ease.OUT(Ease.POWER(2)))
        .then(() => { chainFinished = true; });

    assert.equal(obj.value, 0);
    tweenUpdate(0, 1.0); // half duration on real time
    assert(obj.value > 0 && obj.value < 100, 'value should be partway');
    tweenUpdate(0, 1.0); // finish
    assert(near(obj.value, 100));
    assert.equal(chainFinished, true);
});

test('Tween.getPercent: 0 at start, 0.5 at midpoint, 1 at completion', () =>
{
    const t = new Tween(() => {}, 0, 10, 1);
    assert.equal(t.getPercent(), 0);
    tweenUpdate(0.5);
    assert(near(t.getPercent(), 0.5));
    tweenUpdate(0.5); // completes the tween
    assert.equal(t.getPercent(), 1);
});

test('Tween.getPercent clamps overshoot to 1', () =>
{
    const t = new Tween(() => {}, 0, 10, 1);
    tweenUpdate(5.0); // overshoot
    assert.equal(t.getPercent(), 1);
});

test('tweenStopAll stops every active tween and prevents then-callbacks from firing', () =>
{
    let cbCalls = 0;
    let thenCalls = 0;
    new Tween(() => cbCalls++, 0, 1, 1).then(() => thenCalls += 100);
    new Tween(() => cbCalls++, 0, 1, 1).then(() => thenCalls += 100);
    new Tween(() => cbCalls++, 0, 1, 1);
    // 3 callbacks fired from constructors snapping to start
    assert.equal(cbCalls, 3);
    tweenStopAll();
    tweenUpdate(2.0); // would normally complete every tween, but they're stopped
    assert.equal(cbCalls, 3); // no advancement — still just the snaps
    assert.equal(thenCalls, 0); // no then-callbacks fired
});

test('Tween accepts Vector2 start/end and interpolates each component', () =>
{
    const calls = [];
    new Tween((v) => calls.push(v), vec2(0, 0), vec2(10, 20), 1);
    // Constructor snap fires the start value
    assert.equal(calls.length, 1);
    assert(calls[0] instanceof Vector2);
    assert(near(calls[0].x, 0));
    assert(near(calls[0].y, 0));

    // Halfway: interpolated component-wise
    tweenUpdate(0.5);
    assert.equal(calls.length, 2);
    assert(near(calls[1].x, 5));
    assert(near(calls[1].y, 10));

    // Completion: end value fires once
    tweenUpdate(0.5);
    assert.equal(calls.length, 3);
    assert(near(calls[2].x, 10));
    assert(near(calls[2].y, 20));
});

test('Tween accepts Color start/end and interpolates each channel', () =>
{
    const calls = [];
    new Tween((c) => calls.push(c), rgb(0, 0, 0, 1), rgb(1, 1, 1, 0), 1);
    // Halfway should be (0.5, 0.5, 0.5, 0.5)
    tweenUpdate(0.5);
    const mid = calls[calls.length - 1];
    assert(mid instanceof Color);
    assert(near(mid.r, 0.5));
    assert(near(mid.g, 0.5));
    assert(near(mid.b, 0.5));
    assert(near(mid.a, 0.5));
});

test('tweenProperty walks dot-paths and assigns Vector2 values', () =>
{
    const obj = { pos: vec2(0, 0) };
    tweenProperty(obj, 'pos', vec2(0, 0), vec2(10, 20), 1);
    // Constructor snap: obj.pos is replaced with a fresh Vector2 equal to start
    assert(obj.pos instanceof Vector2);
    assert(near(obj.pos.x, 0));
    assert(near(obj.pos.y, 0));

    // Completion
    tweenUpdate(1.0);
    assert(near(obj.pos.x, 10));
    assert(near(obj.pos.y, 20));
});

test('Tween throws on type mismatch (Vector2 start, Color end)', () =>
{
    assert.throws(() => new Tween(() => {}, vec2(0, 0), rgb(1, 0, 0, 1), 1));
});

test('Tween.getValue returns the current interpolated value', () =>
{
    const t = new Tween(() => {}, 0, 100, 1);
    assert.equal(t.getValue(), 0); // at construction
    tweenUpdate(0.25);
    assert(near(t.getValue(), 25));
    tweenUpdate(0.25);
    assert(near(t.getValue(), 50));
    t.stop();
});

test('Tween.getValue returns a Vector2 for Vector2 tweens', () =>
{
    const t = new Tween(() => {}, vec2(0, 0), vec2(10, 20), 1);
    const v = t.getValue();
    assert(v instanceof Vector2);
    assert(near(v.x, 0));
    assert(near(v.y, 0));
    t.stop();
});
