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
    weld.setDampingRatio(.5);
    assert.ok(Math.abs(weld.getDampingRatio() - .5) < 1e-6);
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
    assert.equal(joints[0], joint, 'the Box2dJoint, not a joint edge or the raw joint');

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

test('setting mass data reuses one native object', () =>
{
    const o = new Box2dObject(vec2(40, 0));
    o.addBox();
    o.setMass(2);
    const count = ()=> Object.keys(instance.getCache(instance.b2MassData)).length, before = count();
    for (let i = 0; i < 50; ++i)
        o.setMass(1 + i), o.setCenterOfMass(vec2(.1, 0)), o.setMomentOfInertia(3);
    assert.equal(count(), before);
    assert.ok(Math.abs(o.getMass() - 50) < 1e-4, 'the last mass set');
    o.destroy();
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

test('beginContact gets how fast the bodies closed along the normal, and 0 for a sensor', () =>
{
    // step until the first contact and give back what each side was handed
    function hit(a, b)
    {
        const speeds = [];
        a.beginContact = (o, f, of, speed)=> speeds[0] = speed;
        b.beginContact = (o, f, of, speed)=> speeds[1] = speed;
        for (let i = 0; i < 120 && !speeds.length; ++i)
            box2d.step();
        a.destroy(); b.destroy();
        return speeds;
    }

    // head on along x, gravity only pulls on y
    let a = new Box2dObject(vec2(0, 50)), b = new Box2dObject(vec2(3, 50));
    a.addBox(); b.addBox();
    a.setLinearVelocity(vec2(3, 0)); b.setLinearVelocity(vec2(-2, 0));
    let [speedA, speedB] = hit(a, b);
    assert.ok(Math.abs(speedA - 5) < .01, 'closing speed of both: ' + speedA);
    assert.equal(speedA, speedB, 'both sides get the same speed');

    // a round ball meeting a wall at 45 degrees closes at only part of its speed
    const wall = new Box2dStaticObject(vec2(3, 100));
    wall.addBox(vec2(1, 20));
    a = new Box2dObject(vec2(0, 100)); a.addCircle();
    a.setLinearVelocity(vec2(4, 4)); a.setGravityScale(0);
    [speedA] = hit(a, wall);
    assert.ok(Math.abs(speedA - 4) < .01, 'only the part along the normal: ' + speedA);

    // a sensor has no contact points
    a = new Box2dObject(vec2(0, 150)); b = new Box2dObject(vec2(3, 150));
    a.addBox(); b.addBox(vec2(1), vec2(), 0, 1, .2, 0, true);
    a.setLinearVelocity(vec2(3, 0));
    [speedA] = hit(a, b);
    assert.equal(speedA, 0);
});

test('beginContact gets where they touched, the normal toward each side and the impulse of the hit', () =>
{
    // step until the first contact and give back what each side was handed
    function hit(a, b)
    {
        const got = [];
        a.beginContact = (o, f, of, speed, contact)=> got[0] = {speed, ...contact};
        b.beginContact = (o, f, of, speed, contact)=> got[1] = {speed, ...contact};
        for (let i = 0; i < 120 && !got.length; ++i)
            box2d.step();
        a.destroy(); b.destroy();
        return got;
    }
    const near = (a, b, e=.01)=> Math.abs(a - b) < e;

    // a ball dropping on the ground, a push through its center, so the impulse is its mass times its speed
    let ground = new Box2dStaticObject(vec2(0, 200));
    ground.addBox(vec2(20, 1), vec2(), 0, 1, .2, .5);
    let ball = new Box2dObject(vec2(0, 203)), restitution = .5;
    ball.addCircle(1, vec2(), 1, .2, 0);
    ball.setLinearVelocity(vec2(0, -6)); ball.setGravityScale(0);
    const ballMass = ball.getMass();
    let [onBall, onGround] = hit(ball, ground);
    assert.ok(near(onBall.normal.x, 0) && near(onBall.normal.y, 1), 'the ground pushes the ball up: ' + onBall.normal);
    assert.ok(near(onGround.normal.y, -1), 'and the ball pushes the ground down: ' + onGround.normal);
    assert.ok(near(onBall.point.y, 200.5, .05) && near(onBall.point.x, 0), 'on the ground under the ball ' + onBall.point);
    assert.notEqual(onBall.point, onGround.point, 'each side has its own point');
    assert.ok(near(onBall.impulse, ballMass * onBall.speed * (1 + restitution), .05),
        onBall.impulse + ' is mass ' + ballMass + ' times speed ' + onBall.speed + ' with the bounce');
    assert.equal(onBall.impulse, onGround.impulse);

    // a box landing flat touches at two corners, solved together it is still its mass times its speed, in the middle
    ground = new Box2dStaticObject(vec2(0, 250));
    ground.addBox(vec2(20, 1));
    const box = new Box2dObject(vec2(3, 253));
    box.addBox(vec2(2, 1));
    box.setLinearVelocity(vec2(0, -6)); box.setGravityScale(0);
    const boxMass = box.getMass();
    [onBall] = hit(box, ground);
    assert.ok(near(onBall.impulse, boxMass * onBall.speed, .05), onBall.impulse + ' is ' + boxMass * onBall.speed);
    assert.ok(near(onBall.point.x, 3, .05), 'between its corners: ' + onBall.point);

    // a stick spun into a post, the same mass at the middle or the ends, hits at the same speed
    // but much harder with its mass at the ends, which turn it harder to stop
    function spin(weightOffset)
    {
        const post = new Box2dStaticObject(vec2(1, 302));
        post.addBox(vec2(.5, .5));
        const stick = new Box2dObject(vec2(0, 300));
        stick.addBox(vec2(.1, 4), vec2(), 0, .1);
        stick.addBox(vec2(.4), vec2(0, weightOffset), 0, 10);
        stick.addBox(vec2(.4), vec2(0, -weightOffset), 0, 10);
        stick.setGravityScale(0);
        stick.setAngularVelocity(3);
        const [onStick] = hit(stick, post);
        return onStick;
    }
    const middle = spin(.3), ends = spin(1.8);
    assert.ok(near(middle.speed, ends.speed, .05), 'the same speed: ' + middle.speed + ', ' + ends.speed);
    assert.ok(ends.impulse > middle.impulse * 3, 'the ends hit harder: ' + ends.impulse + ' to ' + middle.impulse);

    // a sensor has no point or normal
    const a = new Box2dObject(vec2(0, 350)), b = new Box2dObject(vec2(3, 350));
    a.addBox(); b.addBox(vec2(1), vec2(), 0, 1, .2, 0, true);
    a.setLinearVelocity(vec2(3, 0));
    const [onSensor] = hit(a, b);
    assert.deepEqual(onSensor, {speed: 0, point: undefined, normal: undefined, impulse: 0});
});
