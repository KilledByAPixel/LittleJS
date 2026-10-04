import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The eighth pass of 2026-10-03: a failed image, silent load failures, Box2D positions, a missing default, the
// release loop's edges, clicks under pointer lock.

// an engine, not headless, with texture 1 an image that failed to load and no texture 5 at all
function failedImage(file)
{
    const { run } = loadEngine({}, '', file);
    run(`textureInfos[1] = new TextureInfo({width: 0, height: 0}, false); headlessMode = false;
        var tileOf = (code)=> { try { const t = eval(code); return [t.pos.x, t.pos.y, t.size.x, t.size.y]; }
            catch (e) { return String(e); } };`);
    return run;
}

test('a tile of an image that failed to load is a tile of no size, which draws nothing, in both builds', () =>
{
    for (const file of [undefined, 'littlejs.release.js'])
    {
        const run = failedImage(file);
        assert.deepEqual([...run('tileOf("tile(0, 16, 1)")')], [0, 0, 0, 0], file);
        assert.deepEqual([...run('tileOf("tile(vec2(1, 0), 16, 1)")')], [0, 0, 0, 0], file);
        let drawn = 0;
        run(`drawCanvas2D = ()=> ++drawn; var drawn = 0; drawTile(vec2(), vec2(1), tile(0, 16, 1), WHITE, 0, false, undefined,
            false, false, false, {}); drawTile(vec2(), vec2(1), new TileInfo(vec2(), vec2(16), textureInfos[1]), WHITE, 0,
            false, undefined, false, false, false, {});`);
        assert.equal(run('drawn'), 0, 'nothing drawn from the broken image, whatever its tile says');
    }
});

test('a tile of a texture slot never given an image asserts in debug and is a tile of no size in release', () =>
{
    assert.match(String(failedImage()('tileOf("tile(0, 16, 5)")')), /Assert/);
    assert.deepEqual([...failedImage('littlejs.release.js')('tileOf("tile(0, 16, 5)")')], [0, 0, 0, 0]);
});

test('a release build says when a sound, a sprite or an atlas fails to load', async () =>
{
    const warnings = [], canvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return new Proxy({ canvas: this }, { get: (t, k)=> k in t ? t[k] : ()=> {} }); } };
    const { run } = loadEngine({ OffscreenCanvas: canvas, console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) },
        Image: class { set src(v) { Promise.resolve().then(()=> this.onerror()); } },
        fetch: ()=> Promise.reject(undefined) }, '', 'littlejs.release.js');
    run(`glEnable = false; engineInitialized = true; soundEnable = true;
        loadSprite('hero.png'); loadAtlas('art.png', 'art.json'); var sound = new Sound('boom.mp3');`);
    await run('spritesReady()');
    await run('Promise.all(engineLoads ?? [])').catch(()=> {});
    await new Promise((resolve)=> setTimeout(resolve, 10));
    for (const name of ['hero.png', 'art.png', 'boom.mp3'])
        assert.ok(warnings.some((w)=> w.includes(name)), name + ' in ' + JSON.stringify(warnings));
});

test('drawRectGradient takes no size, as its docs say, and draws a unit square', () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    assert.doesNotThrow(()=> run('drawRectGradient(vec2(1, 2))'));
});

// a release game whose update throws when told to, its frames run by hand at a screen's refresh rate
async function releaseGame(fails)
{
    const callbacks = [], errors = [];
    const { run, context } = loadEngine({ requestAnimationFrame: (f)=> callbacks.push(f),
        console: { ...console, error: (e)=> errors.push(String(e)) } }, '', 'littlejs.release.js');
    context.fails = fails;
    run('setHeadlessMode(true); var updates = 0;');
    await run(`engineInit(()=> {}, ()=> { ++updates; const e = fails(frame); if (e) throw new Error(e); },
        ()=> {}, ()=> {}, ()=> {})`);
    let t = 0;
    const pump = (count, hz)=> { for (let i = count; i-- && callbacks.length;) callbacks.shift()(t += 1e3 / hz); };
    return { run, errors, pump };
}

test('a release build logs each new error, and an error each tick does not run the game faster on a fast screen', async () =>
{
    const { errors, pump } = await releaseGame((f)=> f === 3 ? 'first' : f === 6 ? 'second' : f === 9 ? 'second' : '');
    pump(30, 60);
    assert.deepEqual(errors.map((e)=> e.replace(/^Error: /, '')), ['first', 'second'], 'a repeat of the last is not logged again');

    const game = await releaseGame((f)=> f > 2 ? 'always' : ''); // from its third frame, after it started
    game.pump(144, 60); // settle
    const before = game.run('updates');
    game.pump(144, 144); // one second of a 144 Hz screen
    const ticks = game.run('updates') - before;
    assert.ok(ticks >= 55 && ticks <= 65, 'about 60 ticks a second, ' + ticks);
    assert.equal(game.errors.length, 1);
});

test('under pointer lock a click is a press wherever the locked mouse was left, a letterbox bar too', () =>
{
    const { run, handlers, context } = loadEngine();
    run(`setHeadlessMode(true);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 300, top: 0, right: 700, bottom: 400 }) };`);
    context.document.pointerLockElement = run('mainCanvas'); // locked while the mouse was in the bar on the right
    handlers.mousedown({ button: 0, x: 900, y: 200, target: {}, cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), true);
});

test('a gamepad with no sticks has one from its d-pad, held or not, as its stick count says', () =>
{
    const pad = { mapping: 'standard', axes: [], buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0})) };
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v;
    const counts = [];
    for (const held of [false, true, false])
    {
        pad.buttons[15] = { pressed: held, value: +held }; // right on the d-pad
        run('inputUpdate(); inputUpdatePost();');
        counts.push([run('gamepadStickCount(0)'), run('gamepadStick(0, 0).x')]);
    }
    assert.deepEqual(counts, [[1, 0], [1, 1], [1, 0]]);
});

test('a zzfx Sound made where the browser has no audio counts as loaded and plays nothing', () =>
{
    const { run } = loadEngine({ AudioContext: undefined });
    run('soundEnable = true; var loaded = 0, s = new Sound([,,500], 0, 0, .7, ()=> ++loaded);');
    assert.deepEqual([run('loaded'), run('s.isLoaded()'), run('s.play() === undefined')], [1, true, true]);
});
