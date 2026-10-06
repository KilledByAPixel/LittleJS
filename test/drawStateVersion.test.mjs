import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// the 3D draw state keeps a version that goes up only when a field really changes, so a batch checks one number
// per draw while the state holds, and compares the fields only after something was set

const { run: runTop } = loadEngine();
runTop('new Render3DPlugin');
const run = (code)=> runTop('(()=>{' + code + '})()');

test('a draw state change bumps the version, the same value set again does not', () =>
{
    const result = run(`
        const r = render3D, changes = {blend: true, additive: true, depthTest: false, depthWrite: false,
            cullBackFaces: true, mirrored: true, lighting: false, emissive: 1, receiveShadow: false, specular: .5,
            pixelated: true, shader: new Shader('void mainImage(out vec4 c, vec2 p) { c = vec4(1); }'), normalMap: {}, normalScale: 2, shininess: 64, reflectivity: .5,
            emissiveMap: {}, environmentMap: {}};
        const out = [];
        for (const name of RENDER3D_STATE_FIELDS)
        {
            if (name == 'emissiveMapColor') continue;
            const before = r[name], v0 = r.stateVersion;
            r[name] = before;
            const same = r.stateVersion - v0;
            r[name] = changes[name];
            const changed = r.stateVersion - v0, reads = r[name] === changes[name];
            r[name] = before;
            out.push([name, same, changed, reads]);
        }
        return out;
    `);
    for (const [name, same, changed, reads] of result)
        assert.deepEqual([name, same, changed, reads], [name, 0, 1, true]);
});

test('emissiveMapColor bumps by its rgb: an equal color does not, a color changed in place and set again does', () =>
{
    const result = run(`
        const r = render3D, v = ()=> r.stateVersion, out = [];
        let v0 = v();
        r.emissiveMapColor = rgb(1, 1, 1, .5); out.push(v() - v0); // alpha is not part of it
        r.emissiveMapColor = undefined; out.push(v() - v0, r.emissiveMapColor); // undefined is white
        const glow = rgb(1, 0, 0);
        v0 = v(); r.emissiveMapColor = glow; out.push(v() - v0, r.emissiveMapColor === glow);
        v0 = v(); glow.g = 1; r.emissiveMapColor = glow; out.push(v() - v0);
        r.emissiveMapColor = WHITE;
        return out;
    `);
    assert.deepEqual([...result], [0, 0, undefined, 1, true, 1]);
});

test('a batch checks the version first, so while it holds the fields are not compared', () =>
{
    const changed = run(`
        const s = render3DCaptureBatchState();
        s.specular = 99; // a captured copy made to differ without the version moving
        return render3DStateChanged(s);
    `);
    assert.equal(changed, false);
});

test('a field set to another value and back keeps the batch going, which takes the new version', () =>
{
    const result = run(`
        const r = render3D, s = render3DCaptureBatchState();
        r.specular = .5; r.specular = 0;
        const changed = render3DStateChanged(s);
        return [changed, s.version === r.stateVersion, render3DStateChanged(s)];
    `);
    assert.deepEqual([...result], [false, true, false]);
});

test('a real change is still seen after the version moved', () =>
{
    const result = run(`
        const r = render3D, s = render3DCaptureBatchState();
        r.additive = true;
        const changed = render3DStateChanged(s);
        r.additive = false;
        return [changed, render3DStateChanged(s)];
    `);
    assert.deepEqual([...result], [true, false]);
});

// drawMesh into its batch with GL stood in: the flushes counted, or run on stubs with what they draw with recorded
const drawMeshes = (body)=> run(`
    render3DSetObjectState();
    const upload = render3DMeshUpload, drawInstanced = render3DDrawInstanced, gl = glContext;
    const mesh = buildBox(), twoSided = buildBox(), m = buildMatrix(vec3()), flipped = buildMatrix(vec3(), undefined, vec3(-1, 1, 1));
    twoSided.doubleSided = true;
    for (const x of [mesh, twoSided]) x.bufferCount = 36, x.radius = 1, x.buffer = {}; // as if uploaded
    render3DMeshUpload = ()=> {};
    const drawn = [];
    render3DDrawInstanced = (mesh, buffer, count, textureInfo, state)=>
        drawn.push([mesh === twoSided ? 'twoSided' : 'box', count, state.cullBackFaces, state.mirrored]);
    glContext = new Proxy({}, { get: ()=> ()=> {} });
    render3D.instanceBuffers = [{}], render3D.instanceBufferIndex = 0;
    render3D.isRendering = true, render3D.program = {};
    render3D.camera.pos = vec3(0, 0, 10), render3D.updateMatrices(1); // the boxes in view, not culled
    try { ${body} }
    finally
    {
        render3DMeshUpload = upload, render3DDrawInstanced = drawInstanced, glContext = gl;
        render3D.isRendering = false, render3D.program = undefined;
        render3D.instanceMeshes.length = 0, render3DSetObjectState();
    }`);

test('drawing meshes into their batches leaves the draw state and its version as they were', () =>
{
    const result = drawMeshes(`
        const v0 = render3D.stateVersion, cull = render3D.cullBackFaces, mirrored = render3D.mirrored;
        render3D.drawMesh(mesh, m); render3D.drawMesh(mesh, flipped); render3D.drawMesh(twoSided, m);
        return [render3D.stateVersion - v0, render3D.cullBackFaces === cull, render3D.mirrored === mirrored];
    `);
    assert.deepEqual([...result], [0, true, true]);
});

test('a mirroring matrix splits a drawMesh batch, each flush culling by its mesh and winding by its matrices', () =>
{
    const drawn = drawMeshes(`
        render3D.drawMesh(mesh, m); render3D.drawMesh(mesh, m);
        render3D.drawMesh(mesh, flipped); // wound the other way, a batch of its own
        render3D.drawMesh(twoSided, flipped);
        render3DFlushInstances();
        return drawn.map((d)=> [...d]);
    `);
    assert.deepEqual(JSON.parse(JSON.stringify(drawn)),
        [['box', 2, true, false], ['box', 1, true, true], ['twoSided', 1, false, true]]);
});
