import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A game makes the level editors its own through levelEditor: keys, panel buttons and tools of its own, moments
// the editors call, and the edit functions, by setting them on levelEditor or by extending LevelEditor. The same
// calls work in the 2D editor and the 3D one.

async function loadGame(plugin3D=false)
{
    const engine = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { ${plugin3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

// what console.warn said while code ran
function warned(run, code)
{
    return json(run, `(()=> { const warn = console.warn, said = []; console.warn = (...text)=> said.push(text.join(' '));
        try { ${code} } finally { console.warn = warn; } return said; })()`);
}

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser
const step = (run)=> run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);

// a small Tiled map with a tile layer and an object layer, loaded, the 2D editor open on the tile layer
const mapCode = `
    var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
        layers: [
            { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] },
            { type: 'objectgroup', name: 'things', objects: [{ id: 1, x: 8, y: 8, type: 'Coin' }] }] };
    objectLayersAddType('Coin', class extends EngineObject {});
    var layers = tileLayersLoad(map, undefined, 0, 2); objectLayersLoad(map);
    var typed = (key, ctrl=false, shift=false)=> editorOnKeyDown({ key, code: '', repeat: false, ctrlKey: ctrl,
        metaKey: false, shiftKey: shift, altKey: false, target: undefined, preventDefault() {} });`;
const open2D = mapCode + `levelEditor.open(); editorLayer = editorLayerRecord(layers[0]); editorObjectLayer = undefined;`;

// the mouse over a cell of the 2D level, a unit a cell with the layer at the origin
const mouse2D = (x, y)=> `mousePosScreen = worldToScreen(vec2(${x} + .5, ${y} + .5)); editorMouseOnPanel = false;`;

test('the hooks a game sets are found, and the ones it leaves are not: no Restart button without onRestart', async ()=>
{
    const { run } = await loadGame();
    assert.deepEqual([run(`editorHas('onRestart')`), run(`editorHas('onPlayFrom')`), run(`editorHas('onTile')`)],
        [false, false, false]);
    run('var restarted = 0; levelEditor.onRestart = ()=> ++restarted;');
    assert.equal(run(`editorHas('onRestart')`), true);
    run(open2D + 'editorRestart();');
    assert.equal(run('restarted'), 1);
    run('levelEditor.onRestart = undefined');
    assert.equal(run(`editorHas('onRestart')`), false, 'taken away again');
});

test('a class of the game\'s own is the level editor: its methods are the hooks and the moments', async ()=>
{
    const { run } = await loadGame();
    run(`var log = [];
        class MyEditor extends LevelEditor
        {
            onRestart() { log.push('restart'); }
            onOpen() { log.push('open'); }
            onClose() { log.push('close'); }
            onUpdate() { log.push('update'); }
            onDraw() { log.push('draw'); }
        }
        setLevelEditor(new MyEditor);` + mapCode);
    assert.deepEqual([run('levelEditor instanceof MyEditor'), run(`editorHas('onRestart')`), run('levelEditor.is3D')],
        [true, true, false]);
    run('levelEditor.open()');
    step(run);
    run('editorRenderGame(); levelEditor.close();');
    assert.deepEqual(json(run, 'log'), ['open', 'update', 'draw', 'close']);
    run('log.length = 0; engineStep(); editorRenderGame();');
    assert.deepEqual(json(run, 'log'), [], 'nothing while the editor is closed');
});

test('2D: a key of the game\'s own runs its action, with Ctrl and with Shift, and its line is in the help', async ()=>
{
    const { run } = await loadGame();
    run(open2D + `var log = [];
        levelEditor.addKey('k', (shift)=> log.push('k' + shift), 'K: my key');
        levelEditor.addKey('ctrl+K', ()=> log.push('ctrl k'));
        levelEditor.addKey('F2', ()=> { log.push('f2'); return false; });
        typed('k'); typed('K', false, true); typed('k', true); typed('F2');`);
    assert.deepEqual(json(run, 'log'), ['kfalse', 'ktrue', 'ctrl k', 'f2']);
    assert.deepEqual(json(run, 'editorGameHelpLines()'), ['K: my key']);
});

test('a key the editor has is replaced by the game\'s, with a warning that says which', async ()=>
{
    const { run } = await loadGame();
    run(open2D + 'var mine = 0;');
    const said = warned(run, `levelEditor.addKey('f', ()=> ++mine); levelEditor.addKey('q', ()=> {});`);
    assert.equal(said.length, 1);
    assert.ok(said[0].includes('f'));
    run(`typed('f')`);
    assert.deepEqual([run('mine'), json(run, 'map.layers[0].data')], [1, [1, 0, 0, 0, 0, 2]], 'the fill did not run');
});

test('2D: edit2D paints by tile index and edits the objects, each a stroke the game ends', async ()=>
{
    const { run } = await loadGame();
    run(open2D + 'var edit = levelEditor.edit2D;');
    assert.deepEqual([run('edit.map === map'), run('edit.layer === layers[0]'), run('edit.hover')], [true, true, undefined]);
    assert.equal(run('edit.paint(vec2(1, 0), 5)'), true);
    assert.equal(run('edit.paint(vec2(9, 9), 5)'), false, 'off the layer');
    run('edit.strokeEnd()');
    assert.deepEqual(json(run, 'map.layers[0].data'), [1, 0, 0, 0, 6, 2], 'tile 5 is gid 6, the bottom row is last');
    run('edit.paint(vec2(1, 0), -1); edit.strokeEnd();');
    assert.equal(json(run, 'map.layers[0].data[4]'), 0, 'erased');
    assert.equal(run('editorUndoList.length'), 2);
    run('edit.undo()');
    assert.equal(json(run, 'map.layers[0].data[4]'), 6);
    assert.equal(JSON.parse(run('edit.toJSON()')).layers[0].data[4], 6);
    // the object layer
    run('editorSelectLayer(editorLayers().find((layer)=> layer.isObjects));');
    assert.deepEqual([run('edit.layer'), json(run, 'edit.objects.map((o)=> o.type)')], [undefined, ['Coin']]);
    assert.equal(run('edit.paint(vec2(1, 0), 5)'), false, 'no tile layer selected');
    assert.equal(run(`edit.changeObjects((list)=> { list[0].x = 24; })`), true);
    run('edit.strokeEnd()');
    assert.equal(json(run, 'map.layers[1].objects[0].x'), 24);
});

test('2D: a tool of the game\'s own has the left button: press, drag and release are one undo', async ()=>
{
    const { run } = await loadGame();
    run(open2D + `var log = [];
        levelEditor.addTool('Dots', { key: 'p', hint: 'Dots: click to paint tile 5',
            onPress(at) { log.push('press ' + at.cell.x); levelEditor.edit2D.paint(at.cell, 5); },
            onDrag(at) { at.cell && levelEditor.edit2D.paint(at.cell, 5); },
            onRelease(at) { log.push('release'); },
            onDraw(at) { log.push('draw'); } });
        typed('p');`);
    assert.equal(run('levelEditor.tool'), 'Dots');
    assert.equal(run('editorHint()'), 'Dots: click to paint tile 5');
    run(mouse2D(1, 0) + 'inputData[0][0] = 3;');
    step(run);
    run(mouse2D(2, 0) + 'inputData[0][0] = 1;');
    step(run);
    run('inputData[0][0] = 4;');
    step(run);
    assert.deepEqual(json(run, 'log'), ['press 1', 'release']);
    assert.deepEqual(json(run, 'map.layers[0].data'), [1, 0, 0, 0, 6, 6], 'the cells of the press and of the drag');
    assert.equal(run('editorUndoList.length'), 1, 'one undo for the whole drag');
    run('log.length = 0; editorRenderGame();');
    assert.deepEqual(json(run, 'log'), ['draw']);
    run(`typed('p')`);
    assert.equal(run('levelEditor.tool'), undefined, 'its key puts it down again');
});

test('2D: a tool\'s drag is taken back by the right button, and picking a layer puts the tool down', async ()=>
{
    const { run } = await loadGame();
    run(open2D + `levelEditor.addTool('Dots', { onPress(at) { levelEditor.edit2D.paint(at.cell, 5); } });
        levelEditor.tool = 'Dots';` + mouse2D(1, 0) + 'inputData[0][0] = 3;');
    step(run);
    assert.equal(json(run, 'map.layers[0].data[4]'), 6);
    run('inputData[0][2] = 3;');
    step(run);
    assert.deepEqual([json(run, 'map.layers[0].data[4]'), run('editorUndoList.length')], [0, 0]);
    run('inputData[0][0] = 0; inputData[0][2] = 0; editorSelectLayer(editorLayers().find((layer)=> layer.isObjects));');
    step(run);
    assert.equal(run('levelEditor.tool'), undefined);
});

test('2D: onSave is given what Save would write, and keeps it from being written when it returns true', async ()=>
{
    const { run } = await loadGame();
    run(open2D + `var files = [], kept = []; saveText = (text, name)=> files.push(name);
        levelEditor.onSave = (text, name)=> { kept.push([JSON.parse(text).width, name]); return true; };`);
    assert.equal(await run('editorSave(editorRecord())'), 'kept');
    assert.deepEqual([json(run, 'kept'), json(run, 'files')], [[[3, 'level.json']], []]);
    run('levelEditor.onSave = ()=> false');
    await run('editorSave(editorRecord())');
    assert.equal(run('files.length'), 1, 'written as usual');
});

// a stand-in for the page: elements that keep their children and what was set on them
const pageCode = `
    var element = (tag)=> ({ tag, children: [], style: {}, textContent: '',
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...list) { this.children = list; } });
    document.createElement = element;`;

test('the game\'s box of the panel has its buttons and its tools, made once, and onPanel is given it', async ()=>
{
    const { run } = await loadGame();
    run(pageCode + open2D + `var clicks = 0, given;
        levelEditor.addButton('Clear', ()=> ++clicks, 'Clear the level');
        levelEditor.addTool('Dots', {});
        levelEditor.onPanel = (box)=> given = box;
        var box = element('div'); editorGamePanel(box); editorGamePanel(box);
        var buttons = box.children[0].children;`);
    assert.deepEqual(json(run, 'buttons.map((b)=> b.textContent)'), ['Dots', 'Clear']);
    assert.equal(run('given === box'), true);
    run('buttons[1].onclick(); buttons[0].onclick();');
    assert.deepEqual([run('clicks'), run('levelEditor.tool')], [1, 'Dots']);
    run(`levelEditor.addButton('More', ()=> {}); editorGamePanel(box);`);
    assert.equal(run('box.children[0].children.length'), 3, 'one added later is added');
});

// a 3D level of two boxes, loaded, the 3D editor open
const open3D = `
    var level = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Box', pos: [3, .5, 0]}]};
    level3DLoad(level); engineStep(2); levelEditor.open();`;

test('3D: the editor in use is the 3D one, and the moments are called there too', async ()=>
{
    const { run } = await loadGame(true);
    run(`var log = [];
        class MyEditor extends LevelEditor
        {
            onOpen() { log.push('open'); }
            onClose() { log.push('close'); }
            onUpdate() { log.push('update'); }
            onDraw() { log.push('draw'); }
        }
        setLevelEditor(new MyEditor);` + open3D);
    assert.deepEqual([run('levelEditor.is3D'), run('levelEditor.isOpen'), run('editor3DIsOpen')], [true, true, true]);
    step(run);
    run('editor3DDrawGame(); levelEditor.close();');
    assert.deepEqual(json(run, 'log'), ['open', 'update', 'draw', 'close']);
    assert.equal(run('levelEditor.isOpen'), false);
});

test('3D: a key of the game\'s own, by its letter, with Ctrl, and in place of one of the editor\'s', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `var log = [];
        levelEditor.addKey('k', (shift)=> log.push('k' + shift), 'K: my key');
        levelEditor.addKey('ctrl+k', ()=> log.push('ctrl k'));
        levelEditor.addKey('7', ()=> log.push('seven'));`);
    const said = warned(run, `levelEditor.addKey('g', ()=> log.push('g'));`);
    assert.equal(said.length, 1, 'G is the editor\'s grid snap');
    run('inputData[0].KeyK = 3;'); step(run);
    run('inputData[0].KeyK = 3; inputData[0].ControlLeft = 1;'); step(run);
    run('inputData[0].ControlLeft = 0; inputData[0].Digit7 = 3; inputData[0].KeyG = 3; var grid = editor3DGrid;'); step(run);
    assert.deepEqual(json(run, 'log'), ['kfalse', 'ctrl k', 'seven', 'g']);
    assert.equal(run('editor3DGrid === grid'), true, 'the editor\'s own G did not run');
});

