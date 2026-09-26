import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// review round 15: a confirm dialog takes the keys from a field being edited behind it, and snapped slices under a
// mirrored context, each test on its own copy of the script build

// a headless engine running the UI system, stepped by hand
async function loadUI()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run('new UISystemPlugin');
    return engine;
}

test('a confirm dialog opened during an edit ends it, keys do not reach the field, and one Escape answers no', async () =>
{
    const { run, handlers } = await loadUI();
    run(`
        var field = new UITextInput(vec2(0, 90), vec2(150, 30), 'name');
        var changes = 0, cancelled = 0;
        field.onChange = ()=> ++changes;
        field.click(); engineStep();
        uiSystem.showConfirmDialog('Quit?', undefined, ()=> ++cancelled);
        var typed = (key)=> uiSystem._onKeyDown({ type: 'keydown', key, stopPropagation() {}, preventDefault() {} });
        typed('x');
        engineStep();
        typed('y');`);
    assert.equal(run('field.text'), 'name', 'the keys went to the dialog, not the field behind it');
    assert.equal(run('field.isKeyInputObject()'), false);
    assert.equal(run('changes'), 1, 'the edit ended with its onChange');
    handlers.keydown(keyEvent('Escape'));
    run('engineStep()');
    handlers.keyup(keyEvent('Escape'));
    run('engineStep()');
    assert.equal(run('cancelled'), 1, 'the first Escape closed the dialog');
    assert.equal(run('uiSystem.confirmDialog'), undefined);
    assert.equal(run('changes'), 1);
});

test('a confirm dialog closed with Escape gives the selection back to the item that opened it', async () =>
{
    const { run, handlers } = await loadUI();
    run(`
        var buttons = [];
        for (let i = 0; i < 4; ++i)
        {
            const b = new UIButton(vec2(0, i*60), vec2(200, 50), 'B'+i);
            b.navigationIndex = i;
            buttons.push(b);
        }
        buttons[3].onClick = ()=> uiSystem.showConfirmDialog('Quit?');`);
    const press = (code)=>
    {
        handlers.keydown(keyEvent(code));
        run('engineStep()');
        handlers.keyup(keyEvent(code));
        run('engineStep(20)');
    };
    for (let i = 0; i < 4; ++i)
        press('ArrowDown');
    assert.equal(run('uiSystem.navigationObject?.text'), 'B3');
    press('Enter');
    assert.ok(run('!!uiSystem.confirmDialog'));
    press('Escape');
    assert.equal(run('!!uiSystem.confirmDialog'), false);
    assert.equal(run('uiSystem.navigationObject?.text'), 'B3');
});

