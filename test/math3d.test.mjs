import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vec3, isVector3, Vector3, Matrix4, buildMatrix, PI,
    isPointInBox3D, isOverlapping3D, collideSphereSphere, collideSphereBox, collideSphereCylinder,
    collideBoxBox, raycastSphere, raycastPlane, raycastBox, randVector3, Ray3D } from '../dist/littlejs.esm.js';

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

test('Vector3 lerp takes percent last and clamps it like Vector2', () =>
{
    nearVec(vec3(0, 0, 0).lerp(vec3(10, 20, 30), .5), 5, 10, 15);
    nearVec(vec3(0, 0, 0).lerp(vec3(10, 20, 30), 2), 10, 20, 30);
    nearVec(vec3(0, 0, 0).lerp(vec3(10, 20, 30), -1), 0, 0, 0);
});

test('Vector3 setFrom, snap, rotate about an axis, and toString on bad values', () =>
{
    nearVec(vec3(9).setFrom(vec3(1, 2, 3)), 1, 2, 3);
    nearVec(vec3(1.26, -1.26, 3.9).snap(2), 1, -1.5, 3.5);
    nearVec(vec3(1, 0, 0).rotate(vec3(0, 1, 0), PI/2), 0, 0, -1); // counter clockwise seen from +Y
    nearVec(vec3(0, 0, 1).rotate(vec3(0, 0, 1), 1), 0, 0, 1);      // along the axis is unchanged
    assert.equal(typeof new Vector3(1, 2, 3).toString(), 'string');
    const bad = vec3(); bad.x = undefined;
    assert.ok(bad.toString().includes('undefined'));
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

test('Matrix4 lookAt keeps an orthonormal basis when up is along the view direction', () =>
{
    const check = (m)=>
    {
        const x = m.transformDirection(vec3(1, 0, 0)), y = m.transformDirection(vec3(0, 1, 0)), z = m.transformDirection(vec3(0, 0, 1));
        near(x.length(), 1); near(y.length(), 1); near(z.length(), 1);
        near(x.dot(y), 0); near(y.dot(z), 0); near(x.dot(z), 0);
    };
    check(Matrix4.lookAt(vec3(5, 0, 0), vec3(), vec3(1, 0, 0)));   // up is the view direction, not Y
    check(Matrix4.lookAt(vec3(0, 5, 0), vec3()));                  // straight down with the default up
    check(Matrix4.lookAt(vec3(0, -5, 0), vec3()));                 // straight up
    const down = Matrix4.lookAt(vec3(0, 5, 0), vec3());
    nearVec(down.transformDirection(vec3(0, 0, -1)), 0, -1, 0);   // still faces the target
});

test('Matrix4 chaining matches buildMatrix, the constructor checks its input, and multiply can alias', () =>
{
    const pos = vec3(1, 2, 3), rot = vec3(.3, .5, .7), scale = vec3(2, 3, 4);
    const chained = Matrix4.identity().translate(pos).rotate(rot).scale(scale), built = buildMatrix(pos, rot, scale);
    for (let i = 16; i--;) near(chained.m[i], built.m[i]);
    const m = built.copy(), aliased = m.multiply(m), twice = built.copy().multiply(built.copy());
    for (let i = 16; i--;) near(aliased.m[i], twice.m[i]);
    assert.throws(()=> new Matrix4(built));
    assert.throws(()=> new Matrix4([1, 2, 3]));
});

test('Matrix4 invert handles a sheared matrix, a projection and an infinite far plane', () =>
{
    const sheared = new Matrix4([1,2,0,0, 0,1,3,0, 4,0,1,0, 5,6,7,1]);
    const round = sheared.copy().invert().multiply(sheared);
    for (let i = 16; i--;) near(round.m[i], i % 5 ? 0 : 1);
    const proj = Matrix4.perspective(1, 1.5, .5, 50), projRound = proj.copy().invert().multiply(proj);
    for (let i = 16; i--;) near(projRound.m[i], i % 5 ? 0 : 1);
    const inf = Matrix4.perspective(1, 1, .5, Infinity);
    assert.ok(inf.m.every(Number.isFinite));
    near(inf.m[10], -1); near(inf.m[14], -1);
    const singular = Matrix4.scaling(vec3(1, 0, 1)), same = singular.copy().invert();
    for (let i = 16; i--;) near(same.m[i], singular.m[i]); // returned unchanged, not NaN
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

///////////////////////////////////////////////////////////////////////////////
// 3D collision

test('isPointInBox3D checks each axis and includes the boundary', () =>
{
    const pos = vec3(0, 0, 0), size = vec3(2, 4, 6); // half = (1, 2, 3)
    assert.ok(isPointInBox3D(vec3(.5, 1, 2), pos, size));
    assert.ok(isPointInBox3D(vec3(1, 2, 3), pos, size)); // boundary is inclusive
    assert.ok(!isPointInBox3D(vec3(1.01, 0, 0), pos, size));
    assert.ok(!isPointInBox3D(vec3(0, 2.01, 0), pos, size));
    assert.ok(!isPointInBox3D(vec3(0, 0, 3.01), pos, size));
});

test('isOverlapping3D matches touching vs overlapping boxes', () =>
{
    const sizeA = vec3(2, 2, 2), sizeB = vec3(2, 2, 2); // half = 1 each, sum of halves = 2
    assert.ok(isOverlapping3D(vec3(0, 0, 0), sizeA, vec3(1.9, 0, 0), sizeB));
    assert.ok(!isOverlapping3D(vec3(0, 0, 0), sizeA, vec3(2, 0, 0), sizeB)); // exactly touching
    assert.ok(isOverlapping3D(vec3(0, 0, 0), sizeA, vec3(.5, .5, .5)));      // a point, like the 2D one
});

test('raycast distances are in units of the direction length', () =>
{
    const o = vec3(0, 0, 5), d = vec3(0, 0, -1), d2 = vec3(0, 0, -2);
    near(raycastSphere(new Ray3D(o, d), vec3(), 1), 4);          near(raycastSphere(new Ray3D(o, d2), vec3(), 1), 2);
    near(raycastPlane(new Ray3D(o, d), vec3(), vec3(0, 0, 1)), 5); near(raycastPlane(new Ray3D(o, d2), vec3(), vec3(0, 0, 1)), 2.5);
    near(raycastBox(new Ray3D(o, d), vec3(), vec3(2)), 4);        near(raycastBox(new Ray3D(o, d2), vec3(), vec3(2)), 2);
});

test('collideSphereSphere pushes A away from B by the penetration', () =>
{
    assert.equal(collideSphereSphere(vec3(3, 0, 0), 1, vec3(0, 0, 0), 1), undefined); // not touching
    nearVec(collideSphereSphere(vec3(1, 0, 0), 1, vec3(0, 0, 0), 1), 1, 0, 0);
    nearVec(collideSphereSphere(vec3(0, 0, 0), 1, vec3(0, 0, 0), 1), 0, 2, 0); // coincident centers push +Y
});

test('collideSphereBox pushes out from outside and from inside', () =>
{
    const boxPos = vec3(0, 0, 0), boxSize = vec3(2, 2, 2); // half = 1
    assert.equal(collideSphereBox(vec3(3, 0, 0), 1, boxPos, boxSize), undefined); // not touching
    nearVec(collideSphereBox(vec3(2, 0, 0), 1.5, boxPos, boxSize), .5, 0, 0); // outside on X
    nearVec(collideSphereBox(vec3(.3, 0, 0), 1, boxPos, boxSize), 1.7, 0, 0); // inside, X is least penetration
});

test('collideSphereCylinder hits the side and the cap', () =>
{
    const cylPos = vec3(0, 0, 0), cylRadius = 1, cylHeight = 2; // Y range -1..1
    nearVec(collideSphereCylinder(vec3(1.5, 0, 0), 1, cylPos, cylRadius, cylHeight), .5, 0, 0); // side
    nearVec(collideSphereCylinder(vec3(0, 1.5, 0), 1, cylPos, cylRadius, cylHeight), 0, .5, 0); // cap
    assert.equal(collideSphereCylinder(vec3(5, 0, 0), 1, cylPos, cylRadius, cylHeight), undefined);
});

test('collideBoxBox returns the minimum translation vector on the smallest axis', () =>
{
    const sizeA = vec3(4, 4, 4), sizeB = vec3(4, 4, 4); // half = 2 each
    assert.equal(collideBoxBox(vec3(5, 0, 0), sizeA, vec3(0, 0, 0), sizeB), undefined); // not touching
    nearVec(collideBoxBox(vec3(0, 0, 0), sizeA, vec3(3, .5, 0), sizeB), -1, 0, 0); // X is smallest overlap
});

test('raycastSphere handles hit, miss, inside and behind', () =>
{
    near(raycastSphere(new Ray3D(vec3(0, 0, -5), vec3(0, 0, 1)), vec3(0, 0, 0), 1), 4);
    assert.equal(raycastSphere(new Ray3D(vec3(5, 5, -5), vec3(0, 0, 1)), vec3(0, 0, 0), 1), undefined);
    assert.equal(raycastSphere(new Ray3D(vec3(0, 0, 0), vec3(0, 0, 1)), vec3(0, 0, 0), 1), 0); // origin inside
    assert.equal(raycastSphere(new Ray3D(vec3(0, 0, 5), vec3(0, 0, 1)), vec3(0, 0, 0), 1), undefined); // behind origin
});

test('raycastPlane handles hit, parallel and behind', () =>
{
    near(raycastPlane(new Ray3D(vec3(0, 0, 0), vec3(0, 1, 0)), vec3(0, 5, 0), vec3(0, 1, 0)), 5);
    assert.equal(raycastPlane(new Ray3D(vec3(0, 0, 0), vec3(1, 0, 0)), vec3(0, 5, 0), vec3(0, 1, 0)), undefined); // parallel
    assert.equal(raycastPlane(new Ray3D(vec3(0, 10, 0), vec3(0, 1, 0)), vec3(0, 5, 0), vec3(0, 1, 0)), undefined); // behind
});

test('raycastBox handles hit, miss, inside and a zero ray component through the slab', () =>
{
    const pos = vec3(0, 0, 0), size = vec3(2, 2, 2); // half = 1
    near(raycastBox(new Ray3D(vec3(-5, 0, 0), vec3(1, 0, 0)), pos, size), 4); // hit distance equals distance to near face
    assert.equal(raycastBox(new Ray3D(vec3(10, 0, 0), vec3(1, 0, 0)), pos, size), undefined); // box is behind the ray
    assert.equal(raycastBox(new Ray3D(vec3(0, 0, 0), vec3(1, 0, 0)), pos, size), 0); // origin inside
    near(raycastBox(new Ray3D(vec3(-5, .5, 0), vec3(1, 0, 0)), pos, size), 4); // zero Y/Z direction still passes through
});

test('Vector3.reflect bounces off a normal and randVector3 is a unit direction', () =>
{
    const v = vec3(1, -1, 0).reflect(vec3(0, 1, 0));
    assert.ok(Math.abs(v.x - 1) < 1e-9 && Math.abs(v.y - 1) < 1e-9 && v.z === 0);
    const slide = vec3(1, -1, 0).reflect(vec3(0, 1, 0), 0);
    assert.ok(Math.abs(slide.y) < 1e-9 && slide.x === 1);
    for (let i = 0; i < 20; ++i)
        assert.ok(Math.abs(randVector3(2).length() - 2) < 1e-9);
    for (let i = 0; i < 20; ++i)
        assert.ok(randVector3(1, .3).y >= Math.cos(.3) - 1e-9, 'inside the cone around +Y');
});

test('rotateX, rotateY and rotateZ turn the way Matrix4.rotation does', () =>
{
    const v = vec3(1, 2, 3), a = .7;
    const byMatrix = (euler)=> Matrix4.rotation(euler).transformDirection(v);
    nearVec(v.rotateX(a), ...Object.values(byMatrix(vec3(a, 0, 0))));
    nearVec(v.rotateY(a), ...Object.values(byMatrix(vec3(0, a, 0))));
    nearVec(v.rotateZ(a), ...Object.values(byMatrix(vec3(0, 0, a))));
    nearVec(v.rotateY(a), ...Object.values(v.rotate(vec3(0, 1, 0), a)));
    nearVec(vec3(6, 3).rotateY(PI / 2), 0, 3, -6); // -Z is forward, a quarter turn takes +X there
});

test('Ray3D.getPosition walks the ray by the distance the raycasts return', () =>
{
    const ray = new Ray3D(vec3(0, 0, 5), vec3(0, 0, -2));
    const distance = raycastSphere(ray, vec3(), 1);
    nearVec(ray.getPosition(distance), 0, 0, 1);
    nearVec(new Ray3D().direction, 0, 0, -1);
    nearVec(ray.copy().origin, 0, 0, 5);
});
