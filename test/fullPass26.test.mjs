import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 26 of 2026-11-16: glTF materials with a normal or emissive map and no color texture; PathFinder's getCost
// returning nothing; the 3D editor's objects in level3DLoad's list, a room unloaded by it and a file fetched again;
// the free camera's lock; a game's Ctrl key on QWERTZ; a Tiled class property merged; mousePos with canvasFixedSize;
// an effect's behaviors from its emitter

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a glTF material with a normal or emissive map and no base color texture draws its color, not the map', async ()=>
{
    const { parseGLTF } = await import('../dist/littlejs.esm.js');
    const bytes = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const data = new Uint8Array([...new Uint8Array(bytes.buffer), ...new Uint8Array(uvs.buffer)]);
    const uri = 'data:application/octet-stream;base64,' + Buffer.from(data).toString('base64');
    const file = (material)=> ({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
        materials: [material], textures: [{}], buffers: [{ uri, byteLength: data.length }],
        bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }] });
    for (const material of [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, normalTexture: { index: 0 } },
        { emissiveTexture: { index: 0 }, emissiveFactor: [1, 1, 1] }])
    {
        const model = await parseGLTF(file(material));
        assert.equal(model.parts[0].tileInfo, undefined, JSON.stringify(material));
    }
});

test('a PathFinder getCost that returns nothing for plain ground is a cost of 0', async ()=>
{
    const { PathFinder, vec2 } = await import('../dist/littlejs.esm.js');
    const make = (cost)=> { const finder = new PathFinder(vec2(12, 8)); finder.getCost = cost; return finder; };
    const mud = (x, y)=> x === 6 && y < 4;
    const plain = make((x, y)=> { if (mud(x, y)) return 3; }), zero = make((x, y)=> mud(x, y) ? 3 : 0);
    const path = (finder)=> finder.findPath(vec2(.5), vec2(11.5, 7.5))?.map((p)=> p.toString(1)).join(' ');
    assert.equal(path(plain), path(zero));
    assert.ok(plain.getNearestClearNode(vec2(0, 0)));
});

test('the 3D editor\'s objects are in level3DLoad\'s list: a room unloaded by it, or its file fetched again, takes ' +
    'them', async ()=>
{
    const { run } = await engine({}, true);
    const xs = ()=> JSON.parse(run(`JSON.stringify(engineObjects.filter((o)=> !o.destroyed && o.mesh)
        .map((o)=> o.pos3D.x).sort((a, b)=> a - b))`));
    run(`var roomA = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]};
        var roomB = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [100, 0, 0]}]};
        var listA = level3DLoad(roomA); engineStep(2); levelEditor.open(); engineStep();
        editor3DChange((list)=> { list[0].properties = {color: '#ff0000'}; }); editor3DStrokeEnd();
        levelEditor.edit3D.place('Box', vec3(5, 0, 0)); editor3DStrokeEnd();
        levelEditor.close(); engineStep();
        var listB = level3DLoad(roomB); engineStep();`);
    assert.deepEqual(xs(), [0, 5, 100]);
    run('listA.forEach((o)=> o.destroy()); engineStep();');
    assert.deepEqual(xs(), [100], 'room A unloaded by its list takes the editor\'s objects');
    run(`listB.forEach((o)=> o.destroy()); listA = level3DLoad(JSON.parse(JSON.stringify(roomA))); engineStep();`);
    assert.deepEqual(xs(), [0, 5], 'the file fetched again, a new object, makes it once');
});

test('leaving the free camera while playing, its lock let go a frame later, does not open the editor', async ()=>
{
    for (const delay of [0, 1, 2])
    {
        const { run } = await engine({}, true);
        run(`setDebugKeysAlways(true); level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]});
            engineStep(2); levelEditor.open();`);
        const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
        run('editor3DSetOpen(false)'); step(); step();
        run('editor3DSetFreeCamera(true); document.pointerLockElement = mainCanvas'); step(); step();
        run('editor3DSetFreeCamera(false)');
        for (let i = 0; i < delay; ++i) step();
        run('document.pointerLockElement = undefined'); step(); step();
        assert.equal(run('editor3DIsOpen'), false, delay + ' frames late');
    }
});

test('on QWERTZ a game\'s own Ctrl+Z leaves the key printed Z undoing in the 3D editor', async ()=>
{
    const { run, handlers } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} },
        location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]}); levelEditor.open();
        editor3DSelection.add(1); editor3DSetSelectedTransform('pos', vec3(3, 0, 0)); editor3DStrokeEnd();
        var gameKey = 0; levelEditor.addKey('ctrl+z', ()=> ++gameKey);`);
    // QWERTZ: the key that prints z sits where QWERTY has Y
    handlers.keydown({ type: 'keydown', key: 'z', code: 'KeyY', ctrlKey: true, metaKey: false, shiftKey: false,
        altKey: false, repeat: false, target: {}, preventDefault() {} });
    run(`inputData[0].ControlLeft = 1; inputData[0].KeyY = 3; engineStep(); inputData[0].KeyY = 0;
        inputData[0].ControlLeft = 0; engineStep();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([gameKey, editor3DObject(1).pos[0]])')), [0, 0]);
});

test('a Tiled class property is merged over the type\'s default member by member', async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        class Mob extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Mob', Mob, {stats: {hp: 10, speed: 2}});
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup', id: 1,
            name: 'Objects', objects: [{id: 1, type: 'Mob', x: 16, y: 16, point: true, properties: [{name: 'stats',
            type: 'class', propertytype: 'Stats', value: {hp: 5}}]}]}]};
        const [mob] = objectLayersLoad(map);
        return JSON.stringify(mob.stats);
    })()`));
    assert.deepEqual(result, {hp: 5, speed: 2});
});

test('with canvasFixedSize scaled up, the mouse at the canvas middle reads cameraPos', ()=>
{
    const { run, handlers } = loadEngine();
    run(`mainCanvasSize = vec2(320, 180);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280,
            height: 720 }) };
        cameraPos = vec2(10, 5); cameraScale = 16;`);
    handlers.mousemove({ x: 640, y: 360, movementX: 0, movementY: 0, target: {} });
    run('inputUpdate()');
    const p = run('mousePos');
    assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y - 5) < 1e-9, p.x + ', ' + p.y);
});

test('particleEffectFromEmitter keeps the effect\'s behaviors', async ()=>
{
    const { run } = await engine();
    const behaviors = JSON.parse(run(`(()=>
    {
        const emitter = particleEffect('portal', vec2());
        const effect = particleEffectFromEmitter(emitter);
        emitter.destroy(true);
        return JSON.stringify(effect.behaviors.map((b)=> b.name));
    })()`));
    assert.ok(behaviors.length > 0, JSON.stringify(behaviors));
});
