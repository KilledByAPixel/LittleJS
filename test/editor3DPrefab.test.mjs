import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Prefabs in the 3D level editor: an instance is one thing to select, move and land; a level's own prefabs are a
// part of the level, undone, autosaved and saved as its objects are; Make prefab turns a selection into one and
// Unpack turns an instance back into objects; Edit prefab opens one alone.

function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
async function loadGame(extra={})
{
    const engine = loadEngine({ localStorage: makeStorage(), location: { pathname: '/game/' }, ...extra });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-4, message ?? `${a} is not ${b}`);
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

// a level from a file with a House of its own, a wall 4 wide right of its origin and a post on the wall's end,
// placed once at (10, 0, 0), and a plain box far off
const house = `{objects: [{id: 1, type: 'Box', pos: [2, .5, 0], scale: [4, 1, 1]}, {id: 2, type: 'Box', pos: [4, 1.5, 0]}]}`;
const fileCode = `
    var level = { littlejs3D: 1, prefabs: {House: ${house}}, objects: [
        { id: 1, type: 'House', pos: [10, 0, 0] }, { id: 2, type: 'Box', pos: [-20, .5, 0] }] };
    editorJSONFetched('levels/town.json', level);
    level3DLoad(level);
    var live = (id)=> editor3DInstances.get(id);
    var list = ()=> level.objects;
    var down = (x, y, z)=> new Ray3D(vec3(x, y, z), vec3(0, -1, 0));`;

test('an instance is one thing: a click on any part selects it, and its box is the box around its parts', async ()=>
{
    const { run } = await loadGame();
    run(fileCode);
    assert.equal(run('editor3DPickAt(down(14, 9, 0))'), 1, 'the post is the house');
    assert.equal(run('editor3DPickAt(down(11, 9, 0))'), 1, 'and so is the wall');
    assert.equal(run('editor3DPickAt(down(-20, 9, 0))'), 2);
    assert.deepEqual(json(run, 'editor3DSize(list()[0])'), {x: 4.5, y: 2, z: 1});
    assert.deepEqual(json(run, 'editor3DBoxOffset(list()[0])'), {x: 2.25, y: 1, z: 0}, 'its place is not its middle');
    assert.deepEqual(json(run, 'editor3DBoxOffset(list()[1])'), {x: 0, y: 0, z: 0});
});

test('moving an instance moves its parts, and dropped it lands with its own bottom on the ground', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DChange((list)=> editor3DSetTransform(list[0], vec3(0, 5, 0))); editor3DStrokeEnd();`);
    assert.deepEqual(json(run, 'live(1).parts[0].pos3D'), {x: 2, y: 5.5, z: 0});
    run('editor3DSelection.add(1); editor3DDropSelection();');
    assert.deepEqual(json(run, 'list()[0].pos'), [0, 0, 0], 'the origin is at its bottom, which is what lands');
    near(run('live(1).parts[0].pos3D.y'), .5);
});

test('a level\'s prefabs are a part of the level: changed, undone, autosaved and saved with it', async ()=>
{
    const storage = makeStorage();
    const { run } = await loadGame({ localStorage: storage });
    run(fileCode + `editor3DChangePart('prefabs', (prefabs)=> ({...prefabs,
        Tower: {objects: [{id: 1, type: 'Box', pos: [0, 3, 0]}]}})); editor3DStrokeEnd();`);
    assert.equal(run(`level3DTypes.has('Tower')`), true, 'a type to place at once');
    assert.ok(run('editor3DLevelJSON()').includes('"Tower": {"objects"'));
    assert.ok(JSON.parse(storage.items['LittleJS editor 3D /game/'])['levels/town.json'].prefabs.Tower);
    run('editor3DUndo()');
    assert.deepEqual([run(`level3DTypes.has('Tower')`), run(`'Tower' in level.prefabs`)], [false, false]);
});

test('changing a prefab makes every instance of it again, and undo puts them back', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DChange((list)=> { list.push({id: 3, type: 'House', pos: [0, 0, 30]}); }); editor3DStrokeEnd();
        var before = live(1);
        editor3DChangePart('prefabs', (prefabs)=> ({...prefabs, House: {objects: [{id: 1, type: 'Box'}]}}));
        editor3DStrokeEnd();`);
    assert.deepEqual([run('live(1).parts.length'), run('live(3).parts.length')], [1, 1]);
    assert.equal(run('before.destroyed && before.parts.every((p)=> p.destroyed)'), true, 'the old ones are gone');
    run('editor3DUndo()');
    assert.deepEqual([run('live(1).parts.length'), run('live(3).parts.length')], [2, 2]);
});

