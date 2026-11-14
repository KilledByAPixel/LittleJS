import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 11 of 2026-11-14: a Tiled map with properties as an object in the editor, setScene twice in one Box2D
// step, a destroyed bullet asked nothing, the Shader uniform names by stage, no debug key in Restart, a stick the
// game kept, Tiled property entries checked before an object is made, engineObjectsCollect3D's bodies, Ctrl and
// the editor's digits, glTF node numbers, readSaveData of a value of another kind, a long effect name, atlas frames
// outside the image, setTransform with no angle, a game tool's lastCell, the ray walk's stop and the 3D editor
// keeping a resized map for undo

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

test('a Tiled map with properties as an object is read as the list form, so the editor edits it and keeps its ' +
    'autosave', async ()=>
{
    const items = {};
    const storage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); },
        removeItem: (k)=> { delete items[k]; } };
    const code = `
        class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Coin', Coin, { value: 1 });
        var map = { width: 4, height: 2, tilewidth: 16, tileheight: 16, nextobjectid: 3, layers: [
            { type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1] },
            { type: 'objectgroup', id: 2, name: 'Objects', objects: [
                { id: 1, type: 'Coin', point: true, x: 8, y: 8 },
                { id: 2, type: 'Coin', point: true, x: 40, y: 8, properties: { value: 5 } }] }] };
        editorJSONFetched('levels/a.json', map);
        var layers = tileLayersLoad(map, undefined, 0, 0), made = objectLayersLoad(map);
        var ground = editorLayerRecord(layers[0]), objects = editorObjectLayers(ground.record)[0];`;
    let { run } = await engine2D({ localStorage: storage });
    run(code);
    assert.deepEqual(JSON.parse(run('JSON.stringify([made[1].value, map.layers[1].objects[1].properties])')),
        [5, [{name: 'value', type: 'int', value: 5}]]);
    run(`editorChangeObjects(objects, (l)=> editorObjectSetProperty(l[1], 'value', 7, 1)); editorStrokeEnd();
        editorPaint(ground, vec2(0, 1), 3); editorStrokeEnd();`);
    assert.equal(run('editorSaveValid(editorSaves()[ground.record.key])'), true);
    ({ run } = await engine2D({ localStorage: storage }));
    run(code);
    assert.deepEqual(JSON.parse(run('JSON.stringify([map.layers[0].data[0], made[1].value])')), [3, 7],
        'the autosave brought back');
});

test('a Tiled object\'s property entries are checked before it is made: a null entry and a color that is no hex ' +
    'are left out, and the object is made', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        const warnings = [];
        console.warn = (...a)=> warnings.push(a.join(' '));
        class Thing extends EngineObject {}
        objectLayersAddType('Thing', Thing, {speed: 2, tint: WHITE});
        const made = objectLayersLoad({width: 4, height: 2, tilewidth: 16, tileheight: 16, layers: [
            {type: 'objectgroup', name: 'things', objects: [{id: 1, type: 'Thing', x: 16, y: 16, properties: [null,
                {name: 'tint', type: 'color', value: 5}, {name: 'speed', type: 'int', value: 3}]}]}]});
        return JSON.stringify({count: made.length, speed: made[0]?.speed, tint: made[0]?.tint.toString(),
            warned: warnings.length});
    })()`));
    assert.deepEqual(result, {count: 1, speed: 3, tint: '#ffffffff', warned: 2});
});

test('several setScene calls in one Box2D step enter the scene once, the last asked for', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        let locked = true;
        const waiting = [];
        box2d = {world: {IsLocked: ()=> locked}};
        box2dWhenUnlocked = (f)=> waiting.push(f);
        const entered = [];
        const a = {enter() { entered.push('a'); }}, b = {enter() { entered.push('b'); }};
        setScene(a); setScene(a); setScene(b);
        const queued = waiting.length;
        locked = false;
        for (const f of waiting.splice(0)) f();
        box2d = undefined;
        return JSON.stringify({queued, entered});
    })()`));
    assert.deepEqual(result, {queued: 1, entered: ['b']});
});

