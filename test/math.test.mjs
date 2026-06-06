import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PI, clamp, percent, percentLerp, lerp, mod, smoothStep, nearestPowerOfTwo, oscillate,
    distanceWrap, lerpWrap, distanceAngle, lerpAngle,
    isOverlapping, isIntersecting, lineTest,
    vec2, Vector2, rgb, hsl, Color,
    RandomGenerator,
    rand, randInt, randBool, randSign, randVec2, randInCircle, randColor,
} from '../dist/littlejs.esm.js';

// small tolerance for floating point comparisons
const EPS = 1e-9;
const near = (a, b, eps=EPS) => Math.abs(a - b) <= eps;

test('clamp', () =>
{
    assert.equal(clamp(0.5), 0.5);
    assert.equal(clamp(-1), 0);
    assert.equal(clamp(2), 1);
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
});

test('percent', () =>
{
    assert.equal(percent(5, 0, 10), 0.5);
    assert.equal(percent(0, 0, 10), 0);
    assert.equal(percent(10, 0, 10), 1);
    assert.equal(percent(-5, 0, 10), 0); // clamped
    assert.equal(percent(15, 0, 10), 1); // clamped
    assert.equal(percent(5, 5, 5), 0);   // division by zero guard
});

test('lerp', () =>
{
    assert.equal(lerp(0, 10, 0), 0);
    assert.equal(lerp(0, 10, 1), 10);
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(lerp(0, 10, -1), 0);    // percent clamped
    assert.equal(lerp(0, 10, 2), 10);    // percent clamped
});

test('percentLerp', () =>
{
    // equivalent to lerp(lerpA, lerpB, percent(value, percentA, percentB))
    assert.equal(percentLerp(0, 0, 10, 100, 200), 100);   // at percentA
    assert.equal(percentLerp(10, 0, 10, 100, 200), 200);  // at percentB
    assert.equal(percentLerp(5, 0, 10, 100, 200), 150);   // midpoint
    assert.equal(percentLerp(-5, 0, 10, 100, 200), 100);  // below range, clamped
    assert.equal(percentLerp(99, 0, 10, 100, 200), 200);  // above range, clamped
});

test('mod', () =>
{
    assert.equal(mod(5, 3), 2);
    assert.equal(mod(-1, 3), 2);        // negative handled
    assert.equal(mod(-4, 3), 2);
    assert.equal(mod(0, 3), 0);
    assert.equal(mod(0.5), 0.5);         // default divisor = 1
});

test('smoothStep', () =>
{
    assert.equal(smoothStep(0), 0);
    assert.equal(smoothStep(1), 1);
    assert.equal(smoothStep(0.5), 0.5);
    assert(smoothStep(0.25) < 0.25);     // slower start
    assert(smoothStep(0.75) > 0.75);     // faster end (relative to linear)
});

test('nearestPowerOfTwo', () =>
{
    assert.equal(nearestPowerOfTwo(1), 1);
    assert.equal(nearestPowerOfTwo(3), 4);
    assert.equal(nearestPowerOfTwo(100), 128);
    assert.equal(nearestPowerOfTwo(16), 16);
});

test('distanceWrap / lerpWrap', () =>
{
    assert(near(distanceWrap(0.1, 0.9), 0.2));    // shortest path wraps forward
    assert(near(distanceWrap(0.9, 0.1), -0.2));
    assert(near(distanceWrap(0, 0), 0));
    // lerpWrap returns the un-wrapped interpolated value: 0.9 + 0.5*0.2 = 1.0
    // (1.0 is equivalent to 0 modulo wrapSize — caller can re-wrap if needed)
    assert(near(lerpWrap(0.9, 0.1, 0.5), 1.0));
});

test('distanceAngle / lerpAngle', () =>
{
    assert(near(distanceAngle(0, 2*PI), 0));        // same direction after wrap
    assert(near(distanceAngle(0.1, -0.1), 0.2));
    // lerpAngle picks shortest path but returns un-wrapped value.
    // from -PI+0.1 to PI-0.1: shortest path is backward (through -PI), distance = -0.2
    // so result = (-PI+0.1) + 0.5*(-0.2) = -PI
    assert(near(lerpAngle(-PI+0.1, PI-0.1, 0.5), -PI, 1e-6));
});