test('3D: edit3D reads the level and edits it, each a stroke the game ends', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + 'var edit = levelEditor.edit3D;');
    assert.deepEqual([run('edit.level === level'), run('edit.objects.length'), run('edit.made(2) instanceof EngineObject3D')],
        [true, 2, true]);
    run(`edit.selection.add(2);
        edit.change((list)=>
        {
            const box = list.find((o)=> o.id === 2);
            edit.setTransform(box, edit.pos(box).add(vec3(0, 1, 0)), vec3(0, 90, 0));
            edit.setProperty(box, 'color', hsl(0, 1, .5));
            edit.setProperty(box, 'solid', true); // the default, left out
        });
        edit.strokeEnd();`);
    assert.deepEqual(json(run, 'level.objects[1]'), {id: 2, type: 'Box', pos: [3, 1.5, 0], rotation: [0, 90, 0],
        properties: {color: '#ff0000'}});
    assert.deepEqual(json(run, '[edit.selected().length, edit.rotation(level.objects[1]).y, edit.scale(level.objects[1]).x]'),
        [1, 90, 1]);
    const id = run(`edit.place('Sphere', vec3(0, 5, 0))`);
    run('edit.strokeEnd()');
    assert.deepEqual([id, run('level.objects.length'), run('editor3DUndoList.length')], [3, 3, 2]);
    run('edit.undo()');
    assert.equal(run('level.objects.length'), 2);
    assert.equal(JSON.parse(run('edit.toJSON()')).objects.length, 2);
    run(`edit.changePart('scene', ()=> ({shadows: true})); edit.strokeEnd();`);
    assert.deepEqual(json(run, 'level.scene'), {shadows: true});
});

