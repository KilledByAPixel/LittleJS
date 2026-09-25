import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// review round 10: input and UI fixes that need the real page event handlers or engine internals,
// each test on its own copy of the script build

test('a mouse click on a touch gamepad zone is left to the game', () =>
{
    const { run, context } = loadEngine();
    context.cancelled = false;
    run(`setTouchGamepadEnable(true);
        touchGamepadPointerDown({ pointerType: 'mouse', pointerId: 1, preventDefault() { cancelled = true; } },
            { setPointerCapture() {} })`);
    assert.equal(context.cancelled, false, 'not cancelled, so the browser sends the mousedown');
    assert.notEqual(run('lastInputDevice'), 'gamepad');
});

test('letting go of Cmd lets go of the keys a Mac sent no keyup for', () =>
{
    const { run, handlers } = loadEngine();
    handlers.keydown({ ...keyEvent('MetaLeft'), key: 'Meta' });
    handlers.keydown(keyEvent('KeyA'));
    run('inputUpdatePost()');
    handlers.keyup({ ...keyEvent('MetaLeft'), key: 'Meta' }); // A was let go while Cmd was held, no keyup for it
    run('inputUpdatePost()');
    assert.equal(run(`keyIsDown('KeyA')`), false);
    assert.equal(run(`keyIsDown('ArrowLeft')`), false, 'nor the arrow it held through WASD');
    assert.equal(run('keyDirection().x'), 0);
});

test('a tap on the game lets go of a focused text field, as a click does', () =>
{
    const { run, handlers, context } = loadEngine({ window: { ontouchstart: null } });
    let blurred = false;
    context.document.activeElement = { tagName: 'INPUT', type: 'text', contains: ()=> false, blur() { blurred = true; } };
    const finger = { identifier: 1, clientX: 10, clientY: 10, target: {} };
    handlers.touchstart({ type: 'touchstart', touches: [finger], changedTouches: [finger], target: {}, cancelable: true,
        preventDefault() {} });
    assert.equal(blurred, true);
    assert.equal(run('mouseWasPressed(0)'), true);
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

test('a text field disabled from its own onUpdate ends its edit with onChange', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const field = new UITextInput(vec2(0), vec2(200, 50), 'abc');
        let changes = 0, canEdit = true;
        field.onChange = ()=> ++changes;
        field.onUpdate = ()=> field.disabled = !canEdit;
        uiSystem.keyInputObject = field;
        engineStep();
        canEdit = false;
        engineStep(); engineStep();
        [changes, !!uiSystem.keyInputObject];`);
    assert.deepEqual([...result], [1, false]);
});

test('with activateOnPress a press that starts an edit is released', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        uiSystem.activateOnPress = true;
        const field = new UITextInput(vec2(0, 0), vec2(200, 50), 'abc');
        let presses = 0, releases = 0;
        field.onPress = ()=> ++presses;
        field.onRelease = ()=> ++releases;
        engineStep();
        mousePosScreen = field.nativePos.copy();
        inputData[0][0] = 3; engineStep(); inputData[0][0] = 1; engineStep(); // pressed and held
        const editing = field.isKeyInputObject();
        inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep(); // let go
        [editing, presses, releases];`);
    assert.deepEqual([...result], [true, 1, 1]);
});

test('drag and drop sees one enter and one leave for the window, not one per element crossed', async () =>
{
    const { run, handlers, context } = await loadUI();
    context.events = [];
    run(`uiSystem.setupDragAndDrop(()=> events.push('drop'), ()=> events.push('enter'), ()=> events.push('leave'))`);
    const event = ()=> ({ preventDefault() {} });
    handlers.dragenter(event()); // onto the page margin
    handlers.dragenter(event()); // onto the canvas
    handlers.dragleave(event()); // off the margin, still over the page
    assert.deepEqual([...context.events], ['enter']);
    handlers.dragleave(event()); // off the page
    assert.deepEqual([...context.events], ['enter', 'leave']);
    handlers.dragenter(event());
    handlers.drop(event());
    handlers.dragenter(event());
    assert.deepEqual([...context.events], ['enter', 'leave', 'enter', 'drop', 'enter'], 'a drop ends it');
});

