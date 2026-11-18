import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 17 of 2026-11-14: a HeightMap cliff walked along at a shallow angle, stairs whose risers fall close
// together; a pinch whose fingers land in one frame, in a selection drag and in the 3D editor, a Ctrl wheel notch;
// the one way stood box after the game moves a body; an async Restart that destroys the level first; the 3D editor
// closed by the game's own code and Escape over the panel; a model's null settings and picking a model; a merged
// atlas of bracketed titles, a postProcess value that is a Color; set on the update a play ends; PathFinder fuzzed;
// box2dInit failing with a message

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

// a finger at a screen place, and a touch event of the touches down and those it changes
const finger = (identifier, x, y)=> ({ identifier, clientX: x, clientY: y, target: {} });
const touchFire = (handlers, type, touches, changed=touches)=> handlers[type]({ type, touches, changedTouches: changed,
    target: {}, cancelable: true, preventDefault() {} });

test('a body walking along a HeightMap cliff at a shallow angle never climbs it, and its side stops at the face', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        // a plateau 1 high, x 0 to 5, on a .25 grid: its face is the steep cell from x -.25 to 0
        const S = 24, cell = .25, n = S / cell + 1, heights = [];
        for (let j = 0; j < n; ++j)
        {
            const row = [];
            for (let i = 0; i < n; ++i)
            {
                const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
                row.push(x >= 0 && x <= 5 && z >= -5 && z <= 5 ? 1 : 0);
            }
            heights.push(row);
        }
        const map = new HeightMap(heights, vec2(S), 1, undefined, vec3(), false);
        let onTop = 0, maxRise = 0, deepest = -9;
        for (const angle of [60, 70, 80, 85])
        for (const speed of [.05, .15, .3])
        {
            const a = angle * PI / 180, dx = Math.cos(a), dz = Math.sin(a);
            const o = new EngineObject3D(vec3(-4 * dx, 1.01, -4 - 4 * dz), buildBox());
            o.size3D = vec3(1, 2, 1); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
            for (let f = 0; f < 150; ++f)
            {
                o.velocity3D.x = dx * speed, o.velocity3D.z = dz * speed;
                const y = o.pos3D.y;
                engineObjectsUpdate();
                maxRise = max(maxRise, o.pos3D.y - y);
                abs(o.pos3D.z) < 4.5 && (deepest = max(deepest, o.pos3D.x + .5));
            }
            o.pos3D.y > 1.5 && ++onTop;
            o.destroy(); engineObjectsUpdate();
        }
        map.destroy(); engineObjectsUpdate();
        return JSON.stringify({onTop, maxRise, deepest});
    })()`));
    assert.equal(result.onTop, 0);
    assert.ok(result.maxRise < .5, 'a rise past the step of .5: ' + result.maxRise);
    // its side comes up to the face's foot and does not go on into the face
    assert.ok(result.deepest < -.15, 'its side reached x ' + result.deepest);
});

test('a small body climbs stairs whose risers are close together, and a wide one stairs steeper than 45 degrees', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const climbs = (rise, tread, w, h, speed)=>
        {
            // risers along x from 0 on a .125 grid, each rise under the body's step, a quarter of its height
            const cell = .125, S = 24, n = S / cell + 1, heights = [];
            const f = (x)=> x < 0 ? 0 : Math.min(8, Math.floor(x / tread) + 1) * rise;
            for (let j = 0; j < n; ++j)
            {
                const row = [];
                for (let i = 0; i < n; ++i) row.push(f(-S / 2 + i * cell));
                heights.push(row);
            }
            const map = new HeightMap(heights, vec2(S), 1, undefined, vec3(), false);
            const o = new EngineObject3D(vec3(-2, h / 2 + .01, 0), buildBox());
            o.size3D = vec3(w, h, w); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
            for (let i = 0; i < 300; ++i) { o.velocity3D.x = speed; engineObjectsUpdate(); }
            const x = o.pos3D.x;
            o.destroy(); map.destroy(); engineObjectsUpdate();
            return x > 8 * tread + 1;
        };
        return JSON.stringify([climbs(.25, .35, .6, 1.2, .15), climbs(.25, .35, .6, 1.2, .3),
            climbs(.3, .25, 1, 2, .1), climbs(.4, .3, 1, 2, .2)]);
    })()`));
    assert.deepEqual(result, [true, true, true, true]);
});