// the mouse on the ground at a place: the editor's view looks straight down from above it
const mouse3D = (x, z)=> `editor3DCamera.pos = vec3(${x}, 20, ${z}); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
    mousePosScreen = mainCanvasSize.scale(.5); editor3DMouseOnPanel = false;`;

test('3D: a tool of the game\'s own has the left button, its drag is one undo, and the handles are put away', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `var log = [];
        levelEditor.addTool('Posts', { key: 'p', hint: 'Posts: click the ground',
            onPress(at) { log.push('press'); levelEditor.edit3D.place('Cylinder', at.pos); },
            onDrag(at) { log.push('drag'); },
            onRelease(at) { log.push('release ' + (at.ray instanceof Ray3D)); },
            onDraw(at) { log.push('draw'); } });
        editor3DSelection.add(1); inputData[0].KeyP = 3;`);
    step(run);
    assert.deepEqual([run('levelEditor.tool'), run('editor3DHint()'), run('editor3DHandles().length')],
        ['Posts', 'Posts: click the ground', 0]);
    run(mouse3D(10, 10) + 'inputData[0][0] = 3;'); step(run);
    run('inputData[0][0] = 1;'); step(run);
    run('inputData[0][0] = 4;'); step(run);
    assert.deepEqual(json(run, 'log'), ['press', 'drag', 'release true']);
    const post = json(run, 'level.objects[2]');
    assert.deepEqual([post.type, Math.round(post.pos[0]), Math.round(post.pos[2])], ['Cylinder', 10, 10]);
    assert.equal(run('editor3DUndoList.length'), 1);
    run('log.length = 0; editor3DDrawGame();');
    assert.deepEqual(json(run, 'log'), ['draw']);
    run('inputData[0].KeyW = 3;'); step(run);
    assert.equal(run('levelEditor.tool'), undefined, 'picking the Move tool puts the game\'s down');
});

