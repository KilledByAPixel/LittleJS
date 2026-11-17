import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// Full pass 31 of 2026-11-16: a HeightMap edge on a slope, a ramp onto a map, a walk and a jump at a raised edge;
// class defaults with accessors, a copy that gives nothing and a method's name; 2D object edits during an async
// restart; a level loaded during Edit prefab; nested save defaults; an atlas group of tall frames; a negative slice;
// a uniform named as a GLSL word; a pause during a catch up; box fill held still; edit3D.setProperty; a lathe of vec2s

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

// run a 3D scene of the code given with a body of size, walking at velocity for frames; where it ends, its biggest
// move across in one frame, and what it stood on
function walk3D(scene, {size = 'vec3(1, 1, 1)', start, velocity = 'vec3(.05, 0, 0)', frames = 120})
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        ${scene}
        const body = new EngineObject3D(${start}); body.size3D = ${size}; body.setCollision(); body.mass = 1;
        let jump = 0, grounded = 0;
        for (let f = 0; f < ${frames}; ++f)
        {
            const v = ${velocity}, x = body.pos3D.x, z = body.pos3D.z;
            body.velocity3D.x = v.x; body.velocity3D.z = v.z;
            engineObjectsUpdate();
            jump = Math.max(jump, Math.abs(body.pos3D.x - x - v.x), Math.abs(body.pos3D.z - z - v.z));
            body.groundObject && ++grounded;
        }
        return JSON.stringify({x: body.pos3D.x, y: body.pos3D.y, jump, grounded,
            on: body.groundObject?.constructor.name ?? null});
    })()`));
}

// two HeightMaps side by side, one slope across the seam at x 4
const seam = (deg)=> `const slope = Math.tan(${deg} * Math.PI / 180);
    const make = (cx)=> { const h = []; for (let j = 0; j <= 8; ++j) { h.push([]);
        for (let i = 0; i <= 8; ++i) h[j].push((cx - 4 + i) * slope / 20); }
        return new HeightMap(h, vec2(8, 8), 20, undefined, vec3(cx, 0, 0)); };
    make(0); make(8);`;

test('a HeightMap seam on a slope is walked over, by a wide body too, and a ramp onto a map is climbed (C1, C4)', ()=>
{
    for (const deg of [10, 25, 30, 35, 40])
    {
        const t = Math.tan(deg * Math.PI / 180);
        const r = walk3D(seam(deg), {start: `vec3(1, ${t + .5}, 0)`});
        assert.ok(r.x > 6.9 && r.grounded > 110, deg + ' degrees: ' + JSON.stringify(r));
    }
    for (const deg of [10, 15, 20])
    {
        const t = Math.tan(deg * Math.PI / 180);
        const r = walk3D(seam(deg), {start: `vec3(1, ${t + .5}, 0)`, size: 'vec3(2, 1, 3)'});
        assert.ok(r.x > 6.9, 'a wide body at ' + deg + ' degrees: ' + JSON.stringify(r));
    }
    // a MeshCollider ramp whose top face is y = x tan, from x -4 to 4, then a map going on at the same slope
    for (const deg of [20, 30, 40])
    {
        const t = Math.tan(deg * Math.PI / 180);
        const r = walk3D(`const angle = ${deg} * Math.PI / 180, t = Math.tan(angle);
            const slab = new MeshCollider(buildBox(vec3(8 / Math.cos(angle), 1, 20)), vec3(0, -.5 / Math.cos(angle), 0));
            slab.rotation3D = vec3(0, 0, angle);
            const h = []; for (let j = 0; j < 9; ++j) { h.push([]); for (let i = 0; i < 9; ++i) h[j].push((4 + i) * t / 20); }
            new HeightMap(h, vec2(8, 8), 20, undefined, vec3(8, 0, 0));`,
            {start: `vec3(-2, ${-2 * t + .6}, 0)`, frames: 200});
        assert.ok(r.x > 7.9 && r.on === 'HeightMap', deg + ' degree ramp onto a map: ' + JSON.stringify(r));
    }
});

// a plateau of height, an 8 by 8 HeightMap at (10, 0, 0) on a floor, its edges at the plateau's height
const plateau = (height)=> `const floor = new EngineObject3D(vec3(0, -.5, 0)); floor.size3D = vec3(60, 1, 60);
    floor.setCollision(); floor.mass = 0;
    const h = []; for (let j = 0; j < 9; ++j) { h.push([]); for (let i = 0; i < 9; ++i) h[j].push(${height} / 4); }
    new HeightMap(h, vec2(8, 8), 4, undefined, vec3(10, 0, 0));`;

test('a slow walk off a raised edge falls with no snap sideways, and a jump onto one lands as on a cliff (C2)', ()=>
{
    for (const [velocity, start] of [['vec3(-.02, 0, 0)', 'vec3(6.5, 2.5, 0)'], ['vec3(0, 0, .02)', 'vec3(10, 2.5, 3.5)']])
    {
        const r = walk3D(plateau(2), {start, velocity, frames: 150});
        assert.ok(r.jump < .01 && Math.abs(r.y - .5) < .01, velocity + ': ' + JSON.stringify(r));
    }
    // a jump from the floor at 3.6 toward an edge 1.5 high: its box over the top lands it on the map
    const { run } = loadEngine();
    const landed = run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        ${plateau(1.5)}
        const body = new EngineObject3D(vec3(3.6, .5, 0)); body.size3D = vec3(.8, 1, .8); body.setCollision();
        body.mass = 1;
        for (let f = 0; f < 6; ++f) engineObjectsUpdate();
        body.velocity3D = vec3(.1, .35, 0);
        let on = false;
        for (let f = 0; f < 80; ++f) { body.velocity3D.x = .1; engineObjectsUpdate();
            on ||= body.groundObject instanceof HeightMap; }
        return on;
    })()`);
    assert.equal(landed, true);
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
        try { [globalThis.made] = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16,
            layers: [{type: 'objectgroup', id: 1, name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16,
            point: true, properties: ${properties}}]}]}); }
        catch (e) { warned.push('threw ' + e.message); }
        console.warn = warn;
        return JSON.stringify({warned});
    })()`));
}

test('Tiled class members: text through a copied class\'s setter, a copy that gives nothing, a method\'s name with no'
    + ' copy (O1, O2, O3)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        run('setHeadlessMode(true)');
        run(`globalThis.Look = class { #tint = rgb(1, 0, 0); #at = vec2(0, 0);
            get tint() { return this.#tint; } set tint(v) { this.#tint = v; }
            get at() { return this.#at; } set at(v) { this.#at = v; } get fixed() { return 1; }
            copy() { const c = new Look; c.tint = this.tint.copy(); c.at = this.at.copy(); return c; } };
            globalThis.Empty = class { hp = 1; copy() {} };
            globalThis.Plain = class { hp = 1; heal() { return 'heal'; } };`);
        // O1: Tiled's text for a Color and a Vector2 goes through the setters, into the private fields
        const said = loadMob(run, `{look: new Look}`,
            `[{name: 'look', type: 'class', value: {tint: '#ff00ff00', at: '3,4', fixed: 2}}]`);
        assert.equal(run(`[made.look.tint.toString(), made.look.at.toString(0),
            Object.keys(made.look).length].join()`), '#00ff00ff,( 3, 4 ),0', file);
        if (file === 'littlejs.js')
            assert.deepEqual(said.warned, ['objectLayersLoad: object 1\'s look.fixed can only be read, left out']);
        // O2: a copy method that gives back nothing is as none, with a warning, and the map loads
        const empty = loadMob(run, `{stats: new Empty}`, `[{name: 'stats', type: 'class', value: {hp: 5}}]`);
        assert.equal(run('made.stats.hp'), 5, file);
        file === 'littlejs.js' && assert.match(empty.warned[0], /copy method that gives back no new object/);
        // pass 32 O1: with no member set every object shares the default, which is said too, once
        assert.equal(loadMob(run, `{stats: new Empty}`, `[]`).warned.length, file === 'littlejs.js' ? 1 : 0,
            file + ': no member set, shared, said');
        // O3: with no copy, a member named as a method of the class is left out, said
        const plain = loadMob(run, `{stats: new Plain}`, `[{name: 'stats', type: 'class', value: {heal: 3, hp: 2}}]`);
        assert.equal(run(`[made.stats.heal(), made.stats.hp].join()`), 'heal,2', file);
        file === 'littlejs.js' && assert.deepEqual(plain.warned,
            ['objectLayersLoad: object 1\'s stats.heal has a method\'s name, left out']);
    }
});

test('the 2D editor takes no object edit or its undo while an async onRestart waits, so nothing is made twice (E1)',
    async ()=>
{
    const { run } = await engine();
    run(`
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        var map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(0)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 8}]}]};
        function loadLevel() { tileLayersLoad(map, undefined, 0, 'ground'); return objectLayersLoad(map); }
        var release;
        levelEditor.onRestart = async ()=> { engineObjectsDestroy(); await new Promise((r)=> release = r); loadLevel(); };
        loadLevel(); levelEditor.open();
        var rec = editorMapList.find((r)=> r.map === map);
        editorSelectLayer(editorObjectLayers(rec)[0]);
        var edit = levelEditor.edit2D;
        var doors = ()=> engineObjects.filter((o)=> o instanceof Door && !o.destroyed).length;
        edit.changeObjects((list)=> { list[0].x = 12; }); edit.strokeEnd();
        editorRestart(); levelEditor.open(); editorSelectLayer(editorObjectLayers(rec)[0]);`);
    assert.equal(run('edit.undo()'), false, 'an undo of objects waits');
    assert.equal(run(`edit.changeObjects((list)=> list.push({id: 9, type: 'Door', point: true, x: 24, y: 24}))`),
        false, 'an object added waits');
    run('edit.strokeEnd(); release()');
    await new Promise((resolve)=> setTimeout(resolve, 10));
    run('engineStep()');
    assert.equal(run('doors()'), 1, 'one Door for the one in the map');
    assert.equal(run(`edit.changeObjects((list)=> list.push({id: 9, type: 'Door', point: true, x: 24, y: 24}))`),
        true, 'and edits are taken again');
    run('edit.strokeEnd()');
    assert.equal(run('doors()'), 2);
});

test('a level loaded while Edit prefab is open leaves none of the prefab\'s parts in the world (D1)', async ()=>
{
    const { run } = await engine({}, true);
    const live = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1,
            prefabs: {Tower: {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Sphere', pos: [0, 2, 0]}]}},
            objects: [{id: 1, type: 'Tower', pos: [5, 0, 5]}, {id: 2, type: 'Box', pos: [-5, .5, 0]}]};
        let list = level3DLoad(level);
        editor3DOpen(); editor3DPrefabEnter(1);
        for (const o of list) o.destroy();
        list = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Cylinder', pos: [0, .5, 0]}]});
        const alive = engineObjects.filter((o)=> !o.destroyed && !(o instanceof LensFlare3D));
        return JSON.stringify([alive.length, alive.every((o)=> list.includes(o)), editor3DPrefabStack.length]);
    })()`));
    assert.deepEqual(live, [1, true, 0]);
});

