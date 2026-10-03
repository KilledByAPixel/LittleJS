import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// Small files that made a loader run on, from the review of 2026-10-03: each is read, refused or bounded at once.
// A test that ran on would hang the file, so each one is a few hundred bytes of the kind that did.

const { parseAtlas, parseGLTF, tileLayersFromLDtk, vec2 } = LJS;

test('an Aseprite tag that reaches past the frames, or before them, keeps to the frames there are', ()=>
{
    const frames = {a: {frame: {x: 0, y: 0, w: 8, h: 8}}, b: {frame: {x: 8, y: 0, w: 8, h: 8}}};
    for (const [from, to] of [[0, 3e7], [0, 1e999], [-1e9, 1], [1.5, 'x']])
    {
        const groups = parseAtlas({frames, meta: {frameTags: [{name: 'run', from, to}]}});
        const run = groups.find((g)=> g.name === 'run');
        assert.ok(run.frames.length <= 2, from + ' to ' + to);
    }
});

// a glTF of nodes and no meshes, or of one accessor, kept in memory
const gltf = (more)=> parseGLTF({asset: {version: '2.0'}, ...more});

test('a glTF node reached twice, in a cycle or through two parents, is a file problem said at once', async ()=>
{
    // 24 nodes each listing the next one twice would be 2 to the 24 visits
    const nodes = Array.from({length: 24}, (_, i)=> ({children: i < 23 ? [i + 1, i + 1] : []}));
    await assert.rejects(gltf({nodes, scenes: [{nodes: [0]}]}), /node/);
    await assert.rejects(gltf({nodes: [{children: [0]}], scenes: [{nodes: [0]}]}), /node/);
    const tree = await gltf({nodes: [{children: [1, 2]}, {}, {}], scenes: [{nodes: [0]}]});
    assert.ok(tree, 'a tree of three loads');
});

test('a glTF accessor with no buffer under it and a huge count is refused', async ()=>
{
    await assert.rejects(gltf({
        accessors: [{componentType: 5126, count: 3e7, type: 'VEC3'}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]}), /accessor/);
});

// an LDtk project with one level, its layers as given
const ldtk = (layers)=> ({defs: {tilesets: [{uid: 7, relPath: 't.png', pxWid: 32, pxHei: 16, tileGridSize: 16,
    __cWid: 2, __cHei: 1}, {uid: 8, relPath: 'u.png', pxWid: 32, pxHei: 16, tileGridSize: 16, __cWid: 2, __cHei: 1}]},
    levels: [{identifier: 'L', pxWid: 32, pxHei: 16, layerInstances: layers}]});
const layer = (more)=> ({__type: 'Tiles', __identifier: 'Ground', __gridSize: 16, __cWid: 2, __cHei: 1,
    __tilesetDefUid: 7, gridTiles: [], autoLayerTiles: [], ...more});

test('an LDtk level of millions of cells is refused, and a tile or entity with no place is passed by', ()=>
{
    assert.throws(()=> tileLayersFromLDtk(ldtk([layer({__cWid: 6000, __cHei: 6000})])), /tileLayersFromLDtk/);
    const map = tileLayersFromLDtk(ldtk([
        {__type: 'Entities', __identifier: 'Things', __gridSize: 16, __cWid: 2, __cHei: 1,
            entityInstances: [{__identifier: 'Coin', width: 16, height: 16}, {__identifier: 'Coin', px: [8, 8], width: 16, height: 16}]},
        layer({gridTiles: [{t: 0, f: 0}, {px: [16, 0], t: 1, f: 0}]})]));
    assert.deepEqual(map.layers[0].data, [0, 2]);
    assert.equal(map.layers[1].objects.length, 1);
});

test('an LDtk IntGrid layer whose rule tiles are on another tileset keeps its values for collision', ()=>
{
    const warn = console.warn;
    console.warn = ()=> {};
    try
    {
        // the first layer in the file, the top one, is the tile layer, and its tileset is the level's
        const map = tileLayersFromLDtk(ldtk([layer({gridTiles: [{px: [0, 0], t: 0, f: 0}]}),
            layer({__type: 'IntGrid', __identifier: 'Walls', __tilesetDefUid: 8,
            intGridCsv: [1, 0], autoLayerTiles: [{px: [0, 0], t: 1, f: 0}]})]));
        const walls = map.layers.find((l)=> l.name === 'Walls');
        assert.deepEqual([walls?.visible, walls?.data], [false, [1, 0]], 'the values, though the tiles are left out');
        assert.equal(map.layers.some((l)=> l.name === 'Walls tiles'), false);
    }
    finally { console.warn = warn; }
});

test('a collision layer named that no layer has says so in any build', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run('setHeadlessMode(true)');
    const said = JSON.parse(run(`(()=> { const error = console.error, said = []; console.error = (...t)=> said.push(t.join(' '));
        try { tileLayersLoad({width: 1, height: 1, layers: [{name: 'Ground', data: [1]}]}, undefined, 0, 'Walls', false); }
        finally { console.error = error; } return JSON.stringify(said); })()`));
    assert.ok(said.some((s)=> s.includes('Walls')), JSON.stringify(said));
});

test('a 3D level\'s colors are strings, and its numbers finite, or they keep what the game set', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`render3D.sunColor = rgb(0, 1, 0); render3D.sunDirection = vec3(0, 1, 0); render3D.setFog(1, 9);
        var made = level3DLoad({scene: {sunColor: ['#ff0000'], fogColor: ['#ff0000'], sunDirection: [1e999, 0, 0],
            fog: [1e999, -1e999]}, objects: [{id: 1, type: 'Box', pos: [1e999, 0, 0], properties: {color: ['#ff0000']}},
            {id: 2, type: 'Box', pos: [1, 2, 3]}]});`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([render3D.sunColor.g, render3D.sunDirection.y, render3D.fogStart, render3D.fogEnd,
        made.length, made[0].color.r, made[0].pos3D.x, made[1].pos3D.z])`)), [1, 1, 1, 9, 2, 1, 0, 3]);
});

test('an atlas with two groups of one name says so, where the second took the first\'s place unseen', () =>
{
    const frame = (filename)=> ({filename, frame: {x: 0, y: 0, w: 8, h: 8}});
    const warnings = [], warn = console.warn;
    console.warn = (...a)=> warnings.push(a.join(' '));
    try
    {
        parseAtlas({frames: [frame('run'), frame('jump')], meta: {frameTags: [{name: 'run', from: 1, to: 1}]}});
        parseAtlas({frames: [frame('coin.png'), frame('coin.gif')]});
        parseAtlas({frames: [frame('a'), frame('b')]});
    }
    finally { console.warn = warn; }
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /run/);
    assert.match(warnings[1], /coin/);
});
