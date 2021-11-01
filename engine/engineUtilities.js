/**
 *  LittleJS Utility Classes and Functions
 *  <br> - General purpose math library
 *  <br> - Vector2 - fast, simple, easy 2D vector class
 *  <br> - Color - holds a rgba color with some math functions
 *  <br> - Timer - tracks time automatically
 *  @namespace Utilities
 */

'use strict';

/** A shortcut to get Math.PI
 *  @const
 *  @memberof Utilities */
const PI = Math.PI;

/** True if running a Chromium based browser
 *  @const
 *  @memberof Utilities */
const isChrome = window['chrome'];

/** Returns absoulte value of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
const abs = (a)=> a < 0 ? -a : a;

/** Returns the sign of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
const sign = (a)=> a < 0 ? -1 : 1;

/** Returns lowest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
const min = (a, b)=> a < b ?  a : b;

/** Returns highest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
const max = (a, b)=> a > b ?  a : b;

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {Number} dividend
 *  @param {Number} divisor
 *  @return {Number}
 *  @memberof Utilities */
const mod = (a, b)=> ((a % b) + b) % b;

/** Clamps the value beween max and min
 *  @param {Number} value
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
const clamp = (v, max=1, min=0)=> (ASSERT(max > min), v < min ? min : v > max ? max : v);

/** Returns what percentage the value is between max and min
 *  @param {Number} value
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
const percent = (v, max=1, min=0)=> max-min ? clamp((v-min) / (max-min)) : 0;

/** Linearly interpolates the percent value between max and min
 *  @param {Number} percent
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
const lerp = (p, max=1, min=0)=> min + clamp(p) * (max-min);

/** Formats seconds to 00:00 style for display purposes 
 *  @param {Number} t - time in seconds
 *  @return {String}
 *  @memberof Utilities */
const formatTime = (t)=> (t/60|0)+':'+(t%60<10?'0':'')+(t%60|0);

/** Returns the nearest power of two not less then the value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
const nearestPowerOfTwo = (v)=> 2**Math.ceil(Math.log2(v));

/** Applies smoothstep function to the percentage value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
const smoothStep = (p)=> p * p * (3 - 2 * p);

/** Returns true if two axis aligned bounding boxes are overlapping 
 *  @param {Vector2} pointA - Center of box A
 *  @param {Vector2} sizeA  - Size of box A
 *  @param {Vector2} pointB - Center of box B
 *  @param {Vector2} sizeB  - Size of box B
 *  @return {Boolean}       - True if overlapping
 *  @memberof Utilities */
const isOverlapping = (pA, sA, pB, sB)=> abs(pA.x - pB.x)*2 < sA.x + sB.x & abs(pA.y - pB.y)*2 < sA.y + sB.y;

/** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
 *  @param {Number} [frequency=1] - Frequency of the wave in Hz
 *  @param {Number} [amplitude=1] - Amplitude (max height) of the wave
 *  @param {Number} [t=time]      - Value to use for time of the wave
 *  @return {Number}              - Value waving between 0 and amplitude
 *  @memberof Utilities */
const wave = (frequency=1, amplitude=1, t=time)=> amplitude/2 * (1 - Math.cos(t*frequency*2*PI));

///////////////////////////////////////////////////////////////////////////////

/** Random global functions
 *  @namespace Random */

/** Returns a random value between the two values passed in
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
const rand = (a=1, b=0)=> b + (a-b)*Math.random();

/** Returns a floored random value the two values passed in
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
const randInt = (a=1, b=0)=> rand(a,b)|0;

/** Randomly returns either -1 or 1
 *  @return {Number}
 *  @memberof Random */
const randSign = ()=> (rand(2)|0)*2-1;

/** Returns a random Vector2 within a circular shape
 *  @param {Number} [radius=1]
 *  @param {Number} [minRadius=0]
 *  @return {Vector2}
 *  @memberof Random */
const randInCircle = (radius=1, minRadius=0)=> radius > 0 ? randVector(radius * rand(minRadius / radius, 1)**.5) : new Vector2;

