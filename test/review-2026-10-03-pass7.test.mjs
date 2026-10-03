import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import { parseOBJ } from '../dist/littlejs.esm.js';

// The seventh pass of 2026-10-03: a press outside the canvas, a second confirm dialog, a slider let go as it moves.

// a canvas from x 300 to 700 and y 0 to 400 in the window, letterboxed, the bars around it outside it
function letterboxed()
{
    const engine = loadEngine({ window: { ontouchstart: null } }); // a window that takes touch
    engine.run(`setHeadlessMode(true);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 300, top: 0, right: 700, bottom: 400 }) };`);
    return engine;
}
const target = {};

test('a click in the bars around the canvas presses nothing, one on it presses', ()=>
{
    const { run, handlers } = letterboxed();
    handlers.mousedown({ button: 0, x: 900, y: 200, target, cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), false, 'right of the canvas');
    handlers.mouseup?.({ button: 0, x: 900, y: 200, target, cancelable: false });
    run('inputUpdatePost()');
    handlers.mousedown({ button: 0, x: 500, y: 200, target, cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), true, 'on it');
});

test('a tap in the bars around the canvas presses nothing, one on it presses', ()=>
{
    const { run, handlers } = letterboxed();
    const touch = (type, clientX)=>
    {
        const t = { clientX, clientY: 200, identifier: 1, target };
        handlers[type]({ type, touches: type == 'touchend' ? [] : [t], changedTouches: [t], cancelable: false, target });
    };
    touch('touchstart', 50);
    assert.equal(run('mouseIsDown(0)'), false, 'left of the canvas');
    touch('touchend', 50);
    run('inputUpdatePost()');
    touch('touchstart', 500);
    assert.equal(run('mouseWasPressed(0)'), true, 'on it');
});

test('a second confirm dialog while one is open is the one already open, in a release build', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run(`setHeadlessMode(true); var ui = new UISystemPlugin; ui.navigationDirection = 1;
        var first = ui.showConfirmDialog('Quit?'), second = ui.showConfirmDialog('Really?');`);
    assert.equal(run('first === second'), true);
    run('first.destroy();');
    assert.deepEqual([run('ui.navigationDirection'), run('ui.confirmDialog')], [1, undefined]);
});

test('a slider let go in the frame it moves takes the last place, as one let go a frame later does', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('new UISystemPlugin');
    // pressed in its middle, moved right, then moved again, let go in that frame or the next
    const slide = (sameFrame)=> run(`{
        const slider = new UISlider(vec2(), vec2(400, 50)); engineStep();
        const at = (x, state)=> { mousePosScreen = slider.nativePos.add(vec2(x - 500, 0)); inputData[0][0] = state;
            engineStep(); };
        at(500, 3); at(560, 1); at(620, ${sameFrame} ? 4 : 1); ${sameFrame} || at(620, 4); at(620, 0);
        const value = slider.value; slider.destroy(); engineStep(); value; }`);
    const later = slide(false);
    assert.ok(later > .6, 'a value past the middle, ' + later);
    assert.equal(slide(true), later);
});

// a standard gamepad of some buttons, none held
const pad = (buttons, axes=[0, 0, 0, 0])=> ({ mapping: 'standard', axes,
    buttons: Array.from({length: buttons}, ()=> ({pressed: false, value: 0})) });

test('a gamepad of fewer buttons put in the same slot holds none of the last one\'s', () =>
{
    const pads = [pad(17)];
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> pads } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v; // no camera here
    const tick = ()=> run('inputUpdate(); inputUpdatePost();');
    pads[0].buttons[12] = { pressed: true, value: 1 };
    tick(); tick();
    assert.equal(run('gamepadIsDown(12)'), true);
    pads[0] = pad(4);
    tick(); tick();
    assert.equal(run('gamepadIsDown(12)'), false);
});

test('a gamepad axis that reads NaN is a centered stick, not a failed assert', () =>
{
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> [pad(17, [NaN, .5, 0, 0])] } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v;
    run('inputUpdate(); inputUpdatePost();');
    assert.equal(run('gamepadStick(0).x'), 0);
});

