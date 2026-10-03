import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The level editor edits a map's object layers: the Tiled objects are the source of truth, the objects the game made
// from them are kept in line, and undo, autosave and revert cover them as they do tiles. Each test runs its own copy
// of the script build.

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

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser
function step(engine)
{
    engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}

// a map of a ground layer and an object layer of two coins, the second worth 5, loaded as a game loads it
const objectCode = `
    class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); this.value = 0; } }
    objectLayersAddType('Coin', Coin, { value: 1, tint: hsl(0, 0, 1) });
    var map = { width: 4, height: 2, tilewidth: 16, tileheight: 16, nextobjectid: 3, nextlayerid: 3, layers: [
        { type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1] },
        { type: 'objectgroup', id: 2, name: 'Objects', objects: [
            { id: 1, type: 'Coin', point: true, x: 8, y: 8 },
            { id: 2, type: 'Coin', point: true, x: 40, y: 8, properties: [{ name: 'value', type: 'int', value: 5 }] }] }] };
    var layers = tileLayersLoad(map, undefined, 0, 0), made = objectLayersLoad(map);
    var ground = editorLayerRecord(layers[0]), objects = editorObjectLayers(ground.record)[0];
    var coins = ()=> engineObjects.filter((o)=> o instanceof Coin && !o.destroyed);
    var list = ()=> map.layers[1].objects;`;

// the map as a file loads it, from its url, on each page load
const mapKey = 'levels/objects.json';
const fileCode = objectCode.replace('var layers = tileLayersLoad', `editorJSONFetched('${mapKey}', map);
    var layers = tileLayersLoad`);

test('the objects a game makes from its map are linked to the map\'s objects by id', async () =>
{
    const { run } = await loadGame();
    run(objectCode);
    assert.deepEqual([...run('[objects.instances.get(1) === made[0], objects.instances.get(2) === made[1]]')], [true, true]);
    assert.equal(run('objects.name'), 'Objects');
});

test('moving an object moves its game object, and undo moves both back', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `var coin = made[0];
        editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(3.5, .5))); editorStrokeEnd();`);
    assert.deepEqual([...run('[list()[0].x, list()[0].y, coin.pos.x, coin.pos.y, objects.instances.get(1) === coin]')],
        [56, 24, 3.5, .5, true]);
    run('editorUndo()');
    assert.deepEqual([...run('[list()[0].x, list()[0].y, coin.pos.x, coin.pos.y]')], [8, 8, .5, 1.5]);
});

test('adding an object makes its game object, deleting one destroys it, and undo goes back', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `editorChangeObjects(objects, (l)=> l.push({ id: editorNextObjectId(map), type: 'Coin', x: 24, y: 24 }));
        editorStrokeEnd();`);
    assert.deepEqual([...run('[coins().length, map.nextobjectid, objects.instances.get(3).pos.x]')], [3, 4, 1.5]);
    run('editorUndo()');
    assert.equal(run('coins().length'), 2);
    run('editorChangeObjects(objects, (l)=> l.splice(1, 1)); editorStrokeEnd();');
    assert.deepEqual([...run('[coins().length, made[1].destroyed]')], [1, true]);
    run('editorUndo()');
    assert.deepEqual([...run('[coins().length, objects.instances.get(2).value]')], [2, 5], 'made again with its value');
});

test('a property is saved only where it differs from the default, and the game object gets it', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `var object = { id: 9, type: 'Coin', properties: [{ name: 'value', type: 'int', value: 5 }] };`);
    run(`editorObjectSetProperty(object, 'value', 1, 1)`);
    assert.equal(run('object.properties'), undefined, 'back to the default, no override');
    run(`editorObjectSetProperty(object, 'value', 7, 1); editorObjectSetProperty(object, 'tint', hsl(0, 1, .5, .5), hsl(0, 0, 1))`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(object.properties)')),
        [{ name: 'value', type: 'int', value: 7 }, { name: 'tint', type: 'color', value: '#80ff0000' }]);
    run(`editorChangeObjects(objects, (l)=> editorObjectSetProperty(l[0], 'value', 7, 1)); editorStrokeEnd();`);
    assert.equal(run('made[0].value'), 7);
});

