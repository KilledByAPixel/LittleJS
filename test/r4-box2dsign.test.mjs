import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dRevoluteJoint, Box2dPrismaticJoint, Box2dWheelJoint,
    Box2dGearJoint, Box2dMotorJoint, box2d, vec2 } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

const near = (a, b, message, tolerance=1e-4)=>
    assert.ok(Math.abs(a - b) < tolerance, (message || '') + ' ' + a + ' is not ' + b);

// the angle the plugin's update copies to obj.angle after each step, clockwise
const angleOf = (o)=> -o.body.GetAngle();
const steps = (n)=> { for (let i = n; i--;) box2d.step(); };

// a dynamic box, gravity is zero here so nothing but the test turns it
const spinner = (x, angle=0)=>
{
    const o = new Box2dObject(vec2(x, 0), vec2(1), undefined, angle);
    o.addBox(vec2(1, .2));
    return o;
};

///////////////////////////////////////////////////////////////////////////////
// Box2dObject

test('a positive angular velocity turns an object clockwise, as angle grows', () =>
{
    const o = spinner(1000);
    o.setAngularVelocity(1);
    near(o.getAngularVelocity(), 1);
    steps(10);
    assert.ok(angleOf(o) > .1, 'angle grew to ' + angleOf(o));
    near(angleOf(o), 10/60, 'angle', 1e-3);
    o.destroy(); box2d.step();
});

test('a positive torque turns an object clockwise', () =>
{
    const o = spinner(1010);
    o.applyTorque(10);
    box2d.step();
    assert.ok(o.getAngularVelocity() > 0, 'angular velocity ' + o.getAngularVelocity());
    assert.ok(angleOf(o) > 0, 'angle ' + angleOf(o));
    o.destroy(); box2d.step();
});

test('a positive angular impulse turns an object clockwise', () =>
{
    const o = spinner(1020);
    o.applyAngularImpulse(1);
    assert.ok(o.getAngularVelocity() > 0, 'angular velocity ' + o.getAngularVelocity());
    box2d.step();
    assert.ok(angleOf(o) > 0, 'angle ' + angleOf(o));
    o.destroy(); box2d.step();
});

test('a positive angular acceleration turns an object clockwise, as EngineObject does', () =>
{
    const o = spinner(1030);
    o.applyAngularAcceleration(1);
    near(o.getAngularVelocity(), 1);
    steps(10);
    near(angleOf(o), 10/60, 'angle', 1e-3);
    o.destroy(); box2d.step();
});

///////////////////////////////////////////////////////////////////////////////
// joints

test('a revolute joint measures its angle, speed and reference angle clockwise', () =>
{
    const a = new Box2dStaticObject(vec2(1040, 0)), b = spinner(1040, .3);
    const joint = new Box2dRevoluteJoint(a, b, b.pos);
    near(joint.getReferenceAngle(), .3, 'reference angle');
    near(joint.getJointAngle(), 0, 'joint angle at the start');

    b.body.SetAngularVelocity(-1); // clockwise, straight to Box2D so only the joint's side is tested
    steps(10);
    assert.ok(angleOf(b) > .3, 'the object turned clockwise');
    near(joint.getJointAngle(), angleOf(b) - angleOf(a) - .3, 'joint angle', 1e-3);
    assert.ok(joint.getJointAngle() > 0, 'joint angle ' + joint.getJointAngle());
    near(joint.getJointSpeed(), 1, 'joint speed', 1e-3);
    a.destroy(); b.destroy(); box2d.step();
});

