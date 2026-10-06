import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor autosaves as the 2D one does: a small level at the end of every stroke, and a big one, whose
// autosave is over about 100,000 characters as a large terrain or block map makes it, once the edits stop for a
// moment; what waits is written when the editor closes, the page hides or another level loads, so nothing is lost.

// a headless engine with a storage that counts its writes, and timers kept to be run by hand; a level of count
// boxes, 3000 of them about 126,000 characters
async function editorGame(count)
{
    const items = {}, timers = [], writes = { count: 0 };
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); ++writes.count; } };
    const setTimeout = (f)=> (timers.push(f), timers.length);
    const clearTimeout = (id)=> { timers[id - 1] = undefined; };
    const engine = loadEngine({ localStorage, location: { pathname: '/game/' }, setTimeout, clearTimeout });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    engine.run(`var level = {littlejs3D: 1, objects: [...Array(${count})].map((_, i)=>
            ({id: i + 1, type: 'Box', pos: [i % 50, .5, (i / 50 | 0)]}))};
        editorJSONFetched('levels/big.json', level);
        level3DLoad(level);
        levelEditor.open();
        var move = (x)=> { editor3DChange((list)=> list[0].pos = [x, .5, 0]); editor3DStrokeEnd(); };`);
    const runTimers = ()=> timers.splice(0).forEach((f)=> f?.());
    const saved = ()=> JSON.parse(engine.run('localStorage.getItem(editor3DSaveName())'));
    return { ...engine, writes, runTimers, saved };
}

test('a small level is autosaved at the end of every stroke, as before', async ()=>
{
    const { run, writes } = await editorGame(5);
    run('move(1)');
    assert.equal(writes.count, 1);
    run('move(2)');
    assert.equal(writes.count, 2);
});

test('a big level waits until the strokes stop, then saves once with every stroke in it', async ()=>
{
    const { run, writes, runTimers, saved } = await editorGame(3000);
    run('move(1)'); // the first is written, which is how its size is known
    assert.equal(writes.count, 1);
    run('move(2); move(3); editor3DUndo()');
    assert.equal(writes.count, 1, 'strokes and an undo in a row wait');
    runTimers();
    assert.equal(writes.count, 2, 'one save once they stop');
    assert.deepEqual(Object.values(saved())[0].objects[0].pos, [2, .5, 0]);
});

test('a waiting autosave is written when the editor closes or another level loads', async ()=>
{
    const { run, writes, saved } = await editorGame(3000);
    run('move(1); move(2)');
    assert.equal(writes.count, 1);
    run('levelEditor.close()');
    assert.equal(writes.count, 2, 'closing writes it');
    assert.deepEqual(Object.values(saved())[0].objects[0].pos, [2, .5, 0]);
    run('levelEditor.open(); move(3)');
    run(`level3DLoad({littlejs3D: 1, objects: []})`);
    assert.deepEqual(Object.values(saved())[0].objects[0].pos, [3, .5, 0], 'another level loading writes it');
});