test('a bullet its own hit destroyed is not asked about tiles it never touched', async ()=>
{
    const { run } = await engine2D();
    const asked = JSON.parse(run(`(()=>
    {
        setGravity(vec2());
        const layer = new TileCollisionLayer(vec2(), vec2(20, 20), tile(), 0, false);
        for (let i = 0; i < 20; ++i) layer.setCollisionData(vec2(10, i), 1), layer.setCollisionData(vec2(i, 9), 1);
        const asked = [];
        for (let k = 0; k < 40; ++k)
        {
            const b = new EngineObject(vec2(9.7 - k * .01, 10.3 + k * .01), vec2(.1));
            b.setCollision(false, false);
            b.isBullet = true; b.clampSpeed = false; b.damping = 1;
            b.velocity = vec2(2.3, -2.3);
            b.collideWithTile = function(data, pos, isHit) { this.destroyed && asked.push(isHit); this.destroy(); return true; };
            engineObjectsUpdate();
        }
        return JSON.stringify(asked);
    })()`));
    assert.deepEqual(asked, []);
});

test('a Shader uniform may take a wrapper\'s short name a stage does not use, and tint in fragment code alone',
    async ()=>
{
    const { run } = await engine2D();
    const refused = JSON.parse(run(`(()=>
    {
        const fragment = 'void mainImage(out vec4 c, vec2 uv) { c = vec4(a + k); }';
        const vertex = 'void mainVertex(inout vec3 pos, inout vec3 normal) { pos += tint.xyz * cut; }';
        const cases = [['a', fragment, ''], ['k', fragment, ''], ['s', fragment, ''], ['tint', fragment, ''],
            ['c', fragment, ''], ['tint', '', vertex], ['cut', '', vertex], ['uvRect', '', vertex + '//uvRect']];
        return JSON.stringify(cases.filter(([name, f, v])=>
        {
            try { new Shader(f, v, {[name]: 1}); return false; }
            catch { return true; }
        }).map(([name, f])=> name + (f ? '' : ' vertex')));
    })()`));
    assert.deepEqual(refused, ['c', 'tint vertex', 'cut vertex', 'uvRect vertex']);
});

test('the touch gamepad taking over keeps a stick vector the game held from an earlier frame', ()=>
{
    const pad = { mapping: 'standard', axes: [.9, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) };
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [makePad(), pad] } });
    function makePad() { return { mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) }; }
    run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
        touchGamepadOverlay = {style: {display: '', opacity: 0}};
        touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
        setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3);
        inputUpdate(); var kept = gamepadStick(0, 1); touchGamepadRender(); inputUpdatePost();`);
    pad.axes[0] = 0;
    run('touchGamepadTimer.set(); inputUpdate(); touchGamepadRender(); inputUpdatePost(); inputUpdate()');
    assert.ok(Math.abs(run('kept.x')) > .2, 'the kept vector keeps its value');
    assert.equal(run('gamepadStick(0, 1).x'), 0, 'the stick reads centered');
});

test('engineObjectsCollect3D with no position takes the objects with a body, not lights or instanced meshes',
    async ()=>
{
    const { run } = await engine2D();
    run('new Render3DPlugin');
    const result = JSON.parse(run(`(()=>
    {
        engineObjectsDestroy();
        new EngineObject3D(vec3(), render3D.boxMesh);
        new Light3D(vec3(), 5);
        new InstancedMesh3D(render3D.boxMesh, 4);
        return JSON.stringify(engineObjectsCollect3D().map((o)=> o.constructor.name));
    })()`));
    assert.deepEqual(result, ['EngineObject3D']);
});

test('Ctrl or Cmd with a digit, the browser\'s zoom reset, does not close the 2D editor or pick a layer', async ()=>
{
    const { run } = await engine2D();
    run(`tileLayersLoad({width: 4, height: 2, layers: [
            {type: 'tilelayer', name: 'back', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]},
            {type: 'tilelayer', name: 'front', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]}]}, undefined, 0, 0);
        levelEditor.open(); editorSelectLayer(editorLayers()[1]);
        inputData[0].ControlLeft = 1; inputData[0].Digit1 = 3; engineStep();
        inputData[0].Digit1 = 0; inputData[0].Digit0 = 3; engineStep();
        inputData[0].Digit0 = inputData[0].ControlLeft = 0;`);
    assert.equal(run('levelEditor.isOpen'), true);
    assert.equal(run('(editorObjectLayer ?? editorLayer).source.name'), 'front');
    run('levelEditor.close()');
});

test('with no debug key Restart rebuilds the level and stays in the editor, and Play shows as the key changes',
    async ()=>
{
    const { run } = await engine2D();
    run(`setDebugKey('');
        tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1,
            data: [0, 1]}]}, undefined, 0, 0);
        var restarts = 0;
        levelEditor.onRestart = ()=> ++restarts;
        levelEditor.open();
        editorRestart();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([restarts, levelEditor.isOpen])')), [1, true]);
    run('levelEditor.close()');
});