/** Returns a random Vector2 with the passed in length
 *  @param {Number} [length=1]
 *  @return {Vector2}
 *  @memberof Random */
const randVector = (length=1)=> new Vector2().setAngle(rand(2*PI), length);

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color} [colorA=new Color(1,1,1,1)]
 *  @param {Color} [colorB=new Color(0,0,0,1)]
 *  @param {Boolean} [linear]
 *  @return {Color}
 *  @memberof Random */
const randColor = (cA = new Color, cB = new Color(0,0,0,1), linear)=>
    linear ? cA.lerp(cB, rand()) : new Color(rand(cA.r,cB.r),rand(cA.g,cB.g),rand(cA.b,cB.b),rand(cA.a,cB.a));

/** The seed used by the randSeeded function, should not be 0
 *  @memberof Random */
let randSeed = 1;

/** Returns a seeded random value between the two values passed in using randSeed
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
const randSeeded = (a=1, b=0)=>
{
    randSeed ^= randSeed << 13; randSeed ^= randSeed >>> 17; randSeed ^= randSeed << 5; // xorshift
    return b + (a-b)*abs(randSeed % 1e9)/1e9;
}

///////////////////////////////////////////////////////////////////////////////

/** Create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
 *  @param {Number} [x=0]
 *  @param {Number} [y=0]
 *  @return {Vector2}
 *  @memberof Utilities */
const vec2 = (x=0, y)=> x.x == undefined ? new Vector2(x, y == undefined? x : y) : new Vector2(x.x, x.y);

/** 2D Vector object with vector math library */
class Vector2
{
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {Number} [x=0] - x axis position
     *  @param {Number} [y=0] - y axis position */
    constructor(x=0, y=0) { this.x = x; this.y = y; }

    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    copy() { return new Vector2(this.x, this.y); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    add(v) { ASSERT(v.x!=undefined); return new Vector2(this.x + v.x, this.y + v.y); }

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    subtract(v) { ASSERT(v.x!=undefined); return new Vector2(this.x - v.x, this.y - v.y); }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    multiply(v) { ASSERT(v.x!=undefined); return new Vector2(this.x * v.x, this.y * v.y); }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    divide(v) { ASSERT(v.x!=undefined); return new Vector2(this.x / v.x, this.y / v.y); }

    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {Number} scale
     *  @return {Vector2} */
    scale(s) { ASSERT(s.x==undefined); return new Vector2(this.x * s, this.y * s); }

    /** Returns the length of this vector
     * @return {Number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     * @return {Number} */
    lengthSquared() { return this.x**2 + this.y**2; }

    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    distance(v) { return this.distanceSquared(v)**.5; }

    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    distanceSquared(v) { return (this.x - v.x)**2 + (this.y - v.y)**2; }

    /** Returns a new vector in same direction as this one with the length passed in
     * @param {Number} [length=1]
     * @return {Vector2} */
    normalize(length=1) { const l = this.length(); return l ? this.scale(length/l) : new Vector2(length); }

    /** Returns a new vector clamped to length passed in
     * @param {Number} [length=1]
     * @return {Vector2} */
    clampLength(length=1) { const l = this.length(); return l > length ? this.scale(length/l) : this; }

    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    dot(v) { ASSERT(v.x!=undefined); return this.x*v.x + this.y*v.y; }

    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    cross(v) { ASSERT(v.x!=undefined); return this.x*v.y - this.y*v.x; }

    /** Returns the angle of this vector, up is angle 0
     * @return {Number} */
    angle() { return Math.atan2(this.x, this.y); }

    /** Sets this vector with angle and length passed in
     * @param {Number} [angle=0]
     * @param {Number} [length=1] */
    setAngle(a=0, length=1) { this.x = length*Math.sin(a); this.y = length*Math.cos(a); return this; }

    /** Returns copy of this vector rotated by the angle passed in
     * @param {Number} angle
     * @return {Vector2} */
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); return new Vector2(this.x*c-this.y*s, this.x*s+this.y*c); }

    /** Returns the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @return {Number} */
    direction() { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

    /** Returns a copy of this vector that has been inverted
     * @return {Vector2} */
    invert() { return new Vector2(this.y, -this.x); }

    /** Returns a copy of this vector with the axies flipped
     * @return {Vector2} */
    flip() { return new Vector2(this.y, this.x); }

    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    floor() { return new Vector2(Math.floor(this.x), Math.floor(this.y)); }

    /** Returns the area this vector covers as a rectangle
     * @return {Number} */
    area() { return this.x * this.y; }

    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} vector
     * @param {Number} percent
     * @return {Vector2} */
    lerp(v, p) { ASSERT(v.x!=undefined); return this.add(v.subtract(this).scale(clamp(p))); }

    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {Boolean} */
    arrayCheck(arraySize) { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; } 
}

