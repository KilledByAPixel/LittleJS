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