test('readSaveData gives an object default back for an older save\'s number, and a vec2 or Color in it as one'
    + ' (K1, K2)', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const store = new Map;
        const localStorage = { getItem: (k)=> store.get(k) ?? null, setItem: (k, v)=> store.set(k, String(v)) };
        const { run } = loadEngine({ localStorage }, '', file);
        const result = JSON.parse(run(`(()=>
        {
            writeSaveData('game', {settings: 5, deep: {opts: null}, list: 'x', spots: [{x: 3, y: 4}, 7],
                tints: {main: {r: 0, g: 1, b: 0, a: 1}}});
            const save = readSaveData('game', {settings: {volume: 1, music: true}, deep: {opts: {fast: false}},
                list: [1, 2], spots: [vec2(1, 2), vec2(5, 6)], tints: {main: WHITE}});
            return JSON.stringify([save.settings, save.deep, save.list, save.spots[0] instanceof Vector2 &&
                save.spots[0].toString(0), save.spots[1], save.tints.main instanceof Color && save.tints.main.toString()]);
        })()`));
        assert.deepEqual(result, [{volume: 1, music: true}, {opts: {fast: false}}, [1, 2], '( 3, 4 )', {x: 5, y: 6}, '#00ff00ff'],
            file);
    }
});

test('an atlas group of nine is a 3 by 3 block, or a row when frames that tall do not fit three high (P1, P3)', ()=>
{
    const { run } = loadEngine();
    const tried = (count, w, h)=> JSON.parse(run(`(()=>
    {
        const tries = [], add = textureSheetAdd;
        // a sheet of 2048: a block that is taller fits on none
        textureSheetAdd = (size, frame)=> (tries.push(size.x + 'x' + size.y), size.y <= 2048 ? {size} : undefined);
        try { return JSON.stringify([tries, textureSheetAddGroup(${count}, vec2(${w}, ${h}), 1)?.size.toString(0)]); }
        finally { textureSheetAdd = add; }
    })()`));
    assert.deepEqual(tried(9, 16, 16), [['48x48'], '( 48, 48 )'], 'nine small frames, a block');
    assert.deepEqual(tried(9, 128, 720), [['384x2160', '1152x720'], '( 1152, 720 )'], 'nine tall frames, a row');
    assert.deepEqual(tried(4, 16, 16), [['64x16'], '( 64, 16 )'], 'four frames, a row');
    // and a block of nine reads as a nine-slice on a real sheet's packing
    const block = run(`(()=>
    {
        const sheet = {size: 256, cursor: vec2(), rowHeight: 0};
        const t = TextureSheet.prototype.tryAdd.call(sheet, vec2(48, 48), vec2(16), 1);
        return t.columns + ' ' + [0, 4, 8].map((k)=> t.frame(k).pos.subtract(t.pos).scale(1 / 18).toString(0)).join(' ');
    })()`);
    assert.equal(block, '3 ( 0, 0 ) ( 1, 1 ) ( 2, 2 )');
});

