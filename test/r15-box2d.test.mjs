import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { box2dInit, Box2dObject, Box2dStaticObject, Box2dMotorJoint, Box2dTargetJoint, Box2dDistanceJoint, vec2,
    setEngineManualStep, engineInit } from '../dist/littlejs.esm.js';

// review round 15: joint setters that wake a sleeping body, and a joint made to a destroyed object

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{});

test('the motor and target joint setters and setFixedRotation wake a sleeping body', () =>
{
    const ground = new Box2dStaticObject(vec2(0, -50));
    ground.addBox();
    const cases = [
        [(b)=> new Box2dMotorJoint(ground, b), 'setMaxForce', 500],
        [(b)=> new Box2dMotorJoint(ground, b), 'setMaxTorque', 500],
        [(b)=> new Box2dMotorJoint(ground, b), 'setCorrectionFactor', .9],
        [(b)=> new Box2dTargetJoint(b, ground, b.pos), 'setMaxForce', 5],
        [(b)=> new Box2dTargetJoint(b, ground, b.pos), 'setFrequency', 3],
    ];
    let x = 0;
    const asleep = [];
    for (const [make, setter, value] of cases)
    {
        const body = new Box2dObject(vec2(x += 10, 0));
        body.addBox();
        const joint = make(body);
        body.body.SetAwake(false);
        joint[setter](value);
        body.body.IsAwake() || asleep.push(setter);
        joint.destroy();
        body.destroy();
    }
    const body = new Box2dObject(vec2(x += 10, 0));
    body.addBox();
    body.setFixedRotation();
    body.body.SetAwake(false);
    body.setFixedRotation(false);
    body.body.IsAwake() || asleep.push('setFixedRotation');
    body.destroy();
    ground.destroy();
    assert.deepEqual(asleep, []);
});

test('a joint made to a destroyed object asserts and is not linked into the world', () =>
{
    const a = new Box2dObject(vec2(0, 100));
    a.addBox();
    const b = new Box2dObject(vec2(0, 103));
    b.addBox();
    b.destroy();
    // the release build makes it a destroyed joint, a debug build asserts before anything is linked
    assert.throws(()=> new Box2dDistanceJoint(a, b, vec2(0, 100), vec2(0, 103)), /Assert failed/);
    assert.equal(a.hasJoints(), false);
    a.destroy();
});
