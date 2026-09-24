import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render3D, Render3DPlugin, vec3, vec2, PI, Mesh, Matrix4, WHITE, rgb, buildBox, HeightMap, Ray3D,
    FirstPersonCamera3D, EngineObject3D, InstancedMesh3D, ParticleEmitter3D, parseOBJ, engineObjectsUpdate,
    parseGLTF, GLTFModel, GLTFPart, GLTFAnimation, threeJS, ThreeJSPlugin, ThreeJSObject, mainCanvasSize,
    cameraScale, setCameraScale } from '../dist/littlejs.esm.js';

// review round 4 fixes in the 3D plugins: render3d, render3dExtras, math3d, gltf and threejs
const near = (a, b, msg, e=1e-5)=> assert.ok(Math.abs(a - b) < e, `${msg || ''} ${a} != ${b}`);
const nearVec = (v, x, y, z, msg, e)=> { near(v.x, x, msg, e); near(v.y, y, msg, e); near(v.z, z, msg, e); };

// a small seeded random, so the ray sweep below is the same every run
function random32(seed)
{
    return ()=>
    {
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

new Render3DPlugin; // headless, the plugin is a module singleton for the whole file

///////////////////////////////////////////////////////////////////////////////
// render3d.js

test('an indexed mesh combined with itself, as a mirror, doubles once and returns', () =>
{
    const m = new Mesh().addTriangles([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)], [0, 1, 2]);
    // an index list that stops the old endless loop, which read the list it was growing, with an error instead
    class Capped extends Array
    {
        push(...items)
        {
            if (this.length > 100) throw new Error('combine kept reading the indices it added');
            return super.push(...items);
        }
    }
    m.indices = Capped.from(m.indices);
    m.combine(m, Matrix4.scaling(vec3(-1, 1, 1)));
    assert.equal(m.points.length, 6);
    assert.equal(m.indices.length, 6);
    nearVec(m.points[4], -1, 0, 0, 'the copy is mirrored');
    assert.deepEqual([...m.indices.slice(3)], [3, 5, 4], 'a mirror turns the copied triangle the other way round');
});

test('a transparent InstancedMesh3D is queued with the other transparent draws, not drawn at once', () =>
{
    const set = new InstancedMesh3D(buildBox(), 2);
    set.transparent = true;
    set.pos3D = vec3(3, 0, 0);
    render3D.transparentQueue = [];
    try
    {
        set.render3D();
        assert.equal(render3D.transparentQueue.length, 1, 'queued for sorting');
        near(render3D.transparentQueue[0].distance, vec3(3, 0, 0).distanceSquared(render3D.camera.pos), 'sorted by the object position');
    }
    finally
    {
        render3D.transparentQueue = undefined;
        set.destroy(true);
    }
});

test('addChild outside the child update does not move the child by its velocity again', () =>
{
    const parent = new EngineObject3D(vec3());
    const child = new EngineObject3D(vec3());
    child.velocity3D = vec3(1, 0, 0);
    const other = new EngineObject3D(vec3(5, 0, 0));
    try
    {
        engineObjectsUpdate(); // an engine pass: the child is a root and moves once
        near(child.pos3D.x, 1, 'moved by the pass');
        parent.addChild(child); // as from gameUpdate or an update, after the pass moved it
        near(child.pos3D.x, 1, 'addChild only brings the transform up to date, it is not a step');

        // attach still keeps the world position
        parent.pos3D = vec3(3, 0, 0);
        parent.attach(other);
        nearVec(other.pos3D, 2, 0, 0);
        nearVec(other.getWorldPos3D(), 5, 0, 0);
    }
    finally { parent.destroy(true); }
});

test('the 3D plugin fields, playSound and glTF duration have real types in the d.ts', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const classBlock = (name)=>
    {
        const block = dts.match(new RegExp('export class ' + name + '\\b[\\s\\S]*?\\n    }\\n'));
        assert.ok(block, 'class ' + name + ' in the d.ts');
        return block[0];
    };
    const plugin = classBlock('Render3DPlugin');
    for (const field of ['program', 'currentProgram', 'shadowShader', 'vao', 'whiteTexture', 'shadowTexture',
        'shadowFramebuffer', 'streamBuffer', 'frustumPlanes', 'shadowPlanes', 'transparentQueue'])
        assert.doesNotMatch(plugin, new RegExp('\\n\\s+' + field + ': any'), field + ' is typed');
    assert.match(plugin, /\n\s+program: WebGLProgram \| undefined;/);
    assert.match(plugin, /\n\s+capture: Mesh \| undefined;/);
    assert.match(plugin, /playSound\(sound: Sound, pos3D: Vector3, volume\?: number, pitch\?: number, randomnessScale\?: number, loop\?: boolean, paused\?: boolean\)/);
    assert.match(classBlock('Mesh'), /\n\s+instanceData: Float32Array \| undefined;/);
    assert.match(classBlock('GLTFAnimation'), /\n\s+duration: number;/);
});

