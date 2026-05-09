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
 *  @memberof TweenSystem */
class Ease {}

/** Tween a property on an object by dot-path.
 *  @memberof TweenSystem */
function tweenProperty() {}

/** Engine plugin hook: called every render frame to advance active tweens.
 *  @memberof TweenSystem */
function tweenUpdate() {}

// Register with the engine so tweens auto-advance.
engineAddPlugin(tweenUpdate);
