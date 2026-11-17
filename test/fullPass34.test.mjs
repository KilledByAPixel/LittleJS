import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 34 of 2026-11-17: walking from terrain onto a floor listed before it; 3D cameras that are not driving;
// a lens flare under the level editor; a HeightMap's box after rebuild; a 3D drag across a level load and its
// autosave, setTransform on the level's own object, a change inside a change; a 2D function type's properties; the
// shared default warning when an object keeps a nested default; a 3D class default from a file; a resized autosave's
// object layer; edit2D.setProperty outside changeObjects; a stick's ring after a rotation; a slider after a missed
// release

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a body walking from terrain onto a floor just above it, the floor listed first, stays on the floor (C1, C3)', ()=>
{
    for (const kind of ['hmap', 'meshOnMesh'])
        for (const gap of [.05, .09])
            for (const floorFirst of [true, false])
            {
                const { run } = loadEngine();
                const r = JSON.parse(run(`(()=>
                {
                    setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
                    let terrainShape;
                    const terrain = ()=>
                    {
                        if ('${kind}' === 'meshOnMesh')
                            return terrainShape = new MeshCollider(buildBox(vec3(32, 1, 32)), vec3(0, -.5 - ${gap}, 0));
                        const h = []; for (let j = 0; j <= 16; ++j) { h.push([]); for (let i = 0; i <= 16; ++i) h[j].push(0); }
                        terrainShape = new HeightMap(h, vec2(32, 32), 1, undefined, vec3(0, -${gap}, 0));
                    };
                    const floor = ()=>
                    {
                        if ('${kind}' === 'hmap')
                        {
                            const h = []; for (let j = 0; j <= 8; ++j) { h.push([]); for (let i = 0; i <= 8; ++i) h[j].push(0); }
                            return new HeightMap(h, vec2(8, 16), 1, undefined, vec3(4, 0, 0));
                        }
                        return new MeshCollider(buildBox(vec3(8, 1, 16)), vec3(4, -.5, 0));
                    };
                    ${floorFirst ? 'floor(); terrain();' : 'terrain(); floor();'}
                    const body = new EngineObject3D(vec3(-4, .6 - ${gap}, 0)); body.size3D = vec3(1);
                    body.setCollision(); body.mass = 1;
                    for (let f = 0; f < 30; ++f) { body.velocity3D.x = 0; engineObjectsUpdate(); }
                    let low = Infinity, onTerrain = 0;
                    for (let f = 0; f < 400 && body.pos3D.x < 7; ++f)
                    {
                        body.velocity3D.x = .1; engineObjectsUpdate();
                        if (body.pos3D.x < 1) continue;
                        low = Math.min(low, body.pos3D.y - .5);
                        body.groundObject === terrainShape && ++onTerrain;
                    }
                    return JSON.stringify({low, onTerrain});
                })()`));
                const name = `${kind} ${gap}${floorFirst ? ' floor first' : ''}: ` + JSON.stringify(r);
                assert.ok(r.low > -1e-3, name);
                assert.equal(r.onTerrain, 0, name);
            }
});

test('a CameraControl3D and a FirstPersonCamera3D under a newer camera read no input, and do once it is gone (G1)',
    ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
        let locks = 0; pointerLockRequest = ()=> ++locks;
        const orbit = new CameraControl3D(vec3(), 10, .4), eye = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0);
        const chase = new ThirdPersonCamera3D(vec3(), 6, .3);
        chase.manualControl = false;
        const input = ()=> { mouseWheel = 1; mouseDeltaScreen = vec2(30, 20);
            inputData[0][0] = 3; inputData[0]['KeyW'] = 1; inputData[0]['ArrowUp'] = 1; };
        input(); orbit.update(); eye.update();
        const under = {orbit: [orbit.distance, orbit.yaw, orbit.pitch], eye: [eye.yaw, eye.pitch,
            eye.velocity3D.x, eye.velocity3D.z], locks};
        chase.destroy(); // the first person camera, made after the orbit, drives again
        input(); orbit.update(); eye.update();
        const eyeDriving = {eye: [eye.yaw, eye.pitch], moving: eye.velocity3D.length() > 0, locks};
        eye.destroy(); // and then the orbit
        input(); orbit.update();
        return JSON.stringify({under, eyeDriving, orbit: [orbit.distance, orbit.yaw, orbit.pitch]});
    })()`));
    assert.deepEqual(r.under, {orbit: [10, 0, .4], eye: [0, 0, 0, 0], locks: 0}, 'nothing read under the chase camera');
    assert.ok(r.eyeDriving.eye[0] !== 0 && r.eyeDriving.moving && r.eyeDriving.locks === 1, JSON.stringify(r.eyeDriving));
    assert.ok(r.orbit[0] !== 10 && r.orbit[1] !== 0, 'the orbit reads the wheel and the drag when it drives');
});

test('a lens flare under the level editor follows the camera, judged as it is drawn (G2)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; timeDelta = 1/60; mainCanvasSize = vec2(800, 600);
        render3D.sunDirection = vec3(0, 0, -1); render3D.updateMatrices();
        const flare = new LensFlare3D;
        const blocker = new EngineObject3D(vec3(0, 0, -10), render3D.boxMesh); blocker.scale3D = vec3(4, 4, .2);
        flare.update();
        const before = flare.visible;
        engineFrozenTick = true; // held by an open editor, not paused
        render3D.camera.pos = vec3(10, 0, 0); render3D.updateMatrices();
        const elements = flare.getScreenElements().length;
        engineFrozenTick = false;
        return JSON.stringify({before, elements});
    })()`));
    assert.equal(r.before, 0, 'hidden by the blocker');
    assert.ok(r.elements > 0, 'clear of it once the camera moved, while the editor holds the game');
});

