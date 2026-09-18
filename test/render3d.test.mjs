import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Camera3D, vec3, vec2, PI, Mesh, Matrix4, buildMatrix, WHITE, RED, rgb, buildLathe, buildSphere, buildBox, buildGrid, buildLoft } from '../dist/littlejs.esm.js';

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

// every real triangle's outward normal must point away from the origin for a convex shape
function assertOutward(mesh, msg)
{
    const p = mesh.points;
    for (let i = 0; i + 2 < p.length; ++i)
    {
        const a = p[i], b = p[i+1], c = p[i+2];
        let n = b.subtract(a).cross(c.subtract(a));
        if (n.lengthSquared() < 1e-9) continue; // degenerate join
        n = n.scale(i & 1 ? 1 : -1);
        const center = a.add(b).add(c).scale(1/3);
        assert.ok(n.dot(center) > 0, `${msg}: triangle ${i} winds inward`);
        // and the stored normals agree with the face
        for (let j = 0; j < 3; ++j)
            assert.ok(mesh.normals[i + j].dot(n) > 0, `${msg}: normal ${i + j} disagrees with its face`);
    }
}

test('buildLathe cylinder has the expected vertex counts and winds outward', () =>
{
    const flat = buildLathe([[1, -1], [1, 1]], 8, false);
    assert.equal(flat.vertexCount, 8 * 6);
    assertOutward(flat, 'flat cylinder');
    const smooth = buildLathe([[1, -1], [1, 1]], 8, true);
    assert.equal(smooth.vertexCount, 2 * 9 + 2);
    assertOutward(smooth, 'smooth cylinder');
    // smooth normals are radial on a cylinder
    for (let i = 1; i < smooth.vertexCount - 1; ++i)
        near(smooth.normals[i].y, 0);
    // uvs run around and along
    near(smooth.uvs[1].x, 0);
    near(smooth.uvs[smooth.vertexCount - 2].x, 1);
});

test('buildLathe octahedron with 4 sides winds outward', () =>
{
    const m = buildLathe([[0, -1], [1, 0], [0, 1]], 4);
    assert.equal(m.vertexCount, 2 * 4 * 6);
    assertOutward(m, 'octahedron');
    for (const p of m.points)
        assert.ok(p.length() <= 1 + 1e-6);
});

test('buildSphere is unit diameter and outward', () =>
{
    const m = buildSphere(8, 4);
    assertOutward(m, 'sphere');
    let maxR = 0;
    for (const p of m.points)
        maxR = Math.max(maxR, p.length());
    near(maxR, .5);
    // smooth normals on a sphere point along the position
    for (let i = 0; i < m.vertexCount; ++i)
        if (m.points[i].lengthSquared() > 1e-6)
            assert.ok(m.normals[i].dot(m.points[i].normalize()) > .9);
});

test('buildBox has six axis aligned faces', () =>
{
    const m = buildBox(vec3(2, 4, 6));
    assert.equal(m.vertexCount, 36);
    assertOutward(m, 'box');
    const seen = new Set;
    for (let i = 0; i < 36; ++i)
    {
        const n = m.normals[i];
        seen.add(`${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`);
        const p = m.points[i];
        near(Math.abs(p.x), 1); near(Math.abs(p.y), 2); near(Math.abs(p.z), 3);
    }
    assert.equal(seen.size, 6);
    // uvs cover the tile on each face
    assert.ok(m.uvs.some(uv => uv.x == 1 && uv.y == 1));
    assert.ok(m.uvs.some(uv => uv.x == 0 && uv.y == 0));
});

test('buildGrid samples the height and color functions and faces up', () =>
{
    const m = buildGrid(4, 2, 2, 1, (x, z)=> x + 10*z, (x, z)=> rgb((x + 2) / 4, 0, 0));
    assert.equal(m.vertexCount, 1 * (2 * 3 + 2));
    // corners: x in -2..2, z in -1..1
    const corner = m.points.find(p => Math.abs(p.x + 2) < 1e-6 && Math.abs(p.z + 1) < 1e-6);
    near(corner.y, -2 - 10);
    near(m.colors[1].r, (m.points[1].x + 2) / 4);
    for (let i = 1; i < m.vertexCount - 1; ++i)
        assert.ok(m.normals[i].y > 0, 'grid normal points up');
    // winding: a flat grid faces +Y
    const flat = buildGrid(2, 2, 1, 1);
    const p = flat.points;
    const n = p[2].subtract(p[1]).cross(p[3].subtract(p[1])); // first real triangle at index 1
    assert.ok(n.y > 0, 'flat grid first triangle faces up');
    nearVec(flat.normals[1], 0, 1, 0);
});

test('buildLoft closes both ends and winds outward', () =>
{
    // a symmetric hull: nose at +z, tail at -z, diamond sections
    const m = buildLoft([[1, .1, .1, -.1], [0, 1, .5, -.5], [-1, .8, .4, -.4]]);
    // 2 station pairs x 4 sides + 2 caps = 10 quads of 6 vertices
    assert.equal(m.vertexCount, 10 * 6);
    assertOutward(m, 'loft');
    for (let i = 0; i < m.vertexCount; ++i)
        near(m.normals[i].length(), 1);
});
