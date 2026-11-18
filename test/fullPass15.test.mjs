import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadEngine } from './vmEngine.mjs';
import { box2dInit, Box2dObject, vec2, setEngineManualStep, engineInit, engineStep, levelEditor, setPaused,
    tileLayersLoad, EngineObject } from '../dist/littlejs.esm.js';

// Full pass 15 of 2026-11-14: Box2D held under an open editor; Aseprite inner padding, a pixel over, layers listed;
// edits refused on a layer an async Restart is making again; the 3D editor's Play and Exit outside its view; the
// animator's onEnd switch; a tool switched as its press is let go; a layer hidden by its group; the kind warning per
// map; 3D ids kept; a slider under a pinch, a Ctrl wheel in lines; a flare handed over, a queued strip's color; a
// model's color and transparent; the snap's one way test skipped; a HeightMap cliff walked at an angle

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=> setPaused(false)); // the game unpauses itself every update

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

test('a Box2D body holds still under an open level editor when the game unpauses itself', ()=>
{
    tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1, data: [0, 1]}]},
        undefined, 0, 0);
    const body = new Box2dObject(vec2(0, 10));
    body.addBox(vec2(1));
    body.setLinearVelocity(vec2(0, -6));
    const plain = new EngineObject(vec2(5, 10));
    plain.velocity = vec2(0, -.1);
    engineStep(2);
    levelEditor.open();
    const before = [body.pos.y, plain.pos.y];
    engineStep(30);
    const after = [body.pos.y, plain.pos.y];
    levelEditor.close();
    assert.deepEqual(after, before);
    engineStep(5);
    assert.ok(body.pos.y < before[0], 'and moves again once it closes');
});

test('loadAtlas reads an Aseprite inner padded sheet inside its padding, a frame a pixel over, and listed layers',
    async ()=>
{
    const { run, warnings } = atlasEngine(256);
    // inner padding 1: each frame rect is 18 wide around a 16 pixel sprite
    const padded = [];
    for (let i = 0; i < 6; ++i)
        padded.push({filename: `slime ${i}.aseprite`, frame: {x: i * 18, y: 0, w: 18, h: 18},
            spriteSourceSize: {x: 0, y: 0, w: 16, h: 16}, sourceSize: {w: 16, h: 16}});
    const groups = JSON.parse(run(`JSON.stringify(parseAtlas(${JSON.stringify({frames: padded,
        meta: {frameTags: [{name: 'idle', from: 0, to: 5}], layers: [{name: 'body'}, {name: 'eyes'}]}})})
        .map((g)=> g.frames.map((f)=> [f.pos.x, f.pos.y, f.size.x, f.size.y])))`));
    assert.deepEqual(groups[0][1], [19, 1, 16, 16], 'the sprite is the middle of its rect');
    assert.ok(!warnings.some((w)=> w.includes('split layers')), 'a merged export lists its layers: ' + warnings);
    run(`var a = loadAtlas('a.png', ${JSON.stringify({frames: padded, meta: {frameTags: [{name: 'idle', from: 0, to: 5}]}})});
        var b = loadAtlas('b.png', {frames: {'coin_0.png': {frame: {x: 0, y: 0, w: 17, h: 17},
            spriteSourceSize: {x: 1, y: 0, w: 17, h: 17}, sourceSize: {w: 17, h: 17}}}})`);
    await run('spritesReady()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([Object.keys(a), Object.keys(b)])')), [['idle'], ['coin_0']]);
    // split layers name each entry with its layer
    warnings.length = 0;
    run(`parseAtlas({frames: [{filename: 'p (body) 0.aseprite', frame: {x: 0, y: 0, w: 8, h: 8}},
        {filename: 'p (hat) 0.aseprite', frame: {x: 8, y: 0, w: 8, h: 8}}],
        meta: {frameTags: [{name: 'run', from: 0, to: 0}], layers: [{name: 'body'}, {name: 'hat'}]}})`);
});

