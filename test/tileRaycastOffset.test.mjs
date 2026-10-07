import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileCollisionLayer, vec2, tile, tileCollisionRaycast } from '../dist/littlejs.esm.js';

// A raycast walks a layer in its own space and keeps its hit inside the tile it met there, then adds the layer's
// place; that sum could round onto the tile's edge, so the hit was in the next tile over, an empty one

test('a raycast hit on a layer away from the origin is inside the tile it met, not on its edge', () =>
{
    const layer = new TileCollisionLayer(vec2(-7, 6), vec2(6, 2), tile(), 0, false);
    layer.setCollisionData(vec2(2, 0), 1); // the tile at world (-5, 6)
    const hit = tileCollisionRaycast(vec2(6.3868243182078, 1.1632705819793046),
        vec2(-9.669523957185447, 8.645321045070887));
    layer.destroy();
    assert.ok(hit, 'a hit');
    assert.deepEqual([Math.floor(hit.x), Math.floor(hit.y)], [-5, 6], 'in the tile, ' + hit);
});
