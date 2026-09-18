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

/**
 * 4x4 transform matrix, column major in a Float32Array so it uploads straight to WebGL
 * - Static builders return new matrices, instance methods modify in place and return self
 * - multiply(m2) appends m2, so it is applied to points before this matrix
 * @memberof Math3D
 * @example
 * const m = buildMatrix(vec3(0, 1, 0), vec3(0, PI/2, 0)); // rotate then move up
 * const p = m.transformPoint(vec3(1, 0, 0));
 */
class Matrix4
{
    /** Create a matrix, identity by default
     *  @param {Float32Array|Array<number>} [m] - 16 column major values */
    constructor(m)
    {
        /** @property {Float32Array} - The 16 column major values */
        this.m = new Float32Array(16);
        if (m)
            this.m.set(m);
        else
            this.m[0] = this.m[5] = this.m[10] = this.m[15] = 1;
    }

    /** Returns a new identity matrix
     *  @return {Matrix4} */
    static identity() { return new Matrix4; }

    /** Returns a new translation matrix
     *  @param {Vector3} v
     *  @return {Matrix4} */
    static translation(v)
    {
        const r = new Matrix4;
        r.m[12] = v.x; r.m[13] = v.y; r.m[14] = v.z;
        return r;
    }

    /** Returns a new rotation matrix from euler angles, applied to points as roll (Z), pitch (X), then yaw (Y)
     *  @param {Vector3} euler - vec3(pitch, yaw, roll) in radians
     *  @return {Matrix4} */
    static rotation(euler)
    {
        const cx = cos(euler.x), sx = sin(euler.x);
        const cy = cos(euler.y), sy = sin(euler.y);
        const cz = cos(euler.z), sz = sin(euler.z);
        const r = new Matrix4;
        const m = r.m;
        // R = Ry * Rx * Rz written out, column major
        m[0] = cy*cz + sy*sx*sz;  m[1] = cx*sz;  m[2]  = -sy*cz + cy*sx*sz;
        m[4] = -cy*sz + sy*sx*cz; m[5] = cx*cz;  m[6]  = sy*sz + cy*sx*cz;
        m[8] = sy*cx;             m[9] = -sx;    m[10] = cy*cx;
        return r;
    }

    /** Returns a new scale matrix
     *  @param {Vector3} v
     *  @return {Matrix4} */
    static scaling(v)
    {
        const r = new Matrix4;
        r.m[0] = v.x; r.m[5] = v.y; r.m[10] = v.z;
        return r;
    }

    /** Returns a new perspective projection, camera looks down -Z
     *  @param {number} fov - Vertical field of view in radians
     *  @param {number} aspect - Width divided by height
     *  @param {number} near
     *  @param {number} far
     *  @return {Matrix4} */
    static perspective(fov, aspect, near, far)
    {
        const f = 1 / tan(fov/2);
        const r = new Matrix4;
        const m = r.m;
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1;
        m[14] = 2 * far * near / (near - far);
        m[15] = 0;
        return r;
    }

    /** Returns a new orthographic projection, camera looks down -Z
     *  @param {number} left
     *  @param {number} right
     *  @param {number} bottom
     *  @param {number} top
     *  @param {number} near
     *  @param {number} far
     *  @return {Matrix4} */
    static orthographic(left, right, bottom, top, near, far)
    {
        const r = new Matrix4;
        const m = r.m;
        m[0]  = 2 / (right - left);
        m[5]  = 2 / (top - bottom);
        m[10] = -2 / (far - near);
        m[12] = -(right + left) / (right - left);
        m[13] = -(top + bottom) / (top - bottom);
        m[14] = -(far + near) / (far - near);
        return r;
    }

    /** Returns the transform of an object at eye facing target with its -Z axis, invert it for a view matrix
     *  @param {Vector3} eye
     *  @param {Vector3} target
     *  @param {Vector3} [up]
     *  @return {Matrix4} */
    static lookAt(eye, target, up=vec3(0, 1, 0))
    {
        let z = eye.subtract(target).normalize();
        if (!z.lengthSquared())
            z = vec3(0, 0, 1); // eye is on the target, face -Z
        let x = up.cross(z).normalize();
        if (!x.lengthSquared())
            x = vec3(1, 0, 0); // up is parallel to the view direction
        const y = z.cross(x);
        return new Matrix4([x.x, x.y, x.z, 0,  y.x, y.y, y.z, 0,  z.x, z.y, z.z, 0,  eye.x, eye.y, eye.z, 1]);
    }

    /** Returns a new matrix that is a copy of this
     *  @return {Matrix4} */
    copy() { return new Matrix4(this.m); }

