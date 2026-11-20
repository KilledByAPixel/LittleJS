// A seeded random-operation fuzz of the 2D level editor, as test/editor3DFuzz.test.mjs is for the 3D one. Since full
// pass 9 also: the Coin type has a default of every kind the properties box
// edits (int, float, bool, string, Color, Vector2), set through editorSetSelectedProperty and read back; every
// property of every live coin compared with the map's; a resize taken back (and done and taken back again, with an
// edit between); an Apply taken back and redone; edits tried while an autosave waits (they must change nothing); a
// game tool 'Stamp' (paints on press, drag and release) driven through engineStep and the input state, ended by a
// release, Escape, the right button, a close and open, or a digit then a release; Save with an async onSave, kept by
// the game or written through a stub file picker, with an edit made while it waits, or two saves queued.
// Run from the repo root:
//   node --import ./test/setup.mjs --test test/editor2DFuzz.test.mjs
// FUZZ_SEEDS=1,2,3 FUZZ_OPS=400 pick the seeds and the operations per seed (8 seeds of 300 take about 5 s).
// FUZZ_VARIANT=noObjects: a map with no object layer, the editor makes one; onTile: the game's onTile gives the
// collision; big: 200 by 150, so the autosave waits a second (about 30 s a seed of 30). FUZZ_STATS=1 prints how often
// each operation ran and made an undo entry. FUZZ_BREAK='code' runs code in the engine first, a fault put in to see
// the fuzz find it, e.g. FUZZ_BREAK='editorAutosaveSoon = ()=> {}'.
//
// A game with a Tiled map of two tile layers (back, and ground the collision layer) and an object layer of coins,
// fetched from a file so it autosaves, and an onRestart hook that loads the same map object again. Random edits
// through the editor's own paths: paint, a cancelled stroke, fill (area and flood, stamps with see-through cells),
// clear (with and without All Layers), selection drag (kept and cancelled), copy, cut and paste of tiles and objects,
// object place, move, delete, property edits, undo, redo, resize, Reset to file, close and open, a Save, a reload of
// the page, a changed file under the autosave with Apply and Drop. After every operation:
// - each live layer shows what the map holds, the collision layer's collision too
// - every map object has its live game object, at its place with its value, and no other coin is alive
// - the autosave holds the map as it is, or there is none and the map is the file
// - undo and redo give back exactly the states before, an operation with no undo entry changes nothing
// - a reload brings back the same map, or the edits wait as pending, and Apply brings them back

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

const location = { pathname: '/fuzz/' };
const makeStorage = ()=>
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
};

const fileMap =
{
    width: 6, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 3, nextlayerid: 4, layers: [
    { type: 'tilelayer', id: 1, name: 'back', width: 6, height: 4, data: [
        1, 0, 0, 0, 0, 2,
        0, 0, 3, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        4, 4, 0, 0, 4, 4] },
    { type: 'tilelayer', id: 2, name: 'ground', width: 6, height: 4, data: [
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 5, 5, 0, 0, 0,
        1, 1, 1, 1, 1, 1] },
    { type: 'objectgroup', id: 3, name: 'Objects', objects: [
        { id: 1, type: 'Coin', point: true, x: 8, y: 8 },
        { id: 2, type: 'Coin', point: true, x: 40, y: 24,
            properties: [{ name: 'value', type: 'int', value: 5 }] }] }],
};

