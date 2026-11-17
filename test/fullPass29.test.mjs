import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 29 of 2026-11-16: a crate pushed into a trigger that respawns it, with the pusher in a two-mover settle
// and a level wall on the way; save defaults with Infinity inside arrays and objects, and copied; the 3D editor's
// restart that rejects with it open, and with no debug key; edit2D.setProperty's kinds and object links; Color and
// Vector2 written as objects, a game's class default with private fields and setters; a null collision layer; touch
// gamepad ids, the paused layout and passthrough's timer; an endless time scale; whole tile indices and setter
// asserts; videos following the hidden setting; a nine-slice of a packed group; the page pause cases beside pass 28's

async function engine(extra={}, with3D=false, code='')
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); var frames = 0, waiters = [];
        engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> { ++frames; waiters = waiters.filter((w)=> frames < w.at || (w.go(), false)); }, ()=> {}, ()=> {}, ()=> {})`);
    code && e.run(code);
    return e;
}

// a player pushing a crate into a trigger that sends it to (-10, .5, 6), once, in a list order of the floor (f), the
// player (p), the crate (c) and the trigger (t); with a MeshCollider wall between the push and where it is sent
function pushIntoRespawn(order, wall, grid)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        engineCollideGridMin = ${grid ? 0 : 1e9};
        const box = (pos, size, mass=0)=> { const o = new EngineObject3D(pos); o.size3D = size; o.setCollision();
            o.mass = mass; o.restitution = 0; mass || (o.gravityScale = 0); return o; };
        let frame = 0, sent = -1;
        const make = {
            f: ()=> box(vec3(0, -.5, 0), vec3(40, 1, 40)),
            p: ()=> box(vec3(-2, .5, 0), vec3(.8, 1, .8), 1),
            c: ()=> box(vec3(-1, .5, 0), vec3(1, 1, 1), 1),
            t: ()=> { const t = new EngineObject3D(vec3(3, 1, 0)); t.size3D = vec3(2, 2, 4); t.setCollision(true, false);
                t.mass = 0; t.gravityScale = 0;
                t.collideWithObject = (other)=> { if (sent < 0 && other.size3D.x === 1)
                    sent = frame, other.pos3D = vec3(-10, .5, 6), other.velocity3D = vec3(); return false; };
                return t; },
        };
        const o = {};
        for (const k of '${order}') o[k] = make[k]();
        ${wall ? 'new MeshCollider(buildBox(vec3(.5, 4, 30)), vec3(-5, 2, 0));' : ''}
        let moved = 0, crate;
        for (; frame < 40; ++frame)
        {
            o.p.velocity3D.x = .1;
            const before = o.p.pos3D.x;
            engineObjectsUpdate();
            frame === sent && (moved = o.p.pos3D.x - before, crate = o.c.pos3D.toString(2));
        }
        return JSON.stringify({sent, moved, crate});
    })()`));
}

test('a crate pushed into a trigger that respawns it lands where it was sent, the pusher not dragged, past a wall too'
    + ' (C1, C2, C5)', ()=>
{
    // the orders where the floor or the player comes first ask the trigger from inside the two movers' settle
    for (const order of ['pctf', 'fpct', 'fcpt', 'cptf', 'ctpf', 'tfcp'])
        for (const [wall, grid] of [[false, false], [true, false], [true, true]])
        {
            const r = pushIntoRespawn(order, wall, grid), name = order + (wall ? ' wall' : '') + (grid ? ' grid' : '');
            assert.equal(r.sent, 31, name);
            assert.equal(r.crate, '(-10.00, 0.50, 6.00 )', name + ': the crate is where the trigger sent it');
            assert.ok(r.moved > 0 && r.moved <= .1 + 1e-9, name + ': the player moved by its own step, ' + r.moved);
        }
});

