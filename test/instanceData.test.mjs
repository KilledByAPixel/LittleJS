import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// an InstancedMesh3D's setDataAt gives each instance four numbers of the game's own, which a Shader reads as
// instanceData: kept in dataValues, made by the first one set, and only a program that reads it takes the input

test('setDataAt makes the data on first use and marks what changed', () =>
{
    const { run } = loadEngine();
    const [before, values, range] = JSON.parse(run(`
        new Render3DPlugin;
        const set = new InstancedMesh3D(buildBox(), 4);
        const before = set.dataValues === undefined;
        set.setDataAt(2, 1, 2, 3, 4);
        set.setDataAt(1, 5);
        JSON.stringify([before, Array.from(set.dataValues), [set.dataDirtyStart, set.dataDirtyEnd]])
    `));
    assert.ok(before, 'a set that never sets data has none');
    assert.deepEqual(values, [0,0,0,0, 5,0,0,0, 1,2,3,4, 0,0,0,0]);
    assert.deepEqual(range, [1, 3]);
});

test('only a program that reads instanceData takes the input, the plugin\'s own is unchanged', () =>
{
    const { run } = loadEngine();
    const [plain, vertex, fragment, shadow] = JSON.parse(run(`
        const reads = (code)=> render3DUsesInstanceData(code);
        const vertex = render3DInstanceDataVertex(render3DVertexSource(), true, true);
        const fragment = render3DInstanceDataFragment(render3DFragmentSource('void mainImage(out vec4 c, vec2 uv)' +
            '{ c = instanceData; }'), true);
        const shadow = render3DInstanceDataVertex(render3DShadowVertexSource('void mainVertex(inout vec3 p, inout vec3 n)' +
            '{ p.y += instanceData.w; }'), true, false);
        JSON.stringify([render3DInstanceDataVertex(RENDER3D_VERTEX_SOURCE, reads('c = texture(tex, uv);'), true) ===
            RENDER3D_VERTEX_SOURCE, vertex, fragment, shadow])
    `));
    assert.ok(plain, 'a snippet that does not read it changes nothing');
    assert.match(vertex, /layout[(]location=8[)] in vec4 instanceData;out vec4 instanceDataV;/);
    assert.match(vertex, /void main[(][)][{]instanceDataV=instanceData;/);
    assert.match(fragment, /in vec4 instanceDataV;\n#define instanceData instanceDataV/);
    assert.match(shadow, /layout[(]location=8[)] in vec4 instanceData;void main/);
    assert.doesNotMatch(shadow, /instanceDataV/, 'the depth program has no fragment stage that reads it');
});

test('markDataDirty takes a run, for data written straight into dataValues', () =>
{
    const { run } = loadEngine();
    assert.deepEqual(JSON.parse(run(`
        new Render3DPlugin;
        const set = new InstancedMesh3D(buildBox(), 10);
        set.markDataDirty(3, 7);
        JSON.stringify([set.dataValues.length, set.dataDirtyStart, set.dataDirtyEnd])
    `)), [40, 3, 7]);
});
