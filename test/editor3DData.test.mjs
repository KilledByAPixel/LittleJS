import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor edits the level object the game gave level3DLoad: that object is the source of truth, what
// the game made from it is kept in line, and undo and the autosave cover every edit. Each test runs its own copy of
// the script build.

// a localStorage kept between engines, like the page's across a reload
function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
const location = { pathname: '/game/' };

async function loadGame(extra={}, plugin=true)
{
    const engine = loadEngine({ localStorage: makeStorage(), location, ...extra });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { ${plugin ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

// a floor, a crate worth 5 and a player start, loaded as a game loads it
const levelCode = `
    class Crate extends EngineObject3D { constructor(pos) { super(pos, render3D.boxMesh); this.health = 0; } }
    level3DAddType('Crate', Crate, { health: 3, tint: hsl(0, 0, 1), spot: vec3() });
    var start, starts = 0;
    level3DAddType('Start', (pos)=> { start = pos; ++starts; });
    var level = { littlejs3D: 1, objects: [
        { id: 1, type: 'Box', pos: [0, .5, 0], scale: [4, 1, 4] },
        { id: 2, type: 'Crate', pos: [1, 1.5, 0], properties: { health: 5 } },
        { id: 3, type: 'Start', pos: [0, 2, 3] }] };
    var made = level3DLoad(level);
    var live = (id)=> editor3DInstances.get(id);
    var list = ()=> level.objects;
    var move = (id, pos)=> editor3DChange((l)=> editor3DSetTransform(l.find((o)=> o.id === id), pos));`;

// the level as a file loads it, from its url, on each page load
const fileCode = levelCode.replace('var made = level3DLoad', `editorJSONFetched('levels/room.json', level);
    var made = level3DLoad`);

test('what a game makes from its level is linked to the level\'s objects by id', async ()=>
{
    const { run } = await loadGame();
    run(levelCode);
    assert.deepEqual([...run('[live(1) === made[0], live(2) === made[1], live(3), editor3DLevel === level]')],
        [true, true, undefined, true]);
});

test('an object with no id, or one already used, gets a new one when the level loads', async ()=>
{
    const { run } = await loadGame();
    run(`var level = { objects: [{ id: 4, type: 'Box', pos: [0, 0, 0] }, { type: 'Box', pos: [1, 0, 0] },
        { id: 4, type: 'Box', pos: [2, 0, 0] }, { id: 'x', type: 'Box', pos: [3, 0, 0] }] };
        level3DLoad(level)`);
    assert.deepEqual(json(run, 'level.objects.map((o)=> o.id)'), [4, 5, 6, 7]);
    assert.equal(run('editor3DInstances.size'), 4);
});

test('moving an object moves its game object where it is, and undo moves both back', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `var crate = live(2); crate.health = 1; move(2, vec3(3, 1.5, 2)); editor3DStrokeEnd();`);
    assert.deepEqual(json(run, 'list()[1].pos'), [3, 1.5, 2]);
    assert.deepEqual([...run('[crate.pos3D.x, crate.pos3D.z, live(2) === crate, crate.health]')], [3, 2, true, 1]);
    assert.equal(run('editor3DUndo()'), true);
    assert.deepEqual(json(run, 'list()[1].pos'), [1, 1.5, 0]);
    assert.deepEqual([...run('[crate.pos3D.x, crate.pos3D.z]')], [1, 0]);
    assert.equal(run('editor3DUndo(true)'), true);
    assert.deepEqual([...run('[crate.pos3D.x, crate.pos3D.z]')], [3, 2]);
    assert.equal(run('editor3DUndo(true)'), false, 'nothing more to redo');
});

test('a rotation is kept in degrees and a scale multiplies the made scale, each left out when it is the default', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `editor3DChange((l)=> editor3DSetTransform(l[1], undefined, vec3(0, 90, 0), vec3(2, 1, 1)));
        editor3DStrokeEnd();`);
    assert.deepEqual(json(run, 'list()[1]'),
        { id: 2, type: 'Crate', pos: [1, 1.5, 0], properties: { health: 5 }, rotation: [0, 90, 0], scale: [2, 1, 1] });
    near(run('live(2).rotation3D.y'), Math.PI / 2);
    near(run('live(2).scale3D.x'), 2);
    run(`editor3DChange((l)=> editor3DSetTransform(l[1], vec3(1.00004, 1.5, 0), vec3(), vec3(1)));
        editor3DStrokeEnd();`);
    assert.deepEqual(json(run, 'list()[1]'), { id: 2, type: 'Crate', pos: [1, 1.5, 0], properties: { health: 5 } });
});