test('readSaveData gives a number default back inside arrays and objects, and copies what it takes from the defaults'
    + ' (K1, K2)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const store = new Map;
        const localStorage = { getItem: (k)=> store.get(k) ?? null, setItem: (k, v)=> store.set(k, String(v)) };
        const { run } = loadEngine({ localStorage }, '', file);
        const result = JSON.parse(run(`(()=>
        {
            const show = (v)=> JSON.stringify(v, (k, x)=> typeof x === 'number' && !isFinite(x) ? String(x) : x);
            const defaults = {bestTimes: [Infinity, Infinity, Infinity], best: {level1: Infinity, level2: 5},
                names: ['a', 'b'], deep: {list: [{t: Infinity}]}};
            writeSaveData('game', defaults);
            const saved = readSaveData('game', defaults);
            writeSaveData('game', {bestTimes: [12, null, 'x', 7], best: {level1: 3, extra: null}, names: [1, null],
                deep: {list: [{t: null}]}});
            const later = readSaveData('game', defaults);
            // with nothing saved the arrays and objects are copies, a game's changes do not reach the defaults
            const fresh = readSaveData('none', defaults);
            fresh.bestTimes[0] = 1; fresh.best.level2 = 1; fresh.deep.list[0].t = 1;
            return JSON.stringify([show(saved), show(later), show(defaults)]);
        })()`));
        assert.deepEqual(JSON.parse(result[0]), {bestTimes: ['Infinity', 'Infinity', 'Infinity'],
            best: {level1: 'Infinity', level2: 5}, names: ['a', 'b'], deep: {list: [{t: 'Infinity'}]}}, file);
        // a number where the default has one, anything else as saved where it has none
        assert.deepEqual(JSON.parse(result[1]), {bestTimes: [12, 'Infinity', 'Infinity', 7],
            best: {level1: 3, extra: null}, names: [1, null], deep: {list: [{t: 'Infinity'}]}}, file);
        assert.deepEqual(JSON.parse(result[2]), {bestTimes: ['Infinity', 'Infinity', 'Infinity'],
            best: {level1: 'Infinity', level2: 5}, names: ['a', 'b'], deep: {list: [{t: 'Infinity'}]}},
            file + ': defaults untouched');
    }
});

test('an async restart that rejects with the 3D editor open brings the level\'s objects and maps back (D1, D4)',
    async ()=>
{
    const { run } = await engine({}, true);
    run(`
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}, {id: 2, type: 'Sphere', pos: [3, 0, 0]}],
            voxels: {pos: [-4, 0, -4], size: [8, 4, 8], blocks: [64, 1, 192, 0]},
            terrain: {pos: [0, -1, 0], size: [16, 16], height: 2, heights: [[0, 0, 0], [0, 1, 0], [0, 0, 0]]}};
        var list = level3DLoad(level); engineStep(2);
        var fail;
        levelEditor.onRestart = ()=>
        {
            list.forEach((o)=> o.destroy());
            // a thenable, so the rejection the editor hands on is thrown here, not left to the process
            return {then(ok, bad) { fail = bad; }};
        };
        levelEditor.open(); engineStep();
        editor3DRestart(); engineStep(); levelEditor.open(); engineStep();
        var live = ()=> JSON.stringify([!!editor3DVoxelMap(), !!editor3DTerrainMap(),
            [...editor3DInstances.values()].filter((o)=> !o.destroyed).length]);`);
    assert.deepEqual(JSON.parse(run('live()')), [false, false, 0], 'nothing made while it waits');
    // the editor hands the game's rejection on, as an error the page would show
    assert.throws(()=> run('fail(new Error("no level"))'), /no level/);
    run('engineStep()');
    assert.equal(run('!!editor3DRestartRunning'), false);
    assert.deepEqual(JSON.parse(run('live()')), [true, true, 2], 'the maps and both objects again');
    assert.notEqual(run(`String(levelEditor.edit3D.place('Box', vec3(5, 0, 5)))`), 'undefined', 'edits taken again');
});

