import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Camera3D, vec3, vec2, PI, Mesh, Matrix4, buildMatrix, WHITE, RED, rgb, TileInfo, buildLathe, buildCylinder, buildSphere, buildBox, buildGrid, buildLoft, buildSky, buildCone, buildCapsule, buildTorus, buildRibbon, buildExtrude, buildText3D, TextureInfo, HeightMap, Ray3D, CameraControl3D, FirstPersonCamera3D, EngineObject3D, EngineObject, engineObjects, Light3D, DirectionalLight3D, ParticleEmitter3D, Trail3D, parseOBJ, debugBox3D, debugSphere3D, debugLine3D, debugPoint3D, isVector3, Sound, engineObjectsCollect3D, engineObjectsCallback3D, engineObjectsRaycast3D, engineObjectsUpdate, setParticleEmitRateScale, setCameraScale } from '../dist/littlejs.esm.js';

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
    assert.ok(render3D.sunDirection.y > 0, 'the sun is up in the sky by default');
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

test('sunDirection works at any length, since everything that reads it normalizes', () =>
{
    // nothing should have to write .normalize() on the end, so check the two places that read it:
    // the shadow matrix, and the arithmetic that builds the lightDir the shader gets
    const shadowFor = (direction)=>
    {
        render3D.sunDirection = direction;
        render3D.shadowCenter = vec3();
        render3D.updateShadowMatrix();
        return [...render3D.shadowMatrix.m];
    };
    try
    {
        const unit = shadowFor(vec3(-.5, 1, -.3).normalize());
        for (const scale of [2, 10, 1000, .001])
        {
            const scaled = shadowFor(vec3(-.5, 1, -.3).scale(scale));
            assert.deepEqual(scaled, unit, 'a light direction ' + scale + ' times as long should shadow the same');
        }
        // the shader gets the same lightDir too, which is this arithmetic on the way to the uniform
        // dividing by a length of a different size lands a bit or two apart, well under a float
        const lightDir = (v)=> { const n = v.length() || 1; return [v.x/n, v.y/n, v.z/n]; };
        const long = lightDir(vec3(5, -10, 3)), short = lightDir(vec3(.5, -1, .3));
        long.forEach((v, i)=> near(v, short[i]));
    }
    finally
    {
        // these are global, so hand them back however the checks above went
        render3D.sunDirection = vec3(-.3, 1, .5);
        render3D.shadowCenter = undefined;
    }
});

test('Camera3D defaults look down -Z from +Z', () =>
{
    const c = new Camera3D;
    nearVec(c.getForward(), 0, 0, -1);
    nearVec(c.getRight(), 1, 0, 0);
    nearVec(c.getUp(), 0, 1, 0);
    assert.ok(c.pos.z > 0);
    near(c.fov, PI/3);
});

