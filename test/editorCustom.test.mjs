import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';
import * as LJS from '../dist/littlejs.esm.js';

// EDITOR.md tells a game how to make the level editors its own. The code blocks it marks as tested are run here
// straight from the file, as a game would run them, so what the page says works; and what it says of the builds,
// that an ES module game has all of it and a release build takes it and does nothing, is checked too.

const text = readFileSync(new URL('../EDITOR.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const blocks = {};
for (const match of text.matchAll(/<!-- test:([a-z0-9]+) -->\n```javascript\n([^]*?)\n```/g))
    blocks[match[1]] = match[2] + '\n'; // a block may end in a comment, what is run after it starts a new line

async function loadGame(plugin3D)
{
    const engine = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { ${plugin3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));
const step = (run)=> run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);

// a 3D level of two boxes with the editor open, and a small Tiled map with the 2D editor open on its tile layer
const open3D = `
    var level = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Box', pos: [3, .5, 0]}]};
    level3DLoad(level); engineStep(2); levelEditor.open();`;
const open2D = `
    var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
        layers: [
            { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] },
            { type: 'objectgroup', name: 'things', objects: [{ id: 1, x: 8, y: 8, type: 'Coin',
                properties: [{ name: 'value', type: 'int', value: 5 }] }, { id: 2, x: 24, y: 8, type: 'Coin' }] }] };
    var layers = tileLayersLoad(map, undefined, 0, 2); var made = objectLayersLoad(map);
    levelEditor.open(); editorLayer = editorLayerRecord(layers[0]); editorObjectLayer = undefined;
    var typed = (key)=> editorOnKeyDown({ key, code: '', repeat: false, ctrlKey: false, metaKey: false,
        shiftKey: false, altKey: false, target: undefined, preventDefault() {} });`;
const mouse2D = (x, y)=> `mousePosScreen = worldToScreen(vec2(${x} + .5, ${y} + .5)); editorMouseOnPanel = false;`;
const mouse3D = (x, z)=> `editor3DCamera.pos = vec3(${x}, 20, ${z}); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
    mousePosScreen = mainCanvasSize.scale(.5); editor3DMouseOnPanel = false;`;

test('the page marks its tested blocks, and each is here', ()=>
{
    assert.deepEqual(Object.keys(blocks).sort(),
        ['button3d', 'class', 'key2d', 'key3d', 'tool2d', 'tool3d', 'type2d', 'type3d']);
});

test('3D: a type of the game\'s own is made from a level with its properties over its defaults', async ()=>
{
    const { run } = await loadGame(true);
    run('var playerStart;' + blocks.type3d + `
        var made = level3DLoad({objects: [{id: 1, type: 'Spawner', pos: [1, 2, 3], properties: {rate: 5}},
            {id: 2, type: 'PlayerStart', pos: [4, 0, 0]}]});`);
    assert.deepEqual(json(run, '[made[0].rate, made[0].enemy, made[0].active, playerStart.x]'), [5, 'bat', true, 4]);
});

test('2D: a type of the game\'s own is made from a map\'s object layer with its properties', async ()=>
{
    const { run } = await loadGame(false);
    run(blocks.type2d + open2D);
    assert.deepEqual(json(run, 'made.map((o)=> o.value)'), [5, 1]);
});

test('3D: the key of the page lifts the selection as one undo, and is in the help', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + blocks.key3d + 'inputData[0].KeyK = 3;');
    step(run);
    assert.equal(run('editor3DUndoList.length'), 0, 'nothing selected, nothing done');
    run(`levelEditor.edit3D.selection.add(2); inputData[0].KeyK = 3;`);
    step(run);
    assert.deepEqual(json(run, '[level.objects[0].pos, level.objects[1].pos, editor3DUndoList.length]'),
        [[0, .5, 0], [3, 1.5, 0], 1]);
    assert.deepEqual(json(run, 'editorGameHelpLines()'), ['K: lift the selection one unit']);
});

test('2D: the key of the page paints under the mouse as one undo', async ()=>
{
    const { run } = await loadGame(false);
    run(blocks.type2d + open2D + blocks.key2d + `editorHover = undefined;`);
    assert.equal(run(`levelEditor.keys.t.action()`), false, 'the mouse is over no cell');
    run(`editorHover = vec2(1, 0); typed('t');`);
    assert.deepEqual(json(run, '[map.layers[0].data, editorUndoList.length]'), [[1, 0, 0, 0, 6, 2], 1]);
});