test('an edit while an async onRestart makes the layers of a shrunk map is refused, and lands once they are made',
    async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'front', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var layers = tileLayersLoad(map, undefined, 0, 0), front = editorLayerRecord(layers[0]), restartWait;
        levelEditor.onRestart = async ()=>
        {
            await new Promise((r)=> restartWait = r);
            engineObjectsDestroy(); layers = tileLayersLoad(map, undefined, 0, 0);
        };
        levelEditor.open(); editorLayer = front;
        editorResize(front.record, 3, 2);
        var refused = !levelEditor.edit2D.paint(vec2(2, 1), 4);
        editorPaint(front, vec2(3, 2), 5); editorStrokeEnd();`);
    assert.equal(run('refused'), true);
    assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(map.layers[0].data))')), ['0', '1', '2', '3', '4', '5']);
    assert.deepEqual(JSON.parse(run('JSON.stringify(map.layers[0].data)')), [0, 0, 0, 0, 0, 0]);
    run('restartWait()');
    await new Promise((r)=> setTimeout(r, 0));
    run('editorLayer = editorLayerRecord(layers[0]); levelEditor.edit2D.paint(vec2(2, 1), 4); editorStrokeEnd()');
    assert.deepEqual(JSON.parse(run('JSON.stringify(map.layers[0].data)')), [0, 0, 5, 0, 0, 0]);
    run('levelEditor.close()');
});

test('Escape and 0 in the 3D editor run the game\'s onPlayFrom and onClose with its own camera', async ()=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
    run(`level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2);
        var player = new EngineObject3D(vec3(0, 1, 0), render3D.boxMesh);
        var follow = new ThirdPersonCamera3D(player, 6);
        engineStep(2);
        levelEditor.onPlayFrom = (pos)=> { player.pos3D = pos.add(vec3(0, 1, 0)); follow.snap(); };
        levelEditor.open();
        editor3DPlayFromMouse = true;
        editor3DCamera.pos = vec3(40, 30, 40); editor3DCamera.lookAt(vec3(20, 0, 20));
        mousePosScreen = mainCanvasSize.scale(.5);
        var editorBefore = editor3DCamera.pos.copy(), gameBefore = render3D.camera.pos.copy();
        inputData[0]['Escape'] = 3;`);
    step();
    assert.equal(run('levelEditor.isOpen'), false);
    assert.equal(run('editor3DCamera.pos.distance(editorBefore)'), 0, 'the editor\'s camera stays');
    assert.ok(run('render3D.camera.pos.distance(gameBefore)') > 1, 'the game\'s camera is the one snapped');
    run(`levelEditor.open(); var mine = new Camera3D;
        delete levelEditor.onPlayFrom; levelEditor.onClose = ()=> { render3D.camera = mine; };
        inputData[0]['Digit0'] = 3;`);
    step();
    assert.equal(run('levelEditor.isOpen'), false);
    assert.equal(run('render3D.camera === mine'), true);
});

test('SpriteAnimator.set called each update keeps the switch an ended clip\'s onEnd made, and takes a new onEnd',
    async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        const hero = new SpriteAnimator({idle: new SpriteAnimation(tile(0, 16), 2, .4),
            attack: new SpriteAnimation(tile(6, 16), 3, .05).play()});
        const names = [];
        for (let i = 0; i < 12; ++i) { hero.set('attack', ()=> hero.set('idle')); names.push(hero.name); engineStep(); }
        // on the clip showing, a new onEnd takes the old one's place
        let ended = '';
        hero.set('attack', ()=> ended = 'first'); hero.set('attack', ()=> ended = 'second');
        for (let i = 0; i < 12; ++i) { hero.tileInfo; engineStep(); }
        return JSON.stringify({names, ended});
    })()`));
    assert.ok(result.names.includes('idle'), 'the onEnd switch stands: ' + result.names);
    assert.equal(result.ended, 'second');
});