test('isOverlapping AABB', () =>
{
    // two unit boxes centered at origin overlap
    assert.equal(isOverlapping(vec2(0, 0), vec2(1, 1), vec2(0, 0), vec2(1, 1)), true);
    // adjacent boxes do NOT overlap (edge case, uses strict inequality on one side)
    assert.equal(isOverlapping(vec2(0, 0), vec2(1, 1), vec2(2, 0), vec2(1, 1)), false);
    // partial overlap
    assert.equal(isOverlapping(vec2(0, 0), vec2(2, 2), vec2(1, 1), vec2(2, 2)), true);
    // far apart
    assert.equal(isOverlapping(vec2(0, 0), vec2(1, 1), vec2(10, 10), vec2(1, 1)), false);
});

test('isIntersecting line-vs-AABB', () =>
{
    // line passes through box
    assert.equal(isIntersecting(vec2(-5, 0), vec2(5, 0), vec2(0, 0), vec2(2, 2)), true);
    // line misses box
    assert.equal(isIntersecting(vec2(-5, 10), vec2(5, 10), vec2(0, 0), vec2(2, 2)), false);
    // line starts inside
    assert.equal(isIntersecting(vec2(0, 0), vec2(10, 0), vec2(0, 0), vec2(2, 2)), true);
});

///////////////////////////////////////////////////////////////////////////////
// lineTest (grid-DDA raycast)

test('lineTest returns undefined when nothing hits', () =>
{
    const hit = lineTest(vec2(0.5, 0.5), vec2(10.5, 0.5), () => false);
    assert.equal(hit, undefined);
});

test('lineTest returns undefined for zero-length line', () =>
{
    // early return: totalLength is 0
    const hit = lineTest(vec2(5, 5), vec2(5, 5), () => true);
    assert.equal(hit, undefined);
});

test('lineTest finds first hit along horizontal ray', () =>
{
    // ray across cells (0,0) -> (10,0) at y=0.5, predicate hits at x=3
    const hit = lineTest(vec2(0.5, 0.5), vec2(10.5, 0.5), pos => pos.x === 3);
    assert(hit !== undefined);
    assert.equal(Math.floor(hit.x), 3);              // hit is inside cell 3
    assert.equal(Math.floor(hit.y), 0);
});

test('lineTest stops at the first hit, not a later one', () =>
{
    const visited = [];
    const hit = lineTest(vec2(0.5, 0.5), vec2(10.5, 0.5), pos =>
    {
        visited.push(pos.x);
        return pos.x === 2 || pos.x === 5;
    });
    assert(hit !== undefined);
    assert.equal(Math.floor(hit.x), 2);              // earlier hit wins
    // ray never advances past cell 2, and stops *on* cell 2 (not just never-visits-5)
    assert(!visited.some(x => x > 2));
    assert.equal(visited.at(-1), 2);
});

test('lineTest writes normal for horizontal hit', () =>
{
    // ray moves +x, hits on the left face of the hit cell -> normal (-1, 0)
    const normal = vec2();
    const hit = lineTest(vec2(0.5, 0.5), vec2(10.5, 0.5), pos => pos.x === 3, normal);
    assert(hit !== undefined);
    assert.equal(normal.x, -1);
    assert.equal(normal.y, 0);
});

test('lineTest writes normal for vertical hit (downward ray)', () =>
{
    // ray moves -y, last step was in y, stepY = -1 -> normal (0, -stepY) = (0, 1)
    const normal = vec2();
    const hit = lineTest(vec2(0.5, 0.5), vec2(0.5, -10.5), pos => pos.y === -3, normal);
    assert(hit !== undefined);
    assert.equal(Math.floor(hit.y), -3);
    assert.equal(normal.x, 0);
    assert.equal(normal.y, 1);
});

test('lineTest returns immediately if start cell hits', () =>
{
    let calls = 0;
    const hit = lineTest(vec2(2.5, 2.5), vec2(10, 10), pos =>
    {
        calls++;
        return pos.x === 2 && pos.y === 2;
    });
    assert(hit !== undefined);
    assert.equal(calls, 1);                          // only checked the start cell
    assert.equal(Math.floor(hit.x), 2);
    assert.equal(Math.floor(hit.y), 2);
});

