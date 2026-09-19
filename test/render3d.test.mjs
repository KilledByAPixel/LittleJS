import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Camera3D, vec3, vec2, PI, Mesh, Matrix4, buildMatrix, WHITE, RED, rgb, TileInfo, buildLathe, buildCylinder, buildSphere, buildBox, buildGrid, buildLoft, buildSky, buildCone, buildCapsule, buildTorus, buildExtrude, buildText3D, HeightMap, setRender3DSmoothShading, EngineObject3D, EngineObject, engineObjects, Light3D, ParticleEmitter3D, Trail3D, parseOBJ } from '../dist/littlejs.esm.js';

// the plugin is a module singleton, these tests run in order in one process and share it
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
    assert.equal(render3D.isRendering, false);
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

test('Mesh.combine keeps normals correct under non-uniform scale', () =>
{
    const src = new Mesh;
    // a quad tilted 45 degrees about Y, facing (1, 0, 1)
    src.addStrip([vec3(-1, 1, 1), vec3(-1, -1, 1), vec3(1, 1, -1), vec3(1, -1, -1)], vec3(1, 0, 1).normalize());
    const dst = new Mesh().combine(src, buildMatrix(undefined, undefined, vec3(2, 1, 1)));
    assert.equal(dst.vertexCount, 6);
    // the inverse transpose scales the normal by (1/2, 1, 1), so (1,0,1) becomes (1,0,2) normalized
    nearVec(dst.normals[1], 1/Math.sqrt(5), 0, 2/Math.sqrt(5));
    near(dst.normals[1].length(), 1);
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
    const m = buildSphere(8, 4, true);
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
    const m = buildGrid(4, 2, 2, 1, (x, z)=> rgb((x + 2) / 4, 0, 0), (x, z)=> x + 10*z, true);
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

test('pushStrip and bake capture into a mesh headless', () =>
{
    const mesh = render3D.bake(()=>
    {
        render3D.pushStrip([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)]);
        render3D.pushStrip([vec3(0, 0, 1), vec3(1, 0, 1), vec3(0, 1, 1)]);
    });
    assert.ok(mesh instanceof Mesh);
    assert.equal(mesh.vertexCount, 12);
    assert.equal(render3D.capture, undefined);
    assert.equal(render3D.streamCount, 0);
});

test('drawing helpers push the expected vertex counts when baked', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    const quad = render3D.bake(()=> render3D.drawQuad(vec3(-1, 1, 0), vec3(-1, -1, 0), vec3(1, -1, 0), vec3(1, 1, 0)));
    assert.equal(quad.vertexCount, 6);
    nearVec(quad.normals[1], 0, 0, 1); // counter clockwise from +Z
    const tri = render3D.bake(()=> render3D.drawTriangle(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)));
    assert.equal(tri.vertexCount, 6);
    nearVec(tri.normals[1], 0, 0, 1);
    const bb = render3D.bake(()=> render3D.drawBillboard(vec3(0, 0, 0), vec2(2, 4)));
    assert.equal(bb.vertexCount, 6);
    nearVec(bb.points[1], -1, 2, 0);   // top left faces the camera on +Z
    nearVec(bb.points[4], 1, -2, 0);   // bottom right
    nearVec(bb.normals[1], 0, 0, 1);   // toward the camera
    const line = render3D.bake(()=> render3D.drawLine(vec3(0, 0, 0), vec3(4, 0, 0), .5));
    assert.equal(line.vertexCount, 6);
    near(Math.abs(line.points[1].y), .25); // ribbon width across the line, in the screen plane
    const disc = render3D.bake(()=> render3D.drawSoftDisc(vec3(), 1, WHITE, vec3(0, 0, 1), 8));
    assert.equal(disc.vertexCount, 3 * (2 * 9 + 2));
    // each ring strip alternates outer, inner; the last real vertex is inner, the one before is the transparent rim
    near(disc.colors[disc.vertexCount - 3].a, 0);
    near(disc.colors[disc.vertexCount - 2].a, .7);
});

test('billboard angle rotates in the camera plane', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    const bb = render3D.bake(()=> render3D.drawBillboard(vec3(), vec2(2, 2), undefined, WHITE, PI/2));
    // top left corner (-1, 1) rotated 90 degrees counter clockwise is (-1, -1)
    nearVec(bb.points[1], -1, -1, 0);
});

test('drawSoftDisc triangles face the supplied normal', () =>
{
    for (const n of [vec3(0, 0, 1), vec3(0, 1, 0), vec3(1, 0, 0), vec3(1, 1, 1).normalize()])
    {
        const disc = render3D.bake(()=> render3D.drawSoftDisc(vec3(), 1, WHITE, n, 8));
        const p = disc.points;
        let checked = 0;
        for (let i = 0; i + 2 < p.length; ++i)
        {
            let f = p[i+1].subtract(p[i]).cross(p[i+2].subtract(p[i]));
            if (f.lengthSquared() < 1e-9) continue; // degenerate join
            f = f.scale(i & 1 ? 1 : -1);      // real triangles sit at odd strip indices
            assert.ok(f.dot(n) > 0, `disc triangle ${i} faces away from ${n}`);
            ++checked;
        }
        assert.ok(checked > 0);
    }
});

test('an odd strip does not flip the winding of the strips after it', () =>
{
    const mesh = render3D.bake(()=>
    {
        render3D.drawTriangle(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0));
        render3D.drawQuad(vec3(0, 0, 1), vec3(1, 0, 1), vec3(1, 1, 1), vec3(0, 1, 1));
    });
    mesh.computeNormals(false);
    const p = mesh.points;
    let checked = 0;
    for (let i = 0; i + 2 < p.length; ++i)
    {
        let f = p[i+1].subtract(p[i]).cross(p[i+2].subtract(p[i]));
        if (f.lengthSquared() < 1e-9) continue;  // degenerate join
        f = f.scale(i & 1 ? 1 : -1);             // real triangles sit at odd strip indices
        nearVec(mesh.normals[i], 0, 0, 1);       // both shapes are wound to face +Z
        for (let j = 0; j < 3; ++j)
            assert.ok(mesh.normals[i + j].dot(f) > 0, `normal ${i + j} disagrees with face ${i}`);
        ++checked;
    }
    assert.ok(checked > 2, 'the triangle and both quad triangles are checked');
});