test('a type made by an arrow function is called again when its object moves', async () =>
{
    const { run } = await loadGame();
    run(objectCode.replace('var layers', `var start; objectLayersAddType('Start', (pos)=> { start = pos; });
        map.layers[1].objects.push({ id: 5, type: 'Start', point: true, x: 8, y: 24 });
        var layers`));
    assert.deepEqual([...run('[start.x, start.y]')], [.5, .5]);
    run(`editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[2], vec2(2.5, 1.5))); editorStrokeEnd();`);
    assert.deepEqual([...run('[start.x, start.y]')], [2.5, 1.5]);
});

test('an object whose game object is gone in play moves without being made again', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `made[0].destroy();
        editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(2.5, .5))); editorStrokeEnd();`);
    assert.deepEqual([...run('[list()[0].x, coins().length]')], [40, 1]);
});

test('a drag of many steps is one undo', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `for (let i = 1; i <= 30; ++i)
            editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(.5 + i / 10, 1.5)));
        editorStrokeEnd();`);
    assert.equal(run('editorUndoList.length'), 1);
    run('editorUndo()');
    assert.deepEqual([...run('[list()[0].x, made[0].pos.x]')], [8, .5]);
});

test('moved objects are autosaved and come back on reload before the game makes them, and Revert puts them back',
    async () =>
{
    const storage = makeStorage();
    const first = await loadGame({ localStorage: storage });
    first.run(fileCode + `editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(3.5, .5)));
        editorStrokeEnd();`);
    const second = await loadGame({ localStorage: storage });
    second.run(fileCode);
    assert.deepEqual([...second.run('[list()[0].x, made[0].pos.x, made[0].pos.y]')], [56, 3.5, .5]);
    second.run('editorRevert(objects.record)');
    assert.deepEqual([...second.run('[list()[0].x, made[0].pos.x]')], [8, .5]);
    second.run('editorUndo()');
    assert.equal(second.run('list()[0].x'), 56, 'Revert is one undo');
});

test('a map with no object layer gets one named Objects the first time an object is placed, autosaved', async () =>
{
    const storage = makeStorage();
    const noObjects = (code)=> code.replace(/,\s*\{ type: 'objectgroup'[\s\S]*?\] \}\] \};/, '] };')
        .replace('var list = ()=> map.layers[1].objects;', 'var list = ()=> map.layers[1]?.objects;');
    const first = await loadGame({ localStorage: storage });
    first.run(noObjects(fileCode));
    assert.deepEqual([...first.run('[map.layers.length, objects.group, objects.name]')], [1, undefined, 'Objects']);
    first.run(`editorChangeObjects(objects, (l)=> l.push({ id: editorNextObjectId(map), type: 'Coin', x: 8, y: 8 }));
        editorStrokeEnd();`);
    assert.deepEqual(JSON.parse(first.run(`JSON.stringify([map.layers[1].type, map.layers[1].name, map.layers[1].id,
        map.nextlayerid, coins().length])`)), ['objectgroup', 'Objects', 3, 4, 1]);
    const second = await loadGame({ localStorage: storage });
    second.run(noObjects(fileCode));
    assert.deepEqual(JSON.parse(second.run('JSON.stringify([map.layers[1]?.name, list()?.length, coins().length])')),
        ['Objects', 1, 1]);
});

// objects mode: the camera on (2, 1) at 100 pixels a cell, the mouse at a world position
const editCode = objectCode + `levelEditor.open(); editorCameraPos = vec2(2, 1); editorCameraScale = 100;`;
const canvas = { tagName: 'CANVAS', closest: ()=> null };
const at = (x, y, button=0)=> ({ button, x: 500 + (x - 2) * 100, y: 500 - (y - 1) * 100, target: canvas, cancelable: false });
function click(engine, x, y, button=0)
{
    engine.handlers.mousedown(at(x, y, button));
    step(engine);
    engine.handlers.mouseup(at(x, y, button));
    step(engine);
}
function drag(engine, from, to, button=0)
{
    engine.handlers.mousedown(at(...from, button));
    step(engine);
    engine.handlers.mousemove(at(...to, button));
    step(engine);
    engine.handlers.mouseup(at(...to, button));
    step(engine);
}
function press(engine, code)
{
    engine.handlers.keydown(keyEvent(code));
    step(engine);
    engine.handlers.keyup(keyEvent(code));
    step(engine);
}
const typed = (engine, key, ctrl=false)=> engine.run(`(()=> { let prevented = false;
    editorOnKeyDown({ key: '${key}', code: '', repeat: false, ctrlKey: ${ctrl}, metaKey: false, shiftKey: false,
        altKey: false, target: undefined, preventDefault() { prevented = true; } });
    return prevented; })()`);
