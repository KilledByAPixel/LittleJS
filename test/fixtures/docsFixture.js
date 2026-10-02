/**
 * Fixture namespace for the docs template test
 * - a bullet in the description
 * @namespace Fixture
 */

'use strict';

/** The size of things
 *  @type {number}
 *  @default
 *  @memberof Fixture */
const fixtureSize = 3;

/** Called when a thing is done
 *  @callback DoneCallback
 *  @param {Thing} thing - the thing
 *  @memberof Fixture */

/** Options for a thing
 *  @typedef {Object} ThingOptions
 *  @property {number} speed - how fast
 *  @property {Color|undefined} tint - a tint
 *  @memberof Fixture */

/** Make a thing
 *  @param {Vector2} pos - where
 *  @param {number} [size=1] - how big
 *  @param {[Vector2, Vector2, number]} [span] - a tuple jsdoc rejects
 *  @param {...number} rest - more
 *  @return {Thing} the thing
 *  @example
 *  // make one
 *  const t = makeThing(vec2(1), 2);
 *  @memberof Fixture */
function makeThing(pos, size=1, span, ...rest) {}

/** A thing in the fixture
 *  @memberof Fixture */
class Thing
{
    /** Create a thing
     *  @param {Vector2} pos - where */
    constructor(pos)
    {
        /** @property {Vector2} - where it is
         *  @type {Vector2} */
        this.pos = pos;
    }

    /** Move it
     *  @param {Vector2} delta - how far
     *  @return {Thing} */
    move(delta) { return this; }

    /** Old way
     *  @deprecated since 1.0, use move */
    shift() {}

    /** Bare deprecation
     *  @deprecated */
    wobble() {}

    /** A unit thing
     *  @return {Thing} */
    static unit() { return new Thing(); }

    /** A thing like this one, a static with an instance twin
     *  @return {Thing} */
    static move() { return new Thing(); }
}

/** A big thing
 *  @extends Thing
 *  @memberof Fixture */
class BigThing extends Thing
{
    /** Create a big thing
     *  @param {Vector2} pos - where */
    constructor(pos) { super(pos); }

    /** Grow it */
    grow() {}
}

/** An internal helper with a comment and no namespace */
function fixtureInternal() {}

/**
 * Second namespace, a plugin the order lists do not name
 * @namespace FixturePlugin
 */

/** A plugin function
 *  @param {Thing} thing - a thing
 *  @param {Object.<string, {action: function(boolean): any}>} table - a table
 *  @memberof FixturePlugin */
function pluginThing(thing, table) {}
