import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The level editor paints the tile layers of a paused game, keeps the Tiled map the game loaded as its source of
// truth, saves it back as Tiled JSON and autosaves every change. The panel is html and is not made here, the
// tests call what its controls call. Each test runs its own copy of the script build.

// a localStorage kept between engines, like the page's across a reload
function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
const location = { pathname: '/game/' };

// a headless engine stepped by hand, as a game would run it
async function loadGame(extra={})
{
    const engine = loadEngine({ localStorage: makeStorage(), location, ...extra });
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return engine;
}

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser, it does nothing
// in headless mode, where a key would read as pressed again in the next step
function step(engine)
{
    engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}

// press and let go of a key, a step each
function press(engine, code)
{
    engine.handlers.keydown(keyEvent(code));
    step(engine);
    engine.handlers.keyup(keyEvent(code));
    step(engine);
}

// a key typed, as the browser gives it to the editor's own listener: key is the printed letter, code the position
const typed = (engine, key, { ctrl=false, shift=false, alt=false, code='', target='undefined' }={})=>
    engine.run(`editorOnKeyDown({ key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, repeat: false,
        ctrlKey: ${ctrl}, metaKey: false, shiftKey: ${shift}, altKey: ${alt}, target: ${target}, preventDefault() {} })`);

test('0 on the overlay opens the editor and pauses the game, 0 again gives back the pause and camera', async () =>
{
    const engine = await loadGame();
    const { run } = engine;
    run('setCameraPos(vec2(5, 6)); setCameraScale(40); setDebugOverlay(true)');
    press(engine, 'Digit0');
    assert.equal(run('levelEditor.isOpen'), true);
    assert.equal(run('paused'), true);
    assert.equal(run('debugOverlay'), false, 'the overlay closes so the level can be seen');
    run('editorCameraPos = vec2(1, 1); editorCameraScale = 10; engineStep()');
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [1, 1, 10], 'the editor has its own view');
    press(engine, 'Digit0'); // the overlay is closed, the editor takes the key itself
    assert.equal(run('levelEditor.isOpen'), false);
    assert.equal(run('paused'), false);
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [5, 6, 40]);
});

test('a game paused before the editor opened stays paused after it closes', async () =>
{
    const { run } = await loadGame();
    run('setPaused(true); levelEditor.open(); levelEditor.close()');
    assert.equal(run('paused'), true);
});

test('with debugKeysAlways, 0 toggles the editor once, not open and closed in the same step', async () =>
{
    const engine = await loadGame();
    engine.run('setDebugKeysAlways(true)');
    press(engine, 'Digit0');
    assert.equal(engine.run('levelEditor.isOpen'), true);
    press(engine, 'Digit0');
    assert.equal(engine.run('levelEditor.isOpen'), false);
});

test('release builds have no editor or tweakables code, only their stubs', () =>
{
    for (const file of ['littlejs.release.js', 'littlejs.min.js', 'littlejs.esm.min.js'])
    {
        const source = readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
        assert.ok(!source.includes('editorApplyCamera'), file + ' has editor code');
        assert.ok(!source.includes('Nothing to tweak'), file + ' has tweakables code');
    }
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run(`levelEditor.open(); levelEditor.onTile = ()=> {}; levelEditor.onRestart = ()=> {};
        let speed = 1; tweak('speed'); tweakButton('a', ()=> {}); tweakDivider(); tweakEngineDefaults();`);
    assert.equal(run('levelEditor.isOpen'), false);
});

// a map with a group, an object layer between the tile layers, and flip bits; front is the collision layer,
// index 2 once the group is flattened: back 0, things 1, front 2
const mapCode = `
    var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
        layers: [
            { type: 'tilelayer', name: 'back', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] },
            { type: 'objectgroup', name: 'things', objects: [{ id: 1, x: 8, y: 8, type: 'Coin' }] },
            { type: 'group', name: 'g', layers:
                [{ type: 'tilelayer', name: 'front', width: 3, height: 2, data: [0, 0, 3, 0, 0, 0] }] },
        ] };
    var layers = tileLayersLoad(map, undefined, 0, 2);
    var front = editorLayerRecord(layers[2]);
    var frontData = map.layers[2].layers[0].data;`;

test('every Tiled flip comes back as the gid it was loaded from', async () =>
{
    const { run } = await loadGame();
    const gids = [0, 1, 2, 3, 4, 5, 6, 7].map((f)=> ((f << 29) | 5) >>> 0);
    const back = run(`
        const map = { width: 8, height: 1,
            layers: [{ type: 'tilelayer', width: 8, height: 1, data: ${JSON.stringify(gids)} }] };
        const [layer] = tileLayersLoad(map, undefined, 0, undefined, false);
        [...Array(8)].map((_, x)=> { const d = layer.getData(vec2(x, 0));
            return editorTileToGid(d.tile, d.direction, d.mirror); });`);
    assert.deepEqual([...back], gids);
    assert.equal(run('editorTileToGid(undefined)'), 0);
    assert.equal(run('editorGidToTile(0)'), undefined);
});

test('painting writes the map and the live layer, and the collision layer gets collision', async () =>
{
    const { run } = await loadGame();
    const gid = ((7 << 29) | 7) >>> 0; // tile 6, a quarter turn, mirrored
    const result = run(mapCode + `
        editorPaint(front, vec2(0, 1), editorTileToGid(6, 1, true));
        editorStrokeEnd();
        const d = layers[2].getData(vec2(0, 1));
        [frontData[0], d.tile, d.direction, d.mirror, layers[2].getCollisionData(vec2(0, 1))];`);
    assert.deepEqual([...result], [gid, 6, 1, true, 1]);
});

test('a stroke is one undo, and redo puts it back', async () =>
{
    const { run } = await loadGame();
    run(mapCode + `
        editorPaint(front, vec2(0, 0), editorTileToGid(1));
        editorPaint(front, vec2(1, 0), editorTileToGid(1));
        editorPaint(front, vec2(2, 1), 0); // the tile 3 that was there
        editorStrokeEnd();`);
    assert.deepEqual([...run('frontData')], [0, 0, 0, 2, 2, 0]);
    run('editorUndo()');
    assert.deepEqual([...run('frontData')], [0, 0, 3, 0, 0, 0]);
    assert.equal(run('layers[2].getCollisionData(vec2(0, 0))'), 0);
    assert.equal(run('layers[2].getCollisionData(vec2(2, 1))'), 1);
    run('editorUndo(true)');
    assert.deepEqual([...run('frontData')], [0, 0, 0, 2, 2, 0]);
});

test('a map loaded again keeps its changes, and undo reaches the new layers', async () =>
{
    const { run } = await loadGame();
    run(mapCode + `
        editorPaint(front, vec2(0, 0), editorTileToGid(4));
        editorStrokeEnd();
        engineObjectsDestroy();
        layers = tileLayersLoad(map, undefined, 0, 2);`);
    assert.equal(run('layers[2].getData(vec2(0, 0)).tile'), 4, 'the restart loaded the edit');
    assert.equal(run('editorLayerRecord(layers[2]) === front'), true, 'the same layer record');
    run('editorUndo()');
    assert.equal(run('layers[2].getData(vec2(0, 0)).tile'), undefined);
});

test('a tile callback takes over from the default collision', async () =>
{
    const { run } = await loadGame();
    const seen = run(mapCode + `
        const calls = [];
        levelEditor.onTile = (layer, pos, tile)=> { calls.push([layer === layers[2], pos.x, pos.y, tile]);
            layer.setCollisionData(pos, -1); };
        editorPaint(front, vec2(1, 1), editorTileToGid(8));
        editorPaint(front, vec2(2, 1), 0);
        editorStrokeEnd();
        [calls, layers[2].getCollisionData(vec2(1, 1))];`);
    assert.deepEqual(JSON.parse(JSON.stringify(seen)), [[[true, 1, 1, 8], [true, 2, 1, null]], -1]);
});

test('tiles the game removes in play stay in the map', async () =>
{
    const { run } = await loadGame();
    run(mapCode + `layers[0].clearData(vec2(0, 1)); layers[2].clearData(vec2(2, 1));`);
    assert.deepEqual([...run('map.layers[0].data')], [1, 0, 0, 0, 0, 2]);
    assert.deepEqual([...run('frontData')], [0, 0, 3, 0, 0, 0]);
});