test('a 2D editor pinch whose fingers land in one frame paints no tile, and a dragged selection goes back', async ()=>
{
    const { run, handlers } = await engine2D({ window: { ontouchstart: null } });
    run(`tileLayersLoad({width: 8, height: 8, layers: [{type: 'tilelayer', name: 'a', width: 8, height: 8,
            data: new Array(64).fill(0)}]}, undefined, 0, 0);
        levelEditor.open(); editorSelectLayer(editorLayers()[0]); editorMouseOnPanel = false;`);
    const step = ()=> run(`engineStep(); for (const i in inputData[0]) inputData[0][i] &= 1;
        mouseWheel = touchPinch = inputWheelPinch = 0; inputPinchReleased = false;`);
    const fire = (...a)=> touchFire(handlers, ...a);
    fire('touchstart', [finger(3, 620, 380)]);
    fire('touchstart', [finger(3, 620, 380), finger(4, 820, 380)], [finger(4, 820, 380)]); step();
    fire('touchmove', [finger(3, 520, 380), finger(4, 920, 380)]); step();
    fire('touchend', [], [finger(3, 520, 380), finger(4, 920, 380)]); step();
    assert.equal(run('editorUndoList.length'), 0);
    assert.equal(run('editorLayer.source.data.filter(Boolean).length'), 0);

    // a selection dragged two cells when the second finger lands: the tile and the outline go back
    const moved = JSON.parse(run(`(()=>
    {
        const layer = editorLayer;
        editorPaint(layer, vec2(0, 0), 3); editorStrokeEnd();
        editorSelection = {min: vec2(0, 0), max: vec2(0, 0)};
        editorSelectionDragStart(layer, vec2(0, 0));
        editorSelectionDragTo(vec2(2, 0));
        inputPinchReleased = true;
        editorUpdate();
        inputPinchReleased = false;
        return JSON.stringify([layer.source.data.slice(56, 59), editorSelection.min.x, !!editorSelectionDrag]);
    })()`));
    assert.deepEqual(moved, [[3, 0, 0], 0, false]);
});

test('a Ctrl wheel notch zooms the 2D editor about as much as a plain one, a trackpad pinch as before', async ()=>
{
    const { run } = await engine2D();
    run(`tileLayersLoad({width: 8, height: 8, layers: [{type: 'tilelayer', name: 'a', width: 8, height: 8,
        data: new Array(64).fill(0)}]}, undefined, 0, 0); levelEditor.open();`);
    const zoom = (deltaY, ctrlKey)=> run(`(()=>
    {
        const before = editorCameraScale;
        editorOnWheel({deltaY: ${deltaY}, deltaMode: 0, ctrlKey: ${ctrlKey}, target: {}});
        const factor = before / editorCameraScale;
        editorCameraScale = before;
        return factor;
    })()`);
    // a mouse notch held with Ctrl is clamped to 50 pixels, e^.5; a trackpad's few pixels an event are not
    assert.ok(Math.abs(zoom(100, true) - Math.exp(.5)) < 1e-9, 'a Ctrl notch ' + zoom(100, true));
    assert.ok(Math.abs(zoom(4, true) - Math.exp(.04)) < 1e-9);
    assert.ok(Math.abs(zoom(100, false) - Math.exp(.2)) < 1e-9);
});

