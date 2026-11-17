import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 32 of 2026-11-16: a wide body at a raised HeightMap edge, a walk downhill across a seam and a fast one
// up; a touch stick through a resize; class defaults with an empty copy and Object's method names; 2D actions during
// an async restart and refused object deletes; a 3D drag across a level load, edit3D.setProperty and setTransform;
// a list saved for a vec2 default; a uniform named GL_

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

// a body of size walking at .05 from off a plateau of the height given, an 8 by 8 map at (10, 0, 0) on a floor
function climbsEdge(size, height)
{
    const { run } = loadEngine();
    return run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const floor = new EngineObject3D(vec3(0, -.5, 0)); floor.size3D = vec3(60, 1, 60); floor.setCollision();
        floor.mass = 0;
        const h = []; for (let j = 0; j < 9; ++j) { h.push([]); for (let i = 0; i < 9; ++i) h[j].push(${height} / 4); }
        const map = new HeightMap(h, vec2(8, 8), 4, undefined, vec3(10, 0, 0));
        const size = ${size}, body = new EngineObject3D(vec3(6 - size.x / 2 - .3, size.y / 2, 0));
        body.size3D = size; body.setCollision(); body.mass = 1;
        let on = false;
        for (let f = 0; f < 80; ++f) { body.velocity3D.x = .05; engineObjectsUpdate(); on ||= body.groundObject === map; }
        return on;
    })()`);
}

test('a body wider than it is tall is stopped by a raised HeightMap edge as a narrow one is (C1, C3)', ()=>
{
    for (const size of ['vec3(1, 1, 1)', 'vec3(2, 1, 3)', 'vec3(4, 1, 4)', 'vec3(3, .5, 3)'])
    {
        assert.equal(climbsEdge(size, 1), false, size + ' at an edge of 1');
        assert.equal(climbsEdge(size, .6), false, size + ' at an edge of .6');
        assert.equal(climbsEdge(size, .2), true, size + ' steps onto .2');
    }
});

// a body walking along a slope across two HeightMaps meeting at x 4, or along one map as wide; frames off the ground
function slopeWalk(deg, speed, maps, size='vec3(1, 1, 1)', down=true)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const slope = Math.tan(${deg} * Math.PI / 180) * (${down} ? -1 : 1);
        const make = (cx, w)=> { const n = w, h = []; for (let j = 0; j <= 8; ++j) { h.push([]);
            for (let i = 0; i <= n; ++i) h[j].push(((cx - w / 2 + i) * slope + 20) / 40); }
            return new HeightMap(h, vec2(w, 8), 40, undefined, vec3(cx, -20, 0)); };
        ${maps === 2 ? 'make(0, 8); make(8, 8);' : maps === -2 ? 'make(8, 8); make(0, 8);' : 'make(4, 16);'}
        const size = ${size}, body = new EngineObject3D(vec3(1, slope + size.y / 2, 0));
        body.size3D = size; body.setCollision(); body.mass = 1;
        for (let f = 0; f < 10; ++f) engineObjectsUpdate();
        let air = 0;
        for (let f = 0; body.pos3D.x < 7 && f < 400; ++f)
        { body.velocity3D.x = ${speed}; engineObjectsUpdate(); body.groundObject || ++air; }
        return JSON.stringify({air, x: body.pos3D.x});
    })()`));
}

test('walking downhill across a seam between two HeightMaps stays on the ground as on one map, and a fast walk uphill'
    + ' crosses it (C2, C3)', ()=>
{
    for (const [deg, speed] of [[20, .1], [30, .1], [30, .2], [40, .05]])
    {
        const one = slopeWalk(deg, speed, 1).air;
        for (const maps of [2, -2])
            assert.equal(slopeWalk(deg, speed, maps).air, one, `${deg} degrees at ${speed}, ${maps < 0 ? 'BA' : 'AB'}`);
    }
    // the allowance read from where the move began: a wide body fast up a steep slope crosses in either order
    for (const maps of [2, -2])
        assert.ok(slopeWalk(40, .6, maps, 'vec3(2, 1, 3)', false).x >= 7, 'fast up, ' + maps);
});

// the touch gamepad made for real, its window resize listener kept, on a stage whose size the test sets
function gamepadStage()
{
    const stage = { width: 400, height: 800 }, listeners = {};
    const { run, context } = loadEngine({ window: { ontouchstart: null } });
    const style = ()=> { const s = {display: ''}; let css = ''; Object.defineProperty(s, 'cssText',
        {get: ()=> css, set: (v)=> { css = v; }}); return s; };
    const el = ()=> ({ style: style(), tagName: 'DIV', closest: ()=> null, setPointerCapture() {}, addEventListener() {},
        appendChild() {}, setAttribute() {}, removeChild() {}, firstChild: null,
        getBoundingClientRect: ()=> ({ left: 0, top: 0, width: stage.width, height: stage.height }) });
    context.document.createElement = el;
    context.document.createElementNS = el;
    context.document.body = { appendChild() {} };
    context.addEventListener = (type, f)=> { listeners[type] = f; };
    run(`(()=>{ const h = headlessMode; headlessMode = false; touchGamepadEnable = true; touchGamepadInit();
        headlessMode = h; touchGamepadBuildSvg = ()=> { touchGamepadSvgEls = { face: [], thumb: [] }; };
        touchGamepadFloating = true; touchGamepadLeftStick = true; })()`);
    const down = (id, x, y)=> run(`touchGamepadPointerDown({ pointerType: 'touch', pointerId: ${id}, clientX: ${x},
        clientY: ${y}, preventDefault() {} }, touchGamepadSideZones[0])`);
    const up = (id)=> run(`touchGamepadPointerUp({ pointerId: ${id} })`);
    const base = ()=> run(`touchGamepadRelayout(); touchGamepadSideCenter(0, ${stage.width}, ${stage.height}).toString()`);
    const rotate = ()=> { stage.width = 800; stage.height = 400; listeners.resize(); };
    return {run, down, up, base, rotate, listeners};
}

