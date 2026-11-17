import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// Full pass 28 of 2026-11-16: two movers pushing over a floor listed after them, and a trigger asked from a settle
// that moves the body; the 3D editor while an async restart waits; a tap beside a touch gamepad control with
// passthrough, the paused start zone, a button off the canvas, the dpad's diagonals and a hidden page; an Infinity
// save default; a Tiled class property's Color and Vector2 members, a class instance default, members with no
// default and a null default; a collision layer index that is no tile layer; the platformer's layers in any order;
// the page pause for a context that starts late and for a UIVideo; a slider's negative corner; edit2D.setProperty

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

// a player of mass 1 walking a crate of mass 1 along a floor, the floor (t) and a wall ahead (w) in any list order
// with the player (p) and the crate (c); each frame from 31 on, the crate's and the player's height and ground
function pushCrate(order)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const box = (pos, size, mass=0)=> { const o = new EngineObject3D(pos); o.size3D = size; o.setCollision();
            o.mass = mass; o.restitution = 0; mass || (o.gravityScale = 0); return o; };
        const make = { t: ()=> box(vec3(0, -.5, 0), vec3(20, 1, 6)), w: ()=> box(vec3(3.25, 1.5, 0), vec3(.5, 3, 6)),
            c: ()=> box(vec3(.5, .5, 0), vec3(1, 1, 1), 1), p: ()=> box(vec3(-1, .5, 0), vec3(.8, 1, .8), 1) };
        const o = {};
        for (const k of '${order}') o[k] = make[k]();
        const heights = new Set, grounded = [];
        for (let frame = 0; frame < 60; ++frame)
        {
            o.p.velocity3D.x = .1;
            engineObjectsUpdate();
            if (frame <= 30) continue;
            heights.add(o.c.pos3D.y.toFixed(3)), heights.add(o.p.pos3D.y.toFixed(3));
            grounded.push(!!o.c.groundObject && !!o.p.groundObject);
        }
        return JSON.stringify({heights: [...heights], grounded: grounded.every((g)=> g)});
    })()`));
}

test('two movers pushing over a floor listed after them stay at rest height and on the ground every frame (C1)', ()=>
{
    for (const order of ['pct', 'pwct', 'wpct', 'pcwt', 'cpwt', 'tpwc', 'ptc'])
        assert.deepEqual(pushCrate(order), {heights: ['0.500'], grounded: true}, order);
});

test('a trigger asked from a settle that sends the body away leaves it where it was sent, in every order (C2)', ()=>
{
    for (const order of ['wpbt', 'wbpt', 'pwbt', 'pbwt', 'bwpt', 'bpwt', 'twpb', 'tbpw'])
    {
        const { run } = loadEngine();
        const at = run(`(()=>
        {
            setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
            const f = new EngineObject3D(vec3(0, -.5, 0)); f.size3D = vec3(40, 1, 40); f.setCollision(); f.mass = 0;
            let frame = 0, sent = -1;
            const make = {
                w: ()=> { const w = new EngineObject3D(vec3(3.25, 2, 0)); w.size3D = vec3(.5, 4, 40); w.setCollision();
                    w.mass = 0; return w; },
                b: ()=> { const b = new EngineObject3D(vec3(0, .5, 0)); b.size3D = vec3(1, 1, 1); b.setCollision();
                    b.mass = 1; b.restitution = 0; return b; },
                p: ()=> { const p = new EngineObject3D(vec3(-1.5, .6, 0)); p.size3D = vec3(1, 1, 3); p.setCollision();
                    p.mass = 0; p.gravityScale = 0; return p; },
                // a respawn volume over the squeeze: from frame 25 it sends the body away, once
                t: ()=> { const t = new EngineObject3D(vec3(-1.7, 1.5, 0)); t.size3D = vec3(8.6, 3, 10);
                    t.setCollision(true, false); t.mass = 0; t.gravityScale = 0;
                    t.collideWithObject = (other)=>
                    {
                        if (frame >= 25 && sent < 0 && other.mass)
                            sent = frame, other.pos3D = vec3(-10, .5, 0), other.velocity3D = vec3();
                        return false;
                    };
                    return t; },
            };
            const o = {};
            for (const c of '${order}') o[c] = make[c]();
            let after;
            for (; frame < 40; ++frame)
            {
                o.p.velocity3D = vec3(o.p.pos3D.x < 1.7 - 1e-9 ? Math.min(.2, 1.7 - o.p.pos3D.x) : 0, 0, 0);
                engineObjectsUpdate();
                frame === sent && (after = o.b.pos3D.x.toFixed(3));
            }
            return after;
        })()`);
        assert.equal(at, '-10.000', order);
    }
});

test('the 3D editor while an async restart waits: no maps made on open, edits refused, one of each after (D1, D3)',
    async ()=>
{
    const { run } = await engine({}, true);
    run(`
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}],
            voxels: {pos: [-4, 0, -4], size: [8, 4, 8], blocks: [64, 1, 192, 0]},
            terrain: {pos: [0, -1, 0], size: [16, 16], height: 2, heights: [[0, 0, 0], [0, 1, 0], [0, 0, 0]]}};
        var list = level3DLoad(level); engineStep(2);
        var go;
        // a restart that unloads by its list, waits, and loads again
        levelEditor.onRestart = async ()=>
        {
            list.forEach((o)=> o.destroy());
            await new Promise((r)=> go = r);
            list = level3DLoad(level);
        };
        var count = ()=> JSON.stringify([VoxelMap, HeightMap].map((k)=> engineObjects.filter((o)=> !o.destroyed &&
            o instanceof k).length).concat(engineObjects.filter((o)=> !o.destroyed && o.mesh === render3D.boxMesh).length,
            render3DLevel.length, level.objects.length));
        levelEditor.open(); engineStep();
        editor3DRestart(); engineStep(); levelEditor.open(); engineStep();`);
    assert.deepEqual(JSON.parse(run('count()')), [0, 0, 0, 0, 1], 'opened while it waits, nothing made again');
    const refused = JSON.parse(run(`(()=>
    {
        const placed = levelEditor.edit3D.place('Box', vec3(4, 0, 0)); editor3DStrokeEnd();
        const changed = editor3DChange((list)=> list.push({type: 'Box', pos: [2, 0, 0]}));
        const part = editor3DChangePart('terrain', ()=> undefined);
        const undone = editor3DUndo();
        return JSON.stringify([!!placed, changed, part, undone, editor3DPrefabMessage === EDITOR3D_RESTART_WAIT]);
    })()`));
    assert.deepEqual(refused, [false, false, false, false, true], 'place, change, a part and undo wait, said');
    run('go()');
    await new Promise((resolve)=> setTimeout(resolve, 10));
    run('engineStep()');
    assert.deepEqual(JSON.parse(run('count()')), [1, 1, 1, 2, 1], 'one of each after the restart');
    assert.equal(run('editor3DPrefabMessage'), '', 'the wait message goes with the wait');
    run('levelEditor.close(); engineStep(); list.forEach((o)=> o.destroy()); engineStep(); list = level3DLoad(level);' +
        'engineStep()');
    assert.deepEqual(JSON.parse(run('count()')), [1, 1, 1, 2, 1], 'and a restart by its list keeps one of each');
});

// a touch on the touch gamepad's right zone, a 300 pixel box in the corner of a 1000 pixel stage, with passthrough
function gamepadTap(x, y, setup='')
{
    const { run, handlers, context } = loadEngine({ window: { ontouchstart: null } });
    const zone = { tagName: 'DIV', closest: ()=> null, setPointerCapture() {} };
    context.zone = zone;
    run(`touchGamepadEnable = true; touchGamepadPassthrough = true; touchGamepadSideZones[1] = globalThis.zone;
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) }; ${setup}`);
    run(`touchGamepadPointerDown({ pointerType: 'touch', pointerId: 7, clientX: ${x}, clientY: ${y},
        preventDefault() {} }, globalThis.zone)`);
    const touch = { identifier: 7, clientX: x, clientY: y, target: zone };
    handlers.touchstart({ type: 'touchstart', touches: [touch], changedTouches: [touch], target: zone,
        cancelable: false, preventDefault() {} });
    return JSON.parse(run(`JSON.stringify({game: mouseIsDown(0), gamepad: touchGamepadPointerRole.size})`));
}

test('with passthrough a tap in a gamepad zone beside its controls is the game\'s, one on a control the gamepad\'s (I1)',
    ()=>
{
    assert.deepEqual(gamepadTap(720, 720), {game: true, gamepad: 0}, 'beside the buttons');
    assert.deepEqual(gamepadTap(900, 820), {game: false, gamepad: 1}, 'on a button');
});

test('paused with passthrough, the start zone is the center button, not the screen (I2)', ()=>
{
    const { run } = loadEngine({ window: { ontouchstart: null } });
    const css = JSON.parse(run(`(()=>
    {
        const zone = ()=> ({ style: { cssText: '', display: '' } });
        touchGamepadOverlay = { style: {} }; touchGamepadSideZones = [zone(), zone()]; touchGamepadZoneC = zone();
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) };
        touchGamepadBuildSvg = ()=> {};
        setTouchGamepadEnable(true); setTouchGamepadCenterButtonSize(50); setPaused(true);
        const read = ()=> touchGamepadZoneC.style.cssText.includes('inset:0');
        touchGamepadRelayout(); const whole = read();
        touchGamepadPassthrough = true; touchGamepadRelayout();
        return JSON.stringify([whole, read()]);
    })()`));
    assert.deepEqual(css, [true, false]);
});

test('touchGamepadButtonPos keeps a button\'s size past the canvas edge, and one off the canvas is undefined (I3)', ()=>
{
    const { run } = loadEngine();
    run(`setTouchGamepadEnable(true);
        touchGamepadOverlay = { style: { opacity: '0.3', display: '' } };
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0 }) };
        var cx = '900';
        touchGamepadSvgEls = { face: [{ getAttribute: (k)=> ({ cx, cy: '500', r: '25' })[k] }], thumb: [] };`);
    const read = (x)=> run(`cx = '${x}'; JSON.stringify(touchGamepadButtonPos(0) ?? null)`);
    assert.deepEqual(JSON.parse(read(900)), {pos: {x: 899.5, y: 499.5}, size: 50, alpha: .3});
    assert.ok(Math.abs(JSON.parse(read(990)).size - 50) < 1e-9, 'its whole size 10 pixels from the edge');
    assert.equal(JSON.parse(read(1100)), null, 'in a letterbox bar past the canvas');
});

test('the touch gamepad\'s 8 way dpad reads a light diagonal push as it does a straight one (I5)', ()=>
{
    const { run } = loadEngine({ window: { ontouchstart: null } });
    run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
        touchGamepadOverlay = {style: {display: '', opacity: 0}};
        touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
        setTouchGamepadEnable(true); setTouchGamepadAnalog(false); setTouchGamepadLeftStick(true);`);
    const read = (x, y)=> JSON.parse(run(`touchGamepadTimer.set(); touchGamepadSticks[0] = vec2(${x}, ${y}); inputUpdate();
        JSON.stringify([gamepadDpad().x, gamepadDpad().y])`));
    const at = .6 * Math.SQRT1_2;
    assert.deepEqual(read(at, -at), [1, 1], 'a diagonal at .6 of the radius');
    assert.deepEqual(read(.6, 0), [1, 0], 'straight at .6');
    assert.deepEqual(read(.5, 0), [0, 0], 'too light');
});

