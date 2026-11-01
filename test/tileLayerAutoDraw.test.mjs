import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileLayer, TileLayerData, tile, vec2, tileLayersLoad } from '../dist/littlejs.esm.js';

// a tile layer draws itself: whole on its first render when nothing has drawn into it, and the cells set with no
// redraw argument on the next render; headless stubs the drawing on the instance, so the layer gets its own
// render, redraw and setData back and counts the drawing underneath
function makeLayer(size = vec2(2))
{
    const layer = new TileLayer(vec2(), size, tile(0, 8));
    const counts = { full: 0, starts: 0, ends: 0, now: 0, cells: [] };
    layer.context = {}; // a canvas of its own, not the draw context, which render checks
    layer.draw = ()=> {};
    layer.render = TileLayer.prototype.render;
    layer.setData = TileLayer.prototype.setData;
    layer.clearData = TileLayer.prototype.clearData;
    layer.redraw = ()=> { ++counts.full; TileLayer.prototype.redraw.call(layer); };
    layer.redrawStart = ()=> { ++counts.starts; layer.drawn = true; };
    layer.redrawEnd = ()=> ++counts.ends;
    layer.drawTileData = (p)=> counts.cells.push(p.x + ',' + p.y);
    layer.redrawTileData = ()=> ++counts.now;
    return { layer, counts };
}

test('a layer never drawn draws whole on its first render, once', () =>
{
    const { layer, counts } = makeLayer();
    for (let x = 2; x--;) for (let y = 2; y--;)
        layer.setData(vec2(x, y), new TileLayerData(1));
    layer.render();
    layer.render();
    assert.equal(counts.full, 1);
    assert.equal(counts.cells.length, 4, 'the full redraw drew each cell once');
});

test('a layer redrawn by the game is not drawn again on its first render', () =>
{
    const { layer, counts } = makeLayer();
    layer.setData(vec2(0, 0), new TileLayerData(1));
    layer.redraw();
    layer.render();
    assert.equal(counts.full, 1);
    assert.equal(counts.cells.length, 4);
});

test('drawing by hand counts as drawn', () =>
{
    const { layer, counts } = makeLayer();
    layer.hasWebGL = ()=> false; // no GL target and a canvas stand in, so the real start and end run headless
    layer.canvas = {};
    layer.redrawStart = TileLayer.prototype.redrawStart;
    layer.redrawEnd = TileLayer.prototype.redrawEnd;
    layer.redrawStart(true);
    layer.redrawEnd();
    layer.render();
    assert.equal(counts.full, 0, 'what was drawn by hand is kept');
});

test('a cell left out is drawn on the next render, only that cell', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    counts.cells.length = counts.starts = counts.ends = 0;
    layer.setData(vec2(1, 0), new TileLayerData(1));
    assert.deepEqual([...layer.dirtyCells], [1]);
    layer.render();
    assert.deepEqual(counts.cells, ['1,0']);
    assert.equal(counts.starts, 1);
    assert.equal(counts.ends, 1);
    assert.equal(layer.dirtyCells.size, 0);
    layer.render();
    assert.deepEqual(counts.cells, ['1,0'], 'nothing more on the next render');
});

test('a cell set twice draws once', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    counts.cells.length = 0;
    layer.setData(vec2(0, 1), new TileLayerData(1));
    layer.setData(vec2(0, 1), new TileLayerData(2));
    layer.render();
    assert.deepEqual(counts.cells, ['0,1']);
});

test('true draws now and leaves nothing pending', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    layer.setData(vec2(0, 0), new TileLayerData(1));
    layer.setData(vec2(0, 0), new TileLayerData(1), true);
    assert.equal(counts.now, 1);
    assert.equal(layer.dirtyCells.size, 0);
});

test('false never draws and takes back a pending mark', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    counts.cells.length = 0;
    layer.setData(vec2(1, 1), new TileLayerData(1));
    layer.setData(vec2(1, 1), new TileLayerData(1), false);
    assert.equal(layer.dirtyCells.size, 0);
    layer.render();
    assert.equal(counts.cells.length, 0);
    assert.equal(counts.now, 0);
});