test('with no debug key an async restart plays till it settles, then the 3D editor comes back (D2)', async ()=>
{
    const { run } = await engine({}, true);
    run(`setDebugKey('');
        var waitFrames = (n)=> new Promise((go)=> waiters.push({at: frames + n, go}));
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]};
        var list = level3DLoad(level); engineStep(2);
        levelEditor.onRestart = async ()=>
        {
            list.forEach((o)=> o.destroy());
            list = level3DLoad(level);
            await waitFrames(30); // a fade in
        };
        levelEditor.open(); engineStep(); var start = frames;
        editor3DRestart(); engineStep();`);
    assert.equal(run('editor3DIsOpen'), false, 'closed while it fades in');
    for (let i = 0; i < 3; ++i)
    {
        run('engineStep(15)');
        await new Promise((resolve)=> setTimeout(resolve, 5));
    }
    assert.ok(run('frames - start') >= 30, 'the game ran its frames');
    assert.equal(run('!!editor3DRestartRunning'), false);
    assert.equal(run('editor3DIsOpen'), true, 'open again once it settled');
    assert.notEqual(run(`String(levelEditor.edit3D.place('Box', vec3(3, 0, 0)))`), 'undefined', 'and takes edits');
});

test('edit2D.setProperty keeps an object link an object, and writes nothing of the wrong kind (E1, E4)', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        objectLayersAddType('Mob', ()=> {}, {target: null, hp: 10, tint: rgb(1, 0, 0), offset: vec2(1, 2),
            stats: {a: 1}});
        const object = {id: 1, type: 'Mob', properties: [{name: 'target', type: 'object', value: 12}]};
        const edit = levelEditor.edit2D, linked = [];
        edit.setProperty(object, 'target', 12); linked.push(JSON.stringify(object.properties));
        edit.setProperty(object, 'target', 14); linked.push(JSON.stringify(object.properties));
        const refused = [['hp', vec2(1, 1)], ['tint', '#ff0000'], ['offset', 5], ['stats', {a: 2}], ['hp', '5']]
            .map(([name, value])=> { try { edit.setProperty(object, name, value); return 'written'; }
                catch (e) { return /Assert failed/.test(e.message) ? 'asserted' : e.message; } });
        return JSON.stringify({linked, refused, after: object.properties});
    })()`));
    assert.deepEqual(result.linked.map((l)=> JSON.parse(l)), [[{name: 'target', type: 'object', value: 12}],
        [{name: 'target', type: 'object', value: 14}]]);
    assert.deepEqual(result.refused, ['asserted', 'asserted', 'asserted', 'asserted', 'asserted']);
    assert.deepEqual(result.after, [{name: 'target', type: 'object', value: 14}], 'nothing else written');
});

// a Tiled map of one object of the type Mob with these properties, loaded with objectLayersLoad
function loadMob(run, defaults, properties)
{
    return JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Mob extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Mob', Mob, ${defaults});
        [globalThis.made] = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true, properties: ${properties}}]}]});
        console.warn = warn;
        return JSON.stringify({warned});
    })()`));
}

test('a Color or Vector2 written as an object is one, in a class member and at the top level (E2, O3)', async ()=>
{
    const { run } = await engine();
    const said = loadMob(run, `{stats: {tint: rgb(1, 0, 0), offset: vec2(1, 2)}, at: vec2(0, 0), hp: 3}`, `[
        {name: 'stats', type: 'class', value: {tint: {r: 0, g: 1, b: 0, a: 1}, offset: {x: 3, y: 4}}},
        {name: 'at', type: 'class', value: {x: 5, y: 6}},
        {name: 'hp', type: 'color', value: '#ff00ff00'}]`);
    const result = JSON.parse(run(`JSON.stringify({tint: made.stats.tint instanceof Color && made.stats.tint.toString(),
        offset: made.stats.offset instanceof Vector2 && made.stats.offset.toString(0),
        at: made.at instanceof Vector2 && made.at.toString(0), hp: made.hp})`));
    assert.deepEqual(result, {tint: '#00ff00ff', offset: '( 3, 4 )', at: '( 5, 6 )', hp: 3});
    assert.deepEqual(said.warned, ['objectLayersLoad: object 1\'s hp is a string, its default a number, the default is kept'],
        'a color over a number default is said and the default kept');
});

