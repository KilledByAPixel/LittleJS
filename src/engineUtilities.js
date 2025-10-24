/**
 * LittleJS Utility Classes and Functions
 * - General purpose math library
 * - Vector2 - fast, simple, easy 2D vector class
 * - Color - holds a rgba color with some math functions
 * - Timer - tracks time automatically
 * - RandomGenerator - seeded random number generator
 * @namespace Utilities
 */

'use strict';

/** The value of PI
 *  @type {number}
 *  @default Math.PI
 *  @memberof Utilities */
const PI = Math.PI;

/** Returns absolute value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const abs = Math.abs;

/** Returns floored value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const floor = Math.floor;

/** Returns ceiled value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const ceil = Math.ceil;

/** Returns rounded value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const round = Math.round;

/** Returns lowest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const min = Math.min;

/** Returns highest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const max = Math.max;

/** Returns the sign of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const sign = Math.sign;

/** Returns hypotenuse of values passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const hypot = Math.hypot;

/** Returns log2 of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const log2 = Math.log2;

/** Returns sin of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const sin = Math.sin;

/** Returns cos of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const cos = Math.cos;

/** Returns tan of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const tan = Math.tan;

/** Returns atan2 of values passed in
 *  @param {number} y
 *  @param {number} x
 *  @return {number}
 *  @memberof Utilities */
const atan2 = Math.atan2;

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {number} dividend
 *  @param {number} [divisor]
 *  @return {number}
 *  @memberof Utilities */
function mod(dividend, divisor=1) { return ((dividend % divisor) + divisor) % divisor; }

/** Clamps the value between max and min
 *  @param {number} value
 *  @param {number} [min]
 *  @param {number} [max]
 *  @return {number}
 *  @memberof Utilities */
function clamp(value, min=0, max=1) { return value < min ? min : value > max ? max : value; }

/** Returns what percentage the value is between valueA and valueB
 *  @param {number} value
 *  @param {number} valueA
 *  @param {number} valueB
 *  @return {number}
 *  @memberof Utilities */
function percent(value, valueA, valueB)
{ return (valueB-=valueA) ? clamp((value-valueA)/valueB) : 0; }

/** Linearly interpolates between values passed in using percent
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function lerp(valueA, valueB, percent)
{
    if (valueA >= 0 && valueA <= 1 && ((valueB < 0 || valueB > 1) && (percent < 0 || percent > 1)))
        console.warn('lerp() parameter order changed! use lerp(start, end, p)');
    return valueA + clamp(percent) * (valueB-valueA);
}

/** Gets percent between percentA and percentB and linearly interpolates between lerpA and lerpB
 *  A shortcut for lerp(lerpA, lerpB, percent(value, percentA, percentB))
 *  @param {number} value
 *  @param {number} percentA
 *  @param {number} percentB
 *  @param {number} lerpA
 *  @param {number} lerpB
 *  @return {number}
 *  @memberof Utilities */
function percentLerp(value, percentA, percentB, lerpA, lerpB)
{ return lerp(lerpA, lerpB, percent(value, percentA, percentB)); }

/** Returns signed wrapped distance between the two values passed in
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Utilities */
function distanceWrap(valueA, valueB, wrapSize=1)
{ const d = (valueA - valueB) % wrapSize; return d*2 % wrapSize - d; }

/** Linearly interpolates between values passed in with wrapping
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Utilities */
function lerpWrap(valueA, valueB, percent, wrapSize=1)
{
    if (valueA >= 0 && valueA <= 1 && ((valueB < 0 || valueB > 1) && (percent < 0 || percent > 1)))
        console.warn('lerpWrap() parameter order changed! use lerpWrap(start, end, p)');
    return valueA + clamp(percent) * distanceWrap(valueB, valueA, wrapSize);
}

/** Returns signed wrapped distance between the two angles passed in
 *  @param {number} angleA
 *  @param {number} angleB
 *  @return {number}
 *  @memberof Utilities */
function distanceAngle(angleA, angleB) { return distanceWrap(angleA, angleB, 2*PI); }

/** Linearly interpolates between the angles passed in with wrapping
 *  @param {number} angleA
 *  @param {number} angleB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function lerpAngle(angleA, angleB, percent) { return lerpWrap(angleA, angleB, percent, 2*PI); }

/** Applies smoothstep function to the percentage value
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function smoothStep(percent) { return percent * percent * (3 - 2 * percent); }

/** Checks if the value passed in is a power of two
 *  @param {number} value
 *  @return {boolean}
 *  @memberof Utilities */
