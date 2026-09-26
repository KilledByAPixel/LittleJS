import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// review round 12: the light system's shadow pass draws the world with its own camera, so a screen space
// WebGL draw in a render() would land somewhere in the world; the engine skips them while the pass runs

test('screen space WebGL draws are skipped while glSkipScreenSpace is set, world space draws are not', () =>
{
    const { run } = loadEngine();
    const counts = run(`
        glEnable = true; glContext = new Proxy({}, { get: ()=> ()=> {} });
        let draws = 0;
        glDraw = glDrawUntextured = glDrawOutlineTransform = glDrawPointsTransform = glDrawColoredPoints = ()=> ++draws;
        glSetTexture = ()=> {};
        const drawAll = (screenSpace)=>
        {
            drawRect(vec2(1), vec2(1), WHITE, 0, true, screenSpace);
            drawRectGradient(vec2(1), vec2(1), WHITE, BLACK, 0, true, screenSpace);
            drawLineList([vec2(), vec2(1)], .1, WHITE, false, vec2(), 0, true, screenSpace);
            drawPoly([vec2(), vec2(1), vec2(1, 0)], WHITE, 0, BLACK, vec2(), 0, true, screenSpace);
            drawEllipse(vec2(1), vec2(1), WHITE, 0, 0, BLACK, true, screenSpace);
        };
        const result = [];
        drawAll(true); result.push(draws); draws = 0;
        glSkipScreenSpace = true;
        drawAll(true); result.push(draws); draws = 0;
        drawAll(false); result.push(draws); draws = 0;
        glSkipScreenSpace = false;
        result;
    `);
    assert.ok(counts[0] >= 5, 'every screen space draw goes through normally');
    assert.equal(counts[1], 0, 'none while the flag is set');
    assert.equal(counts[2], counts[0], 'world space draws still go through');
});

test('world space draws that pass through screen space still draw while glSkipScreenSpace is set', () =>
{
    // an ImageFont's world text and a TileLayer's own draws both hand drawTile screenSpace = true internally
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const counts = run(`
        glEnable = true; glContext = new Proxy({}, { get: ()=> ()=> {} });
        let draws = 0;
        glDraw = glDrawUntextured = ()=> ++draws;
        glSetTexture = glSetRenderTarget = ()=> {};
        const texture = { glTexture: {}, size: vec2(128), sizeInverse: vec2(1/128) };
        const font = new ImageFont(new TileInfo(vec2(), vec2(8), texture));
        const layer = new TileLayer(vec2(), vec2(4));
        layer.hasWebGL = ()=> true;
        layer.textureInfo = texture;
        glSkipScreenSpace = true;
        const result = [];
        font.drawText('ab', vec2(1), 1); result.push(draws); draws = 0;
        layer.drawRect(vec2(1), vec2(1), WHITE); result.push(draws); draws = 0;
        glSkipScreenSpace = false;
        result;
    `);
    assert.equal(counts[0], 2, 'the world text casts, one draw per glyph');
    assert.equal(counts[1], 1, 'the tile layer draws into its own texture');
});

test('the debug overlay draws a turned object\'s collision box unturned, as collision uses it', () =>
{
    const { run } = loadEngine();
    const angles = run(`
        const angles = [];
        debugRect = (pos, size, color, time, angle)=> angles.push(angle);
        const o = new EngineObject(vec2(), vec2(4, 1));
        o.setCollision();
        o.angle = PI/4;
        o.renderDebugInfo();
        angles;
    `);
    assert.deepEqual([...angles], [0]);
});

test('a tap on an HTML button, link, label or form control is left to it, a tap on the game is not', () =>
{
    const { handlers } = loadEngine({ window: { ontouchstart: null } });
    const tap = (target)=>
    {
        let cancelled = false;
        const finger = { identifier: 1, clientX: 10, clientY: 10, target };
        const event = { touches: [finger], changedTouches: [finger], target, cancelable: true,
            preventDefault() { cancelled = true; } };
        handlers.touchstart({ ...event, type: 'touchstart' });
        handlers.touchend({ ...event, type: 'touchend', touches: [] });
        return cancelled;
    };
    const element = (tag, selectorPart)=> { const e = { tagName: tag, closest: (s)=> s.includes(selectorPart) ? e : null };
        return e; };
    assert.equal(tap(element('BUTTON', 'button')), false, 'a button keeps its click');
    assert.equal(tap(element('INPUT', 'input')), false, 'a slider keeps its drag');
    assert.equal(tap(element('A', 'a,')), false, 'a link keeps its click');
    assert.equal(tap(element('LABEL', 'label')), false, 'a label keeps its click');
    assert.equal(tap({ tagName: 'CANVAS', closest: ()=> null }), true, 'the game cancels the page\'s handling');
});

