import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dWeldJoint, Box2dWheelJoint, Box2dRevoluteJoint, box2d, vec2, worldToScreen, PI } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads, so mocks cannot hide a wrong native method or a world lock
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

// a 2D context that records what is drawn, so a draw can be checked without a canvas
function recordingContext()
{
    const calls = [];
    return { calls, context: new Proxy({}, { get: (t, name)=> name in t ? t[name] : (...args)=> calls.push([name, ...args]),
        set: (t, name, value)=> (t[name] = value, true) }) };
}

test('the weld joint sets and reads its damping, and the wheel joint its spring damping', () =>
{
    const a = new Box2dStaticObject(vec2()), b = new Box2dObject(vec2(0, 1));
    a.addBox(); b.addBox();
    const weld = new Box2dWeldJoint(a, b, vec2(0, .5));
    weld.setSpringDampingRatio(.5);
    assert.ok(Math.abs(weld.getSpringDampingRatio() - .5) < 1e-6);
    const wheel = new Box2dWheelJoint(a, b, vec2(0, .5));
    wheel.setSpringDampingRatio(.25);
    assert.ok(Math.abs(wheel.getSpringDampingRatio() - .25) < 1e-6);
    weld.destroy(); wheel.destroy(); a.destroy(); b.destroy();
});

test('stepping and the per frame setters do not pile up native vectors', () =>
{
    const o = new Box2dObject(vec2());
    o.addBox();
    const cache = instance.getCache(instance.b2Vec2), before = Object.keys(cache).length;
    for (let i = 0; i < 600; ++i)
    {
        box2d.step();
        o.setLinearVelocity(vec2(1, 0));
        o.applyForce(vec2(0, 1));
        o.setTransform(vec2(i, 0), 0);
    }
    const grew = Object.keys(cache).length - before;
    assert.ok(grew < 10, 'native vectors made: ' + grew);
    o.destroy();
});

test('an offset circle draws where it is on the body, and a lone edge draws', () =>
{
    const o = new Box2dObject(vec2(10, 20), vec2(), undefined, PI / 2);
    const circle = o.addCircle(2, vec2(3, 0));
    const { calls, context } = recordingContext();
    box2d.drawFixture(circle, o.pos, o.angle, undefined, undefined, undefined, false, context);
    // a quarter turn clockwise takes the offset (3, 0) to (0, -3)
    const expected = worldToScreen(vec2(10, 17)), translate = calls.find(c=> c[0] === 'translate');
    assert.ok(Math.abs(translate[1] - (expected.x + .5)) < 1e-6 && Math.abs(translate[2] - (expected.y + .5)) < 1e-6,
        'drawn at ' + translate.slice(1) + ', the circle is at ' + [expected.x + .5, expected.y + .5]);

    // a lone edge next to an edge list: each draws once, the list through the context it was given
    o.addEdge(vec2(), vec2(1, 0));
    o.addEdgeList([vec2(0, 1), vec2(1, 1), vec2(2, 1)]);
    const drawn = recordingContext();
    o.drawFixtures(undefined, undefined, undefined, false, drawn.context);
    const strokes = drawn.calls.filter(c=> c[0] === 'stroke').length, fills = drawn.calls.filter(c=> c[0] === 'fillRect').length;
    assert.ok(fills >= 1, 'the lone edge draws, as a line');
    assert.ok(strokes >= 1, 'the edge list draws through the context it was given');
    o.destroy();
});

test('getJointList returns the joints, and the queries reuse their native objects', () =>
{
    const a = new Box2dStaticObject(vec2(20, 0)), b = new Box2dObject(vec2(20, 1));
    a.addBox(); b.addBox();
    const joint = new Box2dRevoluteJoint(a, b, vec2(20, .5));
    const joints = b.getJointList();
    assert.equal(joints.length, 1);
    assert.equal(typeof joints[0].GetType, 'function', 'a joint, not a joint edge');
    assert.equal(instance.getPointer(joints[0]), instance.getPointer(joint.box2dJoint));

    const count = (type)=> Object.keys(instance.getCache(type)).length;
    const types = [instance.JSQueryCallback, instance.JSRayCastCallback, instance.b2AABB];
    for (let i = 0; i < 3; ++i) // the first calls may make the ones that are kept
        box2d.raycastAll(vec2(20, 5), vec2(20, -5)), box2d.boxCastAll(vec2(20, 0), vec2(2)), box2d.boxCast(vec2(20, 0), vec2(2)), box2d.pointCast(vec2(20, 1));
    const before = types.map(count);
    for (let i = 0; i < 100; ++i)
    {
        assert.ok(box2d.raycastAll(vec2(20, 5), vec2(20, -5)).length >= 1);
        assert.ok(box2d.boxCastAll(vec2(20, 0), vec2(2)).length >= 1);
        box2d.boxCast(vec2(20, 0), vec2(2));
        box2d.pointCast(vec2(20, 1));
    }
    assert.deepEqual(types.map(count), before, 'no native objects made per query');
    joint.destroy(); a.destroy(); b.destroy();
});

// last in the file: before the fix this aborted the Box2D instance
test('an object destroyed in its contact callback goes after the step, and the world steps on', () =>
{
    const ground = new Box2dStaticObject(vec2());
    ground.addBox(vec2(10, 1));
    const falling = new Box2dObject(vec2(0, .5)), other = new Box2dObject(vec2(3, .5));
    falling.addBox(); other.addBox();
    let contacts = 0;
    falling.beginContact = ()=> { ++contacts; falling.destroy(); falling.destroy(); }; // itself, twice
    ground.beginContact = (o)=> o === other && other.destroy(); // and the other body of a contact
    const bodies = box2d.world.GetBodyCount();
    box2d.step();
    assert.ok(contacts >= 1, 'the contact came');
    assert.equal(falling.destroyed, true, 'destroyed as soon as asked');
    assert.equal(other.destroyed, true);
    assert.equal(box2d.world.GetBodyCount(), bodies - 2, 'their bodies went once the step was done');
    assert.ok(!box2d.objects.includes(falling) && !box2d.objects.includes(other));
    box2d.step(); // and the world steps on
    ground.destroy();
});
