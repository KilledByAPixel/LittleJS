import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A Tiled tileset's margin and spacing place the tiles of a sheet with gaps between them, and an LDtk level becomes
// a Tiled map, so tileLayersLoad, objectLayersLoad and the level editor take it as they take any map.

const { vec2, TileInfo, TextureInfo, tileLayersLoad, tileLayersFromLDtk, objectLayersLoad, objectLayersAddType,
    EngineObject } = LJS;
const sheet = (width, height, padding=0)=>
    new TileInfo(vec2(padding), vec2(16), new TextureInfo({width, height}, false), padding, 0);
const tileAt = (layer, x, y)=> layer.getData(vec2(x, y)).tile;
const sheetPos = (layer, index)=> { const t = layer.tileInfo.frame(index); return [t.pos.x, t.pos.y]; };

test('a tileset with a spacing and no margin, a sheet with a gap between its tiles, is read where its tiles are', ()=>
{
    // 10 columns of 16 pixel tiles 1 pixel apart: 169 pixels wide, the way Kenney's sheets are
    const map = {width: 2, height: 1, tilewidth: 16, tileheight: 16,
        tilesets: [{firstgid: 1, image: 'tiles.png', tilewidth: 16, tileheight: 16, margin: 0, spacing: 1, columns: 10}],
        layers: [{type: 'tilelayer', data: [1, 13]}]};
    const [layer] = tileLayersLoad(map, sheet(169, 33), 0, undefined, false);
    assert.deepEqual([tileAt(layer, 0, 0), tileAt(layer, 1, 0)], [0, 12]);
    assert.deepEqual(sheetPos(layer, 0), [0, 0]);
    assert.deepEqual(sheetPos(layer, 9), [153, 0], 'the last tile of the row, which a count from the width would lose');
    assert.deepEqual(sheetPos(layer, 12), [34, 17], 'the third tile of the second row');
});

test('a margin and a spacing are both read, and a map that has neither leaves the game\'s sheet as it is', ()=>
{
    const map = (tileset)=> ({width: 1, height: 1, tilewidth: 16, tileheight: 16, tilesets: tileset ? [tileset] : undefined,
        layers: [{type: 'tilelayer', data: [1]}]});
    const [extruded] = tileLayersLoad(map({firstgid: 1, margin: 3, spacing: 2, columns: 4}), sheet(80, 80), 0, undefined, false);
    assert.deepEqual(sheetPos(extruded, 5), [3 + 18, 3 + 18]);

    // a padded sheet the game set up itself, with a map that says nothing, or says 0, or names a file
    for (const tileset of [undefined, {firstgid: 1, margin: 0, spacing: 0, columns: 3}, {firstgid: 1, source: 'tiles.tsx'}])
    {
        const [layer] = tileLayersLoad(map(tileset), sheet(72, 72, 1), 0, undefined, false);
        assert.deepEqual([layer.tileInfo.padding, layer.tileInfo.columns, layer.tileInfo.pos.x], [1, 0, 1]);
    }
});

// a small LDtk file: a level 4 cells wide and 3 tall, with a tile layer, a layer of values and two entities
const ldtk = ()=> ({
    defs: {tilesets: [{uid: 7, relPath: 'art/tiles.png', pxWid: 169, pxHei: 33, tileGridSize: 16, spacing: 1, padding: 0,
        __cWid: 10, __cHei: 2}]},
    levels: [
    {
        identifier: 'Level_0', pxWid: 64, pxHei: 48,
        layerInstances: [
        {
            __identifier: 'Things', __type: 'Entities', __cWid: 4, __cHei: 3, __gridSize: 16,
            entityInstances: [
                {__identifier: 'Coin', px: [24, 8], __pivot: [.5, .5], width: 16, height: 16, fieldInstances: [
                    {__identifier: 'value', __type: 'Int', __value: 5},
                    {__identifier: 'tint', __type: 'Color', __value: '#ff0000'},
                    {__identifier: 'path', __type: 'Array<Point>', __value: []}]},
                {__identifier: 'Door', px: [32, 48], __pivot: [0, 1], width: 16, height: 32, fieldInstances: []}],
        },
        {
            __identifier: 'Walls', __type: 'IntGrid', __cWid: 4, __cHei: 3, __gridSize: 16, visible: true, __opacity: 1,
            intGridCsv: [1,1,1,1, 1,0,0,1, 2,2,2,2], autoLayerTiles: [], gridTiles: [],
        },
        {
            __identifier: 'Ground', __type: 'Tiles', __cWid: 4, __cHei: 3, __gridSize: 16, __tilesetDefUid: 7,
            visible: true, __opacity: .5, autoLayerTiles: [],
            gridTiles: [{px: [0, 0], src: [0, 0], f: 0, t: 0}, {px: [48, 32], src: [34, 17], f: 1, t: 12},
                {px: [16, 32], src: [17, 0], f: 3, t: 1}],
        }],
    },
    {identifier: 'Level_1', pxWid: 16, pxHei: 16, layerInstances: [
        {__identifier: 'Ground', __type: 'Tiles', __cWid: 1, __cHei: 1, __gridSize: 16, __tilesetDefUid: 7,
            visible: true, __opacity: 1, autoLayerTiles: [], gridTiles: [{px: [0, 0], src: [0, 0], f: 0, t: 3}]}]}],
});

