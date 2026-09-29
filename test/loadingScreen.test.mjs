import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Startup waits for what the game loads: the images, gameInit, and every load started while it runs, the sounds
// from files and whatever the game adds with engineAddLoad; the game loop starts once all of it is done, and the
// loading screen shows how much is, once it has taken half a second. Each test runs its own copy of the script build.

const tick = (ms=20)=> new Promise((resolve)=> setTimeout(resolve, ms));

// an engine started headless with this gameInit, given the engine's engineAddLoad, and whether its loop started
function startGame(gameInit)
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true); setEngineManualStep(true)');
    engine.context.gameInitForTest = ()=> gameInit(engine.run('engineAddLoad'));
    const init = engine.run('engineInit(()=> gameInitForTest(), ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const started = ()=> engine.run('!!engineUpdateInternal');
    return { ...engine, init, started };
}

test('the game loop starts once what gameInit started loading is done, not before', async ()=>
{
    let release;
    const { init, started } = startGame((add)=> { add(new Promise((r)=> release = r)); });
    await tick();
    assert.equal(started(), false, 'still loading');
    release();
    await init;
    assert.equal(started(), true);
});

test('an async gameInit is waited for, and loads it adds while it runs count too', async ()=>
{
    const releases = [];
    const hold = ()=> new Promise((r)=> releases.push(r));
    const { run, init, started } = startGame(async (add)=>
    {
        add(hold());
        await tick(5);
        add(hold()); // added while it waits
    });
    await tick(40);
    assert.equal(run('engineLoadsDone + " of " + engineLoads.length'), '1 of 3', 'gameInit is done, two loads are not');
    releases[0]();
    await tick();
    assert.equal(started(), false, 'one still going');
    releases[1]();
    await init;
    assert.equal(started(), true);
    assert.equal(run('engineLoads'), undefined, 'loading is over');
});

test('a load that fails still counts as done, and an error in gameInit reaches engineInit', async ()=>
{
    const failing = startGame((add)=> { add(Promise.reject(new Error('missing file'))); });
    await failing.init;
    assert.equal(failing.started(), true, 'the game starts without it');

    const broken = startGame(()=> { throw new Error('bad init'); });
    await assert.rejects(broken.init, /bad init/);
});

test('after startup engineAddLoad waits for nothing and hands the promise back', async ()=>
{
    const { run, init } = startGame(()=> {});
    await init;
    const promise = Promise.resolve(3);
    assert.equal(run('engineAddLoad')(promise), promise);
    assert.equal(run('engineLoads'), undefined);
});

test('a sound from a file made while loading counts as a load', async ()=>
{
    let finish;
    const { run } = loadEngine({ fetch: ()=> new Promise((r)=> finish = r) });
    run('engineLoads = [], engineLoadsDone = 0; new Sound("music.mp3")');
    assert.equal(run('engineLoads.length'), 1);
    finish({ ok: false, status: 404, statusText: 'Not Found' });
    await tick();
    assert.equal(run('engineLoadsDone'), 1, 'a sound that fails to load is done too');
    run('engineLoads = undefined; new Sound("later.mp3")');
    assert.equal(run('engineLoads'), undefined, 'after startup it is not counted');
});

test('the loading screen shows after half a second, with the part of the loads done; none draws nothing', ()=>
{
    const { run } = loadEngine();
    run(`var seen = [], canvasUpdates = 0; engineUpdateCanvas = ()=> ++canvasUpdates;
        engineLoads = [1, 2, 3, 4], engineLoadsDone = 1; setLoadingScreen((progress)=> seen.push(progress));
        engineLoadingScreenDraw(.4); engineLoadingScreenDraw(.6);`);
    assert.deepEqual([...run('seen')], [.25], 'not in the first half second, then a quarter done');
    assert.equal(run('canvasUpdates'), 1, 'the canvas is sized to the window first, as the splash does');
    run('setLoadingScreen(undefined); engineLoadingScreenDraw(2)');
    assert.equal(run('seen.length'), 1, 'turned off, the screen stays as it is');
    run('setHeadlessMode(true); setLoadingScreen((progress)=> seen.push(progress)); engineLoadingScreenDraw(2)');
    assert.equal(run('seen.length'), 1, 'headless draws nothing');
});

test('the default loading screen is on', ()=>
{
    const { run } = loadEngine();
    assert.equal(run('typeof loadingScreen'), 'function');
});