test('a nine-slice or three-slice of a negative size in world space draws the box of its positive one (P2)', ()=>
{
    const { run } = loadEngine();
    const pieces = (fn, width)=> run(`(()=>
    {
        setHeadlessMode(true);
        const seen = [], draw = drawTile;
        drawTile = (pos, size)=> seen.push(pos.toString(2) + ' ' + size.toString(2));
        const start = new TileInfo(vec2(0, 0), vec2(16), textureInfos[0], 0, 0);
        try { ${fn}(vec2(), vec2(${width}, 4), start, undefined, 1, undefined, 0, 0, false, false); }
        finally { drawTile = draw; }
        return seen.sort().join('|');
    })()`);
    for (const fn of ['drawNineSlice', 'drawThreeSlice'])
        assert.equal(pieces(fn, -8), pieces(fn, 8), fn);
});

test('a Shader uniform can not be named as a GLSL word or built-in function, or with a double underscore (G1)', ()=>
{
    const { run } = loadEngine();
    for (const name of ['input', 'sample', 'smooth', 'flat', 'centroid', 'filter', 'min', 'texture', 'my__glow'])
        assert.throws(()=> run(`new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }', '', {${name}: 1})`),
            /Assert failed/, name);
    assert.doesNotThrow(()=> run(`new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(glow); }', '', {glow: 1})`));
});