test('a save is the map as it was loaded, the edit and the flip bits included, groups and objects kept', async () =>
{
    const { run } = await loadGame();
    const saved = JSON.parse(run(mapCode + `
        var original = JSON.parse(JSON.stringify(map));
        editorPaint(front, vec2(0, 1), editorTileToGid(2, 0, true));
        editorStrokeEnd();
        editorMapJSON(front.record);`));
    const expected = JSON.parse(run('JSON.stringify(original)'));
    expected.layers[2].layers[0].data[0] = ((4 << 29) | 3) >>> 0; // [0, 1] is flips 4, the horizontal bit
    assert.deepEqual(saved, expected);
    assert.ok(saved.layers[2].layers[0].data[0] > 2**31, 'unsigned, as Tiled writes it');
});

test('a layer made in code saves as a map of its own that tileLayersLoad reads back', async () =>
{
    const { run } = await loadGame();
    const tiles = run(`
        const live = new TileLayer(vec2(), vec2(2, 1), undefined);
        live.setData(vec2(1, 0), new TileLayerData(5, 2, true));
        const json = editorMapJSON(editorLayerRecord(live).record);
        const [again] = tileLayersLoad(JSON.parse(json), undefined, 0, undefined, false);
        const d = again.getData(vec2(1, 0));
        [again.getData(vec2(0, 0)).tile, d.tile, d.direction, d.mirror];`);
    assert.deepEqual([...tiles], [undefined, 5, 2, true]);
});

test('a map fetched with fetchJSON saves under its file name', async () =>
{
    const text = JSON.stringify({ width: 1, height: 1,
        layers: [{ type: 'tilelayer', width: 1, height: 1, data: [1] }] });
    const { run } = await loadGame({ fetch: async ()=> ({ ok: true, json: async ()=> JSON.parse(text) }) });
    await run(`fetchJSON('levels/one.json?v=2').then((m)=> { tileLayersLoad(m, undefined, 0, 0, false); })`);
    assert.equal(run('editorMapList.at(-1).fileName'), 'one.json');
    assert.equal(run('editorMapList.at(-1).url'), 'levels/one.json?v=2');
});

const saveName = 'LittleJS editor /game/';
const mapKey = 'levels/test.json'; // autosaved by the file it came from

// the test map as fetchJSON would load it from a file, with this data in its front layer
const fileCode = (front=[0, 0, 3, 0, 0, 0])=> mapCode
    .replace('data: [0, 0, 3, 0, 0, 0]', `data: ${JSON.stringify(front)}`)
    .replace('var layers = tileLayersLoad', `editorJSONFetched('${mapKey}', map);
    var layers = tileLayersLoad`);

// a page load of a game whose file has this data in its front layer
async function reload(storage, front)
{
    const engine = await loadGame({ localStorage: storage });
    engine.run(fileCode(front));
    return engine;
}
const paintAndSave = (engine)=> engine.run('editorPaint(front, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd();');
const saved = (storage)=> JSON.parse(storage.items[saveName] ?? '{}')[mapKey];

test('an edit is autosaved and comes back after a reload', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    assert.ok(saved(storage), 'saved under the page and the map');
    const second = await reload(storage);
    assert.deepEqual([...second.run('frontData')], [5, 0, 3, 0, 0, 0]);
    assert.equal(second.run('layers[2].getData(vec2(0, 1)).tile'), 4, 'restored before the layers were made');
});

test('the file saved from the editor loads with no question, and its autosave is dropped', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    const second = await reload(storage, [5, 0, 3, 0, 0, 0]); // the file now has the edit
    assert.equal(second.run('front.record.pending'), undefined);
    assert.equal(saved(storage), undefined);
});

test('a file changed under an autosave is loaded as it is, and applying the edits is one undo', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    const second = await reload(storage, [0, 7, 3, 0, 0, 0]); // someone changed the file in Tiled
    assert.deepEqual([...second.run('frontData')], [0, 7, 3, 0, 0, 0]);
    assert.ok(second.run('front.record.pending'));
    second.run('editorApplyPending(front.record)');
    assert.deepEqual([...second.run('frontData')], [5, 0, 3, 0, 0, 0], 'the autosaved layers as they were');
    const third = await reload(storage, [0, 7, 3, 0, 0, 0]);
    assert.deepEqual([...third.run('frontData')], [5, 0, 3, 0, 0, 0], 'saved over the new file, so no question');
    second.run('editorUndo()');
    assert.deepEqual([...second.run('frontData')], [0, 7, 3, 0, 0, 0], 'applying is one undo');
});

test('dropping the edits of a changed file forgets them', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    const second = await reload(storage, [0, 7, 3, 0, 0, 0]);
    second.run('editorDiscardPending(front.record)');
    assert.equal(second.run('front.record.pending'), undefined);
    assert.equal(saved(storage), undefined);
    const third = await reload(storage, [0, 7, 3, 0, 0, 0]);
    assert.equal(third.run('front.record.pending'), undefined);
});

test('going back to the file forgets the autosave, and can be undone', async () =>
{
    const storage = makeStorage();
    const engine = await reload(storage);
    paintAndSave(engine);
    engine.run('editorRevert(front.record)');
    assert.deepEqual([...engine.run('frontData')], [0, 0, 3, 0, 0, 0]);
    assert.equal(saved(storage), undefined);
    engine.run('editorUndo()');
    assert.deepEqual([...engine.run('frontData')], [5, 0, 3, 0, 0, 0]);
});

test('a layer made in code is not autosaved, there is no load to bring it back in', async () =>
{
    const storage = makeStorage();
    const engine = await loadGame({ localStorage: storage });
    engine.run(`const live = new TileLayer(vec2(), vec2(2, 1), undefined);
        editorPaint(editorLayerRecord(live), vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();`);
    assert.equal(storage.items[saveName], undefined);
});

test('a click paints the cell under the mouse on the selected layer, and letting go ends the stroke', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(mapCode + `levelEditor.open(); editorLayer = front; editorBrush = editorStampTile(editorTileToGid(6));
        editorCameraPos = vec2(1.5, .5); editorCameraScale = 100;`);
    // vmEngine's canvas is 1000 square at the origin, so the middle of the screen is the camera, cell (1, 0)
    const target = { tagName: 'CANVAS', closest: ()=> null };
    handlers.mousedown({ button: 0, x: 500, y: 500, target, cancelable: false });
    step(engine);
    assert.equal(run('layers[2].getData(vec2(1, 0)).tile'), 6);
    handlers.mouseup({ button: 0, x: 500, y: 500, target });
    step(engine);
    assert.equal(run('editorUndoList.length'), 1);
});

test('a fast drag paints every cell between, not only where the mouse was each step', async () =>
{
    const engine = await loadGame();
    const { run } = engine;
    run(mapCode + `levelEditor.open(); editorLayer = front;
        editorPaintLine(front, vec2(0, 0)); editorPaintLine(front, vec2(2, 1)); editorStrokeEnd();`);
    const painted = run('[vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(2, 1)].map((p)=> layers[2].getData(p).tile)');
    assert.equal([...painted].filter((t)=> t === 0).length, 3, 'three cells on a line of two steps across');
});

test('R turns the brush, M mirrors it as seen on screen, and a pick takes a placed tile into the brush', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + 'levelEditor.open(); editorLayer = front;');
    typed(engine, 'r');
    typed(engine, 'm');
    // a quarter turn then a mirror is Tiled's turn then horizontal flip: the tile turned the other way, mirrored
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrushTile())')),
        { tile: 0, direction: 3, mirror: true });
    engine.run('editorPick(front, vec2(2, 1))');
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrushTile())')),
        { tile: 2, direction: 0, mirror: false });
    engine.run('editorPick(front, vec2(0, 0))');
    assert.equal(engine.run('editorBrush.grids[0][0]'), 0, 'an empty cell picks the Erase brush');
});

test('the selected layer starts as the collision layer', async () =>
{
    const { run } = await loadGame();
    run(mapCode + 'levelEditor.open()');
    assert.equal(run('editorLayer === front'), true);
});