///////////////////////////////////////////////////////////////////////////////

/** Color object (red, green, blue, alpha) with some helpful functions */
class Color
{
    /** Create a color with the components passed in, white by default
     *  @param {Number} [r=1] - red
     *  @param {Number} [g=1] - green
     *  @param {Number} [b=1] - blue
     *  @param {Number} [a=1] - alpha */
    constructor(r=1, g=1, b=1, a=1) { this.r=r; this.g=g; this.b=b; this.a=a; }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

    /** Returns a copy of this color plus the color passed in
     * @param {Color} color
     * @return {Color} */
    add(c) { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }

    /** Returns a copy of this color minus the color passed in
     * @param {Color} color
     * @return {Color} */
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }

    /** Returns a copy of this color times the color passed in
     * @param {Color} color
     * @return {Color} */
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }

    /** Returns a copy of this color divided by the color passed in
     * @param {Color} color
     * @return {Color} */
    divide(c) { return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a); }

    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {Number} scale
     * @param {Number} [alphaScale=scale]
     * @return {Color} */
    scale(s, a=s) { return new Color(this.r*s, this.g*s, this.b*s, this.a*a); }

    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }

    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color} color
     * @param {Number} percent
     * @return {Color} */
    lerp(c, p) { return this.add(c.subtract(this).scale(clamp(p))); }

    /** Sets this color given a hue, saturation, lightness , and alpha
     * @param {Number} [hue=0]
     * @param {Number} [saturation=0]
     * @param {Number} [lightness=1]
     * @param {Number} [alpha=1]
     * @return {Color} */
    setHSLA(h=0, s=0, l=1, a=1)
    {
        const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q,
            f = (p, q, t)=>
                (t = ((t%1)+1)%1) < 1/6 ? p+(q-p)*6*t :
                t < 1/2 ? q :
                t < 2/3 ? p+(q-p)*(2/3-t)*6 : p;
                
        this.r = f(p, q, h + 1/3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1/3);
        this.a = a;
        return this;
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {Number} [amount=.05]
     * @param {Number} [alphaAmount=0]
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

    /** Returns this color expressed as an rgba string
     * @return {String} */
    rgba()      
    { 
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return `rgb(${this.r*255|0},${this.g*255|0},${this.b*255|0},${this.a})`; 
    }
    
    /** Returns this color expressed as 32 bit integer value
     * @return {Number} */
    rgbaInt()  
    {
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return (this.r*255|0) + (this.g*255<<8) + (this.b*255<<16) + (this.a*255<<24); 
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Timer object tracks how long has passed since it was set */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {Number} [timeLeft] - How much time left before the timer elapses in seconds */
    constructor(timeLeft) { this.time = timeLeft == undefined ? undefined : time + timeLeft; this.setTime = timeLeft; }

    /** Set the timer with seconds passed in
     *  @param {Number} [timeLeft=0] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0) { this.time = time + timeLeft; this.setTime = timeLeft; }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {Boolean} */
    isSet() { return this.time != undefined; }

    /** Returns true if set and has not elapsed
     * @return {Boolean} */
    active() { return time <= this.time; }

    /** Returns true if set and elapsed
     * @return {Boolean} */
    elapsed() { return time >  this.time; }

    /** Get how long since elapsed, returns 0 if not set
     * @return {Number} */
    get() { return this.isSet()? time - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {Number} */
    getPercent() { return this.isSet()? percent(this.time - time, 0, this.setTime) : 0; }
}