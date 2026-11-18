import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 33 of 2026-11-17: walking down from a HeightMap onto a MeshCollider, a floor laid over terrain, a step
// from one mesh onto another, a raised edge at the step limit; a marker type in the loaders' lists; the shared default
// warning by type, nested and in 3D; 2D tile actions during an async restart and a Cut while edits wait; a 3D drag
// across a level load, setProperty over an object default and outside change; a stick let go by a blur; a fractional
// InstancedMesh3D count

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

// a 3D scene of the code given, a 1x1x1 body at start walking at speed till x reaches 7; frames off the ground, the
// lowest foot, and the frames it reported the shape named
function walk3D(scene, start, speed, shape='')
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const shapes = {}; ${scene}
        const body = new EngineObject3D(${start}); body.size3D = vec3(1); body.setCollision(); body.mass = 1;
        for (let f = 0; f < 60; ++f) { body.velocity3D.x = 0; engineObjectsUpdate(); }
        let air = 0, low = Infinity, on = 0;
        for (let f = 0; f < 400 && body.pos3D.x < 7; ++f)
        {
            body.velocity3D.x = ${speed}; engineObjectsUpdate();
            body.groundObject || ++air;
            low = Math.min(low, body.pos3D.y - .5);
            body.groundObject && body.groundObject === shapes['${shape}'] && ++on;
        }
        return JSON.stringify({air, low, on, x: body.pos3D.x});
    })()`));
}

test('walking down from a HeightMap onto a MeshCollider stays on the ground, in either list order (C1, C6)', ()=>
{
    for (const speed of [.1, .2])
        for (const reversed of [false, true])
        {
            const r = walk3D(`const slope = Math.tan(Math.PI / 6), angle = -Math.PI / 6;
                const map = ()=> { const h = []; for (let j = 0; j <= 8; ++j) { h.push([]);
                    for (let i = 0; i <= 8; ++i) h[j].push(-(-4 + i) * slope / 40); }
                    new HeightMap(h, vec2(8, 8), 40, undefined, vec3(0, 0, 0)); };
                const slab = ()=> { const L = 8 / Math.cos(angle), cy = -8 * slope;
                    const s = new MeshCollider(buildBox(vec3(L, 1, 20)), vec3(8 + .5 * Math.sin(angle),
                    cy - .5 * Math.cos(angle), 0)); s.rotation3D = vec3(0, 0, angle); };
                ${reversed ? 'slab(); map();' : 'map(); slab();'}`, 'vec3(-2, 2 * Math.tan(Math.PI / 6) + .5, 0)', speed);
            assert.equal(r.air, 0, `${speed}${reversed ? ' reversed' : ''}: ` + JSON.stringify(r));
        }
});

test('a floor laid just over terrain holds a body on it, never the terrain through it, in either list order (C2, C6)',
    ()=>
{
    for (const kind of ['voxel', 'mesh'])
        for (const gap of [.02, .05, .09])
            for (const floorFirst of [true, false])
            {
                const r = walk3D(`const terrain = ()=> { const h = []; for (let j = 0; j <= 16; ++j) { h.push([]);
                        for (let i = 0; i <= 16; ++i) h[j].push(0); }
                        shapes.terrain = new HeightMap(h, vec2(32, 32), 1, undefined, vec3(0, -${gap}, 0)); };
                    const floor = ()=> { if ('${kind}' === 'voxel') { const v = new VoxelMap(vec3(-8, -1, -8), vec3(16, 1, 16));
                        for (let x = 0; x < 16; ++x) for (let z = 0; z < 16; ++z) v.setVoxel(vec3(x, 0, z), 1); return; }
                        new MeshCollider(buildBox(vec3(16, 1, 16)), vec3(0, -.5, 0)); };
                    ${floorFirst ? 'floor(); terrain();' : 'terrain(); floor();'}`, 'vec3(-6, .6, 0)', .1, 'terrain');
                const name = `${kind} ${gap}${floorFirst ? ' floor first' : ''}`;
                assert.ok(r.low > -1e-3, name + ': ' + JSON.stringify(r));
                assert.equal(r.on, 0, name + ' never on the terrain');
            }
});

test('a body steps from one MeshCollider deck onto a low MeshCollider step, in either list order (C1)', ()=>
{
    for (const reversed of [false, true])
    {
        const r = walk3D(`const deck = ()=> new MeshCollider(buildGrid(vec2(40), 1));
            const step = ()=> new MeshCollider(buildBox(vec3(10, .2, 10)), vec3(9, .1, 0));
            ${reversed ? 'step(); deck();' : 'deck(); step();'}`, 'vec3(0, .5, 0)', .05);
        assert.ok(r.x >= 7, (reversed ? 'reversed: ' : '') + JSON.stringify(r));
    }
});

// a 1x1x1 body walking at speed into a raised HeightMap edge at x 10 of the height given; where it ends
function intoEdge(height, speed)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const floor = new EngineObject3D(vec3(0, -.5, 0)); floor.size3D = vec3(80, 1, 80); floor.setCollision();
        floor.mass = 0;
        const h = []; for (let j = 0; j < 65; ++j) { h.push([]); for (let i = 0; i < 65; ++i) h[j].push(${height} / 4); }
        new HeightMap(h, vec2(16, 16), 4, undefined, vec3(18, 0, 0));
        const body = new EngineObject3D(vec3(5, .5, 0)); body.size3D = vec3(1); body.setCollision(); body.mass = 1;
        for (let f = 0; f < 600 && body.pos3D.x < 12; ++f) { body.velocity3D.x = ${speed}; engineObjectsUpdate(); }
        const stopped = body.pos3D.x < 12;
        // and one stopped walks away freely
        for (let f = 0; f < 30; ++f) { body.velocity3D.x = -.05; engineObjectsUpdate(); }
        return JSON.stringify({x: body.pos3D.x, stopped, back: body.pos3D.x});
    })()`));
}

