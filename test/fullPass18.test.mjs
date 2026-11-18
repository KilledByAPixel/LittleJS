import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 18 of 2026-11-14: picking a model only through the list and the part hit; a pinch taking back an object
// placed in the 2D editor, and not a quick tap's in the 3D one; a gamepad stick on a UI slider; a HeightMap V valley,
// a post on either side, the MeshCollider in a V; a one way stood box after a move to the side; a map of objects
// alone resized with an async Restart, a second resize, a refused property; a tool press that closes the editor; a
// real mouse after a touch, the last pointer used; the atlas title bracket; box2dInit when the fetch fails

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

async function engine3D(extra={})
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' },
        ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));
const finger = (identifier, x, y)=> ({ identifier, clientX: x, clientY: y, target: {} });
const touchFire = (handlers, type, touches, changed=touches)=> handlers[type]({ type, touches, changedTouches: changed,
    target: {}, cancelable: true, preventDefault() {} });
const step = (run)=> run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;
    mouseWheel = touchPinch = inputWheelPinch = 0; inputPinchReleased = false;`);

test('pick and engineObjectsRaycast3D hit a model only through the list, and say which part was hit', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        // a model in front of a wall, both on the ray, the model's part a child that draws as its part
        const model = new EngineObject3D(vec3(0, 0, -3)), part = new EngineObject3D(vec3(), buildBox());
        render3DShareSettings(part, model); model.addChild(part);
        const wall = new EngineObject3D(vec3(0, 0, -8), buildBox());
        engineObjectsUpdate();
        const ray = new Ray3D(vec3(), vec3(0, 0, -1)), name = (o)=> o === model ? 'model' : o === wall ? 'wall' :
            o === part ? 'part' : String(o);
        const all = render3D.pick(ray), without = engineObjects.filter((o)=> o !== model);
        return JSON.stringify({object: name(all?.object), part: name(all?.part),
            without: name(render3D.pick(ray, without)?.object),
            along: engineObjectsRaycast3D(ray).map(name), alongWithout: engineObjectsRaycast3D(ray, without).map(name)});
    })()`));
    assert.deepEqual(result, {object: 'model', part: 'part', without: 'wall', along: ['model', 'wall'],
        alongWithout: ['wall']});
});