test('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, found by the key label, so an AZERTY Z undoes too', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();`);
    typed(engine, 'z', { ctrl: true, code: 'KeyW' }); // the Z of an AZERTY keyboard sits where QWERTY has W
    assert.equal(engine.run('frontData[3]'), 0);
    typed(engine, 'Z', { ctrl: true, shift: true, code: 'KeyW' });
    assert.equal(engine.run('frontData[3]'), 2);
    typed(engine, 'z', { ctrl: true });
    typed(engine, 'y', { ctrl: true });
    assert.equal(engine.run('frontData[3]'), 2);
});

test('a quick click, down and up before the next step, still paints its cell', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(mapCode + `levelEditor.open(); editorLayer = front; editorBrush = editorStampTile(editorTileToGid(6));
        editorCameraPos = vec2(1.5, .5); editorCameraScale = 100;`);
    const target = { tagName: 'CANVAS', closest: ()=> null };
    handlers.mousedown({ button: 0, x: 500, y: 500, target, cancelable: false });
    handlers.mouseup({ button: 0, x: 500, y: 500, target });
    step(engine);
    assert.equal(run('layers[2].getData(vec2(1, 0)).tile'), 6);
    assert.equal(run('editorUndoList.length'), 1, 'and the stroke ended');
});

// review fixes

test('two levels with no file and the same size and layer names keep their own autosaves', async () =>
{
    const storage = makeStorage();
    const level = (data)=> `tileLayersLoad({ width: 2, height: 1,
        layers: [{ type: 'tilelayer', name: 'Tile Layer 1', width: 2, height: 1, data: ${JSON.stringify(data)} }] },
        undefined, 0, 0, false)`;
    const engine = await loadGame({ localStorage: storage });
    engine.run(`var one = editorLayerRecord(${level([1, 0])}[0]);
        editorPaint(one, vec2(1, 0), editorTileToGid(4)); editorStrokeEnd();
        var two = editorLayerRecord(${level([7, 7])}[0]);`);
    assert.equal(engine.run('two.record.pending'), undefined, 'a different level, not a changed file');
    engine.run('editorPaint(two, vec2(0, 0), editorTileToGid(2)); editorStrokeEnd();');
    const again = await loadGame({ localStorage: storage });
    assert.deepEqual([...again.run(`${level([1, 0])}[0].data.map((d)=> d.tile ?? -1)`)], [0, 4]);
    assert.deepEqual([...again.run(`${level([7, 7])}[0].data.map((d)=> d.tile ?? -1)`)], [2, 6]);
});

test('while a changed file waits for its edits to be applied or dropped, painting it is held off', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    const second = await reload(storage, [0, 7, 3, 0, 0, 0]);
    second.run('editorLastCell = undefined; editorPaintLine(front, vec2(2, 0)); editorStrokeEnd();');
    assert.deepEqual([...second.run('frontData')], [0, 7, 3, 0, 0, 0], 'not painted');
    assert.deepEqual(saved(storage).layers[1], [5, 0, 3, 0, 0, 0], 'the waiting edits are kept');
});

test('a map loaded again as a new copy retires the old one, and undo does not reach through it', async () =>
{
    const storage = makeStorage();
    const engine = await reload(storage);
    paintAndSave(engine);
    engine.run(`engineObjectsDestroy(); var copy = JSON.parse(JSON.stringify(map));
        copy.layers[2].layers[0].data = [0, 0, 3, 0, 0, 0]; editorJSONFetched('${mapKey}', copy);
        layers = tileLayersLoad(copy, undefined, 0, 2);`);
    assert.equal(engine.run('layers[2].getData(vec2(0, 1)).tile'), 4, 'the copy got the autosave');
    assert.equal(engine.run('editorMapList.includes(front.record)'), false, 'the old record is gone');
    engine.run('editorUndo()');
    assert.deepEqual(saved(storage).layers[1], [5, 0, 3, 0, 0, 0], 'the autosave is untouched');
    assert.equal(engine.run('layers[2].getData(vec2(0, 1)).tile'), 4);
});

test('painting a ghost with the tile it shows puts the tile back', async () =>
{
    const { run } = await loadGame();
    run(mapCode + `layers[2].clearData(vec2(2, 1)); layers[2].clearCollisionData(vec2(2, 1));
        editorPaint(front, vec2(2, 1), editorTileToGid(2)); editorStrokeEnd();`);
    assert.equal(run('layers[2].getData(vec2(2, 1)).tile'), 2);
    assert.equal(run('layers[2].getCollisionData(vec2(2, 1))'), 1);
    assert.equal(run('editorUndoList.length'), 0, 'the map did not change, nothing to undo');
});

// the mouse on the canvas at a cell of the test map, with the camera on cell (1, 0) at 100 pixels a cell
const canvas = { tagName: 'CANVAS', closest: ()=> null };
const at = (x, y)=> ({ button: 0, x: 500 + (x - 1) * 100, y: 500 - y * 100, target: canvas, cancelable: false });
const editCode = mapCode + `levelEditor.open(); editorLayer = front; editorBrush = editorStampTile(editorTileToGid(6));
    editorCameraPos = vec2(1.5, .5); editorCameraScale = 100;`;

test('a drag that leaves the layer and comes back in does not paint across the gap', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode);
    handlers.mousedown(at(0, 0));
    step(engine);
    handlers.mousemove(at(-3, 0)); // off the layer
    step(engine);
    handlers.mousemove(at(2, 1)); // back in at the far corner
    step(engine);
    handlers.mouseup(at(2, 1));
    step(engine);
    assert.equal(run('layers[2].getData(vec2(1, 0)).tile'), undefined, 'the cell between was not painted');
    assert.equal(run('layers[2].getData(vec2(2, 1)).tile'), 6);
});

test('autosaved edits brought back say so, so they are not forgotten in the file', async () =>
{
    const storage = makeStorage(), warnings = [];
    paintAndSave(await reload(storage));
    const engine = loadEngine({ localStorage: storage, location,
        console: { ...console, warn: (text)=> warnings.push(text) } });
    engine.run('setHeadlessMode(true)');
    engine.run(fileCode());
    assert.ok(warnings.some((text)=> /unsaved edits/.test(text)), warnings.join());
});

test('the middle button only moves the view', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode);
    handlers.mousedown({ ...at(2, 1), button: 1 });
    step(engine);
    handlers.mousemove({ ...at(1, 0), button: 1 });
    step(engine);
    handlers.mouseup({ ...at(1, 0), button: 1 });
    step(engine);
    assert.equal(run('editorUndoList.length'), 0, 'the middle button painted nothing');
    assert.notEqual(run('editorCameraPos.x'), 1.5, 'it moved the view');
});

// stamps

test('a stamp paints from the bottom left, its see-through cells and cells off the layer leave things as they are',
    async () =>
{
    const { run } = await loadGame();
    run(mapCode + `editorBrush = { width: 2, height: 2, grids: [[editorTileToGid(4), undefined, 0, editorTileToGid(5)]] };
        editorPaintStamp(front, vec2(1, 0)); editorPaintStamp(front, vec2(2, 1)); editorStrokeEnd();`);
    // the first at (1, 0): (1, 0) tile 4, (2, 0) see-through, (1, 1) erased, (2, 1) tile 5
    // the second at (2, 1): only (2, 1) is on the layer, tile 4
    assert.deepEqual([...run('frontData')], [0, 0, 5, 0, 5, 0]);
    assert.equal(run('editorUndoList.length'), 1, 'one stroke');
});

test('a quarter turn puts the stamp bottom row in its left column, top first, and turns each tile', async () =>
{
    const { run } = await loadGame();
    const turned = run(`const s = editorStampTurn({ width: 2, height: 1, grids: [[editorTileToGid(1), undefined]] });
        [s.width, s.height, s.grids[0][1] === editorTileToGid(1, 1), s.grids[0][0]];`);
    assert.deepEqual([...turned], [1, 2, true, undefined]);
});

test('turning four times, turning then back, and mirroring twice each give the stamp back', async () =>
{
    const { run } = await loadGame();
    const same = run(`const s = { width: 3, height: 2, grids: [[1, 2, undefined, 0, editorTileToGid(7, 2, true), 9]] };
        const text = JSON.stringify(s), turn = (x)=> editorStampTurn(x);
        [JSON.stringify(turn(turn(turn(turn(s))))), JSON.stringify(editorStampTurn(turn(s), true)),
            JSON.stringify(editorStampMirror(editorStampMirror(s)))].map((t)=> t === text);`);
    assert.deepEqual([...same], [true, true, true]);
});

test('mirroring a tile is Tiled\'s horizontal flip for every turn and mirror', async () =>
{
    const { run } = await loadGame();
    const flips = [0, 1, 2, 3, 4, 5, 6, 7];
    const mirrored = run(`${JSON.stringify(flips)}.map((f)=> editorGidMirror(((f << 29) | 5) >>> 0))`);
    assert.deepEqual([...mirrored], flips.map((f)=> (((f ^ 4) << 29) | 5) >>> 0));
});

test('E and the palette Erase slot give the Erase brush, and a palette tile keeps the brush turn', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorLayer = front;
        editorBrush = editorStampTile(editorTileToGid(3, 2, true));`);
    engine.run('editorPalettePick(4)');
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrushTile())')),
        { tile: 3, direction: 2, mirror: true }, 'slot 4 is tile 3, the turn kept');
    typed(engine, 'e');
    assert.equal(engine.run('editorBrush.grids[0][0]'), 0);
    engine.run('editorBrush = editorStampTile(1); editorPalettePick(0)');
    assert.equal(engine.run('editorBrush.grids[0][0]'), 0);
});

// keys and wheel