///////////////////////////////////////////////////////////////////////////////
// render3dExtras.js

test('a finishing emitter lets go of its parent where it is in the world, the parent applied once', () =>
{
    const parent = new EngineObject3D(vec3(10, 0, 0));
    const e = new ParticleEmitter3D(vec3(), 0, 0, 0, PI, undefined, WHITE, WHITE, WHITE, WHITE, 10, 1, 1, 0, 1, 0, 0, 0);
    try
    {
        parent.addChild(e);
        e.pos3D = vec3(0, 1, 0);
        e.emitParticle();
        assert.ok(e.particleCount > 0);
        e.destroy(); // it stays until its particles are gone, off the parent
        assert.equal(e.parent, undefined);
        assert.equal(e.destroyed, false);
        nearVec(e.getWorldPos3D(), 10, 1, 0, 'where it was');
    }
    finally { e.destroy(true); parent.destroy(true); }
});

test('HeightMap.raycast finds rays that come in through the side of the terrain', () =>
{
    // flat ground at y 2 on a 10 by 10 map: each ray enters through the -x side below the ground, rises, and
    // breaks through at a known point; where it enters can round a hair outside the map
    const map = new HeightMap([[1, 1], [1, 1]], vec2(10), 2);
    const random = random32(4), between = (a, b)=> a + (b - a) * random();
    let misses = 0;
    for (let i = 0; i < 500; ++i)
    {
        const entry = vec3(-5, between(.2, 1.8), between(-4.5, 4.5));
        const hit = vec3(between(-4, 4), 2, between(-4, 4));
        const direction = hit.subtract(entry).scale(between(.3, 3));
        const ray = new Ray3D(entry.subtract(direction.scale(between(.5, 5))), direction);
        const t = map.raycast(ray);
        if (t === undefined) { ++misses; continue; }
        nearVec(ray.getPosition(t), hit.x, hit.y, hit.z, 'lands where it crosses', 1e-3);
    }
    assert.equal(misses, 0, 'every ray crossed the terrain');
});

test('HeightMap.raycast finds a crossing between the last step and the edge of the map', () =>
{
    // flat ground at 0, one cell of 10 so a step is 5 along x: the ray drops through the ground at x 4.97,
    // after the sample at 4.95 and before the edge at 5
    const map = new HeightMap([[0, 0], [0, 0]], vec2(10), 1);
    const ray = new Ray3D(vec3(-5, .997, 0), vec3(1, -.1, 0));
    const t = map.raycast(ray);
    assert.notEqual(t, undefined);
    near(t, 9.97, 'where it crosses', 1e-3);
});

test('HeightMap flat colors give each cell the color of its first corner, every cell the same way', () =>
{
    // 101 columns over 100 units, so every cell center is halfway between two color samples
    const columns = 101, heights = [], colors = [];
    for (let j = 0; j < 2; ++j)
    {
        heights.push(new Array(columns).fill(0));
        colors.push(Array.from({ length: columns }, (_, i)=> rgb(i / 100, 0, 0)));
    }
    const mesh = new HeightMap(heights, vec2(100, 1), 1, colors).buildMesh(false);
    const used = new Set(mesh.colors.map(c=> Math.round(c.r * 100)));
    assert.equal(used.size, 100, 'one color per cell');
    assert.equal(Math.max(...used), 99, 'each the cell\'s own first corner');
});