test('a raised HeightMap edge at the step limit: below it every speed climbs, and a body stopped has its middle off'
    + ' the map and walks away (C3, C6)', ()=>
{
    for (const speed of [.02, .05, .1, .2])
        assert.equal(intoEdge(.44, speed).stopped, false, '.44 at ' + speed);
    for (const height of [.48, .5, .6])
        for (const speed of [.02, .04, .1, .2])
        {
            const { run } = loadEngine();
            const at = JSON.parse(run(`(()=>
            {
                setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
                const floor = new EngineObject3D(vec3(0, -.5, 0)); floor.size3D = vec3(80, 1, 80); floor.setCollision();
                floor.mass = 0;
                const h = []; for (let j = 0; j < 65; ++j) { h.push([]); for (let i = 0; i < 65; ++i) h[j].push(${height} / 4); }
                new HeightMap(h, vec2(16, 16), 4, undefined, vec3(18, 0, 0));
                const body = new EngineObject3D(vec3(5, .5, 0)); body.size3D = vec3(1); body.setCollision(); body.mass = 1;
                for (let f = 0; f < 600 && body.pos3D.x < 12; ++f) { body.velocity3D.x = ${speed}; engineObjectsUpdate(); }
                const x = body.pos3D.x;
                for (let f = 0; f < 30; ++f) { body.velocity3D.x = -.05; engineObjectsUpdate(); }
                return JSON.stringify([x, body.pos3D.x]);
            })()`));
            const [x, back] = at, name = `${height} at ${speed}`;
            assert.ok(x > 11 || x < 10, name + ': climbed or stopped with its middle off the map, ' + x);
            x < 10 && assert.ok(back < x - 1, name + ': and walks away, ' + back);
        }
});