test('3D: the button of the page places five as one undo', async ()=>
{
    const { run } = await loadGame(true);
    run('var playerStart;' + blocks.type3d + open3D + blocks.button3d + 'levelEditor.buttons[0].onClick();');
    assert.deepEqual(json(run, '[level.objects.length, level.objects[2].type, editor3DUndoList.length]'), [7, 'Spawner', 1]);
});

test('3D: the tool of the page lays posts along a drag, one undo', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + blocks.tool3d + 'inputData[0].KeyP = 3;');
    step(run);
    assert.equal(run('levelEditor.tool'), 'Posts');
    run(mouse3D(10, 10) + 'inputData[0][0] = 3;'); step(run);
    run(mouse3D(11, 10) + 'inputData[0][0] = 1;'); step(run); // a unit along, not far enough for another
    run(mouse3D(13, 10)); step(run);
    run('inputData[0][0] = 4;'); step(run);
    const posts = json(run, 'level.objects.slice(2).map((o)=> [o.type, Math.round(o.pos[0]), o.pos[1]])');
    assert.deepEqual(posts, [['Cylinder', 10, .5], ['Cylinder', 13, .5]]);
    assert.equal(run('editor3DUndoList.length'), 1);
});

test('2D: the tool of the page paints where it is dragged, and Shift erases', async ()=>
{
    const { run } = await loadGame(false);
    run(blocks.type2d + open2D + blocks.tool2d + `typed('w');`);
    assert.equal(run('levelEditor.tool'), 'Water');
    run(mouse2D(1, 0) + 'inputData[0][0] = 3;'); step(run);
    run(mouse2D(2, 0) + 'inputData[0][0] = 1;'); step(run);
    run('inputData[0][0] = 4;'); step(run);
    assert.deepEqual(json(run, '[map.layers[0].data, editorUndoList.length]'), [[1, 0, 0, 0, 8, 8], 1], 'tile 7 is gid 8');
    run(mouse2D(1, 0) + 'inputData[0].ShiftLeft = 1; inputData[0][0] = 3;'); step(run);
    run('inputData[0][0] = 4;'); step(run);
    assert.equal(json(run, 'map.layers[0].data[4]'), 0);
});

test('3D: the editor class of the page is the level editor, its methods the hooks, its key and button its own', async ()=>
{
    const { run } = await loadGame(true);
    run('var playerStart, restarts = 0, drawnZones = 0;' + blocks.type3d + blocks.class + `
        var level = {objects: [{id: 1, type: 'Spawner', pos: [0, .5, 0]}, {id: 2, type: 'Box', pos: [3, .5, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();`);
    assert.deepEqual([run('levelEditor instanceof MyEditor'), run(`editorHas('onRestart')`)], [true, true]);
    run('editor3DDrawGame(); inputData[0].KeyZ = 3;');
    step(run);
    run('editor3DDrawGame(); levelEditor.buttons[0].onClick.call(levelEditor); editor3DRestart();');
    assert.deepEqual(json(run, '[drawnZones, levelEditor.showZones, level.objects.map((o)=> o.type), restarts]'),
        [1, false, ['Box'], 1]);
});

test('an ES module game has all of it: the class, the instance in use, and setLevelEditor', ()=>
{
    assert.equal(typeof LJS.LevelEditor, 'function');
    assert.ok(LJS.levelEditor instanceof LJS.LevelEditor);
    class Mine extends LJS.LevelEditor { onRestart() {} }
    const before = LJS.levelEditor;
    try
    {
        LJS.setLevelEditor(new Mine);
        assert.ok(LJS.levelEditor instanceof Mine, 'the export is the one in use');
        LJS.levelEditor.addKey('k', ()=> {}, 'K: mine');
        LJS.levelEditor.addTool('T', {});
        assert.deepEqual([Object.keys(LJS.levelEditor.keys), Object.keys(LJS.levelEditor.tools)], [['k'], ['T']]);
        assert.equal(typeof LJS.levelEditor.edit2D.paint, 'function');
    }
    finally { LJS.setLevelEditor(before); }
});

test('a release build takes a game\'s editor and everything added to it, and calls none of it', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run(`var called = 0;
        class Mine extends LevelEditor
        {
            constructor() { super(); this.addKey('k', ()=> ++called); this.addButton('B', ()=> ++called); }
            onOpen() { ++called; }
        }
        setLevelEditor(new Mine);
        levelEditor.addTool('T', { onPress() { ++called; } });
        levelEditor.onRestart = ()=> ++called;
        levelEditor.open();`);
    assert.deepEqual(json(run, '[levelEditor instanceof Mine, levelEditor.isOpen, levelEditor.is3D, called]'),
        [true, false, false, 0]);
    assert.equal(run('levelEditor.edit3D'), undefined);
});
