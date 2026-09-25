import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dTargetJoint, Box2dRevoluteJoint, Box2dWeldJoint,
    Box2dGearJoint, Box2dWheelJoint, Box2dFrictionJoint, Box2dPinJoint, ParticleEmitter, box2d, vec2, gravity, setGravity,
    engineObjectsUpdate } from '../dist/littlejs.esm.js';

// review round 9: a target joint refuses what would lock the world, a gravity change and the spring and mass setters
// wake sleeping bodies, destroy(immediate) reaches the children, and joint setters refuse what Box2D would stop on

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);
setGravity(vec2(0, -20));

const settle = (o, steps=400)=> { for (let i = steps; i-- && o.getIsAwake();) box2d.step(); };
const bodyY = (o)=> o.getCenterOfMass().y; // stepping by hand does not copy the body's place to pos

test('a target joint on an object with no mass, or at frequency 0, is refused instead of locking the world', () =>
{
    const ground = new Box2dStaticObject(vec2(0, -50));
    ground.addBox(vec2(4, 1));
    const crate = new Box2dObject(vec2(0, -45));
    crate.addBox(vec2(1));
    try
    {
        assert.throws(()=> new Box2dTargetJoint(ground, crate, ground.pos), /Assert failed/);
        const drag = new Box2dTargetJoint(crate, ground, crate.pos);
        drag.setFrequency(0);
        assert.ok(drag.getFrequency() > 0, 'kept above 0');
        box2d.step();
        assert.equal(box2d.world.IsLocked(), false, 'the world still steps');
        drag.destroy();
    }
    finally { ground.destroy(); crate.destroy(); box2d.step(); }
});

test('a gravity change wakes the bodies sleeping under the old one', () =>
{
    const floor = new Box2dStaticObject(vec2(0, 0));
    floor.addBox(vec2(20, 1));
    const crate = new Box2dObject(vec2(0, 1.5));
    crate.addBox(vec2(1));
    const old = gravity.copy();
    try
    {
        settle(crate);
        assert.equal(crate.getIsAwake(), false, 'asleep on the floor');
        setGravity(vec2(0, 20));
        for (let i = 60; i--;) box2d.step();
        assert.ok(bodyY(crate) > 3, 'it fell up: ' + bodyY(crate));
    }
    finally { setGravity(old); floor.destroy(); crate.destroy(); box2d.step(); }
});

test('the spring and mass setters wake a sleeping body', () =>
{
    const floor = new Box2dStaticObject(vec2(40, 0));
    floor.addBox(vec2(20, 1));
    const plank = new Box2dObject(vec2(40, 1));
    plank.addBox(vec2(3, .5));
    const car = new Box2dObject(vec2(60, 3));
    car.addBox(vec2(2, .5));
    const wheel = new Box2dObject(vec2(60, 1.5));
    wheel.addCircle(1);
    const ledge = new Box2dStaticObject(vec2(60, 0));
    ledge.addBox(vec2(20, 1));
    const suspension = new Box2dWheelJoint(car, wheel, wheel.pos);
    try
    {
        settle(plank); settle(car);
        assert.equal(plank.getIsAwake(), false);
        plank.setCenterOfMass(vec2(1, 0));
        assert.equal(plank.getIsAwake(), true, 'setMassData wakes it');
        assert.equal(car.getIsAwake(), false);
        suspension.setSpringFrequencyHz(1);
        assert.equal(car.getIsAwake(), true, 'a new spring wakes the joint\'s bodies');
    }
    finally { suspension.destroy(); floor.destroy(); plank.destroy(); car.destroy(); wheel.destroy(); ledge.destroy(); box2d.step(); }
});

test('Box2dObject.destroy(true) removes its children at once, as EngineObject.destroy does', () =>
{
    const rocket = new Box2dObject(vec2(0, 80));
    const exhaust = new ParticleEmitter(vec2(0, 80));
    rocket.addChild(exhaust);
    exhaust.emitParticle(); // an emitter with particles left waits for them unless destroyed immediately
    rocket.destroy(true);
    assert.equal(exhaust.destroyed, true);
    box2d.step();
    engineObjectsUpdate();
});

test('joint setters refuse values Box2D would stop on', () =>
{
    const a = new Box2dObject(vec2(0, 100)), b = new Box2dObject(vec2(1, 100));
    a.addBox(); b.addBox();
    const hinge = new Box2dRevoluteJoint(a, b, vec2(.5, 100));
    const weld = new Box2dWeldJoint(a, b);
    const friction = new Box2dFrictionJoint(a, b);
    try
    {
        assert.throws(()=> hinge.setLimits(1, -1), /Assert failed/);
        assert.throws(()=> new Box2dGearJoint(a, b, hinge, weld), /Assert failed/);
        friction.setMaxForce(-5);
        assert.equal(friction.getMaxForce(), 0, 'a negative force is 0');
        box2d.step();
    }
    finally { friction.destroy(); weld.destroy(); hinge.destroy(); a.destroy(); b.destroy(); box2d.step(); }
});

test('a pin joint holds its point exactly while the objects swing on it', () =>
{
    const post = new Box2dStaticObject(vec2(0, 200));
    const arm = new Box2dObject(vec2(2, 200), vec2(4, .3));
    arm.addBox(vec2(4, .3), undefined, 0, 5);
    const pin = new Box2dPinJoint(post, arm, vec2(0, 200));
    try
    {
        let gap = 0;
        for (let i = 300; i--;)
        {
            box2d.step();
            gap = Math.max(gap, pin.getAnchorA().distance(pin.getAnchorB()));
        }
        assert.ok(gap < .01, 'the anchors stay together: ' + gap);
    }
    finally { pin.destroy(); post.destroy(); arm.destroy(); box2d.step(); }
});

test('a Box2dObject can not be made a child, its body would stay behind', () =>
{
    const parent = new Box2dObject(vec2(0, 300)), child = new Box2dObject(vec2(1, 300));
    try { assert.throws(()=> parent.addChild(child), /Assert failed/); }
    finally { parent.destroy(); child.destroy(); box2d.step(); }
});
