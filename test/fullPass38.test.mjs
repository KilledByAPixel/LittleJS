import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 38 of 2026-11-17: the solid follow-down and a platform dropped through, and from a flat top onto a ramp;
// a fast MeshCollider lift and a VoxelMap lift; a glTF one-shot played with a blend each frame; lists of objects and
// items of the wrong kind in a 3D property; setProperty with a member behind an accessor, a function and a vector
// that is not valid; a 2D tool press that puts the tool down and one let go and pressed in one frame; a sound's clock
// from a bad offset; an atlas frame named as another sprite; the pointer lock while paused and under the free camera

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

const boxes = `globalThis.makeBox = (pos, size, rot)=> { const b = new EngineObject3D(pos, render3D.boxMesh);
        b.size3D = size; rot && (b.rotation3D = rot); b.setCollision(); b.mass = 0; return b; };
    globalThis.makeBody = (pos)=> { const b = new EngineObject3D(pos); b.size3D = vec3(1); b.setCollision();
        b.mass = 1; return b; };`;

test('a walking body drops through a platform whose pair does not resolve or whose collision is off (C1)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    for (const how of ['collideWithObject', 'collideSolidObjects'])
        for (const platformFirst of [true, false])
        {
            const y = +run(`(()=>
            {
                let R, B;
                if (${platformFirst}) { R = makeBox(vec3(), vec3(20, 1, 6)); B = makeBody(vec3(0, 1.1, 0)); }
                else { B = makeBody(vec3(0, 1.1, 0)); R = makeBox(vec3(), vec3(20, 1, 6)); }
                let through = false;
                R.collideWithObject = ()=> !through;
                for (let f = 0; f < 40; ++f) engineObjectsUpdate();
                '${how}' === 'collideWithObject' ? (through = true) : (R.collideSolidObjects = false);
                for (let f = 0; f < 30; ++f) { B.velocity3D.x = .05; engineObjectsUpdate(); }
                const y = B.pos3D.y;
                engineObjectsDestroy();
                return y;
            })()`);
            assert.ok(y < 0, `${how}${platformFirst ? ' platform first' : ''}: fell to ${y}`);
        }
});

test('a body walking from a flat solid onto a solid ramp going down keeps the ground over the crest (C2)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    for (const slope of [.2, .4])
        for (const speed of [.05, .1])
        {
            const air = +run(`(()=>
            {
                const L = 10, c = Math.cos(${slope}), s = Math.sin(${slope});
                makeBox(vec3(3, -.5, 0), vec3(6, 1, 6));
                makeBox(vec3(-L/2 * c + .5 * s, -L/2 * s - .5 * c, 0), vec3(L, 1, 6), vec3(0, 0, ${slope}));
                const B = makeBody(vec3(1.5, .6, 0));
                for (let f = 0; f < 30; ++f) engineObjectsUpdate();
                let air = 0;
                for (let f = 0; f < 60; ++f) { B.velocity3D.x = -${speed}; engineObjectsUpdate(); B.groundObject || ++air; }
                engineObjectsDestroy();
                return air;
            })()`);
            assert.equal(air, 0, `slope ${slope} speed ${speed}`);
        }
});