// a level of two unit boxes, one low and one higher beside it, both selected
const pairCode = `
    var level = { littlejs3D: 1, objects: [
        { id: 1, type: 'Box', pos: [1, .5, 0] }, { id: 2, type: 'Box', pos: [3, 1.5, 0] }] };
    editorJSONFetched('levels/pair.json', level);
    level3DLoad(level);
    var live = (id)=> editor3DInstances.get(id);
    var list = ()=> level.objects;
    editor3DSelection.add(1); editor3DSelection.add(2);`;

test('Make prefab turns the selection into a prefab about its bottom centre, and one instance of it, as one undo', async ()=>
{
    const { run } = await loadGame();
    run(pairCode);
    assert.equal(run(`editor3DMakePrefab('Pair')`), true);
    assert.deepEqual(json(run, 'level.prefabs'), {Pair: {objects: [
        {id: 1, type: 'Box', pos: [-1, .5, 0]}, {id: 2, type: 'Box', pos: [1, 1.5, 0]}]}});
    assert.deepEqual(json(run, 'list()'), [{id: 3, type: 'Pair', pos: [2, 0, 0]}]);
    assert.deepEqual(json(run, '[...editor3DSelection]'), [3], 'the instance is selected');
    assert.deepEqual(json(run, 'live(3).parts.map((p)=> p.pos3D)'), [{x: 1, y: .5, z: 0}, {x: 3, y: 1.5, z: 0}],
        'and nothing moved');
    assert.equal(run('editor3DUndoList.length'), 1);
    run('editor3DUndo()');
    assert.deepEqual([json(run, 'list().map((o)=> o.type)'), run(`'prefabs' in level`), run(`level3DTypes.has('Pair')`)],
        [['Box', 'Box'], false, false]);
});

test('a prefab is not made with a name a plain type or a prefab of the game has, or of itself', async ()=>
{
    const { run } = await loadGame();
    run(pairCode + `level3DAddPrefab('Shop', {objects: []});`);
    assert.equal(typeof run(`editor3DMakePrefab('Box')`), 'string');
    assert.equal(typeof run(`editor3DMakePrefab('Shop')`), 'string');
    assert.deepEqual(json(run, 'list().length'), 2, 'nothing changed');
    assert.equal(run(`editor3DMakePrefab('')`), true, 'with no name it is given one');
    assert.deepEqual(json(run, 'Object.keys(level.prefabs)'), ['Prefab 1']);
    run(`editor3DSelection.clear(); editor3DSelection.add(list()[0].id);`);
    assert.equal(typeof run(`editor3DMakePrefab('Prefab 1')`), 'string', 'it would hold itself');
    run('editor3DSelection.clear()');
    assert.equal(typeof run(`editor3DMakePrefab('Empty')`), 'string', 'nothing selected');
});

test('Unpack turns an instance into the objects it is made of, where they are, and making them a prefab again gives it back', async ()=>
{
    const { run } = await loadGame();
    run(pairCode + `editor3DMakePrefab('Pair'); var made = JSON.stringify(level.prefabs.Pair);
        editor3DChange((list)=> editor3DSetTransform(list[0], vec3(10, 0, 0), vec3(0, 90, 0))); editor3DStrokeEnd();`);
    assert.equal(run('editor3DUnpack()'), true);
    assert.deepEqual(json(run, 'list()'), [
        {id: 4, type: 'Box', pos: [10, .5, 1], rotation: [0, 90, 0]},
        {id: 5, type: 'Box', pos: [10, 1.5, -1], rotation: [0, 90, 0]}]);
    assert.deepEqual(json(run, '[...editor3DSelection]'), [4, 5]);
    assert.equal(run('editor3DUnpack()'), false, 'no instance selected now');
    run(`editor3DUndo(); editor3DChange((list)=> editor3DSetTransform(list[0], vec3(2, 0, 0), vec3())); editor3DStrokeEnd();
        editor3DSelection.clear(); editor3DSelection.add(3); editor3DUnpack(); editor3DMakePrefab('Pair');`);
    assert.equal(run('JSON.stringify(level.prefabs.Pair) === made'), true);
});

