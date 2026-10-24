import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// CanvasLayer.scroll headless: no picture to move, the layer still moves; a TileLayer refuses, its grid would draw
// over the picture (the picture itself is checked on pixels in test/browser/canvasLayerScroll.html)

test('a canvas layer scrolls headless by the offset, returned', () =>
{
    const { run } = loadEngine();
    assert.deepEqual(JSON.parse(run(`headlessMode = true; const layer = new CanvasLayer(vec2(1, 2), vec2(4));
        const moved = layer.scroll(vec2(3, -1)); JSON.stringify([layer.pos, moved])`)), [{x: 4, y: 1}, {x: 3, y: -1}]);
});

test('a tile layer refuses to scroll', () =>
{
    const { run } = loadEngine();
    assert.throws(()=> run(`headlessMode = true; new TileLayer(vec2(), vec2(2)).scroll(vec2(1, 0))`), /TileLayer/);
});
