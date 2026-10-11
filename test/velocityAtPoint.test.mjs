import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EngineObject, Box2dPlugin, Box2dObject, box2d, vec2, timeDelta } from '../dist/littlejs.esm.js';

// getVelocityAtPoint: an object's velocity and its spin together, at a point on it

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

const near = (a, b, message, tolerance=1e-4)=>
    assert.ok(Math.abs(a - b) < tolerance, (message || '') + ' ' + a + ' is not ' + b);

test('an object that does not spin moves every point at its velocity', () =>
{
    const o = new EngineObject(vec2(3, 4), vec2(1));
    o.velocity = vec2(.2, -.1);
    const v = o.getVelocityAtPoint(vec2(10, -7));
    near(v.x, .2), near(v.y, -.1);
    o.destroy();
});

test('a clockwise spin moves the point above it right and the point right of it down', () =>
{
    const o = new EngineObject(vec2(3, 4), vec2(1));
    o.angleVelocity = .5;
    const above = o.getVelocityAtPoint(vec2(3, 6)), right = o.getVelocityAtPoint(vec2(5, 4));
    near(above.x, 1, 'above x'), near(above.y, 0, 'above y');
    near(right.x, 0, 'right x'), near(right.y, -1, 'right y');
    o.destroy();
});

test('a point on a moving spinning object goes where its velocity says in a frame', () =>
{
    const o = new EngineObject(vec2(3, 4), vec2(1));
    o.velocity = vec2(.05, .02);
    o.angleVelocity = .001; // small, so a frame's arc is nearly straight
    const local = vec2(1.5, -2), before = o.localToWorld(local);
    const v = o.getVelocityAtPoint(before);
    o.updatePhysics();
    const moved = o.localToWorld(local).subtract(before);
    near(moved.x, v.x, 'x', 1e-5), near(moved.y, v.y, 'y', 1e-5);
    o.destroy();
});

test('a Box2D body gives the velocity of a point on it from its spin about its center of mass', () =>
{
    const o = new Box2dObject(vec2(1000, 0), vec2(1));
    o.addBox(vec2(2, .4), vec2(.5, 0)); // off its origin, so its center of mass is not pos
    o.setLinearVelocity(vec2(1, 2));
    o.setAngularVelocity(1.5); // clockwise, like angle
    const point = vec2(1001.5, 1);
    const v = o.getVelocityAtPoint(point);

    // clockwise like getAngularVelocity, about the center of mass
    const c = o.getCenterOfMass(), w = o.getAngularVelocity(), velocity = o.getLinearVelocity();
    assert.ok(Math.abs(c.x - 1000) > .1, 'the center of mass is off pos, ' + c.x);
    near(v.x, velocity.x + w*(point.y - c.y), 'x');
    near(v.y, velocity.y - w*(point.x - c.x), 'y');

    // and the point fixed to the body moves that far in a step, in Box2D's units per second
    const local = o.body.GetLocalPoint(new instance.b2Vec2(point.x, point.y));
    const localX = local.get_x(), localY = local.get_y();
    box2d.step();
    const after = o.body.GetWorldPoint(new instance.b2Vec2(localX, localY));
    near((after.get_x() - point.x) / timeDelta, v.x, 'moved x', .05);
    near((after.get_y() - point.y) / timeDelta, v.y, 'moved y', .05);
    o.destroy(); box2d.step();
});