test('EngineObject3D extends EngineObject and has a 3D transform', () =>
{
    const mesh = buildBox();
    const o = new EngineObject3D(vec3(1, 2, 3), mesh, RED);
    assert.ok(o instanceof EngineObject);
    assert.ok(engineObjects.includes(o));
    nearVec(o.pos3D, 1, 2, 3);
    nearVec(o.rotation3D, 0, 0, 0);
    nearVec(o.scale3D, 1, 1, 1);
    assert.equal(o.mesh, mesh);
    assert.equal(o.color.r, 1);
    assert.equal(o.color.g, 0);
    assert.equal(o.transparent, false);
    near(o.pos.x, 0); near(o.pos.y, 0); // 2D pos unused
    assert.ok(o.pos3D !== undefined && o.pos3D.x === 1);
    o.destroy();
    assert.ok(o.destroyed);
});

test('EngineObject3D getMatrix places the origin at pos3D with rotation and scale', () =>
{
    const o = new EngineObject3D(vec3(5, 0, 0));
    o.rotation3D = vec3(0, PI/2, 0);
    o.scale3D = vec3(2);
    nearVec(o.getMatrix().transformPoint(vec3()), 5, 0, 0);
    nearVec(o.getMatrix().transformPoint(vec3(0, 0, 1)), 7, 0, 0);
    o.destroy();
});

test('EngineObject3D getMatrix follows an EngineObject3D parent', () =>
{
    const parent = new EngineObject3D(vec3(10, 0, 0));
    parent.rotation3D = vec3(0, PI/2, 0);
    const child = new EngineObject3D(vec3(0, 0, 1));
    parent.addChild(child);
    assert.equal(child.parent, parent);
    nearVec(child.getMatrix().transformPoint(vec3()), 11, 0, 0); // local +Z yawed to the parent's +X
    child.destroy();
    parent.destroy();
});

test('EngineObject3D render is a no-op and render3D draws the mesh through the plugin', () =>
{
    let drawn;
    const saved = render3D.drawMesh;
    render3D.drawMesh = (mesh, matrix, color, tileInfo)=> drawn = {mesh, matrix, color, tileInfo};
    const mesh = buildBox();
    const tileInfo = new TileInfo(vec2(), vec2(16));
    const o = new EngineObject3D(vec3(1, 0, 0), mesh, RED, tileInfo);
    o.render();
    assert.equal(drawn, undefined);
    o.render3D();
    assert.equal(drawn.mesh, mesh);
    nearVec(drawn.matrix.getTranslation(), 1, 0, 0);
    assert.ok(drawn.color.r === 1 && drawn.color.g === 0, 'color passes through');
    assert.equal(drawn.tileInfo, tileInfo);
    const empty = new EngineObject3D(vec3());
    drawn = undefined;
    empty.render3D(); // no mesh, nothing drawn
    assert.equal(drawn, undefined);
    render3D.drawMesh = saved;
    o.destroy(); empty.destroy();
});

test('render3D stages draw the sky, opaque by renderOrder, onRender, then the transparent stage', () =>
{
    // clean out earlier objects
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;

    const order = [];
    const record = (name)=> order.push({name, additive: render3D.additive, depthTest: render3D.depthTest});
    class Tracked extends EngineObject3D
    {
        constructor(name, pos, transparent, renderOrder=0)
        {
            super(pos);
            this.name = name;
            this.transparent = transparent;
            this.renderOrder = renderOrder;
        }
        render3D() { record(this.name + ':' + (render3D.blend ? 'T' : 'O')); }
    }
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    new Tracked('b', vec3(), false, 2);
    new Tracked('a', vec3(), false, 1);
    new Tracked('near', vec3(0, 0, 5), true);
    new Tracked('far', vec3(0, 0, -5), true);
    const dead = new Tracked('dead', vec3(), false);
    dead.destroy();
    render3D.onRender = ()=> record('onRender');
    render3D.onRenderTransparent = ()=> record('onRenderTransparent:' + (render3D.blend ? 'T' : 'O'));
    render3D.sky = new Mesh;
    render3D.drawSky = ()=> record('sky');
    render3D.updateMatrices(1);
    render3D.renderStages();
    delete render3D.drawSky; // back to the prototype method
    render3D.sky = undefined;
    render3D.onRenderTransparent = undefined;
    const names = order.map(o => o.name);
    // transparent objects are called in list order, their draws are what gets sorted far to near
    assert.deepEqual(names, ['sky', 'a:O', 'b:O', 'onRender', 'near:T', 'far:T', 'onRenderTransparent:T']);
    assert.ok(!names.includes('dead:O'), 'destroyed objects are skipped');
    assert.ok(order.every(o => o.additive === false && o.depthTest === true), 'both stages draw with additive off and depth test on');
    assert.equal(render3D.blend, false);      // the stage leaves the fields honest afterward
    assert.equal(render3D.depthWrite, true);
    render3D.onRender = undefined;
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    render3D.blend = false;
    render3D.depthWrite = true;
    render3D.additive = false;
    render3D.depthTest = true;
});

test('render3DSmoothShading sets the default for the builders', () =>
{
    const cylinder = [[1, -1], [1, 1]];
    setRender3DSmoothShading(true);
    assert.equal(buildLathe(cylinder, 8).vertexCount, 2 * 9 + 2);   // one ribbon
    assert.equal(buildGrid(2, 2, 2, 2).vertexCount, 2 * (2 * 3 + 2)); // one ribbon per row
    setRender3DSmoothShading(false);
    assert.equal(buildLathe(cylinder, 8).vertexCount, 8 * 6);       // one strip per quad
    assert.equal(buildGrid(2, 2, 2, 2).vertexCount, 4 * 6);         // one strip per cell
    // an explicit argument wins over the default
    assert.equal(buildLathe(cylinder, 8, true).vertexCount, 2 * 9 + 2);
});