test('an LDtk level becomes a Tiled map: its layers bottom first, its tiles, flips and tileset', ()=>
{
    const map = tileLayersFromLDtk(ldtk());
    assert.deepEqual([map.width, map.height, map.tilewidth, map.tileheight], [4, 3, 16, 16]);
    assert.deepEqual(map.layers.map((l)=> [l.name, l.type]),
        [['Ground', 'tilelayer'], ['Walls', 'tilelayer'], ['Things', 'objectgroup']]);
    const ground = map.layers[0];
    assert.equal(ground.opacity, .5);
    // a gid is the tile and 1, a flip across is Tiled's top bit and a flip down the one below it
    assert.deepEqual(ground.data, [1,0,0,0, 0,0,0,0, 0,(2 | 0xc0000000) >>> 0,0,(13 | 0x80000000) >>> 0]);
    assert.deepEqual(map.tilesets, [{firstgid: 1, name: 'tiles', image: 'art/tiles.png', imagewidth: 169, imageheight: 33,
        tilewidth: 16, tileheight: 16, margin: 0, spacing: 1, columns: 10, tilecount: 20}]);
    assert.equal(tileLayersFromLDtk(ldtk(), 1).layers[0].data[0], 4, 'a level by its index');
    assert.equal(tileLayersFromLDtk(ldtk(), 'Level_1').width, 1, 'or by its name');
});

test('a layer of values with no tiles is a hidden layer of them, for collision', ()=>
{
    const walls = tileLayersFromLDtk(ldtk()).layers[1];
    assert.deepEqual([walls.visible, walls.data], [false, [1,1,1,1, 1,0,0,1, 2,2,2,2]]);
});

test('the map loads as any Tiled map does: tiles where they are, the sheet\'s gaps, and collision from the values', ()=>
{
    const map = tileLayersFromLDtk(ldtk());
    const layers = tileLayersLoad(map, sheet(169, 33), 0, 1, false);
    const [ground, walls] = layers;
    assert.deepEqual([tileAt(ground, 0, 2), tileAt(ground, 3, 0), tileAt(ground, 1, 0)], [0, 12, 1], 'y goes up in the game');
    assert.equal(ground.getData(vec2(3, 0)).mirror, true);
    assert.deepEqual(sheetPos(ground, 12), [34, 17], 'where LDtk says that tile is in the sheet');
    assert.deepEqual([walls.getCollisionData(vec2(1, 1)), walls.getCollisionData(vec2(0, 1)), walls.getCollisionData(vec2(2, 0))],
        [0, 1, 1]);
    for (const layer of layers) layer?.destroy();
});

test('entities are the objects of an object layer, each at its middle, with its fields as properties', ()=>
{
    class Coin extends EngineObject {}
    class Door extends EngineObject {}
    objectLayersAddType('Coin', Coin, {value: 1, tint: LJS.WHITE});
    objectLayersAddType('Door', Door);
    const map = tileLayersFromLDtk(ldtk()), things = map.layers[2].objects;
    assert.deepEqual(things.map((o)=> [o.id, o.type, o.x, o.y, o.width, o.height]),
        [[1, 'Coin', 24, 8, 16, 16], [2, 'Door', 40, 32, 16, 32]]);
    assert.deepEqual(things[0].properties, [{name: 'value', type: 'int', value: 5},
        {name: 'tint', type: 'color', value: '#ff0000'}], 'a field of a type Tiled has no property for is left out');
    assert.equal(map.nextobjectid, 3);
    const [coin, door] = objectLayersLoad(map);
    assert.deepEqual([coin.pos.x, coin.pos.y, coin.value, coin.tint.toString(false)], [1.5, 2.5, 5, '#ff0000']);
    assert.deepEqual([door.pos.x, door.pos.y], [2.5, 1], 'a door two cells tall standing on the floor');
    coin.destroy(); door.destroy();
});