const selected = (engine)=> [...engine.run('[...editorObjectSelection].sort()')];
const positions = (engine)=> JSON.parse(engine.run('JSON.stringify(list().map((o)=> [o.id, o.x, o.y]))'));

test('1 and 2 pick the tile layer and the object layer after it', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    press(engine, 'Digit2');
    assert.equal(engine.run('editorObjectLayer === objects'), true);
    press(engine, 'Digit1');
    assert.deepEqual([...engine.run('[editorObjectLayer, editorLayer === ground]')], [undefined, true]);
});

test('a left click on empty space places the brush\'s object at the cell center, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelectLayer(objects); editorObjectBrush = [{ type: 'Coin', properties: [], offset: vec2() }];`);
    click(engine, 3.2, .7);
    assert.deepEqual(positions(engine).at(-1), [3, 56, 24]);
    assert.deepEqual([...engine.run('[coins().length, editorUndoList.length]')], [3, 1]);
});

test('a left click selects an object, and dragging moves it by whole cells, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects);');
    drag(engine, [.5, 1.5], [2.6, 1.4]);
    assert.deepEqual(selected(engine), [1]);
    assert.deepEqual(positions(engine)[0], [1, 40, 8]);
    assert.deepEqual([...engine.run('[made[0].pos.x, made[0].pos.y, editorUndoList.length]')], [2.5, 1.5, 1]);
});

test('the first left click with a selection only clears it', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelectLayer(objects); editorObjectSelection.add(2);
        editorObjectBrush = [{ type: 'Coin', properties: [], offset: vec2() }];`);
    click(engine, 3.5, .5);
    assert.deepEqual([...engine.run('[editorObjectSelection.size, list().length]')], [0, 2]);
});

test('a right click picks an object into the brush with its properties, on empty space it clears the selection',
    async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects); editorObjectSelection.add(1);');
    click(engine, 2.5, 1.5, 2);
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorObjectBrush)')),
        [{ type: 'Coin', properties: [{ name: 'value', type: 'int', value: 5 }], offset: { x: 0, y: 0 } }]);
    click(engine, 3.5, .5, 2);
    assert.equal(engine.run('editorObjectSelection.size'), 0);
});

test('a right drag box-selects, with Shift it adds, with Ctrl it takes away', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects);');
    drag(engine, [0, 0], [1.9, 2], 2);
    assert.deepEqual(selected(engine), [1]);
    engine.handlers.keydown(keyEvent('ShiftLeft'));
    drag(engine, [2, 0], [4, 2], 2);
    engine.handlers.keyup(keyEvent('ShiftLeft'));
    assert.deepEqual(selected(engine), [1, 2]);
    engine.handlers.keydown(keyEvent('ControlLeft'));
    drag(engine, [0, 0], [1, 2], 2);
    engine.handlers.keyup(keyEvent('ControlLeft'));
    assert.deepEqual(selected(engine), [2]);
});

test('Delete removes the selected objects and their game objects', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects); editorObjectSelection.add(1);');
    typed(engine, 'Delete');
    assert.deepEqual([...engine.run('[list().length, coins().length, made[0].destroyed]')], [1, 1, true]);
});

test('Ctrl+C makes the selection the brush, and a click places copies keeping their offsets', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects); editorObjectSelection.add(1); editorObjectSelection.add(2);');
    assert.equal(typed(engine, 'c', true), true);
    assert.equal(engine.run('editorObjectSelection.size'), 0);
    click(engine, 1.5, .5);
    assert.deepEqual(positions(engine).slice(2), [[3, 24, 24], [4, 56, 24]]);
    assert.equal(engine.run('list()[3].properties[0].value'), 5, 'with its properties');
});

test('Ctrl+X copies and removes as one undo, and F does nothing on an object layer', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects); editorObjectSelection.add(2);');
    typed(engine, 'x', true);
    assert.deepEqual([...engine.run('[list().length, editorUndoList.length, editorObjectBrush.length]')], [1, 1, 1]);
    assert.equal(typed(engine, 'f'), false);
    assert.equal(engine.run('list().length'), 1);
});

// All Layers takes objects: the ground's top row, cells (0, 1) and (1, 1), holds coin 1 at (.5, 1.5)

test('with All Layers, Ctrl+C on a tile area takes the objects inside it, even when its tiles are empty', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorAllLayers = true; editorSelection = editorArea(vec2(0, 1), vec2(1, 1));');
    assert.equal(typed(engine, 'c', true), true);
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify(editorBrush.objects)')),
        [{ group: 0, type: 'Coin', offset: { x: .5, y: .5 }, object: { id: 1, type: 'Coin', point: true, x: 8, y: 8 } }]);
    assert.equal(engine.run('editorBrushLabel()'), 'Brush: 2x1 stamp, 1 object');
});

test('a stamp\'s objects are placed once on the left press, not along the drag after it', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorAllLayers = true; editorSelection = editorArea(vec2(0, 1), vec2(1, 1));
        editorCopy(); editorSelection = undefined;`);
    drag(engine, [2.5, .5], [3.5, .5]);
    assert.deepEqual(positions(engine).slice(2), [[3, 40, 24]], 'one coin at cell (2, 0) plus its offset');
    assert.deepEqual([...engine.run('[coins().length, editorUndoList.length]')], [3, 1]);
});

