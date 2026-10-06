import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A Save and a reload of the file it wrote give back the map as it was written, and drop the autosave, which the
// file now has: an Objects layer the editor made for a first object, empty again, is in neither the file nor the
// autosave, where the autosave kept its empty list, so the reload made the layer again and kept the autosave.

// a game whose map has a tile layer and no object layer, Save writing to a picked file
async function game(items, text, writes=[])
{
    const handle = { name: 'level.json', createWritable: async ()=> ({ write: async (t)=> { writes.push(t); }, close: async ()=> {} }) };
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
    const engine = loadEngine({ localStorage, location: { pathname: '/game/' }, showSaveFilePicker: async ()=> handle });
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run(`class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Coin', Coin, {});
        var map = JSON.parse(${JSON.stringify(text)});
        editorJSONFetched('levels/level.json', map);
        var layers;
        function loadLevel() { for (const o of [...engineObjects]) o.destroy(true);
            layers = tileLayersLoad(map, undefined, 0, 0, false); objectLayersLoad(map); }
        levelEditor.onRestart = loadLevel;
        loadLevel();`);
    return engine;
}
const file = JSON.stringify({ width: 4, height: 4, tilewidth: 16, tileheight: 16, nextlayerid: 2, nextobjectid: 1,
    tilesets: [{ firstgid: 1, source: 't.tsx' }],
    layers: [{ id: 1, type: 'tilelayer', name: 'front', width: 4, height: 4, data: new Array(16).fill(0) }] });

test('an Objects layer made for an object that went again is not made again by a reload of the saved file', async ()=>
{
    const items = {}, writes = [];
    const { run } = await game(items, file, writes);
    run(`levelEditor.open();
        const record = editorMapList[0], live = editorLayerRecord(layers[0]);
        editorPaint(live, vec2(1, 1), editorTileToGid(3)); editorStrokeEnd();
        const objects = editorObjectLayers(record)[0];
        editorPlaceObjects(objects, vec2(2.5, 2.5), [{type: 'Coin', properties: [], offset: vec2()}]);
        editorSelectLayer(objects);
        editorObjectSelection = new Set(objects.group.objects.map((o)=> o.id)); editorDeleteObjects();`);
    assert.equal(await run('editorSave(editorMapList[0])'), 'written');
    const written = writes[0];
    assert.ok(!JSON.parse(written).layers.some((layer)=> layer.type === 'objectgroup'), 'the empty layer is not saved: ' + written);

    const { run: reload } = await game({ ...items }, written);
    assert.equal(reload('editorMapJSON(editorMapList[0])'), written, 'the map is the file it wrote');
    assert.equal(reload('Object.keys(JSON.parse(localStorage.getItem(editorSaveName()) ?? "{}")).length'), 0,
        'the autosave, which the file has, is dropped');
});

test('an Objects layer a Save wrote is the file\'s own: emptied after, it stays, as a reload of the file has it', async ()=>
{
    const items = {}, writes = [];
    const { run } = await game(items, file, writes);
    run(`levelEditor.open();
        var objects = editorObjectLayers(editorMapList[0])[0];
        editorPlaceObjects(objects, vec2(2.5, 2.5), [{type: 'Coin', properties: [], offset: vec2()}]);`);
    assert.equal(await run('editorSave(editorMapList[0])'), 'written');
    assert.ok(JSON.parse(writes[0]).layers.some((layer)=> layer.type === 'objectgroup'), 'the layer is in the file');
    run(`editorSelectLayer(objects);
        editorObjectSelection = new Set(objects.group.objects.map((o)=> o.id)); editorDeleteObjects();`);
    const live = run('editorMapJSON(editorMapList[0])');
    assert.ok(JSON.parse(live).layers.some((layer)=> layer.type === 'objectgroup'), 'it stays, empty');

    const { run: reload } = await game({ ...items }, writes[0]);
    assert.equal(reload('editorMapJSON(editorMapList[0])'), live, 'the reload with its autosave is the map as it was');
});
