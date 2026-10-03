import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A tile set, what loadTiles makes: a TileInfo whose tiles list holds each tile wherever it was packed, so a tile
// layer and the level editor draw tile n from tiles[n] and not from a grid on one sheet.

function load()
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true);
        var sheet = new TextureInfo({width: 64, height: 64}, false), other = new TextureInfo({width: 32, height: 32}, false);
        // three tiles from two sheets, at places no grid would give them
        var set = new TileInfo(vec2(), vec2(16), sheet, 0, 0);
        set.tiles = [new TileInfo(vec2(40, 8), vec2(16), sheet, 0, 0), new TileInfo(vec2(2, 30), vec2(16), sheet, 0, 0),
            new TileInfo(vec2(16, 0), vec2(16), other, 0, 0)];`);
    return run;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

test('a tile layer of a tile set draws each tile from the set, and a tile past its end draws nothing', ()=>
{
    const run = load();
    run(`var layer = new TileLayer(vec2(), vec2(4, 1), set), drawn = [];
        layer.drawLayerTile = (pos, size, tileInfo)=> drawn.push(tileInfo && [tileInfo.pos.x, tileInfo.pos.y, tileInfo.textureInfo === other]);
        [0, 1, 2, 5].forEach((t, x)=> layer.setData(vec2(x, 0), new TileLayerData(t)));
        // headless a layer has no canvas and draws nothing: the class's own draw, into a canvas that takes nothing
        layer.context = {}; drawContext = layer.context; layer.clearLayerRect = ()=> {};
        for (let x = 0; x < 4; ++x) TileLayer.prototype.drawTileData.call(layer, vec2(x, 0));`);
    assert.deepEqual(json(run, 'drawn'), [[40, 8, false], [2, 30, false], [16, 0, true]]);
    assert.equal(run('layer.tileInfo.tiles === set.tiles'), true, 'the layer keeps the set, filled in as it loads');
});

test('tileLayersLoad takes a tile set as its tile info', ()=>
{
    const run = load();
    run(`var layers = tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', data: [3, 1]}]}, set, 0, undefined, false);`);
    assert.equal(run('layers[0].tileInfo.tiles === set.tiles'), true);
});

test('the level editor\'s palette of a tile set lists each of its tiles', ()=>
{
    const run = load();
    run(`var layer = new TileLayer(vec2(), vec2(2), set);`);
    assert.deepEqual(json(run, 'editorPaletteTiles({live: layer}).map((t)=> [t.tile, t.tileInfo.pos.x])'), [[0, 40], [1, 2], [2, 16]]);
    assert.equal(run('editorTileInfo(layer, 2) === set.tiles[2]'), true);
});

test('loadTiles hands back a tile set at once, its tiles filled in as the images load', ()=>
{
    const run = load();
    assert.deepEqual(json(run, '(()=> { const s = loadTiles(["a.png", "b.png"], 8); return [s.size.x, s.tiles.length]; })()'),
        [8, 0], 'headless loads no image, so the set stays empty');
});