test('flat buildGrid faces up with one normal per cell', () =>
{
    const m = buildGrid(4, 4, 2, 2, undefined, (x, z)=> x * .5, false);
    for (let i = 0; i < m.vertexCount; ++i)
    {
        assert.ok(m.normals[i].y > 0);
        near(m.normals[i].length(), 1);
        near(m.normals[i].x, -m.normals[i].y * .5); // slope of .5 along x tilts the normal back
    }
    // every real triangle winds so its face normal points up and matches the stored normal
    const p = m.points;
    let checked = 0;
    for (let i = 0; i + 2 < p.length; ++i)
    {
        let f = p[i+1].subtract(p[i]).cross(p[i+2].subtract(p[i]));
        if (f.lengthSquared() < 1e-9) continue;
        f = f.scale(i & 1 ? 1 : -1);
        assert.ok(f.y > 0, `grid triangle ${i} faces down`);
        assert.ok(f.dot(m.normals[i]) > 0);
        ++checked;
    }
    assert.equal(checked, 8);
});

test('HeightMap samples heights bilinearly and colors nearest', () =>
{
    const heights = [[0, 1, 0], [0, 0, 0], [1, 1, 1]];
    const colors = [[RED, WHITE, RED], [WHITE, WHITE, WHITE], [RED, RED, RED]];
    const map = new HeightMap(heights, vec2(4, 2), 10, colors);
    assert.equal(map.rows, 3);
    assert.equal(map.columns, 3);
    near(map.getHeight(-2, -1), 0);      // far left corner, row 0 column 0
    near(map.getHeight(0, -1), 10);      // far middle, row 0 column 1
    near(map.getHeight(2, 1), 10);       // near right corner, row 2 column 2
    near(map.getHeight(-1, -1), 5);      // halfway between 0 and 1 along the far row
    near(map.getHeight(0, 0), 0);        // middle row is flat
    near(map.getHeight(0, .5), 5);       // halfway between the middle and near rows
    near(map.getHeight(-9, 9), 10);      // clamped to the near left corner
    assert.equal(map.getColor(-2, -1), RED);
    assert.equal(map.getColor(0, -1), WHITE);
    assert.equal(map.getColor(0, 1), RED);
    assert.equal(new HeightMap(heights).getColor(0, 0), WHITE);
});

test('HeightMap.buildMesh puts one vertex per sample at the sampled height', () =>
{
    const map = new HeightMap([[0, 1], [1, 0]], vec2(2, 2), 3);
    const mesh = map.buildMesh(true);
    assert.equal(mesh.vertexCount, 1 * (2 * 2 + 2));
    const corner = mesh.points.find(p => Math.abs(p.x - 1) < 1e-6 && Math.abs(p.z + 1) < 1e-6);
    near(corner.y, 3); // row 0 column 1 is at +x, -z
    assert.equal(map.buildMesh(false).vertexCount, 6);
    assert.throws(()=> new HeightMap([[1]]));
});

test('buildSky colors by height and faces inward', () =>
{
    const top = rgb(0, 0, 1), horizon = rgb(1, 1, 1), bottom = rgb(0, 0, 0);
    const sky = buildSky(top, horizon, bottom, 8, 4);
    assert.equal(sky.vertexCount, 4 * (2 * 9 + 2));
    for (let i = 0; i < sky.vertexCount; ++i)
    {
        const p = sky.points[i], c = sky.colors[i];
        near(p.length(), 1);
        if (Math.abs(p.y - 1) < 1e-6) near(c.b, 1), near(c.r, 0);       // top
        if (Math.abs(p.y) < 1e-6) near(c.r, 1), near(c.b, 1);           // horizon
        if (Math.abs(p.y + 1) < 1e-6) near(c.r, 0), near(c.b, 0);       // bottom
    }
    // every real triangle's front faces the center, the parity rule mirrors computeNormals
    const p = sky.points;
    let checked = 0;
    for (let i = 0; i + 2 < p.length; ++i)
    {
        let n = p[i+1].subtract(p[i]).cross(p[i+2].subtract(p[i]));
        if (n.lengthSquared() < 1e-9) continue;
        n = n.scale(i & 1 ? 1 : -1);
        const center = p[i].add(p[i+1]).add(p[i+2]);
        assert.ok(n.dot(center) < 0, `sky triangle ${i} faces outward`);
        ++checked;
    }
    assert.ok(checked > 0);
});

