import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 9 of 2026-11-13: no debug key, CSG closed whatever the first mesh, a scene the game changed in place kept,
// sprite frames of even length, save data rebuilt from numbers alone, a destroy that throws leaves the rest to go,
// glTF parsed again, Tiled properties that can only be read, editor keys by code, bullets on a face or a corner, the
// touch gamepad turned off over a real pad, the uniform and slider asserts, and the MeshCollider ray walk

test('setDebugKey(\'\') leaves the debug build with no debug key, as the FAQ says, and runs', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); setDebugKey(\'\')');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('engineStep(3)');
    assert.equal(run('keyWasPressed(\'\') || keyIsDown(\'\') || keyWasReleased(\'\')'), false);
});

test('a sprite animation shows each frame for the same number of updates, wherever it starts', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    for (const start of [0, 1, 7, 100])
    {
        run(`engineStep(${start}); var a = new SpriteAnimation(tile(0, 16), 4, .1)`);
        const runs = JSON.parse(run(`(()=> {
            const runs = []; let last = a.frame, length = 0;
            for (let i = 0; i < 120; ++i)
            {
                engineStep();
                ++length;
                if (a.frame !== last) runs.push(length), length = 0, last = a.frame;
            }
            return JSON.stringify(runs);
        })()`));
        // the first frame from where it was made, which may be part way through an update
        assert.deepEqual(runs.slice(1), Array(runs.length - 1).fill(6), 'from ' + start + ': ' + runs);
    }
});

test('CSG is closed when the second mesh shares the first one\'s corners, and when the first has T junctions', ()=>
{
    const { run } = loadEngine();
    const open = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        // edges with no partner going the other way, by place
        const open = (mesh)=>
        {
            const m = new Mesh().combine(mesh).toIndexed(), edges = new Map;
            const key = (p)=> Math.round(p.x * 1e5) + ',' + Math.round(p.y * 1e5) + ',' + Math.round(p.z * 1e5);
            for (let t = 0; t < m.indices.length; t += 3)
            for (let e = 0; e < 3; ++e)
            {
                const a = key(m.points[m.indices[t + e]]), b = key(m.points[m.indices[t + (e + 1) % 3]]);
                a === b || edges.set(a + '|' + b, (edges.get(a + '|' + b) || 0) + 1);
            }
            let n = 0;
            for (const [edge, count] of edges)
            {
                const [a, b] = edge.split('|');
                n += Math.max(0, count - (edges.get(b + '|' + a) || 0));
            }
            return n;
        };
        const bar = buildBox(1).union(buildBox(1), vec3(1, 0, 0));
        const art = [[0, 1, 1, 0, 0], [1, 1, 1, 1, 0], [0, 1, 0, 1, 1], [1, 1, 1, 1, 1]];
        const block = buildExtrude(art, vec2(5, 4), 1);
        JSON.stringify({
            barOnBar: open(bar.union(buildBox(vec3(2, 1, 1)), vec3(.5, 1, 0))),
            farCut: open(block.subtract(buildBox(.5), vec3(20, 0, 0))),
            hole: open(block.subtract(buildSphere(.8, 10, 5, false), vec3(-.5, -.5, 0))),
            farUnion: open(block.union(buildBox(.5), vec3(20, 0, 0)))})`));
    assert.deepEqual(open, {barOnBar: 0, farCut: 0, hole: 0, farUnion: 0});
});

test('the next level keeps a scene color or direction the game changed in place, or set to an equal new one', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            render3D.sunDirection = vec3(0, 1, 0);
            render3D.sunColor = hsl(0, 0, 1);
            level3DLoad({scene: {sunDirection: [1, 1, 0], sunColor: '#ff8000', fog: [1, 2]}, objects: []});
            render3D.sunDirection.x = -1; // a day and night cycle turns the sun in place
            render3D.sunColor = render3D.sunColor.copy(); // the same color, set by the game
            level3DLoad({objects: []});
            JSON.stringify({sun: render3D.sunDirection.x, color: render3D.sunColor.toString(), fog: render3D.fogStart})`));
        assert.equal(result.sun, -1, file);
        assert.equal(result.color, '#ff8000ff', file);
        assert.notEqual(result.fog, 1, file + ': what the block set and nobody changed goes back');
    }
});

test('readSaveData rebuilds a vec2 or Color from its numbers alone, and copies a default nothing was saved for', ()=>
{
    const items = {};
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
    const { run } = loadEngine({ localStorage });
    run('setHeadlessMode(true)');
    const result = JSON.parse(run(`
        localStorage.setItem('game', '{"spawn": {"x": null, "y": 4, "__proto__": {}}, "tint": {"r": 0, "z": 9}}');
        const defaults = {spawn: vec2(1, 2), tint: WHITE, aim: vec2(5), view: new Matrix4};
        const data = readSaveData('game', defaults);
        data.aim.x = 9;
        data.tint.setAlpha?.(.5); // a frozen default would throw
        JSON.stringify({spawn: [data.spawn.x, data.spawn.y], ok: isVector2(data.spawn), add: !!data.spawn.add,
            tint: [data.tint.r, data.tint.g], noZ: data.tint.z === undefined, aim: defaults.aim.x,
            copied: data.view !== defaults.view})`));
    assert.deepEqual(result, {spawn: [1, 4], ok: true, add: true, tint: [0, 1], noZ: true, aim: 5, copied: true});
});

