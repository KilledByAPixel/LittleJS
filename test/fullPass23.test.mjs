import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 23 of 2026-11-15: the restart wait ended by its promise alone, in both editors; groundObject let go by
// addChild; a setScene during a switch; a camera snapped while another drives; a jumper with a crate on its head; a
// fixed solid let go mid pass; destroy and its children; the touch gamepad's flag after off and on; the capture's
// pinch; glTF files with an unread required extension or an index to nothing; Apply making the Objects layer

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true); var gameUpdates = 0;');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> { ++gameUpdates; }, ()=> {}, ()=> {}, ()=> {})`);
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));

test('the 2D restart wait ends only when its promise settles: Escape mid fade, then Restart and undo wait', async ()=>
{
    const { run } = await engine();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var restarts = 0, fadeEnd;
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = async ()=> { ++restarts; engineObjectsDestroy(); fadeEnd = gameUpdates + 10;
            await new Promise((r)=> { const w = ()=> gameUpdates >= fadeEnd ? r() : setTimeout(w, 1); w(); });
            tileLayersLoad(map, undefined, 0, 0); };
        levelEditor.open(); editorResize(editorLayers()[0].record, 5, 3); // its restart starts the fade
        editorPlay(vec2(1, 1)); engineStep(1); levelEditor.open(); // Escape out and back mid fade
        editorRestart(); var undone = editorUndo();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([restarts, undone, !!editorRestartRunning])')), [1, false, true],
        'Restart and the undo wait while the fade runs');
    run('editorPlay(vec2(1, 1))');
    for (let i = 0; i < 20; ++i) { run('engineStep(1)'); await tick(); }
    run('levelEditor.open(); editorRestart();');
    for (let i = 0; i < 20; ++i) { run('engineStep(1)'); await tick(); }
    assert.deepEqual(JSON.parse(run(`JSON.stringify([restarts, !!editorRestartRunning,
        engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed).length])`)), [2, false, 1],
        'settled, the next Restart goes and one level is made');
});

test('the 3D restart wait ends only when its promise settles, and Play during it puts no player', async ()=>
{
    const { run } = await engine({}, true);
    const result = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]};
        level3DLoad(level);
        let restarts = 0, settle; const played = [];
        levelEditor.onRestart = ()=> { ++restarts; level3DLoad(level); return new Promise((r)=> settle = r); };
        levelEditor.onPlayFrom = (p)=> played.push(p);
        editor3DPlayFromMouse = true;
        levelEditor.open(); editor3DRestart(); levelEditor.open(); editor3DRestart(); // loaded, still waits
        editor3DPlay(vec3(1, 0, 0));
        return JSON.stringify({restarts, running: !!editor3DRestartRunning, played: played.length});
    })()`));
    assert.deepEqual(result, {restarts: 1, running: true, played: 0});
});

test('addChild lets go of what the child stood on, 2D and 3D: a carried crate thrown starts in the air', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); setGravity(vec2(0, -.01));
        const platform = new EngineObject(vec2(0, 0), vec2(4, 1)); platform.setCollision(); platform.mass = 0;
        platform.velocity = vec2(-.1, 0);
        const crate = new EngineObject(vec2(0, 1.01), vec2(1)); crate.setCollision();
        for (let i = 0; i < 5; ++i) engineObjectsUpdate();
        const before = crate.groundObject === platform;
        const player = new EngineObject(vec2(20, 5), vec2(1)); player.mass = 0;
        player.addChild(crate, vec2(0, 1));
        const carried = crate.groundObject;
        player.removeChild(crate);
        crate.velocity = vec2(.3, .2);
        engineObjectsUpdate();

        new Render3DPlugin;
        const floor = new EngineObject3D(vec3(50, -.5, 0)); floor.size3D = vec3(10, 1, 10); floor.setCollision();
        floor.mass = 0;
        const box = new EngineObject3D(vec3(50, .5, 0)); box.setCollision();
        for (let i = 0; i < 5; ++i) engineObjectsUpdate();
        const holder = new EngineObject3D(vec3(50, 9, 0)); holder.mass = 0;
        holder.attach(box);
        return JSON.stringify({before, carried: !!carried, vx: crate.velocity.x,
            ground3D: !!box.groundObject, last3D: !!render3DGroundLast.get(box)});
    })()`));
    assert.deepEqual(result, {before: true, carried: false, vx: .3, ground3D: false, last3D: false});
});

test('a setScene made while a switch destroys the old scene is dropped, the old scene leaves once', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const log = [], marks = [];
        const scene = (name, make)=> ({ enter() { log.push(name + ' enter'); make?.(); },
            leave() { log.push(name + ' leave'); } });
        class Player extends EngineObject
        { destroy() { if (this.destroyed) return; super.destroy(); setScene(gameOver); } }
        const gameOver = scene('gameOver', ()=> marks.push(new EngineObject(vec2(), vec2(1))));
        const game = scene('game', ()=> new Player(vec2(), vec2(1)));
        const title = scene('title');
        setScene(game); log.length = 0;
        setScene(title);
        return JSON.stringify({log, current: getScene() === title,
            alive: engineObjects.filter((o)=> !o.destroyed).length});
    })()`));
    // pass 24, owner's call: the ask from the destroy is dropped, the switch's own scene wins
    assert.deepEqual(result, {log: ['game leave', 'title enter'], current: true, alive: 0});
});

test('a FollowCamera snapped while another drives cuts there when it takes over', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const target = new EngineObject(vec2(50, 0), vec2(1));
        const player = new FollowCamera(target, 0); player.smoothing = .5;
        const cutscene = new FollowCamera(new EngineObject(vec2(100, 0), vec2(1)), 0);
        for (let i = 0; i < 5; ++i) engineObjectsUpdate(), cameraUpdatePost();
        player.snap();
        cutscene.destroy();
        engineObjectsUpdate(); cameraUpdatePost();
        return JSON.stringify(cameraPos.x);
    })()`));
    assert.equal(result, 50);
});