// the game and the fuzz helpers, run inside each engine
const gameCode = `
class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); this.value = 0; } }
var coinDefaults = { value: 1, solid: false, speed: 1.5, label: 'a', tint: hsl(0, 1, .5), dir: vec2(1, 0) };
objectLayersAddType('Coin', Coin, coinDefaults);
var toolLog = [];
levelEditor.addTool('Stamp', {
    onPress(at) { toolLog.push('press'); at.cell && levelEditor.edit2D.paint(at.cell, 2); },
    onDrag(at) { at.cell && levelEditor.edit2D.paint(at.cell, 3); },
    onRelease(at) { toolLog.push('release'); at.cell && levelEditor.edit2D.paint(at.cell, 4); },
});
function fzMouseAt(layer, cell)
{
    editorApplyCamera();
    mousePosScreen = worldToScreen(layer.live.pos.add(cell).add(vec2(.5)));
}
function fzClearInput() { for (const k in inputData[0]) inputData[0][k] = 0; }
// Save's file picker, download and remembered files, as a browser that lets a page write files has them
var fuzzWritten = [], fuzzDownloads = [], fuzzPickName = 'fuzz.json', fuzzStore = new Map;
globalThis.showSaveFilePicker = async ()=> ({name: fuzzPickName, queryPermission: async ()=> 'granted',
    createWritable: async ()=> { let t = ''; return {write: async (x)=> { t += x; },
        close: async ()=> { fuzzWritten.push(t); }}; }});
saveText = (t)=> fuzzDownloads.push(t);
editorFileStore = {get: async (k)=> fuzzStore.get(k), set: async (k, h)=> { h ? fuzzStore.set(k, h) : fuzzStore.delete(k); }};
var map;
function loadLevel()
{
    engineObjectsDestroy();
    tileLayersLoad(map, undefined, 0, 1);
    objectLayersLoad(map);
}
levelEditor.onRestart = ()=> loadLevel();
var fuzzVariant = '';
function fuzzSetVariant(v)
{
    fuzzVariant = v;
    // a game's own tile rule, which gives the collision itself
    if (v === 'onTile')
        levelEditor.onTile = (layer, pos, tile)=> layer.isSolid && layer.setCollisionData(pos, tile === undefined ? 0 : 1);
}
function startLevel(text, url='levels/fuzz.json')
{
    map = JSON.parse(text);
    editorJSONFetched(url, map);
    loadLevel();
}

// a seeded random, mulberry32
var fuzzSeed = 1;
function fzRand() { let t = fuzzSeed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const fzInt = (n)=> fzRand() * n | 0;
const fzCell = ()=> vec2(fzInt(map.width), fzInt(map.height));
const fzGid = ()=> fzRand() < .3 ? 0 : editorTileToGid(fzInt(6), fzInt(4), fzRand() < .3);
const fzArea = ()=> editorArea(fzCell(), fzCell());
const fuzzRecord = ()=> editorMapList.find((r)=> r.map === map);
const tileLayer = ()=> { const r = fuzzRecord(); return r.layers[fzInt(r.layers.length)]; };
const objectLayer = ()=> editorObjectLayers(fuzzRecord())[0];
const objectsOf = (layer)=> layer.group?.objects ?? [];

function fuzzSnap()
{
    return JSON.stringify({w: map.width, h: map.height, layers: editorTileLayerData(map.layers),
        // an empty object layer at the end, as one the editor made and emptied again, is no edit
        objects: editorObjectsKept(editorObjectGroups(map.layers).map((g)=> g.objects ?? []), 0)});
}

var modelUndo = [], modelRedo = [], fuzzToolProblem = '', fuzzToolEnd = '';

// one random edit, as the editor's keys, mouse and panel make it
function fuzzEdit(op)
{
    const record = fuzzRecord(), pending = !!record.pending;
    switch (op)
    {
    case 'paint': case 'cancel':
    {
        const layer = tileLayer();
        editorSelectLayer(layer);
        for (let k = 1 + fzInt(4); k--;)
            editorPaintStamp(layer, fzCell(), editorStampTile(fzGid()));
        op === 'cancel' ? editorStrokeCancel() : editorStrokeEnd();
        break;
    }
    case 'fill':
    {
        const layer = tileLayer();
        editorSelectLayer(layer);
        const w = 1 + fzInt(2), h = 1 + fzInt(2), grid = [];
        for (let i = w * h; i--;) grid.push(fzRand() < .2 ? undefined : fzGid());
        editorBrush = {width: w, height: h, grids: [grid]};
        if (fzRand() < .5) editorSelection = fzArea();
        else { editorSelection = undefined; editorHover = fzCell(); }
        editorFill();
        editorSelection = editorHover = undefined;
        break;
    }
    case 'clear':
    {
        const layer = tileLayer();
        editorSelectLayer(layer);
        editorAllLayers = fzRand() < .5;
        editorSelection = fzArea();
        editorClear();
        editorSelection = undefined;
        editorAllLayers = false;
        break;
    }
    case 'drag':
    {
        if (pending) break; // the mouse does not start one on a pending map
        const layer = tileLayer();
        editorSelectLayer(layer);
        editorAllLayers = fzRand() < .5;
        const area = editorSelection = fzArea();
        const start = vec2(area.min.x + fzInt(area.max.x - area.min.x + 1),
            area.min.y + fzInt(area.max.y - area.min.y + 1));
        editorSelectionDragStart(layer, start);
        for (let k = 1 + fzInt(3); k--;)
            editorSelectionDragTo(fzCell());
        if (fzRand() < .3)
            editorSelectionDragCancel();
        else
        {
            editorStrokeEnd();
            editorSelectionDrag = undefined;
        }
        editorSelection = undefined;
        editorAllLayers = false;
        break;
    }
    case 'copy': case 'cut':
    {
        const layer = tileLayer();
        editorSelectLayer(layer);
        editorAllLayers = fzRand() < .5;
        editorSelection = fzArea();
        op === 'cut' ? editorCut() : editorCopy();
        editorSelection = undefined;
        editorAllLayers = false;
        break;
    }
    case 'paste':
    {
        if (!editorClipboard) break;
        // the stamp paints the layer picked, and a stamp of all layers the map's from it
        const layer = editorClipboard.grids.length > 1 ? fuzzRecord().layers[0] : tileLayer();
        editorSelectLayer(layer);
        editorPaste();
        const cell = fzCell();
        editorPaintStamp(layer, cell, editorBrush);
        editorBrush.objects && editorPlaceStampObjects(layer, cell, editorBrush);
        editorStrokeEnd();
        break;
    }
    case 'place':
    {
        const layer = objectLayer();
        editorSelectLayer(layer);
        const properties = fzRand() < .5 ? [{name: 'value', type: 'int', value: 2 + fzInt(9)}] : [];
        const pos = vec2(fzRand() * map.width, fzRand() * map.height);
        editorPlaceObjects(layer, fzRand() < .5 ? editorSnap(pos) : pos, [{type: 'Coin', properties, offset: vec2()}]);
        break;
    }
    case 'move':
    {
        const layer = objectLayer(), count = objectsOf(layer).length;
        if (!count) break;
        editorSelectLayer(layer);
        const i = fzInt(count);
        for (let k = 1 + fzInt(4); k--;)
        {
            const pos = vec2(fzRand() * (map.width + 2) - 1, fzRand() * (map.height + 2) - 1);
            editorChangeObjects(layer, (list)=> editorObjectSetPos(layer.record, list[i], pos));
        }
        editorStrokeEnd();
        break;
    }
    case 'delete': case 'copyObjects': case 'cutObjects':
    {
        const layer = objectLayer();
        editorSelectLayer(layer);
        for (const object of objectsOf(layer))
            fzRand() < .4 && editorObjectSelection.add(object.id);
        op === 'delete' ? editorDeleteObjects() : op === 'cutObjects' ? editorCutObjects() : editorCopyObjects();
        editorObjectSelection.clear();
        break;
    }
    case 'pasteObjects':
    {
        const layer = objectLayer();
        editorSelectLayer(layer);
        if (!editorPasteObjects()) break;
        editorPlaceObjects(layer, editorSnap(vec2(fzRand() * map.width, fzRand() * map.height)), editorObjectBrush);
        break;
    }
    case 'property':
    {
        const layer = objectLayer(), count = objectsOf(layer).length;
        if (!count) break;
        // each type through the properties box's path
        const i = fzInt(count), names = Object.keys(coinDefaults), name = names[fzInt(names.length)];
        const value = name === 'value' ? (fzRand() < .7 ? fzInt(4) : fzInt(4) + .5) :
            name === 'solid' ? fzRand() < .5 : name === 'speed' ? (fzRand() < .5 ? fzInt(3) : 1.5) :
            name === 'label' ? ['a', 'b', '', ' x,y'][fzInt(4)] :
            name === 'tint' ? hsl(fzInt(3) / 3, 1, .5, fzRand() < .2 ? .5 : 1) :
            vec2(fzInt(3) - 1, fzRand() < .3 ? .25 : fzInt(2));
        editorSelectLayer(layer);
        editorObjectSelection.add(objectsOf(layer)[i].id);
        const id = objectsOf(layer)[i].id;
        editorSetSelectedProperty(name, value);
        editorObjectSelection.clear();
        // what the map reads back is the value set, a color to its 8 bits
        const object = objectsOf(layer).find((o)=> o.id === id);
        const read = objectLayersProperties(objectLayersTypes.get('Coin'), object)[name];
        const text = (v)=> isColor(v) ? v.toString() : JSON.stringify(v);
        pending || text(read) === text(value) || (fuzzToolProblem = 'property ' + name + ' set ' + text(value) + ' read ' +
            text(read));
        break;
    }
    case 'tool':
    {
        // a game tool pressed on a tile layer, dragged, and ended by a release, Escape, the right button, a close
        // and open, or a digit (taken while held) then a release
        if (pending) break;
        const layer = tileLayer();
        editorSelectLayer(layer);
        levelEditor.tool = 'Stamp';
        fzClearInput();
        engineStep(); // the tool is turned on
        const presses = toolLog.length, snap0 = fuzzSnap(), undo0 = editorUndoList.length;
        fzMouseAt(layer, fzCell());
        inputData[0][0] = 3; engineStep(); inputData[0][0] = 1;
        for (let k = fzInt(3); k--;) { fzMouseAt(layer, fzCell()); engineStep(); }
        const end = ['release', 'escape', 'right', 'close', 'digit'][fzInt(5)];
        fuzzToolEnd = end;
        if (end === 'release') { inputData[0][0] = 4; engineStep(); }
        else if (end === 'escape')
            { inputData[0].Escape = 3; engineStep(); fzClearInput(); inputData[0][0] = 4; engineStep(); }
        else if (end === 'right')
            { inputData[0][2] = 3; engineStep(); fzClearInput(); inputData[0][0] = 4; engineStep(); }
        else if (end === 'close') { levelEditor.close(); levelEditor.open(); }
        else { inputData[0].Digit1 = 3; engineStep(); inputData[0].Digit1 = 1; inputData[0][0] = 4; engineStep(); }
        fzClearInput();
        if (!levelEditor.isOpen) fuzzToolProblem = 'editor closed by ' + end;
        if (editorToolHeld) fuzzToolProblem = 'tool still held after ' + end;
        const log = toolLog.slice(presses).join();
        const want = end === 'escape' || end === 'right' ? 'press' : 'press,release';
        log === want || (fuzzToolProblem = end + ' log ' + log);
        // Escape and the right button take the press back whole, with no undo entry
        if (want === 'press' && (fuzzSnap() !== snap0 || editorUndoList.length !== undo0))
            fuzzToolProblem = end + ' did not take the press back';
        // a press that changed the map ends as one undo entry
        if (want !== 'press' && fuzzSnap() !== snap0 && editorUndoList.length !== Math.min(100, undo0 + 1))
            fuzzToolProblem = end + ' undo entries ' + (editorUndoList.length - undo0);
        levelEditor.tool = undefined;
        engineStep();
        fzClearInput();
        break;
    }
    case 'undo': editorUndo(); break;
    case 'redo': editorUndo(true); break;
    case 'resize': fuzzVariant === 'big' ? editorResize(record, 195 + fzInt(10), 145 + fzInt(10)) :
        editorResize(record, 2 + fzInt(7), 2 + fzInt(5)); break;
    case 'revert': editorRevert(record); break;
    case 'closeOpen': levelEditor.close(); levelEditor.open(); break;
    case 'apply': editorApplyPending(record); break;
    case 'drop': editorDiscardPending(record); break;
    case 'save':
    {
        // a Save to the file the game loads: the file is the map now, and the baseline follows it
        editorStrokeEnd();
        const text = editorMapJSON(record);
        editorSetBaseline(record, JSON.parse(text));
        return text;
    }
    }
}

// what is wrong with the editor's state now
function fuzzCheck()
{
    const problems = [], record = fuzzRecord();
    fuzzToolProblem && problems.push(fuzzToolProblem);
    fuzzToolProblem = '';
    if (!record) return ['no record for the map'];
    const records = editorMapList.filter((r)=> !r.synthetic);
    records.length === 1 || problems.push('records ' + records.length);

    // the live layers show the map
    const sources = editorTileLayers(map.layers);
    record.layers.length === sources.length || problems.push('layer records ' + record.layers.length);
    for (const layer of record.layers)
    {
        const live = layer.live, name = layer.source.name;
        if (live.destroyed) { problems.push('live layer destroyed ' + name); continue; }
        if (live.size.x !== map.width || live.size.y !== map.height)
        { problems.push('live size ' + name + ' ' + live.size + ' map ' + map.width + 'x' + map.height); continue; }
        if (layer.source.data.length !== map.width * map.height) problems.push('data length ' + name);
        let bad = 0, badCollision = 0;
        for (let y = 0; y < map.height; ++y)
        for (let x = 0; x < map.width; ++x)
        {
            const gid = layer.source.data[x + (map.height - 1 - y) * map.width];
            const d = live.getData(vec2(x, y));
            editorTileToGid(d.tile, d.direction, d.mirror) === gid || ++bad;
            if (live.isSolid && (live.getCollisionData(vec2(x, y)) ? 1 : 0) !== (gid ? 1 : 0)) ++badCollision;
        }
        bad && problems.push(bad + ' cells of ' + name + ' differ from the map');
        badCollision && problems.push(badCollision + ' collision cells of ' + name + ' differ from the map');
    }
    const liveLayers = engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed).length;
    liveLayers === sources.length || problems.push('live tile layers ' + liveLayers);

    // every map object has its game object, where it is, with its value
    let objectCount = 0;
    for (const layer of editorObjectLayers(record))
    {
        const objects = objectsOf(layer);
        objectCount += objects.length;
        for (const object of objects)
        {
            const made = layer.instances.get(object.id);
            if (!made || made.destroyed) { problems.push('object ' + object.id + ' has no game object'); continue; }
            const pos = editorObjectPos(record, object);
            made.pos.distance(pos) < 1e-6 || problems.push('object ' + object.id + ' at ' + made.pos + ' map ' + pos);
            const want = objectLayersProperties(objectLayersTypes.get('Coin'), object);
            for (const name in want)
                JSON.stringify(made[name]) === JSON.stringify(want[name]) ||
                    problems.push('object ' + object.id + ' ' + name + ' ' + JSON.stringify(made[name]) + ' map ' +
                    JSON.stringify(want[name]));
            // each property written as the kind the type reads back, none equal to its default
            for (const p of object.properties ?? [])
            {
                const d = coinDefaults[p.name];
                const kind = typeof d === 'boolean' ? 'bool' : isColor(d) ? 'color' : typeof d === 'number' ?
                    (Number.isInteger(p.value) && Number.isInteger(d) ? 'int' : 'float') : 'string';
                p.type === kind || kind === 'int' && p.type === 'float' || problems.push('object ' + object.id + ' property ' + p.name + ' type ' + p.type);
                JSON.stringify(want[p.name]) === JSON.stringify(d) &&
                    problems.push('object ' + object.id + ' property ' + p.name + ' kept at its default');
            }
        }
        // a destroyed one left in the map, of an object a resize dropped, is only kept memory
        for (const [id, made] of layer.instances)
            made.destroyed || objects.some((o)=> o.id === id) || problems.push('live instance of a gone object ' + id);
        new Set(objects.map((o)=> o.id)).size === objects.length || problems.push('duplicate object ids');
    }
    const coins = engineObjects.filter((o)=> o instanceof Coin && !o.destroyed).length;
    coins === objectCount || problems.push('live coins ' + coins + ' map objects ' + objectCount);

    // the autosave holds the map, or the map is the file; a big map's waits a second, the timer run here
    fuzzVariant === 'big' && editorAutosaveFlush();
    if (!record.pending)
    {
        const saved = editorSaves()[record.key], data = editorTileLayerData(map.layers);
        const objects = editorObjectGroups(map.layers).map((g)=> g.objects ?? []);
        if (saved)
        {
            JSON.stringify(saved.layers) === JSON.stringify(data) || problems.push('autosave tiles differ');
            JSON.stringify(saved.objects) === JSON.stringify(editorObjectsKept(objects, record.originalObjects.length))
                || problems.push('autosave objects differ');
            saved.width === map.width && saved.height === map.height || problems.push('autosave size differs');
        }
        else
        {
            JSON.stringify(data) === JSON.stringify(record.original) || problems.push('no autosave, tiles not the file');
            JSON.stringify(editorObjectsKept(objects, record.originalObjects.length)) ===
                JSON.stringify(record.originalObjects) ||
                problems.push('no autosave, objects not the file');
            map.width === record.originalSize.width && map.height === record.originalSize.height ||
                problems.push('no autosave, size not the file');
        }
    }
    editorAutosaveWaiting.size && problems.push('autosave waiting');
    editorStroke && problems.push('stroke left open');
    return problems;
}

// an edit, its undo bookkeeping checked against a model of the states before each entry
function fuzzStep(op)
{
    const s0 = fuzzSnap(), top0 = editorUndoList[editorUndoList.length - 1];
    const redoTop0 = editorRedoList[editorRedoList.length - 1];
    let problems = [], result;
    try { result = fuzzEdit(op); }
    catch (e) { problems.push('threw ' + e.message + ' ' + (e.stack || '').split('\\n')[1]); }
    const s1 = fuzzSnap(), top1 = editorUndoList[editorUndoList.length - 1];
    if (op === 'undo' || op === 'redo')
    {
        const [from, to] = op === 'undo' ? [modelUndo, modelRedo] : [modelRedo, modelUndo];
        if (from.length)
        {
            const expected = from.pop();
            s1 === expected || problems.push(op + ' did not give back the state before');
            to.push(s0);
        }
        else
            s1 === s0 || problems.push(op + ' with nothing to ' + op + ' changed the map');
    }
    else if (top1 !== top0)
    {
        modelUndo.push(s0);
        modelUndo.length > 100 && modelUndo.shift();
        modelRedo = [];
        // a stroke may paint a cell or move an object and put it back, as a drag does, an entry that ends where it began
        s1 === s0 && !['paint', 'move', 'paste', 'pasteObjects', 'tool'].includes(op) &&
            problems.push('an undo entry that changed nothing');
    }
    else if (s1 !== s0)
        problems.push('the map changed with no undo entry');
    modelUndo.length === editorUndoList.length || problems.push('undo list ' + editorUndoList.length +
        ' model ' + modelUndo.length);
    modelRedo.length === editorRedoList.length || problems.push('redo list ' + editorRedoList.length +
        ' model ' + modelRedo.length);
    return {problems: [...problems, ...fuzzCheck()], result, pending: !!fuzzRecord()?.pending, entry: top1 !== top0 || s1 !== s0};
}`;