test('clearData passes redraw through', () =>
{
    const { layer } = makeLayer();
    layer.redraw();
    layer.clearData(vec2(1, 0));
    assert.deepEqual([...layer.dirtyCells], [1]);
    layer.clearData(vec2(1, 0), false);
    assert.equal(layer.dirtyCells.size, 0);
});

test('a full redraw drops the pending cells', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    layer.setData(vec2(0, 0), new TileLayerData(1));
    layer.setData(vec2(1, 1), new TileLayerData(1));
    layer.redraw();
    counts.cells.length = counts.starts = 0;
    layer.render();
    assert.equal(counts.cells.length, 0);
    assert.equal(counts.starts, 0);
});

test('a layer with no canvas records nothing', () =>
{
    const { layer } = makeLayer();
    layer.context = undefined;
    layer.setData(vec2(0, 0), new TileLayerData(1));
    assert.equal(layer.dirtyCells.size, 0);
});

// the real start and end around a paint, which run headless with no WebGL and a canvas stand in
function paintByHand(layer, counts)
{
    layer.hasWebGL = ()=> false;
    layer.canvas = {};
    layer.redrawStart = TileLayer.prototype.redrawStart;
    layer.redrawEnd = TileLayer.prototype.redrawEnd;
    layer.redrawStart();
    counts.cells.push('paint');
    layer.redrawEnd();
}

test('paint on a layer never drawn goes over its tiles, which draw first', () =>
{
    const { layer, counts } = makeLayer();
    layer.setData(vec2(0, 0), new TileLayerData(1));
    paintByHand(layer, counts);
    layer.render();
    assert.equal(counts.full, 1);
    assert.equal(counts.cells.at(-1), 'paint', 'nothing draws over the paint');
});

test('paint goes over a cell set before it, which draws first', () =>
{
    const { layer, counts } = makeLayer();
    layer.redraw();
    counts.cells.length = 0;
    layer.setData(vec2(1, 0), new TileLayerData(1));
    paintByHand(layer, counts);
    layer.render();
    assert.deepEqual(counts.cells, ['1,0', 'paint']);
});

test("a game's own redraw that calls redrawStart draws once on the first render, not again from inside it", () =>
{
    const { layer, counts } = makeLayer();
    paintByHand(layer, counts); // the real start and end
    layer.drawn = false;
    counts.cells.length = counts.full = 0;
    layer.redraw = ()=> { ++counts.full; layer.redrawStart(); counts.cells.push('own'); layer.redrawEnd(); };
    layer.render();
    assert.equal(counts.full, 1);
    assert.deepEqual(counts.cells, ['own']);
});

test('a cell onRedraw sets waits for the next render', () =>
{
    const { layer } = makeLayer();
    layer.onRedraw = ()=> layer.setData(vec2(1, 1), new TileLayerData(2));
    layer.redraw();
    assert.equal(layer.dirtyCells.size, 1);
});

test('a canvas copied up with updateWebGL counts as drawn', () =>
{
    const { layer, counts } = makeLayer();
    layer.updateWebGL();
    layer.render();
    assert.equal(counts.full, 0, 'the picture on the canvas is kept');
});

test('tileLayersLoad leaves no cell pending, the layer draws whole or is hidden', () =>
{
    const calls = [], setData = TileLayer.prototype.setData;
    TileLayer.prototype.setData = function(pos, data, redraw) { calls.push(redraw); return setData.call(this, pos, data, redraw); };
    try
    {
        const map = { width: 2, height: 1, tilewidth: 8, tileheight: 8,
            layers: [{ type: 'tilelayer', name: 'a', width: 2, height: 1, data: [1, 2] },
                     { type: 'tilelayer', name: 'b', width: 2, height: 1, data: [1, 0], visible: false }] };
        for (const layer of tileLayersLoad(map, tile(0, 8))) layer.destroy();
    }
    finally { TileLayer.prototype.setData = setData; }
    assert.equal(calls.length, 3);
    assert.ok(calls.every((r)=> r === false), 'each cell set with false: ' + calls);
});