test('a marker type\'s position is not in the list the loaders give back, so unloading by it works (D1)', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        let start2D, start3D;
        objectLayersAddType('PlayerStart', (pos)=> start2D = pos);
        class Coin { constructor(pos) { this.pos = pos; } }
        objectLayersAddType('Coin', Coin);
        const list2D = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            id: 1, name: 'Objects', objects: [{id: 1, type: 'PlayerStart', x: 16, y: 16, point: true},
            {id: 2, type: 'Coin', x: 32, y: 16, point: true}]}]});
        level3DAddType('Start', (pos)=> start3D = pos);
        const list3D = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Start', pos: [1, 2, 3]},
            {id: 2, type: 'Box', pos: [0, 0, 0]}]});
        let threw = false;
        try { for (const o of list3D) o.destroy(); } catch { threw = true; }
        return JSON.stringify({two: list2D.map((o)=> o.constructor.name), three: list3D.map((o)=> o.constructor.name),
            start2D: start2D instanceof Vector2, start3D: start3D instanceof Vector3, threw});
    })()`));
    assert.deepEqual(result, {two: ['Coin'], three: ['EngineObject3D'], start2D: true, start3D: true, threw: false},
        'a plain class of the game\'s is kept, a marker\'s position is not');
});

// a level with a Door in the 2D editor, its async restart waiting till released
async function doorEditor(fileObjects=true)
{
    const { run } = await engine();
    run(`
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        var map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)}
            ${fileObjects ? `, {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true,
            x: 8, y: 56}]}` : ''}]};
        function loadLevel() { tileLayersLoad(map, undefined, 0, 'ground'); return objectLayersLoad(map); }
        var release;
        levelEditor.onRestart = async ()=> { engineObjectsDestroy(); await new Promise((r)=> release = r); loadLevel(); };
        loadLevel(); levelEditor.open();
        var rec = editorMapList.find((r)=> r.map === map);
        var tiles = ()=> map.layers[0].data.join('');
        var nudged = ()=> editorBusyNudgeTime !== undefined && timeReal - editorBusyNudgeTime < 1;`);
    return run;
}

test('during an async restart a tile only Reset or Apply goes in with no wait note, and a Cut while edits wait is'
    + ' refused (E1-E3)', async ()=>
{
    // a file with no object layer, one placed and deleted: the editor's own Objects layer is empty, Reset is tiles only
    let run = await doorEditor(false);
    run(`editorSelectLayer(rec.layers[0]); editorPaint(rec.layers[0], vec2(0, 0), 3); editorStrokeEnd();
        levelEditor.edit2D.changeObjects((list)=> list.push({id: 5, type: 'Door', point: true, x: 8, y: 8}));
        editorStrokeEnd();
        editorSelectLayer(editorObjectLayers(rec)[0]);
        levelEditor.edit2D.changeObjects((list)=> list.length = 0); editorStrokeEnd();
        editorRestart(); levelEditor.open(); editorBusyNudgeTime = undefined;`);
    run('editorRevert(rec)');
    assert.equal(run('tiles()'), '1'.repeat(16), 'Reset went in');
    assert.equal(run('nudged()'), false, 'with no wait note');
    run('release()');
    // a tile Apply over the same objects goes in with no note
    run = await doorEditor();
    run(`editorRestart(); levelEditor.open(); editorBusyNudgeTime = undefined;
        rec.pending = {width: 4, height: 4, layers: [new Array(16).fill(2)], objects: [map.layers[1].objects]};`);
    assert.equal(run('editorApplyPending(rec)'), true);
    assert.equal(run('tiles() === "2".repeat(16) && !nudged()'), true);
    run('release()');
    // a tile Cut with All Layers while autosaved edits wait: refused, nothing in the brush
    run = await doorEditor();
    run(`editorSelectLayer(rec.layers[0]); editorAllLayers = true; editorSelection = {min: vec2(0, 0), max: vec2(1, 1)};
        rec.pending = {width: 4, height: 4, layers: [map.layers[0].data.slice()], objects: [[]]};`);
    assert.equal(run('editorCut()'), false);
    assert.equal(run('!editorBrush?.objects && map.layers[1].objects.length'), 1);
});

test('a 3D drag held across a level load puts the old level back as it was (D2)', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        const a = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [-20, .5, -20]}]};
        level3DLoad(a); editor3DOpen();
        editor3DChange((list)=> { list[0].pos = [1.5, .5, .5]; }); // a drag's step, its stroke still open
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Sphere', pos: [3, .5, 3]}]});
        return JSON.stringify([a.objects[0].pos, editor3DUndoList.length]);
    })()`));
    assert.deepEqual(result, [[-20, .5, -20], 0]);
});

