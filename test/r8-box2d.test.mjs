import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dTileLayer, Box2dWheelJoint, Box2dDistanceJoint,
    Box2dTargetJoint, TileCollisionLayer, box2d, vec2, BLACK, setGravity } from '../dist/littlejs.esm.js';

// review round 8: moved sleeping bodies wake, a tile layer rebuild is quick and builds on its own, boxCast tests the
// real shapes, the wheel axis is normalized, a tiny box or a joint to itself is refused, and lineColor is its own

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);
setGravity(vec2(0, -20));

const settle = (o, steps=300)=> { for (let i = steps; i-- && o.getIsAwake();) box2d.step(); };
const bodyY = (o)=> o.getCenterOfMass().y; // stepping by hand does not copy the body's place to pos

test('a sleeping body moved into the air falls, and so does one whose platform moved away', () =>
{
    const ground = new Box2dStaticObject(vec2(0, 0));
    ground.addBox(vec2(20, 1));
    const platform = new Box2dStaticObject(vec2(30, 0));
    platform.addBox(vec2(4, 1));
    const crate = new Box2dObject(vec2(0, 1.5));
    crate.addBox(vec2(1));
    const other = new Box2dObject(vec2(30, 1.5));
    other.addBox(vec2(1));
    try
    {
        settle(crate); settle(other);
        assert.equal(crate.getIsAwake(), false, 'asleep on the ground');
        assert.equal(other.getIsAwake(), false, 'asleep on the platform');

        crate.setPosition(vec2(0, 6));
        platform.setPosition(vec2(50, 0));
        for (let i = 60; i--;) box2d.step();
        assert.ok(bodyY(crate) < 2, 'the respawned crate fell back to the ground: ' + bodyY(crate));
        assert.ok(bodyY(other) < 0, 'the crate left without its platform fell: ' + bodyY(other));
    }
    finally { ground.destroy(); platform.destroy(); crate.destroy(); other.destroy(); box2d.step(); }
});

test('a sleeping body wakes for a new gravity scale or joint length', () =>
{
    const ground = new Box2dStaticObject(vec2(0, 0));
    ground.addBox(vec2(20, 1));
    const crate = new Box2dObject(vec2(0, 1.5));
    crate.addBox(vec2(1));
    const anchor = new Box2dStaticObject(vec2(5, 10));
    const hanging = new Box2dObject(vec2(5, 5));
    hanging.addBox(vec2(1));
    const joint = new Box2dDistanceJoint(anchor, hanging, anchor.pos, hanging.pos);
    try
    {
        settle(crate); settle(hanging);
        assert.equal(crate.getIsAwake(), false);
        assert.equal(hanging.getIsAwake(), false);
        crate.setGravityScale(-1);
        joint.setLength(2);
        for (let i = 120; i--;) box2d.step();
        assert.ok(bodyY(crate) > 3, 'it fell up: ' + bodyY(crate));
        assert.ok(bodyY(hanging) > 7, 'it was winched up: ' + bodyY(hanging));
    }
    finally { joint.destroy(); ground.destroy(); crate.destroy(); anchor.destroy(); hanging.destroy(); box2d.step(); }
});

test('a Box2dTileLayer builds its collision when made, and rebuilds a big layer quickly', () =>
{
    const size = 64, layer = new TileCollisionLayer(vec2(), vec2(size));
    for (let x = size; x--;)
    for (let y = size; y--;)
        (x + y) % 2 && layer.setCollisionData(vec2(x, y)); // a checkerboard, so no tiles merge
    const tiles = new Box2dTileLayer(layer);
    try
    {
        const count = tiles.getFixtureList().length;
        assert.equal(count, size * size / 2, 'one fixture per solid tile, built by the constructor');

        // a rebuild walks the fixture list a fixed number of times, not once per fixture, which made it quadratic;
        // counted rather than timed, so a busy machine can not fail it
        let walks = 0;
        const getFixtureList = tiles.getFixtureList;
        tiles.getFixtureList = function() { ++walks; return getFixtureList.call(this); };
        tiles.buildCollision();
        tiles.getFixtureList = getFixtureList;
        assert.equal(tiles.getFixtureList().length, count, 'rebuilt, the old ones gone');
        assert.ok(walks <= 3, 'a single pass, not one walk of the list per fixture: ' + walks + ' walks');
    }
    finally { tiles.destroy(); box2d.step(); }
});

test('boxCast and boxCastAll only find shapes inside the box, not ones only near it', () =>
{
    const wall = new Box2dStaticObject(vec2(0, 0));
    wall.addBox(vec2(1));
    try
    {
        box2d.step();
        assert.deepEqual(box2d.boxCastAll(vec2(.6, 0), vec2(.1)), [], 'clear of the wall by .05');
        assert.equal(box2d.boxCast(vec2(.6, 0), vec2(.1)), undefined);
        assert.deepEqual(box2d.boxCastAll(vec2(.5, 0), vec2(.2)), [wall], 'touching it');
        assert.equal(box2d.boxCast(vec2(.5, 0), vec2(.2)), wall);
    }
    finally { wall.destroy(); box2d.step(); }
});

test('a wheel joint axis is normalized, its length does not scale the joint', () =>
{
    const car = new Box2dObject(vec2(0, 20));
    car.addBox(vec2(2, 1));
    const wheel = new Box2dObject(vec2(0, 19));
    wheel.addCircle(.5);
    const joint = new Box2dWheelJoint(car, wheel, wheel.pos, vec2(0, 2));
    try
    {
        const axis = joint.getLocalAxisA();
        assert.ok(Math.abs(axis.length() - 1) < 1e-6, 'unit length: ' + axis);
    }
    finally { joint.destroy(); car.destroy(); wheel.destroy(); box2d.step(); }
});

test('a box too small for Box2D and a joint from an object to itself are refused, not a Box2D abort', () =>
{
    const o = new Box2dObject(vec2(0, 40));
    try
    {
        assert.throws(()=> o.addBox(vec2(3e-4)), /Assert failed/);
        assert.throws(()=> new Box2dTargetJoint(o, o, o.pos), /Assert failed/);
        assert.ok(o.addBox(vec2(1)), 'it still works after');
    }
    finally { o.destroy(); box2d.step(); }
});

test('a Box2dObject line color is its own, not the shared BLACK', () =>
{
    const o = new Box2dObject(vec2(0, 50));
    try
    {
        assert.notEqual(o.lineColor, BLACK);
        assert.deepEqual([o.lineColor.r, o.lineColor.g, o.lineColor.b, o.lineColor.a], [0, 0, 0, 1]);
        o.lineColor.a = .5; // no assert, and BLACK stays as it was
        assert.equal(BLACK.a, 1);
    }
    finally { o.destroy(); box2d.step(); }
});