test('a game tool switched in the frame its press is let go is released, and its stroke is one undo', async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        tileLayersLoad({width: 4, height: 2, layers: [{type: 'tilelayer', name: 'a', width: 4, height: 2,
            data: [0, 0, 0, 0, 1, 1, 1, 1]}]}, undefined, 0, 0);
        const calls = [];
        levelEditor.addTool('A', { onPress: ()=> (calls.push('A press'), levelEditor.edit2D.paint(vec2(0, 0), 3)),
            onRelease: ()=> calls.push('A release') });
        levelEditor.addTool('B', {});
        levelEditor.open(); editorSelectLayer(editorLayers()[0]); levelEditor.tool = 'A';
        editorMouseOnPanel = false;
        mousePosScreen = worldToScreen(vec2(.5, .5)); inputData[0][0] = 3; engineStep();
        inputData[0][0] = 4; levelEditor.tool = 'B'; engineStep(); inputData[0][0] = 0;
        const result = {calls, undo: editorUndoList.length, stroke: !!editorStroke};
        levelEditor.tool = undefined; levelEditor.close();
        return JSON.stringify(result);
    })()`));
    assert.deepEqual(result, {calls: ['A press', 'A release'], undo: 1, stroke: false});
});

test('the 2D editor does not open on a layer hidden by its group, and the kind warning is said again for a new map',
    async ()=>
{
    const warnings = [];
    const { run } = await engine2D({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    const name = run(`(()=>
    {
        tileLayersLoad({width: 2, height: 2, tilewidth: 16, tileheight: 16, layers: [
            {type: 'tilelayer', name: 'Art', width: 2, height: 2, data: [1, 1, 1, 1]},
            {type: 'group', name: 'Hidden', visible: false, layers: [
                {type: 'tilelayer', name: 'Collision', width: 2, height: 2, data: [1, 0, 0, 1]}]}]}, undefined, 0, 2);
        levelEditor.open();
        const name = editorLayer.source.name;
        levelEditor.close();
        return name;
    })()`);
    assert.equal(name, 'Art');
    run(`class Coin { constructor(pos) { this.pos = pos; } }
        objectLayersAddType('Coin', Coin, {value: 1});
        const level = ()=> ({width: 2, height: 2, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            name: 'things', objects: [{id: 1, type: 'Coin', x: 0, y: 0,
            properties: [{name: 'value', type: 'string', value: 'x'}]}]}]});
        objectLayersLoad(level()); objectLayersLoad(level());`);
    assert.equal(warnings.filter((w)=> w.includes('the default is kept')).length, 2);
});

test('3D level ids are kept, negatives and big ones too, and only duplicates and ones past exact are renumbered',
    async ()=>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const ids = JSON.parse(run(`(()=>
    {
        const objects = [{id: -5}, {id: 2 ** 40}, {id: 2 ** 53}, {id: 7}, {id: 7}, {id: 1.5}];
        editor3DFixIds(objects);
        return JSON.stringify(objects.map((o)=> o.id));
    })()`));
    assert.deepEqual(ids.slice(0, 2), [-5, 2 ** 40]);
    assert.equal(ids[3], 7);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id)=> Number.isSafeInteger(id + 1)), ids.join());
});

test('a slider held when a second finger lands stays where it was, and a Ctrl wheel notch in lines is one', async ()=>
{
    const { run, handlers } = await engine2D({ window: { ontouchstart: null } });
    run(`new UISystemPlugin; var slider = new UISlider(vec2(0, -400), vec2(600, 50), .5); engineStep();`);
    const finger = (identifier, x, y)=> ({ identifier, clientX: x, clientY: y, target: {} });
    const fire = (type, touches, changed=touches)=> handlers[type]({ type, touches, changedTouches: changed,
        target: {}, cancelable: true, preventDefault() {} });
    const step = ()=> run(`engineStep(); for (const i in inputData[0]) inputData[0][i] &= 1;
        mouseWheel = touchPinch = 0; inputPinchReleased = false;`);
    fire('touchstart', [finger(1, 500, 100)]); step();
    fire('touchmove', [finger(1, 520, 100)], [finger(1, 520, 100)]); step();
    const held = run('slider.value');
    fire('touchstart', [finger(1, 520, 100), finger(2, 980, 900)], [finger(2, 980, 900)]); step();
    assert.equal(run('slider.value'), held);
    for (const [deltaY, deltaMode] of [[1, 1], [3, 1], [1, 2]])
    {
        run('touchPinch = mouseWheel = 0');
        handlers.wheel({ deltaY, deltaMode, ctrlKey: true, target: {}, cancelable: false, preventDefault() {} });
        assert.equal(run('mouseWheel'), 1, deltaY + ' in mode ' + deltaMode);
    }
});

test('a flare handed to another light is that light\'s child, and a strip queued for sorting keeps its color', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        const a = new Light3D(vec3(), 5), b = new Light3D(vec3(10, 0, 0), 5), flare = a.addFlare();
        b.flare = flare;
        const handed = [flare.parent === b, a.flare === undefined];
        a.destroy();
        handed.push(!flare.destroyed, b.flare === flare);
        // a scratch color reused after the draw is queued
        const color = rgb(1, 0, 0), points = [vec3(), vec3(1, 0, 0), vec3(0, 1, 0)];
        render3D.transparentQueue = [];
        render3D.drawStrip(points, undefined, undefined, color);
        color.set(0, 0, 1);
        const queue = render3D.transparentQueue;
        render3D.transparentQueue = undefined;
        let drawn;
        render3D.drawStrip = (p, n, u, c)=> drawn = c;
        queue[0].draw();
        delete render3D.drawStrip;
        return JSON.stringify({handed, red: drawn.r, blue: drawn.b});
    })()`));
    assert.deepEqual(result, {handed: [true, true, true, true], red: 1, blue: 0});
});