test('a HeightMap given a new size and height keeps its box with it after rebuild (G3)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        const map = new HeightMap([[0, 1], [1, 0]], vec2(10, 10), 2);
        const was = map.size3D.copy();
        map.mapSize = vec2(40, 40); map.height = 8; map.rebuild();
        const near = engineObjectsCollect3D(vec3(19, 0, 19), vec3(1));
        const result = {was: [was.x, was.y, was.z], now: [map.size3D.x, map.size3D.y, map.size3D.z],
            found: near.includes(map)};
        map.destroy();
        return JSON.stringify(result);
    })()`));
    assert.deepEqual(r, {was: [10, 4, 10], now: [40, 16, 40], found: true});
});

test('a 3D drag across a level load leaves the old level and its autosave without the half move (D1)', async ()=>
{
    const store = {};
    const { run } = await engine({localStorage: {getItem: (k)=> store[k] ?? null, setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; }}}, true);
    run(`var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}, {id: 2, type: 'Box',
        pos: [5, .5, 5]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        var edit = levelEditor.edit3D;
        edit.change((list)=> edit.setTransform(list[1], vec3(6, .5, 5))); edit.strokeEnd();
        // a move held, as a drag is, its autosave waiting, as a big level's does, when the game loads another level
        edit.change((list)=> edit.setTransform(list[0], vec3(3, .5, .5)));
        editor3DAutosaveWaiting.add(level);
        engineObjectsDestroy();
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Sphere', pos: [-20, .5, -20]}]});`);
    const level = JSON.parse(run('JSON.stringify(level.objects.map((o)=> o.pos))'));
    assert.deepEqual(level, [[.5, .5, .5], [6, .5, 5]], 'the old level has its ended edit and not the held one');
    const saved = Object.values(store).flatMap((text)=> Object.values(JSON.parse(text)))
        .find((entry)=> entry.objects?.length === 2);
    assert.deepEqual(saved?.objects.map((o)=> o.pos), [[.5, .5, .5], [6, .5, 5]], 'and so has its autosave');
});

test('edit3D asserts on setTransform of the level\'s own object and on a change or place inside a change (D2, D3)',
    async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        edit.selection.add(1);
        const tryIt = (f)=> { try { return f(); } catch (e) { said.push(e.message); } };
        tryIt(()=> edit.change(()=> { for (const o of edit.selected()) edit.setTransform(o, vec3(5, .5, .5)); }));
        edit.strokeEnd();
        let id;
        tryIt(()=> edit.change(()=> { id = edit.place('Sphere', vec3(3, .5, 3)); }));
        edit.strokeEnd();
        // inside change on its own list is still fine
        const moved = edit.change((list)=> edit.setTransform(list[0], vec3(2, .5, .5)));
        edit.strokeEnd();
        return JSON.stringify({said: said.map((s)=> s.replace(/^Assert failed: /, '')), pos: level.objects[0].pos,
            ids: level.objects.map((o)=> o.id), moved, undo: editor3DUndoList.length});
    })()`));
    assert.deepEqual(r.said, ['setTransform works on an object of the list change gives, inside change: push a new one ' +
        'into the list first',
        'change and place can not be called inside change, edit the list it gives instead']);
    assert.deepEqual(r.pos, [2, .5, .5]);
    assert.deepEqual(r.ids, [1], 'nothing placed');
    assert.equal(r.moved, true);
    assert.equal(r.undo, 1, 'only the change on its own list is an undo');
});

test('a 2D function type is called with its properties, and a class still gets them set (O1, O4)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        let start, facing, given;
        class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Start', (pos, properties)=> { start = pos; facing = properties.facing; given = properties; },
            {facing: 1, speed: 2});
        objectLayersAddType('Coin', Coin, {value: 1});
        const list = objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            id: 1, name: 'Objects', objects: [{id: 1, type: 'Start', x: 16, y: 32, point: true,
            properties: [{name: 'facing', type: 'int', value: -1}]}, {id: 2, type: 'Coin', x: 32, y: 16, point: true,
            properties: [{name: 'value', type: 'int', value: 5}]}]}]});
        return JSON.stringify({start: [start.x, start.y], facing, speed: given.speed,
            list: list.map((o)=> o.constructor.name + ' ' + o.value)});
    })()`));
    assert.deepEqual(r, {start: [1, 2], facing: -1, speed: 2, list: ['Coin 5']});
});