test('the mouse wheel over a text area or list is left to it', () =>
{
    const { handlers } = loadEngine();
    const wheel = (target)=>
    {
        let cancelled = false;
        handlers.wheel({ deltaY: 1, target, cancelable: true, preventDefault() { cancelled = true; } });
        return cancelled;
    };
    const area = { tagName: 'TEXTAREA', closest: (s)=> s.includes('textarea') ? area : null };
    assert.equal(wheel(area), false);
    assert.equal(wheel({ tagName: 'CANVAS', closest: ()=> null }), true);
});

test('the touch gamepad\'s start button works beside floating sticks', () =>
{
    const { run } = loadEngine();
    const at = (x, y, floating, rightStick)=> run(`
        touchGamepadFloating = ${floating};
        touchGamepadCenterButtonSize = 60;
        touchGamepadRightStick = ${rightStick};
        touchGamepadAnalog = true;
        JSON.stringify(touchGamepadControlAt(vec2(${x}, ${y}), 980, 735)) || 'nothing';
    `);
    for (const dx of [0, -25, 25])
    {
        assert.equal(at(490 + dx, 367.5, false, false), '{"role":"start"}', 'fixed stick, ' + dx);
        assert.equal(at(490 + dx, 367.5, true, false), '{"role":"start"}', 'floating stick, ' + dx);
        assert.equal(at(490 + dx, 367.5, true, true), '{"role":"start"}', 'two floating sticks, ' + dx);
    }
    assert.equal(at(200, 600, true, false), '{"role":"stick","side":0}', 'the floating stick still grabs its half');
});

// a localStorage that keeps what is written, for the medal saves
const storage = (items={})=> ({ getItem: (key)=> key in items ? items[key] : null,
    setItem: (key, value)=> { items[key] = value; }, items });

test('medalsReset while medalsInit waits locks the saved unlocks of medals not made yet too', () =>
{
    const localStorage = storage({ Game: JSON.stringify({ 0: { unlocked: true }, 1: { unlocked: true }, 2: { unlocked: true } }) });
    const { run } = loadEngine({ localStorage });
    const later = run(`
        medalsInit('Game');
        new Medal(0, 'One'); new Medal(1, 'Two');
        medalsReset();
        new Medal(2, 'Later').unlocked;
    `);
    assert.equal(later, false);
});

test('loading the medals again while medalsInit waits keeps the saved unlocks of medals not made yet', () =>
{
    // a Newgrounds session drop loads the medals again this way
    const localStorage = storage({ Game: JSON.stringify({ 0: { unlocked: true }, 2: { unlocked: true } }) });
    const { run } = loadEngine({ localStorage });
    const result = run(`
        medalsInit('Game');
        new Medal(0, 'One');
        medalsLoad();
        const later = new Medal(2, 'Later');
        [medals[0].unlocked, later.unlocked];
    `);
    assert.deepEqual([...result], [true, true]);
});