test('Delete with All Layers removes the objects in the area with the tiles, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorAllLayers = true; editorSelection = editorArea(vec2(0, 0), vec2(1, 1));');
    typed(engine, 'Delete');
    assert.deepEqual([...engine.run('[list().length, coins().length, ...map.layers[0].data]')],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1]);
    assert.equal(engine.run('editorUndoList.length'), 1);
    engine.run('editorUndo()');
    assert.deepEqual([...engine.run('[list().length, coins().length, ...map.layers[0].data]')],
        [2, 2, 0, 0, 0, 0, 1, 1, 1, 1]);
});

test('R and M turn and mirror a stamp\'s object offsets with its cells', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `var stamp = { width: 2, height: 1, grids: [[undefined, undefined]],
        objects: [{ group: 0, type: 'Coin', properties: [], offset: vec2(.5, .5) }] };`);
    assert.deepEqual([...engine.run('const t = editorStampTurn(stamp); [t.objects[0].offset.x, t.objects[0].offset.y]')],
        [.5, 1.5]);
    assert.deepEqual([...engine.run('const m = editorStampMirror(stamp); [m.objects[0].offset.x, m.objects[0].offset.y]')],
        [1.5, .5]);
});

// the panel on an object layer

test('on an object layer the brush label names the object type, and the hint line tells the object controls',
    async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelectLayer(objects); editorObjectBrush = undefined;`);
    assert.equal(engine.run('editorBrushLabel()'), 'Brush: none');
    engine.run('editorPalettePick(0)'); // the first type added
    assert.equal(engine.run('editorBrushLabel()'), 'Brush: Coin');
    engine.run(`editorObjectBrush = [0, 1, 2].map(()=> ({ type: 'Coin', properties: [], offset: vec2() }))`);
    assert.equal(engine.run('editorBrushLabel()'), 'Brush: 3 objects');
    assert.equal(engine.run('editorHint()'), 'Left place / select · drag moves · Right pick / drag select · Delete removes');
    engine.run('editorObjectSelection.add(1)');
    assert.match(engine.run('editorHint()'), /^Selection: drag moves · Delete removes/);
});

test('the properties box sets a property of the one selected object, as one undo', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelectLayer(objects); editorObjectSelection.add(1);`);
    assert.equal(engine.run(`editorSetSelectedProperty('value', 3)`), true);
    assert.deepEqual(JSON.parse(engine.run('JSON.stringify([list()[0].properties, made[0].value, editorUndoList.length])')),
        [[{ name: 'value', type: 'int', value: 3 }], 3, 1]);
    engine.run('editorObjectSelection.add(2)');
    assert.equal(engine.run(`editorSetSelectedProperty('value', 4)`), false, 'only with one object selected');
});

// review fixes

