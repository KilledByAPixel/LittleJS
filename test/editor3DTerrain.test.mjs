import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor sculpts a level's terrain: the terrain is the level's terrain block, a press of the brush is
// one undo, it is autosaved and saved with the level, and the brush raises, lowers and smooths under a soft circle.

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

// a level from a file; with a terrain 8 units across, 10 tall, 9 samples a side a unit apart, flat at .2 with its
// surface at y 0, when asked
const flat = JSON.stringify(Array.from({length: 9}, ()=> Array(9).fill(.2)));
const withTerrain = `terrain: {pos: [0, -2, 0], size: [8, 8], height: 10, heights: ${flat}},`;
const fileCode = (terrain='')=> `
    var level = { littlejs3D: 1, ${terrain} objects: [{ id: 1, type: 'Box', pos: [20, .5, 20] }] };
    editorJSONFetched('levels/room.json', level);
    level3DLoad(level);
    var terrains = ()=> engineObjects.filter((o)=> o instanceof HeightMap && !o.destroyed);
    var h = (row, column)=> editor3DTerrainMap().heights[row][column];
    editor3DTerrainBrush.size = 4; editor3DTerrainBrush.strength = .5;`;

test('adding a terrain gives the level a terrain block, flat with its surface on the ground, undo takes it away', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + 'editor3DTerrainAdd(vec2(64), 64, 16);');
    const terrain = json(run, 'level.terrain');
    assert.deepEqual([terrain.pos, terrain.size, terrain.height], [[0, -3.2, 0], [64, 64], 16]);
    assert.deepEqual([terrain.heights.length, terrain.heights[0].length, terrain.heights[3][7]], [65, 65, .2]);
    assert.equal(run('terrains().length'), 1);
    near(run('editor3DTerrainMap().getHeight(5, 5)'), 0);
    run('editor3DUndo()');
    assert.deepEqual([run(`'terrain' in level`), run('terrains().length'), run('editor3DTerrainMap()')],
        [false, 0, undefined]);
});

test('the brush raises the ground under a soft circle, most in its middle and nothing at its edge', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain));
    assert.equal(run(`editor3DTerrainSculpt(vec3(0, 0, 0), 'raise', 1)`), true);
    near(run('h(4, 4)'), .7, 'the middle, 5 units up in a second at this strength');
    near(run('h(4, 5)'), .45, 'half way out, half as much');
    near(run('h(4, 6)'), .2, 'the edge of the brush');
    near(run('h(0, 0)'), .2);
    assert.equal(json(run, 'level.terrain.heights[4][4]'), .2, 'the level has it when the stroke ends');
    run('editor3DStrokeEnd()');
    assert.equal(json(run, 'level.terrain.heights[4][4]'), .7);
    assert.equal(run('editor3DUndoList.length'), 1);
    run('editor3DUndo()');
    near(run('h(4, 4)'), .2);
    assert.equal(run('terrains().length'), 1, 'the same map, put back');
    run('editor3DUndo(true)');
    near(run('h(4, 4)'), .7);
});

test('lower digs, both stop at the terrain\'s range, and smooth evens a spike out', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `editor3DTerrainSculpt(vec3(0, 0, 0), 'lower', .2);`);
    near(run('h(4, 4)'), .1);
    run(`editor3DTerrainSculpt(vec3(0, 0, 0), 'lower', 9); editor3DTerrainSculpt(vec3(3, 0, 3), 'raise', 9);`);
    assert.deepEqual([...run('[h(4, 4), h(7, 7)]')], [0, 1]);
    run(`editor3DStrokeEnd(); editor3DUndo(); editor3DTerrainMap().heights[4][4] = 1;
        editor3DTerrainSculpt(vec3(0, 0, 0), 'smooth', .1);`);
    near(run('h(4, 4)'), .6, 'half way to the average of the samples around it');
    assert.equal(run(`editor3DTerrainSculpt(vec3(50, 0, 50), 'raise', 1)`), false, 'off the terrain');
});

test('a stroke that is cancelled puts the ground back, with nothing to undo', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `editor3DTerrainSculpt(vec3(0, 0, 0), 'raise', 1); editor3DStrokeCancel();`);
    near(run('h(4, 4)'), .2);
    assert.equal(run('editor3DUndoList.length'), 0);
});

test('sculpting is autosaved and comes back when the same file loads again, and the file has the terrain', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode(withTerrain) + `editor3DTerrainSculpt(vec3(0, 0, 0), 'raise', 1); editor3DStrokeEnd();`);
    assert.ok(engine.run('editor3DLevelJSON()').includes('"terrain": {"pos": [0, -2, 0], "size": [8, 8], "height": 10'));
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode(withTerrain));
    near(engine.run('h(4, 4)'), .7);
    assert.equal(engine.run('terrains().length'), 1, 'one terrain, made with the edits in it');
    engine.run('editor3DRevert()');
    near(engine.run('h(4, 4)'), .2);
    assert.deepEqual(JSON.parse(storage.items['LittleJS editor 3D /game/']), {}, 'back to the file, nothing to keep');
});

test('an undo step keeps a copy of the terrain only when the terrain changed', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `
        editor3DChange((list)=> editor3DSetTransform(list[0], vec3(21, .5, 20))); editor3DStrokeEnd();
        editor3DChange((list)=> editor3DSetTransform(list[0], vec3(22, .5, 20))); editor3DStrokeEnd();`);
    assert.equal(run(`editor3DUndoList[0].partsBefore.terrain === editor3DUndoList[1].partsAfter.terrain`), true,
        'moving an object twice shares one copy of the terrain');
    run(`editor3DTerrainSculpt(vec3(0, 0, 0), 'raise', 1); editor3DStrokeEnd();`);
    assert.equal(run(`editor3DUndoList[2].partsBefore.terrain === editor3DUndoList[2].partsAfter.terrain`), false);
    assert.equal(json(run, 'editor3DUndoList[2].partsBefore.terrain.heights[4][4]'), .2, 'and it is not changed after');
});

