import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 25 of 2026-11-15: a second 3D level beside the first; the 3D editor's Ctrl letters on a Cyrillic layout
// and a game's own Ctrl key first; a game's pointerLockExit let go a frame late; engineStep inside an update; a 2D
// type's property setter followed by an edit; a door crushing a body against a fixed box in every order; a child
// handed to another parent during its parent's destroy; a touch after the mouse left; the wheel without focus; a
// palette with no image steady

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} }, ()=> {}, ()=> {},
        ()=> {}, ()=> {})`);
    return e;
}

test('a level loaded beside the first keeps the first one\'s edited and placed objects', async ()=>
{
    const { run } = await engine({}, true);
    run(`var roomA = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]};
        var roomB = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [100, 0, 0]}]};
        level3DLoad(roomA); engineStep(2); levelEditor.open(); engineStep();
        editor3DChange((list)=> { list[0].properties = {color: '#ff0000'}; }); editor3DStrokeEnd();
        levelEditor.edit3D.place('Box', vec3(5, 0, 0)); editor3DStrokeEnd();
        levelEditor.close(); engineStep();
        level3DLoad(roomB); engineStep();`);
    const xs = JSON.parse(run(`JSON.stringify(engineObjects.filter((o)=> !o.destroyed && o.mesh).map((o)=> o.pos3D.x)
        .sort((a, b)=> a - b))`));
    assert.deepEqual(xs, [0, 5, 100]);
});

test('the 3D editor\'s Ctrl+Z on a Cyrillic layout undoes by position, and a game\'s own Ctrl key goes first',
    async ()=>
{
    const { run, handlers } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} },
        location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]});
        levelEditor.open();
        editor3DSelection.add(1); editor3DSetSelectedTransform('pos', vec3(3, 0, 0)); editor3DStrokeEnd();`);
    const keydown = (key, code)=> handlers.keydown({ type: 'keydown', key, code, ctrlKey: true, metaKey: false,
        shiftKey: false, altKey: false, repeat: false, target: {}, preventDefault() {} });
    const press = (code)=> run(`inputData[0].ControlLeft = 1; inputData[0].${code} = 3; engineStep();
        inputData[0].${code} = 0; inputData[0].ControlLeft = 0; engineStep();`);
    keydown('я', 'KeyZ'); press('KeyZ');
    assert.equal(run('editor3DObject(1).pos[0]'), 0, 'undone on a Cyrillic layout');

    // a game's own ctrl+y, on the key QWERTZ prints Z on: the game's runs, the editor's undo does not
    run(`editor3DSetSelectedTransform('pos', vec3(4, 0, 0)); editor3DStrokeEnd();
        var gameKey = 0; levelEditor.addKey('ctrl+y', ()=> ++gameKey);`);
    keydown('z', 'KeyY'); press('KeyY');
    assert.deepEqual(JSON.parse(run('JSON.stringify([gameKey, editor3DObject(1).pos[0]])')), [1, 4]);
});

test('a game\'s own pointerLockExit, let go by the browser a frame later, keeps the game playing', async ()=>
{
    for (const delay of [0, 1, 2])
    {
        const { run } = await engine({}, true);
        run(`level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, 0, 0]}]});
            engineStep(2); levelEditor.open();`);
        const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
        run('editor3DSetOpen(false); document.pointerLockElement = mainCanvas');
        step(); step();
        run('pointerLockExit()');
        for (let i = 0; i < delay; ++i) step();
        run('document.pointerLockElement = undefined');
        step(); step();
        assert.equal(run('editor3DIsOpen'), false, delay + ' frames late');
    }
});

