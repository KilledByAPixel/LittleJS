import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 22 of 2026-11-15: 3D stacks and riders in every list order, momentum between 3D movers, an attach in a
// settle's callback; a 2D collide callback that attaches; the 2D editor's Escape during a fading restart and the
// let-go shapes, the 3D editor's Restart guard and shared undo lists; the touch gamepad's release when turned off;
// the constructor offset scaled; a 3D emitter's damping and its spread at speed

async function engine(extra={}, with3D=false, gameUpdate='')
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true); var gameUpdates = 0;');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> { ++gameUpdates; ${gameUpdate} }, ()=> {}, ()=> {}, ()=> {})`);
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

test('a 3D stack holds in every list order, a heavy box on top too', ()=>
{
    for (const masses of [[1, 1, 1, 1, 1], [1, 1, 1, 1, 30], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]])
    for (const order of ['bottomFirst', 'topFirst', 'floorLast', 'shuffle'])
    {
        const r = solids(`
            const makeFloor = ()=> box(V(0, -.5, 0), V(10, 1, 10), 0);
            const count = ${masses.length}, made = [];
            const makeBox = (i)=> made[i] = box(V(0, .5 + i * 1.001, 0), V(1, 1, 1), ${JSON.stringify(masses)}[i]);
            const order = ${JSON.stringify(order)};
            const indices = [...Array(count).keys()];
            const listed = order === 'topFirst' ? indices.reverse() : order === 'shuffle' ?
                indices.map((i)=> (i * 3) % count) : indices;
            order === 'floorLast' || makeFloor();
            listed.forEach(makeBox);
            order === 'floorLast' && makeFloor();
            step(300);
            return JSON.stringify(made.map((o, i)=> o.pos3D.y - (.5 + i)));`);
        assert.ok(r.every((d)=> Math.abs(d) < .01), masses.length + ' ' + order + ': ' + r);
    }
});

test('two 3D boxes ride a solid platform going down in every list order', ()=>
{
    for (const order of ['plt', 'ptl', 'lpt', 'ltp', 'tpl', 'tlp'])
    {
        const r = solids(`
            let p, l, t;
            const make = {p: ()=> p = box(V(0, 0, 0), V(4, .5, 4), 0), l: ()=> l = box(V(0, .75, 0), V(1, 1, 1)),
                t: ()=> t = box(V(0, 1.75, 0), V(1, 1, 1))};
            for (const c of ${JSON.stringify(order)}) make[c]();
            step(30, ()=> p.velocity3D = V(0, -.05, 0));
            let on = 0;
            step(120, ()=> { p.velocity3D = V(0, -.05, 0); t.groundObject === l && ++on; });
            return JSON.stringify({on, gap: t.pos3D.y - l.pos3D.y - 1});`);
        assert.ok(r.on >= 119 && Math.abs(r.gap) < .01, order + ': ' + JSON.stringify(r));
    }
});

test('two 3D movers trade momentum as 2D ones do: a kicked ball rolls away', ()=>
{
    for (const [restitution, kicker, expected] of [[0, 1, .1], [1, 1, .2], [1, 10, .364]])
    {
        const r = solids(`
            render3D.gravity = V(0, 0, 0);
            const body = box(V(0, 0, 0), V(1, 1, 1), ${kicker}), ball = box(V(1.5, 0, 0), V(1, 1, 1));
            body.restitution = ball.restitution = ${restitution};
            body.velocity3D = V(.2, 0, 0); body.damping = ball.damping = 1;
            step(20, (i)=> i > 3 && (body.velocity3D = V(0, 0, 0)));
            return JSON.stringify(ball.velocity3D.x);`);
        assert.ok(Math.abs(r - expected) < .005, restitution + ' ' + kicker + ': ' + r);
    }
});

