import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 14 of 2026-11-14: atlas sheets counted whole, trimmed frames kept in their cells, bad entries left out;
// a tool switched mid press, huge 3D ids; touches the game did not see start, a page slider's focus, a pinch in one
// frame, a dialog under the editor, a Ctrl wheel notch; an edit during an async Restart, Reset while an autosave
// waits, layers of one name, hidden layers; the game held still under the editor; a player beside a crate stack;
// HeightMap pits and a MeshCollider V

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

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

test('loadAtlas counts the sheets it makes, so cells a hair over half a sheet can not make hundreds', async ()=>
{
    const { run } = atlasEngine(64);
    const frames = {};
    for (let i = 0; i < 200; ++i) frames['f' + i + 'x'] = {frame: {x: 0, y: 0, w: 1, h: 1}, sourceSize: {w: 1025, h: 1025}};
    run(`var a = loadAtlas('a.png', ${JSON.stringify({frames})})`);
    await run('spritesReady()');
    assert.ok(run('textureSheets.length') <= 10, 'sheets ' + run('textureSheets.length'));
});

test('parseAtlas leaves out entries with no frame rect or name and keeps the rest, sizes whole, offsets inside',
    async ()=>
{
    const { run, warnings } = atlasEngine(64);
    const groups = JSON.parse(run(`JSON.stringify(parseAtlas({frames: [
        {filename: 'a', frame: {x: 0, y: 0, w: 8, h: 8}, sourceSize: {w: 6.9, h: 8}},
        {filename: 'b'}, null, {frame: {x: 0, y: 0, w: 8, h: 8}},
        {filename: 7, frame: {x: 8, y: 0, w: 8, h: 8}}]}).map((g)=> [g.name, g.frames[0].sourceSize.x]))`));
    assert.deepEqual(groups, [['a', 7], ['7', 8]]);
    assert.ok(warnings.some((w)=> w.includes('no frame rect or name')));
    // a trimmed part past its untrimmed size is left out of loadAtlas
    run(`var b = loadAtlas('b.png', {frames: {over: {frame: {x: 0, y: 0, w: 8, h: 8}, spriteSourceSize: {x: 4, y: 0},
        sourceSize: {w: 8, h: 8}}, fine: {frame: {x: 8, y: 0, w: 8, h: 8}}}})`);
    await run('spritesReady()');
    assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(b))')), ['fine']);
});

test('a tap that started on a panel, which kept its touchstart, is not cancelled at its end', ()=>
{
    const { handlers } = loadEngine({ window: { ontouchstart: null } });
    let prevented = false;
    const target = { tagName: 'CANVAS', closest: ()=> null };
    handlers.touchend({ type: 'touchend', touches: [], changedTouches: [{ identifier: 7, clientX: 900, clientY: 100,
        target }], target, cancelable: true, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
});

test('a UI text field keeps its edit while a page slider has the focus, and ends it for a page text field', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        const field = new UITextInput(vec2(0, 0), vec2(200, 40));
        uiSystem.keyInputObject = field;
        const key = (target)=> uiSystem._onKeyDown({key: 'a', type: 'keydown', target, stopPropagation() {},
            preventDefault() {}});
        key({tagName: 'INPUT', type: 'range'});
        const kept = uiSystem.keyInputObject === field;
        key({tagName: 'INPUT', type: 'text'});
        return JSON.stringify([kept, uiSystem.keyInputObject === undefined]);
    })()`));
    assert.deepEqual(result, [true, true]);
});

test('the confirm dialog takes no exit key while a level editor is open, and a Ctrl wheel notch is at most 1',
    async ()=>
{
    const { run, handlers } = await engine2D();
    const answered = run(`(()=>
    {
        new UISystemPlugin;
        tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1,
            data: [0, 1]}]}, undefined, 0, 0);
        let no = 0;
        uiSystem.showConfirmDialog('Quit?', ()=> {}, ()=> ++no);
        engineStep();
        levelEditor.open();
        inputData[0].Escape = 3; engineStep(); inputData[0].Escape = 0;
        levelEditor.close();
        return no;
    })()`);
    assert.equal(answered, 0);
    run('touchPinch = mouseWheel = 0');
    handlers.wheel({ deltaY: 100, deltaMode: 0, ctrlKey: true, target: {}, cancelable: false, preventDefault() {} });
    assert.equal(run('mouseWheel'), 1);
});

test('a game tool switched by the game mid press ends the first one\'s stroke, and the new one waits for a press',
    async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        tileLayersLoad({width: 4, height: 2, layers: [{type: 'tilelayer', name: 'a', width: 4, height: 2,
            data: [0, 0, 0, 0, 1, 1, 1, 1]}]}, undefined, 0, 0);
        const calls = [];
        levelEditor.addTool('A', { onPress: ()=> (calls.push('A press'), levelEditor.edit2D.paint(vec2(0, 0), 3)) });
        levelEditor.addTool('B', { onDrag: ()=> calls.push('B drag'), onRelease: ()=> calls.push('B release') });
        levelEditor.open(); editorSelectLayer(editorLayers()[0]); levelEditor.tool = 'A';
        editorMouseOnPanel = false;
        mousePosScreen = worldToScreen(vec2(.5, .5)); inputData[0][0] = 3; engineStep();
        inputData[0][0] = 1; levelEditor.tool = 'B'; engineStep();
        inputData[0][0] = 4; engineStep(); inputData[0][0] = 0;
        const result = {calls, undo: editorUndoList.length, stroke: !!editorStroke};
        levelEditor.tool = undefined; levelEditor.close();
        return JSON.stringify(result);
    })()`));
    assert.deepEqual(result, {calls: ['A press'], undo: 1, stroke: false});
});

