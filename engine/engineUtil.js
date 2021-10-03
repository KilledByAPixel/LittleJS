
/*
    LittleJS Utility Classes and Functions
    - Vector2 - fast, simple, easy vector class
    - Color - holds a rgba color with math functions
    - Timer - tracks time automatically
    - Small math lib
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// helper functions

const PI            = Math.PI;
const isChrome      = window['chrome'];
const abs           = (a)=>               a < 0 ? -a : a;
const sign          = (a)=>               a < 0 ? -1 : 1;
const min           = (a, b)=>            a < b ?  a : b;
const max           = (a, b)=>            a > b ?  a : b;
const mod           = (a, b)=>            ((a % b) + b) % b;
const clamp         = (v, max=1, min=0)=> (ASSERT(max > min), v < min ? min : v > max ? max : v);
const percent       = (v, max=1, min=0)=> max-min ? clamp((v-min) / (max-min)) : 0;
const lerp          = (p, max=1, min=0)=> min + clamp(p) * (max-min);
const formatTime    = (t)=>               (t/60|0)+':'+(t%60<10?'0':'')+(t%60|0);
const isOverlapping = (pA, sA, pB, sB)=>  abs(pA.x - pB.x)*2 < sA.x + sB.x & abs(pA.y - pB.y)*2 < sA.y + sB.y;
const nearestPowerOfTwo = (v)=>           2**Math.ceil(Math.log2(v));

// random functions
const rand         = (a=1, b=0)=>              b + (a-b)*Math.random();
const randInt      = (a=1, b=0)=>              rand(a,b)|0;
const randSign     = ()=>                      (rand(2)|0)*2-1;
const randInCircle = (radius=1, minRadius=0)=> radius > 0 ? randVector(radius * rand(minRadius / radius, 1)**.5) : new Vector2;
const randVector   = (length=1)=>              new Vector2().setAngle(rand(2*PI), length);
const randColor    = (cA = new Color, cB = new Color(0,0,0,1), linear)=>
    linear ?  cA.lerp(cB, rand()) : new Color(rand(cA.r,cB.r),rand(cA.g,cB.g),rand(cA.b,cB.b),rand(cA.a,cB.a));

// seeded random numbers using xorshift
let randSeed     = 1;
const randSeeded = (a=1, b=0)=>
{
    randSeed ^= randSeed << 13; randSeed ^= randSeed >>> 17; randSeed ^= randSeed << 5;
    return b + (a-b)*abs(randSeed % 1e9)/1e9;
}

// create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
const vec2 = (x=0, y)=> x.x == undefined? new Vector2(x, y == undefined? x : y) : new Vector2(x.x, x.y);

///////////////////////////////////////////////////////////////////////////////
class Vector2
{
    constructor(x=0, y=0) { this.x = x; this.y = y; }

    // basic math operators, a vector or scaler can be passed in
    copy()                { return new Vector2(this.x, this.y); }
    scale(s)              { ASSERT(s.x==undefined); return new Vector2(this.x * s, this.y * s); }
    add(v)                { ASSERT(v.x!=undefined); return new Vector2(this.x + v.x, this.y + v.y); }
    subtract(v)           { ASSERT(v.x!=undefined); return new Vector2(this.x - v.x, this.y - v.y); }
    multiply(v)           { ASSERT(v.x!=undefined); return new Vector2(this.x * v.x, this.y * v.y); }
    divide(v)             { ASSERT(v.x!=undefined); return new Vector2(this.x / v.x, this.y / v.y); }

    // vector math operators
    length()              { return this.lengthSquared()**.5; }
    lengthSquared()       { return this.x**2 + this.y**2; }
    distance(p)           { return this.distanceSquared(p)**.5; }
    distanceSquared(p)    { return (this.x - p.x)**2 + (this.y - p.y)**2; }
    normalize(length=1)   { const l = this.length(); return l ? this.scale(length/l) : new Vector2(length); }
    clampLength(length=1) { const l = this.length(); return l > length ? this.scale(length/l) : this; }
    dot(v)                { ASSERT(v.x!=undefined); return this.x*v.x + this.y*v.y; }
    cross(v)              { ASSERT(v.x!=undefined); return this.x*v.y - this.y*v.x; }
    angle()               { return Math.atan2(this.x, this.y); }
    setAngle(a, length=1) { this.x = length*Math.sin(a); this.y = length*Math.cos(a); return this; }
    rotate(a)             { const c = Math.cos(a), s = Math.sin(a); return new Vector2(this.x*c-this.y*s, this.x*s+this.y*c); }
    direction()           { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }
    flip()                { return new Vector2(this.y, this.x); }
    invert()              { return new Vector2(this.y, -this.x); }
    round()               { return new Vector2(Math.round(this.x), Math.round(this.y)); }
    floor()               { return new Vector2(Math.floor(this.x), Math.floor(this.y)); }
    int()                 { return new Vector2(this.x|0, this.y|0); }
    lerp(v, p)            { ASSERT(v.x!=undefined); return this.add(v.subtract(this).scale(clamp(p))); }
    area()                { return this.x * this.y; }
    arrayCheck(arraySize) { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; } 
}

///////////////////////////////////////////////////////////////////////////////
class Color
{
    constructor(r=1, g=1, b=1, a=1) { this.r=r; this.g=g; this.b=b; this.a=a; }

    copy(c)     { return new Color(this.r, this.g, this.b, this.a); }
    add(c)      { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }
    scale(s,a=s){ return new Color(this.r*s, this.g*s, this.b*s, this.a*a); }
    clamp()     { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }
    lerp(c, p)  { return this.add(c.subtract(this).scale(clamp(p))); }
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
    rgba()      
    { 
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return `rgb(${this.r*255|0},${this.g*255|0},${this.b*255|0},${this.a})`; 
    }
    rgbaInt()  
    {
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return (this.r*255|0) + (this.g*255<<8) + (this.b*255<<16) + (this.a*255<<24); 
    }
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
}

///////////////////////////////////////////////////////////////////////////////
class Timer
{
    constructor(timeLeft)   { this.time = timeLeft == undefined ? undefined : time + timeLeft; this.setTime = timeLeft; }

    set(timeLeft=0) { this.time = time + timeLeft; this.setTime = timeLeft; }
    unset()         { this.time = undefined; }
    isSet()         { return this.time != undefined; }
    active()        { return time <= this.time; }
    elapsed()       { return time >  this.time; }
    get()           { return this.isSet()? time - this.time : 0; }
    getPercent()    { return this.isSet()? percent(this.time - time, 0, this.setTime) : 0; }
}