test('a click off a text field being edited ends the edit and reaches what it lands on, as in a web form', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); var gameSawPress = 0;
        engineInit(()=> {}, ()=> {}, ()=> { mouseWasPressed(0) && ++gameSawPress; }, ()=> {}, ()=> {})`);
    const result = run(`
        new UISystemPlugin;
        const a = new UITextInput(vec2(0, 0), vec2(200, 50), 'a');
        const b = new UITextInput(vec2(0, 100), vec2(200, 50), 'b');
        const ok = new UIButton(vec2(0, 200), vec2(200, 50), 'OK');
        let changesA = 0, clicks = 0;
        a.onChange = ()=> ++changesA;
        ok.onClick = ()=> ++clicks;
        engineStep();
        const click = (pos)=>
        {
            mousePosScreen = pos.copy();
            inputData[0][0] = 3; engineStep(); inputData[0][0] = 1; engineStep();
            inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep();
        };
        click(a.nativePos);
        const editingA = a.isKeyInputObject();
        click(b.nativePos);
        const editingB = b.isKeyInputObject();
        click(ok.nativePos);
        const afterOk = [clicks, uiSystem.keyInputObject === undefined];
        click(a.nativePos);
        click(vec2(900, 900)); // the world, off every UI object
        [editingA, editingB, changesA, ...afterOk, uiSystem.keyInputObject === undefined, gameSawPress];
    `);
    assert.deepEqual([...result], [true, true, 2, 1, true, true, 0]);
});

test('an ImageBitmap uploads through a canvas, so the premultiply flag applies to it as to any image', () =>
{
    const ImageBitmap = class { constructor() { this.width = this.height = 4; } };
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { drawImage: (image)=> this.drawn = image }; } };
    const { run } = loadEngine({ ImageBitmap, OffscreenCanvas });
    const uploaded = run(`
        const uploaded = [];
        glEnable = true;
        glContext = new Proxy({}, { get: (target, key)=> key in target ? target[key] :
            key === 'texImage2D' ? (...args)=> uploaded.push(args[5]) : key === 'createTexture' ? ()=> ({}) : ()=> {} });
        const bitmap = new ImageBitmap;
        glCreateTexture(bitmap);
        const image = { width: 4, height: 4 };
        glCreateTexture(image);
        [uploaded[0] instanceof OffscreenCanvas && uploaded[0].drawn === bitmap, uploaded[1] === image];
    `);
    assert.deepEqual([...uploaded], [true, true]);
});

test('in the 3D shadow pass a see through object draws blended, so the depth shader cuts it by its alpha', () =>
{
    const { run } = loadEngine();
    const blend = run(`
        setHeadlessMode(true);
        new Render3DPlugin;
        render3D.shadowPass = true;
        render3DSetObjectState({ transparent: true });
        const transparent = render3D.blend;
        render3DSetObjectState({ transparent: false });
        const opaque = render3D.blend;
        render3DSetObjectState({ transparent: true });
        render3DSetObjectState(); // the stage callbacks after the objects draw opaque
        render3D.shadowPass = false;
        [transparent, opaque, render3D.blend];
    `);
    assert.deepEqual([...blend], [true, false, false]);
});

test('manual step turned on by an update on a 120 Hz display runs one update on the first engineStep', async () =>
{
    let rafCallback;
    const { run } = loadEngine({ requestAnimationFrame: (f)=> { rafCallback = f; } });
    run(`setHeadlessMode(true); var updates = 0;
        engineInit(()=> {}, ()=> { ++updates; frame === 20 && setEngineManualStep(true); });`);
    await new Promise(resolve=> setTimeout(resolve, 1));
    for (let i = 0, t = 1e3; i < 200 && rafCallback && !run('engineManualStep'); ++i)
    {
        const f = rafCallback;
        rafCallback = undefined;
        f(t += 1e3/120);
    }
    const steps = run('const before = updates; engineStep(1); const first = updates - before; engineStep(10); [first, updates - before - first]');
    assert.deepEqual([...steps], [1, 10]);
});

test('a trail particle at rest still draws, unstretched', () =>
{
    const { run } = loadEngine();
    const drawn = run(`
        const drawn = [];
        drawTile = (pos, size)=> drawn.push(size.y);
        const emitter = { trailScale: 2, fadeRate: 0, angle: 0, pos: vec2() };
        const particle = new Particle(emitter, vec2(), 0, WHITE, WHITE, 1, 1, 1, vec2());
        particle.render();
        particle.velocity = vec2(0, 1);
        particle.render();
        drawn;
    `);
    assert.deepEqual([...drawn], [1, 2]);
});

test('in headless mode the gradient ellipse and wrapped texture draw into a context passed in', () =>
{
    const DOMMatrix = class { translate() { return this; } scale() { return this; } };
    const { run } = loadEngine({ DOMMatrix });
    const counts = run(`
        setHeadlessMode(true);
        let calls = 0;
        const handler = { get: (target, key)=> key in target ? target[key] : ()=> (++calls, new Proxy({}, handler)) };
        const context = new Proxy({}, handler);
        const counts = [];
        drawEllipseGradient(vec2(), vec2(1), WHITE, CLEAR_WHITE, 0, false, true, context);
        counts.push(calls);
        calls = 0;
        const textureInfo = new TextureInfo({ width: 4, height: 4 }, false, true);
        drawTextureWrapped(vec2(), vec2(4), vec2(2), textureInfo, WHITE, 0, undefined, false, true, context);
        counts.push(calls);
        counts;
    `);
    assert.ok(counts[0] > 0, 'the gradient ellipse drew');
    assert.ok(counts[1] > 0, 'the wrapped texture drew');
});

test('the canvas keeps its aspect limits when canvasMaxSize changes its shape', () =>
{
    const { run } = loadEngine({ innerWidth: 1000, innerHeight: 1000, devicePixelRatio: 1 });
    const size = run(`
        mainCanvas = { style: {}, width: 0, height: 0 };
        mainContext = new Proxy({}, { get: ()=> ()=> {} });
        glCanvas = undefined;
        canvasMaxSize = vec2(1280, 720);
        canvasMinAspect = canvasMaxAspect = 4/3;
        engineUpdateCanvas();
        [mainCanvasSize.x, mainCanvasSize.y];
    `);
    assert.deepEqual([...size], [960, 720]);
});

test('drawLight builds a shadow casting light its shadow texture, and draws hard and zero size lights', () =>
{
    const { run } = loadEngine();
    const result = run(`
        glEnable = true; mainCanvasSize = vec2(800, 600);
        const ints = [];
        glContext = new Proxy({}, { get: (target, key)=> key === 'uniform1i' ? (location, value)=> ints.push(value) :
            ()=> ({}) });
        let shadowBuilds = 0;
        const system = { lightShader: {}, shadows: true, shadowMap: {}, renderLightShadow: ()=> ++shadowBuilds };
        const drawLight = (light)=> LightSystemPlugin.prototype.drawLight.call(system, light);
        drawLight(new Light(vec2(), 4));
        const shadow = [shadowBuilds, ints.at(-1)];
        const quiet = new Light(vec2(), 4);
        quiet.castShadow = false;
        drawLight(quiet);
        const quietShadow = [shadowBuilds, ints.at(-1)];
        drawLight(new Light(vec2(), 0));
        drawLight(new Light(vec2(), 4, undefined, 0));
        [...shadow, ...quietShadow];
    `);
    assert.deepEqual([...result], [1, 1, 1, 0], 'the shadow texture was built and used, and not for castShadow false');
});

test('a snapped nine slice under a mirrored context keeps its center and its border sizes', () =>
{
    const { run } = loadEngine();
    const pieces = JSON.parse(run(`(()=> {
        const pieces = [];
        drawTile = (pos, size)=> pieces.push([pos.x, size.x]);
        const context = { getTransform: ()=> ({ a: -1, d: 1, e: 128, f: 0 }) };
        const tileInfo = new TileInfo(vec2(), vec2(16));
        drawNineSliceScreen(vec2(64), vec2(64), tileInfo, WHITE, 16, undefined, 0, 0, false, context);
        return JSON.stringify(pieces.filter((p, i)=> i < 3)); // one row, right to left
    })()`));
    assert.deepEqual(pieces.map(p=> p[1]), [16, 32, 16], 'border, center, border');
    assert.deepEqual(pieces.map(p=> p[0] + .5), [88, 64, 40], 'centered on the logical columns');
});
