import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { box2dInit, Box2dObject, vec2, setEngineManualStep, engineInit, engineStep } from '../dist/littlejs.esm.js';

// A Box2dObject keeps one pos for life, as an EngineObject does, moved in place each step, so a camera or anything
// else holding it follows the body

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{});

test('a falling Box2dObject moves the pos it has, and setPosition and setTransform keep it', () =>
{
    const o = new Box2dObject(vec2(0, 10));
    o.addBox(vec2(1));
    o.setLinearVelocity(vec2(0, -6)); // moving, as this world has no gravity
    const held = o.pos;
    engineStep(30);
    assert.ok(held === o.pos && held.y < 10, 'held ' + held.y);
    const to = vec2(5, 5);
    o.setPosition(to);
    assert.ok(o.pos === held && held.x === 5, 'setPosition');
    assert.notEqual(o.pos, to, 'the place given is not taken as the object\'s own');
    o.setTransform(vec2(-3, 2), .5);
    assert.ok(o.pos === held && held.x === -3 && o.angle === .5, 'setTransform');
    o.destroy();
    engineStep();
});
