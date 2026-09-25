import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, FirstPersonCamera3D, Ray3D, Ease, vec2, vec3, PI } = LJS;

// review round 8: area queries of size 0, isStringLike on odd objects, raycastSphere with a ray of no length,
// Ease.BEZIER at its ends, moving static solids, and a first person camera on a turned parent

LJS.setEngineManualStep(true);
await LJS.engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
new LJS.Render3DPlugin;

const near = (a, b, eps=1e-6)=> Math.abs(a - b) <= eps;

test('an area query of size 0 is a point test against each box, the same as leaving the size out', () =>
{
    const o = new EngineObject(vec2(20, 20), vec2(2));
    try
    {
        assert.ok(LJS.engineObjectsCollect(vec2(20.5, 20)).includes(o));
        assert.ok(LJS.engineObjectsCollect(vec2(20.5, 20), 0).includes(o), 'a circle of size 0 is a point');
        assert.ok(!LJS.engineObjectsCollect(vec2(22, 20), 0).includes(o), 'and a point outside misses');

        const o3 = new EngineObject3D(vec3(5, 0, 0));
        o3.size3D = vec3(2);
        assert.ok(LJS.engineObjectsCollect3D(vec3(5.5, 0, 0), 0).includes(o3), 'a sphere of size 0 is a point');
        assert.ok(!LJS.engineObjectsCollect3D(vec3(7, 0, 0), 0).includes(o3));
        o3.destroy();
    }
    finally { o.destroy(); LJS.engineObjectsUpdate(); }
});

test('isStringLike is false for an object with no toString it can call, not a throw', () =>
{
    assert.equal(LJS.isStringLike(Object.create(null)), false);
    assert.equal(LJS.isStringLike({toString: 5}), false);
    assert.equal(LJS.isStringLike('a'), true);
    assert.equal(LJS.isStringLike(3), true);
    assert.equal(LJS.isStringLike(undefined), false);
});

test('raycastSphere gives 0 for a ray of no length that starts inside, like raycastBox', () =>
{
    const ray = new Ray3D(vec3(), vec3());
    assert.equal(LJS.raycastSphere(ray, vec3(), 1), 0);
    assert.equal(LJS.raycastBox(ray, vec3(), vec3(2)), 0);
    assert.equal(LJS.raycastSphere(new Ray3D(vec3(5, 0, 0), vec3()), vec3(), 1), undefined, 'outside it misses');
});

test('Ease.BEZIER ends on 0 and 1 and is close in between, even on steep curves', () =>
{
    for (const f of [Ease.BEZIER(0, 1, 0, 1), Ease.BEZIER(0, .5, .5, 1), Ease.BEZIER(.7, 0, 1, .5), Ease.BEZIER(.25, .1, .25, 1)])
    {
        assert.equal(f(0), 0);
        assert.equal(f(1), 1);
    }

    // x1 = y1 and x2 = y2 is a straight line, so y is x all the way along
    const linear = Ease.BEZIER(.3, .3, .7, .7);
    for (let x = .05; x < 1; x += .1)
        assert.ok(near(linear(x), x), 'linear at ' + x);
});

test('a moving static solid pushes a box out of its way and carries it, like an elevator', () =>
{
    const gravity = LJS.gravity.copy();
    LJS.setGravity(vec2(0, -.01));
    const elevator = new EngineObject(vec2(0, 0), vec2(4, 1));
    elevator.mass = 0;
    elevator.setCollision();
    elevator.velocity = vec2(0, .05);
    const box = new EngineObject(vec2(0, 1.01), vec2(1));
    box.setCollision();
    try
    {
        LJS.engineStep(100);
        assert.ok(near(elevator.pos.y, 5, 1e-9), 'the elevator rose');
        assert.ok(box.pos.y > elevator.pos.y + .9, 'the box rode on top, not through it: ' + box.pos.y);
        assert.ok(box.pos.y < elevator.pos.y + 1.2, 'and stayed on it: ' + box.pos.y);

        // a door sliding sideways shoves what is in its way
        elevator.velocity = vec2();
        const door = new EngineObject(vec2(-5, 20), vec2(1, 4));
        door.mass = 0;
        door.setCollision();
        door.velocity = vec2(.05, 0);
        const crate = new EngineObject(vec2(-3, 20), vec2(1));
        crate.setCollision();
        crate.gravityScale = 0;
        LJS.engineStep(60);
        assert.ok(crate.pos.x > door.pos.x + .99, 'the crate is ahead of the door, not inside it');
        door.destroy(); crate.destroy();
    }
    finally { LJS.setGravity(gravity); elevator.destroy(); box.destroy(); LJS.engineObjectsUpdate(); }
});

test('a first person camera on a turned parent looks and walks the parent\'s way', () =>
{
    const ship = new EngineObject3D(vec3());
    ship.rotation3D = vec3(0, PI/2, 0); // a quarter turn left
    const player = new FirstPersonCamera3D(vec3(0, 1, 0), 0, 0);
    player.lockPointer = false;
    ship.addChild(player);
    try
    {
        player.update();
        const rotation = LJS.render3D.camera.rotation;
        assert.ok(near(rotation.x, 0) && near(rotation.y, PI/2) && near(rotation.z, 0), 'looks the ship\'s way ' + rotation);

        // what the keys give for forward at yaw 0 moves it the way the camera looks, world -X
        const start = player.getWorldPos3D();
        player.velocity3D = vec3(0, 0, -.1);
        player.gravityScale = 0;
        player.updatePhysics(); // moves it by velocity3D, as its parent's update would
        const moved = player.getWorldPos3D().subtract(start);
        assert.ok(near(moved.x, -.1) && near(moved.z, 0), 'moved forward in the world ' + moved);
    }
    finally { ship.destroy(); LJS.engineObjectsUpdate(); }
});

test('a mesh under a sheared transform is picked across all of it, and its instances are bounded around it', () =>
{
    // a turned child under a parent scaled on one axis stretches the sphere more than any one axis does
    const parent = new EngineObject3D(vec3(7.5, 0, 0));
    parent.scale3D = vec3(3, 1, 1);
    const child = new EngineObject3D(vec3(), LJS.buildSphere(2, 32, 16));
    child.rotation3D = vec3(0, 0, PI/4);
    parent.addChild(child);
    try
    {
        // (4.8, 0, 0) is inside the stretched sphere, but outside the sphere the longest axis gave
        const hits = LJS.engineObjectsRaycast3D(new Ray3D(vec3(4.8, 0, 10), vec3(0, 0, -1)));
        assert.ok(hits.includes(child), 'picked');
    }
    finally { parent.destroy(); LJS.engineObjectsUpdate(); }

    // the same stretch as one instance's matrix, its bounds reach 3 from the center, not the longest axis's 2.24
    const matrix = LJS.buildMatrix(vec3(), vec3(), vec3(3, 1, 1)).multiply(LJS.buildMatrix(vec3(), vec3(0, 0, PI/4)));
    const set = new LJS.InstancedMesh3D(LJS.buildSphere(2, 32, 16), 1);
    set.setMatrixAt(0, matrix);
    assert.ok(set.radius >= 3 - 1e-6, 'bounds hold the stretched sphere: ' + set.radius);
    assert.ok(set.radius < 3.01, 'and no more than that for this one: ' + set.radius);
    set.destroy();
    LJS.engineObjectsUpdate();
});
