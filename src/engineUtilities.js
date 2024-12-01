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

/** A shortcut to get Math.PI
 *  @type {Number}
 *  @default Math.PI
 *  @memberof Utilities */
const PI = Math.PI;

/** Returns absoulte value of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function abs(value) { return Math.abs(value); }

/** Returns lowest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function min(valueA, valueB) { return Math.min(valueA, valueB); }

/** Returns highest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function max(valueA, valueB) { return Math.max(valueA, valueB); }

/** Returns the sign of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function sign(value) { return Math.sign(value); }

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {Number} dividend
 *  @param {Number} [divisor]
 *  @return {Number}
 *  @memberof Utilities */
function mod(dividend, divisor=1) { return ((dividend % divisor) + divisor) % divisor; }

/** Clamps the value beween max and min
 *  @param {Number} value
 *  @param {Number} [min]
 *  @param {Number} [max]
 *  @return {Number}
 *  @memberof Utilities */
function clamp(value, min=0, max=1) { return value < min ? min : value > max ? max : value; }

/** Returns what percentage the value is between valueA and valueB
 *  @param {Number} value
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function percent(value, valueA, valueB)
{ return (valueB-=valueA) ? clamp((value-valueA)/valueB) : 0; }

/** Linearly interpolates between values passed in using percent
 *  @param {Number} percent
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function lerp(percent, valueA, valueB) { return valueA + clamp(percent) * (valueB-valueA); }

/** Returns signed wrapped distance between the two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @param {Number} [wrapSize]
 *  @returns {Number}
 *  @memberof Utilities */
function distanceWrap(valueA, valueB, wrapSize=1)
{ const d = (valueA - valueB) % wrapSize; return d*2 % wrapSize - d; }

/** Linearly interpolates between values passed in with wrapping
 *  @param {Number} percent
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @param {Number} [wrapSize]
 *  @returns {Number}
 *  @memberof Utilities */
function lerpWrap(percent, valueA, valueB, wrapSize=1)
{ return valueB + clamp(percent) * distanceWrap(valueA, valueB, wrapSize); }

/** Returns signed wrapped distance between the two angles passed in
 *  @param {Number} angleA
 *  @param {Number} angleB
 *  @returns {Number}
 *  @memberof Utilities */
function distanceAngle(angleA, angleB) { return distanceWrap(angleA, angleB, 2*PI); }

/** Linearly interpolates between the angles passed in with wrapping
 *  @param {Number} percent
 *  @param {Number} angleA
 *  @param {Number} angleB
 *  @returns {Number}
 *  @memberof Utilities */
function lerpAngle(percent, angleA, angleB) { return lerpWrap(percent, angleA, angleB, 2*PI); }

/** Applies smoothstep function to the percentage value
 *  @param {Number} percent
 *  @return {Number}
 *  @memberof Utilities */
function smoothStep(percent) { return percent * percent * (3 - 2 * percent); }

/** Returns the nearest power of two not less then the value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function nearestPowerOfTwo(value) { return 2**Math.ceil(Math.log2(value)); }

/** Returns true if two axis aligned bounding boxes are overlapping 
 *  @param {Vector2} posA          - Center of box A
 *  @param {Vector2} sizeA         - Size of box A
 *  @param {Vector2} posB          - Center of box B
 *  @param {Vector2} [sizeB=(0,0)] - Size of box B, a point if undefined
 *  @return {Boolean}              - True if overlapping
 *  @memberof Utilities */
function isOverlapping(posA, sizeA, posB, sizeB=vec2())
{ 
    return abs(posA.x - posB.x)*2 < sizeA.x + sizeB.x 
        && abs(posA.y - posB.y)*2 < sizeA.y + sizeB.y;
}

/** Returns true if a line segment is intersecting an axis aligned box
 *  @param {Vector2} start - Start of raycast
 *  @param {Vector2} end   - End of raycast
 *  @param {Vector2} pos   - Center of box
 *  @param {Vector2} size  - Size of box
 *  @return {Boolean}      - True if intersecting
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
 *  @param {Number} [frequency] - Frequency of the wave in Hz
 *  @param {Number} [amplitude] - Amplitude (max height) of the wave
 *  @param {Number} [t=time]    - Value to use for time of the wave
 *  @return {Number}            - Value waving between 0 and amplitude
 *  @memberof Utilities */
