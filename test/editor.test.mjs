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

test('0 on the overlay opens the editor and pauses the game, 0 again gives back the pause and camera', async () =>
{
    const engine = await loadGame();
    const { run } = engine;
    run('setCameraPos(vec2(5, 6)); setCameraScale(40); setDebugOverlay(true)');
    press(engine, 'Digit0');
    assert.equal(run('editMode'), true);
    assert.equal(run('paused'), true);
    assert.equal(run('debugOverlay'), false, 'the overlay closes so the level can be seen');
    run('editorCameraPos = vec2(1, 1); editorCameraScale = 10; engineStep()');
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [1, 1, 10], 'the editor has its own view');
    press(engine, 'Digit0'); // the overlay is closed, the editor takes the key itself
    assert.equal(run('editMode'), false);
    assert.equal(run('paused'), false);
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [5, 6, 40]);
});

test('a game paused before the editor opened stays paused after it closes', async () =>
{
    const { run } = await loadGame();
    run('setPaused(true); setEditMode(true); setEditMode(false)');
    assert.equal(run('paused'), true);
});

test('with debugKeysAlways, 0 toggles the editor once, not open and closed in the same step', async () =>
{
    const engine = await loadGame();
    engine.run('setDebugKeysAlways(true)');
    press(engine, 'Digit0');
    assert.equal(engine.run('editMode'), true);
    press(engine, 'Digit0');
    assert.equal(engine.run('editMode'), false);
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
    run(`setEditMode(true); let speed = 1; tweak('speed'); tweakButton('a', ()=> {}); tweakDivider();
        tweakEngineDefaults();`);
    assert.equal(run('editMode'), false);
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
        setEditorTileCallback((layer, pos, tile)=> { calls.push([layer === layers[2], pos.x, pos.y, tile]);
            layer.setCollisionData(pos, -1); });
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