    /** Multiply this matrix by another, the other is applied to points first, returns self
     *  @param {Matrix4} matrix
     *  @return {Matrix4} */
    multiply(matrix)
    {
        const a = this.m, b = matrix.m, r = new Float32Array(16);
        for (let j = 0; j < 4; ++j)
        for (let i = 0; i < 4; ++i)
            r[j*4 + i] = a[i]*b[j*4] + a[4 + i]*b[j*4 + 1] + a[8 + i]*b[j*4 + 2] + a[12 + i]*b[j*4 + 3];
        this.m.set(r);
        return this;
    }

    /** Append a translation, returns self
     *  @param {Vector3} v
     *  @return {Matrix4} */
    translate(v) { return this.multiply(Matrix4.translation(v)); }

    /** Append a rotation, returns self
     *  @param {Vector3} euler - vec3(pitch, yaw, roll) in radians
     *  @return {Matrix4} */
    rotate(euler) { return this.multiply(Matrix4.rotation(euler)); }

    /** Append a scale, returns self
     *  @param {Vector3} v
     *  @return {Matrix4} */
    scale(v) { return this.multiply(Matrix4.scaling(v)); }

    /** Transpose this matrix in place, returns self
     *  @return {Matrix4} */
    transpose()
    {
        const m = this.m;
        for (let i = 0; i < 4; ++i)
        for (let j = i + 1; j < 4; ++j)
        {
            const t = m[i*4 + j];
            m[i*4 + j] = m[j*4 + i];
            m[j*4 + i] = t;
        }
        return this;
    }

    /** Invert this matrix in place, returns self, leaves the matrix alone if singular
     *  @return {Matrix4} */
    invert()
    {
        const m = this.m;
        const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
        const b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10;
        const b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12;
        const b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30;
        const b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
        let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
        if (!det)
            return this;
        det = 1 / det;
        m[0]  = (a11*b11 - a12*b10 + a13*b09) * det;
        m[1]  = (a02*b10 - a01*b11 - a03*b09) * det;
        m[2]  = (a31*b05 - a32*b04 + a33*b03) * det;
        m[3]  = (a22*b04 - a21*b05 - a23*b03) * det;
        m[4]  = (a12*b08 - a10*b11 - a13*b07) * det;
        m[5]  = (a00*b11 - a02*b08 + a03*b07) * det;
        m[6]  = (a32*b02 - a30*b05 - a33*b01) * det;
        m[7]  = (a20*b05 - a22*b02 + a23*b01) * det;
        m[8]  = (a10*b10 - a11*b08 + a13*b06) * det;
        m[9]  = (a01*b08 - a00*b10 - a03*b06) * det;
        m[10] = (a30*b04 - a31*b02 + a33*b00) * det;
        m[11] = (a21*b02 - a20*b04 - a23*b00) * det;
        m[12] = (a11*b07 - a10*b09 - a12*b06) * det;
        m[13] = (a00*b09 - a01*b07 + a02*b06) * det;
        m[14] = (a31*b01 - a30*b03 - a32*b00) * det;
        m[15] = (a20*b03 - a21*b01 + a22*b00) * det;
        return this;
    }

    /** Transform a point, translation included
     *  @param {Vector3} v
     *  @return {Vector3} */
    transformPoint(v)
    {
        const m = this.m;
        return new Vector3(
            m[0]*v.x + m[4]*v.y + m[8]*v.z  + m[12],
            m[1]*v.x + m[5]*v.y + m[9]*v.z  + m[13],
            m[2]*v.x + m[6]*v.y + m[10]*v.z + m[14]);
    }

    /** Transform a direction, rotation and scale only
     *  @param {Vector3} v
     *  @return {Vector3} */
    transformDirection(v)
    {
        const m = this.m;
        return new Vector3(
            m[0]*v.x + m[4]*v.y + m[8]*v.z,
            m[1]*v.x + m[5]*v.y + m[9]*v.z,
            m[2]*v.x + m[6]*v.y + m[10]*v.z);
    }

    /** Returns the translation part of this matrix
     *  @return {Vector3} */
    getTranslation() { return new Vector3(this.m[12], this.m[13], this.m[14]); }

    /** Returns a string representation of this matrix for debugging
     *  @return {string} */
    toString()
    {
        const m = this.m, f = (i)=> m[i].toFixed(2).padStart(7);
        let s = '';
        for (let row = 0; row < 4; ++row)
            s += `[${f(row)} ${f(4 + row)} ${f(8 + row)} ${f(12 + row)} ]\n`;
        return s;
    }
}

/**
 * Build an object matrix: translate, then rotate, then scale (scale is applied to points first)
 * @param {Vector3} [pos]
 * @param {Vector3} [rotation] - vec3(pitch, yaw, roll) in radians
 * @param {Vector3} [scale]
 * @return {Matrix4}
 * @memberof Math3D
 */
function buildMatrix(pos, rotation, scale)
{
    const m = new Matrix4;
    pos && m.translate(pos);
    rotation && m.rotate(rotation);
    scale && m.scale(scale);
    return m;
}