test('screenToRay points forward at the center and right of it toward +x', () =>
{
    render3D.camera.pos = vec3(1, 2, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(16/9);
    const size = vec2(960, 540);
    const center = render3D.screenToRay(vec2(480, 270), size);
    nearVec(center.origin, 1, 2, 10);
    nearVec(center.direction, 0, 0, -1);
    const right = render3D.screenToRay(vec2(960, 270), size);
    assert.ok(right.direction.x > 0 && Math.abs(right.direction.y) < 1e-6);
    near(right.direction.length(), 1);
    const up = render3D.screenToRay(vec2(480, 0), size);
    assert.ok(up.direction.y > 0);
    // the top edge ray makes half the vertical fov with the forward axis
    near(Math.atan2(up.direction.y, -up.direction.z), render3D.camera.fov / 2);
});

test('drawShadow is a soft disc facing up just above the floor', () =>
{
    const disc = render3D.bake(()=> render3D.drawShadow(vec3(3, 5, -2), 2, 1));
    assert.equal(disc.vertexCount, 3 * (2 * 17 + 2));
    for (let i = 0; i < disc.vertexCount; ++i)
    {
        near(disc.points[i].y, 1.02);
        nearVec(disc.normals[i], 0, 1, 0);
    }
    // the rings run from the center out to the full radius, centered under pos
    const distances = disc.points.map(p => Math.hypot(p.x - 3, p.z + 2));
    near(Math.max(...distances), 2);
    near(Math.min(...distances), 0);
});

test('Mesh.dirty is set by every edit', () =>
{
    const m = new Mesh;
    assert.equal(m.dirty, false);
    m.addStrip([vec3(), vec3(1), vec3(2), vec3(3)]);
    assert.equal(m.dirty, true);
    m.dirty = false;
    m.combine(buildBox());
    assert.equal(m.dirty, true);
    m.dirty = false;
    m.computeNormals();
    assert.equal(m.dirty, true);
    m.upload(); // a no-op with no GL context, so it stays dirty
    assert.equal(m.dirty, true);
});

test('drawSky draws unlit and unfogged with depth off, then restores every field', () =>
{
    let seen;
    const sky = new Mesh;
    sky.render = (matrix)=>
    {
        seen = {lighting: render3D.lighting, blend: render3D.blend, depthTest: render3D.depthTest,
            depthWrite: render3D.depthWrite, fogEnd: render3D.fogEnd, matrix};
    };
    render3D.camera.pos = vec3(1, 2, 3);
    render3D.fogEnd = 50;
    render3D.lighting = true;
    render3D.specular = .5;
    render3D.cullBackFaces = true;
    render3D.drawSky(sky);
    assert.deepEqual([seen.lighting, seen.blend, seen.depthTest, seen.depthWrite, seen.fogEnd], [false, false, false, false, 0]);
    nearVec(seen.matrix.getTranslation(), 1, 2, 3); // around the camera
    const radius = (render3D.camera.near + render3D.camera.far) / 2;
    const scaled = seen.matrix.transformDirection(vec3(1, 0, 0));
    assert.ok(Math.abs(scaled.x - radius) < radius * 1e-5 && scaled.y === 0 && scaled.z === 0); // Float32 matrix
    assert.equal(render3D.fogEnd, 50);
    assert.equal(render3D.lighting, true);
    assert.equal(render3D.specular, .5);
    assert.equal(render3D.cullBackFaces, true);
    assert.equal(render3D.depthTest, true);
    assert.equal(render3D.depthWrite, true);
    // restored even when the draw throws
    sky.render = ()=> { throw new Error('boom'); };
    assert.throws(()=> render3D.drawSky(sky), /boom/);
    assert.equal(render3D.fogEnd, 50);
    assert.equal(render3D.lighting, true);
    render3D.fogEnd = 0;
    render3D.specular = 0;
    render3D.cullBackFaces = false;
});

test('pushStripUnlit turns lighting off for the push and restores it, even on a throw', () =>
{
    const seen = [];
    render3D.lighting = true;
    render3D.bake(()=>
    {
        const capture = render3D.capture;
        const addStrip = capture.addStrip.bind(capture);
        capture.addStrip = (...args)=> { seen.push(render3D.lighting); return addStrip(...args); };
        render3D.pushStripUnlit([vec3(), vec3(1), vec3(2)]);
        render3D.drawBillboard(vec3(), vec2(1));
        render3D.drawLine(vec3(), vec3(1));
        render3D.drawShadow(vec3(), 1);
        render3D.pushStrip([vec3(), vec3(1), vec3(2)]);
    });
    assert.deepEqual(seen, [false, false, false, false, false, false, true]); // three disc rings in the shadow
    assert.equal(render3D.lighting, true);
    assert.throws(()=> render3D.bake(()=> render3D.pushStripUnlit([vec3(), vec3(1)]))); // too few points asserts
    assert.equal(render3D.lighting, true);
});

test('transparent stage queues every draw by distance and replays far to near with its own state', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);

    // queue a mesh draw and a strip push at different distances, the queue check comes before the shader guard
    render3D.transparentQueue = [];
    render3D.additive = true;
    render3D.drawMesh(new Mesh, buildMatrix(vec3(0, 0, -10)));   // 20 away
    render3D.additive = false;
    render3D.pushStrip([vec3(-1, 0, 5), vec3(1, 0, 5), vec3(0, 1, 5)]); // center (0, .33, 5): 5 away
    render3D.drawBillboard(vec3(0, 0, 0), vec2(1));                    // 10 away, unlit
    const queue = render3D.transparentQueue;
    assert.equal(queue.length, 3);
    near(queue[0].distance, 400);
    assert.equal(queue[0].state.additive, true);
    near(queue[1].distance, 1/9 + 25);
    assert.equal(queue[1].state.additive, false);
    near(queue[2].distance, 100);
    assert.equal(queue[2].state.lighting, false);

    // replay runs the farthest first and applies each item's captured state as it runs
    const order = [];
    for (const item of queue)
        item.draw = ()=> order.push([item.distance, render3D.additive, render3D.lighting]);
    render3D.specular = .3; // not captured by any item, must survive the replay
    render3D.flushTransparentQueue();
    assert.equal(render3D.transparentQueue, undefined);
    assert.deepEqual(order.map(o => o[0] > 399 ? 'mesh' : o[0] > 99 ? 'billboard' : 'strip'), ['mesh', 'billboard', 'strip']);
    assert.deepEqual(order.map(o => o[1]), [true, false, false]);   // additive only for the mesh
    assert.deepEqual(order.map(o => o[2]), [true, false, true]);    // unlit only for the billboard
    // the replay leaves the state as it found it, so the last item cannot unlight the next frame
    assert.equal(render3D.specular, .3);
    assert.equal(render3D.lighting, true);
    assert.equal(render3D.additive, false);
    render3D.specular = 0;
});

