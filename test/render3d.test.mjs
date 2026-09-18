import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Camera3D, vec3, vec2, PI } from '../dist/littlejs.esm.js';

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
