import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dRevoluteJoint, Box2dDistanceJoint, Box2dPinJoint, box2d,
    PathFinder, vec2 } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads, so mocks cannot hide a wrong native method or a world lock
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-4, (message || '') + ' ' + a + ' is not ' + b);

///////////////////////////////////////////////////////////////////////////////
// PathFinder

test('string pulling never adds a segment through a wall when a cell beside the path costs something', () =>
{
    // the path from the review's fuzz run: (3, 9) is solid and (2, 9), beside the path, costs 3
    const pf = new PathFinder(vec2(8, 16));
    pf.isWalkable = (x, y)=> !(x === 3 && y === 9);
    pf.getCost = (x, y)=> x === 2 && y === 9 ? 3 : 0;
    pf.buildNodeData();
    const path = [[5,7],[5,8],[5,9],[5,10],[4,10],[3,10],[2,10],[1,9],[0,9]].map(([x, y])=> pf.getNode(x, y));
    pf.smoothPathStringPull(path);
    assert.equal(path[0], pf.getNode(5, 7));
    assert.equal(path[path.length - 1], pf.getNode(0, 9));
    for (let i = 1; i < path.length; ++i)
    {
        const a = path[i - 1].posWorld, b = path[i].posWorld;
        for (let t = 0; t <= 1; t += 1 / 256)
        {
            const x = Math.floor(a.x + (b.x - a.x) * t), y = Math.floor(a.y + (b.y - a.y) * t);
            assert.ok(pf.getNode(x, y).walkable, `the segment ${a} to ${b} crosses the solid cell ${x}, ${y}`);
        }
    }
});

test('findPath without a rebuild asks no cell again and finds the same paths', () =>
{
    const pf = new PathFinder(vec2(20, 20));
    let asked = 0;
    pf.isWalkable = (x, y)=> (++asked, !(x === 10 && y > 2)); // a wall with a gap at the bottom
    const start = vec2(2.5, 10.5), end = vec2(17.5, 10.5), start2 = vec2(17.5, 18.5), end2 = vec2(1.5, 1.5);
    const fresh = pf.findPath(start, end), fresh2 = pf.findPath(start2, end2);
    assert.ok(fresh.length >= 2 && fresh2.length >= 2);

    pf.buildNodeData();
    asked = 0;
    assert.deepEqual(pf.findPath(start, end, false), fresh);
    assert.deepEqual(pf.findPath(start2, end2, false), fresh2, 'a search after another starts as fresh');
    assert.deepEqual(pf.findPath(start, end, false), fresh);
    assert.equal(asked, 0, 'no cell was asked about again');
});

///////////////////////////////////////////////////////////////////////////////
// Box2D, first the tests that leave the wasm working even before the fixes

// first of the Box2D tests, so the raw body cannot reuse the native address of a destroyed Box2dObject's body
test('the queries skip a raw body that has no Box2dObject', () =>
{
    const bodyDef = new instance.b2BodyDef(), shape = new instance.b2PolygonShape();
    bodyDef.set_position(new instance.b2Vec2(60, 0));
    shape.SetAsBox(.5, .5);
    const raw = box2d.world.CreateBody(bodyDef);
    raw.CreateFixture(shape, 1);
    const o = new Box2dStaticObject(vec2(60, 0));
    o.addBox();

    assert.deepEqual(box2d.boxCastAll(vec2(60, 0), vec2(2)), [o]);
    assert.deepEqual(box2d.circleCastAll(vec2(60, 0), 2), [o]);
    assert.equal(box2d.circleCast(vec2(60, 0), 2), o);
    assert.equal(box2d.boxCast(vec2(60, 0), vec2(2)), o);
    const hits = box2d.raycastAll(vec2(60, 5), vec2(60, -5));
    assert.ok(hits.length >= 1 && hits.every(hit=> hit.object === o));
    box2d.world.DestroyBody(raw);
    o.destroy();
});

test('an edge list and an edge loop turn on their ghost vertices', () =>
{
    const o = new Box2dStaticObject(vec2(120, 0));
    const shape = (f)=> box2d.castShapeObject(f.GetShape());
    const ghosts = (f)=> [shape(f).get_m_hasVertex0(), shape(f).get_m_hasVertex3()];
    const list = o.addEdgeList([vec2(0, 0), vec2(1, 0), vec2(2, 0)]);
    assert.deepEqual(list.map(ghosts), [[false, true], [true, false]]);
    const loop = o.addEdgeLoop([vec2(0, 1), vec2(1, 1), vec2(1, 2)]);
    assert.deepEqual(loop.map(ghosts), [[true, true], [true, true], [true, true]]);
    o.destroy();
});