test('vec2 constructor and factory', () =>
{
    let v = vec2();
    assert.equal(v.x, 0); assert.equal(v.y, 0);
    v = vec2(5);
    assert.equal(v.x, 5); assert.equal(v.y, 5);   // single arg copies x to y
    v = vec2(3, 4);
    assert.equal(v.x, 3); assert.equal(v.y, 4);
    v = new Vector2();
    assert.equal(v.x, 0); assert.equal(v.y, 0);
});

test('Vector2 arithmetic', () =>
{
    const a = vec2(2, 3);
    const b = vec2(4, 5);
    assert.deepEqual({ x: a.add(b).x, y: a.add(b).y }, { x: 6, y: 8 });
    assert.deepEqual({ x: a.subtract(b).x, y: a.subtract(b).y }, { x: -2, y: -2 });
    assert.deepEqual({ x: a.multiply(b).x, y: a.multiply(b).y }, { x: 8, y: 15 });
    assert.deepEqual({ x: a.scale(3).x, y: a.scale(3).y }, { x: 6, y: 9 });
    // immutability: a should be unchanged
    assert.equal(a.x, 2); assert.equal(a.y, 3);
});

test('Vector2 length / distance / dot / cross', () =>
{
    const v = vec2(3, 4);
    assert.equal(v.length(), 5);
    assert.equal(v.lengthSquared(), 25);
    assert.equal(v.distance(vec2(0, 0)), 5);
    assert.equal(v.distanceSquared(vec2(0, 0)), 25);
    assert.equal(vec2(1, 0).dot(vec2(1, 0)), 1);
    assert.equal(vec2(1, 0).dot(vec2(0, 1)), 0);
    assert.equal(vec2(1, 0).cross(vec2(0, 1)), 1);
});

test('Vector2 normalize', () =>
{
    const n = vec2(3, 4).normalize();
    assert(near(n.length(), 1));
    const scaled = vec2(3, 4).normalize(10);
    assert(near(scaled.length(), 10));
    // zero vector returns (0, length) — the up-direction at requested length.
    // Pin both components, not just length (which would pass for any unit vector).
    const zero = vec2(0, 0).normalize();
    assert.equal(zero.x, 0); assert.equal(zero.y, 1);
    const zero5 = vec2(0, 0).normalize(5);
    assert.equal(zero5.x, 0); assert.equal(zero5.y, 5);
});

test('Vector2 angle conventions (up = 0)', () =>
{
    // angle() returns atan2(x, y), so up (+y) is 0
    assert(near(vec2(0, 1).angle(), 0));
    assert(near(vec2(1, 0).angle(), PI/2));
    // setAngle: x = length*sin(angle), y = length*cos(angle)
    const v = new Vector2().setAngle(0, 5);
    assert(near(v.x, 0)); assert(near(v.y, 5));
    const w = new Vector2().setAngle(PI/2, 3);
    assert(near(w.x, 3)); assert(near(w.y, 0));
});

test('Vector2 rotate preserves length', () =>
{
    const v = vec2(1, 0);
    const r = v.rotate(PI/2);
    assert(near(r.length(), 1));
    // rotate by 2pi returns roughly the original
    const full = v.rotate(2*PI);
    assert(near(full.x, 1)); assert(near(full.y, 0));
});

test('Vector2 floor / abs / mod / area', () =>
{
    assert.equal(vec2(1.7, -2.3).floor().x, 1);
    assert.equal(vec2(1.7, -2.3).floor().y, -3);
    assert.equal(vec2(-1.5, 2.5).abs().x, 1.5);
    assert.equal(vec2(-1.5, 2.5).abs().y, 2.5);
    const m = vec2(5.5, -0.5).mod(1);
    assert(near(m.x, 0.5));
    assert(near(m.y, 0.5));
    assert.equal(vec2(3, 4).area(), 12);
});