test('the page hidden clears what is held, as a blur does (I6)', ()=>
{
    const { run, context } = loadEngine();
    const listeners = {};
    run(`document.addEventListener = (type, f)=> (globalThis.visibilityListeners ??= {})[type] = f;
        headlessMode = false; inputInit(); headlessMode = true;`);
    Object.assign(listeners, context.visibilityListeners);
    run('inputData[0][0] = 1; inputData[0].KeyW = 1');
    run('document.hidden = true');
    listeners.visibilitychange();
    assert.equal(run('keyIsDown("KeyW") || mouseIsDown(0)'), false);
});

test('readSaveData gives a number default back when the save holds what JSON made of Infinity (K1)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const store = new Map;
        const localStorage = { getItem: (k)=> store.get(k) ?? null, setItem: (k, v)=> store.set(k, String(v)) };
        const { run } = loadEngine({ localStorage }, '', file);
        const result = JSON.parse(run(`(()=>
        {
            const defaults = {bestTime: Infinity, level: 1, name: 'x'};
            writeSaveData('game', {bestTime: Infinity, level: 'two', name: 5});
            const save = readSaveData('game', defaults);
            writeSaveData('game', {bestTime: 42, level: 3, name: 'y'});
            const later = readSaveData('game', defaults);
            return JSON.stringify([String(save.bestTime), save.level, save.name, later.bestTime, later.level]);
        })()`));
        // a number default takes only a number; any other default takes what was saved, as before
        assert.deepEqual(result, ['Infinity', 1, 5, 42, 3], file);
    }
});