test('Camera3D lookAt sets pitch and yaw toward the target', () =>
{
    const c = new Camera3D;
    c.pos = vec3(0, 0, 0);
    c.lookAt(vec3(10, 0, 0));
    nearVec(c.getForward(), 1, 0, 0);
    c.lookAt(vec3(0, 10, 0));
    nearVec(c.getForward(), 0, 1, 0);
    c.lookAt(vec3(0, 0, 10));
    nearVec(c.getForward(), 0, 0, 1);
    nearVec(c.getUp(), 0, 1, 0); // no roll
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
    nearVec(c.getForward(), 0, 0, -1);
    // the automatic path runs from updateMatrices without throwing
    c.align2D = true;
    assert.doesNotThrow(()=> render3D.updateMatrices(16/9));
    c.align2D = false;

    // a zoomed out 2D camera parks it past the far plane, where everything clips away and
    // nothing renders at all, so say so instead of drawing an empty screen
    setCameraScale(.5);
    assert.throws(()=> c.update2D(720), /Assert failed/);
    assert.doesNotThrow(()=> c.update2D(0)); // a zero canvas is headless, stay quiet
    setCameraScale(32);
    assert.doesNotThrow(()=> c.update2D(720));
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
    assert.doesNotThrow(()=> m.render(Matrix4.identity(), undefined, RED));
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
    const flat = buildLathe([[1, -1], [1, 1]], 8, false, false);
    assert.equal(flat.vertexCount, 8 * 6);
    assertOutward(flat, 'flat cylinder');
    const smooth = buildLathe([[1, -1], [1, 1]], 8, true, false);
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
    const m = buildSphere(1, 8, 4, true);
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
    const m = buildGrid(vec2(4, 2), vec2(2, 1), (x, z)=> rgb((x + 2) / 4, 0, 0), (x, z)=> x + 10*z, true);
    assert.equal(m.vertexCount, 1 * (2 * 3 + 2));
    // corners: x in -2..2, z in -1..1
    const corner = m.points.find(p => Math.abs(p.x + 2) < 1e-6 && Math.abs(p.z + 1) < 1e-6);
    near(corner.y, -2 - 10);
    near(m.colors[1].r, (m.points[1].x + 2) / 4);
    for (let i = 1; i < m.vertexCount - 1; ++i)
        assert.ok(m.normals[i].y > 0, 'grid normal points up');
    // winding: a flat grid faces +Y
    const flat = buildGrid(vec2(2));
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

test('drawStrip and bake capture into a mesh headless', () =>
{
    const mesh = render3D.bake(()=>
    {
        render3D.drawStrip([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)]);
        render3D.drawStrip([vec3(0, 0, 1), vec3(1, 0, 1), vec3(0, 1, 1)]);
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
    const disc = render3D.bake(()=> render3D.drawSoftDisc(vec3(), 2, WHITE, vec3(0, 0, 1), 8));
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
        const disc = render3D.bake(()=> render3D.drawSoftDisc(vec3(), 2, WHITE, n, 8));
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
    const o = new EngineObject3D(vec3(1, 2, 3), mesh, undefined, RED);
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
    o.destroy();
    assert.ok(o.destroyed);
});

test('a 3D particle damps and then falls, the order the 2D particle uses', () =>
{
    // the other way round would damp that frame's gravity too, so the same damping and
    // gravity would give a different arc in 2D and in 3D
    const damping = .9, gravity = -.02;
    const e = new ParticleEmitter3D(vec3(), 0, 0, 0, PI, undefined, WHITE, WHITE, WHITE, WHITE, 10, 1, 1, 0, damping, gravity, 0, 0);
    e.emitParticle();
    const p = e.particles[0];
    p.velocity = vec3(1, -.5, 2);
    e.update();
    nearVec(p.velocity, 1 * damping, -.5 * damping + gravity, 2 * damping);
    e.destroy(true);
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

test('EngineObject3D lookAt aims at a world target through a moved and turned parent', () =>
{
    const target = vec3(0, 1, -10);
    const alone = new EngineObject3D(vec3(0, 0, 5));
    alone.lookAt(target);
    const aim = (o)=> target.subtract(o.getWorldPos3D()).normalize();
    nearVec(alone.getForward3D(), aim(alone).x, aim(alone).y, aim(alone).z);

    // rotation3D is local to the parent, so the target has to come into that space first
    const parent = new EngineObject3D(vec3(6, -2, 3));
    parent.rotation3D = vec3(.3, PI/2, 0);
    const child = new EngineObject3D(vec3(0, 1, 0));
    parent.addChild(child);
    child.lookAt(target);
    const want = aim(child);
    nearVec(child.getForward3D(), want.x, want.y, want.z);
    parent.destroy();
    alone.destroy();
});

test('EngineObject3D render is a no-op and render3D draws the mesh through the plugin', () =>
{
    let drawn;
    const saved = render3D.drawMesh;
    render3D.drawMesh = (mesh, matrix, tileInfo, color)=> drawn = {mesh, matrix, tileInfo, color};
    const mesh = buildBox();
    const tileInfo = new TileInfo(vec2(), vec2(16));
    const o = new EngineObject3D(vec3(1, 0, 0), mesh, tileInfo, RED);
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
    render3D.onRenderOpaque = ()=> record('onRender');
    render3D.onRenderTransparent = ()=> record('onRenderTransparent:' + (render3D.blend ? 'T' : 'O'));
    render3D.sky = new Mesh;
    render3D.drawSky = ()=> record('sky');
    render3D.updateMatrices(1);
    render3D.renderStages(engineObjects.filter(o => o instanceof EngineObject3D && !o.destroyed));
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
    render3D.onRenderOpaque = undefined;
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    render3D.blend = false;
    render3D.depthWrite = true;
    render3D.additive = false;
    render3D.depthTest = true;
});

test('render3D.smoothShading sets the default for the builders', () =>
{
    const cylinder = [[1, -1], [1, 1]];
    render3D.smoothShading = true;
    assert.equal(buildLathe(cylinder, 8, undefined, false).vertexCount, 2 * 9 + 2);   // one ribbon
    assert.equal(buildGrid(vec2(2), 2).vertexCount, 2 * (2 * 3 + 2)); // one ribbon per row
    render3D.smoothShading = false;
    assert.equal(buildLathe(cylinder, 8, undefined, false).vertexCount, 8 * 6);       // one strip per quad
    assert.equal(buildGrid(vec2(2), 2).vertexCount, 4 * 6);         // one strip per cell
    // an explicit argument wins over the default
    assert.equal(buildLathe(cylinder, 8, true, false).vertexCount, 2 * 9 + 2);
});

test('flat buildGrid faces up with one normal per cell', () =>
{
    const m = buildGrid(vec2(4), 2, undefined, (x, z)=> x * .5, false);
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

test('screenToRay and screenToGround answer for the canvas they are handed', () =>
{
    const size = vec2(960, 540), aspect = size.x / size.y;
    const toScreen = (clip)=> vec2((clip.x + 1)/2 * size.x, (1 - clip.y)/2 * size.y);
    render3D.camera.pos = vec3(0, 8, 10);
    render3D.camera.lookAt(vec3());
    render3D.updateMatrices(aspect);

    // a ray through a point's own pixel has to pass through that point
    const p = vec3(3, 1.5, -2);
    const clip = render3D.worldToClip(p);
    const ray = render3D.screenToRay(toScreen(clip), size);
    const toPoint = p.subtract(ray.origin);
    const off = toPoint.subtract(ray.direction.scale(toPoint.dot(ray.direction))).length();
    assert.ok(off < 1e-4, `the ray misses its own pixel by ${off}`);

    // and asking must not quietly reproject for a different canvas behind your back
    const again = render3D.worldToClip(p);
    near(again.x, clip.x); near(again.y, clip.y);

    // screenToGround takes the same canvas, so it lands back on the point it came from
    const target = vec3(2, 0, -1);
    const hit = render3D.screenToGround(toScreen(render3D.worldToClip(target)), 0, size);
    nearVec(hit, target.x, target.y, target.z);
});

test('drawSoftShadow is a soft disc facing up just above the floor', () =>
{
    const disc = render3D.bake(()=> render3D.drawSoftShadow(vec3(3, 5, -2), 4, 1));
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
    const drawMesh = render3D.drawMesh;
    render3D.drawMesh = (mesh, matrix)=>
    {
        seen = {lighting: render3D.lighting, blend: render3D.blend, depthTest: render3D.depthTest,
            depthWrite: render3D.depthWrite, fogEnd: render3D.fogEnd, matrix};
    };
    render3D.sky = new Mesh;
    render3D.camera.pos = vec3(1, 2, 3);
    render3D.fogEnd = 50;
    render3D.lighting = true;
    render3D.specular = .5;
    render3D.cullBackFaces = true;
    render3D.drawSky();
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
    render3D.drawMesh = ()=> { throw new Error('boom'); };
    assert.throws(()=> render3D.drawSky(), /boom/);
    render3D.drawMesh = drawMesh;
    render3D.sky = undefined;
    assert.equal(render3D.fogEnd, 50);
    assert.equal(render3D.lighting, true);
    render3D.fogEnd = 0;
    render3D.specular = 0;
    render3D.cullBackFaces = false;
});

test('drawSky still has somewhere to put the dome when the far plane is at Infinity', () =>
{
    // Matrix4.perspective takes an infinite far plane, so the sky has to cope with one
    render3D.sky = buildSky();
    render3D.camera.pos = vec3();
    render3D.camera.far = Infinity;
    const dome = render3D.bake(()=> render3D.drawSky());
    assert.ok(dome.vertexCount > 0);
    for (const p of dome.points)
        assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.z), 'an infinite far plane put the sky at ' + p);
    const radius = dome.computeRadius();
    assert.ok(radius > render3D.camera.near, 'the dome is inside the near plane, it would be clipped away');
    render3D.camera.far = 1e3;
    render3D.sky = undefined;
});

test('drawStripUnlit turns lighting off for the push and restores it, even on a throw', () =>
{
    const seen = [];
    render3D.lighting = true;
    render3D.bake(()=>
    {
        const capture = render3D.capture;
        const addStrip = capture.addStrip.bind(capture);
        capture.addStrip = (...args)=> { seen.push(render3D.lighting); return addStrip(...args); };
        render3D.drawStripUnlit([vec3(), vec3(1), vec3(2)]);
        render3D.drawBillboard(vec3(), vec2(1));
        render3D.drawLine(vec3(), vec3(1));
        render3D.drawSoftShadow(vec3(), 1);
        render3D.drawStrip([vec3(), vec3(1), vec3(2)]);
    });
    assert.deepEqual(seen, [false, false, false, false, false, false, true]); // three disc rings in the shadow
    assert.equal(render3D.lighting, true);
    assert.throws(()=> render3D.bake(()=> render3D.drawStripUnlit([vec3(), vec3(1)]))); // too few points asserts
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
    render3D.drawStrip([vec3(-1, 0, 5), vec3(1, 0, 5), vec3(0, 1, 5)]); // center (0, .33, 5): 5 away
    render3D.drawBillboard(vec3(0, 0, 0), vec2(1));                    // 10 away, unlit
    const queue = render3D.transparentQueue;
    assert.equal(queue.length, 3);
    near(queue[0].distance, 400);
    assert.equal(queue[0].state.additive, true);
    near(queue[1].distance, 1/9 + 25);
    assert.equal(queue[1].state.additive, false);
    near(queue[2].distance, 100);
    assert.equal(queue[2].state.lighting, true); // the billboard turns lighting off itself when it draws

    // replay runs the farthest first and applies each item's captured state as it runs
    const order = [];
    for (const item of queue)
        item.draw = ()=> order.push([item.distance, render3D.additive, render3D.lighting]);
    render3D.specular = .3; // not captured by any item, must survive the replay
    render3D.flushTransparentQueue();
    assert.equal(render3D.transparentQueue, undefined);
    assert.deepEqual(order.map(o => o[0] > 399 ? 'mesh' : o[0] > 99 ? 'billboard' : 'strip'), ['mesh', 'billboard', 'strip']);
    assert.deepEqual(order.map(o => o[1]), [true, false, false]);   // additive only for the mesh
    assert.deepEqual(order.map(o => o[2]), [true, true, true]);     // the billboard queues with the stage's lighting state
    // the replay leaves the state as it found it, so the last item cannot unlight the next frame
    assert.equal(render3D.specular, .3);
    assert.equal(render3D.lighting, true);
    assert.equal(render3D.additive, false);
    render3D.specular = 0;
});

test('capped lathes close the ends that have a radius with outward flat discs', () =>
{
    const open = buildLathe([[1, -1], [1, 1]], 8, false, false);
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
    const c = buildCylinder(4, 4, 6, false);
    assert.equal(c.vertexCount, 6 * 6 + 2 * (6 + 2));
    assertOutward(c, 'cylinder');
    let top = -1e9, bottom = 1e9, radius = 0;
    for (const p of c.points)
        top = Math.max(top, p.y), bottom = Math.min(bottom, p.y), radius = Math.max(radius, Math.hypot(p.x, p.z));
    near(top, 2); near(bottom, -2); near(radius, 2);
    assert.equal(buildCylinder(4, 4, 6, false, false).vertexCount, 6 * 6);
});

test('Camera3D.orbit parks the camera at the distance and angles and looks at the target', () =>
{
    const c = new Camera3D;
    c.orbit(vec3(1, 2, 3), 10, 0, 0);
    nearVec(c.pos, 1, 2, 13);
    nearVec(c.getForward(), 0, 0, -1);
    c.orbit(vec3(), 10, PI / 2, PI / 4);
    near(c.pos.distance(vec3()), 10);
    near(c.pos.y, 10 * Math.SQRT1_2);
    near(c.pos.x, 10 * Math.SQRT1_2);
    nearVec(c.getForward(), -c.pos.x / 10, -c.pos.y / 10, 0);
});

test('EngineObject3D moves in updatePhysics like 2D, a child in updateTransforms, and has no 2D mass', () =>
{
    // the engine runs updatePhysics before update, so update sees where the object is this frame
    const o = new EngineObject3D(vec3(1, 2, 3));
    o.velocity3D = vec3(.1, 0, -.1);
    o.updateTransforms();
    nearVec(o.pos3D, 1, 2, 3); // a top level object does not move here
    o.updatePhysics();
    nearVec(o.pos3D, 1.1, 2, 2.9);
    near(o.pos.x, 0); // the 2D body is untouched
    assert.equal(o.mass, 0);
    const child = new EngineObject3D(vec3(0, 0, 1));
    o.addChild(child);
    child.velocity3D = vec3(0, 1, 0);
    o.updateTransforms(); // the engine never gives a child updatePhysics, the root's updateTransforms moves it
    nearVec(child.pos3D, 0, 1, 1);
    child.destroy();
    o.destroy();
});

test('buildGrid takes a flat color or a color function', () =>
{
    const flat = buildGrid(vec2(2), 1, RED);
    assert.ok(flat.colors.every(c => c.r === 1 && c.g === 0));
    const fn = buildGrid(vec2(2), vec2(2, 1), (x, z)=> x < 0 ? RED : WHITE, undefined, false);
    assert.ok(fn.colors.slice(0, 6).every(c => c.g === 0) && fn.colors.slice(6).every(c => c.g === 1));
    assert.ok(buildGrid(vec2(2)).colors.every(c => c.g === 1));
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

test('scaling a ParticleEmitter3D scales the whole effect, not just the spawn area', () =>
{
    const make = (scale)=>
    {
        const e = new ParticleEmitter3D(vec3(), vec3(2, 2, 2), 0, 0, 0, undefined,
            WHITE, WHITE, WHITE, WHITE, 10, 1, 1, .5, 1, -.01, 0, 0); // no randomness, so the numbers are exact
        e.scale3D = vec3(scale);
        e.emitParticle();
        return e;
    };
    const one = make(1), four = make(4);
    near(four.particles[0].velocity.length(), one.particles[0].velocity.length() * 4);
    near(four.particles[0].sizeStart, one.particles[0].sizeStart * 4);
    near(four.particles[0].sizeEnd, one.particles[0].sizeEnd * 4);

    // and gravity too, or a scaled up effect would arc flatter than the one it copies
    const fall = (e)=> { const before = e.particles[0].velocity.y; e.update(); return e.particles[0].velocity.y - before; };
    near(fall(four), fall(one) * 4);
    one.destroy(true); four.destroy(true);

    // a parent's scale counts the same way
    const parent = new EngineObject3D(vec3());
    parent.scale3D = vec3(3);
    const child = make(1);
    parent.addChild(child);
    child.particles.length = 0;
    child.emitParticle();
    const plain = make(1);
    near(child.particles[0].sizeStart, plain.particles[0].sizeStart * 3);
    parent.destroy(true); plain.destroy(true);
});

test('ParticleEmitter3D particles turn when asked and sit still by default', () =>
{
    const tileInfo = new TileInfo(vec2(), vec2(16));
    const make = (spin, damping=1)=>
    {
        // a rate of zero so update() adds nothing and only the hand fed particle is measured
        const e = new ParticleEmitter3D(vec3(), 0, 0, 0, 0, tileInfo, WHITE, WHITE, WHITE, WHITE, 10, 1, 1, 0, 1, 0, 0, 0);
        e.angleSpeed = spin;
        e.angleDamping = damping;
        e.emitParticle();
        return e;
    };
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
    const corners = (e)=> render3D.bake(()=> e.render3D()).points.map(p => p.toString()).join(' ');

    // the default is no spin at all, and has to draw exactly what it drew before there was any
    const still = make(0);
    assert.equal(still.particles[0].angle, 0);
    assert.equal(still.particles[0].angleVelocity, 0);
    const before = corners(still);
    still.update();
    assert.equal(corners(still), before, 'a particle with no spin moved');
    still.destroy(true);

    // asking for spin turns it, and angleDamping takes the spin away again
    const spun = make(.1);
    const spunBefore = corners(spun);
    spun.update();
    assert.notEqual(corners(spun), spunBefore, 'a spinning particle did not turn');
    spun.destroy(true);

    const damped = make(.1, .5);
    const v0 = Math.abs(damped.particles[0].angleVelocity);
    damped.update();
    near(Math.abs(damped.particles[0].angleVelocity), v0 * .5);
    damped.destroy(true);

    // and they spin both ways from random starting angles, like the 2D particle
    const many = make(.1);
    for (let i = 0; i < 200; ++i) many.emitParticle();
    assert.ok(many.particles.some(p => p.angleVelocity > 0) && many.particles.some(p => p.angleVelocity < 0),
        'every particle spun the same way');
    const angles = many.particles.map(p => p.angle);
    assert.ok(Math.max(...angles) - Math.min(...angles) > 5, 'starting angles are not spread around');
    many.destroy(true);
});

test('ParticleEmitter3D lives out its emit time even when it emits nothing', () =>
{
    // an emitter only goes away once its emit time is up, the way the 2D one does;
    // a rate of zero or the global scale turned down is quiet, not finished
    const byHand = new ParticleEmitter3D(vec3(), 0, 1, 0);
    byHand.update();
    assert.ok(!byHand.destroyed, 'an emitter fed by hand destroyed itself before emitting anything');
    byHand.emitParticle();
    assert.equal(byHand.particles.length, 1);
    byHand.destroy(true);

    setParticleEmitRateScale(0);
    const quiet = new ParticleEmitter3D(vec3(), 0, 1, 60);
    quiet.update();
    assert.ok(!quiet.destroyed, 'turning the global emit rate down destroyed a timed emitter');
    assert.equal(quiet.particles.length, 0, 'a scale of zero should still emit nothing');
    quiet.destroy(true);
    setParticleEmitRateScale(1);
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

test('renderAfter2D defaults off and objects follow it unless they set their own', () =>
{
    assert.equal(render3D.renderAfter2D, false);
    const o = new EngineObject3D;
    assert.equal(o.renderAfter2D, undefined);
    o.destroy();
});

test('HeightMap.getHeight matches the mesh triangles, split from (i, j+1) to (i+1, j)', () =>
{
    // a saddle: two opposite corners high, the split diagonal runs between the high corners
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

test('drawSoftShadow follows a height function and lifts by the given amount', () =>
{
    const disc = render3D.bake(()=> render3D.drawSoftShadow(vec3(2, 9, 3), 2, (x, z)=> x + z, WHITE, .5));
    assert.equal(disc.vertexCount, 3 * (2 * 17 + 2));
    for (const p of disc.points)
        near(p.y, p.x + p.z + .5);
    const flat = render3D.bake(()=> render3D.drawSoftShadow(vec3(2, 9, 3), 2, 4));
    for (const p of flat.points)
        near(p.y, 4.02);
});

test('drawRibbon closes a path that ends where it starts, and leaves an open one alone', () =>
{
    // a ring: the first and last points are the same, so the two ends must meet edge to edge;
    // the strip is edge pairs with a repeat at each end, so the join is vertices 1,2 and n-3,n-2
    // seen from above, so the ribbon faces the camera all the way round
    const camera = render3D.camera, pos = camera.pos, rotation = camera.rotation;
    camera.pos = vec3(0, 20, 0);
    camera.rotation = vec3(-PI/2, 0, 0);
    render3D.updateMatrices(1);
    try
    {
        const ring = [];
        for (let i = 0; i <= 24; ++i)
            ring.push(vec3(Math.cos(i/24*2*PI)*5, 0, Math.sin(i/24*2*PI)*5));
        const closed = render3D.bake(()=> render3D.drawRibbon(ring, 1)).points, n = closed.length;
        assert.ok(closed[1].distance(closed[n-3]) < 1e-9 && closed[2].distance(closed[n-2]) < 1e-9,
            'the ends of a loop meet with no seam');

        // an open path keeps its ends square to their own last segment, as before
        const open = [vec3(0,0,0), vec3(2,0,0), vec3(2,0,2)];
        const strip = render3D.bake(()=> render3D.drawRibbon(open, 1)).points;
        near(strip[1].x, strip[2].x); // across the first segment, which runs along x
    }
    finally
    {
        camera.pos = pos, camera.rotation = rotation;
        render3D.updateMatrices(1);
    }
});

test('drawRibbon builds a strip with width and color per point, uvs along it, and a given side', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    const points = [vec3(0, 0, 0), vec3(2, 0, 0), vec3(4, 0, 0)];
    const tileInfo = new TileInfo(vec2(), vec2(16));
    const r = render3D.bake(()=> render3D.drawRibbon(points, [1, .5, 0], tileInfo, [RED, WHITE, RED]));
    assert.equal(r.vertexCount, 2 * 3 + 2);
    // pairs across the path in the camera plane, the first is the wide end
    nearVec(r.points[1], 0, .5, 0); nearVec(r.points[2], 0, -.5, 0);
    nearVec(r.points[3], 2, .25, 0); nearVec(r.points[4], 2, -.25, 0);
    nearVec(r.points[5], 4, 0, 0);
    near(r.uvs[1].x, 0); near(r.uvs[3].x, .5); near(r.uvs[5].x, 1); near(r.uvs[2].y, 1);
    assert.equal(r.colors[3].g, 1); assert.equal(r.colors[5].g, 0);
    // a side pins the ribbon's plane, culling is left as it was
    render3D.cullBackFaces = true;
    const s = render3D.bake(()=> render3D.drawRibbon(points, 1, undefined, WHITE, vec3(0, 0, 5)));
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
    render3D.sunDirection = vec3(0, 1, 0); // straight overhead
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
    render3D.sunDirection = vec3(-.3, 1, .5);
});

test('buildCone, buildCapsule and buildTorus are outward shapes of the documented size', () =>
{
    const cone = buildCone(1, 1, 8, false);
    assertOutward(cone, 'cone');
    near(Math.max(...cone.points.map(p => p.y)), .5);
    near(Math.min(...cone.points.map(p => p.y)), -.5);
    assert.equal(buildCone(.5, 1, 8, false, false).vertexCount, 8 * 6); // no base
    const capsule = buildCapsule(1, 2, 8, 2, false);
    assertOutward(capsule, 'capsule');
    near(Math.max(...capsule.points.map(p => p.y)), 1);
    near(Math.min(...capsule.points.map(p => p.y)), -1);
    // every torus normal points away from the middle of the tube, and the smooth seam matches its neighbours
    assert.equal(buildTorus(1.3, .3, 8, 4, false).vertexCount, 4 * 8 * 6); // a quad per side per segment
    assert.equal(buildTorus(1.3, .3, 8, 4, true).vertexCount, 4 * (2 * 9 + 2));  // a ribbon per segment
    for (const torus of [buildTorus(1.3, .3, 8, 4, false), buildTorus(1.3, .3, 8, 4, true)])
    {
        torus.points.forEach((p, i) =>
        {
            const c = vec3(p.x, 0, p.z).normalize(.5), n = torus.normals[i];
            assert.ok(n.dot(p.subtract(c).normalize()) > .5, 'torus normal points out of the tube');
        });
    }
    const smooth = buildTorus(1.3, .3, 8, 4, true);
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
    close(flat.raycast(new Ray3D(vec3(0, 5, 0), vec3(0, -1, 0))), 5);
    close(flat.raycast(new Ray3D(vec3(0, 5, 0), vec3(0, -2, 0))), 2.5); // in units of the direction
    assert.equal(flat.raycast(new Ray3D(vec3(0, 5, 0), vec3(0, 1, 0))), undefined); // away from it
    assert.equal(flat.raycast(new Ray3D(vec3(20, 5, 0), vec3(0, -1, 0))), undefined); // beside it
    assert.equal(flat.raycast(new Ray3D(vec3(-20, 1, 0), vec3(1, 0, 0))), undefined); // across it, above the ground
    // a slope from 10 high at the back to 0 at the front, straight down at the middle meets it at 5
    const slope = new HeightMap([[1, 1], [0, 0]], vec2(10, 10), 10);
    const t = slope.raycast(new Ray3D(vec3(0, 20, 0), vec3(0, -1, 0)));
    close(t, 15); assert.ok(true, `${t}`);
    // a ray from the side hits the slope face, not the clamped ground beyond the edge
    const side = slope.raycast(new Ray3D(vec3(0, 2.5, 20), vec3(0, 0, -1)));
    close(side, 17.5); assert.ok(true, `${side}`);
});

test('the stage loop sets the draw state from each object, so render3D overrides inherit it', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const seen = {};
    class Probe extends EngineObject3D
    {
        render3D() { seen[this.name] = {lighting: render3D.lighting, emissive: render3D.emissive, additive: render3D.additive, specular: render3D.specular, receiveShadow: render3D.receiveShadow, blend: render3D.blend, cull: render3D.cullBackFaces}; }
    }
    const plain = new Probe, lamp = new Probe, shiny = new Probe, glow = new Probe;
    plain.name = 'plain';
    lamp.name = 'lamp', lamp.emissive = 1, lamp.receiveShadow = false;
    shiny.name = 'shiny', shiny.specular = .7;
    glow.name = 'glow', glow.additive = true; // additive alone puts it in the transparent stage
    assert.equal(plain.emissive, 0); assert.equal(plain.receiveShadow, true); assert.equal(plain.specular, 0); assert.equal(plain.additive, false);
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    render3D.specular = .5; // a stray setting must not reach the objects
    render3D.renderStages(engineObjects.filter(o => o instanceof EngineObject3D && !o.destroyed));
    assert.deepEqual(seen.plain, {lighting: true, emissive: 0, additive: false, specular: 0, receiveShadow: true, blend: false, cull: false});
    assert.deepEqual(seen.lamp, {lighting: true, emissive: 1, additive: false, specular: 0, receiveShadow: false, blend: false, cull: false});
    assert.deepEqual(seen.shiny, {lighting: true, emissive: 0, additive: false, specular: .7, receiveShadow: true, blend: false, cull: false});
    assert.deepEqual(seen.glow, {lighting: true, emissive: 0, additive: true, specular: 0, receiveShadow: true, blend: true, cull: false});
    // and the pass leaves the defaults behind
    assert.equal(render3D.specular, 0);
    assert.equal(render3D.lighting, true);
    assert.equal(render3D.emissive, 0);
    assert.equal(render3D.receiveShadow, true);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('playSoundLoop is playSound with loop on', () =>
{
    // no audio headless, so check what it hands playSound
    const playSound = render3D.playSound, calls = [];
    render3D.playSound = (...args)=> calls.push(args);
    try { render3D.playSoundLoop('sound', vec3(1, 2, 3), .5, 2); }
    finally { render3D.playSound = playSound; }
    assert.deepEqual(calls[0].slice(2), [.5, 2, 1, true]);
    assert.equal(calls[0][0], 'sound');
});

test('the shared box and sphere are there from the start, and drawBox and drawSphere use them', () =>
{
    // size 1 each, so an object's scale3D is its size, as for any other size 1 mesh
    const {boxMesh, sphereMesh} = render3D;
    assert.ok(boxMesh instanceof Mesh && sphereMesh instanceof Mesh);
    nearVec(boxMesh.getBounds().max, .5, .5, .5);
    near(sphereMesh.getBounds().max.y, .5);
    const box = render3D.bake(()=> render3D.drawBox(vec3(), 1));
    const sphere = render3D.bake(()=> render3D.drawSphere(vec3(), 1));
    assert.equal(box.points.length, boxMesh.points.length);
    assert.equal(sphere.points.length, sphereMesh.points.length);
    assert.equal(render3D.boxMesh, boxMesh, 'drawing does not replace them');
});

test('drawBox and drawSphere draw, pick finds the nearest object', () =>
{
    assert.doesNotThrow(()=> render3D.drawBox(vec3(), 2, RED, vec3(0, 1, 0)));
    assert.doesNotThrow(()=> render3D.drawSphere(vec3(), 2, RED));
    const nearObject = new EngineObject3D(vec3(0, 0, -5), buildBox()), farObject = new EngineObject3D(vec3(0, 0, -12), buildBox());
    farObject.scale3D = vec3(2);
    const miss = new EngineObject3D(vec3(5, 0, -5), buildBox());
    const hit = render3D.pick(new Ray3D(vec3(), vec3(0, 0, -1)));
    assert.equal(hit.object, nearObject);
    near(hit.distance, 5 - Math.sqrt(.75)); // to the bounding sphere
    assert.equal(render3D.pick(new Ray3D(vec3(), vec3(0, 0, -1)), [farObject]).object, farObject);
    assert.equal(render3D.pick(new Ray3D(vec3(), vec3(0, 1, 0))), undefined);
    nearObject.destroy(); farObject.destroy(); miss.destroy();
});

test('Mesh getBounds, center and fit', () =>
{
    const m = new Mesh().combine(buildBox(vec3(2, 4, 6)), Matrix4.translation(vec3(10, 0, 0)));
    const {min, max} = m.getBounds();
    nearVec(min, 9, -2, -3); nearVec(max, 11, 2, 3);
    m.center();
    nearVec(m.getBounds().min, -1, -2, -3);
    m.fit(3);
    nearVec(m.getBounds().max, .5, 1, 1.5);
});

test('EngineObject3D.lookAt turns the object toward a target', () =>
{
    const o = new EngineObject3D(vec3());
    o.lookAt(vec3(5, 0, 0));
    nearVec(o.getMatrix().transformDirection(vec3(0, 0, -1)), 1, 0, 0);
    o.lookAt(vec3(0, 5, 0));
    nearVec(o.getMatrix().transformDirection(vec3(0, 0, -1)), 0, 1, 0);
    o.destroy();
});

test('debug primitives are ignored headless without a renderer', () =>
{
    assert.doesNotThrow(()=>
    {
        debugBox3D(vec3(), 2, RED, 1, vec3(0, 1, 0));
        debugSphere3D(vec3(), 2);
        debugLine3D(vec3(), vec3(1));
        debugPoint3D(vec3(1));
    });
});

test('buildBox takes a number, buildCapsule height is the total, buildLoft widths are full widths', () =>
{
    near(buildBox(2).getBounds().max.x, 1);
    const capsule = buildCapsule(1, 3, 8, 2, false);
    near(capsule.getBounds().max.y, 1.5); near(capsule.getBounds().min.y, -1.5);
    assert.throws(()=> buildCapsule(1, .5, 8, 2, false)); // shorter than the size is only a sphere
    const loft = buildLoft([[1, 2, 1, -1], [-1, 2, 1, -1]]);
    near(loft.getBounds().max.x, 1); near(loft.getBounds().min.x, -1);
    assert.equal(buildLathe([[0, -1], [1, 0], [0, 1]]).vertexCount, 2 * 16 * 6); // 16 sides by default
});

test('isVector3 rejects NaN like isVector2', () =>
{
    assert.equal(isVector3(vec3(1, 2, 3)), true);
    const bad = vec3(); bad.x = NaN;
    assert.equal(isVector3(bad), false);
    assert.equal(isVector3(vec2()), false);
});

test('an orthographic camera projects parallel rays', () =>
{
    const c = render3D.camera;
    c.pos = vec3(0, 0, 10); c.rotation = vec3(); c.orthographic = 20;
    render3D.updateMatrices(2);
    // x spans the visible width, y the visible height, no perspective on z
    near(render3D.worldToClip(vec3(20, 10, 0)).x, 1);
    near(render3D.worldToClip(vec3(20, 10, 0)).y, 1);
    near(render3D.worldToClip(vec3(20, 0, -50)).x, 1);
    const ray = render3D.screenToRay(vec2(0, 0), vec2(200, 100)); // top left of a 2:1 canvas
    nearVec(ray.direction, 0, 0, -1);
    nearVec(ray.origin, -20, 10, 10);
    c.orthographic = 0;
    render3D.updateMatrices(1);
});

test('angleVelocity3D turns objects each frame and getWorldPos3D composes with the parent', () =>
{
    const parent = new EngineObject3D(vec3(10, 0, 0));
    const child = new EngineObject3D(vec3(0, 0, 1));
    parent.addChild(child);
    parent.angleVelocity3D = vec3(0, PI / 2, 0);
    parent.updatePhysics();
    near(parent.rotation3D.y, PI / 2);
    nearVec(child.getWorldPos3D(), 11, 0, 0);
    nearVec(parent.getWorldPos3D(), 10, 0, 0);
    child.destroy(); parent.destroy();
});

test('soft discs and shadows assert in the opaque stage but bake and queue fine', () =>
{
    assert.doesNotThrow(()=> render3D.bake(()=> render3D.drawSoftShadow(vec3(), 1)));
    render3D.isRendering = true;
    render3D.blend = false;
    try { assert.throws(()=> render3D.drawSoftDisc(vec3(), 1)); }
    finally { render3D.isRendering = false; }
});

test('playSound is quiet headless and asserts on bad arguments', () =>
{
    const sound = new Sound([1, 0]);
    assert.equal(render3D.playSound(sound, vec3(1, 2, 3)), undefined);
    assert.throws(()=> render3D.playSound(sound, vec2()));
});

test('the non default layer draws its objects without the sky, the callbacks or the debug primitives', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const seen = [];
    class Probe extends EngineObject3D { render3D() { seen.push(this.name); } }
    const a = new Probe, b = new Probe;
    a.name = 'a', b.name = 'b', b.renderAfter2D = true;
    render3D.onRenderOpaque = ()=> seen.push('opaque');
    render3D.onRenderTransparent = ()=> seen.push('transparent');
    render3D.sky = new Mesh;
    const drawMesh = render3D.drawMesh;
    render3D.drawMesh = ()=> seen.push('sky');
    try
    {
        render3D.updateMatrices(1);
        render3D.renderStages([b], false);
        assert.deepEqual(seen, ['b']);
        seen.length = 0;
        render3D.renderStages([a], true);
        assert.deepEqual(seen, ['sky', 'a', 'opaque', 'transparent']);
    }
    finally
    {
        render3D.drawMesh = drawMesh;
        render3D.sky = render3D.onRenderOpaque = render3D.onRenderTransparent = undefined;
        for (const o of engineObjects) o.destroy();
        engineObjects.length = 0;
    }
});

test('sortTransparent off draws transparent objects in render order with no queue', () =>
{
    const seen = [];
    class Probe extends EngineObject3D { render3D() { seen.push([this.name, render3D.transparentQueue === undefined, render3D.blend]); } }
    const a = new Probe, b = new Probe;
    a.name = 'a', a.transparent = true, a.renderOrder = 2;
    b.name = 'b', b.transparent = true, b.renderOrder = 1;
    render3D.sortTransparent = false;
    try { render3D.renderStages([a, b]); }
    finally { render3D.sortTransparent = true; a.destroy(); b.destroy(); }
    assert.deepEqual(seen, [['b', true, true], ['a', true, true]]);
});

test('soft discs and shadows queue once in the transparent stage and bake even inside it', () =>
{
    render3D.transparentQueue = [];
    render3D.drawSoftDisc(vec3(), 1);
    render3D.drawSoftShadow(vec3(), 1);
    assert.equal(render3D.transparentQueue.length, 2);
    const baked = render3D.bake(()=> render3D.drawSoftDisc(vec3(), 1, WHITE, vec3(0, 0, 1), 8));
    assert.equal(baked.vertexCount, 3 * (2 * 9 + 2));
    assert.equal(render3D.transparentQueue.length, 2);
    render3D.transparentQueue = undefined;
});

test('Mesh.addQuad takes colors and uvs in corner order', () =>
{
    const m = new Mesh().addQuad(vec3(0, 1, 0), vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), [RED, WHITE, RED, WHITE], [vec2(0, 0), vec2(0, 1), vec2(1, 1), vec2(1, 0)]);
    // strip vertices are a, b, d, c with the leading repeat first
    nearVec(m.points[3], 1, 1, 0);
    assert.equal(m.colors[3].g, 1); // d is the fourth corner, white
    assert.equal(m.colors[4].g, 0); // c is the third corner, red
    near(m.uvs[3].x, 1); near(m.uvs[3].y, 0);
    near(m.uvs[4].x, 1); near(m.uvs[4].y, 1);
    assert.equal(new Mesh().getBounds().min.x, 0); // an empty mesh has empty bounds
    assert.equal(buildSphere(1, 8, 4, false).vertexCount, 4 * 8 * 6); // no polar caps
});

test('Camera3D.follow eases toward the offset spot and looks at the target', () =>
{
    const c = new Camera3D;
    c.pos = vec3(0, 0, 0);
    c.follow(vec3(10, 0, 0), vec3(0, 0, 4), .5);
    nearVec(c.pos, 5, 0, 2);
    c.follow(vec3(10, 0, 0), vec3(0, 0, 4));
    nearVec(c.pos, 10, 0, 4);
    nearVec(c.getForward(), 0, 0, -1);
});

test('buildRibbon lays lit quads along a path, open or closed, with per point widths and colors', () =>
{
    const points = [vec3(0, 0, 0), vec3(2, 0, 0), vec3(4, 0, 0)];
    const open = buildRibbon(points, 1);
    assert.equal(open.vertexCount, 2 * 6);
    assertOutward(new Mesh().combine(open, Matrix4.translation(vec3(-2, 1, 0))), 'ribbon faces up'); // lifted so the origin is under it
    for (const p of open.points)
        assert.ok(Math.abs(p.z) <= .5 + 1e-6 && p.y === 0);
    const closed = buildRibbon([vec3(-1, 0, -1), vec3(1, 0, -1), vec3(1, 0, 1), vec3(-1, 0, 1)], [1, 1, 2, 2], [RED, RED, WHITE, WHITE], true);
    assert.equal(closed.vertexCount, 4 * 6);
    assert.ok(closed.colors.some(c => c.g === 0) && closed.colors.some(c => c.g === 1));
    assert.throws(()=> buildRibbon([vec3()]));
});

test('HeightMap.getNormal tilts with the slope and screenToGround finds the floor', () =>
{
    const slope = new HeightMap([[1, 1], [0, 0]], vec2(10, 10), 10); // falls toward +Z
    const n = slope.getNormal(0, 0);
    assert.ok(n.y > 0 && n.z > 0 && Math.abs(n.x) < 1e-6);
    nearVec(new HeightMap([[0, 0], [0, 0]], vec2(10, 10), 1).getNormal(1, 1), 0, 1, 0);
    // the ground hit comes from the screen ray, stand one in since there is no canvas headless
    const screenToRay = render3D.screenToRay;
    render3D.screenToRay = ()=> new Ray3D(vec3(0, 10, 0), vec3(1, -1, 0).normalize());
    try
    {
        nearVec(render3D.screenToGround(vec2()), 10, 0, 0);
        nearVec(render3D.screenToGround(vec2(), 5), 5, 5, 0);
        assert.equal(render3D.screenToGround(vec2(), 20), undefined); // ground above the camera
    }
    finally { render3D.screenToRay = screenToRay; }
});

test('worldToClip returns undefined behind an orthographic camera and drawQuad takes corner colors', () =>
{
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.camera.orthographic = 20;
    render3D.updateMatrices(1);
    assert.equal(render3D.worldToClip(vec3(0, 0, 20)), undefined);
    assert.ok(render3D.worldToClip(vec3(0, 0, 0)));
    render3D.camera.orthographic = 0;
    render3D.updateMatrices(1);
    const quad = render3D.bake(()=> render3D.drawQuad(vec3(-1, 1, 0), vec3(-1, -1, 0), vec3(1, -1, 0), vec3(1, 1, 0), undefined, [RED, RED, WHITE, RED]));
    assert.equal(quad.colors[4].g, 1); // the third corner is the fourth strip vertex
});

test('the stream splits a batch when the draw state changes between strips', () =>
{
    render3D.isRendering = true;
    render3D.shader = {}; // a stand in so drawStrip writes to the stream, flush does nothing without gl
    const flush = render3D.flush;
    let flushes = 0;
    render3D.flush = ()=> { ++flushes; render3D.streamCount = 0; };
    try
    {
        const tri = [vec3(), vec3(1), vec3(2)];
        render3D.drawStrip(tri);
        render3D.drawStrip(tri);
        assert.equal(flushes, 0);
        render3D.specular = .5;
        render3D.drawStrip(tri); // a different state flushes the pending batch first
        assert.equal(flushes, 1);
        assert.equal(render3D.streamState.specular, .5);
    }
    finally
    {
        render3D.flush = flush;
        render3D.shader = undefined;
        render3D.isRendering = false;
        render3D.streamCount = 0;
        render3D.specular = 0;
    }
});

test('render3D.gravity and the inherited damping move objects like the 2D physics, sync2D copies the 2D transform', () =>
{
    render3D.gravity = vec3(0, -.1, 0);
    const o = new EngineObject3D(vec3(0, 10, 0));
    o.velocity3D = vec3(1, 0, 0);
    o.updatePhysics();
    nearVec(o.velocity3D, 1, 0, 0); // no mass, no gravity or damping
    o.pos3D = vec3(0, 10, 0);
    o.mass = 1;
    o.damping = .5;
    o.updatePhysics();
    // damped first and gravity added after, the order EngineObject.updatePhysics uses
    nearVec(o.velocity3D, .5, -.1, 0);
    nearVec(o.pos3D, .5, 9.9, 0);
    o.gravityScale = 0;
    o.updatePhysics();
    near(o.velocity3D.y, -.05); // damped, no more gravity
    o.sync2D = true;
    o.pos = vec2(3, 4);
    o.angle = .5;
    o.updateTransforms();
    near(o.pos3D.x, 3); near(o.pos3D.y, 4); near(o.rotation3D.z, -.5);
    render3D.gravity = vec3();
    o.destroy();
});

test('solid collision still finds a touch when size3D and scale3D pull different ways', () =>
{
    // the quick reject before the exact test has to reach at least as far as the shape does.
    // a sphere collides as size3D's longest side times the largest scale, even when those are
    // different axes, so a reject that multiplied them axis by axis would skip this entirely.
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const post = new EngineObject3D(vec3(20, 0, 0));
    post.setCollision();
    const ball = new EngineObject3D(vec3());
    ball.size3D = vec3(10, 1, 1);   // longest along x
    ball.scale3D = vec3(.1, 5, 1);  // largest along y
    ball.collideAsSphere3D = true;  // so it collides as a sphere 10/2 * 5 = 25 in radius
    ball.mass = 1;                  // only the ball moves, the post is static
    ball.setCollision();
    engineObjectsUpdate();
    ball.pos3D = vec3();
    post.pos3D = vec3(20, 0, 0);
    ball.updatePhysics();
    // the post's near face is at 19.5, so a radius of 25 pushes the ball 5.5 back along -x
    near(ball.pos3D.x, -5.5);
    nearVec(post.pos3D, 20, 0, 0);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('EngineObject3D axes, sprite objects and the collect helpers', () =>
{
    const o = new EngineObject3D(vec3(1, 2, 3));
    o.rotation3D = vec3(0, PI / 2, 0);
    nearVec(o.getForward3D(), -1, 0, 0);
    nearVec(o.getRight3D(), 0, 0, -1);
    nearVec(o.getUp3D(), 0, 1, 0);
    o.size3D = vec3(2);
    const far = new EngineObject3D(vec3(10, 0, 0));
    assert.deepEqual(engineObjectsCollect3D(vec3(0, 2, 3), 1), [o]);
    assert.deepEqual(engineObjectsCollect3D(vec3(9.5, 0, 0), vec3(1)), [far]);
    assert.deepEqual(engineObjectsCollect3D(vec3(9, 0, 0), vec3(1)), []); // touching edges do not overlap
    let called = 0;
    engineObjectsCallback3D(vec3(), 100, ()=> ++called, [o, far]);
    assert.equal(called, 2);
    // a tile and no mesh draws a billboard the size of size3D
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
    const sprite = new EngineObject3D(vec3(), undefined, new TileInfo(vec2(), vec2(16)));
    sprite.size3D = vec3(4, 2, 1);
    const baked = render3D.bake(()=> sprite.render3D());
    assert.equal(baked.vertexCount, 6);
    near(baked.points[1].x, -2); near(baked.points[1].y, 1);
    o.destroy(); far.destroy(); sprite.destroy();
});

test('upright billboards stand on world up under a pitched camera', () =>
{
    render3D.camera.pos = vec3(0, 10, 10);
    render3D.camera.lookAt(vec3());
    render3D.updateMatrices(1);
    const tilted = render3D.bake(()=> render3D.drawBillboard(vec3(), vec2(2), undefined, WHITE, 0, false));
    const upright = render3D.bake(()=> render3D.drawBillboard(vec3(), vec2(2), undefined, WHITE, 0, true));
    assert.ok(Math.abs(tilted.points[1].z) > .1, 'a camera facing quad leans back');
    near(upright.points[1].z, 0); near(upright.points[1].y, 1); // straight up
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
});

test('objects with a softShadow get one drawn in the transparent stage, and Trail3D.clear forgets the samples', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const o = new EngineObject3D(vec3(1, 5, 2), buildBox());
    o.softShadow = 3;
    const shadows = [], drawSoftShadow = render3D.drawSoftShadow;
    render3D.drawSoftShadow = (pos, size, floor)=> shadows.push([pos, size, floor]);
    render3D.softShadowHeight = 1;
    try { render3D.renderStages([o]); }
    finally { render3D.drawSoftShadow = drawSoftShadow; render3D.softShadowHeight = 0; }
    assert.equal(shadows.length, 1);
    nearVec(shadows[0][0], 1, 5, 2); assert.equal(shadows[0][1], 3); assert.equal(shadows[0][2], 1);

    // the shadow follows the object's scale, so one size set once covers every scaled copy
    o.scale3D = vec3(2.5);
    shadows.length = 0;
    render3D.drawSoftShadow = (pos, size, floor)=> shadows.push([pos, size, floor]);
    try { render3D.renderStages([o]); }
    finally { render3D.drawSoftShadow = drawSoftShadow; }
    near(shadows[0][1], 7.5);

    // including a parent's scale, the same scale picking and culling measure it at
    o.scale3D = vec3(1);
    const parent = new EngineObject3D(vec3());
    parent.scale3D = vec3(4);
    parent.addChild(o);
    shadows.length = 0;
    render3D.drawSoftShadow = (pos, size, floor)=> shadows.push([pos, size, floor]);
    try { render3D.renderStages([o]); }
    finally { render3D.drawSoftShadow = drawSoftShadow; }
    near(shadows[0][1], 12);
    o.parent.removeChild(o);
    parent.destroy();
    o.destroy();
    engineObjects.length = 0;
    const trail = new Trail3D(vec3());
    trail.update();
    trail.pos3D = vec3(1); trail.update();
    assert.equal(trail.samples.length, 2);
    trail.clear();
    assert.equal(trail.samples.length, 0);
    trail.destroy();
});

test('drawBox, drawSphere and drawMesh bake into the mesh, moved and tinted', () =>
{
    const baked = render3D.bake(()=>
    {
        render3D.drawBox(vec3(10, 0, 0), 2, RED);
        render3D.drawSphere(vec3(), 1);
        render3D.drawMesh(buildBox(), Matrix4.translation(vec3(0, 5, 0)));
    });
    assert.equal(baked.vertexCount, buildBox().vertexCount * 2 + buildSphere(1, 16, 8, true).vertexCount);
    assert.ok(baked.points.some(p=> p.x > 10.9), 'the box moved');
    assert.ok(baked.points.some(p=> p.y > 5.4), 'the mesh moved');
    assert.equal(baked.colors[0].rgbaInt(), RED.rgbaInt());
    const bare = new Mesh; // points and normals only
    bare.points.push(vec3(), vec3(1, 0, 0), vec3(0, 1, 0));
    bare.normals.push(vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1));
    const baked2 = render3D.bake(()=> render3D.drawMesh(bare));
    assert.equal(baked2.vertexCount, 3);
    assert.equal(baked2.colors[0].rgbaInt(), WHITE.rgbaInt());
});

test('sprite objects blend by default and are picked by their size3D, lights and emitters are not', () =>
{
    const sprite = new EngineObject3D(vec3(0, 0, -5), undefined, new TileInfo(vec2(), vec2(16)));
    sprite.size3D = vec3(2);
    assert.ok(sprite.transparent);
    assert.ok(!new EngineObject3D(vec3(), buildBox()).transparent);
    const light = new Light3D(vec3(0, 0, -2)), emitter = new ParticleEmitter3D(vec3(0, 0, -3), 0, 0, 0, PI, new TileInfo(vec2(), vec2(16)));
    const hit = render3D.pick(new Ray3D(vec3(), vec3(0, 0, -1)), [light, emitter, sprite]);
    assert.equal(hit.object, sprite);
    near(hit.distance, 5 - Math.hypot(2, 2) / 2); // half the drawn diagonal, size3D.z is not drawn
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('engineObjectsCollect3D uses the world scale of parented objects', () =>
{
    const parent = new EngineObject3D(vec3(10, 0, 0));
    parent.scale3D = vec3(3);
    const child = new EngineObject3D(vec3(1, 0, 0));
    parent.addChild(child);
    child.size3D = vec3(1); // 3 wide in the world, centered at x = 13, so it reaches 14.5
    assert.deepEqual(engineObjectsCollect3D(vec3(14.5, 0, 0), 1, [child]), [child]);
    assert.deepEqual(engineObjectsCollect3D(vec3(15.5, 0, 0), 1, [child]), []);
    const light = new Light3D(vec3(14.5, 0, 0));
    assert.deepEqual(engineObjectsCollect3D(vec3(14.5, 0, 0), 1, [light]), [], 'lights have no size');
    light.destroy();
    parent.destroy();
    engineObjects.length = 0;
});

test('destroying an emitter or trail lets what is already out finish, like the 2D particles', () =>
{
    const ship = new EngineObject3D(vec3(5, 0, 0)), emitter = new ParticleEmitter3D(vec3(), 0, 0, 60, PI);
    ship.addChild(emitter);
    emitter.emitParticle(); emitter.emitParticle();
    emitter.update(); // emits one more at 60 a second, and remembers where it is
    ship.destroy();
    assert.ok(!emitter.destroyed && emitter.parent === undefined && emitter.emitTime < 0);
    nearVec(emitter.pos3D, 5, 0, 0); // keeps its world position when detached
    assert.equal(emitter.particles.length, 3);
    emitter.update();
    assert.equal(emitter.particles.length, 3, 'stopped emitting');
    emitter.particles.length = 0;
    emitter.update();
    assert.ok(emitter.destroyed);
    const empty = new ParticleEmitter3D(vec3(), 0, 0, 60, PI);
    empty.destroy();
    assert.ok(empty.destroyed, 'nothing to wait for');
    const now = new ParticleEmitter3D(vec3(), 0, 0, 60, PI);
    now.emitParticle(); now.destroy(true);
    assert.ok(now.destroyed, 'immediate wins');
    const forever = new Trail3D(vec3(), Infinity);
    forever.update(); forever.pos3D = vec3(1); forever.update(); forever.destroy();
    assert.ok(forever.destroyed, 'an endless trail cannot fade, so it goes now');
    const trail = new Trail3D(vec3(), 1);
    trail.update(); trail.pos3D = vec3(1); trail.update();
    trail.destroy();
    assert.ok(!trail.destroyed && trail.finishing);
    trail.pos3D = vec3(2); trail.update();
    assert.equal(trail.samples.length, 2, 'stopped recording');
    trail.samples.length = 0; trail.update();
    assert.ok(trail.destroyed);
    engineObjects.length = 0;
});

test('lookAt at your own position keeps the rotation, upright sprites survive a rolled camera, zero canvas rays are finite', () =>
{
    const o = new EngineObject3D(vec3(1, 2, 3));
    o.rotation3D = vec3(.1, .2, .3);
    o.lookAt(vec3(1, 2, 3));
    nearVec(o.rotation3D, .1, .2, .3);
    o.destroy(); engineObjects.length = 0;
    render3D.camera.pos = vec3(0, 10, 0); render3D.camera.rotation = vec3(-PI/2, 0, PI/2); render3D.updateMatrices(1);
    const quad = render3D.bake(()=> render3D.drawBillboard(vec3(), vec2(2), undefined, WHITE, 0, true));
    assert.ok(quad.points[1].distance(quad.points[3]) > 1, 'the corners did not collapse');
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
    const ray = render3D.screenToRay(vec2(), vec2());
    assert.ok(ray.direction.isValid());
    const heightMap = new HeightMap([[0, 0], [0, 0]], vec2(4, 4));
    heightMap.size = vec2(0, 4); // a size that went bad after construction, where no assert can catch it
    assert.equal(heightMap.raycast(new Ray3D(vec3(0, 5, 0), vec3(0, -1, 0))), undefined);
});

test('a sync2D object with mass takes the 2D gravity, not the 3D one', () =>
{
    render3D.gravity = vec3(0, -1, 0);
    const o = new EngineObject3D(vec3());
    o.mass = 1; o.sync2D = true;
    o.updateTransforms();
    nearVec(o.velocity3D, 0, 0, 0);
    render3D.gravity = vec3();
    o.destroy(); engineObjects.length = 0;
});

test('a ribbon along up keeps its width, lathe poles point along the axis, a capsule waist stays radial', () =>
{
    const upRibbon = buildRibbon([vec3(), vec3(0, 1, 0), vec3(0, 2, 0)], 1);
    assert.ok(upRibbon.points.some(p=> Math.abs(p.z) > .49), 'the rails are apart');
    const sphere = buildSphere(2, 12, 6, true);
    const top = sphere.points.findIndex(p=> p.y > .999);
    nearVec(sphere.normals[top], 0, 1, 0);
    const capsule = buildCapsule(2, 4, 8, 3, true);
    for (let i = 0; i < capsule.points.length; ++i)
        if (Math.abs(Math.abs(capsule.points[i].y) - 1) < 1e-6)
            assert.ok(Math.abs(capsule.normals[i].y) < .1, 'the junction ring is nearly radial: ' + capsule.normals[i]);
});

test('smooth normals weight each face by its corner angle, so a cube corner averages three faces evenly', () =>
{
    const box = buildBox().computeNormals(true);
    for (const n of box.normals)
        assert.ok(Math.abs(Math.abs(n.x) - Math.abs(n.y)) < 1e-6 && Math.abs(Math.abs(n.y) - Math.abs(n.z)) < 1e-6, '' + n);
});

test('HeightMap.getNormal measures the same slope at the edge as in the middle, lookAt straight up keeps the yaw', () =>
{
    const slope = new HeightMap([[0, 1], [0, 1]], vec2(2), 1);
    const edge = slope.getNormal(-1, 0), middle = slope.getNormal(0, 0);
    nearVec(edge, middle.x, middle.y, middle.z);
    assert.ok(middle.x < -.4, 'sloped');
    const o = new EngineObject3D(vec3());
    o.rotation3D = vec3(0, .7, 0);
    o.lookAt(vec3(0, 5, 0));
    near(o.rotation3D.x, PI / 2); near(o.rotation3D.y, .7);
    o.destroy(); engineObjects.length = 0;
});

test('setFog sets the distances and only changes the color when one is passed', () =>
{
    render3D.fogColor = RED.copy();
    render3D.setFog(5, 50);
    assert.equal(render3D.fogStart, 5); assert.equal(render3D.fogEnd, 50);
    assert.equal(render3D.fogColor.rgbaInt(), RED.rgbaInt());
    render3D.setFog(0, 0, WHITE);
    assert.equal(render3D.fogColor.rgbaInt(), WHITE.rgbaInt());
    render3D.fogColor = undefined;
});

test('a soft shadow can sit on a HeightMap directly', () =>
{
    const flat = new HeightMap([[1, 1], [1, 1]], vec2(10), 3); // 3 high everywhere
    const disc = render3D.bake(()=> render3D.drawSoftShadow(vec3(), 2, flat));
    for (const p of disc.points)
        near(p.y, 3.02);
});

test('solid objects push apart by mass and bounce off each other', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const a = new EngineObject3D(vec3()), b = new EngineObject3D(vec3(.6, 0, 0));
    a.setCollision(); b.setCollision(); // the same call as in 2D
    engineObjectsUpdate(); // the engine collects the solid objects here
    a.pos3D = vec3(); b.pos3D = vec3(.6, 0, 0);
    a.mass = b.mass = 1;
    a.velocity3D = vec3(1, 0, 0);
    b.updatePhysics(); // b comes after a, so b resolves the pair
    near(a.pos3D.x, -.2); near(b.pos3D.x, .8);
    nearVec(a.velocity3D, 0, 0, 0); // heading into b with no restitution, the push takes it away
    b.pos3D = vec3(.6, 0, 0); a.pos3D = vec3(); a.mass = 0; // a is static now
    b.updatePhysics();
    near(a.pos3D.x, 0); near(b.pos3D.x, 1);
    const emitter = new ParticleEmitter3D(vec3());
    assert.ok(!emitter.castShadow, 'particles cast no shadow unless asked');
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('instancing is on by default and a mesh can opt out', () =>
{
    assert.equal(render3D.instancing, true);
    assert.equal(new Mesh().instanced, undefined);
    const mesh = buildBox();
    mesh.instanced = false;
    assert.equal(mesh.instanced, false);
    const baked = render3D.bake(()=> render3D.drawMesh(mesh)); // a bake still copies the mesh in
    assert.equal(baked.vertexCount, mesh.vertexCount);
});

test('scaleUVs repeats a texture across a mesh', () =>
{
    const grid = buildGrid(vec2(2), 1).scaleUVs(4);
    assert.ok(grid.uvs.some(uv=> uv.x === 4 && uv.y === 4));
    assert.ok(grid.dirty);
    const box = buildBox().scaleUVs(vec2(2, 3));
    assert.ok(box.uvs.some(uv=> uv.x === 2 && uv.y === 3));
});

test('texture filtering settings have their defaults', () =>
{
    assert.equal(render3D.mipmaps, true);
    assert.equal(render3D.anisotropy, 4);
});

test('a Light3D is a point light, a DirectionalLight3D shines from where it is, parent included', () =>
{
    assert.equal(new Light3D(vec3(0, 5, 0), 4, RED).directional, false);
    const light = new DirectionalLight3D(vec3(0, 5, 0), RED, 2); // from straight above, toward the origin
    assert.ok(light instanceof Light3D);
    assert.ok(light.directional);
    assert.equal(light.intensity, 2);
    assert.equal(light.color.rgbaInt(), RED.rgbaInt());
    nearVec(light.getWorldPos3D().normalize(), 0, 1, 0);
    const sun = new EngineObject3D(vec3(10, 0, 0));
    sun.addChild(light); // parented to a sun in the sky, the light comes from where the sun is
    nearVec(light.getWorldPos3D().normalize(), 10/Math.hypot(10, 5), 5/Math.hypot(10, 5), 0);
    sun.destroy();
    engineObjects.length = 0;
});

test('a sprite object turns with its roll and only a sync2D object runs the 2D physics', () =>
{
    render3D.camera.pos = vec3(0, 0, 10); render3D.camera.rotation = vec3(); render3D.updateMatrices(1);
    const sprite = new EngineObject3D(vec3(), undefined, new TileInfo(vec2(), vec2(16)));
    sprite.size3D = vec3(4, 2, 1);
    const flat = render3D.bake(()=> sprite.render3D());
    sprite.rotation3D.z = PI/2;
    const turned = render3D.bake(()=> sprite.render3D());
    const widest = (mesh)=> mesh.points.reduce((w, p)=> Math.max(w, Math.abs(p.x)), 0);
    near(widest(flat), 2); near(widest(turned), 1); // the long side is upright now

    // a sprite grows with scale3D and with a parent's scale, the same world size the collect,
    // pick and collision helpers measure it at, so what is drawn is what gets hit
    sprite.rotation3D.z = 0;
    sprite.scale3D = vec3(3);
    near(widest(render3D.bake(()=> sprite.render3D())), 6);
    sprite.scale3D = vec3(1);
    const parent = new EngineObject3D(vec3());
    parent.scale3D = vec3(4);
    parent.addChild(sprite);
    near(widest(render3D.bake(()=> sprite.render3D())), 8);
    sprite.parent.removeChild(sprite);
    parent.destroy();

    const o = new EngineObject3D(vec3());
    o.mass = 1;
    o.velocity = vec2(1, 0);
    o.updatePhysics();
    near(o.pos.x, 0); // a 3D object moves by velocity3D, the 2D physics are skipped
    o.sync2D = true;
    o.updatePhysics();
    assert.ok(o.pos.x > 0);
    for (const object of engineObjects) object.destroy();
    engineObjects.length = 0;
});

test('CameraControl3D turns the camera with the mouse and stops when destroyed', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const control = new CameraControl3D(vec3(0, 1, 0), 12, .3);
    control.idleSpin = .1;
    control.update();
    near(control.yaw, .1); // it spins while nothing drags it
    near(render3D.camera.pos.distance(vec3(0, 1, 0)), 12);
    control.pitch = 9;
    control.update();
    near(control.pitch, control.pitchRange.y); // it cannot tip over the top
    assert.equal(control.mesh, undefined);
    control.destroy();
    engineObjects.length = 0;
});

test('FirstPersonCamera3D takes over from the camera, puts it at the eye, and walking keeps its fall', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    render3D.camera.pos = vec3(1, 2, 3);
    render3D.camera.rotation = vec3(.2, .5, 0);
    const eye = new FirstPersonCamera3D;
    nearVec(eye.pos3D, 1, 2, 3); // it starts where the camera was, so there is no jump
    near(eye.yaw, .5); near(eye.pitch, .2);
    eye.pos3D = vec3(4, 5, 6);
    eye.pitch = 9;
    eye.velocity3D = vec3(1, -.5, 1);
    eye.update();
    near(eye.pitch, eye.pitchRange.y); // it cannot tip over the top
    nearVec(render3D.camera.pos, 4, 5, 6);
    nearVec(render3D.camera.rotation, eye.pitchRange.y, .5, 0);
    nearVec(eye.velocity3D, 0, -.5, 0); // no keys, so it stops, but its fall is left for gravity
    eye.fly = true;
    eye.velocity3D = vec3(1, -.5, 1);
    eye.update();
    nearVec(eye.velocity3D, 0, 0, 0); // flying, the keys own every direction
    assert.equal(eye.mesh, undefined);
    eye.destroy();
    engineObjects.length = 0;
});

test('FirstPersonCamera3D with a size and setCollision is pushed out of solids', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const wall = new EngineObject3D(vec3(), render3D.boxMesh);
    wall.setCollision();
    const eye = new FirstPersonCamera3D(vec3(.7, 0, 0), 0, 0);
    eye.size3D = vec3(1);
    eye.collideAsSphere3D = true;
    eye.setCollision();
    engineObjectsUpdate(); // the engine collects the solid objects here
    eye.pos3D = vec3(.7, 0, 0); // half a unit of wall and half a unit of eye overlap by .3
    eye.updatePhysics();
    near(eye.pos3D.x, 1); // pushed clear, the wall stays put
    nearVec(wall.pos3D, 0, 0, 0);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('meshes cull their back faces unless doubleSided, which the open builders and combine set', () =>
{
    assert.equal(new Mesh().doubleSided, false);
    for (const closed of [buildBox(), buildSphere(), buildCylinder(), buildCone(), buildCapsule(1, 2), buildTorus(),
        buildLoft([[1, 1, 1, -1], [-1, 1, 1, -1]]), buildLathe([[0, -1], [1, 0], [0, 1]], 4)])
        assert.equal(closed.doubleSided, false);
    assert.equal(buildGrid().doubleSided, true);
    assert.equal(buildRibbon([vec3(), vec3(1, 0, 0)]).doubleSided, true);
    assert.equal(buildCylinder(1, 1, 8, false, false).doubleSided, true); // no caps, so the inside shows
    assert.equal(buildLathe([[0, -1], [1, 0], [0, 1]], 4, false, false).doubleSided, false); // poles need no caps
    assert.equal(new HeightMap([[0, 0], [0, 0]]).buildMesh().doubleSided, true);
    assert.equal(buildBox().combine(buildBox()).doubleSided, false);
    assert.equal(buildBox().combine(buildGrid()).doubleSided, true); // an open part leaves it open
    assert.equal(render3D.planeMesh.doubleSided, false);
    assert.equal(render3D.planeMeshDoubleSided.doubleSided, true);
    assert.equal(render3D.planeMesh.vertexCount, render3D.planeMeshDoubleSided.vertexCount); // one square either way
    assert.equal('cullBackFaces' in new EngineObject3D, false); // it is the mesh's to say now
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('pixelated is part of the draw state, so a batch splits on it', () =>
{
    const o = new EngineObject3D(vec3());
    assert.equal(o.pixelated, false);
    assert.equal(render3D.pixelated, false);
    o.destroy();
    engineObjects.length = 0;
});

test('a Light3D has an intensity that multiplies its color, 1 by default', () =>
{
    const plain = new Light3D(vec3(), 5, RED), bright = new Light3D(vec3(), 5, RED, 3);
    assert.equal(plain.intensity, 1);
    assert.equal(bright.intensity, 3);
    assert.throws(()=> new Light3D(vec3(), 5, RED, -1)); // 0 is off, below that is a mistake
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('a point light with no radius is off, only a directional light carries the direction marker', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const off = new Light3D(vec3(), 5, RED);
    off.radius = 0; // the other off switch, alpha 0 is the first
    const sun = new DirectionalLight3D(vec3(0, 1, 0), WHITE);
    render3D.camera.pos = vec3(0, 0, 10); render3D.updateMatrices(1);
    assert.equal(off.directional, false);
    assert.ok(sun.directional);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('a solid object collides as its size3D box, or as a sphere when it asks to', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;

    // two boxes overlapping most on X are pushed apart along X, the shallowest way out
    const a = new EngineObject3D(vec3()), b = new EngineObject3D(vec3(.6, .1, 0));
    a.setCollision(); b.setCollision();
    engineObjectsUpdate();
    a.pos3D = vec3(); b.pos3D = vec3(.6, .1, 0);
    a.size3D = b.size3D = vec3(1, 2, 1);
    b.mass = 1; // only b moves
    b.updatePhysics();
    near(b.pos3D.x, 1); near(b.pos3D.y, .1);

    // the same pair as balls slides along the line between the centers instead
    a.collideAsSphere3D = b.collideAsSphere3D = true;
    b.pos3D = vec3(.6, .1, 0);
    b.updatePhysics();
    assert.ok(b.pos3D.x > .6 && b.pos3D.y > .1, 'a sphere is pushed along the center line');

    // a sphere against a box takes them apart by the sphere's radius plus the box's half size
    b.collideAsSphere3D = false;
    a.size3D = b.size3D = vec3(1); // a is a sphere of radius .5, b a 1 unit box
    a.pos3D = vec3(); b.pos3D = vec3(.6, 0, 0);
    b.updatePhysics();
    near(b.pos3D.x, 1);

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('resting on two solids at once is one push, not both added up', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;

    // a floor of two blocks with their tops at y = 0 and the seam at x = 0
    for (const x of [-1, 1])
    {
        const block = new EngineObject3D(vec3(x, -1, 0));
        block.size3D = vec3(2);
        block.setCollision();
    }

    // a ball straddling the seam, sunk .1 in, touches both blocks in the same update
    const ball = new EngineObject3D(vec3(0, .4, 0));
    ball.size3D = vec3(1);
    ball.collideAsSphere3D = true;
    ball.mass = 1;
    ball.setCollision();
    engineObjectsUpdate();
    near(ball.pos3D.y, .5, 'lifted to the floor once, not lifted twice for going over a seam');

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('terrain raycast lands on the surface from either side', () =>
{
    // a ramp rising along Z from 0 to 10, two rows so each column runs the full slope
    const terrain = new HeightMap([[0, 0], [1, 1]], vec2(10, 10), 10);
    // the search halves a half cell step 16 times, so it lands within about 1e-4 here
    const onSurface = (t, ray, msg)=>
    {
        assert.ok(t !== undefined, msg + ': expected a hit');
        const p = ray.getPosition(t);
        const off = Math.abs(p.y - terrain.getHeight(p.x, p.z));
        assert.ok(off < 1e-3, msg + ': the hit is ' + off + ' off the surface');
    };

    // straight down onto the middle of the ramp
    const down = new Ray3D(vec3(0, 20, 0), vec3(0, -1, 0));
    onSurface(terrain.raycast(down), down, 'from above');
    assert.ok(Math.abs(terrain.raycast(down) - 15) < 1e-3, 'the middle of the ramp is at height 5');

    // straight up from under the ground, which used to return where the ray met the
    // bounding box rather than where it breaks through the surface
    const up = new Ray3D(vec3(0, -20, 0), vec3(0, 1, 0));
    onSurface(terrain.raycast(up), up, 'from below');

    // and a shallow ray that comes in from outside and under the terrain
    const across = new Ray3D(vec3(-30, -5, -2), vec3(1, .4, .1).normalize());
    const t = terrain.raycast(across);
    if (t !== undefined)
        onSurface(t, across, 'from outside and below');

    // a ray that never reaches the terrain is still a miss
    assert.equal(terrain.raycast(new Ray3D(vec3(0, 20, 0), vec3(0, 1, 0))), undefined, 'pointing away');
    assert.equal(terrain.raycast(new Ray3D(vec3(100, 20, 100), vec3(0, -1, 0))), undefined, 'off the map');
});

test('particles and trails take a whole texture too, kept as the tile that covers it', () =>
{
    // both hand their tileInfo to EngineObject3D, which is where a TextureInfo becomes a TileInfo
    const texture = new TextureInfo({width: 64, height: 32});
    const emitter = new ParticleEmitter3D(vec3(), 0, 0, 0, PI, texture);
    const trail = new Trail3D(vec3(), 1, .2, texture);
    for (const o of [emitter, trail])
    {
        assert.ok(o.tileInfo instanceof TileInfo);
        assert.equal(o.tileInfo.textureInfo, texture);
        near(o.tileInfo.size.x, 64); near(o.tileInfo.size.y, 32);
    }
    emitter.destroy(true); trail.destroy(true);
});

test('a whole texture is kept as the tile that covers it, so a 3D object is still an EngineObject', () =>
{
    const texture = new TextureInfo({width: 64, height: 32});
    const o = new EngineObject3D(vec3(), buildBox(), texture);

    // the 2D class declares tileInfo as a TileInfo, and TypeScript will not accept a 3D
    // object anywhere an EngineObject goes if this class widens it
    assert.ok(o.tileInfo instanceof TileInfo, 'stored as a TileInfo, not as the TextureInfo');
    assert.equal(o.tileInfo.textureInfo, texture);
    near(o.tileInfo.pos.x, 0); near(o.tileInfo.pos.y, 0);
    near(o.tileInfo.size.x, 64); near(o.tileInfo.size.y, 32); // the whole image
    assert.equal(o.tileInfo.bleed, 0, 'no bleed, there are no neighbors to trim away from');
    assert.equal(o.tileInfo.padding, 0);

    // a TileInfo is left exactly as it was passed
    const tileInfo = new TileInfo(vec2(), vec2(16), texture);
    const tiled = new EngineObject3D(vec3(), buildBox(), tileInfo);
    assert.equal(tiled.tileInfo, tileInfo);

    o.destroy(); tiled.destroy();
    for (const obj of engineObjects) obj.destroy();
    engineObjects.length = 0;
});

test('a child takes no part in solid collision, the same rule as in 2D', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;

    // a body turned a quarter turn, so its local axes are not the world's
    const body = new EngineObject3D(vec3(5, 0, 0));
    body.rotation3D = vec3(0, PI/2, 0);
    const part = new EngineObject3D(vec3());
    part.size3D = vec3(1);
    part.mass = 1;
    part.setCollision();
    body.addChild(part);

    // a wall the part overlaps; pushing the part would move it in the body's space, not the world's
    const wall = new EngineObject3D(vec3(5.6, 0, 0));
    wall.size3D = vec3(1);
    wall.setCollision();
    engineObjectsUpdate();
    nearVec(part.pos3D, 0, 0, 0); // the child stays where its parent put it
    nearVec(wall.pos3D, 5.6, 0, 0); // and is no obstacle of its own

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('collideWithObject hears about a 3D touch and can take it over', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const heard = [];
    class Solid extends EngineObject3D
    {
        collideWithObject(object, push)
        {
            heard.push([this.name, object.name, Math.round(push.x*100)/100]);
            return this.resolve;
        }
    }
    const a = new Solid(vec3()), b = new Solid(vec3(.6, 0, 0));
    a.name = 'a', b.name = 'b';
    a.setCollision(); b.setCollision();
    a.resolve = b.resolve = true;
    engineObjectsUpdate();
    a.pos3D = vec3(); b.pos3D = vec3(.6, 0, 0);
    heard.length = 0;
    b.mass = 1;
    b.updatePhysics();
    assert.deepEqual(heard, [['b', 'a', .4], ['a', 'b', -.4]], 'both are asked, each with its own push');
    near(b.pos3D.x, 1);

    // either one saying no leaves them where they are
    for (const refuser of [a, b])
    {
        heard.length = 0;
        refuser.resolve = false;
        b.pos3D = vec3(.6, 0, 0);
        b.updatePhysics();
        near(b.pos3D.x, .6);
        assert.equal(heard.length, 2, 'both still hear about it');
        refuser.resolve = true;
    }
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('setCollision on a 3D object skips the 2D only flags', () =>
{
    const o = new EngineObject3D(vec3());
    o.setCollision();
    assert.equal(o.collideSolidObjects, true);
    assert.equal(o.isSolid, true);
    assert.equal(o.collideTiles, false, 'tile collision is 2D, it needs sync2D');
    assert.equal(o.collideRaycast, false, 'raycasts are 2D, 3D picking is render3D.pick');
    o.destroy();
});

test('two objects that both have isSolid off pass through each other', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const a = new EngineObject3D(vec3()), b = new EngineObject3D(vec3(.6, 0, 0));
    a.setCollision(true, false); b.setCollision(true, false); // collide with solids, block nothing
    engineObjectsUpdate();
    b.mass = 1;

    // neither blocks, so nothing happens
    b.pos3D = vec3(.6, 0, 0);
    b.updatePhysics();
    near(b.pos3D.x, .6);

    // one of them blocking is enough, whichever one it is
    for (const solid of [a, b])
    {
        solid.isSolid = true;
        b.pos3D = vec3(.6, 0, 0);
        b.updatePhysics();
        near(b.pos3D.x, 1);
        solid.isSolid = false;
    }
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('a 3D object is not a phantom obstacle for 2D solid collision', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;

    // both kinds share the solid flags now, so both land in the engine's solid list;
    // a 3D object's 2D size is zero, and a box with no size blocks nothing
    const flat = new EngineObject(vec2(2, 0), vec2(1, 1));
    flat.setCollision();
    flat.mass = 1;
    flat.velocity = vec2(-.5, 0);
    const solid3D = new EngineObject3D(vec3());
    solid3D.setCollision();
    assert.equal(solid3D.size.x, 0, 'a 3D object has no 2D size');

    engineObjectsUpdate();
    for (let i = 0; i < 4; ++i)
        engineObjectsUpdate();
    assert.ok(flat.pos.x < -.4, `the 2D object should sail past the origin, stopped at ${flat.pos.x}`);
    assert.equal(flat.velocity.x, -.5, 'and keep its velocity');

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('a mesh from a lost context is let go instead of deleted', () =>
{
    // dispose only deletes a buffer the current context owns; the new context refuses the old ones
    const mesh = buildBox();
    mesh.buffer = {}; // stand in for a WebGLBuffer, headless has no real one
    mesh.bufferCount = 4;
    mesh.contextGeneration = render3D.contextGeneration - 1; // uploaded before a context loss
    assert.doesNotThrow(()=> mesh.dispose());
    assert.equal(mesh.buffer, undefined, 'the stale buffer is dropped either way');
    assert.equal(mesh.bufferCount, 0);
});

test('setMesh frees the mesh it replaces, unless something else is still drawing it', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const a = new EngineObject3D(vec3()), b = new EngineObject3D(vec3());
    const first = buildBox(), second = buildBox(), shared = buildBox();
    for (const m of [first, second, shared]) // stand in for uploaded meshes, headless has no GL
        m.buffer = {}, m.bufferCount = 4, m.contextGeneration = render3D.contextGeneration;

    // a mesh only this object draws is let go
    a.setMesh(first);
    assert.equal(a.setMesh(second), second, 'returns the mesh it was given');
    assert.equal(first.buffer, undefined, 'the mesh it replaced was freed');
    assert.equal(a.mesh, second);

    // a mesh another object still draws is left alone
    a.setMesh(shared);
    b.mesh = shared;
    a.setMesh(undefined);
    assert.ok(shared.buffer, 'b is still drawing it, so it keeps its buffer');
    assert.equal(a.mesh, undefined);

    // and setting the same mesh again is not a reason to free it
    b.setMesh(shared);
    assert.ok(shared.buffer);

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('a height map with no size says so instead of failing later', () =>
{
    // every lookup divides by the size, so a zero one turns into NaN and an unreadable crash
    assert.throws(()=> new HeightMap([[0,1],[1,0]], vec2(), 1));
    assert.doesNotThrow(()=> new HeightMap([[0,1],[1,0]], vec2(4), 1));
});

test('height map lookups take a position as well as two numbers', () =>
{
    const heights = [[0, .5], [.5, 1]];
    const colors = [[RED, WHITE], [WHITE, RED]];
    const map = new HeightMap(heights, vec2(10), 4, colors);
    for (const [x, z] of [[0, 0], [-3, 2], [4.5, -4.5], [-5, 5]])
    {
        near(map.getHeight(vec3(x, 99, z)), map.getHeight(x, z), 'height ignores the y it is handed');
        const a = map.getNormal(vec3(x, 99, z)), b = map.getNormal(x, z);
        nearVec(a, b.x, b.y, b.z);
        assert.equal(map.getColor(vec3(x, 99, z)).rgbaInt(), map.getColor(x, z).rgbaInt());
    }
});

test('engineObjectsRaycast3D returns everything along the ray, nearest first', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const front = new EngineObject3D(vec3(0, 0, -5), buildBox());
    const back = new EngineObject3D(vec3(0, 0, -20), buildBox());
    const aside = new EngineObject3D(vec3(50, 0, -10), buildBox());
    const ray = new Ray3D(vec3(), vec3(0, 0, -1));

    const hits = engineObjectsRaycast3D(ray);
    assert.deepEqual(hits, [front, back], 'both along the ray, nearest first, and not the one off to the side');
    assert.deepEqual(engineObjectsRaycast3D(ray, [back, aside]), [back], 'only looks at the objects it is given');
    assert.deepEqual(engineObjectsRaycast3D(new Ray3D(vec3(), vec3(0, 1, 0))), [], 'a miss is an empty list');

    // pick is the nearest of the same set, with the distance to it
    const picked = render3D.pick(ray);
    assert.equal(picked.object, front);
    assert.ok(picked.distance > 4 && picked.distance < 5, 'the near side of a unit box 5 away');
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('pick takes a screen position as well as a ray', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    render3D.camera.pos = vec3();
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);

    // a shape around the camera is hit by any ray, so neither road can miss it by accident
    const around = new EngineObject3D(vec3(), buildBox(100));
    const screen = vec2(123, 45);
    assert.equal(render3D.pick(screen)?.object, around, 'a screen position picks');
    assert.equal(render3D.pick(render3D.screenToRay(screen))?.object, around, 'and so does the ray it makes');

    around.destroy();
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('setColor reaches a mesh built by hand, which has no colors yet', () =>
{
    // a mesh assembled by pushing points has empty uvs and colors, upload fills them in with
    // defaults, so setColor mapping over its own colors would have had nothing to map over
    const hand = new Mesh;
    hand.points.push(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0));
    hand.setColor(RED);
    assert.equal(hand.colors.length, hand.points.length);
    assert.equal(hand.colors[0], RED);

    const built = buildBox().setColor(RED);
    assert.equal(built.colors.length, built.points.length);
    assert.equal(built.colors[0], RED);
});

test('center and fit work on a mesh built by hand, which has no normals yet', () =>
{
    // the docs send a loaded or hand built model through center and fit, and both go through
    // transform, which used to reach into an empty normals array and die on the first vertex
    const hand = new Mesh;
    hand.points.push(vec3(2, 0, 0), vec3(4, 0, 0), vec3(2, 2, 0), vec3(4, 2, 0));
    hand.center();
    nearVec(hand.getBounds().min, -1, -1, 0);
    nearVec(hand.getBounds().max, 1, 1, 0);
    hand.fit(4);
    nearVec(hand.getBounds().max, 2, 2, 0);
    assert.equal(hand.normals.length, 0, 'nothing to turn, so no normals were invented');

    // and once it has normals they are still carried through the turn
    const turned = buildBox().transform(Matrix4.rotation(vec3(0, PI/2, 0)));
    assert.ok(turned.normals.every(n => Math.abs(n.length() - 1) < 1e-5));
    assert.ok(turned.normals.some(n => n.x > .99), 'a face that pointed along +Z now points along +X');
});

test('combine takes a position on its own, the same as a matrix that only moves', () =>
{
    // most parts of a built model only need moving into place, so a Vector3 stands in for buildMatrix(pos)
    const byPos = new Mesh().combine(buildBox(), vec3(1, 2, 3), RED);
    const byMatrix = new Mesh().combine(buildBox(), buildMatrix(vec3(1, 2, 3)), RED);
    assert.equal(byPos.points.length, byMatrix.points.length);
    byPos.points.forEach((p, i)=> assert.ok(p.distance(byMatrix.points[i]) < 1e-9));
    byPos.normals.forEach((n, i)=> assert.ok(n.distance(byMatrix.normals[i]) < 1e-9));
    nearVec(byPos.getBounds().min, .5, 1.5, 2.5);
    assert.equal(byPos.colors[0].g, 0, 'the color still tints what is added');

    // anything else is a mistake worth hearing about, rather than a crash on .m
    assert.throws(()=> new Mesh().combine(buildBox(), vec2(1, 2)));
});

test('drawMesh, render and transform take a position too, like combine', () =>
{
    // transform moves the mesh by it
    const moved = buildBox().transform(vec3(1, 2, 3));
    nearVec(moved.getBounds().min, .5, 1.5, 2.5);
    assert.throws(()=> buildBox().transform(vec2(1, 2)));

    // drawing a mesh at a position is the same draw as at buildMatrix of it; a bake records
    // the draw, so the two can be compared without a GL context
    const box = buildBox();
    const atPos = render3D.bake(()=> render3D.drawMesh(box, vec3(4, 0, 0)));
    const atMatrix = render3D.bake(()=> render3D.drawMesh(box, buildMatrix(vec3(4, 0, 0))));
    atPos.points.forEach((p, i)=> assert.ok(p.distance(atMatrix.points[i]) < 1e-9));
    const rendered = render3D.bake(()=> box.render(vec3(4, 0, 0)));
    rendered.points.forEach((p, i)=> assert.ok(p.distance(atMatrix.points[i]) < 1e-9));
    assert.throws(()=> render3D.bake(()=> render3D.drawMesh(box, vec2(4, 0))));
});

test('buildCapsule catches a capsule shorter than it is wide', () =>
{
    // the two rounded ends alone are already the size tall, so a shorter one comes out a sphere
    // of the full size, quietly taller than the height that was asked for
    assert.throws(()=> buildCapsule(2, 1));
    assert.throws(()=> buildCapsule(1, .99));
    const equal = buildCapsule(1, 1, 8, 2, false); // exactly the size is a sphere on purpose
    near(equal.getBounds().max.y, .5);
    near(buildCapsule(1, 3, 8, 2, false).getBounds().max.y, 1.5);
});

test('buildLoft catches stations listed the wrong way round, which builds the hull inside out', () =>
{
    const noseFirst = [[1, .4, .2, -.1], [0, 2, .5, -.4], [-1, 1, .3, -.3]];
    const hull = buildLoft(noseFirst);
    assert.ok(hull.points.length > 0);

    // every real triangle of a nose first hull faces away from the middle
    const facing = (mesh)=>
    {
        let out = 0, inward = 0;
        const p = mesh.points;
        for (let i = 0; i + 2 < p.length; ++i)
        {
            const n = p[i+1].subtract(p[i]).cross(p[i+2].subtract(p[i]));
            if (!n.lengthSquared()) continue; // a flat joiner between strips
            const center = p[i].add(p[i+1]).add(p[i+2]).scale(1/3);
            n.normalize(i & 1 ? 1 : -1).dot(center) > 0 ? ++out : ++inward;
        }
        return {out, inward};
    };
    const {out, inward} = facing(hull);
    assert.ok(out > 0 && !inward, `every face points out, got ${out} out and ${inward} in`);
    assert.throws(()=> buildLoft([...noseFirst].reverse()));
});

test('an opaque object that sets a color alpha is told the alpha does nothing', () =>
{
    // the shader writes alpha 1 for an opaque draw, so a fade with no flag is invisible work
    const o = new EngineObject3D(vec3(), buildBox());
    o.color = rgb(1, 0, 0, .5);
    assert.throws(()=> o.render3D()); // ASSERT throws a bare Error, the reason goes to the console
    o.transparent = true;
    o.render3D(); // the flag makes it legal
    o.transparent = false;
    o.additive = true;
    o.render3D(); // and so does additive
    o.additive = false;
    o.color = rgb(1, 0, 0);
    o.render3D(); // as does a solid color

    // a light is not drawn, and its alpha is its brightness, so it is none of this
    const light = new Light3D(vec3(), 5, rgb(1, 1, 1, .25));
    light.render3D();
    for (const x of [o, light]) x.destroy();
    for (const x of engineObjects) x.destroy();
    engineObjects.length = 0;
});

test('a mesh built by hand renders without normals, the way it already did without uvs and colors', () =>
{
    const hand = new Mesh;
    hand.points.push(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(0, 0, 1));
    assert.equal(hand.normals.length, 0);
    const combined = new Mesh().combine(hand);
    assert.equal(combined.normals.length, hand.points.length);
    assert.ok(combined.normals.every(isVector3));
    // computeNormals is still the way to get real ones
    assert.equal(hand.computeNormals().normals.length, hand.points.length);
});

test('parseOBJ says which line has a face index the file does not have', () =>
{
    const good = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
    assert.ok(parseOBJ(good).points.length > 0);
    assert.throws(()=> parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n'));
    assert.throws(()=> parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 -9\n'));
    // a negative index counts back from the end, which is legal
    assert.ok(parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n').points.length > 0);
});

test('a sync2D object is told its solid collision needs the 2D size too', () =>
{
    // sync2D hands physics back to the 2D solver, which measures size, not size3D
    const o = new EngineObject3D(vec3());
    o.size3D = vec3(1);
    o.mass = 1;
    o.setCollision();
    o.updatePhysics(); // fine while it drives itself in 3D
    o.sync2D = true;
    assert.throws(()=> o.updatePhysics());
    o.size = vec2(1);
    o.updatePhysics(); // and fine again once the 2D box is there
    o.destroy();
    for (const x of engineObjects) x.destroy();
    engineObjects.length = 0;
});

test('worldToScreen and screenToRay are opposites, on the main canvas or any other', () =>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const canvas = vec2(1280, 720);
    render3D.camera.orthographic = 0;
    render3D.camera.pos = vec3(3, 4, 12);
    render3D.camera.rotation = vec3(-.2, .3, .1);
    render3D.updateMatrices(canvas.x / canvas.y);

    // a point in front of the camera, projected then unprojected through the same canvas
    for (const target of [vec3(0, 0, 0), vec3(-4, 2, -3), vec3(5, -1, 4)])
    {
        const screen = render3D.worldToScreen(target, canvas);
        assert.ok(screen, 'the point should be in front of the camera');
        const ray = render3D.screenToRay(screen, canvas);
        // the target must lie on that ray
        const toTarget = target.subtract(ray.origin);
        const along = toTarget.dot(ray.direction) / ray.direction.lengthSquared();
        const off = toTarget.subtract(ray.direction.scale(along)).length();
        assert.ok(off < 1e-3, `ray misses the point it came from by ${off}`);
        assert.ok(along > 0, 'and the point is in front of the ray start');
    }

    // the canvas only scales the pixels, so twice the canvas is twice the coordinates
    const big = render3D.worldToScreen(vec3(1, 1, 0), canvas.scale(2));
    const small = render3D.worldToScreen(vec3(1, 1, 0), canvas);
    near(big.x, small.x * 2);
    near(big.y, small.y * 2);
});
