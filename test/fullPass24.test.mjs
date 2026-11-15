import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 24 of 2026-11-15: the 2D palette on grid, padded, columns and listed sheets; glTF with
// KHR_mesh_quantization required; a dialog answered with the mouse; the 3D editor opened during a restart, its Ctrl
// keys by letter; a body squeezed against the level in both orders; a setScene from a destroy during a switch; a
// thenable whose then throws; a sibling destroyed by a child's destroy; the IME composition skip

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));

test('the 2D palette reads a grid sheet to its last row, padded or not, by columns and by a list', async ()=>
{
    const { run } = await engine();
    run(`var image = (w, h)=> Object.assign(Object.create(TextureInfo.prototype), {image: {width: w, height: h},
            size: vec2(w, h)});
        var palette = (tileInfo)=> editorPaletteTiles({live: new TileLayer(vec2(), vec2(4, 3), tileInfo), record: {}})
            .map((t)=> t.tile + '@' + t.tileInfo.pos.x + ',' + t.tileInfo.pos.y).join(' ');`);
    assert.equal(run('palette(new TileInfo(vec2(), vec2(16), image(32, 32), 0))'), '0@0,0 1@16,0 2@0,16 3@16,16');
    assert.equal(run('palette(new TileInfo(vec2(1), vec2(16), image(36, 36), 1))'), '0@1,1 1@19,1 2@1,19 3@19,19');
    assert.equal(run('palette(new TileInfo(vec2(), vec2(16), image(48, 32), 0))'),
        '0@0,0 1@16,0 2@32,0 3@0,16 4@16,16 5@32,16');
    assert.equal(run('palette(new TileInfo(vec2(), vec2(16), image(32, 32), 0, 0, 2))'), '0@0,0 1@16,0 2@0,16 3@16,16');
    run('levelEditor.paletteTiles = [0, 3]');
    assert.equal(run('palette(new TileInfo(vec2(), vec2(16), image(32, 32), 0))'), '0@0,0 3@16,16');
});

test('glTF: KHR_mesh_quantization, which gltfpack requires, loads, and the last bare errors name themselves', async ()=>
{
    const { parseGLTF } = await import('../dist/littlejs.esm.js');
    // one triangle of int16 positions, as gltfpack quantizes them
    const bytes = new Int16Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    const uri = 'data:application/octet-stream;base64,' + Buffer.from(bytes.buffer).toString('base64');
    const file = { asset: { version: '2.0' }, extensionsRequired: ['KHR_mesh_quantization'],
        extensionsUsed: ['KHR_mesh_quantization'], scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ uri, byteLength: 24 }],
        bufferViews: [{ buffer: 0, byteLength: 24, byteStride: 8 }],
        accessors: [{ bufferView: 0, componentType: 5122, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
    const model = await parseGLTF(file);
    assert.equal(model.parts.length, 1);
    await assert.rejects(parseGLTF({ ...file, meshes: [{}] }), /glTF mesh 0 has no primitives/);
    await assert.rejects(parseGLTF({ ...file, animations: [{ channels: [{ sampler: 0, target: { node: 9,
        path: 'translation' } }], samplers: [{ input: 0, output: 0 }] }] }), /animation target node 9 is not in the file/);
});

test('a confirm dialog answered with the mouse gives no keyboard selection back', async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin;
        const log = [];
        const quit = new UIButton(vec2(0, 0), vec2(200, 50), 'Quit');
        quit.navigationIndex = 0;
        quit.onClick = ()=> { log.push('quit'); uiSystem.showConfirmDialog('Quit?', ()=> log.push('yes'),
            ()=> log.push('no')); };
        const clear = ()=> { for (const d of inputData) for (const i in d) d[i] &= 1; };
        const step = ()=> { engineStep(); clear(); };
        step();
        inputData[0].ArrowDown = 3; step(); inputData[0].ArrowDown = 4; step();
        inputData[0].Enter = 3; step(); inputData[0].Enter = 4; step();
        step();
        mousePosScreen = uiSystem.confirmDialog.children[2].nativePos.copy();
        inputData[0][0] = 3; step(); inputData[0][0] = 4; step(); step();
        mousePosScreen = vec2(900, 900); step();
        inputData[0].Space = 3; engineStep();
        return JSON.stringify({log, selected: uiSystem.navigationObject === quit, space: keyWasPressed('Space'),
            dialog: !!uiSystem.confirmDialog});
    })()`));
    assert.deepEqual(result, {log: ['quit', 'no'], selected: false, space: true, dialog: false});
});

test('the 3D editor opened while an async restart waits makes nothing again, and the level is made once', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}, {id: 2, type: 'Box', pos: [5, 0, 0]}]};
        level3DLoad(level);
        let settle;
        levelEditor.onRestart = ()=> { engineObjectsDestroy(); return new Promise((r)=> settle = ()=> { level3DLoad(level);
            r(); }); };
        const boxes = ()=> engineObjects.filter((o)=> o instanceof EngineObject3D && !o.destroyed && o.mesh).length;
        levelEditor.open(); editor3DRestart(); levelEditor.open();
        const during = boxes();
        globalThis.settle3D = settle;
        return JSON.stringify(during);
    })()`));
    assert.equal(result, 0, 'nothing made again while it waits');
    run('settle3D()'); await tick();
    assert.equal(run('engineObjects.filter((o)=> o instanceof EngineObject3D && !o.destroyed && o.mesh).length'), 2);
});