test('a 3D settle whose callback attaches the one settled leaves the pusher where it was, in either order', ()=>
{
    for (const order of ['crateFirst', 'pusherFirst'])
    {
        const r = solids(`
            render3D.gravity = V(0, 0, 0);
            const wall = box(V(3, 0, 0), V(1, 4, 4), 0);
            let crate, pusher;
            const mc = ()=> { crate = box(V(1.95, 0, 0), V(1, 1, 1));
                crate.collideWithObject = (o)=> { if (o === wall && !crate.parent)
                    { crate.pos3D = V(-1, 0, 0); wall.addChild(crate); } return true; }; };
            const mp = ()=> { pusher = box(V(.9, 0, 0), V(1, 1, 1)); };
            ${order === 'crateFirst' ? 'mc(); mp();' : 'mp(); mc();'}
            step(3, ()=> { pusher.velocity3D = V(.2, 0, 0); });
            return JSON.stringify({attached: crate.parent === wall, x: pusher.pos3D.x});`);
        assert.equal(r.attached, true, order);
        assert.ok(r.x > .8 && r.x < 1.6, order + ' pusher ' + r.x);
    }
});

test('a 2D collide callback that attaches either one ends the pair, the player not pushed out of its own child', ()=>
{
    for (const crateFirst of [false, true])
    {
        const { run } = loadEngine();
        const r = JSON.parse(run(`(()=>
        {
            setHeadlessMode(true); setGravity(vec2(0, 0));
            let player, crate;
            const mp = ()=> { player = new EngineObject(vec2(0, 0), vec2(1)); player.setCollision();
                player.collideWithObject = (o)=> { if (o === crate && !crate.parent) player.addChild(crate, vec2(0, 1.5));
                    return true; }; };
            const mc = ()=> { crate = new EngineObject(vec2(1.2, 0), vec2(1)); crate.setCollision(); };
            ${crateFirst ? 'mc(); mp();' : 'mp(); mc();'}
            for (let i = 0; i < 3; ++i) { player.velocity = vec2(.2, 0); engineObjectsUpdate(); }
            return JSON.stringify({attached: crate.parent === player, y: player.pos.y});
        })()`));
        assert.equal(r.attached, true);
        assert.ok(Math.abs(r.y) < 1e-6, (crateFirst ? 'crate first' : 'player first') + ': player y ' + r.y);
    }
});

test('Escape during a fading 2D restart plays on so the fade finishes, and a Restart button restart waits till it ' +
    'settles', async ()=>
{
    const { run } = await engine();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var restarts = 0, played = [], fadeEnd;
        levelEditor.onPlayFrom = (p)=> played.push(p.x);
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = async ()=> { ++restarts; engineObjectsDestroy(); fadeEnd = gameUpdates + 10;
            await new Promise((r)=> { const w = ()=> gameUpdates >= fadeEnd ? r() : setTimeout(w, 1); w(); });
            tileLayersLoad(map, undefined, 0, 0); };
        levelEditor.open(); editorPlayFromMouse = true; editorRestart(); engineStep(1);
        editorSetOpen(true); // Escape back mid fade
        editorPlay(vec2(1, 1)); // and Escape again`);
    for (let i = 0; i < 20; ++i) { run('engineStep(1)'); await tick(); }
    const state = ()=> JSON.parse(run(`JSON.stringify({open: editorIsOpen, running: !!editorRestartRunning,
        played: played.length, alive: engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed).length})`));
    assert.deepEqual(state(), {open: false, running: false, played: 0, alive: 1}, 'the fade finished, no player put');

    // a Restart button restart that loads the level waits till its promise settles, the load does not end it
    run(`var settle; levelEditor.onRestart = ()=> { ++restarts; tileLayersLoad(map, undefined, 0, 0);
            return new Promise((r)=> settle = r); };
        levelEditor.open(); editorRestart(); levelEditor.open(); editorRestart();`);
    assert.deepEqual([state().running, run('restarts')], [true, 2], 'the second Restart waits');
    run('settle()'); await tick();
    run('editorRestart()');
    assert.equal(run('restarts'), 3, 'settled, Restart goes again');
});