test('adding an object makes its game object, deleting one destroys it, and undo goes back', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `var id = editor3DPlace('Crate', vec3(5, .5, 5)); editor3DStrokeEnd();`);
    assert.deepEqual([...run('[id, list().length, live(4) instanceof Crate, live(4).health, [...editor3DSelection][0]]')],
        [4, 4, true, 3, 4]);
    run('editor3DUndo()');
    assert.deepEqual([...run('[list().length, live(4), editor3DSelection.size]')], [3, undefined, 0]);
    run('editor3DSelection.add(2); var crate = live(2); editor3DDelete()');
    assert.deepEqual([...run('[list().length, crate.destroyed, live(2)]')], [2, true, undefined]);
    run('editor3DUndo()');
    assert.deepEqual([...run('[list().length, live(2) instanceof Crate, live(2).health]')], [3, true, 5]);
    assert.equal(run(`editor3DSelection.clear(); editor3DDelete()`), false, 'nothing selected');
});

test('a property is saved only where it differs from the default, and the object is made again with it', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `var object = { id: 9, type: 'Crate', properties: { health: 5 } };
        editor3DSetProperty(object, 'health', 3, 3)`);
    assert.equal(run('object.properties'), undefined, 'back to the default, nothing kept');
    run(`editor3DSetProperty(object, 'health', 2.5, 3); editor3DSetProperty(object, 'tint', hsl(0, 1, .5, .5), hsl(0, 0, 1));
        editor3DSetProperty(object, 'spot', vec3(1, 2, 3), vec3())`);
    assert.deepEqual(json(run, 'object.properties'), { health: 2.5, tint: '#ff000080', spot: [1, 2, 3] });
    run(`editor3DSetProperty(object, 'tint', hsl(.333333, 1, .5), hsl(0, 0, 1))`);
    assert.match(run('object.properties.tint'), /^#[0-9a-f]{6}$/i, 'no alpha when it is 1');
    run(`var crate = live(2); editor3DChange((l)=> editor3DSetProperty(l[1], 'health', 7, 3)); editor3DStrokeEnd();`);
    assert.deepEqual([...run('[live(2).health, live(2) !== crate, crate.destroyed]')], [7, true, true]);
});

test('a type made by an arrow function is called again when its object moves', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `move(3, vec3(4, 2, 1)); editor3DStrokeEnd();`);
    assert.deepEqual([...run('[start.x, start.y, start.z, starts]')], [4, 2, 1, 2]);
});

test('a drag is one undo, and a cancelled one leaves nothing to undo', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `move(2, vec3(2, 1.5, 0)); move(2, vec3(3, 1.5, 0)); move(2, vec3(4, 1.5, 0)); editor3DStrokeEnd();`);
    assert.equal(run('editor3DUndoList.length'), 1);
    run('editor3DUndo()');
    near(run('live(2).pos3D.x'), 1);
    run(`move(2, vec3(2, 1.5, 0)); move(2, vec3(3, 1.5, 0)); editor3DStrokeCancel()`);
    near(run('live(2).pos3D.x'), 1);
    assert.deepEqual(json(run, 'list()[1].pos'), [1, 1.5, 0]);
    assert.deepEqual([...run('[editor3DUndoList.length, editor3DRedoList.length]')], [0, 1]);
    run(`move(2, vec3(1, 1.5, 0)); editor3DStrokeEnd()`);
    assert.equal(run('editor3DUndoList.length'), 0, 'a change to the same place is no change');
});