function isPowerOfTwo(value) { return !(value & (value - 1)); }

/** Returns the nearest power of two not less than the value
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
function nearestPowerOfTwo(value) { return 2**ceil(log2(value)); }

/** Returns true if two axis aligned bounding boxes are overlapping
 *  this can be used for simple collision detection between objects
 *  @param {Vector2} posA          - Center of box A
 *  @param {Vector2} sizeA         - Size of box A
 *  @param {Vector2} posB          - Center of box B
 *  @param {Vector2} [sizeB=(0,0)] - Size of box B, uses a point if undefined
 *  @return {boolean}              - True if overlapping
 *  @memberof Utilities */
function isOverlapping(posA, sizeA, posB, sizeB=vec2())
{
    const dx = (posA.x - posB.x)*2;
    const dy = (posA.y - posB.y)*2;
    const sx = sizeA.x + sizeB.x;
    const sy = sizeA.y + sizeB.y;
    return dx >= -sx && dx < sx && dy >= -sy && dy < sy;
}

/** Returns true if a line segment is intersecting an axis aligned box
 *  @param {Vector2} start - Start of raycast
 *  @param {Vector2} end   - End of raycast
 *  @param {Vector2} pos   - Center of box
 *  @param {Vector2} size  - Size of box
 *  @return {boolean}      - True if intersecting
 *  @memberof Utilities */
function isIntersecting(start, end, pos, size)
{
    // Liang-Barsky algorithm
    const boxMin = pos.subtract(size.scale(.5));
    const boxMax = boxMin.add(size);
    const delta = end.subtract(start);
    const a = start.subtract(boxMin);
    const b = start.subtract(boxMax);
    const p = [-delta.x, delta.x, -delta.y, delta.y];
    const q = [a.x, -b.x, a.y, -b.y];
    let tMin = 0, tMax = 1;
    for (let i = 4; i--;)
    {
        if (p[i])
        {
            const t = q[i] / p[i];
            if (p[i] < 0)
            {
                if (t > tMax) return false;
                tMin = max(t, tMin);
            }
            else
            {
                if (t < tMin) return false;
                tMax = min(t, tMax);
            }
        }
        else if (q[i] < 0)
            return false;
    }

    return true;
}

/** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
 *  @param {number} [frequency] - Frequency of the wave in Hz
 *  @param {number} [amplitude] - Amplitude (max height) of the wave
 *  @param {number} [t=time]    - Value to use for time of the wave
 *  @param {number} [offset]    - Value to use for time offset of the wave
 *  @return {number}            - Value waving between 0 and amplitude
 *  @memberof Utilities */
function wave(frequency=1, amplitude=1, t=time, offset=0)
{ return amplitude/2 * (1 - cos(offset + t*frequency*2*PI)); }

/** Formats seconds to mm:ss style for display purposes
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t)
{
    const sign = t < 0 ? '-' : '';
    t = abs(t)|0;
    return sign + (t/60|0) + ':' + (t%60<10?'0':'') + t%60;
}

/** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
 *  @param {string} url - URL of JSON file
 *  @return {Promise<object>}
 *  @memberof Utilities */