test('a text input takes a keydown with no key, as autofill sends, and types nothing', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new UISystemPlugin; var input = new UITextInput(vec2(), vec2(200, 50), 'ab');
        input.onKeyDown({ code: '' });`);
    assert.equal(run('input.text'), 'ab');
});

// the objects' update with the sort and the copies of positions counted
function counted(code)
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); var sorts = 0, copies = 0; const copy = Vector2.prototype.copy;
        Vector2.prototype.copy = function() { ++copies; return copy.call(this); };
        var count = ()=> { engineObjects.sort = function(f) { ++sorts; return Array.prototype.sort.call(this, f); }; };` + code);
    return run;
}

test('an object with mass that collides with nothing copies no position to update', () =>
{
    const run = counted(`var o = new EngineObject(vec2(), vec2(1)); o.velocity = vec2(.1, 0);
        engineObjectsUpdate(); copies = 0; engineObjectsUpdate();`);
    assert.deepEqual([run('copies'), run('o.pos.x')], [0, .2]);
});

test('objects already in render order are not sorted again, one out of order is, and they update in that order', () =>
{
    const run = counted(`var order = []; class Logged extends EngineObject { update() { order.push(this.name); } }
        var a = new Logged(vec2()), b = new Logged(vec2()); a.name = 'a', b.name = 'b';
        count(); engineObjectsUpdate(); var before = sorts;
        a.renderOrder = 1; count(); engineObjectsUpdate();`);
    assert.deepEqual([run('before'), run('sorts'), run('order.join("")')], [0, 1, 'abba']);
});

// a canvas context that takes any call and keeps the points drawn
function fakeContext()
{
    const points = [];
    return { points, context: new Proxy({ lineTo: (x, y)=> points.push([x, y]) },
        { get: (target, key)=> key in target ? target[key] : ()=> {}, set: ()=> true }) };
}

test('an outline is made into kept vectors, the same points every time', () =>
{
    const { run } = loadEngine();
    run(`var made = 0; const make = vec2; vec2 = (...a)=> (++made, make(...a));
        var square = [make(0, 0), make(1, 0), make(1, 1), make(0, 1)];
        var outline = ()=> JSON.stringify(glMakeOutline(square, .2).map((p)=> [p.x, p.y]));
        var first = outline(); made = 0; var second = outline();`);
    assert.equal(run('second'), run('first'));
    assert.equal(run('made'), 0);
    assert.deepEqual(JSON.parse(run('first')).slice(0, 2).map((p)=> p.map((n)=> Math.round(n * 1e9) / 1e9)),
        [[-.1, -.1], [.1, .1]], 'inner, then outer');
});

test('a regular polygon draws the same points with no new vectors after its first', () =>
{
    const { run, context } = loadEngine();
    run('setHeadlessMode(true)');
    const draw = (sides=6)=>
    {
        const fake = fakeContext();
        context.fake = fake.context;
        run(`made = 0; drawRegularPoly(vec2(), vec2(2, 4), ${sides}, WHITE, 0, BLACK, 0, false, false, fake);`);
        return fake.points;
    };
    run(`var made = 0; const make = vec2; vec2 = (...a)=> (++made, make(...a));`);
    const first = draw(), second = draw();
    assert.deepEqual(second, first);
    assert.deepEqual(first.at(-1).map((n)=> Math.round(n * 1e9) / 1e9), [0, 2], 'the last side ends at the top');
    const few = run('made');
    draw(30); draw(30);
    assert.equal(run('made'), few, 'no more for more sides');
});

test('an OBJ file reads a comment after a face, old Mac line ends, and a line carried on with a backslash', () =>
{
    const square = (end)=> ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4 # the square'].join(end);
    const triangles = (text)=> parseOBJ(text, false).indices.length / 3;
    assert.equal(triangles(square('\n')), 2);
    assert.equal(triangles(square('\r')), 2, 'carriage returns alone');
    assert.equal(triangles(square('\r\n')), 2);
    assert.equal(triangles(square('\n').replace('f 1 2 3 4', 'f 1 2 \\\n3 4')), 2, 'carried on');
});

