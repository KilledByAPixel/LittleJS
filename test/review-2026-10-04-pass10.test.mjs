import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import * as LJS from '../dist/littlejs.esm.js';

// Review 2026-10-04 pass 10: a shader that fails to build in a release build says so and is not drawn with, the
// engine's own falling back to Canvas2D; the post process names checked for settings and values alike, the depth
// read at high precision and guarded where there is none; the 3D shader's guards against a flattened mesh, a
// rounding Fresnel base and fog that ends where it starts

// a gl whose programs link unless fail says they do not, and a console that keeps the errors
function fakeGL(fail)
{
    const errors = [];
    const gl = new Proxy({
        MAX_TEXTURE_SIZE: 3379, LINK_STATUS: 35714, COMPILE_STATUS: 35713,
        getParameter: ()=> 4096,
        createProgram: ()=> ({shaders: []}), createShader: ()=> ({}),
        shaderSource: (shader, source)=> shader.source = source,
        attachShader: (program, shader)=> program.shaders.push(shader),
        getShaderParameter: (shader)=> !fail(shader.source || ''),
        getProgramParameter: (program, name)=> name !== 35714 || !program.shaders.some((s)=> fail(s.source || '')),
        getProgramInfoLog: ()=> 'link failed', getShaderInfoLog: (shader)=> fail(shader.source || '') ? 'ERROR: 0:1: bad' : '',
        isContextLost: ()=> false, createTexture: ()=> ({}), checkFramebufferStatus: ()=> 36053,
    }, {get: (target, key)=> key in target ? target[key] : ()=> ({})});
    const console = {log() {}, warn() {}, error: (...args)=> errors.push(args.join(' '))};
    return {gl, errors, console};
}

test('in a release build a game Shader that fails to build logs why and its draws use the engine\'s program', ()=>
{
    const { gl, errors, console } = fakeGL((source)=> source.includes('broken'));
    const { run } = loadEngine({gl, console}, '', 'littlejs.release.js');
    run(`glContext = gl; glShader = glCreateProgram('#version 300 es\\nvoid main(){}', 'fine');
        var shader = new Shader('void mainImage(out vec4 c, vec2 p) { broken }');`);
    assert.equal(errors.length, 0);
    assert.equal(run('glShaderProgram(shader) === glShader'), true, 'drawn as if it had no shader');
    assert.equal(errors.length, 1, 'one message');
    assert.match(errors[0], /bad/, 'with the compiler\'s own log');
    run('glShaderProgram(shader)');
    assert.equal(errors.length, 1, 'built once, not again every batch');
});

test('in a release build a 3D Shader that fails to build is drawn with the plugin\'s own program', ()=>
{
    const { gl, errors, console } = fakeGL((source)=> source.includes('broken'));
    const { run } = loadEngine({gl, console}, '', 'littlejs.release.js');
    run(`glContext = gl; setHeadlessMode(true); new Render3DPlugin; render3D.program = {};
        var shader = new Shader('void mainImage(out vec4 c, vec2 p) { broken }');`);
    assert.equal(run('render3DShaderProgram(shader) === render3D.program'), true);
    assert.equal(errors.length, 1);
});

test('in a release build the engine\'s own program failing to build turns WebGL off, and draws go to Canvas2D', ()=>
{
    const { gl, errors, console } = fakeGL((source)=> source.includes('texture(s,v)'));
    const { run } = loadEngine({gl, console}, '', 'littlejs.release.js');
    run(`setHeadlessMode(false); glEnable = true;
        document.createElement = ()=> ({getContext: ()=> gl, addEventListener() {}, style: {}});
        glInit({appendChild() {}});`);
    assert.equal(run('glEnable'), false);
    assert.equal(run('glCanBeEnabled'), false, 'and it can not be turned back on');
    assert.ok(errors.some((e)=> /Canvas2D|canvas/i.test(e)), errors.join('\n'));
});

test('a debug build still throws the compiler\'s log', ()=>
{
    const { gl, console } = fakeGL((source)=> source.includes('broken'));
    const { run } = loadEngine({gl, console});
    run('glContext = gl;');
    assert.throws(()=> run(`glCreateProgram('#version 300 es\\nvoid main(){}', 'broken')`), /bad/);
});