test('a body rides a fast MeshCollider lift up and a VoxelMap lift down (C3, C4)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);');
    for (const speed of [.2, .3, .6])
    {
        const r = JSON.parse(run(`(()=>
        {
            const L = new MeshCollider(buildBox(vec3(4, 2, 4)), vec3(0, 1, 0));
            const body = new EngineObject3D(vec3(0, 2.6, 0)); body.size3D = vec3(1); body.setCollision(); body.mass = 1;
            for (let f = 0; f < 20; ++f) engineObjectsUpdate();
            let air = 0, low = 0;
            for (let f = 0; f < 30; ++f)
            {
                L.velocity3D = vec3(0, ${speed}, 0); engineObjectsUpdate();
                body.groundObject === L || ++air;
                low = Math.min(low, body.pos3D.y - .5 - (L.pos3D.y + 1));
            }
            engineObjectsDestroy();
            return JSON.stringify({air, low});
        })()`));
        assert.equal(r.air, 0, `mesh lift up ${speed}: ` + JSON.stringify(r));
        assert.ok(r.low > -1e-3, `mesh lift up ${speed}: ` + JSON.stringify(r));
    }
    const air = +run(`(()=>
    {
        const V = new VoxelMap(vec3(-2, 0, -2), vec3(4, 1, 4));
        for (let x = 0; x < 4; ++x) for (let z = 0; z < 4; ++z) V.setVoxel(vec3(x, 0, z), 1);
        const body = new EngineObject3D(vec3(0, 1.6, 0)); body.size3D = vec3(1); body.setCollision(); body.mass = 1;
        for (let f = 0; f < 20; ++f) engineObjectsUpdate();
        let air = 0;
        for (let f = 0; f < 40; ++f)
        {
            V.velocity3D = vec3(0, -.05, 0); engineObjectsUpdate();
            f >= 10 && body.groundObject !== V && ++air;
        }
        engineObjectsDestroy();
        return air;
    })()`);
    assert.equal(air, 0, 'voxel lift down, once it caught up');
});

test('a glTF one-shot played with a blend each frame holds its last pose, and a new play after starts it again (G1)',
    ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        const part = new GLTFPart('box', buildBox(vec3(1)), WHITE, undefined, false);
        part.node = 0;
        const tree = {nodes: [{name: 'root'}], parents: [undefined], restInverse: [new Matrix4], restPose: []};
        const channel = (a, b)=> ({node: 0, path: 'translation', interpolation: 'LINEAR',
            times: new Float32Array([0, 1]), values: new Float32Array([0, a, 0, 0, b, 0]), components: 3});
        const model = new GLTFModel([part], [new GLTFAnimation('idle', [channel(0, 0)]),
            new GLTFAnimation('die', [channel(0, -5)])], tree);
        const o = model.createObject();
        o.play('idle');
        timeDelta = 1/60;
        let restarts = 0, last = -1;
        for (let f = 0; f < 200; ++f)
        {
            o.play('die', false, 1, .2);
            o.animationTime < last - 1e-6 && ++restarts;
            last = o.animationTime;
            o.update(); ++frame;
        }
        const held = o.parts[0].pos3D.y;
        ++frame; ++frame; // a pause in the calls, then a new event
        o.play('die', false, 1, .2);
        const again = o.animationTime;
        o.destroy(true);
        return JSON.stringify({restarts, held, again});
    })()`));
    assert.deepEqual(r, {restarts: 0, held: -5, again: 0});
});

test('a 3D list of objects is read item by item, its vectors and Colors as the default has them, a member left out'
    + ' filled and an item of another kind kept as the default, said (O1, O2, O3)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        level3DAddType('Path', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {stops: [{at: vec3(), tint: rgb(1, 1, 1), wait: 1}], grid: [[vec3()]], tints: [rgb(1, 1, 1)]});
        const [made] = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Path', pos: [0, 0, 0], properties: {
            stops: [{at: [1, 2, 3], tint: '#0000ff'}], grid: [[[4, 5, 6]]], tints: ['#ff0000', 5]}}]});
        console.warn = warn;
        const stop = made.stops[0];
        return JSON.stringify({stop: [isVector3(stop.at), stop.at.z, isColor(stop.tint), stop.tint.b, stop.wait],
            grid: [isVector3(made.grid[0][0]), made.grid[0][0].z], tints: made.tints.map((c)=> isColor(c) && c.r),
            warned: warned.filter((w)=> w.includes('tints[1]')).length});
    })()`));
    assert.deepEqual(r.stop, [true, 3, true, 1, 1]);
    assert.deepEqual(r.grid, [true, 6]);
    assert.deepEqual(r.tints, [1, 1], 'the 5 keeps the default item');
    assert.equal(r.warned, 1);
});

