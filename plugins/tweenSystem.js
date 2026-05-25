/**
 * LittleJS Tween System Plugin
 * - Lightweight tweens for numbers, Vector2, Color, or any .lerp-able type
 * - Chainable easing, looping, and ping-pong
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

// True if the value is an instance of a class that exposes a numeric-percent
// `lerp(other, percent)` method (Vector2, Color, or any future class).
function isLerpable(v) { return v && typeof v.lerp === 'function'; }

///////////////////////////////////////////////////////////////////////////////

/** A numeric tween: drives a callback with a value interpolated between
 *  `start` and `end` over `duration` seconds. Pauses with the game by default.
 *  @memberof TweenSystem
 *  @example
 *  // Animate a fade-out over 2 seconds with an ease-out sine curve.
 *  new Tween((v) => obj.alpha = v, 1, 0, 2, { ease: Ease.OUT(Ease.SINE) });
 */
class Tween
{
    /** Create a new tween. The callback fires immediately with `start` so the
     *  target snaps to the start value on the same frame the tween is created.
     *
     *  `start` and `end` may be numbers, Vector2 instances, Color instances, or
     *  any object exposing a `lerp(other, percent) => sameType` method. The
     *  callback receives the interpolated value (a number, or a fresh instance
     *  for lerp-able types). Both endpoints must be the same type.
     *  @param {function(number|Vector2|Color):void} callback - Called with the interpolated value each frame
     *  @param {number|Vector2|Color} [start=0] - Starting value
     *  @param {number|Vector2|Color} [end=1] - Ending value
     *  @param {number} [duration=1] - Duration in seconds
     *  @param {Object} [options]
     *  @param {function(number):number} [options.ease] - Easing function (defaults to LINEAR)
     *  @param {boolean} [options.useRealTime=false] - Advance even when the game is paused (matches Timer's useRealTime)
     *  @param {boolean} [options.paused=false] - Start in paused state */
    constructor(callback, start = 0, end = 1, duration = 1, options = {})
    {
        ASSERT(typeof callback === 'function', 'Tween callback must be a function');
        if (isLerpable(start))
        {
            ASSERT(start.constructor === end.constructor,
                'Tween start and end must be the same type');
        }
        else
        {
            ASSERT(isNumber(start), 'Tween start must be a number or have a .lerp method');
            ASSERT(isNumber(end),   'Tween end must be a number when start is a number');
        }
        ASSERT(isNumber(duration) && duration > 0, 'Tween duration must be > 0');

        /** @property {function(number|Vector2|Color):void} - Called with the interpolated value each frame */
        this.callback = callback;
        /** @property {number|Vector2|Color} - Starting value */
        this.start = start;
        /** @property {number|Vector2|Color} - Ending value */
        this.end = end;
        /** @property {number} - Total duration in seconds */
        this.duration = duration;
        /** @property {number} - Remaining time in seconds (counts down from duration to 0) */
        this.life = duration;
        /** @property {function(number):number} - Easing curve mapping [0,1] -> [0,1] */
        this.ease = options.ease || Ease.LINEAR;
        /** @property {boolean} - If true, advance even when the game is paused */
        this.useRealTime = !!options.useRealTime;
        /** @property {boolean} - If true, stop advancing until cleared */
        this.paused = !!options.paused;

        /** @private completion callback set by then(), loop(), pingPong(). */
        this.thenCallback = undefined;
        /** @private remaining iterations including the current run (loop/pingPong only). */
        this.loopRemaining = 0;

        tweenActive.push(this);
        // Snap target to start immediately.
        callback(this.interp(duration));
    }

    /** Set the easing curve and return this for chaining.
     *  @param {function(number):number} easeFn
     *  @returns {Tween}
     *  @memberof TweenSystem */
    setEase(easeFn)
    {
        this.ease = easeFn;
        return this;
    }

    /** Set a single completion callback. Calling `then` again replaces the
     *  previous callback. Returns this for chaining.
     *
     *  Calling `then` after `loop` or `pingPong` overrides the loop chain
     *  (last call wins).
     *  @param {function():void} callback
     *  @returns {Tween}
     *  @memberof TweenSystem */
    then(callback)
    {
        this.thenCallback = callback;
        this.loopRemaining = 0;
        return this;
    }