test('a right press carried across a layer switch does not throw', async () =>
{
    const engine = await loadGame();
    engine.run(editCode);
    engine.handlers.mousedown(at(.5, .5, 2));
    step(engine);
    press(engine, 'Digit2'); // to the object layer, the button still held
    engine.handlers.mousemove(at(3.5, 1.5, 2));
    step(engine);
    engine.handlers.mouseup(at(3.5, 1.5, 2));
    step(engine);
    assert.equal(engine.run('editorObjectLayer === objects'), true);
});

test('a new object\'s id is past every id the map has, whatever nextobjectid says', async () =>
{
    const engine = await loadGame();
    engine.run(editCode + `editorSelectLayer(objects); delete map.nextobjectid;
        editorObjectBrush = [{ type: 'Coin', properties: [], offset: vec2() }];`);
    click(engine, 3.5, .5);
    engine.run('map.nextobjectid = 1');
    click(engine, 3.5, 1.5);
    assert.deepEqual(positions(engine).map((p)=> p[0]), [1, 2, 3, 4]);
    assert.equal(engine.run('coins().length'), 4);
});

test('objects loaded before the tile layers are linked, and made from the autosave', async () =>
{
    const storage = makeStorage();
    const first = await loadGame({ localStorage: storage });
    first.run(fileCode + `editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(3.5, .5)));
        editorStrokeEnd();`);
    const second = await loadGame({ localStorage: storage });
    second.run(fileCode.replace('var layers = tileLayersLoad(map, undefined, 0, 0), made = objectLayersLoad(map);',
        'var made = objectLayersLoad(map), layers = tileLayersLoad(map, undefined, 0, 0);'));
    assert.deepEqual([...second.run('[objects.instances.get(1) === made[0], made[0].pos.x, made[0].pos.y]')], [true, 3.5, .5]);
});

test('an object is drawn as a ghost where the game has nothing at its place', async () =>
{
    const { run } = await loadGame();
    run(objectCode.replace('var layers', `objectLayersAddType('Start', (pos)=> pos);
        map.layers[1].objects.push({ id: 5, type: 'Start', point: true, x: 8, y: 24 });
        var layers`));
    const ghosts = ()=> [...run('list().map((o)=> editorObjectIsGhost(objects, o))')];
    assert.deepEqual(ghosts(), [false, false, true], 'a player start is not a game object');
    run('made[0].pos = vec2(3, 3); made[1].destroy()');
    assert.deepEqual(ghosts(), [true, true, true], 'moved in play, and gone in play');
});

test('undoing the first object placed in a map with no object layer forgets the autosave', async () =>
{
    const storage = makeStorage();
    const engine = await loadGame({ localStorage: storage });
    engine.run(fileCode.replace(/,\s*\{ type: 'objectgroup'[\s\S]*?\] \}\] \};/, '] };')
        .replace('var list = ()=> map.layers[1].objects;', '') + `
        editorChangeObjects(objects, (l)=> l.push({ id: editorNextObjectId(map), type: 'Coin', x: 8, y: 8 }));
        editorStrokeEnd(); editorUndo();`);
    assert.equal(JSON.parse(storage.items['LittleJS editor /game/'])[mapKey], undefined);
});

test('the properties box takes only a value of the default\'s type, and rounds an integer', async () =>
{
    const { run } = await loadGame();
    run(editCode.replace(`{ value: 1, tint: hsl(0, 0, 1) }`, `{ value: 1, tint: hsl(0, 0, 1), offset: vec2(1, 0) }`) +
        'editorSelectLayer(objects); editorObjectSelection.add(1);');
    assert.equal(run(`editorSetSelectedProperty('offset', '( 2, 0 )')`), false);
    assert.equal(run(`editorSetSelectedProperty('value', 2.6)`), true);
    assert.deepEqual(JSON.parse(run('JSON.stringify([list()[0].properties, made[0].value])')),
        [[{ name: 'value', type: 'int', value: 3 }], 3]);
});