test('a pinch takes back the object its first finger placed in the 2D editor', async ()=>
{
    const { run, handlers } = await engine2D({ window: { ontouchstart: null } });
    run(`class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Coin', Coin, {});
        var map = {width: 8, height: 8, tilewidth: 16, tileheight: 16, nextobjectid: 1,
            layers: [{type: 'tilelayer', name: 'a', width: 8, height: 8, data: new Array(64).fill(0)},
            {type: 'objectgroup', name: 'things', objects: []}]};
        tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map);
        levelEditor.open();
        editorSelectLayer(editorLayers().find((l)=> l.isObjects)); editorMouseOnPanel = false;
        editorObjectBrush = [{type: 'Coin', properties: [], offset: vec2()}];`);
    const fire = (...a)=> touchFire(handlers, ...a);
    fire('touchstart', [finger(3, 620, 380)]); step(run);
    assert.equal(run('map.layers[1].objects.length'), 1, 'the first finger placed one');
    fire('touchstart', [finger(3, 620, 380), finger(4, 820, 380)], [finger(4, 820, 380)]); step(run);
    fire('touchend', [], [finger(3, 620, 380), finger(4, 820, 380)]); step(run);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([map.layers[1].objects.length, editorUndoList.length,
        editorRedoList.length, engineObjects.filter((o)=> o instanceof Coin && !o.destroyed).length])`)), [0, 0, 0, 0]);
    // a quick tap, down and up in one frame, then a pinch: the tap's object stays
    fire('touchstart', [finger(5, 620, 380)]); fire('touchend', [], [finger(5, 620, 380)]); step(run);
    fire('touchstart', [finger(6, 300, 380)]); step(run);
    fire('touchstart', [finger(6, 300, 380), finger(7, 500, 380)], [finger(7, 500, 380)]); step(run);
    fire('touchend', [], [finger(6, 300, 380), finger(7, 500, 380)]); step(run);
    assert.equal(run('map.layers[1].objects.length'), 1, 'the tap\'s object stays, the pinch\'s finger placed none');
});

test('a gamepad stick pushed to the side with a little up or down in it turns a UI slider, not the selection', ()=>
{
    for (const [x, y] of [[1, 0], [.95, .05], [.95, -.05], [.6, .03]])
    {
        const pad = { mapping: 'standard', axes: [x, y, 0, 0],
            buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) };
        const { run } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
        const result = JSON.parse(run(`(()=>
        {
            new UISystemPlugin({});
            const sliders = [0, 1, 2].map((i)=> { const s = new UISlider(vec2(500, 300 + i * 100), vec2(300, 50), .5);
                s.navigationIndex = i; return s; });
            uiSystem.navigationObject = sliders[1]; uiSystem.navigationMode = true;
            isUsingGamepad = true; lastInputDevice = 'gamepad';
            for (let f = 0; f < 3; ++f) { inputUpdate(); pluginList.forEach((p)=> p.update?.()); inputUpdatePost(); }
            return JSON.stringify([sliders.indexOf(uiSystem.navigationObject), sliders[1].value > .5]);
        })()`));
        assert.deepEqual(result, [1, true], 'stick ' + x + ', ' + y);
    }
});

test('a HeightMap body walks up a V valley at speed, and a post beside it holds it on either side', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        // a V with steep sides whose floor rises .1 along x, on a .125 grid
        const S = 20, n = 161, cell = S / (n - 1), heights = [];
        for (let j = 0; j < n; ++j)
        {
            const row = [];
            for (let i = 0; i < n; ++i) { const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
                row.push(Math.min(4, Math.abs(z) * 1.8) + x * .1); }
            heights.push(row);
        }
        const map = new HeightMap(heights, vec2(S), 1, undefined, vec3(), false);
        const o = new EngineObject3D(vec3(), buildBox()); o.size3D = vec3(1, 2, 1); o.restitution = 0;
        const made = [];
        for (const speed of [.3, .6, 1])
        {
            const foot = map.getHeight(0, 0), old = vec3(0, foot + 1, 0);
            o.pos3D = vec3(speed, foot + 1, 0); o.velocity3D = vec3(speed, 0, 0);
            map.levelCollide3D(o, old, true);
            made.push(o.pos3D.x / speed);
        }
        o.destroy(); map.destroy(); engineObjectsUpdate();

        // a post .6 wide, a body walking past it with its edge over the post by .1, on one side and the other
        const post = [];
        for (let j = 0; j < n; ++j) { const row = []; for (let i = 0; i < n; ++i)
            row.push(Math.abs(-S / 2 + i * cell) < .3 && Math.abs(-S / 2 + j * cell) < .3 ? 3 : 0); post.push(row); }
        const posts = new HeightMap(post, vec2(S), 1, undefined, vec3(), false), ends = [];
        for (const z of [.7, -.7])
        {
            const b = new EngineObject3D(vec3(-3, 1.01, z), buildBox());
            b.size3D = vec3(1, 2, 1); b.setCollision(false, false, true); b.mass = 1; b.restitution = 0;
            for (let f = 0; f < 80; ++f) { b.velocity3D.x = .1, b.velocity3D.z = 0; engineObjectsUpdate(); }
            ends.push(b.pos3D.x);
            b.destroy(); engineObjectsUpdate();
        }
        posts.destroy(); engineObjectsUpdate();
        return JSON.stringify({made, ends});
    })()`));
    for (const made of result.made)
        assert.ok(made > .9, 'made ' + made + ' of the move');
    assert.ok(result.ends.every((x)=> x < 0), 'held on both sides ' + result.ends);
    assert.ok(Math.abs(result.ends[0] - result.ends[1]) < 1e-6, 'the same both sides ' + result.ends);
});