async function fetchJSON(url)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch JSON from ${url}: ${response.status} ${response.statusText}`);
    return response.json();
}

/**
 * Check if object is a valid number, not NaN or undefined, but it may be infinite
 * @param {any} n
 * @return {boolean}
 * @memberof Utilities */
function isNumber(n) { return typeof n === 'number' && !isNaN(n); }

/**
 * Check if object is a valid string or can be converted to one
 * @param {any} s
 * @return {boolean}
 * @memberof Utilities */
function isString(s) { return s !== undefined && s !== null && typeof s.toString() === 'string'; }

/**
 * Check if object is an array
 * @param {any} a
 * @return {boolean}
 * @memberof Utilities */
function isArray(a) { return Array.isArray(a); }

/**
 * @callback LineTestFunction - Checks if a position is colliding
 * @param {Vector2} pos
 * @memberof Draw
 */

/**
 * Casts a ray and returns position of the first collision found, or undefined if none are found
 * @param {Vector2} posStart
 * @param {Vector2} posEnd
 * @param {LineTestFunction} testFunction - Check if colliding
 * @param {Vector2} [normal] - Optional vector to store the normal
 * @return {Vector2|undefined} - Position of the collision or undefined if none found
 * @memberof Utilities */
function lineTest(posStart, posEnd, testFunction, normal)
{
    ASSERT(isVector2(posStart), 'posStart must be a vec2');
    ASSERT(isVector2(posEnd), 'posEnd must be a vec2');
    ASSERT(typeof testFunction === 'function', 'testFunction must be a function');
    ASSERT(!normal || isVector2(normal), 'normal must be a vec2');

    // get ray direction and length
    const dx = posEnd.x - posStart.x;
    const dy = posEnd.y - posStart.y;
    const totalLength = hypot(dx, dy);
    if (!totalLength)
        return;

    // current integer cell we are in
    const pos = posStart.floor();

    // normalize ray direction
    const dirX = dx / totalLength;
    const dirY = dy / totalLength;

    // step direction in grid
    const stepX = sign(dirX);
    const stepY = sign(dirY);

    // distance along the ray to cross one full cell in X or Y
    const tDeltaX = dirX ? abs(1 / dirX) : Infinity;
    const tDeltaY = dirY ? abs(1 / dirY) : Infinity;

    // distance along the ray from start to the first grid boundary
    const nextGridX = stepX > 0 ? pos.x + 1 : pos.x;
    const nextGridY = stepY > 0 ? pos.y + 1 : pos.y;
    const tMaxX = dirX ? (nextGridX - posStart.x) / dirX : Infinity;
    const tMaxY = dirY ? (nextGridY - posStart.y) / dirY : Infinity;

    // use line drawing algorithm to test for collisions
    let t = 0, tX = tMaxX, tY = tMaxY, wasX = tDeltaX < tDeltaY;
    while (t < totalLength)
    {
        if (testFunction(pos))
        {
            // set hit point
            const hitPos = vec2(posStart.x + dirX*t, posStart.y + dirY*t);

            // move inside of tile if on positive edge
            const e = 1e-9;
            if (wasX)
            {
                if (stepX < 0)
                    hitPos.x -= e;
            }
            if (stepY < 0)
                hitPos.y -= e;

            // set normal
            if (normal)
                wasX ? normal.set(-stepX,0) : normal.set(0,-stepY);
            return hitPos;
        }

        // advance to the next grid boundary
        if (wasX = tX < tY)
        {
            pos.x += stepX;
            t = tX;
            tX += tDeltaX;
        }
        else
        {
            pos.y += stepY;
            t = tY;
            tY += tDeltaY;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Random global functions
 *  @namespace Random */

/** Returns a random value between the two values passed in
 *  @param {number} [valueA]
 *  @param {number} [valueB]
 *  @return {number}
 *  @memberof Random */
function rand(valueA=1, valueB=0) { return valueB + Math.random() * (valueA-valueB); }

/** Returns a floored random value between the two values passed in
 *  The upper bound is exclusive. (If 2 is passed in, result will be 0 or 1)
 *  @param {number} valueA
 *  @param {number} [valueB]
 *  @return {number}
 *  @memberof Random */
function randInt(valueA, valueB=0) { return floor(rand(valueA,valueB)); }

/** Randomly returns true or false given the chance of true passed in
 *  @param {number} [chance]
 *  @return {boolean}
 *  @memberof Random */
function randBool(chance=.5) { return rand() < chance; }

/** Randomly returns either -1 or 1
 *  @return {number}
 *  @memberof Random */
function randSign() { return randInt(2) * 2 - 1; }

/** Returns a random Vector2 with the passed in length
 *  @param {number} [length]
 *  @return {Vector2}
 *  @memberof Random */
function randVec2(length=1) { return new Vector2().setAngle(rand(2*PI), length); }

/** Returns a random Vector2 within a circular shape
 *  @param {number} [radius]
 *  @param {number} [minRadius]
 *  @return {Vector2}
 *  @memberof Random */
function randInCircle(radius=1, minRadius=0)
{ return radius > 0 ? randVec2(radius * rand(minRadius / radius, 1)**.5) : new Vector2; }

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=(1,1,1,1)]
 *  @param {Color}   [colorB=(0,0,0,1)]
 *  @param {boolean} [linear]
 *  @return {Color}
 *  @memberof Random */
function randColor(colorA=new Color, colorB=new Color(0,0,0,1), linear=false)
{
    return linear ? colorA.lerp(colorB, rand()) :
        new Color(rand(colorA.r,colorB.r), rand(colorA.g,colorB.g), rand(colorA.b,colorB.b), rand(colorA.a,colorB.a));
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Seeded random number generator
 * - Can be used to create a deterministic random number sequence
 * @memberof Engine
 * @example
 * let r = new RandomGenerator(123); // random number generator with seed 123
 * let a = r.float();                // random value between 0 and 1
 * let b = r.int(10);                // random integer between 0 and 9
 * r.seed = 123;                     // reset the seed
 * let c = r.float();                // the same value as a
 */
class RandomGenerator
{
    /** Create a random number generator with the seed passed in
     *  @param {number} [seed] - Starting seed or engine default seed */
    constructor(seed = 123456789)
    {
        /** @property {number} - random seed */
        this.seed = seed;
    }

    /** Returns a seeded random value between the two values passed in
    *  @param {number} [valueA]
    *  @param {number} [valueB]
    *  @return {number} */
    float(valueA=1, valueB=0)
    {
        // xorshift algorithm
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return valueB + (valueA - valueB) * ((this.seed >>> 0) / 2**32);
    }

    /** Returns a floored seeded random value the two values passed in
    *  @param {number} valueA
    *  @param {number} [valueB]
    *  @return {number} */
    int(valueA, valueB=0) { return floor(this.float(valueA, valueB)); }

    /** Randomly returns true or false given the chance of true passed in
    *  @param {number} [chance]
    *  @return {boolean} */
    bool(chance=.5) { return this.float() < chance; }

    /** Randomly returns either -1 or 1 deterministically
    *  @return {number} */
    sign() { return this.float() > .5 ? 1 : -1; }

    /** Returns a seeded random value between the two values passed in with a random sign
    *  @param {number} [valueA]
    *  @param {number} [valueB]
    *  @return {number} */
    floatSign(valueA=1, valueB=0) { return this.float(valueA, valueB) * this.sign(); }

    /** Returns a random angle between -PI and PI
    *  @return {number} */
    angle() { return this.float(-PI, PI); }

    /** Returns a seeded vec2 with size between the two values passed in
    *  @param {number} valueA
    *  @param {number} [valueB]
    *  @return {Vector2} */
    vec2(valueA=1, valueB=0)
    { return vec2(this.float(valueA, valueB), this.float(valueA, valueB)); }

    /** Returns a random color between the two passed in colors, combine components if linear
    *  @param {Color}   [colorA=(1,1,1,1)]
    *  @param {Color}   [colorB=(0,0,0,1)]
    *  @param {boolean} [linear]
    *  @return {Color} */
    randColor(colorA=new Color, colorB=new Color(0,0,0,1), linear=false)
    {
        return linear ? colorA.lerp(colorB, this.float()) :
            new Color(
                this.float(colorA.r,colorB.r), 
                this.float(colorA.g,colorB.g), 
                this.float(colorA.b,colorB.b), 
                this.float(colorA.a,colorB.a));
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {Color} color
     * @param {number} [amount]
     * @param {number} [alphaAmount]
     * @return {Color} */
    mutateColor(color, amount=.05, alphaAmount=0)
    {
        ASSERT_NUMBER_VALID(amount);
        ASSERT_NUMBER_VALID(alphaAmount);
        return new Color
        (
            color.r + this.float(amount, -amount),
            color.g + this.float(amount, -amount),
            color.b + this.float(amount, -amount),
            color.a + this.float(alphaAmount, -alphaAmount)
        ).clamp();
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a 2d vector, can take 1 or 2 scalar values
 * @param {number} [x]
 * @param {number} [y] - if y is undefined, x is used for both
 * @return {Vector2}
 * @example
 * let a = vec2(0, 1); // vector with coordinates (0, 1)
 * a = vec2(5);        // set a to (5, 5)
 * b = vec2();         // set b to (0, 0)
 * @memberof Utilities */
function vec2(x=0, y) { return new Vector2(x, y === undefined ? x : y); }

/**
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {boolean}
 * @memberof Utilities */
function isVector2(v) { return v instanceof Vector2 && v.isValid(); }

// vector2 asserts
function ASSERT_VECTOR2_VALID(v) { ASSERT(isVector2(v), 'Vector2 is invalid.', v); }
function ASSERT_NUMBER_VALID(n) { ASSERT(isNumber(n), 'Number is invalid.', n); }
function ASSERT_VECTOR2_NORMAL(v)
{
    ASSERT_VECTOR2_VALID(v);
    ASSERT(abs(v.lengthSquared()-1) < .01, 'Vector2 is not normal.', v);
}

/**
 * 2D Vector object with vector math library
 * - Functions do not change this so they can be chained together
 * @memberof Engine
 * @example
 * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
 * let b = new Vector2;       // vector with coordinates (0, 0)
 * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
 * let d = a.add(b).scale(5); // operators can be chained
 */
class Vector2
{
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {number} [x] - X axis location
     *  @param {number} [y] - Y axis location */
    constructor(x=0, y=0)
    {
        /** @property {number} - X axis location */
        this.x = x;
        /** @property {number} - Y axis location */
        this.y = y;
        ASSERT(this.isValid(), 'Constructed Vector2 is invalid.', this);
    }

    /** Sets values of this vector and returns self
     *  @param {number} [x] - X axis location
     *  @param {number} [y] - Y axis location
     *  @return {Vector2} */
    set(x=0, y=0)
    {
        this.x = x;
        this.y = y;
        ASSERT_VECTOR2_VALID(this);
        return this;
    }

    /** Sets this vector from another vector and returns self
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    setFrom(v) { return this.set(v.x, v.y); }

    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    copy() { return new Vector2(this.x, this.y); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    add(v) { return new Vector2(this.x + v.x, this.y + v.y);}

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    multiply(v) { return new Vector2(this.x * v.x, this.y * v.y); }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    divide(v) { return new Vector2(this.x / v.x, this.y / v.y); }

    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {number} s - scale
     *  @return {Vector2} */
    scale(s) { return new Vector2(this.x * s, this.y * s); }

    /** Returns the length of this vector
     * @return {number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     * @return {number} */
    lengthSquared() { return this.x**2 + this.y**2; }

    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    distance(v) { return this.distanceSquared(v)**.5; }

    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    distanceSquared(v) { return (this.x - v.x)**2 + (this.y - v.y)**2; }

    /** Returns a new vector in same direction as this one with the length passed in
     * @param {number} [length]
     * @return {Vector2} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector2(0, length);
    }

    /** Returns a new vector clamped to length passed in
     * @param {number} [length]
     * @return {Vector2} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this.copy();
    }

    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    dot(v) { return this.x*v.x + this.y*v.y; }

    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    cross(v) { return this.x*v.y - this.y*v.x; }

    /** Returns a copy this vector reflected by the surface normal
     * @param {Vector2} normal - surface normal (should be normalized)
     * @param {number} restitution - how much to bounce, 1 is perfect bounce, 0 is no bounce
     * @return {Vector2} */
    reflect(normal, restitution=1)
    { return this.subtract(normal.scale((1+restitution)*this.dot(normal))); }

    /** Returns the clockwise angle of this vector, up is angle 0
     * @return {number} */
    angle() { return atan2(this.x, this.y); }

    /** Sets this vector with clockwise angle and length passed in
     * @param {number} [angle]
     * @param {number} [length]
     * @return {Vector2} */
    setAngle(angle=0, length=1)
    {
        ASSERT_NUMBER_VALID(angle);
        ASSERT_NUMBER_VALID(length);
        this.x = length*sin(angle);
        this.y = length*cos(angle);
        return this;
    }

    /** Returns copy of this vector rotated by the clockwise angle passed in
     * @param {number} angle
     * @return {Vector2} */
    rotate(angle)
    {
        ASSERT_NUMBER_VALID(angle);
        const c = cos(-angle), s = sin(-angle);
        return new Vector2(this.x*c - this.y*s, this.x*s + this.y*c);
    }

    /** Sets this this vector to point in the specified integer direction (0-3), corresponding to multiples of 90 degree rotation
     * @param {number} [direction]
     * @param {number} [length]
     * @return {Vector2} */
    setDirection(direction, length=1)
    {
        ASSERT_NUMBER_VALID(direction);
        ASSERT_NUMBER_VALID(length);
        direction = mod(direction, 4);
        ASSERT(direction===0 || direction===1 || direction===2 || direction===3,
            'Vector2.setDirection() direction must be an integer between 0 and 3.');
        
        this.x = direction%2 ? direction-1 ? -length : length : 0;
        this.y = direction%2 ? 0 : direction ? -length : length;
        return this;
    }

    /** Returns the integer direction of this vector, corresponding to multiples of 90 degree rotation (0-3)
     * @return {number} */
    direction()
    { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

    /** Returns a copy of this vector with absolute values
     * @return {Vector2} */
    abs() { return new Vector2(abs(this.x), abs(this.y)); }

    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    floor() { return new Vector2(floor(this.x), floor(this.y)); }

    /** Returns new vec2 with modded values
    *  @param {number} [divisor]
    *  @return {Vector2} */
    mod(divisor=1)
    { return new Vector2(mod(this.x, divisor), mod(this.y, divisor)); }

    /** Returns the area this vector covers as a rectangle
     * @return {number} */
    area() { return abs(this.x * this.y); }

    /** Returns true if this vector is (0,0)
     * @return {boolean} */
    isZero() { return !this.x && !this.y; }

    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} v - other vector
     * @param {number}  percent
     * @return {Vector2} */
    lerp(v, percent)
    {
        ASSERT_VECTOR2_VALID(v);
        ASSERT_NUMBER_VALID(percent);
        const p = clamp(percent);
        return new Vector2(v.x*p + this.x*(1-p), v.y*p + this.y*(1-p));
    }

    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {boolean} */
    arrayCheck(arraySize)
    { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; }

    /** Returns this vector expressed as a string
     * @param {number} digits - precision to display
     * @return {string} */
    toString(digits=3)
    {
        ASSERT_NUMBER_VALID(digits);
        if (this.isValid())
            return `(${(this.x<0?'':' ') + this.x.toFixed(digits)},${(this.y<0?'':' ') + this.y.toFixed(digits)} )`;
        else
            return `(${this.x}, ${this.y})`;
    }

    /** Checks if this is a valid vector
     * @return {boolean} */
    isValid() { return isNumber(this.x) && isNumber(this.y); }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a color object with RGBA values, white by default
 * @param {number} [r=1] - red
 * @param {number} [g=1] - green
 * @param {number} [b=1] - blue
 * @param {number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities
 */
function rgb(r, g, b, a) { return new Color(r, g, b, a); }

/**
 * Create a color object with HSLA values, white by default
 * @param {number} [h=0] - hue
 * @param {number} [s=0] - saturation
 * @param {number} [l=1] - lightness
 * @param {number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities */
function hsl(h, s, l, a) { return new Color().setHSLA(h, s, l, a); }

/**
 * Check if object is a valid Color
 * @param {any} c
 * @return {boolean}
 * @memberof Utilities */
function isColor(c) { return c instanceof Color && c.isValid(); }

// color asserts
function ASSERT_COLOR_VALID(c) { ASSERT(isColor(c), 'Color is invalid.', c); }

/**
 * Color object (red, green, blue, alpha) with some helpful functions
 * @memberof Engine
 * @example
 * let a = new Color;              // white
 * let b = new Color(1, 0, 0);     // red
 * let c = new Color(0, 0, 0, 0);  // transparent black
 * let d = rgb(0, 0, 1);         // blue using rgb color
 * let e = hsl(.3, 1, .5);         // green using hsl color
 */
class Color
{
    /** Create a color with the rgba components passed in, white by default
     *  @param {number} [r] - red
     *  @param {number} [g] - green
     *  @param {number} [b] - blue
     *  @param {number} [a] - alpha*/
    constructor(r=1, g=1, b=1, a=1)
    {
        /** @property {number} - Red */
        this.r = r;
        /** @property {number} - Green */
        this.g = g;
        /** @property {number} - Blue */
        this.b = b;
        /** @property {number} - Alpha */
        this.a = a;
        ASSERT(this.isValid(), 'Constructed Color is invalid.', this);
    }

    /** Sets values of this color and returns self
     *  @param {number} [r] - red
     *  @param {number} [g] - green
     *  @param {number} [b] - blue
     *  @param {number} [a] - alpha
     *  @return {Color} */
    set(r=1, g=1, b=1, a=1)
    {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Sets this color from another color and returns self
     * @param {Color} c - other color
     * @return {Color} */
    setFrom(c) { return this.set(c.r, c.g, c.b, c.a); }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

    /** Returns a copy of this color plus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    add(c) { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }

    /** Returns a copy of this color minus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }

    /** Returns a copy of this color times the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }

    /** Returns a copy of this color divided by the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    divide(c) { return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a); }

    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {number} scale
     * @param {number} [alphaScale=scale]
     * @return {Color} */
    scale(scale, alphaScale=scale)
    { return new Color(this.r*scale, this.g*scale, this.b*scale, this.a*alphaScale); }

    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }

    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color}  c - other color
     * @param {number} percent
     * @return {Color} */
    lerp(c, percent)
    {
        ASSERT_COLOR_VALID(c);
        ASSERT_NUMBER_VALID(percent);
        const p = clamp(percent);
        return new Color(
            c.r*p + this.r*(1-p),
            c.g*p + this.g*(1-p),
            c.b*p + this.b*(1-p),
            c.a*p + this.a*(1-p));
    }

    /** Sets this color given a hue, saturation, lightness, and alpha
     * @param {number} [h] - hue
     * @param {number} [s] - saturation
     * @param {number} [l] - lightness
     * @param {number} [a] - alpha
     * @return {Color} */
    setHSLA(h=0, s=0, l=1, a=1)
    {
        h = mod(h,1);
        s = clamp(s);
        l = clamp(l);
        const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q,
            f = (p, q, t)=>
                (t = mod(t,1))*6 < 1 ? p+(q-p)*6*t :
                t*2 < 1 ? q :
                t*3 < 2 ? p+(q-p)*(4-t*6) : p;
        this.r = f(p, q, h + 1/3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1/3);
        this.a = a;
        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Returns this color expressed in hsla format
     * @return {Array<number>} */
    HSLA()
    {
        const r = clamp(this.r);
        const g = clamp(this.g);
        const b = clamp(this.b);
        const a = clamp(this.a);
        const maxC = max(r, g, b);
        const minC = min(r, g, b);
        const l = (maxC + minC) / 2;
        let h = 0, s = 0;
        if (maxC !== minC)
        {
            let d = maxC - minC;
            s = l > .5 ? d / (2 - maxC - minC) : d / (maxC + minC);
            if (r === maxC)
                h = (g - b) / d + (g < b ? 6 : 0);
            else if (g === maxC)
                h = (b - r) / d + 2;
            else if (b === maxC)
                h =  (r - g) / d + 4;
        }
        return [h / 6, s, l, a];
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {number} [amount]
     * @param {number} [alphaAmount]
     * @return {Color} */
    mutate(amount=.05, alphaAmount=0)
    {
        ASSERT_NUMBER_VALID(amount);
        ASSERT_NUMBER_VALID(alphaAmount);
        return new Color
        (
            this.r + rand(amount, -amount),
            this.g + rand(amount, -amount),
            this.b + rand(amount, -amount),
            this.a + rand(alphaAmount, -alphaAmount)
        ).clamp();
    }

    /** Returns this color expressed as a hex color code
     * @param {boolean} [useAlpha] - if alpha should be included in result
     * @return {string} */
    toString(useAlpha = true)
    {
        if (debug && !this.isValid())
            return `#000`;
        const toHex = (c)=> ((c=clamp(c)*255|0)<16 ? '0' : '') + c.toString(16);
        return '#' + toHex(this.r) + toHex(this.g) + toHex(this.b) + (useAlpha ? toHex(this.a) : '');
    }

    /** Set this color from a hex code
     * @param {string} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        ASSERT(isString(hex), 'Color hex code must be a string');
        ASSERT(hex[0] === '#', 'Color hex code must start with #');
        ASSERT([4,5,7,9].includes(hex.length), 'Invalid hex');

        if (hex.length < 6)
        {
            const fromHex = (c)=> clamp(parseInt(hex[c],16)/15);
            this.r = fromHex(1);
            this.g = fromHex(2);
            this.b = fromHex(3);
            this.a = hex.length === 5 ? fromHex(4) : 1;
        }
        else
        {
            const fromHex = (c)=> clamp(parseInt(hex.slice(c,c+2),16)/255);
            this.r = fromHex(1);
            this.g = fromHex(3);
            this.b = fromHex(5);
            this.a = hex.length === 9 ? fromHex(7) : 1;
        }

        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Returns this color expressed as 32 bit RGBA value
     * @return {number} */
    rgbaInt()
    {
        const r = clamp(this.r)*255|0;
        const g = clamp(this.g)*255<<8;
        const b = clamp(this.b)*255<<16;
        const a = clamp(this.a)*255<<24;
        return r + g + b + a;
    }

    /** Checks if this is a valid color
     * @return {boolean} */
    isValid()
    { return isNumber(this.r) && isNumber(this.g) && isNumber(this.b) && isNumber(this.a); }
}

