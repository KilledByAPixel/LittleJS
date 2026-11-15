import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 20 of 2026-11-15: a 3D type that moves its own body and one with a method's name as a default; the 2D
// editor waiting for a restart in flight; a tap's mouse events with touch input off and no sourceCapabilities; a
// press over the UI per button; a gamepad lost with a button held; a body grown with its feet kept on one way tiles;
// the particle collide callback once a hit; a turned two sided sheet's normals; a side count of Infinity

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));

test('a 3D type that lifts its own body keeps the lift in the editor, and a default with a method\'s name is left out',
    async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        class Floater extends EngineObject3D { constructor(pos) { super(pos.add(vec3(0, 2, 0)), render3D.boxMesh); } }
        level3DAddType('Floater', Floater);
        class Methody extends EngineObject3D { constructor(pos) { super(pos, render3D.boxMesh); } }
        level3DAddType('Methody', Methody, {render: 3});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Floater', pos: [0, 0, 0]},
            {id: 2, type: 'Methody', pos: [9, 0, 0]}]};
        const made = level3DLoad(level), y = (o)=> o.pos3D.y;
        const loaded = y(made[0]), method = typeof made[1].render;
        levelEditor.open();
        const opened = y(editor3DInstances.get(1));
        editor3DSelection.add(1); editor3DSetSelectedTransform('pos', vec3(1, 0, 0));
        const moved = editor3DInstances.get(1).pos3D;
        editor3DSetOpen(false);
        const again = level3DLoad(level)[0].pos3D;
        return JSON.stringify({loaded, method, opened, moved: [moved.x, moved.y], again: [again.x, again.y]});
    })()`));
    assert.deepEqual(result, {loaded: 2, method: 'function', opened: 2, moved: [1, 2], again: [1, 2]});
});

test('the 2D editor waits for an async restart in flight: Restart and a resize\'s undo, then goes on', async ()=>
{
    const { run } = await engine();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var waits = [], restarts = 0;
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = async ()=> { ++restarts; engineObjectsDestroy();
            await new Promise((resolve)=> waits.push(resolve)); tileLayersLoad(map, undefined, 0, 0); };
        levelEditor.open();
        editorResize(editorLayers()[0].record, 5, 3);
        editorUndo(); // the resize waits
        editorRestart(); // so does Restart`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([restarts, map.width, editorUndoList.length])')), [1, 5, 1]);
    run('waits.shift()()'); await tick();
    run('levelEditor.open(); editorUndo();'); // settled: the resize is undone, its restart made the level again
    assert.deepEqual(JSON.parse(run('JSON.stringify([restarts, map.width])')), [2, 4]);
    run('waits.shift()()'); await tick();
    assert.equal(run('engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed).length'), 1, 'made once');
});

test('with touch input off, a tap\'s mouse events with no sourceCapabilities are a finger\'s, as in Firefox', ()=>
{
    const { run, handlers } = loadEngine({ window: { ontouchstart: null } }, 'setTouchInputEnable(false)');
    const touchOne = { identifier: 7, clientX: 100, clientY: 100, target: {} };
    const touch = (type, touches)=> handlers[type]({ type, touches, changedTouches: [touchOne], target: {},
        cancelable: false, preventDefault() {} });
    const mouse = (type)=> handlers[type]({ type, button: 0, x: 100, y: 100, cancelable: false, target: {},
        preventDefault() {} });
    run('inputTouchLast = false; inputLastTouchTime = -1e9;');
    touch('touchstart', [touchOne]); touch('touchend', []);
    mouse('mousemove'); mouse('mousedown'); mouse('mouseup');
    assert.equal(run('inputTouchLast'), true, 'the last pointer is still the finger');
    run(`var locks = 0; mainCanvas.requestPointerLock = ()=> ++locks; pointerLockRequest();`);
    assert.equal(run('locks'), 0, 'a tap does not ask for the pointer lock');
});

