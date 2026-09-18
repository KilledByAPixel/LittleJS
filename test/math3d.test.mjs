import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vec3, isVector3, Vector3 } from '../dist/littlejs.esm.js';

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
