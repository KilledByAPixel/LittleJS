import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, Box2dWeldJoint, Box2dRevoluteJoint, Box2dJoint, box2d,
    PathFinder, vec2 } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, the same wasm a game loads
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

// each test works in its own stretch of the world, so what one leaves behind touches no other

///////////////////////////////////////////////////////////////////////////////
// Box2D

test('the weld joint names its damping like the distance joint, setDampingRatio and getDampingRatio', () =>
{
    const a = new Box2dStaticObject(vec2(100, 0)), b = new Box2dObject(vec2(100, 1));
    a.addBox(); b.addBox();
    const weld = new Box2dWeldJoint(a, b, vec2(100, .5));
    weld.setDampingRatio(.5);
    assert.ok(Math.abs(weld.getDampingRatio() - .5) < 1e-6);
    assert.equal(weld.setSpringDampingRatio, undefined, 'the old name is gone');
    weld.destroy(); a.destroy(); b.destroy();
});

test('getJointList gives the Box2dJoint wrappers, and a joint made on the world directly cast to its type', () =>
{
    const a = new Box2dStaticObject(vec2(200, 0)), b = new Box2dObject(vec2(200, 1));
    a.addBox(); b.addBox();
    const joint = new Box2dRevoluteJoint(a, b, vec2(200, .5));

    // a joint made on the world, with no wrapper
    const def = new instance.b2WeldJointDef();
    def.Initialize(a.body, b.body, new instance.b2Vec2(200, 1));
    const raw = box2d.world.CreateJoint(def);
    instance.destroy(def);

    const joints = b.getJointList();
    assert.equal(joints.length, 2);
    const wrapped = joints.find(j=> j instanceof Box2dJoint);
    assert.equal(wrapped, joint, 'the wrapper itself');
    const other = joints.find(j=> !(j instanceof Box2dJoint));
    assert.equal(instance.getPointer(other), instance.getPointer(raw));
    assert.equal(typeof other.GetFrequency, 'function', 'cast to a weld joint, not the base b2Joint');

    box2d.world.DestroyJoint(raw);
    joint.destroy(); a.destroy(); b.destroy();
});

test('raycastAll gives its hits nearest first, and raycast the nearest', () =>
{
    // made in a shuffled order along the ray, so Box2D's tree does not hand them back in order
    const xs = [7, 2, 11, 5, 14, 0, 9, 3, 12, 6, 1, 13, 8, 4, 10];
    const objects = xs.map(x=> { const o = new Box2dStaticObject(vec2(300 + x*2, 0)); o.addBox(vec2(.5)); return o; });
    const hits = box2d.raycastAll(vec2(299, 0), vec2(330, 0));
    assert.equal(hits.length, xs.length);
    for (let i = 1; i < hits.length; ++i)
        assert.ok(hits[i - 1].fraction <= hits[i].fraction, 'hit ' + i + ' is nearer than the one before it');
    assert.ok(hits[0].object === objects[xs.indexOf(0)], 'the nearest object first');
    assert.equal(box2d.raycast(vec2(299, 0), vec2(330, 0)).object, hits[0].object);

    // and back the other way
    const back = box2d.raycastAll(vec2(330, 0), vec2(299, 0));
    assert.ok(back[0].object === objects[xs.indexOf(14)], 'the far end first from the far side');
    objects.forEach(o=> o.destroy());
});

///////////////////////////////////////////////////////////////////////////////
// PathFinder

test('PathFinder string pulls a path that starts on a cell with a cost', () =>
{
    // the start is mud: the step off it stays, and from there the path runs straight to the end
    const pf = new PathFinder(vec2(20, 20));
    pf.getCost = (x, y)=> !x && !y ? 3 : 0;
    const path = pf.findPath(vec2(.5, .5), vec2(19.5, 7.5));
    assert.deepEqual(path.map(p=> [p.x, p.y]), [[.5, .5], [1.5, .5], [19.5, 7.5]]);
});

test('PathFinder string pulls a path that has to cross a cell with a cost', () =>
{
    // a wall down the middle with one gap, and the gap is mud, so every path goes through a cell with a cost
    const pf = new PathFinder(vec2(12, 12));
    pf.isWalkable = (x, y)=> x !== 6 || y === 6;
    pf.getCost = (x, y)=> x === 6 && y === 6 ? 5 : 0;
    const path = pf.findPath(vec2(.5, .5), vec2(11.5, 10.5));

    // pulled straight to beside the gap and straight on from it, the steps into and out of the costed cell kept
    assert.ok(path.length && path.length <= 4, 'string pulled to ' + path.length + ' points: ' +
        path.map(p=> p.x + ',' + p.y).join(' '));

    // every segment stays in walkable cells, checked finely along it
    for (let i = 1; i < path.length; ++i)
    for (let t = 0; t <= 1; t += 1/256)
    {
        const p = path[i - 1].lerp(path[i], t);
        assert.ok(pf.isWalkable(Math.floor(p.x), Math.floor(p.y)), 'segment ' + i + ' crosses a wall at ' + p);
    }
});
