import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 21 of 2026-11-15: 3D solids riding a platform down, stacked and attached in a callback, bouncing by the
// larger restitution; a 3D type's offset turned with it, plain or a prefab's part; the 2D editor's Apply and Play
// waiting for a restart and a restart that never settles let go; a gamepad blip and a primary pad handed over; a
// press over the UI through its release frame; the particle collide callback by place in a cell and a fast emitter's
// inherited speed; edit2D.undo's answer, mainNormal in a comment, a negative volume; the Newgrounds slot queue's timer

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));

// a scene of 3D solids in a fresh engine
function solids(code)
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const V = (x, y, z)=> vec3(x, y, z);
        const box = (pos, size, mass=1)=> { const o = new EngineObject3D(pos); o.size3D = size; o.setCollision();
            o.mass = mass; o.restitution = 0; return o; };
        const step = (n, each)=> { for (let i = 0; i < n; ++i) { each && each(i); engineObjectsUpdate(); } };
        ${code}
    })()`));
}

test('a 3D body rides a solid platform down and up, the platform before or after it in the list', ()=>
{
    for (const first of [true, false])
    for (const vy of [-.05, .05])
    {
        const r = solids(`
            let p, b;
            const mk = ()=> { p = box(V(0, 0, 0), V(4, .5, 4), 0); }, mb = ()=> { b = box(V(0, 1.26, 0), V(1, 2, 1)); };
            ${first ? 'mk(); mb();' : 'mb(); mk();'}
            step(30, ()=> p.velocity3D = V(0, ${vy}, 0));
            let on = 0, gap = 0;
            step(60, ()=> { p.velocity3D = V(0, ${vy}, 0); b.groundObject === p && ++on;
                gap = Math.max(gap, Math.abs(b.pos3D.y - 1 - p.pos3D.y - .25)); });
            return JSON.stringify({on, gap});`);
        assert.ok(r.on >= 59 && r.gap < .1, (first ? 'platform first' : 'body first') + ' ' + vy + ': ' +
            JSON.stringify(r));
    }
});

test('a stack of 3D solids holds, a heavy box on top not squeezing out the ones under it', ()=>
{
    for (const masses of [[1, 1, 1, 1, 1], [1, 1, 1, 1, 10], [1, 1, 1, 1, 30], [1, 100]])
    {
        const r = solids(`
            box(V(0, -.5, 0), V(10, 1, 10), 0);
            const list = ${JSON.stringify(masses)}.map((m, i)=> box(V(0, .5 + i * 1.001, 0), V(1, 1, 1), m));
            step(300);
            return JSON.stringify(list.map((o, i)=> o.pos3D.y - (.5 + i)));`);
        assert.ok(r.every((d)=> Math.abs(d) < .05), masses + ': ' + r);
    }
});

test('a 3D collide callback that attaches one solid to the other ends the pair, and the bounce takes the larger ' +
    'restitution', ()=>
{
    for (const order of ['arrow first', 'target first'])
    {
        const r = solids(`
            render3D.gravity = V(0, 0, 0);
            let arrow, target;
            const ma = ()=> { arrow = box(V(-3, 0, 0), V(.2, .2, 1)); arrow.velocity3D = V(.2, 0, 0); };
            const mt = ()=> { target = box(V(0, 0, 0), V(1, 2, 2), 0); };
            ${order === 'arrow first' ? 'ma(); mt();' : 'mt(); ma();'}
            arrow.collideWithObject = (o)=> { if (o !== target) return true;
                arrow.velocity3D = V(0, 0, 0); target.attach(arrow); return false; };
            step(40);
            return JSON.stringify({attached: arrow.parent === target, x: arrow.pos3D.x});`);
        assert.equal(r.attached, true, order);
        assert.ok(r.x < 0, order + ' stuck on the near side ' + r.x);
    }
    const bounce = solids(`
        render3D.gravity = V(0, -.01, 0);
        const floor = box(V(0, -.5, 0), V(20, 1, 20), 0); floor.restitution = 1;
        const ball = box(V(0, 5.5, 0), V(1, 1, 1)); ball.restitution = 0;
        let up = 0; step(200, ()=> up = Math.max(up, ball.velocity3D.y));
        return JSON.stringify(up);`);
    assert.ok(bounce > .2, 'a dead ball bounces off a bouncy solid floor ' + bounce);
});

test('a 3D type\'s constructor offset turns with it, plain, a separate prefab\'s part and an attached one', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        // a hinge: its body one unit along x from its place
        class Hinge extends EngineObject3D { constructor(pos) { super(pos.add(vec3(1, 0, 0)), render3D.boxMesh); } }
        level3DAddType('Hinge', Hinge);
        level3DAddPrefab('SepHinge', {objects: [{type: 'Hinge', pos: [0, 0, 0]}]});
        level3DAddPrefab('AttHinge', {attached: true, objects: [{type: 'Hinge', pos: [0, 0, 0]},
            {type: 'Box', pos: [0, 0, 3]}]});
        const turn = [0, 90, 0];
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Hinge', pos: [0, 0, 0], rotation: turn},
            {id: 2, type: 'SepHinge', pos: [20, 0, 0], rotation: turn},
            {id: 3, type: 'AttHinge', pos: [30, 0, 0], rotation: turn}]};
        const made = level3DLoad(level);
        const R = (v, at)=> [v.x - at, v.y, v.z].map((n)=> Math.round(n * 100) / 100 || 0);
        const world = (o)=> render3DObjectMatrix(o).transformPoint(vec3());
        const loaded = {plain: R(made[0].pos3D, 0), separate: R(made[1].parts[0].pos3D, 20),
            attached: R(world(made[2].parts[0]), 30)};
        levelEditor.open();
        const inst = (id)=> editor3DInstances.get(id);
        editor3DSelection.add(1); editor3DSetSelectedTransform('pos', vec3(2, 0, 0));
        const moved = R(inst(1).pos3D, 2);
        editor3DSetOpen(false);
        const again = R(level3DLoad(level)[0].pos3D, 2);
        return JSON.stringify({loaded, moved, again});
    })()`));
    // turned 90 degrees about y, +x goes to -z
    const body = [0, 0, -1];
    assert.deepEqual(result, {loaded: {plain: body, separate: body, attached: body}, moved: body, again: body});
});

