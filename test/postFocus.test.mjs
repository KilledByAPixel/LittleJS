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