test('making a prefab with the name of one the level has replaces it, and every instance changes', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DSelection.add(2); editor3DMakePrefab('House');`);
    assert.equal(run('live(1).parts.length'), 1, 'the house placed before is the box now');
    assert.deepEqual(json(run, 'level.prefabs.House.objects.map((o)=> o.pos)'), [[0, .5, 0]]);
});

test('attached is the prefab\'s, set from the editor as one undo, and the prefab\'s file is a level file', async ()=>
{
    const { run } = await loadGame();
    run(fileCode);
    assert.equal(run(`editor3DPrefabSetAttached('House', true)`), true);
    assert.deepEqual([run('live(1).attached'), run('live(1).parts[0].parent === live(1)')], [true, true]);
    assert.deepEqual(JSON.parse(run(`editor3DPrefabJSON('House')`)), {littlejs3D: 1, attached: true, objects: [
        {id: 1, type: 'Box', pos: [2, .5, 0], scale: [4, 1, 1]}, {id: 2, type: 'Box', pos: [4, 1.5, 0]}]});
    run('editor3DUndo()');
    assert.equal(run('live(1).attached'), false);
    assert.equal('attached' in JSON.parse(run(`editor3DPrefabJSON('House')`)), false);
});

// inside the House: lift its post a unit
const liftPost = `editor3DChange((list)=> editor3DSetTransform(list[1], vec3(4, 2.5, 0))); editor3DStrokeEnd();`;

test('Edit prefab opens a prefab alone, the level it came from put away, and Back brings the level back', async ()=>
{
    const storage = makeStorage();
    const { run } = await loadGame({ localStorage: storage });
    run(fileCode + 'var house = live(1), box = live(2); editor3DSelection.add(1);');
    assert.equal(run('editor3DPrefabEnter()'), true);
    assert.deepEqual([run('editor3DLevel === level'), run('editor3DPrefabStack.length')], [false, 1]);
    assert.deepEqual(json(run, 'editor3DObjects().map((o)=> o.pos)'), [[2, .5, 0], [4, 1.5, 0]], 'about its own origin');
    assert.deepEqual([run('house.destroyed'), run('box.destroyed')], [true, true], 'the level is out of the way');
    assert.deepEqual(json(run, 'live(1).pos3D'), {x: 2, y: .5, z: 0}, 'the prefab\'s own objects are what is there');
    assert.equal(run('editor3DPrefabBack()'), true);
    assert.deepEqual([run('editor3DLevel === level'), run('editor3DPrefabStack.length')], [true, 0]);
    assert.deepEqual([run('live(1) instanceof Prefab3D'), run('live(2).destroyed'), json(run, 'live(1).parts[0].pos3D')],
        [true, false, {x: 12, y: .5, z: 0}]);
    assert.deepEqual(json(run, '[...editor3DSelection]'), [1], 'the selection it left with');
    assert.equal(run('editor3DUndoList.length'), 0, 'nothing changed, nothing to undo');
    assert.equal(run('editor3DPrefabBack()'), false, 'not inside one');
    assert.deepEqual(Object.keys(JSON.parse(storage.items['LittleJS editor 3D /game/'] ?? '{}')), [],
        'a prefab being edited has no autosave of its own');
});

test('an edit inside a prefab changes every instance, as one undo of the level', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DChange((list)=> { list.push({id: 3, type: 'House', pos: [0, 0, 30]}); }); editor3DStrokeEnd();
        editor3DSelection.add(1); editor3DPrefabEnter();` + liftPost);
    assert.equal(run('editor3DUndoList.length'), 1, 'the prefab has its own undo while it is open');
    run('editor3DPrefabBack()');
    assert.deepEqual(json(run, 'level.prefabs.House.objects[1].pos'), [4, 2.5, 0]);
    assert.deepEqual(json(run, '[live(1).parts[1].pos3D.y, live(3).parts[1].pos3D.y]'), [2.5, 2.5]);
    assert.equal(run('editor3DUndoList.length'), 2, 'the object added, and the prefab edited');
    run('editor3DUndo()');
    assert.deepEqual(json(run, '[level.prefabs.House.objects[1].pos, live(1).parts[1].pos3D.y]'), [[4, 1.5, 0], 1.5]);
});