// a 2D map whose game restarts it with an async onRestart, held by the test
function restartingMap(run)
{
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var waits = [], restarts = 0, playedFrom = [];
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = async ()=> { ++restarts; engineObjectsDestroy();
            await new Promise((resolve)=> waits.push(resolve)); tileLayersLoad(map, undefined, 0, 0); };
        levelEditor.onPlayFrom = (pos)=> playedFrom.push(pos);
        levelEditor.open();`);
}

test('the 2D editor\'s Play during an async restart plays on with no player put, and only the promise settling ends ' +
    'the wait', async ()=>
{
    const { run } = await engine();
    restartingMap(run);
    run(`editorPlayFromMouse = true;
        editorResize(editorLayers()[0].record, 5, 3);
        editorPlay(vec2(1, 1));`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([editorIsOpen, playedFrom.length])')), [false, 0],
        'Play closes the editor, the player not put at the mouse');
    run('waits.shift()()'); await tick();
    run('levelEditor.open(); editorPlay(vec2(1, 1))');
    assert.deepEqual(JSON.parse(run('JSON.stringify([editorIsOpen, playedFrom.length])')), [false, 1], 'then plays');

    // a load of its map or a close does not end the wait, so a second restart can not start under the first
    run(`levelEditor.open(); editorResize(editorLayers()[0].record, 6, 3); tileLayersLoad(map, undefined, 0, 0);
        var afterLoad = !!editorRestartRunning; editorSetOpen(false); var afterClose = !!editorRestartRunning;
        levelEditor.open(); var refused = editorResize(editorLayers()[0].record, 7, 3);`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([afterLoad, afterClose, refused, map.width])')),
        [true, true, false, 6], 'still waits');
    run('waits.shift()()'); await tick();
    assert.equal(run('!!editorRestartRunning'), false, 'its promise settled, the wait is over');
});

test('edit2D.undo says whether it undid anything', async ()=>
{
    const { run } = await engine();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        tileLayersLoad(map, undefined, 0, 0); levelEditor.open(); editorLayer = editorLayers()[0];`);
    const result = JSON.parse(run(`(()=>
    {
        const edit = levelEditor.edit2D, none = edit.undo();
        edit.paint(vec2(1, 1), 2); edit.strokeEnd();
        return JSON.stringify([none, edit.undo(), edit.undo(true), edit.undo(true)]);
    })()`));
    assert.deepEqual(result, [false, true, true, false]);
});

