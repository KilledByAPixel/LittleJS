import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The free camera flies around a running 3D game: a camera of its own is drawn with, the game's is put back after
// each frame, and the game reads no keys or mouse while it is on. Each test runs its own copy of the script build.

// a headless 3D game stepped by hand, its gameUpdate notes if it reads W as down
async function loadGame(plugin=true)
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true); var gameReads = []');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { ${plugin ? 'new Render3DPlugin' : ''} }, ()=> gameReads.push(keyIsDown('KeyW')),
            ()=> {}, ()=> {}, ()=> {})`);
    engine.run('engineStep(2)'); // past the first step, which has no time in it
    return engine;
}

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser
function step(engine, count=1)
{
    for (let i = count; i--;)
        engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);

test('C on the debug overlay turns the free camera on, and C again turns it off', async ()=>
{
    const engine = await loadGame(), { run, handlers } = engine;
    handlers.keydown(keyEvent('KeyC'));
    step(engine);
    assert.equal(run('editor3DFreeCamera'), false, 'the overlay is closed');
    handlers.keyup(keyEvent('KeyC'));
    run('setDebugOverlay(true)');
    handlers.keydown(keyEvent('KeyC'));
    step(engine);
    assert.equal(run('editor3DFreeCamera'), true);
    handlers.keyup(keyEvent('KeyC'));
    step(engine);
    handlers.keydown(keyEvent('KeyC'));
    step(engine);
    assert.equal(run('editor3DFreeCamera'), false);
    assert.equal(run('inputCaptureOn'), false);
});

test('the free camera starts where the game\'s camera is and leaves it alone', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('render3D.camera.pos = vec3(1, 2, 3); render3D.camera.rotation = vec3(.1, .2, 0); render3D.camera.fov = 1');
    run('var gameCamera = render3D.camera; editor3DSetFreeCamera(true)');
    assert.deepEqual([...run('[editor3DCamera.pos.x, editor3DCamera.pos.y, editor3DCamera.pos.z, editor3DCamera.fov]')],
        [1, 2, 3, 1]);
    near(run('editor3DCamera.rotation.y'), .2);
    assert.equal(run('editor3DCamera !== gameCamera'), true);
    run(`inputData[0].KeyW = 1`);
    step(engine, 3);
    assert.deepEqual([...run('[gameCamera.pos.x, gameCamera.pos.y, gameCamera.pos.z]')], [1, 2, 3]);
    assert.equal(run('render3D.camera === gameCamera'), true);
});

test('a frame is drawn with the free camera and the game\'s camera is back after it', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('var gameCamera = render3D.camera; editor3DCameraBegin()');
    assert.equal(run('render3D.camera === gameCamera'), true, 'off, the hooks do nothing');
    // the 3D pass works out its matrices right after the hook, as here
    run(`editor3DCameraEnd(); editor3DSetFreeCamera(true); editor3DCamera.pos = vec3(0, 50, 0); editor3DCameraBegin();
        render3D.updateMatrices()`);
    assert.equal(run('render3D.camera === editor3DCamera'), true);
    near(run('render3D.viewMatrix.copy().invert().getTranslation().y'), 50);
    run('editor3DCameraEnd()');
    assert.equal(run('render3D.camera === gameCamera'), true);
    near(run('render3D.viewMatrix.copy().invert().getTranslation().y'), 0, 'the matrices are the game\'s again');
});

test('W flies along the view, Shift is 4 times as fast, and the game reads no keys', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetFreeCamera(true); gameReads.length = 0; inputData[0].KeyW = 1');
    step(engine);
    near(run('editor3DCamera.pos.z'), 10 - .2); // .2 a frame, looking down -Z from z 10
    assert.deepEqual([...run('gameReads')], [false]);
    run('inputData[0].ShiftLeft = 1');
    step(engine);
    near(run('editor3DCamera.pos.z'), 10 - .2 - .8);
});

test('D, A, E and Q fly sideways and up and down', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetFreeCamera(true); inputData[0].KeyD = 1; inputData[0].KeyE = 1');
    step(engine);
    near(run('editor3DCamera.pos.x'), .2);
    near(run('editor3DCamera.pos.y'), .2);
    run('inputData[0].KeyD = 0; inputData[0].KeyE = 0; inputData[0].KeyA = 1; inputData[0].KeyQ = 1');
    step(engine, 2);
    near(run('editor3DCamera.pos.x'), -.2);
    near(run('editor3DCamera.pos.y'), -.2);
});

test('the mouse looks around while the right button is held, right and down as the mouse goes', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetFreeCamera(true); mouseDeltaScreen = vec2(100, 50)');
    step(engine);
    near(run('editor3DCamera.rotation.y'), 0, 'no button held and the mouse not captured');
    run('inputData[0][2] = 1; mouseDeltaScreen = vec2(100, 50)');
    step(engine);
    const forward = run('editor3DCamera.getForward()');
    assert.ok(forward.x > 0 && forward.y < 0, 'it turned right and down');
    near(run('editor3DCamera.rotation.y'), -.3);
    near(run('editor3DCamera.rotation.x'), -.15);
    near(run('editor3DCamera.rotation.z'), 0);
});

test('the wheel changes the flying speed, up is faster', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetFreeCamera(true); mouseWheel = -1');
    step(engine);
    near(run('editor3DFlySpeed'), .2 * Math.exp(.2));
    run('mouseWheel = 1');
    step(engine);
    near(run('editor3DFlySpeed'), .2);
});

test('it flies while the game is paused, and does not change the pause', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('setPaused(true); editor3DSetFreeCamera(true); gameReads.length = 0; inputData[0].KeyW = 1');
    step(engine);
    near(run('editor3DCamera.pos.z'), 9.8);
    assert.equal(run('paused'), true);
    assert.equal(run('gameReads.length'), 0, 'the game is still paused');
    run('editor3DSetFreeCamera(false)');
    assert.equal(run('paused'), true);
});

test('Escape leaves the free camera and does nothing else that press', async ()=>
{
    const engine = await loadGame(), { run, handlers } = engine;
    run('setDebugOverlay(true); editor3DSetFreeCamera(true)');
    handlers.keydown(keyEvent('Escape'));
    step(engine);
    assert.equal(run('editor3DFreeCamera'), false);
    assert.equal(run('debugOverlay'), true, 'the overlay did not toggle');
});

test('with no Render3DPlugin the free camera stays off', async ()=>
{
    const engine = await loadGame(false), { run, handlers } = engine;
    run('setDebugOverlay(true)');
    handlers.keydown(keyEvent('KeyC'));
    step(engine);
    assert.equal(run('editor3DFreeCamera'), false);
    run('editor3DSetFreeCamera(true)');
    assert.equal(run('editor3DFreeCamera'), false);
});

test('the release build has stubs for the frame hooks and no free camera', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.doesNotThrow(()=> run('editor3DCameraBegin(); editor3DCameraEnd()'));
    assert.equal(run('typeof editor3DSetFreeCamera'), 'undefined');
});
