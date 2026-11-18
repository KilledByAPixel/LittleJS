import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 27 of 2026-11-16: a door crushing a body against a wall with a trigger volume around them, and a fast
// door closing on a body near a still wall; the 3D editor's block map and terrain in level3DLoad's list, and Edit
// prefab leaving no dead objects there; a Tiled class property's special and odd members; hsl given degrees; the
// WebGL picture composited at the canvas size when the browser clamped its buffer; UI hit tests and the 3D ray on the
// mouse's pixel; a passthrough tap on the touch gamepad; PathFinder's Infinity cost; a negative UI corner radius; the
// UI on a canvas of no height; a page that starts hidden

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

// a door, mass 0, pushes a body toward a fixed wall at x 3 and stops short of room or with room to spare, every list
// order of wall (w), door (p), body (b) and trigger (t); how far into the wall the body ends and if it went through
function crush({order, wall=.5, bodyX=0, stop, speed=.2, trigger})
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const f = new EngineObject3D(vec3(0, -.5, 0)); f.size3D = vec3(40, 1, 40); f.setCollision(); f.mass = 0;
        const make = {
            w: ()=> { const w = new EngineObject3D(vec3(3 + ${wall} / 2, 2, 0)); w.size3D = vec3(${wall}, 4, 40);
                w.setCollision(); w.mass = 0; return w; },
            b: ()=> { const b = new EngineObject3D(vec3(${bodyX}, .5, 0)); b.size3D = vec3(1, 1, 1); b.setCollision();
                b.mass = 1; b.restitution = 0; return b; },
            p: ()=> { const p = new EngineObject3D(vec3(-1.5, .6, 0)); p.size3D = vec3(1, 1, 3); p.setCollision();
                p.mass = 0; p.gravityScale = 0; return p; },
            // a checkpoint or water volume over the door's side, which lets everything through
            t: ()=> { const t = new EngineObject3D(vec3(-1.7, 1.5, 0)); t.size3D = vec3(8.6, 3, 10);
                ${trigger === 'solid false' ? 't.setCollision(true, false)' : 't.setCollision()'};
                t.mass = 0; t.collideWithObject = ()=> false; return t; },
        };
        const o = {};
        for (const c of '${order}') o[c] = make[c]();
        const body = o.b, door = o.p, stop = ${stop};
        for (let i = 0; i < 20; ++i) engineObjectsUpdate();
        let deepest = 0;
        for (let i = 0; i < 150; ++i)
        {
            door.velocity3D = vec3(door.pos3D.x < stop - 1e-9 ? Math.min(${speed}, stop - door.pos3D.x) : 0, 0, 0);
            engineObjectsUpdate();
            deepest = Math.max(deepest, body.pos3D.x + .5 - 3);
        }
        return JSON.stringify({deepest, into: body.pos3D.x + .5 - 3, through: body.pos3D.x - .5 > 3 + ${wall}});
    })()`));
}

test('a door crushing a body against a wall, a trigger volume around them, leaves it out of the wall in every order',
    ()=>
{
    for (const trigger of ['callback false', 'solid false'])
    for (const wall of [.5, .2])
    for (const order of ['wpbt', 'wbpt', 'pwbt', 'pbwt', 'bwpt', 'bpwt', 'twpb', 'tbpw'])
    {
        // the door's face stops .2 past where the body has room, so it is crushed
        const result = crush({order, wall, stop: 1.7, speed: .05, trigger});
        assert.ok(result.into < 1e-6 && !result.through, `${trigger} wall ${wall} ${order}: ${JSON.stringify(result)}`);
    }
});

test('a block map or terrain the 3D editor makes again takes the old one\'s place in level3DLoad\'s list', async ()=>
{
    for (const edit of ['editor3DVoxelResize(vec3(10, 4, 10))', 'editor3DTerrainRemove(); editor3DTerrainAdd()'])
    {
        const { run } = await engine({}, true);
        run(`var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}],
            voxels: {pos: [-4, 0, -4], size: [8, 4, 8], blocks: [64, 1, 192, 0]},
            terrain: {pos: [0, -1, 0], size: [16, 16], height: 2, heights: [[0, 0, 0], [0, 1, 0], [0, 0, 0]]}};
            var list = level3DLoad(level); engineStep(2); levelEditor.open(); engineStep();
            ${edit};
            levelEditor.close(); engineStep();`);
        const maps = ()=> JSON.parse(run(`JSON.stringify([VoxelMap, HeightMap].map((type)=>
            engineObjects.filter((o)=> !o.destroyed && o instanceof type).length))`));
        assert.equal(run('list.filter((o)=> o.destroyed).length'), 0, edit + ': no dead map in the list');
        run('list.forEach((o)=> o.destroy()); list = level3DLoad(level); engineStep();');
        assert.deepEqual(maps(), [1, 1], edit + ': a game that restarts by its list has one of each');
        run('list.forEach((o)=> o.destroy()); level3DLoad({littlejs3D: 1, objects: []}); engineStep();');
        assert.deepEqual(maps(), [0, 0], edit + ': and none once it unloads by it');
    }
});

test('Edit prefab and Back leave no destroyed copies in level3DLoad\'s list', async ()=>
{
    const { run } = await engine({}, true);
    run(`level3DAddPrefab('Pair', {objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}, {id: 2, type: 'Sphere', pos: [2, 0, 0]}]});
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]},
            {id: 2, type: 'Pair', pos: [0, 0, 6]}]};
        var list = level3DLoad(level); engineStep(2); levelEditor.open(); engineStep();
        for (let i = 0; i < 3; ++i) { editor3DPrefabEnter(2); engineStep(); editor3DPrefabBack(); engineStep(); }`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([list.filter((o)=> o.destroyed).length,
        [...editor3DInstances.values()].filter((o)=> o && !o.destroyed && !list.includes(o)).length, list.length])`)),
        [0, 0, 2]);
});

