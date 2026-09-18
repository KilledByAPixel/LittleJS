/**
 * LittleJS 3D Math Plugin
 * - Vector3 and Matrix4 for 3D games and plugins
 * - Right handed, Y up, angles in radians
 * - Used by the Render3D plugin, but has no rendering dependencies
 * @namespace Math3D
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a 3D vector, can take 0, 1, 2 or 3 numbers
 * - vec3() is zero, vec3(s) fills all three, vec3(x, y) sets z to 0
 * @param {number} [x]
 * @param {number} [y]
 * @param {number} [z]
 * @return {Vector3}
 * @memberof Math3D
 */
function vec3(x=0, y, z)
{
    return y === undefined ? new Vector3(x, x, x) : new Vector3(x, y, z === undefined ? 0 : z);
}

/**
 * Check if the object is a valid Vector3
 * @param {any} v
 * @return {boolean}
 * @memberof Math3D
 */
function isVector3(v) { return v instanceof Vector3; }

/**
 * 3D Vector object, right handed with Y up
 * - Methods return new vectors except set
 * @memberof Math3D
 * @example
 * const a = vec3(1, 2, 3);
 * const b = a.add(vec3(0, 1, 0)).normalize();
 */
class Vector3
{
    /** Create a 3D vector
     *  @param {number} [x]
     *  @param {number} [y]
     *  @param {number} [z] */
    constructor(x=0, y=0, z=0)
    {
        ASSERT(isNumber(x) && isNumber(y) && isNumber(z), 'Vector3 components must be numbers');
        /** @property {number} - X axis location */
        this.x = x;
        /** @property {number} - Y axis location */
        this.y = y;
        /** @property {number} - Z axis location */
        this.z = z;
    }

    /** Sets values of this vector and returns self
     *  @param {number} [x]
     *  @param {number} [y]
     *  @param {number} [z]
     *  @return {Vector3} */
    set(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; return this; }

    /** Returns a new vector that is a copy of this
     *  @return {Vector3} */
    copy() { return new Vector3(this.x, this.y, this.z); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z); }

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    subtract(v) { return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z); }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    multiply(v) { return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z); }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    divide(v) { return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z); }

    /** Returns a copy of this vector scaled by the number passed in
     *  @param {number} s
     *  @return {Vector3} */
    scale(s) { return new Vector3(this.x * s, this.y * s, this.z * s); }

    /** Returns the length of this vector
     *  @return {number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     *  @return {number} */
    lengthSquared() { return this.x**2 + this.y**2 + this.z**2; }

    /** Returns the distance from this vector to the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    distance(v) { return this.distanceSquared(v)**.5; }

    /** Returns the distance squared from this vector to the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    distanceSquared(v) { return (this.x - v.x)**2 + (this.y - v.y)**2 + (this.z - v.z)**2; }

    /** Returns a new vector in the same direction with the length passed in, zero stays zero
     *  @param {number} [length]
     *  @return {Vector3} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector3;
    }

    /** Returns a new vector clamped to the length passed in
     *  @param {number} [length]
     *  @return {Vector3} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this.copy();
    }

    /** Returns the dot product of this vector and the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }

    /** Returns the cross product of this vector and the vector passed in (right hand rule)
     *  @param {Vector3} v
     *  @return {Vector3} */
    cross(v)
    {
        return new Vector3(
            this.y*v.z - this.z*v.y,
            this.z*v.x - this.x*v.z,
            this.x*v.y - this.y*v.x);
    }

    /** Returns a new vector interpolated between this and the vector passed in, percent is not clamped
     *  @param {Vector3} v
     *  @param {number} percent
     *  @return {Vector3} */
    lerp(v, percent) { return this.add(v.subtract(this).scale(percent)); }

    /** Returns a new vector with the absolute value of each component
     *  @return {Vector3} */
    abs() { return new Vector3(abs(this.x), abs(this.y), abs(this.z)); }

    /** Returns a new vector with each component floored
     *  @return {Vector3} */
    floor() { return new Vector3(floor(this.x), floor(this.y), floor(this.z)); }

    /** Returns a new vector with each component rounded
     *  @return {Vector3} */
    round() { return new Vector3(round(this.x), round(this.y), round(this.z)); }

    /** Returns this point transformed by a matrix, translation included
     *  @param {Matrix4} matrix
     *  @return {Vector3} */
    transform(matrix) { return matrix.transformPoint(this); }

    /** Returns this direction transformed by a matrix, rotation and scale only
     *  @param {Matrix4} matrix
     *  @return {Vector3} */
    transformDirection(matrix) { return matrix.transformDirection(this); }

    /** Checks if this is a valid vector
     *  @return {boolean} */
    isValid() { return isNumber(this.x) && isNumber(this.y) && isNumber(this.z); }

    /** Returns a string representation of this vector for debugging
     *  @param {number} [digits] - Number of digits to display
     *  @return {string} */
    toString(digits=3)
    {
        const f = (v)=> (v < 0 ? '' : ' ') + v.toFixed(digits);
        return `(${f(this.x)},${f(this.y)},${f(this.z)} )`;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Temporary stubs, replaced in Task 3

class Matrix4 {}
function buildMatrix() {}
