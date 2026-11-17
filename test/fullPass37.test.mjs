import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 37 of 2026-11-17: walking down a ramp of a turned solid box; a level shape moved as a lift, up in either
// list order and down faster than gravity; atlas sprites numbered with no separator; a game tool's press that returns
// false; the pointer lock landing after a hand-over and handed on when the new camera is made around the old one's
// destroy; setProperty with nested numbers that are not finite, a function field, and vectors and Colors in both forms;
// nested colors with alpha, lists of vectors and a null prototype default in a 3D level; bad values in a release build

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a body walking down a ramp of a turned solid box keeps the ground, as on a MeshCollider (C1)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);');
    for (const slope of [.2, .4])
        for (const speed of [.05, .1])
        {
            const air = run(`(()=>
            {
                const ramp = new EngineObject3D(vec3(), render3D.boxMesh); ramp.size3D = vec3(20, 1, 6);
                ramp.rotation3D = vec3(0, 0, ${slope}); ramp.setCollision(); ramp.mass = 0;
                const surface = (x)=> Math.tan(${slope}) * x + .5 / Math.cos(${slope});
                const body = new EngineObject3D(vec3(6, surface(6) + .6, 0)); body.size3D = vec3(1);
                body.setCollision(); body.mass = 1;
                for (let f = 0; f < 40; ++f) { body.velocity3D.x = 0; engineObjectsUpdate(); }
                let air = 0;
                for (let f = 0; f < 80; ++f)
                {
                    body.velocity3D.x = -${speed}; engineObjectsUpdate();
                    body.groundObject === ramp || ++air;
                }
                engineObjectsDestroy();
                return air;
            })()`);
            assert.equal(air, 0, `slope ${slope} speed ${speed}`);
        }
});

test('a body on a MeshCollider or HeightMap lift stays on it going up in either list order and going down fast'
    + ' (C2, C3)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);');
    for (const kind of ['mesh', 'hmap'])
    {
        const lift = kind === 'hmap' ? 'L = new HeightMap([[0,0,0],[0,0,0],[0,0,0]], vec2(4, 4), 1, undefined, at)' :
            'L = new MeshCollider(buildBox(vec3(4, .5, 4)), at.add(vec3(0, -.25, 0)))';
        for (const bodyFirst of [true, false])
        {
            const r = JSON.parse(run(`(()=>
            {
                let L, body;
                const at = vec3(0, 2, 0);
                const make = ()=> { body = new EngineObject3D(vec3(-1, 2.6, 0)); body.size3D = vec3(1);
                    body.setCollision(); body.mass = 1; };
                ${bodyFirst ? `make(); ${lift};` : `${lift}; make();`}
                const top = ()=> L.pos3D.y + ('${kind}' === 'hmap' ? 0 : .25);
                for (let f = 0; f < 20; ++f) engineObjectsUpdate();
                let worst = 0;
                for (let f = 0; f < 50; ++f)
                {
                    L.velocity3D = vec3(0, .05, 0); engineObjectsUpdate();
                    worst = Math.min(worst, body.pos3D.y - .5 - top());
                }
                // then down, faster than gravity adds each frame: grounded after it catches up
                let air = 0;
                for (let f = 0; f < 60; ++f)
                {
                    L.velocity3D = vec3(0, -.06, 0); engineObjectsUpdate();
                    f >= 10 && body.groundObject !== L && ++air;
                }
                engineObjectsDestroy();
                return JSON.stringify({worst, air});
            })()`));
            const name = `${kind}${bodyFirst ? ' body first' : ''}: ` + JSON.stringify(r);
            assert.ok(r.worst > -1e-3, name + ' never sunk going up');
            assert.equal(r.air, 0, name + ' grounded going down');
        }
    }
});

// an engine with a stub image and canvas, so loadAtlas runs in node, as fullPass12's, each canvas its own size, so a
// sheet's texture has one and a frame of it can be taken
function atlasEngine(size)
{
    const contextOf = (canvas)=> new Proxy({}, { get: (t, k)=> k === 'canvas' ? canvas :
        typeof k === 'string' ? ()=> ({}) : undefined, set: ()=> true });
    const e = loadEngine({
        Image: class { set src(v) { this.width = this.height = size; Promise.resolve().then(()=> this.onload()); } },
        OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext()
            { return contextOf(this); } },
    });
    e.run('glEnable = false; engineInitialized = true;');
    return e;
}

test('atlas sprites numbered with no separator keep their own names beside the animation (P1)', async ()=>
{
    const { run } = atlasEngine(64);
    const frame = (x)=> ({frame: {x, y: 0, w: 8, h: 8}, rotated: false, trimmed: false,
        spriteSourceSize: {x: 0, y: 0, w: 8, h: 8}, sourceSize: {w: 8, h: 8}});
    const frames = {'gem1.png': frame(0), 'gem2.png': frame(8), 'gem3.png': frame(16), 'run_0.png': frame(24),
        'run_1.png': frame(32)};
    run(`var a = loadAtlas('a.png', ${JSON.stringify({frames})})`);
    await run('spritesReady()');
    const r = JSON.parse(run(`JSON.stringify({keys: Object.keys(a).sort(),
        gem2: a.gem2.pos.x === a.gem.frame(1).pos.x && a.gem2.pos.y === a.gem.frame(1).pos.y,
        run1: a.run_1.pos.x === a.run.frame(1).pos.x})`));
    assert.deepEqual(r.keys, ['gem', 'gem1', 'gem2', 'gem3', 'run', 'run_0', 'run_1']);
    assert.equal(r.gem2, true);
    assert.equal(r.run1, true);
});