    /** Repeat this tween `n` total times. After each iteration finishes, a
     *  fresh tween with the same parameters takes over via the `then` slot.
     *  `loop()` with no argument loops forever.
     *
     *  Mutually exclusive with `pingPong`; calling either replaces the other,
     *  and calling `then` after either clears the loop (last call wins).
     *  @param {number} [count=Infinity]
     *  @returns {Tween}
     *  @memberof TweenSystem */
    loop(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => loopContinuation(this);
        return this;
    }

    /** Like `loop`, but swap `start` and `end` between iterations so the value
     *  bounces back and forth. `pingPong()` with no argument bounces forever.
     *
     *  Mutually exclusive with `loop`; calling either replaces the other, and
     *  calling `then` after either clears the loop (last call wins).
     *  @param {number} [count=Infinity]
     *  @returns {Tween}
     *  @memberof TweenSystem */
    pingPong(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => pingPongContinuation(this);
        return this;
    }

    /** Pause this tween. While paused, tweenUpdate skips it.
     *  @memberof TweenSystem */
    pause() { this.paused = true; }

    /** Resume a paused tween.
     *  @memberof TweenSystem */
    resume() { this.paused = false; }

    /** Reset this tween to the start: life back to duration, pause cleared,
     *  re-added to the active list if previously stopped, and the callback
     *  re-fired with the start value.
     *  @memberof TweenSystem */
    restart()
    {
        this.life = this.duration;
        this.paused = false;
        if (tweenActive.indexOf(this) < 0) tweenActive.push(this);
        this.callback(this.interp(this.duration));
    }

    /** True if this tween is in the active list and not paused.
     *  @returns {boolean}
     *  @memberof TweenSystem */
    isActive()
    {
        return !this.paused && tweenActive.indexOf(this) >= 0;
    }

    /** Get how far this tween has progressed, from 0 (just started) to 1
     *  (completed). Clamped — overshoot past completion still reads 1.
     *  @returns {number}
     *  @memberof TweenSystem */
    getPercent()
    {
        return percent(this.duration - this.life, 0, this.duration);
    }

    /** Get the current interpolated value (the value most recently passed to
     *  the callback). Returns a number, Vector2, or Color depending on the
     *  tween's start/end types.
     *  @returns {number|Vector2|Color}
     *  @memberof TweenSystem */
    getValue()
    {
        return this.interp(this.life);
    }

    /** Compute the interpolated value at the given remaining `life`.
     *  At life === duration the result is `start`; at life === 0 it is `end`.
     *  @param {number} life
     *  @returns {number}
     *  @memberof TweenSystem */
    interp(life)
    {
        const x = this.ease((this.duration - life) / this.duration);
        if (isLerpable(this.start))
            return this.start.lerp(this.end, x);
        return this.start + (this.end - this.start) * x;
    }

    /** Remove this tween from the active list and prevent any pending then-callback.
     *  @memberof TweenSystem */
    stop()
    {
        const i = tweenActive.indexOf(this);
        if (i >= 0) tweenActive.splice(i, 1);
        this.thenCallback = undefined;
    }
}

/** Library of named easing curves and direction modifiers.
 *  All curves accept `x` in [0,1] and return [0,1] (with possible overshoot
 *  for ELASTIC/BACK/SPRING/BOUNCE). Curves are values you pass to `setEase`
 *  or compose via the IN/OUT/IN_OUT/PIECEWISE/BEZIER modifiers.
 *  @memberof TweenSystem
 *  @example
 *  // Use a basic curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.SINE);
 *  // Use a modifier on a curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.OUT(Ease.BACK));
 */
