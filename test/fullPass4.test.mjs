import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// full pass 4 before 1.30: the fixes a headless test can hold

// a standard gamepad, its buttons set by the test
const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0})) };

test('a gamepad button held while the page is not focused stays down in a debug build, which still reads pads', () =>
{
    const { run } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    run('screenToWorld = screenToWorldDelta = (v)=> v; document.hasFocus = ()=> false;');
    pad.buttons[0].pressed = true;
    const down = [];
    for (let i = 0; i < 4; ++i)
    {
        run('inputUpdate()');
        down.push(run('gamepadIsDown(0, 0)'));
        run('inputUpdatePost()');
    }
    pad.buttons[0].pressed = false;
    assert.deepEqual(down, [true, true, true, true]);
});

test('a 3D level property whose default is null takes an object or a list from the file', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`var got; level3DAddType('Thing', (pos, p)=> { got = p; }, {target: null, path: null});
        level3DLoad({objects: [{id: 1, type: 'Thing', pos: [0, 0, 0], properties: {target: {a: 1}, path: [1, 2]}}]});`);
    assert.equal(run('JSON.stringify([got.target, got.path])'), '[{"a":1},[1,2]]');
});

async function load3D()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}

test('a prefab of prefabs that fans out makes at most LEVEL3D_PREFAB_PARTS parts for one instance', async () =>
{
    const { run } = await load3D();
    // ten of the next, seven deep: ten million parts uncapped
    const made = run(`console.error = ()=> {}; let made = 0;
        level3DAddType('Leaf', ()=> { ++made; });
        level3DAddPrefab('P0', {objects: Array.from({length: 10}, (_, i)=> ({id: i + 1, type: 'Leaf'}))});
        for (let d = 1; d < 7; ++d)
            level3DAddPrefab('P' + d, {objects: Array.from({length: 10}, (_, i)=> ({id: i + 1, type: 'P' + (d - 1)}))});
        level3DLoad({objects: [{id: 1, type: 'P6', pos: [0, 0, 0]}]});
        made`);
    assert.ok(made <= 1e4 && made > 1e3, String(made));
});

test('a saved tweak not of the tweak\'s type is dropped, not applied', () =>
{
    const storage = { items: {}, getItem(k) { return this.items[k] ?? null; }, setItem(k, v) { this.items[k] = String(v); } };
    storage.items['LittleJS tweaks /game/'] = JSON.stringify({ speed: { value: 'abc', code: 2 },
        tint: { value: 'red', code: [1, 1, 1, 1] }, at: { value: null, code: [0, 0] } });
    const { run } = loadEngine({ localStorage: storage, location: { pathname: '/game/' } });
    const values = run(`var speed = 2, tint = rgb(1, 1, 1), at = vec2(); tweak('speed'); tweak('tint'); tweak('at');
        [typeof speed, tint.r, at.x]`);
    assert.deepEqual([...values], ['number', 1, 0]);
});

test('medalsReset reads a save key like constructor as no medal', () =>
{
    const storage = { items: { m: JSON.stringify({ constructor: { unlocked: true }, 1: { unlocked: true } }) },
        getItem(k) { return this.items[k] ?? null; }, setItem(k, v) { this.items[k] = String(v); } };
    const { run } = loadEngine({ localStorage: storage }, '', 'littlejs.release.js');
    run(`new Medal(1, 'one'); medalsInit('m'); medalsReset();`);
    assert.equal(JSON.parse(storage.items.m).constructor.unlocked, false);
});

test('a plugin made twice adds its hooks once', async () =>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const before = run('pluginList.length');
    run('new UISystemPlugin; new UISystemPlugin; new PostProcessPlugin; new PostProcessPlugin;');
    assert.equal(run('pluginList.length'), before + 2);
});

test('destroying every object while paused lets the solid lists go too', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const lengths = run(`for (let i = 0; i < 10; ++i) new EngineObject(vec2(i * 3, 0)).setCollision();
        engineStep(); setPaused(true); engineObjectsDestroy();
        [engineObjects.length, engineObjectsCollide.length, engineObjectsCollideStaticLast.length]`);
    assert.deepEqual([...lengths], [0, 0, 0]);
});

test('a never ending timer is at 0, and an infinite shake stays a number', () =>
{
    const { run } = loadEngine();
    const values = run(`const t = new Timer(Infinity); cameraShake(Infinity, vec2(0, 1));
        [t.getPercent(), cameraShakeAxes.x, cameraShakeAxes.y]`);
    assert.deepEqual([...values], [0, 0, 1]);
});

test('a Shader uniform set to the value it has does not flush the batch or count as a change', () =>
{
    const { run } = loadEngine();
    const counts = run(`const shader = new Shader('void mainImage(out vec4 c, vec2 uv) { c = vec4(1.); }', '', {glow: 1, tint: vec2(1, 2)});
        const version = shader.uniformsVersion;
        shader.setUniform('glow', 1); shader.setUniform('tint', vec2(1, 2)); const same = shader.uniformsVersion;
        shader.setUniform('tint', vec2(1, 3));
        [same - version, shader.uniformsVersion - version]`);
    assert.deepEqual([...counts], [0, 1]);
});

test('an editor autosave of the wrong shape is read as broken, a good one as good', () =>
{
    const { run } = loadEngine();
    const valid = run(`[
        editorSaveValid({hash: 1, width: 2, height: 1, layers: [[0, 3]], objects: [[{id: 1}]], nextobjectid: 2}),
        editorSaveValid({layers: [[0, 1]]}),
        editorSaveValid({layers: [[0, 1]], objects: [[null]]}),
        editorSaveValid({layers: [[0, 1]], objects: {}}),
        editorSaveValid({layers: [[0, 1]], objects: [5]}),
        editorSaveValid({layers: [[0, 1]], width: '3'}),
        editorSaveValid({layers: [['a']]}),
        editorSaveValid(null)]`);
    assert.deepEqual([...valid], [true, true, false, false, false, false, false, false]);
});

test('of the editor autosaves with no file, only the 8 newest are kept, and a file\'s own all stay', () =>
{
    const { run } = loadEngine();
    const keys = run(`const saves = {'levels/a.json': {}};
        for (let i = 0; i < 12; ++i) editorSavesKeep(saves, '2x1 ground #' + i, {i});
        editorSavesKeep(saves, '2x1 ground #5', {i: 5}); // written again, it is the newest
        editorSavesKeep(saves, 'level #77', {});
        Object.keys(saves)`);
    assert.deepEqual([...keys], ['levels/a.json', '2x1 ground #6', '2x1 ground #7', '2x1 ground #8', '2x1 ground #9',
        '2x1 ground #10', '2x1 ground #11', '2x1 ground #5', 'level #77']);
});