test('capped lathes close the ends that have a radius with outward flat discs', () =>
{
    const open = buildLathe([[1, -1], [1, 1]], 8, false);
    const closed = buildLathe([[1, -1], [1, 1]], 8, false, true);
    assert.equal(closed.vertexCount, open.vertexCount + 2 * (8 + 2)); // one 8 point strip per cap
    assertOutward(closed, 'capped cylinder');
    const capNormals = closed.normals.slice(open.vertexCount);
    assert.ok(capNormals.slice(0, 10).every(n => n.y === -1), 'bottom cap faces down');
    assert.ok(capNormals.slice(10).every(n => n.y === 1), 'top cap faces up');
    // a smooth cylinder keeps a hard edge at the rim, the cap normals are not averaged in
    const smooth = buildLathe([[1, -1], [1, 1]], 8, true, true);
    assert.equal(smooth.vertexCount, 2 * 9 + 2 + 2 * 10);
    assertOutward(smooth, 'smooth capped cylinder');
    // a cone gets a cap only on its open end
    const cone = buildLathe([[1, -1], [0, 1]], 4, false, true);
    assert.equal(cone.vertexCount, 4 * 6 + 4 + 2);
    assertOutward(cone, 'capped cone');
});

test('buildCylinder is a capped lathe centered on the origin', () =>
{
    const c = buildCylinder(2, 4, 6, false);
    assert.equal(c.vertexCount, 6 * 6 + 2 * (6 + 2));
    assertOutward(c, 'cylinder');
    let top = -1e9, bottom = 1e9, radius = 0;
    for (const p of c.points)
        top = Math.max(top, p.y), bottom = Math.min(bottom, p.y), radius = Math.max(radius, Math.hypot(p.x, p.z));
    near(top, 2); near(bottom, -2); near(radius, 2);
    assert.equal(buildCylinder(2, 4, 6, false, false).vertexCount, 6 * 6);
});

test('Camera3D.orbit parks the camera at the distance and angles and looks at the target', () =>
{
    const c = new Camera3D;
    c.orbit(vec3(1, 2, 3), 10, 0, 0);
    nearVec(c.pos, 1, 2, 13);
    nearVec(c.forward(), 0, 0, -1);
    c.orbit(vec3(), 10, PI / 2, PI / 4);
    near(c.pos.distance(vec3()), 10);
    near(c.pos.y, 10 * Math.SQRT1_2);
    near(c.pos.x, 10 * Math.SQRT1_2);
    nearVec(c.forward(), -c.pos.x / 10, -c.pos.y / 10, 0);
});

test('EngineObject3D integrates velocity3D in updatePhysics', () =>
{
    const o = new EngineObject3D(vec3(1, 2, 3));
    o.velocity3D = vec3(.1, 0, -.1);
    o.updatePhysics();
    nearVec(o.pos3D, 1.1, 2, 2.9);
    near(o.pos.x, 0); // the 2D body is untouched
    o.destroy();
});

test('buildGrid takes a flat color or a color function', () =>
{
    const flat = buildGrid(2, 2, 1, 1, RED);
    assert.ok(flat.colors.every(c => c.r === 1 && c.g === 0));
    const fn = buildGrid(2, 2, 2, 1, (x, z)=> x < 0 ? RED : WHITE, undefined, false);
    assert.ok(fn.colors.slice(0, 6).every(c => c.g === 0) && fn.colors.slice(6).every(c => c.g === 1));
    assert.ok(buildGrid(2, 2).colors.every(c => c.g === 1));
});

test('Light3D is an EngineObject3D that draws nothing and follows a parent', () =>
{
    const light = new Light3D(vec3(1, 2, 3), 7, RED);
    assert.ok(light instanceof EngineObject3D);
    assert.equal(light.radius, 7);
    assert.equal(light.color.r, 1);
    assert.equal(light.color.g, 0);
    const baked = render3D.bake(()=> light.render3D());
    assert.equal(baked.vertexCount, 0);
    const lamp = new EngineObject3D(vec3(10, 0, 0));
    lamp.addChild(light);
    light.pos3D = vec3(0, 1, 0);
    nearVec(light.getMatrix().getTranslation(), 10, 1, 0);
    light.destroy();
    lamp.destroy();
});

test('ParticleEmitter3D emits at its rate along its rotated axis and moves particles', () =>
{
    // 600 per second is 10 per frame, cone 0 sends them straight along local +Y
    const e = new ParticleEmitter3D(vec3(5, 0, 0), 0, 0, 600, 0, undefined, RED, RED, WHITE, WHITE, 1, .5, 1, .2, 1, -.01, .1, 0);
    e.rotation3D.z = PI / 2; // local +Y becomes world -X
    e.update();
    assert.equal(e.particles.length, 10);
    const p = e.particles[0];
    nearVec(p.velocity, -.2, -.01, 0);       // speed .2 along -X, one frame of gravity
    nearVec(p.pos, 4.8, -.01, 0);            // spawned at the emitter and moved once
    near(p.life, 1); near(p.sizeStart, .5); near(p.sizeEnd, 1);
    assert.equal(p.colorStart.r, 1); assert.equal(p.colorStart.g, 0);
    e.update();
    assert.equal(e.particles.length, 20);
    nearVec(e.particles[0].velocity, -.2, -.02, 0);
    // untextured particles render as 8 sided soft discs, textured ones as billboards, and the additive flag is left alone
    render3D.updateMatrices(1);
    render3D.additive = false;
    const baked = render3D.bake(()=> e.render3D());
    assert.equal(baked.vertexCount, 20 * 3 * (2 * 9 + 2));
    assert.equal(render3D.additive, false);
    e.tileInfo = new TileInfo(vec2(), vec2(16));
    assert.equal(render3D.bake(()=> e.render3D()).vertexCount, 20 * 6);
    // an emitter with no rate never spawns, a box emit size spawns inside the box
    const box = new ParticleEmitter3D(vec3(), vec3(2, 4, 6), 0, 600, PI);
    box.update();
    assert.ok(box.particles.every(q => Math.abs(q.pos.x) <= 1 + .3 && Math.abs(q.pos.y) <= 2 + .3 && Math.abs(q.pos.z) <= 3 + .3));
    e.destroy(); box.destroy();
});

