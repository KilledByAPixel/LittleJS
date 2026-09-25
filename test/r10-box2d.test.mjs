import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dPinJoint, Box2dRevoluteJoint, Box2dGearJoint, box2d, vec2,
    setGravity } from '../dist/littlejs.esm.js';

// review round 10: setSensor wakes what rests on it, edge lists drop repeated points, a gear on a joint with a static
// objectB is refused, setAngle from a callback keeps the step's motion, and hasJoints skips queued destroys

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);
setGravity(vec2(0, -20));

const settle = (o, steps=400)=> { for (let i = steps; i-- && o.getIsAwake();) box2d.step(); };
const bodyY = (o)=> o.getCenterOfMass().y; // stepping by hand does not copy the body's place to pos

test('a crate sleeping on a platform that turns into a sensor falls', () =>
{
    const platform = new Box2dStaticObject(vec2(0, 0));
    platform.addBox(vec2(4, 1));
    const crate = new Box2dObject(vec2(0, 1.5));
    crate.addBox(vec2(1));
    try
    {
        settle(crate);
        assert.equal(crate.getIsAwake(), false);
        platform.setSensor(true);
        for (let i = 60; i--;) box2d.step();
        assert.ok(bodyY(crate) < 0, 'it fell through: ' + bodyY(crate));
    }
    finally { platform.destroy(); crate.destroy(); box2d.step(); }
});

test('an edge loop written closed, with its first point repeated at the end, still holds what lands on it', () =>
{
    const ground = new Box2dStaticObject(vec2(0, 100));
    ground.addEdgeLoop([vec2(-10, 0), vec2(10, 0), vec2(10, -2), vec2(-10, -2), vec2(-10, 0)]);
    const balls = [];
    for (let i = 40; i--;)
    {
        const ball = new Box2dObject(vec2(-9.5 + i * .5, 103 + i%3));
        i%2 ? ball.addCircle(.4) : ball.addBox(vec2(.4));
        balls.push(ball);
    }
    try
    {
        for (let i = 300; i--;) box2d.step();
        assert.ok(balls.every(b=> bodyY(b) > 100), 'none fell through: ' + balls.map(bodyY).map(y=> y.toFixed(1)));
        assert.deepEqual(ground.addEdgeList([]), [], 'an empty list makes nothing');
    }
    finally { ground.destroy(); balls.forEach(b=> b.destroy()); box2d.step(); }
});

test('a gear on a joint whose objectB is static is refused, it would turn nothing', () =>
{
    const post = new Box2dStaticObject(vec2(0, 200));
    const w1 = new Box2dObject(vec2(-2, 200)), w2 = new Box2dObject(vec2(2, 200));
    w1.addCircle(1); w2.addCircle(1);
    const backwards = new Box2dPinJoint(w1, post, w1.pos); // turns the post
    const j1 = new Box2dPinJoint(post, w1, w1.pos), j2 = new Box2dRevoluteJoint(post, w2, w2.pos);
    try
    {
        assert.throws(()=> new Box2dGearJoint(w1, w2, backwards, j2), /Assert failed/);
        const gear = new Box2dGearJoint(w1, w2, j1, j2, 2);
        gear.destroy();
    }
    finally { j1.destroy(); j2.destroy(); backwards.destroy(); post.destroy(); w1.destroy(); w2.destroy(); box2d.step(); }
});

test('setAngle from a contact callback keeps the motion of that step', () =>
{
    setGravity(vec2());
    const gate = new Box2dStaticObject(vec2(5, 300));
    gate.addBox(vec2(1, 4), vec2(), 0, 0, 0, 0, true); // a sensor
    const ball = new Box2dObject(vec2(0, 300));
    ball.addCircle(.5);
    ball.setLinearVelocity(vec2(30, 0));
    ball.beginContact = ()=> ball.setAngle(1);
    try
    {
        let last = ball.getCenterOfMass().x, stalled = false;
        for (let i = 20; i--;)
        {
            box2d.step();
            const x = ball.getCenterOfMass().x;
            stalled ||= x - last < .4;
            last = x;
        }
        assert.equal(stalled, false, 'it never lost a step');
        assert.ok(Math.abs(ball.body.GetAngle() + 1) < 1e-6, 'and turned');
    }
    finally { setGravity(vec2(0, -20)); gate.destroy(); ball.destroy(); box2d.step(); }
});

test('hasJoints agrees with getJointList while a joint destroy waits for the step', () =>
{
    setGravity(vec2());
    const a = new Box2dStaticObject(vec2(0, 400));
    a.addBox(vec2(2));
    const b = new Box2dObject(vec2(0, 401.4));
    b.addBox();
    const joint = new Box2dRevoluteJoint(a, b, vec2(0, 401));
    const trigger = new Box2dStaticObject(vec2(3, 401.4)); // jointed bodies do not touch, this sensor does
    trigger.addBox(vec2(1), vec2(-3, 0), 0, 0, 0, 0, true);
    let checked;
    b.beginContact = ()=> { joint.destroy(); checked = [b.hasJoints(), b.getJointList().length]; };
    try
    {
        for (let i = 10; i-- && !checked;) box2d.step();
        assert.deepEqual(checked, [false, 0]);
    }
    finally { setGravity(vec2(0, -20)); a.destroy(); b.destroy(); trigger.destroy(); box2d.step(); }
});

test('a raycast passes through sensors unless it asks for them', () =>
{
    const trigger = new Box2dStaticObject(vec2(5, 500));
    trigger.addBox(vec2(1, 4), vec2(), 0, 0, 0, 0, true); // a checkpoint zone
    const wall = new Box2dStaticObject(vec2(10, 500));
    wall.addBox(vec2(1, 4));
    try
    {
        box2d.step();
        assert.equal(box2d.raycast(vec2(0, 500), vec2(20, 500))?.object, wall, 'through the zone to the wall');
        assert.equal(box2d.raycast(vec2(0, 500), vec2(20, 500), true)?.object, trigger, 'the zone when asked');
        assert.equal(box2d.raycastAll(vec2(0, 500), vec2(20, 500)).length, 1);
        assert.equal(box2d.raycastAll(vec2(0, 500), vec2(20, 500), true).length, 2);
    }
    finally { trigger.destroy(); wall.destroy(); box2d.step(); }
});
