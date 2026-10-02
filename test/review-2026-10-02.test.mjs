import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import * as LJS from '../dist/littlejs.esm.js';

// Fixes from the code review of 2026-10-02: a UI click on a press and release in one frame, polygon side counts
// that are not whole numbers, a sound made
// with sound off, and the level editors keeping what an autosave or a game's tool does not know about.

async function loadGame(plugin3D=false)
{
    const engine = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { ${plugin3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));
const step = (run)=> run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);

test('a UI button pressed and let go inside one frame is clicked once', async ()=>
{
    const { run } = await loadGame();
    run(`new UISystemPlugin; var clicks = 0, releases = 0;
        var button = new UIButton(vec2(500), vec2(200), 'Buy');
        button.onClick = ()=> ++clicks; button.onRelease = ()=> ++releases;
        engineStep(); mouseInWindow = true; mousePosScreen = button.nativePos.copy(); inputData[0][0] = 6; // pressed and released, and no longer down`);
    for (let i = 3; i--;) step(run);
    assert.deepEqual(json(run, '[clicks, releases]'), [1, 1]);
    // the usual click, down for a frame and then up, is one click too
    run('clicks = releases = 0; inputData[0][0] = 3;'); step(run);
    run('inputData[0][0] = 4;'); step(run); step(run);
    assert.deepEqual(json(run, '[clicks, releases]'), [1, 1]);
});

test('a polygon with a side count that is not a whole number, or below zero, draws and returns', ()=>
{
    const { drawRegularPoly, drawEllipse, setGLCircleSides, glCircleSides, vec2 } = LJS;
    for (const sides of [2.5, -3, 0])
        drawRegularPoly(vec2(), vec2(1), sides);
    setGLCircleSides(7.5);
    drawEllipse(vec2(), vec2(1));
    setGLCircleSides(glCircleSides > 2.5 ? 32 : 32);
});

test('a sound made while sound is off says it is loaded, so a game waiting on its sounds goes on', ()=>
{
    const { Sound } = LJS; // the suite runs headless, where no sound is made
    let called = 0;
    const sound = new Sound([1, 0, 220], undefined, undefined, undefined, ()=> ++called);
    assert.deepEqual([sound.isLoaded(), called], [true, 1]);
});

test('a timer set to no time, or to a time below zero, is all the way through', ()=>
{
    const { Timer } = LJS;
    assert.deepEqual([new Timer(0).getPercent(), new Timer(-1).getPercent(), new Timer().getPercent()], [1, 1, 0]);
});

test('2D editor: applying a waiting autosave leaves an object layer it does not know about as the file has it', async ()=>
{
    const { run } = await loadGame();
    run(`var map = { width: 2, height: 1, tilewidth: 16, tileheight: 16, layers: [
            { type: 'tilelayer', id: 1, name: 'ground', width: 2, height: 1, data: [1, 0] },
            { type: 'objectgroup', id: 2, name: 'old', objects: [{ id: 1, type: 'Coin', x: 8, y: 8 }] },
            { type: 'objectgroup', id: 3, name: 'new', objects: [{ id: 2, type: 'Coin', x: 24, y: 8 }] }] };
        objectLayersAddType('Coin', class extends EngineObject {});
        var layers = tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map);
        var record = editorLayerRecord(layers[0]).record;
        // an autosave from before the file had its second object layer: one layer of tiles, one of objects
        editorPaintData(record, [[0, 1]], [[{ id: 1, type: 'Coin', x: 24, y: 8 }]], 2, 1, true);`);
    assert.deepEqual(json(run, '[map.layers[0].data, map.layers[1].objects[0].x, map.layers[2].objects.length]'),
        [[0, 1], 24, 1]);
    // Reset to file still clears a layer the file did not have
    run('editorPaintData(record, [[1, 0]], [[{ id: 1, type: "Coin", x: 8, y: 8 }]], 2, 1);');
    assert.equal(json(run, 'map.layers[2].objects.length'), 0);
});

test('3D editor: objects a game\'s tool adds with no ids are given ids of their own', async ()=>
{
    const { run } = await loadGame(true);
    run(`var level = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}; level3DLoad(level); levelEditor.open();
        levelEditor.edit3D.change((list)=> { list.push({type: 'Box', pos: [2, .5, 0]}, {type: 'Sphere', pos: [4, .5, 0]}); });
        levelEditor.edit3D.strokeEnd();`);
    assert.deepEqual(json(run, 'level.objects.map((o)=> o.id)'), [1, 2, 3]);
    assert.deepEqual(json(run, '[2, 3].map((id)=> !!editor3DInstances.get(id) && !editor3DInstances.get(id).destroyed)'),
        [true, true]);
    assert.equal(run('levelEditor.edit3D.change(()=> {})'), false, 'nothing changed is still nothing changed');
});

test('a release build\'s level editor has the lists a game\'s own editor may read', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.deepEqual(json(run, '[levelEditor.keys, levelEditor.buttons, levelEditor.tools]'), [{}, [], {}]);
});