test('a prefab inside a prefab is opened from inside it, and Back steps out one at a time', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DChangePart('prefabs', (p)=> ({...p, Street: {objects: [{id: 1, type: 'House', pos: [0, 0, 5]}]}}));
        editor3DChange((list)=> { list.push({id: 3, type: 'Street', pos: [0, 0, 50]}); }); editor3DStrokeEnd();
        editor3DPrefabEnter(3); editor3DPrefabEnter(1);` + liftPost);
    assert.deepEqual(json(run, 'editor3DPrefabStack.map((frame)=> frame.name)'), ['Street', 'House']);
    run('editor3DPrefabBack()');
    assert.deepEqual([run('editor3DPrefabStack.length'), run('live(1).parts[1].pos3D.y')], [1, 2.5],
        'in the street, its house shows the edit');
    run('editor3DPrefabBack()');
    assert.deepEqual(json(run, 'level.prefabs.House.objects[1].pos'), [4, 2.5, 0]);
    assert.deepEqual(json(run, '[live(1).parts[1].pos3D.y, live(3).parts[0].parts[1].pos3D.y]'), [2.5, 2.5]);
    assert.equal(run('editor3DUndoList.length'), 2, 'the street added, and what was edited inside, one undo');
});

test('a prefab the game added is edited the same way, and the game\'s prefab is what changes', async ()=>
{
    const { run } = await loadGame();
    run(`level3DAddPrefab('Shop', ${house});` +fileCode.replace(`type: 'Box', pos: [-20, .5, 0]`, `type: 'Shop', pos: [-20, 0, 0]`) +
        'editor3DPrefabEnter(2);' + liftPost + 'editor3DPrefabBack();');
    assert.deepEqual(json(run, `level3DPrefabs.get('Shop').objects[1].pos`), [4, 2.5, 0]);
    assert.deepEqual([run(`level3DPrefabs.get('Shop').fromLevel`), run(`'Shop' in level.prefabs`)], [false, false]);
    assert.equal(run('live(2).parts[1].pos3D.y'), 2.5);
    assert.ok(run('editor3DPrefabDirty.has("Shop")'), 'it waits to be saved to its file');
});

test('only an instance of a prefab can be opened, and closing the editor steps all the way out', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + 'levelEditor.open();');
    assert.equal(run('editor3DPrefabEnter(2)'), false, 'a box is not a prefab');
    assert.equal(run('editor3DPrefabEnter()'), false, 'nothing selected');
    run('editor3DPrefabEnter(1);' + liftPost + 'levelEditor.close();');
    assert.deepEqual([run('editor3DPrefabStack.length'), run('editor3DLevel === level')], [0, true]);
    assert.deepEqual(json(run, 'level.prefabs.House.objects[1].pos'), [4, 2.5, 0], 'and the edit is kept');
});

test('redo of Make prefab makes the instance again, and so does undoing a Reset to file', async ()=>
{
    const { run } = await loadGame();
    run(pairCode + `editor3DMakePrefab('Pair'); editor3DUndo(); editor3DUndo(true);`);
    assert.deepEqual([run('live(3) instanceof Prefab3D'), run('live(3).parts.length')], [true, 2]);
    run('editor3DRevert(); editor3DUndo();');
    assert.deepEqual([run('live(3) instanceof Prefab3D'), run('live(3).destroyed')], [true, false]);
});

test('inside a prefab, Make prefab and Attached wait for the level, and the level\'s prefabs stay as they are', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DChangePart('prefabs', (p)=> ({...p, Tower: {objects: [{id: 1, type: 'Box'}]}}));
        editor3DChange((list)=> { list.push({id: 3, type: 'Tower', pos: [0, 0, 40]}); }); editor3DStrokeEnd();
        editor3DPrefabEnter(1); editor3DSelection.add(1);`);
    assert.equal(typeof run(`editor3DMakePrefab('Post')`), 'string');
    assert.equal(run(`editor3DPrefabSetAttached('House', true)`), false);
    assert.deepEqual([run(`level3DTypes.has('Tower')`), run(`level3DTypes.has('House')`)], [true, true]);
    run(liftPost + 'editor3DPrefabBack();');
    assert.deepEqual(json(run, 'level.prefabs.House.objects[1].pos'), [4, 2.5, 0], 'the edit is the level\'s');
    assert.deepEqual([run(`level3DPrefabs.get('House').fromLevel`), run('live(3) instanceof Prefab3D')], [true, true]);
});

