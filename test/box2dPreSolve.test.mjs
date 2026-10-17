import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, box2d, vec2, setGravity, PI } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

const steps = (count)=> { for (let i = count; i--;) box2d.step(); };
// where a body is, its pos is only copied over in the engine's update
const at = (o)=> o.getCenterOfMass();

// count the contact callbacks an object gets
function countContacts(o)
{
    const counts = {begin: 0, end: 0};
    o.beginContact = ()=> ++counts.begin;
    o.endContact = ()=> ++counts.end;
    return counts;
}

test('a one way platform lets a ball up through it with no callbacks and catches it on the way down', () =>
{
    const platform = new Box2dStaticObject(vec2(0, 100));
    platform.addBox(vec2(4, .5));
    platform.oneWay = vec2(0, 1);
    const ball = new Box2dObject(vec2(0, 98));
    ball.addCircle(1);
    ball.setGravityScale(0);
    const counts = countContacts(ball);

    // up through it
    ball.setLinearVelocity(vec2(0, 10));
    steps(60);
    assert.ok(at(ball).y > 102, 'went through: ' + at(ball));
    assert.deepEqual(counts, {begin: 0, end: 0}, 'and was never told of it');

    // and back down onto it
    ball.setLinearVelocity(vec2(0, -10));
    steps(60);
    assert.ok(Math.abs(at(ball).y - 100.75) < .05, 'stopped on top: ' + at(ball));
    assert.deepEqual(counts, {begin: 1, end: 0});
    ball.destroy(); platform.destroy();
});

test('a one way platform turned a quarter is one way to the side', () =>
{
    // turned a quarter clockwise, up is to the right
    const platform = new Box2dStaticObject(vec2(0, 200), vec2(), undefined, PI/2);
    platform.addBox(vec2(4, .5));
    platform.oneWay = vec2(0, 1);
    const right = new Box2dObject(vec2(-2, 200)), left = new Box2dObject(vec2(2, 201));
    right.addCircle(1); left.addCircle(1);
    right.setGravityScale(0); left.setGravityScale(0);
    right.setLinearVelocity(vec2(10, 0)); left.setLinearVelocity(vec2(-10, 0));
    steps(30);
    assert.ok(at(right).x > 1, 'moving right goes through: ' + at(right));
    assert.ok(at(left).x > .7, 'moving left is stopped: ' + at(left));
    right.destroy(); left.destroy(); platform.destroy();
});

test('a conveyor carries what rests on it, waking it, and a surface speed on the box rolls it like a tread', () =>
{
    setGravity(vec2(0, -10));
    const belt = new Box2dStaticObject(vec2(0, 300));
    belt.addBox(vec2(40, 1), vec2(), 0, 1, 1);
    const box = new Box2dObject(vec2(0, 301));
    box.addBox(vec2(1), vec2(), 0, 1, .8);
    steps(120);
    assert.ok(!box.getIsAwake(), 'the box settled and sleeps');

    belt.setSurfaceSpeed(3);
    steps(60);
    assert.ok(Math.abs(box.getLinearVelocity().x - 3) < .05, 'carried right: ' + box.getLinearVelocity());
    belt.setSurfaceSpeed(-2);
    steps(60);
    assert.ok(Math.abs(box.getLinearVelocity().x + 2) < .05, 'and left: ' + box.getLinearVelocity());

    // a box whose own surface runs clockwise rolls right on a still belt, as a wheel turning clockwise does
    belt.setSurfaceSpeed(0);
    box.setSurfaceSpeed(2);
    steps(60);
    assert.ok(Math.abs(box.getLinearVelocity().x - 2) < .05, 'rolled right: ' + box.getLinearVelocity());
    box.destroy(); belt.destroy();
    setGravity(vec2());
});

test('preSolve sees the contact toward itself and can turn it off until they stop touching', () =>
{
    setGravity(vec2(0, -10));
    const platform = new Box2dStaticObject(vec2(0, 400));
    platform.addBox(vec2(4, .5));
    platform.oneWay = vec2(0, 1);
    const player = new Box2dObject(vec2(0, 401));
    player.addBox(vec2(1));
    const counts = countContacts(player);
    steps(60);
    assert.ok(Math.abs(at(player).y - 400.75) < .05, 'stands on the platform: ' + at(player));

    // drop through for one step only, then it keeps falling through to the end; it fell asleep standing there,
    // and the contacts of a sleeping body are not solved
    let seen, drop = true;
    player.preSolve = (other, fixture, otherFixture, contact)=>
    {
        seen = contact;
        if (drop) contact.enabled = false;
        drop = false;
    };
    player.setAwake();
    steps(1);
    assert.equal(seen.normal.x, 0);
    assert.ok(Math.abs(seen.normal.y - 1) < 1e-6, 'the platform pushes up on it: ' + seen.normal);
    assert.ok(Math.abs(seen.point.x) < .05 && Math.abs(seen.point.y - 400.25) < .05, 'under it: ' + seen.point);
    steps(60);
    assert.ok(at(player).y < 398, 'fell through: ' + at(player));
    assert.deepEqual(counts, {begin: 1, end: 1});
    player.destroy(); platform.destroy();
    setGravity(vec2());
});

test('preSolve changes friction for as long as they touch', () =>
{
    setGravity(vec2(0, -10));
    function slide(friction)
    {
        const ground = new Box2dStaticObject(vec2(0, 500));
        ground.addBox(vec2(40, 1), vec2(), 0, 1, 1);
        const box = new Box2dObject(vec2(0, 501));
        box.addBox(vec2(1), vec2(), 0, 1, .5);
        friction === undefined || (box.preSolve = (o, f, of, contact)=> contact.friction = friction);
        steps(30);
        box.setLinearVelocity(vec2(5, 0));
        steps(60);
        const speed = box.getLinearVelocity().x;
        box.destroy(); ground.destroy();
        return speed;
    }
    assert.ok(slide() < 1, 'friction stops it');
    assert.ok(slide(0) > 4.9, 'with none it slides on');
    setGravity(vec2());
});
