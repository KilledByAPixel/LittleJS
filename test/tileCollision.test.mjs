import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileCollisionLayer, tile, vec2 } from '../dist/littlejs.esm.js';

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