test('a press over the UI is per mouse button, and a gamepad lost with a button held lets it go', ()=>
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, (_, i)=> ({ pressed: i === 1, value: i === 1 ? 1 : 0 })) };
    const pads = [pad];
    const { run } = loadEngine({ navigator: { getGamepads: ()=> pads } });
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin({});
        const panel = new UIObject(vec2(200, 200), vec2(200, 200));
        const ui = ()=> pluginList.forEach((p)=> p.update?.());
        ui(); mouseInWindow = true; // laid out, the mouse in the window as a mouse event puts it
        mousePosScreen = panel.nativePos.copy(); inputData[0][0] = 3; ui(); inputData[0][0] = 1;
        mousePosScreen = vec2(800, 800); inputData[0][2] = 3; ui(); inputData[0][2] = 1;
        const left = uiSystem.isPressOverUI(0), right = uiSystem.isPressOverUI(2);
        inputData[0][0] = inputData[0][2] = 0; ui();
        return JSON.stringify({left, right, after: uiSystem.isPressOverUI(0)});
    })()`));
    assert.deepEqual(result, {left: true, right: false, after: false});

    run('inputUpdate(); inputUpdatePost();');
    assert.equal(run('gamepadIsDown(1)'), true);
    pads.length = 0; // unplugged
    run('inputUpdate()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([gamepadIsDown(1), gamepadWasReleased(1)])')), [false, true]);
    run('inputUpdatePost(); inputUpdate();');
    assert.equal(run('gamepadConnected(0)'), false);
});

test('a body grown with its feet kept meets a one way tile a row up as one that tall from the start does', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); setGravity(vec2(0, -.02));
        const walk = (grow)=>
        {
            engineObjectsDestroy();
            while (tileCollisionLayers.length) tileCollisionLayers[0].destroy(true);
            const l = new TileCollisionLayer(vec2(0, 0), vec2(40, 12), tile(), 0, false);
            for (let x = 0; x < 40; ++x) l.setCollisionData(vec2(x, 0), 1);
            l.setOneWay(7);
            for (let x = 10; x < 15; ++x) l.setData(vec2(x, 1), new TileLayerData(7)), l.setCollisionData(vec2(x, 1), 1);
            const P = new EngineObject(vec2(5, grow ? 1.6 : 2.6), vec2(.6, grow ? 1 : 3)); P.setCollision();
            for (let f = 0; f < 40; ++f) engineObjectsUpdate();
            if (grow) { P.size = vec2(.6, 3); P.pos.y += 1; } // grown, its feet kept
            for (let f = 0; f < 5; ++f) engineObjectsUpdate();
            for (let f = 0; f < 120; ++f) { P.velocity.x = .05; engineObjectsUpdate(); }
            return [P.pos.x, P.pos.y - P.size.y / 2];
        };
        return JSON.stringify({control: walk(false), grown: walk(true)});
    })()`));
    assert.ok(Math.abs(result.control[0] - result.grown[0]) < 1e-6, 'as the control ' + JSON.stringify(result));
    assert.ok(Math.abs(result.grown[1] - 1) < .01, 'on the floor ' + JSON.stringify(result));
});

test('the 2D particle collide callback runs once a hit, and not after it destroyed the particle', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const l = new TileCollisionLayer(vec2(0, 0), vec2(10, 10), tile(), 0, false);
        for (let x = 0; x < 10; ++x) l.setCollisionData(vec2(x, 0), 1);
        for (let y = 0; y < 10; ++y) l.setCollisionData(vec2(9, y), 1);
        const one = (pos, vel, destroy)=>
        {
            const e = new ParticleEmitter(vec2(), 0, 0, 0, 0);
            e.collideLevel = true; e.restitution = .5;
            let calls = 0;
            e.particleCollideCallback = (particle)=> (++calls, destroy && particle.destroy(), true);
            e.pos = pos.copy(); const particle = e.emitParticle();
            particle.pos = pos.copy(); particle.velocity = vel.copy(); particle.lifeTime = 9;
            particle.update();
            const bounced = particle.velocity.y > 0 || particle.velocity.x < 0;
            e.destroy(true);
            return [calls, bounced];
        };
        return JSON.stringify({floor: one(vec2(5, 1.05), vec2(0, -.1)), wall: one(vec2(8.95, 5), vec2(.1, 0)),
            destroyed: one(vec2(5, 1.05), vec2(0, -.1), true)});
    })()`));
    assert.deepEqual(result, {floor: [1, true], wall: [1, true], destroyed: [1, false]});
});

test('a turned two sided sheet\'s smooth normals point up where its faces cancel, and Infinity sides finish', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        // two triangles back to back, the same points both ways round, turned off every axis
        const m = buildMatrix(vec3(), vec3(.7, 1.1, .3));
        const p = [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)].map((v)=> m.transformPoint(v));
        const strip = new Mesh([p[0], p[1], p[2], p[1], p[0]]).computeNormals(true);
        const indexed = new Mesh;
        indexed.addTriangles([p[0], p[1], p[2], p[0], p[2], p[1]], [0, 1, 2, 3, 4, 5]);
        indexed.computeNormals(true);
        const up = (mesh)=> mesh.normals.filter((n)=> n.x === 0 && n.y === 1 && n.z === 0).length;
        let asserted = 0;
        try { drawRegularPoly(vec2(), vec2(1), Infinity); } catch (e) { ++asserted; }
        try { setGLCircleSides(Infinity); } catch (e) { ++asserted; }
        return JSON.stringify({strip: [up(strip), strip.normals.length], indexed: [up(indexed), indexed.normals.length],
            asserted});
    })()`));
    assert.equal(result.strip[0], result.strip[1], 'strip ' + result.strip);
    assert.equal(result.indexed[0], result.indexed[1], 'indexed ' + result.indexed);
    assert.equal(result.asserted, 2);
});