test('an effect setting is checked as a value\'s name is: no names the shader keeps, no GLSL words', ()=>
{
    const { run } = loadEngine();
    const value = (name)=> run(`postProcessFragmentSource('', {${name}: 1})`);
    for (const name of ['uv', 'p', 'c', '_glow', '_r', 'iTime', 'gl_x', 'in', 'out', 'float', 'precision', 'flat',
        'sample', 'input', 'filter', 'common', 'texture', 'mix', 'step', 'a__b', 'webgl_x', 'GL_ES', 'main'])
    {
        assert.throws(()=> LJS.postProcessNoise(.1, name), undefined, 'setting ' + name);
        assert.throws(()=> value(name), undefined, 'value ' + name);
    }
    for (const name of ['focus', 'blur', 'glow', 'strength', 'size2', 'inner', 'mixer', 'texture2'])
    {
        assert.doesNotThrow(()=> LJS.postProcessNoise(.1, name), 'setting ' + name);
        assert.doesNotThrow(()=> value(name), 'value ' + name);
    }
});

test('a small setting keeps its digits', ()=>
{
    assert.match(LJS.postProcessChromatic(.00015), /\b0\.00015\b/);
    assert.match(LJS.postProcessChromatic(.0012345), /\b0\.0012345\b/);
    assert.match(LJS.postProcessChromatic(2), /\b2\.0*\b/, 'a whole number is a float');
});

test('the depth is read at high precision, and no depth or the sky gives no NaN', ()=>
{
    const source = loadEngine().run('postProcessFragmentSource(postProcessEffects(postProcessOutline(), ' +
        'postProcessDepthOfField()))');
    assert.match(source, /uniform highp sampler2D iChannel2;/, 'lowp by default, 11 bits of depth on Mali');
    assert.doesNotMatch(source, /2\.\*n\/\(1\.-d\)/, 'an infinite far plane at the sky divides by 0');
    // the outline and depth of field both need depth, and an orthographic camera may have its near plane behind it
    assert.doesNotMatch(source, /iDepthRange\.x > 0\./, 'depth is there whenever the range is not all 0');
    assert.equal(source.match(/LJS_HAS_DEPTH|iDepthRange != vec3\(0\)/g)?.length >= 2, true, source);
});

