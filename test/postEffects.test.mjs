import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostProcessPlugin, postProcess, postProcessEffects, postProcessGlow, postProcessScanlines, postProcessNoise,
    postProcessVignette, postProcessCurve, postProcessChromatic, postProcessOutline, postProcessTV,
    postProcessBloomShader, hsl } from '../dist/littlejs.esm.js';

// built in post effects: each builds a piece of shader code with its settings written in as numbers, working on the
// pixel's color c and its screen position uv, and postProcessEffects joins them in order into one shader; a piece
// can be your own code too; the shaders are compiled and checked in a browser

const count = (text, part)=> text.split(part).length - 1;

test('no pieces is the frame as it is, pieces go in in order, each in a block of its own', ()=>
{
    const plain = postProcessEffects();
    assert.ok(plain.includes('void mainImage(out vec4 c, vec2 p)'));
    assert.ok(plain.includes('vec2 uv = p / iResolution.xy;'));
    assert.ok(plain.includes('c = texture(iChannel0, uv);'));
    const code = postProcessEffects('c.r = 1.;', postProcessVignette(), 'c.g = 0.;');
    const r = code.indexOf('c.r = 1.;'), vignette = code.indexOf('// vignette'), g = code.indexOf('c.g = 0.;');
    assert.ok(r > 0 && r < vignette && vignette < g, 'in the order given');
    assert.equal(count(code, '{') - count(plain, '{'), 3, 'a block each, so their names do not meet');
});

test('each effect writes its settings into its code', ()=>
{
    assert.ok(postProcessScanlines(.3, 8).includes('0.3000') && postProcessScanlines(.3, 8).includes('8.0000'));
    assert.ok(postProcessNoise(.2, 3).includes('0.2000') && postProcessNoise(.2, 3).includes('3.0000'));
    assert.ok(postProcessVignette(.7, 4).includes('0.7000') && postProcessVignette(.7, 4).includes('4.0000'));
    assert.ok(postProcessCurve(.25).includes('0.2500'));
    assert.ok(postProcessChromatic(.015).includes('0.0150'));
    const outline = postProcessOutline(hsl(0, 1, .5), 2, .05);
    assert.ok(outline.includes('sceneDepth') && outline.includes('vec4(1.0000, 0.0000, 0.0000, 1.0000)'));
    assert.ok(postProcessGlow(.5, 2, 4).includes('0.5000'));
    for (const piece of [postProcessScanlines(), postProcessNoise(), postProcessVignette(), postProcessCurve(),
        postProcessChromatic(), postProcessOutline(), postProcessGlow()])
        assert.equal(typeof piece, 'string');
});

test('settings that are not numbers assert', ()=>
{
    assert.throws(()=> postProcessScanlines('very strong')); // a name may be a postProcess value, a phrase may not
    assert.throws(()=> postProcessVignette(1, ''));
});

test('the TV look is noise, scanlines, a soft glow and a vignette, with a curve when asked, 0 leaving a part out', ()=>
{
    const tv = postProcessTV();
    for (const part of ['// noise', '// scanlines', '// glow', '// vignette'])
        assert.ok(tv.includes(part), part);
    assert.ok(!tv.includes('// curve'), 'flat by default');
    const bent = postProcessTV({curve: .2, scanlines: 0});
    assert.ok(bent.includes('// curve') && !bent.includes('// scanlines'));
    assert.ok(bent.indexOf('// curve') < bent.indexOf('// glow'), 'the curve first, what samples the frame follows it');
    assert.ok(postProcessEffects(tv, 'c.r = 1.;').includes('c.r = 1.;'), 'a piece like any other');
});

test('the bloom shader is the glow on its own, as before', ()=>
{
    const bloom = postProcessBloomShader(.6, 1, 6);
    assert.ok(bloom.includes('void mainImage') && bloom.includes('// glow'));
});

test('a post process plugin takes new shader code', ()=>
{
    new PostProcessPlugin(postProcessEffects(postProcessVignette()));
    postProcess.setShaderCode(postProcessEffects(postProcessScanlines()));
    assert.ok(postProcess.shaderCode.includes('// scanlines'));
    postProcess.setShaderCode();
    assert.ok(postProcess.shaderCode.includes('mainImage'), 'none is the frame as it is');
});
