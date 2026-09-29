import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A mesh's upload measures its radius and bounding box while it packs the vertices, in one loop over the distinct
// vertices, instead of two more loops over every strip entry first; what it measures is what computeRadius gives.
// Headless has no GL context, so the packing is called the way upload calls it.

const { run } = loadEngine();
run('setHeadlessMode(true)');
await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin; }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);

// what the packing measures for a mesh, and what computeRadius does, each read into plain numbers
const measure = (build)=> JSON.parse(run(`{
    const mesh = ${build};
    const {vertices} = mesh.getTriangles();
    mesh.radius = 0, mesh.bounds = undefined;
    render3DMeshVertexData(mesh, vertices);
    const list = (v)=> [v.x, v.y, v.z], packed = [mesh.radius, list(mesh.bounds.min), list(mesh.bounds.max)];
    const radius = mesh.computeRadius();
    JSON.stringify({packed, measured: [radius, list(mesh.bounds.min), list(mesh.bounds.max)]});
}`));

for (const [name, build] of [
    ['a grid with heights', 'buildGrid(vec2(6, 4), 12, WHITE, (x, z)=> Math.sin(x) + z * .3, true)'],
    ['a flat shaded grid', 'buildGrid(vec2(3), 5, WHITE, (x, z)=> x * z, false)'],
    ['a box off center', 'new Mesh().combine(buildBox(2), vec3(1, 2, 3))'],
    ['a sphere', 'buildSphere(3)'],
    ['a list of triangles', 'new Mesh().addTriangles([vec3(-1, 0, 0), vec3(4, 0, 0), vec3(0, 5, -2)], [0, 1, 2])'],
])
test('packing ' + name + ' measures its radius and box as computeRadius does', ()=>
{
    const { packed, measured } = measure(build);
    near(packed[0], measured[0], 'radius');
    packed[1].forEach((v, i)=> near(v, measured[1][i], 'min'));
    packed[2].forEach((v, i)=> near(v, measured[2][i], 'max'));
});
