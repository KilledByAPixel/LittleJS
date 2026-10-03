import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor edits a level's scene block as it edits its objects: a change shows at once, is one undo, is
// autosaved, and Save and Reset to file cover it. Without a block the view is what the game set.

function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
const location = { pathname: '/game/' };

async function loadGame(extra={})
{
    const engine = loadEngine({ localStorage: makeStorage(), location, ...extra });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-3, message ?? `${a} is not ${b}`);
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

// a level from a file with one box and no scene, in a game that set a fog of its own
const fileCode = (scene='')=> `
    render3D.setFog(3, 30, hsl(0, 0, .5));
    var level = { littlejs3D: 1, ${scene} objects: [{ id: 1, type: 'Box', pos: [0, .5, 0] }] };
    editorJSONFetched('levels/room.json', level);
    level3DLoad(level);
    var setFog = (start, end)=> editor3DChangeScene((scene={})=> ({...scene, fog: [start, end]}));`;

test('a scene change is in the level and on screen at once, and undo and redo take it back and forth', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + 'setFog(10, 50); editor3DStrokeEnd();');
    assert.deepEqual(json(run, 'level.scene'), {fog: [10, 50]});
    assert.deepEqual([...run('[render3D.fogStart, render3D.fogEnd]')], [10, 50]);
    assert.equal(run('editor3DUndo()'), true);
    assert.equal(run(`'scene' in level`), false, 'no block again');
    assert.deepEqual([...run('[render3D.fogStart, render3D.fogEnd]')], [3, 30], 'the game\'s own fog is back');
    assert.equal(run('editor3DUndo(true)'), true);
    assert.deepEqual(json(run, 'level.scene'), {fog: [10, 50]});
    assert.equal(run('render3D.fogEnd'), 50);
});

test('a slider drag is one undo, and a change to the same scene is none', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + 'setFog(10, 50); setFog(10, 60); setFog(10, 70); editor3DStrokeEnd();');
    assert.equal(run('editor3DUndoList.length'), 1);
    assert.equal(run('setFog(10, 70)'), false);
    run('editor3DStrokeEnd()');
    assert.equal(run('editor3DUndoList.length'), 1);
});

test('a sky the level set goes when the block does, the game\'s own setup back', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + `editor3DChangeScene(()=> ({sky: ['#ff0000', '#00ff00', '#0000ff'], shadows: true}));
        editor3DStrokeEnd();`);
    assert.equal(run('!!render3D.sky && render3D.shadows'), true);
    run('editor3DChangeScene(()=> undefined); editor3DStrokeEnd();');
    assert.equal(run('render3D.sky === undefined && render3D.shadows === false'), true);
    near(run('render3D.fogColor.r'), .5, 'the fog color the game set, not the horizon');
});

test('a scene edit is autosaved and comes back when the same file loads again', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode() + 'setFog(10, 50); editor3DStrokeEnd();');
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode());
    assert.deepEqual(json(engine.run, 'level.scene'), {fog: [10, 50]});
    assert.equal(engine.run('render3D.fogEnd'), 50);
    engine.run('editor3DChangeScene(()=> undefined); editor3DStrokeEnd()');
    assert.deepEqual(JSON.parse(storage.items['LittleJS editor 3D /game/']), {}, 'back to the file, nothing to keep');
});

test('a file whose scene changed under an autosave waits for Apply, which brings the scene edit back', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode('scene: {fog: [1, 2]},') + 'setFog(10, 50); editor3DStrokeEnd();');
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode('scene: {fog: [1, 9]},'));
    assert.equal(engine.run('!!editor3DRecords.get(level).pending'), true);
    assert.deepEqual(json(engine.run, 'level.scene'), {fog: [1, 9]}, 'the file as it is');
    engine.run('editor3DApplyPending()');
    assert.deepEqual(json(engine.run, 'level.scene'), {fog: [10, 50]});
    assert.equal(engine.run('render3D.fogEnd'), 50);
});

test('Reset to file puts the scene back as the file has it, as one undo', async ()=>
{
    const { run } = await loadGame();
    run(fileCode('scene: {fog: [1, 2]},') + 'setFog(10, 50); editor3DStrokeEnd(); editor3DRevert();');
    assert.deepEqual(json(run, 'level.scene'), {fog: [1, 2]});
    assert.equal(run('render3D.fogEnd'), 2);
    run('editor3DUndo()');
    assert.deepEqual(json(run, 'level.scene'), {fog: [10, 50]});
});