test('a class property over a default of the game\'s own class with a copy method keeps its private fields and runs'
    + ' its setters (O1)', async ()=>
{
    const { run } = await engine();
    run(`globalThis.Stats = class
    {
        #secret = 7; hp = 10; set level(v) { this.hp = v * 10; }
        get secret() { return this.#secret; }
        copy() { const c = new Stats; c.hp = this.hp; return c; }
    };
    globalThis.shared = new Stats`);
    loadMob(run, `{stats: shared}`, `[{name: 'stats', type: 'class', value: {level: 3}}]`);
    const result = JSON.parse(run(`JSON.stringify({secret: made.stats.secret, hp: made.stats.hp,
        own: made.stats !== shared, sharedHp: shared.hp})`));
    assert.deepEqual(result, {secret: 7, hp: 30, own: true, sharedHp: 10});
    // with nothing in the map the default is copied for each object too
    loadMob(run, `{stats: shared}`, `[]`);
    assert.equal(run('made.stats !== shared && made.stats.secret'), 7);
});

test('tileLayersLoad with a collision layer of null says nothing (O4)', async ()=>
{
    const errors = [];
    const { run } = await engine({ console: { ...console, error: (...a)=> errors.push(a.join(' ')) } });
    run(`tileLayersLoad({width: 2, height: 1, tilewidth: 16, tileheight: 16, layers: [{name: 'Front', data: [1, 0]}]},
        undefined, 0, null, false)`);
    assert.deepEqual(errors, []);
});

// the touch gamepad's right zone, a 300 pixel box in the corner of a 1000 pixel stage, with passthrough
function gamepadZone()
{
    const e = loadEngine({ window: { ontouchstart: null } });
    const zone = { tagName: 'DIV', closest: ()=> null, setPointerCapture() {} };
    e.context.zone = zone;
    e.run(`touchGamepadEnable = true; touchGamepadPassthrough = true; touchGamepadSideZones[1] = globalThis.zone;
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) };`);
    const touch = (id, x, y)=> ({ identifier: id, clientX: x, clientY: y, target: zone });
    const ev = (type, touches, changed)=> ({ type, touches, changedTouches: changed, target: zone, cancelable: false,
        preventDefault() {} });
    const down = (t)=> e.run(`touchGamepadPointerDown({ pointerType: 'touch', pointerId: ${t.identifier},
        clientX: ${t.clientX}, clientY: ${t.clientY}, preventDefault() {} }, globalThis.zone)`);
    return {...e, touch, ev, down};
}

test('a finger id a lost touchend left behind does not make a later finger on a control drive the mouse (I1)', ()=>
{
    const { run, handlers, touch, ev, down } = gamepadZone();
    const lost = touch(5, 720, 720); // beside the controls, the game's; its touchend never comes
    down(lost); handlers.touchstart(ev('touchstart', [lost], [lost]));
    run('inputClear(); inputUpdatePost()');
    const again = touch(5, 900, 950); // the same id on a button, with the lost one still down as far as it knew
    down(again); handlers.touchstart(ev('touchstart', [again], [again]));
    assert.deepEqual(JSON.parse(run('JSON.stringify([mouseIsDown(0), touchGamepadPointerRole.size])')), [false, 1]);
});

test('with passthrough a finger beside the controls does not wake the gamepad (I3)', ()=>
{
    const { run, down, touch } = gamepadZone();
    run('touchGamepadTimer.unset()');
    down(touch(1, 720, 720));
    assert.equal(run('touchGamepadTimer.isSet()'), false, 'beside');
    down(touch(2, 900, 950));
    assert.equal(run('touchGamepadTimer.isSet()'), true, 'on a button');
});

