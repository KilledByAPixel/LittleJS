import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as LJS from '../dist/littlejs.esm.min.js';

// a joint made to an object already destroyed is made destroyed, as it would be had the object gone after, in every
// joint type: they read the objects' bodies before the base class could check, and threw on the one that was gone

const { vec2, Box2dObject, Box2dStaticObject } = LJS;
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await LJS.box2dInit();
LJS.setHeadlessMode(true);
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=>{});

test('every joint type made to a destroyed object, in a release build, is a destroyed joint', () =>
{
    const body = (x)=> { const o = new Box2dObject(vec2(x, 0)); o.addBox(vec2(1)); return o; };
    const cases = [
        ['target', (a, b)=> new LJS.Box2dTargetJoint(b, a, vec2(0, 9))],
        ['target, the fixed one gone', (a, b)=> new LJS.Box2dTargetJoint(a, b, vec2(0, 9))],
        ['distance', (a, b)=> new LJS.Box2dDistanceJoint(a, b)],
        ['rope', (a, b)=> new LJS.Box2dRopeJoint(a, b)],
        ['revolute', (a, b)=> new LJS.Box2dRevoluteJoint(a, b, vec2(0, 9))],
        ['pin', (a, b)=> new LJS.Box2dPinJoint(a, b)],
        ['prismatic', (a, b)=> new LJS.Box2dPrismaticJoint(a, b, vec2(0, 9))],
        ['wheel', (a, b)=> new LJS.Box2dWheelJoint(a, b)],
        ['weld', (a, b)=> new LJS.Box2dWeldJoint(a, b)],
        ['friction', (a, b)=> new LJS.Box2dFrictionJoint(a, b)],
        ['pulley', (a, b)=> new LJS.Box2dPulleyJoint(a, b, vec2(0, 9), vec2(2, 9))],
        ['motor', (a, b)=> new LJS.Box2dMotorJoint(a, b)],
    ];
    const failed = [];
    let x = 0;
    for (const [name, make] of cases)
    {
        const a = body(x += 10), b = body(x + 3);
        b.destroy();
        try
        {
            const joint = make(a, b);
            joint.box2dJoint === 0 && !joint.isActive() && !a.hasJoints() || failed.push(name + ' was made');
        }
        catch (error) { failed.push(name + ': ' + error.message); }
        a.destroy();
    }
    assert.deepEqual(failed, []);
    LJS.box2d.step();
});

test('a gear joint of a joint destroyed with its object, in a release build, is a destroyed joint', () =>
{
    const ground = new Box2dStaticObject(vec2(0, -50));
    ground.addBox();
    const wheel = new Box2dObject(vec2(0, 0)), other = new Box2dObject(vec2(5, 0));
    wheel.addCircle(1), other.addCircle(1);
    const joint1 = new LJS.Box2dRevoluteJoint(ground, wheel, wheel.pos);
    const joint2 = new LJS.Box2dRevoluteJoint(ground, other, other.pos);
    other.destroy(); // joint2 goes with it
    const gear = new LJS.Box2dGearJoint(wheel, other, joint1, joint2);
    assert.equal(gear.box2dJoint, 0);
    LJS.box2d.step(); // Box2D did not stop on a gear of no joint
    joint1.destroy(), wheel.destroy(), ground.destroy();
});