test('a shortcut typed into a text field, with AltGr, or with the editor closed is left alone', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); var before = editorBrush;`);
    typed(engine, 'r', { target: '{ closest: ()=> ({}) }' }); // inside an input
    typed(engine, 'r', { ctrl: true, alt: true }); // AltGr reports Ctrl and Alt
    engine.run('levelEditor.close()');
    typed(engine, 'r');
    assert.equal(engine.run('editorBrush === before'), true);
});

test('the wheel zooms by how far it moved and toward the mouse, and a pinch zooms too', async () =>
{
    const { run } = await loadGame();
    run(mapCode + `levelEditor.open(); editorCameraPos = vec2(1.5, .5); editorCameraScale = 100;
        mousePosScreen = vec2(700, 500);`); // one cell right of the middle
    const wheel = (deltaY, ctrlKey=false)=> run(`var before = screenToWorld(mousePosScreen);
        editorOnWheel({ deltaY: ${deltaY}, deltaMode: 0, ctrlKey: ${ctrlKey}, target: undefined });
        [editorCameraScale, screenToWorld(mousePosScreen).distance(before)];`);
    const [small] = wheel(-10), [big] = wheel(-100);
    assert.ok(small > 100 && big / small > small / 100, 'a bigger wheel move zooms more');
    const [scaled, drift] = wheel(100);
    assert.ok(scaled < big && drift < 1e-9, 'the point under the mouse stays put');
    const [pinched] = wheel(-10, true);
    assert.ok(pinched > scaled, 'a pinch zooms in');
});

test('1 to 9 pick layers from the back, the key is taken so debugKeysAlways leaves the debug views, and a drag '
    + 'does not carry across', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); setDebugKeysAlways(true); editorLastCell = vec2(0, 0);`);
    press(engine, 'Digit1');
    assert.equal(engine.run('editorLayer === editorLayerRecord(layers[0])'), true);
    assert.equal(engine.run('debugPhysics'), false);
    assert.equal(engine.run('editorLastCell'), undefined);
    press(engine, 'Digit2');
    assert.equal(engine.run('editorLayer === front'), true);
    press(engine, 'Digit9'); // no ninth layer, nothing changes
    assert.equal(engine.run('editorLayer === front'), true);
});

test('G toggles the grid and ? the list of keys', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + 'levelEditor.open()');
    typed(engine, 'g');
    typed(engine, '?', { shift: true });
    assert.deepEqual([...engine.run('[editorGrid, editorHelp]')], [false, true]);
});

// the right button, a click or a drag
function rightClick(engine, x, y)
{
    engine.handlers.mousedown({ ...at(x, y), button: 2 });
    step(engine);
    engine.handlers.mouseup({ ...at(x, y), button: 2 });
    step(engine);
}
function rightDrag(engine, from, to)
{
    engine.handlers.mousedown({ ...at(...from), button: 2 });
    step(engine);
    engine.handlers.mousemove({ ...at(...to), button: 2 });
    step(engine);
    engine.handlers.mouseup({ ...at(...to), button: 2 });
    step(engine);
}
const selection = (engine)=> engine.run('editorSelection && [editorSelection.min.x, editorSelection.min.y, '
    + 'editorSelection.max.x, editorSelection.max.y]');

test('a right click picks the tile under the mouse, an empty cell the Erase brush, and paints nothing', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    rightClick(engine, 2, 1);
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrushTile())')), { tile: 2, direction: 0, mirror: false });
    rightClick(engine, 0, 0);
    assert.equal(engine.run('editorBrush.grids[0][0]'), 0);
    assert.equal(engine.run('editorUndoList.length'), 0);
});

test('a right drag selects the area between press and release, clamped to the layer, and does not pick', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    rightDrag(engine, [0, 0], [5, 3]); // past the layer's corner
    assert.deepEqual([...selection(engine)], [0, 0, 2, 1]);
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrushTile())')), { tile: 6, direction: 0, mirror: false });
});

test('a right click outside the layer clears the selection, and a left click outside one only clears it',
    async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode);
    rightDrag(engine, [0, 0], [1, 1]);
    rightClick(engine, -3, 0);
    assert.equal(selection(engine), undefined);
    rightDrag(engine, [0, 0], [1, 1]);
    handlers.mousedown(at(2, 1));
    step(engine);
    handlers.mousemove(at(2, 0));
    step(engine);
    handlers.mouseup(at(2, 0));
    step(engine);
    assert.equal(selection(engine), undefined);
    assert.equal(run('editorUndoList.length'), 0, 'that press painted nothing, not even when held on');
});

test('Shift + left click draws a line from the last tile placed', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode + 'editorPaintStamp(front, vec2(0, 0)); editorStrokeEnd();');
    handlers.keydown(keyEvent('ShiftLeft'));
    handlers.mousedown(at(2, 0));
    step(engine);
    handlers.mouseup(at(2, 0));
    handlers.keyup(keyEvent('ShiftLeft'));
    step(engine);
    assert.deepEqual([0, 1, 2].map((x)=> run(`layers[2].getData(vec2(${x}, 0)).tile`)), [6, 6, 6]);
    assert.equal(run('editorUndoList.length'), 2, 'the line is one undo');
});

test('Space held with the left button pans and paints nothing', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode);
    handlers.keydown(keyEvent('Space'));
    handlers.mousedown(at(1, 0));
    step(engine);
    handlers.mousemove(at(0, 0));
    step(engine);
    handlers.mouseup(at(0, 0));
    handlers.keyup(keyEvent('Space'));
    step(engine);
    assert.equal(run('editorUndoList.length'), 0);
    assert.notEqual(run('editorCameraPos.x'), 1.5);
});

// fill, clear, copy, cut and paste

test('F fills the selection with the brush, a stamp repeating from its bottom left, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelection = editorArea(vec2(0, 0), vec2(2, 1));
        editorBrush = { width: 2, height: 1, grids: [[editorTileToGid(4), editorTileToGid(5)]] };`);
    typed(engine, 'f');
    assert.deepEqual([...engine.run('frontData')], [5, 6, 5, 5, 6, 5]);
    assert.equal(engine.run('editorUndoList.length'), 1);
});

test('F without a selection floods the cells joined to the one under the mouse that match it exactly', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorLayer = front;
        frontData.splice(0, 6, 0, editorTileToGid(3, 1), 3, 0, 0, 0); layers = tileLayersLoad(map, undefined, 0, 2);
        editorHover = vec2(0, 0); editorBrush = editorStampTile(editorTileToGid(7));`);
    typed(engine, 'f'); // floods the empty cells joined to (0, 0): all four, not the two tiles
    assert.deepEqual([...engine.run('frontData')], [8, engine.run('editorTileToGid(3, 1)'), 3, 8, 8, 8]);
    engine.run('editorHover = vec2(1, 1); editorBrush = editorStampTile(0);');
    typed(engine, 'f'); // the turned tile 3 is not the plain tile 3 beside it
    assert.deepEqual([...engine.run('frontData')], [8, 0, 3, 8, 8, 8]);
});

test('Delete clears the selection on the layer being edited, or on every layer of its map with All Layers', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelection = editorArea(vec2(0, 1), vec2(2, 1));`);
    typed(engine, 'Delete');
    assert.deepEqual([...engine.run('frontData')], [0, 0, 0, 0, 0, 0]);
    assert.deepEqual([...engine.run('map.layers[0].data')], [1, 0, 0, 0, 0, 2], 'the back layer is untouched');
    engine.run(`editorAllLayers = true; editorSelection = editorArea(vec2(0, 0), vec2(2, 1));`);
    typed(engine, 'Backspace');
    assert.deepEqual([...engine.run('map.layers[0].data')], [0, 0, 0, 0, 0, 0]);
});

test('Ctrl+C makes the selection the brush, empty cells see-through, and clears it so the next click paints',
    async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode + `editorSelection = editorArea(vec2(1, 1), vec2(2, 1));`); // (1, 1) empty, (2, 1) tile 2
    typed(engine, 'c', { ctrl: true });
    assert.equal(selection(engine), undefined);
    assert.deepEqual(JSON.parse(run('JSON.stringify(editorBrush)')),
        { width: 2, height: 1, grids: [[null, 3]] }, 'JSON writes see-through as null');
    handlers.mousedown(at(0, 0));
    step(engine);
    handlers.mouseup(at(0, 0));
    step(engine);
    assert.deepEqual([...run('frontData')], [0, 0, 3, 0, 3, 0]);
});

test('Ctrl+X copies and clears as one undo, and Ctrl+V brings the stamp back after a pick', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelection = editorArea(vec2(2, 1), vec2(2, 1));`);
    typed(engine, 'x', { ctrl: true });
    assert.deepEqual([...engine.run('frontData')], [0, 0, 0, 0, 0, 0]);
    assert.equal(engine.run('editorUndoList.length'), 1);
    engine.run('editorPick(front, vec2(0, 0))');
    typed(engine, 'v', { ctrl: true });
    assert.equal(engine.run('editorBrush === editorClipboard && editorBrush.grids[0][0]'), 3);
});