test('copy and paste make new objects with new ids, selected, and cut takes the old ones away', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `editor3DSelection.add(1); editor3DSelection.add(2); editor3DCopySelection();
        editor3DPaste(vec3(10, 0, 0))`);
    assert.deepEqual(json(run, 'list().map((o)=> [o.id, o.type, o.pos[0]])'),
        [[1, 'Box', 0], [2, 'Crate', 1], [3, 'Start', 0], [4, 'Box', 10], [5, 'Crate', 11]]);
    assert.deepEqual(json(run, '[...editor3DSelection]'), [4, 5]);
    assert.deepEqual(json(run, 'list()[4].properties'), { health: 5 });
    assert.equal(run('editor3DUndoList.length'), 1, 'one undo for the paste');
    run('editor3DCut()');
    assert.deepEqual(json(run, 'list().map((o)=> o.id)'), [1, 2, 3]);
    run('editor3DPaste()');
    assert.deepEqual(json(run, 'list().map((o)=> [o.id, o.pos[0]])'), [[1, 0], [2, 1], [3, 0], [4, 10], [5, 11]]);
    assert.equal(run(`editor3DSelection.clear(); editor3DCopySelection()`), false);
});

test('duplicate copies the selection in place, selects the copies and leaves the clipboard', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `editor3DSelection.add(1); editor3DCopySelection(); editor3DSelection.clear();
        editor3DSelection.add(2); editor3DDuplicate()`);
    assert.deepEqual(json(run, 'list().map((o)=> [o.id, o.type, o.pos[0]])'),
        [[1, 'Box', 0], [2, 'Crate', 1], [3, 'Start', 0], [4, 'Crate', 1]]);
    assert.deepEqual(json(run, '[...editor3DSelection]'), [4]);
    assert.equal(run('editor3DClipboard[0].type'), 'Box');
});

test('opening the editor pauses the game and puts every object back where the level has it', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `var crate = live(2); crate.pos3D = vec3(9, 9, 9); crate.velocity3D = vec3(1, 0, 0);
        crate.rotation3D = vec3(1, 1, 1); live(1).destroy(); levelEditor.open()`);
    assert.deepEqual([...run('[levelEditor.isOpen, editor3DIsOpen, editorIsOpen, paused, inputCaptureOn]')],
        [true, true, false, true, true]);
    assert.deepEqual([...run('[crate.pos3D.x, crate.pos3D.y, crate.velocity3D.x, crate.rotation3D.x]')], [1, 1.5, 0, 0]);
    assert.deepEqual([...run('[live(1).destroyed, live(1).scale3D.x, starts]')], [false, 4, 1]);
    run('levelEditor.close()');
    assert.deepEqual([...run('[levelEditor.isOpen, paused, inputCaptureOn, editor3DSession]')], [false, false, false, false]);
});

test('closing gives back the pause the game had, and a second session keeps the editor\'s camera', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `setPaused(true); levelEditor.open(); editor3DCamera.pos = vec3(5, 5, 5); editor3DSetOpen(false)`);
    assert.deepEqual([...run('[paused, editor3DSession]')], [true, true], 'playing in the session');
    run('editor3DSetOpen(true)');
    near(run('editor3DCamera.pos.x'), 5);
    run('levelEditor.close(); levelEditor.open()');
    near(run('editor3DCamera.pos.x'), 0, 'a new session starts at the game\'s camera');
});

test('the level editor is the 3D one with a 3D level, and the 2D one without or when told', async ()=>
{
    let engine = await loadGame();
    engine.run('levelEditor.open()');
    assert.deepEqual([...engine.run('[editor3DIsOpen, editorIsOpen]')], [false, true], 'no 3D level');
    engine = await loadGame();
    engine.run(levelCode + 'levelEditor.use3D = false; levelEditor.open()');
    assert.deepEqual([...engine.run('[editor3DIsOpen, editorIsOpen]')], [false, true], 'told to be 2D');
    engine = await loadGame();
    engine.run('levelEditor.use3D = true; levelEditor.open()');
    assert.deepEqual([...engine.run('[editor3DIsOpen, editorIsOpen, typeof editor3DLevel]')], [true, false, 'object'],
        'told to be 3D, with a new level');
    engine = await loadGame({}, false);
    engine.run('levelEditor.use3D = true; levelEditor.open()');
    assert.deepEqual([...engine.run('[editor3DIsOpen, editorIsOpen]')], [false, true], 'no Render3DPlugin');
});