test('a gamepad back after a blip lets its buttons go when lost, and a lost primary\'s on the one taking over', ()=>
{
    const padOf = (held)=> ({ mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, (_, i)=> ({ pressed: i === held, value: i === held ? 1 : 0 })) });
    const pads = [padOf(1)];
    const { run } = loadEngine({ navigator: { getGamepads: ()=> pads } });
    run('inputUpdate(); inputUpdatePost();');
    pads.length = 0; run('inputUpdate(); inputUpdatePost();'); // a blip, nothing held is let go
    pads.push(padOf(1)); run('inputUpdate(); inputUpdatePost(); inputUpdate(); inputUpdatePost();');
    assert.equal(run('gamepadIsDown(1)'), true, 'back');
    pads.length = 0; run('inputUpdate()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([gamepadIsDown(1), gamepadWasReleased(1)])')), [false, true],
        'lost after a blip, its button is let go');
    run('inputUpdatePost(); inputUpdate(); inputUpdatePost();');

    // pad 0 the primary holds 1, pad 1 is lost in the same poll as pad 1 presses: the release is on the new primary
    pads.push(padOf(1)); run('inputUpdate(); inputUpdatePost(); inputUpdate(); inputUpdatePost();');
    assert.equal(run('gamepadPrimary'), 0);
    pads[0] = undefined; pads[1] = padOf(3); run('inputUpdate()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([gamepadPrimary, gamepadWasReleased(1), gamepadIsDown(3)])')),
        [1, true, true]);
});

test('a press over the UI is still over the UI on its release frame', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        new UISystemPlugin({});
        const panel = new UIObject(vec2(200, 200), vec2(200, 200));
        const ui = ()=> pluginList.forEach((p)=> p.update?.());
        ui(); mouseInWindow = true;
        mousePosScreen = panel.nativePos.copy(); inputData[0][0] = 3; ui(); inputData[0][0] = 1; ui();
        mousePosScreen = vec2(800, 800); inputData[0][0] = 4; ui(); // let go off the panel
        const release = uiSystem.isPressOverUI(0);
        inputData[0][0] = 0; ui();
        return JSON.stringify({release, after: uiSystem.isPressOverUI(0)});
    })()`));
    assert.deepEqual(result, {release: true, after: false});
});

test('the particle collide callback is asked again in the cell the particle was in, and a fast emitter inherits',
    ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        // a half tile: solid only in the bottom half of row 0
        const l = new TileCollisionLayer(vec2(0, 0), vec2(10, 10), tile(), 0, false);
        for (let x = 0; x < 10; ++x) l.setCollisionData(vec2(x, 0), 1);
        const e = new ParticleEmitter(vec2(), 0, 0, 0, 0);
        e.collideLevel = true; e.restitution = .5;
        e.particleCollideCallback = (particle, data, pos)=> pos.y < .5;
        e.pos = vec2(5, .9); const particle = e.emitParticle();
        particle.pos = vec2(5, .7); particle.velocity = vec2(0, -.1); particle.lifeTime = 9;
        let low = 9;
        for (let i = 0; i < 10; ++i) { particle.update(); low = Math.min(low, particle.pos.y); }
        e.destroy(true);

        // an emitter moving steadily faster than twice objectMaxSpeed, as a bullet's, passes its speed on
        const fast = new ParticleEmitter(vec2(), 0, 0, 0, 0); fast.velocityInheritance = .3;
        const speeds = [];
        for (let i = 0; i < 4; ++i) { fast.pos = vec2(2.1 * i, 0); fast.update(); speeds.push(fast.velocity.x); }
        fast.pos = vec2(100, 0); fast.update(); speeds.push(fast.velocity.x); // a teleport
        fast.destroy(true);
        return JSON.stringify({low, speeds: speeds.map((s)=> Math.round(s * 100) / 100)});
    })()`));
    assert.ok(result.low >= .5 - .11, 'bounced off the half tile, not sunk in: ' + result.low);
    assert.deepEqual(result.speeds, [0, 0, .63, .63, 0]);
});