function wave(frequency=1, amplitude=1, t=time)
{ return amplitude/2 * (1 - Math.cos(t*frequency*2*PI)); }

/** Formats seconds to mm:ss style for display purposes 
 *  @param {Number} t - time in seconds
 *  @return {String}
 *  @memberof Utilities */
function formatTime(t) { return (t/60|0) + ':' + (t%60<10?'0':'') + (t%60|0); }

///////////////////////////////////////////////////////////////////////////////

/** Random global functions
 *  @namespace Random */

/** Returns a random value between the two values passed in
 *  @param {Number} [valueA]
 *  @param {Number} [valueB]
 *  @return {Number}
 *  @memberof Random */
function rand(valueA=1, valueB=0) { return valueB + Math.random() * (valueA-valueB); }

/** Returns a floored random value between the two values passed in
 *  The upper bound is exclusive. (If 2 is passed in, result will be 0 or 1)
 *  @param {Number} valueA
 *  @param {Number} [valueB]
 *  @return {Number}
 *  @memberof Random */
function randInt(valueA, valueB=0) { return Math.floor(rand(valueA,valueB)); }

/** Randomly returns either -1 or 1
 *  @return {Number}
 *  @memberof Random */
function randSign() { return randInt(2) * 2 - 1; }

/** Returns a random Vector2 with the passed in length
 *  @param {Number} [length]
 *  @return {Vector2}
 *  @memberof Random */
function randVector(length=1) { return new Vector2().setAngle(rand(2*PI), length); }

/** Returns a random Vector2 within a circular shape
 *  @param {Number} [radius]
 *  @param {Number} [minRadius]
 *  @return {Vector2}
 *  @memberof Random */
function randInCircle(radius=1, minRadius=0)
{ return radius > 0 ? randVector(radius * rand(minRadius / radius, 1)**.5) : new Vector2; }

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=(1,1,1,1)]
 *  @param {Color}   [colorB=(0,0,0,1)]
 *  @param {Boolean} [linear]
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
     *  @param {Number} seed - Starting seed */
    constructor(seed)
    {
        /** @property {Number} - random seed */
        this.seed = seed;
    }

    /** Returns a seeded random value between the two values passed in
    *  @param {Number} [valueA]
    *  @param {Number} [valueB]
    *  @return {Number} */
    float(valueA=1, valueB=0)
    {
        // xorshift algorithm
        this.seed ^= this.seed << 13; 
        this.seed ^= this.seed >>> 17; 
        this.seed ^= this.seed << 5;
        return valueB + (valueA - valueB) * abs(this.seed % 1e8) / 1e8;
    }

    /** Returns a floored seeded random value the two values passed in
    *  @param {Number} valueA
    *  @param {Number} [valueB]
    *  @return {Number} */
    int(valueA, valueB=0) { return Math.floor(this.float(valueA, valueB)); }

    /** Randomly returns either -1 or 1 deterministically
    *  @return {Number} */
    sign() { return this.float() > .5 ? 1 : -1; }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
 * @param {(Number|Vector2)} [x]
 * @param {Number} [y]
 * @return {Vector2}
 * @example
 * let a = vec2(0, 1); // vector with coordinates (0, 1)
 * let b = vec2(a);    // copy a into b
 * a = vec2(5);        // set a to (5, 5)
 * b = vec2();         // set b to (0, 0)
 * @memberof Utilities
 */
function vec2(x=0, y)
{
    return typeof x == 'number' ? 
        new Vector2(x, y == undefined? x : y) : 
        new Vector2(x.x, x.y);
}

/** 
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {Boolean}
 * @memberof Utilities
 */
function isVector2(v) { return v instanceof Vector2; }