test('the free camera goes off when the editor opens', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + 'editor3DSetFreeCamera(true); levelEditor.open()');
    assert.deepEqual([...run('[editor3DFreeCamera, editor3DIsOpen, inputCaptureOn]')], [false, true, true]);
});

test('Restart rebuilds the level through the game\'s hook, and the same level loaded again keeps its undo', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `levelEditor.onRestart = ()=> { engineObjectsDestroy(); made = level3DLoad(level); };
        levelEditor.open(); move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd(); var crate = live(2); editor3DRestart()`);
    assert.deepEqual([...run('[editor3DIsOpen, editor3DSession, crate.destroyed, live(2) !== crate, live(2).pos3D.x]')],
        [false, true, true, true, 3]);
    assert.equal(run('editor3DUndoList.length'), 1);
    run('editor3DSetOpen(true); editor3DUndo()');
    near(run('live(2).pos3D.x'), 1);
});

test('Play from mouse hands the game a position when it is on', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `var from; levelEditor.onPlayFrom = (pos)=> from = pos; levelEditor.open();
        editor3DPlay(vec3(1, 2, 3))`);
    assert.equal(run('from'), undefined, 'off by default');
    run('editor3DSetOpen(true); editor3DPlayFromMouse = true; editor3DPlay(vec3(1, 2, 3))');
    assert.deepEqual([...run('[from.x, from.y, from.z, editor3DIsOpen]')], [1, 2, 3, false]);
});

test('the level as JSON reads back the same, an object to a line, and keeps what else the level has', async ()=>
{
    const { run } = await loadGame();
    run(levelCode + `level.notes = { by: 'hand, "quoted"' }; editor3DPlace('Light', vec3(0, 3, 0)); editor3DStrokeEnd();
        var text = editor3DLevelJSON()`);
    assert.deepEqual(JSON.parse(run('text')), json(run, 'level'));
    const lines = run('text').split('\n');
    assert.equal(lines[0], '{');
    assert.equal(lines[1], '  "littlejs3D": 1,');
    assert.equal(lines[2], `  "notes": {"by": "hand, \\"quoted\\""},`);
    assert.equal(lines[3], '  "objects": [');
    assert.equal(lines[4], '    {"id": 1, "type": "Box", "pos": [0, 0.5, 0], "scale": [4, 1, 4]},');
    assert.equal(lines[5], '    {"id": 2, "type": "Crate", "pos": [1, 1.5, 0], "properties": {"health": 5}},');
    assert.equal(lines[7], '    {"id": 4, "type": "Light", "pos": [0, 3, 0]}');
    assert.equal(run('editor3DLevelJSON({})'), '{\n  "littlejs3D": 1,\n  "objects": []\n}\n');
});

test('edits are autosaved and come back when the same file loads again', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode + `move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd();`);
    assert.ok(storage.items['LittleJS editor 3D /game/'], 'saved under the page');
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode);
    assert.deepEqual(json(engine.run, 'list()[1].pos'), [3, 1.5, 0]);
    near(engine.run('live(2).pos3D.x'), 3);
    engine.run('editor3DUndoList.length = 0; move(2, vec3(1, 1.5, 0)); editor3DStrokeEnd()');
    assert.deepEqual(JSON.parse(storage.items['LittleJS editor 3D /game/']), {}, 'back to the file, nothing to keep');
});

test('a file that changed under its autosave waits for Apply or Drop', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode + `move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd();`);
    const changed = fileCode.replace('[0, 2, 3]', '[0, 2, 9]');
    engine = await loadGame({ localStorage: storage });
    engine.run(changed);
    assert.deepEqual(json(engine.run, 'list()[1].pos'), [1, 1.5, 0], 'the file as it is');
    assert.equal(engine.run('!!editor3DRecords.get(level).pending'), true);
    assert.equal(engine.run('move(2, vec3(5, 1.5, 0))'), false, 'no edits while it waits');
    engine.run('editor3DApplyPending()');
    assert.deepEqual(json(engine.run, '[list()[1].pos, list()[2].pos]'), [[3, 1.5, 0], [0, 2, 3]]);
    near(engine.run('live(2).pos3D.x'), 3);
    assert.equal(engine.run('!!editor3DRecords.get(level).pending'), false);
    engine.run('editor3DUndo()');
    assert.deepEqual(json(engine.run, 'list()[2].pos'), [0, 2, 9], 'applying can be undone');

    engine = await loadGame({ localStorage: storage });
    engine.run(changed.replace('[0, 2, 9]', '[0, 2, 8]') + 'editor3DDropPending()');
    assert.equal(engine.run('!!editor3DRecords.get(level).pending'), false);
    assert.deepEqual(JSON.parse(storage.items['LittleJS editor 3D /game/']), {});
});