test('a stamp copied from all layers paints each layer, onto a map with fewer layers only the ones it has',
    async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorAllLayers = true; editorSelection = editorArea(vec2(0, 1), vec2(0, 1));`);
    typed(engine, 'c', { ctrl: true }); // back has tile 0 there, front is empty
    engine.run('editorPaintStamp(front, vec2(1, 0)); editorStrokeEnd();');
    assert.equal(engine.run('map.layers[0].data[4]'), 1, 'the back layer got its tile');
    engine.run(`const small = { width: 2, height: 1,
            layers: [{ type: 'tilelayer', name: 'only', width: 2, height: 1, data: [0, 0] }] };
        var only = editorLayerRecord(tileLayersLoad(small, undefined, 0, 0, false)[0]);
        editorPaintStamp(only, vec2(0, 0)); editorStrokeEnd();`);
    assert.deepEqual([...engine.run('small.layers[0].data')], [1, 0]);
});

// panel text

test('the hint line follows what is held and whether there is a selection', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    assert.match(engine.run('editorHint()'), /^Left paint/);
    engine.handlers.keydown(keyEvent('ShiftLeft'));
    assert.match(engine.run('editorHint()'), /^Shift: line/);
    engine.handlers.keyup(keyEvent('ShiftLeft'));
    engine.run('editorSelection = editorArea(vec2(0, 0), vec2(1, 1))');
    assert.match(engine.run('editorHint()'), /^Selection: drag moves · F fill/);
    engine.handlers.keydown(keyEvent('Space'));
    assert.equal(engine.run('editorHint()'), 'Drag to pan');
});

test('the brush label names the Erase brush, a turned and mirrored tile, and a stamp with its layers', async () =>
{
    const { run } = await loadGame();
    run(editCode);
    assert.equal(run('editorBrush = editorStampTile(0); editorBrushLabel()'), 'Brush: Erase');
    assert.equal(run('editorBrush = editorStampTile(editorTileToGid(5, 1, true)); editorBrushLabel()'),
        'Brush: tile 5, turned 90°, mirrored');
    assert.equal(run('editorBrush = { width: 3, height: 2, grids: [[], []] }; editorBrushLabel()'),
        'Brush: 3x2 stamp, 2 layers');
});

// review fixes

test('a checkbox or slider with focus, as a tweak leaves, does not take the editor shortcuts', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();
        var checkbox = { tagName: 'INPUT', type: 'checkbox' }; checkbox.closest = ()=> checkbox;`);
    typed(engine, 'z', { ctrl: true, target: 'checkbox' });
    assert.equal(engine.run('frontData[3]'), 0, 'undone');
    engine.run(`var box = { tagName: 'INPUT', type: 'number' }; box.closest = ()=> box;`);
    typed(engine, 'y', { ctrl: true, target: 'box' });
    assert.equal(engine.run('frontData[3]'), 0, 'a number box being typed in keeps its keys');
});

test('on a layout without Latin letters the shortcuts go by key position', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();`);
    typed(engine, 'я', { ctrl: true, code: 'KeyZ' }); // the Z key of a Russian keyboard
    assert.equal(engine.run('frontData[3]'), 0);
});

// minor fixes

test('F or Delete pressed during a held drag is an undo of its own', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorPaint(front, vec2(0, 0), editorTileToGid(1)); // a drag still held
        editorSelection = editorArea(vec2(1, 0), vec2(2, 0));`);
    typed(engine, 'f');
    assert.equal(engine.run('editorUndoList.length'), 2);
    engine.run(`editorPaint(front, vec2(0, 1), editorTileToGid(1)); editorSelection = editorArea(vec2(1, 0), vec2(2, 0));`);
    typed(engine, 'Delete');
    assert.equal(engine.run('editorUndoList.length'), 4);
});

test('copying an area with nothing in it keeps the brush, and a see-through cell is not called Erase', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `var before = editorBrush; editorSelection = editorArea(vec2(0, 0), vec2(1, 0));`);
    typed(engine, 'c', { ctrl: true });
    assert.equal(engine.run('editorBrush === before'), true);
    assert.equal(engine.run('editorBrush = { width: 1, height: 1, grids: [[undefined]] }; editorBrushLabel()'),
        'Brush: empty');
});

test('Ctrl+C, X and V leave the browser its own copy and paste when they have nothing to do', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    const prevented = (key, ctrl=true)=> engine.run(`(()=> { let prevented = false;
        editorOnKeyDown({ key: '${key}', code: '', repeat: false, ctrlKey: ${ctrl}, metaKey: false, shiftKey: false,
            altKey: false, target: undefined, preventDefault() { prevented = true; } });
        return prevented; })()`);
    assert.deepEqual(['c', 'x', 'v'].map((key)=> prevented(key)), [false, false, false]);
    engine.run('editorSelection = editorArea(vec2(2, 1), vec2(2, 1))');
    assert.equal(prevented('c'), true);
    assert.equal(prevented('v'), true, 'there is a stamp to paste now');
    assert.equal(prevented('g', false), true);
});

test('a right click that moves a few pixels far zoomed out still picks', async () =>
{
    const engine = await loadGame();
    const { run, handlers } = engine;
    run(editCode + 'editorCameraScale = 4; editorBrush = editorStampTile(editorTileToGid(6));');
    handlers.mousedown({ ...at(1, 0), button: 2 });
    step(engine);
    handlers.mousemove({ ...at(1, 0), x: 503, button: 2 });
    step(engine);
    handlers.mouseup({ ...at(1, 0), x: 503, button: 2 });
    step(engine);
    assert.equal(selection(engine), undefined);
    assert.equal(run('editorBrush.grids[0][0]'), 0, 'picked the empty cell under the mouse');
});

test('a fill or an undo draws the layer once, not cell by cell, and painting one cell still shows at once',
    async () =>
{
    const engine = await loadGame();
    // a canvas of its own, as in a browser, so setData redraws a cell through redrawTileData
    engine.run(editCode + `var cells = 0, full = 0; layers[2].context = {};
        layers[2].redrawTileData = ()=> ++cells; layers[2].redraw = ()=> ++full;
        editorSelection = editorArea(vec2(0, 0), vec2(2, 1));`);
    typed(engine, 'f');
    assert.deepEqual([...engine.run('[cells, full]')], [0, 1]);
    typed(engine, 'z', { ctrl: true });
    assert.deepEqual([...engine.run('[cells, full]')], [0, 2]);
    engine.run('editorPaint(front, vec2(0, 0), editorTileToGid(2))');
    assert.equal(engine.run('cells'), 1, 'a drag shows each cell as it is painted');
});

test('a selection goes with its layer when the game loads the map again, and Ctrl+C then does nothing', async () =>
{
    const storage = makeStorage();
    const engine = await reload(storage);
    engine.run(`levelEditor.open(); editorLayer = front; var before = editorBrush;
        editorSelection = editorArea(vec2(0, 0), vec2(1, 0));
        engineObjectsDestroy(); var copy = JSON.parse(JSON.stringify(map)); editorJSONFetched('${mapKey}', copy);
        layers = tileLayersLoad(copy, undefined, 0, 2);`);
    assert.equal(engine.run('editorSelection'), undefined);
    typed(engine, 'c', { ctrl: true });
    assert.equal(engine.run('editorBrush === before'), true);
});

test('Save, Revert, Apply and Drop do nothing with no layer to act on', async () =>
{
    const { run } = await loadGame();
    run('editorSave(undefined); editorRevert(undefined); editorApplyPending(undefined); editorDiscardPending(undefined)');
});

test('an infinite map gets the loader\'s own message, and typed array data saves as plain gids', async () =>
{
    const { run } = await loadGame();
    assert.throws(()=> run(`tileLayersLoad({ width: 2, height: 1, infinite: true,
        layers: [{ type: 'tilelayer', width: 2, height: 1, chunks: [] }] })`), /Assert failed/);
    const saved = JSON.parse(run(`const [typed] = tileLayersLoad({ width: 2, height: 1,
        layers: [{ type: 'tilelayer', width: 2, height: 1, data: new Uint32Array([1, 0]) }] }, undefined, 0, 0, false);
        editorMapJSON(editorLayerRecord(typed).record)`));
    assert.deepEqual(saved.layers[0].data, [1, 0]);
});