test('engineStep inside an update is refused, so a recorder started from a key does not recurse', async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        let calls = 0, threw = '';
        const update = ()=> { ++calls; if (calls < 50) try { engineStep(); } catch (e) { threw = e.message; } };
        engineAddPlugin(update);
        engineStep();
        return JSON.stringify({calls, threw});
    })()`));
    assert.equal(result.calls, 1);
    assert.match(result.threw, /engineStep can not be called from inside an update/);
});

test('a 2D type with a property setter follows an edit in the editor, as EDITOR.md shows', async ()=>
{
    const { run } = await engine();
    const result = JSON.parse(run(`(()=>
    {
        class Gem extends EngineObject
        {
            constructor(pos) { super(pos, vec2(1)); this.value = 1; }
            set value(value) { this.worth = value; this.size = vec2(.5 + value * .25); }
            get value() { return this.worth; }
        }
        objectLayersAddType('Gem', Gem, {value: 1});
        const map = {width: 8, height: 4, tilewidth: 16, tileheight: 16, layers: [
            {type: 'tilelayer', name: 'a', width: 8, height: 4, data: new Array(32).fill(0)},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [{id: 1, type: 'Gem', x: 16, y: 16, point: true,
                properties: [{name: 'value', type: 'int', value: 3}]}]}]};
        tileLayersLoad(map, undefined, 0, 0);
        const [gem] = objectLayersLoad(map);
        const loaded = gem.size.x;
        levelEditor.open();
        const objects = editorLayers().find((l)=> l.isObjects);
        editorChangeObjects(objects, (list)=> { list[0].properties[0].value = 5; }); editorStrokeEnd();
        const made = [...objects.instances.values()][0];
        return JSON.stringify({loaded, edited: made.size.x, value: made.value});
    })()`));
    assert.deepEqual(result, {loaded: 1.25, edited: 1.75, value: 5});
});

test('a door crushing a body against a fixed box wall leaves it out of the wall in every list order', ()=>
{
    for (const order of ['wpb', 'wbp', 'pwb', 'pbw', 'bwp', 'bpw'])
    {
        const { run } = loadEngine();
        const into = JSON.parse(run(`(()=>
        {
            setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
            const f = new EngineObject3D(vec3(0, -.5, 0)); f.size3D = vec3(40, 1, 40); f.setCollision(); f.mass = 0;
            const make = {
                w: ()=> { const w = new EngineObject3D(vec3(3.1, 2, 0)); w.size3D = vec3(.2, 4, 40); w.setCollision();
                    w.mass = 0; return w; },
                b: ()=> { const b = new EngineObject3D(vec3(0, .5, 0)); b.size3D = vec3(1, 1, 1); b.setCollision();
                    b.mass = 1; b.restitution = 0; return b; },
                p: ()=> { const p = new EngineObject3D(vec3(-1.5, .6, 0)); p.size3D = vec3(1, 1, 3); p.setCollision();
                    p.mass = 0; p.gravityScale = 0; return p; } };
            const o = {};
            for (const c of ${JSON.stringify(order)}) o[c] = make[c]();
            for (let fr = 0; fr < 20; ++fr) engineObjectsUpdate();
            let deepest = 0;
            for (let fr = 0; fr < 150; ++fr)
            {
                o.p.velocity3D = vec3(o.p.pos3D.x < 1.95 - 1e-9 ? Math.min(.05, 1.95 - o.p.pos3D.x) : 0, 0, 0);
                engineObjectsUpdate();
                deepest = Math.max(deepest, o.b.pos3D.x + .5 - 3);
            }
            return JSON.stringify(deepest);
        })()`));
        assert.ok(into < .01, order + ': into the wall ' + into);
    }
});

test('a child a sibling hands to another parent during its parent\'s destroy is kept', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const player = new EngineObject(vec2(), vec2(1)), cart = new EngineObject(vec2(5, 0), vec2(1));
        const item = new EngineObject(vec2(), vec2(1));
        class Hand extends EngineObject
        { destroy(immediate) { if (this.destroyed) return; super.destroy(immediate); cart.attach(item); } }
        player.addChild(new Hand(vec2(), vec2(1)));
        player.addChild(item);
        player.destroy();
        return JSON.stringify({destroyed: item.destroyed, onCart: item.parent === cart});
    })()`));
    assert.deepEqual(result, {destroyed: false, onCart: true});
});

test('a tap reaches the UI after the mouse left, and a wheel on a page without focus reaches no game', ()=>
{
    const { run, handlers } = loadEngine({ window: { ontouchstart: null } });
    run('mouseInWindow = false');
    const touch = { identifier: 1, clientX: 100, clientY: 100, target: {} };
    handlers.touchstart({ type: 'touchstart', touches: [touch], changedTouches: [touch], target: {}, cancelable: false,
        preventDefault() {} });
    assert.equal(run('mouseInWindow'), true);
    run('document.hasFocus = ()=> false; mouseWheel = 0');
    handlers.wheel({ type: 'wheel', deltaY: 100, deltaMode: 0, ctrlKey: false, target: {}, cancelable: true,
        preventDefault() {} });
    assert.equal(run('mouseWheel'), 0);
});

test('a palette with no image is the same list each time, so the panel does not redraw it every frame', async ()=>
{
    const { run } = await engine();
    assert.equal(run('editorPaletteTiles({live: new TileLayer(vec2(), vec2(2))}) === ' +
        'editorPaletteTiles({live: new TileLayer(vec2(), vec2(2))})'), true);
});
