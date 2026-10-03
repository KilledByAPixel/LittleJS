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

test('tiles LDtk stacks in one cell, an edge over a fill, each go in a layer of their own above the first', ()=>
{
    const project = ldtk(), ground = project.levels[0].layerInstances[2];
    ground.autoLayerTiles = [{px: [0, 0], src: [0, 0], f: 0, t: 4}, {px: [16, 0], src: [0, 0], f: 0, t: 4}];
    ground.gridTiles = [{px: [0, 0], src: [0, 0], f: 0, t: 5}, {px: [0, 0], src: [0, 0], f: 2, t: 6}];
    const map = tileLayersFromLDtk(project);
    assert.deepEqual(map.layers.map((l)=> l.name), ['Ground', 'Ground (2)', 'Ground (3)', 'Walls', 'Things']);
    assert.deepEqual(map.layers.slice(0, 3).map((l)=> l.data.slice(0, 2)), [[5, 5], [6, 0], [(7 | 0x40000000) >>> 0, 0]],
        'the first tile of each cell at the bottom, in the order LDtk draws them');
    assert.equal(new Set(map.layers.map((l)=> l.id)).size, 5, 'each layer its own id');
});

test('the level editor\'s palette of a sheet with a spacing lists its tiles and stops at its last row', async ()=>
{
    const { loadEngine } = await import('./vmEngine.mjs');
    const { run } = loadEngine();
    run(`setHeadlessMode(true);
        var map = {width: 1, height: 1, tilewidth: 16, tileheight: 16,
            tilesets: [{firstgid: 1, margin: 0, spacing: 1, columns: 10}], layers: [{type: 'tilelayer', data: [1]}]};
        var sheet = new TileInfo(vec2(), vec2(16), new TextureInfo({width: 169, height: 33}, false), 0, 0);
        var layer = tileLayersLoad(map, sheet, 0, undefined, false)[0];`);
    // headless there is no reading the image back, so no empty tiles are trimmed from the end
    assert.equal(run('editorPaletteTiles({live: layer}).length'), 20);
});

test('a see-through LDtk tile keeps its opacity, times the layer\'s, in a layer of its own', ()=>
{
    const project = ldtk(), ground = project.levels[0].layerInstances[2];
    ground.gridTiles = [{px: [0, 0], src: [0, 0], f: 0, t: 0, a: 1}, {px: [16, 0], src: [0, 0], f: 0, t: 1, a: .25},
        {px: [16, 0], src: [0, 0], f: 0, t: 2, a: 1}, {px: [32, 0], src: [0, 0], f: 0, t: 3, a: .25}];
    const map = tileLayersFromLDtk(project);
    assert.deepEqual(map.layers.slice(0, 3).map((l)=> [l.name, l.opacity, l.data.slice(0, 4)]),
        [['Ground', .5, [1, 0, 0, 0]], ['Ground .25', .125, [0, 2, 4, 0]], ['Ground (2)', .5, [0, 3, 0, 0]]],
        'the second tile in a cell is still drawn over the first');
    const layers = tileLayersLoad(map, sheet(169, 33), 0, undefined, false);
    assert.deepEqual([layers[0].getData(vec2(0, 2)).color.a, layers[1].getData(vec2(1, 2)).color.a], [.5, .125]);
    for (const layer of layers) layer?.destroy();
});

test('an IntGrid layer with tiles keeps its values in a hidden layer of its own name, its tiles over it', ()=>
{
    const project = ldtk(), walls = project.levels[0].layerInstances[1];
    walls.intGridCsv = [1,1,1,1, 1,0,0,1, 2,2,2,2];
    walls.__tilesetDefUid = 7;
    walls.autoLayerTiles = [{px: [0, 0], src: [0, 0], f: 0, t: 3}, {px: [0, 0], src: [0, 0], f: 0, t: 4},
        {px: [16, 0], src: [0, 0], f: 0, t: 5, a: .5}];
    const map = tileLayersFromLDtk(project), names = map.layers.map((l)=> l.name);
    assert.deepEqual(names, ['Ground', 'Walls', 'Walls tiles', 'Walls tiles .5', 'Walls tiles (2)', 'Things']);
    const values = map.layers[1];
    assert.deepEqual([values.visible, values.data], [false, [1,1,1,1, 1,0,0,1, 2,2,2,2]], 'every painted cell');
    assert.deepEqual(map.layers[2].data.slice(0, 2), [4, 0]);
});

