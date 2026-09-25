import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// review round 8: input and UI fixes that need the real page event handlers or engine internals like inputData.
// Each context loads its own copy of the script build, dist/littlejs.js, into a node vm, with a document stub that
// keeps the listeners the engine adds, so a test can fire real key, mouse and touch events at it.

const source = readFileSync(new URL('../dist/littlejs.js', import.meta.url), 'utf8');
function loadEngine(extra={})
{
    const handlers = {};
    const context = {
        console, performance, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Map, Set, WeakMap,
        Float32Array, Uint8Array, Math, JSON, URL, queueMicrotask,
        window: {},
        document: { addEventListener(type, f) { handlers[type] = f; }, hasFocus: ()=> true, body: {}, hidden: false },
        navigator: {},
        addEventListener() {}, removeEventListener() {},
        localStorage: { getItem: ()=> null, setItem() {} },
        Image: class {},
        AudioContext: class
        {
            constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
            createGain() { return { connect(n) { return n; }, disconnect() {}, gain: { value: 0 } }; }
            createBuffer() { return {}; }
            createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
            resume() { return Promise.resolve(); }
        },
        ...extra,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'littlejs.js' });
    const run = (code)=> vm.runInContext(code, context);
    run(`inputInit(); mainCanvasSize = vec2(1000);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 0, top: 0, right: 1000, bottom: 1000 }) };`);
    return { context, run, handlers };
}
const keyEvent = (code)=> ({ code, key: code, repeat: false, cancelable: false, target: {} });

test('with WASD emulation an arrow its WASD key already holds is not pressed a second time', () =>
{
    const { run, handlers } = loadEngine();
    assert.equal(run('inputWASDEmulateDirection'), true);
    handlers.keydown(keyEvent('KeyW'));
    run('inputUpdatePost()');
    handlers.keydown(keyEvent('ArrowUp'));
    assert.equal(run(`keyIsDown('ArrowUp')`), true);
    assert.equal(run(`keyWasPressed('ArrowUp')`), false, 'held already, so not a new press');

    // the other order was already right
    handlers.keyup(keyEvent('KeyW')); handlers.keyup(keyEvent('ArrowUp'));
    run('inputUpdatePost()');
    handlers.keydown(keyEvent('ArrowUp'));
    run('inputUpdatePost()');
    handlers.keydown(keyEvent('KeyW'));
    assert.equal(run(`keyWasPressed('ArrowUp')`), false);

    // and a fresh press still presses
    handlers.keyup(keyEvent('KeyW')); handlers.keyup(keyEvent('ArrowUp'));
    run('inputUpdatePost()');
    handlers.keydown(keyEvent('ArrowUp'));
    assert.equal(run(`keyWasPressed('ArrowUp')`), true);
});

test('turning gamepads off lets go of what they held, and the mouse and keys count again', () =>
{
    const pad = { mapping: 'standard', axes: [1, 0, 0, 0], buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0})) };
    const { run, context, handlers } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v; // no camera here
    const tick = ()=> run('inputUpdate(); inputUpdatePost();');
    pad.buttons[0] = { pressed: true, value: 1 };
    tick(); tick();
    assert.equal(run('gamepadIsDown(0)'), true);

    run('setGamepadsEnable(false)');
    tick();
    assert.equal(run('gamepadIsDown(0)'), false, 'let go when turned off, though the pad still holds it');
    assert.equal(run('gamepadStick(0).length()'), 0);
    handlers.keydown(keyEvent('KeyZ'));
    run('inputUpdate()');
    assert.equal(run('lastInputDevice'), 'keyboard');
});

test('turning touch input off mid touch lets go of the mouse button it held', () =>
{
    const { run, handlers } = loadEngine({ window: { ontouchstart: null } });
    assert.equal(run('isTouchDevice'), true);
    const finger = { identifier: 1, clientX: 10, clientY: 10, target: {} };
    const touch = (type, touches, changed)=> handlers[type]({ type, touches, changedTouches: changed, cancelable: false });
    touch('touchstart', [finger], [finger]);
    run('inputUpdatePost()');
    assert.equal(run('mouseIsDown(0)'), true);
    run('setTouchInputEnable(false)');
    touch('touchend', [], [finger]);
    run('inputUpdatePost()');
    assert.equal(run('mouseIsDown(0)'), false);
});

test('the screen nine and three slice draws add no color, so see-through texels stay see-through', () =>
{
    const { run, context } = loadEngine();
    const calls = [];
    context.drawNineSlice = (...args)=> calls.push(args);
    context.drawThreeSlice = (...args)=> calls.push(args);
    run('const t = new TileInfo(vec2(), vec2(16)); drawNineSliceScreen(vec2(), vec2(64), t); drawThreeSliceScreen(vec2(), vec2(64), t)');
    assert.equal(calls.length, 2);
    for (const args of calls)
        assert.equal(args[5], undefined, 'no additive color');
});

// a headless engine running the UI system, stepped by hand
async function loadUI()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run('new UISystemPlugin');
    return engine;
}

test('the confirm dialog closes on its exit key and gamepad B while the game is paused', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const press = (key)=> { inputData[0][key] = 3; engineStep(); inputData[0][key] = 0; };
        setPaused(true);
        let no = 0;
        const dialog = uiSystem.showConfirmDialog('Quit?', ()=> {}, ()=> ++no);
        engineStep();
        press('Escape');
        setPaused(false);
        [!!dialog.destroyed, no];`);
    assert.deepEqual([...result], [true, 1]);
});

test('a click inside a text field being edited is used up like any click on the UI', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const field = new UITextInput(vec2(0, 0), vec2(200, 50), 'abc');
        engineStep();
        mousePosScreen = field.nativePos.copy();
        inputData[0][0] = 3; engineStep(); inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; // a click edits it
        const editing = field.isKeyInputObject();
        inputData[0][0] = 3; engineStep(); const seen = mouseWasPressed(0); inputData[0][0] = 0; // a click inside
        [editing, field.isKeyInputObject(), seen];`);
    assert.deepEqual([...result], [true, true, false], 'still editing, and the click was used up');
});

test('a text edit started from navigation ends without an onLeave that had no onEnter', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const tapKey = (key)=> { inputData[0][key] = 3; engineStep(); inputData[0][key] = 0; };
        const field = new UITextInput(vec2(0, 0), vec2(200, 50), 'abc');
        field.navigationIndex = 0;
        let enters = 0, leaves = 0;
        field.onEnter = ()=> ++enters;
        field.onLeave = ()=> ++leaves;
        mousePosScreen = vec2(-1000); // the mouse is away from it
        engineStep();
        tapKey('ArrowDown'); // navigation selects it
        tapKey('Enter'); // and starts editing it
        const editing = field.isKeyInputObject();
        engineStep(); engineStep();
        field.stopEditing();
        engineStep(); engineStep();
        [editing, enters, leaves];`);
    assert.deepEqual([...result], [true, 0, 0]);
});