test('a pause set during a big catch up drops the rest of that frame\'s ticks (K3)', async ()=>
{
    let updates = 0, posts = 0, pauseAt = -1;
    LJS.setEngineManualStep(true);
    await LJS.engineInit(()=> {}, ()=> { ++updates; updates === pauseAt && LJS.setPaused(true); }, ()=> ++posts,
        ()=> {}, ()=> {});
    LJS.setTimeScale(100);
    LJS.engineStep(1);
    updates = 0; posts = 0; pauseAt = 1;
    LJS.engineStep(1);
    assert.equal(updates, 1);
    assert.ok(posts <= 2, 'gameUpdatePost ' + posts);
    LJS.setPaused(false); LJS.setTimeScale(1);
});

test('box fill held still on the same cell fills the box once (D3)', async ()=>
{
    const { run } = await engine({}, true);
    const calls = JSON.parse(run(`(()=>
    {
        level3DLoad({littlejs3D: 1, voxels: {pos: [0, 0, 0], size: [64, 16, 64], blocks: [65536, 0]}, objects: []});
        const down = (x, z)=> new Ray3D(vec3(x, 20, z), vec3(0, -1, 0));
        const map = editor3DVoxelMap(), set = map.setVoxel.bind(map);
        let calls = 0;
        map.setVoxel = (c, t)=> (++calls, set(c, t));
        editor3DBlockType = 3; editor3DBlockBox = true; editor3DBlockBoxHeight = 4;
        const drag = editor3DVoxelPress(down(.5, .5), 'place');
        editor3DVoxelDragTo(drag, down(15.5, 15.5));
        const first = calls;
        calls = 0;
        for (let i = 0; i < 3; ++i) editor3DVoxelDragTo(drag, down(15.5, 15.5));
        const held = calls;
        editor3DVoxelDragTo(drag, down(7.5, 7.5));
        return JSON.stringify([first > 0, held, calls > 0, map.getVoxel(vec3(10, 0, 10)), map.getVoxel(vec3(5, 0, 5))]);
    })()`));
    assert.deepEqual(calls, [true, 0, true, 0, 3], 'filled once, then smaller when the mouse moves');
});