test('a prefab opened from a level made in code is the prefab, not the level\'s autosave', async ()=>
{
    // a level whose objects are what its prefab will hold: about the origin, on the ground, numbered from 1
    const { run } = await loadGame();
    run(`var level = { objects: [{ id: 1, type: 'Box', pos: [0, .5, 0] }, { id: 2, type: 'Box', pos: [0, 1.5, 0] }] };
        level3DLoad(level); editor3DSelection.add(1); editor3DSelection.add(2);
        editor3DMakePrefab('Stack'); editor3DPrefabEnter();`);
    assert.deepEqual(json(run, 'editor3DObjects().map((o)=> o.type)'), ['Box', 'Box']);
    run('editor3DPrefabBack()');
    assert.deepEqual(json(run, 'level.prefabs.Stack.objects.map((o)=> o.type)'), ['Box', 'Box']);
});

test('a scene set inside a prefab goes with it, and the level\'s shows again', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `var fog = render3D.fogEnd; editor3DPrefabEnter(1);
        editor3DChangeScene(()=> ({fog: [5, 77]})); editor3DStrokeEnd();`);
    assert.equal(run('render3D.fogEnd'), 77);
    run('editor3DPrefabBack()');
    assert.deepEqual([run('render3D.fogEnd === fog'), run(`'scene' in level`)], [true, false]);
});