test('a 3D editor pinch takes back the type its first finger placed, and two fingers in one frame place none',
    async ()=>
{
    for (const oneFrame of [false, true])
    {
        const { run, handlers } = await engine3D({ window: { ontouchstart: null } });
        run(`var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}]};
            level3DLoad(level);
            render3D.camera.pos = vec3(.5, 4, 10.5); render3D.camera.rotation = vec3(-.4, 0, 0);
            engineStep(2); levelEditor.open();`);
        const step = ()=> run(`engineStep(); for (const i in inputData[0]) inputData[0][i] &= 1;
            mouseWheel = touchPinch = inputWheelPinch = 0; inputPinchReleased = false;`);
        const fire = (...a)=> touchFire(handlers, ...a);
        step();
        run(`editor3DBrush = 'Box'; editor3DMouseOnPanel = false;`);
        fire('touchstart', [finger(3, 450, 700)]);
        oneFrame || step();
        fire('touchstart', [finger(3, 450, 700), finger(4, 650, 700)], [finger(4, 650, 700)]); step();
        fire('touchmove', [finger(3, 350, 700), finger(4, 750, 700)]); step();
        fire('touchend', [], [finger(3, 350, 700), finger(4, 750, 700)]); step();
        assert.deepEqual(JSON.parse(run(`JSON.stringify([level.objects.length, editor3DUndoList.length,
            editor3DRedoList.length, editor3DBrush])`)), [1, 0, 0, 'Box'], 'one frame ' + oneFrame);
        run('levelEditor.close()');
    }
});

test('a body the game moves onto a one way platform stands there, and one moved down walks through one', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        setGravity(vec2(0, -.02));
        const scene = ()=>
        {
            engineObjectsDestroy();
            while (tileCollisionLayers.length) tileCollisionLayers[0].destroy(true);
            const l = new TileCollisionLayer(vec2(0, 0), vec2(30, 20), tile(), 0, false);
            for (let x = 0; x < 30; ++x) l.setCollisionData(vec2(x, 0), 1), l.setCollisionData(vec2(x, 10), 1);
            l.setOneWay(7);
            for (let x = 2; x < 9; ++x) l.setData(vec2(x, 3), new TileLayerData(7)), l.setCollisionData(vec2(x, 3), 1);
            l.setData(vec2(20, 1), new TileLayerData(7)), l.setCollisionData(vec2(20, 1), 1);
            const P = new EngineObject(vec2(15, 1.4), vec2(.6, .8)); P.setCollision();
            for (let f = 0; f < 30; ++f) engineObjectsUpdate();
            return P;
        };
        // standing on the floor, put on the platform, top 4: it stands there
        let P = scene();
        P.pos = vec2(5, 4.4001); P.velocity = vec2();
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        const up = P.pos.y - P.size.y / 2;
        // standing on the high floor, top 11, put on the floor: a one way block is passed from the side
        P = scene();
        P.pos = vec2(15, 11.4001); P.velocity = vec2();
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        P.pos = vec2(18, 1.4001); P.velocity = vec2();
        for (let f = 0; f < 10; ++f) engineObjectsUpdate();
        for (let f = 0; f < 80; ++f) { P.velocity.x = .05; engineObjectsUpdate(); }
        return JSON.stringify({up, x: P.pos.x});
    })()`));
    assert.ok(Math.abs(result.up - 4) < .01, 'bottom ' + result.up);
    assert.ok(result.x > 20.5, 'stopped at ' + result.x);
});

test('an async onRestart that destroys the level first: an undo across the resize writes the right cell, and an ' +
    'object waits', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16, nextobjectid: 1,
            layers: [{type: 'tilelayer', name: 'front', width: 4, height: 3, data: new Array(12).fill(0)},
                {type: 'objectgroup', name: 'things', objects: []}]};
        map.layers[0].data[10] = 7; // a tile at (2, 0) from the file
        var made = 0;
        class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); ++made; } }
        objectLayersAddType('Coin', Coin, {});
        var layers, waits = [];
        function load() { layers = tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map); }
        load();
        levelEditor.onRestart = async ()=>
        {
            engineObjectsDestroy(); // the old level goes first, then a fade or a load
            await new Promise((resolve)=> waits.push(resolve));
            load();
        };
        levelEditor.open();
        var front = editorLayerRecord(layers[0]); editorLayer = front;
        levelEditor.edit2D.paint(vec2(0, 0), 4); editorStrokeEnd(); // a tile at (0, 0)
        editorResize(front.record, 5, 3);`);
    run('waits.shift()()'); await tick(); // the first restart lands, 5 wide
    const result = JSON.parse(run(`(()=>
    {
        front = editorLayerRecord(layers[0]); editorLayer = front;
        levelEditor.edit2D.paint(vec2(4, 2), 4); editorStrokeEnd();
        editorUndo(); // the paint on the 5 wide layer
        editorUndo(); // the resize: the restart destroys the 5 wide layer and waits
        editorUndo(); // the first paint, while it waits
        const data = [...map.layers[0].data];
        // an object placed while it waits is not made now, the restart makes the map's objects
        const objectLayer = editorObjectLayers(front.record)[0];
        const placed = editorChangeObjects(objectLayer, (list)=>
            list.push({id: 1, type: 'Coin', x: 16, y: 16, width: 16, height: 16}));
        editorStrokeEnd();
        return JSON.stringify({data, placed, made});
    })()`));
    assert.equal(result.data.length, 12);
    assert.equal(result.data[8], 0, 'the paint at (0, 0) undone');
    assert.equal(result.data[10], 7, 'the file\'s tile at (2, 0) kept');
    assert.equal(result.placed, false);
    assert.equal(result.made, 0);
    run('waits.shift()()'); await tick();
    assert.equal(run('layers[0].getData(vec2(2, 0)).tile'), 6);
    assert.equal(run('layers[0].getData(vec2(0, 0)).tile'), undefined);
});