// a file handle whose write waits until the test lets it finish, as a slow disk or a permission prompt does
function slowHandle(name)
{
    const handle = { name, written: undefined };
    handle.started = new Promise((resolve)=> handle.start = resolve);
    handle.waiting = new Promise((resolve)=> handle.finish = resolve);
    handle.createWritable = async ()=> ({ close: async ()=> {},
        write: async (text)=> { handle.written = JSON.parse(text); handle.start(); await handle.waiting; } });
    return handle;
}

test('a save takes what it wrote as saved, so an edit made while it writes stays in the autosave', async ()=>
{
    const storage = makeStorage(), handle = slowHandle('room.json');
    let engine = await loadGame({ localStorage: storage, showSaveFilePicker: async ()=> handle });
    engine.run(fileCode + `editorFileStore = {get: async ()=> undefined, set: async ()=> {}};
        move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd();`);
    const saving = engine.run('editor3DSave(true)');
    await handle.started;
    engine.run('move(2, vec3(4, 1.5, 0)); editor3DStrokeEnd()');
    handle.finish();
    assert.equal(await saving, 'written');
    assert.equal(handle.written.objects[1].pos[0], 3, 'the file has the edit made before the save');
    assert.equal(engine.run('editor3DRecords.get(level).original[1].pos[0]'), 3, 'and that is what is saved');
    const saved = JSON.parse(storage.items['LittleJS editor 3D /game/'])['levels/room.json'];
    assert.equal(saved?.objects[1].pos[0], 4, 'the edit made during the write is kept to recover');
});

test('a save that finishes after another level loaded updates the level it saved', async ()=>
{
    const storage = makeStorage(), handle = slowHandle('room.json');
    let engine = await loadGame({ localStorage: storage, showSaveFilePicker: async ()=> handle });
    engine.run(fileCode + `editorFileStore = {get: async ()=> undefined, set: async ()=> {}};
        move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd();`);
    const saving = engine.run('editor3DSave(true)');
    await handle.started;
    engine.run(`var other = { littlejs3D: 1, objects: [{ id: 1, type: 'Box', pos: [9, 0, 0] }] };
        level3DLoad(other);`);
    handle.finish();
    await saving;
    assert.equal(engine.run('editor3DRecords.get(level).original[1].pos[0]'), 3, 'the saved level is baselined');
    assert.equal(engine.run('editor3DRecords.get(other).original[0].pos[0]'), 9, 'the other is left as loaded');
    const saves = JSON.parse(storage.items['LittleJS editor 3D /game/']);
    assert.equal(saves['levels/room.json'], undefined, 'the saved level has nothing left to recover');
});

test('a level the game loads twice is not given its autosave twice', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode + `move(2, vec3(3, 1.5, 0)); editor3DStrokeEnd();`);
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode + `move(2, vec3(4, 1.5, 0)); engineObjectsDestroy(); level3DLoad(level)`);
    assert.deepEqual(json(engine.run, 'list()[1].pos'), [4, 1.5, 0], 'the edit in progress stays');
});

test('the release build has stubs for the loader\'s hooks and no editor', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.doesNotThrow(()=> run('editor3DLevelLoaded({}); editor3DObjectMade({}, {})'));
    assert.deepEqual([...run('[typeof editor3DChange, levelEditor.use3D, levelEditor.isOpen]')], ['undefined', undefined, false]);
});

// two levels made in code, not fetched from files
const twoLevels = `
    var levelA = { objects: [{ id: 1, type: 'Box', pos: [0, .5, 0] }] };
    var levelB = { objects: [{ id: 1, type: 'Sphere', pos: [5, .5, 0] }, { id: 2, type: 'Sphere', pos: [7, .5, 0] }] };
    var move = (id, pos)=> editor3DChange((l)=> editor3DSetTransform(l.find((o)=> o.id === id), pos));`;