test('ParticleEmitter3D particles die after their life', () =>
{
    // particles age on the frame they spawn, so a 3 frame life survives two more updates
    const e = new ParticleEmitter3D(vec3(), 0, 0, 60, PI, undefined, WHITE, WHITE, WHITE, WHITE, 3 / 60, 1, 1, 0, 1, 0, .1, 0);
    e.update(); // spawns 1, age 1
    assert.equal(e.particles.length, 1);
    e.update(); // spawns 1, ages 2 and 1
    assert.equal(e.particles.length, 2);
    e.update(); // spawns 1, the first reaches 3 and dies
    assert.equal(e.particles.length, 2);
    e.destroy();
});

const houseOBJ = `
v -1 -1 -1
v  1 -1 -1
v  1 -1  1
v -1 -1  1
v -1 1 -1
v  1 1 -1
v  1 1  1
v -1 1  1
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
f 1 2 3 4
f 8 7 6 5
`;

test('parseOBJ reads vertices and faces into outward strips with flat normals', () =>
{
    const m = parseOBJ(houseOBJ, false);
    assert.equal(m.vertexCount, 6 * 6); // six quads
    assertOutward(m, 'obj box');
    nearVec(m.normals[1], 0, 0, -1); // first face is the -Z wall
    for (const p of m.points)
        assert.ok(Math.abs(p.x) === 1 && Math.abs(p.y) === 1 && Math.abs(p.z) === 1);
    assert.ok(m.uvs.every(uv => uv.x === 0 && uv.y === 0)); // no vt, default uvs
});