///////////////////////////////////////////////////////////////////////////////
// Default Colors

/** Color - White #ffffff
 *  @type {Color}
 *  @memberof Utilities */
const WHITE = debugProtectConstant(rgb());

/** Color - Clear White #757474ff with 0 alpha
 *  @type {Color}
 *  @memberof Utilities */
const CLEAR_WHITE = debugProtectConstant(rgb(1,1,1,0));

/** Color - Black #000000
 *  @type {Color}
 *  @memberof Utilities */
const BLACK = debugProtectConstant(rgb(0,0,0));

/** Color - Clear Black #000000 with 0 alpha
 *  @type {Color}
 *  @memberof Utilities */
const CLEAR_BLACK = debugProtectConstant(rgb(0,0,0,0));

/** Color - Gray #808080
 *  @type {Color}
 *  @memberof Utilities */
const GRAY = debugProtectConstant(rgb(.5,.5,.5));

/** Color - Red #ff0000
 *  @type {Color}
 *  @memberof Utilities */
const RED = debugProtectConstant(rgb(1,0,0));

/** Color - Orange #ff8000
 *  @type {Color}
 *  @memberof Utilities */
const ORANGE = debugProtectConstant(rgb(1,.5,0));

/** Color - Yellow #ffff00
 *  @type {Color}
 *  @memberof Utilities */