test('levels made in code each keep an autosave of their own', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(twoLevels + `level3DLoad(levelA); move(1, vec3(2, .5, 0)); editor3DStrokeEnd();
        engineObjectsDestroy(); level3DLoad(levelB)`);
    assert.equal(engine.run('!!editor3DRecords.get(levelB).pending'), false, 'the other level\'s edits are not its');
    assert.equal(engine.run('move(2, vec3(9, .5, 0))'), true, 'it can be edited');
    engine.run('editor3DStrokeEnd()');
    engine = await loadGame({ localStorage: storage });
    engine.run(twoLevels + 'level3DLoad(levelA)');
    assert.deepEqual(json(engine.run, 'levelA.objects[0].pos'), [2, .5, 0]);
    engine.run('engineObjectsDestroy(); level3DLoad(levelB)');
    assert.deepEqual(json(engine.run, 'levelB.objects.map((o)=> [o.type, o.pos[0]])'), [['Sphere', 5], ['Sphere', 9]]);
});

test('undo belongs to the level it was made on', async ()=>
{
    const { run } = await loadGame();
    run(twoLevels + `level3DLoad(levelA); move(1, vec3(2, .5, 0)); editor3DStrokeEnd();
        editor3DSelection.add(1);
        engineObjectsDestroy(); level3DLoad(levelB); move(2, vec3(9, .5, 0)); editor3DStrokeEnd()`);
    assert.equal(run('editor3DSelection.size'), 0, 'the selection was the other level\'s');
    assert.equal(run('editor3DUndoList.length'), 1);
    run('engineObjectsDestroy(); level3DLoad(levelA); editor3DUndo()');
    assert.deepEqual(json(run, 'levelA.objects'), [{ id: 1, type: 'Box', pos: [0, .5, 0] }]);
    assert.equal(run('editor3DUndo()'), false, 'and nothing of the other level\'s to undo');
    run('engineObjectsDestroy(); level3DLoad(levelB); editor3DUndo()');
    assert.deepEqual(json(run, 'levelB.objects[1].pos'), [7, .5, 0]);
});

test('a value its type can not be made with leaves the object out, and undo brings it back', async ()=>
{
    const errors = [];
    const { run } = await loadGame({ console: { ...console, error: (...text)=> errors.push(text.join(' ')) } });
    run(`var level = { objects: [{ id: 1, type: 'Light', pos: [0, 3, 0] }] }; level3DLoad(level);
        var light = editor3DInstances.get(1)`);
    assert.equal(run(`editor3DChange((l)=> editor3DSetProperty(l[0], 'radius', -1, 5))`), true);
    run('editor3DStrokeEnd()');
    assert.equal(errors.length, 1);
    assert.deepEqual([...run('[light.destroyed, editor3DInstances.get(1), editor3DUndoList.length]')], [true, undefined, 1]);
    run('editor3DUndo()');
    assert.deepEqual([...run('[editor3DInstances.get(1).radius, level.objects[0].properties]')], [5, undefined]);
    // and a level that has such a value still loads, with the editor open on it
    run(`var bad = { objects: [{ id: 1, type: 'Light', pos: [0, 3, 0], properties: { radius: -1 } },
        { id: 2, type: 'Box', pos: [0, .5, 0] }] }; var made = level3DLoad(bad); levelEditor.open()`);
    assert.deepEqual([...run('[made.length, editor3DIsOpen, editor3DObjects().length]')], [1, true, 2]);
});

test('entries of a level that are not objects are dropped when the editor takes it', async ()=>
{
    const { run } = await loadGame();
    run(`var level = { objects: [null, { id: 1, type: 'Box', pos: [0, .5, 0] }, 5, 'x'] }; level3DLoad(level);
        levelEditor.open(); engineStep(2)`);
    assert.deepEqual(json(run, 'level.objects'), [{ id: 1, type: 'Box', pos: [0, .5, 0] }]);
    assert.equal(run('editor3DIsOpen'), true);
});
