import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileCollisionLayer, tileCollisionGetData, tile, vec2 } from '../dist/littlejs.esm.js';

// Regression for the negative-edge ghost-collision bug:
// collisionTest() clamped minX/minY to 0 and then forced maxX/maxY to at least
// minX+1, which caused an AABB that was entirely off the negative edge of the
// layer to incorrectly check column/row 0. The positive edge was already safe
// because maxX was capped at this.size.x and an out-of-range minX produced an
// empty loop.

function makeLayer()
{
    // 4x4 layer rooted at world origin, with a solid tile only at (0, 0).
    const layer = new TileCollisionLayer(vec2(0, 0), vec2(4, 4), tile(0, 16), 0, false);
    layer.setCollisionData(vec2(0, 0), 1);
    return layer;
}

test('collisionTest: AABB entirely off the negative X edge does not collide', () =>
{
    const layer = makeLayer();
    // 1x1 AABB centered at x=-10: spans x in [-10.5, -9.5], nowhere near the layer.
    assert.equal(layer.collisionTest(vec2(-10, 0.5), vec2(1, 1)), false);
});

test('collisionTest: AABB entirely off the negative Y edge does not collide', () =>
{
    const layer = makeLayer();
    assert.equal(layer.collisionTest(vec2(0.5, -10), vec2(1, 1)), false);
});

test('collisionTest: AABB straddling the negative X edge still collides with col 0', () =>
{
    const layer = makeLayer();
    // 2-wide AABB centered at x=0 spans x in [-1, 1] — half is inside the layer
    // and overlaps cell (0,0), which holds the solid tile.
    assert.equal(layer.collisionTest(vec2(0, 0.5), vec2(2, 1)), true);
});

test('collisionTest: point test on cell (0,0) collides', () =>
{
    const layer = makeLayer();
    // point-test mode (size=0); pos inside the solid tile
    assert.equal(layer.collisionTest(vec2(0.5, 0.5), vec2(0, 0)), true);
});

test('collisionTest: AABB entirely off the positive X edge does not collide', () =>
{
    const layer = makeLayer();
    // confirm the previously-working side stays working
    assert.equal(layer.collisionTest(vec2(100, 0.5), vec2(1, 1)), false);
});

test('collisionTest: AABB entirely off the positive Y edge does not collide', () =>
{
    const layer = makeLayer();
    assert.equal(layer.collisionTest(vec2(0.5, 100), vec2(1, 1)), false);
});

// Regression for the layer-offset bug: tileCollisionGetData() passed the world
// position directly to layer.getCollisionData(), which expects layer-local
// coordinates. A layer placed away from the origin would report collision as
// if it were still at (0,0) even though rendering honored the offset.

test('tileCollisionGetData: honors layer position offset', () =>
{
    const layer = new TileCollisionLayer(vec2(2, 2), vec2(4, 4), tile(0, 16), 0, false);
    layer.setCollisionData(vec2(1, 1), 1);
    // tile at local (1,1) occupies world cell (3,3)
    assert.equal(tileCollisionGetData(vec2(3.5, 3.5)), 1);
    layer.destroy();
});

test('tileCollisionGetData: no collision at the unoffset position', () =>
{
    const layer = new TileCollisionLayer(vec2(2, 2), vec2(4, 4), tile(0, 16), 0, false);
    layer.setCollisionData(vec2(1, 1), 1);
    // world (1.5, 1.5) is local (-0.5, -0.5), outside the layer
    assert.equal(tileCollisionGetData(vec2(1.5, 1.5)), 0);
    layer.destroy();
});

test('collisionRaycast on a layer at a fractional position hits the tile edge where the tile really is', () =>
{
    // the layer sits half a unit over, so its first tile spans x from .5 to 1.5
    const layer = new TileCollisionLayer(vec2(.5, 0), vec2(4, 4), tile(0, 16), 0, false);
    layer.setCollisionData(vec2(0, 0), 1);
    const normal = vec2();
    const hit = layer.collisionRaycast(vec2(0, .5), vec2(2, .5), undefined, normal);
    assert.ok(hit, 'hit');
    assert.ok(Math.abs(hit.x - .5) < 1e-6, 'hit at the edge of the tile, x ' + hit.x);
    assert.equal(normal.x, -1);
    assert.ok(layer.collisionRaycast(vec2(0, .5), vec2(.75, .5)), 'a short ray that reaches the tile hits it');
    assert.equal(layer.collisionRaycast(vec2(0, .5), vec2(.4, .5)), undefined, 'one that stops short misses');
    // and from the other side, the far edge at 1.5
    const back = layer.collisionRaycast(vec2(3, .5), vec2(0, .5), undefined, normal);
    assert.ok(Math.abs(back.x - 1.5) < 1e-6, 'far edge, x ' + back.x);
    assert.equal(normal.x, 1);
});

test('tileLayersLoad reads the flip flags Tiled stores in the top bits of a tile', async () =>
{
    const { tileLayersLoad } = await import('../dist/littlejs.esm.js');
    const H = 0x80000000, V = 0x40000000, D = 0x20000000;
    // tile 7 (gid 8) with each flip, and a plain one; a direction is a quarter turn, the mirror flips across
    const flips = [0, D, V, V|D, H, H|D, H|V, H|V|D];
    const expected = [[0, false], [3, true], [2, true], [3, false], [0, true], [1, false], [2, false], [1, true]];
    const layer = tileLayersLoad({ width: 8, height: 1, layers: [{ data: flips.map(f=> (8 | f) >>> 0) }] }, undefined, 0, 0, false)[0];
    flips.forEach((f, i)=>
    {
        const d = layer.getData(vec2(i, 0));
        assert.equal(d.tile, 7, 'the tile without its flags');
        assert.deepEqual([d.direction, d.mirror], expected[i], 'flags ' + i);
    });
    assert.equal(layer.getCollisionData(vec2(3, 0)), 1, 'a flipped tile still collides');
    layer.destroy();
});
