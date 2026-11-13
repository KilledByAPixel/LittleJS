import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 8 of 2026-11-13: a level's scene block puts back only what it set and the game has not changed since, a
// Tiled property goes through a setter of the game's class, the page pause is listened for with sound off, CSG cuts
// do not grow the mesh, and tweens check their ease and options

test('a level puts back only the scene settings its block set and the game has not changed since', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            render3D.fogEnd = 20;
            level3DLoad({scene: {fog: [1, 2], sky: ['#ff0000', '#00ff00', '#0000ff'], shadows: true}, objects: []});
            // the game changes the sky and the fog end in code while the level runs, a day and night say
            render3D.setSky(hsl(.6, .5, .5), hsl(.6, .5, .8));
            const gameSky = render3D.sky;
            render3D.fogEnd = 50;
            level3DLoad({objects: []});
            const kept = [render3D.sky === gameSky, render3D.fogEnd, render3D.fogStart, render3D.shadows];
            // a second load with no block leaves it all as it is
            level3DLoad({objects: []});
            const again = [render3D.sky === gameSky, render3D.fogEnd];
            JSON.stringify({kept, again, fogStartBefore: 0})`));
        assert.deepEqual(result.kept.slice(0, 2), [true, 50], file + ': what the game set since stays');
        assert.equal(result.kept[3], false, file + ': what the block set and nobody changed goes back');
        assert.deepEqual(result.again, [true, 50], file);
    }
});

test('a Tiled property goes through a setter of the game\'s class, and the setter keeps working after', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`
        const calls = [];
        class Door extends EngineObject
        {
            set locked(value) { calls.push(value); this._locked = value; }
            get locked() { return this._locked; }
        }
        let door;
        objectLayersAddType('Door', (pos)=> door = new Door(pos), {locked: false});
        objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            objects: [{id: 1, type: 'Door', x: 0, y: 0, properties: [{name: 'locked', type: 'bool', value: true}]}]}]});
        door.locked = false;
        JSON.stringify({calls, own: Object.getOwnPropertyDescriptor(door, 'locked') !== undefined})`));
    assert.deepEqual(result.calls, [true, false]);
    assert.equal(result.own, false, 'no own property hides the accessor');
});

test('the page pause is listened for when sound starts off, so turning it on later pauses on a hidden page', ()=>
{
    const listened = [];
    const document = { hidden: false, addEventListener: (name)=> listened.push(name), hasFocus: ()=> true };
    const { run } = loadEngine({ document, addEventListener: (name)=> listened.push(name) });
    run('setSoundEnable(false); audioInit()');
    assert.ok(['visibilitychange', 'blur', 'focus'].every((name)=> listened.includes(name)), listened.join());
});

test('a chain of CSG cuts does not grow the mesh past what the cuts make, and a cut that misses it adds nothing', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        let seed = 9;
        const rnd = (a=0, b=1)=> { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return a + (b - a) * seed / 0x7fffffff; };
        const tris = (m)=> m.indices.length / 3, farSphere = buildSphere(.5, 10, 5, false);
        let drilled = buildBox(vec3(2)), far = [];
        for (let k = 0; k < 14; ++k)
        {
            drilled = drilled.subtract(buildSphere(rnd(.3, .8), 10, 5, false),
                buildMatrix(vec3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))));
            far.push(tris(drilled.subtract(farSphere, buildMatrix(vec3(10)))) - tris(drilled));
        }
        JSON.stringify({triangles: tris(drilled), far, closed: render3DMeshIsClosed(drilled)})`));
    assert.ok(result.triangles < 30000, 'triangles ' + result.triangles);
    assert.deepEqual(result.far, Array(14).fill(0), 'a far cut gives the mesh back as it was');
    assert.equal(result.closed, true);
});

test('a tween asserts on an ease that is not a curve and on an option it does not have', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    for (const code of [`new Tween(()=> {}, 0, 1, 1, {ease: Ease.OUT})`, `new Tween(()=> {}, 0, 1, 1).setEase(Ease.IN_OUT)`,
        `new Tween(()=> {}, 0, 1, 1).setEase(Ease.POWER)`, `new Tween(()=> {}, 0, 1, 1).setEase('SINE')`])
        assert.throws(()=> run(code), /the ease must be/, code);
    assert.throws(()=> run(`new Tween(()=> {}, 0, 1, 1, {easing: Ease.SINE})`), /did you mean ease/);
    assert.throws(()=> run(`new Tween(()=> {}, 0, 1, 1, {loop: true})`), /loop\(\) is a method/);
    run(`new Tween(()=> {}, 0, 1, 1, {ease: Ease.OUT(Ease.SINE), useRealTime: true}).setEase(Ease.POWER(3))`);
});

