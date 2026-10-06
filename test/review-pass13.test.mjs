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

test('a load that can not reach its file names it, and says why when the page was opened from a file', async () =>
{
    const fetch = async ()=> { throw new TypeError('Failed to fetch'); };
    const { run } = loadEngine({ fetch, location: { protocol: 'file:', pathname: '/game/index.html' } },
        'setHeadlessMode(true)');
    const message = await run(`fetchJSON('levels/one.json').then(()=> 'loaded', (e)=> e.message)`);
    assert.match(message, /levels\/one\.json/);
    assert.match(message, /local web server/);
});

test('a font name the canvas does not take warns once in a debug build, as it would draw 10px sans-serif', () =>
{
    // a context that ignores a font string it can not parse, as a browser does: a family starting with a digit and
    // not in quotes, as Press Start 2P is
    let font = '10px sans-serif';
    const valid = (value)=> !/\s\d\w*\s*$/.test(value) || /['"][^'"]*['"]\s*$/.test(value);
    const context = new Proxy({ save() {}, restore() {}, fillText() {}, strokeText() {}, translate() {}, rotate() {},
        measureText: ()=> ({ width: 1 }) }, { get: (t, k)=> k === 'font' ? font : k in t ? t[k] : undefined,
        set: (t, k, v)=> { k === 'font' ? valid(v) && (font = v) : t[k] = v; return true; } });
    const warnings = [];
    const { run } = loadEngine({ fontContext: context, console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run('setHeadlessMode(true)');
    const draw = (family)=> run(`drawTextScreen('hi', vec2(), 20, WHITE, 0, BLACK, 'center', ${JSON.stringify(family)}, '',
        undefined, 0, fontContext)`);
    draw('Press Start 2P'); draw('Press Start 2P');
    assert.equal(warnings.length, 1, warnings.join(' | '));
    assert.match(warnings[0], /Press Start 2P.*quotes/);
    draw("'Press Start 2P'");
    draw('arial');
    assert.equal(warnings.length, 1, 'quoted, and a plain name, are taken');
});

test('a volume that is not a number asserts in debug, and in release is not handed to the audio', () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); console.assert = ()=> {}');
    assert.match(run(`(()=> { try { setSoundVolume(NaN); } catch (e) { return e.message; } })()`), /setSoundVolume/);
    // release: a master gain that throws on NaN, as a browser's does, is left at the last good volume
    const { run: release } = loadEngine({}, 'setHeadlessMode(true)', 'littlejs.release.js');
    const gain = release(`audioMasterGain = { gain: { set value(v) { if (!isFinite(v)) throw new TypeError('non-finite'); this.v = v; },
        get value() { return this.v; } } }; audioMasterVolume = undefined; setSoundVolume(.5); setSoundVolume(NaN);
        audioUpdateVolume(); audioMasterGain.gain.value`);
    assert.equal(gain, .5);
});