test('Vector2 lerp', () =>
{
    const r = vec2(0, 0).lerp(vec2(10, 20), 0.5);
    assert.equal(r.x, 5); assert.equal(r.y, 10);
    const zero = vec2(0, 0).lerp(vec2(10, 20), 0);
    assert.equal(zero.x, 0); assert.equal(zero.y, 0);
});

test('Color factory + defaults', () =>
{
    const w = rgb();
    assert.equal(w.r, 1); assert.equal(w.g, 1); assert.equal(w.b, 1); assert.equal(w.a, 1);
    const red = rgb(1, 0, 0);
    assert.equal(red.r, 1); assert.equal(red.g, 0); assert.equal(red.b, 0); assert.equal(red.a, 1);
});

test('Color arithmetic', () =>
{
    const a = new Color(0.5, 0.5, 0.5, 1);
    const b = new Color(0.25, 0.25, 0.25, 0);
    const sum = a.add(b);
    assert.equal(sum.r, 0.75);
    assert.equal(sum.a, 1);
    const scaled = a.scale(2);
    assert.equal(scaled.r, 1);
    assert.equal(scaled.a, 2);        // alpha also scaled
    const scaled2 = a.scale(2, 0.5);
    assert.equal(scaled2.r, 1);
    assert.equal(scaled2.a, 0.5);     // alpha scaled separately
});

test('Color lerp', () =>
{
    const a = new Color(0, 0, 0, 1);
    const b = new Color(1, 1, 1, 1);
    const mid = a.lerp(b, 0.5);
    assert.equal(mid.r, 0.5); assert.equal(mid.g, 0.5); assert.equal(mid.b, 0.5);
});

test('Color hex round-trip', () =>
{
    const red = new Color().setHex('#ff0000');
    assert(near(red.r, 1)); assert(near(red.g, 0)); assert(near(red.b, 0));
    const short = new Color().setHex('#f00');
    assert(near(short.r, 1)); assert(near(short.g, 0)); assert(near(short.b, 0));
    // toString format is locked: lowercase hex, always 6 or 8 chars plus '#'.
    // If a future change switches to uppercase, update both the function and these tests.
    assert.equal(rgb(1, 0, 0).toString(false), '#ff0000');
    assert.equal(rgb(0, 0, 0).toString(false), '#000000');
});

test('Color rgb↔hsl round-trip', () =>
{
    const red = rgb(1, 0, 0);
    const [h, s, l, a] = red.HSLA();
    const back = hsl(h, s, l, a);
    assert(near(back.r, 1, 1e-6));
    assert(near(back.g, 0, 1e-6));
    assert(near(back.b, 0, 1e-6));
});

test('Color clamp', () =>
{
    const clamped = new Color(2, -1, 0.5, 1.5).clamp();
    assert.equal(clamped.r, 1);
    assert.equal(clamped.g, 0);
    assert.equal(clamped.b, 0.5);
    assert.equal(clamped.a, 1);
});

test('RandomGenerator determinism', () =>
{
    const r1 = new RandomGenerator(12345);
    const r2 = new RandomGenerator(12345);
    for (let i = 0; i < 10; i++)
        assert.equal(r1.float(), r2.float());

    // different seed => different sequence
    const r3 = new RandomGenerator(54321);
    const a = new RandomGenerator(12345).float();
    const b = r3.float();
    assert.notEqual(a, b);
});

test('RandomGenerator range bounds', () =>
{
    const r = new RandomGenerator(42);
    for (let i = 0; i < 100; i++)
    {
        const x = r.float();
        assert(x >= 0 && x < 1);
    }
    for (let i = 0; i < 100; i++)
    {
        const n = r.int(10);
        assert(n >= 0 && n < 10);
        assert.equal(Math.floor(n), n);
    }
});