test('the saved file has the scene on a line before the objects, and a save makes it the file', async ()=>
{
    const storage = makeStorage();
    let written;
    const handle = { name: 'room.json', createWritable: async ()=>
        ({ write: async (text)=> { written = text; }, close: async ()=> {} }) };
    const engine = await loadGame({ localStorage: storage, showSaveFilePicker: async ()=> handle });
    engine.run(fileCode() + 'setFog(10, 50); editor3DStrokeEnd();');
    const text = engine.run('editor3DLevelJSON()');
    assert.ok(text.indexOf('"scene": {"fog": [10, 50]}') > 0 && text.indexOf('"scene"') < text.indexOf('"objects"'),
        text);
    assert.equal(await engine.run('editor3DSave()'), 'written');
    assert.deepEqual(JSON.parse(written).scene, {fog: [10, 50]});
    assert.equal(engine.run('editor3DRevert()'), false, 'already as the file has it');
    assert.deepEqual(json(engine.run, 'level.scene'), {fog: [10, 50]});
});

test('the scene on screen reads as a block, to start a level\'s scene from', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + `render3D.setSky(rgb(1, 0, 0), rgb(0, 1, 0), rgb(0, 0, 1), .25);
        render3D.sunDirection = vec3(0, 2, 0); render3D.shadows = true;`);
    assert.deepEqual(json(run, 'editor3DSceneFromView()'), {sky: ['#ff0000', '#00ff00', '#0000ff'], ambient: .25,
        sunDirection: [0, 1, 0], sunColor: '#ffffff', fog: [3, 30], fogColor: '#00ff00', shadows: true, lensFlare: false});
    run('render3D.sky = undefined');
    assert.equal(json(run, 'editor3DSceneFromView()').sky, undefined, 'no sky, no sky colors');
});

test('the sun as two angles: around from +z toward +x, and its height over the horizon', async ()=>
{
    const { run } = await loadGame();
    assert.deepEqual(json(run, 'editor3DSunAngles([0, 1, 0])'), [0, 90]);
    assert.deepEqual(json(run, 'editor3DSunAngles([1, 0, 0])'), [90, 0]);
    assert.deepEqual(json(run, 'editor3DSunAngles([0, 1, 1])'), [0, 45]);
    const back = json(run, 'editor3DSunDirection(90, 30)');
    near(back[0], .866), near(back[1], .5), near(back[2], 0);
    assert.deepEqual(json(run, 'editor3DSunAngles(editor3DSunDirection(200, 35))'), [200, 35]);
});

test('the lens flare of a scene comes and goes with the block, and a new block says whether the sun has one', async ()=>
{
    const { run } = await loadGame();
    const flares = ()=> run('engineObjects.filter((o)=> o instanceof LensFlare3D && !o.destroyed).length');
    run(fileCode() + 'editor3DChangeScene((scene={})=> ({...scene, lensFlare: true})); editor3DStrokeEnd();');
    assert.deepEqual([flares(), json(run, 'level.scene')], [1, {lensFlare: true}]);
    assert.equal(run('editor3DSceneFromView().lensFlare'), true);
    run('setFog(10, 50); editor3DStrokeEnd();');
    assert.equal(flares(), 1, 'another change of the scene leaves one flare');
    run('editor3DUndo(); editor3DUndo();');
    assert.equal(flares(), 0, 'the block gone, the flare is gone');
    assert.equal(run('editor3DSceneFromView().lensFlare'), false);
});

test('a sun flare an earlier level gave the scene stays through an edit of this level\'s scene, and its undo', async ()=>
{
    const { run } = await loadGame();
    run(`level3DLoad({littlejs3D: 1, scene: {lensFlare: true}, objects: []});
        level3DLoad({littlejs3D: 1, objects: []});`);
    const flare = ()=> run('level3DSunHasFlare()');
    assert.equal(flare(), true, 'the second level leaves the scene as it was');
    run('editor3DChangeScene((scene={})=> ({...scene, fog: [3, 30]})); editor3DStrokeEnd();');
    assert.equal(flare(), true, 'after an edit of the fog');
    run('editor3DUndo()');
    assert.equal(flare(), true, 'and after its undo');
    run('editor3DChangeScene((scene={})=> ({...scene, lensFlare: false})); editor3DStrokeEnd();');
    assert.equal(flare(), false, 'a level that says no flare has none');
    run('editor3DUndo()');
    assert.equal(flare(), true, 'and its undo brings back the one it had');
});
