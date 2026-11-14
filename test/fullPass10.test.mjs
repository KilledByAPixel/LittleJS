import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 10 of 2026-11-14: the MeshCollider ray walk on a cell border and across a sparse collider, the 3D
// editor keeping the maps a game holds, CSG closed after a combine and after a cut between runs of old edges, the
// Shader uniform names, glTF parsed at once and its animation keys, the touch gamepad and real pads, a key with no
// code, the editors' digit keys by code, a game tool whose release throws, no debug key in the editors, sprite
// frames that do not divide the image, Tiled properties as an object, particle behaviors not known yet, a backward
// loop's first frame and engineObjectsCollect3D with no position; the bullet ones are in bullet.test.mjs

async function engine3D(extra={})
{
    const items = {};
    const storage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); },
        removeItem: (k)=> { delete items[k]; } };
    const e = loadEngine({ localStorage: storage, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return e;
}

test('a MeshCollider pick finds the face on a cell border, a floor at y = 0 and a grid turned into a wall', async ()=>
{
    const { run } = await engine3D();
    const result = JSON.parse(run(`(()=>
    {
        let s = 7;
        const rnd = ()=> (s = (s * 16807) % 2147483647) / 2147483647, r = (a, b)=> a + (b - a) * rnd();
        const brute = (c, ray)=>
        {
            let best;
            const o = ray.origin, d = ray.direction;
            for (let i = 0; i < c.triangleCount; ++i)
            {
                const t = meshColliderRayTriangle(c.triangles, i * 9, o.x, o.y, o.z, d.x, d.y, d.z);
                if (t !== undefined && !(t >= best)) best = t;
            }
            return best;
        };
        const slab = new MeshCollider(buildBox(vec3(40, 1, 40)), vec3(0, -.5, 0));
        const wall = new MeshCollider(buildGrid(vec2(20), 20), vec3());
        wall.rotation3D = vec3(0, 0, PI / 2);
        const differ = {};
        for (const [name, c] of [['slab', slab], ['wall', wall]])
        {
            meshColliderBake(c);
            const g = c.grid;
            differ[name] = 0;
            for (let k = 0; k < 3000; ++k)
            {
                const target = vec3(r(g.min.x, g.max.x), r(g.min.y, g.max.y), r(g.min.z, g.max.z));
                const o = vec3(r(-30, 30), r(-30, 30), r(-30, 30));
                const ray = new Ray3D(o, target.subtract(o));
                c.levelRaycast3D(ray) !== brute(c, ray) && ++differ[name];
            }
        }
        return JSON.stringify(differ);
    })()`));
    assert.deepEqual(result, {slab: 0, wall: 0});
});

test('a ray across a sparse MeshCollider tests its few triangles, not thousands of empty cells', async ()=>
{
    const { run } = await engine3D();
    const result = JSON.parse(run(`(()=>
    {
        const mesh = new Mesh;
        mesh.combine(buildBox(1), buildMatrix(vec3(0, 0, 0)));
        mesh.combine(buildBox(1), buildMatrix(vec3(5000, 0, 0)));
        const c = new MeshCollider(mesh, vec3());
        meshColliderBake(c);
        let lookups = 0;
        const cells = c.grid.cells, get = cells.get.bind(cells);
        cells.get = (key)=> (++lookups, get(key));
        const hit = c.levelRaycast3D(new Ray3D(vec3(-10, .2, .1), vec3(1, 0, 0)));
        return JSON.stringify({hit, lookups});
    })()`));
    assert.ok(Math.abs(result.hit - 9.5) < 1e-9, 'the near box, ' + result.hit);
    assert.equal(result.lookups, 0, 'no cells walked');
});

test('the 3D editor keeps the terrain and voxel map a game holds through Edit prefab, Back and remove then undo',
    async ()=>
{
    const { run } = await engine3D();
    const result = JSON.parse(run(`(()=>
    {
        const heights = Array.from({length: 9}, ()=> Array(9).fill(.2));
        const level = {littlejs3D: 1, terrain: {pos: [0, 0, 0], size: [16, 16], height: 10, heights},
            voxels: {pos: [-4, 0, -4], size: [8, 4, 8], blocks: [256, 0]},
            objects: [{id: 1, type: 'Box', pos: [3, .5, 3]}, {id: 2, type: 'Box', pos: [5, .5, 3]}]};
        const made = level3DLoad(level);
        const terrain = made.find((o)=> o instanceof HeightMap), voxels = made.find((o)=> o instanceof VoxelMap);
        const out = {};
        editor3DSetOpen(true);
        editor3DSelection.add(1); editor3DSelection.add(2);
        editor3DMakePrefab('Pair');
        editor3DPrefabEnter();
        out.inside = [engineObjects.includes(terrain), render3DLevel.includes(terrain), terrain.destroyed,
            engineObjects.includes(voxels), render3DLevel.includes(voxels)];
        editor3DPrefabBack();
        out.back = [level3DTerrainMap === terrain, level3DVoxelMap === voxels, engineObjects.includes(terrain),
            render3DLevel.includes(terrain), render3DLevel.includes(voxels)];
        for (let i = 0; i < 30; ++i) editor3DTerrainSculpt(vec3(), 'raise', 1 / 60);
        editor3DStrokeEnd();
        editor3DVoxelSet(vec3(1, 0, 1), 3); editor3DStrokeEnd();
        out.edits = [terrain.getHeight(0, 0) > 2.5, voxels.getVoxel(vec3(1, 0, 1))];
        editor3DChangePart('terrain', ()=> undefined); editor3DStrokeEnd();
        out.removed = [engineObjects.includes(terrain), render3DLevel.includes(terrain), terrain.destroyed];
        editor3DUndo();
        out.undone = [level3DTerrainMap === terrain, engineObjects.includes(terrain), render3DLevel.includes(terrain),
            terrain.getHeight(0, 0) > 2.5];
        editor3DSetOpen(false);
        return JSON.stringify(out);
    })()`));
    assert.deepEqual(result.inside, [false, false, false, false, false], 'put away while the prefab is open');
    assert.deepEqual(result.back, [true, true, true, true, true], 'the same maps back');
    assert.deepEqual(result.edits, [true, 3], 'edits show in the maps the game holds');
    assert.deepEqual(result.removed, [false, false, false], 'a removed terrain put away, not destroyed');
    assert.deepEqual(result.undone, [true, true, true, true], 'undo brings the same terrain back');
});

test('CSG comes out closed from a CSG result that combine added to, and from a chain that cut between old edges',
    async ()=>
{
    const { run } = await engine3D();
    const open = JSON.parse(run(`(()=>
    {
        const key = (p)=> p.x + ',' + p.y + ',' + p.z;
        const openEdges = (mesh)=>
        {
            const m = new Mesh().combine(mesh).toIndexed(), edges = new Map;
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
        // a CSG result with an extrude, T junctions and all, combined onto it in place, then cut again
        const cut = buildBox(4).subtract(buildBox(1), buildMatrix(vec3(2, 2, 2)));
        cut.combine(buildExtrude([vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, 1)], 2), buildMatrix(vec3(0, 6, 0)));
        const far = cut.subtract(buildBox(1), buildMatrix(vec3(-2, -2, -2)));
        const through = cut.subtract(buildBox(1), buildMatrix(vec3(0, 6, 0)));
        return JSON.stringify([openEdges(far), openEdges(through)]);
    })()`));
    assert.deepEqual(open, [0, 0]);
});

test('a Shader uniform can not take a name the 2D or 3D wrapper has, and can take one of its own', async ()=>
{
    const { run } = await engine3D();
    const refused = JSON.parse(run(`(()=>
    {
        const code = 'void mainImage(out vec4 c, vec2 uv) { c = vec4(1); }';
        const names = ['sunColor', 'worldPos', 'lightDir', 'tex', 'shadow', 'cameraDir', 'm', 'c', 'v', 'm0',
            'tint', 'glow', 'bright', 'drop', 'color'];
        return JSON.stringify(names.filter((name)=>
        {
            try { new Shader(code, '', {[name]: 1}); return false; }
            catch { return true; }
        }));
    })()`));
    assert.deepEqual(refused, ['sunColor', 'worldPos', 'lightDir', 'tex', 'shadow', 'cameraDir', 'm', 'c', 'v', 'm0']);
});

test('one glTF object parsed several times at once gives each parse its own budget for zeros', async ()=>
{
    const { run } = await engine3D({ atob, btoa, Response });
    const results = await run(`(async ()=>
    {
        const bytes = new Uint8Array(48);
        new Uint32Array(bytes.buffer, 0, 3).set([0, 1, 2]);
        new Float32Array(bytes.buffer, 12, 9).set([0,0,0, 1,0,0, 0,1,0]);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        const json = {asset: {version: '2.0'},
            buffers: [{byteLength: 48, uri: 'data:application/octet-stream;base64,' + btoa(binary)}],
            bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 12}, {buffer: 0, byteOffset: 12, byteLength: 36}],
            accessors: [{componentType: 5126, count: 300000, type: 'VEC3', sparse: {count: 3,
                indices: {bufferView: 0, componentType: 5125}, values: {bufferView: 1}}}],
            meshes: [{primitives: [{attributes: {POSITION: 0}}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]};
        const settled = await Promise.allSettled([0, 1, 2, 3].map(()=> parseGLTF(json)));
        return settled.map((s)=> s.status).join();
    })()`);
    assert.equal(results, 'fulfilled,fulfilled,fulfilled,fulfilled');
});

test('a glTF animation whose values do not fit its keys, or with a time that is no number, is a file error',
    async ()=>
{
    const { run } = await engine3D({ atob, btoa, Response });
    const results = await run(`(async ()=>
    {
        const animated = (times, values, interpolation='LINEAR')=>
        {
            const pos = new Float32Array([0,0,0, 1,0,0, 1,1,0]), t = new Float32Array(times);
            const v = new Float32Array(values), bytes = new Uint8Array(pos.byteLength + t.byteLength + v.byteLength);
            bytes.set(new Uint8Array(pos.buffer), 0);
            bytes.set(new Uint8Array(t.buffer), pos.byteLength);
            bytes.set(new Uint8Array(v.buffer), pos.byteLength + t.byteLength);
            let binary = '';
            for (const b of bytes) binary += String.fromCharCode(b);
            return {asset: {version: '2.0'},
                buffers: [{byteLength: bytes.length, uri: 'data:application/octet-stream;base64,' + btoa(binary)}],
                bufferViews: [{buffer: 0, byteOffset: 0, byteLength: pos.byteLength},
                    {buffer: 0, byteOffset: pos.byteLength, byteLength: t.byteLength},
                    {buffer: 0, byteOffset: pos.byteLength + t.byteLength, byteLength: v.byteLength}],
                accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'},
                    {bufferView: 1, componentType: 5126, count: times.length, type: 'SCALAR'},
                    {bufferView: 2, componentType: 5126, count: values.length / 3, type: 'VEC3'}],
                meshes: [{primitives: [{attributes: {POSITION: 0}}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}],
                animations: [{channels: [{sampler: 0, target: {node: 0, path: 'translation'}}],
                    samplers: [{input: 1, output: 2, interpolation}]}]};
        };
        const tryParse = (json)=> parseGLTF(json).then(()=> 'loaded', (error)=> error.message.slice(0, 20));
        return [await tryParse(animated([0, 1, 2], [0,0,0, 1,1,1, 2,2,2])),
            await tryParse(animated([0, 1, 2], [0,0,0, 1,1,1])),
            await tryParse(animated([0, NaN, 2], [0,0,0, 1,1,1, 2,2,2])),
            await tryParse(animated([0, 1], [0,0,0, 1,1,1], 'CUBICSPLINE'))].join('|');
    })()`);
    assert.equal(results, 'loaded|glTF animation 0 has|glTF animation 0 has|glTF animation 0 has');
});

function makePad() { return { mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) }; }
function touchEngine(pads)
{
    const e = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> pads } });
    e.run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
        touchGamepadOverlay = {style: {display: '', opacity: 0}};
        touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
        setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3)`);
    return e;
}
const touchFrame = 'inputUpdate(); touchGamepadRender(); inputUpdatePost()';

test('the touch gamepad turned off between frames keeps what a real gamepad 0 holds', ()=>
{
    const pad0 = makePad(), { run } = touchEngine([pad0]);
    run('touchGamepadTimer.set(); ' + touchFrame);
    run(touchFrame);
    run('setTouchGamepadEnable(false)'); // from a page's button, between frames
    pad0.buttons[0] = { pressed: true, value: 1 };
    for (let i = 0; i < 4; ++i) run(touchFrame);
    run('inputUpdate()');
    assert.equal(run('gamepadIsDown(0)'), true);
});

test('the touch gamepad taking over centers the sticks and dpads of the real gamepads after the first', ()=>
{
    const pad0 = makePad(), pad1 = makePad(), { run } = touchEngine([pad0, pad1]);
    pad1.axes[0] = 1;
    pad1.buttons[14] = { pressed: true, value: 1 };
    run(touchFrame);
    run('inputUpdate()');
    assert.equal(Math.abs(run('gamepadStick(0, 1).x')), 1);
    run('touchGamepadRender(); inputUpdatePost()');
    // let go, so it does not take over again, then player 1 touches the screen
    pad1.axes[0] = 0;
    pad1.buttons[14] = { pressed: false, value: 0 };
    run('touchGamepadTimer.set()');
    for (let i = 0; i < 3; ++i) run(touchFrame);
    run('inputUpdate()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([gamepadStick(0, 1).x, gamepadDpad(1).x])')), [0, 0]);
});

test('a key event with no code, as an Android soft keyboard sends, is no key', async ()=>
{
    const { run, handlers } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const e = { key: 'Unidentified', code: '', repeat: false, altKey: false, ctrlKey: false, metaKey: false,
        shiftKey: false, target: {}, cancelable: false, preventDefault() {}, stopPropagation() {} };
    handlers.keydown(e);
    assert.equal(run(`keyWasPressed('') || keyIsDown('') || keyDirection('', '', '', 'ArrowRight').x !== 0`), false);
    handlers.keyup(e);
    assert.equal(run(`keyWasReleased('')`), false);
});

async function editor2D()
{
    const e = loadEngine({ location: { pathname: '/game/' } });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    e.run(`var map = {width: 4, height: 2, layers: [
        {type: 'tilelayer', name: 'back', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]},
        {type: 'tilelayer', name: 'front', width: 4, height: 2, data: [0, 0, 0, 0, 1, 1, 1, 1]}]};
        tileLayersLoad(map, undefined, 0, 0);`);
    return e;
}

test('a game key added by its code, Digit1, is the game\'s alone, and Digit0 is refused as 0 is', async ()=>
{
    const { run, handlers } = await editor2D();
    run(`var hits = [], warnings = [];
        console.warn = (...a)=> warnings.push(a.join(' '));
        levelEditor.addKey('Digit1', ()=> hits.push('Digit1'));
        levelEditor.addKey('Digit0', ()=> hits.push('Digit0'));
        levelEditor.addKey('KeyE', ()=> hits.push('KeyE'));
        levelEditor.open();
        editorSelectLayer(editorLayers()[1]);`);
    const press = (key, code)=>
    {
        const e = { key, code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
            target: {}, cancelable: false, preventDefault() {}, stopPropagation() {} };
        handlers.keydown(e);
        run('engineStep()');
        handlers.keyup(e);
        run('engineStep()');
    };
    press('1', 'Digit1');
    assert.equal(run('hits.join()'), 'Digit1');
    assert.equal(run('(editorObjectLayer ?? editorLayer).source.name'), 'front', 'the layer did not change');
    assert.ok(run(`warnings.some((w)=> w.includes('Digit0 is not taken'))`));
    assert.ok(run(`warnings.some((w)=> w.includes('KeyE is a key of the editor'))`), 'KeyE clashes with E');
    run('levelEditor.close()');
});

test('a game tool whose release throws is let go once, its stroke one undo', async ()=>
{
    const { run } = await editor2D();
    run(`var releases = 0;
        levelEditor.addTool('Dots', { onPress: ()=> { levelEditor.edit2D.paint(vec2(0, 0), 3); },
            onRelease: ()=> { ++releases; throw new Error('game bug'); } });
        levelEditor.open();
        editorSelectLayer(editorLayers()[0]);
        levelEditor.tool = 'Dots';
        mousePosScreen = worldToScreen(vec2(.5, .5)); editorMouseOnPanel = false;`);
    const step = ()=>
    {
        try { run('engineStep()'); return 'ok'; }
        catch (error) { return error.message; }
        finally { run('for (const device of inputData) for (const i in device) device[i] &= 1;'); }
    };
    run('inputData[0][0] = 3'); step();
    run('inputData[0][0] = 4');
    assert.equal(step(), 'game bug');
    assert.deepEqual([step(), step()], ['ok', 'ok']);
    assert.deepEqual(JSON.parse(run('JSON.stringify([releases, editorToolHeld, !!editorStroke, editorUndoList.length])')),
        [1, false, false, 1]);
    run('levelEditor.tool = undefined; levelEditor.close()');
});

test('a code layer\'s file remembered under its 1.30.1 key moves to its own key, so a dead one is forgotten', async ()=>
{
    const { run } = await editor2D();
    const result = await run(`(async ()=>
    {
        const store = new Map;
        editorFileStore = { get: async (key)=> store.get(key), set: async (key, handle)=>
            void (handle ? store.set(key, handle) : store.delete(key)) };
        const handle = { queryPermission: async ()=> 'granted' };
        const record = { key: 'code layer 4x2 #1', oldKey: 'old key' };
        await editorFileStore.set(editorFileKey({key: 'old key'}), handle);
        const found = await editorRememberedFile(record);
        return [found === handle, store.has(editorFileKey(record)), store.has(editorFileKey({key: 'old key'}))].join();
    })()`);
    assert.equal(result, 'true,true,false');
});

test('with no debug key the editors\' help leaves out playing, and another key is named in place of Esc', async ()=>
{
    const { run } = await editor2D();
    assert.equal(run(`editorKeyText('1-9: layer · Esc: play and edit · 0: exit the editor')`),
        '1-9: layer · Esc: play and edit · 0: exit the editor');
    run(`setDebugKey('Backquote')`);
    assert.equal(run(`editorKeyText('Esc or right click: put it back')`), 'Backquote or right click: put it back');
    run(`setDebugKey('')`);
    assert.equal(run(`editorKeyText('1-9: layer · Esc: play and edit · 0: exit the editor')`),
        '1-9: layer · 0: exit the editor');
    assert.equal(run(`editorKeyText('Left drag a selection: move it · Esc or right click: put it back')`),
        'Left drag a selection: move it · Right click: put it back');
});

test('a sprite whose frames do not divide the image packs its whole frames in both builds', ()=>
{
    for (const file of [undefined, 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const columns = run(`
            setHeadlessMode(true);
            const sheet = new TextureSheet(256);
            sheet.tryAdd(vec2(50, 16), vec2(16), 0).columns`);
        assert.equal(columns, 3, file ?? 'littlejs.js');
    }
});

test('Tiled object properties written as an object, by an older Tiled, are said and the object made', async ()=>
{
    const { run } = await editor2D();
    const result = JSON.parse(run(`(()=>
    {
        const warnings = [];
        console.warn = (...a)=> warnings.push(a.join(' '));
        class Thing extends EngineObject {}
        objectLayersAddType('Thing', Thing, {speed: 2});
        const made = objectLayersLoad({width: 4, height: 2, tilewidth: 16, tileheight: 16, layers: [
            {type: 'objectgroup', name: 'things', objects: [{id: 1, type: 'Thing', x: 16, y: 16, width: 16,
                height: 16, properties: {speed: 5}}]}]});
        return JSON.stringify({count: made.length, speed: made[0]?.speed,
            warned: warnings.some((w)=> w.includes('not a list'))});
    })()`));
    assert.deepEqual(result, {count: 1, speed: 2, warned: true});
});

test('particle behaviors not known yet are kept once each, a few dozen at most, and clamped when they are added',
    async ()=>
{
    const { run } = await editor2D();
    const result = JSON.parse(run(`(()=>
    {
        const behaviors = [];
        for (let i = 0; i < 1000; ++i)
            behaviors.push({name: 'later' + (i % 500), strength: 9});
        const effect = particleEffectSanitize({name: 'e', settings: {}, behaviors});
        let given;
        particleEffectsAddBehavior('later0', (p, strength)=> given = strength, undefined, -1, 1);
        particleEffectUpdateCallback(effect.behaviors, false)({});
        return JSON.stringify({kept: effect.behaviors.length, given});
    })()`));
    assert.deepEqual(result, {kept: 64, given: 1});
});

test('a looping sprite animation played backward shows its first frame as long as the others', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    let first;
    for (const mode of ['loop', 'pingPong'])
    for (const speed of [1, -1])
    {
        const runs = JSON.parse(run(`(()=>
        {
            const a = new SpriteAnimation(tile(0, 16), 4, .1);
            a.${mode}();
            a.speed = ${speed};
            const runs = [];
            let last = a.frame, length = 0;
            for (let i = 0; i < 60; ++i)
            {
                engineStep();
                ++length;
                if (a.frame !== last) runs.push(length), length = 0, last = a.frame;
            }
            return JSON.stringify(runs);
        })()`));
        // the first from where it was made, part way through an update, about as long backward as forward, where
        // backward showed it for one update
        speed > 0 ? first = runs[0] : assert.ok(Math.abs(runs[0] - first) <= 1, mode + ': ' + runs);
        assert.equal(runs[1], 6);
    }
});

test('engineObjectsCollect3D with no position is every 3D object, and with no size a point', async ()=>
{
    const { run } = await engine3D();
    const result = JSON.parse(run(`(()=>
    {
        engineObjectsDestroy();
        const a = new EngineObject3D(vec3(), render3D.boxMesh), b = new EngineObject3D(vec3(5, 0, 0), render3D.boxMesh);
        new EngineObject(vec2());
        return JSON.stringify([engineObjectsCollect3D().length, engineObjectsCollect3D(vec3(5, 0, 0)).length]);
    })()`));
    assert.deepEqual(result, [2, 1]);
});

test('Apply and Drop of a waiting 3D autosave put the scene back as it was saved and as the file has it', async ()=>
{
    const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 0));
    const game = async (storage)=>
    {
        const e = loadEngine({ localStorage: storage, location: { pathname: '/game/' } });
        e.run('setHeadlessMode(true)');
        await e.run(`setEngineManualStep(true);
            engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
        e.run(`render3D.sunColor = hsl(.1, .5, .8);
            loadCubeMap = (urls)=> Promise.resolve({name: urls[0], dispose() {}});
            var urls = (n)=> [n, 'b', 'c', 'd', 'e', 'f'];
            var scene = ()=> render3D.sunColor.toString() + ' ' + render3D.skyBox?.name;`);
        return e;
    };
    const file = {littlejs3D: 1, scene: {skyBox: ['A', 'b', 'c', 'd', 'e', 'f']},
        objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]};
    const changed = {...file, objects: [{id: 1, type: 'Box', pos: [9, .5, 0]}]};
    const load = (level)=> `var level = JSON.parse(${JSON.stringify(JSON.stringify(level))});
        editorJSONFetched('levels/a.json', level); level3DLoad(level);`;
    for (const choice of ['Apply', 'Drop'])
    {
        const items = {};
        const storage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); },
            removeItem: (k)=> { delete items[k]; } };
        let { run } = await game(storage);
        run(load(file)); await tick();
        const fromFile = run('scene()');
        run(`editor3DSetOpen(true);
            editor3DChangeScene((s)=> ({...s, sunColor: '#ff0000', skyBox: urls('B')})); editor3DStrokeEnd();
            editor3DSetOpen(false); editor3DAutosaveFlush();`);
        await tick();
        const edited = run('scene()');
        assert.notEqual(edited, fromFile);

        // the file changed under the autosave: it waits, the file's scene showing, until Apply or Drop
        ({ run } = await game(storage));
        run(load(changed)); await tick();
        assert.equal(run('!!editor3DRecords.get(level).pending'), true);
        assert.equal(run('scene()'), fromFile, 'the scene of the file while it waits');
        run(`editor3DSetOpen(true); editor3D${choice}Pending()`); await tick();
        assert.equal(run('!!editor3DRecords.get(level).pending'), false);
        if (choice === 'Apply')
        {
            assert.equal(run('scene()'), edited, 'the saved edits applied');
            run('editor3DUndo()'); await tick();
            assert.equal(run('scene()'), fromFile, 'undo takes them back');
        }
        else
            assert.equal(run('scene()'), fromFile, 'the file as it is');
        run('editor3DSetOpen(false)');
    }
});