test('a game tool\'s press that edits and returns false is its own undo, in 2D and 3D (E1)', async ()=>
{
    const { run } = await engine();
    const r2 = JSON.parse(run(`(()=>
    {
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: []}]};
        tileLayersLoad(map, undefined, 0, 'ground'); objectLayersLoad(map); levelEditor.open();
        editorSelectLayer(editorObjectLayers(editorMapList.find((r)=> r.map === map))[0]);
        let next = 1;
        levelEditor.addTool('Drop', {onPress()
        {
            const id = next++;
            levelEditor.edit2D.changeObjects((l)=> l.push({id, type: 'Door', point: true, x: 8 * id, y: 8}));
            return false;
        }});
        levelEditor.tool = 'Drop';
        const press = ()=> { inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 0; editorUpdate(); };
        press(); press();
        const undos = editorUndoList.length;
        editorUndo();
        return JSON.stringify({undos, after: map.layers[1].objects.map((o)=> o.id)});
    })()`));
    assert.deepEqual(r2, {undos: 2, after: [1]});

    const { run: run3 } = await engine({}, true);
    const r3 = JSON.parse(run3(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        let x = 2;
        levelEditor.addTool('Drop', {onPress()
        {
            const at = x++;
            levelEditor.edit3D.change((list)=> list.push({id: at, type: 'Box', pos: [at, .5, .5]}));
            return false;
        }});
        levelEditor.tool = 'Drop';
        const press = ()=> { inputData[0][0] = 3; engineStep(); inputData[0][0] = 0; engineStep(); };
        press(); press();
        editor3DUndo();
        return JSON.stringify(level.objects.map((o)=> o.id));
    })()`));
    assert.deepEqual(r3, [1, 2]);
});

const lockSetup = `headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
    var exits = 0, landing = false;
    mainCanvas = mainCanvas || {};
    // the browser gives the lock a frame later
    mainCanvas.requestPointerLock = ()=> { landing = true; };
    document.exitPointerLock = ()=> { ++exits; document.pointerLockElement = null; };
    document.pointerLockElement = null;
    var land = ()=> { landing && (document.pointerLockElement = mainCanvas); landing = false; };
    var locked = ()=> document.pointerLockElement === mainCanvas;
    var click = (camera)=> { inputData[0][0] = 3; camera.update(); inputData[0][0] = 0; };
    function reset() { for (const c of cameraList.slice()) c.destroy(); cameraUpdatePost();
        document.pointerLockElement = null; exits = 0; landing = false; }`;

test('a lock asked for in the update a camera with no lock takes over is let go once it lands (I1)', ()=>
{
    const { run } = loadEngine();
    run(lockSetup);
    const r = JSON.parse(run(`(()=>
    {
        const eye = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); cameraUpdatePost();
        click(eye);
        const cut = new ThirdPersonCamera3D(vec3(), 6, .3); cameraUpdatePost();
        land(); timeReal += 1/60; cameraUpdatePost();
        const yaw = cut.yaw; mouseDeltaScreen = vec2(40, 0); cameraUpdatePost(); mouseDeltaScreen = vec2();
        return JSON.stringify({locked: locked(), exits, turned: cut.yaw !== yaw});
    })()`));
    assert.deepEqual(r, {locked: false, exits: 1, turned: false});
});

test('a new locking camera made before or after the owner is destroyed in the same update keeps the lock (G1)', ()=>
{
    const { run } = loadEngine();
    run(lockSetup);
    for (const newFirst of [true, false])
        for (const kind of ['FirstPersonCamera3D', 'ThirdPersonCamera3D'])
        {
            const make = kind === 'FirstPersonCamera3D' ? 'new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0)' :
                '(()=> { const c = new ThirdPersonCamera3D(vec3(), 6, .3); c.lockPointer = true; return c; })()';
            const r = JSON.parse(run(`(()=>
            {
                reset();
                const old = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); cameraUpdatePost();
                click(old); land(); cameraUpdatePost();
                let made;
                ${newFirst ? `made = ${make}; old.destroy();` : `old.destroy(); made = ${make};`}
                cameraUpdatePost();
                const kept = {locked: locked(), exits, owner: cameraLockOwner === made};
                made.destroy(); cameraUpdatePost();
                return JSON.stringify({kept, last: {locked: locked(), exits}});
            })()`));
            const name = `${kind}${newFirst ? ' made first' : ''}`;
            assert.deepEqual(r.kept, {locked: true, exits: 0, owner: true}, name);
            assert.deepEqual(r.last, {locked: false, exits: 1}, name + ': let go when the last is destroyed');
        }
});

test('edit3D.setProperty refuses nested numbers that are not finite, takes a function field left out, and takes a'
    + ' vector or Color in either form at any depth (D1, D2, D4)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class AI { speed = 1; onHit = ()=> {}; copy() { const a = new AI; a.speed = this.speed; return a; } }
        level3DAddType('Chest', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {loot: {gold: 5}, list: [1], ai: new AI, at: vec3(), cfg: {to: vec3(), tint: rgb(1, 1, 1), n: 1}});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Chest', pos: [0, 0, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        const tryIt = (name, value)=>
        {
            try { return edit.change((list)=> edit.setProperty(list[0], name, value)); }
            catch (e) { said.push(e.message.replace(/^Assert failed: setProperty: /, '')); }
        };
        tryIt('loot', {gold: NaN});
        tryIt('list', [Infinity]);
        tryIt('cfg', {to: vec3(1, 2, 3), tint: rgb(1, 0, 0), n: 1, extra: vec2(1, 2)});
        const ai = tryIt('ai', {speed: 4});
        const top = tryIt('at', [1, 2, 3]);
        const nested = tryIt('cfg', {to: vec3(4, 5, 6), tint: rgb(1, 0, 0, .5), n: 2});
        edit.strokeEnd();
        const made = editor3DInstances.get(1);
        return JSON.stringify({said, ai, top, nested, saved: level.objects[0].properties,
            game: [made.cfg.to.x, made.cfg.tint.a.toFixed(2), isVector3(made.at), made.at.z]});
    })()`));
    assert.deepEqual(r.said, [
        'loot holds a number that is not finite, which the file keeps as null',
        'list holds a number that is not finite, which the file keeps as null',
        'cfg holds a Color or a vector where its default has none, which the file brings back as text or a list']);
    assert.deepEqual([r.ai, r.top, r.nested], [true, true, true]);
    assert.deepEqual(r.saved, {ai: {speed: 4}, at: [1, 2, 3], cfg: {to: [4, 5, 6], tint: '#ff000080', n: 2}});
    assert.deepEqual(r.game, [4, '0.50', true, 3]);
});