test('writeSaveData takes an object, the kind readSaveData gives back, and says whether it was written', () =>
{
    const items = {}, full = { getItem: ()=> null, setItem: ()=> { throw new Error('QuotaExceededError'); } };
    let { run } = loadEngine({ localStorage: { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = v; } } });
    assert.equal(run(`writeSaveData('game', {best: 3})`), true);
    assert.equal(run(`readSaveData('game').best`), 3);
    for (const value of ['[1, 2]', `'text'`, 'undefined'])
        assert.throws(()=> run(`writeSaveData('game', ${value})`), /Assert failed/, value);
    ({ run } = loadEngine({ localStorage: full }));
    assert.equal(run(`writeSaveData('game', {best: 3})`), false, 'storage full');
});

test('a particle effect name cut at 60 characters loses the space it ends on, so sanitizing again changes nothing', () =>
{
    const { run } = loadEngine();
    run(`var once = particleEffectSanitize({name: 'a'.repeat(59) + ' b'}), twice = particleEffectSanitize(once);`);
    assert.equal(run('once.name'), 'a'.repeat(59));
    assert.equal(run('twice.name'), run('once.name'));
});

test('a ray that misses an object\'s sphere makes no vectors, and raycastSphere gives what it gave', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`var box = new EngineObject3D(vec3(5, 0, 0), render3D.boxMesh); render3DObjectMatrix(box); box.mesh.computeRadius();
        var made = 0; // the methods that make a vector, counted
        for (const [type, name] of [[Vector3, 'subtract'], [Vector3, 'add'], [Vector3, 'scale'], [Vector3, 'copy'],
            [Matrix4, 'getTranslation']])
        { const f = type.prototype[name]; type.prototype[name] = function(...a) { ++made; return f.apply(this, a); }; }
        var miss = new Ray3D(vec3(0, 10, 0), vec3(1, 0, 0)); made = 0; var result = render3DRaycastObject(miss, box);`);
    assert.deepEqual([run('result'), run('made')], [undefined, 0]);
    assert.equal(run('raycastSphere(new Ray3D(vec3(0, 0, 0), vec3(1, 0, 0)), vec3(5, 0, 0), 1)'), 4);
    assert.equal(run('raycastSphere(new Ray3D(vec3(5, .5, 0), vec3(1, 0, 0)), vec3(5, 0, 0), 1)'), 0, 'from inside');
    assert.equal(run('raycastSphere(new Ray3D(vec3(0, 2, 0), vec3(1, 0, 0)), vec3(5, 0, 0), 1)'), undefined);
});

// a game whose update throws once, at its third frame, its frames run by hand as the browser would run them
async function throwingGame(file)
{
    const callbacks = [], errors = [];
    const { run } = loadEngine({ requestAnimationFrame: (f)=> callbacks.push(f),
        console: { ...console, error: (e)=> errors.push(String(e)) } }, '', file);
    run('setHeadlessMode(true); var thrown = false;');
    await run(`engineInit(()=> {}, ()=> { if (frame === 3 && !thrown) { thrown = true; throw new Error('boom'); } },
        ()=> {}, ()=> {}, ()=> {})`);
    let t = 0;
    const pump = (count)=> { for (let i = count; i-- && callbacks.length;) callbacks.shift()(t += 1e3 / 60); };
    return { run, errors, pump, callbacks };
}

test('a release build keeps running after an error in a frame, and logs the first one', async () =>
{
    const { run, errors, pump } = await throwingGame('littlejs.release.js');
    pump(20);
    assert.ok(run('frame') > 10, 'frames went on, ' + run('frame'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /boom/);
});

test('a debug build stops at an error, as it shows it', async () =>
{
    const { run, pump, callbacks } = await throwingGame();
    assert.throws(()=> pump(20), /boom/);
    assert.deepEqual([run('frame'), callbacks.length], [3, 0]);
});
