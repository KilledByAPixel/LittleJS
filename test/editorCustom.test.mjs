import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// EDITOR.md tells a game how to make the level editors its own. The code blocks it marks as tested are run here
// straight from the file, in the script build as a game would run them, so what the page says works.

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

test('the page marks its tested blocks, and each is here', ()=>
{
    assert.deepEqual(Object.keys(blocks).sort(), ['key2d', 'key3d', 'panel3d', 'type2d', 'type3d']);
});

test('3D: a type of the game\'s own is made from a level with its properties over its defaults', async ()=>
{
    const { run } = await loadGame(true);
    run('var playerStart;' + blocks.type3d + `
        var made = level3DLoad({objects: [{id: 1, type: 'Spawner', pos: [1, 2, 3], properties: {rate: 5}},
            {id: 2, type: 'PlayerStart', pos: [4, 0, 0]}]});`);
    assert.deepEqual(json(run, '[made[0].rate, made[0].enemy, made[0].active, playerStart.x]'), [5, 'bat', true, 4]);
});

test('3D: a key of the game\'s own edits the selection as one undo, and is in the help', async ()=>
{
    const { run } = await loadGame(true);
    run(`var level = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Box', pos: [3, .5, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();` + blocks.key3d);
    assert.equal(run('editor3DKeys.KeyK()'), false, 'nothing selected, nothing done');
    // the key itself, as the engine's input has it
    run(`editor3DSelection.add(2); inputData[0].KeyK = 3; engineStep();`);
    assert.deepEqual(json(run, '[level.objects[0].pos, level.objects[1].pos, editor3DUndoList.length]'),
        [[0, .5, 0], [3, 1.5, 0], 1]);
    assert.equal(run('editor3DInstances.get(2).pos3D.y'), 1.5, 'the game\'s object follows');
    assert.ok(run('editor3DHelpLines.at(-1)').startsWith('K:'));
    run('editor3DUndo()');
    assert.deepEqual(json(run, 'level.objects[1].pos'), [3, .5, 0]);
});

test('3D: a panel button of the game\'s own is added once, and what it places is one undo', async ()=>
{
    const { run } = await loadGame(true);
    // a stand-in for the panel and the page, the panel is not made headless
    run(blocks.type3d + blocks.panel3d + `
        var level = {objects: []}; level3DLoad(level); levelEditor.open();
        var added = [];
        editor3DPanel = {appendChild: (element)=> added.push(element)};
        document.createElement = ()=> ({});
        addEditorButton(); addEditorButton();`);
    assert.equal(run('added.length'), 1);
    run('added[0].onclick()');
    assert.deepEqual(json(run, '[level.objects.length, level.objects[0].type]'), [5, 'Spawner']);
    run('editor3DUndo()');
    assert.equal(run('level.objects.length'), 0, 'the five were one undo');
});

// a small Tiled map with a tile layer and an object layer
const mapCode = `
    var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
        layers: [
            { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] },
            { type: 'objectgroup', name: 'things', objects: [{ id: 1, x: 8, y: 8, type: 'Coin',
                properties: [{ name: 'value', type: 'int', value: 5 }] }, { id: 2, x: 24, y: 8, type: 'Coin' }] }] };`;

test('2D: a type of the game\'s own is made from a map\'s object layer with its properties', async ()=>
{
    const { run } = await loadGame(false);
    run(blocks.type2d + mapCode + 'var made = objectLayersLoad(map);');
    assert.deepEqual(json(run, 'made.map((o)=> o.value)'), [5, 1]);
});

test('2D: a key of the game\'s own paints as one undo, and is in the help', async ()=>
{
    const { run } = await loadGame(false);
    run(mapCode + `var layers = tileLayersLoad(map, undefined, 0, 2); levelEditor.open();` + blocks.key2d + `
        var typed = ()=> editorOnKeyDown({ key: 't', code: 'KeyT', repeat: false, ctrlKey: false, metaKey: false,
            shiftKey: false, altKey: false, target: undefined, preventDefault() {} });
        editorLayer = editorLayerRecord(layers[0]); editorHover = undefined;`);
    assert.equal(run('editorKeys.t()'), false, 'the mouse is over no cell');
    run('editorHover = vec2(1, 0); typed();');
    assert.equal(json(run, 'map.layers[0].data').filter((gid)=> gid === 6).length, 1, 'tile 5 is gid 6 in this map');
    assert.equal(run('editorUndoList.length'), 1);
    assert.ok(run('editorHelpLines.at(-1)').startsWith('T:'));
    run('editorUndo()');
    assert.deepEqual(json(run, 'map.layers[0].data'), [1, 0, 0, 0, 0, 2]);
});