test('a Vector2 field emptied or half typed keeps its value, and a number in it sets it as one undo', async () =>
{
    const { run } = await loadGame();
    // the properties box is html: the few element members it uses, enough to build it and fire its inputs
    run(`document.createElement = (tag)=> ({ tag, style: {}, dataset: {}, children: [], textContent: '', value: '',
        appendChild(c) { this.children.push(c); }, replaceChildren() { this.children = []; }, contains: ()=> false,
        blur() {} });`);
    run(editCode.replace(`{ value: 1, tint: hsl(0, 0, 1) }`, `{ value: 1, tint: hsl(0, 0, 1), offset: vec2(1, 2) }`) +
        `editorSelectLayer(objects); editorObjectSelection.add(1);
        var box = document.createElement('div');
        editorPropertiesUpdate(box);
        var row = box.children.find((r)=> r.children[0]?.textContent === 'offset'), [, x, y] = row.children;`);
    // a browser's number input reads an unfinished number as empty, and a lone minus is none either
    for (const [field, text] of [['x', ''], ['y', ''], ['x', '-']])
    {
        run(`${field}.value = '${text}'; ${field}.onchange();`);
        assert.deepEqual([...run('[x.value, y.value]')], ['1', '2'], `${field} '${text}' shows the value it has`);
    }
    assert.equal(run('editorUndoList.length'), 0, 'nothing set');
    run(`x.value = '3'; x.onchange();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([list()[0].properties, editorUndoList.length])')),
        [[{ name: 'offset', type: 'string', value: '3,2' }], 1]);
});

test('a Vector2 property is saved as Tiled keeps one, the string x,y, and only where it differs', async () =>
{
    const { run } = await loadGame();
    run(objectCode + 'var object = { id: 9, type: \'Coin\' };');
    run(`editorObjectSetProperty(object, 'dir', vec2(1, 0), vec2(0, 1))`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(object.properties)')),
        [{ name: 'dir', type: 'string', value: '1,0' }]);
    run(`editorObjectSetProperty(object, 'dir', vec2(0, 1), vec2(0, 1))`);
    assert.equal(run('object.properties'), undefined, 'back to the default, no override');
});

test('the properties box sets a Vector2, and the game object gets a Vector2', async () =>
{
    const { run } = await loadGame();
    run(editCode.replace(`{ value: 1, tint: hsl(0, 0, 1) }`, `{ value: 1, tint: hsl(0, 0, 1), offset: vec2(1, 0) }`) +
        'editorSelectLayer(objects); editorObjectSelection.add(1);');
    assert.equal(run(`editorSetSelectedProperty('offset', vec2(2, 3))`), true);
    assert.deepEqual(JSON.parse(run('JSON.stringify([list()[0].properties, isVector2(made[0].offset)])')),
        [[{ name: 'offset', type: 'string', value: '2,3' }], true]);
    assert.deepEqual([...run('[made[0].offset.x, made[0].offset.y]')], [2, 3]);
    assert.equal(run('editorPropertyEditable(vec2())'), true);
});

// minor fixes

test('on an object layer R, M and E leave the tile brush alone, and the key list tells the object controls',
    async () =>
{
    const engine = await loadGame();
    engine.run(editCode + 'editorSelectLayer(objects); var before = editorBrush;');
    assert.deepEqual(['r', 'm', 'e'].map((key)=> typed(engine, key)), [false, false, false]);
    assert.equal(engine.run('editorBrush === before'), true);
    assert.equal(engine.run(`editorHelpLines.some((line)=> line.startsWith('Objects layer:'))`), true);
});

test('an autosave from before objects were in the hash still comes back quietly', async () =>
{
    const storage = makeStorage(), saveName = 'LittleJS editor /game/';
    const first = await loadGame({ localStorage: storage });
    first.run(fileCode + 'editorPaint(ground, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd();');
    // the autosave as it was written then: a hash of the tiles alone, and no objects
    const saves = JSON.parse(storage.items[saveName]);
    saves[mapKey] = { hash: first.run('editorMapHash(ground.record.original)'), layers: saves[mapKey].layers };
    storage.items[saveName] = JSON.stringify(saves);
    const second = await loadGame({ localStorage: storage });
    second.run(fileCode);
    assert.deepEqual([...second.run('[ground.record.pending, map.layers[0].data[0], list().length]')], [undefined, 5, 2]);
});

test('after the game loads its map again, as a restart does, undo moves the new game object', async () =>
{
    const { run } = await loadGame();
    run(objectCode + `editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(3.5, .5)));
        editorStrokeEnd();
        engineObjectsDestroy(); layers = tileLayersLoad(map, undefined, 0, 0); var again = objectLayersLoad(map);`);
    assert.deepEqual([...run('[again[0].pos.x, again[0].pos.y, objects.instances.get(1) === again[0]]')], [3.5, .5, true]);
    run('editorUndo()');
    assert.deepEqual([...run('[again[0].pos.x, again[0].pos.y, again[0].destroyed, coins().length]')], [.5, 1.5, false, 2]);
});

// review 2026-09-26

test('moving an object or setting one property leaves the rest of its state from play alone', async () =>
{
    const { run } = await loadGame();
    run(objectCode + 'made[0].value = 25;'); // changed in play
    run(`editorChangeObjects(objects, (l)=> editorObjectSetPos(objects.record, l[0], vec2(2.5, .5))); editorStrokeEnd();`);
    assert.deepEqual([...run('[made[0].pos.x, made[0].value]')], [2.5, 25], 'moved, its value kept');
    run('made[0].pos = vec2(3, 3);'); // moved in play
    run(`editorChangeObjects(objects, (l)=> editorObjectSetProperty(l[0], 'tint', hsl(0, 1, .5), hsl(0, 0, 1)));
        editorStrokeEnd();`);
    assert.deepEqual([...run('[made[0].pos.x, made[0].value, made[0].tint.g]')], [3, 25, 0], 'only the tint set');
    run('editorUndo()');
    assert.deepEqual([...run('[made[0].pos.x, made[0].value, made[0].tint.g]')], [3, 25, 1]);
    run('editorUndo()');
    assert.deepEqual([...run('[made[0].pos.x, made[0].value]')], [.5, 25], 'the move undone');
});

// review 2026-09-26 F5: a level of objects alone, with no tile layer

// a map of one object layer holding a coin, loaded as a game loads it, and rebuilt by its Restart hook
const objectsOnlyCode = `
    class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); this.value = 0; } }
    objectLayersAddType('Coin', Coin, { value: 1 });
    var level = (id)=> ({ width: 4, height: 2, tilewidth: 16, tileheight: 16, nextobjectid: 2, layers: [
        { type: 'objectgroup', id: 1, name: 'Objects', objects: [{ id: 1, type: 'Coin', point: true, x: 8, y: 8 }] }] });
    var map = level(), made = objectLayersLoad(map);
    levelEditor.onRestart = ()=> { engineObjectsDestroy(); made = objectLayersLoad(map); };
    var coins = ()=> engineObjects.filter((o)=> o instanceof Coin && !o.destroyed);
    var list = ()=> map.layers[0].objects;`;

test('a level of objects alone is listed, the editor opens on its object layer, and a click places the brush',
    async () =>
{
    const engine = await loadGame();
    engine.run(objectsOnlyCode + 'levelEditor.open(); editorCameraPos = vec2(2, 1); editorCameraScale = 100;');
    assert.deepEqual([...engine.run(`const layers = editorLayers();
        [layers.length, layers[0].isObjects, editorObjectLayer === layers[0], editorLayer, editorRecord().map === map]`)],
        [1, true, true, undefined, true]);
    engine.run(`editorObjectBrush = [{ type: 'Coin', properties: [], offset: vec2() }];`);
    click(engine, 3.5, .5);
    assert.deepEqual([...engine.run('[list().length, coins().length]')], [2, 2]);
});

test('a level of objects alone resizes and resets to its file like any other', async () =>
{
    const { run } = await loadGame();
    run(objectsOnlyCode + 'levelEditor.open();');
    assert.equal(run('editorResize(editorRecord(), 6, 3)'), true);
    assert.deepEqual([...run('[map.width, list()[0].y, coins().length, made[0].pos.y]')], [6, 24, 1, 1.5]);
    run('editorRevert(editorRecord())');
    assert.deepEqual([...run('[map.width, list()[0].y]')], [4, 8]);
});

test('a level of objects alone is listed beside a tile map, and steps aside when the game loads another',
    async () =>
{
    const { run } = await loadGame();
    run(objectCode + objectsOnlyCode.replace('class Coin', 'class Coin2'));
    assert.deepEqual([...run('editorLayers().map((layer)=> layer.record.map === map)')], [false, false, true]);
    run('engineObjectsDestroy(); var next = level(); objectLayersLoad(next);');
    assert.deepEqual([...run('editorLayers().map((layer)=> layer.record.map === next)')], [true]);
});

test('a click on an object leaves its place as it is written, with nothing to undo', async () =>
{
    // 24 pixel tiles, where a place turned into cells and back is off by a hair
    const engine = await loadGame(), { run } = engine;
    run(editCode.replace('tilewidth: 16, tileheight: 16', 'tilewidth: 24, tileheight: 24')
        .replace('x: 8, y: 8', 'x: 7, y: 7') + 'editorSelectLayer(objects);');
    const x = 7 / 24, y = 2 - 7 / 24;
    click(engine, x, y);
    click(engine, x, y);
    assert.deepEqual([run('list()[0].x'), run('list()[0].y'), run('editorUndoList.length')], [7, 7, 0]);
    // dragged two cells, past the other coin, and back it is where it was, to the last digit
    drag(engine, [x, y], [x + 2, y]);
    assert.equal(run('list()[0].x'), 7 + 48);
    drag(engine, [x + 2, y], [x, y]);
    assert.deepEqual([run('list()[0].x'), run('list()[0].y')], [7, 7]);
});

// coin 1 named, sized, turned and hidden, as a Tiled object can be
const fieldsCode = editCode.replace(`{ id: 1, type: 'Coin', point: true, x: 8, y: 8 }`,
    `{ id: 1, type: 'Coin', name: 'door', x: 8, y: 8, width: 32, height: 16, rotation: 15, visible: false }`);
const fields = (engine, i)=> JSON.parse(engine.run(`JSON.stringify(list()[${i}])`));

test('cut and paste keeps an object\'s name, size, turn and visibility, with a new id and place', async () =>
{
    const engine = await loadGame();
    engine.run(fieldsCode + 'editorSelectLayer(objects); editorObjectSelection.add(1);');
    typed(engine, 'x', true);
    click(engine, 1.5, .5);
    assert.deepEqual(fields(engine, 1), { id: 3, type: 'Coin', name: 'door', x: 24, y: 24, width: 32, height: 16,
        rotation: 15, visible: false });
});

test('a stamp keeps its objects\' fields too', async () =>
{
    const engine = await loadGame();
    engine.run(fieldsCode + `editorAllLayers = true; editorSelection = editorArea(vec2(0, 1), vec2(1, 1));
        editorCopy(); editorSelection = undefined;`);
    click(engine, 2.5, .5);
    assert.deepEqual(fields(engine, 2), { id: 3, type: 'Coin', name: 'door', x: 40, y: 24, width: 32, height: 16,
        rotation: 15, visible: false });
});

// 24 pixel tiles and places that are not whole cells, where a place turned into cells and back is off by a hair
const noiseCode = editCode.replace('width: 4, height: 2, tilewidth: 16, tileheight: 16',
    'width: 10, height: 10, tilewidth: 24, tileheight: 24').replace(`width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]`,
    'width: 10, height: 10, data: Array(100).fill(0)').replace('x: 8, y: 8', 'x: 10, y: 37')
    .replace('x: 40, y: 8', 'x: 100, y: 77.7') + 'editorAllLayers = true;';

test('a selection dragged with its objects puts them down to the digit, there and back', async () =>
{
    const engine = await loadGame();
    engine.run(noiseCode + `editorSelection = editorArea(vec2(0), vec2(9));
        editorSelectionDragStart(editorLayer, vec2(5)); editorSelectionDragTo(vec2(8, 7)); editorStrokeEnd();
        editorSelectionDragStart(editorLayer, vec2(8, 7)); editorSelectionDragTo(vec2(6, 5)); editorStrokeEnd();`);
    assert.deepEqual(positions(engine), [[1, 34, 37], [2, 124, 77.7]]);
});

test('a stamp\'s objects are put down to the digit', async () =>
{
    const engine = await loadGame();
    engine.run(noiseCode + `editorSelection = editorArea(vec2(0), vec2(9)); editorCopy();
        editorChangeObjects(objects, (l)=> l.splice(0)); editorPlaceStampObjects(editorLayer, vec2(0), editorBrush);`);
    assert.deepEqual(positions(engine), [[3, 10, 37], [4, 100, 77.7]]);
});