// a small Tiled map from a file, and what console.warn said while code ran
const fileMap = (url)=> `var map = { width: 2, height: 1, tilewidth: 16, tileheight: 16, layers: [
        { type: 'tilelayer', id: 1, name: 'ground', width: 2, height: 1, data: [1, 0] }] };
    editorJSONFetched('${url}', map); var layers = tileLayersLoad(map, undefined, 0, 0);
    var ground = editorLayerRecord(layers[0]);`;
const warned = (run, code)=> json(run, `(()=> { const warn = console.warn, said = []; console.warn = (...text)=> said.push(text.join(' '));
    try { ${code} } finally { console.warn = warn; } return said; })()`);

test('2D editor: the undo list keeps the last 100 edits, as the 3D editor\'s does', async ()=>
{
    const { run } = await loadGame();
    run(fileMap('levels/a.json') + `for (let i = 0; i < 130; ++i)
        { editorPaint(ground, vec2(0, 0), 1 + i % 2 + 1); editorStrokeEnd(); }`);
    assert.equal(run('editorUndoList.length'), 100);
});

test('a level\'s file name is read as it is written on disk, not as its url spells it, in both editors', async ()=>
{
    const { run } = await loadGame(true);
    run(fileMap('levels/my%20level.json') + `var level = {objects: []};
        editorJSONFetched('levels/my%203d%20level.json?v=2', level); level3DLoad(level);`);
    assert.deepEqual([run('ground.record.fileName'), run('editor3DRecords.get(level).fileName')],
        ['my level.json', 'my 3d level.json']);
});

test('2D editor: an autosave that storage would not take is marked, and a reload that brings back the older one says so', async ()=>
{
    // a storage that takes the first autosave and is full for a larger one after it
    const items = {};
    let full = false;
    const storage = { getItem: (k)=> items[k] ?? null,
        setItem(k, v) { if (full && v.length > (items[k] ?? '').length + 20) throw new Error('quota'); items[k] = String(v); } };
    const load = async ()=>
    {
        const engine = loadEngine({ localStorage: storage, location: { pathname: '/game/' } });
        engine.run('setHeadlessMode(true)');
        await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
        return engine;
    };
    let { run } = await load();
    const big = `var map = { width: 40, height: 1, tilewidth: 16, tileheight: 16, layers: [
            { type: 'tilelayer', id: 1, name: 'ground', width: 40, height: 1, data: Array(40).fill(1) }] };
        editorJSONFetched('levels/a.json', map); var layers = tileLayersLoad(map, undefined, 0, 0);
        var ground = editorLayerRecord(layers[0]);`;
    run(big + 'editorPaint(ground, vec2(0, 0), 2); editorStrokeEnd();');
    full = true;
    run('for (let x = 1; x < 40; ++x) editorPaint(ground, vec2(x, 0), 123456); editorStrokeEnd();');
    assert.equal(run('editorSaveFailed'), true);
    const kept = JSON.parse(items['LittleJS editor /game/'])['levels/a.json'];
    assert.deepEqual([kept.stale, kept.layers[0][0], kept.layers[0][1]], [true, 2, 1], 'the older autosave, marked');
    ({ run } = await load());
    const said = warned(run, big);
    assert.ok(said.some((text)=> text.includes('older')), said.join(' | '));
});

test('an object with no type in a map, a shape or a text, is passed by with no warning', async ()=>
{
    const { run } = await loadGame();
    const said = warned(run, `objectLayersLoad({ width: 1, height: 1, layers: [{ type: 'objectgroup', name: 'o', objects: [
        { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 0, type: 'Missing' }] }] });`);
    assert.equal(said.length, 1);
    assert.ok(said[0].includes('Missing'));
});

test('a tween callback that throws leaves the tween system ready for the next update', async ()=>
{
    const { run } = await loadGame();
    run(`var calls = 0; var n = 0; new Tween(()=> { if (n++) throw new Error('mine'); }, 0, 1, 1); new Tween(()=> ++calls, 0, 1, 1);`);
    assert.throws(()=> run('tweenUpdate(.1, .1)'), /mine/);
    assert.equal(run('tweenUpdateList.length'), 0, 'the list being walked is let go');
    run('tweenStopAll(); new Tween(()=> ++calls, 0, 1, 1); calls = 0; tweenUpdate(.1, .1);');
    assert.equal(run('calls'), 1);
});

test('the points of a transformed polygon are written into vectors kept for the purpose, not made for each draw', async ()=>
{
    const { run } = await loadGame();
    run(`var seen = [], made = new Set; glDrawPoints = (points)=>
        { seen.push(points.map((p)=> [p.x, p.y])); for (const p of points) made.add(p); };
        var triangle = [vec2(0, 1), vec2(1, 0), vec2(-1, 0)];
        glDrawPointsTransform(triangle, 0, 10, 20, 2, 2, 0, false);
        glDrawPointsTransform(triangle, 0, 0, 0, 1, 1, 0, false);
        for (let i = 0; i < 50; ++i) glDrawPointsTransform(triangle, 0, i, 0, 1, 1, 0, false);`);
    assert.deepEqual(json(run, 'seen.slice(0, 2)'), [[[10, 22], [12, 20], [8, 20]], [[0, 1], [1, 0], [-1, 0]]]);
    assert.equal(run('made.size'), 3, 'the same three vectors each time');
});