test('a level URL with a version query keeps its autosave when the version changes', async () =>
{
    const storage = makeStorage();
    const load = async (version)=>
    {
        const engine = await loadGame({ localStorage: storage });
        engine.run(mapCode.replace('var layers = tileLayersLoad',
            `editorJSONFetched('levels/one.json?v=${version}', map);\n    var layers = tileLayersLoad`));
        return engine;
    };
    paintAndSave(await load(1));
    assert.deepEqual([...(await load(2)).run('frontData')], [5, 0, 3, 0, 0, 0]);
});

test('an autosave that does not fit in storage says so', async () =>
{
    const full = { getItem: ()=> null, setItem() { throw new Error('QuotaExceededError'); } };
    const engine = await loadGame({ localStorage: full });
    engine.run(mapCode + 'editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();');
    assert.equal(engine.run('editorSaveFailed'), true);
    const fine = await loadGame();
    fine.run(mapCode + 'editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();');
    assert.equal(fine.run('editorSaveFailed'), false);
});

// the levelEditor singleton

test('Restart closes the editor, ends a held stroke as its own undo, then calls the game\'s hook', async () =>
{
    const { run } = await loadGame();
    run(editCode + `var restarts = 0, openWhenCalled;
        levelEditor.onRestart = ()=> { ++restarts; openWhenCalled = levelEditor.isOpen; };
        editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorRestart();`);
    assert.deepEqual([...run('[restarts, openWhenCalled, levelEditor.isOpen, editorUndoList.length]')], [1, false, false, 1]);
    run('levelEditor.onRestart = undefined; levelEditor.open(); editorRestart()');
    assert.equal(run('levelEditor.isOpen'), true, 'no hook, nothing happens');
});

test('isOpen can not be set, only open() and close() change it', async () =>
{
    const { run } = await loadGame();
    run('levelEditor.isOpen = true');
    assert.deepEqual([...run('[levelEditor.isOpen, paused]')], [false, false]);
    run('levelEditor.open()');
    assert.deepEqual([...run('[levelEditor.isOpen, paused]')], [true, true]);
});

// an editing session: Escape switches between playing and editing until the editor is exited

test('once the editor is opened, Escape switches between playing and editing, not the debug overlay', async () =>
{
    const engine = await loadGame();
    engine.run('levelEditor.open()');
    press(engine, 'Escape');
    assert.deepEqual([...engine.run('[levelEditor.isOpen, paused, debugOverlay]')], [false, false, false]);
    press(engine, 'Escape');
    assert.deepEqual([...engine.run('[levelEditor.isOpen, paused, debugOverlay]')], [true, true, false]);
});

test('Exit, or 0 while editing, ends the session, and Escape opens the debug overlay again', async () =>
{
    const engine = await loadGame();
    engine.run('levelEditor.open(); levelEditor.close()');
    press(engine, 'Escape');
    assert.deepEqual([...engine.run('[levelEditor.isOpen, debugOverlay]')], [false, true]);
    press(engine, 'Escape'); // the overlay closes
    engine.run('levelEditor.open()');
    press(engine, 'Digit0');
    assert.equal(engine.run('levelEditor.isOpen'), false);
    press(engine, 'Escape');
    assert.deepEqual([...engine.run('[levelEditor.isOpen, debugOverlay]')], [false, true]);
});

test('coming back to the editor keeps its layer and zoom, and centers on the game camera', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `levelEditor.open(); editorLayer = editorLayerRecord(layers[0]); editorCameraScale = 50;`);
    press(engine, 'Escape');
    engine.run('setCameraPos(vec2(7, 8))');
    press(engine, 'Escape');
    assert.deepEqual([...engine.run(`[editorLayer === editorLayerRecord(layers[0]), editorCameraScale,
        editorCameraPos.x, editorCameraPos.y]`)], [true, 50, 7, 8]);
});

test('Restart plays on in the session, Escape comes back to the editor', async () =>
{
    const engine = await loadGame();
    engine.run('var restarts = 0; levelEditor.onRestart = ()=> ++restarts; levelEditor.open(); editorRestart();');
    assert.deepEqual([...engine.run('[levelEditor.isOpen, restarts]')], [false, 1]);
    press(engine, 'Escape');
    assert.equal(engine.run('levelEditor.isOpen'), true);
});

// saving where the browser lets a page write files: a stand-in for Chrome's file picker that counts picks and keeps
// what was written, its files asking for permission again after a reload, which is given or not
function filePicker()
{
    const picker = { picks: 0, written: [], abort: false, permission: 'granted' };
    picker.showSaveFilePicker = async (options)=>
    {
        ++picker.picks;
        if (picker.abort) throw { name: 'AbortError' };
        return { name: options.suggestedName, createWritable: async ()=>
            ({ write: async (text)=> picker.written.push(text), close: async ()=> {} }),
            queryPermission: async ()=> 'prompt', requestPermission: async ()=> picker.permission };
    };
    return picker;
}

// a stand-in for the IndexedDB store the picked files are kept in, kept between engines like the page's
function fileStore()
{
    const files = new Map;
    return { files, get: async (key)=> files.get(key),
        set: async (key, handle)=> { handle ? files.set(key, handle) : files.delete(key); } };
}

// a page load of the file's game that saves with this picker and file store
async function savingGame(picker, store)
{
    const engine = await loadGame({ showSaveFilePicker: picker.showSaveFilePicker, fileStore: store });
    engine.run('editorFileStore = fileStore;' + fileCode());
    return engine;
}

test('where the browser lets a page write files, Save picks the file once and writes it on each Save after',
    async () =>
{
    const picker = filePicker();
    const engine = await loadGame({ showSaveFilePicker: picker.showSaveFilePicker });
    engine.run(mapCode);
    assert.equal(await engine.run('editorSave(front.record)'), 'written');
    engine.run('editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();');
    await engine.run('editorSave(front.record)');
    assert.deepEqual([picker.picks, picker.written.length], [1, 2]);
    assert.equal(JSON.parse(picker.written[1]).layers[2].layers[0].data[3], 2, 'the second save has the edit');
    await engine.run('editorSave(front.record, true)');
    assert.equal(picker.picks, 2, 'Save As picks again');
});

test('the file picked is remembered across a reload, Save writes it again once the browser gives permission',
    async () =>
{
    const picker = filePicker(), store = fileStore();
    await (await savingGame(picker, store)).run('editorSave(front.record)');
    assert.equal(store.files.size, 1);
    assert.equal(await (await savingGame(picker, store)).run('editorSave(front.record)'), 'written');
    assert.deepEqual([picker.picks, picker.written.length], [1, 2], 'no picker the second time');
});

test('a remembered file the browser is refused permission for is picked again, and the new pick remembered',
    async () =>
{
    const picker = filePicker(), store = fileStore();
    await (await savingGame(picker, store)).run('editorSave(front.record)');
    picker.permission = 'denied';
    const first = [...store.files.values()][0];
    assert.equal(await (await savingGame(picker, store)).run('editorSave(front.record)'), 'written');
    assert.equal(picker.picks, 2);
    assert.notEqual([...store.files.values()][0], first);
});

test('without IndexedDB the file store finds nothing, and Save picks', async () =>
{
    const picker = filePicker();
    const engine = await loadGame({ showSaveFilePicker: picker.showSaveFilePicker });
    engine.run(fileCode());
    assert.equal(await engine.run('editorFileStore.get("x")'), undefined);
    assert.equal(await engine.run('editorSave(front.record)'), 'written');
    assert.equal(picker.picks, 1);
});

test('closing the file picker saves nothing', async () =>
{
    const picker = filePicker();
    picker.abort = true;
    const engine = await loadGame({ showSaveFilePicker: picker.showSaveFilePicker });
    engine.run(mapCode);
    assert.equal(await engine.run('editorSave(front.record)'), undefined);
    assert.equal(picker.written.length, 0);
});

// play from the mouse

test('with Play from mouse on, Escape to play hands the game the mouse position, Play the view center', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `var from = []; // a screen position is a pixel center, so rounded
        levelEditor.onPlayFrom = (pos)=> from.push([+pos.x.toFixed(1), +pos.y.toFixed(1)]);
        levelEditor.open(); editorCameraPos = vec2(1.5, .5); editorCameraScale = 100; editorPlayFromMouse = true;
        mousePosScreen = vec2(700, 400);`); // one cell right and up of the middle
    press(engine, 'Escape');
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(from)')), [[3.5, 1.5]]);
    press(engine, 'Escape');
    engine.run('editorCameraPos = vec2(1.5, .5); editorPlay(editorCameraPos)'); // coming back centered the game
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(from)')).at(-1), [1.5, .5]);
});

