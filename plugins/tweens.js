/**
 * LittleJS Tweening Plugin
 * - Tweens
 * - Easing
 * - Curves
 * - Looping
 * - Custom Durations
 * - Custom Ranges
 * @namespace Tweens
 */

"use strict";

///////////////////////////////////////////////////////////////////////////////

/** Global tween system plugin object
 *  @type {TweenSystemPlugin} */
let tweenSystem;

/**
 * LittleJS Tween System Plugin
 * - Manages all active tweens
 * - Provides default tween settings
 * - Updates tweens each frame
 * - Handles tween lifecycle and cleanup
 * @class TweenSystemPlugin
 * @memberof Tweens
 */
class TweenSystemPlugin {
	/** Create a tween system plugin
	 *  @param {number} [duration] - Default duration for tweens in frames
	 *  @param {number} [from] - Default starting value for tweens
	 *  @param {number} [to] - Default ending value for tweens
	 *  @param {Function} [curve] - Default curve function for tweens
	 *  @param {Function} [loop] - Default loop behavior for tweens
	 *  @constructor
	 */
	constructor(
		duration = frameRate,
		from = 0,
		to = 1,
		curve = Curves.LINEAR,
		loop = TweenRepeat.None
	) {
		ASSERT(!tweenSystem, "Tween system already initialized");
		tweenSystem = this;

		/** @property {number} - Default duration for tweens in frames */
		this.defaultDuration = duration; // 1 second === 60 frames
		/** @property {number} - Default starting value for tweens */
		this.defaultFrom = from;
		/** @property {number} - Default ending value for tweens */
		this.defaultTo = to;
		/** @property {Function} - Default curve function for tweens */
		this.defaultCurve = curve;
		/** @property {Function} - Default loop behavior for tweens */
		this.defaultLoop = loop;
		/** @property {Array<Tween>} - Array of currently active tweens */
		this.activeTweens = [];

		engineAddPlugin(update);

		function update() {
			const activeTweens = tweenSystem.activeTweens;
			// Evaluate all tweens - UI tweens run even when the game is paused
			activeTweens.forEach(
				(twn) => (!paused || twn.isUI) && twn.eval(--twn.life)
			);

			// Call ._then() on tweens that have completed (life <= 0)
			activeTweens.forEach((twn) => twn.life <= 0 && twn._then(twn));

			// Remove completed tweens (life <= 0)
			tweenSystem.activeTweens = activeTweens.filter((twn) => twn.life > 0);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////

/**
 * LittleJS Tween Class
 * - Animates values over time using easing curves
 * - Supports custom durations, ranges, and curves
 * - Can be looped, reversed, and chained
 * - UI tweens continue running when game is paused
 * @class Tween
 * @memberof Tweens
 */
class Tween {
	/** Create a new tween
	 *  @param {Function} fn - Function called each frame with the current tween value
	 *  @param {number} [duration] - Duration of tween in frames
	 *  @param {number} [from] - Starting value
	 *  @param {number} [to] - Ending value
	 *  @constructor */
	constructor(fn, duration, from, to) {
		/** @property {Function} - Function called each frame with current tween value */
		this.fn = fn;

		/** @property {number} - Duration of tween in frames */
		this.duration = duration ?? tweenSystem.defaultDuration;

		/** @property {number} - Starting value */
		this.from = from ?? tweenSystem.defaultFrom;

		/** @property {number} - Ending value */
		this.to = to ?? tweenSystem.defaultTo;

		/** @property {number} - Remaining life of the tween */
		this.life = this.duration;

		/** @property {number} - Difference between to and from values */
		this.delta = this.to - this.from;

		/** @property {boolean} - Whether this tween runs during UI (ignores pause) */
		this.isUI = false;

		/** @property {Function} - Function called when tween completes */
		this._then = tweenSystem.defaultLoop;

		/** @property {Function} - Curve function for easing */
		this._curve = tweenSystem.defaultCurve;
	}

	/** Set the function to call when tween completes
	 *  @param {Function} f - Function to call on completion
	 *  @return {Tween} - Returns self for chaining
	 */
	then(f) {
		this._then = f;
		return this;
	}

	/** Set the easing curve function for this tween
	 *  @param {Function} f - Curve function that takes 0-1 and returns 0-1
	 *  @return {Tween} - Returns self for chaining
	 */
	curve(f) {
		this._curve = f;
		return this;
	}

	/** Set whether this tween should run during UI (ignores pause)
	 *  @param {boolean} isUI - Whether this is a UI tween
	 *  @return {Tween} - Returns self for chaining
	 */
	setIsUI(isUI) {
		this.isUI = isUI;
		return this;
	}

	/** Reverse the tween direction (swap from and to values)
	 *  @return {Tween} - Returns self for chaining
	 */
	reverse() {
		[this.from, this.to] = [this.to, this.from];
		this.delta = this.to - this.from;
		return this;
	}

	/** Start this tween and add it to the active list
	 */
	play() {
		tweenSystem.activeTweens.push(this);
		this.eval(this.life);
	}

	/** Stop this tween and remove it from the active list
	 */
	stop() {
		tweenSystem.activeTweens = tweenSystem.activeTweens.filter(
			(twn) => twn !== this
		);
	}

	/** Get the current tween value at the given life
	 *  @param {number} life - Remaining life of the tween
	 *  @return {number} - Current tween value
	 */
	sample(life) {
		return (
			this.from +
			this._curve((this.duration - life) / this.duration) * this.delta
		);
	}

	/** Reset the tween to its starting state
	 *  @return {Tween} - Returns self for chaining
	 */
	reset() {
		this.life = this.duration;
		return this;
	}

	/** Evaluate the tween at the given life and call the tween function
	 *  @param {number} life - Remaining life of the tween
	 */
	eval(life) {
		this.fn(this.sample(life));
	}

	/** Create a copy of this tween
	 *  @return {Tween} - New tween with same settings
	 */
	clone() {
		return new Tween(this.fn, this.duration, this.from, this.to)
			.curve(this._curve)
			.then(this._then);
	}

	/** Render the tween shape and sample points
	 *  @param {number} [txtSpacing=10] - How often to show text labels (every N samples)
	 */
	renderDebug(txtSpacing = 10) {
		const tweenToWorld = (x, y) => {
			return vec2(x - 0.5, y - 0.5)
				.multiply(getCameraSize().multiply(vec2(0.9)))
				.add(cameraPos);
		};
		for (let i = this.duration; i >= 0; i--) {
			const t = i / this.duration;
			const y = this._curve(t);
			const c = rgb(0, 1, 0).lerp(rgb(1, 0, 0), t);
			if (i % txtSpacing === 0) {
				debugText(
					`${this.sample(i).toFixed(2)}`,
					tweenToWorld(t, -0.05),
					0.5,
					rgb().toString()
				);
			}
			if (i == this.duration - this.life)
				debugPoint(tweenToWorld(t, y), rgb(0, 0, 1).toString(), 0.02);
			if (i === this.duration) continue;
			const t2 = (i + 1) / this.duration;
			debugLine(
				tweenToWorld(t, y),
				tweenToWorld(t2, this._curve(t2)),
				c.toString(),
				0.02
			);
		}
	}

	/** Convert tween to string representation
	 *  @return {string} - String showing tween progress and values
	 */
	toString() {
		const timeElapsed = this.duration - this.life;
		const timePercent = ((timeElapsed / this.duration) * 100).toFixed(1);
		const valueNow = this.sample(this.life);
		return `Tween [t:${timePercent}% (${timeElapsed}/${
			this.duration
		})] [v:${JSON.stringify(this.from)} -> ${JSON.stringify(
			this.to
		)} @ ${valueNow.toFixed(3)}]`;
	}
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Tween repeat behaviors
 * @namespace TweenRepeat
 * @memberof Tweens
 */
const TweenRepeat =
{
	/** No repeat - tween stops when complete
	 *  @param {Tween} twn - Tween to repeat
	 */
	None: (twn) => {},
	/** Loop the tween a specified number of times
	 * This can be used without calling to loop forever
	 *  @param {number} n - Number of times to loop
	 *  @return {Function} - Function to set as tween's then callback
	 *
	 *  @example
	 *  new Tween(fn).then(TweenRepeat.Loop).play(); // loop forever
	 *  new Tween(fn).then(TweenRepeat.Loop(3)).play(); // loop 3 times
	 */
	Loop: function (n) {
		if (--n == 0) return TweenRepeat.None;
		else if (n)
			return (twn) => {
				twn.reset().then(TweenRepeat.Loop(n));
			};
		else TweenRepeat.Loop(Infinity).call(this, this);
	},
	/** Ping-pong the tween (forward then reverse) a specified number of times
	 * This can be used without calling to ping-pong forever
	 *  @param {number} n - Number of times to ping-pong (Infinity for infinite)
	 *  @return {Function} - Function to set as tween's then callback
	 *
	 *  @example
	 *  new Tween(fn).then(TweenRepeat.PingPong).play(); // ping-pong forever
	 *  new Tween(fn).then(TweenRepeat.PingPong(3)).play(); // ping-pong 3 times
	 */
	PingPong: function (n) {
		if (--n == 0) return TweenRepeat.None;
		else if (n)
			return (twn) => {
				twn.reset().reverse().then(TweenRepeat.PingPong(n));
			};
		else TweenRepeat.PingPong(Infinity).call(this, this);
	},
};

///////////////////////////////////////////////////////////////////////////////

/**
 * Easing curve functions
 *
 * @example
 * new Tween(fn).curve(Curves.LINEAR).play(); // linear tween
 * new Tween(fn).curve(Curves.POWER(2)).play(); // quadratic tween
 * new Tween(fn).curve(Curves.BEZIER(0.5, 0.5, 0.5, 0.5)).play(); // bezier tween
 * @namespace Curves
 * @memberof Tweens
 */
const Curves = {
	/** Linear curve - no easing
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.LINEAR).play(); // linear tween
	 */
	LINEAR: (x) => x,
	/** Power curve - exponential easing
	 *  @param {number} n - Power exponent
	 *  @return {Function} - Curve function
	 *  @example
	 *  new Tween(fn).curve(Curves.POWER(2)).play(); // quadratic tween
	 */
	POWER: (n) => (x) => x ** n,
	/** Sine curve - smooth easing
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.SINE).play(); // sine tween
	 */
	SINE: (x) => 1 - Math.cos(x * (Math.PI / 2)),
	/** Circular curve - smooth easing
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.CIRC).play(); // circular tween
	 */
	CIRC: (x) => 1 - Math.sqrt(1 - x * x),
	/** Exponential curve - very fast easing
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.EXPO).play(); // exponential tween
	 */
	EXPO: (x) => 2 ** (10 * x - 10),
	/** Backoff curve - overshoots then settles
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.BACKOFF).play(); // backoff tween
	 */
	BACKOFF: (x) => x * x * (2.70158 * x - 1.70158),
	/** Elastic curve - bouncy easing
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.ELASTIC).play(); // elastic tween
	 */
	ELASTIC: (x) =>
		-(2 ** (10 * x - 10)) * Math.sin(((37 - 40 * x) * Math.PI) / 6),
	/** Spring curve - natural spring motion
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.SPRING).play(); // spring tween
	 */
	SPRING: (x) =>
		1 -
		(Math.sin(Math.PI * (1 - x) * (0.2 + 2.5 * (1 - x) ** 3)) *
			Math.pow(x, 2.2) +
			(1 - x)) *
			(1.0 + 1.2 * x),
	/** Bounce curve - bounces to settle
	 *  @param {number} x - Input value 0-1
	 *  @return {number} - Output value 0-1
	 *  @example
	 *  new Tween(fn).curve(Curves.BOUNCE).play(); // bounce tween
	 */
	BOUNCE: (x) => {
		const bounceOut = (x) => {
			if (x < 4 / 11) return 7.5625 * x * x;
			if (x < 8 / 11) return bounceOut(x - 6 / 11) + 0.75;
			if (x < 10 / 11) return bounceOut(x - 9 / 11) + 0.9375;
			return bounceOut(x - 10.5 / 11) + 0.984375;
		};
		return Ease.OUT(bounceOut)(x);
	},
	/** Bezier curve - custom cubic bezier easing
	 *  @param {number} x1 - First control point x
	 *  @param {number} y1 - First control point y
	 *  @param {number} x2 - Second control point x
	 *  @param {number} y2 - Second control point y
	 *  @param {number} [steps] - Number of steps to take (default 128)
	 *  @return {Function} - Curve function
	 *  @example
	 *  new Tween(fn).curve(Curves.BEZIER(0, 0.5, 0, 0.5)).play(); // bezier tween
	 */
	BEZIER: (x1, y1, x2, y2, steps = 128) => {
		const curve = (t) => {
			const u = 1 - t;
			const c1 = 3 * u * u * t;
			const c2 = 3 * u * t * t;
			const t3 = t ** 3;
			return [c1 * x1 + c2 * x2 + t3, c1 * y1 + c2 * y2 + t3];
		};
		return (x) => {
			let i = 0,
				t0 = 0,
				t1 = 1;
			for (; i < steps; i++) {
				const tMid = (t0 + t1) / 2;
				const [bx, by] = curve(tMid);
				if (Math.abs(bx - x) < 1e-5) return by;
				else if (bx < x) t0 = tMid;
				else t1 = tMid;
			}
			return curve((t0 + t1) / 2)[1];
		};
	},
};

///////////////////////////////////////////////////////////////////////////////

/**
 * Easing modifiers
 * @namespace Ease
 * @memberof Tweens
 *
 * @example
 * new Tween(fn).curve(Ease.IN(Curves.BOUNCE)).play(); // bounce tween
 * new Tween(fn).curve(Ease.OUT(Curves.BOUNCE)).play(); // bounce tween
 * new Tween(fn).curve(Ease.PIECEWISE(Curves.LINEAR, Curves.POWER(2))).play(); // linear then quadratic tween
 */
const Ease = {
	/** Apply easing in (slow start)
	 *  @param {Function} f - Base curve function
	 *  @return {Function} - Modified curve function
	 *  @example
	 *  new Tween(fn).curve(Ease.IN(Curves.LINEAR)).play(); // linear tween
	 */
	IN: (f) => f,
	/** Apply easing out (slow end)
	 *  @param {Function} f - Base curve function
	 *  @return {Function} - Modified curve function
	 *  @example
	 *  new Tween(fn).curve(Ease.OUT(Curves.BOUNCE)).play(); // bounce tween
	 */
	OUT: (f) => (x) => 1 - f(1 - x),
	/** Apply easing in and out (slow start and end)
	 *  @param {Function} f - Base curve function
	 *  @return {Function} - Modified curve function
	 *  @example
	 *  new Tween(fn).curve(Ease.IN_OUT(Curves.BOUNCE)).play(); // bounce tween
	 */
	IN_OUT: (f) => Ease.PIECEWISE(f, Ease.OUT(f)),
	/** Apply easing out and in (slow middle)
	 *  @param {Function} f - Base curve function
	 *  @return {Function} - Modified curve function
	 *  @example
	 *  new Tween(fn).curve(Ease.OUT_IN(Curves.BOUNCE)).play(); // bounce tween
	 */
	OUT_IN: (f) => Ease.PIECEWISE(Ease.OUT(f), f),
	/** Combine multiple curve functions piecewise
	 *  @param {...Function} fns - Curve functions to combine
	 *  @return {Function} - Combined curve function
	 *  @example
	 *  new Tween(fn).curve(Ease.PIECEWISE(Curves.LINEAR, Curves.POWER(2))).play(); // linear then quadratic tween
	 */
	PIECEWISE: (...fns) => {
		const n = fns.length;
		return (x) => {
			const i = (x * n - 1e-9) >> 0;
			return (fns[i]((x - i / n) * n) + i) / n;
		};
	},
};