test('parseOBJ uses file normals and uvs, negative indices, and smooths when asked', () =>
{
    const text = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
f -3/-3/-1 -2/-2/-1 -1/-1/-1
`;
    const m = parseOBJ(text, true);
    assert.equal(m.vertexCount, 6); // one triangle
    nearVec(m.normals[1], 0, 0, 1);  // the file normal, not recomputed even though smooth is set
    near(m.uvs[1].y, 1);             // OBJ v runs up, so vt 0 0 lands at the bottom of the tile
    near(m.uvs[3].y, 0);             // vt 0 1 is the top
    // without file normals, smooth computes averaged vertex normals
    const smooth = parseOBJ(houseOBJ, true);
    const corner = smooth.points.findIndex(p => p.x === 1 && p.y === 1 && p.z === 1);
    assert.ok(smooth.normals[corner].x > 0 && smooth.normals[corner].y > 0 && smooth.normals[corner].z > 0);
    near(smooth.normals[corner].length(), 1);
});

test('setSky builds the dome, keeps it, and matches the fog color to the horizon', () =>
{
    const horizon = rgb(.5, .6, .7);
    const sky = render3D.setSky(rgb(0, 0, 1), horizon);
    assert.ok(sky instanceof Mesh && render3D.sky === sky);
    assert.equal(render3D.fogColor.r, .5);
    assert.ok(render3D.fogColor !== horizon); // a copy
    render3D.setSky();
    assert.ok(render3D.sky !== sky);
    render3D.sky = undefined;
    render3D.fogColor = undefined;
});

test('renderAfter2D defaults off', () =>
{
    assert.equal(render3D.renderAfter2D, false);
});

test('HeightMap.getHeight matches the mesh triangles, split from (i, j) to (i+1, j+1)', () =>
{
    // a saddle: two opposite corners high, the split diagonal runs between the low corners
    const map = new HeightMap([[0, 1], [1, 0]], vec2(2, 2), 1);
    near(map.getHeight(-.5, -.5), .5);  // on the first triangle
    near(map.getHeight(.5, .5), .5);    // on the second
    near(map.getHeight(.5, -.5), 1);    // on the shared edge between the high corners
    near(map.getHeight(0, 0), 1);       // the cell center is on that edge too, not the bilinear .5
    // the mesh has a vertex at every sample height
    const mesh = map.buildMesh(false);
    for (const p of mesh.points)
        near(p.y, map.getHeight(p.x, p.z));
});

test('drawShadow follows a height function and lifts by the given amount', () =>
{
    const disc = render3D.bake(()=> render3D.drawShadow(vec3(2, 9, 3), 1, (x, z)=> x + z, WHITE, .5));
    assert.equal(disc.vertexCount, 3 * (2 * 17 + 2));
    for (const p of disc.points)
        near(p.y, p.x + p.z + .5);
    const flat = render3D.bake(()=> render3D.drawShadow(vec3(2, 9, 3), 1, 4));
    for (const p of flat.points)
        near(p.y, 4.02);
});

test('drawRibbon builds a strip with width and color per point, uvs along it, and a given side', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    const points = [vec3(0, 0, 0), vec3(2, 0, 0), vec3(4, 0, 0)];
    const tileInfo = new TileInfo(vec2(), vec2(16));
    const r = render3D.bake(()=> render3D.drawRibbon(points, [1, .5, 0], [RED, WHITE, RED], tileInfo));
    assert.equal(r.vertexCount, 2 * 3 + 2);
    // pairs across the path in the camera plane, the first is the wide end
    nearVec(r.points[1], 0, .5, 0); nearVec(r.points[2], 0, -.5, 0);
    nearVec(r.points[3], 2, .25, 0); nearVec(r.points[4], 2, -.25, 0);
    nearVec(r.points[5], 4, 0, 0);
    near(r.uvs[1].x, 0); near(r.uvs[3].x, .5); near(r.uvs[5].x, 1); near(r.uvs[2].y, 1);
    assert.equal(r.colors[3].g, 1); assert.equal(r.colors[5].g, 0);
    // a side pins the ribbon's plane, culling is left as it was
    render3D.cullBackFaces = true;
    const s = render3D.bake(()=> render3D.drawRibbon(points, 1, WHITE, undefined, vec3(0, 0, 5)));
    nearVec(s.points[1], 0, 0, .5);
    assert.equal(render3D.cullBackFaces, true);
    render3D.cullBackFaces = false;
    assert.equal(render3D.bake(()=> render3D.drawLine(vec3(), vec3(4, 0, 0), .5)).vertexCount, 6);
});

test('Trail3D records where it moved, drops old samples and draws a ribbon that thins to the tail', () =>
{
    const trail = new Trail3D(vec3(), 1, .4, undefined, WHITE, rgb(0, 0, 0, 0));
    trail.update();
    trail.pos3D = vec3(1, 0, 0); trail.update();
    trail.pos3D = vec3(2, 0, 0); trail.update();
    trail.update(); // did not move, no new sample
    assert.equal(trail.samples.length, 3);
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
    const r = render3D.bake(()=> trail.render3D());
    assert.equal(r.vertexCount, 2 * 3 + 2);
    near(Math.abs(r.points[5].y), .2); // full width at the head, nothing has aged in a test
    // a sample older than lifeTime is dropped on the next update
    trail.samples[0].time = -5;
    trail.update();
    assert.equal(trail.samples.length, 2);
    // a parent moves it
    const parent = new EngineObject3D(vec3(10, 0, 0));
    parent.addChild(trail);
    trail.pos3D = vec3();
    trail.update();
    nearVec(trail.samples[2].pos, 10, 0, 0);
    trail.destroy(); parent.destroy();
});

test('ParticleEmitter3D trailTime keeps a path per particle and draws ribbons', () =>
{
    // one particle a frame, straight along +Y, three frames of trail
    const e = new ParticleEmitter3D(vec3(), 0, 0, 60, 0, undefined, WHITE, WHITE, WHITE, WHITE, 10, 1, 1, .1, 1, 0, 0, 0);
    e.trailTime = 3 / 60;
    for (let i = 4; i--;)
        e.update();
    assert.deepEqual(e.particles.map(p => p.trail.length).sort(), [1, 2, 3, 3]);
    nearVec(e.particles[0].trail[0], 0, .2, 0); // the oldest kept point, the two before it were dropped
    render3D.updateMatrices(1);
    // trails of 3, 3 and 2 draw ribbons, the newest with one point is still a soft disc
    assert.equal(render3D.bake(()=> e.render3D()).vertexCount, 8 + 8 + 6 + 3 * (2 * 9 + 2));
    e.tileInfo = new TileInfo(vec2(), vec2(16));
    assert.equal(render3D.bake(()=> e.render3D()).vertexCount, 8 + 8 + 6 + 6);
    e.destroy();
});

test('buildExtrude merges pixel runs into quads with outward walls and pixel colors', () =>
{
    // a solid 2x2 block: 2 front, 2 back and 4 walls merged along their runs
    const block = buildExtrude([[1, 1], [1, 1]], vec2(2), 1);
    assert.equal(block.vertexCount, 8 * 6);
    assertOutward(block, 'block');
    for (const p of block.points)
        assert.ok(Math.abs(p.x) <= 1 + 1e-6 && Math.abs(p.y) <= 1 + 1e-6 && Math.abs(p.z) <= .5 + 1e-6);
    // an L keeps its colors: 2 front, 2 back, 2 up, 1 down, 1 left, 2 right
    const l = buildExtrude([[RED, 0], [RED, RED]]);
    assert.equal(l.vertexCount, 10 * 6);
    assert.ok(l.colors.every(c => c.r === 1 && c.g === 0));
    // a color change splits every run
    assert.equal(buildExtrude([[RED, WHITE]]).vertexCount, 10 * 6);
    // the first row is the top of the image, the first pixel is on the left
    const corner = buildExtrude([[1, 0], [0, 0]], vec2(2), 1);
    assert.equal(corner.vertexCount, 6 * 6);
    for (const p of corner.points)
        assert.ok(p.x <= 1e-6 && p.y >= -1e-6);
    // the engine font is not loaded headless
    assert.throws(()=> buildText3D('A'));
});

test('shadow settings default off and objects cast by default', () =>
{
    assert.equal(render3D.shadows, false);
    assert.equal(render3D.shadowMapSize, 1024);
    assert.equal(render3D.shadowRange, 40);
    assert.equal(render3D.shadowCenter, undefined);
    near(render3D.shadowBias, .003);
    assert.equal(render3D.shadowPass, false);
    const o = new EngineObject3D;
    assert.equal(o.castShadow, true);
    o.destroy();
});

test('updateShadowMatrix fits an orthographic box around the center, snapped to texels', () =>
{
    render3D.lightDirection = vec3(0, -1, 0);
    render3D.shadowCenter = vec3(0, 0, 0);
    render3D.shadowRange = 40;
    render3D.updateShadowMatrix();
    const m = render3D.shadowMatrix;
    // the center lands in the middle of the map and halfway through the depth range
    nearVec(m.transformPoint(vec3()), 0, 0, 0);
    // the edge of the range is the edge of the map, above and below are the depth limits
    near(Math.abs(m.transformPoint(vec3(20, 0, 0)).x), 1);
    near(Math.abs(m.transformPoint(vec3(0, 0, 20)).y), 1);
    near(m.transformPoint(vec3(0, 40, 0)).z, -1);
    near(m.transformPoint(vec3(0, -40, 0)).z, 1);
    // a center between texels snaps: the origin maps to a whole number of texels, two clip units per map
    render3D.shadowCenter = vec3(.0123, 0, .0456);
    render3D.updateShadowMatrix();
    const p = render3D.shadowMatrix.transformPoint(vec3());
    const texels = p.x / (2 / 1024);
    near(texels, Math.round(texels));
    // the default center follows the camera
    render3D.shadowCenter = undefined;
    render3D.camera.pos = vec3(100, 0, 0);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    render3D.updateShadowMatrix();
    near(Math.abs(render3D.shadowMatrix.transformPoint(vec3(100, 0, -16)).x), 0);
    render3D.lightDirection = vec3(.5, -1, .3).normalize();
});

test('buildCone, buildCapsule and buildTorus are outward shapes of the documented size', () =>
{
    const cone = buildCone(.5, 1, 8, false);
    assertOutward(cone, 'cone');
    near(Math.max(...cone.points.map(p => p.y)), .5);
    near(Math.min(...cone.points.map(p => p.y)), -.5);
    assert.equal(buildCone(.5, 1, 8, false, false).vertexCount, 8 * 6); // no base
    const capsule = buildCapsule(.5, 1, 8, 2, false);
    assertOutward(capsule, 'capsule');
    near(Math.max(...capsule.points.map(p => p.y)), 1);
    near(Math.min(...capsule.points.map(p => p.y)), -1);
    // every torus normal points away from the middle of the tube, and the smooth seam matches its neighbours
    assert.equal(buildTorus(.5, .15, 8, 4, false).vertexCount, 4 * 8 * 6); // a quad per side per segment
    assert.equal(buildTorus(.5, .15, 8, 4, true).vertexCount, 4 * (2 * 9 + 2));  // a ribbon per segment
    for (const torus of [buildTorus(.5, .15, 8, 4, false), buildTorus(.5, .15, 8, 4, true)])
    {
        torus.points.forEach((p, i) =>
        {
            const c = vec3(p.x, 0, p.z).normalize(.5), n = torus.normals[i];
            assert.ok(n.dot(p.subtract(c).normalize()) > .5, 'torus normal points out of the tube');
        });
    }
    const smooth = buildTorus(.5, .15, 8, 4, true);
    smooth.points.forEach((p, i) =>
    {
        const c = vec3(p.x, 0, p.z).normalize(.5);
        near(smooth.normals[i].dot(p.subtract(c).normalize()), 1); // exactly radial, including the seam
    });
});

test('Mesh transform, flipNormals, setColor and computeRadius', () =>
{
    const box = buildBox(vec3(2));
    const moved = new Mesh().combine(box).transform(Matrix4.translation(vec3(1, 2, 3)));
    nearVec(moved.points[1], box.points[1].x + 1, box.points[1].y + 2, box.points[1].z + 3);
    nearVec(moved.normals[1], box.normals[1].x, box.normals[1].y, box.normals[1].z);
    assert.equal(moved.dirty, true);
    // inside out: two more vertices, opposite normals, and the faces wind inward
    const flipped = new Mesh().combine(box).flipNormals();
    assert.equal(flipped.vertexCount, box.vertexCount + 2);
    nearVec(flipped.normals[2], -box.normals[1].x, -box.normals[1].y, -box.normals[1].z);
    assert.throws(()=> assertOutward(flipped, 'flipped'));
    assertOutward(new Mesh().combine(box).flipNormals().flipNormals(), 'flipped twice');
    // colors and bounds
    assert.ok(new Mesh().combine(box).setColor(RED).colors.every(c => c.r === 1 && c.g === 0));
    near(box.computeRadius(), Math.sqrt(3));
    near(box.radius, Math.sqrt(3));
});

test('isSphereVisible tests the view frustum and drawMesh culls with it', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    assert.equal(render3D.frustumPlanes.length, 6);
    assert.equal(render3D.isSphereVisible(vec3(), 1), true);
    assert.equal(render3D.isSphereVisible(vec3(0, 0, 20), 1), false);   // behind the camera
    assert.equal(render3D.isSphereVisible(vec3(100, 0, 0), 1), false);  // off to the side
    assert.equal(render3D.isSphereVisible(vec3(100, 0, 0), 200), true); // but a big enough sphere reaches in
    assert.equal(render3D.isSphereVisible(vec3(0, 0, -2000), 1), false); // past the far plane
    assert.equal(render3D.frustumCulling, true);
    assert.equal(render3D.sortTransparent, true);
});

test('HeightMap.raycast finds the ground along a ray', () =>
{
    const flat = new HeightMap([[0, 0], [0, 0]], vec2(10, 10), 1);
    const close = (a, b)=> assert.ok(Math.abs(a - b) < 1e-3, a + " != " + b);
    close(flat.raycast(vec3(0, 5, 0), vec3(0, -1, 0)), 5);
    close(flat.raycast(vec3(0, 5, 0), vec3(0, -2, 0)), 2.5); // in units of the direction
    assert.equal(flat.raycast(vec3(0, 5, 0), vec3(0, 1, 0)), undefined); // away from it
    assert.equal(flat.raycast(vec3(20, 5, 0), vec3(0, -1, 0)), undefined); // beside it
    assert.equal(flat.raycast(vec3(-20, 1, 0), vec3(1, 0, 0)), undefined); // across it, above the ground
    // a slope from 10 high at the back to 0 at the front, straight down at the middle meets it at 5
    const slope = new HeightMap([[1, 1], [0, 0]], vec2(10, 10), 10);
    const t = slope.raycast(vec3(0, 20, 0), vec3(0, -1, 0));
    close(t, 15); assert.ok(true, `${t}`);
    // a ray from the side hits the slope face, not the clamped ground beyond the edge
    const side = slope.raycast(vec3(0, 2.5, 20), vec3(0, 0, -1));
    close(side, 17.5); assert.ok(true, `${side}`);
});

test('unlit objects draw with lighting off and leave it on afterward', () =>
{
    const o = new EngineObject3D(vec3(), buildBox());
    assert.equal(o.unlit, false);
    o.unlit = true;
    render3D.lighting = true;
    let seen;
    const drawMesh = render3D.drawMesh;
    render3D.drawMesh = ()=> seen = render3D.lighting;
    try { o.render3D(); }
    finally { render3D.drawMesh = drawMesh; }
    assert.equal(seen, false);
    assert.equal(render3D.lighting, true);
    o.destroy();
});

test('receiveShadow objects and the receiveShadows state keep draws out of the shadow darkening', () =>
{
    assert.equal(render3D.receiveShadows, true);
    const o = new EngineObject3D(vec3(), buildBox());
    assert.equal(o.receiveShadow, true);
    o.receiveShadow = false;
    let seen;
    const drawMesh = render3D.drawMesh;
    render3D.drawMesh = ()=> seen = render3D.receiveShadows;
    try { o.render3D(); }
    finally { render3D.drawMesh = drawMesh; }
    assert.equal(seen, false);
    assert.equal(render3D.receiveShadows, true);
    o.destroy();
});
