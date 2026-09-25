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

// Module-private list of tweens currently running, each with its active flag set while it is in it.
const tweenActive = [];
const tweenUpdateList = []; // the tweens an update moves, the ones active when it began
let tweenUpdatePass = 0; // counts the updates, a tween started during one waits for the next

// put a tween in the active list, or take it out, keeping its flag in step so a check costs nothing
function tweenActivate(tween)
{
    tween.activePass = tweenUpdatePass; // started again, even while active, so this update leaves it alone
    if (tween.active) return;
    tween.active = true;
    tweenActive.push(tween);
}
function tweenDeactivate(tween)
{
    if (!tween.active) return;
    tween.active = false;
    tweenActive.splice(tweenActive.indexOf(tween), 1);
}

// True if the value is an instance of a class that exposes a numeric-percent
// `lerp(other, percent)` method (Vector2, Color, or any future class).
function tweenIsLerpable(v) { return v && typeof v.lerp === 'function'; }

///////////////////////////////////////////////////////////////////////////////

/** A numeric tween: drives a callback with a value interpolated between
 *  `start` and `end` over `duration` seconds. Pauses with the game by default.
 *  - In TypeScript it is a `Tween<T>` of the type it tweens, which comes from `start` and `end` or
 *    the callback's parameter, so `(v: number)=> ...` takes a number
 *  @template [T=any]
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
     *  `start` and `end` may be numbers, Vector2, Vector3 or Color instances, or
     *  any object exposing a `lerp(other, percent) => sameType` method. The
     *  callback receives the interpolated value (a number, or a fresh instance
     *  for lerp-able types). Both endpoints must be the same type.
     *  @param {function(NonNullable<T>):void} callback - Called with the interpolated value each frame
     *  @param {T} [start=0] - Starting value
     *  @param {T} [end=1] - Ending value
     *  @param {number} [duration=1] - Duration in seconds
     *  @param {Object} [options]
     *  @param {function(number):number} [options.ease] - Easing function (defaults to LINEAR)
     *  @param {boolean} [options.useRealTime=false] - Advance even when the game is paused (matches Timer's useRealTime)
     *  @param {boolean} [options.paused=false] - Start in paused state */
    constructor(callback, start = /** @type {T} */ (0), end = /** @type {T} */ (1), duration = 1, options = {})
    {
        ASSERT(typeof callback === 'function', 'Tween callback must be a function');
        if (tweenIsLerpable(start))
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

        // the callback's type is NonNullable<T>, which is T, so that TypeScript takes the type from start and end
        // first: a typed callback like (v: number)=> with start 10 then makes a Tween<number>, not a Tween<0|10>
        /** @property {function(T):void} - Called with the interpolated value each frame
         *  @type {function(T):void} */
        this.callback = callback;
        /** @property {T} - Starting value
         *  @type {T} */
        this.start = start;
        /** @property {T} - Ending value
         *  @type {T} */
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
        /** @property {undefined|function():void} - Called once the tween completes: when its last pass ends,
         *  the last iteration of a loop or pingPong, and again each time a restart plays through; then() sets it
         *  @type {undefined|function():void} */
        this.onComplete = undefined;

        /** Continuation when a pass ends, set by loop() and pingPong() to start the next iteration.
         *  @private */
        this.thenCallback = undefined;
        /** Remaining iterations including the current run (loop/pingPong only).
         *  @private */
        this.loopRemaining = 0;
        /** Whether it is in the active list, see isActive
         *  @private */
        this.active = false;
        /** The update it was started in, it first moves on the one after
         *  @private */
        this.activePass = 0;
        /** Engine time and real time of its last engine update, it moves by what passed since
         *  @private */
        this.lastTime = time;
        /** @private */
        this.lastTimeReal = timeReal;

        tweenActivate(this);
        // Snap target to start immediately.
        callback(this.interp(duration));
    }

    /** Set the easing curve and return this for chaining.
     *  @param {function(number):number} easeFn
     *  @returns {Tween<T>}
     *  @memberof TweenSystem */
    setEase(easeFn)
    {
        this.ease = easeFn;
        return this;
    }

    /** Set the completion callback, `onComplete`, and return this for chaining.
     *  It is called once the tween completes: when its pass ends, or for a
     *  `loop` or `pingPong` when its last iteration ends, so an endless one
     *  never calls it. Calling `then` again replaces the previous callback.
     *  - It works with `loop` and `pingPong` in either order, neither replaces the other
     *  - It is kept by `restart`, so a restarted tween calls it again when it completes
     *  - `stop` and `tweenStopAll` end a tween without calling it
     *  @param {function():void} callback
     *  @returns {Tween<T>}
     *  @memberof TweenSystem */
    then(callback)
    {
        this.onComplete = callback;
        return this;
    }

    /** Repeat this tween `n` total times. After each iteration finishes, the
     *  same tween starts over, so the handle returned stays good for the whole
     *  loop: pause or stop it to pause or stop every iteration left.
     *  `loop()` with no argument loops forever.
     *
     *  Mutually exclusive with `pingPong`; calling either replaces the other.
     *  A `then` callback, set before or after, is called when the last
     *  iteration ends.
     *  @param {number} [count=Infinity]
     *  @returns {Tween<T>}
     *  @memberof TweenSystem */
    loop(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => tweenLoopContinuation(this);
        return this;
    }

    /** Like `loop`, but swap `start` and `end` between iterations so the value
     *  bounces back and forth. `pingPong()` with no argument bounces forever.
     *
     *  Mutually exclusive with `loop`; calling either replaces the other.
     *  A `then` callback, set before or after, is called when the last
     *  iteration ends.
     *  @param {number} [count=Infinity]
     *  @returns {Tween<T>}
     *  @memberof TweenSystem */
    pingPong(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => tweenPingPongContinuation(this);
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
     *  It replays one pass: a loop or pingPong that has finished is not started
     *  over, a pingPong that ended on its way back plays that way again, and a
     *  restart mid loop keeps the iterations left. Call loop or pingPong again
     *  after restart to repeat it. The `then` callback is kept and is called
     *  again when it completes.
     *  @memberof TweenSystem */
    restart()
    {
        this.life = this.duration;
        this.paused = false;
        this.lastTime = time;
        this.lastTimeReal = timeReal;
        tweenActivate(this);
        this.callback(this.interp(this.duration));
    }

    /** True if this tween is in the active list and not paused.
     *  @returns {boolean}
     *  @memberof TweenSystem */
    isActive()
    {
        return !this.paused && this.active;
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
     *  the callback). Returns a number, Vector2, Vector3 or Color depending on the
     *  tween's start/end types.
     *  @returns {T}
     *  @memberof TweenSystem */
    getValue()
    {
        return this.interp(this.life);
    }

    /** Compute the interpolated value at the given remaining `life`.
     *  At life === duration the result is `start`; at life === 0 it is `end`.
     *  - At life 0 it is the end value exactly
     *  - A vector goes past its ends as far as the easing does, as a number does; a Color stays between them,
     *    so its channels stay in range, and any other type goes as far as its own lerp takes it
     *  @param {number} life
     *  @returns {T}
     *  @memberof TweenSystem */
    interp(life)
    {
        // the ends of whatever type it tweens, each kind is handled below
        const s = /** @type {any} */ (this.start), e = /** @type {any} */ (this.end);
        if (life <= 0) // the end exactly, an easing curve may land a rounding error short of it
            return typeof e.copy === 'function' ? e.copy() : e;
        const x = this.ease((this.duration - life) / this.duration);
        // the vectors as their lerp does it, which lands on the end exactly, but without its clamp
        const y = 1 - x;
        if (s instanceof Vector2)
            return /** @type {T} */ (vec2(e.x * x + s.x * y, e.y * x + s.y * y));
        if (typeof Vector3 !== 'undefined' && s instanceof Vector3) // a build may leave out the 3D math
            return /** @type {T} */ (vec3(e.x * x + s.x * y, e.y * x + s.y * y, e.z * x + s.z * y));
        if (tweenIsLerpable(s))
            return s.lerp(e, x);
        return s + (e - s) * x;
    }

    /** Remove this tween from the active list, ending a loop or pingPong too, without calling
     *  the then-callback. It keeps the then-callback, so a restart calls it when it completes.
     *  @memberof TweenSystem */
    stop()
    {
        tweenDeactivate(this);
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

    /** Elastic ease-in: oscillations that grow toward the end.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    ELASTIC: (x) =>
        x === 0 ? 0 :
        x === 1 ? 1 :
        -(2 ** (10 * x - 10)) * sin(((37 - 40 * x) * PI) / 6),

    /** Spring ease-in: wobbles around the start before springing to the end;
     *  `Ease.OUT(Ease.SPRING)` overshoots and settles on the target.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    SPRING: (x) =>
        1 -
        (sin(PI * (1 - x) * (0.2 + 2.5 * (1 - x) ** 3)) *
            x ** 2.2 +
            (1 - x)) *
            (1.0 + 1.2 * x),

    /** Bouncing ease-in: small bounces near the start, then a rise to the end.
     *  Symmetric with the other base curves, which are all ease-in. To get the
     *  classic "object falls and hits the ground" shape (bounces near x=1),
     *  wrap with `Ease.OUT`: `Ease.OUT(Ease.BOUNCE)`.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.BOUNCE                  // ease-in bounce (bouncy at start)
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
 *  `start` and `end` may be numbers, Vector2, Vector3 or Color instances, or
 *  any object with a `lerp(other, percent) => sameType` method.
 *  @template [T=any]
 *  @param {Object} target - The object whose property is being animated
 *  @param {string} propertyPath - Dot-separated path, e.g. `'pos.x'` or `'color'`
 *  @param {T} start - Starting value
 *  @param {T} end - Ending value
 *  @param {number} [duration=1] - Duration in seconds
 *  @param {Object} [options] - Same options as the Tween constructor
 *  @param {function(number):number} [options.ease] - Easing function (defaults to LINEAR)
 *  @param {boolean} [options.useRealTime=false] - Advance even when the game is paused
 *  @param {boolean} [options.paused=false] - Start in paused state
 *  @returns {Tween<T>}
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
        for (const k of parts)
        {
            obj = obj[k];
            ASSERT(obj != null, 'tweenProperty path does not resolve: ' + propertyPath);
        }
        obj[lastKey] = value;
    };
    return new Tween(callback, start, end, duration, options);
}

// Start the next iteration with the time the last one ran over already spent, so a loop keeps its
// pace; an update that ran over by more than a whole iteration lands where the cycle is, not owing it
function tweenCarryOvershoot(tween)
{
    const duration = tween.duration;
    tween.life = duration ? min(tween.life, 0) % duration + duration : 1e-9;
}

// How many iterations the update that finished one ran through: that one and every whole one after it
function tweenPassed(tween)
{
    const duration = tween.duration;
    return duration ? 1 + floor(-min(tween.life, 0) / duration) : 1;
}

// Continuation that schedules the next loop iteration when one finishes, true if it did.
// Reuses the same Tween object across iterations so the user's handle
// from `.loop()` keeps working — calling `.stop()` mid-loop now cancels
// the entire chain instead of just the current iteration.
function tweenLoopContinuation(tween)
{
    // count every iteration that went by, a finite loop ends once they run out
    const passed = tweenPassed(tween);
    if (tween.loopRemaining <= passed) return false; // Infinity never runs out
    tween.loopRemaining -= passed;
    tweenCarryOvershoot(tween);
    tween.thenCallback = () => tweenLoopContinuation(tween);
    tweenActivate(tween);
    // snap to where the new iteration is, its start less the time the last one ran over
    tween.callback(tween.interp(tween.life));
    return true;
}

// Continuation for pingPong: swaps start and end on the same tween each iteration, true if it started another.
function tweenPingPongContinuation(tween)
{
    // swap the ends once for each iteration that went by, but when they run out the last one keeps its
    // direction, so it ends on the end it really reached and a restart plays that way again
    const passed = tweenPassed(tween);
    const done = tween.loopRemaining <= passed; // Infinity never runs out
    const swaps = done ? max(tween.loopRemaining - 1, 0) : passed;
    if (swaps & 1)
    {
        const tmp = tween.start;
        tween.start = tween.end;
        tween.end = tmp;
    }
    if (done)
    {
        // the completion gave the other end, give the one it finished on
        if (swaps & 1)
            tween.callback(tween.interp(0));
        return false;
    }
    tween.loopRemaining -= passed;
    tweenCarryOvershoot(tween);
    tween.thenCallback = () => tweenPingPongContinuation(tween);
    tweenActivate(tween);
    tween.callback(tween.interp(tween.life));
    return true;
}

/** Engine plugin hook: advance every active tween by the appropriate delta.
 *  The engine calls it with no arguments on every fixed update, so it can run
 *  more than once in a rendered frame, and on paused updates too, where only
 *  real time tweens move. May also be
 *  called explicitly with `(gameDelta, realDelta)` to drive tweens manually
 *  — useful for headless tests or custom replay/scrubbing systems.
 *  @param {number} [gameDelta] - Game-time delta in seconds; default: game time since the tween's last engine update
 *  @param {number} [realDelta] - Real-time delta in seconds; default: real time since the tween's last engine update
 *  @memberof TweenSystem */
function tweenUpdate(gameDelta, realDelta)
{
    // Engine path: each tween moves by the time since its own last update, so one made
    // this update, before or after this call, first moves on the next, like a Timer
    const enginePath = gameDelta === undefined;
    if (!enginePath && realDelta === undefined)
    {
        // Manual path with one arg: real and game advance together.
        realDelta = gameDelta;
    }

    // Move the tweens that were active when this update began, each once: a callback
    // may stop any tween, even all of them, and one that is stopped is skipped; a tween
    // made or started again during the update, like the next turn of a loop, moves on
    // from the next update. Newest first, as the list has always been walked.
    const list = tweenUpdateList, pass = ++tweenUpdatePass;
    for (const t of tweenActive)
        list.push(t);
    for (let i = list.length; i--;)
    {
        const t = list[i];
        if (!t.active || t.activePass === pass) continue; // stopped, or started again by a callback this update
        let dt;
        if (enginePath)
        {
            // a paused tween keeps count too, so it does not jump when resumed
            dt = t.useRealTime ? timeReal - t.lastTimeReal : time - t.lastTime;
            t.lastTime = time;
            t.lastTimeReal = timeReal;
        }
        else
            dt = t.useRealTime ? realDelta : gameDelta;
        if (t.paused || dt <= 0) continue;

        t.life -= dt;
        if (t.life > 1e-9) // the engine's deltas add up a rounding error short of the duration
        {
            t.callback(t.interp(t.life));
        }
        else
        {
            // Completion: fire end value, remove from active, start the next iteration
            // of a loop or pingPong, or when there is none it has completed, fire onComplete
            t.callback(t.interp(0));
            if (!t.active || t.activePass === pass)
                continue; // stopped or restarted by its own callback, the run it was on ends without completing
            tweenDeactivate(t);
            const next = t.thenCallback;
            t.thenCallback = undefined;
            if (!(next && next()) && t.onComplete)
                t.onComplete();
        }
    }
    list.length = 0;
}

/** Stop every active tween, ending loops too, without calling their then-callbacks.
 *  Useful for resets on level transitions or when changing scenes.
 *  @memberof TweenSystem */
function tweenStopAll()
{
    for (const t of tweenActive)
        t.thenCallback = undefined, t.active = false;
    tweenActive.length = 0;
}

// Register with the engine so tweens auto-advance.
engineAddPlugin(tweenUpdate);