test('the shared default warning for an object that keeps a nested default: beside a member set, inside a class with'
    + ' no copy, given of the wrong kind, in 2D and 3D (O2)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Look { hp = 1; copy() {} }
        class Outer { inner = new Look; n = 1; }
        class T extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('T', T, {cfg: {inner: new Look, n: 1}, o: new Outer, look: new Look, own: {inner: new Look}});
        objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 1, type: 'T', x: 0, y: 0, point: true, properties: [
                {name: 'cfg', type: 'class', value: {n: 2}}, {name: 'o', type: 'class', value: {n: 2}},
                {name: 'look', type: 'int', value: 5}, {name: 'own', type: 'class', value: {inner: {hp: 3}}}]}]}]});
        const said2D = warned.filter((t)=> t.includes('share'));
        warned.length = 0;
        level3DAddType('L', class extends EngineObject3D { constructor(pos) { super(pos); } }, {look: new Look});
        level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'L', pos: [0, 0, 0], properties: {look: 5}}]});
        console.warn = warn;
        return JSON.stringify({said2D, said3D: warned.filter((t)=> t.includes('share'))});
    })()`));
    const tail = ' has a copy method that gives back no new object, so the objects that leave it alone share it';
    assert.deepEqual(r.said2D, [`objectLayersLoad: T's default cfg.inner${tail}`,
        `objectLayersLoad: T's default o.inner${tail}`, `objectLayersLoad: T's default look${tail}`],
        'own.inner, which the map sets, is not shared');
    assert.deepEqual(r.said3D, [`level3DLoad: L's default look${tail}`]);
});

test('a 3D class default is merged with the file\'s object and keeps its class; setProperty refuses an instance (O3)',
    async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class Stats { hp = 1; armor = 2; copy() { const s = new Stats; s.hp = this.hp; s.armor = this.armor; return s; }
            total() { return this.hp + this.armor; } }
        level3DAddType('S', class extends EngineObject3D { constructor(pos) { super(pos); } }, {stats: new Stats,
            plain: {a: 1, b: 2}});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'S', pos: [0, 0, 0],
            properties: {stats: {hp: 5}, plain: {a: 3}}}]};
        const [made] = level3DLoad(level);
        const loaded = {stats: made.stats instanceof Stats, total: made.stats.total(), plain: made.plain};
        engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D;
        let refused = '';
        try { edit.change((list)=> edit.setProperty(list[0], 'stats', new Stats)); }
        catch (e) { refused = e.message; }
        const kept = edit.change((list)=> edit.setProperty(list[0], 'stats', {hp: 7, armor: 2}));
        return JSON.stringify({loaded, refused: /an instance of a class/.test(refused), kept,
            saved: level.objects[0].properties.stats});
    })()`));
    assert.deepEqual(r.loaded, {stats: true, total: 7, plain: {a: 3, b: 2}});
    assert.equal(r.refused, true);
    assert.equal(r.kept, true);
    assert.deepEqual(r.saved, {hp: 7, armor: 2});
});

test('a resized autosave with objects applied over a file with no object layer links the editor\'s Objects layer (E1)',
    async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        setDebugKey('');
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 1, nextlayerid: 2,
            orientation: 'orthogonal', layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4,
            data: new Array(16).fill(1)}]};
        editorJSONFetched('levels/door.json', map);
        const loadLevel = ()=> { tileLayersLoad(map, undefined, 0, 'ground'); return objectLayersLoad(map); };
        levelEditor.onRestart = ()=> { engineObjectsDestroy(); loadLevel(); };
        loadLevel(); levelEditor.open();
        const record = editorMapList.find((r)=> r.map === map);
        record.pending = {hash: 1, width: 5, height: 4, layers: [new Array(20).fill(2)],
            objects: [[{id: 1, type: 'Door', point: true, x: 8, y: 8}]], nextobjectid: 2};
        const applied = editorApplyPending(record);
        const layer = editorObjectLayers(record)[0];
        editorSelectLayer(layer);
        levelEditor.edit2D.changeObjects((list)=> list.push({id: 7, type: 'Door', point: true, x: 24, y: 24}));
        editorStrokeEnd();
        return JSON.stringify({applied, linked: !!layer.group, tracked: layer.instances.size,
            groups: JSON.parse(editorMapJSON(record)).layers.filter((l)=> l.type === 'objectgroup')
            .map((l)=> l.name + ':' + l.objects.length)});
    })()`));
    assert.deepEqual(r, {applied: true, linked: true, tracked: 2, groups: ['Objects:2']});
});