test('revolute joint limits hold the angle within them, clockwise like angle', () =>
{
    const a = new Box2dStaticObject(vec2(1050, 0)), b = spinner(1050);
    const joint = new Box2dRevoluteJoint(a, b, b.pos);
    joint.enableLimit();
    joint.setLimits(-.2, .5);
    near(joint.getLowerLimit(), -.2, 'lower');
    near(joint.getUpperLimit(), .5, 'upper');

    b.body.SetAngularVelocity(-5); // clockwise, into the upper limit
    steps(60);
    near(angleOf(b), .5, 'stopped at the upper limit', .06);
    near(joint.getJointAngle(), .5, 'joint angle at the upper limit', .06);

    b.body.SetAngularVelocity(5); // counter clockwise, into the lower limit
    steps(60);
    near(angleOf(b), -.2, 'stopped at the lower limit', .06);
    a.destroy(); b.destroy(); box2d.step();
});

test('a positive revolute motor speed turns clockwise', () =>
{
    const a = new Box2dStaticObject(vec2(1060, 0)), b = spinner(1060);
    const joint = new Box2dRevoluteJoint(a, b, b.pos);
    joint.enableMotor();
    joint.setMaxMotorTorque(1e3);
    joint.setMotorSpeed(2);
    near(joint.getMotorSpeed(), 2, 'motor speed');
    steps(10);
    assert.ok(angleOf(b) > 0, 'angle ' + angleOf(b));
    near(joint.getJointSpeed(), 2, 'joint speed', 1e-2);
    a.destroy(); b.destroy(); box2d.step();
});

test('a positive wheel motor speed turns the wheel clockwise', () =>
{
    const a = new Box2dStaticObject(vec2(1070, 0)), wheel = new Box2dObject(vec2(1070, 0));
    wheel.addCircle(1);
    const joint = new Box2dWheelJoint(a, wheel);
    joint.enableMotor();
    joint.setMaxMotorTorque(1e3);
    joint.setMotorSpeed(2);
    near(joint.getMotorSpeed(), 2, 'motor speed');
    steps(10);
    assert.ok(angleOf(wheel) > 0, 'angle ' + angleOf(wheel));
    near(joint.getJointSpeed(), 2, 'joint speed, which Box2D measures as a turn', 1e-2);
    a.destroy(); wheel.destroy(); box2d.step();
});

test('a motor joint angular offset is clockwise like angle', () =>
{
    const a = new Box2dStaticObject(vec2(1080, 0)), b = spinner(1080, .3);
    const joint = new Box2dMotorJoint(a, b);
    near(joint.getAngularOffset(), .3, 'offset from the angles at the start');

    joint.setMaxForce(1e3);
    joint.setMaxTorque(1e3);
    joint.setAngularOffset(.6);
    near(joint.getAngularOffset(), .6, 'offset set');
    steps(60);
    near(angleOf(b), .6, 'turned to the offset', 1e-2);
    a.destroy(); b.destroy(); box2d.step();
});

test('a gear joint between a revolute and a prismatic joint keeps angle plus ratio times translation', () =>
{
    const ground = new Box2dStaticObject(vec2(1090, 0));
    const gear = new Box2dObject(vec2(1090, 0)), rack = new Box2dObject(vec2(1095, 0));
    gear.addCircle(1); rack.addBox(vec2(2, .5));
    const revolute = new Box2dRevoluteJoint(ground, gear, gear.pos);
    const prismatic = new Box2dPrismaticJoint(ground, rack, rack.pos, vec2(1, 0));
    const joint = new Box2dGearJoint(gear, rack, revolute, prismatic, 1);
    near(joint.getRatio(), 1, 'ratio');

    gear.body.SetAngularVelocity(-20); // clockwise, straight to Box2D; the rack takes most of it
    steps(10);
    const angle = angleOf(gear) - angleOf(ground);
    assert.ok(Math.abs(angle) > .1, 'the gear turned ' + angle);
    near(angle + joint.getRatio() * prismatic.getJointTranslation(), 0, 'angle plus ratio times translation', 1e-2);

    // the gear joint goes first, Box2D would leave it holding the joints the ground takes with it
    joint.destroy();
    gear.destroy(); rack.destroy(); ground.destroy(); box2d.step();
});
