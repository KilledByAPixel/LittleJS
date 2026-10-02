import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render3D, Render3DPlugin, vec3, vec2, rgb, PI, Matrix4, buildMatrix, buildBox, buildGrid, tile,
    EngineObject3D, InstancedMesh3D, ParticleEmitter3D, CameraControl3D, engineObjectsUpdate,
    engineObjectsCallback3D, ThreeJSPlugin, mainCanvasSize, cameraScale, setCameraScale, WHITE }
    from '../dist/littlejs.esm.js';

// review round 5 fixes in the 3D plugins: render3d, render3dExtras and threejs
const near = (a, b, msg, e=1e-5)=> assert.ok(Math.abs(a - b) < e, `${msg || ''} ${a} != ${b}`);

new Render3DPlugin; // headless, the plugin is a module singleton for the whole file

///////////////////////////////////////////////////////////////////////////////
// render3d.js

test('guards the transparent queue: a queued drawMesh keeps its matrix and color, not the caller\'s scratch ones', () =>
{
    const mesh = buildBox(), scratch = new Matrix4, color = rgb(1, 0, 0);
    const seen = [];
    render3D.transparentQueue = []; // as the transparent stage sets it
    try
    {
        for (let i = 0; i < 3; ++i)
        {
            color.g = i / 2;
            render3D.drawMesh(mesh, buildMatrix(vec3(i * 10, 0, 0), undefined, undefined, scratch), undefined, color);
        }
        // a spy, the queued closures call this.drawMesh when they replay
        render3D.drawMesh = (mesh, matrix, tileInfo, color)=> seen.push([matrix.m[12], color.g]);
        render3D.flushTransparentQueue();
    }
    finally
    {
        delete render3D.drawMesh;
        render3D.transparentQueue = undefined;
    }
    seen.sort((a, b)=> a[0] - b[0]);
    assert.deepEqual(seen, [[0, 0], [10, .5], [20, 1]], 'each draw replays where and how it was drawn');
});

test('guards the transparent queue: a queued billboard and soft disc keep their position and color', () =>
{
    const pos = vec3(1, 2, 3), color = rgb(1, 0, 0), size = vec2(2);
    const seen = [];
    render3D.transparentQueue = [];
    try
    {
        render3D.drawBillboard(pos, size, undefined, color);
        render3D.drawSoftDisc(pos, 1, color);
        pos.x = 9, color.r = 0, size.x = 5; // the caller reuses them before the stage ends
        render3D.drawBillboard = (p, s, t, c)=> seen.push(['billboard', p.x, s.x, c.r]);
        render3D.drawSoftDisc = (p, s, c)=> seen.push(['disc', p.x, c.r]);
        render3D.flushTransparentQueue();
    }
    finally
    {
        delete render3D.drawBillboard;
        delete render3D.drawSoftDisc;
        render3D.transparentQueue = undefined;
    }
    seen.sort();
    assert.deepEqual(seen, [['billboard', 1, 2, 1], ['disc', 1, 1]]);
});

test('guards queueTransparent returning nothing, so the draw methods are void and not any', () =>
{
    render3D.transparentQueue = undefined;
    let drawn = 0;
    assert.equal(render3D.queueTransparent(vec3(), ()=> ++drawn), undefined, 'drawn at once, nothing returned');
    assert.equal(drawn, 1);
});

test('guards 3D solid collision: a mass 0 mover keeps its velocity when it pushes something', () =>
{
    const platform = new EngineObject3D(vec3()), player = new EngineObject3D(vec3(.6, 0, 0));
    try
    {
        platform.setCollision();
        player.setCollision();
        engineObjectsUpdate(); // collects the solid objects
        platform.pos3D = vec3();
        player.pos3D = vec3(.6, 0, 0);
        platform.mass = 0;
        player.mass = 1;
        platform.velocity3D = vec3(1, 0, 0);
        player.velocity3D = vec3();
        player.updatePhysics(); // the player comes after the platform in the list, so it resolves the pair
        near(platform.velocity3D.x, 1, 'the platform keeps moving');
        near(platform.pos3D.x, 0, 'and stays put');
        assert.ok(player.pos3D.x > .6, 'the player is pushed clear');
    }
    finally
    {
        platform.destroy(true);
        player.destroy(true);
        engineObjectsUpdate();
    }
});

test('guards InstancedMesh3D with a headless tile(), which has no texture to read the uvs from', () =>
{
    const t = tile(0);
    assert.equal(t.textureInfo, undefined, 'headless, no image is loaded');
    const set = new InstancedMesh3D(buildBox(), 4, t); // threw reading the missing texture's size
    set.destroy(true);
});

test('guards buildGrid taking a number for its size, a square like buildBox', () =>
{
    const mesh = buildGrid(10, 2);
    assert.ok(mesh.points.length > 0);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of mesh.points)
    {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), 'no NaN points');
        minX = Math.min(minX, p.x), maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z), maxZ = Math.max(maxZ, p.z);
    }
    assert.deepEqual([minX, maxX, minZ, maxZ], [-5, 5, -5, 5]);
});

test('guards engineObjectsCallback3D skipping an object an earlier callback destroyed', () =>
{
    const a = new EngineObject3D(vec3()), b = new EngineObject3D(vec3());
    const seen = [];
    try
    {
        engineObjectsCallback3D(vec3(), 2, o=>
        {
            seen.push(o);
            for (const other of [a, b])
                other === o || other.destroy();
        }, [a, b]);
        assert.deepEqual(seen, [a], 'b was destroyed by the first callback');
    }
    finally
    {
        a.destroy(true);
        b.destroy(true);
    }
});