test('the native defs and shapes a body, fixture or joint is made from are freed', () =>
{
    const types = ['b2BodyDef', 'b2FixtureDef', 'b2PolygonShape', 'b2CircleShape', 'b2EdgeShape',
        'b2RevoluteJointDef', 'b2DistanceJointDef'];
    const counts = ()=> types.map(type=> Object.keys(instance.getCache(instance[type])).length);
    const make = ()=>
    {
        const a = new Box2dStaticObject(vec2(100, 0)), o = new Box2dObject(vec2(100, 1));
        o.addBox(); o.addCircle(); o.addPoly([vec2(0, 0), vec2(1, 0), vec2(0, 1)]); o.addRegularPoly();
        o.addEdge(vec2(0, 0), vec2(1, 0));
        o.addEdgeList([vec2(0, 0), vec2(1, 0), vec2(2, 0)]);
        o.addEdgeLoop([vec2(0, 0), vec2(1, 0), vec2(1, 1)]);
        new Box2dRevoluteJoint(a, o, vec2(100, .5));
        new Box2dPinJoint(a, o);
        o.destroy(); a.destroy();
    };
    make();
    const before = counts();
    for (let i = 0; i < 10; ++i)
        make();
    assert.deepEqual(counts(), before, types.join(', '));
});

test('destroying the fixtures of an edge list stops it drawing, and a new fixture draws', () =>
{
    const o = new Box2dStaticObject(vec2(140, 0));
    o.addEdgeList([vec2(0, 0), vec2(1, 0), vec2(2, 0)]);
    o.addEdgeLoop([vec2(0, 1), vec2(1, 1), vec2(1, 2)]);
    o.destroyAllFixtures();
    assert.equal(o.edgeLists.length, 0);
    assert.equal(o.edgeLoops.length, 0);
    const box = o.addBox();
    assert.ok(!o.edgeListFixtures.has(instance.getPointer(box)), 'the box is not taken for an edge');

    // one fixture of a list gone: the list is no longer one line, what is left draws edge by edge
    const [first, second] = o.addEdgeList([vec2(0, 3), vec2(1, 3), vec2(2, 3)]);
    o.destroyFixture(first);
    assert.equal(o.edgeLists.length, 0);
    assert.ok(!o.edgeListFixtures.has(instance.getPointer(second)));
    o.destroy();
});

test('angular acceleration changes the angular velocity by itself, whatever the shape is off center', () =>
{
    const o = new Box2dObject(vec2(160, 0));
    o.addCircle(1, vec2(2, 0));
    o.applyAngularAcceleration(1);
    near(o.getAngularVelocity(), 1);
    o.applyAngularAcceleration(-.5);
    near(o.getAngularVelocity(), .5);
    o.destroy();
});

test('setFilterData with its defaults leaves a fixture colliding as a new one does', () =>
{
    const o = new Box2dObject(vec2(180, 0));
    const fixture = o.addBox();
    o.setFilterData();
    const filter = fixture.GetFilterData();
    assert.equal(filter.get_categoryBits(), 1);
    assert.equal(filter.get_maskBits(), 0xffff);
    o.destroy();
});

test('a pin joint pins both objects at its point', () =>
{
    const a = new Box2dStaticObject(vec2(200, 0)), b = new Box2dObject(vec2(201, 0));
    a.addBox(); b.addBox();
    const pin = new Box2dPinJoint(a, b, vec2(200.5, 0));
    near(pin.getAnchorA().x, 200.5, 'anchor A');
    near(pin.getAnchorB().x, 200.5, 'anchor B');
    pin.destroy();

    // by default, at objectA, as it was
    const pinA = new Box2dPinJoint(a, b);
    near(pinA.getAnchorA().x, 200); near(pinA.getAnchorB().x, 200);
    a.destroy(); b.destroy();
});

test('a destroyed object lets go of its body, and a joint Box2D destroyed with it lets go of the joint', () =>
{
    const a = new Box2dStaticObject(vec2(220, 0)), b = new Box2dObject(vec2(220, 1));
    a.addBox(); b.addBox();
    const joint = new Box2dRevoluteJoint(a, b, vec2(220, .5));
    b.destroy();
    assert.equal(b.body, undefined);
    assert.equal(joint.box2dJoint, 0);
    joint.destroy(); joint.destroy(); // nothing left to destroy
    box2d.step();
    a.destroy();
});

///////////////////////////////////////////////////////////////////////////////
// Box2D, last the tests that stopped the wasm for good before the fixes