test('a Tiled class property\'s __proto__, constructor and prototype members are left out, and a method\'s name ' +
    'and a member of another kind are handled', async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Mob extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Mob', Mob, {stats: {hp: 10, inner: {a: 1}}});
        const value = JSON.parse('{"hp": 5, "__proto__": {"polluted": 1}, "constructor": {"prototype": {"bad": 1}},' +
            '"toString": "named", "inner": 3}');
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true, properties: [{name: 'stats',
            type: 'class', propertytype: 'Stats', value}]}]}]};
        const [mob] = objectLayersLoad(map);
        console.warn = warn;
        return JSON.stringify({polluted: ({}).polluted ?? null, bad: ({}).bad ?? null, own: Object.keys(mob.stats).sort(),
            hp: mob.stats.hp, named: mob.stats.toString, inner: mob.stats.inner,
            proto: Object.getPrototypeOf(mob.stats) === Object.prototype, warned: warned.length});
    })()`));
    assert.deepEqual(result, {polluted: null, bad: null, own: ['hp', 'inner', 'toString'], hp: 5,
        named: 'named', inner: {a: 1}, proto: true, warned: 3});
});

// pass 28 K2 took the degree warning out, since an animated hue, hsl(time/9, ...), passes every whole number
test('hsl says nothing of its hue, a whole one past 1 and an animated one alike, the docs carry the 0 to 1 range',
    async ()=>
{
    const { run } = await engine();
    const warned = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        hsl(.5, 1, .5); hsl(1.25, 1, .5); hsl(1, 1, .5);
        const before = warned.length;
        hsl(120, 1, .5); hsl(240, 1, .5);
        console.warn = warn;
        return JSON.stringify([before, warned.length]);
    })()`));
    assert.deepEqual(warned, [0, 0]);
});

test('with the WebGL buffer clamped by the browser, combineCanvases draws it at the canvas\'s size', ()=>
{
    const { run } = loadEngine();
    const drawn = run(`(()=>
    {
        const noop = ()=> {};
        let width = 0, height = 0;
        // a browser that makes a buffer at most 4096 wide
        const buffer = ()=> { const s = Math.min(1, 4096 / width); return [width * s | 0, height * s | 0]; };
        glCanvas = { style: {}, get width() { return width; }, set width(v) { width = v; },
            get height() { return height; }, set height(v) { height = v; } };
        glContext = new Proxy({}, { get: (t, k)=> k === 'drawingBufferWidth' ? buffer()[0] :
            k === 'drawingBufferHeight' ? buffer()[1] : k === 'getUniformLocation' ? ()=> ({}) : noop });
        glShader = {}; glPolyShader = {}; glEnable = true;
        canvasPixelRatio = 3; mainCanvasSize = vec2(1920, 1080);
        glPreRender();
        mainCanvas = { width: 5760, height: 3240 };
        const drawn = [];
        const context = (canvas)=> new Proxy({}, { get: (t, k)=> k === 'drawImage' ? (image, ...a)=>
            image === glCanvas && drawn.push([image.width, image.height, ...a]) : k === 'canvas' ? canvas : noop,
            set: ()=> true });
        workCanvas = { width: 0, height: 0 }; workContext = context(workCanvas); mainContext = context(mainCanvas);
        glFlush = noop;
        combineCanvases();
        return JSON.stringify(drawn);
    })()`);
    assert.deepEqual(JSON.parse(drawn), [[4096, 2304, 0, 0, 5760, 3240]]);
});

