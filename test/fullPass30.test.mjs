import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 30 of 2026-11-16: a nine-slice from a sheet wider than three tiles and an atlas group of nine; a solid
// that respawns what it touches; Tiled class defaults with no copy, accessor members, a color over a Vector2 and
// warnings said once; the editor's private class members and setProperty's Vector2 and non-finite numbers; the 3D
// editor opened during an async restart with no debug key, and an onRestart that throws; an empty gamepad side and
// a pinch made while the gamepad had touch; lightCones reserved; save defaults nested and copied; a huge time scale

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a nine-slice from a sheet of any width reads its 3 by 3 block, and an atlas packs nine frames as one (P1)', ()=>
{
    const { run } = loadEngine();
    const read = (columns, screen)=> JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const seen = [], draw = drawTile;
        drawTile = (pos, size, info)=> seen.push(info.pos.x / 16 + ',' + info.pos.y / 16);
        const start = new TileInfo(vec2(0, 0), vec2(16), textureInfos[0], 0, 0, ${columns});
        try { drawNineSlice(vec2(), vec2(8), start, undefined, 1, undefined, 0, 0, false, ${screen}); }
        finally { drawTile = draw; }
        return JSON.stringify([...new Set(seen)].sort());
    })()`));
    const block = ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2'];
    for (const columns of [0, 3, 4, 8, 9])
        for (const screen of [false, true])
            assert.deepEqual(read(columns, screen), block, 'columns ' + columns + (screen ? ' screen' : ''));
    // the atlas's frame k of a nine frame group is in reading order of its block, columns 3
    const frames = JSON.parse(run(`(()=>
    {
        const t = new TileInfo(vec2(0, 0), vec2(16), textureInfos[0], 0, 0, 3);
        return JSON.stringify([0, 4, 8].map((k)=> t.frame(k).pos.toString(0)));
    })()`));
    assert.deepEqual(frames, ['( 0, 0 )', '( 16, 16 )', '( 32, 32 )']);
    assert.match(String(run('loadAtlas')), /length === 9/, 'a nine frame group is packed as a 3 by 3 block');
});

// a solid that sends the player to (-10, .5, 6) when it touches it and returns true, in a list order of the floor (f),
// the player (p) and the solid (e): an enemy walking into it, a lava block it walks into, or a lava floor it falls on
function respawnSolid(scene, order, grid)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        engineCollideGridMin = ${grid ? 0 : 1e9};
        const scene = '${scene}';
        const box = (pos, size, mass=0)=> { const o = new EngineObject3D(pos); o.size3D = size; o.setCollision();
            o.mass = mass; o.restitution = 0; mass || (o.gravityScale = 0); return o; };
        let sent = -1, frame = 0;
        const make = {
            f: ()=> box(vec3(0, -.5, 0), vec3(40, 1, 40)),
            p: ()=> box(scene === 'fall' ? vec3(5, 3, 0) : vec3(0, .5, 0), vec3(.8, 1, .8), 1),
            e: ()=> { const e = scene === 'enemy' ? box(vec3(3, .5, 0), vec3(1, 1, 1), 1) :
                    scene === 'lava' ? box(vec3(3, .5, 0), vec3(1, 1, 4)) : box(vec3(5, .1, 0), vec3(3, .2, 3));
                e.collideWithObject = (other)=> { if (other.size3D.x === .8 && sent < 0) {
                    sent = frame; other.pos3D = vec3(-10, .5, 6); other.velocity3D = vec3(); } return true; };
                return e; },
        };
        const o = {};
        for (const k of '${order}') o[k] = make[k]();
        let at, v, ground;
        for (; frame < 80; ++frame)
        {
            if (scene === 'enemy') o.e.velocity3D.x = -.1;
            else if (scene === 'lava' && sent < 0) o.p.velocity3D.x = .13;
            engineObjectsUpdate();
            if (frame === sent)
                at = o.p.pos3D.toString(3), v = o.p.velocity3D.length(), ground = o.p.groundObject === o.e;
        }
        return JSON.stringify({sent, at, v, ground, end: o.p.pos3D.toString(2)});
    })()`));
}

