import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// review 2026-09-30: a scene leave that throws, a redirected glTF, saves that overlap

test('a scene leave that throws does not leave every later switch blocked', ()=>
{
    const { run } = loadEngine();
    run(`setScene({leave() { throw Error('transient cleanup failure'); }});`);
    assert.throws(()=> run('setScene({})'), /transient cleanup failure/);
    run('getScene().leave = undefined');
    assert.doesNotThrow(()=> run('setScene({})'));
    assert.equal(run('sceneLeaving'), false);
});

test('a redirected glTF loads its buffers from beside the file it was redirected to', async ()=>
{
    const requests = [];
    const json = {asset: {version: '2.0'}, buffers: [{uri: 'mesh.bin', byteLength: 0}]};
    const { run } = loadEngine({ArrayBuffer, TextDecoder, fetch: async (url)=>
    {
        requests.push(url);
        if (requests.length === 1) return {ok: true, url: 'https://cdn.example/assets/model.gltf?v=2',
            arrayBuffer: async ()=> new TextEncoder().encode(JSON.stringify(json)).buffer};
        return {ok: true, arrayBuffer: async ()=> new ArrayBuffer(0)};
    }});
    await run(`loadGLTF('https://game.example/model')`);
    assert.equal(requests[1], 'https://cdn.example/assets/mesh.bin');
});

test('a glTF fetched with no response url still loads from beside its own url', async ()=>
{
    const requests = [];
    const json = {asset: {version: '2.0'}, buffers: [{uri: 'mesh.bin', byteLength: 0}]};
    const { run } = loadEngine({ArrayBuffer, TextDecoder, fetch: async (url)=>
    {
        requests.push(url);
        if (requests.length === 1)
            return {ok: true, arrayBuffer: async ()=> new TextEncoder().encode(JSON.stringify(json)).buffer};
        return {ok: true, arrayBuffer: async ()=> new ArrayBuffer(0)};
    }});
    await run(`loadGLTF('models/ship.gltf')`);
    assert.equal(requests[1], 'models/mesh.bin');
});

// two saves where the first one's write is slow: the file ends with the second, the newer one
async function saveInOrder(is3D)
{
    const streams = [], items = {};
    let disk;
    const handle = {name: 'level.json', async createWritable()
    {
        const stream = {text: undefined, async write(text) { this.text = text; },
            close() { return new Promise((resolve)=> { this.commit = ()=> { disk = this.text; resolve(); }; }); }};
        streams.push(stream);
        return stream;
    }};
    const { run } = loadEngine({showSaveFilePicker: async ()=> handle, handle,
        localStorage: {getItem: (key)=> items[key] ?? null, setItem: (key, value)=> items[key] = value}});
    run('setHeadlessMode(true); setEngineManualStep(true);');
    await run('engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{})');
    if (is3D) run(`new Render3DPlugin;
        var level = {littlejs3D: 1, objects: [{id: 1, type: 'Box', pos: [1, 0, 0]}]};
        editorJSONFetched('level.json', level); level3DLoad(level);
        var record = editor3DRecords.get(level); record.fileHandle = handle;`);
    else run(`var map = {width: 1, height: 1, tilewidth: 16, tileheight: 16, layers: [
        {id: 1, name: 'tiles', type: 'tilelayer', width: 1, height: 1, data: [1]}]};
        editorJSONFetched('level.json', map); tileLayersLoad(map);
        var record = editorMapList.find((r)=> r.map === map); record.fileHandle = handle;`);
    const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 0));
    const save = ()=> run(is3D ? 'editor3DSave()' : 'editorSave(record)');
    const value = ()=> is3D ? JSON.parse(disk).objects[0].pos[0] : JSON.parse(disk).layers[0].data[0];

    const first = save();
    while (!streams[0]?.commit) await tick();
    run(is3D ? 'level.objects[0].pos[0] = 2' : 'map.layers[0].data[0] = 2');
    const second = save();
    for (let i = 0; i < 5; ++i) await tick();
    assert.equal(streams.length, 1, 'the second save waits for the first');
    streams[0].commit();
    await first;
    assert.equal(value(), 1);
    while (!streams[1]?.commit) await tick();
    streams[1].commit();
    assert.equal(await second, 'written');
    assert.equal(value(), 2, 'the file holds the newer save');
    const baseline = run(is3D ? 'record.original[0].pos.x ?? record.original[0].pos[0]' :
        'record.original[0][0]');
    assert.equal(baseline, 2, 'and so does the baseline');
}

test('2D editor saves that overlap write in the order they were asked', ()=> saveInOrder(false));
test('3D editor saves that overlap write in the order they were asked', ()=> saveInOrder(true));

// pass 2: the feedback texture gets the frame, and loadGLTF takes blob and data urls

test('a self-contained glTF loads from a blob url and from a data url', async ()=>
{
    const text = JSON.stringify({asset: {version: '2.0'}, scenes: [{nodes: []}], scene: 0});
    const { run } = loadEngine({ArrayBuffer, TextDecoder, fetch});
    const blobUrl = URL.createObjectURL(new Blob([text], {type: 'model/gltf+json'}));
    try { assert.ok(await run(`loadGLTF('${blobUrl}')`)); }
    finally { URL.revokeObjectURL(blobUrl); }
    const dataUrl = 'data:model/gltf+json;base64,' + Buffer.from(text).toString('base64');
    assert.ok(await run(`loadGLTF('${dataUrl}')`));
});

test('post process feedback: the frame drawn is kept in the feedback texture, not the scene texture', ()=>
{
    // a gl that knows which unit is active and what is bound to each, and notes where each upload lands
    const uploads = [];
    let unit = 0, made = 0, drawn = false;
    const bound = {};
    const gl = new Proxy({
        TEXTURE0: 33984, TEXTURE1: 33985, TEXTURE2: 33986,
        createTexture: ()=> ({texture: ++made}),
        activeTexture: (u)=> unit = u - 33984,
        bindTexture: (target, texture)=> bound[unit] = texture,
        texImage2D: ()=> uploads.push({unit, texture: bound[unit], afterDraw: drawn}),
        drawArrays: ()=> drawn = true,
        getShaderParameter: ()=> true, getProgramParameter: ()=> true, isContextLost: ()=> false,
    }, {get: (target, key)=> key in target ? target[key] : ()=> ({})});
    const { run } = loadEngine({gl});
    run(`setHeadlessMode(false); engineInitialized = true; glEnable = true; glContext = gl;
        glCanvas = mainCanvas = {width: 4, height: 4};
        new PostProcessPlugin('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }', false, true);`);
    drawn = false, uploads.length = 0;
    run('pluginList.at(-1).render()');
    const feedback = run('postProcess.feedbackTexture'), scene = run('postProcess.texture');
    const kept = uploads.filter((u)=> u.afterDraw);
    assert.equal(kept.length, 1, 'one upload after the draw');
    assert.equal(kept[0].texture, feedback, 'it lands in the feedback texture');
    assert.ok(uploads.some((u)=> !u.afterDraw && u.texture === scene), 'the scene texture got the canvas');
    assert.equal(unit, 0, 'and the first unit is active again for the engine');
});