test('the 3D editor\'s Restart waits for its last async one, and an undo entry shares its list with the one before',
    async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]};
        level3DLoad(level);
        let restarts = 0;
        levelEditor.onRestart = ()=> { ++restarts; return new Promise(()=> {}); };
        levelEditor.open(); editor3DRestart(); levelEditor.open(); editor3DRestart();
        const waited = restarts;
        level3DLoad(level); levelEditor.open(); editor3DRestart(); // a load does not end it, only its promise

        levelEditor.open();
        editor3DSelection.add(1);
        editor3DSetSelectedTransform('pos', vec3(1, 0, 0)); editor3DStrokeEnd();
        editor3DSetSelectedTransform('pos', vec3(2, 0, 0)); editor3DStrokeEnd();
        const list = editor3DUndoList, n = list.length;
        return JSON.stringify({waited, after: restarts, shared: n >= 2 && list[n - 1].before === list[n - 2].after});
    })()`));
    assert.deepEqual(result, {waited: 1, after: 1, shared: true});
});

test('the touch gamepad turned off with a button held gives its release', ()=>
{
    for (const pads of [[], [{ mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) }]])
    {
        const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> pads } });
        run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
            touchGamepadOverlay = {style: {display: '', opacity: 0}};
            touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
            setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3); touchGamepadTimer.set();`);
        const frame = (read)=> { run('inputUpdate()'); const v = read && run(read); run('inputUpdatePost(); touchGamepadRender()');
            return v; };
        frame();
        run('touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1; touchGamepadPointerRole.set(1, "face0")');
        frame(); frame();
        run('setTouchGamepadEnable(false)');
        const released = [];
        for (let i = 0; i < 3; ++i) released.push(frame('gamepadWasReleased(0)'));
        assert.deepEqual(released, [true, false, false], pads.length ? 'a real pad 0' : 'no pad');
    }
});

test('a 3D type\'s constructor offset scales with the object, plain and a prefab\'s part, separate or attached',
    async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        class Feet extends EngineObject3D { constructor(pos) { super(pos.add(vec3(0, .5, 0)), render3D.boxMesh); } }
        level3DAddType('Feet', Feet);
        class Hinge extends EngineObject3D { constructor(pos) { super(pos.add(vec3(1, 0, 0)), render3D.boxMesh); } }
        level3DAddType('Hinge', Hinge);
        level3DAddPrefab('SepHinge', {objects: [{type: 'Hinge', pos: [0, 0, 0]}]});
        level3DAddPrefab('AttHinge', {attached: true, objects: [{type: 'Hinge', pos: [0, 0, 0]},
            {type: 'Box', pos: [0, 0, 3]}]});
        const made = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Feet', pos: [0, 0, 0], scale: [2, 2, 2]},
            {id: 2, type: 'SepHinge', pos: [20, 0, 0], scale: [2, 2, 2]},
            {id: 3, type: 'AttHinge', pos: [30, 0, 0], scale: [2, 2, 2]}]});
        const world = (o)=> render3DObjectMatrix(o).transformPoint(vec3());
        const bottom = made[0].pos3D.y - made[0].size3D.y * made[0].scale3D.y / 2;
        return JSON.stringify({bottom, separate: made[1].parts[0].pos3D.x - 20,
            attached: world(made[2].parts[0]).x - 30});
    })()`));
    assert.deepEqual(result, {bottom: 0, separate: 2, attached: 2});
});

test('a 3D emitter\'s particle damping does not slow the emitter, and a fast one spreads its particles', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin;
        const e = new ParticleEmitter3D(vec3()); e.damping = .9; e.emitRate = 0;
        e.velocity3D = vec3(1, 0, 0);
        for (let i = 0; i < 10; ++i) engineObjectsUpdate();
        const speed = e.velocity3D.x;
        e.destroy();

        // moved by the game 2.1 an update, steadily: the last update's ten particles spread along the move
        const f = new ParticleEmitter3D(vec3(), 0, 0, 600, 0, undefined, WHITE, WHITE, WHITE, WHITE, 10, .1, .1, 0, 1,
            0, 0, 0);
        for (let i = 0; i < 4; ++i) { f.pos3D.x += 2.1; f.update(); }
        const d = f.particleData, xs = new Set;
        for (let i = f.particleCount - 10; i < f.particleCount; ++i)
            xs.add(Math.round(d[i * 21] * 1e3));
        f.destroy(true);
        return JSON.stringify({speed, places: xs.size});
    })()`));
    assert.deepEqual(result, {speed: 1, places: 10});
});