// a Tiled map of one object of the type Mob with these properties, loaded with objectLayersLoad
function loadMob(run, defaults, properties)
{
    return run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Mob extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Mob', Mob, ${defaults});
        [globalThis.made] = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true, properties: ${properties}}]}]});
        console.warn = warn;
        return JSON.stringify({warned});
    })()`);
}

test('a Tiled class property\'s Color and Vector2 members are read from Tiled\'s text, as a property is (O1)', async ()=>
{
    const { run } = await engine();
    const said = JSON.parse(loadMob(run, `{stats: {hp: 10, tint: rgb(1, 0, 0), offset: vec2(1, 2)}}`,
        `[{name: 'stats', type: 'class', value: {hp: 5, tint: '#ff00ff00', offset: '3,4', 'x': 1}}]`));
    const stats = JSON.parse(run(`JSON.stringify({hp: made.stats.hp, tint: made.stats.tint instanceof Color &&
        made.stats.tint.toString(), offset: made.stats.offset instanceof Vector2 && made.stats.offset.toString(0)})`));
    assert.deepEqual(stats, {hp: 5, tint: '#00ff00ff', offset: '( 3, 4 )'});
    assert.deepEqual(said.warned, []);
    const bad = JSON.parse(loadMob(run, `{stats: {tint: rgb(1, 0, 0), list: [1]}}`,
        `[{name: 'stats', type: 'class', value: {tint: 'red', list: {}}}]`));
    assert.deepEqual(bad.warned, [
        'objectLayersLoad: object 1\'s stats.tint is a string, its default an object, the default is kept',
        'objectLayersLoad: object 1\'s stats.list is an object, its default an array, the default is kept']);
});

test('a class property over a default of the game\'s own class never writes into it, and keeps its class (E1)', async ()=>
{
    const { run } = await engine();
    run('globalThis.Stats = class { constructor() { this.hp = 10; this.speed = 1; } total() { return this.hp + this.speed; } };' +
        'globalThis.shared = new Stats');
    loadMob(run, `{stats: shared}`, `[{name: 'stats', type: 'class', value: {hp: 3}}]`);
    const result = JSON.parse(run(`JSON.stringify({shared: [shared.hp, shared.speed], own: made.stats !== shared,
        total: made.stats.total(), isStats: made.stats instanceof Stats})`));
    assert.deepEqual(result, {shared: [10, 1], own: true, total: 4, isStats: true});
    run('Object.freeze(shared)');
    assert.doesNotThrow(()=> loadMob(run, `{stats: shared}`, `[{name: 'stats', type: 'class', value: {hp: 4}}]`));
    assert.equal(run('made.stats.hp'), 4, 'a frozen default too');
});

test('a class member with no default leaves out __proto__, constructor and prototype; a null default takes any value'
    + ' (O4, E3)', async ()=>
{
    const { run } = await engine();
    run(`globalThis.inner = {hp: 1}; for (const [k, v] of [['__proto__', {polluted: 1}], ['constructor', 7],
        ['prototype', 2]]) Object.defineProperty(inner, k, {value: v, enumerable: true, writable: true, configurable: true})`);
    const said = JSON.parse(loadMob(run, `{extra: {}, target: null, opt: {nothing: null}}`, `[
        {name: 'extra', type: 'class', value: {inner}},
        {name: 'target', type: 'object', value: 12},
        {name: 'opt', type: 'class', value: {nothing: 7}}]`));
    const result = JSON.parse(run(`JSON.stringify({keys: Object.keys(made.extra.inner),
        plain: Object.getPrototypeOf(made.extra.inner) === Object.prototype, polluted: ({}).polluted ?? null,
        target: made.target, nothing: made.opt.nothing})`));
    assert.deepEqual(result, {keys: ['hp'], plain: true, polluted: null, target: 12, nothing: 7});
    assert.deepEqual(said.warned, []);
});

test('tileLayersLoad says when a collision layer index is not a tile layer, as it does for a name (O2)', async ()=>
{
    const errors = [];
    const { run } = await engine({ console: { ...console, error: (...a)=> errors.push(a.join(' ')) } });
    run(`var map = {width: 2, height: 1, tilewidth: 16, tileheight: 16, layers: [{name: 'Front', data: [1, 0]},
        {type: 'objectgroup', name: 'Objects', objects: []}]};
        tileLayersLoad(map, undefined, 0, 0, false); tileLayersLoad(map, undefined, 0, 1, false);
        tileLayersLoad(map, undefined, 0, 5, false); tileLayersLoad(map, undefined, 0, undefined, false)`);
    assert.deepEqual(errors, ['tileLayersLoad: layer 1 is not a tile layer, none is solid',
        'tileLayersLoad: layer 5 is not a tile layer, none is solid']);
});

test('the platformer loads with its object layer anywhere among the tile layers (O3)', async ()=>
{
    const source = fs.readFileSync('examples/platformer/gameLevel.js', 'utf8');
    assert.match(source, /tileLayersLoad\(tileMapData, tile\(0,16,1\), 0, 'Front', false\)\s*\.filter\(Boolean\)/);
    assert.match(source, /levelSize = vec2\(tileMapData\.width, tileMapData\.height\)/);
    const map = JSON.parse(fs.readFileSync('examples/platformer/gameLevelData.json', 'utf8'));
    assert.deepEqual(map.layers.filter((l)=> l.type === 'tilelayer').map((l)=> l.name).includes('Front'), true);
    // loaded as the platformer loads it, with the object layer between the tile layers and first
    const { run, context } = await engine();
    context.mapText = JSON.stringify(map);
    for (const order of [[0, 2, 1], [2, 0, 1]])
    {
        const solid = JSON.parse(run(`(()=>
        {
            const map = JSON.parse(globalThis.mapText);
            map.layers = [${order}].map((i)=> map.layers[i]);
            const layers = tileLayersLoad(map, undefined, 0, 'Front', false).filter(Boolean);
            const result = JSON.stringify(layers.map((l)=> l.isSolid));
            layers.forEach((l)=> l.destroy());
            return result;
        })()`));
        assert.deepEqual(solid.filter((s)=> s).length, 1, 'one solid layer ' + order);
    }
});

test('a context that starts running while the page is hidden is paused again, its waiting music kept (P1, P4)', ()=>
{
    const { run, context } = loadEngine({ audioCalls: [] }, `
        audioContext.state = 'suspended';
        audioContext.suspend = ()=> { audioContext.state = 'suspended'; audioCalls.push('suspend'); };
        audioContext.resume = ()=> { audioContext.state = 'running'; audioCalls.push('resume');
            return Promise.resolve(); };`);
    run('document.hidden = true; audioPageChange()');
    assert.deepEqual(context.audioCalls, [], 'not running yet, nothing to pause');
    // the first input resumes it, its state change comes while the page is still hidden
    run('audioContext.state = "running"; audioStateChange()');
    assert.deepEqual(context.audioCalls, ['suspend'], 'paused again');
    run('document.hidden = false; audioPageChange()');
    assert.deepEqual(context.audioCalls, ['suspend', 'resume'], 'and back when the page shows');
});

test('a UIVideo played on a hidden page waits for the page to show (P2)', async ()=>
{
    const document = { hidden: true, addEventListener() {}, hasFocus: ()=> true, body: { appendChild() {} },
        createElement: ()=> ({style: {}, paused: true, currentTime: 0, duration: 10, muted: false,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}}) };
    const { run } = loadEngine({ document });
    run('setHeadlessMode(true); new UISystemPlugin; var video = new UIVideo(vec2(), vec2(100), "clip.mp4", true);' +
        'var later = new UIVideo(vec2(), vec2(100), "b.mp4", false); var played = later.play()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([video.video.paused, later.video.paused])')), [true, true]);
    assert.equal(await run('played'), false);
    run('document.hidden = false; uiVideosPageChange()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([video.video.paused, later.video.paused])')), [false, false]);
});

test('a fill mode slider with a negative corner radius fills from the bar\'s start, as with none (P3)', async ()=>
{
    const { run } = await engine();
    const read = (corner)=> run(`(()=>
    {
        const s = new UISlider(vec2(400, 300), vec2(100, 20), .5);
        s.fillMode = true; s.cornerRadius = ${corner};
        mouseInWindow = true; mousePosScreen = vec2(349.5, 300); // the bar's left edge, the UI native as the screen
        inputData[0][0] = 3; uiSystem.activeObject = s; s.update(); inputData[0][0] = 0;
        const value = s.value; s.destroy(); return value;
    })()`);
    run('new UISystemPlugin');
    assert.equal(read(-5), read(0));
});

test('edit2D.setProperty writes a property as Tiled keeps it, and leaves out the default (E4)', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        objectLayersAddType('Mob', ()=> {}, {hp: 10, tint: rgb(1, 0, 0), offset: vec2(1, 2), name: 'x'});
        const object = {id: 1, type: 'Mob'}, edit = levelEditor.edit2D;
        edit.setProperty(object, 'hp', 5); edit.setProperty(object, 'tint', rgb(0, 1, 0));
        edit.setProperty(object, 'offset', vec2(3, 4)); edit.setProperty(object, 'name', 'x');
        const set = object.properties.slice();
        edit.setProperty(object, 'hp', 10); edit.setProperty(object, 'tint', rgb(1, 0, 0));
        edit.setProperty(object, 'offset', vec2(1, 2));
        return JSON.stringify({set, after: object.properties ?? null});
    })()`));
    assert.deepEqual(result.set, [{name: 'hp', type: 'int', value: 5}, {name: 'tint', type: 'color', value: '#ff00ff00'},
        {name: 'offset', type: 'string', value: '3,4'}]);
    assert.equal(result.after, null);
});
