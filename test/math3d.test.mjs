import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vec3, isVector3, Vector3, Matrix4, buildMatrix, PI } from '../dist/littlejs.esm.js';

const near = (a, b, msg)=> assert.ok(Math.abs(a - b) < 1e-6, msg || `${a} != ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x); near(v.y, y); near(v.z, z); };

test('vec3 factory forms', () =>
{
    nearVec(vec3(), 0, 0, 0);
    nearVec(vec3(2), 2, 2, 2);
    nearVec(vec3(1, 2), 1, 2, 0);
    nearVec(vec3(1, 2, 3), 1, 2, 3);
    assert.ok(isVector3(vec3()));
    assert.ok(!isVector3({x:0, y:0, z:0}));
    assert.ok(vec3() instanceof Vector3);
});

test('Vector3 arithmetic returns new vectors', () =>
{
    const a = vec3(1, 2, 3), b = vec3(4, 5, 6);
    nearVec(a.add(b), 5, 7, 9);
    nearVec(b.subtract(a), 3, 3, 3);
    nearVec(a.multiply(b), 4, 10, 18);
    nearVec(b.divide(vec3(2)), 2, 2.5, 3);
    nearVec(a.scale(2), 2, 4, 6);
    nearVec(a, 1, 2, 3); // unchanged
    near(a.dot(b), 32);
});

test('Vector3 cross follows the right hand rule', () =>
{
    nearVec(vec3(1, 0, 0).cross(vec3(0, 1, 0)), 0, 0, 1);
    nearVec(vec3(0, 1, 0).cross(vec3(0, 0, 1)), 1, 0, 0);
});

test('Vector3 length, distance, normalize', () =>
{
    const v = vec3(3, 4, 12);
    near(v.length(), 13);
    near(v.lengthSquared(), 169);
    near(v.distance(vec3(3, 4, 0)), 12);
    near(v.distanceSquared(vec3(3, 4, 0)), 144);
    near(v.normalize().length(), 1);
    near(v.normalize(5).length(), 5);
    nearVec(vec3().normalize(), 0, 0, 0); // zero vector stays zero
    near(vec3(3, 4, 12).clampLength(2).length(), 2);
    near(vec3(1, 0, 0).clampLength(2).length(), 1);
});

test('Vector3 lerp takes percent last and is unclamped like Vector2', () =>
{
    nearVec(vec3(0, 0, 0).lerp(vec3(10, 20, 30), .5), 5, 10, 15);
});

test('Vector3 rounding and abs', () =>
{
    nearVec(vec3(-1.5, 2.4, -2.6).abs(), 1.5, 2.4, 2.6);
    nearVec(vec3(-1.5, 2.4, -2.6).floor(), -2, 2, -3);
    nearVec(vec3(-1.5, 2.4, -2.6).round(), -1, 2, -3);
});

test('Vector3 set, copy, isValid, toString', () =>
{
    const v = vec3(1, 2, 3);
    const c = v.copy();
    c.set(7, 8, 9);
    nearVec(v, 1, 2, 3);
    nearVec(c, 7, 8, 9);
    assert.ok(v.isValid());
    const bad = vec3(1, 0, 0);
    bad.x = NaN; // mutate directly, the constructor asserts valid numbers
    assert.ok(!bad.isValid());
    assert.equal(typeof v.toString(), 'string');
});

test('Matrix4 identity leaves points alone', () =>
{
    const p = Matrix4.identity().transformPoint(vec3(1, 2, 3));
    nearVec(p, 1, 2, 3);
});

test('Matrix4 translation moves points but not directions', () =>
{
    const m = Matrix4.translation(vec3(10, 20, 30));
    nearVec(m.transformPoint(vec3(1, 2, 3)), 11, 22, 33);
    nearVec(m.transformDirection(vec3(1, 2, 3)), 1, 2, 3);
    nearVec(m.getTranslation(), 10, 20, 30);
});

test('Matrix4 rotation is right handed about each axis', () =>
{
    nearVec(Matrix4.rotation(vec3(PI/2, 0, 0)).transformDirection(vec3(0, 1, 0)), 0, 0, 1);  // about X: Y -> Z
    nearVec(Matrix4.rotation(vec3(0, PI/2, 0)).transformDirection(vec3(0, 0, 1)), 1, 0, 0);  // about Y: Z -> X
    nearVec(Matrix4.rotation(vec3(0, 0, PI/2)).transformDirection(vec3(1, 0, 0)), 0, 1, 0);  // about Z: X -> Y
});

test('Matrix4 rotation applies roll, then pitch, then yaw', () =>
{
    // roll 90 about Z takes X to Y, then yaw 90 about Y leaves Y alone
    const m = Matrix4.rotation(vec3(0, PI/2, PI/2));
    nearVec(m.transformDirection(vec3(1, 0, 0)), 0, 1, 0);
    // yaw 90 takes Z to X, roll first would have changed nothing about Z
    nearVec(m.transformDirection(vec3(0, 0, 1)), 1, 0, 0);
});

test('buildMatrix scales, then rotates, then translates', () =>
{
    const m = buildMatrix(vec3(10, 0, 0), vec3(0, PI/2, 0), vec3(2, 2, 2));
    // (0,0,1) scaled to (0,0,2), yawed to (2,0,0), moved to (12,0,0)
    nearVec(m.transformPoint(vec3(0, 0, 1)), 12, 0, 0);
    // any argument may be omitted
    nearVec(buildMatrix(vec3(1, 2, 3)).transformPoint(vec3()), 1, 2, 3);
    nearVec(buildMatrix(undefined, undefined, vec3(3)).transformPoint(vec3(1, 1, 1)), 3, 3, 3);
    nearVec(buildMatrix().transformPoint(vec3(1, 2, 3)), 1, 2, 3);
});

test('Matrix4 multiply composes right to left', () =>
{
    const t = Matrix4.translation(vec3(5, 0, 0));
    const r = Matrix4.rotation(vec3(0, PI/2, 0));
    const m = t.copy().multiply(r); // rotate first, then translate
    nearVec(m.transformPoint(vec3(0, 0, 1)), 6, 0, 0);
    nearVec(t.getTranslation(), 5, 0, 0); // t itself is untouched, copy() protected it
});

test('Matrix4 invert round trips', () =>
{
    const m = buildMatrix(vec3(1, 2, 3), vec3(.3, -.7, 1.1), vec3(2, 3, 4));
    const p = vec3(5, -6, 7);
    nearVec(m.copy().invert().transformPoint(m.transformPoint(p)), 5, -6, 7);
    const id = m.copy().multiply(m.copy().invert());
    for (let i = 0; i < 16; ++i)
        near(id.m[i], i % 5 ? 0 : 1);
});

test('Matrix4 transpose swaps rows and columns', () =>
{
    const m = Matrix4.translation(vec3(1, 2, 3)).transpose();
    near(m.m[3], 1); near(m.m[7], 2); near(m.m[11], 3); near(m.m[12], 0);
});

test('Matrix4 perspective maps near to -1 and far to +1 in clip space', () =>
{
    const m = Matrix4.perspective(PI/2, 1, 1, 100);
    const clip = (z)=>
    {
        const a = m.m;
        const w = a[3]*0 + a[7]*0 + a[11]*z + a[15];
        return (a[2]*0 + a[6]*0 + a[10]*z + a[14]) / w;
    };
    near(clip(-1), -1);
    near(clip(-100), 1);
    // 90 degree vertical fov: a point at y = -z lands on the top edge
    const a = m.m;
    const y = a[1]*0 + a[5]*5 + a[9]*-5 + a[13], w = a[3]*0 + a[7]*5 + a[11]*-5 + a[15];
    near(y/w, 1);
});

test('Matrix4 orthographic maps the box to clip space', () =>
{
    const m = Matrix4.orthographic(-10, 10, -5, 5, 1, 100);
    nearVec(m.transformPoint(vec3(10, 5, -1)), 1, 1, -1);
    nearVec(m.transformPoint(vec3(-10, -5, -100)), -1, -1, 1);
});

test('Matrix4 lookAt faces the target down -Z with Y up', () =>
{
    const m = Matrix4.lookAt(vec3(0, 0, 0), vec3(10, 0, 0), vec3(0, 1, 0));
    nearVec(m.transformDirection(vec3(0, 0, -1)), 1, 0, 0); // forward is toward the target
    nearVec(m.transformDirection(vec3(0, 1, 0)), 0, 1, 0);  // up stays up
    nearVec(m.getTranslation(), 0, 0, 0);
    const m2 = Matrix4.lookAt(vec3(3, 4, 5), vec3(3, 4, -5));
    nearVec(m2.getTranslation(), 3, 4, 5);
    nearVec(m2.transformDirection(vec3(0, 0, -1)), 0, 0, -1);
});

test('Vector3 transform helpers use the matrix', () =>
{
    const m = Matrix4.translation(vec3(1, 1, 1));
    nearVec(vec3(1, 2, 3).transform(m), 2, 3, 4);
    nearVec(vec3(1, 2, 3).transformDirection(m), 1, 2, 3);
});
