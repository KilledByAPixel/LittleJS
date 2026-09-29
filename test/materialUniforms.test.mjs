import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// what a draw sends the shader for its material: with nothing set, values that skip every part, so the pixels are
// what they were; the maps bound to units 2 and 3, white when unused
const { run } = loadEngine();
run(`setHeadlessMode(true); new Render3DPlugin;
    sent = {}; bound = {};
    render3DUniform4f = (name, x, y, z, w)=> sent[name] = [x, y, z, w];
    render3DBindTexture = (t, state, unit)=> bound[unit] = t;`);
const send = (setup)=> JSON.parse(run(`sent = {}, bound = {}, render3DBoundMaps = [];
    render3DSetObjectState(); ${setup}; render3DSetMaterialUniforms(render3D);
    JSON.stringify({sent, bound: [bound[2] && bound[2].tag, bound[3] && bound[3].tag]})`));

test('the source has each part, and shininess replaces the fixed 16', ()=>
{
    const source = run('render3DFragmentSource()');
    for (const part of ['normalTex', 'emissiveTex', 'materialParams', 'emissiveTint', 'skyTop', 'dFdx'])
        assert.ok(source.includes(part), part);
    assert.ok(!source.includes(',16.)'), 'no fixed exponent left');
    assert.ok(!/vec3 bump\(/.test(source), 'the helper has a name a snippet is unlikely to use');
    assert.equal(run('render3DFragmentSource("void mainImage(out vec4 c, vec2 uv){c=vec4(1);}")')
        .includes('normalTex'), true, 'a Shader snippet gets the same lighting');
});

test('with nothing set every part is skipped and the units are white', ()=>
{
    const {sent, bound} = send('');
    assert.deepEqual(sent.materialParams, [0, 16, 0, 0]);
    assert.deepEqual(sent.emissiveTint, [0, 0, 0, 0]);
    assert.deepEqual(bound, [null, null]);
});

test('a normal map sends its scale and is bound to unit 2; scale 0 is off and never bound', ()=>
{
    let {sent, bound} = send('render3D.normalMap = {tag: "n", glTexture: {}}; render3D.normalScale = .5');
    assert.equal(sent.materialParams[0], .5);
    assert.deepEqual(bound, ['n', null]);
    ({sent, bound} = send('render3D.normalMap = {tag: "n", glTexture: {}}; render3D.normalScale = 0'));
    assert.equal(sent.materialParams[0], 0);
    assert.deepEqual(bound, [null, null]);
});

test('an emissive map sends its color and is bound to unit 3', ()=>
{
    const {sent, bound} = send(
        'render3D.emissiveMap = {tag: "e", glTexture: {}}; render3D.emissiveMapColor = rgb(1, .5, 0)');
    assert.deepEqual(sent.emissiveTint, [1, .5, 0, 1]);
    assert.deepEqual(bound, [null, 'e']);
});

test('a map with no GL texture, not made yet or freed, draws as no map rather than as the white texture', ()=>
{
    const {sent, bound} = send('render3D.normalMap = {tag: "n"}; render3D.emissiveMap = {tag: "e"}');
    assert.equal(sent.materialParams[0], 0, 'white would lean every normal');
    assert.deepEqual(sent.emissiveTint, [0, 0, 0, 0], 'white would light the whole surface');
    assert.deepEqual(bound, [null, null]);
});

test('shininess and reflectivity reach the shader', ()=>
{
    const {sent} = send('render3D.shininess = 100; render3D.reflectivity = .25');
    assert.deepEqual(sent.materialParams, [0, 100, .25, 0]);
});

test('a reflection shows the colors of the sky being drawn, one set by hand after setSky included', ()=>
{
    const {sent} = send(`render3D.setSky(rgb(1,0,0), rgb(0,1,0), rgb(0,0,1), 0);
        render3D.sky = buildSky(rgb(0,0,1), rgb(1,1,0), rgb(0,1,1)); render3D.reflectivity = 1`);
    assert.deepEqual([sent.skyTop, sent.skyHorizon, sent.skyBottom].map((c)=> c.slice(0, 3)),
        [[0, 0, 1], [1, 1, 0], [0, 1, 1]]);
});

test('a sky mesh keeps copies of its colors, the caller\'s stay theirs', ()=>
{
    const {sent} = send(`const top = rgb(1,0,0); render3D.sky = buildSky(top, rgb(0,1,0)); top.r = .5;
        render3D.reflectivity = 1`);
    assert.deepEqual(sent.skyTop.slice(0, 3), [1, 0, 0]);
    assert.deepEqual(sent.skyBottom.slice(0, 3), [0, 1, 0], 'the bottom is the horizon when not given');
});

test('an instanced batch splits when a material field changes, and not when it stays', ()=>
{
    const counts = JSON.parse(run(`render3DSetObjectState();
        const flush = render3DFlushInstances, upload = render3DMeshUpload, mesh = buildBox(), m = buildMatrix(vec3());
        mesh.bufferCount = 36, mesh.radius = 1; // as if uploaded, headless nothing is
        render3DMeshUpload = ()=> {};
        let flushes = 0;
        render3DFlushInstances = (only)=> { if (only) { ++flushes; only.instanceCount = 0; } };
        render3D.isRendering = true, render3D.program = {};
        render3D.camera.pos = vec3(0, 0, 10), render3D.updateMatrices(1); // the box in view, not culled
        try
        {
            render3D.drawMesh(mesh, m); render3D.drawMesh(mesh, m);
            const same = flushes;
            render3D.shininess = 64;
            render3D.drawMesh(mesh, m);
            JSON.stringify({same, changed: flushes, count: mesh.instanceCount});
        }
        finally
        {
            render3DFlushInstances = flush, render3DMeshUpload = upload;
            render3D.isRendering = false, render3D.program = undefined;
            render3D.instanceMeshes.length = 0, render3DSetObjectState();
        }`));
    assert.deepEqual(counts, {same: 0, changed: 1, count: 1});
});

test('the pass binds white to the map units at its start and nothing at its end, unit 0 active after', ()=>
{
    const calls = JSON.parse(run(`const calls = [], saved = glContext;
        glContext = {TEXTURE0: 33984, TEXTURE_2D: 3553, activeTexture: (u)=> calls.push(['unit', u - 33984]),
            bindTexture: (t, x)=> calls.push(['texture', x]), bindSampler: (u, s)=> calls.push(['sampler', u, s])};
        render3DBoundMaps = [1, 2, 3];
        try { render3DSetMapUnits('white'); render3DSetMapUnits(null); } finally { glContext = saved; }
        JSON.stringify({calls, cache: render3DBoundMaps.length})`));
    const unitCalls = (texture)=> [['unit', 2], ['texture', texture], ['sampler', 2, null],
        ['unit', 3], ['texture', texture], ['sampler', 3, null], ['unit', 0]];
    assert.deepEqual(calls.calls, [...unitCalls('white'), ...unitCalls(null)]);
    assert.equal(calls.cache, 0, 'the map cache is forgotten');
    const pass = run('render3DRenderPass.toString()');
    assert.ok(pass.includes('render3DSetMapUnits(r.whiteTexture)') && pass.includes('render3DSetMapUnits(null)'),
        'the pass calls it at its start and in its finally');
});

test('a reflection shows the sky colors, or the ambient ones with no sky', ()=>
{
    let {sent} = send('render3D.setSky(rgb(1,0,0), rgb(0,1,0), rgb(0,0,1), 0); render3D.reflectivity = 1');
    assert.deepEqual([sent.skyTop, sent.skyHorizon, sent.skyBottom].map((c)=> c.slice(0, 3)),
        [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    ({sent} = send(`render3D.sky = undefined; render3D.ambientColor = rgb(.4, .4, .4);
        render3D.ambientGroundColor = rgb(0, 0, .2); render3D.reflectivity = 1`));
    assert.deepEqual(sent.skyTop.slice(0, 3), [.4, .4, .4]);
    assert.deepEqual(sent.skyBottom.slice(0, 3), [0, 0, .2]);
    [.2, .2, .3].forEach((v, i)=> assert.ok(Math.abs(sent.skyHorizon[i] - v) < 1e-6, 'the horizon between them'));
});