test('collisionLayer may be a layer\'s name, which stays the same when tiles stack or fade', ()=>
{
    const project = ldtk(), walls = project.levels[0].layerInstances[1], ground = project.levels[0].layerInstances[2];
    ground.gridTiles = [{px: [0, 0], src: [0, 0], f: 0, t: 0}, {px: [0, 0], src: [0, 0], f: 0, t: 1},
        {px: [16, 0], src: [0, 0], f: 0, t: 2, a: .25}];
    walls.autoLayerTiles = [{px: [16, 16], src: [0, 0], f: 0, t: 3, a: .25}];
    walls.__tilesetDefUid = 7;
    const map = tileLayersFromLDtk(project);
    const layers = tileLayersLoad(map, sheet(169, 33), 0, 'Walls', false);
    const solid = layers.filter((l)=> l?.isSolid);
    assert.equal(solid.length, 1);
    assert.deepEqual([solid[0].getCollisionData(vec2(0, 1)), solid[0].getCollisionData(vec2(1, 1)),
        solid[0].getCollisionData(vec2(0, 0))], [1, 0, 1], 'the painted values, whatever the tiles over them do');
    for (const layer of layers) layer?.destroy();
});

test('a project with no tileset entry keeps its tiles, one whose tiles are another size leaves them out', ()=>
{
    const bare = ldtk();
    bare.defs.tilesets = [];
    const map = tileLayersFromLDtk(bare);
    assert.deepEqual([map.tilesets, map.layers[0].name, map.layers[0].data[0]], [undefined, 'Ground', 1]);

    const odd = ldtk();
    odd.defs.tilesets[0].tileGridSize = 8;
    const warn = console.warn, said = [];
    console.warn = (...a)=> said.push(a.join(' '));
    try { assert.deepEqual(tileLayersFromLDtk(odd).layers.map((l)=> l.name), ['Walls', 'Things']); }
    finally { console.warn = warn; }
    assert.ok(said.some((s)=> s.includes('Ground')), said.join(' / '));
});

test('levels of a project with several worlds are found, and a level not found says so', ()=>
{
    const project = ldtk(), [first, second] = project.levels;
    project.levels = [];
    project.worlds = [{identifier: 'World', levels: [first]}, {identifier: 'Other', levels: [second]}];
    assert.equal(tileLayersFromLDtk(project, 'Level_1').width, 1);
    assert.equal(tileLayersFromLDtk(project, 1).width, 1);
    assert.throws(()=> tileLayersFromLDtk(project, 'Nowhere'), /Nowhere/);
    const external = ldtk();
    external.levels[0].layerInstances = null;
    assert.throws(()=> tileLayersFromLDtk(external), /separate/);
});

test('a margin or spacing is counted from where the game\'s sheet starts, as in a shared atlas', ()=>
{
    const atlas = new TileInfo(vec2(64, 32), vec2(16), new TextureInfo({width: 256, height: 128}, false), 0, 0);
    const map = {width: 1, height: 1, tilewidth: 16, tileheight: 16,
        tilesets: [{firstgid: 1, margin: 2, spacing: 2, columns: 4}], layers: [{type: 'tilelayer', data: [1]}]};
    const [layer] = tileLayersLoad(map, atlas, 0, undefined, false);
    assert.deepEqual(sheetPos(layer, 5), [64 + 2 + 18, 32 + 2 + 18]);
});