test('the 3D editor\'s Ctrl+Z goes by the letter the key prints: AZERTY\'s Z, on the W position, undoes', async ()=>
{
    const { run, handlers } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} },
        location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]});
        levelEditor.open();
        editor3DSelection.add(1); editor3DSetSelectedTransform('pos', vec3(3, 0, 0)); editor3DStrokeEnd();`);
    const keydown = (key, code)=> handlers.keydown({ type: 'keydown', key, code, ctrlKey: true, metaKey: false,
        shiftKey: false, altKey: false, repeat: false, target: {}, preventDefault() {} });
    keydown('z', 'KeyW'); // AZERTY: the Z key sits where QWERTY has W
    run('inputData[0].ControlLeft = 1; inputData[0].KeyW = 3; engineStep(); inputData[0].KeyW = 0; engineStep();');
    assert.equal(run('editor3DObject(1).pos[0]'), 0, 'undone');
    keydown('w', 'KeyZ'); // and the W key, where QWERTY has Z, does nothing
    run('inputData[0].KeyZ = 3; engineStep(); inputData[0].KeyZ = 0; engineStep(); inputData[0].ControlLeft = 0;');
    assert.equal(run('editor3DRedoList.length'), 1, 'not undone again, nothing to redo taken');
});

test('a body a fixed solid squeezes against the level stays out of it in either list order', ()=>
{
    for (const level of ['mesh', 'voxel'])
    for (const order of ['pusherFirst', 'bodyFirst'])
    {
        const { run } = loadEngine();
        const into = JSON.parse(run(`(()=>
        {
            setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
            if (${JSON.stringify(level)} === 'mesh')
            {
                const floor = new MeshCollider(render3D.boxMesh, vec3(0, -.5, 0)); floor.scale3D = vec3(40, 1, 40);
                const wall = new MeshCollider(render3D.boxMesh, vec3(3.25, 2, 0)); wall.scale3D = vec3(.5, 4, 40);
            }
            else
            {
                const map = new VoxelMap(vec3(-16, -1, -16), vec3(32, 8, 32));
                for (let x = 0; x < 32; ++x) for (let z = 0; z < 32; ++z)
                {
                    map.setVoxel(vec3(x, 0, z), 1);
                    x === 19 && [1, 2, 3, 4].forEach((y)=> map.setVoxel(vec3(x, y, z), 1));
                }
            }
            const mkBody = ()=> { const b = new EngineObject3D(vec3(0, .5, 0)); b.size3D = vec3(1, 1, 1);
                b.setCollision(); b.mass = 1; b.restitution = 0; return b; };
            const mkPusher = ()=> { const p = new EngineObject3D(vec3(-1.5, .6, 0)); p.size3D = vec3(1, 1, 3);
                p.setCollision(); p.mass = 0; return p; };
            let body, pusher;
            ${order === 'pusherFirst' ? 'pusher = mkPusher(); body = mkBody();' : 'body = mkBody(); pusher = mkPusher();'}
            for (let f = 0; f < 20; ++f) engineObjectsUpdate();
            let deepest = 0;
            for (let f = 0; f < 120; ++f)
            {
                pusher.velocity3D = vec3(pusher.pos3D.x > 1.6 ? 0 : .2, 0, 0);
                engineObjectsUpdate();
                deepest = Math.max(deepest, body.pos3D.x + .5 - 3);
            }
            return JSON.stringify(deepest);
        })()`));
        assert.ok(into < .01, level + ' ' + order + ': into the wall ' + into);
    }
});

test('a setScene from a destroy during a switch is dropped, the switch\'s scene wins and enters once', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const log = [];
        const scene = (name)=> ({ enter() { log.push(name + ' enter'); }, leave() { log.push(name + ' leave'); } });
        const gameOver = scene('gameOver'), title = scene('title');
        class Player extends EngineObject
        { destroy() { if (this.destroyed) return; super.destroy(); setScene(gameOver); } }
        const game = { enter() { log.push('game enter'); new Player(vec2(), vec2(1)); }, leave() { log.push('game leave'); } };
        setScene(game); log.length = 0;
        const warn = console.warn; let warned = 0; console.warn = ()=> ++warned;
        setScene(title);
        console.warn = warn;
        return JSON.stringify({log, current: getScene() === title, warned});
    })()`));
    assert.deepEqual(result, {log: ['game leave', 'title enter'], current: true, warned: 1});
});

test('an onRestart thenable whose then throws ends the wait; a child destroying a sibling in its destroy is fine',
    async ()=>
{
    const { run } = await engine();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = ()=> ({ then() { throw new Error('bad then'); } });
        levelEditor.open();
        var threw = false; try { editorRestart(); } catch (e) { threw = true; }`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([threw, !!editorRestartRunning])')), [true, false]);

    const result = JSON.parse(run(`(()=>
    {
        class Gun extends EngineObject
        { destroy(immediate) { if (this.destroyed) return; super.destroy(immediate); this.muzzle?.destroy(immediate); } }
        const player = new EngineObject(vec2(), vec2(1));
        const gun = player.addChild(new Gun(vec2(), vec2(1)));
        const muzzle = player.addChild(new EngineObject(vec2(), vec2(1)));
        const last = player.addChild(new EngineObject(vec2(), vec2(1)));
        gun.muzzle = muzzle;
        player.destroy();
        return JSON.stringify([gun.destroyed, muzzle.destroyed, last.destroyed]);
    })()`));
    assert.deepEqual(result, [true, true, true]);
});

test('a UITextInput takes no IME composition keys', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        new UISystemPlugin;
        const input = new UITextInput(vec2(), vec2(200, 40));
        input.text = 'a';
        const key = (key, extra={})=> input.onKeyDown({key, code: '', repeat: false, preventDefault() {}, ...extra});
        key('n', {isComposing: true}); key('Process', {keyCode: 229}); key('b');
        return JSON.stringify(input.text);
    })()`));
    assert.equal(result, 'ab');
});