test('a solid whose callback respawns the player leaves it at the spawn with no push or speed, in every order (C1, C3)',
    ()=>
{
    for (const scene of ['enemy', 'lava', 'fall'])
        for (const order of ['pef', 'pfe', 'epf', 'efp', 'fpe', 'fep'])
            for (const grid of [false, true])
            {
                const r = respawnSolid(scene, order, grid), name = scene + ' ' + order + (grid ? ' grid' : '');
                assert.ok(r.sent > 0, name);
                assert.equal(r.at, '(-10.000, 0.500, 6.000 )', name + ': where it was sent');
                assert.equal(r.v, 0, name + ': no speed from the touch');
                assert.equal(r.ground, false, name + ': not standing on the lava');
                assert.equal(r.end, '(-10.00, 0.50, 6.00 )', name + ': and it stays');
            }
});

// a Tiled map of one object of the type Mob with these properties, loaded with objectLayersLoad
function loadMob(run, defaults, properties, map='')
{
    return JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Mob extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Mob', Mob, ${defaults});
        const map = ${map || `{width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            id: 1, name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true, properties: ${properties}}]}]}`};
        try { [globalThis.made] = objectLayersLoad(map); }
        catch (e) { warned.push('threw ' + e.message); }
        console.warn = warn;
        return JSON.stringify({warned});
    })()`));
}

test('a class default with no copy method takes the map\'s members as its own, an accessor over a private field too'
    + ' (O1, O5)', async ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        run('setHeadlessMode(true)');
        run(`globalThis.Stats = class { #hp = 10; mp = 4; get hp() { return this.#hp; } set hp(v) { this.#hp = v; } };
            globalThis.shared = new Stats`);
        const said = loadMob(run, `{stats: shared}`, `[{name: 'stats', type: 'class', value: {hp: 3, mp: 5}}]`);
        assert.deepEqual(said.warned, [], file);
        assert.deepEqual(JSON.parse(run(`JSON.stringify([made.stats.hp, made.stats.mp, made.stats instanceof Stats,
            shared.hp, shared.mp])`)), [3, 5, true, 10, 4], file);
    }
});

test('an accessor member of a class default is read from Tiled\'s text and checked for its kind (O2)', async ()=>
{
    const { run } = await engine();
    run(`globalThis.Look = class { #tint = rgb(1, 0, 0); get tint() { return this.#tint; }
        set tint(v) { this.#tint = v; } copy() { const c = new Look; c.tint = this.tint.copy(); return c; } };
        globalThis.look = new Look`);
    loadMob(run, `{look}`, `[{name: 'look', type: 'class', value: {tint: '#ff00ff00'}}]`);
    assert.equal(run('made.look.tint instanceof Color && made.look.tint.toString()'), '#00ff00ff');
    const said = loadMob(run, `{look}`, `[{name: 'look', type: 'class', value: {tint: 5}}]`);
    assert.equal(run('made.look.tint.toString()'), '#ff0000ff', 'a number keeps the default');
    assert.deepEqual(said.warned, ['objectLayersLoad: object 1\'s look.tint is a number, its default an object, ' +
        'the default is kept']);
});

test('what can not be read as a Vector2 over a Vector2 default is said, a color or a number too (O3, E5)', async ()=>
{
    const { run } = await engine();
    const said = loadMob(run, `{at: vec2(1, 2), to: vec2(1, 1), by: vec2(0, 0), ok: vec2(0, 0)}`, `[
        {name: 'at', type: 'float', value: 5}, {name: 'to', type: 'color', value: '#ff00ff00'},
        {name: 'by', type: 'string', value: '3;4'}, {name: 'ok', type: 'string', value: '3,4'}]`);
    assert.equal(run('JSON.stringify([made.at, made.to, made.by, made.ok].map((v)=> v.toString(0)))'),
        JSON.stringify(['( 1, 2 )', '( 1, 1 )', '( 0, 0 )', '( 3, 4 )']));
    assert.deepEqual(said.warned, [
        'objectLayersLoad: object 1\'s at is 5, not x,y, its default a Vector2, the default is kept',
        'objectLayersLoad: object 1\'s to is "#ff00ff00", not x,y, its default a Vector2, the default is kept',
        'objectLayersLoad: object 1\'s by is "3;4", not x,y, its default a Vector2, the default is kept']);
});

test('a class member that can only be read or has a method\'s name is said once for each map, with its object and'
    + ' path (O4, E4)', async ()=>
{
    const { run } = await engine();
    run(`globalThis.Kit = class { #s = 7; hp = 10; get secret() { return this.#s; } update() {}
        copy() { const c = new Kit; c.hp = this.hp; return c; } }; globalThis.kit = new Kit;
        globalThis.kitMap = {width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 3, type: 'Mob', x: 16, y: 16, point: true, properties: [
            {name: 'kit', type: 'class', value: {update: 1, secret: 2, hp: 4}}]}]}]}`);
    const first = loadMob(run, `{kit}`, '', 'kitMap');
    const again = loadMob(run, `{kit}`, '', 'kitMap');
    assert.deepEqual(first.warned, [
        'objectLayersLoad: object 3\'s kit.update has a method\'s name, left out',
        'objectLayersLoad: object 3\'s kit.secret can only be read, left out']);
    assert.deepEqual(again.warned, [], 'the same map again says nothing');
    assert.equal(run('made.kit.hp + made.kit.secret'), 11);
});

// a level with one Door of a class whose state is private, in the 2D editor
async function doorEditor()
{
    const { run } = await engine();
    run(`
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        class Vault { #code = 0; get code() { return this.#code; } set code(v) { this.#code = v; }
            copy() { const c = new Vault; c.code = this.code; return c; } }
        objectLayersAddType('Door', Door, {vault: new Vault, goal: null, best: 10});
        var map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(0)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 8,
            properties: [{name: 'vault', type: 'class', value: {code: 5}}]}]}]};
        function loadLevel() { engineObjectsDestroy(); tileLayersLoad(map, undefined, 0, 'ground'); return objectLayersLoad(map); }
        levelEditor.onRestart = ()=> loadLevel();
        loadLevel(); levelEditor.open();
        var rec = editorMapList.find((r)=> r.map === map);
        editorSelectLayer(editorObjectLayers(rec)[0]);
        var edit = levelEditor.edit2D, door = ()=> editorObjectLayers(rec)[0].instances.get(1);`);
    return run;
}

test('a class member the editor changes reaches the live object when its class keeps its state private (E1)',
    async ()=>
{
    const run = await doorEditor();
    assert.equal(run('door().vault.code'), 5);
    run('edit.changeObjects((list)=> { list[0].properties[0].value.code = 9; }); edit.strokeEnd()');
    assert.equal(run('door().vault.code'), 9);
    run('editorUndo()');
    assert.equal(run('door().vault.code'), 5, 'and back on undo');
});

test('edit2D.setProperty refuses a Vector2 over no default and a number that is not finite (E2, E3)', async ()=>
{
    const run = await doorEditor();
    for (const code of [`setProperty(o, 'goal', vec2(3, 4))`, `setProperty(o, 'best', Infinity)`,
        `setProperty(o, 'best', NaN)`, `setProperty(o, 'goal', -Infinity)`])
        assert.throws(()=> run(`edit.changeObjects((list)=> { const o = list[0]; edit.${code}; })`), /Assert failed/,
            code);
    run('edit.strokeCancel()');
    assert.equal(run('JSON.stringify(map.layers[1].objects[0].properties)'),
        JSON.stringify([{name: 'vault', type: 'class', value: {code: 5}}]), 'nothing written');
    run(`edit.changeObjects((list)=> { edit.setProperty(list[0], 'goal', 12); edit.setProperty(list[0], 'best', 3); });
        edit.strokeEnd()`);
    assert.equal(run('door().goal + door().best'), 15, 'a finite number and a link are');
});

// a 3D level with a block map, a terrain and two objects, a restart that destroys its list and rejects when told
async function restartEditor(noKey)
{
    const { run } = await engine({}, true);
    run(`${noKey ? "setDebugKey('');" : ''}
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}, {id: 2, type: 'Box', pos: [3, 0, 0]}],
            voxels: {pos: [0, 0, 0], size: [2, 2, 2], blocks: [8, 1]},
            terrain: {pos: [0, -5, 0], size: [8, 8], height: 2, heights: [[0, 0], [0, 0]]}};
        var list = level3DLoad(level); engineStep(2);
        var fail;
        levelEditor.onRestart = ()=> { list.forEach((o)=> o.destroy()); return {then(ok, bad) { fail = bad; }}; };
        levelEditor.open(); engineStep();
        var count = ()=> JSON.stringify([engineObjects.filter((o)=> o instanceof VoxelMap && !o.destroyed).length,
            engineObjects.filter((o)=> o instanceof HeightMap && !o.destroyed).length,
            [...editor3DInstances.values()].filter((o)=> !o.destroyed).length]);`);
    return run;
}

test('with no debug key a 3D editor the game opens again during an async restart gets the level back when it settles'
    + ' (D1, D4)', async ()=>
{
    for (const noKey of [true, false])
    {
        const run = await restartEditor(noKey);
        run('editor3DRestart(); engineStep(3); levelEditor.open(); engineStep()');
        assert.equal(run('editor3DIsOpen'), true);
        assert.deepEqual(JSON.parse(run('count()')), [0, 0, 0], 'nothing while it waits');
        assert.throws(()=> run('fail(new Error("fetch failed"))'), /fetch failed/);
        run('engineStep(2)');
        assert.deepEqual(JSON.parse(run('count()')), [1, 1, 2], (noKey ? 'no key' : 'a key') + ': the level back');
    }
});

test('with no debug key an onRestart that throws leaves the 3D editor open, as one that rejects does (D3)', async ()=>
{
    const run = await restartEditor(true);
    run('levelEditor.onRestart = ()=> { throw new Error("no level"); }');
    assert.throws(()=> run('editor3DRestart()'), /no level/);
    assert.equal(run('editor3DIsOpen'), true);
});

// a style whose cssText setter clears the other inline properties, as the DOM's does
function domStyle()
{
    const s = { display: '' };
    let css = '';
    Object.defineProperty(s, 'cssText', {
        get: ()=> css + (s.display ? `;display:${s.display}` : ''),
        set: (v)=> { css = v; s.display = (v.match(/display:([a-z]+)/) || [])[1] || ''; },
    });
    return s;
}

test('a touch gamepad side with no controls and no center button take no touch after a relayout (I1)', ()=>
{
    const { run, context } = loadEngine({ window: { ontouchstart: null } });
    context.domStyle = domStyle;
    const shown = JSON.parse(run(`(()=>
    {
        const zone = ()=> ({ style: globalThis.domStyle() });
        touchGamepadOverlay = { style: {} }; touchGamepadSideZones = [zone(), zone()]; touchGamepadZoneC = zone();
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) };
        touchGamepadBuildSvg = ()=> {};
        touchGamepadLeftStick = false; touchGamepadLeftButtonCount = 0; touchGamepadButtonCount = 1;
        touchGamepadRelayout();
        return JSON.stringify([...touchGamepadSideZones, touchGamepadZoneC].map((z)=> z.style.display));
    })()`));
    assert.deepEqual(shown, ['none', '', 'none']);
});

test('a pinch made while the touch gamepad had touch is not counted when the game gets it back (I2)', ()=>
{
    const { run, handlers, context } = loadEngine({ window: { ontouchstart: null } });
    const zone = { tagName: 'DIV', closest: ()=> null, setPointerCapture() {} };
    const page = { tagName: 'CANVAS', closest: ()=> null };
    context.zone = zone;
    run(`touchGamepadEnable = true; touchGamepadPassthrough = true; touchGamepadSideZones[1] = globalThis.zone;
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 1000, height: 1000 }) };`);
    const ev = (type, touches, changed)=> ({ type, touches, changedTouches: changed, target: changed[0].target,
        cancelable: false, preventDefault() {} });
    const pinch = ()=> +run('touchPinch.toFixed(2)');
    const B = { identifier: 2, clientX: 300, clientY: 300, target: page };
    const C = (x)=> ({ identifier: 3, clientX: x, clientY: 300, target: page });
    handlers.touchstart(ev('touchstart', [B], [B]));
    handlers.touchstart(ev('touchstart', [B, C(400)], [C(400)]));
    handlers.touchmove(ev('touchmove', [B, C(500)], [C(500)]));
    run('inputUpdatePost(); touchGamepadPassthrough = false'); // the gamepad owns touch now
    handlers.touchmove(ev('touchmove', [B, C(600)], [C(600)]));
    run('inputUpdatePost(); touchGamepadPassthrough = true');
    handlers.touchmove(ev('touchmove', [B, C(700)], [C(700)]));
    assert.equal(pinch(), 0, 'the first move back starts the pinch over');
    run('inputUpdatePost()');
    handlers.touchmove(ev('touchmove', [B, C(750)], [C(750)]));
    assert.equal(pinch(), -1, 'then it counts from there');
});

test('every name the 3D snippet sources define is reserved from a Shader\'s own uniforms (G1, G3)', ()=>
{
    const { run } = loadEngine();
    const reserved = new Set(JSON.parse(run('JSON.stringify([...SHADER_RESERVED_NAMES])')));
    for (const which of ['RENDER3D_SNIPPET_NAMES', 'RENDER3D_VERTEX_SNIPPET_NAMES'])
        for (const [, name] of run(which).matchAll(/#define (\w+)/g))
            assert.ok(reserved.has(name) || /^i[A-Z]/.test(name), which + ' ' + name);
    assert.throws(()=> run(`new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }', '', {lightCones: 1})`),
        /Assert failed/);
});