test('edit3D.setProperty takes a vector for a member behind an accessor, refuses a function and says a vector that is'
    + ' not valid (D2, D3, D4)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class Spot { #at = vec3(); get at() { return this.#at; } set at(v) { this.#at = v.copy(); }
            copy() { const s = new Spot; s.at = this.at; return s; } }
        level3DAddType('S', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {spot: new Spot, cb: ()=> 1, at: vec3()});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'S', pos: [0, 0, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        const tryIt = (name, value)=>
        {
            try { return edit.change((list)=> edit.setProperty(list[0], name, value)); }
            catch (e) { said.push(e.message.replace(/^Assert failed: setProperty: /, '')); }
        };
        const spot = tryIt('spot', {at: vec3(1, 2, 3)});
        tryIt('cb', ()=> 2);
        const bad = vec3(); bad.x = NaN;
        tryIt('at', bad);
        edit.strokeEnd();
        return JSON.stringify({spot, said, saved: level.objects[0].properties,
            game: editor3DInstances.get(1).spot.at.z});
    })()`));
    assert.equal(r.spot, true);
    assert.deepEqual(r.said, ['cb holds a function, which the file can not keep',
        'at holds a Color or a vector that is not valid, a number in it not finite']);
    assert.deepEqual(r.saved, {spot: {at: [1, 2, 3]}});
    assert.equal(r.game, 3);
});

test('a 2D tool press that puts the tool down leaves the rest of the press unpainted, and a press let go and pressed'
    + ' again in one frame is released first (E1, E2)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        setDebugKey('');
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 1, nextlayerid: 3,
            orientation: 'orthogonal', layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4,
            data: new Array(16).fill(1)}, {type: 'tilelayer', id: 2, name: 'top', width: 4, height: 4,
            data: new Array(16).fill(0)}]};
        tileLayersLoad(map); levelEditor.open();
        const rec = editorMapList.find((r)=> r.map === map), top = rec.layers[1];
        editorSelectLayer(top);
        let mode = 'off';
        const log = [];
        levelEditor.addTool('T', {
            onPress() { log.push('press'); if (mode == 'off') { levelEditor.tool = undefined; return false; }
                levelEditor.edit2D.paint(vec2(log.length % 4, 0), 4); },
            onDrag() { log.push('drag'); }, onRelease() { log.push('release'); }});
        levelEditor.tool = 'T';
        editorBrush.tile = 6;
        mousePosScreen = worldToScreen(vec2(2.5, 2.5)); editorMouseScreen = mousePosScreen.copy();
        inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 1; editorUpdate(); inputData[0][0] = 0; editorUpdate();
        const painted = top.source.data.join('');
        mode = 'edit'; levelEditor.tool = 'T'; log.length = 0; editorUndoList.length = 0;
        inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 1; editorUpdate();
        inputData[0][0] = 7; editorUpdate(); inputData[0][0] = 0; editorUpdate();
        return JSON.stringify({painted, log, undos: editorUndoList.length});
    })()`));
    assert.equal(r.painted, '0000000000000000', 'the brush took none of the press');
    assert.deepEqual(r.log, ['press', 'drag', 'release', 'press', 'release']);
    assert.equal(r.undos, 2, 'each press its own undo');
});

test('a sound started at a bad offset in a release build keeps time from 0 (K1)', ()=>
{
    const { run } = loadEngine({
        StereoPannerNode: class { constructor() { this.pan = {value: 0}; } connect(n) { return n; } disconnect() {} },
    }, '', 'littlejs.release.js');
    const r = JSON.parse(run(`(()=>
    {
        audioContext.createGain = ()=> ({ connect(n) { return n; }, disconnect() {}, gain: {value: 0} });
        audioContext.createBuffer = ()=> ({ getChannelData: ()=> new Float32Array(1e5) });
        audioContext.createBufferSource = ()=> ({ connect(n) { return n; }, addEventListener() {},
            playbackRate: {value: 1}, start() {}, stop() {} });
        headlessMode = false;
        const sound = new Sound([1]); sound.sampleBuffer = {}; sound.sampleLength = 100;
        return JSON.stringify([NaN, -1, Infinity].map((offset)=>
        {
            const instance = new SoundInstance(sound, 1, 1, 0, false, true);
            instance.start(offset);
            return instance.startOffset;
        }));
    })()`));
    assert.deepEqual(r, [0, 0, 0]);
});