test('3D: the right button takes a tool\'s held press back', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `levelEditor.addTool('Posts', { onPress(at) { levelEditor.edit3D.place('Cylinder', at.pos); } });
        levelEditor.tool = 'Posts';` + mouse3D(10, 10) + 'inputData[0][0] = 3;');
    step(run);
    assert.equal(run('level.objects.length'), 3);
    run('inputData[0][2] = 3;'); step(run);
    assert.deepEqual([run('level.objects.length'), run('editor3DUndoList.length')], [2, 0]);
});

test('3D: the hooks a game sets or overrides are the ones the 3D editor calls, and onSave keeps the file', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `var log = [], files = []; saveText = (text, name)=> files.push(name);
        levelEditor.onRestart = ()=> log.push('restart');
        levelEditor.onSave = (text, name)=> { log.push(JSON.parse(text).objects.length + ' ' + name); return true; };
        editor3DRestart();`);
    assert.equal(await run('editor3DSave()'), 'kept');
    assert.deepEqual([json(run, 'log'), run('files.length')], [['restart', '2 level3D.json'], 0]);
});

test('a moment the game takes away again is not called, in either editor', async ()=>
{
    for (const is3D of [false, true])
    {
        const { run } = await loadGame(is3D);
        run((is3D ? open3D : open2D) + `saveText = ()=> {};
            for (const name of ['onOpen', 'onClose', 'onUpdate', 'onDraw', 'onPanel', 'onSave'])
                levelEditor[name] = name === 'onSave' ? null : undefined;`);
        step(run);
        run(is3D ? 'editor3DDrawGame()' : 'editorRenderGame()');
        await run(is3D ? 'editor3DSave()' : 'editorSave(editorRecord())');
        run('levelEditor.close(); levelEditor.open();');
        assert.equal(run('levelEditor.isOpen'), true);
    }
});

