import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as LJS from '../dist/littlejs.esm.min.js';

// Box2D stops for good on a value it can not take, and a release build has no asserts to catch one first: a NaN
// passed through the clamps, NaN limits passed the order check, and a joint of one object to itself was only
// asserted; each is now taken as the nearest value Box2D can take, or makes nothing, and the world steps on

const { vec2, Box2dObject, Box2dStaticObject } = LJS;
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await LJS.box2dInit();
LJS.setHeadlessMode(true);
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=>{});

test('values Box2D can not take, given to a release build, leave the world stepping', () =>
{
    const ground = new Box2dStaticObject(vec2(0, -5));
    ground.addBox(vec2(20, 1));
    const body = (x)=> { const o = new Box2dObject(vec2(x, 0)); o.addBox(vec2(1)); return o; };
    const a = body(0), b = body(2), c = body(4);
    const cases = [
        ['a weld joint of an object to itself', ()=> new LJS.Box2dWeldJoint(a, a, a.pos)],
        ['a friction joint force of NaN', ()=> new LJS.Box2dFrictionJoint(a, b, a.pos).setMaxForce(NaN)],
        ['a friction joint torque of NaN', ()=> new LJS.Box2dFrictionJoint(a, b, a.pos).setMaxTorque(NaN)],
        ['a motor joint force of NaN', ()=> new LJS.Box2dMotorJoint(a, b).setMaxForce(NaN)],
        ['a motor joint torque of Infinity', ()=> new LJS.Box2dMotorJoint(a, b).setMaxTorque(Infinity)],
        ['a target joint frequency of NaN', ()=> new LJS.Box2dTargetJoint(c, ground, c.pos).setFrequency(NaN)],
        ['revolute limits of NaN', ()=> new LJS.Box2dRevoluteJoint(a, b, a.pos).setLimits(NaN, 1)],
        ['prismatic limits of NaN', ()=> new LJS.Box2dPrismaticJoint(a, c, a.pos).setLimits(0, NaN)],
        ['a mass of NaN', ()=> b.setMass(NaN)],
        ['a pulley ratio of 0', ()=> new LJS.Box2dPulleyJoint(a, b, vec2(0, 9), vec2(2, 9), undefined, undefined, 0)],
        ['a box of Infinity', ()=> c.addBox(vec2(Infinity, 1))],
        ['a circle of Infinity', ()=> c.addCircle(Infinity)],
    ];
    for (const [name, make] of cases)
    {
        assert.doesNotThrow(make, name);
        assert.doesNotThrow(()=> LJS.engineStep(2), name + ', then a step');
    }
    assert.ok(Number.isFinite(a.pos.x) && Number.isFinite(b.pos.y), 'the bodies are still somewhere');
});
