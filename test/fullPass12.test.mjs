import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 12 of 2026-11-14: atlas frames trimmed, turned and many, the game's UI under the 2D editor, a game tool's
// onDraw that throws, an object started inside tiles, a one way tile a snap leaves it in, a plain moving solid and
// its rider, old Tiled properties left in the game's map and typed, lastCell off the map, Ctrl with digits under
// debugKeysAlways, a held map kept past four resizes, the UI behind a dialog and destroyed in a callback, Restart
// with no debug key, a HeightMap with heights outside 0 to 1, setTransform with no angle and glTF Infinity

// an engine with a stub image and canvas, so loadAtlas runs in node; the image is size by size pixels
function atlasEngine(size)
{
    const warnings = [];
    const context = new Proxy({}, { get: (t, k)=> k === 'canvas' ? canvas : typeof k === 'string' ? ()=> ({}) : undefined,
        set: ()=> true });
    const canvas = { width: 0, height: 0, getContext: ()=> context };
    const e = loadEngine({
        console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) },
        Image: class { set src(v) { this.width = this.height = size; Promise.resolve().then(()=> this.onload()); } },
        OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return context; } },
    });
    e.run('glEnable = false; engineInitialized = true;');
    return {...e, warnings};
}
const frame = (x, y, w, h, source, rotated=false)=> ({frame: {x, y, w, h}, rotated, trimmed: true,
    spriteSourceSize: {x: 0, y: 0, w, h}, sourceSize: {w: source, h: source}});

test('loadAtlas keeps a trimmed frame bigger untrimmed than its image, a turned one, and every frame of a big atlas',
    async ()=>
{
    const { run, warnings } = atlasEngine(64);
    const frames = {glow: frame(0, 0, 30, 30, 128), tall: frame(32, 0, 60, 20, 60, true), out: frame(50, 50, 30, 30, 30)};
    run(`var a = loadAtlas('a.png', ${JSON.stringify({frames})})`);
    await run('spritesReady()');
    assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(a).sort())')), ['glow', 'tall']);
    assert.ok(warnings.some((w)=> w.includes('outside the image')), 'the frame past the edge is said');

    // 400 frames of 100 square from a 2048 image, about 12 sheets of 1024: all kept
    const big = atlasEngine(2048), many = {};
    // named apart, not f0 to f399, which would group into one animation of 400 frames, a block of its own
    for (let i = 0; i < 400; ++i) many['f' + i + 'x'] = frame(i % 20 * 100, (i / 20 | 0) * 100, 100, 100, 100);
    big.run(`setTextureSheetSize(1024); var b = loadAtlas('b.png', ${JSON.stringify({frames: many})})`);
    await big.run('spritesReady()');
    assert.equal(big.run('Object.keys(b).length'), 400);
});

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}
const twoLayers = `tileLayersLoad({width: 4, height: 2, layers: [
    {type: 'tilelayer', name: 'back', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]},
    {type: 'tilelayer', name: 'front', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]}]}, undefined, 0, 0);`;