test('the 3D editor closed by a game\'s key or tool: onClose sees the game\'s camera, runs once, and the rest of ' +
    'the update does nothing', async ()=>
{
    const { run } = await engine3D();
    const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
    run(`level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2);
        var gameCam = render3D.camera, chase = new Camera3D, seen = [];
        levelEditor.onClose = ()=> { seen.push('close ' + (render3D.camera === gameCam)); render3D.camera = chase; };
        levelEditor.addKey('K', ()=> levelEditor.close());
        levelEditor.open();
        editor3DBrush = 'Box'; editor3DMouseOnPanel = false;
        mousePosScreen = mainCanvasSize.scale(.5);
        editor3DCamera.pos = vec3(0, 10, 10); editor3DCamera.lookAt(vec3(0, 0, 0));
        inputData[0].KeyK = 3; inputData[0][0] = 3;`);
    step();
    // the key closed it; the click in the same frame placed nothing
    assert.deepEqual(JSON.parse(run(`JSON.stringify([levelEditor.isOpen, seen, render3D.camera === chase,
        editor3DObjects().length, !!editor3DDrag])`)), [false, ['close true'], true, 1, false]);

    // a tool whose release closes it while Play closes it: onClose once
    run(`inputData[0].KeyK = inputData[0][0] = 0; levelEditor.keys = {}; editor3DBrush = undefined;
        render3D.camera = gameCam; seen = [];
        levelEditor.addTool('Stamp', {onRelease: ()=> levelEditor.close()});
        levelEditor.open(); levelEditor.tool = 'Stamp';`);
    step();
    run('inputData[0][0] = 3;');
    step();
    run('editor3DToolHeld && editor3DPlay();');
    assert.deepEqual(JSON.parse(run('JSON.stringify([levelEditor.isOpen, seen])')), [false, ['close true']]);
});