test('with Play from mouse off, or on Exit and Restart, the game is not moved', async () =>
{
    const engine = await loadGame();
    engine.run(mapCode + `var calls = 0; levelEditor.onPlayFrom = ()=> ++calls; levelEditor.onRestart = ()=> {};
        levelEditor.open();`);
    press(engine, 'Escape');
    press(engine, 'Escape');
    engine.run('editorPlayFromMouse = true; editorRestart(); levelEditor.open(); levelEditor.close();');
    assert.equal(engine.run('calls'), 0);
});

// resizing: the map grows and shrinks at the right and top, and the game rebuilds it with its Restart hook

const restartCode = `var restarts = 0; levelEditor.onRestart = ()=>
    { ++restarts; engineObjectsDestroy(); layers = tileLayersLoad(map, undefined, 0, 2); };`;

test('without a Restart hook the level size can not change', async () =>
{
    const { run } = await loadGame();
    assert.equal(run(mapCode + 'editorResize(front.record, 4, 3)'), false);
    assert.equal(run('map.width'), 3);
});

test('growing adds empty cells at the right and top, tiles and objects keep their places, as one undo', async () =>
{
    const { run } = await loadGame();
    assert.equal(run(mapCode + restartCode + 'editorResize(front.record, 4, 3)'), true);
    assert.deepEqual([...run('frontData = map.layers[2].layers[0].data')], [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
    assert.deepEqual([...run('map.layers[0].data')], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0]);
    assert.deepEqual([...run(`[map.width, map.height, map.layers[0].width, map.layers[0].height,
        map.layers[1].objects[0].y, restarts, layers[2].size.x, layers[2].size.y]`)], [4, 3, 4, 3, 24, 1, 4, 3]);
    run('editorUndo()');
    assert.deepEqual([...run('[map.width, map.height, map.layers[1].objects[0].y, restarts, layers[2].size.x]')],
        [3, 2, 8, 2, 3]);
    assert.deepEqual([...run('map.layers[0].data')], [1, 0, 0, 0, 0, 2]);
});

test('shrinking drops tiles and objects past the new right and top edges', async () =>
{
    const { run } = await loadGame();
    run(mapCode + restartCode + 'editorResize(front.record, 2, 1)');
    assert.deepEqual([...run('map.layers[0].data')], [0, 0]);
    assert.equal(run('map.layers[1].objects.length'), 0, 'the object at the top is past the new top edge');
});

test('a resized level is autosaved and comes back at its size on reload, and Reset to file puts the size back',
    async () =>
{
    const storage = makeStorage();
    const first = await loadGame({ localStorage: storage });
    first.run(fileCode() + restartCode + 'editorPaint(front, vec2(0, 0), editorTileToGid(1)); editorStrokeEnd();' +
        'editorResize(front.record, 4, 3);');
    const second = await loadGame({ localStorage: storage });
    second.run(fileCode() + restartCode);
    assert.deepEqual([...second.run('[map.width, map.height, layers[2].size.x, layers[2].size.y]')], [4, 3, 4, 3]);
    assert.equal(second.run('map.layers[2].layers[0].data[8]'), 2, 'the painted tile, now on the bottom row');
    second.run('editorRevert(front.record)');
    assert.deepEqual([...second.run('[map.width, map.height, restarts]')], [3, 2, 1]);
    assert.deepEqual([...second.run('map.layers[2].layers[0].data')], [0, 0, 3, 0, 0, 0]);
    second.run('editorUndo()');
    assert.deepEqual([...second.run('[map.width, map.height]')], [4, 3], 'Reset to file is one undo');
});

// moving a selection: a left press inside it drags its tiles, the objects in it too with All Layers

// two tiles on the front layer at (0, 0) and (0, 1), selected, the far column has tile 2 at (2, 1)
const moveCode = editCode + `editorPaint(front, vec2(0, 0), 5); editorPaint(front, vec2(0, 1), 6); editorStrokeEnd();
    editorSelection = editorArea(vec2(0, 0), vec2(0, 1));`;

// a left press at a cell, then a move through each cell after it, a step each
function leftDrag(engine, from, ...cells)
{
    engine.handlers.mousedown(at(...from));
    step(engine);
    for (const cell of cells)
    {
        engine.handlers.mousemove(at(...cell));
        step(engine);
    }
}
function leftUp(engine)
{
    engine.handlers.mouseup(at(0, 0));
    step(engine);
}

test('a left drag from inside the selection moves its tiles, leaving their cells empty, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode);
    const undos = engine.run('editorUndoList.length');
    leftDrag(engine, [0, 0], [1, 0], [2, 0]);
    leftUp(engine);
    assert.deepEqual([...engine.run('frontData')], [0, 0, 6, 0, 0, 5]);
    assert.deepEqual([...selection(engine)], [2, 0, 2, 1], 'the selection went with them');
    assert.deepEqual([...engine.run('[layers[2].getData(vec2(2, 0)).tile, layers[2].getData(vec2(0, 0)).tile]')],
        [4, undefined]);
    assert.equal(engine.run('editorUndoList.length'), undos + 1);
    engine.run('editorUndo()');
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0]);
});

test('a selection dragged back to where it was changes nothing', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode);
    const undos = engine.run('editorUndoList.length');
    leftDrag(engine, [0, 0], [2, 0], [0, 0]);
    leftUp(engine);
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0]);
    assert.equal(engine.run('editorUndoList.length'), undos);
});

test('a right click during the drag puts the selection back, with nothing to undo and no tile picked', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode);
    const undos = engine.run('editorUndoList.length');
    leftDrag(engine, [0, 0], [2, 0]);
    rightClick(engine, 2, 0);
    leftUp(engine);
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0]);
    assert.deepEqual([...selection(engine)], [0, 0, 0, 1]);
    assert.equal(engine.run('editorUndoList.length'), undos);
    assert.equal(engine.run('editorBrushTile().tile'), 6, 'the brush it had');
});

test('Escape during the drag puts the selection back and stays in the editor', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode);
    leftDrag(engine, [0, 0], [2, 0]);
    press(engine, 'Escape');
    assert.equal(engine.run('levelEditor.isOpen'), true);
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0]);
    leftUp(engine);
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0], 'letting go after did not paint');
    press(engine, 'Escape');
    assert.equal(engine.run('levelEditor.isOpen'), false, 'the next Escape plays');
});

test('the debug key during a drag leaves nothing to undo, and a game with its own debug key cancels with it', async () =>
{
    for (const key of ['Escape', 'Backquote'])
    {
        const engine = await loadGame();
        engine.run(moveCode + `setDebugKey('${key}');`);
        const undos = engine.run('editorUndoList.length');
        leftDrag(engine, [0, 0], [2, 0]);
        press(engine, key);
        assert.equal(engine.run('levelEditor.isOpen'), true, key);
        assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0], key);
        assert.equal(engine.run('editorUndoList.length'), undos, key + ' made no undo');
        leftUp(engine);
    }
});

test('with All Layers the objects in the selection move with it', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode + 'editorAllLayers = true;');
    leftDrag(engine, [0, 0], [2, 0]);
    leftUp(engine);
    assert.deepEqual([...engine.run('[map.layers[1].objects[0].x, map.layers[1].objects[0].y]')], [40, 8]);
    engine.run('editorUndo()');
    assert.equal(engine.run('map.layers[1].objects[0].x'), 8);
});

// review fixes: resizing

test('a map with autosaved edits waiting to be applied can not be resized, the edits are kept', async () =>
{
    const storage = makeStorage();
    paintAndSave(await reload(storage));
    const before = saved(storage);
    const engine = await reload(storage, [0, 0, 4, 0, 0, 0]); // the file changed under the autosave
    engine.run(restartCode);
    assert.equal(engine.run('!!front.record.pending'), true);
    assert.equal(engine.run('editorResize(front.record, 4, 3)'), false);
    assert.deepEqual(saved(storage), before);
});

test('Reset to file after a resize empties an Objects layer the editor made', async () =>
{
    const { run } = await loadGame();
    run(mapCode + restartCode + `editorNewObjectGroup(map).objects = [{ id: 5, x: 8, y: 8, type: 'Coin' }];
        editorResize(front.record, 4, 3); editorRevert(front.record);`);
    assert.deepEqual([...run('editorObjectGroups(map.layers).map((group)=> group.objects.length)')], [1, 0]);
});