test('edit3D.setProperty refuses a Color or vector over an object default, and setProperty and setTransform outside'
    + ' change (D3, D4)', async ()=>
{
    const { run } = await engine({}, true);
    run(`level3DAddType('Lamp', class extends EngineObject3D { constructor(pos) { super(pos); } }, {info: {a: 1}});
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Lamp', pos: [0, 0, 0]}]}); editor3DOpen();
        var edit = levelEditor.edit3D;`);
    for (const value of ['rgb(1, 0, 0)', 'vec3(1, 2, 3)', 'vec2(1, 2)'])
        assert.throws(()=> run(`edit.change((list)=> edit.setProperty(list[0], 'info', ${value}))`),
            /Assert failed.*info can not be a (Color|Vector3|Vector2), its default is an object/, value);
    assert.throws(()=> run(`edit.setProperty(edit.objects[0], 'info', {a: 2})`), /inside change/);
    assert.throws(()=> run(`edit.setTransform(edit.objects[0], vec3(1, 2, 3))`), /inside change/);
    run('edit.strokeCancel()');
    assert.equal(run('JSON.stringify(edit.objects[0].properties ?? null)'), 'null', 'nothing written');
});

test('a touch stick held through a resize and let go by a blur goes back to its place (I1)', ()=>
{
    const stage = { width: 400, height: 800 }, listeners = {};
    const { run, context } = loadEngine({ window: { ontouchstart: null } });
    const el = ()=> ({ style: {display: '', cssText: ''}, tagName: 'DIV', closest: ()=> null, setPointerCapture() {},
        addEventListener() {}, appendChild() {}, setAttribute() {}, removeChild() {}, firstChild: null,
        getBoundingClientRect: ()=> ({ left: 0, top: 0, width: stage.width, height: stage.height }) });
    context.document.createElement = el;
    context.document.createElementNS = el;
    context.document.body = { appendChild() {} };
    context.addEventListener = (type, f)=> { listeners[type] = f; };
    run(`(()=>{ const h = headlessMode; headlessMode = false; touchGamepadEnable = true; touchGamepadInit();
        headlessMode = h; touchGamepadBuildSvg = ()=> { touchGamepadSvgEls = { face: [], thumb: [] }; };
        touchGamepadFloating = true; touchGamepadLeftStick = true; })()`);
    run(`touchGamepadPointerDown({ pointerType: 'touch', pointerId: 7, clientX: 80, clientY: 760, preventDefault() {} },
        touchGamepadSideZones[0])`);
    stage.width = 800; stage.height = 400; listeners.resize();
    run('inputClear()'); // as a blur, a hidden page or an editor opening lets go
    const place = run('touchGamepadSideCenter(0, 800, 400).toString()');
    assert.notEqual(place, '( 80.000, 760.000 )', 'not where it was held');
    assert.equal(run('touchGamepadStickStale[0] ? 1 : 0'), 0, 'and no stale mark left');
});

test('an InstancedMesh3D asserts on a count that is not whole (G1)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    assert.throws(()=> run('new InstancedMesh3D(render3D.boxMesh, 2.5)'), /whole number of instances/);
    assert.doesNotThrow(()=> run('new InstancedMesh3D(render3D.boxMesh, 3)'));
});