test('a destroy that throws leaves the other objects to go, and the next scene still enters, the error after', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    const result = JSON.parse(run(`
        class Bad extends EngineObject { destroy(i) { super.destroy(i); throw new Error('bad'); } }
        const a = new Bad, b = new EngineObject;
        let first, second, entered = false;
        try { engineObjectsDestroy(); } catch (e) { first = e.message; }
        const c = new Bad;
        try { setScene({enter() { entered = true; }}); } catch (e) { second = e.message; }
        JSON.stringify({first, second, b: b.destroyed, c: c.destroyed, entered, left: engineObjects.length})`));
    assert.deepEqual(result, {first: 'bad', second: 'bad', b: true, c: true, entered: true, left: 0});
});

test('a glTF object parsed again and again is counted afresh each time', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    run(`var gltf = {asset: {version: '2.0'}, accessors: [{count: 300000, type: 'VEC3', componentType: 5126}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]}`);
    for (let i = 0; i < 5; ++i)
        assert.equal(await run(`parseGLTF(gltf).then(()=> 'loaded', (e)=> e.message)`), 'loaded', 'parse ' + i);
});

test('a Tiled property that can only be read is left out with a warning, and the objects after it are made', async ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const warnings = [];
        const { run } = loadEngine({ location: { pathname: '/game/' },
            console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } }, '', file);
        run('setHeadlessMode(true)');
        const made = run(`
            class Door extends EngineObject { get isBroken() { return false; } }
            class Coin extends EngineObject {}
            objectLayersAddType('Door', Door, {});
            objectLayersAddType('Coin', Coin, {});
            objectLayersLoad({width: 4, height: 2, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
                name: 'Objects', objects: [{id: 1, type: 'Door', x: 8, y: 8, properties: [{name: 'isBroken',
                type: 'bool', value: true}, {name: '__proto__', type: 'string', value: 'x'}]},
                {id: 2, type: 'Coin', x: 24, y: 8}]}]}).map((o)=> o.constructor.name + (o instanceof EngineObject)).join()`);
        assert.equal(made, 'Doortrue,Cointrue', file);
        file === 'littlejs.js' && assert.ok(warnings.some((w)=> w.includes('can only be read')), warnings.join('\n'));
    }
});

test('a game key added by its code, as ShiftLeft or Numpad1, works in the 2D editor', async ()=>
{
    const { run, handlers } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`tileLayersLoad({width: 4, height: 2, layers: [{type: 'tilelayer', name: 'ground', width: 4, height: 2,
            data: [0, 0, 0, 0, 1, 1, 1, 1]}]}, undefined, 0, 0);
        var hits = [];
        levelEditor.addKey('ShiftLeft', ()=> hits.push('ShiftLeft'));
        levelEditor.addKey('Numpad1', ()=> hits.push('Numpad1'));
        levelEditor.open()`);
    const key = (k, code)=> handlers.keydown({ key: k, code, repeat: false, altKey: false, ctrlKey: false,
        metaKey: false, shiftKey: k === 'Shift', target: {}, preventDefault() {}, stopPropagation() {} });
    key('Shift', 'ShiftLeft');
    key('1', 'Numpad1');
    assert.equal(run('hits.join()'), 'ShiftLeft,Numpad1');
    run('levelEditor.close()');
});

test('an autosave whose object properties are not objects is not valid, and a layer made in code takes no old key',
    async ()=>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    assert.equal(run(`editorSaveValid({layers: [[0]], objects: [[{x: 0, y: 0, properties: [null]}]]})`), false);
    assert.equal(run(`editorSaveValid({layers: [[0]], objects: [[{x: 0, y: 0, properties: [{name: 'a'}]}]]})`), true);
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    // three layers made in code, the second and third of one size: no key is another's 1.30.1 key
    const keys = JSON.parse(run(`
        for (const size of [10, 20, 20]) new TileLayer(vec2(), vec2(size), tile(0, 16));
        levelEditor.open();
        const records = editorMapList.filter((r)=> r.synthetic);
        JSON.stringify({keys: records.map((r)=> r.key), old: records.map((r)=> r.oldKey)})`));
    assert.equal(keys.keys.length, 3, keys.keys.join());
    for (const key of keys.keys)
        assert.ok(!keys.old.includes(key), key + ' is an old key');
});

