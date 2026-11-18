import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 35 of 2026-11-17: walking downhill off terrain onto a lower floor listed first; level3DSpawn with an
// instance of a class; a plain object default from a file and setProperty over it; undo and strokeCancel inside a
// change and a 2D change inside a change; a 3D camera's pointer lock and driving; a lens flare after the editor; a
// held slider whose missed release meets a disabled button or a panel

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a body walking downhill off terrain onto a floor a little lower, either listed first, never sinks into it (C1, C2)',
    ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);');
    for (const kind of ['mesh', 'hmap'])
        for (const floorFirst of [true, false])
        {
            const r = JSON.parse(run(`(()=>
            {
                let terrainShape;
                const slope = .6, top = -.03;
                const terrain = ()=> { const h = []; for (let j = 0; j <= 32; ++j) { h.push([]);
                    for (let i = 0; i <= 32; ++i) h[j].push(-slope * (i - 16)); }
                    terrainShape = new HeightMap(h, vec2(32, 32), 1); };
                const floor = ()=>
                {
                    if ('${kind}' === 'hmap')
                    {
                        const h = []; for (let j = 0; j <= 8; ++j) { h.push([]); for (let i = 0; i <= 8; ++i) h[j].push(0); }
                        return new HeightMap(h, vec2(8, 16), 1, undefined, vec3(4, top, 0));
                    }
                    return new MeshCollider(buildBox(vec3(8, 4, 16)), vec3(4, top - 2, 0));
                };
                ${floorFirst ? 'floor(); terrain();' : 'terrain(); floor();'}
                const body = new EngineObject3D(vec3(-4, slope * 4 + .6, 0)); body.size3D = vec3(1);
                body.setCollision(); body.mass = 1;
                for (let f = 0; f < 30; ++f) { body.velocity3D.x = 0; engineObjectsUpdate(); }
                let low = Infinity, onTerrain = 0;
                for (let f = 0; f < 200 && body.pos3D.x < 7; ++f)
                {
                    body.velocity3D.x = .2; engineObjectsUpdate();
                    if (body.pos3D.x < .05) continue;
                    low = Math.min(low, body.pos3D.y - .5 - top);
                    body.groundObject === terrainShape && ++onTerrain;
                }
                engineObjectsDestroy();
                return JSON.stringify({low, onTerrain});
            })()`));
            const name = `${kind}${floorFirst ? ' floor first' : ''}: ` + JSON.stringify(r);
            assert.ok(r.low > -1e-3, name);
            assert.equal(r.onTerrain, 0, name);
        }
});

test('level3DSpawn keeps an instance of a class given over a class or a plain default as itself (O1)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        class Sword { damage = 4; copy() { const s = new Sword; s.damage = this.damage; return s; } }
        class Bow { arrows = 5; #hp = 10; get hp() { return this.#hp; } set hp(v) { this.#hp = v; }
            copy() { const b = new Bow; b.arrows = this.arrows; b.hp = this.hp; return b; } shoot() { return 1; } }
        level3DAddType('Hero', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {weapon: new Sword, pack: {gold: 1}});
        const bow = new Bow; bow.hp = 3;
        const hero = level3DSpawn('Hero', vec3(), undefined, undefined, {weapon: bow, pack: bow});
        const fromFile = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Hero', pos: [0, 0, 0],
            properties: {weapon: {damage: 9}, pack: {}}}]})[0];
        return JSON.stringify({weapon: [hero.weapon instanceof Bow, hero.weapon !== bow, hero.weapon.hp,
            hero.weapon.shoot()], pack: [hero.pack instanceof Bow, hero.pack.hp],
            file: [fromFile.weapon instanceof Sword, fromFile.weapon.damage, fromFile.pack]});
    })()`));
    assert.deepEqual(r.weapon, [true, true, 3, 1], 'its own copy, of its class, with its state');
    assert.deepEqual(r.pack, [true, 3]);
    assert.deepEqual(r.file, [true, 9, {gold: 1}], 'a file\'s object still merges, {} the whole default');
});

test('edit3D undo and strokeCancel inside change assert and do nothing; edit2D changeObjects inside one too (D3, E1)',
    async ()=>
{
    const { run } = await engine({}, true);
    const r3 = JSON.parse(run(`(()=>
    {
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [.5, .5, .5]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        edit.change((list)=> edit.setTransform(list[0], vec3(3, .5, .5))); edit.strokeEnd();
        const tryIt = (f)=> { try { edit.change(f); } catch (e) { said.push(e.message.replace(/^Assert failed: /, '')); } };
        tryIt(()=> edit.undo());
        tryIt(()=> edit.strokeCancel());
        return JSON.stringify({said, pos: level.objects[0].pos, undo: editor3DUndoList.length,
            redo: editor3DRedoList.length});
    })()`));
    assert.deepEqual(r3.said, ['undo can not be called inside change', 'strokeCancel can not be called inside change']);
    assert.deepEqual(r3.pos, [3, .5, .5]);
    assert.equal(r3.undo, 1, 'the move is still in history');

    const { run: run2 } = await engine();
    const r2 = JSON.parse(run2(`(()=>
    {
        class Door extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Door', Door, {hp: 3});
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 2, nextlayerid: 3,
            layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4, data: new Array(16).fill(1)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Door', point: true, x: 8, y: 56}]}]};
        tileLayersLoad(map, undefined, 0, 'ground'); objectLayersLoad(map); levelEditor.open();
        editorSelectLayer(editorObjectLayers(editorMapList.find((r)=> r.map === map))[0]);
        const edit = levelEditor.edit2D, said = [];
        let inner;
        const changed = edit.changeObjects((list)=>
        {
            try { inner = edit.changeObjects((l)=> l.push({id: 9, type: 'Door', point: true, x: 24, y: 24})); }
            catch (e) { said.push(e.message.replace(/^Assert failed: /, '')); }
            edit.setProperty(list[0], 'hp', 5); // the outer one still works after
        });
        editorStrokeEnd();
        return JSON.stringify({said, inner, changed, objects: map.layers[1].objects.map((o)=> o.id),
            properties: map.layers[1].objects[0].properties});
    })()`));
    assert.deepEqual(r2.said, ['changeObjects inside changeObjects changes nothing']);
    assert.equal(r2.changed, true);
    assert.deepEqual(r2.objects, [1], 'nothing added by the inner one');
    assert.deepEqual(r2.properties, [{name: 'hp', type: 'int', value: 5}]);
});

test('a first person camera\'s pointer lock follows driving, and one not driving keeps the driver\'s lock (I1)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; timeDelta = 1/60;
        let locked = false, exits = 0;
        pointerLockRequest = ()=> { locked = true; };
        pointerLockExit = ()=> { ++exits; locked = false; };
        pointerLockIsActive = ()=> locked;
        const eye = new FirstPersonCamera3D(vec3(5, 1, 5), 0, 0); cameraUpdatePost();
        inputData[0][0] = 3; eye.update(); inputData[0][0] = 0;
        const tookLock = locked;
        // a cutscene camera on its defaults, which does not lock the mouse
        const cut = new ThirdPersonCamera3D(vec3(), 6, .3); cameraUpdatePost();
        mouseDeltaScreen = vec2(40, 0); eye.update(); cut.updateCamera(); mouseDeltaScreen = vec2();
        const cutscene = {locked, yaw: cut.yaw};
        cut.destroy(); eye.destroy(); cameraUpdatePost();
        // two first person cameras, the newer driving with the lock, the older destroyed
        const a = new FirstPersonCamera3D(vec3(0, 1, 0), 0, 0), b = new FirstPersonCamera3D(vec3(3, 1, 0), 0, 0);
        cameraUpdatePost(); inputData[0][0] = 3; a.update(); b.update(); inputData[0][0] = 0;
        exits = 0; a.destroy();
        const switched = {locked, exits};
        b.destroy(); cameraUpdatePost(); // let go at the camera update after
        return JSON.stringify({tookLock, cutscene, switched, last: {locked, exits}});
    })()`));
    assert.equal(r.tookLock, true);
    assert.deepEqual(r.cutscene, {locked: false, yaw: 0}, 'let go under a camera with no lock, which does not turn');
    assert.deepEqual(r.switched, {locked: true, exits: 0}, 'the driver keeps its lock');
    assert.deepEqual(r.last, {locked: false, exits: 1}, 'the driver lets go when it is destroyed');
});