test('a UI rect takes the mouse in the pixels it is drawn on, its first and not the one past its last', async ()=>
{
    const { run } = await engine();
    run(`new UISystemPlugin; var button = new UIObject(vec2(50, 50), vec2(20)); engineStep(); mouseInWindow = true;`);
    // mousePosScreen is the pixel's number: a rect 20 wide is drawn on the 20 pixels from its left edge
    const hits = JSON.parse(run(`(()=> { const left = button.nativePos.x - 10, y = Math.floor(button.nativePos.y);
        return JSON.stringify([left - 1, left, left + 19, left + 20].map((x)=>
            (mousePosScreen = vec2(x, y), button.isMouseOverlapping()))); })()`));
    assert.deepEqual(hits, [false, true, true, false]);
});

test('a tap on the touch gamepad with passthrough on leaves the mouse out of the window', ()=>
{
    const { run, handlers, context } = loadEngine({ window: { ontouchstart: null } });
    const zone = { tagName: 'DIV', closest: ()=> null };
    context.zone = zone;
    // the tap is on the left stick, which pass 28 I1 asks for: one beside it, in the zone's box, is the game's
    run('touchGamepadEnable = true; touchGamepadPassthrough = true; touchGamepadSideZones[0] = globalThis.zone;' +
        'touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};' +
        'mouseInWindow = false');
    const touch = { identifier: 3, clientX: 100, clientY: 900, target: zone };
    handlers.touchstart({ type: 'touchstart', touches: [touch], changedTouches: [touch], target: zone,
        cancelable: false, preventDefault() {} });
    assert.equal(run('mouseInWindow'), false);
});

test('a PathFinder getCost of Infinity blocks the cell as isWalkable does', async ()=>
{
    const { PathFinder, vec2 } = await import('../dist/littlejs.esm.js');
    // a wall down x 6 with one gap at y 7: blocked by isWalkable, or by a cost of Infinity, the same path
    const wall = (x, y)=> x === 6 && y !== 7;
    const byWalkable = new PathFinder(vec2(12, 8)), byCost = new PathFinder(vec2(12, 8));
    byWalkable.isWalkable = (x, y)=> !wall(x, y);
    byCost.getCost = (x, y)=> wall(x, y) ? Infinity : 0;
    const path = (finder)=> finder.findPath(vec2(.5), vec2(11.5, .5))?.map((p)=> p.toString(1)).join(' ');
    assert.ok(path(byCost));
    assert.equal(path(byCost), path(byWalkable));
});

test('a negative UI corner radius draws square corners, and nativeHeight with a canvas of no height is not NaN',
    async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        const radii = [], noop = ()=> {};
        uiSystem.uiContext = new Proxy({}, { get: (t, k)=> k === 'roundRect' ? (...a)=>
            { if (a[4] < 0) throw new RangeError('radius is negative'); radii.push(a[4]); } : noop, set: ()=> true });
        uiSystem.drawRect(vec2(50), vec2(20), WHITE, 0, BLACK, -3);
        uiSystem.drawRect(vec2(50), vec2(20), WHITE, 0, BLACK, 4);
        uiSystem.nativeHeight = 720;
        const saved = mainCanvasSize;
        mainCanvasSize = vec2(0, 0);
        const native = uiSystem.screenToNative(vec2(10, 10));
        const button = new UIObject(vec2(50), vec2(20));
        engineStep();
        mainCanvasSize = saved;
        return JSON.stringify({radii, native: [native.x, native.y], pos: [button.nativePos.x, button.nativePos.y].map(isFinite)});
    })()`));
    assert.deepEqual(result.radii, [4], 'the negative one draws a plain rect');
    assert.ok(result.native.every(Number.isFinite), JSON.stringify(result.native));
    assert.deepEqual(result.pos, [true, true]);
});

test('a page that starts hidden starts with its sound paused', ()=>
{
    const suspended = [];
    const { run } = loadEngine({ document: { hidden: true, hasFocus: ()=> true, addEventListener() {} },
        addEventListener() {} });
    run('headlessMode = false');
    const out = run(`(()=>
    {
        audioContext = { state: 'running', suspend: ()=> { globalThis.suspendCalls = (globalThis.suspendCalls || 0) + 1;
            return Promise.resolve(); }, resume: ()=> Promise.resolve() };
        audioInit();
        return globalThis.suspendCalls || 0;
    })()`);
    suspended.push(out);
    assert.deepEqual(suspended, [1]);
});
