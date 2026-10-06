import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Review pass 13: common mistakes that failed with no word, made to say so or to work. A color passed where drawTile
// takes its tile, a color constant changed in a release build, one image file given to engineInit as a string, and
// a save that could not be read or written.

test('drawTile given a color where its tile goes says so', () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); console.assert = ()=> {}');
    const message = run(`(()=> { try { drawTile(vec2(), vec2(1), RED); } catch (e) { return e.message; } })()`);
    assert.match(message, /drawTile: tileInfo must be a TileInfo/);
});

test('a color constant can not be changed in a release build either', () =>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true)', 'littlejs.release.js');
    run(`try { RED.a = .5; } catch (e) {}`);
    assert.equal(run('RED.a'), 1);
    assert.equal(run('Object.isFrozen(WHITE)'), true);
});

test('engineInit takes one image file given as a string, where it asserted and release threw', { timeout: 10000 }, async () =>
{
    // headless loads no images, so this checks the list is taken, where the debug build asserted it was no array
    const { run } = loadEngine();
    run('setHeadlessMode(true); setEngineManualStep(true); var started = false; console.assert = ()=> {}');
    await run(`engineInit(()=> started = true, ()=> {}, ()=> {}, ()=> {}, ()=> {}, 'tiles.png')`);
    assert.equal(run('started'), true);
});

test('a save that can not be read or written warns, in a release build too', () =>
{
    const warnings = [];
    const localStorage = { getItem: ()=> '{not json', setItem: ()=> { throw new Error('full'); } };
    const { run } = loadEngine({ localStorage, console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } },
        'setHeadlessMode(true)', 'littlejs.release.js');
    assert.equal(run(`JSON.stringify(readSaveData('game', {best: 3}))`), '{"best":3}');
    assert.equal(run(`writeSaveData('game', {best: 4})`), false);
    assert.equal(warnings.length, 2, warnings.join(' | '));
    assert.match(warnings[0], /game/);
    assert.match(warnings[1], /game/);
});