test('a model\'s color multiplies its parts\' and its transparent makes them see through', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        const owner = new EngineObject3D(vec3()), part = new EngineObject3D(vec3(), render3D.boxMesh, undefined,
            rgb(.5, 1, 1));
        render3DShareSettings(part, owner);
        const plain = [render3DPartColor(part) === part.color, render3DSetting(part, 'transparent')];
        owner.color = rgb(1, .5, 1, .25); owner.transparent = true;
        const c = render3DPartColor(part);
        return JSON.stringify({plain, color: [c.r, c.g, c.b, c.a], transparent: render3DSetting(part, 'transparent'),
            own: part.color.g});
    })()`));
    assert.deepEqual(result, {plain: [true, false], color: [.5, .5, 1, .25], transparent: true, own: 1});
});

test('a tile snap tests its place once when no layer has one way tiles, and twice with one', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.js');
    const counts = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); setGravity(vec2(0, -.02));
        const layer = new TileCollisionLayer(vec2(), vec2(20, 10), tile(), 0, false);
        for (let x = 0; x < 20; ++x) layer.setCollisionData(vec2(x, 0), 1);
        const box = new EngineObject(vec2(5.5, 1.4001), vec2(.6, .8)); box.setCollision(false, false, true);
        for (let f = 0; f < 10; ++f) engineObjectsUpdate();
        let calls = 0;
        const test = TileCollisionLayer.prototype.collisionTest;
        TileCollisionLayer.prototype.collisionTest = function(...a) { ++calls; return test.apply(this, a); };
        const count = ()=> { calls = 0; for (let f = 0; f < 10; ++f) engineObjectsUpdate(); return calls; };
        const y = box.pos.y, plain = count();
        layer.setOneWay(99);
        const oneWay = count();
        return JSON.stringify({plain, oneWay, same: box.pos.y === y});
    })()`));
    assert.ok(counts.plain < counts.oneWay, JSON.stringify(counts));
    assert.equal(counts.same, true);
});

test('a body walking at an angle into a HeightMap cliff is stopped at its foot, never popped up or onto it', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const n = 81, heights = [];
        for (let j = 0; j < n; ++j)
        {
            const row = [];
            for (let i = 0; i < n; ++i) row.push(i >= 40 && i <= 56 && j >= 32 && j <= 48 ? 3 : 0);
            heights.push(row);
        }
        new HeightMap(heights, vec2(20), 1, undefined, vec3(), false);
        let onTop = 0, maxRise = 0, nearest = -9;
        for (const speed of [.05, .1, .3, .5])
        for (const angle of [0, 15, 45, 60, 85])
        for (let k = 0; k < 5; ++k)
        {
            const a = angle * PI / 180, dx = Math.cos(a), dz = Math.sin(a);
            const o = new EngineObject3D(vec3(-3 * dx - .5, 1.01, -3 * dz - 1 + k * .4), buildBox());
            o.size3D = vec3(1, 2, 1); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
            for (let f = 0; f < 120; ++f)
            {
                o.velocity3D.x = dx * speed, o.velocity3D.z = dz * speed;
                const y = o.pos3D.y;
                engineObjectsUpdate();
                maxRise = max(maxRise, o.pos3D.y - y);
            }
            o.pos3D.y > 2 && ++onTop;
            angle || (nearest = max(nearest, o.pos3D.x));
            o.destroy(); engineObjectsUpdate();
        }
        return JSON.stringify({onTop, maxRise, nearest});
    })()`));
    assert.equal(result.onTop, 0);
    assert.ok(result.maxRise < .55, 'a rise past the step of .5: ' + result.maxRise);
    // the face is the steep cell from x -.25 to 0 and the body half a unit wide: its side comes up to the face's
    // foot, as a MeshCollider's does (pass 17: before, it went on into the face to its top)
    assert.ok(result.nearest > -.85 && result.nearest < -.65, 'stopped at ' + result.nearest);
});
