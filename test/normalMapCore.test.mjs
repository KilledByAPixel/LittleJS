import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the core hooks the light system's normal pass draws through: an object's normal map and its draw into the normal
// buffer, a texture that stands in for every one bound, additive batches left out, and a Shader with no color step

test('an object has no normal map by default, and renderNormal draws it with render', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`var o = new EngineObject(vec2()); o.normalMap`), undefined);
    assert.equal(run(`var count = 0; o.render = ()=> ++count; o.renderNormal(); count`), 1);
});

test('glSetTexture binds the override in place of the texture asked for, while it is set', () =>
{
    const { run } = loadEngine();
    run(`var bound; glContext = {bindTexture: (target, texture)=> bound = texture}; glFlush = ()=> {};
        glActiveTexture = undefined;`);
    assert.equal(run(`glTextureOverride = 'N'; glSetTexture('A'); bound`), 'N');
    assert.equal(run(`glTextureOverride = undefined; glSetTexture('B'); bound`), 'B');
});

test('a Shader with noTint ends without the color step, others keep it', () =>
{
    const { run } = loadEngine();
    run(`var source; glCreateProgram = (vs, fs)=> (source = fs, {});
        var code = 'void mainImage(out vec4 c, vec2 uv){c=vec4(1);}';`);
    const plain = run(`var tinted = new Shader(code); glShaderProgram(tinted); source`);
    assert.ok(plain.includes('c=t*d+e'), 'a Shader keeps the color step');
    const untinted = run(`var normal = new Shader(code); normal.noTint = true; glShaderProgram(normal); source`);
    assert.ok(untinted.includes('c=d.a>0.?vec4(t.rgb,t.a*d.a):e'),
        'noTint writes the texel with the draw alpha, or an untextured draw its additive color');
    assert.ok(!untinted.includes('c=t*d+e'), 'and no color step');
});

test('glFlush drops an additive batch while glSkipAdditive is set, and draws every other', () =>
{
    const { run } = loadEngine();
    run(`var draws = 0, none = ()=> {};
        glEnable = true;
        glContext = {blendFuncSeparate: none, enable: none, bufferSubData: none, useProgram: none, uniform1i: none,
            drawArraysInstanced: ()=> ++draws, drawArrays: ()=> ++draws, ONE: 1, SRC_ALPHA: 2, ONE_MINUS_SRC_ALPHA: 3,
            BLEND: 4, ARRAY_BUFFER: 5, TRIANGLE_STRIP: 6};
        glPolyMode = false; glBatchShader = undefined; glCustomShader = undefined; glShaderPremultiplied = false;
        var flush = (additive, skip)=> { glBatchCount = 1; glBatchAdditive = glAdditive = additive;
            glSkipAdditive = skip; glFlush(); return [draws, glBatchCount]; };`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(flush(true, true))`)), [0, 0], 'skipped, and the batch emptied');
    assert.deepEqual(JSON.parse(run(`JSON.stringify(flush(true, false))`)), [1, 0], 'drawn when not skipping');
    assert.deepEqual(JSON.parse(run(`JSON.stringify(flush(false, true))`)), [2, 0], 'a normal batch is drawn');
});