test('an atlas frame named as another sprite is said (P1)', ()=>
{
    const { run } = loadEngine();
    const frame = (x)=> ({frame: {x, y: 0, w: 8, h: 8}});
    const r = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        parseAtlas({frames: ${JSON.stringify({run_0: frame(0), run_1: frame(8), run_2: frame(16), run_1_0: frame(24),
            run_1_1: frame(32)})}});
        console.warn = warn;
        return JSON.stringify(warned);
    })()`));
    assert.deepEqual(r, ['parseAtlas: frame 1 of run is named run_1 as another sprite is, which that name gives; read ' +
        'it as run.frame(1)']);
});

const lockSetup = `headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
    var exits = 0, pending = false;
    mainCanvas = mainCanvas || {};
    mainCanvas.requestPointerLock = ()=> { pending = true; };
    document.exitPointerLock = ()=> { ++exits; document.pointerLockElement = null; };
    document.pointerLockElement = null;
    var land = ()=> { pending && (document.pointerLockElement = mainCanvas); pending = false; };
    var locked = ()=> document.pointerLockElement === mainCanvas;
    var click = (camera)=> { inputData[0][0] = 3; camera.update(); inputData[0][0] = 0; };
    var step1 = ()=> { timeReal += 1/60; for (const c of cameraList.slice()) c.destroyed || c.update();
        cameraUpdatePost(); };
    function reset() { setPaused(false); for (const c of cameraList.slice()) c.destroy(); cameraUpdatePost();
        document.pointerLockElement = null; exits = 0; pending = false; editor3DSetFreeCamera(false);
        cameraLockOwner = cameraLockAsked = undefined; timeReal += 10; }`;

test('the pointer lock: a destroy while paused, a hand-over while paused, the free camera over a pending ask, and a'
    + ' lock landing after the second is up (I1)', ()=>
{
    const { run } = loadEngine();
    run(lockSetup);
    const r = JSON.parse(run(`(()=>
    {
        const out = {};
        // asked, paused the same update, destroyed while paused, lands while paused: let go
        reset(); let A = new FirstPersonCamera3D(vec3(), 0, 0); step1(); click(A); setPaused(true); A.destroy();
        cameraUpdatePost(); land(); timeReal += .02; cameraUpdatePost();
        out.pausedDestroy = {locked: locked(), exits};
        // holding it, paused, a new first person camera made and the old destroyed: handed on
        reset(); A = new FirstPersonCamera3D(vec3(), 0, 0); step1(); click(A); land(); step1(); setPaused(true);
        const B = new FirstPersonCamera3D(vec3(), 0, 0); A.destroy(); cameraUpdatePost();
        out.pausedHandOver = {locked: locked(), owner: cameraLockOwner === B};
        // the free camera turned on while a camera's ask is pending: the lock that lands is the free camera's
        reset(); A = new FirstPersonCamera3D(vec3(), 0, 0); step1(); click(A); editor3DSetFreeCamera(true); land();
        step1(); new CameraControl3D(vec3(), 8); step1();
        out.freeCamera = {locked: locked(), exits};
        editor3DSetFreeCamera(false);
        // asked, a cutscene, the lock lands after the second is up: no camera's, left alone
        reset(); A = new FirstPersonCamera3D(vec3(), 0, 0); step1(); click(A); new CameraControl3D(vec3(), 8); step1();
        for (let i = 0; i < 90; ++i) step1();
        land(); step1();
        out.late = {locked: locked(), owner: cameraLockOwner === undefined, exits};
        return JSON.stringify(out);
    })()`));
    assert.deepEqual(r.pausedDestroy, {locked: false, exits: 1});
    assert.deepEqual(r.pausedHandOver, {locked: true, owner: true});
    assert.deepEqual(r.freeCamera, {locked: true, exits: 0});
    assert.deepEqual(r.late, {locked: true, owner: true, exits: 0});
});