test('a 3D level reads a nested color in its own order, a list of vectors as vectors, and keeps a null prototype'
    + ' default; a bad list over a vector keeps the default (O1, O2, O3, O4)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        const bare = Object.create(null); bare.gold = 1;
        level3DAddType('T', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {cfg: {tint: rgb(1, 1, 1), at: vec3()}, path: [vec3()], bare});
        const [a, b] = level3DLoad({littlejs3D: 1, objects: [
            {id: 1, type: 'T', pos: [0, 0, 0], properties: {cfg: {tint: '#ff000080'}, path: [[1, 2, 3], [4, 5, 6]]}},
            {id: 2, type: 'T', pos: [0, 0, 0], properties: {cfg: {at: [1, 2]}, bare: {gold: 2}}}]});
        const c = a.cfg.tint;
        return JSON.stringify({tint: [c.r, c.g, c.b, +c.a.toFixed(2)], path: a.path.map((v)=> isVector3(v) && v.z),
            bareKept: Object.getPrototypeOf(a.bare) === null, bareSet: Object.getPrototypeOf(b.bare) === null,
            badList: [isVector3(b.cfg.at), b.cfg.at.x]});
    })()`));
    assert.deepEqual(r.tint, [1, 0, 0, .5], '#rrggbbaa inside an object property');
    assert.deepEqual(r.path, [3, 6]);
    assert.equal(r.bareKept, true);
    assert.equal(r.bareSet, true);
    assert.deepEqual(r.badList, [true, 0], 'a list of two over a Vector3 keeps the default');
});

test('a release build takes a NaN shake as none and a bad sound offset as 0 (K1, K2)', ()=>
{
    const { run } = loadEngine({
        StereoPannerNode: class { constructor() { this.pan = {value: 0}; } connect(n) { return n; } disconnect() {} },
    }, '', 'littlejs.release.js');
    const r = JSON.parse(run(`(()=>
    {
        const offsets = [];
        audioContext.createGain = ()=> ({ connect(n) { return n; }, disconnect() {}, gain: {value: 0} });
        audioContext.createBuffer = ()=> ({ getChannelData: ()=> new Float32Array(1e5) });
        audioContext.createBufferSource = ()=> ({ connect(n) { return n; }, addEventListener() {},
            playbackRate: {value: 1}, start(when, offset) { if (!(offset >= 0) || !isFinite(offset)) throw TypeError();
            offsets.push(offset); }, stop() {} });
        headlessMode = false;
        cameraShake(NaN); const afterNaN = cameraShakeTrauma;
        cameraShake(.5, vec2(NaN, 1)); const afterGood = cameraShakeTrauma;
        const sound = new Sound([1]); sound.sampleBuffer = {}; sound.sampleLength = 100;
        for (const offset of [NaN, -1, Infinity])
            new SoundInstance(sound, 1, 1, 0, false, true).start(offset);
        return JSON.stringify({afterNaN, afterGood, offsets});
    })()`));
    assert.deepEqual(r, {afterNaN: 0, afterGood: .5, offsets: [0, 0, 0]});
});