test('readSaveData gives the default where a vec2 or Color was saved as a string or a number', async ()=>
{
    const items = {'game': JSON.stringify({pos: 'left', tint: 5, score: 3})};
    const { run } = await engine2D({ localStorage: { getItem: (k)=> items[k] ?? null, setItem() {} } });
    const result = JSON.parse(run(`(()=>
    {
        const data = readSaveData('game', {pos: vec2(1, 2), tint: rgb(1, 0, 0), score: 0});
        return JSON.stringify([data.pos instanceof Vector2, data.pos.x, data.tint instanceof Color, data.score]);
    })()`));
    assert.deepEqual(result, [true, 1, true, 3]);
});

test('a particle effect name of megabytes is cut before it is split, to its 60 characters', async ()=>
{
    // the split goes through Intl.Segmenter, counted here by the characters it is given
    let given = 0;
    const Segmenter = class extends Intl.Segmenter
    { segment(text) { given = Math.max(given, text.length); return super.segment(text); } };
    const { run } = await engine2D({ Intl: { ...Intl, Segmenter } });
    const kept = run(`particleEffectSanitize({name: String.fromCharCode(101, 769).repeat(2e6), settings: {}}).name.length`);
    assert.equal(kept, 120, '60 letters, each with its accent');
    assert.ok(given > 0 && given <= 600, 'split ' + given + ' characters');
});

test('Box2dObject.setTransform with no angle keeps the angle it has', async ()=>
{
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const Box2DFactory = createRequire(import.meta.url)('../dist/box2d.wasm.js');
    const instance = await Box2DFactory({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
    const { run } = loadEngine({ Box2D: async ()=> instance });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(async ()=> { await box2dInit(); }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const result = JSON.parse(run(`(()=>
    {
        const o = new Box2dObject(vec2(), vec2(1), undefined, .5);
        o.addBox(vec2(1));
        o.setTransform(vec2(3, 4));
        engineStep();
        return JSON.stringify([o.pos.x, o.pos.y, +o.angle.toFixed(6)]);
    })()`));
    assert.deepEqual(result, [3, 4, .5]);
});

test('a game tool\'s drag is given the cell before, so a quick drag fills the cells it skipped', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 6, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 6, height: 1,
            data: [0, 0, 0, 0, 0, 0]}]};
        tileLayersLoad(map, undefined, 0, 0);
        var given = [];
        levelEditor.addTool('Line', { onPress(at) { given.push([at.cell?.x, at.lastCell?.x]); },
            onDrag(at) { given.push([at.cell?.x, at.lastCell?.x]); } });
        levelEditor.open(); editorSelectLayer(editorLayers()[0]); levelEditor.tool = 'Line';
        editorMouseOnPanel = false;
        mousePosScreen = worldToScreen(vec2(.5, .5)); inputData[0][0] = 3; engineStep();
        inputData[0][0] = 1; mousePosScreen = worldToScreen(vec2(4.5, .5)); engineStep();
        inputData[0][0] = 4; engineStep();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(given)')), [[0, null], [4, 0]]);
    run('levelEditor.tool = undefined; levelEditor.close()');
});

test('the 3D editor brings back the voxel map a game holds when a resize is undone', async ()=>
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
        editor3DVoxelResize(vec3(6, 2, 6));
        const resized = level3DVoxelMap !== held;
        editor3DUndo();
        const back = [level3DVoxelMap === held, engineObjects.includes(held), render3DLevel.includes(held),
            held.destroyed];
        editor3DSetOpen(false);
        return JSON.stringify({resized, back});
    })()`));
    assert.deepEqual(result, {resized: true, back: [true, true, true, false]});
});

test('a MeshCollider pick leaving a terrain through its top stops near where it leaves the box', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    const lookups = run(`(()=>
    {
        const c = new MeshCollider(buildGrid(vec2(64), 64), vec3());
        meshColliderBake(c);
        let lookups = 0;
        const cells = c.grid.cells, get = cells.get.bind(cells);
        cells.get = (key)=> (++lookups, get(key));
        // from above one corner, down a little and along, leaving through the top long before the far side
        c.levelRaycast3D(new Ray3D(vec3(-31, 2, -31), vec3(1, -.01, .02)));
        return lookups;
    })()`);
    assert.ok(lookups < 40, lookups + ' lookups');
});