test('setting soundVolume directly changes the volume, as setSoundVolume does', async () =>
{
    const { run } = loadEngine();
    await run(`setHeadlessMode(true); setEngineManualStep(true); soundVolume = .7;
        engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run('engineStep()');
    assert.equal(run('audioMasterGain.gain.value'), .7, 'set before engineInit');
    run('soundVolume = .2; engineStep()');
    assert.equal(run('audioMasterGain.gain.value'), .2, 'set while running');
});

test('keys are asked for by code, a character asserts', () =>
{
    const { run } = loadEngine();
    assert.throws(()=> run(`keyIsDown('w')`), /Assert failed/);
    assert.throws(()=> run(`keyWasPressed(' ')`), /Assert failed/);
    assert.equal(run(`keyIsDown('KeyW')`), false);
});

test('gamepadVibrate asserts the browser limits and catches a refused rumble', async () =>
{
    let refused = 0;
    const pad = { vibrationActuator: { playEffect: ()=> { ++refused; return Promise.reject(new TypeError('no')); } } };
    const { run } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    assert.throws(()=> run('gamepadVibrate(0, 8000)'), /Assert failed/, 'over 5 seconds');
    assert.throws(()=> run('gamepadVibrate(0, 200, 2)'), /Assert failed/, 'a magnitude past 1');
    run('gamepadVibrate(0, 200)'); // refused by the stub, must not be an unhandled rejection
    await new Promise(resolve=> setTimeout(resolve, 10));
    assert.equal(refused, 1);
});

test('a confirm dialog blocks UI made after it opened', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('new UISystemPlugin');
    const result = run(`
        const clickAt = (p)=> { mousePosScreen = p.copy(); inputData[0][0] = 3; engineStep(); inputData[0][0] = 1;
            engineStep(); inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep(); };
        let afterClicks = 0, yes = 0;
        const dialog = uiSystem.showConfirmDialog('Quit?', ()=> ++yes);
        engineStep();
        const after = new UIButton(vec2(0, 350), vec2(200, 50), 'after'); // a HUD button made while it is open
        after.onClick = ()=> ++afterClicks;
        engineStep();
        clickAt(vec2(500, 850)); // over the later button
        const blocked = afterClicks;
        clickAt(vec2(420, 550)); // the dialog's yes
        [blocked, yes];
    `);
    assert.equal(result[0], 0, 'the later button got no click through the dialog');
    assert.equal(result[1], 1, 'the dialog still answers');
});

test('a tile collision layer casts shadows from its solid cells only, a run of them in one draw', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const result = run(`
        cameraPos = vec2(2, 1); mainCanvasSize = vec2(400); cameraScale = 20; // the whole layer in view
        const layer = new TileCollisionLayer(vec2(), vec2(4, 2), new TileInfo(vec2(), vec2(8)));
        layer.setCollisionData(vec2(1, 0)); layer.setCollisionData(vec2(2, 0)); layer.setCollisionData(vec2(3, 1));
        const draws = [];
        drawTile = (pos, size, tileInfo)=> draws.push([pos.x, pos.y, size.x, size.y,
            tileInfo.pos.x, tileInfo.pos.y, tileInfo.size.x, tileInfo.size.y, tileInfo.textureInfo === layer.textureInfo]);
        layer.renderShadow();
        const solid = draws.splice(0);
        layer.shadowSolidOnly = false;
        layer.renderShadow();
        [solid, draws.length, draws[0]?.[2], draws[0]?.[3]];
    `);
    const [solid, allCount, allWidth, allHeight] = result;
    // cells 1 and 2 of the bottom row as one quad, cell 3 of the top row, from those parts of the layer's texture
    assert.deepEqual([...solid].map(d=> [...d]), [[2, .5, 2, 1, 8, 8, 16, 8, true], [3.5, 1.5, 1, 1, 24, 0, 8, 8, true]]);
    assert.deepEqual([allCount, allWidth, allHeight], [1, 4, 2], 'with it off the whole layer casts');
});

test('medals saved under the game\'s own save name keep the game\'s data, and the debug build says so', () =>
{
    const localStorage = storage({ Game: JSON.stringify({ runs: 3 }) });
    const { run } = loadEngine({ localStorage });
    assert.throws(()=> run(`new Medal(0, 'First'); medalsInit('Game')`), /Assert failed/, 'the shared name is caught');

    // a release build, or data saved after medalsInit, keeps the game's keys through a medal unlock
    const clean = storage();
    const engine = loadEngine({ localStorage: clean });
    engine.run(`new Medal(0, 'First'); medalsInit('Game');
        writeSaveData('Game', { ...readSaveData('Game'), runs: 4 });
        medals[0].unlock();`);
    const saved = JSON.parse(clean.items.Game);
    assert.equal(saved.runs, 4);
    assert.equal(saved[0].unlocked, true);
});

test('engineStep runs one update a frame after manual step is turned on in a running game', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    // the loop running, where a frame with a long gap left next to no time over, then manual step turned on
    const counts = run(`
        const counts = [];
        for (const last of [1234.5678, 12345.678, 98765.4321])
        {
            engineManualStep = false;
            frameTimeLastMS = last;
            frameTimeBufferMS = -7.105427357601002e-15;
            setEngineManualStep(true);
            const f = frame;
            engineStep(2);
            counts.push(frame - f);
        }
        counts;
    `);
    assert.deepEqual([...counts], [2, 2, 2]);
});

test('a tile layer redraw or stamp inside the emissive pass draws its own texture in its own colors', () =>
{
    // the emissive pass forces a grey onto every draw, which must not go into a layer's texture
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this, imageSmoothingEnabled: true }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const seen = run(`
        const layer = new TileLayer(vec2(), vec2(2));
        const seen = [];
        layer.onRedraw = ()=> seen.push('in redraw ' + glColorAdditive);
        glColorMask = 0xff000000; glColorAdditive = 0x00ffffff;
        layer.redraw();
        seen.push('after redraw ' + glColorAdditive);
        drawTile = ()=> seen.push('in stamp ' + glColorAdditive);
        layer.drawTile(vec2(), vec2(1), new TileInfo(vec2(), vec2(8)));
        seen.push('after stamp ' + glColorAdditive);
        glColorMask = -1; glColorAdditive = 0;
        seen;
    `);
    assert.deepEqual([...seen], ['in redraw 0', 'after redraw 16777215', 'in stamp 0', 'after stamp 16777215']);
});
