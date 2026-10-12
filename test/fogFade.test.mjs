import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// render3D.fogDepth measures fog along the view; fogFadeStart / fogFadeEnd fade see through draws to transparent
// with distance. Node has no WebGL, so the shader is checked as text.

const { run } = loadEngine();
run('setHeadlessMode(true); new Render3DPlugin');

test('fog fade and fog depth default off', ()=>
{
    assert.equal(run('render3D.fogDepth'), false);
    assert.equal(run('render3D.fogFadeStart'), 0);
    assert.equal(run('render3D.fogFadeEnd'), 0);
});

test('the fragment shader fades blended draws and can measure by view depth', ()=>
{
    const source = run('render3DFragmentSource()');
    assert.match(source, /uniform vec4 [^;]*fogFade/);
    assert.match(source, /uniform vec3 [^;]*cameraDir/);
    assert.match(source, /dot\(P-cameraPos,cameraDir\)/);
});

test('fogFadeEnd must be past fogFadeStart', ()=>
{
    assert.equal(run('render3DFogFadeValid(400, 533)'), true);
    assert.equal(run('render3DFogFadeValid(0, 0)'), true); // off
    assert.equal(run('render3DFogFadeValid(533, 400)'), false);
});
