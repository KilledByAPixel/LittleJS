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
const send = (setup)=> JSON.parse(run(`sent = {}, bound = {}, render3D.boundMaps = [];
    render3DSetObjectState(); ${setup}; render3DSetMaterialUniforms(render3D);
    JSON.stringify({sent, bound: [bound[2] && bound[2].tag, bound[3] && bound[3].tag]})`));

test('the source has each part, and shininess replaces the fixed 16', ()=>
{
    const source = run('render3DFragmentSource()');
    for (const part of ['normalTex', 'emissiveTex', 'materialParams', 'emissiveTint', 'skyTop', 'dFdx'])
        assert.ok(source.includes(part), part);
    assert.ok(!source.includes(',16.)'), 'no fixed exponent left');
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
    let {sent, bound} = send('render3D.normalMap = {tag: "n"}; render3D.normalScale = .5');
    assert.equal(sent.materialParams[0], .5);
    assert.deepEqual(bound, ['n', null]);
    ({sent, bound} = send('render3D.normalMap = {tag: "n"}; render3D.normalScale = 0'));
    assert.equal(sent.materialParams[0], 0);
    assert.deepEqual(bound, [null, null]);
});

test('an emissive map sends its color and is bound to unit 3', ()=>
{
    const {sent, bound} = send('render3D.emissiveMap = {tag: "e"}; render3D.emissiveMapColor = rgb(1, .5, 0)');
    assert.deepEqual(sent.emissiveTint, [1, .5, 0, 1]);
    assert.deepEqual(bound, [null, 'e']);
});

test('shininess and reflectivity reach the shader', ()=>
{
    const {sent} = send('render3D.shininess = 100; render3D.reflectivity = .25');
    assert.deepEqual(sent.materialParams, [0, 100, .25, 0]);
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