/** 
 * 2D Vector object with vector math library
 * - Functions do not change this so they can be chained together
 * @example
 * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
 * let b = new Vector2;       // vector with coordinates (0, 0)
 * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
 * let d = a.add(b).scale(5); // operators can be chained
 */
class Vector2
{
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {Number} [x] - X axis location
     *  @param {Number} [y] - Y axis location */
    constructor(x=0, y=0)
    {
        ASSERT(typeof x == 'number' && typeof y == 'number');
        /** @property {Number} - X axis location */
        this.x = x;
        /** @property {Number} - Y axis location */
        this.y = y;
    }

    /** Sets values of this vector and returns self
     *  @param {Number} [x] - X axis location
     *  @param {Number} [y] - Y axis location
     *  @return {Vector2} */
    set(x=0, y=0) { this.x=x; this.y=y; return this; }

    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    copy() { return new Vector2(this.x, this.y); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    add(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    subtract(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    multiply(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x * v.x, this.y * v.y);
    }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    divide(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x / v.x, this.y / v.y);
    }

    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {Number} s - scale
     *  @return {Vector2} */
    scale(s)
    {
        ASSERT(!isVector2(s));
        return new Vector2(this.x * s, this.y * s);
    }

    /** Returns the length of this vector
     * @return {Number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     * @return {Number} */
    lengthSquared() { return this.x**2 + this.y**2; }

    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    distance(v)
    {
        ASSERT(isVector2(v));
        return this.distanceSquared(v)**.5;
    }

    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    distanceSquared(v)
    {
        ASSERT(isVector2(v));
        return (this.x - v.x)**2 + (this.y - v.y)**2;
    }

    /** Returns a new vector in same direction as this one with the length passed in
     * @param {Number} [length]
     * @return {Vector2} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector2(0, length);
    }

    /** Returns a new vector clamped to length passed in
     * @param {Number} [length]
     * @return {Vector2} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this;
    }

    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    dot(v)
    {
        ASSERT(isVector2(v));
        return this.x*v.x + this.y*v.y;
    }

    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    cross(v)
    {
        ASSERT(isVector2(v));
        return this.x*v.y - this.y*v.x;
    }

    /** Returns the angle of this vector, up is angle 0
     * @return {Number} */
    angle() { return Math.atan2(this.x, this.y); }

    /** Sets this vector with angle and length passed in
     * @param {Number} [angle]
     * @param {Number} [length]
     * @return {Vector2} */
    setAngle(angle=0, length=1) 
    {
        this.x = length*Math.sin(angle);
        this.y = length*Math.cos(angle);
        return this;
    }

    /** Returns copy of this vector rotated by the angle passed in
     * @param {Number} angle
     * @return {Vector2} */
    rotate(angle)
    { 
        const c = Math.cos(angle), s = Math.sin(angle); 
        return new Vector2(this.x*c - this.y*s, this.x*s + this.y*c);
    }

    /** Set the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @param {Number} [direction]
     * @param {Number} [length] */
    setDirection(direction, length=1)
    {
        direction = mod(direction, 4);
        ASSERT(direction==0 || direction==1 || direction==2 || direction==3);
        return vec2(direction%2 ? direction-1 ? -length : length : 0, 
            direction%2 ? 0 : direction ? -length : length);
    }

    /** Returns the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @return {Number} */
    direction()
    { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

    /** Returns a copy of this vector that has been inverted
     * @return {Vector2} */
    invert() { return new Vector2(this.y, -this.x); }

    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    floor() { return new Vector2(Math.floor(this.x), Math.floor(this.y)); }

    /** Returns the area this vector covers as a rectangle
     * @return {Number} */
    area() { return abs(this.x * this.y); }

    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} v - other vector
     * @param {Number}  percent
     * @return {Vector2} */
    lerp(v, percent)
    {
        ASSERT(isVector2(v));
        return this.add(v.subtract(this).scale(clamp(percent)));
    }

    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {Boolean} */
    arrayCheck(arraySize)
    {
        ASSERT(isVector2(arraySize));
        return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y;
    }

    /** Returns this vector expressed as a string
     * @param {Number} digits - precision to display
     * @return {String} */
    toString(digits=3) 
    {
        if (debug)
            return `(${(this.x<0?'':' ') + this.x.toFixed(digits)},${(this.y<0?'':' ') + this.y.toFixed(digits)} )`;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Create a color object with RGBA values, white by default
 * @param {Number} [r=1] - red
 * @param {Number} [g=1] - green
 * @param {Number} [b=1] - blue
 * @param {Number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities
 */
function rgb(r, g, b, a) { return new Color(r, g, b, a); }

/** 
 * Create a color object with HSLA values, white by default
 * @param {Number} [h=0] - hue
 * @param {Number} [s=0] - saturation
 * @param {Number} [l=1] - lightness
 * @param {Number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities
 */
function hsl(h, s, l, a) { return new Color().setHSLA(h, s, l, a); }

/** 
 * Check if object is a valid Color
 * @param {any} c
 * @return {Boolean}
 * @memberof Utilities
 */
function isColor(c) { return c instanceof Color; }

/** 
 * Color object (red, green, blue, alpha) with some helpful functions
 * @example
 * let a = new Color;              // white
 * let b = new Color(1, 0, 0);     // red
 * let c = new Color(0, 0, 0, 0);  // transparent black
 * let d = rgb(0, 0, 1);           // blue using rgb color
 * let e = hsl(.3, 1, .5);         // green using hsl color
 */
class Color
{
    /** Create a color with the rgba components passed in, white by default
     *  @param {Number} [r] - red
     *  @param {Number} [g] - green
     *  @param {Number} [b] - blue
     *  @param {Number} [a] - alpha*/
    constructor(r=1, g=1, b=1, a=1)
    {
        /** @property {Number} - Red */
        this.r = r;
        /** @property {Number} - Green */
        this.g = g;
        /** @property {Number} - Blue */
        this.b = b;
        /** @property {Number} - Alpha */
        this.a = a;
    }

    /** Sets values of this color and returns self
     *  @param {Number} [r] - red
     *  @param {Number} [g] - green
     *  @param {Number} [b] - blue
     *  @param {Number} [a] - alpha
     *  @return {Color} */
    set(r=1, g=1, b=1, a=1)
    { this.r=r; this.g=g; this.b=b; this.a=a; return this; }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

    /** Returns a copy of this color plus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    add(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a);
    }

    /** Returns a copy of this color minus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    subtract(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a);
    }

    /** Returns a copy of this color times the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    multiply(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a);
    }

    /** Returns a copy of this color divided by the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    divide(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a);
    }

    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {Number} scale
     * @param {Number} [alphaScale=scale]
     * @return {Color} */
    scale(scale, alphaScale=scale) 
    { return new Color(this.r*scale, this.g*scale, this.b*scale, this.a*alphaScale); }

    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }

    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color}  c - other color
     * @param {Number} percent
     * @return {Color} */
    lerp(c, percent)
    {
        ASSERT(isColor(c));
        return this.add(c.subtract(this).scale(clamp(percent)));
    }

    /** Sets this color given a hue, saturation, lightness, and alpha
     * @param {Number} [h] - hue
     * @param {Number} [s] - saturation
     * @param {Number} [l] - lightness
     * @param {Number} [a] - alpha
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
        return this;
    }

    /** Returns this color expressed in hsla format
     * @return {Array} */
    HSLA()
    {
        const r = clamp(this.r);
        const g = clamp(this.g);
        const b = clamp(this.b);
        const a = clamp(this.a);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        
        let h = 0, s = 0;
        if (max != min)
        {
            let d = max - min;
            s = l > .5 ? d / (2 - max - min) : d / (max + min);
            if (r == max)
                h = (g - b) / d + (g < b ? 6 : 0);
            else if (g == max)
                h = (b - r) / d + 2;
            else if (b == max)
                h =  (r - g) / d + 4;
        }

        return [h / 6, s, l, a];
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {Number} [amount]
     * @param {Number} [alphaAmount]
     * @return {Color} */
    mutate(amount=.05, alphaAmount=0) 
    {
        return new Color
        (
            this.r + rand(amount, -amount),
            this.g + rand(amount, -amount),
            this.b + rand(amount, -amount),
            this.a + rand(alphaAmount, -alphaAmount)
        ).clamp();
    }

    /** Returns this color expressed as a hex color code
     * @param {Boolean} [useAlpha] - if alpha should be included in result
     * @return {String} */
    toString(useAlpha = true)      
    { 
        const toHex = (c)=> ((c=clamp(c)*255|0)<16 ? '0' : '') + c.toString(16);
        return '#' + toHex(this.r) + toHex(this.g) + toHex(this.b) + (useAlpha ? toHex(this.a) : '');
    }
    
    /** Set this color from a hex code
     * @param {String} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        const fromHex = (c)=> clamp(parseInt(hex.slice(c,c+2),16)/255);
        this.r = fromHex(1);
        this.g = fromHex(3),
        this.b = fromHex(5);
        this.a = hex.length > 7 ? fromHex(7) : 1;
        return this;
    }
    
    /** Returns this color expressed as 32 bit RGBA value
     * @return {Number} */
    rgbaInt()  
    {
        const r = clamp(this.r)*255|0;
        const g = clamp(this.g)*255<<8;
        const b = clamp(this.b)*255<<16;
        const a = clamp(this.a)*255<<24;
        return r + g + b + a;
    }
}

///////////////////////////////////////////////////////////////////////////////
// default colors

/** Color - White
 *  @type {Color}
 *  @memberof Utilities */
const WHITE = rgb();

/** Color - Black
 *  @type {Color}
 *  @memberof Utilities */
const BLACK = rgb(0,0,0);

/** Color - Gray
 *  @type {Color}
 *  @memberof Utilities */
const GRAY = rgb(.5,.5,.5);

/** Color - Red
 *  @type {Color}
 *  @memberof Utilities */
const RED = rgb(1,0,0);

/** Color - Orange
 *  @type {Color}
 *  @memberof Utilities */
const ORANGE = rgb(1,.5,0);

/** Color - Yellow
 *  @type {Color}
 *  @memberof Utilities */
const YELLOW = rgb(1,1,0);

/** Color - Green
 *  @type {Color}
 *  @memberof Utilities */
const GREEN = rgb(0,1,0);

/** Color - Cyan
 *  @type {Color}
 *  @memberof Utilities */
const CYAN = rgb(0,1,1);

/** Color - Blue
 *  @type {Color}
 *  @memberof Utilities */
const BLUE = rgb(0,0,1);

/** Color - Purple
 *  @type {Color}
 *  @memberof Utilities */
const PURPLE = rgb(.5,0,1);

/** Color - Magenta
 *  @type {Color}
 *  @memberof Utilities */
const MAGENTA = rgb(1,0,1);

///////////////////////////////////////////////////////////////////////////////

/**
 * Timer object tracks how long has passed since it was set
 * @example
 * let a = new Timer;    // creates a timer that is not set
 * a.set(3);             // sets the timer to 3 seconds
 *
 * let b = new Timer(1); // creates a timer with 1 second left
 * b.unset();            // unsets the timer
 */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {Number} [timeLeft] - How much time left before the timer elapses in seconds */
    constructor(timeLeft) { this.time = timeLeft == undefined ? undefined : time + timeLeft; this.setTime = timeLeft; }

    /** Set the timer with seconds passed in
     *  @param {Number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0) { this.time = time + timeLeft; this.setTime = timeLeft; }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {Boolean} */
    isSet() { return this.time != undefined; }

    /** Returns true if set and has not elapsed
     * @return {Boolean} */
    active() { return time < this.time; }

    /** Returns true if set and elapsed
     * @return {Boolean} */
    elapsed() { return time >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {Number} */
    get() { return this.isSet()? time - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {Number} */
    getPercent() { return this.isSet()? percent(this.time - time, this.setTime, 0) : 0; }
    
    /** Returns this timer expressed as a string
     * @return {String} */
    toString() { if (debug) { return this.isSet() ? Math.abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }}
    
    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {Number} */
    valueOf()               { return this.get(); }
}