// the lows of the same pass

const editorGame = async (with3D)=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true);
        engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return run;
};

test('a held tool of the game\'s is released when the 3D editor closes, and a release that throws leaves the ' +
    'game its pause back in both editors', async ()=>
{
    const run = await editorGame(true);
    run(`level3DLoad({objects: []}); levelEditor.open(); var log = [];
        levelEditor.addTool('Dots', { onPress() { log.push('press'); }, onRelease() { log.push('release'); } });
        levelEditor.tool = 'Dots'; editor3DToolHeld = true; levelEditor.close();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([log, editor3DToolHeld, editor3DIsOpen])')), [['release'], false, false]);
    for (const is3D of [false, true])
    {
        const run = await editorGame(is3D);
        is3D ? run('level3DLoad({objects: []})') : run(`tileLayersLoad({width: 2, height: 2, tilewidth: 16, tileheight: 16,
            tilesets: [{firstgid: 1, source: 't.tsx'}], layers: [{type: 'tilelayer', name: 'a', width: 2, height: 2,
            data: [0, 0, 0, 0]}]}, undefined, 0, 2)`);
        run(`levelEditor.open(); levelEditor.addTool('Bad', { onRelease() { throw new Error('bad release'); } });
            levelEditor.tool = 'Bad'; ${is3D ? 'editor3DToolHeld' : 'editorToolHeld'} = true;`);
        assert.throws(()=> run('levelEditor.close()'), /bad release/);
        assert.equal(run('paused'), false, (is3D ? '3D' : '2D') + ': the game is not left paused');
    }
});

test('addKey with a key code in lowercase is refused once, with a warning, not every frame', ()=>
{
    const warnings = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run(`levelEditor.addKey('shift', ()=> {}); levelEditor.addKey('numpad1', ()=> {}); levelEditor.addKey('F1', ()=> {})`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(levelEditor.keys))')), ['F1']);
    assert.equal(warnings.filter((w)=> w.includes('with a capital')).length, 2);
});

test('a video made while the window is already blurred is muted, and soundPauseWhenBlurred turned on mutes too', ()=>
{
    const document = { hidden: false, addEventListener() {}, hasFocus: ()=> false, body: { appendChild() {} },
        createElement: ()=> ({style: {}, paused: true, muted: false, currentTime: 0, duration: 10,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}}) };
    const { run } = loadEngine({ document });
    run('setHeadlessMode(true); setSoundPauseWhenBlurred(true)');
    const muted = run(`new UISystemPlugin; var a = new UIVideo(vec2(), vec2(100), 'a.mp4', false); a.play(); a.update();
        const first = a.video.muted;
        setSoundPauseWhenBlurred(false); a.update(); const off = a.video.muted;
        setSoundPauseWhenBlurred(true); a.update();
        JSON.stringify([first, off, a.video.muted])`);
    assert.deepEqual(JSON.parse(muted), [true, false, true]);
});

test('small files that would take huge memory are refused or capped: glTF zeros over all parts, LDtk cells over ' +
    'all layers, prefab parts over a whole level, a 3D trail', async ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run('setHeadlessMode(true); new Render3DPlugin');
    // a glTF of eight parts each reading one accessor of 2^20 zeros
    const gltf = {asset: {version: '2.0'}, accessors: [{count: (1 << 20) - 1, type: 'VEC3', componentType: 5126}],
        meshes: [{primitives: Array.from({length: 8}, ()=> ({attributes: {POSITION: 0}}))}],
        nodes: [{mesh: 0}], scenes: [{nodes: [0]}]};
    const gltfResult = await run(`parseGLTF(${JSON.stringify(gltf)}).then(()=> 'loaded', (e)=> e.message)`);
    assert.match(gltfResult, /past what a file may make/);
    // an LDtk level whose four stacked tiles would make five whole 2048 by 2048 layers
    const ldtk = run(`(()=> { try { tileLayersFromLDtk({defs: {tilesets: [{uid: 7, relPath: 't.png', pxWid: 32,
        pxHei: 32, tileGridSize: 16, __cWid: 2, __cHei: 2}]}, levels: [{identifier: 'big', pxWid: 2048 * 16,
        pxHei: 2048 * 16, layerInstances: [{__type: 'Tiles', __identifier: 'a', __cWid: 2048, __cHei: 2048,
        __gridSize: 16, __tilesetDefUid: 7, gridTiles: [0, 1, 2, 3].map((t)=> ({px: [0, 0], t, f: 0}))}]}]});
        return 'made'; } catch (e) { return e.message; } })()`);
    assert.match(ldtk, /cells over its layers/);
    // ten instances of a prefab of 100 prefabs of 100 boxes
    const parts = run(`let made = 0; level3DAddType('Leaf', ()=> { ++made; });
        level3DAddPrefab('B', {objects: Array.from({length: 100}, (_, i)=> ({id: i + 1, type: 'Leaf'}))});
        level3DAddPrefab('A', {objects: Array.from({length: 100}, (_, i)=> ({id: i + 1, type: 'B'}))});
        level3DLoad({objects: Array.from({length: 10}, (_, i)=> ({id: i + 1, type: 'A', pos: [i, 0, 0]}))});
        made`);
    assert.ok(parts <= 1e5, 'parts ' + parts);
    // a trail of a huge trailScale is capped, and the emitter keeps updating
    const trail = run(`const e = new ParticleEmitter3D(vec3()); e.trailTime = 1e9 / 60; e.update(); e.update();
        e.trailMax`);
    assert.equal(trail, 600);
});

test('loaders: a bad tileset margin, glTF indices past their points, an atlas frame ' +
    'named __proto__, an autosave object with no position', async ()=>
{
    {
        const { run } = loadEngine();
        run(`setHeadlessMode(true); try { tileLayersLoad({width: 2, height: 2, tilewidth: 16, tileheight: 16,
            tilesets: [{firstgid: 1, margin: 1, spacing: 'x'}], layers: [{type: 'tilelayer', name: 'a', width: 2,
            height: 2, data: [1, 0, 0, 0]}]}, tile(0, 16), 0, 2); } catch (e) {}
            engineObjectsDestroy(); engineObjectsDestroy();`);
    }
    {
        const { run } = loadEngine({ atob, Response }, '', 'littlejs.release.js');
        run('setHeadlessMode(true); new Render3DPlugin');
        const floats = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).toString('base64');
        const ints = Buffer.from(new Uint16Array([0, 1, 7]).buffer).toString('base64');
        const gltf = {asset: {version: '2.0'}, buffers: [{byteLength: 36, uri: 'data:application/octet-stream;base64,' +
            floats}, {byteLength: 6, uri: 'data:application/octet-stream;base64,' + ints}],
            bufferViews: [{buffer: 0, byteLength: 36}, {buffer: 1, byteLength: 6}],
            accessors: [{bufferView: 0, count: 3, type: 'VEC3', componentType: 5126},
                {bufferView: 1, count: 3, type: 'SCALAR', componentType: 5123}],
            meshes: [{primitives: [{attributes: {POSITION: 0}, indices: 1}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]};
        const result = await run(`parseGLTF(${JSON.stringify(gltf)}).then(()=> 'loaded', (e)=> e.message)`);
        assert.match(result, /indices past its vertices/);
    }
    {
        const { run } = loadEngine();
        const atlas = run(`const groups = parseAtlas({frames: {'__proto__.png': {frame: {x: 0, y: 0, w: 8, h: 8}}}});
            const atlas = {}; objectPropertySet(atlas, groups[0].name, 1);
            JSON.stringify([Object.getPrototypeOf(atlas) === Object.prototype, Object.keys(atlas)])`);
        assert.deepEqual(JSON.parse(atlas), [true, ['__proto__']]);
        assert.equal(run(`editorSaveValid({layers: [[0]], objects: [[{id: 1, x: 0}]]})`), false);
        assert.equal(run(`editorSaveValid({layers: [[0]], objects: [[{id: 1, x: 0, y: 0, properties: []}]]})`), true);
    }
});

test('getRotation keeps the turn of a matrix scaled to 0 on one axis, and an attached emitter\'s effect angle is its own', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        const turned = [];
        for (const scale of [vec3(0, 1, 1), vec3(1, 0, 1), vec3(1, 1, 0)])
        {
            const r = buildMatrix(vec3(), vec3(.3, .7, -.4), scale).getRotation();
            turned.push([r.x, r.y, r.z].map((v)=> +v.toFixed(6)));
        }
        const parent = new EngineObject(vec2(), vec2(1)); parent.angle = 1;
        const emitter = particleEffect('fire', vec2(), {angle: .5});
        parent.addChild(emitter); emitter.angle = parent.angle + .5;
        JSON.stringify({turned, angle: +particleEffectFromEmitter(emitter).settings.angle.toFixed(6)})`));
    for (const t of result.turned)
        assert.deepEqual(t, [.3, .7, -.4]);
    assert.equal(result.angle, .5);
});

