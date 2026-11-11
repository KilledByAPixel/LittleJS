import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import { render3D, Render3DPlugin, vec3, EngineObject3D, engineObjectsUpdate, PathFinder, vec2 }
    from '../dist/littlejs.esm.js';

// the full pass over the codebase before 1.30: the fixes a test can hold

const storage = ()=>
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); },
        removeItem: (k)=> { delete items[k]; } };
};
async function load3D(localStorage=storage())
{
    const engine = loadEngine({ localStorage, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}

test('a level the 3D editor made, with no level loaded, comes back from its autosave with its scene and prefabs', async () =>
{
    const saves = storage();
    {
        const { run } = await load3D(saves);
        run(`editor3DSetOpen(true);
            editor3DChangeScene(()=> ({sunColor: '#ff0000'})); editor3DStrokeEnd();
            editor3DChangePart('prefabs', ()=> ({P: {objects: [{id: 1, type: 'Box'}]}})); editor3DStrokeEnd();
            editor3DPlace('P', vec3(0, 0, 0)); editor3DStrokeEnd();
            editor3DSetOpen(false);`);
    }
    const { run } = await load3D(saves);
    run('editor3DSetOpen(true)');
    assert.equal(run('render3D.sunColor.toString()'), '#ff0000ff', 'its scene is applied');
    assert.equal(run(`level3DPrefabs.has('P')`), true, 'its prefab is a type');
    assert.equal(run('editor3DInstances.size'), 1, 'and its instance is made');
});

test('Duplicate leaves the clipboard as it was, with the sizes of what was cut', async () =>
{
    const { run } = await load3D();
    run(`level3DLoad({ littlejs3D: 1, objects: [
        { id: 1, type: 'Box', pos: [0, 2, 0], scale: [1, 4, 1] },
        { id: 2, type: 'Box', pos: [5, .5, 0] }] });
        editor3DSelection.add(1); editor3DCut();
        editor3DSelection.clear(); editor3DSelection.add(2); editor3DDuplicate();`);
    assert.equal(run('editor3DClipboard[0].id'), 1);
    assert.equal(run('editor3DClipboardBoxes.get(editor3DClipboard[0])?.size.y'), 4, 'a paste lands it by its own box');
});

test('placing with a brush that is refused keeps the brush', async () =>
{
    const { run } = await load3D();
    run(`level3DLoad({ littlejs3D: 1, objects: [] });
        editor3DSetOpen(true);
        editor3DBrush = 'Box';
        editor3DRecords.get(editor3DLevel).pending = {objects: []};`); // an autosave waits for Apply or Drop
    run(`editor3DPress(vec2(), new Ray3D(vec3(0, 5, 0), vec3(0, -1, 0)), false)`);
    assert.equal(run('editor3DBrush'), 'Box');
    assert.equal(run('editor3DObjects().length'), 0);
    run(`editor3DRecords.get(editor3DLevel).pending = undefined;
        editor3DPress(vec2(), new Ray3D(vec3(0, 5, 0), vec3(0, -1, 0)), false)`);
    assert.deepEqual([run('editor3DBrush'), run('editor3DObjects().length')], [undefined, 1], 'placed, it is put down');
});

test('a game hook that throws as the 3D editor closes leaves the game its input', async () =>
{
    const { run } = await load3D();
    run(`level3DLoad({objects: []}); levelEditor.onClose = ()=> { throw new Error('game bug'); }; levelEditor.open()`);
    assert.throws(()=> run('levelEditor.close()'), /game bug/);
    assert.deepEqual([run('levelEditor.isOpen'), run('inputCaptureOn')], [false, false]);
});

test('the touch gamepad taking touch mid touch lets go of the mouse button the finger held', ()=>
{
    const engine = loadEngine({ window: { ontouchstart: null } });
    const { run } = engine;
    const finger = (identifier, x, y=100)=> ({ identifier, clientX: x, clientY: y, target: {} });
    const fire = (type, touches, changed=touches)=> engine.handlers[type]({ type, touches, changedTouches: changed,
        target: {}, cancelable: true, preventDefault() {} });
    fire('touchstart', [finger(1, 100)]);
    assert.equal(run('mouseIsDown(0)'), true);
    run('touchGamepadEnable = true; touchGamepadPassthrough = false');
    fire('touchend', [], [finger(1, 100)]);
    assert.equal(run('mouseIsDown(0)'), false);
    run('touchGamepadEnable = false; inputData[0][0] = 0');
    fire('touchstart', [finger(2, 100)]);
    assert.equal(run('mouseWasPressed(0)'), true, 'the first tap after it is off again presses');
});

test('Debug Tiles calls only the solid layer collision', ()=>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); debugTiles = 2;
        var art = new TileCollisionLayer(vec2(), vec2(4)), solid = new TileCollisionLayer(vec2(), vec2(4));
        art.isSolid = false;`);
    assert.doesNotMatch(run('debugTilesLabel([art, solid])'), /collision/);
    assert.match(run('debugTiles = 3, debugTilesLabel([art, solid])'), /collision/);
});

test('with debugShowErrors an ASSERT throws its own error, which says what its values are', ()=>
{
    const element = ()=> ({ style: {}, replaceChildren() {} });
    const { run } = loadEngine({ document: { body: element(), createElement: element, addEventListener() {} },
        console: { ...console, assert() {} } });
    run('debugShowErrors()');
    assert.throws(()=> run(`ASSERT(false, 'bad', {a: 1})`), (e)=> e.name === 'Error' && /bad \{"a":1\}/.test(e.message));
    assert.throws(()=> run(`console.assert(false, 'game')`), (e)=> /Assertion failed!/.test(e.message));
});

test('a 3D child with mass is held by its parent, gravity does not pull it away', ()=>
{
    new Render3DPlugin;
    const gravity = render3D.gravity;
    render3D.gravity = vec3(0, -.01, 0);
    const parent = new EngineObject3D(vec3(0, 5, 0));
    const crate = new EngineObject3D(vec3());
    crate.mass = 1;
    parent.addChild(crate);
    crate.setCollision(false, false, false);
    for (let i = 0; i < 60; ++i)
        engineObjectsUpdate();
    assert.equal(crate.pos3D.y, 0);
    render3D.gravity = gravity;
    parent.destroy();
});

test('a path finder node at coordinates that are not whole is null', ()=>
{
    const finder = new PathFinder(vec2(4), ()=> false);
    assert.equal(finder.getNode(1.5, 1), null);
    assert.equal(finder.getNode(NaN, 1), null);
    assert.equal(finder.getNode(2, .25), null);
    assert.ok(finder.getNode(2, 1));
});

test('setScene from a leave, in a release build, is left out and does not call itself', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run('setHeadlessMode(true)');
    run(`var calls = 0, game = {}, menu = {leave() { ++calls; setScene(game); }};
        setScene(menu); setScene(undefined)`);
    assert.deepEqual([run('calls'), run('getScene()')], [1, undefined]);
});

test('Wavedash gives an achievement up after its retries, not after the sends of many unlocks at once', ()=>
{
    let loaded = false;
    const taken = [], items = {}, timers = [];
    const sdk = { init() {}, setAchievement(id) { if (!loaded) return false; taken.push(id); return true; } };
    const { run } = loadEngine({ Wavedash: sdk, TextEncoder, TextDecoder,
        localStorage: { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } },
        setTimeout: (f)=> (timers.push(f), timers.length), clearTimeout: (id)=> { timers[id - 1] = undefined; } });
    run('setHeadlessMode(true)');
    items['m'] = JSON.stringify({0: {unlocked: true}});
    run(`for (let i = 0; i < 31; ++i) new WavedashMedal(i, 'ACH_' + i, 'M' + i);
        medalsInit('m'); new WavedashPlugin();
        for (let i = 1; i < 31; ++i) medals[i].unlock();`);
    loaded = true;
    timers.splice(0).forEach((f)=> f?.());
    assert.equal(taken.length, 31);
});

test('a tweak added again for a new object drives the new one from its number box', ()=>
{
    const inputs = [];
    const element = (tag)=>
    {
        const e = { tagName: tag.toUpperCase(), style: {}, children: [], textContent: '',
            appendChild(c) { this.children.push(c); return c; }, replaceChildren() { this.children = []; },
            addEventListener() {}, contains: ()=> false, blur() {} };
        tag === 'input' && inputs.push(e);
        return e;
    };
    const document = { addEventListener() {}, hasFocus: ()=> true, body: element('body'), hidden: false,
        createElement: element, activeElement: undefined };
    const { run } = loadEngine({ document });
    run(`var game = {player: {speed: 5}};
        tweak('player.speed', {object: game, label: 'speed', min: 0, max: 10});
        debugTweakables = true; tweakRender();
        var game2 = {player: {speed: 5}}; tweak('player.speed', {object: game2, label: 'speed', min: 0, max: 10});
        tweakRender();`);
    const box = inputs.filter((i)=> i.type === 'number').at(-1);
    box.value = '8';
    box.oninput();
    assert.deepEqual([run('game.player.speed'), run('game2.player.speed')], [5, 8]);
});

test('the first tile of a texture no wider than the tile with its padding is its corner, not NaN', ()=>
{
    const { run } = loadEngine();
    run('textureInfos[0] = new TextureInfo({width: 16, height: 16})');
    assert.equal(run('tile(0, 16, 0, 1).pos.toString()'), vec2(1, 1).toString());
});