test('a jumper with a crate on its head does not throw it as off a floor, and a fixed solid let go mid pass blocks',
    ()=>
{
    for (const order of ['jumperFirst', 'crateFirst'])
    {
        const { run } = loadEngine();
        const vy = JSON.parse(run(`(()=>
        {
            setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
            const mk = (y, sy, m)=> { const b = new EngineObject3D(vec3(0, y, 0)); b.size3D = vec3(1, sy, 1);
                b.setCollision(); b.mass = m; b.restitution = 0; return b; };
            const floor = mk(-.5, 1, 0); floor.size3D = vec3(10, 1, 10);
            let j, c; const mj = ()=> j = mk(1, 2, 1), mc = ()=> c = mk(2.5, 1, 10);
            ${order === 'jumperFirst' ? 'mj(); mc();' : 'mc(); mj();'}
            for (let f = 0; f < 60; ++f) engineObjectsUpdate();
            j.velocity3D.y = .3;
            engineObjectsUpdate();
            return JSON.stringify(c.velocity3D.y);
        })()`));
        assert.ok(vy < .05, order + ': the heavy crate is not thrown at the jump speed, ' + vy);
    }
    const { run } = loadEngine();
    const x = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, 0, 0);
        const box = (pos, size, mass=1)=> { const o = new EngineObject3D(pos); o.size3D = size; o.setCollision();
            o.mass = mass; o.restitution = 0; return o; };
        const holder = box(vec3(0, 20, 0), vec3(1, 1, 1), 0);
        const wall = box(vec3(3, 0, 0), vec3(1, 4, 4), 0);
        holder.attach(wall);
        const e1 = box(vec3(50, 0, 0), vec3(1, 1, 1)), e2 = box(vec3(50.5, 0, 0), vec3(1, 1, 1)); // a settle first
        const crate = box(vec3(1.99, 0, 0), vec3(1, 1, 1)), pusher = box(vec3(1, 0, 0), vec3(1, 1, 1));
        pusher.collideWithObject = (o)=> { o === crate && wall.parent && holder.removeChild(wall); return true; };
        engineObjectsUpdate();
        pusher.velocity3D = vec3(.3, 0, 0);
        engineObjectsUpdate();
        return JSON.stringify(crate.pos3D.x);
    })()`));
    assert.ok(x <= 2.0001, 'the crate stops at the wall let go of that pass: ' + x);
});

test('destroy lets go of its children list first, so a child\'s callback can drop what it holds', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const player = new EngineObject(vec2(), vec2(1)), crate = new EngineObject(vec2(), vec2(1));
        player.addChild(crate);
        let length;
        crate.destroy = function(immediate) { length = player.children.length; EngineObject.prototype.destroy.call(this,
            immediate); };
        player.destroy();
        return JSON.stringify({length, after: player.children.length, parent: crate.parent === undefined});
    })()`));
    assert.deepEqual(result, {length: 0, after: 0, parent: true});
});

test('the touch gamepad turned off and on again leaves no let-go flag, and the capture zeroes the trackpad pinch', ()=>
{
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [] } });
    run(`touchGamepadInit = ()=> {}; touchGamepadRelayout = ()=> {};
        touchGamepadOverlay = {style: {display: '', opacity: 0}};
        touchGamepadStage = {getBoundingClientRect: ()=> ({left: 0, top: 0, width: 1000, height: 1000})};
        setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3); touchGamepadTimer.set();`);
    const frame = ()=> run('inputUpdate(); inputUpdatePost(); touchGamepadRender()');
    frame();
    run('touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1; touchGamepadPointerRole.set(1, "face0")');
    frame(); frame();
    run('setTouchGamepadEnable(false)'); frame();
    run('setTouchGamepadEnable(true); touchGamepadTimer.set()'); frame();
    assert.equal(run('!!gamepadLettingGo[0]'), false);

    run('inputCaptureOn = true; mouseWheel = 1; touchPinch = 0; inputWheelPinch = 1; inputCaptureMouse()');
    assert.deepEqual(JSON.parse(run('JSON.stringify([mouseWheel, touchPinch, inputWheelPinch])')), [0, 0, 0]);
});

test('Apply of autosaved objects placed on a map with no object layer makes the layer', async ()=>
{
    const items = {};
    const localStorage = { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
    const start = async ()=>
    {
        const e = loadEngine({ localStorage, location: { pathname: '/game/' } });
        e.run('setHeadlessMode(true)');
        await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
        return e;
    };
    const code = (tile)=> `
        class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Coin', Coin, {});
        var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16, nextlayerid: 2, nextobjectid: 1,
            layers: [{type: 'tilelayer', id: 1, name: 'a', width: 4, height: 3,
            data: [${tile},0,0,0, 0,0,0,0, 0,0,0,0]}]};
        editorJSONFetched('level.json', map);
        tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map);`;
    const first = await start();
    first.run(code(0) + `levelEditor.open(); var objects = editorLayers().find((l)=> l.isObjects);
        editorSelectLayer(objects);
        editorPlaceObjects(objects, vec2(1.5, 1.5), [{type: 'Coin', properties: [], offset: vec2()}]);`);
    const second = await start(); // the file changed outside the editor
    second.run(code(3) + 'levelEditor.open(); var rec = editorMapList[0];');
    assert.equal(second.run('editorApplyPending(rec)'), true);
    assert.equal(second.run('map.layers.filter((l)=> l.type === "objectgroup")[0].objects.length'), 1);
});