test('a key is spelled one way for both editors: names in any case, Space, and Ctrl in front', async ()=>
{
    const { run } = await loadGame();
    run(`for (const key of ['DELETE', 'f2', ' ', 'Ctrl+K', 'pageup', 'K']) levelEditor.addKey(key, ()=> {});`);
    assert.deepEqual(json(run, 'Object.keys(levelEditor.keys)'), ['Delete', 'F2', 'Space', 'ctrl+k', 'PageUp', 'k']);
});

test('a key the editors keep for themselves, or one with a modifier they do not have, is not taken, with a warning', async ()=>
{
    const { run } = await loadGame();
    const said = warned(run, `for (const key of ['Escape', '0', 'shift+k', 'alt+x']) levelEditor.addKey(key, ()=> {});`);
    assert.equal(said.length, 4);
    assert.deepEqual(json(run, 'Object.keys(levelEditor.keys)'), []);
});

test('2D: a digit of the game\'s own takes the place of the layer it picked', async ()=>
{
    const { run } = await loadGame();
    run(open2D + 'var mine = 0;');
    const said = warned(run, `levelEditor.addKey('2', ()=> ++mine);`);
    assert.equal(said.length, 1, '2 picks the second layer');
    run(`typed('2'); inputData[0].Digit2 = 3;`);
    step(run);
    assert.deepEqual([run('mine'), run('editorObjectLayer')], [1, undefined], 'still on the tile layer');
});

test('3D: punctuation is spelled as it is typed, ? is the key it is on', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `var mine = 0, help = editor3DHelp; levelEditor.addKey('?', ()=> ++mine); inputData[0].Slash = 3;`);
    step(run);
    assert.deepEqual([run('mine'), run('editor3DHelp === help')], [1, true]);
});

test('2D: Escape takes a tool\'s held press back and stays in the editor, and keys wait for the press to end', async ()=>
{
    const { run } = await loadGame();
    run(open2D + `var keyed = 0; levelEditor.addKey('k', ()=> ++keyed);
        levelEditor.addTool('Dots', { key: 'p', onPress(at) { levelEditor.edit2D.paint(at.cell, 5); } });
        levelEditor.tool = 'Dots';` + mouse2D(1, 0) + 'inputData[0][0] = 3;');
    step(run);
    run(`inputData[0][0] = 1; typed('k'); typed('p');`);
    assert.deepEqual([run('keyed'), run('levelEditor.tool')], [0, 'Dots'], 'held, the keys do nothing');
    run('inputData[0].Escape = 3;');
    step(run);
    assert.deepEqual([json(run, 'map.layers[0].data[4]'), run('editorUndoList.length'), run('levelEditor.isOpen')],
        [0, 0, true]);
});