async function newEngine(storage, fileText, seed)
{
    const engine = loadEngine({ localStorage: storage, location });
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const warnings = [];
    engine.context.console = { ...console, warn: (...a)=> warnings.push(a.join(' ')), log() {} };
    engine.run(gameCode);
    process.env.FUZZ_BREAK && engine.run(process.env.FUZZ_BREAK); // a fault put in, to see the fuzz find it
    engine.run(`fuzzSetVariant("${variant}")`);
    engine.run(`fuzzSeed = ${seed}; startLevel(${JSON.stringify(fileText)}); levelEditor.open();`);
    return { engine, warnings };
}

// a file changed by hand: a tile, an object moved, or the map made wider
function changeFile(text, rand)
{
    const map = JSON.parse(text), kind = rand() * 3 | 0;
    if (kind === 0)
    {
        const data = map.layers[0].data, i = rand() * data.length | 0;
        data[i] = data[i] === 3 ? 4 : 3;
    }
    else if (kind === 1 && map.layers[2]?.objects.length)
        map.layers[2].objects[0].x += 16;
    else
    {
        // a column added on the right of every tile layer
        for (const layer of map.layers.filter((l)=> l.type === 'tilelayer'))
        {
            const rows = [];
            for (let y = 0; y < map.height; ++y)
                rows.push(...layer.data.slice(y * map.width, (y + 1) * map.width), 0);
            layer.data = rows;
            layer.width = map.width + 1;
        }
        map.width += 1;
    }
    return JSON.stringify(map);
}