test('improvements: particle effect options checked, a saved vec2 and Color come back as one, a map that is not ' +
    'orthogonal is said, a glTF data uri in capitals is read', async ()=>
{
    const warnings = [], items = {};
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
    const { run } = loadEngine({ localStorage, atob, Response,
        console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run('setHeadlessMode(true); new Render3DPlugin');
    for (const options of ['{scale: 0}', '{scale: -1}', '{hue: NaN}', '{saturation: -1}'])
        assert.throws(()=> run(`particleEffect('fire', vec2(), ${options})`), /particleEffect: \w+ must be/, options);
    const saved = run(`writeSaveData('game', {spawn: vec2(3, 4), tint: hsl(.5, 1, .5), best: 7});
        const data = readSaveData('game', {spawn: vec2(), tint: WHITE, best: 0});
        JSON.stringify([data.spawn instanceof Vector2, data.spawn.add(vec2(1)).x, data.tint instanceof Color, data.best])`);
    assert.deepEqual(JSON.parse(saved), [true, 4, true, 7]);
    run(`tileLayersLoad({width: 1, height: 1, tilewidth: 16, tileheight: 16, orientation: 'isometric',
        layers: [{type: 'tilelayer', name: 'a', width: 1, height: 1, data: [0]}]}, undefined, 0, 0, false)`);
    assert.ok(warnings.some((w)=> w.includes('isometric orientation')), warnings.join('\n'));
    const floats = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).toString('base64');
    const gltf = {asset: {version: '2.0'}, buffers: [{byteLength: 36, uri: 'DATA:application/octet-stream;base64,' + floats}],
        bufferViews: [{buffer: 0, byteLength: 36}], accessors: [{bufferView: 0, count: 3, type: 'VEC3', componentType: 5126}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}], nodes: [{mesh: 0}], scenes: [{nodes: [0]}]};
    assert.equal(await run(`parseGLTF(${JSON.stringify(gltf)}).then((m)=> m.parts.length, (e)=> e.message)`), 1);
});