test('Escape over the 3D editor\'s panel plays from where the mouse last was on the level', async ()=>
{
    const { run } = await engine3D();
    const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
    run(`level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2);
        var played;
        levelEditor.onPlayFrom = (pos)=> played = pos;
        levelEditor.open(); editor3DPlayFromMouse = true; editor3DMouseOnPanel = false;
        editor3DCamera.pos = vec3(0, 10, 10); editor3DCamera.lookAt(vec3(0, 0, 0));
        mousePosScreen = mainCanvasSize.scale(.5);`);
    step();
    const level = JSON.parse(run('JSON.stringify(editor3DMousePoint())'));
    run(`editor3DMouseOnPanel = true; mousePosScreen = vec2(5, 5); inputData[0][debugKey] = 3;`);
    step();
    const played = JSON.parse(run('JSON.stringify(played)'));
    for (const axis of ['x', 'y', 'z'])
        assert.ok(Math.abs(played[axis] - level[axis]) < 1e-6, axis + ' ' + played[axis] + ' ' + level[axis]);
});

test('a model\'s draw setting set to null or a white of its own leaves the parts theirs, and pick returns the model',
    ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        const owner = new EngineObject3D(vec3(0, 0, -5));
        const part = new EngineObject3D(vec3(), buildBox());
        const shader = new Shader('void mainImage(out vec4 c, in vec2 p) { c = vec4(1); }');
        part.shader = shader; part.emissiveMapColor = rgb(1, .5, 0);
        render3DShareSettings(part, owner); owner.addChild(part);
        owner.shader = null; owner.emissiveMapColor = WHITE.copy();
        const settings = [render3DSetting(part, 'shader') === shader,
            render3DSetting(part, 'emissiveMapColor') === part.emissiveMapColor];
        owner.emissiveMapColor = rgb(0, 1, 0);
        settings.push(render3DSetting(part, 'emissiveMapColor') === owner.emissiveMapColor);
        render3D.camera.pos = vec3(); render3D.camera.rotation = vec3(); render3D.updateMatrices();
        engineObjectsUpdate();
        const ray = new Ray3D(vec3(), vec3(0, 0, -1));
        const picked = [render3D.pick(ray)?.object === owner, render3D.pick(ray, [owner])?.object === owner];
        const along = engineObjectsRaycast3D(ray);
        return JSON.stringify({settings, picked, along: along.length, first: along[0] === owner});
    })()`));
    assert.deepEqual(result, {settings: [true, true, true], picked: [true, true], along: 1, first: true});
});

test('a merged atlas of two files with bracketed titles does not warn of split layers; a postProcess Color is a vec4',
    ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        const warnings = [], warn = console.warn;
        console.warn = (message)=> warnings.push(message);
        const frame = (name, x)=> ({filename: name, frame: {x, y: 0, w: 16, h: 16},
            sourceSize: {w: 16, h: 16}, spriteSourceSize: {x: 0, y: 0, w: 16, h: 16}});
        const atlas = (names)=> ({frames: names.map((name, i)=> frame(name, i * 16)),
            meta: {frameTags: [{name: 'a', from: 0, to: 1}, {name: 'b', from: 2, to: 3}]}});
        parseAtlas(atlas(['hero (v2) 0', 'hero (v2) 1', 'slime (old) 0', 'slime (old) 1']));
        const merged = warnings.length;
        parseAtlas(atlas(['hero (body) 0', 'hero (arm) 0', 'hero (body) 1', 'hero (arm) 1']));
        const split = warnings.length - merged;
        console.warn = warn;
        const source = postProcessFragmentSource('void mainImage(out vec4 c, vec2 p) { c = tint; }',
            {tint: rgb(1, .5, 0), offset: vec2(1, 2), weights: new Float32Array([1, 2, 3])});
        return JSON.stringify({merged, split, declared: source.match(/uniform \\w+ (tint|offset|weights);/g),
            list: postProcessValueList(rgb(1, .5, 0, .25))});
    })()`));
    assert.equal(result.merged, 0);
    assert.deepEqual(result.declared, ['uniform vec4 tint;', 'uniform vec2 offset;', 'uniform vec3 weights;']);
    assert.deepEqual(result.list, [1, .5, 0, .25]);
});

