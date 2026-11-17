import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 36 of 2026-11-17: the pointer lock a camera took, and one the free camera or the game took; edit2D undo
// and strokeCancel inside changeObjects; a game tool's press that throws; setProperty and what the load would drop,
// and a class field with no value; class instances, null prototype objects and vectors as lists inside a property;
// speak with a rate or pitch that is not finite; the starter build's message for a tool of the wrong version

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

const lockSetup = `headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
    var exits = 0;
    mainCanvas = mainCanvas || {};
    mainCanvas.requestPointerLock = ()=> { document.pointerLockElement = mainCanvas; };
    document.exitPointerLock = ()=> { ++exits; document.pointerLockElement = null; };
    document.pointerLockElement = null;
    var locked = ()=> document.pointerLockElement === mainCanvas;
    function reset() { for (const c of cameraList.slice()) c.destroy(); cameraUpdatePost();
        document.pointerLockElement = null; exits = 0; }`;

test('a camera that took the pointer lock lets go when another drives, unless that one locks too (I1)', ()=>
{
    const { run } = loadEngine();
    run(lockSetup);
    const r = JSON.parse(run(`(()=>
    {
        // a third person camera with the lock, then a CameraControl3D on top
        const tp = new ThirdPersonCamera3D(vec3(), 6, .3); tp.lockPointer = true; tp.dragButton = 0;
        cameraUpdatePost(); inputData[0][0] = 3; tp.updateCamera(); inputData[0][0] = 0;
        const took = locked();
        new CameraControl3D(vec3(), 8); cameraUpdatePost();
        const underOrbit = locked();
        reset();
        // a first person camera with the lock, then a third person camera that locks too: it takes the lock on
        const eye = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); cameraUpdatePost();
        inputData[0][0] = 3; eye.update(); inputData[0][0] = 0;
        const chase = new ThirdPersonCamera3D(vec3(), 6, .3); chase.lockPointer = true; cameraUpdatePost();
        const handed = locked();
        eye.destroy(); // not the owner any more, leaves the lock alone
        const afterOld = locked();
        chase.destroy(); // the owner lets go
        return JSON.stringify({took, underOrbit, handed, afterOld, last: locked()});
    })()`));
    assert.deepEqual(r, {took: true, underOrbit: false, handed: true, afterOld: true, last: false});
});

test('a camera leaves alone a lock the free camera or the game took (I2)', ()=>
{
    const { run } = loadEngine();
    run(lockSetup);
    const r = JSON.parse(run(`(()=>
    {
        // the free camera on while a first person camera sits under a cutscene camera
        const eye = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0), cut = new CameraControl3D(vec3(), 8);
        cameraUpdatePost(); editor3DSetFreeCamera(true);
        eye.update(); cut.update(); cameraUpdatePost();
        const free = locked();
        // the driving first person camera destroyed while the free camera is on, a respawn
        cut.destroy(); cameraUpdatePost(); eye.destroy();
        new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); cameraUpdatePost();
        const respawn = locked();
        editor3DSetFreeCamera(false); reset();
        // the game's own lock over a first person camera, with a camera of its own on top
        const under = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); new CameraControl3D(vec3(), 8);
        cameraUpdatePost(); pointerLockRequest(); under.update(); cameraUpdatePost();
        const game = locked();
        under.destroy(); cameraUpdatePost();
        return JSON.stringify({free, respawn, game, afterDestroy: locked(), exits});
    })()`));
    assert.deepEqual(r, {free: true, respawn: true, game: true, afterDestroy: true, exits: 0});
});

const doorMap = `class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
    objectLayersAddType('Door', Door, {hp: 3});
    var map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
        layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)},
        {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 56}]}]};
    tileLayersLoad(map, undefined, 0, 'ground'); objectLayersLoad(map); levelEditor.open();
    editorSelectLayer(editorObjectLayers(editorMapList.find((r)=> r.map === map))[0]);
    var ids = ()=> map.layers[1].objects.map((o)=> o.id);`;

test('edit2D undo and strokeCancel inside changeObjects assert and do nothing (E1)', async ()=>
{
    const { run } = await engine();
    run(doorMap);
    const r = JSON.parse(run(`(()=>
    {
        const edit = levelEditor.edit2D, said = [];
        edit.changeObjects((list)=> list.push({id: 2, type: 'Door', point: true, x: 24, y: 24})); edit.strokeEnd();
        const tryIt = (f)=> edit.changeObjects((list)=>
        {
            try { f(); } catch (e) { said.push(e.message.replace(/^Assert failed: /, '')); }
            list[0].x = 40;
        });
        tryIt(()=> edit.undo()); edit.strokeEnd();
        tryIt(()=> edit.strokeCancel()); edit.strokeEnd();
        const before = ids();
        edit.undo(); edit.undo(); edit.undo();
        return JSON.stringify({said, before, undone: ids()});
    })()`));
    assert.deepEqual(r.said, ['undo can not be called inside changeObjects',
        'strokeCancel can not be called inside changeObjects']);
    assert.deepEqual(r.before, [1, 2]);
    assert.deepEqual(r.undone, [1], 'the door added is still in history');
});