test('the 3D shader guards a flattened mesh\'s normal, the Fresnel base and fog that ends where it starts', ()=>
{
    const { run } = loadEngine();
    const vertex = run('RENDER3D_VERTEX_SOURCE'), fragment = run('render3DFragmentSource()');
    assert.doesNotMatch(vertex, /c0\/dot\(c0,c0\)/, 'a scale of 0 on an axis divides by 0');
    assert.match(vertex, /max\(dot\(c0,c0\),/);
    assert.doesNotMatch(fragment, /pow\(1\.-max\(dot\(n,-w\),0\.\),5\.\)/, 'a base a rounding below 0 is NaN');
    assert.match(fragment, /pow\(clamp\(1\.-dot\(n,-w\),0\.,1\.\),5\.\)/);
});

test('lineTest from a whole x or y heading down the grid starts in the cell it heads into', ()=>
{
    const { run } = loadEngine();
    assert.equal(run('lineTest(vec2(5, .5), vec2(2, .5), (p)=> p.x === 5)'), undefined, 'cell 5 is behind it');
    assert.equal(run('lineTest(vec2(.5, 5), vec2(.5, 2), (p)=> p.y === 5)'), undefined);
    assert.equal(Math.round(run('lineTest(vec2(5, .5), vec2(2, .5), (p)=> p.x === 3)?.x')), 4, 'meets cell 3 at its edge');
    assert.equal(run('lineTest(vec2(5, .5), vec2(8, .5), (p)=> p.x === 5)?.x'), 5, 'heading up it starts in cell 5');
});

test('a particle lands on a ceiling when its gravityScale makes it rise', ()=>
{
    LJS.setGravity(LJS.vec2(0, -.01));
    const layer = new LJS.TileCollisionLayer(LJS.vec2(), LJS.vec2(20, 20), LJS.tile(0, 16), 0, false);
    layer.setCollisionData(LJS.vec2(5, 6), 1);
    const emitter = new LJS.ParticleEmitter(LJS.vec2(5.5, 5.7));
    emitter.collideLevel = true;
    emitter.gravityScale = -1;
    const particle = new LJS.Particle(emitter, LJS.vec2(5.5, 5.7), 0, LJS.WHITE, LJS.WHITE, 1, .2, .2, LJS.vec2(0, .5));
    particle.update();
    const landed = particle.groundObject === layer;
    LJS.setGravity(LJS.vec2());
    emitter.destroy();
    layer.destroy();
    assert.equal(landed, true);
});

test('readSaveData takes only a plain object from storage', ()=>
{
    for (const stored of ['"abc"', '[1, 2]', '5', 'null'])
    {
        const { run } = loadEngine({localStorage: {getItem: ()=> stored, setItem() {}}});
        assert.equal(run('JSON.stringify(readSaveData("game", {a: 1}))'), '{"a":1}', stored);
    }
    const { run } = loadEngine({localStorage: {getItem: ()=> '{"a": 2, "b": 3}', setItem() {}}});
    assert.equal(run('JSON.stringify(readSaveData("game", {a: 1}))'), '{"a":2,"b":3}');
});

test('smoothing a path through a serpentine maze takes line checks in proportion to its corners, not its cells', ()=>
{
    const size = 64;
    const pf = new LJS.PathFinder(LJS.vec2(size));
    // a wall on every odd row, its gap at one end and then the other
    pf.isWalkable = (x, y)=> !(y & 1) || x === ((y >> 1) & 1 ? 0 : size - 1);
    let checks = 0;
    const isLineClear = pf.isLineClear.bind(pf);
    pf.isLineClear = (a, b)=> (++checks, isLineClear(a, b));
    const path = pf.findPath(LJS.vec2(.5), LJS.vec2(.5, size - 1.5));
    assert.ok(path.length > size / 2, 'it winds through every row: ' + path.length);
    assert.ok(checks < 16e3, 'about 64k checks before: ' + checks);
    for (let i = 1; i < path.length; ++i)
        assert.ok(isLineClear(path[i - 1].floor(), path[i].floor()), 'every leg is clear');
});

test('stopping many tweens does not search the list for each, and one stopped and started again moves once', ()=>
{
    const { run } = loadEngine();
    run(`var tweens = []; for (let i = 0; i < 500; ++i) tweens.push(new Tween(()=> {}, 0, 1, 1));
        var searches = 0; const indexOf = tweenActive.indexOf;
        tweenActive.indexOf = function(...a) { ++searches; return indexOf.apply(this, a); };
        for (const t of tweens) t.stop();`);
    assert.equal(run('searches'), 0);
    run(`var moves = 0; var t = new Tween(()=> ++moves, 0, 1, 10); tweenUpdate(1);
        t.stop(); t.restart(); moves = 0; tweenUpdate(1); tweenUpdate(1);`);
    assert.equal(run('moves'), 2, 'once an update, not twice for being listed twice');
    assert.equal(run('tweenActive.length'), 1, 'the stopped ones gone from the list');
});

test('a CSG cut splits only what is near the cutter, so a mesh cut many times does not grow costlier each time', ()=>
{
    const { run } = loadEngine();
    run(`var splits = 0; const split = render3DCSGSplit;
        render3DCSGSplit = (...a)=> (++splits, split(...a));
        var slab = buildBox(vec3(40, 1, 40));
        for (let i = 0; i < 16; ++i)
            slab = slab.subtract(buildBox(.5), buildMatrix(vec3(i * 2 - 15, .5, (i % 4) * 8 - 12)));`);
    assert.ok(run('splits') < 70e3, 'about 176k before: ' + run('splits'));
});

test('a paint stroke in the editor draws the cells it changed, a layer drawn whole only when it needs to be', async ()=>
{
    const { run } = loadEngine({localStorage: {getItem: ()=> null, setItem() {}}, location: {pathname: '/game/'}});
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
            layers: [{ type: 'tilelayer', name: 'front', width: 3, height: 2, data: [0, 0, 3, 0, 0, 0] }] };
        var layers = tileLayersLoad(map, undefined, 0, 2), front = editorLayerRecord(layers[0]);
        var redraws = 0; const redraw = front.live.redraw.bind(front.live);
        front.live.redraw = ()=> (++redraws, redraw());
        editorPaint(front, vec2(0, 1), editorTileToGid(4)); editorStrokeEnd();`);
    assert.equal(run('map.layers[0].data[0]'), 5, 'painted');
    assert.equal(run('redraws'), 0, 'the cell drew itself, the whole layer is not drawn for it');
    run('editorUndo()');
    assert.equal(run('redraws'), 1, 'an undo is a bulk edit, its cells held, so the layer draws whole');
    run('front.live.onRedraw = ()=> {}; editorPaint(front, vec2(1, 1), editorTileToGid(4)); editorStrokeEnd();');
    assert.equal(run('redraws'), 2, 'a layer the game draws over itself draws whole');
    run(`delete front.live.onRedraw; levelEditor.onTile = ()=> {};
        editorPaint(front, vec2(2, 1), editorTileToGid(4)); editorStrokeEnd();`);
    assert.equal(run('redraws'), 3, 'a game\'s onTile may change the cells around, so it draws whole');
});

test('every preprocessor line of the post process shader starts a line', ()=>
{
    const source = loadEngine().run('postProcessFragmentSource(postProcessEffects(postProcessOutline()))');
    for (const at of source.matchAll(/#(define|version)/g))
        assert.ok(at.index === 0 || source[at.index - 1] === '\n', source.slice(at.index - 20, at.index + 20));
});