test('a mainNormal named only in a comment is not linked, and a negative sound volume asserts', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        const code = 'void mainImage(out vec4 c, vec2 uv) { c = vec4(1); } // mainNormal(n) could bend it';
        const commented = render3DFragmentSource(code).includes('void mainNormal(inout vec3);');
        const real = render3DFragmentSource(code + String.fromCharCode(10) + 'void mainNormal(inout vec3 n) {}').includes('void mainNormal(inout vec3);');
        let asserted = false;
        try { setSoundVolume(-1); } catch (e) { asserted = true; }
        return JSON.stringify({commented, real, asserted});
    })()`));
    assert.deepEqual(result, {commented: false, real: true, asserted: true});
});

test('a Newgrounds slot call\'s time starts when it is sent, so a save never goes while the one before is out',
    async ()=>
{
    const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    const saved = { location: globalThis.location, setInterval: globalThis.setInterval, fetch: globalThis.fetch,
        abort: AbortSignal.timeout };
    const settle = ()=> new Promise((resolve)=> realTimeout(resolve, 5));
    let now = 0, timers = [], nextId = 1;
    try
    {
        globalThis.location = { href: 'https://x/?ngio_session_id=abc', hostname: 'x' };
        globalThis.setInterval = ()=> 0;
        globalThis.setTimeout = (f, ms)=> { timers.push({id: nextId, due: now + (ms || 0), f}); return nextId++; };
        globalThis.clearTimeout = (id)=> { timers = timers.filter((t)=> t.id !== id); };
        AbortSignal.timeout = undefined; // as Safari before 16, the plugin's own timer bounds each request
        const advance = async (ms)=>
        {
            now += ms;
            for (let t; (t = timers.filter((t)=> t.due <= now).sort((a, b)=> a.due - b.due)[0]);)
                timers = timers.filter((x)=> x !== t), t.f(), await settle();
            await settle();
        };
        const out = new Map, log = [];
        let stall = false;
        globalThis.fetch = async (url, options)=>
        {
            if (!options?.body) return { ok: true, status: 200, text: async ()=> '"x"' };
            const { component, parameters } = JSON.parse(options.body.get('request')).execute;
            if (component.startsWith('CloudSave') && stall)
            {
                const tag = JSON.parse(parameters?.data);
                log.push(tag);
                await new Promise((resolve)=> out.set(tag, {resolve, at: now}));
            }
            const data = { success: true, session: { id: 'abc', user: { id: 5, name: 'F' }, expired: false },
                medals: [], scoreboards: [] };
            return { text: async ()=> JSON.stringify({ success: true, result: { component, data } }) };
        };
        const { NewgroundsPlugin } = await import('../dist/littlejs.esm.js');
        const plugin = new NewgroundsPlugin('app');
        await plugin.ready;
        stall = true;

        // four saves of one slot queued at once, each answering 10 seconds after it is sent, under the timeout
        ['P', 'Q', 'R', 'S'].forEach((v)=> plugin.cloudSave(2, v));
        await settle();
        let overlap = false;
        for (let s = 0; s < 60 && log.length + out.size; ++s)
        {
            out.size > 1 && (overlap = true);
            for (const [tag, call] of out)
                now - call.at >= 1e4 && (out.delete(tag), call.resolve());
            await advance(1e3);
        }
        assert.deepEqual(log, ['P', 'Q', 'R', 'S'], 'all sent in order');
        assert.equal(overlap, false, 'never two out at once');
    }
    finally
    {
        Object.assign(globalThis, { location: saved.location, setInterval: saved.setInterval, fetch: saved.fetch,
            setTimeout: realTimeout, clearTimeout: realClear });
        AbortSignal.timeout = saved.abort;
    }
});
