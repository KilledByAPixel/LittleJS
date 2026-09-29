import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the 3D depth for post processing: off by default, and when on the post process shader gets it as iChannel2 with
// sceneDepth(uv), the distance from the camera along its view in world units; the pixels are checked in a browser

test('the depth texture is off by default', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin');
    assert.equal(run('render3D.depthTexture'), false);
});

test('the post process shader has the depth on iChannel2 and sceneDepth to read it', ()=>
{
    const { run } = loadEngine();
    const source = run('postProcessFragmentSource("void mainImage(out vec4 c, vec2 p){c=vec4(sceneDepth(p));}")');
    for (const part of ['uniform sampler2D iChannel2', 'uniform vec3 iDepthRange', 'float sceneDepth(vec2 uv)',
        'void mainImage'])
        assert.ok(source.includes(part), part);
    assert.ok(source.indexOf('float sceneDepth') < source.indexOf('void mainImage'), 'defined before the snippet');
});