test('a level the game loads while a prefab is open is not written into the prefab', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DPrefabEnter(1);
        var other = { objects: [{ id: 1, type: 'Sphere', pos: [0, 5, 0] }] }; level3DLoad(other);`);
    assert.equal(run('editor3DPrefabStack.length'), 0, 'the game has moved on');
    assert.equal(run('editor3DPrefabBack()'), false);
    assert.deepEqual([run('editor3DLevel === other'), json(run, 'level.prefabs.House.objects.length')], [true, 2]);
});

test('opening a prefab written without ids and going back with no edit changes nothing', async ()=>
{
    const { run } = await loadGame();
    run(`level3DAddPrefab('Hut', {objects: [{type: 'Box', pos: [0, .5, 0]}]});
        var level = { objects: [{ id: 1, type: 'Hut', pos: [0, 0, 0] }] }; level3DLoad(level);
        editor3DPrefabEnter(1); editor3DPrefabBack();`);
    assert.deepEqual([run('editor3DPrefabDirty.size'), json(run, `level3DPrefabs.get('Hut').objects`)],
        [0, [{type: 'Box', pos: [0, .5, 0]}]]);
});

test('the prefab that is open is not placed inside itself', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + 'editor3DPrefabEnter(1);');
    assert.equal(run(`editor3DPlace('House', vec3())`), undefined);
    assert.equal(run('editor3DObjects().length'), 2);
    assert.equal(typeof run(`editor3DPlace('Box', vec3())`), 'number');
});

test('an attached prefab is where it was: its box, its place in the level and what unpacking it gives', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + 'var box = JSON.stringify(editor3DPrefabBox(live(1)));' + `editor3DPrefabSetAttached('House', true);`);
    assert.equal(run('JSON.stringify(editor3DPrefabBox(live(1))) === box'), true, 'nothing moved on screen');
    assert.deepEqual(json(run, 'live(1).pos3D'), {x: 12.25, y: 1, z: 0}, 'the handle is the middle of its body');
    assert.deepEqual(json(run, '[list()[0].pos, editor3DBoxOffset(list()[0])]'), [[10, 0, 0], {x: 2.25, y: 1, z: 0}],
        'and the level still has it by its origin');
    run('editor3DChange((list)=> editor3DSetTransform(list[0], vec3(0, 0, 0))); editor3DStrokeEnd();');
    assert.deepEqual(json(run, 'live(1).parts[0].getWorldPos3D()'), {x: 2, y: .5, z: 0}, 'moved, by its origin');
    run('editor3DSelection.add(1); editor3DUnpack();');
    assert.deepEqual(json(run, 'list().filter((o)=> o.id > 2).map((o)=> o.pos)'), [[2, .5, 0], [4, 1.5, 0]]);
});

test('a prefab made of the level being edited is not placed in it, nor is one that holds it', async ()=>
{
    const { run } = await loadGame();
    run(`var level = { objects: [{ id: 1, type: 'Box', pos: [0, .5, 0] }] }; level3DLoad(level);
        level3DAddPrefab('Me', level); level3DAddPrefab('Wrap', {objects: [{type: 'Me'}]});
        level3DAddPrefab('Other', {objects: [{type: 'Box'}]});`);
    assert.deepEqual([run(`editor3DPlace('Me', vec3())`), run(`editor3DPlace('Wrap', vec3())`)], [undefined, undefined]);
    assert.equal(typeof run(`editor3DPlace('Other', vec3())`), 'number');
    assert.deepEqual(json(run, 'editor3DPlaceNames()'), ['Box', 'Sphere', 'Cylinder', 'Light', 'Other']);
});

test('a prefab being edited is autosaved with its level, as the level would be on going back', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode + 'editor3DPrefabEnter(1);' + liftPost);
    const saved = JSON.parse(storage.items['LittleJS editor 3D /game/'])['levels/town.json'];
    assert.deepEqual(saved.prefabs.House.objects[1].pos, [4, 2.5, 0]);
    assert.deepEqual(saved.objects.map((o)=> o.type), ['House', 'Box'], 'the level\'s objects, not the prefab\'s');
    // the page is loaded again while the prefab was open: the edit is in the level
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode);
    assert.deepEqual(json(engine.run, '[level.prefabs.House.objects[1].pos, live(1).parts[1].pos3D.y]'), [[4, 2.5, 0], 2.5]);
});

// the mouse over the ground at a place, for a paste
const mouseAt = (x, z)=> `editor3DMousePoint = ()=> vec3(${x}, 0, ${z}); editor3DMouseOnPanel = false;`;

test('an instance pasted at the mouse stands on the ground there, copied or cut', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + mouseAt(0, 20) + 'editor3DSelection.add(1); editor3DCopySelection(); editor3DPasteAtMouse();');
    assert.deepEqual(json(run, '[list()[2].type, list()[2].pos[1]]'), ['House', 0]);
    run(mouseAt(0, 40) + 'editor3DCut(); editor3DPasteAtMouse();');
    assert.deepEqual(json(run, '[list()[2].type, list()[2].pos[1]]'), ['House', 0], 'what was cut is as big as it was');
    run(mouseAt(50, 50) + `editor3DSelection.clear(); editor3DSelection.add(2); editor3DCut(); editor3DPasteAtMouse();`);
    assert.deepEqual(json(run, 'list()[2].pos[1]'), .5, 'a plain box too');
});

test('an instance placed from the list stands with its bottom on what is under the mouse', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + `editor3DPlaceAt('House', down(0, 9, 20));`);
    assert.deepEqual(json(run, '[list()[2].type, list()[2].pos[1], live(list()[2].id).parts[0].pos3D.y]'),
        ['House', 0, .5]);
});

test('an instance with a part destroyed in play is whole again when the editor opens', async ()=>
{
    const { run } = await loadGame();
    run(fileCode + 'live(1).parts[1].destroy(); editor3DRestore();');
    assert.deepEqual(json(run, 'live(1).parts.map((p)=> p.destroyed)'), [false, false]);
});

test('Save inside a prefab writes the prefab as a file of its own, and Export does from the level', async ()=>
{
    const { run } = await loadGame();
    run(`var files = []; saveText = (text, name)=> files.push([name, JSON.parse(text)]);
        level3DAddPrefab('Shop', ${house});` + fileCode + `editor3DChange((list)=>
        { list.push({id: 3, type: 'Shop', pos: [0, 0, 30]}); }); editor3DStrokeEnd(); editor3DPrefabEnter(3);` + liftPost);
    await run('editor3DSave()');
    const [name, file] = JSON.parse(run('JSON.stringify(files[0])'));
    assert.deepEqual([name, file.littlejs3D, file.objects[1].pos], ['Shop.json', 1, [4, 2.5, 0]]);
    run('editor3DPrefabBack()');
    assert.equal(run('editor3DPrefabDirty.size'), 0, 'saved, it waits for nothing');
    assert.deepEqual(JSON.parse(run(`editor3DPrefabJSON('Shop')`)).objects[1].pos, [4, 2.5, 0], 'what Export writes');
});