test('turning passthrough on while paused lays the start zone out again (I2)', ()=>
{
    const { run } = loadEngine({ window: { ontouchstart: null } });
    const css = JSON.parse(run(`(()=>
    {
        const zone = ()=> ({ style: { cssText: '', display: '' } });
        touchGamepadOverlay = { style: {} }; touchGamepadSideZones = [zone(), zone()]; touchGamepadZoneC = zone();
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) };
        touchGamepadBuildSvg = ()=> {}; touchGamepadUpdateVisuals = ()=> {};
        setTouchGamepadEnable(true); setTouchGamepadCenterButtonSize(50); setPaused(true);
        const read = ()=> touchGamepadZoneC.style.cssText.includes('inset:0');
        headlessMode = false;
        try { touchGamepadRender(); } catch {}
        const whole = read();
        setTouchGamepadPassthrough(true);
        try { touchGamepadRender(); } catch {}
        headlessMode = true;
        return JSON.stringify([whole, read()]);
    })()`));
    assert.deepEqual(css, [true, false]);
});

test('setTimeScale(Infinity) asserts, and a release build keeps the scale it had (K3)', ()=>
{
    const { run } = loadEngine();
    assert.throws(()=> run('setTimeScale(Infinity)'), /Assert failed/);
    const release = loadEngine({}, '', 'littlejs.release.js');
    assert.equal(release.run('setTimeScale(2); setTimeScale(Infinity); setTimeScale(NaN); timeScale'), 2);
});

test('a fractional tile index or frame asserts, and the setters below 0 do (K4, K5)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    assert.throws(()=> run('tile(1.5, 16)'), /Assert failed/);
    assert.throws(()=> run('tile(0, 16).frame(.5)'), /Assert failed/);
    assert.doesNotThrow(()=> run('tile(3, 16).frame(2)'));
    for (const code of ['setCameraShakeDecay(-1)', 'setCameraShakeDistance(-1)', 'setCameraShakeAngle(-1)',
        'setTileDefaultBleed(-1)', 'setObjectDefaultMass(-1)', 'setObjectDefaultRestitution(-1)',
        'setParticleEmitRateScale(-1)', 'setCameraAngle(NaN)', 'setCameraAngle(Infinity)'])
        assert.throws(()=> run(code), /Assert failed/, code);
});

test('setSoundPauseWhenHidden changed while the page is hidden moves the UI\'s videos too (P1)', ()=>
{
    const document = { hidden: true, addEventListener() {}, hasFocus: ()=> true, body: { appendChild() {} },
        createElement: ()=> ({style: {}, paused: true, currentTime: 0, duration: 10, muted: false,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}}) };
    const { run } = loadEngine({ document });
    run('setHeadlessMode(true); setSoundPauseWhenHidden(false); new UISystemPlugin;' +
        'var video = new UIVideo(vec2(), vec2(100), "clip.mp4", true)');
    assert.equal(run('video.video.paused'), false, 'plays on a hidden page with the setting off');
    run('setSoundPauseWhenHidden(true)');
    assert.equal(run('video.video.paused'), true, 'paused once it is on');
    run('setSoundPauseWhenHidden(false)');
    assert.equal(run('video.video.paused'), false, 'and back when it is off');
});

