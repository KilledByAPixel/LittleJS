import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor paints a level's block map: the map is the level's voxels block, a stroke of painting is one
// undo, it is autosaved and saved with the level, and a ray from the mouse says which cell a click is for.

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
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

// a level from a file, with a 4 by 3 by 4 map at the origin when asked, a block at (1, 0, 1)
const fileCode = (voxels='')=> `
    var level = { littlejs3D: 1, ${voxels} objects: [{ id: 1, type: 'Box', pos: [9, .5, 9] }] };
    editorJSONFetched('levels/room.json', level);
    level3DLoad(level);
    var maps = ()=> engineObjects.filter((o)=> o instanceof VoxelMap && !o.destroyed);
    var at = (x, y, z)=> editor3DVoxelMap().getVoxel(vec3(x, y, z));
    var down = (x, z)=> new Ray3D(vec3(x, 20, z), vec3(0, -1, 0));`;
const withMap = `voxels: {pos: [0, 0, 0], size: [4, 3, 4], blocks: [13, 0, 1, 5]},`;

test('adding a map gives the level a voxels block and makes the map, undo takes both away', async ()=>
{
    const { run } = await loadGame();
    run(fileCode() + 'editor3DVoxelAdd(vec3(32, 16, 32));');
    assert.deepEqual(json(run, 'level.voxels'), {pos: [-16, 0, -16], size: [32, 16, 32], blocks: [16384, 0]});
    assert.equal(run('maps().length'), 1);
    assert.equal(run('editor3DVoxelMap() === maps()[0]'), true);
    assert.equal(run('editor3DUndo()'), true);
    assert.equal(run(`'voxels' in level`), false);
    assert.equal(run('maps().length'), 0);
    assert.equal(run('editor3DVoxelMap()'), undefined);
    run('editor3DUndo(true)');
    assert.equal(run('maps().length'), 1);
});

test('a stroke of painting is one undo, in the map at once and in the level when it ends', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withMap));
    assert.equal(run('at(1, 0, 1)'), 5, 'the file\'s block');
    assert.equal(run('editor3DVoxelSet(vec3(0, 0, 0), 2)'), true);
    assert.equal(run('editor3DVoxelSet(vec3(1, 0, 0), 2)'), true);
    assert.equal(run('editor3DVoxelSet(vec3(1, 0, 0), 2)'), false, 'already that');
    assert.equal(run('editor3DVoxelSet(vec3(9, 0, 0), 2)'), false, 'outside the map');
    assert.equal(run('at(1, 0, 0)'), 2);
    run('editor3DStrokeEnd()');
    assert.deepEqual(json(run, 'level.voxels.blocks'), [2, 2, 11, 0, 1, 5, 34, 0]);
    assert.equal(run('editor3DUndoList.length'), 1);
    run('editor3DUndo()');
    assert.deepEqual([...run('[at(0, 0, 0), at(1, 0, 0), at(1, 0, 1), maps().length]')], [0, 0, 5, 1]);
    assert.deepEqual(json(run, 'level.voxels.blocks'), [13, 0, 1, 5, 34, 0], 'as the editor writes runs, to the end');
    run('editor3DUndo(true)');
    assert.deepEqual([...run('[at(0, 0, 0), at(1, 0, 0)]')], [2, 2]);
});

test('a stroke that is cancelled puts the blocks back, with nothing to undo', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withMap) + 'editor3DVoxelSet(vec3(0, 0, 0), 2); editor3DVoxelSet(vec3(1, 0, 1), 0); editor3DStrokeCancel();');
    assert.deepEqual([...run('[at(0, 0, 0), at(1, 0, 1), editor3DUndoList.length]')], [0, 5, 0]);
});

test('painted blocks are autosaved and come back when the same file loads again', async ()=>
{
    const storage = makeStorage();
    let engine = await loadGame({ localStorage: storage });
    engine.run(fileCode(withMap) + 'editor3DVoxelSet(vec3(3, 2, 3), 9); editor3DStrokeEnd();');
    engine = await loadGame({ localStorage: storage });
    engine.run(fileCode(withMap));
    assert.equal(engine.run('at(3, 2, 3)'), 9);
    assert.equal(engine.run('maps().length'), 1, 'one map, made with the edits in it');
    engine.run('editor3DVoxelSet(vec3(3, 2, 3), 0); editor3DStrokeEnd();');
    assert.deepEqual(JSON.parse(storage.items['LittleJS editor 3D /game/']), {}, 'back to the file, nothing to keep');
});

test('the saved file has the blocks on a line, and Reset to file puts them back', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withMap) + 'editor3DVoxelSet(vec3(0, 0, 0), 2); editor3DStrokeEnd();');
    const text = run('editor3DLevelJSON()');
    assert.ok(text.includes('"voxels": {"pos": [0, 0, 0], "size": [4, 3, 4], "blocks": [1, 2, 12, 0, 1, 5, 34, 0]}'), text);
    run('editor3DRevert()');
    assert.deepEqual([...run('[at(0, 0, 0), at(1, 0, 1)]')], [0, 5]);
});

test('a ray says which cell a click is for: against the face it hits, on the floor, or the block itself', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withMap));
    const target = (ray, mode)=> json(run, `(()=> { const t = editor3DVoxelTarget(${ray}, '${mode}');
        return t && [t.cell.x, t.cell.y, t.cell.z, t.axis, t.plane]; })()`);
    // straight down onto the block at (1, 0, 1): a new block goes on top of it, on the plane of its top face
    assert.deepEqual(target('down(1.5, 1.5)', 'place'), [1, 1, 1, 'y', 1]);
    assert.deepEqual(target('down(1.5, 1.5)', 'remove'), [1, 0, 1, 'y', 1]);
    // onto the empty floor: the cell standing on it, and nothing to remove there
    assert.deepEqual(target('down(3.5, 2.5)', 'place'), [3, 0, 2, 'y', 0]);
    assert.equal(target('down(3.5, 2.5)', 'remove'), null);
    // from the side, against the block's -x face
    assert.deepEqual(target('new Ray3D(vec3(-5, .5, 1.5), vec3(1, 0, 0))', 'place'), [0, 0, 1, 'x', 1]);
    // outside the map there is no cell, and none above its top
    assert.equal(target('down(9, 9)', 'place'), null);
    run('editor3DVoxelSet(vec3(1, 1, 1), 5); editor3DVoxelSet(vec3(1, 2, 1), 5);');
    assert.equal(target('down(1.5, 1.5)', 'place'), null, 'the map ends there');
});

test('a drag stays on the layer it started on', async ()=>
{
    const { run } = await loadGame();
    run(fileCode(withMap));
    const cell = (ray)=> json(run, `(()=> { const c = editor3DVoxelDragCell({axis: 'y', plane: 0, layer: 0}, ${ray});
        return c && [c.x, c.y, c.z]; })()`);
    assert.deepEqual(cell('down(2.5, 3.5)'), [2, 0, 3]);
    assert.deepEqual(cell('down(1.5, 1.5)'), [1, 0, 1], 'through the block that stands there, still the floor layer');
    assert.equal(cell('down(7, 7)'), null, 'off the map');
});

test('a level with no map has no cell to paint, and the release build has no editor', async ()=>
{
    const { run } = await loadGame();
    run(fileCode());
    assert.equal(run('editor3DVoxelSet(vec3(0, 0, 0), 2)'), false);
    assert.equal(run(`editor3DVoxelTarget(down(1, 1), 'place')`), undefined);
});