test('guards the d.ts types: callbacks with parameters, void draws and typed internals', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const classBlock = (name)=>
    {
        const block = dts.match(new RegExp('export class ' + name + '\\b[\\s\\S]*?\\n    }\\n'));
        assert.ok(block, 'class ' + name + ' in the d.ts');
        return block[0];
    };
    const line = (pattern)=>
    {
        const match = dts.match(new RegExp('\\n[^\\n]*' + pattern + '[^\\n]*'));
        assert.ok(match, pattern + ' in the d.ts');
        return match[0];
    };

    // Function gives TypeScript no parameter types, so a strict arrow callback fails
    const grid = line('export function buildGrid\\(');
    assert.doesNotMatch(grid, /: Function\b/, 'buildGrid callbacks are typed');
    assert.match(grid, /size\?: Vector2 \| number/, 'buildGrid size takes a number');
    const callback = line('export function engineObjectsCallback3D\\(');
    assert.doesNotMatch(callback, /: Function\b/);
    assert.match(callback, /EngineObject3D\) => void/);

    const plugin = classBlock('Render3DPlugin');
    assert.doesNotMatch(plugin.match(/\n\s+softShadowHeight: [^\n]*/)[0], /Function/);
    assert.doesNotMatch(plugin.match(/\n\s+drawSoftShadow\([^\n]*/)[0], /Function/);
    for (const method of ['drawMesh', 'drawStrip', 'drawBillboard', 'drawSoftDisc', 'drawSoftShadow', 'queueTransparent'])
        assert.match(plugin, new RegExp('\\n\\s+' + method + '\\([^\\n]*\\): void;'), method + ' returns void');
    for (const field of ['samplerKey', 'streamTileInfo', 'uniformValues'])
        assert.doesNotMatch(plugin, new RegExp('\\n\\s+' + field + ': (any|\\{\\});'), field + ' is typed');
    assert.doesNotMatch(classBlock('EngineObject3D'), /\n\s+matrixParent: any;/);
    assert.doesNotMatch(classBlock('Mesh'), /\n\s+vertexLayout: any;/);

    const emitter = classBlock('ParticleEmitter3D');
    assert.match(emitter, /\n\s+worldPos3D: Vector3 \| undefined;/);
    assert.doesNotMatch(classBlock('Trail3D'), /\n\s+samples: Array<any>;/);
});

///////////////////////////////////////////////////////////////////////////////
// render3dExtras.js

test('guards CameraControl3D keeping the pitch it was given, PI/2 looks straight down', () =>
{
    const control = new CameraControl3D(vec3(), 10, PI / 2);
    try
    {
        assert.ok(control.pitchRange.y >= PI / 2, 'the range holds the pitch given');
        control.update(); // clamps to pitchRange every frame
        near(control.pitch, PI / 2, 'not clamped down to 1.4');
        const low = new CameraControl3D(vec3(), 10, -1);
        try { near(low.pitchRange.x, -1, 'a low pitch widens the bottom'); }
        finally { low.destroy(true); }
        const plain = new CameraControl3D;
        try { assert.deepEqual([plain.pitchRange.x, plain.pitchRange.y], [-.2, 1.4], 'the default range is as it was'); }
        finally { plain.destroy(true); }
    }
    finally { control.destroy(true); }
});

test('guards ParticleEmitter3D declaring worldPos3D, so the d.ts types it', () =>
{
    const e = new ParticleEmitter3D(vec3(), 0, 0, 0, PI, undefined, WHITE, WHITE, WHITE, WHITE, 10, 1, 1, 0, 1, 0, 0, 0);
    try
    {
        assert.ok('worldPos3D' in e, 'declared in the constructor');
        assert.equal(e.worldPos3D, undefined, 'set by the first update');
    }
    finally { e.destroy(true); }
});

///////////////////////////////////////////////////////////////////////////////
// threejs.js

test('guards ThreeJSPlugin bringing its near and far planes back in after a big zoom out', () =>
{
    let updated = 0;
    const camera = { fov: 60, near: .1, far: 1e3, updateProjectionMatrix() { ++updated; },
        position: { set(x, y, z) { this.z = z; } }, rotation: { set() {} } };
    const plugin = { camera };
    const height = mainCanvasSize.y, scale = cameraScale;
    mainCanvasSize.y = 1080;
    try
    {
        setCameraScale(.5); // 1080 world units tall, so the camera sits about 1870 back
        ThreeJSPlugin.prototype.alignCamera2D.call(plugin);
        assert.ok(camera.far > camera.position.z, 'pushed out past the z = 0 plane');
        near(camera.near / camera.far, .1 / 1e3, 'near moved with it', 1e-12);

        setCameraScale(32); // zoomed back in, the plane is close again
        ThreeJSPlugin.prototype.alignCamera2D.call(plugin);
        assert.equal(camera.far, 1e3, 'far is back where it began');
        assert.equal(camera.near, .1, 'and near too, so close things are not clipped');
        assert.equal(updated, 2);

        ThreeJSPlugin.prototype.alignCamera2D.call(plugin);
        assert.equal(updated, 2, 'no projection update while the planes stay put');
    }
    finally
    {
        mainCanvasSize.y = height;
        setCameraScale(scale);
    }
});