test('a nine-slice of a packed group of nine frames reads them in order, a grid tile its block (P3)', ()=>
{
    const { run } = loadEngine();
    const read = (columns)=> JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const seen = [], draw = drawTile;
        drawTile = (pos, size, info)=> seen.push(info.pos.x / 16 + ',' + info.pos.y / 16);
        const start = new TileInfo(vec2(0, 0), vec2(16), textureInfos[0], 0, 0, ${columns});
        try { drawNineSlice(vec2(), vec2(8), start, undefined, 1, undefined, 0, undefined, false, false); }
        finally { drawTile = draw; }
        return JSON.stringify([...new Set(seen)].sort());
    })()`));
    assert.deepEqual(read(9), ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0', '8,0'], 'one row of nine');
    assert.deepEqual(read(0), ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2'], 'a 3 by 3 block');
});

// an audio context that starts suspended, its calls counted
const audioStand = `
    audioContext.state = 'suspended';
    audioContext.createBuffer = ()=> ({getChannelData: ()=> new Float32Array(1e6), duration: 1});
    audioContext.suspend = ()=> { audioContext.state = 'suspended'; audioCalls.push('suspend'); return Promise.resolve(); };
    audioContext.resume = ()=> { audioContext.state = 'running'; audioCalls.push('resume'); return Promise.resolve(); };`;

test('the page pause beside pass 28\'s: shown before the start, turned off while hidden, a hidden sound stopped (P4)',
    ()=>
{
    {
        const { run, context } = loadEngine({ audioCalls: [] }, audioStand);
        run('document.hidden = true; audioPageChange(); document.hidden = false; audioPageChange()');
        run('audioContext.state = "running"; audioStateChange()');
        assert.deepEqual(context.audioCalls, [], 'hidden and shown before the start: nothing to undo');
        assert.equal(run('audioSuspendedByPage'), false);
    }
    {
        const { run, context } = loadEngine({ audioCalls: [] }, audioStand);
        run('document.hidden = true; audioPageChange(); audioContext.state = "running"; audioStateChange()');
        run('setSoundPauseWhenHidden(false)');
        assert.deepEqual(context.audioCalls, ['suspend', 'resume'], 'turned off while hidden plays again');
        assert.equal(run('audioContext.state'), 'running');
    }
    {
        const { run, context } = loadEngine({ audioCalls: [] }, audioStand);
        run('setSoundPauseWhenHidden(false); document.hidden = true; audioPageChange();' +
            'audioContext.state = "running"; audioStateChange()');
        assert.deepEqual(context.audioCalls, [], 'off before a hidden start: not paused');
    }
    {
        const StereoPannerNode = class { constructor() { this.pan = {value: 0}; } connect(n) { return n; } disconnect() {} };
        const { run } = loadEngine({ audioCalls: [], StereoPannerNode }, audioStand + 'audioContext.state = "running";');
        run('document.hidden = true; audioPageChange()');
        run('var s = new Sound([.5]); var i = s.play(); var waiting = audioWaitingInstances.has(i); i.stop()');
        run('document.hidden = false; audioPageChange(); audioStateChange()');
        assert.deepEqual(JSON.parse(run('JSON.stringify([waiting, audioWaitingInstances.size, i.isPlaying()])')),
            [true, 0, false], 'a sound played hidden and stopped does not start on show');
    }
});

test('a UIVideo destroyed while it waits for the page is dropped, the others play (P4)', ()=>
{
    const made = [];
    const document = { hidden: true, addEventListener() {}, hasFocus: ()=> true, body: { appendChild() {} },
        createElement: ()=> { const v = {style: {}, paused: true, currentTime: 0, duration: 10, muted: false, plays: 0,
            pause() { this.paused = true; }, play() { this.plays++; this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() { this.src = ''; }, load() {}}; made.push(v); return v; } };
    const { run } = loadEngine({ document });
    run('setHeadlessMode(true); new UISystemPlugin;' +
        'var a = new UIVideo(vec2(), vec2(9), "a.mp4", true), b = new UIVideo(vec2(), vec2(9), "b.mp4", true),' +
        'c = new UIVideo(vec2(), vec2(9), "c.mp4"); c.play(); b.destroy();');
    run('document.hidden = false; uiVideosPageChange()');
    assert.deepEqual(made.map((v)=> v.plays), [1, 0, 1]);
    assert.equal(run('uiVideosPaused.size'), 0);
});

test('a 3D snippet can read a spotlight\'s cone as lightCones (G2)', ()=>
{
    const { run } = loadEngine();
    assert.match(run('RENDER3D_SNIPPET_NAMES'), /#define lightCones extraLightCones/);
});

// a body of height 1, its step .25, walking from off an 8 by 8 HeightMap at (10, 0, 0) onto it along a floor; the
// map's 9 by 9 samples from height(i, j), 0 to 1 of its height of 4; where it ends, its highest and if it stood on it
function walkOntoMap(height, {start = 'vec3(0, .5, 0)', velocity = 'vec3(.1, 0, 0)', frames = 120} = {})
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const floor = new EngineObject3D(vec3(0, -.5, 0)); floor.size3D = vec3(60, 1, 60); floor.setCollision();
        floor.mass = 0;
        const height = ${height}, heights = [];
        for (let j = 0; j < 9; ++j) { heights.push([]); for (let i = 0; i < 9; ++i) heights[j].push(height(i, j)); }
        const map = new HeightMap(heights, vec2(8, 8), 4, undefined, vec3(10, 0, 0));
        const body = new EngineObject3D(${start}); body.size3D = vec3(.8, 1, .8); body.setCollision(); body.mass = 1;
        let top = -Infinity, on = false;
        for (let f = 0; f < ${frames}; ++f)
        {
            const v = ${velocity}; body.velocity3D.x = v.x; body.velocity3D.z = v.z;
            engineObjectsUpdate();
            top = Math.max(top, body.pos3D.y); on ||= body.groundObject === map;
        }
        const r = (n)=> Math.round(n * 1e3) / 1e3;
        map.destroy();
        return JSON.stringify({x: r(body.pos3D.x), z: r(body.pos3D.z), top: r(top), on});
    })()`));
}