test('rand / randInt bounds', () =>
{
    // rand() => [0, 1) — valueB(0) + Math.random()*(valueA(1)-valueB(0))
    for (let i = 0; i < 100; i++)
    {
        const x = rand();
        assert(x >= 0 && x < 1);
    }
    // rand(valueA, valueB) returns valueB + rand()*(valueA - valueB).
    // Inclusivity flips with arg order:
    //   rand(10, 5) = 5 + r*5    => [5, 10)  -- valueB inclusive, valueA exclusive
    //   rand(5, 10) = 10 + r*-5  => (5, 10]  -- valueA exclusive, valueB inclusive
    for (let i = 0; i < 100; i++)
    {
        const y = rand(10, 5);
        assert(y >= 5 && y < 10);
        const z = rand(5, 10);
        assert(z > 5 && z <= 10);
    }
    for (let i = 0; i < 100; i++)
    {
        const n = randInt(4);
        assert([0, 1, 2, 3].includes(n));
    }
});

test('randBool distribution', () =>
{
    let trues = 0;
    for (let i = 0; i < 200; i++)
        if (randBool()) trues++;
    // Fair coin: mean=100, stddev≈7.07 for Binomial(200, 0.5).
    // Window [60, 140] is ~5.6σ from the mean — false positive rate ~1e-8,
    // but will still catch a function that's meaningfully biased.
    assert(trues >= 60 && trues <= 140,
        `randBool produced ${trues}/200 trues — outside 60..140 window`);
    // chance=1 always true, chance=0 always false
    for (let i = 0; i < 20; i++)
    {
        assert.equal(randBool(1), true);
        assert.equal(randBool(0), false);
    }
});

test('randSign returns exactly -1 or 1', () =>
{
    const signs = new Set();
    for (let i = 0; i < 100; i++)
    {
        const s = randSign();
        assert(s === -1 || s === 1);
        signs.add(s);
    }
    assert.deepEqual([...signs].sort(), [-1, 1]);
});

test('randVec2 length', () =>
{
    // default length 1
    for (let i = 0; i < 50; i++)
        assert(near(randVec2().length(), 1, 1e-9));
    // custom length
    for (let i = 0; i < 50; i++)
        assert(near(randVec2(7).length(), 7, 1e-9));
});

test('randInCircle stays within radius', () =>
{
    for (let i = 0; i < 200; i++)
    {
        const v = randInCircle(3);
        assert(v.length() <= 3 + EPS);
    }
    // radius 0 returns origin
    const zero = randInCircle(0);
    assert.equal(zero.x, 0); assert.equal(zero.y, 0);
});

test('randColor returns a valid Color', () =>
{
    for (let i = 0; i < 20; i++)
    {
        const c = randColor();
        assert(c instanceof Color);
        assert(c.isValid());
    }
    // with explicit bounds, each channel stays between the two colors
    const a = rgb(0.2, 0.2, 0.2, 1);
    const b = rgb(0.8, 0.8, 0.8, 1);
    for (let i = 0; i < 50; i++)
    {
        const c = randColor(a, b);
        assert(c.r >= 0.2 && c.r <= 0.8);
        assert(c.g >= 0.2 && c.g <= 0.8);
        assert(c.b >= 0.2 && c.b <= 0.8);
    }
});

///////////////////////////////////////////////////////////////////////////////
// oscillate

test('oscillate sine (default)', () =>
{
    // sine: value = -cos(phase * 2pi), output = amp/2 * (value + 1) ∈ [0, amp]
    // phase=0 -> value=-1 -> 0
    // phase=0.5 -> value=1 -> amp
    // phase=0.25 -> value=0 -> amp/2
    assert(near(oscillate(1, 2, 0), 0));
    assert(near(oscillate(1, 2, 0.5), 2));
    assert(near(oscillate(1, 2, 0.25), 1));
    // must stay in [0, amplitude]
    for (let i = 0; i <= 20; i++)
    {
        const v = oscillate(1, 1, i/20);
        assert(v >= 0 - EPS && v <= 1 + EPS);
    }
});

test('oscillate triangle', () =>
{
    // triangle (type 1) at phase=0 -> peaks at amp; phase=0.5 -> 0
    assert(near(oscillate(1, 1, 0, 0, 1), 1));
    assert(near(oscillate(1, 1, 0.5, 0, 1), 0));
    // must stay in [0, amplitude]
    for (let i = 0; i <= 20; i++)
    {
        const v = oscillate(1, 1, i/20, 0, 1);
        assert(v >= 0 - EPS && v <= 1 + EPS);
    }
});

