import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Camera3D, vec3, vec2, PI, Mesh, Matrix4, buildMatrix, WHITE, RED, rgb } from '../dist/littlejs.esm.js';

const near = (a, b, msg)=> assert.ok(Math.abs(a - b) < 1e-5, msg || `${a} != ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x); near(v.y, y); near(v.z, z); };

test('Render3DPlugin constructs headless and sets the global', () =>
{
    assert.equal(render3D, undefined);
    const plugin = new Render3DPlugin;
    assert.equal(render3D, plugin);
    assert.ok(plugin.camera instanceof Camera3D);
    assert.throws(()=> new Render3DPlugin); // singleton
});

test('Render3DPlugin has the documented defaults', () =>
{
    near(render3D.lightDirection.length(), 1);
    assert.equal(render3D.lighting, true);
    assert.equal(render3D.blend, false);
    assert.equal(render3D.additive, false);
    assert.equal(render3D.depthTest, true);
    assert.equal(render3D.depthWrite, true);
    assert.equal(render3D.cullBackFaces, false);
    assert.equal(render3D.specular, 0);
    assert.equal(render3D.fogEnd, 0);
    assert.equal(render3D.fogColor, undefined);
});

test('Camera3D defaults look down -Z from +Z', () =>
{
    const c = new Camera3D;
    nearVec(c.forward(), 0, 0, -1);
    nearVec(c.right(), 1, 0, 0);
    nearVec(c.up(), 0, 1, 0);
    assert.ok(c.pos.z > 0);
    near(c.fov, PI/3);
});

test('Camera3D lookAt sets pitch and yaw toward the target', () =>
{
    const c = new Camera3D;
    c.pos = vec3(0, 0, 0);
    c.lookAt(vec3(10, 0, 0));
    nearVec(c.forward(), 1, 0, 0);
    c.lookAt(vec3(0, 10, 0));
    nearVec(c.forward(), 0, 1, 0);
    c.lookAt(vec3(0, 0, 10));
    nearVec(c.forward(), 0, 0, 1);
    nearVec(c.up(), 0, 1, 0); // no roll
});

test('Camera3D view matrix moves the world so the camera is at the origin', () =>
{
    const c = new Camera3D;
    c.pos = vec3(0, 0, 10);
    c.rotation = vec3();
    nearVec(c.getViewMatrix().transformPoint(vec3(0, 0, 0)), 0, 0, -10);
    c.lookAt(vec3(10, 0, 10)); // face +X
    nearVec(c.getViewMatrix().transformPoint(vec3(10, 0, 10)), 0, 0, -10);
});

test('worldToClip maps ahead to center, right to +x, behind to undefined', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(16/9);
    const center = render3D.worldToClip(vec3(0, 0, 0));
    near(center.x, 0); near(center.y, 0);
    assert.ok(render3D.worldToClip(vec3(1, 0, 0)).x > 0);
    assert.ok(render3D.worldToClip(vec3(0, 1, 0)).y > 0);
    assert.equal(render3D.worldToClip(vec3(0, 0, 20)), undefined);
    // worldToScreen is the same mapped into mainCanvasSize pixels, y down
    const s = render3D.worldToScreen(vec3(0, 0, 0));
    assert.ok(s !== undefined && typeof s.x == 'number');
    assert.equal(render3D.worldToScreen(vec3(0, 0, 20)), undefined);
});

test('align2D parks the camera on +Z over the 2D camera position', () =>
{
    const c = render3D.camera;
    // explicit canvas height, since the headless canvas is zero sized
    c.update2D(540);
    near(c.pos.x, 0); near(c.pos.y, 0);
    near(c.pos.z, 540 / 2 / 32 / Math.tan(c.fov / 2)); // cameraScale defaults to 32
    nearVec(c.forward(), 0, 0, -1);
    // the automatic path runs from updateMatrices without throwing
    c.align2D = true;
    assert.doesNotThrow(()=> render3D.updateMatrices(16/9));
    c.align2D = false;
});

test('Mesh.addStrip adds one leading and one trailing repeat and keeps the count even', () =>
{
    const m = new Mesh;
    m.addStrip([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)]);
    assert.equal(m.vertexCount, 6);
    nearVec(m.points[0], 0, 0, 0); // leading repeat
    nearVec(m.points[1], 0, 0, 0);
    nearVec(m.points[4], 1, 1, 0);
    nearVec(m.points[5], 1, 1, 0); // trailing repeat
    // odd strip gets one more trailing repeat
    m.addStrip([vec3(0, 0, 1), vec3(1, 0, 1), vec3(0, 1, 1)]);
    assert.equal(m.vertexCount, 12);
    nearVec(m.points[11], 0, 1, 1);
    nearVec(m.points[10], 0, 1, 1);
    nearVec(m.points[6], 0, 0, 1);
});

test('Mesh.addStrip broadcasts single values and fills defaults', () =>
{
    const m = new Mesh;
    m.addStrip([vec3(), vec3(1), vec3(2), vec3(3)], vec3(0, 0, 1), vec2(.5), RED);
    for (let i = 0; i < m.vertexCount; ++i)
    {
        nearVec(m.normals[i], 0, 0, 1);
        near(m.uvs[i].x, .5);
        assert.equal(m.colors[i].r, 1);
        assert.equal(m.colors[i].g, 0);
    }
    const d = new Mesh;
    d.addStrip([vec3(), vec3(1), vec3(2), vec3(3)]);
    nearVec(d.normals[0], 0, 1, 0);
    near(d.uvs[0].x, 0);
    assert.equal(d.colors[0].r, 1);
    assert.equal(d.colors[0].a, 1);
    // per vertex arrays are used as given (index 0 is the leading repeat)
    const p = new Mesh;
    p.addStrip([vec3(), vec3(1), vec3(2)], [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)], [vec2(0), vec2(1), vec2(2)], [RED, WHITE, RED]);
    nearVec(p.normals[1], 1, 0, 0);
    nearVec(p.normals[2], 0, 1, 0);
    near(p.uvs[2].x, 1);
    assert.equal(p.colors[2].g, 1);
    assert.equal(p.vertexCount, 6); // 3 points + leading + trailing + odd pad
    // fewer than 3 points is an error
    assert.throws(()=> new Mesh().addStrip([vec3(), vec3(1)]));
});

test('Mesh.combine transforms points, rotates normals, tints colors', () =>
{
    const src = new Mesh;
    src.addStrip([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)], vec3(0, 0, 1));
    const dst = new Mesh;
    dst.combine(src, buildMatrix(vec3(10, 0, 0), vec3(0, PI/2, 0), vec3(2)), rgb(.5, .5, .5));
    assert.equal(dst.vertexCount, 6);
    nearVec(dst.points[2], 10, 0, -2);      // (1,0,0) scaled to (2,0,0), yawed to (0,0,-2), moved
    nearVec(dst.normals[2], 1, 0, 0);       // +Z normal yawed 90 to +X, still unit length
    near(dst.colors[2].r, .5);
    // combining again appends and stays even
    dst.combine(src, Matrix4.identity());
    assert.equal(dst.vertexCount, 12);
    nearVec(dst.points[8], 1, 0, 0);
});

test('Mesh.computeNormals gives outward flat normals for a counter clockwise quad', () =>
{
    // TL, BL, TR, BR in the XY plane seen from +Z: counter clockwise, so normal is +Z
    const m = new Mesh;
    m.addStrip([vec3(-1, 1, 0), vec3(-1, -1, 0), vec3(1, 1, 0), vec3(1, -1, 0)]);
    m.computeNormals(false);
    for (let i = 1; i < 5; ++i)
        nearVec(m.normals[i], 0, 0, 1);
});

test('Mesh.computeNormals smooth averages shared positions', () =>
{
    // two quads meeting at x=0 folded 90 degrees: the shared edge normal blends +Z and +X
    const m = new Mesh;
    m.addStrip([vec3(-1, 1, 0), vec3(-1, -1, 0), vec3(0, 1, 0), vec3(0, -1, 0)]);       // faces +Z
    m.addStrip([vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, 1, -1), vec3(0, -1, -1)]);       // faces +X
    m.computeNormals(true);
    const shared = m.normals[3]; // (0,1,0) of the first strip, also (0,1,0) of the second
    assert.ok(shared.x > 0 && shared.z > 0, 'shared normal blends both faces');
    near(shared.y, 0);
    near(shared.length(), 1);
    nearVec(m.normals[1], 0, 0, 1); // an unshared vertex keeps its face normal
});

test('Mesh.render is safe headless and dispose clears the buffer', () =>
{
    const m = new Mesh;
    m.addStrip([vec3(), vec3(1), vec3(2), vec3(3)]);
    assert.doesNotThrow(()=> m.render());
    assert.doesNotThrow(()=> m.render(Matrix4.identity(), RED));
    assert.equal(m.buffer, undefined);
    assert.doesNotThrow(()=> m.dispose());
});