test('a HeightMap\'s edge higher than a body\'s step is a wall to it from off the map, a lower one is walked onto (C4)',
    ()=>
{
    // raised edges, a plateau on the floor: its side stops at the edge, x 6 less its half width of .4
    for (const edge of [.1, .5, 1])
        assert.deepEqual(walkOntoMap(`()=> ${edge}`), {x: 5.6, z: 0, top: .5, on: false}, 'edge ' + edge * 4);
    // an edge of .2, under the step of .25, is stepped onto
    const low = walkOntoMap('()=> .05');
    assert.ok(low.on && low.top > .69, 'a low edge: ' + JSON.stringify(low));
    // a ring of 0 round a plateau: the map's own rules, a gentle ramp climbed and a cliff a wall, as before
    assert.equal(walkOntoMap('(i, j)=> i && j && i < 8 && j < 8 ? .25 : 0').on, true, 'a ramp from a 0 edge');
    assert.ok(walkOntoMap('(i, j)=> i && j && i < 8 && j < 8 ? 1 : 0').x < 6.01, 'a cliff from a 0 edge');
    // a fast walker up a gentle ramp from a 0 edge, its middle well past the edge in one frame
    const fast = walkOntoMap('(i)=> i * .02', {velocity: 'vec3(.5, 0, 0)', frames: 30});
    assert.ok(fast.on && fast.x > 11, 'a fast walk up a ramp: ' + JSON.stringify(fast));
    // a body falling onto a raised edge from above lands on it
    const drop = walkOntoMap('()=> .5', {start: 'vec3(5.8, 4, 0)', frames: 60});
    assert.ok(drop.on && drop.top <= 4 && drop.x > 6, 'dropped onto it: ' + JSON.stringify(drop));
    // at a corner, coming at it on a diagonal: held off the map, it slides along the side and past it
    const corner = walkOntoMap('()=> 1', {start: 'vec3(4, .5, -6)', velocity: 'vec3(.1, 0, .1)'});
    assert.equal(corner.on, false, 'a corner: ' + JSON.stringify(corner));
    assert.equal(corner.top, .5, 'it slides along the side, never climbing it');
});