test('parseOBJ smooths the faces without normals in a file where other faces have them', () =>
{
    // a face with normals in the z = 0 plane, and a face without them in the y = 0 plane, sharing an edge
    const mesh = parseOBJ(['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'v 0 0 1', 'vn 0 0 1', 'f 1//1 2//1 3//1', 'f 1 4 2'].join('\n'), true);
    const atOrigin = mesh.points.map((p, i)=> ({ p, n: mesh.normals[i] })).filter(({ p })=> !p.x && !p.y && !p.z);
    assert.equal(atOrigin.length, 2, 'one vertex for each face');
    const fromFile = atOrigin.find(v=> v.n.z > .99), smoothed = atOrigin.find(v=> v !== fromFile);
    assert.ok(fromFile, 'the file normal is kept');
    nearVec(smoothed.n, 0, Math.SQRT1_2, Math.SQRT1_2, 'smoothed across both faces');
});

test('FirstPersonCamera3D does not fall under render3D.gravity while flying', () =>
{
    const gravity = render3D.gravity;
    render3D.gravity = vec3(0, -.01, 0);
    const camera = new FirstPersonCamera3D(vec3(0, 5, 0), 0, 0);
    camera.lockPointer = false;
    try
    {
        camera.fly = true;
        camera.updatePhysics();
        near(camera.pos3D.y, 5, 'flying holds its height');
        near(camera.velocity3D.y, 0);
        assert.equal(camera.gravityScale, 1, 'its own gravity scale is put back');
        camera.fly = false;
        camera.updatePhysics();
        near(camera.velocity3D.y, -.01, 'walking falls');
    }
    finally
    {
        render3D.gravity = gravity;
        camera.destroy(true);
    }
});

///////////////////////////////////////////////////////////////////////////////
// math3d.js

test('Matrix4.lookAt straight down or up keeps +X as the right axis, like three.js', () =>
{
    const down = Matrix4.lookAt(vec3(0, 5, 0), vec3()).m;
    nearVec(vec3(down[0], down[1], down[2]), 1, 0, 0, 'right');
    nearVec(vec3(down[4], down[5], down[6]), 0, 0, -1, 'screen up is -z');
    const up = Matrix4.lookAt(vec3(0, -5, 0), vec3()).m;
    nearVec(vec3(up[0], up[1], up[2]), 1, 0, 0, 'right');
    nearVec(vec3(up[4], up[5], up[6]), 0, 0, 1, 'screen up is +z');
});

///////////////////////////////////////////////////////////////////////////////
// gltf.js

// one buffer: a triangle's positions, float vertex colors, and the indices and values of two sparse accessors
const gltfBuffer = new ArrayBuffer(104), gltfFloats = new Float32Array(gltfBuffer), gltfShorts = new Uint16Array(gltfBuffer);
gltfFloats.set([0, 0, 0,  1, 0, 0,  0, 1, 0], 0);                     // positions at 0
gltfFloats.set([.21404114, 0, 1,  .21404114, 0, 1,  .21404114, 0, 1], 9); // linear colors at 36
gltfShorts[36] = 2;                                                    // sparse indices at 72
gltfFloats.set([5, 6, 7], 19);                                         // sparse values at 76
gltfShorts[44] = 1;                                                    // sparse indices at 88
gltfFloats.set([8, 9, 10], 23);                                        // sparse values at 92
const gltfJSON = (scene)=> ({
    asset: { version: '2.0' },
    buffers: [{ byteLength: 104, uri: 'data:application/octet-stream;base64,' + Buffer.from(gltfBuffer).toString('base64') }],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 2 },
        { buffer: 0, byteOffset: 76, byteLength: 12 },
        { buffer: 0, byteOffset: 88, byteLength: 2 },
        { buffer: 0, byteOffset: 92, byteLength: 12 },
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3',
            sparse: { count: 1, indices: { bufferView: 2, componentType: 5123 }, values: { bufferView: 3 } } },
        { componentType: 5126, count: 3, type: 'VEC3', // no bufferView, it starts as zeros
            sparse: { count: 1, indices: { bufferView: 4, componentType: 5123 }, values: { bufferView: 5 } } },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [.21404114, 0, 1, 1], baseColorTexture: { index: 0 } } }],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9728 }], // NEAREST
    images: [{ uri: 'unused.png' }], // headless loads no textures
    meshes: [
        { primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, material: 0 }] },
        { primitives: [{ attributes: { POSITION: 2 } }] },
        { primitives: [{ attributes: { POSITION: 3 } }] },
    ],
    nodes: [{ mesh: 0 }, { mesh: 1 }, { mesh: 2 }],
    scenes: [{ nodes: [0] }, { nodes: [1, 2] }],
    scene,
});

test('glTF material and vertex colors are linear and come in as sRGB, alpha untouched', async () =>
{
    const [part] = (await parseGLTF(gltfJSON(0))).parts;
    near(part.color.r, .5, 'a linear .214 is sRGB .5', 1e-3);
    assert.equal(part.color.g, 0);
    assert.equal(part.color.b, 1);
    assert.equal(part.color.a, 1);
    near(part.mesh.colors[0].r, .5, 'vertex colors too', 1e-3);
    assert.equal(part.mesh.colors[0].b, 1);
});

test('a glTF texture with nearest filtering makes a pixelated part and object', async () =>
{
    const model = await parseGLTF(gltfJSON(0));
    assert.equal(model.parts[0].pixelated, true);
    const object = model.createObject();
    try { assert.equal(object.children[0].pixelated, true); }
    finally { object.destroy(true); }
});

test('glTF sparse accessors are read, over their bufferView or over zeros', async () =>
{
    const [over, zeros] = (await parseGLTF(gltfJSON(1))).parts;
    nearVec(over.mesh.points[0], 0, 0, 0);
    nearVec(over.mesh.points[1], 1, 0, 0, 'the base values stay');
    nearVec(over.mesh.points[2], 5, 6, 7, 'the listed one is replaced');
    nearVec(zeros.mesh.points[0], 0, 0, 0);
    nearVec(zeros.mesh.points[1], 8, 9, 10, 'the listed one over zeros');
    nearVec(zeros.mesh.points[2], 0, 0, 0);
});