test('a tile layer made from a packed tileset counts its tiles in the tileset, not the sheet', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const drawn = run(`
        // a 4 wide tileset packed at x 100 on a big sheet, as loadSprite leaves it
        const sheet = new TextureInfo({width: 2048, height: 64}, false);
        const layer = new TileLayer(vec2(), vec2(8, 1), new TileInfo(vec2(100, 8), vec2(8), sheet, 0, 0, 4), 0, false);
        const drawn = [];
        layer.clearLayerRect = ()=> {};
        layer.drawLayerTile = (pos, size, tileInfo)=> drawn.push(tileInfo.pos.x + ',' + tileInfo.pos.y);
        for (let x = 8; x--;) layer.data[x] = new TileLayerData(x);
        drawContext = layer.context = {};
        for (let x = 0; x < 8; ++x) layer.drawTileData(vec2(x, 0), false);
        drawn;`);
    assert.deepEqual([...drawn], ['100,8', '108,8', '116,8', '124,8', '100,16', '108,16', '116,16', '124,16']);
});

test('the debug number and time keys work only with the overlay open, unless debugKeysAlways is set', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const result = run(`
        const tap = (key)=> { inputData[0][key] = 3; engineStep(); inputData[0][key] = 0; };
        const heldStep = ()=> { const t = timeReal; inputData[0].Equal = 1; engineStep(); inputData[0].Equal = 0;
            return Math.round((timeReal - t) * 60); };
        const results = [];
        tap('Digit1');
        results.push(debugPhysics, heldStep()); // overlay closed: nothing
        setDebugKeysAlways(true);
        tap('Digit1');
        results.push(debugPhysics, heldStep()); // always: the key works, time runs 10 times as fast
        setDebugKeysAlways(false);
        setDebugOverlay(true);
        tap('Digit1');
        results.push(debugPhysics, heldStep()); // overlay open: they work
        results;`);
    assert.deepEqual([...result], [false, 1, true, 10, false, 10]);
});

test('cameraFit fits a rectangle, and keeps a screen inset on its side, when the camera is turned', () =>
{
    const { run } = loadEngine();
    const result = run(`
        const corners = (center, size)=> [-1, 1].flatMap(sx=> [-1, 1].map(sy=>
            worldToScreen(center.add(vec2(sx * size.x / 2, sy * size.y / 2)))));
        const results = [];

        // a wide rectangle turned a quarter turn, on a wide screen, fits its long side into the screen's height
        mainCanvasSize = vec2(800, 400);
        setCameraAngle(PI / 2);
        results.push(cameraFit(vec2(), vec2(8, 2)));
        results.push(corners(vec2(), vec2(8, 2)).every(p=> p.x > -1 && p.x < 801 && p.y > -1 && p.y < 401));

        // and at an eighth of a turn, every corner is on screen, one of them touching an edge
        setCameraAngle(PI / 4);
        cameraFit(vec2(3, 1), vec2(8, 2));
        const p = corners(vec2(3, 1), vec2(8, 2));
        results.push(p.every(p=> p.x > -1 && p.x < 801 && p.y > -1 && p.y < 401));

        // a band reserved at the top pushes the content down on screen, whichever way the camera is turned
        mainCanvasSize = vec2(800);
        setCameraAngle(PI / 2);
        cameraFit(vec2(), vec2(2), 0, {top: 200});
        const c = worldToScreen(vec2());
        results.push(Math.round(c.x), Math.round(c.y));
        setCameraAngle(0);
        results;`);
    assert.deepEqual([...result], [50, true, true, 400, 500]);
});
