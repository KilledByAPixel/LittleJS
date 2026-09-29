import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vec3, PI, isPointInBox3D, isOverlapping3D, collideSphereBox, collideBoxBox3D, raycastBox, Ray3D }
    from '../dist/littlejs.esm.js';

// the 3D box helpers take an optional rotation for each box, an Euler vec3 like rotation3D; a box turned 45 degrees
// about Y is a diamond from above, its corners on the X and Z axes at the half diagonal, 1.414 for a size of 2

const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-4, message ?? `${a} is not ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x); near(v.y, y); near(v.z, z); };
const yaw45 = vec3(0, PI/4, 0), two = vec3(2), diagonal = Math.SQRT2;

test('with no rotation, or a zero one, the helpers are the upright ones they were', ()=>
{
    for (const none of [undefined, vec3()])
    {
        nearVec(collideBoxBox3D(vec3(), two, vec3(1.5, 0, 0), two, none, none), -.5, 0, 0);
        assert.equal(isOverlapping3D(vec3(), two, vec3(2.5, 0, 0), two, none, none), false);
        assert.equal(isPointInBox3D(vec3(.95, 0, .95), vec3(), two, none), true);
        nearVec(collideSphereBox(vec3(1.4, 0, 0), .5, vec3(), two, none), .1, 0, 0);
        near(raycastBox(new Ray3D(vec3(5, 0, 0), vec3(-1, 0, 0)), vec3(), two, none), 4);
    }
});

test('a point is in a turned box by the box as turned', ()=>
{
    assert.equal(isPointInBox3D(vec3(1.3, 0, 0), vec3(), two, yaw45), true, 'past the upright face, inside the diamond');
    assert.equal(isPointInBox3D(vec3(.95, 0, .95), vec3(), two, yaw45), false, 'in the upright corner, outside');
});

test('boxes whose upright boxes overlap do not touch when one is turned away', ()=>
{
    // a diamond off the corner of an upright box: its upright box reaches over the corner, its edge does not
    const far = vec3(1.9, 0, 1.9);
    assert.ok(collideBoxBox3D(vec3(), two, far, two), 'the upright boxes overlap');
    assert.equal(collideBoxBox3D(vec3(), two, far, two, undefined, yaw45), undefined);
    assert.equal(isOverlapping3D(vec3(), two, far, two, undefined, yaw45), false);
});

test('a turned box pushes by its least overlap, from B to A', ()=>
{
    // the diamond's corner reaches .214 into the upright box's face at x = 1
    const push = collideBoxBox3D(vec3(), two, vec3(2.2, 0, 0), two, undefined, yaw45);
    nearVec(push, -(1 + diagonal - 2.2), 0, 0);
    assert.equal(isOverlapping3D(vec3(), two, vec3(2.2, 0, 0), two, undefined, yaw45), true);
});

test('a box on a tilted slab is pushed out of the slab\'s face, not at a slant', ()=>
{
    const tilt = 20 * PI / 180, normal = vec3(-Math.sin(tilt), Math.cos(tilt), 0);
    const slab = vec3(), slabSize = vec3(4, 1, 4), box = normal.scale(.95); // .05 into the face, a bit more below
    const push = collideBoxBox3D(box, vec3(1), slab, slabSize, undefined, vec3(0, 0, tilt));
    const n = push.normalize();
    nearVec(n, normal.x, normal.y, 0);
    near(push.length(), .5 * (Math.sin(tilt) + Math.cos(tilt)) + .5 - .95);
});

test('boxes on one center, or turned the same with parallel edges, push a real way', ()=>
{
    for (const [a, b] of [[yaw45, yaw45], [vec3(0, .5, 0), vec3(0, .5, 0)], [vec3(.3, .2, .1), undefined]])
    {
        const push = collideBoxBox3D(vec3(.1, 0, 0), two, vec3(), two, a, b);
        assert.ok(push && [push.x, push.y, push.z].every(Number.isFinite) && push.length() > 0);
        const center = collideBoxBox3D(vec3(), two, vec3(), two, a, b);
        assert.ok(center && [center.x, center.y, center.z].every(Number.isFinite), 'the same center');
    }
});

test('a sphere touches a turned box by its corner, where the upright box says it does not', ()=>
{
    assert.equal(collideSphereBox(vec3(1.6, 0, 0), .5, vec3(), two), undefined);
    nearVec(collideSphereBox(vec3(1.6, 0, 0), .5, vec3(), two, yaw45), .5 - (1.6 - diagonal), 0, 0);
});

test('a ray hits a turned box where it is turned', ()=>
{
    near(raycastBox(new Ray3D(vec3(5, 0, 0), vec3(-1, 0, 0)), vec3(), two, yaw45), 5 - diagonal);
    const down = new Ray3D(vec3(.95, 5, .95), vec3(0, -1, 0)); // through the upright box's corner
    near(raycastBox(down, vec3(), two), 4);
    assert.equal(raycastBox(down, vec3(), two, yaw45), undefined, 'past the diamond');
});