test('SpriteAnimator.set on the update a play ends keeps what its onEnd did; isDone read first starts it again',
    async ()=>
{
    const { run } = await engine2D();
    const result = JSON.parse(run(`(()=>
    {
        const make = ()=> new SpriteAnimator({idle: new SpriteAnimation(tile(0, 16), 2, .4),
            attack: new SpriteAnimation(tile(6, 16), 3, 1/60).play()});
        const press = (readFirst)=>
        {
            // a twin made with it says which update its play ends, by reading it
            const hero = make(), twin = make(), calls = [];
            hero.set('attack', ()=> calls.push('end1'));
            twin.set('attack', ()=> {});
            for (let i = 0; i < 20; ++i) { hero.frame; twin.frame; engineStep(); if (twin.isDone) break; }
            // the update the play ends, before anything read it: a press of the same clip
            readFirst && hero.isDone;
            hero.set('attack', ()=> calls.push('end2'));
            const restarted = hero.frame === 0 && !hero.isDone;
            for (let i = 0; i < 5; ++i) { hero.frame; engineStep(); }
            return {restarted, calls};
        };
        return JSON.stringify([press(false), press(true)]);
    })()`));
    assert.deepEqual(result, [{restarted: false, calls: ['end1']}, {restarted: true, calls: ['end1', 'end2']}]);
});

test('PathFinder on random grids: a smoothed path never crosses a wall nor is longer than the raw one', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        let seed = 12345;
        const rnd = ()=> (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
        const W = 14, H = 11;
        let paths = 0, crossing = 0, longer = 0, mismatch = 0;
        const blockedAt = (grid, x, y)=>
        {
            const cx = Math.floor(x), cy = Math.floor(y);
            return cx < 0 || cy < 0 || cx >= W || cy >= H || grid[cx + cy * W];
        };
        // sampled finely, and a hair to each side, so a line through a corner between two blocked cells counts
        const clear = (grid, a, b)=>
        {
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
            const px = -dy / length * 1e-3, py = dx / length * 1e-3;
            for (let i = 0; i <= 200; ++i)
            {
                const x = a.x + dx * i / 200, y = a.y + dy * i / 200;
                if (blockedAt(grid, x + px, y + py) || blockedAt(grid, x - px, y - py)) return false;
            }
            return true;
        };
        const lengthOf = (p)=> p.reduce((s, v, i)=> i ? s + Math.hypot(v.x - p[i-1].x, v.y - p[i-1].y) : 0, 0);
        for (let trial = 0; trial < 600; ++trial)
        {
            const density = .1 + rnd() * .3, grid = Array.from({length: W * H}, ()=> rnd() < density);
            const finder = new PathFinder(vec2(W, H));
            finder.isWalkable = (x, y)=> !grid[x + y * W];
            const start = vec2(rnd() * W, rnd() * H), end = vec2(rnd() * W, rnd() * H);
            finder.smoothPath = false;
            const raw = finder.findPath(start, end);
            finder.smoothPath = true;
            const smooth = finder.findPath(start, end);
            !raw.length !== !smooth.length && ++mismatch;
            if (smooth.length < 2) continue;
            ++paths;
            for (let i = 1; i < smooth.length; ++i)
                if (!clear(grid, smooth[i-1], smooth[i])) { ++crossing; break; }
            lengthOf(smooth) > lengthOf(raw) + 1e-6 && ++longer;
        }
        return JSON.stringify({paths, crossing, longer, mismatch});
    })()`));
    assert.ok(result.paths > 100, 'paths ' + result.paths);
    assert.deepEqual([result.crossing, result.longer, result.mismatch], [0, 0, 0]);
});

test('box2dInit rejects with the file named when the wasm can not load, and does not hang', async ()=>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true);
        var Box2D = (module)=> { setTimeout(()=> module.onAbort('both async and sync fetching of the wasm failed'));
            return new Promise(()=> {}); };`);
    const message = await run('box2dInit().then(()=> "loaded", (error)=> error.message)');
    assert.match(message, /^box2dInit: could not load box2d\.wasm\.wasm, both async and sync fetching/);
});
