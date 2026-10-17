import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject3D, EngineObject, vec3, vec2, buildMatrix } from '../dist/littlejs.esm.js';

// A 3D child's pos3D and rotation3D are relative to its parent; setWorldPos3D and setWorldRotation3D set them so the
// child lands at a world value, and getWorldRotation3D reads its rotation in the world, as getWorldPos3D does its place

// a Matrix4 holds float32, so world values are right to about 1e-7
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-5, `${message}: ${a} is not ${b}`);
const nearVec = (v, w, message)=>
    { near(v.x, w.x, message + ' x'); near(v.y, w.y, message + ' y'); near(v.z, w.z, message + ' z'); };

// a parent moved, turned on every axis and scaled, with a child placed under it
function family(scale)
{
    const parent = new EngineObject3D(vec3(3, -2, 5));
    parent.rotation3D = vec3(.4, -.7, .2);
    parent.scale3D = scale;
    const child = new EngineObject3D(vec3(1, 2, -1));
    child.rotation3D = vec3(-.3, .5, .1);
    parent.addChild(child);
    return { parent, child };
}

test('setWorldPos3D on an object with no parent sets its pos3D', () =>
{
    const o = new EngineObject3D(vec3(1, 2, 3));
    o.setWorldPos3D(vec3(4, 5, 6));
    nearVec(o.pos3D, vec3(4, 5, 6), 'pos3D');
});

test('setWorldPos3D puts a child at the world position under a turned, unevenly scaled parent', () =>
{
    const { child } = family(vec3(2, .5, 3));
    const target = vec3(-4, 7, 1.5);
    child.setWorldPos3D(target);
    nearVec(child.getWorldPos3D(), target, 'world position');
    assert.ok(child.pos3D.distance(target) > 1, 'pos3D stays relative to the parent');
});

test('setWorldPos3D on a child with a localMatrix moves the matrix and keeps its turn', () =>
{
    const { child } = family(vec3(1));
    child.localMatrix = buildMatrix(vec3(1, 0, 0), vec3(0, .6, 0), vec3(1));
    const forward = child.getForward3D(), target = vec3(2, 2, 2);
    child.setWorldPos3D(target);
    nearVec(child.getWorldPos3D(), target, 'world position');
    nearVec(child.getForward3D(), forward, 'forward');
});

test('getWorldRotation3D of a child turned about the same axis as its parent adds the two', () =>
{
    const parent = new EngineObject3D, child = new EngineObject3D;
    parent.rotation3D = vec3(0, .5, 0);
    child.rotation3D = vec3(0, .3, 0);
    parent.addChild(child);
    nearVec(child.getWorldRotation3D(), vec3(0, .8, 0), 'world rotation');
});

test('setWorldRotation3D turns a child to the world rotation under a turned, evenly scaled parent', () =>
{
    const { child } = family(vec3(2));
    const rotation = vec3(.2, 1, -.3), facing = new EngineObject3D;
    facing.rotation3D = rotation;
    const pos = child.getWorldPos3D();
    child.setWorldRotation3D(rotation);
    nearVec(child.getForward3D(), facing.getForward3D(), 'forward');
    nearVec(child.getUp3D(), facing.getUp3D(), 'up');
    nearVec(child.getWorldRotation3D(), rotation, 'world rotation');
    nearVec(child.getWorldPos3D(), pos, 'it stays where it was');
});

test('setWorldRotation3D on an object with no parent sets its rotation3D', () =>
{
    const o = new EngineObject3D;
    o.setWorldRotation3D(vec3(.1, .2, .3));
    nearVec(o.rotation3D, vec3(.1, .2, .3), 'rotation3D');
});

test('setWorldRotation3D on a child with a localMatrix turns the matrix and keeps its place and scale', () =>
{
    const { child } = family(vec3(1));
    child.localMatrix = buildMatrix(vec3(1, 0, 0), vec3(), vec3(2));
    const pos = child.getWorldPos3D(), rotation = vec3(.5, -.4, .2), facing = new EngineObject3D;
    facing.rotation3D = rotation;
    child.setWorldRotation3D(rotation);
    nearVec(child.getForward3D(), facing.getForward3D(), 'forward');
    nearVec(child.getWorldPos3D(), pos, 'place');
    nearVec(child.localMatrix.getScale(), vec3(2), 'scale');
});

test('a 3D object under a 2D parent is not placed in 3D by it, so its world values are its own', () =>
{
    const parent = new EngineObject(vec2(5, 5)), child = new EngineObject3D;
    parent.addChild(child);
    child.setWorldPos3D(vec3(1, 2, 3));
    child.setWorldRotation3D(vec3(0, .4, 0));
    nearVec(child.pos3D, vec3(1, 2, 3), 'pos3D');
    nearVec(child.rotation3D, vec3(0, .4, 0), 'rotation3D');
});