test('a level with no terrain has nothing to sculpt', async ()=>
{
    const { run } = await loadGame();
    run(fileCode());
    assert.equal(run(`editor3DTerrainSculpt(vec3(0, 0, 0), 'raise', 1)`), false);
});

test('opening the editor puts the terrain back as the level has it', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + 'editor3DTerrainMap().heights[4][4] = 1; editor3DRestore();');
    near(run('h(4, 4)'), .2);
});

// the paint of a 9 by 9 terrain with the 9 samples around its middle painted the first color
const middlePaint = [30, 0, 3, 1, 6, 0, 3, 1, 6, 0, 3, 1, 30, 0];
const hexAt = (row, column)=> `editor3DTerrainMap().colors[${row}][${column}].toString(false)`;

test('flatten brings the ground under the brush toward a height, most in its middle', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain));
    assert.equal(run(`editor3DTerrainSculpt(vec3(0, 0, 0), 'flatten', .1, .5)`), true);
    near(run('h(4, 4)'), .35, 'half way there in the middle');
    near(run('h(4, 5)'), .275, 'a quarter of the way half way out');
    near(run('h(0, 0)'), .2);
    assert.equal(run(`editor3DTerrainSculpt(vec3(3, 0, 3), 'flatten', 1, .2)`), false, 'ground at that height stays');
});

test('the paint brush colors the ground under it, saved in the level as a list of colors and runs', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `editor3DTerrainBrush.color = '#ff0000';`);
    assert.equal(run('editor3DTerrainMap().colors'), undefined, 'no paint yet');
    assert.equal(run('editor3DTerrainPaintAt(vec3(0, 0, 0))'), true);
    assert.equal(run(hexAt(4, 4)), '#ff0000');
    assert.equal(run(hexAt(4, 6)), '#ffffff', 'the edge of the brush keeps the terrain\'s color, white with none set');
    assert.equal(run('editor3DTerrainPaintAt(vec3(0, 0, 0))'), false, 'painted already');
    assert.equal(json(run, 'level.terrain.paint'), null, 'the level has it when the stroke ends');
    run('editor3DStrokeEnd()');
    assert.deepEqual(json(run, 'level.terrain.paint'), {colors: ['#ff0000'], cells: middlePaint});
    assert.ok(run('editor3DLevelJSON()').includes('"paint": {"colors": ["#ff0000"]'));
    run('editor3DUndo()');
    assert.deepEqual([json(run, 'level.terrain.paint'), run('editor3DTerrainMap().colors')], [null, undefined]);
    run('editor3DUndo(true)');
    assert.equal(run(hexAt(4, 4)), '#ff0000');
});

test('a second color joins the list, erasing takes paint off, and a color no longer used leaves the list', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `editor3DTerrainBrush.color = '#ff0000'; editor3DTerrainPaintAt(vec3(0, 0, 0));
        editor3DTerrainBrush.size = 1; editor3DTerrainBrush.color = '#0000ff';
        editor3DTerrainPaintAt(vec3(0, 0, 0)); editor3DStrokeEnd();`);
    assert.deepEqual(json(run, 'level.terrain.paint'), {colors: ['#ff0000', '#0000ff'],
        cells: [30, 0, 3, 1, 6, 0, 1, 1, 1, 2, 1, 1, 6, 0, 3, 1, 30, 0]});
    run('editor3DTerrainBrush.size = 4; editor3DTerrainPaintAt(vec3(0, 0, 0), true); editor3DStrokeEnd();');
    assert.equal(json(run, 'level.terrain.paint'), null, 'all of it erased, no paint to keep');
    assert.equal(run('editor3DTerrainMap().colors'), undefined);
});

test('a level\'s painted terrain loads with its colors over the terrain\'s own, and paint that does not fit is left out', async ()=>
{
    const { run } = await loadGame();
    const painted = withTerrain.replace('height: 10,',
        `height: 10, color: '#00ff00', paint: {colors: ['#ff0000'], cells: ${JSON.stringify(middlePaint)}},`);
    run(fileCode(painted));
    assert.deepEqual([run(hexAt(4, 4)), run(hexAt(0, 0)), run('editor3DTerrainMap().color.toString(false)')],
        ['#ff0000', '#00ff00', '#ffffff']);
    const { run: other } = await loadGame();
    other(fileCode(withTerrain.replace('height: 10,', `height: 10, paint: {colors: ['#ff0000'], cells: [5, 1]},`)));
    assert.equal(other('editor3DTerrainMap().colors'), undefined);
});

test('the Terrain tool\'s X goes around its brushes, and a press with the flatten brush takes the height pressed', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withTerrain) + `editor3DTool = 'terrain';`);
    assert.equal(run('editor3DTerrainBrush.mode'), 'sculpt');
    run('editor3DKeys.KeyX()');
    assert.equal(run('editor3DTerrainBrush.mode'), 'flatten');
    assert.deepEqual({...run(`editor3DTerrainPress(vec3(0, 3, 0), false, false)`)},
        {kind: 'terrain', mode: 'flatten', level: .5});
    run('editor3DKeys.KeyX()');
    assert.deepEqual({...run(`editor3DTerrainPress(vec3(0, 0, 0), true, false)`)}, {kind: 'terrain', mode: 'erase'});
    run('editor3DKeys.KeyX()');
    assert.deepEqual({...run(`editor3DTerrainPress(vec3(0, 0, 0), true, false)`)}, {kind: 'terrain', mode: 'lower'});
});