test('readSaveData fills a nested default\'s new keys and copies a vec2 or Color inside a default (K1, K2)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const store = new Map;
        const localStorage = { getItem: (k)=> store.get(k) ?? null, setItem: (k, v)=> store.set(k, String(v)) };
        const { run } = loadEngine({ localStorage }, '', file);
        const result = JSON.parse(run(`(()=>
        {
            const show = (v)=> JSON.stringify(v, (k, x)=> typeof x === 'number' && !isFinite(x) ? String(x) : x);
            // a save made before music and level3 were added to the defaults
            writeSaveData('game', {settings: {volume: .5}, best: {level1: 3}, list: [1]});
            const defaults = {settings: {volume: 1, music: true}, best: {level1: Infinity, level3: Infinity},
                list: [5, 6, 7], spots: [vec2(1, 2)], tints: {main: WHITE}};
            const saved = readSaveData('game', defaults);
            const fresh = readSaveData('none', defaults);
            const copies = [fresh.spots[0] !== defaults.spots[0], fresh.spots[0] instanceof Vector2,
                fresh.tints.main !== WHITE, Object.isFrozen(fresh.tints.main)];
            fresh.spots[0].x = 9;
            return JSON.stringify([show(saved), copies, defaults.spots[0].x]);
        })()`));
        assert.deepEqual(JSON.parse(result[0]), {settings: {volume: .5, music: true},
            best: {level1: 3, level3: 'Infinity'}, list: [1], spots: [{x: 1, y: 2}], tints: {main: {r: 1, g: 1, b: 1, a: 1}}},
            file + ': new keys filled, a saved array kept as saved');
        assert.deepEqual(result[1], [true, true, true, false], file + ': copies, never the frozen WHITE');
        assert.equal(result[2], 1, file + ': the default untouched');
    }
});

test('a huge time scale runs at most about 300 updates a frame (K4)', async ()=>
{
    const { run } = await engine({}, false);
    const updates = run(`(()=>
    {
        let n = 0;
        const update = engineObjectsUpdate;
        engineObjectsUpdate = ()=> ++n;
        setTimeScale(1e6);
        try { engineStep(3); }
        finally { engineObjectsUpdate = update; setTimeScale(1); }
        return n;
    })()`);
    assert.ok(updates > 0 && updates <= 3 * 310, 'updates ' + updates);
});