test('a floating stick goes back to its place after a resize, a free one at once and a held one once let go'
    + ' (I1, I2)', ()=>
{
    const free = gamepadStage();
    assert.equal(typeof free.listeners.resize, 'function');
    const place = (()=> { const s = gamepadStage(); s.rotate(); return s.base(); })(); // the side's place, rotated
    free.down(7, 80, 760); free.up(7);
    assert.equal(free.base(), '( 80.000, 760.000 )', 'where it was let go');
    free.rotate();
    assert.equal(free.base(), place, 'a free one at once');
    const held = gamepadStage();
    held.down(7, 80, 760); held.rotate();
    assert.equal(held.base(), '( 80.000, 760.000 )', 'held, it stays where the finger is');
    held.up(7);
    assert.equal(held.base(), place, 'let go, back to its place');
});

test('a fixed stick held through a resize reads against where its base is drawn now (I1)', ()=>
{
    const s = gamepadStage();
    s.run('touchGamepadFloating = false');
    s.down(7, 100, 700); s.rotate();
    const center = s.base();
    const [x, y] = center.replace(/[()\s]/g, '').split(',').map(Number);
    s.run(`touchGamepadPointerMove?.({ pointerId: 7, clientX: ${x}, clientY: ${y}, preventDefault() {} }) ??
        touchGamepadApplyStick(0, vec2(${x}, ${y}))`);
    assert.equal(s.run('touchGamepadSticks[0].length() < 1e-9'), true, 'its base is the middle');
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
        [globalThis.made] = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [
            {type: 'objectgroup', id: 1, name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true,
            properties: ${properties}}, {id: 2, type: 'Mob', x: 32, y: 16, point: true}]}]});
        console.warn = warn;
        return JSON.stringify({warned, shared: globalThis.made.look === objectLayersTypes.get('Mob').defaults.look});
    })()`));
}

test('a class default whose copy gives nothing is said when shared, and Object\'s method names are left out with no'
    + ' copy (O1, O2)', async ()=>
{
    const { run } = await engine();
    run(`globalThis.Look = class { hp = 1; copy() {} }; globalThis.Plain = class { hp = 1; }`);
    const shared = loadMob(run, `{look: new Look}`, `[]`);
    assert.equal(shared.shared, true);
    // pass 33 O1, O2: said by its type, for the objects that leave it alone
    assert.deepEqual(shared.warned, ['objectLayersLoad: Mob\'s default look has a copy method that gives back no new ' +
        'object, so the objects that leave it alone share it']);
    const named = loadMob(run, `{stats: new Plain}`, `[{name: 'stats', type: 'class', value: {toString: 4, valueOf: 2,
        hp: 3}}]`);
    assert.equal(run('typeof made.stats.toString + typeof made.stats.valueOf + made.stats.hp + String(made.stats)'),
        'functionfunction3[object Object]');
    assert.deepEqual(named.warned, ['objectLayersLoad: object 1\'s stats.toString has a method\'s name, left out',
        'objectLayersLoad: object 1\'s stats.valueOf has a method\'s name, left out']);
});

// a level with one Door and a painted tile, in the 2D editor, its restart async and waiting till released
async function doorEditor()
{
    const { run } = await engine();
    run(`
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        var map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 56}]}]};
        function loadLevel() { tileLayersLoad(map, undefined, 0, 'ground'); return objectLayersLoad(map); }
        var release;
        levelEditor.onRestart = async ()=> { engineObjectsDestroy(); await new Promise((r)=> release = r); loadLevel(); };
        loadLevel(); levelEditor.open();
        var rec = editorMapList.find((r)=> r.map === map);
        var tiles = ()=> map.layers[0].data.join(''), doors = ()=> map.layers[1].objects.length;
        var wait = ()=> { editorRestart(); levelEditor.open(); };`);
    return run;
}

test('during an async restart a Clear or Cut of a selection with All Layers that holds objects is refused whole (E2)', async ()=>
{
    const run = await doorEditor();
    run(`wait(); editorSelectLayer(rec.layers[0]); editorAllLayers = true;
        editorSelection = {min: vec2(0, 0), max: vec2(1, 1)};`);
    const before = run('tiles() + " " + doors()');
    run('editorClear()');
    assert.equal(run('tiles() + " " + doors()'), before, 'Clear changed nothing');
    assert.equal(run('editorCut()'), false, 'Cut refused');
    assert.equal(run('tiles() + " " + doors()'), before, 'Cut changed nothing');
    // a selection with no objects in it still clears its tiles meanwhile
    run('editorSelection = {min: vec2(2, 2), max: vec2(3, 3)}; editorClear()');
    assert.notEqual(run('tiles()'), before.split(' ')[0], 'a tile only area clears');
    run('release()');
});

test('an Apply of autosaved object edits waits for an async restart, and a refused object Delete keeps the selection'
    + ' (E1, E3)', async ()=>
{
    const run = await doorEditor();
    run(`wait(); editorSelectLayer(editorObjectLayers(rec)[0]); editorObjectSelection.add(1);`);
    assert.equal(run('editorDeleteObjects()'), false, 'refused');
    assert.equal(run('editorObjectSelection.has(1) && doors() === 1'), true, 'the selection and the door kept');
    assert.equal(run('editorCutObjects()'), false, 'a cut refused before it copies');
    assert.equal(run('!editorObjectBrush'), true, 'nothing in the brush');
    // autosaved edits that move the door wait, and stay waiting
    run(`rec.pending = {width: 4, height: 4, layers: [map.layers[0].data.slice()],
        objects: [[{...map.layers[1].objects[0], x: 40}]]}`);
    assert.equal(run('editorApplyPending(rec)'), false);
    assert.equal(run('!!rec.pending && map.layers[1].objects[0].x'), 8, 'kept waiting, the door where it was');
    run('rec.pending = {width: 4, height: 4, layers: [new Array(16).fill(2)], objects: [map.layers[1].objects]}');
    assert.equal(run('editorApplyPending(rec) && tiles()'), '2'.repeat(16), 'tiles alone go in');
    run('release()');
});

test('a 3D drag held while the game loads another level ends with it (D1)', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]});
        editor3DOpen();
        editor3DDrag = {kind: 'body', fake: true}; editor3DHover = 1; editor3DPlacedHeld = {undo: 0};
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Sphere', pos: [-20, .5, -20]}]});
        return JSON.stringify([editor3DDrag ?? null, editor3DHover ?? null, editor3DPlacedHeld ?? null]);
    })()`));
    assert.deepEqual(result, [null, null, null]);
});