test('a ray with no length finds nothing, and Box2D goes on', () =>
{
    const o = new Box2dStaticObject(vec2(20, 0));
    o.addBox();
    assert.deepEqual(box2d.raycastAll(vec2(20, 0), vec2(20, 0)), []);
    assert.equal(box2d.raycast(vec2(20, 0), vec2(20, 0)), undefined);
    assert.deepEqual(box2d.raycastAll(vec2(1e6, 0), vec2(1e6 + .01, 0)), [], 'one point as 32 bit floats');
    const notANumber = vec2(); notANumber.x = NaN; // as a release build lets through
    assert.deepEqual(box2d.raycastAll(notANumber, vec2(20, 0)), []);
    assert.equal(box2d.raycast(vec2(20, 5), vec2(20, -5)).object, o);
    o.destroy();
});

test('a joint destroyed twice is destroyed once', () =>
{
    const a = new Box2dStaticObject(vec2(230, 0)), b = new Box2dObject(vec2(230, 1));
    a.addBox(); b.addBox();
    const joints = box2d.world.GetJointCount();
    const joint = new Box2dRevoluteJoint(a, b, vec2(230, .5));
    joint.destroy(); joint.destroy();
    assert.equal(box2d.world.GetJointCount(), joints);
    box2d.step();
    a.destroy(); b.destroy();
});

test('the setters wait for the step when called from a contact callback', () =>
{
    const ground = new Box2dStaticObject(vec2(80, 0)), box = new Box2dObject(vec2(80, .9));
    ground.addBox(vec2(10, 1)); box.addBox();
    let contacts = 0;
    box.beginContact = (other)=>
    {
        if (contacts++) return;
        box.setTransform(vec2(80, 50), 0);
        box.setMass(3);
        other.setBodyType(box2d.bodyTypeKinematic);
    };
    box2d.step();
    assert.ok(contacts >= 1, 'the contact came');
    near(box.body.GetPosition().get_y(), 50, 'moved');
    near(box.getMass(), 3, 'mass');
    assert.equal(ground.getBodyType(), box2d.bodyTypeKinematic);
    box2d.step(); // and the world steps on
    ground.destroy(); box.destroy();
});

test('an object destroyed from the endContact another destroy calls goes after it', () =>
{
    const ground = new Box2dStaticObject(vec2(240, 0)), box = new Box2dObject(vec2(240, .9));
    ground.addBox(vec2(10, 1)); box.addBox();
    box2d.step(); // they touch
    let ended = 0;
    box.endContact = (other)=> { ++ended; other.destroy(); };
    const bodies = box2d.world.GetBodyCount();
    box.destroy();
    assert.ok(ended >= 1, 'the contact ended');
    assert.equal(ground.destroyed, true);
    assert.equal(box2d.world.GetBodyCount(), bodies - 2);
    box2d.step(); // and the world steps on
});

test('a joint destroyed in the same contact callback as its object is not destroyed twice', () =>
{
    const anchor = new Box2dStaticObject(vec2(260, 5)), ground = new Box2dStaticObject(vec2(260, 0));
    const box = new Box2dObject(vec2(260, .9));
    anchor.addBox(); ground.addBox(vec2(10, 1)); box.addBox();
    const joint = new Box2dDistanceJoint(anchor, box);
    const joints = box2d.world.GetJointCount();
    box.beginContact = ()=> { box.destroy(); joint.destroy(); };
    box2d.step();
    assert.equal(box.body, undefined);
    assert.equal(joint.box2dJoint, 0);
    assert.equal(box2d.world.GetJointCount(), joints - 1);
    box2d.step(); // and the world steps on
    anchor.destroy(); ground.destroy();
});

test('a position and an angle set in one contact callback both stand', () =>
{
    const ground = new Box2dStaticObject(vec2(300, 0)), ball = new Box2dObject(vec2(300, .9));
    ground.addBox(vec2(10, 1)); ball.addCircle(1);
    let contacts = 0;
    ball.beginContact = ()=>
    {
        if (contacts++) return;
        ball.setPosition(vec2(300, 40)); // respawn above
        ball.setAngle(1);
    };
    box2d.step();
    assert.ok(contacts >= 1, 'the contact came');
    near(ball.body.GetPosition().get_y(), 40, 'position kept');
    near(-ball.body.GetAngle(), 1, 'angle');
    ground.destroy(); ball.destroy();
    box2d.step();
});

test('angular acceleration does not turn a body with fixed rotation', () =>
{
    const o = new Box2dObject(vec2(320, 50));
    o.addBox();
    o.setFixedRotation(true);
    o.applyAngularAcceleration(1);
    for (let i = 10; i--;) box2d.step();
    near(o.body.GetAngle(), 0, 'turned');
    o.destroy();
    box2d.step();
});
