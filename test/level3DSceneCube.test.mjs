import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A 3D level's scene block may name a sky box and an environment, each six image urls in loadCubeMap's order. They
// load in the background: the newest scene wins over a load still running, the same urls load once, and a load that
// fails leaves the setting as it was. The 3D editor keeps them with the rest of the scene, so taking them out of the
// block shows the game's own again. loadCubeMap is swapped for one that needs no images.

const sky = ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'];
const other = sky.map((url)=> 'other/' + url);

async function loadGame()
{
    const store = {};
    const engine = loadEngine({ localStorage: { getItem: (k)=> store[k] ?? null, setItem: (k, v)=> store[k] = v },
        location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    // each load waits for its turn, so a test can finish them in any order; a url with 'bad' in it fails
    engine.run(`var loads = [];
        loadCubeMap = (urls)=> new Promise((resolve, reject)=> loads.push({urls, finish: ()=>
            urls.some((url)=> url.includes('bad')) ? reject(new Error('no ' + urls[0])) :
            resolve(Object.assign(new CubeMap(1, urls.map(()=> new Uint8Array(4))), {urls}))}));`);
    return engine;
}
const settle = ()=> new Promise((resolve)=> setTimeout(resolve));

test('a scene block\'s sky box and environment load, one cube map for the same urls', async ()=>
{
    const { run } = await loadGame();
    run(`level3DLoad({scene: {skyBox: ${JSON.stringify(sky)}, environment: ${JSON.stringify(sky)}}, objects: []})`);
    assert.equal(run('loads.length'), 1, 'the same six urls load once');
    assert.equal(run('render3D.skyBox'), undefined, 'nothing until it has loaded');
    run('loads[0].finish()');
    await settle();
    assert.deepEqual(JSON.parse(run('JSON.stringify(render3D.skyBox.urls)')), sky);
    assert.equal(run('render3D.environment === render3D.skyBox'), true);
});

test('the newest scene wins over a load still running', async ()=>
{
    const { run } = await loadGame();
    run(`level3DLoad({scene: {skyBox: ${JSON.stringify(sky)}}, objects: []});
        level3DLoad({scene: {skyBox: ${JSON.stringify(other)}}, objects: []});`);
    run('loads[1].finish()');
    await settle();
    run('loads[0].finish()');
    await settle();
    assert.deepEqual(JSON.parse(run('JSON.stringify(render3D.skyBox.urls)')), other);
});

test('a wrong value or a failed load leaves the game\'s setting', async ()=>
{
    const { run } = await loadGame();
    run(`var own = makeCubeMap(1, ()=> WHITE); render3D.skyBox = render3D.environment = own;
        level3DLoad({scene: {skyBox: ['one.png'], environment: [1, 2, 3, 4, 5, 6]}, objects: []});`);
    assert.equal(run('loads.length'), 0, 'not six urls, nothing loads');
    run(`level3DLoad({scene: {skyBox: ${JSON.stringify(sky.map((url)=> 'bad' + url))}}, objects: []})`);
    run('loads[0].finish()');
    await settle();
    assert.equal(run('render3D.skyBox === own && render3D.environment === own'), true);
    assert.equal(run('level3DSceneCubeMaps.size'), 0, 'a failed load is not kept, so it is tried again');
});

test('the editor puts the game\'s sky box back when the block loses it, and a load running then does not land', async ()=>
{
    const { run } = await loadGame();
    run(`var own = makeCubeMap(1, ()=> WHITE); render3D.skyBox = own;
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]};
        editorJSONFetched('levels/room.json', level);
        level3DLoad(level);
        levelEditor.open();
        editor3DChangeScene((scene={})=> ({...scene, skyBox: ${JSON.stringify(sky)}}));
        editor3DStrokeEnd();`);
    run('loads[0].finish()');
    await settle();
    assert.equal(run('render3D.skyBox !== own && !!render3D.skyBox'), true, 'the level\'s');
    run('editor3DUndo()');
    assert.equal(run('render3D.skyBox === own'), true, 'undo shows the game\'s again');

    // a scene whose load is still running when it goes
    run(`editor3DChangeScene((scene={})=> ({...scene, skyBox: ${JSON.stringify(other)}}));
        editor3DStrokeEnd(); editor3DUndo();`);
    run('loads.at(-1).finish()');
    await settle();
    assert.equal(run('render3D.skyBox === own'), true, 'the load that finished late is dropped');
    assert.deepEqual(JSON.parse(run('JSON.stringify(editor3DSceneFromView().skyBox ?? null)')), null,
        'the view of a game\'s own cube map has no urls to give a block');
});

test('a load still running does not overwrite a sky box the game set since, or a later level with none', async ()=>
{
    const { run } = await loadGame();
    run(`level3DLoad({scene: {skyBox: ${JSON.stringify(sky)}}, objects: []});
        var own = makeCubeMap(1, ()=> WHITE); render3D.skyBox = own;`);
    run('loads[0].finish()');
    await settle();
    assert.equal(run('render3D.skyBox === own'), true, 'the game set its own while it loaded');

    run(`render3D.skyBox = undefined;
        level3DLoad({scene: {skyBox: ${JSON.stringify(other)}}, objects: []});
        level3DLoad({objects: []});`);
    run('loads[1].finish()');
    await settle();
    assert.equal(run('render3D.skyBox'), undefined, 'a later level with no sky box came first');
});