test('edit2D.setProperty asserts outside changeObjects and on an object not of its list, and writes inside (E2)',
    async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 56}]}]};
        tileLayersLoad(map, undefined, 0, 'ground'); objectLayersLoad(map); levelEditor.open();
        const record = editorMapList.find((r)=> r.map === map);
        editorSelectLayer(editorObjectLayers(record)[0]);
        const edit = levelEditor.edit2D, said = [];
        const tryIt = (f)=> { try { f(); } catch (e) { said.push(e.message.replace(/^Assert failed: /, '')); } };
        tryIt(()=> edit.setProperty(edit.objects[0], 'hp', 5));
        tryIt(()=> edit.changeObjects(()=> edit.setProperty(edit.objects[0], 'hp', 6)));
        const changed = edit.changeObjects((list)=> edit.setProperty(list[0], 'hp', 7));
        editorStrokeEnd();
        return JSON.stringify({said, changed, properties: map.layers[1].objects[0].properties});
    })()`));
    assert.deepEqual(r.said, Array(2).fill('setProperty works on an object of the list changeObjects gives, inside ' +
        'changeObjects'));
    assert.equal(r.changed, true);
    assert.deepEqual(r.properties, [{name: 'hp', type: 'int', value: 7}]);
});

test('a floating stick held through a rotation and let go has its ring drawn home with its thumb (I1)', ()=>
{
    const style = ()=>
    {
        const s = {display: '', opacity: ''};
        let css = '';
        Object.defineProperty(s, 'cssText', {get: ()=> css, set: (v)=> { css = v; }});
        return s;
    };
    const stage = {width: 400, height: 800}, listeners = {};
    const { run, context } = loadEngine({ window: { ontouchstart: null } });
    const element = ()=> ({style: style(), tagName: 'DIV', closest: ()=> null, setPointerCapture() {},
        addEventListener() {}, appendChild() {}, setAttribute() {}, removeChild() {}, firstChild: null,
        getBoundingClientRect: ()=> ({left: 0, top: 0, width: stage.width, height: stage.height})});
    context.document.createElement = element;
    context.document.createElementNS = element;
    context.document.body = { appendChild() {} };
    context.addEventListener = (type, f)=> { listeners[type] = f; };
    run(`(()=> { const h = headlessMode; headlessMode = false; touchGamepadEnable = true; touchGamepadInit();
        headlessMode = h; globalThis.ring = '';
        touchGamepadBuildSvg = (W, H)=> { globalThis.ring = touchGamepadSideCenter(0, W, H).toString();
            touchGamepadSvgEls = {face: [], thumb: []}; };
        touchGamepadFloating = true; touchGamepadLeftStick = true; touchGamepadDisplayTime = 3; })()`);
    const frame = ()=> JSON.parse(run(`(()=> { if (touchGamepadNeedRelayout) touchGamepadRelayout();
        const r = touchGamepadStageRect(); return JSON.stringify([globalThis.ring,
        touchGamepadSideCenter(0, r.width, r.height).toString()]); })()`));
    run(`touchGamepadPointerDown({pointerType: 'touch', pointerId: 7, clientX: 80, clientY: 760, preventDefault() {}},
        touchGamepadSideZones[0])`);
    frame();
    stage.width = 800, stage.height = 400; listeners.resize();
    frame();
    run('touchGamepadPointerUp({pointerId: 7})');
    const [ring, thumb] = frame();
    assert.equal(ring, thumb);
});

test('a slider held when its release was missed does not follow a new press on a button (P1)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        const button = new UIButton(vec2(0, 100), vec2(200, 50), 'Go');
        const slider = new UISlider(vec2(0, -100), vec2(400, 40), .5);
        const changes = [];
        slider.onChange = ()=> changes.push(+slider.value.toFixed(3));
        engineStep();
        mousePosScreen = slider.nativePos.copy(); inputData[0][0] = 3; engineStep();
        mousePosScreen = slider.nativePos.add(vec2(-100, 0)); inputData[0][0] = 1; engineStep();
        const held = slider.value;
        // its release missed, then a press on the button far to the right
        mousePosScreen = button.nativePos.add(vec2(90, 0));
        inputData[0][0] = 7; engineStep(); inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep();
        return JSON.stringify({held, final: slider.value, changes: changes.length});
    })()`));
    assert.equal(r.final, r.held);
    assert.equal(r.changes, 2, 'the press and the drag, not the button\'s press');
});