test('the touch gamepad taking over from a real pad in slot 0 lets go of what that pad held', ()=>
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) };
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [pad] } });
    run('touchGamepadInit = ()=> {}; setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3)');
    pad.buttons[1] = { pressed: true, value: 1 };
    pad.buttons[13] = { pressed: true, value: 1 };
    run('inputUpdate(); inputUpdatePost()');
    assert.deepEqual([run('gamepadIsDown(1)'), run('gamepadIsDown(13)')], [true, true], 'held on the real pad');
    pad.buttons[1] = pad.buttons[13] = { pressed: false, value: 0 };
    run(`touchGamepadTimer.set(); touchGamepadButtons[2] = touchGamepadButtonsPressed[2] = 1;
        touchGamepadPointerRole.set(8, 'face2'); inputUpdate()`);
    assert.deepEqual([run('gamepadWasReleased(1)'), run('gamepadWasReleased(13)'), run('gamepadIsDown(2)')],
        [true, true, true], 'B and the D-pad let go as touch takes over, the touch button down');
});

test('newcomer slips: a tween path to nothing, an unknown level3DSpawn type, a type in Name assert or warn', ()=>
{
    const warnings = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run('setHeadlessMode(true); new Render3DPlugin');
    assert.throws(()=> run(`tweenProperty(new EngineObject, 'pos.z', 0, 1)`), /is not a property of the target/);
    run(`tweenProperty(new EngineObject, 'pos.x', 0, 1)`);
    assert.throws(()=> run(`level3DSpawn('hut')`), /no type named hut/);
    run(`objectLayersAddType('Coin', (pos)=> new EngineObject(pos));
        objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            objects: [{id: 4, name: 'Coin', x: 0, y: 0}]}]})`);
    assert.ok(warnings.some((w)=> w.includes('named Coin with no class')), warnings.join('\n'));
});