test('3D: the editor\'s own Blocks and Terrain cursors are put away while a tool of the game\'s is on', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `levelEditor.addTool('Posts', {}); levelEditor.tool = 'Posts';
        editor3DBlockHover = {cell: vec3(), mode: 'place'}; editor3DTerrainHover = vec3();`);
    step(run);
    assert.deepEqual([run('editor3DBlockHover'), run('editor3DTerrainHover')], [undefined, undefined]);
});

test('onSave may be async, and Save inside an open prefab asks it too', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + `var files = [], kept = []; saveText = (text, name)=> files.push(name);
        levelEditor.onSave = async (text, name)=> { kept.push(name); return true; };
        editor3DSelection.add(1); editor3DSelection.add(2); editor3DMakePrefab('Pair');`);
    assert.equal(await run('editor3DSave()'), 'kept');
    run('editor3DPrefabEnter()');
    assert.equal(await run('editor3DSave()'), 'kept');
    assert.deepEqual([json(run, 'kept'), run('files.length')], [['level3D.json', 'Pair.json'], 0]);
});

test('the edit functions say no where there is nothing to do', async ()=>
{
    const { run } = await loadGame(true);
    run(open3D + 'var edit = levelEditor.edit3D; editor3DMouseOnPanel = true;');
    assert.deepEqual([run(`edit.place('Nothing', vec3())`), run('level.objects.length'), run('edit.mousePoint()')],
        [undefined, 2, undefined]);
    const game = await loadGame();
    game.run(open2D + 'var edit = levelEditor.edit2D;');
    assert.equal(game.run('edit.paint(vec2(1, 0), 5, 7)'), true);
    game.run('edit.strokeEnd(); editorHover = vec2(1, 0); editorSelectLayer(editorLayers().find((layer)=> layer.isObjects));');
    assert.equal(game.run('edit.hover'), undefined, 'no cell on an object layer');
    assert.equal(json(game.run, 'editorGidToTile(map.layers[0].data[4]).direction'), 3, 'a direction past 3 comes around');
});

test('a tool added again under its name takes the place of the first, its key too', async ()=>
{
    const { run } = await loadGame();
    run(`levelEditor.addTool('Dots', {key: 'p'}); levelEditor.addTool('Dots', {key: 'o'});`);
    assert.deepEqual(json(run, 'Object.keys(levelEditor.keys)'), ['o']);
});

test('saves are written in the order they were asked for, whatever order an async onSave answers in', async ()=>
{
    for (const is3D of [false, true])
    {
        const { run } = await loadGame(is3D);
        run((is3D ? open3D : open2D) + `var writes = [], pending = [];
            saveText = (text)=> writes.push(${is3D ? 'JSON.parse(text).objects[0].pos[0]' : 'JSON.parse(text).layers[0].data[0]'});
            levelEditor.onSave = ()=> new Promise((resolve)=> pending.push(resolve));
            var save = ()=> ${is3D ? 'editor3DSave()' : 'editorSave(editorRecord())'};
            var first = save();
            ${is3D ? 'level.objects[0].pos[0] = 7' : 'map.layers[0].data[0] = 7'};
            var second = save();`);
        await new Promise((resolve)=> setTimeout(resolve, 0));
        assert.equal(run('pending.length'), 1, 'the second waits its turn');
        run('pending[0](false)');
        await run('first');
        await new Promise((resolve)=> setTimeout(resolve, 0));
        run('pending[1](false)');
        await run('second');
        assert.deepEqual(json(run, 'writes'), [is3D ? 0 : 1, 7], 'the older one first, the newer one last');
        // a hook that fails fails its own save, and the next one is written
        run(`levelEditor.onSave = ()=> Promise.reject(new Error('no')); var failed = save();`);
        await assert.rejects(run('failed'));
        run('levelEditor.onSave = ()=> false; var after = save();');
        await run('after');
        assert.equal(run('writes.length'), 3);
    }
});