test('a game tool whose press edits and then throws ends its stroke, in 2D and 3D (E2)', async ()=>
{
    const { run } = await engine();
    run(doorMap);
    const r2 = JSON.parse(run(`(()=>
    {
        let next = 2, throwOnce = true;
        levelEditor.addTool('Drop', {onPress()
        {
            const id = next++;
            levelEditor.edit2D.changeObjects((l)=> l.push({id, type: 'Door', point: true, x: 8 * id, y: 8}));
            if (throwOnce) { throwOnce = false; throw new Error('game bug'); }
        }});
        levelEditor.tool = 'Drop';
        const press = ()=>
        {
            inputData[0][0] = 3; try { editorUpdate(); } catch { }
            inputData[0][0] = 0; editorUpdate();
        };
        press(); press();
        const both = ids();
        editorUndo();
        return JSON.stringify({both, undone: ids(), open: !!editorStroke});
    })()`));
    assert.deepEqual(r2, {both: [1, 2, 3], undone: [1, 2], open: false}, '2D: one undo takes back only the second');

    const { run: run3 } = await engine({}, true);
    const r3 = JSON.parse(run3(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        let throwOnce = true, x = 2;
        levelEditor.addTool('Drop', {onPress()
        {
            const at = x++;
            levelEditor.edit3D.change((list)=> list.push({id: at, type: 'Box', pos: [at, .5, .5]}));
            if (throwOnce) { throwOnce = false; throw new Error('game bug'); }
        }});
        levelEditor.tool = 'Drop';
        const press = ()=>
        {
            inputData[0][0] = 3; try { engineStep(); } catch { }
            inputData[0][0] = 0; engineStep();
        };
        press(); press();
        const both = level.objects.map((o)=> o.id);
        editor3DUndo();
        return JSON.stringify({both, undone: level.objects.map((o)=> o.id)});
    })()`));
    assert.deepEqual(r3, {both: [1, 2, 3], undone: [1, 2]}, '3D: one undo takes back only the second');
});

test('edit3D.setProperty refuses what the load would drop, takes a class field with no value left out, and says '
    + 'what is wrong with the value (D1, D2, D4)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class AI { target; speed = 1; copy() { const a = new AI; a.speed = this.speed; return a; } }
        class Stats { hp = 3; }
        level3DAddType('Chest', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {loot: {gold: 5, gem: {kind: 1}}, path: {to: vec3(1, 2, 3)}, ai: new AI});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Chest', pos: [0, 0, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        const tryIt = (name, value)=>
        {
            try { return edit.change((list)=> edit.setProperty(list[0], name, value)); }
            catch (e) { said.push(e.message.replace(/^Assert failed: setProperty: /, '')); }
        };
        tryIt('loot', {gold: 'x', gem: {kind: 2}});
        tryIt('loot', {gold: 2, gem: null});
        tryIt('ai', {speed: 2, target: new Stats});
        const path = tryIt('path', {to: [4, 5, 6]});
        const ai = tryIt('ai', {...level.objects[0].properties?.ai, speed: 4});
        edit.strokeEnd();
        const made = editor3DInstances.get(1);
        return JSON.stringify({said, path, ai, saved: level.objects[0].properties,
            game: {to: [made.path.to.x, made.path.to.y, made.path.to.z], ai: made.ai instanceof AI, speed: made.ai.speed}});
    })()`));
    assert.deepEqual(r.said, [
        'loot has a member the load would not read: .gold is a string, its default a number, the default is kept',
        'loot has a member the load would not read: .gem is a null, its default an object, the default is kept',
        'ai can not be given an instance of a class, nor a value holding one, as the file brings it back a plain object']);
    assert.equal(r.path, true, 'a nested vector as a list is read');
    assert.equal(r.ai, true, 'a class field with no value may be left out');
    assert.deepEqual(r.saved, {path: {to: [4, 5, 6]}, ai: {speed: 4}});
    assert.deepEqual(r.game, {to: [4, 5, 6], ai: true, speed: 4});
});

test('a class instance or a null prototype object inside a property, and a vector as a list in a file (O1, O2, O3, O4)',
    async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class Sword { damage = 4; copy() { const s = new Sword; s.damage = this.damage; return s; } }
        class Bow { arrows = 5; copy() { const b = new Bow; b.arrows = this.arrows; return b; } shoot() { return 1; } }
        level3DAddType('T', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {loadout: {weapon: new Sword}, pack: {gold: 1, silver: 2}, cfg: {at: vec3(1, 2, 3), off: vec2(1, 2)}});
        const bare = Object.create(null); bare.gold = 7;
        const spawned = level3DSpawn('T', vec3(), undefined, undefined, {loadout: {weapon: new Bow}, pack: bare});
        const loaded = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'T', pos: [0, 0, 0],
            properties: {cfg: {at: [4, 5, 6], off: [3, 4]}}}]})[0];
        return JSON.stringify({weapon: [spawned.loadout.weapon instanceof Bow, spawned.loadout.weapon.shoot()],
            pack: [spawned.pack !== bare, spawned.pack.gold, spawned.pack.silver],
            cfg: [loaded.cfg.at.x, loaded.cfg.at.y, loaded.cfg.at.z, loaded.cfg.off.x, loaded.cfg.off.y,
                isVector3(loaded.cfg.at), isVector2(loaded.cfg.off)]});
    })()`));
    assert.deepEqual(r.weapon, [true, 1], 'a nested instance keeps its class');
    assert.deepEqual(r.pack, [true, 7, 2], 'a null prototype object is copied and merged');
    assert.deepEqual(r.cfg, [4, 5, 6, 3, 4, true, true], 'lists read as vectors inside an object property');
});

test('speak takes a rate or pitch that is not finite as 1 (K1)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        const spoken = [];
        globalThis.SpeechSynthesisUtterance = class { set rate(v) { if (!isFinite(v)) throw TypeError('rate');
            this.r = v; } set pitch(v) { if (!isFinite(v)) throw TypeError('pitch'); this.p = v; } };
        globalThis.speechSynthesis = {speak: (u)=> spoken.push([u.r, u.p]), cancel() {}};
        soundEnable = true;
        speak('hi', 1, NaN, Infinity);
        return JSON.stringify(spoken);
    })()`));
    assert.deepEqual(r, [[1, 1]]);
});