const OPS = ['paint', 'paint', 'paint', 'cancel', 'fill', 'fill', 'clear', 'drag', 'drag', 'copy', 'cut', 'paste',
    'paste', 'place', 'place', 'move', 'move', 'delete', 'copyObjects', 'cutObjects', 'pasteObjects', 'property',
    'undo', 'undo', 'undo', 'redo', 'redo', 'resize', 'revert', 'closeOpen', 'save', 'property', 'property',
    'tool', 'tool'];

async function runSeed(seed, opCount)
{
    let s = seed * 7919 + 1;
    const rand = ()=>
    {
        let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const storage = makeStorage();
    let fileText = JSON.stringify(variantMap());
    let { engine } = await newEngine(storage, fileText, seed);
    const failures = [], trail = [], stats = {};
    for (let i = 0; i < opCount && failures.length < 5; ++i)
    {
        const r = rand();
        if (r < .04 || r < .06)
        {
            // a reload of the page, the file changed under the autosave first one time in three
            const changed = r < .02 || rand() < .3;
            variant === 'big' && engine.run('editorAutosaveFlush()'); // the page hides
            const before = engine.run('fuzzSnap()');
            if (changed) fileText = changeFile(fileText, rand);
            ({ engine } = await newEngine(storage, fileText, seed * 1000 + i));
            const pending = engine.run('!!fuzzRecord().pending');
            trail.push(`${i} reload${changed ? ' changed file' : ''}${pending ? ' -> pending' : ''}`);
            const sr = stats[pending ? 'reloadPending' : 'reload'] ??= [0, 0]; ++sr[0];
            const problems = [...engine.run('fuzzCheck()')];
            if (!pending && !changed && engine.run('fuzzSnap()') !== before)
                problems.push('the reload did not bring back the edits');
            if (pending)
            {
                // edits tried while the autosave waits change nothing and make no undo entry
                for (let k = rand() < .5 ? 4 : 0; k--;)
                {
                    const o = OPS[rand() * OPS.length | 0];
                    if (o === 'save' || o === 'revert') continue;
                    const snap = engine.run('fuzzSnap()'), s = engine.run(`fuzzStep('${o}')`);
                    trail.push(`${i} ${o} while pending`);
                    problems.push(...s.problems);
                    engine.run('!!fuzzRecord().pending') || problems.push(o + ' ended the pending autosave');
                    engine.run('fuzzSnap()') === snap || problems.push(o + ' changed the map while pending');
                    engine.run('editorUndoList.length') && problems.push(o + ' made an undo entry while pending');
                }
                const op = rand() < .6 ? 'apply' : 'drop';
                const step = engine.run(`fuzzStep('${op}')`);
                trail.push(`${i} ${op}${step.pending ? ' (still pending)' : ''}`);
                problems.push(...step.problems);
                if (op === 'apply' && !step.pending && engine.run('fuzzSnap()') !== before)
                    problems.push('Apply did not bring back the edits\n  was ' + before + '\n  now ' +
                        engine.run('fuzzSnap()'));
                if (op === 'apply' && step.pending)
                    engine.run(`fuzzStep('drop')`);
                // an Apply is one undo: taken back, and done again
                if (op === 'apply' && !step.pending && rand() < .5)
                {
                    for (const o of rand() < .5 ? ['undo'] : ['undo', 'redo', 'undo'])
                    {
                        const s = engine.run(`fuzzStep('${o}')`);
                        trail.push(`${i} ${o} after apply`);
                        problems.push(...s.problems);
                    }
                }
            }
            problems.length && failures.push({ seed, i, op: 'reload', problems, trail: trail.slice(-12) });
            continue;
        }
        if (r < .08)
        {
            // the game goes to another level, edited there, and back: the file loaded again is a new map object, its
            // record takes over from the old one by its key, with the edits from the autosave, and no undo is left
            // that would write a map the game no longer shows
            const before = engine.run('fuzzSnap()'), wasPending = engine.run('!!fuzzRecord().pending');
            const other = JSON.stringify({...JSON.parse(JSON.stringify(fileMap)), width: 3, height: 2, layers: [
                { type: 'tilelayer', id: 1, name: 'only', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] }]});
            const problems = [...engine.run(`(()=>
            {
                const problems = [];
                startLevel(${JSON.stringify(other)}, 'levels/other.json');
                problems.push(...fuzzStep('paint').problems.filter((p)=> !p.includes(' list ')));
                startLevel(${JSON.stringify(fileText)});
                modelUndo = []; modelRedo = [];
                editorUndoList.length && problems.push('undo entries left after the level changed ' +
                    editorUndoList.length);
                return problems;
            })()`)];
            trail.push(`${i} other level and back`);
            problems.push(...engine.run('fuzzCheck()'));
            !wasPending && engine.run('fuzzSnap()') !== before && problems.push('the edits did not come back');
            problems.length && failures.push({ seed, i, op: 'switch', problems, trail: trail.slice(-12) });
            continue;
        }
        if (r < .11)
        {
            // a resize taken straight back, sometimes done and taken back again, with an edit between
            const seq = rand() < .5 ? ['resize', 'undo'] : ['resize', 'paint', 'undo', 'undo', 'redo', 'redo', 'undo'];
            const problems = [];
            for (const o of seq)
            {
                const s = engine.run(`fuzzStep('${o}')`);
                trail.push(`${i} ${o} (seq)`);
                problems.push(...s.problems);
            }
            problems.length && failures.push({ seed, i, op: 'resizeSeq', problems, trail: trail.slice(-12) });
            continue;
        }
        if (r < .14)
        {
            // Save with an async onSave: kept by the game, or written to the file, with an edit made while it waits,
            // or two saves queued with an edit between
            const kind = ['kept', 'written', 'twice'][rand() * 3 | 0];
            engine.run(`fuzzWritten = []; fuzzDownloads = [];
                levelEditor.onSave = async (text)=> { await null; await null; return ${kind === 'kept'}; }`);
            const problems = [];
            const text0 = engine.run('editorMapJSON(fuzzRecord())');
            const p0 = engine.run('editorSave(fuzzRecord())');
            const editOp = ['paint', 'place', 'property', 'move'][rand() * 4 | 0];
            problems.push(...engine.run(`fuzzStep('${editOp}')`).problems);
            let text1, p1;
            if (kind === 'twice')
            {
                text1 = engine.run('editorMapJSON(fuzzRecord())');
                p1 = engine.run('editorSave(fuzzRecord())');
            }
            const r0 = await p0, r1 = p1 && await p1;
            await new Promise((resolve)=> setTimeout(resolve, 0));
            const written = engine.run('fuzzWritten.slice()'), downloads = engine.run('fuzzDownloads.length');
            if (kind === 'kept')
                r0 === 'kept' && !written.length || problems.push('kept save ' + r0 + ' wrote ' + written.length);
            else
            {
                r0 === 'written' || problems.push('save ' + r0);
                written[0] === text0 || problems.push('first save wrote another text');
                if (kind === 'twice')
                {
                    r1 === 'written' || problems.push('second save ' + r1);
                    written[1] === text1 || problems.push('second save wrote another text');
                }
                written.length === (kind === 'twice' ? 2 : 1) || problems.push('writes ' + written.length);
                fileText = written[written.length - 1]; // the file the game loads now
                // the file written is the baseline, Reset to file goes back to it
                engine.run(`JSON.stringify(fuzzRecord().original) === JSON.stringify(editorTileLayerData(
                    JSON.parse(${JSON.stringify(fileText)}).layers))`) || problems.push('baseline is not the file written');
            }
            downloads && problems.push('downloads ' + downloads);
            engine.run('levelEditor.onSave = undefined');
            trail.push(`${i} save ${kind} with ${editOp}`);
            problems.push(...engine.run('fuzzCheck()'));
            problems.length && failures.push({ seed, i, op: 'saveAsync', problems, trail: trail.slice(-12) });
            continue;
        }
        const op = OPS[rand() * OPS.length | 0];
        const step = engine.run(`fuzzStep('${op}')`);
        trail.push(`${i} ${op}`);
        const st = stats[op] ??= [0, 0]; ++st[0]; step.entry && ++st[1];
        if (op === 'save' && typeof step.result === 'string') fileText = step.result;
        step.problems.length && failures.push({ seed, i, op, problems: [...step.problems], trail: trail.slice(-12) });
    }
    process.env.FUZZ_STATS && console.log(seed, JSON.stringify(stats));
    return failures;
}

// the file for a variant: as above, with no object layer, or 200 by 150 so its autosave waits
function variantMap()
{
    const map = JSON.parse(JSON.stringify(fileMap));
    if (variant === 'noObjects')
        map.layers.pop();
    if (variant === 'big')
    {
        map.width = 200, map.height = 150;
        for (const layer of map.layers.filter((l)=> l.type === 'tilelayer'))
        {
            layer.width = 200, layer.height = 150;
            layer.data = [...Array(200 * 150)].map((_, i)=> (i * 7919 % 13) < 3 ? 1 + i % 5 : 0);
        }
    }
    return map;
}

const variant = process.env.FUZZ_VARIANT ?? '';
const seeds = (process.env.FUZZ_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const opCount = Number(process.env.FUZZ_OPS ?? (variant === 'big' ? 30 : 300));
for (const seed of seeds)
test(`2D editor fuzz ${variant}, seed ${seed}, ${opCount} operations`, async ()=>
{
    const failures = await runSeed(seed, opCount);
    for (const f of failures)
        console.log(`seed ${f.seed} op ${f.i} ${f.op}:\n  ${f.problems.join('\n  ')}\n  trail: ${f.trail.join(', ')}`);
    assert.equal(failures.length, 0);
});
