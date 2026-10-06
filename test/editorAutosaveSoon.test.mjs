import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The level editor autosaves a small map at the end of every stroke, as it always has; a map whose autosave is big,
// over about 100,000 characters, which a stroke on a 512 by 512 map would write megabytes of, waits until the edits
// stop for a moment, and anything waiting is written when the editor closes, the page hides, the map is saved or
// another one loads, so nothing is lost.

// a headless engine with a storage that counts its writes, and timers kept to be run by hand
async function editorGame(size)
{
    const items = {}, timers = [];
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); ++writes.count; } };
    const writes = { count: 0 };
    const setTimeout = (f)=> (timers.push(f), timers.length);
    const clearTimeout = (id)=> { timers[id - 1] = undefined; };
    const engine = loadEngine({ localStorage, location: { pathname: '/game/' }, setTimeout, clearTimeout });
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run(`var map = { width: ${size}, height: ${size}, tilewidth: 16, tileheight: 16,
            tilesets: [{ firstgid: 1, source: 't.tsx' }],
            layers: [{ type: 'tilelayer', name: 'front', width: ${size}, height: ${size}, data: new Array(${size * size}).fill(0) }] };
        var layers = tileLayersLoad(map, undefined, 0, 2), front = editorLayerRecord(layers[0]);
        var paint = (x)=> { editorPaint(front, vec2(x, 0), editorTileToGid(4)); editorStrokeEnd(); };`);
    const runTimers = ()=> timers.splice(0).forEach((f)=> f?.());
    return { ...engine, writes, runTimers, timers };
}

test('a small map is autosaved at the end of every stroke, as before', async ()=>
{
    const { run, writes } = await editorGame(8);
    run('paint(0)');
    assert.equal(writes.count, 1);
    run('paint(1)');
    assert.equal(writes.count, 2);
});

test('a big map waits until the strokes stop, then saves once', async ()=>
{
    const { run, writes, runTimers } = await editorGame(320);
    run('paint(0)'); // the first is written, which is how its size is known
    assert.equal(writes.count, 1);
    run('paint(1); paint(2); paint(3)');
    assert.equal(writes.count, 1, 'strokes in a row wait');
    runTimers();
    assert.equal(writes.count, 2, 'one save for all of them once they stop');
    const saved = JSON.parse(run(`localStorage.getItem(editorSaveName())`));
    assert.equal(Object.values(saved)[0].layers[0].filter((gid)=> gid).length, 4, 'with every stroke in it');
});

test('a waiting autosave is written when the editor closes, the map is saved or another map loads', async ()=>
{
    const { run, writes } = await editorGame(320);
    run('paint(0); levelEditor.open(); paint(1)');
    assert.equal(writes.count, 1);
    run('levelEditor.close()');
    assert.equal(writes.count, 2, 'closing the editor writes it');
    run('paint(2)');
    run('tileLayersLoad({ width: 2, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1 }], ' +
        'layers: [{ type: "tilelayer", name: "other", width: 2, height: 2, data: [0, 0, 0, 0] }] }, undefined, 0, 2)');
    assert.ok(writes.count >= 3, 'another map loading writes it first');
    run('paint(3); editorAutosaveFlush()');
    assert.ok(writes.count >= 4, 'and the page hiding, which calls the flush');
});

test('a stroke still held when the editor closes is ended and written then, not left for the timer', async ()=>
{
    const { run, writes, timers } = await editorGame(320);
    run('paint(0); levelEditor.open(); editorPaint(front, vec2(5, 0), editorTileToGid(4))'); // no stroke end yet
    assert.equal(writes.count, 1);
    run('levelEditor.close()');
    assert.equal(writes.count, 2, 'closing ended the stroke and wrote it');
    assert.ok(timers.every((f)=> !f), 'nothing left waiting');
    const saved = JSON.parse(run(`localStorage.getItem(editorSaveName())`));
    assert.equal(Object.values(saved)[0].layers[0].filter((gid)=> gid).length, 2, 'with the held stroke in it');
});