test('oscillate square', () =>
{
    // square (type 2): -1 for phase<0.5, +1 for phase>=0.5
    // so output 0 for phase<0.5, amp for phase>=0.5
    assert.equal(oscillate(1, 1, 0, 0, 2), 0);
    assert.equal(oscillate(1, 1, 0.25, 0, 2), 0);
    assert.equal(oscillate(1, 1, 0.5, 0, 2), 1);
    assert.equal(oscillate(1, 1, 0.9, 0, 2), 1);
});

test('oscillate sawtooth', () =>
{
    // sawtooth (type 3): value = 2*phase - 1, output = amp/2*(value+1) = amp*phase
    assert(near(oscillate(1, 1, 0, 0, 3), 0));
    assert(near(oscillate(1, 1, 0.5, 0, 3), 0.5));
    // phase wraps at 1, so exactly at phase=1 we get 0 again via mod
    assert(near(oscillate(1, 1, 1, 0, 3), 0));
});

///////////////////////////////////////////////////////////////////////////////
// Vector2 gaps

test('Vector2 copy / setFrom immutability', () =>
{
    const a = vec2(3, 4);
    const b = a.copy();
    b.x = 99;
    assert.equal(a.x, 3);                           // original untouched
    const c = new Vector2().setFrom(a);
    assert.equal(c.x, 3); assert.equal(c.y, 4);
});

test('Vector2 divide', () =>
{
    const r = vec2(6, 8).divide(vec2(2, 4));
    assert.equal(r.x, 3); assert.equal(r.y, 2);
});

test('Vector2 clampLength', () =>
{
    // already within limit: returns a copy at same length
    const a = vec2(3, 4).clampLength(10);
    assert.equal(a.x, 3); assert.equal(a.y, 4);
    // exceeds limit: scales down to limit
    const b = vec2(3, 4).clampLength(1);
    assert(near(b.length(), 1));
});

test('Vector2 reflect', () =>
{
    // (1, -1) hitting a floor (normal 0,1) should reflect to (1, 1)
    const r = vec2(1, -1).reflect(vec2(0, 1), 1);
    assert(near(r.x, 1)); assert(near(r.y, 1));
    // restitution 0.5 halves the bounce
    const half = vec2(0, -2).reflect(vec2(0, 1), 0.5);
    assert(near(half.y, 1));                        // -2 -> +1, not +2
    // restitution 0 absorbs the normal component
    const absorbed = vec2(1, -1).reflect(vec2(0, 1), 0);
    assert(near(absorbed.x, 1));
    assert(near(absorbed.y, 0));
});

test('Vector2 setDirection / direction (cardinal 0..3)', () =>
{
    // setDirection: 0=up(+y), 1=right(+x), 2=down(-y), 3=left(-x)
    const up = new Vector2().setDirection(0, 1);
    assert(near(up.x, 0)); assert(near(up.y, 1));
    const right = new Vector2().setDirection(1, 1);
    assert(near(right.x, 1)); assert(near(right.y, 0));
    const down = new Vector2().setDirection(2, 1);
    assert(near(down.x, 0)); assert(near(down.y, -1));
    const left = new Vector2().setDirection(3, 1);
    assert(near(left.x, -1)); assert(near(left.y, 0));
    // direction() is the inverse for clean cardinal vectors
    assert.equal(vec2(0, 1).direction(), 0);
    assert.equal(vec2(1, 0).direction(), 1);
    assert.equal(vec2(0, -1).direction(), 2);
    assert.equal(vec2(-1, 0).direction(), 3);
});

test('Vector2 snap', () =>
{
    // snap divides by the grid, floors, multiplies back
    // snap(2): bucket size 0.5 (1/2). 1.3 -> floor(1.3*2)/2 = floor(2.6)/2 = 2/2 = 1.0
    const r = vec2(1.3, 1.9).snap(2);
    assert(near(r.x, 1.0));
    assert(near(r.y, 1.5));
});

