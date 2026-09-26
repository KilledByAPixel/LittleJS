import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// review round 14: regressions from the round 12 changes, each on its own copy of the script build

test('the debug overlay lists a held mouse button and gamepad button without asserting', () =>
{
    const { run } = loadEngine();
    const result = run(`
        const drawn = [];
        const noop = ()=> {};
        mainContext = new Proxy({}, { get: (target, key)=> key in target ? target[key] :
            key === 'fillText' ? (text)=> drawn.push(text) : key === 'measureText' ? ()=> ({ width: 10 }) : noop });
        debugOverlay = true;
        inputData[0][0] = 1;                   // the left mouse button held
        inputData[1] = { 3: 1 };               // a gamepad button held
        debugRender();
        drawn.filter(t=> /^(Mouse|Gamepad [0-9])/.test(t));
    `);
    assert.deepEqual([...result], ['Mouse: 0 ', 'Gamepad 0: 3 ']);
});

test('an update that turns manual step off stops engineStep there, and the loop runs from real time', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> {}, ()=> { frame === 5 && setEngineManualStep(false); },
        ()=> {}, ()=> {}, ()=> {})`);
    const stepped = run('engineStep(600); const f = frame; setEngineManualStep(true); f');
    assert.ok(stepped <= 6, 'stopped at the frame that turned it off, not after ' + stepped);
});

test('the mouse wheel over a text field is left to it, and the game does not take it', () =>
{
    const { run, handlers } = loadEngine();
    const field = { tagName: 'TEXTAREA', closest: (s)=> s.includes('textarea') ? field : null };
    let cancelled = false;
    handlers.wheel({ deltaY: 1, target: field, cancelable: true, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, false);
    assert.equal(run('mouseWheel'), 0);
    const button = { tagName: 'BUTTON', closest: (s)=> s.includes('button') ? button : null };
    handlers.wheel({ deltaY: 1, target: button, cancelable: true, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, true, 'a button does not scroll, the page is kept still');
    assert.equal(run('mouseWheel'), 1);
});

test('a tween callback that calls tweenUpdate moves each tween once per update, with no crash', () =>
{
    const { run } = loadEngine();
    const result = run(`
        new Tween(()=> {}, 0, 1, 1);
        let nested = false;
        const tween = new Tween((value)=> { if (value > 0 && !nested) { nested = true; tweenUpdate(.1); } }, 0, 1, 1);
        tweenUpdate(.1);
        tween.life;
    `);
    assert.ok(Math.abs(result - .8) < 1e-9, 'two updates of .1, life ' + result);
});

test('a child let go during the update from an earlier place in the list still updates that frame', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const updates = run(`
        const item = new EngineObject(vec2());        // made first, so it is earlier in the list
        const player = new EngineObject(vec2());
        player.addChild(item);
        engineStep();
        let itemUpdates = 0;
        item.update = function() { ++itemUpdates; EngineObject.prototype.update.call(this); };
        player.update = function() { this.removeChild(item); EngineObject.prototype.update.call(this); };
        engineStep();
        itemUpdates;
    `);
    assert.equal(updates, 1);
});

test('a tile layer stamp draws without the Shader set outside it, and puts it back', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const seen = run(`
        const layer = new TileLayer(vec2(), vec2(2));
        const shader = new Shader('void mainImage(out vec4 c, vec2 uv) { c = vec4(1); }');
        const seen = [];
        drawTile = ()=> seen.push(glCustomShader === shader);
        setShader(shader);
        layer.drawTile(vec2(), vec2(1), new TileInfo(vec2(), vec2(8)));
        seen.push(glCustomShader === shader);
        setShader();
        seen;
    `);
    assert.deepEqual([...seen], [false, true]);
});

test('tileLayersLoad makes only the collision layer solid, the art layers are skipped by solid tests', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const solid = run(`
        const layer = (data)=> ({ type: 'tilelayer', data, width: 2, height: 1, visible: true });
        const layers = tileLayersLoad({ width: 2, height: 1, layers: [layer([1, 0]), layer([1, 1]), layer([0, 1])] },
            undefined, 0, 1, false);
        layers.map(l=> l.isSolid);
    `);
    assert.deepEqual([...solid], [false, true, false]);
});

test('a layer over the device texture limit warns, in release builds too', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const warnings = [];
    const { run } = loadEngine({ OffscreenCanvas, console: { ...console, warn: (text)=> warnings.push(text) } });
    run(`glEnable = true; glContext = new Proxy({ MAX_TEXTURE_SIZE: 3379, getParameter: ()=> 4096 },
        { get: (target, key)=> key in target ? target[key] : ()=> ({}) });
        glRegisterTextureInfo = ()=> {};
        new CanvasLayer(vec2(), vec2(10), 0, 0, vec2(5000, 100));
        new CanvasLayer(vec2(), vec2(10), 0, 0, vec2(4000, 100));`);
    assert.equal(warnings.filter(w=> /texture limit/.test(w)).length, 1);
});
