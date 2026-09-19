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
function isVector3(v) { return v instanceof Vector3 && v.isValid(); }

// debug check that a value is a usable Vector3, stripped in release like the 2D one
function ASSERT_VECTOR3_VALID(v) { ASSERT(isVector3(v), 'Vector3 is invalid.', v); }

/**
 * Returns a random Vector3 of a given length, pointing any direction evenly
 * @param {number} [length]
 * @return {Vector3}
 * @memberof Math3D
 */
function randVector3(length=1)
{
    const z = rand(-1, 1), s = (1 - z * z) ** .5, a = rand(2 * PI);
    return new Vector3(s * cos(a) * length, z * length, s * sin(a) * length);
}

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
    set(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; ASSERT_VECTOR3_VALID(this); return this; }

    /** Copies the values of another vector into this one and returns self
     *  @param {Vector3} v
     *  @return {Vector3} */
    setFrom(v) { return this.set(v.x, v.y, v.z); }

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

    /** Returns a copy of this vector reflected by a surface normal
     *  @param {Vector3} normal - Surface normal, should be normalized
     *  @param {number} [restitution] - How much to bounce, 1 is a perfect bounce, 0 slides along the surface
     *  @return {Vector3} */
    reflect(normal, restitution=1) { return this.subtract(normal.scale((1 + restitution) * this.dot(normal))); }

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

    /** Returns a vector at right angles to both this and the one passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    cross(v)
    {
        return new Vector3(
            this.y*v.z - this.z*v.y,
            this.z*v.x - this.x*v.z,
            this.x*v.y - this.y*v.x);
    }

    /** Returns a new vector interpolated between this and the vector passed in, percent is clamped to 0-1
     *  @param {Vector3} v
     *  @param {number} percent
     *  @return {Vector3} */
    lerp(v, percent)
    {
        ASSERT_VECTOR3_VALID(v);
        return this.add(v.subtract(this).scale(clamp(percent)));
    }

    /** Returns a new vector turned around an axis, counter clockwise looking down the axis
     *  @param {Vector3} axis - Unit length
     *  @param {number} angle - Radians
     *  @return {Vector3} */
    rotate(axis, angle)
    {
        // Rodrigues' formula: the part along the axis stays, the rest turns
        const c = cos(angle), s = sin(angle), d = axis.dot(this) * (1 - c);
        return this.scale(c).add(axis.cross(this).scale(s)).add(axis.scale(d));
    }

    /** Returns a new vector with the absolute value of each component
     *  @return {Vector3} */
    abs() { return new Vector3(abs(this.x), abs(this.y), abs(this.z)); }

    /** Returns a new vector with each component floored
     *  @return {Vector3} */
    floor() { return new Vector3(floor(this.x), floor(this.y), floor(this.z)); }

    /** Returns a new vector with each component rounded
     *  @return {Vector3} */
    round() { return new Vector3(round(this.x), round(this.y), round(this.z)); }

    /** Returns a new vector snapped down to a grid, grid is the number of steps per unit like Vector2.snap
     *  @param {number} grid - Snap steps per unit, 2 snaps to halves
     *  @return {Vector3} */
    snap(grid) { return new Vector3(floor(this.x*grid)/grid, floor(this.y*grid)/grid, floor(this.z*grid)/grid); }

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
        if (!this.isValid())
            return `(${this.x},${this.y},${this.z})`; // show the bad values instead of throwing
        const f = (v)=> (v < 0 ? '' : ' ') + v.toFixed(digits);
        return `(${f(this.x)},${f(this.y)},${f(this.z)} )`;
    }
}

///////////////////////////////////////////////////////////////////////////////

// scratch for multiply, nothing keeps a reference to it
const matrix4Scratch = new Float32Array(16);