test('edit3D.setProperty writes nothing of another kind or a number that is not finite (D4)', async ()=>
{
    const { run } = await engine({}, true);
    run(`level3DAddType('Lamp', class extends EngineObject3D { constructor(pos) { super(pos); } },
        {power: 1, tint: rgb(1, 1, 1), at: vec3(), name: 'a', list: [1]});
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Lamp', pos: [0, 0, 0]}]}); editor3DOpen();`);
    for (const code of [`'power', Infinity`, `'power', NaN`, `'power', '5'`, `'tint', '#ff00'`, `'at', [1, 2]`,
        `'name', 5`, `'list', {}`])
        assert.throws(()=> run(`levelEditor.edit3D.change((list)=> levelEditor.edit3D.setProperty(list[0], ${code}))`),
            /Assert failed/, code);
    run('levelEditor.edit3D.strokeCancel()');
    run(`levelEditor.edit3D.change((list)=> { levelEditor.edit3D.setProperty(list[0], 'power', 3);
        levelEditor.edit3D.setProperty(list[0], 'tint', rgb(1, 0, 0)); }); levelEditor.edit3D.strokeEnd()`);
    assert.equal(run('JSON.stringify(levelEditor.edit3D.objects[0].properties)'),
        JSON.stringify({power: 3, tint: '#ff0000'}));
});

test('buildLathe takes vec2(radius, y) points, and asserts on a point of another form (G2)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    assert.equal(run('buildLathe([vec2(0, -1), vec2(1, 0), vec2(0, 1)], 8).points.length'),
        run('buildLathe([[0, -1], [1, 0], [0, 1]], 8).points.length'));
    assert.throws(()=> run('buildLathe([{r: 0}, {r: 1}], 8)'), /Assert failed/);
});
