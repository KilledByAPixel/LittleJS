import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The level editor paints the tile layers of a paused game, keeps the Tiled map the game loaded as its source of
// truth, saves it back as Tiled JSON and autosaves every change. The panel is html and is not made here, the
// tests call what its controls call. Each test runs its own copy of the script build.

// a localStorage kept between engines, like the page's across a reload
function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
const location = { pathname: '/game/' };

// a headless engine stepped by hand, as a game would run it
async function loadGame(extra={})
{
    const engine = loadEngine({ localStorage: makeStorage(), location, ...extra });
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return engine;
}

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser, it does nothing
// in headless mode, where a key would read as pressed again in the next step
function step(engine)
{
    engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}

// press and let go of a key, a step each
function press(engine, code)
{
    engine.handlers.keydown(keyEvent(code));
    step(engine);
    engine.handlers.keyup(keyEvent(code));
    step(engine);
}

test('0 on the overlay opens the editor and pauses the game, 0 again gives back the pause and camera', async () =>
{
    const engine = await loadGame();
    const { run } = engine;
    run('setCameraPos(vec2(5, 6)); setCameraScale(40); setDebugOverlay(true)');
    press(engine, 'Digit0');
    assert.equal(run('editMode'), true);
    assert.equal(run('paused'), true);
    assert.equal(run('debugOverlay'), false, 'the overlay closes so the level can be seen');
    run('editorCameraPos = vec2(1, 1); editorCameraScale = 10; engineStep()');
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [1, 1, 10], 'the editor has its own view');
    press(engine, 'Digit0'); // the overlay is closed, the editor takes the key itself
    assert.equal(run('editMode'), false);
    assert.equal(run('paused'), false);
    assert.deepEqual([...run('[cameraPos.x, cameraPos.y, cameraScale]')], [5, 6, 40]);
});

test('a game paused before the editor opened stays paused after it closes', async () =>
{
    const { run } = await loadGame();
    run('setPaused(true); setEditMode(true); setEditMode(false)');
    assert.equal(run('paused'), true);
});

test('with debugKeysAlways, 0 toggles the editor once, not open and closed in the same step', async () =>
{
    const engine = await loadGame();
    engine.run('setDebugKeysAlways(true)');
    press(engine, 'Digit0');
    assert.equal(engine.run('editMode'), true);
    press(engine, 'Digit0');
    assert.equal(engine.run('editMode'), false);
});

test('release builds have no editor or tweakables code, only their stubs', () =>
{
    for (const file of ['littlejs.release.js', 'littlejs.min.js', 'littlejs.esm.min.js'])
    {
        const source = readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
        assert.ok(!source.includes('editorApplyCamera'), file + ' has editor code');
        assert.ok(!source.includes('Nothing to tweak'), file + ' has tweakables code');
    }
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run(`setEditMode(true); let speed = 1; tweak('speed'); tweakButton('a', ()=> {}); tweakDivider();
        tweakEngineDefaults();`);
    assert.equal(run('editMode'), false);
});