const YELLOW = debugProtectConstant(rgb(1,1,0));

/** Color - Green #00ff00
 *  @type {Color}
 *  @memberof Utilities */
const GREEN = debugProtectConstant(rgb(0,1,0));

/** Color - Cyan #00ffff
 *  @type {Color}
 *  @memberof Utilities */
const CYAN = debugProtectConstant(rgb(0,1,1));

/** Color - Blue #0000ff
 *  @type {Color}
 *  @memberof Utilities */
const BLUE = debugProtectConstant(rgb(0,0,1));

/** Color - Purple #8000ff
 *  @type {Color}
 *  @memberof Utilities */
const PURPLE = debugProtectConstant(rgb(.5,0,1));

/** Color - Magenta #ff00ff
 *  @type {Color}
 *  @memberof Utilities */
const MAGENTA = debugProtectConstant(rgb(1,0,1));

///////////////////////////////////////////////////////////////////////////////

/**
 * Timer object tracks how long has passed since it was set
 * @memberof Engine
 * @example
 * let a = new Timer;    // creates a timer that is not set
 * a.set(3);             // sets the timer to 3 seconds
 *
 * let b = new Timer(1); // creates a timer with 1 second left
 * b.unset();            // unset the timer
 */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {number} [timeLeft] - How much time left before the timer 
     *  @param {boolean} [useRealTime] - Should the timer keep running even when the game is paused? (useful for UI) */
    constructor(timeLeft, useRealTime=false)
    {
        ASSERT(timeLeft === undefined || isNumber(timeLeft), 'Constructed Timer is invalid.', timeLeft);
        this.useRealTime = useRealTime;
        const globalTime = this.getGlobalTime();
        this.time = timeLeft === undefined ? undefined : globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set the timer with seconds passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0)
    {
        ASSERT(isNumber(timeLeft), 'Timer is invalid.', timeLeft);
        const globalTime = this.getGlobalTime();
        this.time = globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set if the timer should keep running even when the game is paused
     *  @param {boolean} [useRealTime] */
    setUseRealTime(useRealTime=true)
    {
        ASSERT(!this.isSet(), 'Cannot change global time setting while timer is set.');
        this.useRealTime = useRealTime;
    }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {boolean} */
    isSet() { return this.time !== undefined; }

    /** Returns true if set and has not elapsed
     * @return {boolean} */
    active() { return this.getGlobalTime() < this.time; }

    /** Returns true if set and elapsed
     * @return {boolean} */
    elapsed() { return this.getGlobalTime() >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    get() { return this.isSet()? this.getGlobalTime() - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {number} */
    getPercent() { return this.isSet()? 1-percent(this.time - this.getGlobalTime(), 0, this.setTime) : 0; }

    /** Get the time this timer was set to, returns 0 if not set
     * @return {number} */
    getSetTime() { return this.isSet() ? this.setTime : 0; }

    /** Get the current global time this timer is based on
     * @return {number} */
    getGlobalTime() { return this.useRealTime ? timeReal : time; }

    /** Returns this timer expressed as a string
     * @return {string} */
    toString() { return this.isSet() ? abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    valueOf() { return this.get(); }
}