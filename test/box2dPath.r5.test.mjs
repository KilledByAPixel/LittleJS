import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { box2dInit, box2d, Box2dObject, Box2dStaticObject, Box2dRevoluteJoint, Box2dGearJoint, Box2dWeldJoint,
    PathFinder, TileCollisionLayer, tile, vec2, setEngineManualStep, engineInit, engineStep, setTimeScale }
    from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads, brought in through box2dInit so its update runs as a plugin
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{});

const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-4, (message || '') + ' ' + a + ' is not ' + b);
const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');

// each test works in its own stretch of the world, so what one leaves behind touches no other

///////////////////////////////////////////////////////////////////////////////
// Box2D

test('Box2D stands still while timeScale is 0, like every other object', () =>
{
    const o = new Box2dObject(vec2(1000, 0));
    o.addBox();
    o.setLinearVelocity(vec2(1, 0));
    const x0 = o.body.GetPosition().get_x();
    engineStep(2);
    const x1 = o.body.GetPosition().get_x();
    assert.ok(x1 > x0, 'it moves at time scale 1');
    setTimeScale(0);
    try
    {
        engineStep(5);
        assert.equal(o.body.GetPosition().get_x(), x1, 'the body stood still');
        assert.equal(o.pos.x, x1);
    }
    finally { setTimeScale(1); }
    engineStep(1);
    assert.ok(o.body.GetPosition().get_x() > x1, 'and it moves again at 1');
    o.destroy();
});

test('a destroyed object is no longer reachable from its body, and endContact still finds it on the way out', () =>
{
    const ground = new Box2dStaticObject(vec2(100, 0));
    ground.addBox(vec2(4, 1));
    const o = new Box2dObject(vec2(100, .5));
    o.addBox();
    box2d.step(); // the contact begins
    let ended;
    ground.endContact = (other)=> ended = other;
    const body = o.body;
    o.destroy();
    assert.equal(ended, o, 'destroying the body ended the contact with the object');
    assert.equal(body.object, undefined, 'the binding keeps the body wrapper, which lets go of the object');
    ground.destroy();
});

test('the queries skip an object destroyed earlier in the same step', () =>
{
    const ground = new Box2dStaticObject(vec2(200, 0));
    ground.addBox(vec2(10, 1));
    const target = new Box2dObject(vec2(203, .9));
    target.addBox();
    let found;
    target.beginContact = (other)=>
    {
        if (other !== ground || found) return;
        target.destroy();
        found = {
            boxCastAll: box2d.boxCastAll(vec2(203, .9), vec2(2)).includes(target),
            boxCast: box2d.boxCast(vec2(203, 1.2), vec2(.2)) === target,
            circleCastAll: box2d.circleCastAll(vec2(203, .9), 2).includes(target),
            pointCast: box2d.pointCast(vec2(203, .9)) === target,
            raycastAll: box2d.raycastAll(vec2(195, .9), vec2(205, .9)).some(r=> r.object === target),
        };
    };
    box2d.step();
    assert.ok(found, 'the contact came');
    assert.deepEqual(found, { boxCastAll: false, boxCast: false, circleCastAll: false, pointCast: false,
        raycastAll: false });
    ground.destroy();
});

test('a weld joint reads back its reference angle, clockwise like angle', () =>
{
    const a = new Box2dObject(vec2(300, 0), vec2(1), undefined, .3);
    const b = new Box2dObject(vec2(301, 0), vec2(1), undefined, 1);
    a.addBox(); b.addBox();
    const weld = new Box2dWeldJoint(a, b);
    near(weld.getReferenceAngle(), .7, 'objectB angle minus objectA angle');
    weld.destroy(); a.destroy(); b.destroy();
});

