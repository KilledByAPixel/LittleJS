import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a batch of billboards is lit with no direction, or round, as it draws: an additive one is light of its own and stays
// unlit, and the rest keep no highlight or reflection, on their own copy of the draw state

test('an additive billboard batch stays unlit, the rest are lit in their mode with no shine', () =>
{
    const { run } = loadEngine();
    const [additive, lit] = JSON.parse(run(`
        const added = {additive: true, lighting: true, specular: .5, reflectivity: .5};
        render3DBillboardState(added, 1);
        const addedMode = render3DBillboardMode;
        const plain = {additive: false, lighting: true, specular: .5, reflectivity: .5};
        render3DBillboardState(plain, 2);
        const plainMode = render3DBillboardMode;
        render3DBillboardMode = 0;
        JSON.stringify([[added.lighting, addedMode], [plain.lighting, plainMode, plain.specular, plain.reflectivity]])
    `));
    assert.deepEqual(additive, [false, 0]);
    assert.deepEqual(lit, [true, 2, 0, 0]);
});

test('the shader takes the mode in materialParams.w and leaves a surface as it was', () =>
{
    const { run } = loadEngine();
    const source = run('render3DFragmentSource()');
    assert.match(source, /float bm=materialParams.x!=0.[?]0.:materialParams.w;/, 'a normal map makes it a surface');
    assert.match(source, /float nl=bm==1.[?]1.:dot[(]n,-lightDir.xyz[)];/);
    assert.match(source, /float ln=bm==1.[?]1.:dot[(]n,v[)];/);
});
