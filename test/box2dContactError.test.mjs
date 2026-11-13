import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as LJS from '../dist/littlejs.esm.min.js';

// A contact callback runs inside Box2D's step, in its WebAssembly: an error thrown there passed out through it and
// left the world locked for good, so every body made after failed; and a scene set from one, as a game restarts on
// touching spikes, made its bodies while the world was locked. The error is kept and thrown once the step is done,
// and the scene waits for the step to end.

const { vec2, Box2dObject, Box2dStaticObject } = LJS;
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await LJS.box2dInit();
LJS.setHeadlessMode(true);
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=>{});

// a ball falling onto a floor, its beginContact given
function drop(beginContact)
{
    const floor = new Box2dStaticObject(vec2(0, -2));
    floor.addBox(vec2(20, 1));
    const ball = new Box2dObject(vec2(0, -1)); // overlapping the floor, so they touch on the first step
    ball.addCircle(1);
    ball.beginContact = beginContact;
    return ball;
}
const stepUntil = (done, frames=120)=>
{
    let error;
    for (let i = 0; i < frames && !done(); ++i)
        try { LJS.box2d.step(); } catch (e) { error = e; }
    return error;
};

test('an error thrown from a contact callback comes out after the step, and the world goes on', ()=>
{
    let touched = false;
    drop(()=> { touched = true; throw new Error('spikes'); });
    const error = stepUntil(()=> touched);
    assert.equal(error?.message, 'spikes', 'thrown out of the step');
    assert.equal(LJS.box2d.world.IsLocked(), false, 'and the world is not locked');
    const after = new Box2dObject(vec2(5, 5));
    after.addBox(vec2(1));
    assert.ok(after.body, 'a body made after it is made');
    LJS.engineObjectsDestroy();
    LJS.box2d.step();
});

test('a scene set from a contact callback starts once the step is done, its bodies made', ()=>
{
    let made, entered = false;
    const scene = { enter() { entered = true; made = new Box2dObject(vec2(0, 9)); made.addBox(vec2(1)); } };
    drop(()=> LJS.setScene(scene));
    const error = stepUntil(()=> entered);
    assert.equal(error, undefined);
    assert.equal(LJS.getScene(), scene);
    assert.ok(made?.body && !made.destroyed, 'the new scene\'s body is made and kept');
    LJS.setScene();
});
