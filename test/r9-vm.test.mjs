import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// review round 9: input, debug drawing, particles and UI fixes that need the real page event handlers or engine
// internals, each test on its own copy of the script build

test('touch input turned on after engineInit works', () =>
{
    const { run, handlers } = loadEngine({ window: { ontouchstart: null } }, 'setTouchInputEnable(false)');
    assert.ok(handlers.touchstart, 'the touch listeners are there whatever the setting');
    run('setTouchInputEnable(true)');
    const finger = { identifier: 1, clientX: 10, clientY: 10, target: {} };
    handlers.touchstart({ type: 'touchstart', touches: [finger], changedTouches: [finger], cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), true);
});

test('turning WASD emulation off while W is held still lets go of the arrow it pressed', () =>
{
    const { run, handlers } = loadEngine();
    handlers.keydown(keyEvent('KeyW'));
    run('inputUpdatePost()');
    assert.equal(run(`keyIsDown('ArrowUp')`), true);
    run('setInputWASDEmulateDirection(false)');
    handlers.keyup(keyEvent('KeyW'));
    run('inputUpdatePost()');
    assert.equal(run(`keyIsDown('ArrowUp')`), false);
    assert.equal(run('keyDirection().y'), 0);
});

// a 2D context stub that keeps its state and a save/restore stack, like a real one
const contextStub = `(()=>
{
    const defaults = { textAlign:'start', textBaseline:'alphabetic', font:'10px sans-serif', fillStyle:'#000000',
        lineWidth:1, globalCompositeOperation:'source-over' };
    const c = { ...defaults, stack:[], compositeWrites:0 };
    c.save = ()=> c.stack.push(Object.fromEntries(Object.keys(defaults).map(k=>[k, c[k]])));
    c.restore = ()=> Object.assign(c, c.stack.pop());
    for (const f of ['fillText','fillRect','strokeRect','translate','rotate','scale','beginPath','arc','fill','stroke',
        'moveTo','lineTo','closePath','setTransform','clearRect','drawImage','rect'])
        c[f] = ()=> {};
    return new Proxy(c, { set: (t, k, v)=> { k === 'globalCompositeOperation' && ++t.compositeWrites; t[k] = v; return true; } });
})()`;

test('the debug drawing leaves the main context as it found it for the next frame', () =>
{
    const { run } = loadEngine();
    run(`glEnable = false; mainCanvasSize = vec2(800, 600); mainContext = ${contextStub}; debugWatermark = true;`);
    const state = ()=> run(`JSON.stringify([mainContext.textAlign, mainContext.textBaseline, mainContext.font,
        mainContext.fillStyle, mainContext.lineWidth])`);
    const before = state();
    run('debugRect(vec2(), vec2(1)); debugRender();');
    assert.equal(state(), before);
});

test('timed debug shapes still expire while the game is paused', () =>
{
    const { run } = loadEngine();
    run(`glEnable = false; mainCanvasSize = vec2(800, 600); debugWatermark = false; mainContext = ${contextStub};
        paused = true; time = 5;`);
    for (let f = 120; f--;)
        run(`timeReal += 1/60; debugRect(vec2(), vec2(1), '#f00', .5); debugRender();`);
    const kept = run('debugPrimitives.length');
    assert.ok(kept <= 31, 'about half a second of them, not every one made: ' + kept);
});

test('an additive emitter switches the blend once for all its particles', () =>
{
    const { run } = loadEngine();
    const writes = run(`
        setHeadlessMode(false); glEnable = false; mainCanvasSize = vec2(800, 600);
        mainContext = drawContext = ${contextStub};
        const emitter = new ParticleEmitter(vec2());
        emitter.additive = true;
        for (let i = 50; i--;) emitter.emitParticle();
        emitter.render();
        [drawContext.compositeWrites, glAdditive];`);
    assert.deepEqual([...writes], [2, false], 'on and off once, and off after');
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

test('left and right aligned UI text sits against its side of the box, not its center', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const left = new UIText(vec2(0), vec2(400, 50), 'Hi', 'left');
        const right = new UIText(vec2(0), vec2(400, 50), 'Hi', 'right');
        const center = new UIText(vec2(0), vec2(400, 50), 'Hi');
        const size = left.getTextSize();
        [left.getTextPos(size).x - left.nativePos.x, right.getTextPos(size).x - right.nativePos.x,
            center.getTextPos(size).x - center.nativePos.x, size.x];`);
    const [left, right, center, width] = [...result];
    assert.equal(left, -width/2);
    assert.equal(right, width/2);
    assert.equal(center, 0);
});

test('a text field hidden mid edit ends the edit with onChange, however the next key comes', async () =>
{
    for (const keyFirst of [false, true])
    {
        const { run, context } = await loadUI();
        context.addEventListener = (type, f)=> type === 'keydown' && (context.keyListener = f);
        const result = run(`
            const menu = new UIObject(vec2(0), vec2(400));
            const field = menu.addChild(new UITextInput(vec2(0), vec2(200, 50), 'abc'));
            let changes = 0, releases = 0;
            field.onChange = ()=> ++changes;
            field.onRelease = ()=> ++releases;
            uiSystem.keyInputObject = field; uiSystem.activeObject = field;
            menu.visible = false;
            ${keyFirst ? `keyListener({ key: 'd', code: 'KeyD', stopPropagation() {}, preventDefault() {} });` : ''}
            engineStep(); engineStep();
            [changes, releases, !!uiSystem.keyInputObject, field.text];`);
        assert.deepEqual([...result], [1, 0, false, 'abc'], keyFirst ? 'a key first' : 'the update first');
    }
});

test('Backspace in a text field removes a whole character, and works on a number', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const key = (key)=> ({ key, code: key, stopPropagation() {}, preventDefault() {} });
        const emoji = new UITextInput(vec2(0), vec2(200, 50), 'hi😀');
        emoji.onKeyDown(key('Backspace'));
        const number = new UITextInput(vec2(0), vec2(200, 50), 123);
        number.onKeyDown(key('Backspace'));
        [emoji.text, number.text];`);
    assert.deepEqual([...result], ['hi', '12']);
});

test('a UILayout leaves no gap for a hidden child', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const menu = new UILayout(vec2(0), 1, 10, 10);
        const [a, b, c] = ['a', 'b', 'c'].map(t=> menu.addChild(new UIButton(vec2(), vec2(100, 40), t)));
        const full = menu.size.y;
        b.visible = false;
        menu.relayout();
        [full, menu.size.y, c.localPos.y - a.localPos.y];`);
    const [full, shown, spacing] = [...result];
    assert.equal(full, 3*40 + 2*10 + 2*10);
    assert.equal(shown, 2*40 + 10 + 2*10, 'two rows now');
    assert.equal(spacing, 50, 'c right after a');
});

test('the screen slice draws take a color and additive color like the world ones', () =>
{
    const { run, context } = loadEngine();
    const calls = [];
    context.drawNineSlice = (...args)=> calls.push(args);
    context.drawThreeSlice = (...args)=> calls.push(args);
    run(`const t = new TileInfo(vec2(), vec2(16));
        drawNineSliceScreen(vec2(), vec2(64), t, RED, 8, BLUE);
        drawThreeSliceScreen(vec2(), vec2(64), t, GREEN)`);
    assert.equal(calls[0][3], run('RED'));
    assert.equal(calls[0][4], 8);
    assert.equal(calls[0][5], run('BLUE'));
    assert.equal(calls[1][3], run('GREEN'));
    assert.equal(calls[1][9], true, 'screen space');
});
