import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { box2dInit, Box2dObject, vec2, setEngineManualStep, engineInit, engineStep } from '../dist/littlejs.esm.js';

// A Box2dObject has every field of an EngineObject, but Box2D moves its body and reads none of the engine's physics
// fields, so one set on it did nothing and said nothing: a debug build warns once a field, naming what to call

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{});

// the warnings a step prints
function warnings(f)
{
    const said = [], warn = console.warn;
    console.warn = (...a)=> said.push(a.join(' '));
    try { f(); } finally { console.warn = warn; }
    return said;
}

test('an untouched Box2dObject, and one moved through its own calls, warns of nothing', () =>
{
    const said = warnings(()=>
    {
        const o = new Box2dObject(vec2());
        o.addBox(vec2(1));
        o.setLinearVelocity(vec2(1, 0));
        o.setLinearDamping(2);
        o.setGravityScale(.5);
        engineStep(3);
    });
    assert.deepEqual(said, []);
});

test('an engine physics field set on a Box2dObject warns once, naming the Box2D call to use instead', () =>
{
    const said = warnings(()=>
    {
        const o = new Box2dObject(vec2());
        o.addBox(vec2(1));
        o.damping = .9;
        o.angleDamping = .5;
        engineStep(3);
        o.velocity = vec2(1, 0); // set later, as a game does in its update
        engineStep(3);
        const other = new Box2dObject(vec2(5, 0));
        other.damping = .8; // the same field again, on another object
        engineStep(3);
    });
    assert.equal(said.length, 3, said.join(' | '));
    assert.match(said[0], /damping.*setLinearDamping/);
    assert.match(said[1], /angleDamping.*setAngularDamping/);
    assert.match(said[2], /velocity.*setLinearVelocity/);
});

test('gravityScale set straight on the field warns, set with setGravityScale does not', () =>
{
    const said = warnings(()=>
    {
        const o = new Box2dObject(vec2());
        o.addBox(vec2(1));
        o.gravityScale = 2;
        engineStep(2);
    });
    assert.equal(said.length, 1);
    assert.match(said[0], /gravityScale.*setGravityScale/);
});

test('the check asks the body for its gravity scale only when the field changed, as it runs every step', () =>
{
    const o = new Box2dObject(vec2(20, 0));
    o.addBox(vec2(1));
    let asked = 0;
    const ask = o.body.GetGravityScale.bind(o.body);
    o.body.GetGravityScale = ()=> (++asked, ask());
    engineStep(5);
    assert.equal(asked, 0);
    o.setGravityScale(3);
    engineStep(5);
    assert.equal(asked, 1);
});