// a model of empty parts, one per node, with no parents and resting at the origin, to pose by hand
const posedModel = (nodes, animations)=> new GLTFModel(
    Array.from({ length: nodes }, (_, i)=> { const p = new GLTFPart('part ' + i, new Mesh, WHITE, undefined, false); p.node = i; return p; }),
    animations, { nodes: Array.from({ length: nodes }, ()=> ({})), parents: [], restInverse: Array.from({ length: nodes }, ()=> new Matrix4) });

test('a glTF animation finds its keys by halving, not by reading every key from the start', () =>
{
    const count = 10000, times = Array.from({ length: count }, (_, i)=> i / 60), values = new Float32Array(count * 3);
    for (let i = 0; i < count; ++i)
        values[i * 3] = i;
    let reads = 0;
    const counted = new Proxy(times, { get(target, key, receiver)
    {
        if (typeof key == 'string' && /^\d+$/.test(key)) ++reads;
        return Reflect.get(target, key, receiver);
    } });
    const animation = new GLTFAnimation('slide', [{ node: 0, path: 'translation', interpolation: 'LINEAR', times: counted, values, components: 3 }]);
    const model = posedModel(1, [animation]);
    reads = 0;
    const pose = model.getPose(animation, 8000.5 / 60);
    near(pose[0].getTranslation().x, 8000.5, 'between keys 8000 and 8001', 1e-2);
    assert.ok(reads < 100, `read ${reads} key times`);
});

test('a GLTFObject poses its own parts, whatever happened to its children', () =>
{
    const animation = new GLTFAnimation('move', [{ node: 1, path: 'translation', interpolation: 'LINEAR',
        times: [0, 1], values: new Float32Array([0, 0, 0, 2, 0, 0]), components: 3 }]);
    const object = posedModel(2, [animation]).createObject();
    try
    {
        const [first, second] = object.children;
        first.destroy(); // knocked off, the children shift down
        object.play(animation, false);
        object.setAnimationTime(1);
        nearVec(second.pos3D, 2, 0, 0, 'the second part got its own pose');
    }
    finally { object.destroy(true); }
});

test('GLTFModel.dispose frees every part mesh, the combined mesh and each texture once', () =>
{
    let freed = 0;
    const texture = { destroyWebGLTexture() { ++freed; } }; // a stand in, headless has no textures
    const parts = [0, 1].map(i=> new GLTFPart('part ' + i, new Mesh().addTriangles([vec3(), vec3(1, 0, 0), vec3(0, 1, 0)], [0, 1, 2]), WHITE, texture, false));
    const model = new GLTFModel(parts);
    for (const mesh of [...parts.map(p=> p.mesh), model.mesh])
        mesh.buffer = {}; // as if uploaded, dispose lets go of it
    model.dispose();
    for (const mesh of [...parts.map(p=> p.mesh), model.mesh])
        assert.equal(mesh.buffer, undefined);
    assert.equal(freed, 1, 'the shared texture is freed once');
});

///////////////////////////////////////////////////////////////////////////////
// threejs.js

test('ThreeJSObject with a mesh works headless, where the plugin has no scene', () =>
{
    new ThreeJSPlugin;
    assert.equal(threeJS.scene, undefined);
    const mesh = { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: {} };
    const o = new ThreeJSObject(vec2(1, 2), vec2(1), mesh, 3);
    assert.equal(mesh.position.x, 1);
    assert.equal(mesh.position.z, 3);
    o.destroy();
    assert.ok(o.destroyed);
});

test('ThreeJSPlugin moves its far plane out when the aligned 2D view zooms out past it', () =>
{
    let updated = 0;
    const camera = { fov: 60, near: .1, far: 1e3, updateProjectionMatrix() { ++updated; },
        position: { set(x, y, z) { this.z = z; } }, rotation: { set() {} } };
    const height = mainCanvasSize.y, scale = cameraScale;
    mainCanvasSize.y = 1080;
    setCameraScale(.5); // 1080 world units tall, so the camera sits about 1870 back
    try
    {
        ThreeJSPlugin.prototype.alignCamera2D.call({ camera });
        const distance = 1080 / Math.tan(PI / 6);
        near(camera.position.z, distance, 'the camera distance', 1e-6);
        assert.ok(camera.far > distance, 'the z = 0 plane is inside the far plane');
        near(camera.near / camera.far, .1 / 1e3, 'near moved with it', 1e-12);
        assert.equal(updated, 1);
    }
    finally
    {
        mainCanvasSize.y = height;
        setCameraScale(scale);
    }
});
