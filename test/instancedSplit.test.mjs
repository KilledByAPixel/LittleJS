import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Render3DPlugin, InstancedMesh3D, buildBox, buildMatrix, vec3, hsl, RED } from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// an InstancedMesh3D keeps its matrices and its colors apart, so a frame that moves the instances uploads 64 bytes
// each, like three.js; setTransformAt writes a matrix straight in, and the culling bounds wait until they are read

new Render3DPlugin;

test('the matrices and the colors are kept apart, 16 floats and 8 for each instance', ()=>
{
    const set = new InstancedMesh3D(buildBox(), 3, undefined, RED);
    assert.equal(set.matrixData.length, 3 * 16);
    assert.equal(set.colorData.length, 3 * 8);
    assert.deepEqual([...set.matrixData.subarray(32, 48)], [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    assert.deepEqual([...set.colorData.subarray(16, 24)], [1, 0, 0, 1, 0, 0, 1, 1]); // the color, the whole texture
    assert.deepEqual([set.dirtyStart, set.dirtyEnd, set.colorDirtyStart, set.colorDirtyEnd], [0, 3, 0, 3]);
    set.destroy();
});

test('setTransformAt writes the matrix buildMatrix makes, straight into the instance, and marks only it', ()=>
{
    const set = new InstancedMesh3D(buildBox(), 4);
    const cases = [[vec3(1, 2, 3)], [vec3(-4, 0, 2), vec3(.3, -1.2, 2.5)], [vec3(0, 5, 0), vec3(0, .7, 0), vec3(2, .5, 3)],
        [vec3(9, 8, 7), undefined, vec3(-1, 1, 1)]];
    set.dirtyStart = set.colorDirtyStart = Infinity, set.dirtyEnd = set.colorDirtyEnd = 0;
    cases.forEach(([pos, rotation, scale], i)=>
    {
        set.setTransformAt(i, pos, rotation, scale);
        assert.deepEqual([...set.getMatrixAt(i).m], [...buildMatrix(pos, rotation, scale).m], 'case ' + i);
    });
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [0, 4]);
    assert.deepEqual([set.colorDirtyStart, set.colorDirtyEnd], [Infinity, 0], 'the colors wait');
    set.destroy();
});

test('a color change marks only the colors to upload', ()=>
{
    const set = new InstancedMesh3D(buildBox(), 4);
    set.dirtyStart = set.colorDirtyStart = Infinity, set.dirtyEnd = set.colorDirtyEnd = 0;
    set.setColorAt(2, hsl(0, 1, .5));
    assert.deepEqual([set.colorDirtyStart, set.colorDirtyEnd], [2, 3]);
    assert.deepEqual([set.dirtyStart, set.dirtyEnd], [Infinity, 0]);
    assert.deepEqual([...set.colorData.subarray(16, 20)], [1, 0, 0, 1]);
    set.destroy();
});

test('a radius set by hand is the culling sphere, and moving the instances no longer grows it', ()=>
{
    const set = new InstancedMesh3D(buildBox(), 2);
    set.radius = 3;
    set.setTransformAt(0, vec3(100, 0, 0));
    assert.equal(set.radius, 3);
    set.radius = undefined; // back to the bounds, which hold every instance set so far
    assert.ok(set.radius > 100);
    set.destroy();
});

// the script build with GL stood in, an InstancedMesh3D drawn inside the pass and every buffer call recorded
function drawnSet()
{
    const { run } = loadEngine();
    run(`
        new Render3DPlugin;
        var calls = [], bound, names = new Map;
        const record = (name)=> (...a)=> calls.push([name, ...a.map((x)=> names.get(x) ?? (x?.length ?? x))]);
        glContext = new Proxy({ ARRAY_BUFFER: 'ARRAY', FLOAT: 'FLOAT' }, { get: (t, key)=>
            key in t ? t[key] :
            key == 'createBuffer' ? ()=> { const b = {}; names.set(b, 'buffer' + names.size); return b; } :
            key == 'bindBuffer' ? (target, b)=> bound = b :
            key == 'vertexAttribPointer' ? (...a)=> calls.push(['attrib', names.get(bound), ...a.slice(0, 2), a[4], a[5]]) :
            ['bufferData', 'bufferSubData'].includes(key) ? (target, ...a)=> calls.push([key, names.get(bound), ...a.map((x)=> x?.length ?? x)]) :
            ()=> {} });
        render3DMeshUpload = render3DSetDrawUniforms = render3DBindMesh = ()=> {};
        render3D.isRendering = true, render3D.program = {}, render3D.frustumCulling = false;
        var set = new InstancedMesh3D(buildBox(), 3);
        set.mesh.bufferCount = 36;
        var draw = ()=> { calls = []; set.render3D(); return calls; };
    `);
    return run;
}

test('a draw uploads the matrices and the colors each to a buffer of its own, and only what changed', ()=>
{
    const run = drawnSet();
    const plain = (x)=> JSON.parse(JSON.stringify(x));
    const first = plain(run('draw()'));
    const uploads = first.filter((c)=> c[0].startsWith('buffer'));
    assert.deepEqual(uploads.map((c)=> [c[0], c[2]]), [['bufferData', 48], ['bufferData', 24]], 'all of both, once');
    const matrixBuffer = uploads[0][1], colorBuffer = uploads[1][1];
    assert.notEqual(matrixBuffer, colorBuffer);
    const attribs = first.filter((c)=> c[0] == 'attrib').map((c)=> c.slice(1));
    assert.deepEqual(attribs, [[matrixBuffer, 4, 4, 64, 0], [matrixBuffer, 5, 4, 64, 16], [matrixBuffer, 6, 4, 64, 32],
        [matrixBuffer, 7, 4, 64, 48], [colorBuffer, 11, 4, 32, 0], [colorBuffer, 12, 4, 32, 16]]);

    const moved = plain(run('set.setTransformAt(1, vec3(1, 2, 3)); draw()')).filter((c)=> c[0].startsWith('buffer'));
    assert.deepEqual(moved, [['bufferSubData', matrixBuffer, 64, 48, 16, 16]], 'one matrix');
    const colored = plain(run('set.setColorAt(2, RED); draw()')).filter((c)=> c[0].startsWith('buffer'));
    assert.deepEqual(colored, [['bufferSubData', colorBuffer, 64, 24, 16, 8]], 'one color');
    const still = plain(run('draw()')).filter((c)=> c[0].startsWith('buffer'));
    assert.deepEqual(still, [], 'nothing changed, nothing uploads');
});

test('setting instances does no bounds work, the radius works them out once when it is read', ()=>
{
    const { run } = loadEngine();
    const counts = run(`
        new Render3DPlugin;
        let stretches = 0;
        const stretch = render3DMaxStretchSquared;
        render3DMaxStretchSquared = (m, k)=> (++stretches, stretch(m, k));
        const set = new InstancedMesh3D(buildBox(), 50);
        stretches = 0;
        for (let i = 0; i < 50; ++i) set.setTransformAt(i, vec3(i, 0, 0));
        for (let i = 0; i < 50; ++i) set.setMatrixAt(i, buildMatrix(vec3(i, 0, 0)));
        const onSet = stretches;
        const radius = set.radius;
        const onRead = stretches;
        set.radius;
        [onSet, onRead, stretches, radius > 49];
    `);
    assert.deepEqual([...counts], [0, 50, 50, true]);
});
