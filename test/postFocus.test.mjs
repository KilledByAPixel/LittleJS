import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProcessEffects, postProcessTiltShift, postProcessDepthOfField, postProcessVignette }
    from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// Tilt shift and depth of field: a blur that follows the screen's height or the 3D depth, and a game's own values
// in the post process shader, so an effect's setting can change every frame without making the shader again.

test('tilt shift and depth of field write their settings into their code, depth of field reading the depth', ()=>
{
    const tilt = postProcessTiltShift(.4, .3, 10), dof = postProcessDepthOfField(12, 5, 6);
    assert.ok(['0.4000', '0.3000', '10.0000'].every((n)=> tilt.includes(n)), tilt);
    assert.ok(!tilt.includes('sceneDepth'), 'tilt shift needs no depth');
    assert.ok(['12.0000', '5.0000', '6.0000'].every((n)=> dof.includes(n)) && dof.includes('sceneDepth'));
    assert.ok(postProcessEffects(tilt, postProcessVignette()).includes('// tilt shift'));
});

test('a setting may be the name of a postProcess value, written in as that name', ()=>
{
    assert.ok(postProcessTiltShift('focus', .3, 'blur').includes('focus') && postProcessTiltShift('focus').includes('focus'));
    assert.ok(postProcessDepthOfField('focusDepth').includes('focusDepth'));
    assert.ok(postProcessVignette('dark').includes('dark'), 'any effect takes one');
});

test('a setting that is neither a number nor a name asserts', ()=>
{
    for (const bad of ['1 + 2', '', NaN, {}])
        assert.throws(()=> postProcessTiltShift(bad), /Assert/, String(bad));
});

test('the shader declares each of postProcess.values as a uniform, a number a float and a list a vector', ()=>
{
    const { run } = loadEngine();
    const source = run(`postProcessFragmentSource(postProcessEffects(), {focus: .5, at: [1, 2], light: [1, 2, 3]})`);
    assert.ok(source.includes('uniform float focus;') && source.includes('uniform vec2 at;') && source.includes('uniform vec3 light;'));
    assert.ok(!run(`postProcessFragmentSource(postProcessEffects())`).includes('uniform float focus'));
});

test('glow takes value names for its threshold and strength, its size a number as it sets the sample count', async ()=>
{
    const { postProcessGlow, postProcessBloomShader, postProcessTV } = await import('../dist/littlejs.esm.js');
    const glow = postProcessGlow('edge', 'strength', 6);
    assert.ok(glow.includes('- edge') && glow.includes('strength'), glow);
    assert.ok(postProcessBloomShader(.6, 'bloom').includes('bloom'));
    assert.ok(postProcessTV({glow: 'soft'}).includes('soft'));
    assert.throws(()=> postProcessGlow(.6, 1, 'wide'), /Assert/);
});

test('the d.ts lets every setting that takes a value name take a string', async ()=>
{
    const { readFileSync } = await import('node:fs');
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const signature = (name)=> dts.split('\n').find((line)=> line.includes('export function ' + name + '('));
    for (const [name, settings] of [['postProcessScanlines', 2], ['postProcessNoise', 2], ['postProcessVignette', 2],
        ['postProcessCurve', 1], ['postProcessChromatic', 1], ['postProcessOutline', 2], ['postProcessGlow', 2],
        ['postProcessBloom', 2], ['postProcessBloomShader', 2]])
        assert.ok((signature(name).match(/string \| number|number \| string/g) || []).length >= settings, signature(name));
    const tv = dts.slice(dts.indexOf('export function postProcessTV('), dts.indexOf('export function postProcessTV(') + 400);
    assert.ok(/glow\?: (string \| number|number \| string)/.test(tv), tv);
});