test('a 3D level object id too big to add one to is given a new one', async ()=>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const ids = JSON.parse(run(`(()=>
    {
        const objects = [{id: 2 ** 53, type: 'Box'}, {id: 2 ** 53 + 1, type: 'Box'}, {id: 3, type: 'Box'}];
        editor3DFixIds(objects);
        return JSON.stringify(objects.map((o)=> o.id));
    })()`));
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids.every((id)=> id < 2 ** 31), ids.join());
});

test('a paint while an async onRestart makes the resized layers lands in the cell painted', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 3, height: 2, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'front', width: 3, height: 2, data: [0, 0, 0, 0, 0, 0]}]};
        var layers = tileLayersLoad(map, undefined, 0, 0), front = editorLayerRecord(layers[0]), restartWait;
        levelEditor.onRestart = async ()=>
        {
            await new Promise((r)=> restartWait = r);
            engineObjectsDestroy(); layers = tileLayersLoad(map, undefined, 0, 0);
        };
        levelEditor.open(); editorLayer = front;
        editorResize(front.record, 4, 3);
        levelEditor.edit2D.paint(vec2(0, 0), 4); editorStrokeEnd();`);
    // the bottom left cell of a 4 by 3 map is index 8, Tiled's rows from the top
    const data = JSON.parse(run('JSON.stringify(map.layers[0].data)'));
    assert.equal(data.indexOf(5), 8);
    run('restartWait(); levelEditor.close()');
});

test('Reset to file while autosaved edits wait leaves them waiting', async ()=>
{
    const { run } = await engine2D();
    const pending = run(`(()=>
    {
        const map = {width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1, data: [0, 1]}]};
        tileLayersLoad(map, undefined, 0, 0);
        const record = editorMapList.find((r)=> r.map === map);
        record.pending = {layers: [[1, 1]]};
        editorRevert(record);
        return !!record.pending;
    })()`);
    assert.equal(pending, true);
});

test('the 2D editor opens on a visible layer, not a hidden collision layer, and layers of one name are not picked by it',
    async ()=>
{
    const { run } = await engine2D();
    const picked = run(`(()=>
    {
        tileLayersLoad({width: 2, height: 1, layers: [
            {type: 'tilelayer', name: 'art', width: 2, height: 1, data: [1, 1]},
            {type: 'tilelayer', name: 'solid', width: 2, height: 1, data: [1, 1], visible: false}]}, undefined, 0, 1);
        levelEditor.open();
        const name = editorLayer.source.name;
        levelEditor.close();
        return name;
    })()`);
    assert.equal(picked, 'art');
});

test('a game that unpauses itself under the 2D editor still does not move', async ()=>
{
    const { run } = await engine2D();
    const moved = run(`(()=>
    {
        tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1,
            data: [0, 1]}]}, undefined, 0, 0);
        const o = new EngineObject(vec2(3, 3));
        o.velocity = vec2(.1, 0);
        levelEditor.open();
        setPaused(false); // as a pause key in gameUpdatePost would
        const x = o.pos.x;
        engineStep(10);
        const moved = o.pos.x - x;
        levelEditor.close();
        return moved;
    })()`);
    assert.equal(moved, 0);
});

test('a player on a crate walking into a crate stack in front of a wall is stopped by it', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        setGravity(vec2(0, -.02));
        const layer = new TileCollisionLayer(vec2(0, 0), vec2(20, 10), tile(), 0, false);
        for (let x = 0; x < 20; ++x) layer.setCollisionData(vec2(x, 0), 1);
        for (let y = 0; y < 10; ++y) layer.setCollisionData(vec2(7, y), 1);
        const crate = (x, y)=> { const c = new EngineObject(vec2(x, y), vec2(1)); c.setCollision(); return c; };
        const A = crate(5.5, 1.5001), C1 = crate(6.5, 1.5001), C2 = crate(6.5, 2.5003);
        const P = new EngineObject(vec2(5.5, 2.4002), vec2(.6, .8)); P.setCollision();
        let inside = 0;
        for (let f = 0; f < 90; ++f)
        {
            P.velocity.x = .05;
            engineObjectsUpdate();
            isOverlapping(P.pos, P.size, C2.pos, vec2(.98)) && ++inside;
        }
        return JSON.stringify({inside, left: P.pos.x < C2.pos.x});
    })()`));
    assert.deepEqual(result, {inside: 0, left: true});
});