test('the game\'s UI takes no mouse while the 2D level editor is open, and does again after', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        ${twoLayers}
        const button = new UIButton(vec2(0, 0), vec2(4000, 4000), 'x');
        let clicks = 0;
        button.onClick = ()=> ++clicks;
        const click = ()=>
        {
            mousePosScreen = button.nativePos.copy();
            inputData[0][0] = 3; engineStep();
            inputData[0][0] = 4; engineStep();
            inputData[0][0] = 0; engineStep();
        };
        levelEditor.open();
        click();
        const open = clicks;
        levelEditor.close();
        click();
        return JSON.stringify([open, clicks]);
    })()`));
    assert.deepEqual(result, [0, 1]);
});

test('a game tool whose onDraw throws is put down with a word, and the frame goes on', async ()=>
{
    const { run } = await engine2D();
    run(`var errors = [];
        console.error = (...a)=> errors.push(String(a[0]));
        ${twoLayers}
        levelEditor.addTool('Bad', { onDraw() { throw new Error('game bug'); } });
        levelEditor.open();
        levelEditor.tool = 'Bad';`);
    run('editorRenderGame()');
    assert.equal(run('levelEditor.tool'), undefined);
    assert.ok(run(`errors.some((e)=> e.includes('onDraw threw'))`));
    run('levelEditor.close()');
});

test('an object started a hair inside a wall still lands on the floor, passing only the tiles it was in', async ()=>
{
    const { run } = await engine2D();
    const ys = JSON.parse(run(`(()=>
    {
        setGravity(vec2(0, -.02));
        const layer = new TileCollisionLayer(vec2(), vec2(10, 10), tile(), 0, false);
        for (let i = 0; i < 10; ++i) layer.setCollisionData(vec2(i, 0), 1), layer.setCollisionData(vec2(0, i), 1);
        const ys = [];
        for (const into of [0, .0005, .05, .4])
        {
            const o = new EngineObject(vec2(1.5 - into, 3), vec2(1));
            o.setCollision();
            for (let i = 0; i < 120; ++i) engineObjectsUpdate();
            ys.push(+o.pos.y.toFixed(3));
            o.destroy();
        }
        return JSON.stringify(ys);
    })()`));
    assert.deepEqual(ys, [1.5, 1.5, 1.5, 1.5]);
});

test('a box snapped against a wall beside a one way tile is not left inside it', async ()=>
{
    const { run } = await engine2D();
    const into = run(`(()=>
    {
        setGravity(vec2());
        const layer = new TileCollisionLayer(vec2(), vec2(10, 10), tile(), 0, false);
        layer.setCollisionData(vec2(2, 5), 1);       // the wall
        layer.setData(vec2(4, 5), new TileLayerData(3));
        layer.setCollisionData(vec2(4, 5), 1);       // a one way tile it passes going left, one cell from the wall
        layer.setOneWay(3, vec2(-1, 0));
        const o = new EngineObject(vec2(4.6, 5.5), vec2(1));
        o.setCollision();
        o.restitution = 1;
        o.velocity = vec2(-.6, 0);
        // a frame that ends a hair inside the one way tile, less than its margin, where the snap against the wall left
        // it, so the next frame starts stuck in it
        let into = 0;
        for (let i = 0; i < 6; ++i)
        {
            engineObjectsUpdate();
            const overlap = o.pos.x + .5 - 4;
            overlap > 1e-6 && overlap < 1e-3 && ++into;
        }
        return into;
    })()`);
    assert.equal(into, 0);
});

test('a rider of a plain moving solid with no mass sits on it whatever order they update in', async ()=>
{
    const { run } = await engine2D();
    const gaps = JSON.parse(run(`(()=>
    {
        setGravity(vec2(0, -.02));
        const gaps = [];
        for (const riderFirst of [false, true])
        {
            engineObjectsDestroy();
            const make = ()=> { const r = new EngineObject(vec2(0, 1.5), vec2(1)); r.setCollision(); return r; };
            const rider = riderFirst ? make() : undefined;
            const lift = new EngineObject(vec2(), vec2(4, 1));
            lift.setCollision(true, true);
            lift.mass = 0;
            lift.velocity = vec2(0, .05);
            const r = rider ?? make();
            let worst = 0;
            for (let i = 0; i < 60; ++i)
            {
                engineObjectsUpdate();
                worst = Math.max(worst, (lift.pos.y + .5) - (r.pos.y - .5)); // how far the rider sinks into it
            }
            gaps.push(worst < 1e-3);
        }
        return JSON.stringify(gaps);
    })()`));
    assert.deepEqual(gaps, [true, true]);
});

test('a game tool\'s lastCell is cleared by a frame off the map and at each press', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 6, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 6, height: 1,
            data: [0, 0, 0, 0, 0, 0]}]};
        tileLayersLoad(map, undefined, 0, 0);
        var given = [];
        const note = (at)=> given.push([at.cell?.x ?? null, at.lastCell?.x ?? null]);
        levelEditor.addTool('Line', { onPress: note, onDrag: note });
        levelEditor.open(); editorSelectLayer(editorLayers()[0]); levelEditor.tool = 'Line';
        editorMouseOnPanel = false;
        const at = (x)=> mousePosScreen = worldToScreen(vec2(x, .5));
        at(.5); inputData[0][0] = 3; engineStep();
        inputData[0][0] = 1; at(3.5); engineStep();
        at(20.5); engineStep();                      // off the map
        at(5.5); engineStep();                       // back in elsewhere
        inputData[0][0] = 4; engineStep(); inputData[0][0] = 0;
        at(2.5); inputData[0][0] = 3; engineStep();  // a new press
        inputData[0][0] = 4; engineStep(); inputData[0][0] = 0;`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(given)')),
        [[0, null], [3, 0], [null, 3], [5, null], [2, null]]);
    run('levelEditor.tool = undefined; levelEditor.close()');
});