test('Vector2 arrayCheck (tile-grid bounds)', () =>
{
    const size = vec2(10, 5);
    assert.equal(vec2(0, 0).arrayCheck(size), true);
    assert.equal(vec2(9, 4).arrayCheck(size), true);
    assert.equal(vec2(10, 4).arrayCheck(size), false);    // x out (exclusive upper)
    assert.equal(vec2(9, 5).arrayCheck(size), false);     // y out (exclusive upper)
    assert.equal(vec2(-1, 0).arrayCheck(size), false);    // x negative
    assert.equal(vec2(0, -1).arrayCheck(size), false);    // y negative
});

test('Vector2 isValid', () =>
{
    assert.equal(vec2(0, 0).isValid(), true);
    assert.equal(vec2(-100, 3.14).isValid(), true);
    const bad = vec2(1, 2);
    bad.x = NaN;
    assert.equal(bad.isValid(), false);
    bad.x = 1; bad.y = NaN;
    assert.equal(bad.isValid(), false);
});

///////////////////////////////////////////////////////////////////////////////
// Color gaps

test('Color copy / setFrom / set', () =>
{
    const a = new Color(0.25, 0.5, 0.75, 0.5);
    const b = a.copy();
    b.r = 0;
    assert.equal(a.r, 0.25);                        // original untouched
    const c = new Color().setFrom(a);
    assert.equal(c.r, 0.25); assert.equal(c.a, 0.5);
    c.set(1, 0, 0, 1);
    assert.equal(c.r, 1); assert.equal(c.g, 0);
});

test('Color setAlpha mutates alpha and returns self', () =>
{
    const c = new Color(0.25, 0.5, 0.75, 1);
    const r = c.setAlpha(0.5);
    assert.equal(c.a, 0.5);                         // alpha changed in place
    assert.equal(c.r, 0.25); assert.equal(c.g, 0.5); assert.equal(c.b, 0.75); // rgb untouched
    assert.strictEqual(r, c);                       // returns self for chaining
    c.setAlpha();                                   // defaults to 1
    assert.equal(c.a, 1);
});

test('Color withAlpha returns a copy with new alpha', () =>
{
    const c = new Color(0.25, 0.5, 0.75, 1);
    const r = c.withAlpha(0.5);
    assert.equal(r.a, 0.5);                         // copy has the given alpha
    assert.equal(r.r, 0.25); assert.equal(r.g, 0.5); assert.equal(r.b, 0.75); // rgb copied
    assert.equal(c.a, 1);                           // original untouched
    assert.notStrictEqual(r, c);                    // returns a new color, not self
    assert.equal(new Color(1, 1, 1, 0.3).withAlpha().a, 1); // defaults to 1
});

test('Color divide', () =>
{
    const r = new Color(1, 0.5, 0.25, 1).divide(new Color(2, 1, 0.5, 1));
    assert.equal(r.r, 0.5); assert.equal(r.g, 0.5); assert.equal(r.b, 0.5); assert.equal(r.a, 1);
});

test('Color rgbaInt for simple cases', () =>
{
    // packed layout: R in lowest byte, then G, B, A
    assert.equal(rgb(0, 0, 0, 0).rgbaInt(), 0);
    assert.equal(rgb(1, 0, 0, 0).rgbaInt(), 255);
    assert.equal(rgb(0, 1, 0, 0).rgbaInt(), 255 << 8);
    assert.equal(rgb(0, 0, 1, 0).rgbaInt(), 255 << 16);
});

test('Color HSLA() at corner hues', () =>
{
    // pure primaries have saturation 1 and lightness 0.5
    const [hR, sR, lR] = rgb(1, 0, 0).HSLA();
    assert(near(hR, 0)); assert(near(sR, 1)); assert(near(lR, 0.5));
    const [hG, sG, lG] = rgb(0, 1, 0).HSLA();
    assert(near(hG, 1/3)); assert(near(sG, 1)); assert(near(lG, 0.5));
    const [hB, sB, lB] = rgb(0, 0, 1).HSLA();
    assert(near(hB, 2/3)); assert(near(sB, 1)); assert(near(lB, 0.5));
    // grayscale: saturation 0, hue irrelevant (reports 0)
    const [, sBlack, lBlack] = rgb(0, 0, 0).HSLA();
    assert.equal(sBlack, 0); assert.equal(lBlack, 0);
    const [, sWhite, lWhite] = rgb(1, 1, 1).HSLA();
    assert.equal(sWhite, 0); assert.equal(lWhite, 1);
});