const Ease =
{
    /** Linear (identity) curve.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    LINEAR: (x) => x,

    /** Power curve factory: `Ease.POWER(n)` returns `x => x**n`.
     *  Use n=2 for quadratic, n=3 for cubic, etc.
     *  @param {number} n
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    POWER: (n) => (x) => x ** n,

    /** Sine ease-in curve: starts slow, ends fast.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    SINE: (x) => 1 - cos(x * (PI / 2)),

    /** Circular ease-in curve.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    CIRC: (x) => 1 - (1 - x * x)**.5,

    /** Exponential ease-in curve (`2^(10x-10)`).
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    EXPO: (x) => x === 0 ? 0 : 2 ** (10 * x - 10),

    /** Back ease-in: overshoots backward at the start before snapping forward.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    BACK: (x) => x * x * (2.70158 * x - 1.70158),

    /** Elastic ease-in: oscillates with decreasing amplitude.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    ELASTIC: (x) =>
        x === 0 ? 0 :
        x === 1 ? 1 :
        -(2 ** (10 * x - 10)) * sin(((37 - 40 * x) * PI) / 6),

    /** Spring-like ease-out: oscillates outward after passing the target.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    SPRING: (x) =>
        1 -
        (sin(PI * (1 - x) * (0.2 + 2.5 * (1 - x) ** 3)) *
            x ** 2.2 +
            (1 - x)) *
            (1.0 + 1.2 * x),

    /** Bouncing ease-in: slow ramp with bouncing impacts near the end.
     *  Symmetric with the other base curves, which are all ease-in. To get the
     *  classic "object falls and hits the ground" shape (bounces near x=1),
     *  wrap with `Ease.OUT`: `Ease.OUT(Ease.BOUNCE)`.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.BOUNCE                  // ease-in bounce (slow, then bouncy at end)
     *  Ease.OUT(Ease.BOUNCE)        // ease-out bounce (object hits ground)
     *  Ease.IN_OUT(Ease.BOUNCE)     // bounces at both ends
     */
    BOUNCE: (x) =>
    {
        // Inverted form of the standard easeOutBounce: 1 - bounceOut(1 - x).
        let t = 1 - x, f;
        if (t < 4 / 11) f = 7.5625 * t * t;
        else if (t < 8 / 11) f = 7.5625 * (t -= 6 / 11) * t + 0.75;
        else if (t < 10 / 11) f = 7.5625 * (t -= 9 / 11) * t + 0.9375;
        else f = 7.5625 * (t -= 10.5 / 11) * t + 0.984375;
        return 1 - f;
    },

    /** Ease-in direction modifier: returns the curve unchanged. Symmetric
     *  with `OUT` and `IN_OUT`. Base curves are already ease-in by
     *  convention, so wrapping a curve in `IN` is a no-op — useful when
     *  picking the direction programmatically.
     *  @param {function(number):number} f - Curve to use as ease-in (returned unchanged)
     *  @returns {function(number):number}
     *  @memberof TweenSystem
     *  @example
     *  // Pick direction at runtime
     *  const dir = bouncyMode ? Ease.OUT : Ease.IN;
     *  new Tween(cb, 0, 10, 1).setEase(dir(Ease.BACK));
     */
    IN: (f) => f,

    /** Reverse a curve so it eases out instead of in: `x => 1 - f(1 - x)`.
     *  @param {function(number):number} f
     *  @returns {function(number):number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.OUT(Ease.POWER(2)) // ease-out quadratic
     */
    OUT: (f) => (x) => 1 - f(1 - x),

    /** Combine the first half of `f` with `Ease.OUT(f)` for a symmetric curve.
     *  Bug-fix vs the original library: the original referenced an undefined
     *  global `Piecewise`; this implementation routes through `Ease.PIECEWISE`.
     *  @param {function(number):number} f
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    IN_OUT: (f) => Ease.PIECEWISE(f, Ease.OUT(f)),

    /** Split [0,1] into N equal sections and run a different curve in each.
     *  Each curve is mapped to its section: section i runs over [i/n, (i+1)/n]
     *  and its output is mapped to [i/n, (i+1)/n] of the overall range.
     *  @param {...function(number):number} fns
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    PIECEWISE: (...fns) =>
    {
        const n = fns.length;
        return (x) =>
        {
            const i = (x * n - 1e-9) >> 0;
            return (fns[i]((x - i / n) * n) + i) / n;
        };
    },

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
    BEZIER: (x1, y1, x2, y2) =>
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
                if (abs(bx - x) < 1e-5) return by;
                if (bx < x) t0 = tMid; else t1 = tMid;
            }
            return curve((t0 + t1) / 2)[1];
        };
    },
};

/** Tween a property on an object by dot-path. Returns the underlying Tween
 *  so all chaining methods (`setEase`, `then`, `loop`, `pingPong`, etc.)
 *  remain available.
 *
 *  `start` and `end` may be numbers, Vector2 instances, Color instances, or
 *  any object with a `lerp(other, percent) => sameType` method.
 *  @param {Object} target - The object whose property is being animated
 *  @param {string} propertyPath - Dot-separated path, e.g. `'pos.x'` or `'color'`
 *  @param {number|Vector2|Color} start - Starting value
 *  @param {number|Vector2|Color} end - Ending value
 *  @param {number} [duration=1] - Duration in seconds
 *  @param {Object} [options] - Same options as the Tween constructor
 *  @returns {Tween}
 *  @memberof TweenSystem
 *  @example
 *  // Numeric: slide an object's x with an ease-out sine curve
 *  tweenProperty(player, 'pos.x', 0, 10, 2).setEase(Ease.OUT(Ease.SINE));
 *  // Vector2: animate a position diagonally
 *  tweenProperty(player, 'pos', vec2(-5, 0), vec2(5, 3), 2);
 *  // Color: pulse between two colors
 *  tweenProperty(sprite, 'color', RED, BLUE, 1).pingPong();
 */
function tweenProperty(target, propertyPath, start, end, duration = 1, options = {})
{
    ASSERT(target != null && typeof target === 'object', 'tweenProperty target must be an object');
    ASSERT(isStringLike(propertyPath) && propertyPath.length > 0, 'tweenProperty propertyPath must be a non-empty string');

    const parts = propertyPath.split('.');
    const lastKey = parts.pop();
    const callback = (value) =>
    {
        let obj = target;
        for (const k of parts) obj = obj[k];
        obj[lastKey] = value;
    };
    return new Tween(callback, start, end, duration, options);
}

// Continuation that schedules the next loop iteration when one finishes.
// Reuses the same Tween object across iterations so the user's handle
// from `.loop()` keeps working — calling `.stop()` mid-loop now cancels
// the entire chain instead of just the current iteration.
function loopContinuation(tween)
{
    if (tween.loopRemaining !== Infinity && tween.loopRemaining <= 1) return;
    if (tween.loopRemaining !== Infinity) tween.loopRemaining -= 1;
    tween.life = tween.duration;
    tween.thenCallback = () => loopContinuation(tween);
    tweenActive.push(tween);
    // snap to start for the new iteration (matches Tween constructor behavior)
    tween.callback(tween.interp(tween.duration));
}

// Continuation for pingPong: swaps start and end on the same tween each iteration.
function pingPongContinuation(tween)
{
    if (tween.loopRemaining !== Infinity && tween.loopRemaining <= 1) return;
    if (tween.loopRemaining !== Infinity) tween.loopRemaining -= 1;
    const tmp = tween.start;
    tween.start = tween.end;
    tween.end = tmp;
    tween.life = tween.duration;
    tween.thenCallback = () => pingPongContinuation(tween);
    tweenActive.push(tween);
    tween.callback(tween.interp(tween.duration));
}

/** Engine plugin hook: advance every active tween by the appropriate delta.
 *  Called once per render frame by the engine (no arguments). May also be
 *  called explicitly with `(gameDelta, realDelta)` to drive tweens manually
 *  — useful for headless tests or custom replay/scrubbing systems.
 *  @param {number} [gameDelta] - Game-time delta in seconds; default: time - lastTime
 *  @param {number} [realDelta] - Real-time delta in seconds; default: timeReal - lastTimeReal
 *  @memberof TweenSystem */
function tweenUpdate(gameDelta, realDelta)
{
    if (gameDelta === undefined)
    {
        // Engine path: compute deltas from engine time globals.
        gameDelta = time - lastTime;
        realDelta = timeReal - lastTimeReal;
        lastTime = time;
        lastTimeReal = timeReal;
    }
    else if (realDelta === undefined)
    {
        // Manual path with one arg: real and game advance together.
        realDelta = gameDelta;
    }

    // Iterate in reverse so removals don't disturb iteration.
    for (let i = tweenActive.length; i--;)
    {
        const t = tweenActive[i];
        if (t.paused) continue;
        const dt = t.useRealTime ? realDelta : gameDelta;
        if (dt <= 0) continue;

        t.life -= dt;
        if (t.life > 0)
        {
            t.callback(t.interp(t.life));
        }
        else
        {
            // Completion: fire end value, remove from active, fire then-callback.
            t.callback(t.interp(0));
            tweenActive.splice(i, 1);
            const cb = t.thenCallback;
            t.thenCallback = undefined;
            if (cb) cb();
        }
    }
}

/** Stop every active tween and clear their then-callbacks. Useful for resets
 *  on level transitions or when changing scenes.
 *  @memberof TweenSystem */
function tweenStopAll()
{
    for (const t of tweenActive) t.thenCallback = undefined;
    tweenActive.length = 0;
}

// Register with the engine so tweens auto-advance.
engineAddPlugin(tweenUpdate);
