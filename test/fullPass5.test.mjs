import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// fixes from full pass 5 (2026-11-12)

test('a fast object stops at a thin wall that is turned, as at an upright one (X1)', () =>
{
    for (const turn of [0, .01, .3])
    for (const sphere of [false, true])
    {
        const { run } = loadEngine();
        run(`setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3();
            var wall = new EngineObject3D(vec3(5, 0, 0)); wall.size3D = vec3(.1, 10, 10);
            wall.rotation3D = vec3(0, ${turn}, 0); wall.setCollision(); wall.mass = 0;
            var mover = new EngineObject3D(vec3(0, 0, 0)); mover.size3D = vec3(.5);
            mover.collideAsSphere3D = ${sphere}; mover.setCollision(); mover.mass = 1;
            for (let i = 0; i < 40; ++i) { mover.velocity3D = vec3(.5, 0, 0); engineObjectsUpdate(); }`);
        // on the near side of the wall, measured across it, as it slides along a turned one
        const side = run('mover.pos3D.subtract(wall.pos3D).dot(boxAxes3D(wall.rotation3D)[0])');
        assert.ok(side < 0, `turned ${turn}, sphere ${sphere}: ${side} across the wall`);
    }
});

test('each layer a game makes in code remembers a save file of its own (E1)', async () =>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const keys = run(`var one = new TileLayer(vec2(), vec2(4, 2)), two = new TileLayer(vec2(), vec2(4, 2));
        [editorFileKey(editorLayerRecord(one).record), editorFileKey(editorLayerRecord(two).record)]`);
    assert.notEqual(keys[0], keys[1]);
    assert.ok(!keys.some((key)=> key.includes('undefined')), keys.join());
});

test('a gamepad button held through inputClear gives no release when let go, as a key does (I1)', () =>
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: [{ pressed: true, value: 1 }] };
    const { run } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    run('inputUpdate(); inputUpdate()');
    assert.equal(run('gamepadIsDown(0)'), true);
    run('inputClear(); inputUpdate()');
    assert.equal(run('gamepadIsDown(0)'), false, 'up until let go');
    pad.buttons[0] = { pressed: false, value: 0 };
    run('inputUpdate()');
    assert.equal(run('gamepadWasReleased(0)'), false, 'no release it never saw pressed');
    pad.buttons[0] = { pressed: true, value: 1 };
    run('inputUpdate()');
    assert.equal(run('gamepadWasPressed(0)'), true, 'a new press reads');
    pad.buttons[0] = { pressed: false, value: 0 };
    run('inputUpdate()');
    assert.equal(run('gamepadWasReleased(0)'), true, 'and its release');
});

test('a level\'s own prefabs are no longer types once a level without them loads (G1, G2)', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new Render3DPlugin;
        var hut = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]};
        level3DLoad({littlejs3D: 1, prefabs: {Hut: hut, constructor: hut}, objects: []});`);
    assert.equal(run(`level3DTypes.has('Hut') && level3DTypes.has('constructor')`), true);
    run(`level3DLoad({littlejs3D: 1, prefabs: {Shed: hut}, objects: []})`);
    assert.equal(run(`level3DTypes.has('Hut')`), false, 'the last level\'s prefab is gone');
    assert.equal(run(`level3DTypes.has('constructor')`), false, 'one named like an object member too');
    assert.equal(run(`level3DTypes.has('Shed')`), true);
    run(`level3DAddPrefab('Tower', hut); level3DLoad({littlejs3D: 1, objects: []})`);
    assert.equal(run(`level3DTypes.has('Tower')`), true, 'the game\'s own prefabs stay');
});

test('the source files load one script at a time, in the order the example pages list them (C1)', async () =>
{
    // un-commenting a page's source list loads each file as a script of its own, where a function is only there once
    // its file has run, so a file that uses another as it loads has to come after it
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    for (const page of ['examples/starter/index.html', 'examples/shorts/base.html'])
    {
        const html = readFileSync(page, 'utf8');
        const list = html.slice(html.indexOf('<!-- LittleJS Engine Source'));
        const files = [...list.slice(0, list.indexOf('-->')).matchAll(/src=\.\.\/\.\.\/((?:src|plugins)\/\w+\.js)/g)]
            .map((m)=> m[1]);
        assert.ok(files.length > 20, page + ' lists the files');
        const context = vm.createContext({ console, performance, setTimeout, clearTimeout, Promise, Map, Set, WeakMap,
            WeakSet, Float32Array, Uint8Array, Math, JSON, URL, window: {}, navigator: {}, localStorage: {},
            document: { addEventListener() {} }, addEventListener() {},
            AudioContext: class { createGain() { return { connect() {}, gain: {} }; } } });
        for (const file of files)
            assert.doesNotThrow(()=> vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file }),
                `${page}: ${file}`);
    }
});

test('debugShowErrors runs where there is no window, and formatTime does not wrap (C3, B2)', () =>
{
    const { run } = loadEngine();
    assert.doesNotThrow(()=> run('debugShowErrors()'));
    assert.equal(run('typeof onerror'), 'function');
    assert.equal(run('formatTime(3e9)'), '50000000:00');
    assert.equal(run('formatTime(-61.5)'), '-1:01');
});