test('Ctrl with 0 does not close the 2D editor, nor Ctrl with a digit flip a debug view, with debugKeysAlways',
    async ()=>
{
    const { run } = await engine2D();
    run(`setDebugKeysAlways(true); ${twoLayers}
        levelEditor.open();
        inputData[0].ControlLeft = 1; inputData[0].Digit0 = 3; engineStep();
        inputData[0].Digit0 = 0; inputData[0].Digit1 = 3; engineStep();
        inputData[0].Digit1 = inputData[0].ControlLeft = 0;`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([levelEditor.isOpen, debugPhysics])')), [true, false]);
    run('levelEditor.close()');
});

test('with no debug key, Restart keeps the editor\'s view, and picks a layer an async onRestart makes', async ()=>
{
    const { run } = await engine2D();
    run(`setDebugKey('');
        var map = {width: 4, height: 2, layers: [{type: 'tilelayer', name: 'a', width: 4, height: 2,
            data: [0, 0, 0, 0, 1, 1, 1, 1]}]};
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = ()=> { engineObjectsDestroy(); Promise.resolve().then(()=> tileLayersLoad(map, undefined, 0, 0)); };
        levelEditor.open();
        editorCameraPos = vec2(3, 1);
        editorRestart();`);
    await run('Promise.resolve()');
    await run('Promise.resolve()');
    const result = JSON.parse(run(`JSON.stringify([levelEditor.isOpen, editorCameraPos.x, editorCameraPos.y,
        !!editorLayer && !editorLayer.live.destroyed])`));
    assert.deepEqual(result, [true, 3, 1, true]);
    run('levelEditor.close()');
});

test('a slider held when a confirm dialog opens lets go, and a button its release destroys gets no leave', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        const s = new UISlider(vec2(0, 0), vec2(400, 40), .5);
        let changes = 0;
        s.onChange = ()=> ++changes;
        engineStep();
        mousePosScreen = s.nativePos.copy();
        inputData[0][0] = 3; engineStep();
        inputData[0][0] = 1; engineStep();
        uiSystem.showConfirmDialog('Quit?');
        engineStep();
        const before = changes;
        mousePosScreen = mousePosScreen.add(vec2(150, 0)); engineStep();
        const behind = changes - before, held = uiSystem.activeObject === s;
        inputData[0][0] = 0; engineStep();
        uiSystem.destroyObjects?.();
        const b = new UIButton(vec2(0, 300), vec2(200, 50), 'x'), log = [];
        b.onRelease = ()=> { log.push('release'); b.destroy(); };
        b.onLeave = ()=> log.push('leave');
        engineStep();
        mousePosScreen = b.nativePos.copy(); engineStep();
        inputData[0][0] = 3; engineStep();
        inputData[0][0] = 4; engineStep();
        inputData[0][0] = 0; engineStep();
        return JSON.stringify({behind, held, log});
    })()`));
    assert.deepEqual(result, {behind: 0, held: false, log: ['release']});
});

test('the 3D editor keeps the voxel map a game holds through five resizes undone', async ()=>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    const result = JSON.parse(run(`(()=>
    {
        const made = level3DLoad({littlejs3D: 1, voxels: {pos: [-2, 0, -2], size: [4, 2, 4], blocks: [32, 1]},
            objects: []});
        const held = made.find((o)=> o instanceof VoxelMap);
        editor3DSetOpen(true);
        for (const s of [[5, 2, 5], [6, 2, 6], [7, 2, 7], [8, 2, 8], [9, 2, 9]])
            editor3DVoxelResize(vec3(...s));
        for (let i = 5; i--;) editor3DUndo();
        const back = [level3DVoxelMap === held, held.destroyed];
        editor3DSetOpen(false);
        return JSON.stringify(back);
    })()`));
    assert.deepEqual(result, [true, false]);
});

test('a HeightMap with heights outside 0 to 1 is hit by a raycast where it rises and dips past them', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    const result = JSON.parse(run(`(()=>
    {
        const map = new HeightMap([[-.5, -.5, -.5], [-.5, 1.5, -.5], [-.5, -.5, -.5]], vec2(4), 2);
        const top = map.raycast(new Ray3D(vec3(0, 10, 0), vec3(0, -1, 0)));
        const low = map.raycast(new Ray3D(vec3(1.9, 10, 1.9), vec3(0, -1, 0)));
        map.destroy();
        return JSON.stringify([top, low]);
    })()`));
    assert.ok(Math.abs(result[0] - 7) < 1e-6, 'the peak at 3, ' + result[0]);
    assert.ok(result[1] > 10 && result[1] < 11.1, 'the dip below 0, ' + result[1]);
});

test('a body walking into a HeightMap or MeshCollider slope steeper than its groundAngle stops, a gentle one it climbs',
    ()=>
{
    const peak = (kind, slope)=>
    {
        const { run } = loadEngine();
        return run(`
            headlessMode = true; new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
            const n = 81, size = 40, rise = Math.tan(${slope} * Math.PI / 180), heights = [];
            for (let j = 0; j < n; ++j)
            {
                const row = [];
                for (let i = 0; i < n; ++i)
                    row.push(Math.min(Math.max((i / (n - 1) - .5) * size, 0) * rise, 6) / 10);
                heights.push(row);
            }
            const map = new HeightMap(heights, vec2(size), 10, undefined, vec3(), false);
            if ('${kind}' === 'MeshCollider')
                new MeshCollider(map.mesh), map.destroy(true);
            const o = new EngineObject3D(vec3(-3, 1, 0), buildBox());
            o.size3D = vec3(1, 2, 1);
            o.setCollision(false, false, true);
            o.mass = 1; o.restitution = 0;
            for (let i = 0; i < 60; ++i) engineObjectsUpdate();
            let peak = 0;
            for (let i = 0; i < 240; ++i)
            {
                o.velocity3D.x = .15; // the MeshCollider short's run speed, into the hill
                engineObjectsUpdate();
                peak = Math.max(peak, o.pos3D.y);
            }
            peak`);
    };
    for (const kind of ['HeightMap', 'MeshCollider'])
    {
        assert.ok(peak(kind, 30) > 6, kind + ' climbs 30 degrees');
        assert.ok(peak(kind, 60) < 2, kind + ' stops at 60 degrees');
        assert.ok(peak(kind, 75) < 2, kind + ' stops at 75 degrees');
    }
});
