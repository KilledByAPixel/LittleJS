/**
 * LittleJS Tween System Plugin
 * - Lightweight numeric tweens with chainable easing, looping, and ping-pong
 * - Property-path helper for the common case of animating an object field
 * - Auto-updates via engineAddPlugin; pauses with the game by default
 * @namespace TweenSystem
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// Module-private list of tweens currently running.
const tweenActive = [];

// Time tracking for delta computation between engine plugin calls.
let lastTime = 0;
let lastTimeReal = 0;

///////////////////////////////////////////////////////////////////////////////

/** A numeric tween. See class body for chaining + control methods.
 *  @memberof TweenSystem */
class Tween {}

/** Library of static easing curves and curve modifiers.
 *  All curves accept `x` in [0,1] and return [0,1] (with possible overshoot
 *  for ELASTIC/BACK/SPRING/BOUNCE).
 *  @memberof TweenSystem
 *  @example
 *  // Use a basic curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.SINE);
 *  // Use a modifier on a curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.OUT(Ease.BACK));
 */
class Ease {}

/** Linear (identity) curve.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.LINEAR = (x) => x;

/** Power curve factory: `Ease.POWER(n)` returns `x => x**n`.
 *  Use n=2 for quadratic, n=3 for cubic, etc.
 *  @param {number} n
 *  @returns {function(number):number}
 *  @memberof TweenSystem */
Ease.POWER = (n) => (x) => x ** n;

/** Sine ease-in curve: starts slow, ends fast.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.SINE = (x) => 1 - Math.cos(x * (Math.PI / 2));

/** Circular ease-in curve.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.CIRC = (x) => 1 - Math.sqrt(1 - x * x);

/** Exponential ease-in curve (`2^(10x-10)`).
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.EXPO = (x) => 2 ** (10 * x - 10);

/** Back ease-in: overshoots backward at the start before snapping forward.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.BACK = (x) => x * x * (2.70158 * x - 1.70158);

/** Elastic ease-in: oscillates with decreasing amplitude.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.ELASTIC = (x) =>
    -(2 ** (10 * x - 10)) * Math.sin(((37 - 40 * x) * Math.PI) / 6);

/** Spring-like ease-out: oscillates outward after passing the target.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.SPRING = (x) =>
    1 -
    (Math.sin(Math.PI * (1 - x) * (0.2 + 2.5 * (1 - x) ** 3)) *
        Math.pow(x, 2.2) +
        (1 - x)) *
        (1.0 + 1.2 * x);

/** Bouncing ease-out: bounces with decreasing height as it approaches 1.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.BOUNCE = (x) =>
{
    if (x < 4 / 11) return 7.5625 * x * x;
    if (x < 8 / 11) return 7.5625 * (x -= 6 / 11) * x + 0.75;
    if (x < 10 / 11) return 7.5625 * (x -= 9 / 11) * x + 0.9375;
    return 7.5625 * (x -= 10.5 / 11) * x + 0.984375;
};

/** Identity wrapper, included for symmetry with OUT and IN_OUT.
 *  @param {number} x
 *  @returns {number}
 *  @memberof TweenSystem */
Ease.IN = (x) => x;

/** Reverse a curve so it eases out instead of in: `x => 1 - f(1 - x)`.
 *  @param {function(number):number} f
 *  @returns {function(number):number}
 *  @memberof TweenSystem
 *  @example
 *  Ease.OUT(Ease.POWER(2)) // ease-out quadratic
 */
Ease.OUT = (f) => (x) => 1 - f(1 - x);

/** Combine the first half of `f` with `Ease.OUT(f)` for a symmetric curve.
 *  Bug-fix vs the original library: the original referenced an undefined
 *  global `Piecewise`; this implementation routes through `Ease.PIECEWISE`.
 *  @param {function(number):number} f
 *  @returns {function(number):number}
 *  @memberof TweenSystem */
Ease.IN_OUT = (f) => Ease.PIECEWISE(f, Ease.OUT(f));

/** Split [0,1] into N equal sections and run a different curve in each.
 *  Each curve is mapped to its section: section i runs over [i/n, (i+1)/n]
 *  and its output is mapped to [i/n, (i+1)/n] of the overall range.
 *  @param {...function(number):number} fns
 *  @returns {function(number):number}
 *  @memberof TweenSystem */
Ease.PIECEWISE = (...fns) =>
{
    const n = fns.length;
    return (x) =>
    {
        const i = (x * n - 1e-9) >> 0;
        return (fns[i]((x - i / n) * n) + i) / n;
    };
};

/** Cubic Bezier curve solver in the style of CSS `cubic-bezier`.
 *  Control points (0,0), (x1,y1), (x2,y2), (1,1).
 *  @param {number} x1
 *  @param {number} y1
 *  @param {number} x2
 *  @param {number} y2
 *  @returns {function(number):number}
 *  @memberof TweenSystem
 *  @example
 *  Ease.BEZIER(0.25, 0.1, 0.25, 1) // CSS "ease"
 */
Ease.BEZIER = (x1, y1, x2, y2) =>
{
    // Parametric cubic Bezier with implicit (0,0) and (1,1) endpoints.
    const curve = (t) =>
    {
        const u = 1 - t;
        const c1 = 3 * u * u * t;
        const c2 = 3 * u * t * t;
        const t3 = t ** 3;
        return [c1 * x1 + c2 * x2 + t3, c1 * y1 + c2 * y2 + t3];
    };
    return (x) =>
    {
        // Binary search for t such that curve(t).x ≈ x, then return curve(t).y.
        let t0 = 0, t1 = 1;
        for (let i = 0; i < 128; i++)
        {
            const tMid = (t0 + t1) / 2;
            const [bx, by] = curve(tMid);
            if (Math.abs(bx - x) < 1e-5) return by;
            if (bx < x) t0 = tMid; else t1 = tMid;
        }
        return curve((t0 + t1) / 2)[1];
    };
};

/** Tween a property on an object by dot-path.
 *  @memberof TweenSystem */
function tweenProperty() {}

/** Engine plugin hook: called every render frame to advance active tweens.
 *  @memberof TweenSystem */
function tweenUpdate() {}

// Register with the engine so tweens auto-advance.
engineAddPlugin(tweenUpdate);