test('a gear joint goes with either joint it gears, or an object they are on, not left pointing at freed memory', () =>
{
    const make = (x)=>
    {
        const ground = new Box2dStaticObject(vec2(x, 0));
        ground.addBox();
        const w1 = new Box2dObject(vec2(x - 2, 5)), w2 = new Box2dObject(vec2(x + 2, 5));
        w1.addCircle(1); w2.addCircle(1);
        const j1 = new Box2dRevoluteJoint(ground, w1, w1.pos), j2 = new Box2dRevoluteJoint(ground, w2, w2.pos);
        const gear = new Box2dGearJoint(w1, w2, j1, j2);
        return { ground, w1, w2, j1, j2, gear };
    };

    // the ground goes, taking both joints, and the gear goes with them
    let s = make(400);
    let joints = box2d.world.GetJointCount();
    s.ground.destroy();
    assert.equal(s.gear.box2dJoint, 0, 'the gear let go of its joint');
    assert.equal(box2d.world.GetJointCount(), joints - 3, 'both joints and the gear are gone');
    box2d.step(); // and the world steps on
    s.w1.destroy(); s.w2.destroy();

    // one of the joints goes by itself, and the gear goes first
    s = make(420);
    joints = box2d.world.GetJointCount();
    s.j1.destroy();
    assert.equal(s.gear.box2dJoint, 0);
    assert.equal(box2d.world.GetJointCount(), joints - 2, 'the joint and the gear are gone');
    assert.notEqual(s.j2.box2dJoint, 0, 'the other joint stays');
    box2d.step();
    s.ground.destroy(); s.w1.destroy(); s.w2.destroy();
});

test('getInertia is about the center of mass, like setMomentOfInertia', () =>
{
    // a unit box 3 out from the origin: mass 1, and 1/6 about its center where Box2D gives 9 + 1/6 about the origin
    const o = new Box2dObject(vec2(500, 20));
    o.addBox(vec2(1), vec2(3, 0));
    near(o.getMass(), 1);
    near(o.getInertia(), 1/6);
    o.destroy();
});

test('an addRegularPoly with more than 8 sides says why it cannot be made', () =>
{
    // a debug build stops at the assert, a release build makes 8 sides; either way Box2D is not asked for 12
    const o = new Box2dObject(vec2(520, 20));
    const saved = console.assert, messages = [];
    console.assert = (condition, ...output)=> condition || messages.push(output.join(' '));
    try { assert.throws(()=> o.addRegularPoly(1, 12)); }
    finally { console.assert = saved; }
    assert.ok(messages.some(m=> /at most 8 sides/.test(m)), 'the assert says so: ' + JSON.stringify(messages));
    o.addRegularPoly(1, 8); // and 8 is fine
    box2d.step();
    o.destroy();
});

test('the query results and optional joint anchors are typed in the d.ts', () =>
{
    assert.match(dts, /raycastAll\(start: Vector2, end: Vector2, includeSensors\?: boolean\): Array<Box2dRaycastResult>;/);
    assert.match(dts, /raycast\(start: Vector2, end: Vector2, includeSensors\?: boolean\): Box2dRaycastResult \| undefined;/);
    assert.match(dts, /boxCastAll\(pos: Vector2, size: Vector2, includeSensors\?: boolean\): Array<Box2dObject>;/);
    assert.match(dts, /boxCast\(pos: Vector2, size: Vector2, includeSensors\?: boolean\): Box2dObject \| undefined;/);
    assert.match(dts, /circleCastAll\(pos: Vector2, diameter: number, includeSensors\?: boolean\): Array<Box2dObject>;/);
    assert.match(dts, /circleCast\(pos: Vector2, diameter: number, includeSensors\?: boolean\): Box2dObject \| undefined;/);
    assert.match(dts, /pointCast\(pos: Vector2, dynamicOnly\?: boolean, includeSensors\?: boolean\): Box2dObject \| undefined;/);
    assert.match(dts, /destroyFixture\(fixture: any\): void;/, 'the fixture is required');

    // every joint that fills in a missing anchor takes it as optional, the pulley's ground anchors stay required
    const constructors = dts.match(/constructor\(objectA: Box2dObject, objectB: Box2dObject[^)]*\)/g);
    assert.ok(constructors.length >= 10);
    for (const c of constructors)
        assert.doesNotMatch(c, /\banchor[AB]?: Vector2/, c);
    assert.match(dts, /groundAnchorA: Vector2, groundAnchorB: Vector2, anchorA\?: Vector2, anchorB\?: Vector2/);
});

///////////////////////////////////////////////////////////////////////////////
// PathFinder

test('PathFinder walks cells with negative collision data, which the engine treats as empty', () =>
{
    const layer = new TileCollisionLayer(vec2(), vec2(3, 1), tile(0, 16), 0, false);
    layer.setCollisionData(vec2(1, 0), -1);
    layer.setCollisionData(vec2(2, 0), 0);
    const pf = new PathFinder(layer);
    assert.equal(pf.isWalkable(1, 0), true);
    assert.ok(pf.findPath(vec2(.5, .5), vec2(2.5, .5)).length > 0, 'a path through the negative cell');
    layer.setCollisionData(vec2(1, 0), 1);
    assert.equal(pf.isWalkable(1, 0), false, 'positive data is still a wall');
    layer.destroy();
});