test('a resize that keeps the same tile data, a blank level turned on its side, is autosaved', async () =>
{
    const storage = makeStorage();
    const blank = (code)=> code.replace('data: [1, 0, 0, 0, 0, 2]', 'data: [0, 0, 0, 0, 0, 0]')
        .replace(`objects: [{ id: 1, x: 8, y: 8, type: 'Coin' }]`, 'objects: []');
    const first = await loadGame({ localStorage: storage });
    first.run(blank(fileCode([0, 0, 0, 0, 0, 0])) + restartCode + 'editorResize(front.record, 2, 3)');
    const second = await loadGame({ localStorage: storage });
    second.run(blank(fileCode([0, 0, 0, 0, 0, 0])));
    assert.deepEqual([...second.run('[map.width, map.height]')], [2, 3]);
});

test('Reset to file on a layer made in code does nothing, it has no file', async () =>
{
    const { run } = await loadGame();
    run(`const live = new TileLayer(vec2(), vec2(2, 1), undefined);
        editorRevert(editorLayerRecord(live).record);`);
});

// the minor fixes: resize edges, keys during a drag

test('a resize keeps objects that were already outside the map, and a map with no tile size keeps its objects\' places',
    async () =>
{
    const { run } = await loadGame();
    run(mapCode.replace('tilewidth: 16, tileheight: 16, ', '')
        .replace(`objects: [{ id: 1, x: 8, y: 8, type: 'Coin' }]`,
            `objects: [{ id: 1, x: 1.5, y: .5, type: 'Coin' }, { id: 2, x: 1, y: -4, type: 'Coin' }]`) + restartCode +
        'var before = editorObjectPos(front.record, map.layers[1].objects[0]); editorResize(front.record, 4, 3);');
    assert.equal(run('map.layers[1].objects.length'), 2, 'the one above the top stays');
    assert.deepEqual([...run('[before.x, before.y]')],
        [...run('const after = editorObjectPos(front.record, map.layers[1].objects[0]); [after.x, after.y]')]);
});

test('a key pressed while dragging a selection ends the drag, so Delete clears the tiles where they are', async () =>
{
    const engine = await loadGame();
    engine.run(moveCode);
    leftDrag(engine, [0, 0], [1, 0]);
    typed(engine, 'Delete');
    engine.handlers.mousemove(at(2, 0));
    step(engine);
    leftUp(engine);
    assert.deepEqual([...engine.run('frontData')], [0, 0, 3, 0, 0, 0]);
    engine.run('editorUndo(); editorUndo();');
    assert.deepEqual([...engine.run('frontData')], [6, 0, 3, 5, 0, 0], 'the move and the clear, an undo each');
});

// review 2026-09-26: autosaved edits that no longer fit the file are kept, never lost

// the test file as it might change: a column wider, its layers the other way round, a layer renamed, or its object
// layer gone
const widerCode = ()=> fileCode([0, 0, 3, 0, 0, 0, 0, 0]).replace(/width: 3, height: 2/g, 'width: 4, height: 2')
    .replace('[1, 0, 0, 0, 0, 2]', '[1, 0, 0, 0, 0, 0, 0, 2]');
const turnedCode = ()=> fileCode().replace(/width: 3, height: 2/g, 'width: 2, height: 3');
const renamedCode = ()=> fileCode().replace(`name: 'back'`, `name: 'sky'`);
const noObjectsCode = ()=> fileCode()
    .replace(`{ type: 'objectgroup', name: 'things', objects: [{ id: 1, x: 8, y: 8, type: 'Coin' }] },`, '')
    .replace('editorLayerRecord(layers[2])', 'editorLayerRecord(layers[1])').replace('map.layers[2].layers', 'map.layers[1].layers');

test('edits that do not fit the file any more are not applied, and stay waiting with their autosave', async () =>
{
    for (const changed of [widerCode, noObjectsCode])
    {
        const storage = makeStorage();
        paintAndSave(await reload(storage));
        const before = saved(storage);
        const engine = await loadGame({ localStorage: storage });
        engine.run(changed());
        assert.equal(engine.run('!!front.record.pending'), true);
        assert.equal(engine.run('editorApplyPending(front.record)'), false);
        assert.deepEqual([...engine.run('[!!front.record.pending, editorUndoList.length]')], [true, 0]);
        assert.deepEqual(saved(storage), before, 'the only copy of the edits is kept');
    }
});

test('a file whose layers changed shape or name, the same tiles in it, waits instead of taking the edits', async () =>
{
    for (const changed of [turnedCode, renamedCode])
    {
        const storage = makeStorage();
        paintAndSave(await reload(storage));
        const engine = await loadGame({ localStorage: storage });
        engine.run(changed());
        assert.equal(engine.run('!!front.record.pending'), true);
        assert.deepEqual([...engine.run('map.layers[0].data')], [1, 0, 0, 0, 0, 2], 'the file as it is');
    }
});

test('a paint drag over the panel paints nothing behind it, and starts again where it comes back', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    leftDrag(engine, [0, 0]);
    engine.run('editorMouseOnPanel = true'); // as the panel's mouseenter sets it
    for (const cell of [[1, 1], [2, 1]])
    {
        engine.handlers.mousemove(at(...cell));
        step(engine);
    }
    engine.run('editorMouseOnPanel = false');
    engine.handlers.mousemove(at(2, 0));
    step(engine);
    leftUp(engine);
    const tile = (x, y)=> engine.run(`layers[2].getData(vec2(${x}, ${y})).tile`);
    assert.deepEqual([tile(0, 0), tile(1, 0), tile(1, 1), tile(2, 0)], [6, undefined, undefined, 6]);
    assert.equal(tile(2, 1), 2, 'the tile it had');
});

test('a selection drag over the panel stops at its edge and ends where it was on the level', async () =>
{
    const engine = await loadGame();
    engine.handlers.mousemove(at(0, 0));
    engine.run(editCode);
    engine.handlers.mousedown({ ...at(0, 0), button: 2 });
    step(engine);
    engine.handlers.mousemove({ ...at(1, 1), button: 2 });
    step(engine);
    engine.run('editorMouseOnPanel = true');
    engine.handlers.mousemove({ ...at(2, 1), button: 2 });
    step(engine);
    engine.handlers.mouseup({ ...at(2, 1), button: 2 });
    step(engine);
    assert.deepEqual([...selection(engine)], [0, 0, 1, 1]);
});

// review 2026-09-26 F4: a file Save wrote is the file from then on

// a game loaded from the file with the picker and storage it shares with others
async function pickerGame(picker, storage, front)
{
    const engine = await loadGame({ localStorage: storage, showSaveFilePicker: picker.showSaveFilePicker });
    engine.run(fileCode(front));
    return engine;
}
const writtenFront = (picker)=> JSON.parse(picker.written.at(-1)).layers[2].layers[0].data;

test('after Save, edits made since come back on a reload of the saved file, with nothing to apply', async () =>
{
    const picker = filePicker(), storage = makeStorage();
    const first = await pickerGame(picker, storage);
    first.run('editorPaint(front, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd();');
    await first.run('editorSave(front.record)');
    first.run('editorPaint(front, vec2(1, 1), editorTileToGid(5)); editorStrokeEnd();');
    const second = await pickerGame(picker, storage, writtenFront(picker));
    assert.equal(second.run('front.record.pending'), undefined);
    assert.deepEqual([...second.run('frontData')], [5, 6, 3, 0, 0, 0]);
});

test('after Save, Reset to file goes back to what was saved, and a save of the file as it is drops the autosave',
    async () =>
{
    const picker = filePicker(), storage = makeStorage();
    const engine = await pickerGame(picker, storage);
    engine.run('editorPaint(front, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd();');
    await engine.run('editorSave(front.record)');
    assert.equal(saved(storage), undefined, 'the file has every edit');
    engine.run('editorPaint(front, vec2(1, 1), editorTileToGid(5)); editorStrokeEnd(); editorRevert(front.record);');
    assert.deepEqual([...engine.run('frontData')], [5, 0, 3, 0, 0, 0]);
});

test('an edit made while Save is writing is kept as an edit the file does not have', async () =>
{
    const picker = filePicker(), storage = makeStorage();
    const engine = await pickerGame(picker, storage);
    await engine.run(`var saving = editorSave(front.record);
        editorPaint(front, vec2(1, 1), editorTileToGid(5)); editorStrokeEnd(); saving`);
    assert.deepEqual(writtenFront(picker), [0, 0, 3, 0, 0, 0]);
    assert.deepEqual(saved(storage).layers[1], [0, 6, 3, 0, 0, 0]);
});

test('a download does not change what the file is, the editor can not know it replaced the file', async () =>
{
    const storage = makeStorage();
    const engine = await loadGame({ localStorage: storage });
    engine.run(fileCode() + 'editorPaint(front, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd(); saveText = ()=> {};');
    assert.equal(await engine.run('editorSave(front.record)'), 'downloaded');
    assert.deepEqual(saved(storage).layers[1], [5, 0, 3, 0, 0, 0]);
});