test('a MeshCollider body stands still in a V whose floor slopes, and walks up and down the crease', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const S = 10, n = 81, cell = S / (n - 1), heights = [];
        for (let j = 0; j < n; ++j)
        {
            const row = [];
            for (let i = 0; i < n; ++i) { const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
                row.push(Math.min(3, Math.abs(z) * 1.8) + x * .1); }
            heights.push(row);
        }
        const hm = new HeightMap(heights, vec2(S), 1, undefined, vec3(), false);
        const mesh = new MeshCollider(hm.buildMesh(false)); render3DLevelLeave(hm);
        const o = new EngineObject3D(vec3(-2, hm.getHeight(-2, 0) + 1.6, 0), buildBox());
        o.size3D = vec3(1, 2, 1); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        const rest = o.pos3D.x;
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        const still = o.pos3D.x - rest, made = [];
        for (const dir of [1, -1])
        {
            const x0 = o.pos3D.x;
            for (let f = 0; f < 20; ++f) { o.velocity3D.x = dir * .1; o.velocity3D.z = 0; engineObjectsUpdate(); }
            made.push((o.pos3D.x - x0) * dir / 2);
        }
        return JSON.stringify({still, made, ground: !!o.groundObject});
    })()`));
    assert.ok(Math.abs(result.still) < 1e-6, 'it crept ' + result.still);
    for (const made of result.made)
        assert.ok(made > .9, 'made ' + made + ' of the move');
    assert.equal(result.ground, true);
});

test('an async Restart that destroys first: a map of objects alone waits, a second resize waits, a refused ' +
    'property says so', async ()=>
{
    const { run } = await engine2D();
    run(`var made = 0;
        class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); ++made; } }
        objectLayersAddType('Coin', Coin, {value: 1});
        var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16, nextobjectid: 2,
            layers: [{type: 'objectgroup', name: 'things', objects: [{id: 1, type: 'Coin', x: 16, y: 16,
                width: 16, height: 16}]}]};
        var waits = [], restarts = 0;
        objectLayersLoad(map);
        levelEditor.onRestart = async ()=>
        {
            ++restarts;
            engineObjectsDestroy();
            await new Promise((resolve)=> waits.push(resolve));
            objectLayersLoad(map);
        };
        levelEditor.open();
        var objectLayer = editorLayers().find((l)=> l.isObjects);
        editorSelectLayer(objectLayer);
        var record = objectLayer.record;
        var resized = editorResize(record, 5, 3);
        var placed = editorChangeObjects(objectLayer, (list)=>
            list.push({id: 2, type: 'Coin', x: 32, y: 16, width: 16, height: 16}));
        var again = editorResize(record, 6, 3);
        editorObjectSelection.clear(); editorObjectSelection.add(1);
        var property = editorSetSelectedProperty('value', 5);`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([resized, placed, again, property, restarts])')),
        [true, false, false, false, 1]);
    run('waits.shift()()'); await tick();
    assert.deepEqual(JSON.parse(run(`JSON.stringify([map.width, map.layers[0].objects.length,
        engineObjects.filter((o)=> o instanceof Coin && !o.destroyed).length, record.restarting])`)), [5, 1, 1, false]);
    assert.equal(run('editorSetSelectedProperty("value", 5)'), true, 'after it landed');
});

test('a game tool whose onPress closes the 3D editor is not left held, and 0 opens and closes it after', async ()=>
{
    const { run } = await engine3D();
    run(`level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2);
        var seen = [];
        levelEditor.addTool('t', {onPress() { seen.push('press'); levelEditor.close(); },
            onRelease() { seen.push('release'); }});
        levelEditor.open(); levelEditor.tool = 't';
        mousePosScreen = mainCanvasSize.scale(.5); editor3DMouseOnPanel = false;`);
    step(run);
    run('inputData[0][0] = 3;'); step(run);
    assert.deepEqual(JSON.parse(run('JSON.stringify([levelEditor.isOpen, editor3DToolHeld, seen])')),
        [false, false, ['press']]);
    run('inputData[0][0] = 0; levelEditor.open(); inputData[0].Digit0 = 3;'); step(run);
    assert.deepEqual(JSON.parse(run('JSON.stringify([levelEditor.isOpen, seen])')), [false, ['press']]);
});

test('a real mouse on a touch screen laptop is let go after a touch, and the UI goes by the last pointer used',
    ()=>
{
    for (const setup of ['setTouchGamepadEnable(true)', 'setTouchInputEnable(true)'])
    {
        const { run, handlers } = loadEngine({ window: { ontouchstart: null } }, setup);
        run('touchGamepadInit = ()=> {};');
        const mouse = (type, firesTouchEvents=false)=> handlers[type]({ type, button: 0, x: 500, y: 500,
            cancelable: false, target: {}, sourceCapabilities: { firesTouchEvents }, preventDefault() {} });
        const touchOne = { identifier: 7, clientX: 100, clientY: 100, target: {} };
        const touch = (type, touches)=> handlers[type]({ type, touches, changedTouches: [touchOne], target: {},
            cancelable: false, preventDefault() {} });
        const frame = ()=> { run('inputUpdate()'); const down = run('mouseIsDown(0)'); run('inputUpdatePost()');
            return down; };
        run('inputLastTouchTime = -1e9');
        assert.equal(run('inputTouchLast'), true, 'a touch device starts as touch');
        mouse('mousemove');
        assert.equal(run('inputTouchLast'), false, 'a real mouse moved');
        mouse('mousedown'); frame();
        touch('touchstart', [touchOne]); frame(); touch('touchend', []); frame();
        assert.equal(run('inputTouchLast'), true, 'then a finger');
        mouse('mouseup'); frame();
        assert.equal(frame(), false, setup + ': the mouse let go');
        mouse('mousemove', true);
        assert.equal(run('inputTouchLast'), true, 'a mouse event a tap made is no mouse');
    }
});

test('a pinch lets go of its first finger\'s press where that finger is, not between the fingers', ()=>
{
    const { run, handlers } = loadEngine({ window: { ontouchstart: null } });
    const fire = (...a)=> touchFire(handlers, ...a);
    fire('touchstart', [finger(1, 100, 100)]); run('inputUpdate(); inputUpdatePost();');
    const pressed = run('JSON.stringify(mousePosScreen)');
    fire('touchstart', [finger(1, 100, 100), finger(2, 300, 300)], [finger(2, 300, 300)]);
    assert.equal(run('JSON.stringify(mousePosScreen)'), pressed, 'the let go is where the finger was');
    assert.equal(run('inputPinchReleased'), true);
    fire('touchmove', [finger(1, 100, 100), finger(2, 300, 300)]);
    assert.notEqual(run('JSON.stringify(mousePosScreen)'), pressed, 'then between the fingers');
});

test('box2dInit in a page rejects when the wasm fetch itself fails, and loads through its own fetch', async ()=>
{
    for (const fail of [true, false])
    {
        const { run } = loadEngine({ fetch: fail ? ()=> Promise.reject(new TypeError('Failed to fetch')) :
            async ()=> ({ ok: true, arrayBuffer: async ()=> new ArrayBuffer(8) }),
            WebAssembly: { instantiate: async ()=> ({ instance: { exports: {} } }) } });
        // a stand in for the glue that, as a page's does, hands the load to instantiateWasm, and is made once received
        run(`setHeadlessMode(true); var located;
            var Box2D = (module)=> new Promise((resolve)=>
            {
                located = module.locateFile('box2d.wasm.wasm', 'https://example.test/game/');
                module.instantiateWasm({}, (instance)=> resolve({b2World: function() {}, instance}));
            });`);
        const message = await run(`box2dInit().then(()=> 'loaded', (error)=> error.message)`);
        if (fail)
            assert.match(message, /^box2dInit: could not load box2d\.wasm\.wasm, Failed to fetch/);
        else
            assert.notEqual(message.slice(0, 9), 'box2dInit', message);
        assert.equal(run('located'), 'https://example.test/game/box2d.wasm.wasm');
    }
});