test('a lens flare is set from the game\'s camera at once after the level editor closes (G1)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; timeDelta = 1/60; mainCanvasSize = vec2(800, 600);
        render3D.sunDirection = vec3(0, 0, -1); render3D.updateMatrices();
        const flare = new LensFlare3D;
        const wall = new EngineObject3D(vec3(0, 0, -10), render3D.boxMesh); wall.scale3D = vec3(4, 4, .2);
        flare.update();
        const gameCamera = render3D.camera, editorCamera = new Camera3D; editorCamera.pos = vec3(10, 0, 0);
        engineFrozenTick = true; render3D.camera = editorCamera; render3D.updateMatrices();
        const underEditor = flare.getScreenElements().length;
        engineFrozenTick = false; render3D.camera = gameCamera; render3D.updateMatrices();
        flare.update();
        return JSON.stringify({underEditor, after: flare.visible});
    })()`));
    assert.ok(r.underEditor > 0, 'shown to the editor\'s camera');
    assert.equal(r.after, 0, 'hidden by the wall from the first update after');
});

test('a held slider whose release was missed does not follow a press a disabled button or a panel used up (P1, P2)',
    async ()=>
{
    for (const kind of ['disabled', 'panel'])
    {
        const { run } = await engine();
        const r = JSON.parse(run(`(()=>
        {
            new UISystemPlugin;
            const slider = new UISlider(vec2(0, -100), vec2(400, 40), .5);
            // made after the slider, so it updates first
            const other = '${kind}' === 'panel' ? new UIObject(vec2(0, 100), vec2(200, 50)) :
                new UIButton(vec2(0, 100), vec2(200, 50), 'Go');
            '${kind}' === 'panel' ? other.interactive = false : other.disabled = true;
            engineStep();
            mousePosScreen = slider.nativePos.copy(); inputData[0][0] = 3; engineStep();
            mousePosScreen = slider.nativePos.add(vec2(-100, 0)); inputData[0][0] = 1; engineStep();
            const held = slider.value;
            // its release missed, then a press on the other object, dragged across
            mousePosScreen = other.nativePos.add(vec2(90, 0)); inputData[0][0] = 3; engineStep();
            const active = uiSystem.activeObject === slider;
            mousePosScreen = other.nativePos.add(vec2(-90, 0));
            inputData[0][0] = 1; engineStep(); inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep();
            return JSON.stringify({held, final: slider.value, active});
        })()`));
        assert.equal(r.final, r.held, kind);
        assert.equal(r.active, false, kind + ': let go at the new press');
    }
});