test('a body on a HeightMap with a one cell pit or a post never ends under the ground', ()=>
{
    const { run } = loadEngine();
    const deepest = run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        let deepest = 0;
        for (const height of [-.3, .3])
        {
            const heights = [];
            for (let j = 0; j < 21; ++j)
            {
                const row = [];
                for (let i = 0; i < 21; ++i) row.push(i === 10 && j === 10 ? .5 + height : .5);
                heights.push(row);
            }
            const map = new HeightMap(heights, vec2(20), 4, undefined, vec3(), false);
            for (const speed of [.1, .3])
            {
                const o = new EngineObject3D(vec3(-4, 3, 0), buildBox());
                o.size3D = vec3(.6, 1.6, .6); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
                for (let i = 0; i < 120; ++i)
                {
                    o.velocity3D.x = speed;
                    engineObjectsUpdate();
                    abs(o.pos3D.x) < 9 && // over the map, past its edge it falls as it should
                        (deepest = Math.max(deepest, map.getHeight(o.pos3D.x, o.pos3D.z) - (o.pos3D.y - .8)));
                }
                o.destroy();
            }
            map.destroy();
        }
        return deepest;
    })()`);
    assert.ok(deepest < .05, 'deepest ' + deepest);
});

test('a body held in a MeshCollider V of steep faces stands there, so a jump takes it out', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const heights = [];
        for (let j = 0; j < 81; ++j)
        {
            const row = [];
            for (let i = 0; i < 81; ++i) row.push(Math.min(Math.abs((i / 80 - .5) * 40) * Math.tan(60 * PI / 180), 15) / 20);
            heights.push(row);
        }
        const map = new HeightMap(heights, vec2(40), 20, undefined, vec3(), false);
        const level = new MeshCollider(map.mesh); map.destroy(true);
        const o = new EngineObject3D(vec3(0, 8, 0), buildBox());
        o.size3D = vec3(1, 2, 1); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
        let grounded = false;
        for (let i = 0; i < 240; ++i) { engineObjectsUpdate(); grounded ||= o.groundObject === level; }
        return JSON.stringify({grounded, y: o.pos3D.y > -1});
    })()`));
    assert.deepEqual(result, {grounded: true, y: true});
});