test('PathFinder.buildNodeData is public, since findPath with rebuild false needs it', () =>
{
    assert.doesNotMatch(dts, /private buildNodeData;/);
    assert.match(dts, /buildNodeData\(\): void;/);
});

///////////////////////////////////////////////////////////////////////////////
// last in the file: before the fixes each of these aborted the Box2D instance, and any test after it would fail too

test('destroying a fixture twice destroys it once', () =>
{
    const o = new Box2dObject(vec2(600, 20));
    const f = o.addBox();
    o.addCircle();
    o.destroyFixture(f);
    o.destroyFixture(f);
    assert.equal(o.getFixtureList().length, 1, 'the other fixture stays');
    box2d.step();
    o.destroy();
});

test('destroyAllFixtures from two contacts in one step destroys each fixture once', () =>
{
    const ground = new Box2dStaticObject(vec2(620, 0));
    ground.addBox(vec2(10, 1));
    const a = new Box2dObject(vec2(618, .5)), b = new Box2dObject(vec2(622, .5));
    a.addBox(); b.addBox();
    let contacts = 0;
    ground.beginContact = ()=> { ++contacts; ground.destroyAllFixtures(); };
    box2d.step();
    assert.equal(contacts, 2, 'both contacts came in the one step');
    assert.equal(ground.hasFixtures(), false);
    box2d.step(); // and the world steps on
    ground.destroy(); a.destroy(); b.destroy();
});

test('a polygon with its points in a line makes no fixture, and Box2D goes on', () =>
{
    const o = new Box2dObject(vec2(640, 20));
    const saved = console.assert;
    console.assert = ()=> {}; // the assert's own output
    try { assert.throws(()=> o.addPoly([vec2(0, 0), vec2(1, 0), vec2(2, 0)]), /Assert failed/); }
    finally { console.assert = saved; }
    assert.equal(o.hasFixtures(), false);
    o.addBox();
    box2d.step();
    o.destroy();
});

test('setCenterOfMass, setMass and setMomentOfInertia take the inertia about the center of mass', () =>
{
    // a centered circle given an off center mass
    let o = new Box2dObject(vec2(700, 20));
    o.addCircle(1);
    const mass = o.getMass(), inertia = o.getInertia();
    o.setCenterOfMass(vec2(.5, 0));
    near(o.body.GetLocalCenter().get_x(), .5);
    near(o.getMass(), mass);
    near(o.getInertia(), inertia, 'the same inertia about the new center');
    o.destroy();

    // an off center circle made heavier
    o = new Box2dObject(vec2(710, 20));
    o.addCircle(1, vec2(2, 0));
    o.setMass(o.getMass() * 3);
    near(o.getMass(), mass * 3);
    assert.ok(o.getInertia() > 0);
    o.destroy();

    // an off center box given an inertia about its center, then none
    o = new Box2dObject(vec2(720, 20));
    o.addBox(vec2(1), vec2(3, 0));
    o.setMomentOfInertia(.5);
    near(o.getInertia(), .5);
    o.setMomentOfInertia(0);
    assert.equal(o.getInertia(), 0, 'exactly none, not a float speck');
    // a locked rotation stays locked through a new mass or center, where float rounding came out either side of 0
    for (const m of [1.1, 2, 3.3, .7])
        o.setMass(m);
    o.setCenterOfMass(vec2(2.9, .1));
    assert.equal(o.getInertia(), 0);
    box2d.step();
    o.destroy();
});

test('a closed loop of computed points makes a polygon, the repeated point counts once', () =>
{
    // the last point is the first one turned all the way round, about 1e-16 off it
    for (let n = 3; n <= 7; ++n)
    {
        const o = new Box2dObject(vec2(740 + n*10, 20));
        const points = [];
        for (let i = 0; i <= n; ++i)
            points.push(vec2(1, 0).rotate(i/n*2*Math.PI));
        o.addPoly(points);
        assert.equal(o.hasFixtures(), true, n + ' sides');
        box2d.step();
        o.destroy();
    }
});