/**
 * 4x4 transform matrix for moving, rotating and scaling points in 3D
 * - Static builders like Matrix4.translation return a new matrix
 * - Methods on a matrix change it in place and return it, so calls can chain
 * - a.multiply(b) means b happens first, then a
 * - Stored the way WebGL wants it, so it can be sent to a shader as is
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
        ASSERT(!m || m.length == 16, 'Matrix4 takes 16 values, use copy() to duplicate a matrix');
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
        ASSERT_VECTOR3_VALID(v);
        const r = new Matrix4;
        r.m[12] = v.x; r.m[13] = v.y; r.m[14] = v.z;
        return r;
    }

    /** Returns a new rotation matrix, rolled first, then pitched, then yawed
     *  @param {Vector3} euler - vec3(pitch, yaw, roll) in radians
     *  @return {Matrix4} */
    static rotation(euler)
    {
        ASSERT_VECTOR3_VALID(euler);
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
        ASSERT_VECTOR3_VALID(v);
        const r = new Matrix4;
        r.m[0] = v.x; r.m[5] = v.y; r.m[10] = v.z;
        return r;
    }

    /** Returns a new perspective projection, camera looks down -Z
     *  @param {number} fov - Vertical field of view in radians
     *  @param {number} aspect - Width divided by height
     *  @param {number} near - Closest visible distance
     *  @param {number} far - Furthest visible distance, Infinity is allowed
     *  @return {Matrix4} */
    static perspective(fov, aspect, near, far)
    {
        const f = 1 / tan(fov/2);
        const r = new Matrix4;
        const m = r.m;
        m[0] = f / aspect;
        m[5] = f;
        m[10] = far == Infinity ? -1 : (far + near) / (near - far);
        m[11] = -1;
        m[14] = far == Infinity ? -2 * near : 2 * far * near / (near - far);
        m[15] = 0;
        return r;
    }

    /** Returns a new orthographic projection, camera looks down -Z
     *  @param {number} left - Edge of the visible box
     *  @param {number} right - Edge of the visible box
     *  @param {number} bottom - Edge of the visible box
     *  @param {number} top - Edge of the visible box
     *  @param {number} near - Closest visible distance
     *  @param {number} far - Furthest visible distance
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

    /** Returns the transform of something at eye turned to face target
     *  - Invert it to get a view matrix for a camera there
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
        if (!x.lengthSquared()) // up is along the view direction, pick another
            x = (abs(z.y) > .99 ? vec3(0, 0, 1) : vec3(0, 1, 0)).cross(z).normalize();
        const y = z.cross(x);
        return new Matrix4([x.x, x.y, x.z, 0,  y.x, y.y, y.z, 0,  z.x, z.y, z.z, 0,  eye.x, eye.y, eye.z, 1]);
    }

    /** Returns a new matrix that is a copy of this
     *  @return {Matrix4} */
    copy() { return new Matrix4(this.m); }

    /** Multiply this matrix by another and return this, the other happens first
     *  @param {Matrix4} matrix
     *  @return {Matrix4} */
    multiply(matrix)
    {
        const a = this.m, b = matrix.m, r = matrix4Scratch;
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

    /** Flip this matrix so it undoes itself, returns this and does nothing if it cannot be inverted
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

///////////////////////////////////////////////////////////////////////////////

/**
 * Build a transform for an object from its position, rotation and scale
 * - A point is scaled first, then rotated, then moved, which is what you want for a game object
 * @param {Vector3} [pos]
 * @param {Vector3} [rotation] - vec3(pitch, yaw, roll) in radians
 * @param {Vector3} [scale]
 * @return {Matrix4}
 * @memberof Math3D
 */
function buildMatrix(pos, rotation, scale)
{
    ASSERT(!pos || isVector3(pos), 'pos must be a Vector3', pos);
    ASSERT(!scale || isVector3(scale), 'scale must be a Vector3', scale);
    // scale the rotation columns and drop the position in, instead of multiplying three matrices
    const matrix = rotation ? Matrix4.rotation(rotation) : new Matrix4, m = matrix.m;
    if (scale)
    {
        m[0] *= scale.x; m[1] *= scale.x; m[2]  *= scale.x;
        m[4] *= scale.y; m[5] *= scale.y; m[6]  *= scale.y;
        m[8] *= scale.z; m[9] *= scale.z; m[10] *= scale.z;
    }
    if (pos)
        m[12] = pos.x, m[13] = pos.y, m[14] = pos.z;
    return matrix;
}

///////////////////////////////////////////////////////////////////////////////
// 3D collision helpers, none of them change anything that is passed in
// Boxes sit centered on pos and take a full size, like drawRect
// Cylinders stand up the Y axis, centered on pos, with a full height
// Names that could be mistaken for 2D functions get a 3D suffix

/**
 * Check if a point is inside an axis aligned box, boundary is inclusive
 * @param {Vector3} point
 * @param {Vector3} pos - Center of the box
 * @param {Vector3} size - Full size of the box
 * @return {boolean}
 * @memberof Math3D
 */
function isPointInBox3D(point, pos, size)
{
    const h = size.scale(.5);
    return abs(point.x - pos.x) <= h.x &&
        abs(point.y - pos.y) <= h.y &&
        abs(point.z - pos.z) <= h.z;
}

/**
 * Check if two axis aligned boxes are overlapping, touching edges do not overlap
 * @param {Vector3} posA
 * @param {Vector3} sizeA - Full size of box A
 * @param {Vector3} posB
 * @param {Vector3} [sizeB] - Full size of box B, zero for a point
 * @return {boolean}
 * @memberof Math3D
 */
function isOverlapping3D(posA, sizeA, posB, sizeB=vec3())
{
    const d = posA.subtract(posB);
    return abs(d.x) < (sizeA.x + sizeB.x)/2 &&
        abs(d.y) < (sizeA.y + sizeB.y)/2 &&
        abs(d.z) < (sizeA.z + sizeB.z)/2;
}

/**
 * Returns the vector to move sphere A by so it no longer overlaps sphere B, or undefined
 * @param {Vector3} posA
 * @param {number} radiusA
 * @param {Vector3} posB
 * @param {number} radiusB
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereSphere(posA, radiusA, posB, radiusB)
{
    const d = posA.subtract(posB);
    const r = radiusA + radiusB;
    const dist = d.length();
    if (dist >= r)
        return undefined;
    if (!dist)
        return vec3(0, r, 0); // coincident centers, push straight up
    return d.normalize(r - dist);
}

/**
 * Returns the vector to move a sphere out of an axis aligned box, or undefined
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @param {Vector3} boxPos
 * @param {Vector3} boxSize - Full size of the box
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereBox(pos, radius, boxPos, boxSize)
{
    const h = boxSize.scale(.5);
    const closest = vec3(
        clamp(pos.x, boxPos.x - h.x, boxPos.x + h.x),
        clamp(pos.y, boxPos.y - h.y, boxPos.y + h.y),
        clamp(pos.z, boxPos.z - h.z, boxPos.z + h.z));
    const d = pos.subtract(closest);
    const distSq = d.lengthSquared();
    if (distSq)
    {
        if (distSq >= radius*radius)
            return undefined;
        return d.normalize(radius - distSq**.5);
    }

    // center is inside the box, push out along the axis of least penetration
    const offset = pos.subtract(boxPos);
    const penX = h.x - abs(offset.x);
    const penY = h.y - abs(offset.y);
    const penZ = h.z - abs(offset.z);
    if (penX <= penY && penX <= penZ)
        return vec3((offset.x >= 0 ? 1 : -1)*(penX + radius), 0, 0);
    if (penY <= penZ)
        return vec3(0, (offset.y >= 0 ? 1 : -1)*(penY + radius), 0);
    return vec3(0, 0, (offset.z >= 0 ? 1 : -1)*(penZ + radius));
}

/**
 * Returns the vector to move a sphere out of a vertical cylinder, or undefined
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @param {Vector3} cylinderPos
 * @param {number} cylinderRadius
 * @param {number} cylinderHeight - Full height along Y
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereCylinder(pos, radius, cylinderPos, cylinderRadius, cylinderHeight)
{
    const halfHeight = cylinderHeight/2;
    const offsetX = pos.x - cylinderPos.x;
    const offsetZ = pos.z - cylinderPos.z;
    const offsetY = pos.y - cylinderPos.y;
    const radialDist = (offsetX**2 + offsetZ**2)**.5;
    const radialScale = radialDist ? min(radialDist, cylinderRadius)/radialDist : 0;
    const closest = vec3(
        cylinderPos.x + offsetX*radialScale,
        clamp(pos.y, cylinderPos.y - halfHeight, cylinderPos.y + halfHeight),
        cylinderPos.z + offsetZ*radialScale);
    const d = pos.subtract(closest);
    const distSq = d.lengthSquared();
    if (distSq)
    {
        if (distSq >= radius*radius)
            return undefined;
        return d.normalize(radius - distSq**.5);
    }

    // center is inside the cylinder, push out through the nearer surface
    const sidePen = cylinderRadius - radialDist;
    const capPen = halfHeight - abs(offsetY);
    if (sidePen <= capPen)
    {
        const dir = radialDist ? vec3(offsetX/radialDist, 0, offsetZ/radialDist) : vec3(1, 0, 0);
        return dir.scale(sidePen + radius);
    }
    return vec3(0, (offsetY >= 0 ? 1 : -1)*(capPen + radius), 0);
}

/**
 * Returns the minimum translation vector to move box A out of box B, or undefined
 * @param {Vector3} posA
 * @param {Vector3} sizeA - Full size of box A
 * @param {Vector3} posB
 * @param {Vector3} sizeB - Full size of box B
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideBoxBox(posA, sizeA, posB, sizeB)
{
    const d = posA.subtract(posB);
    const overlapX = (sizeA.x + sizeB.x)/2 - abs(d.x);
    const overlapY = (sizeA.y + sizeB.y)/2 - abs(d.y);
    const overlapZ = (sizeA.z + sizeB.z)/2 - abs(d.z);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0)
        return undefined;
    if (overlapX <= overlapY && overlapX <= overlapZ)
        return vec3((d.x >= 0 ? 1 : -1)*overlapX, 0, 0);
    if (overlapY <= overlapZ)
        return vec3(0, (d.y >= 0 ? 1 : -1)*overlapY, 0);
    return vec3(0, 0, (d.z >= 0 ? 1 : -1)*overlapZ);
}

/**
 * Returns the distance along the ray to the first intersection with a sphere, or undefined
 * - The hit is origin + direction * distance, so a direction that is not unit length scales it
 * @param {Vector3} origin
 * @param {Vector3} direction - Need not be normalized
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastSphere(origin, direction, pos, radius)
{
    const oc = origin.subtract(pos);
    const a = direction.dot(direction);
    if (!a)
        return undefined;
    const c = oc.dot(oc) - radius*radius;
    if (c < 0)
        return 0; // origin is inside the sphere
    const b = 2*oc.dot(direction);
    const discriminant = b*b - 4*a*c;
    if (discriminant < 0)
        return undefined;
    const t = (-b - discriminant**.5)/(2*a);
    return t >= 0 ? t : undefined;
}

/**
 * Returns the distance along the ray to a plane, or undefined if parallel or behind
 * - The hit is origin + direction * distance, so a direction that is not unit length scales it
 * @param {Vector3} origin
 * @param {Vector3} direction - Need not be normalized
 * @param {Vector3} planePos
 * @param {Vector3} planeNormal
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastPlane(origin, direction, planePos, planeNormal)
{
    const denominator = direction.dot(planeNormal);
    if (abs(denominator) < 1e-9)
        return undefined;
    const t = planePos.subtract(origin).dot(planeNormal)/denominator;
    return t < 0 ? undefined : t;
}

/**
 * Returns the distance along the ray to the first intersection with an axis aligned box, or undefined
 * - The hit is origin + direction * distance, so a direction that is not unit length scales it
 * @param {Vector3} origin
 * @param {Vector3} direction - Need not be normalized
 * @param {Vector3} pos - Center of the box
 * @param {Vector3} size - Full size of the box
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastBox(origin, direction, pos, size)
{
    const h = size.scale(.5);
    const boxMin = pos.subtract(h), boxMax = pos.add(h);
    let tMin = 0, tMax = Infinity;
    for (const axis of 'xyz')
    {
        const o = origin[axis], d = direction[axis];
        const mn = boxMin[axis], mx = boxMax[axis];
        if (!d)
        {
            if (o < mn || o > mx)
                return undefined; // ray is parallel to this slab and outside it
            continue;
        }
        let t0 = (mn - o)/d;
        let t1 = (mx - o)/d;
        if (t0 > t1)
            [t0, t1] = [t1, t0];
        tMin = max(tMin, t0);
        tMax = min(tMax, t1);
        if (tMin > tMax)
            return undefined;
    }
    return tMin;
}
