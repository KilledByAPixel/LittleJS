import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, TileCollisionLayer, engineObjectsUpdate, setGravity, tile, vec2 } from '../dist/littlejs.esm.js';

// An object stopped by a tile collision layer ends against the tile, at walls and ceilings as on floors: going back to
// last frame's place left it short by up to a frame's move, a gap that never closed for a game setting its velocity
// every frame. The spot is rounded in the layer's space, as its collision test is, so a layer moved off the origin is
// met at its own edges; a layer sits at whole numbers, which tileCollisionAssertWhole asks.

// a layer of 10 by 10 at layerPos with the given solid cells, a 1 by 1 object with only level collision, gravity
// set; all taken down after so the tests do not see each other's layers or gravity
function tileScene(cells, gravityY, f, layerPos=vec2())
{
    const layer = new TileCollisionLayer(layerPos, vec2(10), tile(), 0, false);
    for (const [x, y] of cells)
        layer.setCollisionData(vec2(x, y), 1);
    const o = new EngineObject(vec2(), vec2(1));
    o.collideLevel = true;
    o.damping = 1;
    setGravity(vec2(0, gravityY));
    try { f(o, layer); }
    finally
    {
        setGravity(vec2());
        layer.destroy();
        o.destroy();
        engineObjectsUpdate();
    }
}
const column = (x)=> [...Array(10)].map((_, y)=> [x, y]);
const row = (y)=> [...Array(10)].map((_, x)=> [x, y]);
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-3, `${message}: ${a} is not ${b}`);

// set the velocity every frame, as a game moving at a constant speed does
function push(o, velocity, frames=12)
{
    for (let i = frames; i--;)
    {
        o.velocity = velocity.copy();
        o.updatePhysics();
    }
}

test('a constant move into a wall ends against it, from either side', () =>
{
    tileScene(column(5), 0, (o)=>
    {
        o.pos = vec2(1.5, 2.5);
        push(o, vec2(.8, 0));
        near(o.pos.x, 4.5, 'its right side at the wall\'s left');
        assert.ok(o.pos.x < 4.5, 'and not inside it');
        assert.equal(o.pos.y, 2.5);
    });
    tileScene(column(5), 0, (o)=>
    {
        o.pos = vec2(8.5, 2.5);
        push(o, vec2(-.8, 0));
        near(o.pos.x, 6.5, 'its left side at the wall\'s right');
        assert.ok(o.pos.x > 6.5, 'and not inside it');
    });
});

test('a jump into a ceiling ends against it and is not on the ground', () =>
{
    tileScene(row(5), -.01, (o)=>
    {
        o.pos = vec2(2.5, 2.5);
        o.velocity = vec2(0, .4);
        let top = 0;
        for (let i = 30; i--;)
        {
            o.updatePhysics();
            top = Math.max(top, o.pos.y);
            assert.equal(o.groundObject, undefined);
        }
        near(top, 4.5, 'its top reached the ceiling\'s bottom');
        assert.ok(top < 4.5, 'and not inside it');
    });
});

test('with gravity turned up a fall ends on the ceiling and a jump down ends against the floor', () =>
{
    tileScene([...row(1), ...row(7)], -.01, (o, layer)=>
    {
        o.gravityScale = -1;
        o.pos = vec2(4.5, 4.5);
        for (let i = 60; i--;)
            o.updatePhysics();
        near(o.pos.y, 6.5, 'standing on the ceiling');
        assert.equal(o.groundObject, layer);

        push(o, vec2(0, -.8));
        near(o.pos.y, 2.5, 'its bottom at the floor\'s top');
        assert.ok(o.pos.y > 2.5, 'and not inside it');
    });
});

test('a layer moved off the origin is met at its own tile edges', () =>
{
    const layerPos = vec2(-3, 2);
    tileScene(column(5), 0, (o)=>
    {
        o.pos = vec2(-1.5, 4.5);
        push(o, vec2(.8, 0));
        near(o.pos.x, 1.5, 'the wall starts at 2');
        assert.ok(o.pos.x < 1.5);
    }, layerPos);
    tileScene(row(5), 0, (o)=>
    {
        o.pos = vec2(-.5, 3.5);
        push(o, vec2(0, .8));
        near(o.pos.y, 6.5, 'the ceiling starts at 7');
        assert.ok(o.pos.y < 6.5);
    }, layerPos);
});

test('a bounce off a wall starts from the wall', () =>
{
    tileScene(column(5), 0, (o)=>
    {
        o.pos = vec2(3.9, 2.5);
        o.velocity = vec2(.8, 0);
        o.restitution = 1;
        o.updatePhysics();
        near(o.pos.x, 4.5, 'against the wall');
        assert.equal(o.velocity.x, -.8);
    });
});

test('walking at a constant speed into a tile whose top is just above its bottom still climbs it', () =>
{
    tileScene([[5, 1], [6, 1], [7, 1]], -.01, (o)=>
    {
        // its bottom at 1.95 and the tile's top at 2, less than the .1 the climb takes, which the wall snap must not
        // catch first
        o.pos = vec2(4.4, 2.45);
        push(o, vec2(.2, 0), 10);
        near(o.pos.x, 6.4, 'it went on');
        assert.ok(o.pos.y >= 2.5, 'on top of the tiles: ' + o.pos.y);
    });
});