test('a bullet that starts exactly on a tile\'s face or in an inner corner is never left inside a tile', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); setGravity(vec2());
        const inside = [];
        // a floor whose top is at y 10 and a wall whose right face is at x 10, the bullet in the corner going into both
        const layer = new TileCollisionLayer(vec2(), vec2(20, 20), tile(), 0, false);
        for (let i = 0; i < 20; ++i) layer.setCollisionData(vec2(i, 9)), layer.setCollisionData(vec2(9, i));
        const b = new EngineObject(vec2(10, 10), vec2(.1));
        b.setCollision(false, false); b.isBullet = true; b.damping = 1; b.restitution = 1;
        b.velocity = vec2(.4, -.4);
        for (let i = 0; i < 6; ++i) engineObjectsUpdate(), inside.push(layer.getCollisionData(b.pos.floor()));
        inside.push(b.pos.x >= 10 && b.pos.y >= 10);
        engineObjectsDestroy();
        // on the face of a one way tile it can not enter going right, a solid tile behind it
        const layer2 = new TileCollisionLayer(vec2(), vec2(20, 20), tile(), 0, false);
        layer2.setCollisionData(vec2(4, 6)), layer2.setData(vec2(4, 6), new TileLayerData(1));
        layer2.setCollisionData(vec2(5, 6)), layer2.setData(vec2(5, 6), new TileLayerData(5));
        layer2.setOneWay(5, vec2(-1, 0));
        const c = new EngineObject(vec2(5, 6.5), vec2(.1));
        c.setCollision(false, false); c.isBullet = true; c.damping = 1; c.restitution = .5;
        c.velocity = vec2(1, 0);
        for (let i = 0; i < 4; ++i) engineObjectsUpdate(), inside.push(layer2.getCollisionData(c.pos.floor()) &&
            c.pos.x < 5 ? 1 : 0);
        JSON.stringify(inside)`));
    assert.deepEqual(result, [0, 0, 0, 0, 0, 0, true, 0, 0, 0, 0]);
});

test('turning the touch gamepad off while a real pad has slot 0 keeps what the pad holds', ()=>
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) };
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [pad] } });
    run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
        touchGamepadOverlay = {style: {display: '', opacity: 0}};
        touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
        setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3);
        touchGamepadTimer.set(); inputUpdate(); touchGamepadRender(); inputUpdatePost()`);
    pad.buttons[0] = { pressed: true, value: 1 };
    run('inputUpdate()');
    assert.equal(run('gamepadIsDown(0)'), true, 'the real pad took over');
    run('setTouchGamepadEnable(false); touchGamepadRender()');
    assert.equal(run('gamepadConnected(0) && gamepadIsDown(0)'), true, 'the same frame');
    run('inputUpdatePost(); inputUpdate()');
    assert.equal(run('gamepadIsDown(0)'), true, 'the next frame');
});

test('a Shader uniform named like the engine\'s own and a slider value past 1 assert', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    for (const name of ['iTime', 'iResolution', 'localUV', 'mainImage', 'cameraPos'])
        assert.throws(()=> run(`new Shader('void mainImage(out vec4 c, vec2 uv) {}', '', {${name}: 1})`),
            /a name of its own/, name);
    run(`new Shader('void mainImage(out vec4 c, vec2 uv) {}', '', {glow: 1, mainColor: RED, item: 2})`);
    assert.throws(()=> run('new UISystemPlugin; new UISlider(vec2(), vec2(100, 20), 50)'), /from 0 to 1/);
});

test('a MeshCollider\'s raycast walking its grid finds what testing every triangle does', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        let seed = 3;
        const rnd = (a=0, b=1)=> { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return a + (b - a) * seed / 0x7fffffff; };
        const mesh = new Mesh().combine(buildGrid(vec2(40), vec2(30), undefined, (x, z)=> Math.sin(x) * Math.cos(z) * 2))
            .combine(buildSphere(4, 12, 8, false), buildMatrix(vec3(3, 2, 1)))
            .combine(buildBox(vec3(1, 30, 1)), buildMatrix(vec3(-5, 0, 5), vec3(.3, .2, 0)));
        const collider = new MeshCollider(mesh, vec3(1, 0, -2));
        meshColliderBake(collider);
        let differ = 0, hits = 0;
        for (let i = 0; i < 400; ++i)
        {
            const origin = vec3(rnd(-30, 30), rnd(-10, 30), rnd(-30, 30));
            // most aimed at the mesh, some straight down, some anywhere
            const direction = i % 7 == 0 ? vec3(0, -1, 0) : i % 5 == 0 ? vec3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) :
                vec3(rnd(-15, 15), rnd(-2, 4), rnd(-15, 15)).subtract(origin);
            const ray = new Ray3D(origin, direction.normalize());
            let best;
            for (let t = 0; t < collider.triangleCount; ++t)
            {
                const d = meshColliderRayTriangle(collider.triangles, t * 9, origin.x, origin.y, origin.z,
                    ray.direction.x, ray.direction.y, ray.direction.z);
                if (d !== undefined && !(d >= best)) best = d;
            }
            const walked = collider.levelRaycast3D(ray);
            best === undefined || ++hits;
            if (best !== walked) ++differ;
        }
        JSON.stringify({differ, hits})`));
    assert.equal(result.differ, 0);
    assert.ok(result.hits > 200, 'hits ' + result.hits);
});