test('Color isValid', () =>
{
    assert.equal(new Color(0.5, 0.5, 0.5, 1).isValid(), true);
    const bad = new Color(0, 0, 0, 1);
    bad.r = NaN;
    assert.equal(bad.isValid(), false);
});

test('Color mutate bounds', () =>
{
    // mutate uses Math.random directly so we can't seed it — test shape only.
    const base = rgb(0.5, 0.5, 0.5, 0.5);
    for (let i = 0; i < 50; i++)
    {
        const m = base.mutate(0.1, 0.05);
        // all channels stay in [0, 1] (mutate calls .clamp() at the end)
        assert(m.r >= 0 && m.r <= 1);
        assert(m.g >= 0 && m.g <= 1);
        assert(m.b >= 0 && m.b <= 1);
        assert(m.a >= 0 && m.a <= 1);
        // each channel is within `amount` of the base (before clamp, but base+amount stays in range here)
        assert(Math.abs(m.r - 0.5) <= 0.1 + EPS);
        assert(Math.abs(m.g - 0.5) <= 0.1 + EPS);
        assert(Math.abs(m.b - 0.5) <= 0.1 + EPS);
        assert(Math.abs(m.a - 0.5) <= 0.05 + EPS);
    }
    // alphaAmount defaults to 0: alpha unchanged
    const m = base.mutate(0.1);
    assert.equal(m.a, 0.5);
});

///////////////////////////////////////////////////////////////////////////////
// RandomGenerator methods

test('RandomGenerator bool / sign', () =>
{
    const r = new RandomGenerator(1);
    let trues = 0, signs = new Set();
    for (let i = 0; i < 100; i++)
    {
        if (r.bool()) trues++;
        signs.add(r.sign());
    }
    // chance=0.5 default — expect neither 0 nor 100 trues on 100 draws
    assert(trues > 20 && trues < 80);
    assert.deepEqual([...signs].sort(), [-1, 1]);
});

test('RandomGenerator floatSign range and sign', () =>
{
    const r = new RandomGenerator(5);
    const signs = new Set();
    for (let i = 0; i < 100; i++)
    {
        const v = r.floatSign(2, 1);
        // magnitude is in [1, 2), signed either way
        assert(Math.abs(v) >= 1 && Math.abs(v) < 2);
        signs.add(Math.sign(v));
    }
    assert.deepEqual([...signs].sort(), [-1, 1]);
});

test('RandomGenerator angle range', () =>
{
    const r = new RandomGenerator(7);
    for (let i = 0; i < 100; i++)
    {
        const a = r.angle();
        assert(a >= -PI && a < PI);
    }
});

test('RandomGenerator vec2', () =>
{
    const r = new RandomGenerator(9);
    const v = r.vec2(5);
    assert(v instanceof Vector2);
    assert(v.x >= 0 && v.x < 5);
    assert(v.y >= 0 && v.y < 5);
});

test('RandomGenerator randColor determinism', () =>
{
    const a = new RandomGenerator(123).randColor();
    const b = new RandomGenerator(123).randColor();
    assert.equal(a.r, b.r);
    assert.equal(a.g, b.g);
    assert.equal(a.b, b.b);
    assert.equal(a.a, b.a);
});

test('RandomGenerator mutateColor', () =>
{
    const base = rgb(0.5, 0.5, 0.5, 1);
    const r = new RandomGenerator(42);
    const m = r.mutateColor(base, 0.1, 0);
    // result clamped to [0,1] and each channel within amount of base (0.1)
    assert(m.r >= 0 && m.r <= 1);
    assert(m.g >= 0 && m.g <= 1);
    assert(m.b >= 0 && m.b <= 1);
    assert.equal(m.a, 1);                           // alphaAmount=0, so alpha unchanged
    assert(Math.abs(m.r - 0.5) <= 0.1 + EPS);
    assert(Math.abs(m.g - 0.5) <= 0.1 + EPS);
    assert(Math.abs(m.b - 0.5) <= 0.1 + EPS);
});
