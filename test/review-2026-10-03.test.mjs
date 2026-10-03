import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The reviews of 2026-10-03, the third pass updated and the fourth: tile sets and maps, a hidden layer of values,
// the flare's lamp, and a tween looping with no time.

function load()
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    return run;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code}) ?? 'null'`));

// a tile set of two tiles, the second on another sheet at a place no grid gives
const setCode = `var sheet = new TextureInfo({width: 64, height: 64}, false), other = new TextureInfo({width: 64, height: 64}, false);
    var set = new TileInfo(vec2(), vec2(16), sheet, 0, 0);
    set.tiles = [new TileInfo(vec2(), vec2(16), sheet, 0, 0), new TileInfo(vec2(20, 30), vec2(16), other, 0, 0)];`;

test('a tile set given to a map whose tileset has a margin or a spacing keeps its own tiles', ()=>
{
    const run = load();
    run(setCode + `var [layer] = tileLayersLoad({width: 2, height: 1, tilesets: [{firstgid: 1, spacing: 1, columns: 2}],
        layers: [{data: [1, 2]}]}, set, 0, undefined, false);
        var second = editorTileInfo(layer, 1);`);
    assert.deepEqual(json(run, '[layer.tileInfo.tiles === set.tiles, second.pos.x, second.pos.y, second.textureInfo === other]'),
        [true, 20, 30, true]);
});

test('a map with a bad layer under good ones makes none of them, so nothing is left behind by the throw', ()=>
{
    const run = load();
    run('var before = engineObjects.length;');
    assert.throws(()=> run(`tileLayersLoad({width: 2, height: 1, layers: [{data: [1]}, {data: [1, 0]}]},
        undefined, 0, undefined, false)`), /tileLayersLoad/);
    assert.equal(run('engineObjects.length - before'), 0);
    assert.throws(()=> run(`tileLayersLoad({width: 2, height: 1}, undefined, 0, undefined, false)`), /tileLayersLoad/,
        'a map with no layers says so in any build');
});

test('a tile past the end of a sheet read by its columns draws nothing, as a layer of collision values has', ()=>
{
    const run = load();
    run(`var sheet = new TileInfo(vec2(), vec2(16), new TextureInfo({width: 17, height: 16}, false), .5, 0, 1);
        var layer = new TileLayer(vec2(), vec2(2, 1), sheet), drawn = [];
        layer.drawLayerTile = (pos, size, tileInfo)=> drawn.push(tileInfo.pos.y);
        layer.setData(vec2(0, 0), new TileLayerData(0)); layer.setData(vec2(1, 0), new TileLayerData(99));
        layer.context = {}; drawContext = layer.context; layer.clearLayerRect = ()=> {};
        for (let x = 0; x < 2; ++x) TileLayer.prototype.drawTileData.call(layer, vec2(x, 0));`);
    assert.deepEqual(json(run, 'drawn'), [0], 'the first tile, and nothing for 99');
});

test('the level editor writes no tileset for a tile set, which no Tiled image is, and its palette skips tiles it has not', ()=>
{
    const run = load();
    run(setCode + `var layer = new TileLayer(vec2(), vec2(2), set);
        levelEditor.paletteTiles = [0, 1, 7];`);
    assert.deepEqual(json(run, 'editorTilesets(layer)'), []);
    assert.deepEqual(json(run, 'editorPaletteTiles({live: layer}).map((t)=> t.tile)'), [0, 1]);
});

test('a light inside a big room, close behind its wall, is hidden by the wall from outside', ()=>
{
    const run = load();
    run(`new Render3DPlugin; render3D.camera.pos = vec3(); render3D.camera.rotation = vec3();
        render3D.sunDirection = vec3(1, 0, 0); render3D.updateMatrices();
        var room = new EngineObject3D(vec3(0, 0, -30), render3D.boxMesh); room.scale3D = vec3(40);
        var lamp = new Light3D(vec3(0, 0, -11), 10, rgb(1, 0, 0)), flare = new LensFlare3D; flare.light = lamp;
        for (let i = 20; i--;) flare.update();`);
    assert.equal(run('!!flare.flareLook()'), true);
    assert.equal(run('flare.visible'), 0, 'a sconce one unit behind the wall of a level mesh');
});

test('a tween that loops or ping pongs with no time, or less, ends its loops, in a release build where it is not asserted', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run('setHeadlessMode(true)');
    run(`var ends = 0;
        new Tween(()=> {}, 0, 1, 0).loop(3).then(()=> ++ends);
        new Tween(()=> {}, 0, 1, -1).pingPong(2).then(()=> ++ends);
        for (let i = 10; i--;) tweenUpdate(1/60, 1/60);`);
    assert.equal(run('ends'), 2);
});

test('the level editor reads a tile past the end of a sheet read by its columns as nothing, as the layer draws it', ()=>
{
    const run = load();
    run(`var sheet = new TileInfo(vec2(), vec2(16), new TextureInfo({width: 17, height: 16}, false), .5, 0, 1);
        var layer = new TileLayer(vec2(), vec2(2, 1), sheet);`);
    assert.deepEqual(json(run, '[!!editorTileInfo(layer, 0), editorTileInfo(layer, 99) === undefined]'), [true, true]);
});

test('a light\'s flare looks past four lamps around it, and counts a fifth as hidden', ()=>
{
    const run = load();
    run(`new Render3DPlugin; render3D.camera.pos = vec3(); render3D.camera.rotation = vec3();
        render3D.sunDirection = vec3(1, 0, 0); render3D.updateMatrices();
        var lamp = new Light3D(vec3(0, 0, -10), 10, rgb(1, 0, 0)), flare = new LensFlare3D; flare.light = lamp;
        var lamps = (n)=> { for (let i = 0; i < n; ++i) { const o = new EngineObject3D(vec3(0, 0, -10), render3D.boxMesh);
            o.scale3D = vec3(1 + i * .2); } flare.visible = .5; for (let i = 20; i--;) flare.update(); return flare.visible; };`);
    assert.equal(run('lamps(4)'), 1, 'four nested shades');
    assert.equal(run('lamps(1)'), 0, 'one more, five in all');
});

test('a palette list names only tiles the sheet has, a sheet read by its columns as a tile set', ()=>
{
    const run = load();
    run(`var sheet = new TileInfo(vec2(), vec2(16), new TextureInfo({width: 17, height: 16}, false), .5, 0, 1);
        var layer = new TileLayer(vec2(), vec2(2, 1), sheet); levelEditor.paletteTiles = [0, 99];`);
    assert.deepEqual(json(run, 'editorPaletteTiles({live: layer}).map((t)=> t.tile)'), [0]);
});

test('a ray toward a point far beyond a tile layer ends at the layer, and hits as an unclipped walk does', ()=>
{
    const run = load();
    run(`var layer = new TileCollisionLayer(vec2(2, 3), vec2(20, 10));
        for (let x = 0; x < 20; ++x) layer.setCollisionData(vec2(x, x % 7), 1);
        var walk = (a, b)=> { const n = vec2(), hit = lineTest(a.subtract(layer.pos), b.subtract(layer.pos),
            (p)=> layer.getCollisionData(p) > 0, n); return hit && [hit.x + layer.pos.x, hit.y + layer.pos.y, n.x, n.y]; };
        var cast = (a, b)=> { const n = vec2(), hit = layer.collisionRaycast(a, b, undefined, n); return hit && [hit.x, hit.y, n.x, n.y]; };
        var random = new RandomGenerator(5), differ = [];
        for (let i = 0; i < 300; ++i)
        {
            const a = vec2(random.float(-10, 35), random.float(-10, 25)), b = vec2(random.float(-10, 35), random.float(-10, 25));
            const p = walk(a, b), q = cast(a, b);
            if (!p !== !q || p && p.some((v, k)=> Math.abs(v - q[k]) > 1e-6)) differ.push([a, b, p, q]);
        }`);
    assert.deepEqual(json(run, 'differ.length'), 0, 'every ray as the walk has it: ' + run('JSON.stringify(differ[0])'));
    run('var far = layer.collisionRaycast(vec2(3.5, 3.5), vec2(1e9, 3.5)), none = layer.collisionRaycast(vec2(-50, -50), vec2(-1e9, 5e8));');
    assert.equal(run('none'), undefined, 'a ray that never crosses the layer, at once');
    assert.ok(run('!!far'), 'and one that does still hits');
});

test('an iPhone\'s silent switch mutes the game unless the game says to play through it', ()=>
{
    const navigator = {audioSession: {type: 'auto'}};
    const { run } = loadEngine({navigator});
    run('audioInit()'); // as engineInit starts the sound, not headless here
    assert.equal(navigator.audioSession.type, 'auto', 'by default the switch is obeyed');
    run('setSoundIgnoreSilentSwitch(true)');
    assert.deepEqual([navigator.audioSession.type, run('soundIgnoreSilentSwitch')], ['playback', true]);
    run('setSoundIgnoreSilentSwitch(false)');
    assert.equal(navigator.audioSession.type, 'auto');
});