test('edit3D.setProperty takes what the load reads back, and setTransform finite Vector3s (D2, D4)', async ()=>
{
    const { run } = await engine({}, true);
    run(`level3DAddType('Lamp', class extends EngineObject3D { constructor(pos) { super(pos); } },
        {target: null, power: 1});
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Lamp', pos: [0, 0, 0]}]}); editor3DOpen();
        var edit = levelEditor.edit3D;`);
    for (const code of [`setProperty(o, 'target', 'x')`, `setProperty(o, 'target', rgb(1, 0, 0))`,
        `setProperty(o, 'extra', vec3(1, 2, 3))`, `setProperty(o, 'extra', rgb(1, 0, 0))`,
        `setTransform(o, vec3(NaN, 0, 0))`, `setTransform(o, vec2(1, 2))`, `setTransform(o, undefined, vec3(Infinity))`])
        assert.throws(()=> run(`edit.change((list)=> { const o = list[0]; edit.${code}; })`), /Assert failed/, code);
    run('edit.strokeCancel()');
    // a name of every object's, valueOf, is no default of the type: any value but a color or vector, as the load
    run(`edit.change((list)=> { edit.setProperty(list[0], 'target', {id: 2}); edit.setProperty(list[0], 'valueOf', 3);
        edit.setTransform(list[0], vec3(1, 2, 3)); }); edit.strokeEnd()`);
    assert.equal(run('JSON.stringify([edit.objects[0].properties, edit.objects[0].pos])'),
        JSON.stringify([{target: {id: 2}, valueOf: 3}, [1, 2, 3]]));
});

test('a list saved where a nested default has a vec2 comes back as the default, as at the top level (K1)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const store = new Map;
        const localStorage = { getItem: (k)=> store.get(k) ?? null, setItem: (k, v)=> store.set(k, String(v)) };
        const { run } = loadEngine({ localStorage }, '', file);
        const result = run(`(()=>
        {
            writeSaveData('game', {spawn: [1, 2], level: {start: [3, 4]}});
            const save = readSaveData('game', {spawn: vec2(5, 6), level: {start: vec2(7, 8)}});
            return [save.spawn, save.level.start].map((v)=> v instanceof Vector2 && v.toString(0)).join();
        })()`);
        assert.equal(result, '( 5, 6 ),( 7, 8 )', file);
    }
});

test('a Shader uniform named GL_ anything asserts, as gl_ does (K2)', ()=>
{
    const { run } = loadEngine();
    for (const name of ['GL_ES', 'GL_FRAGMENT_PRECISION_HIGH', 'gl_Thing'])
        assert.throws(()=> run(`new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }', '', {${name}: 1})`),
            /Assert failed/, name);
});
