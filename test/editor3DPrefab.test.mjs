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
