/**
 * LittleJS 3D Rendering Plugin
 * - Adds a 3D scene that draws into the same WebGL canvas as the 2D game
 * - Call new Render3DPlugin() in gameInit, then move render3D.camera and make EngineObject3D objects
 * - EngineObject3D is an EngineObject with a 3D position, rotation and mesh
 * - The 3D scene draws under the 2D sprites, so HUD and text land on top
 * - Lighting is the sun plus ambient, with optional extra lights, fog and shadows
 * - Any object or draw can bring its own Shader, a mainImage snippet the lighting then applies to, and a
 *   mainNormal in it bends the normal the lighting uses
 * - Meshes and the basic builders are in render3dMesh.js, EngineObject3D, instancing and lights in
 *   render3dObject.js, both right after this one; the other builders, terrain, particles, camera controls and the
 *   OBJ loader are in the Render3D Extras plugin, which goes after those
 * - Requires the Math3D plugin
 * @namespace Render3D
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global Render3D plugin object
 *  @type {Render3DPlugin}
 *  @memberof Render3D */
let render3D;

// vertex format: position xyz, normal xyz, uv, rgba bytes
const RENDER3D_VERTEX_FLOATS = 9;
const RENDER3D_VERTEX_BYTES = RENDER3D_VERTEX_FLOATS * 4;

// per draw values the shaders read as vertex attributes: the model matrix columns (4-7), the tint (11) and the
// uv rect (12); constants for one draw, one per instance for a batch; the shader derives the normal matrix
const RENDER3D_INSTANCE_FLOATS = 24;
const RENDER3D_INSTANCE_BYTES = RENDER3D_INSTANCE_FLOATS * 4;
// an InstancedMesh3D keeps them apart: 16 floats of matrix, and 8 of tint and uv rect uploaded only when they change
const RENDER3D_MATRIX_FLOATS = 16;
const RENDER3D_COLOR_FLOATS = 8;
const RENDER3D_INSTANCE_ATTRIBS = [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 4, 48], [11, 4, 64], [12, 4, 80]];
const RENDER3D_VERTEX_INPUTS =
    'layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 t;layout(location=3) in vec4 c;' +
    'layout(location=4) in vec4 m0;layout(location=5) in vec4 m1;layout(location=6) in vec4 m2;layout(location=7) in vec4 m3;' +
    'layout(location=11) in vec4 tint;layout(location=12) in vec4 uvRect;';
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_MAX_LIGHTS = 8; // Light3D objects per frame, the shader loops over this many
// strip order, frozen, and typed as the plain array the uv parameters take
const RENDER3D_QUAD_UVS = /** @type {Array<Vector2>} */
    (Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv))));
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(hsl(0, 0, 0, .5));
const RENDER3D_IDENTITY = new Matrix4; // never modified
let render3DShadowCut; // the cut last sent to the shadow shader, see render3DSetDrawUniforms
///////////////////////////////////////////////////////////////////////////////
// Private helpers

// outward normal of a triangle or a quad given its corners in loop order,
// from the diagonals so a collapsed corner still works
function render3DFaceNormal(a, b, c, d=a)
{
    const n = c.subtract(a).cross(d.subtract(b));
    return n.lengthSquared() ? n.normalize() : RENDER3D_DEFAULT_NORMAL;
}

// a quad's corners in loop order as a strip, the one place that knows the order
function render3DQuadStrip(a, b, c, d) { return [a, b, d, c]; }

// per corner values (colors, uvs) into strip order, a single value passes through
function render3DQuadValues(v) { return isArray(v) ? render3DQuadStrip(...v) : v; }

// 3D draws are only valid during the pass with a live shader
function render3DCanDraw()
{
    if (!render3D.program) return false;
    ASSERT(render3D.isRendering,
        '3D draws are only valid during the 3D pass, draw from an EngineObject3D or render3D.onRenderOpaque');
    return render3D.isRendering;
}

// the draw state fields a batch is drawn under; lights and fog are not captured, they are read live at flush
// each is an accessor on the plugin over render3D.drawState, and a real change moves render3D.stateVersion, so a
// batch checks that one number at each draw while the state holds; the three functions below write the fields out
// by hand for speed, so a new field goes in all four, in drawState and gets an accessor; emissiveMapColor is
// compared by its rgb, so two objects with equal colors batch
/** The draw state's values, behind render3D's accessors, and the rgb emissiveMapColor had when it was set
 *  @typedef {Object} Render3DDrawState
 *  @property {boolean} blend
 *  @property {boolean} additive
 *  @property {boolean} depthTest
 *  @property {boolean} depthWrite
 *  @property {boolean} cullBackFaces
 *  @property {boolean} mirrored
 *  @property {boolean} lighting
 *  @property {number} emissive
 *  @property {boolean} receiveShadow
 *  @property {number} specular
 *  @property {boolean} pixelated
 *  @property {Shader|undefined} shader
 *  @property {TextureInfo|undefined} normalMap
 *  @property {number} normalScale
 *  @property {number} shininess
 *  @property {number} reflectivity
 *  @property {TextureInfo|undefined} emissiveMap
 *  @property {Color} emissiveMapColor
 *  @property {CubeMap|undefined} environmentMap
 *  @property {number} emissiveR
 *  @property {number} emissiveG
 *  @property {number} emissiveB
 *  @memberof Render3D */
const RENDER3D_STATE_FIELDS = ['blend', 'additive', 'depthTest', 'depthWrite', 'cullBackFaces', 'mirrored', 'lighting',
    'emissive', 'receiveShadow', 'specular', 'pixelated', 'shader', 'normalMap', 'normalScale', 'shininess',
    'reflectivity', 'emissiveMap', 'emissiveMapColor', 'environmentMap'];

// a copy of the draw state in one fixed shape, the fields of RENDER3D_STATE_FIELDS written out, and the version
// it was taken at
function render3DCaptureBatchState()
{
    const r = render3D, d = r.drawState;
    return {blend: d.blend, additive: d.additive, depthTest: d.depthTest, depthWrite: d.depthWrite,
        cullBackFaces: d.cullBackFaces, mirrored: d.mirrored, lighting: d.lighting, emissive: d.emissive,
        receiveShadow: d.receiveShadow, specular: d.specular, pixelated: d.pixelated, shader: d.shader,
        normalMap: d.normalMap, normalScale: d.normalScale, shininess: d.shininess, reflectivity: d.reflectivity,
        emissiveMap: d.emissiveMap, emissiveMapColor: (d.emissiveMapColor || WHITE).copy(), // the caller may change it
        environmentMap: d.environmentMap, version: r.stateVersion};
}

// put a captured draw state back, written out the same way; the transparent stage does this for every queued draw
function render3DApplyBatchState(s)
{
    const r = render3D;
    r.blend = s.blend, r.additive = s.additive, r.depthTest = s.depthTest, r.depthWrite = s.depthWrite,
    r.cullBackFaces = s.cullBackFaces, r.mirrored = s.mirrored, r.lighting = s.lighting, r.emissive = s.emissive,
    r.receiveShadow = s.receiveShadow, r.specular = s.specular, r.pixelated = s.pixelated, r.shader = s.shader,
    r.normalMap = s.normalMap, r.normalScale = s.normalScale, r.shininess = s.shininess,
    r.reflectivity = s.reflectivity, r.emissiveMap = s.emissiveMap, r.emissiveMapColor = s.emissiveMapColor,
    r.environmentMap = s.environmentMap;
}

// true when the current draw state differs from a captured one, so a pending batch must flush first; it runs for
// every instance drawn, so while nothing was set since the capture it checks the version alone
function render3DStateChanged(s)
{
    const r = render3D;
    if (s.version === r.stateVersion) return false;
    const d = r.drawState, c = s.emissiveMapColor;
    if (d.blend !== s.blend || d.additive !== s.additive || d.depthTest !== s.depthTest
        || d.depthWrite !== s.depthWrite || d.cullBackFaces !== s.cullBackFaces || d.mirrored !== s.mirrored
        || d.lighting !== s.lighting || d.emissive !== s.emissive || d.receiveShadow !== s.receiveShadow
        || d.specular !== s.specular || d.pixelated !== s.pixelated || d.shader !== s.shader
        || d.normalMap !== s.normalMap || d.normalScale !== s.normalScale || d.shininess !== s.shininess
        || d.reflectivity !== s.reflectivity || d.emissiveMap !== s.emissiveMap
        || d.environmentMap !== s.environmentMap || d.emissiveR !== c.r || d.emissiveG !== c.g || d.emissiveB !== c.b)
        return true;
    s.version = r.stateVersion; // set and set back to what it was: the batch goes on, checking the version again
    return false;
}

// whether a sphere is inside the view, or the shadow map's box during the shadow pass, without a vector
function render3DSphereVisible(x, y, z, radius)
{
    const planes = render3D.shadowPass && !render3D.depthPass ? render3D.shadowPlanes : render3D.frustumPlanes;
    for (let i = 0; i < planes.length; ++i)
    {
        const p = planes[i];
        if (p[0]*x + p[1]*y + p[2]*z + p[3] < -radius)
            return false;
    }
    return true;
}

// run a function with some draw state fields overridden, restored afterward even on a throw
function render3DWithState(fields, fn)
{
    const r = render3D, saved = {};
    for (const key in fields)
        saved[key] = r[key], r[key] = fields[key];
    try { return fn(); }
    finally { Object.assign(r, saved); }
}

// which side of the 2D scene an object draws on, its own flag or the plugin default
function render3DIsAfter2D(o)
{ return !!((o.drawOwner ? render3DSetting(o, 'renderAfter2D') : o.renderAfter2D) ?? render3D.renderAfter2D); }

// a size given as a number or a vec3
/** @param {Vector3|number} size
 *  @return {Vector3} */
function render3DSize3(size)
{ return isNumber(size) ? vec3(/** @type {number} */ (size)) : /** @type {Vector3} */ (size); }

// a size given as a number or a vec2
/** @param {Vector2|number} size
 *  @return {Vector2} */
function render3DSize2(size)
{ return isNumber(size) ? vec2(/** @type {number} */ (size)) : /** @type {Vector2} */ (size); }

// a transform given as a matrix, or as a vec3 for one that only moves there
/** @param {Matrix4|Vector3} matrix
 *  @return {Matrix4} */
function render3DMatrix(matrix)
{
    if (matrix instanceof Vector3)
        return buildMatrix(matrix);
    ASSERT(matrix instanceof Matrix4, 'takes a Matrix4, or a Vector3 for a position');
    return matrix;
}

// the matrix that keeps normals pointing out when an object is scaled unevenly
function render3DNormalMatrix(matrix) { return matrix.copy().invert().transpose(); }

// whether a matrix mirrors, its determinant negative, so what it moves reads the other way round
function render3DMirrors(matrix) { return matrix.determinant() < 0; }


// a column of a matrix as a direction: 0 is the right axis, 4 up, 8 back
function render3DAxis(m, i) { return vec3(m[i], m[i+1], m[i+2]); }

// a matrix turning by angle around a unit axis through the origin, counter clockwise when the axis points at you
function render3DAxisRotation(axis, angle)
{
    const x = vec3(1, 0, 0).rotate(axis, angle), y = vec3(0, 1, 0).rotate(axis, angle), z = vec3(0, 0, 1).rotate(axis, angle);
    return new Matrix4([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]);
}

// the largest axis scale of a matrix, how much it grows a bounding sphere
function render3DMaxScale(m)
{
    return max(m[0]*m[0] + m[1]*m[1] + m[2]*m[2], m[4]*m[4] + m[5]*m[5] + m[6]*m[6], m[8]*m[8] + m[9]*m[9] + m[10]*m[10]) ** .5;
}

// how far a matrix at offset k can move a point that is one unit from its origin, for a bounding sphere: the
// longest axis when the axes are square to each other, more when they are not, as a turned child under a parent
// scaled on one axis leaves them; the axes' dot products bound the largest stretch by their largest row sum
function render3DMaxStretch(m, k=0) { return render3DMaxStretchSquared(m, k) ** .5; }

// the same, squared, for bounds that grow many times before they are read
function render3DMaxStretchSquared(m, k=0)
{
    const xx = m[k]*m[k] + m[k+1]*m[k+1] + m[k+2]*m[k+2];
    const yy = m[k+4]*m[k+4] + m[k+5]*m[k+5] + m[k+6]*m[k+6];
    const zz = m[k+8]*m[k+8] + m[k+9]*m[k+9] + m[k+10]*m[k+10];
    const xy = abs(m[k]*m[k+4] + m[k+1]*m[k+5] + m[k+2]*m[k+6]);
    const xz = abs(m[k]*m[k+8] + m[k+1]*m[k+9] + m[k+2]*m[k+10]);
    const yz = abs(m[k+4]*m[k+8] + m[k+5]*m[k+9] + m[k+6]*m[k+10]);
    return max(xx + xy + xz, yy + xy + yz, zz + xz + yz);
}

// a quad as a strip from its center and half axes, the same corner order as render3DQuadStrip
function render3DQuadAxes(center, right, up)
{
    return [center.subtract(right).add(up), center.subtract(right).subtract(up),
        center.add(right).add(up), center.add(right).subtract(up)];
}

// set the draw state for an object's render3D, or the defaults for the stage callbacks
function render3DSetObjectState(o)
{
    const r = render3D;
    const transparent = o?.transparent;
    const p = o?.drawOwner ? render3DPartSettings(o) : o; // a part draws with its owner's settings
    const emissive = p?.emissive || 0;
    ASSERT(isNumber(emissive) && emissive >= 0, 'emissive must be a number, 0 or more', emissive);
    r.lighting = true;
    r.emissive = emissive;
    r.additive = !!p?.additive;
    r.specular = p?.specular || 0;
    const shininess = p?.shininess ?? 16, reflectivity = p?.reflectivity || 0;
    ASSERT(isNumber(shininess) && shininess > 0, 'shininess must be a number above 0', shininess);
    ASSERT(isNumber(reflectivity) && reflectivity >= 0 && reflectivity <= 1, 'reflectivity must be 0 to 1', reflectivity);
    r.shininess = shininess;
    r.reflectivity = reflectivity;
    r.normalMap = p?.normalMap || undefined;
    r.normalScale = p?.normalScale ?? 1;
    r.emissiveMap = p?.emissiveMap || undefined;
    r.emissiveMapColor = p?.emissiveMapColor || WHITE;
    ASSERT(!p?.environment || p.environment instanceof CubeMap, 'environment must be a CubeMap');
    r.environmentMap = p?.environment || undefined;
    r.receiveShadow = !p || p.receiveShadow;
    r.cullBackFaces = r.mirrored = false; // each mesh sets these as it draws
    r.pixelated = !!p?.pixelated;
    ASSERT(!p?.shader || p.shader instanceof Shader, 'shader must be a Shader, not the snippet itself');
    r.shader = p?.shader || undefined; // null is no shader too, so it batches with none
    r.depthTest = true;
    if (r.shadowPass)
        r.blend = !!transparent; // the depth shader cuts a see through caster by the alpha it would blend with
}

// draw objects each with the draw state set from its own flags, then reset to the defaults
function render3DDrawObjects(objects)
{
    for (const o of objects)
    {
        render3DSetObjectState(o);
        o.render3D();
    }
    render3DSetObjectState();
}

// add a draw of a mesh to its batch; a batch is one mesh under one texture and draw state, so a change flushes it,
// and under one winding: a mirroring transform, one with a negative determinant, turns it around
function render3DInstance(mesh, matrix, tileInfo, color)
{
    const k = render3DInstanceSlot(mesh, render3DTextureOf(tileInfo), render3DMirrors(matrix)), data = mesh.instanceData;
    data.set(matrix.m, k);
    // the tint; this batch is never blended, so in the shadow pass the depth shader cuts it by its texture alpha
    // alone, a see through caster draws blended instead and is cut by its tint alpha too
    data[k+16] = color.r, data[k+17] = color.g, data[k+18] = color.b, data[k+19] = color.a;
    const uv = render3DGetTileUVs(tileInfo);
    data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
}

// make room for one more instance of a mesh under a texture and the current draw state, flushing a batch that
// differs first, and return where its 24 floats go in mesh.instanceData: the matrix, the tint and the uv rect
// drawMesh passes whether its matrix mirrors, and its batch then culls by the mesh and winds by that at the flush,
// so it never sets the draw state for them, which would move the state's version at every draw; drawBillboard
// passes that its batch is unlit, for the same reason
function render3DInstanceSlot(mesh, textureInfo, mirrored, unlit=false)
{
    const r = render3D;
    if (mesh.instanceCount && (mesh.instanceTextureInfo !== textureInfo || mesh.instanceMirrored !== mirrored
        || mesh.instanceUnlit !== unlit || render3DStateChanged(mesh.instanceState)))
        render3DFlushInstances(mesh);
    if (!mesh.instanceCount)
    {
        mesh.instanceTextureInfo = textureInfo;
        mesh.instanceMirrored = mirrored;
        mesh.instanceUnlit = unlit;
        mesh.instanceState = render3DCaptureBatchState();
        r.instanceMeshes.push(mesh);
    }

    // room for one more, doubling as the batch grows
    const data = mesh.instanceData, k = mesh.instanceCount++ * RENDER3D_INSTANCE_FLOATS;
    if (!data || data.length < k + RENDER3D_INSTANCE_FLOATS)
    {
        const grown = new Float32Array(max(64 * RENDER3D_INSTANCE_FLOATS, data ? data.length * 2 : 0));
        data && grown.set(data);
        mesh.instanceData = grown;
    }
    return k;
}

// draw the pending batches, or just one mesh's, each as a single instanced call
function render3DFlushInstances(only)
{
    const r = render3D, gl = glContext;
    for (const mesh of only ? [only] : r.instanceMeshes)
    {
        const count = mesh.instanceCount;
        mesh.instanceCount = 0;
        if (!count || !mesh.buffer) continue;

        // the per instance values on top of the constant attributes, then the mesh under them
        // a ring of buffers with fresh storage each time, so the driver never waits for a draw still reading one
        const buffers = r.instanceBuffers, buffer = buffers[r.instanceBufferIndex = (r.instanceBufferIndex + 1) % buffers.length];
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.instanceData, gl.DYNAMIC_DRAW, 0, count * RENDER3D_INSTANCE_FLOATS);
        const state = mesh.instanceState;
        if (mesh.instanceMirrored !== undefined) // a drawMesh batch: culled by its mesh, wound by its matrices
            state.cullBackFaces = !mesh.doubleSided, state.mirrored = mesh.instanceMirrored;
        if (mesh.instanceUnlit) // a batch of sprites
            state.lighting = false;
        render3DDrawInstanced(mesh, buffer, count, mesh.instanceTextureInfo, state);
    }
    if (!only)
        r.instanceMeshes.length = 0;
    else
    {
        const i = r.instanceMeshes.indexOf(only);
        i < 0 || r.instanceMeshes.splice(i, 1);
    }
}

// draw a mesh count times from a buffer that holds the per instance values, under a draw state
// the arrays are turned on with their instance divisor for this one call and both are turned off after: a single
// draw reads these slots as constant attributes, and in Firefox a draw that reads a constant through a slot whose
// divisor is set leaves the next batch on that slot reading the wrong values
// colorBuffer holds the tint and uv rect apart from the matrices, as an InstancedMesh3D keeps them
function render3DDrawInstanced(mesh, buffer, count, textureInfo, state, colorBuffer)
{
    const gl = glContext, matrixBytes = RENDER3D_MATRIX_FLOATS * 4;
    for (const [location, size, offset] of RENDER3D_INSTANCE_ATTRIBS)
    {
        const inColors = colorBuffer && offset >= matrixBytes;
        const stride = !colorBuffer ? RENDER3D_INSTANCE_BYTES : inColors ? RENDER3D_COLOR_FLOATS * 4 : matrixBytes;
        gl.bindBuffer(gl.ARRAY_BUFFER, inColors ? colorBuffer : buffer);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, inColors ? offset - matrixBytes : offset);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 1);
    }
    render3DSetDrawUniforms(RENDER3D_IDENTITY, textureInfo, WHITE, RENDER3D_FULL_UV_RECT, state);
    render3DBindMesh(mesh);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.bufferCount, mesh.indexType, 0, count);
    for (const [location] of RENDER3D_INSTANCE_ATTRIBS)
    {
        gl.disableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 0);
    }
    ++drawCount;
    primitiveCount += mesh.bufferCount / 3 * count;
}

// forget the pending batches, for a frame that threw or a lost context
function render3DClearInstances()
{
    for (const mesh of render3D.instanceMeshes)
        mesh.instanceCount = 0;
    render3D.instanceMeshes.length = 0;
}

// the live objects drawn on one side of the 2D scene
function render3DLayerObjects(after2D)
{
    return /** @type {Array<EngineObject3D>} */ (engineObjects.filter(o=>
        !o.destroyed && o instanceof EngineObject3D && render3DIsAfter2D(o) === after2D));
}

// the Light3D objects the shader gets this frame: directional lights light the whole scene so they come first,
// then the point lights nearest the camera
function render3DCollectLights()
{
    // a light switched off by its radius or its alpha is left out, so it cannot take one of the few slots
    const lights = /** @type {Array<Light3D>} */ (engineObjects.filter(o=> !o.destroyed && o instanceof Light3D &&
        o.color.a > 0 && o.intensity > 0 && (o.directional || o.radius > 0)));
    if (lights.length > RENDER3D_MAX_LIGHTS)
    {
        // distances cached once, getWorldPos3D walks the parent chain and the sort asks many times
        const cameraPos = render3D.camera.pos, distances = new Map;
        for (const light of lights)
            distances.set(light, light.directional ? -1 : light.getWorldPos3D().distanceSquared(cameraPos));
        lights.sort((a, b)=> distances.get(a) - distances.get(b));
        // the light that casts the shadows keeps a slot however far it is, in place of the farthest
        const caster = render3DShadowCaster();
        if (caster && lights.indexOf(caster) >= RENDER3D_MAX_LIGHTS)
            lights[RENDER3D_MAX_LIGHTS - 1] = caster;
        lights.length = RENDER3D_MAX_LIGHTS;
    }
    return lights;
}

// the spotlight that casts the shadows in place of the sun: render3D.shadowLight while it is a light that is on
// and has a cone, undefined for the sun
function render3DShadowCaster()
{
    const light = render3D.shadowLight;
    return light && !light.destroyed && !light.directional && light.coneAngle > 0 && light.radius > 0 &&
        light.intensity > 0 && light.color.a > 0 ? light : undefined;
}

// the widest cone a shadow map can look down, to each side; the light that casts the shadows lights no wider, or
// what is past the map's edge would be lit with nothing to shade it
const RENDER3D_SHADOW_CONE_MAX = 1.35;

// a light's cone as the four numbers the shader gets: the way it shines, scaled so that its dot with the way to
// a point, less the fourth number, is 0 at the edge of the cone and 1 where its fade starts; a light with no cone
// gets numbers that make it 1 every way
function render3DLightCone(light)
{
    const widest = light === render3DShadowCaster() ? RENDER3D_SHADOW_CONE_MAX : PI;
    const angle = light.directional ? 0 : min(light.coneAngle, widest);
    if (!(angle > 0)) return [0, 0, 0, -1];
    const outer = cos(angle), inner = cos(angle * (1 - clamp(light.coneSoftness)));
    const k = 1 / max(inner - outer, 1e-4), forward = light.getForward3D();
    return [forward.x * k, forward.y * k, forward.z * k, outer * k];
}

// unit circle directions for a number of sides, [cos, sin, cos, sin, ...] including the closing point, cached
const render3DCircleCache = new Map;
function render3DCircle(sides)
{
    sides |= 0;
    let circle = render3DCircleCache.get(sides);
    if (!circle)
    {
        circle = new Float32Array(sides * 2 + 2);
        for (let i = 0; i <= sides; ++i)
        {
            const a = i / sides * 2 * PI;
            circle[i*2] = cos(a), circle[i*2 + 1] = sin(a);
        }
        render3DCircleCache.set(sides, circle);
    }
    return circle;
}

// the rotation that points -Z along a direction, as vec3(pitch, yaw, 0); a zero direction keeps the current one
function render3DLookRotation(direction, current)
{
    const d = direction.normalize();
    if (!d.lengthSquared()) return current;
    if (abs(d.x) + abs(d.z) < 1e-9) // straight up or down has no yaw of its own
        return vec3(d.y > 0 ? PI / 2 : -PI / 2, current.y, 0);
    return vec3(Math.asin(clamp(d.y, -1, 1)), atan2(-d.x, -d.z), 0);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Render3D Plugin - The 3D renderer, camera, lights, shadows and fog
 * - There is one of these, in the global render3D
 * - It draws the 3D scene before gameRender, so 2D drawing lands on top
 * - Set renderAfter2D to draw the 3D scene over the 2D scene instead
 * - Settings like lighting and specular are read as each thing draws
 * - Every object sets them from its own flags, so you rarely touch them
 * @memberof Render3D
 * @example
 * new Render3DPlugin;
 * render3D.camera.pos = vec3(0, 5, 10);
 * render3D.camera.lookAt(vec3());
 * new EngineObject3D(vec3(), buildBox());
 */
class Render3DPlugin
{
    /** Create the global 3D renderer, call in gameInit */
    constructor()
    {
        ASSERT(!render3D, 'Render3D plugin already initialized');
        render3D = this;
        // the draw state, read at each draw through the accessors below the constructor
        /** @type {Render3DDrawState} */
        this.drawState = {blend: false, additive: false, depthTest: true, depthWrite: true, cullBackFaces: false,
            mirrored: false, lighting: true, emissive: 0, receiveShadow: true, specular: 0, pixelated: false,
            shader: undefined, normalMap: undefined, normalScale: 1, shininess: 16, reflectivity: 0,
            emissiveMap: undefined, emissiveMapColor: WHITE, environmentMap: undefined, emissiveR: 1, emissiveG: 1,
            emissiveB: 1};
        /** @property {number} - Goes up when a draw state field changes, so a batch sees at a glance that none did */
        this.stateVersion = 0;
        ASSERT(Object.keys(render3DCaptureBatchState()).join() === [...RENDER3D_STATE_FIELDS, 'version'].join(),
            'the batch state functions must list RENDER3D_STATE_FIELDS');

        /** @property {Camera3D} - The camera */
        this.camera = new Camera3D;

        // lights and fog
        /** @property {Vector3} - Direction toward the sun, where its light comes from, like a directional Light3D;
         *  read at each draw, and any length will do, the shading and the shadows normalize it themselves;
         *  the sun is the one light that casts shadows */
        this.sunDirection = vec3(-.3, 1, .5);
        /** @property {Color} - Sunlight color */
        this.sunColor = WHITE.copy();
        /** @property {Color} - Ambient light color, from above when ambientGroundColor is set */
        this.ambientColor = hsl(0, 0, .3);
        /** @property {Color|undefined} - Ambient light from below: set, the ambient blends from this on faces pointing
         *  down to ambientColor on faces pointing up, the way a sky and a ground light a scene; setSky sets both from
         *  its colors
         *  @type {Color|undefined} */
        this.ambientGroundColor = undefined;
        /** @property {Color|undefined} - Fog color, uses canvasClearColor when undefined
         *  @type {Color|undefined} */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;
        /** @property {Vector3} - Added to the velocity3D of every object with a mass each frame, scaled by its
         *  gravityScale; sync2D objects use the 2D gravity */
        this.gravity = vec3();
        /** @property {number|HeightMap|function(number, number): number} - Floor for objects with a softShadow: a
         *  height, a HeightMap, or (x, z) => y
         *  @type {number|HeightMap|function(number, number): number} */
        this.softShadowHeight = 0;
        /** @property {boolean} - Default for every builder's smooth argument: true for smooth vertex normals, false for
         *  flat faces */
        this.smoothShading = false;

        /** @property {boolean} - Draw the camera's depth into a texture each frame for post processing:
         *  PostProcessPlugin hands it to its shader as iChannel2, read with sceneDepth(uv); off by default and free
         *  when off, on it draws the solid objects of the default layer once more, depth only */
        this.depthTexture = false;

        // shadows
        /** @property {boolean} - Cast real shadows from the sun, off by default and free when off */
        this.shadows = false;
        /** @property {number} - How far a sound played with playSound is heard when it was made with no range of
         *  its own, in world units; further than the 2D soundDefaultRange, a 3D world is bigger */
        this.soundDefaultRange = 100;
        /** @property {number} - Size of the shadow map in pixels, bigger is sharper and slower */
        this.shadowMapSize = 1024;
        /** @property {Light3D|undefined} - A spotlight, a Light3D with a coneAngle, to cast the shadows in place
         *  of the sun, a flashlight in the dark: the shadow map looks down its cone, as far as its radius, and the
         *  sun still lights the scene but casts none; undefined for the sun, as is a light that is off or has no cone
         *  @type {Light3D|undefined} */
        this.shadowLight = undefined;
        /** @property {number} - World size the shadow map covers around shadowCenter, smaller is sharper; it is a
         *  square facing the light, so it turns as the light does, and about 1.5 times an area's width covers it from
         *  any angle */
        this.shadowRange = 40;
        /** @property {Vector3|undefined} - Center of the shadowed area, read each frame, undefined follows the camera
         *  @type {Vector3|undefined} */
        this.shadowCenter = undefined;
        /** @property {number} - Stops surfaces shadowing themselves, raise for speckles, lower if shadows drift off;
         *  a share of the shadow map's depth, twice shadowRange for the sun and a spotlight's radius, so the gap behind
         *  a caster grows with the range as the map's texels do, and the speckles they make stay away */
        this.shadowBias = .003;
        /** @property {number} - How much to blur the shadow edges */
        this.shadowSoftness = 1;

        // the pass
        /** @property {Function|undefined} - Draw solid world here, it runs again for shadows so only draw in it
         *  @type {Function|undefined} */
        this.onRenderOpaque = undefined;
        /** @property {Function|undefined} - Draw see through things here, like glows, billboards and soft shadows
         *  @type {Function|undefined} */
        this.onRenderTransparent = undefined;
        /** @property {Mesh|undefined} - Sky dome from buildSky or setSky, drawn around the camera behind everything
         *  @type {Mesh|undefined} */
        this.sky = undefined;
        /** @property {CubeMap|undefined} - A cube map drawn as the sky, behind everything, in place of the sky dome;
         *  an orthographic camera looks the same way through every pixel, so it sees one color of it; fog fades to
         *  fogColor, not to the sky box, so with fog set fogColor to its horizon's color
         *  @type {CubeMap|undefined} */
        this.skyBox = undefined;
        /** @property {CubeMap|undefined} - The world around, what reflective surfaces reflect: an object's
         *  reflectivity says how much and its shininess how sharp, the same shininess that tightens its highlight:
         *  10000 a mirror, 1000 polished, 10 a wide blur; undefined reflects the sky's colors as setSky gave them; a cube map holds GPU
         *  memory until its dispose(), so one made again and again, as for a sky that changes, disposes the one it
         *  replaces, or a captured one is captured into again
         *  @type {CubeMap|undefined} */
        this.environment = undefined;
        /** @property {boolean} - Draw the 3D scene on top of the 2D scene instead of under it */
        this.renderAfter2D = false;
        /** @property {boolean} - Draw see through things far to near so they blend correctly */
        this.sortTransparent = true;
        /** @property {boolean} - Skip meshes whose bounding sphere is outside the view */
        this.frustumCulling = true;
        /** @property {boolean} - Draw every use of a mesh in the opaque stage as one instanced call, mesh.instanced
         *  overrides it per mesh */
        this.instancing = true;
        /** @property {boolean} - Sample textures through mipmaps so they do not shimmer in the distance, false uses
         *  each texture's own filtering like 2D */
        this.mipmaps = true;
        /** @property {number} - Anisotropic filtering for textures seen at an angle, 1 to 16, 1 is off; needs mipmaps */
        this.anisotropy = 4;

        // shared meshes, every object using one draws in the same batch
        /** @property {Mesh} - A box of size 1 that drawBox uses, for any object that is a box; set the object's scale3D
         *  and color instead of editing the mesh, which would change every box that uses it */
        this.boxMesh = buildBox();
        /** @property {Mesh} - A smooth sphere of diameter 1 that drawSphere uses, shared the same way as boxMesh */
        this.sphereMesh = buildSphere(1, 16, 8, true);
        /** @property {Mesh} - A flat square of size 1 facing +Y, seen from above only, for floors, water and decals;
         *  stand it up with the object's rotation3D, and size it with scale3D */
        this.planeMesh = buildGrid();
        this.planeMesh.doubleSided = false;
        /** @property {Mesh} - The same square seen and lit from both sides, for signs, cards and leaves */
        this.planeMeshDoubleSided = buildGrid();
        /** @property {Mesh} - A square of size 1 facing +Z with the tile across it, the corners in the order
         *  drawBillboard writes them; a ParticleEmitter3D draws its particles as instances of it, each with its own matrix */
        this.billboardMesh = new Mesh().addStrip([vec3(-.5, .5, 0), vec3(-.5, -.5, 0), vec3(.5, .5, 0), vec3(.5, -.5, 0)],
            vec3(0, 0, 1), RENDER3D_QUAD_UVS);
        this.billboardMesh.doubleSided = true;

        // read only
        /** @property {boolean} - True while the 3D pass is running, 3D draws are only valid then */
        this.isRendering = false;
        /** @property {boolean} - True while the shadow map is being drawn, draws go to the depth only shader */
        this.shadowPass = false;
        /** @property {Matrix4} - This frame's view matrix */
        this.viewMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's projection matrix */
        this.projectionMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's combined view projection */
        this.viewProjection = new Matrix4;
        /** @property {Matrix4} - This frame's light view projection for the shadow map */
        this.shadowMatrix = new Matrix4;
        this.gelAxes = [1, 0, 0, 1]; // the shadow light's right and up in its map's, for its gel
        /** @property {Vector3} - Camera right axis this frame */
        this.cameraRight = vec3(1, 0, 0);
        /** @property {Vector3} - Camera up axis this frame */
        this.cameraUp = vec3(0, 1, 0);
        /** @property {Vector3} - Camera forward axis this frame */
        this.cameraForward = vec3(0, 0, -1);
        this.cameraBack = vec3(0, 0, 1); // its opposite, the normal of camera facing draws

        // internal state
        /** @type {Array<Array<number>>} */
        this.frustumPlanes = [];     // the view as six inward planes [x, y, z, w]
        /** @type {Array<Array<number>>} */
        this.shadowPlanes = [];      // the shadow map's box as six planes
        /** @type {WebGLProgram|undefined} */
        this.program = undefined;    // the main program, undefined when not available
        /** @type {WebGLProgram|undefined} */
        this.currentProgram = undefined; // the program in use during a pass, a Shader's or the main one
        this.lightCount = 0;         // Light3D objects sent this pass
        /** @type {WebGLProgram|undefined} */
        this.shadowShader = undefined;
        /** @type {WebGLVertexArrayObject|undefined} */
        this.vao = undefined;
        /** @type {Set<CubeMap>} */
        this.cubeCaptures = new Set;  // the cube maps capture asked to draw in the next pass
        /** @type {CubeMap|undefined} */
        this.capturingCube = undefined; // the cube map being drawn, which nothing may read meanwhile
        /** @type {WebGLFramebuffer|undefined} */
        this.captureFramebuffer = undefined;
        /** @type {WebGLRenderbuffer|undefined} */
        this.captureDepth = undefined;
        this.captureDepthSize = 0;
        /** @type {WebGLProgram|undefined} */
        this.skyBoxProgram = undefined; // draws the sky box, made on its first draw
        /** @type {WebGLVertexArrayObject|undefined} */
        this.skyBoxVao = undefined;  // an empty one, its triangle comes from gl_VertexID
        /** @type {WebGLTexture|undefined} */
        this.whiteTexture = undefined; // 1x1 white for untextured draws
        /** @type {Map<number, WebGLSampler>} */
        this.samplers = new Map;      // how textures are filtered in 3D, by wrap and hard edge, see render3DSampler
        /** @type {string|undefined} */
        this.samplerKey = undefined;   // the settings the samplers were made for, they are rebuilt when it changes
        /** @type {WebGLTexture|undefined} */
        this.shadowTexture = undefined;
        /** @type {WebGLFramebuffer|undefined} */
        this.shadowFramebuffer = undefined;
        this.shadowTextureSize = 0;
        /** @type {WebGLTexture|undefined} */
        this.cameraDepthTexture = undefined; // the camera's depth, drawn when depthTexture is on
        /** @type {WebGLFramebuffer|undefined} */
        this.cameraDepthFramebuffer = undefined;
        this.cameraDepthWidth = 0;
        this.cameraDepthHeight = 0;
        this.depthPass = false; // drawing the camera's depth, a shadow pass seen from the camera
        this.contextGeneration = 0;  // counts context losses, a mesh uploaded under an older one uploads again
        /** @type {WeakMap<WebGLProgram, Object<string, WebGLUniformLocation|null>>} */
        this.uniforms = new WeakMap; // uniform locations by program, weak so a freed one goes with it
        /** @type {Object<string, Array<number>>} */
        this.uniformValues = {};     // last values sent for the cached vec4 uniforms
        this.shadowMapDrawn = false; // the shadow map is drawn by the first pass of the frame
        this.passIsDefault = true;   // the running pass is the default layer, the only one shadowed
        this.lightPositions = new Float32Array(RENDER3D_MAX_LIGHTS * 4); // Light3D uniforms, filled each pass
        this.lightColors = new Float32Array(RENDER3D_MAX_LIGHTS * 4);
        this.lightCones = new Float32Array(RENDER3D_MAX_LIGHTS * 4); // each light's cone, see render3DLightCone
        this.shadowLightIndex = -1;  // which of the lights sent casts the shadows, -1 for the sun
        this.shadowDepthBias = 0;    // the bias as the shadow lookup takes it, set with the shadow matrix

        // the stream of immediate mode draws
        /** @type {WebGLBuffer|undefined} */
        this.streamBuffer = undefined;
        /** @type {Array<WebGLBuffer>} */
        this.instanceBuffers = [];       // the per instance values of the batches being drawn, used in turn
        this.instanceBufferIndex = 0;
        /** @type {Array<Mesh>} */
        this.instanceMeshes = [];        // meshes with a batch pending this stage
        /** @type {Array<Array<number>>} */
        this.attribValues = [];          // last values sent for the cached constant attributes
        this.streamData = new ArrayBuffer(RENDER3D_MAX_STREAM_VERTS * RENDER3D_VERTEX_BYTES);
        this.streamFloats = new Float32Array(this.streamData);
        this.streamInts = new Uint32Array(this.streamData);
        this.streamCount = 0;
        /** @type {TextureInfo|undefined} */
        this.streamTileInfo = undefined;
        /** @type {Object|undefined} */
        this.streamState = undefined; // captured state the pending batch was drawn under, render3DCaptureBatchState's
        this.streamUnlit = false;     // the pending batch is drawn unlit whatever that state says, billboards are
        /** @type {Mesh|undefined} */
        this.capture = undefined;     // the mesh a bake is filling
        /** @type {Array<{distance: number, state: Object, draw: function(): void}>|undefined} */
        this.transparentQueue = undefined; // draws queued during the transparent stage, replayed far to near

        render3DInitGL();
        engineAddPlugin(undefined, render3DRender, render3DContextLost, render3DContextRestored, render3DPreRender);
    }

    ///////////////////////////////////////////////////////////////////////////
    // Draw state: each field an accessor over drawState, whose setter moves stateVersion only on a real change

    /** Apply lighting, when false draws plain vertex color times texture and casts no shadow;
     *  off for billboards, lines, ribbons and soft discs, an object sets emissive instead
     *  @return {boolean} */
    get lighting() { return this.drawState.lighting; }
    set lighting(v) { const d = this.drawState; d.lighting === v || (d.lighting = v, ++this.stateVersion); }

    /** How much a surface lights itself, set per object by its emissive
     *  @return {number} */
    get emissive() { return this.drawState.emissive; }
    set emissive(v) { const d = this.drawState; d.emissive === v || (d.emissive = v, ++this.stateVersion); }

    /** Additive blending instead of alpha, in the transparent stage
     *  @return {boolean} */
    get additive() { return this.drawState.additive; }
    set additive(v) { const d = this.drawState; d.additive === v || (d.additive = v, ++this.stateVersion); }

    /** Test against the depth buffer, reset to true before each object and callback; a draw
     *  with it off goes over what was drawn before it and under what is drawn after, by render order, which
     *  ends the batch of meshes before it, so one per object costs a draw per object
     *  @return {boolean} */
    get depthTest() { return this.drawState.depthTest; }
    set depthTest(v) { const d = this.drawState; d.depthTest === v || (d.depthTest = v, ++this.stateVersion); }

    /** Write to the depth buffer, owned by the stages: on for opaque, off for transparent
     *  @return {boolean} */
    get depthWrite() { return this.drawState.depthWrite; }
    set depthWrite(v) { const d = this.drawState; d.depthWrite === v || (d.depthWrite = v, ++this.stateVersion); }

    /** Skip back faces, set by drawMesh from each mesh: off for strips so they show from
     *  both sides
     *  @return {boolean} */
    get cullBackFaces() { return this.drawState.cullBackFaces; }
    set cullBackFaces(v) { const d = this.drawState; d.cullBackFaces === v || (d.cullBackFaces = v, ++this.stateVersion); }

    /** The transform mirrors the draw, so the other winding is the front, set by drawMesh
     *  from each transform
     *  @return {boolean} */
    get mirrored() { return this.drawState.mirrored; }
    set mirrored(v) { const d = this.drawState; d.mirrored === v || (d.mirrored = v, ++this.stateVersion); }

    /** Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and
     *  1 adds a light's full color at its brightest; shininess sets its size
     *  @return {number} */
    get specular() { return this.drawState.specular; }
    set specular(v) { const d = this.drawState; d.specular === v || (d.specular = v, ++this.stateVersion); }

    /** The highlight's exponent, how small and sharp it is: 4 is broad like rubber, 100 sharp
     *  like polished metal; set from each object's shininess
     *  @return {number} */
    get shininess() { return this.drawState.shininess; }
    set shininess(v) { const d = this.drawState; d.shininess === v || (d.shininess = v, ++this.stateVersion); }

    /** Normal map for the next draws, set from each object's normalMap
     *  @return {TextureInfo|undefined} */
    get normalMap() { return this.drawState.normalMap; }
    set normalMap(v) { const d = this.drawState; d.normalMap === v || (d.normalMap = v, ++this.stateVersion); }

    /** How strongly the normal map bends the surface, set from each object's normalScale
     *  @return {number} */
    get normalScale() { return this.drawState.normalScale; }
    set normalScale(v) { const d = this.drawState; d.normalScale === v || (d.normalScale = v, ++this.stateVersion); }

    /** How much the surface reflects the sky, 0 to 1, set from each object's reflectivity
     *  @return {number} */
    get reflectivity() { return this.drawState.reflectivity; }
    set reflectivity(v) { const d = this.drawState; d.reflectivity === v || (d.reflectivity = v, ++this.stateVersion); }

    /** Emissive map for the next draws, set from each object's emissiveMap
     *  @return {TextureInfo|undefined} */
    get emissiveMap() { return this.drawState.emissiveMap; }
    set emissiveMap(v) { const d = this.drawState; d.emissiveMap === v || (d.emissiveMap = v, ++this.stateVersion); }

    /** The cube map the next draws reflect in place of render3D.environment, set from each object's environment
     *  @return {CubeMap|undefined} */
    get environmentMap() { return this.drawState.environmentMap; }
    set environmentMap(v)
    { const d = this.drawState; d.environmentMap === v || (d.environmentMap = v, ++this.stateVersion); }

    /** Multiplies the emissive map, set from each object's emissiveMapColor; compared by its rgb, so a Color
     *  changed in place is seen when it is set again, and undefined is white
     *  @return {Color} */
    get emissiveMapColor() { return this.drawState.emissiveMapColor; }
    set emissiveMapColor(v)
    {
        const d = this.drawState, c = v || WHITE;
        d.emissiveMapColor = v;
        if (c.r !== d.emissiveR || c.g !== d.emissiveG || c.b !== d.emissiveB)
            d.emissiveR = c.r, d.emissiveG = c.g, d.emissiveB = c.b, ++this.stateVersion;
    }

    /** Custom Shader for the next draws, set from each object's shader; undefined draws
     *  with the plugin's own
     *  @return {Shader|undefined} */
    get shader() { return this.drawState.shader; }
    set shader(v) { const d = this.drawState; d.shader === v || (d.shader = v, ++this.stateVersion); }

    /** Darken by the shadow map when shadows are on, turn it off for things that should
     *  stay lit inside a shadow
     *  @return {boolean} */
    get receiveShadow() { return this.drawState.receiveShadow; }
    set receiveShadow(v) { const d = this.drawState; d.receiveShadow === v || (d.receiveShadow = v, ++this.stateVersion); }

    /** Keep texture pixels hard edged, no mipmaps and no blending between them, set per
     *  object by pixelated
     *  @return {boolean} */
    get pixelated() { return this.drawState.pixelated; }
    set pixelated(v) { const d = this.drawState; d.pixelated === v || (d.pixelated = v, ++this.stateVersion); }

    /** Blending on, set by the stages
     *  @return {boolean} */
    get blend() { return this.drawState.blend; }
    set blend(v) { const d = this.drawState; d.blend === v || (d.blend = v, ++this.stateVersion); }

    ///////////////////////////////////////////////////////////////////////////
    // Matrices and picking

    /** Rebuild the view and projection matrices from the camera, called automatically each frame
     *  @param {number} [aspect] - Width over height, defaults to the main canvas */
    updateMatrices(aspect=mainCanvasSize.y ? mainCanvasSize.x / mainCanvasSize.y : 1)
    {
        const camera = this.camera;
        if (camera.align2D)
            camera.update2D();
        const cameraMatrix = camera.getMatrix();
        this.viewMatrix = cameraMatrix.copy().invert();
        this.projectionMatrix = camera.getProjectionMatrix(aspect);
        this.viewProjection = this.projectionMatrix.copy().multiply(this.viewMatrix);
        const m = cameraMatrix.m;
        this.cameraRight = render3DAxis(m, 0);
        this.cameraUp = render3DAxis(m, 4);
        this.cameraBack = render3DAxis(m, 8); // the normal of anything facing the camera
        this.cameraForward = this.cameraBack.scale(-1);
        this.frustumPlanes = render3DFrustumPlanes(this.viewProjection);
    }

    /** Where a world point lands on screen as -1 to 1 across and up, with z as depth
     *  - Uses this frame's camera, call updateMatrices first if the camera just moved
     *  @param {Vector3} pos
     *  @return {Vector3|undefined} - undefined when behind the camera or closer than the near plane */
    worldToClip(pos)
    {
        const m = this.viewProjection.m;
        const w = m[3]*pos.x + m[7]*pos.y + m[11]*pos.z + m[15];
        const z = (m[2]*pos.x + m[6]*pos.y + m[10]*pos.z + m[14]) / w;
        if (w <= 0 || z < -1)
            return; // behind the camera, or in front of the near plane
        return vec3(
            (m[0]*pos.x + m[4]*pos.y + m[8]*pos.z  + m[12]) / w,
            (m[1]*pos.x + m[5]*pos.y + m[9]*pos.z  + m[13]) / w, z);
    }

    /** Project a world point to screen space pixels, same space as mousePosScreen
     *  - The opposite of screenToRay, and it takes the same canvas so the pair agree
     *  @param {Vector3} pos
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size, as in screenToRay;
     *    the projection is whatever updateMatrices last built, which screenToRay does for its canvas
     *  @return {Vector2|undefined} - undefined when behind the camera or closer than the near plane */
    worldToScreen(pos, canvasSize=mainCanvasSize)
    {
        const clip = this.worldToClip(pos);
        if (!clip)
            return;
        return vec2((clip.x + 1) / 2 * canvasSize.x, (1 - clip.y) / 2 * canvasSize.y);
    }

    /** Get the world ray under a screen position, for clicking on things in 3D
     *  - Uses the camera where it is right now, so it is fine to call from gameUpdate
     *  - It brings the view matrices up to date for that canvas, so worldToScreen stays its exact opposite
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size
     *  @return {Ray3D} - Starts at the camera with a unit direction, or on the near plane when orthographic */
    screenToRay(screenPos, canvasSize=mainCanvasSize)
    {
        // a canvas with no size stands in as 1x1, rather than dividing by zero
        const width = canvasSize.x || 1, height = canvasSize.y || 1;
        const aspect = width / height, camera = this.camera;
        // bring the matrices up to date for this canvas, so worldToScreen and this agree on where things are
        this.updateMatrices(aspect);
        const clipX = screenPos.x / width * 2 - 1;
        const clipY = 1 - screenPos.y / height * 2;
        // the screen offset moves a parallel ray's origin, or bends a perspective ray's direction
        const h = camera.orthographic ? camera.orthographic / 2 : tan(camera.fov / 2);
        const offset = this.cameraRight.scale(clipX * h * aspect).add(this.cameraUp.scale(clipY * h));
        // a parallel ray starts on the near plane, which an orthographic camera may put behind it, like three.js
        return camera.orthographic
            ? new Ray3D(camera.pos.add(offset).add(this.cameraForward.scale(camera.near)), this.cameraForward.copy())
            : new Ray3D(camera.pos.copy(), this.cameraForward.add(offset).normalize());
    }

    /** Where a screen position lands on a flat ground plane, for top down games; use HeightMap.raycast for terrain
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {number} [groundHeight] - World height of the ground plane
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size, as in screenToRay
     *  @return {Vector3|undefined} - undefined when the ray misses the plane */
    screenToGround(screenPos, groundHeight=0, canvasSize=mainCanvasSize)
    {
        const ray = this.screenToRay(screenPos, canvasSize);
        const t = raycastPlane(ray, vec3(0, groundHeight, 0), RENDER3D_DEFAULT_NORMAL);
        return t === undefined ? undefined : ray.getPosition(t);
    }

    /** Find the nearest object under a screen position or along a ray, for clicking on things
     *  - A mesh is hit on its triangles, the ones that face the ray as they are drawn, both sides of a doubleSided
     *    mesh; a sprite is hit as the quad it draws, and a height map or a voxel map on its surface
     *  - engineObjectsRaycast3D is the other half of this, every object along a ray instead of the nearest
     *  @param {Vector2|Ray3D} from - A screen position like mousePosScreen, or a ray to look along
     *  @param {Array<EngineObject>} [objects] - Defaults to every object; only those with a mesh or a sprite count
     *  @return {{object: EngineObject3D, distance: number}|undefined} */
    pick(from, objects=engineObjects)
    {
        const ray = from instanceof Ray3D ? from : this.screenToRay(from);
        let nearest;
        for (const o of objects)
        {
            const distance = render3DRaycastObject(ray, o);
            if (distance !== undefined && (!nearest || distance < nearest.distance))
                nearest = {object: /** @type {EngineObject3D} */ (o), distance}; // only a 3D object has a distance
        }
        return nearest;
    }

    /** Play a sound at a 3D position, quieter with distance from the camera and panned by its side, like Sound.play
     *  with a 2D position; a sound made with no range of its own is heard to soundDefaultRange, 100, and one given
     *  a range keeps it
     *  @param {Sound} sound
     *  @param {Vector3} pos3D
     *  @param {number} [volume]
     *  @param {number} [pitch]
     *  @param {number} [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop]
     *  @param {boolean} [paused] - Start it paused
     *  @return {SoundInstance|undefined} - undefined when out of range or sound is off */
    playSound(sound, pos3D, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false)
    {
        // the 3D range fade and pan, Sound.play with no position does the rest
        ASSERT(sound instanceof Sound, 'sound must be a Sound');
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        // a sound with no range of its own is heard further in 3D than in 2D
        const offset = pos3D.subtract(this.camera.pos);
        const range = sound.rangeIsDefault ? this.soundDefaultRange : sound.range;
        if (range)
        {
            const distance = offset.length();
            if (distance >= range)
                return; // out of range, at it too, where the fade is silent
            const taperRange = range * sound.taper;
            if (distance > taperRange)
                volume *= percent(distance, range, taperRange);
        }
        const instance = sound.play(undefined, volume, pitch, randomnessScale, loop, paused);
        instance?.setPan(offset.normalize().dot(this.cameraRight));
        return instance;
    }

    /** Play a sound on a loop at a 3D position, the same as playSound with loop on
     *  - Its volume and pan are set when it starts, change or stop it through the SoundInstance returned
     *  @param {Sound} sound
     *  @param {Vector3} pos3D
     *  @param {number} [volume]
     *  @param {number} [pitch]
     *  @param {number} [randomnessScale] - How much to scale pitch randomness
     *  @return {SoundInstance|undefined} - undefined when out of range or sound is off */
    playSoundLoop(sound, pos3D, volume=1, pitch=1, randomnessScale=1)
    { return this.playSound(sound, pos3D, volume, pitch, randomnessScale, true); }

    /** Is any part of a sphere on screen this frame, the test that skips meshes the camera cannot see
     *  - While the shadow map is drawing it tests the shadow area instead
     *  @param {Vector3} center
     *  @param {number} radius
     *  @return {boolean} */
    isSphereVisible(center, radius) { return render3DSphereVisible(center.x, center.y, center.z, radius); }

    ///////////////////////////////////////////////////////////////////////////
    // Meshes and the stream

    /** Draw a mesh with the current draw state, batched with its other uses in the opaque stage when instancing is on
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint
     *  @return {void} */
    drawMesh(mesh, matrix=RENDER3D_IDENTITY, tileInfo, color=WHITE)
    {
        matrix = render3DMatrix(matrix);
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo,
            'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        ASSERT(isColor(color), 'color must be a Color');
        if (this.capture)
            return void this.capture.combine(mesh, matrix, color);
        if (this.transparentQueue)
        {
            // the queue replays later, so it keeps copies of what a caller may reuse, like a scratch matrix
            const m = matrix.copy(), c = color.copy();
            return this.queueTransparent(m.getTranslation(), ()=> this.drawMesh(mesh, m, tileInfo, c));
        }
        if (!render3DCanDraw()) return;
        if (this.shadowPass && !this.lighting) return; // unlit things cast no shadow
        render3DMeshUpload(mesh);
        if (!mesh.bufferCount) return;
        const m = matrix.m;
        if (this.frustumCulling && !render3DSphereVisible(m[12], m[13], m[14], mesh.radius * render3DMaxStretch(m)))
            return;
        // the mesh says whether its back faces can be skipped, and a mirroring transform, one with a negative
        // determinant, turns the winding around so the other one is its front; the stage draws a batch at its
        // end, which keys on those itself
        if (!this.blend && this.depthTest && (mesh.instanced ?? this.instancing))
            render3DInstance(mesh, matrix, tileInfo, color);
        else
        {
            const cullBackFaces = this.cullBackFaces, mirrored = this.mirrored;
            this.cullBackFaces = !mesh.doubleSided;
            this.mirrored = render3DMirrors(matrix);
            this.flush();
            render3DFlushBeforeOverlay();
            render3DSetDrawUniforms(matrix, tileInfo, color);
            render3DBindMesh(mesh);
            glContext.drawElements(glContext.TRIANGLES, mesh.bufferCount, mesh.indexType, 0);
            ++drawCount;
            primitiveCount += mesh.bufferCount / 3;
            this.cullBackFaces = cullBackFaces, this.mirrored = mirrored;
        }
    }

    /** Draw a triangle strip, batched into the stream with the current draw state
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  - inside a bake the strip goes into the mesh instead, in the transparent stage it is queued for sorting
     *    and the arrays are read when the queue replays, so leave them unchanged until the stage ends
     *  @param {Array<Vector3>} points - In strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, 0-1 across the tile
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, vertex colors come before the texture
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for this strip
     *  @return {void} */
    drawStrip(points, normals, uvs, colors, tileInfo)
    {
        if (this.capture)
        {
            this.capture.addStrip(points, normals, uvs, colors);
            return;
        }
        if (this.transparentQueue)
        {
            // sort by the center of the strip
            let x = 0, y = 0, z = 0;
            for (const p of points)
                x += p.x, y += p.y, z += p.z;
            return this.queueTransparent(vec3(x, y, z).scale(1 / points.length),
                ()=> this.drawStrip(points, normals, uvs, colors, tileInfo));
        }
        ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
        const n = points.length, count = render3DStripCount(n);
        const uvRect = render3DBeginStrip(count, tileInfo);
        if (!uvRect) return;

        // the tile rect is applied to each uv now, so the whole texture maps at flush
        const floats = this.streamFloats, ints = this.streamInts;
        const normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
        const rgba = colorArray ? 0 : (colors || WHITE).rgbaInt();
        for (let k = 0; k < count; ++k)
        {
            const i = render3DStripIndex(k, n), p = points[i];
            const uv = uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV;
            render3DWriteVertex(floats, ints, this.streamCount++ * RENDER3D_VERTEX_FLOATS, p.x, p.y, p.z,
                normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL,
                uvRect.x + uv.x * uvRect.w, uvRect.y + uv.y * uvRect.h, colorArray ? colors[i].rgbaInt() : rgba);
        }
    }

    /** Draw a strip with lighting off, for camera facing shapes where the light direction means nothing
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals]
     *  @param {Vector2|Array<Vector2>} [uvs]
     *  @param {Color|Array<Color>} [colors]
     *  @param {TileInfo|TextureInfo} [tileInfo] */
    drawStripUnlit(points, normals, uvs, colors, tileInfo)
    { render3DWithState({lighting: false}, ()=> this.drawStrip(points, normals, uvs, colors, tileInfo)); }

    /** Draw the pending stream vertices as one strip with the state they were drawn under, called automatically when needed */
    flush()
    {
        if (!this.streamCount || !render3DCanDraw()) return;
        const gl = glContext;
        if (this.streamUnlit)
            this.streamState.lighting = false; // its own copy of the state
        render3DSetDrawUniforms(RENDER3D_IDENTITY, this.streamTileInfo, WHITE, RENDER3D_FULL_UV_RECT, this.streamState);
        render3DBindVertexBuffer(this.streamBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.streamFloats, 0, this.streamCount * RENDER3D_VERTEX_FLOATS);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.streamCount);
        ++drawCount;
        primitiveCount += this.streamCount;
        this.streamCount = 0;
    }

    /** Build a mesh once out of draw calls, instead of redrawing the shapes every frame
     *  - Call the same drawStrip, drawQuad and drawBox calls inside, and get a mesh back
     *  - Strips inside a bake ignore their tileInfo, the finished mesh picks the texture when it draws
     *  - drawMesh, drawBox and drawSphere copy their mesh in, moved and tinted, their tileInfo dropped too
     *  - The mesh skips its back faces like any, set doubleSided when what was drawn is open
     *  @param {Function} drawFunction
     *  @return {Mesh} */
    bake(drawFunction)
    {
        this.flush();
        ASSERT(!this.capture, 'bake cannot be nested');
        const mesh = this.capture = new Mesh;
        try { drawFunction(); }
        finally { this.capture = undefined; }
        return mesh;
    }

    ///////////////////////////////////////////////////////////////////////////
    // The stages, run by the pass

    /** Draw a layer's objects, solid ones first and see through ones after, called automatically
     *  - The main layer also draws the sky, the render callbacks and the debug shapes
     *  @param {Array<EngineObject3D>} objects
     *  @param {boolean} [isDefault] */
    renderStages(objects, isDefault=true)
    {
        const opaque = [], transparent = [];
        for (const o of objects)
            (o.transparent || render3DSetting(o, 'additive') ? transparent : opaque).push(o);

        isDefault && (this.skyBox && this.skyBox !== this.capturingCube || this.sky) && this.drawSky();

        // opaque: no blending, depth writes on, by render order
        this.blend = false;
        this.depthWrite = true;
        const byOrder = (a, b)=> (a.drawOwner ? render3DSetting(a, 'renderOrder') : a.renderOrder) -
            (b.drawOwner ? render3DSetting(b, 'renderOrder') : b.renderOrder);
        opaque.sort(byOrder);
        transparent.sort(byOrder);
        render3DDrawObjects(opaque);
        isDefault && this.onRenderOpaque?.();
        this.flush();
        render3DFlushInstances();

        // transparent: blending on, depth writes off, every draw queued then replayed far to near
        this.blend = true;
        this.depthWrite = false;
        this.transparentQueue = this.sortTransparent ? [] : undefined;
        try
        {
            render3DDrawObjects(transparent);
            for (const o of objects)
                if (o.softShadow)
                {
                    // the shadow grows with the object, by the same scale picking and culling
                    // measure it at, so one size set once holds however the object is scaled
                    const m = render3DObjectMatrix(o);
                    this.drawSoftShadow(m.getTranslation(), o.softShadow * render3DMaxScale(m.m), this.softShadowHeight);
                }
            isDefault && this.onRenderTransparent?.();
        }
        finally { this.flushTransparentQueue(); }
        isDefault && !this.capturingCube && render3DRenderDebug();
        this.flush();

        // leave the fields at the opaque defaults for anything reading them outside the pass
        render3DSetObjectState();
        this.blend = false;
        this.depthWrite = true;
    }

    /** Queue a draw for the transparent stage, replayed far to near with the current draw state, or draw it now when
     *  sorting is off
     *  - The draw runs later, so it should hold copies of any values the caller may change before then
     *  @param {Vector3} pos - Where the draw is, for sorting
     *  @param {function(): void} draw
     *  @return {void} */
    queueTransparent(pos, draw)
    {
        if (!this.transparentQueue)
        {
            draw();
            return;
        }
        // sort by depth along the view, not distance, so an orthographic camera orders them right too
        const f = this.cameraForward, c = this.camera.pos;
        const distance = (pos.x - c.x)*f.x + (pos.y - c.y)*f.y + (pos.z - c.z)*f.z;
        this.transparentQueue.push({distance, state: render3DCaptureBatchState(), draw});
    }

    /** Draw the queued transparent draws far to near with the state each was drawn under, called automatically at the
     *  end of the transparent stage */
    flushTransparentQueue()
    {
        const queue = this.transparentQueue;
        if (!queue) return;
        this.transparentQueue = undefined;
        queue.sort((a, b)=> b.distance - a.distance);
        // each draw under the state it was queued with, and the state left as it was found
        const state = render3DCaptureBatchState();
        try
        {
            for (const item of queue)
                render3DApplyBatchState(item.state), item.draw();
        }
        finally { render3DApplyBatchState(state); }
    }

    /** Draw render3D.skyBox, or render3D.sky around the camera, unlit, unfogged and behind everything, called
     *  automatically by the pass */
    drawSky()
    {
        this.flush();
        if (this.skyBox && this.skyBox !== this.capturingCube && render3DDrawSkyBox(this.skyBox))
            return; // a plain return, so the method is typed void and a subclass may override it so
        if (!this.sky) return; // a sky box that could not draw, with no dome to draw instead
        // the dome only has to sit between the clip planes, the pass draws it first with no depth test;
        // a far plane at Infinity has no midpoint, so put it a long way out instead
        const {near, far} = this.camera;
        const radius = far == Infinity ? near * 1e4 : (near + far) / 2;
        render3DWithState({lighting: false, blend: false, depthTest: false, depthWrite: false, fogEnd: 0, shader: undefined,
            emissiveMap: undefined}, ()=>
            this.drawMesh(this.sky, buildMatrix(this.camera.pos, undefined, vec3(radius))));
    }

    /** Rebuild the light's view projection around the shadow center, called automatically each frame shadows are on */
    updateShadowMatrix()
    {
        const caster = render3DShadowCaster();
        if (caster)
        {
            // a spotlight's map looks down its cone with perspective, from just in front of it out to its radius
            const pos = caster.getWorldPos3D(), forward = caster.getForward3D();
            const up = abs(forward.y) > .99 ? vec3(0, 0, 1) : vec3(0, 1, 0);
            // the near plane stays in front of the far one however small the light
            const far = caster.radius, near = min(max(far / 500, .02), far / 2);
            const fov = min(caster.coneAngle, RENDER3D_SHADOW_CONE_MAX) * 2 + .1;
            const view = Matrix4.lookAt(pos, pos.add(forward), up);
            this.shadowMatrix = Matrix4.perspective(fov, 1, near, far).multiply(view.copy().invert());
            // the map's own right and up are not the light's, which a gel is upright by: the four numbers that
            // turn the one into the other
            const v = view.m, l = render3DObjectMatrix(caster).m;
            const right = vec3(l[0], l[1], l[2]).normalize(), lightUp = vec3(l[4], l[5], l[6]).normalize();
            const mapRight = vec3(v[0], v[1], v[2]), mapUp = vec3(v[4], v[5], v[6]);
            this.gelAxes = [right.dot(mapRight), right.dot(mapUp), lightUp.dot(mapRight), lightUp.dot(mapUp)];
            this.shadowPlanes = render3DFrustumPlanes(this.shadowMatrix);
            // depth is not even with perspective: the lookup divides this by the distance squared, which makes
            // the bias the same distance in the world near the light and far from it
            this.shadowDepthBias = this.shadowBias * far * far * near / (far - near);
            return;
        }
        this.shadowDepthBias = this.shadowBias; // the sun's map is flat, its depth even
        ASSERT(this.shadowRange > 0, 'shadowRange must be positive');
        const range = this.shadowRange > 0 ? this.shadowRange : 1, half = range / 2;
        const toSun = this.sunDirection.normalize();
        const center = this.shadowCenter || this.camera.pos.add(this.cameraForward.scale(half * .8));
        const view = Matrix4.lookAt(center.add(toSun.scale(range)), center).invert();
        // move the light's view in whole pixel steps so shadow edges do not crawl as the camera moves
        const texel = range / (this.shadowTextureSize || this.shadowMapSize), m = view.m; // no texture in headless mode
        m[12] = round(m[12] / texel) * texel;
        m[13] = round(m[13] / texel) * texel;
        this.shadowMatrix = Matrix4.orthographic(-half, half, -half, half, 0, range * 2).multiply(view);
        this.shadowPlanes = render3DFrustumPlanes(this.shadowMatrix);
    }

    /** Build a sky dome, set it as the sky, and light the scene by it: the fog takes the horizon color, and the
     *  ambient light comes from the top color above and the bottom color below, both at the ambient strength
     *  @param {Color} [topColor] - Straight up
     *  @param {Color} [horizonColor] - Level with the camera
     *  @param {Color} [bottomColor] - Straight down, defaults to the horizon color
     *  @param {number} [ambient] - How much of the sky colors lights the scene as ambient, 0 for none
     *  @return {Mesh} - The dome, also in render3D.sky */
    setSky(topColor=hsl(.6, .8, .55), horizonColor=hsl(.6, 1, .9), bottomColor=horizonColor, ambient=.5)
    {
        this.sky?.dispose();
        this.sky = buildSky(topColor, horizonColor, bottomColor);
        this.fogColor = horizonColor.copy();
        this.ambientColor = topColor.scale(ambient, 1);
        this.ambientGroundColor = bottomColor.scale(ambient, 1);
        return this.sky;
    }

    /** Set where fog starts and ends, and its color
     *  @param {number} fogStart - Distance from the camera where fog starts
     *  @param {number} fogEnd - Distance where fog is total, 0 disables fog
     *  @param {Color} [fogColor] - Leaves the color alone when not passed, setSky sets it to the horizon */
    setFog(fogStart, fogEnd, fogColor)
    {
        this.fogStart = fogStart;
        this.fogEnd = fogEnd;
        if (fogColor)
            this.fogColor = fogColor.copy();
    }

    ///////////////////////////////////////////////////////////////////////////
    // Immediate mode shapes

    /** Draw a box, untextured, for blocking out a scene without meshes or objects
     *  @param {Vector3} pos - Center
     *  @param {Vector3|number} [size] - Full size, a number for a cube
     *  @param {Color} [color]
     *  @param {Vector3} [rotation] - vec3(pitch, yaw, roll) */
    drawBox(pos, size=1, color=WHITE, rotation)
    {
        this.drawMesh(this.boxMesh, buildMatrix(pos, rotation, render3DSize3(size)), undefined, color);
    }

    /** Draw a sphere, untextured and smooth shaded
     *  @param {Vector3} pos - Center
     *  @param {number} [size] - Diameter
     *  @param {Color} [color] */
    drawSphere(pos, size=1, color=WHITE)
    {
        this.drawMesh(this.sphereMesh, buildMatrix(pos, undefined, vec3(size)), undefined, color);
    }

    /** Draw a flat square that always faces the camera, unlit so it keeps its own colors
     *  - Draw it from onRenderTransparent or a transparent object so it can fade
     *  @param {Vector3} pos - Center
     *  @param {Vector2} [size] - World units
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color} [color]
     *  @param {number} [angle] - Rotation in the camera plane, counter clockwise
     *  @param {boolean} [upright] - Stand on world up and only turn to face the camera, for sprites on the ground
     *  @return {void} */
    drawBillboard(pos, size=vec2(1), tileInfo, color=WHITE, angle=0, upright=false)
    {
        if (this.capture) // the mesh keeps the color, so it gets its own, the particles reuse theirs
            return this.drawStripUnlit(render3DBillboardCorners(pos, size, angle, upright), this.cameraBack,
                RENDER3D_QUAD_UVS, color.copy(), tileInfo);
        if (this.transparentQueue) // sort by the exact position, a shadow under it sorts by the floor
        {
            const p = pos.copy(), s = size.copy(), c = color.copy(); // copies, the queue replays later
            return this.queueTransparent(p, ()=> this.drawBillboard(p, s, tileInfo, c, angle, upright));
        }

        // unlit on screen, in the shadow map the object's flag decides; the batch is told, the draw state is not
        // set, which would move its version at every sprite
        const unlit = !this.shadowPass;
        if (!this.blend && this.depthTest && this.instancing)
        {
            // an opaque sprite is one more instance of the shared quad, as a mesh's uses are: every sprite of a
            // sheet is one instanced draw at the end of the stage, with nothing written per corner; the shader
            // drops its see through texels, so it needs no sorting
            if (!render3DCanDraw() || this.shadowPass && !this.lighting) return; // unlit things cast no shadow
            if (this.frustumCulling && !render3DSphereVisible(pos.x, pos.y, pos.z, hypot(size.x, size.y) / 2))
                return;
            const quad = this.billboardMesh, cb = this.cameraBack, uv = render3DGetTileUVs(tileInfo);
            render3DMeshUpload(quad);
            // the quad's half axes, doubled for its unit square
            const a = render3DBillboardAxes(size, angle, upright);
            const k = render3DInstanceSlot(quad, render3DTextureOf(tileInfo), false, unlit), data = quad.instanceData;
            data[k]    = a[0] * 2; data[k+1]  = a[1] * 2; data[k+2]  = a[2] * 2; data[k+3]  = 0;
            data[k+4]  = a[3] * 2; data[k+5]  = a[4] * 2; data[k+6]  = a[5] * 2; data[k+7]  = 0;
            data[k+8]  = cb.x;     data[k+9]  = cb.y;     data[k+10] = cb.z;     data[k+11] = 0;
            data[k+12] = pos.x;    data[k+13] = pos.y;    data[k+14] = pos.z;    data[k+15] = 1;
            data[k+16] = color.r;  data[k+17] = color.g;  data[k+18] = color.b;  data[k+19] = color.a;
            data[k+20] = uv.x;     data[k+21] = uv.y;     data[k+22] = uv.w;     data[k+23] = uv.h;
            return;
        }

        // one that blends is drawn in its sorted place: the quad's six stream vertices written straight in with no
        // vectors made, for sprites that blend, and for particles when instancing is off
        const uvRect = render3DBeginStrip(6, tileInfo, unlit);
        if (!uvRect) return;
        const a = render3DBillboardAxes(size, angle, upright);
        const rx = a[0], ry = a[1], rz = a[2], ux = a[3], uy = a[4], uz = a[5];
        const x = pos.x, y = pos.y, z = pos.z, n = this.cameraBack, rgba = color.rgbaInt();
        const u0 = uvRect.x, v0 = uvRect.y, u1 = u0 + uvRect.w, v1 = v0 + uvRect.h;
        const floats = this.streamFloats, ints = this.streamInts, stride = RENDER3D_VERTEX_FLOATS;
        let j = this.streamCount * stride;
        this.streamCount += 6;
        // the corners in strip order with the repeats: top left twice, bottom left, top right, bottom right twice
        render3DWriteVertex(floats, ints, j, x - rx + ux, y - ry + uy, z - rz + uz, n, u0, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x - rx + ux, y - ry + uy, z - rz + uz, n, u0, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x - rx - ux, y - ry - uy, z - rz - uz, n, u0, v1, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx + ux, y + ry + uy, z + rz + uz, n, u1, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx - ux, y + ry - uy, z + rz - uz, n, u1, v1, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx - ux, y + ry - uy, z + rz - uz, n, u1, v1, rgba);
    }

    /** Draw a quad from four corners in loop order, counter clockwise seen from the front, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color|Array<Color>} [color] - One for all or one per corner */
    drawQuad(a, b, c, d, tileInfo, color=WHITE)
    {
        if (this.transparentQueue) // the queue replays later, so it keeps copies of what a caller may reuse
        {
            a = a.copy(), b = b.copy(), c = c.copy(), d = d.copy();
            color = isArray(color) ? color.map(k=> k.copy()) : color.copy();
        }
        this.drawStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS,
            render3DQuadValues(color), tileInfo);
    }

    /** Draw a triangle, counter clockwise from outside is the front
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Color} [color] */
    drawTriangle(a, b, c, color=WHITE)
    {
        if (this.transparentQueue) // the queue replays later, so it keeps copies of what a caller may reuse
            a = a.copy(), b = b.copy(), c = c.copy(), color = color.copy();
        this.drawStrip([a, b, c], render3DFaceNormal(a, b, c), undefined, color);
    }

    /** Draw a line as a camera facing ribbon, unlit
     *  @param {Vector3} posA
     *  @param {Vector3} posB
     *  @param {number} [width]
     *  @param {Color} [color] */
    drawLine(posA, posB, width=.1, color=WHITE)
    {
        this.drawRibbon([posA, posB], width, undefined, color);
    }

    /** Draw a ribbon along a path, unlit and visible from both sides; width and color can change along it
     *  - The texture runs along the length, u from the first point to the last
     *  - A path that ends where it starts is a loop, and joins with no seam
     *  @param {Array<Vector3>} points - Center line in order, at least two
     *  @param {number|Array<number>} [width] - Full width, one for all or one per point
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color|Array<Color>} [color] - One for all or one per point
     *  @param {Vector3|Array<Vector3>} [side] - Direction across the ribbon, one for all or one per point, default
     *    faces the camera */
    drawRibbon(points, width=.1, tileInfo, color=WHITE, side)
    {
        const count = points.length;
        ASSERT(count > 1, 'a ribbon needs at least two points');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo,
            'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        const strip = [], uvs = tileInfo ? [] : undefined, colors = [], forward = this.cameraForward;
        let across = vec3(1, 0, 0); // kept from the last point where the direction vanishes
        // a loop's two ends take their direction across the join, so they meet edge to edge
        const loop = count > 2 && points[0].distanceSquared(points[count - 1]) < 1e-12;
        for (let i = 0; i < count; ++i)
        {
            const p = points[i];
            const w = isArray(width) ? width[i] : width;
            let c = isArray(color) ? color[i] : color;
            if (this.transparentQueue) // the queue replays later, so it keeps a copy of a color a caller may reuse
                c = c.copy();
            const s = side && (isArray(side) ? side[i] : side);
            // across the path in the camera plane unless a side is given
            const next = points[i < count - 1 ? i + 1 : loop ? 1 : i];
            const last = points[i > 0 ? i - 1 : loop ? count - 2 : i];
            const dir = s || next.subtract(last).cross(forward);
            if (dir.lengthSquared() > 1e-12)
                across = dir.normalize();
            const half = across.scale(w / 2);
            strip.push(p.add(half), p.subtract(half));
            uvs?.push(vec2(i / (count - 1), 0), vec2(i / (count - 1), 1));
            colors.push(c, c);
        }
        render3DWithState({lighting: false, cullBackFaces: false},
            ()=> this.drawStrip(strip, forward.scale(-1), uvs, colors, tileInfo));
    }

    /** Draw a disc that fades to transparent at the rim, unlit, for glows, puffs and sky dots
     *  @param {Vector3} pos - Center
     *  @param {number} [size] - Diameter
     *  @param {Color} [color]
     *  @param {Vector3} [normal] - Facing direction, faces the camera by default
     *  @param {number} [sides]
     *  @return {void} */
    drawSoftDisc(pos, size=1, color=WHITE, normal=this.cameraBack, sides=16)
    {
        render3DAssertBlending();
        if (this.transparentQueue && !this.capture)
        {
            const p = pos.copy(), c = color.copy(), n = normal.copy(); // copies, the queue replays later
            return this.queueTransparent(p, ()=> this.drawSoftDisc(p, size, c, n, sides));
        }
        // basis in the disc's plane
        const n = normal.normalize();
        const helper = abs(n.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
        const u = helper.cross(n).normalize(), w = u.cross(n);
        render3DDrawSoftDisc(size / 2, color, sides, n, (c, s, r)=>
            vec3(pos.x + (u.x * c + w.x * s) * r, pos.y + (u.y * c + w.y * s) * r, pos.z + (u.z * c + w.z * s) * r));
    }

    /** Draw a soft round shadow on the ground under something, much cheaper than a real shadow
     *  - Draw it from onRenderTransparent or from a transparent object
     *  @param {Vector3} pos - Position of the thing casting the shadow
     *  @param {number} [size] - Diameter
     *  @param {number|HeightMap|function(number, number): number} [floorHeight] - Height of the ground, a HeightMap, or
     *    (x, z) => y to follow terrain
     *  @param {Color} [color]
     *  @param {number} [lift] - How far above the ground to draw, raise it if the shadow cuts into rough ground
     *  @return {void} */
    drawSoftShadow(pos, size=1, floorHeight=0, color=RENDER3D_SHADOW_COLOR, lift=.02)
    {
        render3DAssertBlending();
        // a HeightMap is in the extras plugin, so it is known by its getHeight rather than its class
        const heightMap = /** @type {HeightMap} */ (floorHeight);
        const height = /** @type {function(number, number): number} */ (isNumber(floorHeight) ? ()=> floorHeight
            : heightMap.getHeight ? (x, z)=> heightMap.getHeight(x, z) : floorHeight);
        if (this.transparentQueue && !this.capture) // sort from the floor, under whatever casts it
        {
            const p = pos.copy(), c = color.copy(); // copies, the queue replays later
            return this.queueTransparent(vec3(p.x, height(p.x, p.z) + lift, p.z),
                ()=> this.drawSoftShadow(p, size, floorHeight, c, lift));
        }
        render3DDrawSoftDisc(size / 2, color, 16, RENDER3D_DEFAULT_NORMAL, (c, s, r)=>
        {
            const x = pos.x + c * r, z = pos.z + s * r;
            return vec3(x, height(x, z) + lift, z);
        });
    }
}

function render3DAssertBlending()
{
    const r = render3D;
    ASSERT(r.blend || r.capture || r.shadowPass || !r.isRendering,
        'soft discs and shadows need blending: set the object transparent or draw from onRenderTransparent');
}

// draw the three rings of a soft disc as unlit strips, pointAt(cos, sin, radius) gives the world point
function render3DDrawSoftDisc(radius, color, sides, normal, pointAt)
{
    const alpha = [1, .9, .7, 0], circle = render3DCircle(sides); // alpha by ring, center to rim
    for (let k = 0; k < 3; ++k)
    {
        const points = [], colors = [];
        const c0 = color.withAlpha(color.a * alpha[k]), c1 = color.withAlpha(color.a * alpha[k+1]);
        const r0 = radius * k / 3, r1 = radius * (k + 1) / 3;
        for (let i = 0; i <= sides; ++i)
        {
            const c = circle[i*2], s = circle[i*2 + 1];
            points.push(pointAt(c, s, r1), pointAt(c, s, r0));
            colors.push(c1, c0);
        }
        render3D.drawStripUnlit(points, normal, undefined, colors);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Camera3D - Position, rotation and lens for the 3D view
 * - Looks down its -Z axis, rotation is vec3(pitch, yaw, roll)
 * @memberof Render3D
 */
class Camera3D
{
    /** Create a camera, looking down -Z from z=10 by default */
    constructor()
    {
        /** @property {Vector3} - World position */
        this.pos = vec3(0, 0, 10);
        /** @property {Vector3} - Euler rotation, vec3(pitch, yaw, roll) in radians */
        this.rotation = vec3();
        /** @property {number} - Vertical field of view in radians */
        this.fov = PI/3;
        /** @property {number} - Near clip distance */
        this.near = .1;
        /** @property {number} - Far clip distance, Infinity is allowed for a perspective view */
        this.far = 1e3;
        /** @property {number} - Visible height in world units for an orthographic view, 0 is perspective */
        this.orthographic = 0;
        /** @property {boolean} - Line the 3D camera up with the 2D camera, so 3D things at z=0 sit on the 2D sprites;
         *  it lines up with the 2D view of the main canvas, whatever canvas size a screenToRay is given */
        this.align2D = false;
        /** @property {number} - The z of the plane align2D lines up with the 2D view, the camera sitting its
         *  distance in front of it */
        this.align2DZ = 0;
    }

    /** Returns the camera's world transform
     *  @return {Matrix4} */
    getMatrix() { return buildMatrix(this.pos, this.rotation); }

    /** Returns the view matrix, world to camera space
     *  @return {Matrix4} */
    getViewMatrix() { return this.getMatrix().invert(); }

    /** Returns the projection matrix
     *  @param {number} aspect - Width over height
     *  @return {Matrix4} */
    getProjectionMatrix(aspect)
    {
        const h = this.orthographic / 2, w = h * aspect;
        return h ? Matrix4.orthographic(-w, w, -h, h, this.near, this.far) :
            Matrix4.perspective(this.fov, aspect, this.near, this.far);
    }

    /** Returns the direction the camera looks
     *  @return {Vector3} */
    getForward() { return render3DAxis(this.getMatrix().m, 8).scale(-1); }

    /** Returns the camera's right axis
     *  @return {Vector3} */
    getRight() { return render3DAxis(this.getMatrix().m, 0); }

    /** Returns the camera's up axis
     *  @return {Vector3} */
    getUp() { return render3DAxis(this.getMatrix().m, 4); }

    /** Point the camera at a target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target) { this.rotation = render3DLookRotation(target.subtract(this.pos), this.rotation); }

    /** Put the camera on an orbit around a target, looking at it
     *  @param {Vector3} target
     *  @param {number} distance
     *  @param {number} yaw - Radians around Y
     *  @param {number} [pitch] - Radians above the horizon */
    orbit(target, distance, yaw, pitch=.5)
    {
        const r = cos(pitch) * distance;
        this.pos = target.add(vec3(sin(yaw) * r, sin(pitch) * distance, cos(yaw) * r));
        // straight down has no yaw of its own to look along, so the orbit's yaw is used, and a top down view turns
        this.rotation = render3DLookRotation(target.subtract(this.pos), vec3(0, yaw, 0));
    }

    /** Chase a target from an offset, easing toward it, and look at it
     *  @param {Vector3} target
     *  @param {Vector3} offset - Where to sit relative to the target
     *  @param {number} [percent] - How far to move toward the spot each call, 1 snaps */
    follow(target, offset, percent=1)
    {
        this.pos = this.pos.lerp(target.add(offset), percent);
        this.lookAt(target);
    }

    /** Line the 3D camera up with the 2D camera, called automatically when align2D is set
     *  @param {number} [canvasHeight] - Defaults to the main canvas height */
    update2D(canvasHeight=mainCanvasSize.y)
    {
        const halfHeight = canvasHeight / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.fov/2);
        // a zoomed out 2D camera sits a long way back, far enough to fall past the far plane and
        // clip the whole scene away, which looks like nothing rendering at all
        ASSERT(!canvasHeight || distance < this.far,
            'align2D needs this camera distance to match the 2D view, raise camera.far past it', distance);
        this.orthographic &&= halfHeight * 2; // an orthographic camera stays orthographic and shows the same height
        this.pos = vec3(cameraPos.x, cameraPos.y, this.align2DZ + distance);
        this.rotation = vec3(0, 0, -cameraAngle); // 2D angles turn the other way
    }
}

///////////////////////////////////////////////////////////////////////////////
// GL setup, shaders and the frame hooks

// the four attributes of a 36 byte vertex at the locations the shaders declare: location, size, type, normalize, byte offset
/** @type {Array<[number, number, number, boolean, number]>} */
const RENDER3D_ATTRIBS = [[0, 3, 5126, false, 0], [1, 3, 5126, false, 12], [2, 2, 5126, false, 24], [3, 4, 5121, true, 32]];

// the vertex shader, shared by the plugin's program and every Shader's
// attributes: p position, n normal, t uv, c color, at fixed slots the depth shader also uses
// uniforms: viewProj, lightViewProj; the model matrix, the tint and the uv rect are vertex attributes, see
// RENDER3D_VERTEX_INPUTS; L is the mesh's own uv for a Shader's localUV
// the normal matrix comes from the model matrix here: each column over its squared length, which is the inverse
// transpose of any rotation and scale, mirrored or not, and skips a 3x3 inverse per draw on the CPU; a sheared
// matrix, one built by multiplying rotations with scales between them, gets normals that are only close
const RENDER3D_VERTEX_SOURCE =
    '#version 300 es\n' +
    'precision highp float;' +
    'uniform mat4 viewProj,lightViewProj;' +
    RENDER3D_VERTEX_INPUTS +
    'out vec3 P,N;out vec2 T,L;out vec4 C,S;' +
    'void main(){' +
    'vec4 w=mat4(m0,m1,m2,m3)*vec4(p,1.);' +
    'gl_Position=viewProj*w;' +
    'P=w.xyz;' +
    'vec3 c0=m0.xyz,c1=m1.xyz,c2=m2.xyz;' +
    'N=mat3(c0/max(dot(c0,c0),1e-20),c1/max(dot(c1,c1),1e-20),c2/max(dot(c2,c2),1e-20))*n;' +
    'T=uvRect.xy+t*uvRect.zw;' +
    'L=t;' +
    'C=c*tint;' +
    'S=lightViewProj*w;' +
    '}';

// the names a Shader's snippet can use in 3D, over the plugin's own uniforms and varyings
const RENDER3D_SNIPPET_NAMES =
    'uniform float iTime;uniform vec3 iResolution;\n' +
    '#define iChannel0 tex\n' +
    '#define localUV L\n' +
    '#define worldPos P\n' +
    '#define worldNormal N\n' +
    '#define sunDirection (-lightDir.xyz)\n' +
    '#define sunColor lightColor.rgb\n' +
    '#define ambientColor ambientFog.rgb\n' +
    '#define ambientGroundColor ambientGround.rgb\n' +
    '#define lightCount extraLightCount\n' +
    '#define lights extraLights\n' +
    '#define lightColors extraLightColors\n';

// the fragment shader; given a Shader's snippet, its mainImage replaces the texture sample and all else is the same,
// and a mainNormal in it bends the normal after the normal map, before all the lighting reads it
// uniforms: lightDir (xyz the way the sunlight travels, w = emissive, 1 or more skips the lighting),
//   lightColor (the sun's rgb, a = specular), ambientFog (rgb, a = fogEnd), fogColor (rgb, a = fogStart),
//   cameraPos, tex, shadowMap, shadowParams (x = shadows on, y = bias, z = blur step in texture space,
//   w = how the draw finishes: 1 opaque and alpha tested, 0 blended, -1 additive),
//   materialParams (x = normal map scale, 0 skips it, y = shininess, z = reflectivity), emissiveTint (rgb, a = the
//   emissive map is on), skyTop, skyHorizon, skyBottom (what a reflection shows), normalTex, emissiveTex
function render3DFragmentSource(fragmentCode)
{
    const hasNormal = /\bmainNormal\s*\(/.test(fragmentCode || '');
    return '#version 300 es\n' +
        'precision highp float;' +
        'uniform vec4 lightDir,lightColor,ambientFog,ambientGround,fogColor,shadowParams;' +
        'uniform vec4 extraLights[' + RENDER3D_MAX_LIGHTS + '],extraLightColors[' + RENDER3D_MAX_LIGHTS + '];' +
        'uniform vec4 extraLightCones[' + RENDER3D_MAX_LIGHTS + '];' +
        'uniform int extraLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform vec4 materialParams,emissiveTint,skyTop,skyHorizon,skyBottom,gelAxes;' +
        'uniform sampler2D tex,normalTex,emissiveTex,gelTex;' +
        'uniform samplerCube envMap;' + // the environment, when envParams.x is 1, envParams.y its last mipmap, z the
        // level a shininess of -1 would read, log2(size * .45), and w the level a turn of one radian a pixel reads
        'uniform vec4 envParams;' +
        'uniform bool premultipliedTexture;' + // is the texture a render target, which holds premultiplied color
        'uniform highp sampler2DShadow shadowMap;' +
        'in vec3 P,N;in vec2 T,L;in vec4 C,S;' +
        'out vec4 o;' +
        // the shadow at this fragment, 0 to 1: the light's depth map with a 3x3 blur, outside the map is lit; the
        // sun's map is flat and S.w is 1, a spotlight's has perspective and S.w is the distance from it, where the
        // bias shrinks by its square to stay the same distance in the world
        'float shadow(){' +
        'if(shadowParams.x<=0.||S.w<=0.)return 1.;' +
        'vec3 q=S.xyz/S.w*.5+.5;' +
        'if(any(greaterThanEqual(abs(q-.5),vec3(.5))))return 1.;' +
        'q.z-=shadowParams.y/(S.w*S.w);' +
        'float s=0.;' +
        'for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y)' +
        's+=texture(shadowMap,vec3(q.xy+vec2(x,y)*shadowParams.z,q.z));' +
        'return s/9.;}' +
        // the gel the shadow light shines through, at this fragment's place in its view, upright as it looks out;
        // white with no gel, so a light without one is exactly as before
        'vec3 gel(){' +
        'if(S.w<=0.)return vec3(1);' +
        'vec2 g=S.xy/S.w,u=vec2(dot(gelAxes.xy,g),dot(gelAxes.zw,g))*.5+.5;' +
        'return texture(gelTex,vec2(u.x,1.-u.y)).rgb;}' +
        // the normal map's normal here, in the frame that the position and texture coordinate change along across the
        // screen, so a mesh needs no tangents; green points up the image and v runs down it, so up is -v;
        // a mesh with no texture coordinates has no frame and keeps its own normal
        'vec3 normalMapNormal(vec3 n){' +
        'vec3 p1=dFdx(P),p2=dFdy(P);vec2 t1=dFdx(T),t2=dFdy(T);' +
        'vec3 a=cross(p2,n),b=cross(n,p1),u=a*t1.x+b*t2.x,v=a*t1.y+b*t2.y;' +
        'float k=max(dot(u,u),dot(v,v));' +
        'if(k<=0.)return n;' +
        'vec3 m=texture(normalTex,T).xyz*2.-1.;' +
        'm.xy*=materialParams.x;' +
        'return normalize((u*m.x-v*m.y)*inversesqrt(k)+n*m.z);}' +
        // a snippet's mainImage is declared here and written after main, so a define in it can not reach main
        (fragmentCode ? 'void mainImage(out vec4,vec2);' : '') +
        (hasNormal ? 'void mainNormal(inout vec3);' : '') +
        'void main(){' +
        (fragmentCode ? 'vec4 t;mainImage(t,T);' : 'vec4 t=texture(tex,T);') +
        'if(premultipliedTexture&&t.a>0.)t.rgb/=t.a;' + // back to straight color, what the lighting and blend expect
        'vec4 c=C*t;' +
        'float e=lightDir.w;' +
        'if(e<1.){' +
        'vec3 n=dot(N,N)>0.?normalize(N):vec3(0,1,0);' +
        'if(!gl_FrontFacing)n=-n;' + // only a double sided mesh shows a back face, light it on the side that is seen
        'if(materialParams.x!=0.)n=normalMapNormal(n);' +
        (hasNormal ? 'mainNormal(n);n=normalize(n);' : '') +
        'float nl=dot(n,-lightDir.xyz);' +
        // the shadow is the sun's, or one spotlight's: shadowParams.x is 1 for the sun, 2 and up for that Light3D
        'float sh=shadow(),s=shadowParams.x<1.5?sh:1.;' +
        'int si=int(shadowParams.x+.5)-2;' +
        // the ambient: one color, or blended from the ground color below to the sky color above by the way the face points
        'vec3 l=(ambientGround.a>0.?mix(ambientGround.rgb,ambientFog.rgb,n.y*.5+.5):ambientFog.rgb)+lightColor.rgb*max(nl,0.)*s;' +
        // the Light3D objects: a point light falls off with distance, a directional one does not and carries the
        // direction toward it in xyz, marked by a negative radius; each adds its own highlight when there is a strength
        'vec3 eye=lightColor.a>0.?normalize(cameraPos-P):vec3(0),sp=vec3(0);' +
        'for(int i=0;i<' + RENDER3D_MAX_LIGHTS + ';++i){' +
        'if(i>=extraLightCount)break;' +
        'vec4 L=extraLights[i];' +
        'bool directional=L.w<0.;' +
        'vec3 v=directional?L.xyz:L.xyz-P;' +
        'float d=length(v);' +
        'float a=directional?1.:max(0.,1.-d/L.w);' +
        'v/=max(d,1e-6);' +
        'float ln=dot(n,v);' +
        'vec3 lc=extraLightColors[i].rgb*extraLightColors[i].a*a*a;' +
        // a spotlight's cone: full where its fade starts, nothing at its edge, smooth between; 1 with no cone
        'vec4 K=extraLightCones[i];' +
        'float k=clamp(dot(K.xyz,-v)-K.w,0.,1.);' +
        'lc*=k*k*(3.-2.*k);' +
        'if(i==si)lc*=sh*gel();' +
        'l+=lc*max(0.,ln);' +
        'if(lightColor.a>0.)sp+=lc*pow(max(dot(reflect(-v,n),eye),0.),materialParams.y)*step(0.,ln);' +
        '}' +
        'c.rgb*=l*(1.-e)+e;' + // lit, blended toward its own color by how emissive it is
        // specular: the sun's only where its light hits and out of shadow, then the Light3D highlights,
        // skipped entirely when the strength is zero
        'if(lightColor.a>0.){' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,eye),0.),materialParams.y)*lightColor.a*step(0.,nl)*s*(1.-e)+sp*lightColor.a*(1.-e);' +
        '}' +
        // the sky along the reflected view, more at a glancing angle (Schlick's Fresnel); sky light, so the sun's
        // shadow does not dim it
        'if(materialParams.z>0.){' +
        'vec3 w=normalize(P-cameraPos),q=reflect(w,n);' +
        'float f=materialParams.z+(1.-materialParams.z)*pow(clamp(1.-dot(n,-w),0.,1.),5.);' +
        // the environment when there is one, blurred more the lower the shininess, a mirror at a shininess of
        // 10000 and toward its last mipmap at 1, or by how far the reflection turns from one pixel to the next when
        // that is more, so a small mirror reads the blur of what its pixels cover instead of sparkling
        'c.rgb=mix(c.rgb,envParams.x>0.?textureLod(envMap,q,clamp(max(envParams.z-.5*log2(materialParams.y+2.),' +
        'envParams.w+log2(max(max(length(dFdx(q)),length(dFdy(q))),1e-9))),0.,envParams.y)).rgb:' +
        'q.y>0.?mix(skyHorizon.rgb,skyTop.rgb,q.y):mix(skyHorizon.rgb,skyBottom.rgb,-q.y),f);' +
        '}}else c.rgb*=e;' + // fully emissive: its own color, or brighter, with no lighting to work out
        // the emissive map adds its light on top, lit or not
        'if(emissiveTint.a>0.)c.rgb+=texture(emissiveTex,T).rgb*emissiveTint.rgb;' +
        'if(ambientFog.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,shadowParams.w<0.?vec3(0):fogColor.rgb,smoothstep(fogColor.a,ambientFog.a,z));' +
        '}' +
        // an opaque draw drops see through texels, as the shadow map does, at the end, after the normal map's
        // derivatives and the texture samples, which need the pixels around them, and stays opaque otherwise
        'if(shadowParams.w>0.&&t.a<.5)discard;' +
        'o=vec4(c.rgb,shadowParams.w>0.?1.:c.a);' +
        '}' +
        (fragmentCode ? '\n' + RENDER3D_SNIPPET_NAMES + fragmentCode + '\n' : '');
}

// a Shader's 3D program, compiled the first time a draw needs it
function render3DShaderProgram(shader)
{
    ASSERT(shader instanceof Shader, 'render3D.shader must be a Shader, not the snippet itself');
    shader.program3D || glShaderTrack(shader); // one let go of and drawn again is kept for a lost context again
    const program = shader.program3D ||= glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource(shader.fragmentCode));
    return glFailedPrograms.has(program) ? render3D.program : program; // one that did not build draws as with none
}

// make a program current for the pass and send it the pass uniforms: the matrices, the camera and the lights,
// plus the time and canvas size for a Shader's program; the per draw uniform cache starts over
function render3DUseProgram(program)
{
    const gl = glContext, r = render3D;
    gl.useProgram(r.currentProgram = program);
    r.uniformValues = {};
    gl.uniformMatrix4fv(render3DUniform('viewProj'), false, r.viewProjection.m);
    gl.uniformMatrix4fv(render3DUniform('lightViewProj'), false, r.shadowMatrix.m);
    gl.uniform1i(render3DUniform('tex'), 0);
    gl.uniform1i(render3DUniform('shadowMap'), 1);
    gl.uniform1i(render3DUniform('normalTex'), 2);
    gl.uniform1i(render3DUniform('emissiveTex'), 3);
    gl.uniform1i(render3DUniform('gelTex'), 4);
    gl.uniform1i(render3DUniform('envMap'), 5);
    gl.uniform4fv(render3DUniform('gelAxes'), r.gelAxes);
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);
    gl.uniform1i(render3DUniform('extraLightCount'), r.lightCount);
    if (r.lightCount)
    {
        gl.uniform4fv(render3DUniform('extraLights'), r.lightPositions, 0, r.lightCount * 4);
        gl.uniform4fv(render3DUniform('extraLightColors'), r.lightColors, 0, r.lightCount * 4);
        gl.uniform4fv(render3DUniform('extraLightCones'), r.lightCones, 0, r.lightCount * 4);
    }
    if (program !== r.program)
    {
        gl.uniform1f(render3DUniform('iTime'), time);
        const face = r.capturingCube?.size; // in a capture the face is the screen
        gl.uniform3f(render3DUniform('iResolution'), face || glCanvas.width, face || glCanvas.height, 1);
    }
}

function render3DInitGL()
{
    if (headlessMode) return;
    if (!glEnable || !glContext)
    {
        // a device whose WebGL could not draw, which fell back to Canvas2D, is not helped by setting glEnable
        console.warn(!glDeviceFailed ? 'Render3DPlugin: WebGL not enabled, construct the plugin in gameInit with glEnable set'
            : 'Render3DPlugin: this device can not draw WebGL, so nothing 3D is drawn');
        return;
    }
    const gl = glContext, r = render3D;
    glFlush(); // a pending 2D batch draws now, while the engine's own buffer, vertex array and program are bound
    r.uniforms = new WeakMap;
    r.uniformValues = {};
    render3DShadowCut = undefined; // the shadow shader is new too
    r.attribValues = []; // a fresh context has its own attribute defaults, so nothing sent before it counts

    // the shader, see RENDER3D_VERTEX_SOURCE and render3DFragmentSource
    r.program = glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource());

    // the depth only shader for the shadow map, same vertex layout; see through pixels cast nothing, so sprites and
    // cut out textures cast their outline, and a blended object faded below half its alpha casts nothing, as it
    // draws; an opaque one draws solid whatever its tint alpha, and casts so
    r.shadowShader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj;' +
        RENDER3D_VERTEX_INPUTS +
        'out vec2 T;out float A;' +
        'void main(){T=uvRect.xy+t*uvRect.zw;A=c.a*tint.a;gl_Position=viewProj*mat4(m0,m1,m2,m3)*vec4(p,1.);}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform sampler2D tex;' +
        'uniform float cut;' + // 1 for a blended batch, cut by its tint and vertex alpha too, 0 by the texture only
        'in vec2 T;in float A;' +
        'void main(){if(texture(tex,T).a*mix(1.,A,cut)<.5)discard;}'
    );

    // a program that did not build in a release build would fail every draw: 3D stays off, said once, since the pass
    // returns when there is no program, and a lost context that comes back tries again
    if (glFailedPrograms.has(r.program) || glFailedPrograms.has(r.shadowShader))
    {
        console.error('Render3DPlugin: its shaders did not build on this device, so nothing 3D is drawn');
        r.program = r.shadowShader = undefined;
        return;
    }

    // the vertex array object with the attributes enabled once, pointers are set per buffer by render3DBindVertexBuffer
    // the per instance attributes get their divisor only while a batch has them on, see render3DDrawInstanced
    r.vao = gl.createVertexArray();
    gl.bindVertexArray(r.vao);
    for (const [location] of RENDER3D_ATTRIBS)
        gl.enableVertexAttribArray(location);

    // the stream buffer
    r.streamBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.streamBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, r.streamData.byteLength, gl.DYNAMIC_DRAW);
    r.streamCount = 0;
    r.instanceBuffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];

    // white texture for untextured draws, and a one texel shadow map that keeps the shadow sampler valid until shadows
    // are on
    r.whiteTexture = glCreateTexture();

    r.samplers = new Map;
    r.samplerKey = undefined;
    render3DUpdateShadowMap(1);

    // hand the engine back its own buffer, vertex array and program, the 2D batch was flushed before they changed
    gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
    glSetInstancedMode(true);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * CubeMap - Six square images all around a point, the world far away: what reflective surfaces reflect as
 * render3D.environment, and the sky as render3D.skyBox
 * - makeCubeMap paints one from a function of direction, loadCubeMap loads six images
 * - Made with no faces it is drawn from the scene: capture(pos3D) draws everything around that point into it in the
 *   next frame's 3D pass, six views of the whole scene, so capture once for a still scene or now and then for one
 *   that moves
 * - Its faces are in WebGL's order and lay out, +x, -x, +y, -y, +z, -z: WebGL's cube is left handed, so in this right
 *   handed world a face seen from the middle is mirrored; loadCubeMap turns a sky box set's images to it
 * @memberof Render3D
 * @example
 * render3D.environment = render3D.skyBox = makeCubeMap(64, (d)=> hsl(.6, .8, .4 + d.y * .4));
 * @example
 * // a chrome ball that reflects the scene around it, captured once
 * const ball = new EngineObject3D(vec3(0, 1, 0), render3D.sphereMesh, undefined, BLACK);
 * ball.reflectivity = 1;
 * ball.shininess = 1e4;
 * render3D.environment = new CubeMap(128);
 * render3D.environment.capture(ball.pos3D);
 */
class CubeMap
{
    /** Make a cube map from its six faces, as makeCubeMap and loadCubeMap do, or with none to capture the scene into
     *  @param {number} size - Pixels a side of each face
     *  @param {Array<Uint8Array|HTMLImageElement|HTMLCanvasElement|ImageBitmap|OffscreenCanvas>} [faces] - +x, -x,
     *  +y, -y, +z and -z, RGBA pixels row by row or images; none for a cube map drawn by capture */
    constructor(size, faces)
    {
        ASSERT(isNumber(size) && size >= 1 && size % 1 === 0, 'a cube map\'s size must be a whole positive number', size);
        ASSERT(faces === undefined || isArray(faces) && faces.length === 6, 'a cube map has six faces');
        ASSERT(!faces || faces.every((face)=> face instanceof Uint8Array ? face.length === size * size * 4 :
            face.width === size && face.height === size), 'each face of a cube map is size by size, RGBA or an image');
        /** @property {number} - Pixels a side of each face */
        this.size = size;
        /** @property {Array<Uint8Array|HTMLImageElement|HTMLCanvasElement|ImageBitmap|OffscreenCanvas>|undefined} -
         *  Its faces, kept to upload again after a lost context, undefined for one drawn by capture
         *  @type {Array<Uint8Array|HTMLImageElement|HTMLCanvasElement|ImageBitmap|OffscreenCanvas>|undefined} */
        this.faces = faces;
        /** @property {Vector3|undefined} - Where it was last captured from, and is captured from again after a lost
         *  context
         *  @type {Vector3|undefined} */
        this.capturePos = undefined;
        /** @type {WebGLTexture|undefined} */
        this.glTexture = undefined; // made by the first pass that uses it
        this.contextGeneration = -1;
    }

    /** Draw the scene around a point into a cube map made with no faces, in the next frame's 3D pass
     *  - Every object of the layer render3D.renderAfter2D picks is drawn, with the sky and the render callbacks; the
     *    camera's near and far planes, the lights and the fog are the scene's
     *  - It is six more draws of the scene, so capture once for a still scene, or every few frames for a moving one
     *  - A closed mesh around the point, like the ball that reflects it, is not seen from inside, so it hides nothing
     *  - While it is drawn, what would reflect it reflects the sky's colors in its place
     *  - It is seen from one point, so it suits what is near that point best, give each mirror its own with
     *    obj.environment
     *  @param {Vector3} pos3D - The point it is seen from */
    capture(pos3D)
    {
        ASSERT(!this.faces, 'only a cube map made with no faces can capture the scene');
        ASSERT(isVector3(pos3D), 'capture needs a Vector3');
        this.capturePos = pos3D.copy();
        render3D.cubeCaptures.add(this);
    }

    /** Free its texture, which is made again if it is used after */
    dispose()
    {
        this.glTexture && glContext?.deleteTexture(this.glTexture);
        this.glTexture = undefined;
        render3D?.cubeCaptures.delete(this);
    }
}

/** Make a cube map by asking a function the color of each direction
 *  - The function gets a unit Vector3 for each pixel of each face and gives a Color
 *  - It runs size * size * 6 times, so a size of 64 or 128 makes one at once, larger takes a moment
 *  @param {number} size - Pixels a side of each face
 *  @param {function(Vector3): Color} colorOf - The color seen looking that way
 *  @return {CubeMap}
 *  @example
 *  // a sky, blue above and pale at the horizon, with a sun
 *  const sun = vec3(1, 1, -1).normalize();
 *  render3D.environment = makeCubeMap(64, (d)=> hsl(.6, .7, .9 - max(d.y, 0) * .5).lerp(WHITE, max(0, d.dot(sun)) ** 64));
 *  @memberof Render3D */
function makeCubeMap(size, colorOf)
{
    ASSERT(isNumber(size) && size >= 1 && size % 1 === 0, 'makeCubeMap needs a whole size', size);
    ASSERT(typeof colorOf === 'function', 'makeCubeMap needs a function of direction');
    const faces = [];
    for (let face = 0; face < 6; ++face)
    {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; ++y)
        for (let x = 0; x < size; ++x)
        {
            const color = colorOf(render3DCubeDirection(face, (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1));
            const i = (x + y * size) * 4;
            data[i]   = clamp(color.r) * 255 + .5 | 0;
            data[i+1] = clamp(color.g) * 255 + .5 | 0;
            data[i+2] = clamp(color.b) * 255 + .5 | 0;
            data[i+3] = clamp(color.a) * 255 + .5 | 0;
        }
        faces.push(data);
    }
    return new CubeMap(size, faces);
}

/** Load a cube map from six square images of one size
 *  - The images are a sky box set as three.js's CubeTextureLoader takes them, and show the same: each face seen from
 *    inside as its image is drawn
 *  @param {Array<string>} sources - The images of +x, -x, +y, -y, +z and -z, as a sky box set names them right,
 *  left, top, bottom, front and back
 *  @return {Promise<CubeMap>}
 *  @memberof Render3D */
async function loadCubeMap(sources)
{
    ASSERT(isArray(sources) && sources.length === 6, 'loadCubeMap takes six images, +x, -x, +y, -y, +z and -z');
    const images = await Promise.all(sources.map((src)=> new Promise((resolve, reject)=>
    {
        const image = new Image;
        image.crossOrigin = 'anonymous';
        image.onload = ()=> resolve(image);
        image.onerror = ()=> reject(new Error('loadCubeMap could not load ' + src));
        image.src = src;
    })));
    const size = images[0].width;
    if (!images.every((image)=> image.width === size && image.height === size))
        throw new Error('loadCubeMap needs six square images of one size');
    // a sky box set is drawn for WebGL's cube, which is left handed: in this right handed world each face would show
    // mirrored, so as three.js does each is drawn mirrored, and +x and -x trade places, and every face is then seen
    // from inside as its image shows
    const faces = [1, 0, 2, 3, 4, 5].map((i)=>
    {
        const context = createCanvasContext(size);
        context.scale(-1, 1);
        context.drawImage(images[i], -size, 0);
        return context.canvas;
    });
    return new CubeMap(size, faces);
}

// the direction of a point on a cube map's face, s and t from -1 to 1 across and down the face as WebGL lays it out
function render3DCubeDirection(face, s, t)
{
    const d = face === 0 ? vec3(1, -t, -s) : face === 1 ? vec3(-1, -t, s) : face === 2 ? vec3(s, 1, t) :
        face === 3 ? vec3(s, -1, -t) : face === 4 ? vec3(s, -t, 1) : vec3(-s, -t, -1);
    return d.normalize();
}

// a cube map's texture, uploaded with its mipmaps the first time and again after a lost context, bound to the
// cube map target of the active unit; undefined with no cube map or no WebGL
function render3DCubeTexture(cube)
{
    const gl = glContext;
    if (!cube || !gl) return;
    if (cube.glTexture && cube.contextGeneration === render3D.contextGeneration)
        return cube.glTexture;
    const texture = cube.glTexture = gl.createTexture();
    cube.contextGeneration = render3D.contextGeneration;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // a face's first row is its top, as the cube's faces are laid out
    if (!cube.faces)
    {
        // drawn by a capture: empty faces, black until the capture, which happens again when the context was lost;
        // a size the device can not make falls back to the largest it can, as the shadow map's does
        cube.size = min(cube.size, gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
            gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        for (let i = 0; i < 6; ++i)
            gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, cube.size, cube.size, 0, gl.RGBA,
                gl.UNSIGNED_BYTE, null);
        cube.capturePos && render3D.cubeCaptures.add(cube);
    }
    else cube.faces.forEach((face, i)=> face instanceof Uint8Array ?
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, cube.size, cube.size, 0, gl.RGBA,
            gl.UNSIGNED_BYTE, face) :
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face));
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP); // the blur of a rough surface's reflection
    return texture;
}

// the transform of a camera at pos looking out through a cube map face, 90 degrees across: right, up and forward are
// the face's directions toward its right edge, toward its last row and through its middle, from the same table
// render3DCubeDirection reads, so a captured face lays out as an uploaded one; up is down the face, as a
// framebuffer's rows go up
function render3DCubeFaceMatrix(face, pos)
{
    const [right, up, forward] = [
        [vec3(0, 0, -1), vec3(0, -1, 0), vec3(1, 0, 0)],
        [vec3(0, 0, 1), vec3(0, -1, 0), vec3(-1, 0, 0)],
        [vec3(1, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)],
        [vec3(1, 0, 0), vec3(0, 0, -1), vec3(0, -1, 0)],
        [vec3(1, 0, 0), vec3(0, -1, 0), vec3(0, 0, 1)],
        [vec3(-1, 0, 0), vec3(0, -1, 0), vec3(0, 0, -1)]][face];
    return new Matrix4([right.x, right.y, right.z, 0, up.x, up.y, up.z, 0,
        -forward.x, -forward.y, -forward.z, 0, pos.x, pos.y, pos.z, 1]);
}

// draw the cube maps asked for by capture, each face a view of the layer's objects from its point, with the sky and
// the render callbacks, into a framebuffer of its own; the camera, the matrices and the frame's viewport are put
// back after, and the environment unit is bound again, since a texture can not be read while it is drawn
function render3DCaptureCubes(objects)
{
    const gl = glContext, r = render3D, camera = r.camera;
    const captures = [...r.cubeCaptures];
    r.cubeCaptures.clear();
    if (!r.captureFramebuffer)
    {
        r.captureFramebuffer = gl.createFramebuffer();
        r.captureDepth = gl.createRenderbuffer();
        r.captureDepthSize = 0;
    }
    // a camera looking out through each face in turn, its matrix the face's
    const view = new Camera3D;
    view.fov = PI / 2;
    view.near = camera.orthographic || !(camera.near > 0) ? .1 : camera.near; // an orthographic camera's may be behind it
    view.far = camera.far;
    let faceMatrix = new Matrix4;
    view.getMatrix = ()=> faceMatrix.copy();
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.captureFramebuffer);
    try
    {
        for (const cube of captures)
        {
            const texture = render3DCubeTexture(cube), size = cube.size;
            r.cubeCaptures.delete(cube); // a texture made just now asks again, it is drawn here
            if (r.captureDepthSize !== size)
            {
                gl.bindRenderbuffer(gl.RENDERBUFFER, r.captureDepth);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r.captureDepth);
                r.captureDepthSize = size;
            }
            // nothing reads the texture while it is drawn: the environment unit lets it go and the shader reflects
            // the sky's colors in its place, and it is not drawn as the sky box
            r.capturingCube = cube;
            gl.activeTexture(gl.TEXTURE0 + 5);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
            gl.activeTexture(gl.TEXTURE0);
            render3DBoundEnvironment = null;
            gl.viewport(0, 0, size, size);
            view.pos = cube.capturePos;
            r.camera = view;
            for (let face = 0; face < 6; ++face)
            {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                    texture, 0);
                ASSERT(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE,
                    'cube map capture framebuffer is incomplete');
                faceMatrix = render3DCubeFaceMatrix(face, cube.capturePos);
                r.updateMatrices(1);
                if (face < 2 || face > 3)
                {
                    // a side face's up is world down, as the cube lays its rows out, so sprites and particles, built
                    // on the camera's right and up, would stand on their heads: half a turn about forward puts them
                    // on world up, and leaves forward and the sort the same
                    r.cameraRight = r.cameraRight.scale(-1);
                    r.cameraUp = r.cameraUp.scale(-1);
                }
                const c = canvasClearColor;
                gl.clearColor(c.r, c.g, c.b, 1);
                gl.depthMask(true);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                render3DUseProgram(r.program);
                r.renderStages(objects, true);
            }
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP); // the blur of a rough surface's reflection
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
        }
    }
    finally
    {
        r.capturingCube = undefined;
        r.camera = camera;
        r.updateMatrices();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.activeTexture(gl.TEXTURE0 + 5);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, render3DCubeTexture(r.environment) || null);
        gl.activeTexture(gl.TEXTURE0);
        render3DBoundEnvironment = r.environment || null;
    }
}

// draw a cube map as the sky: one triangle over the whole screen, each pixel the cube's color the way it looks,
// with its own program and an empty vertex array, the pass's state put back after; false when the program did not
// build, in a release build, so the dome draws in its place
function render3DDrawSkyBox(cube)
{
    const gl = glContext, r = render3D;
    r.skyBoxProgram ||= glCreateProgram(
        '#version 300 es\nprecision highp float;out vec2 v;' +
        'void main(){v=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(v,0,1);}',
        '#version 300 es\nprecision highp float;uniform mat4 inverseViewProj;uniform samplerCube sky;in vec2 v;' +
        'out vec4 o;void main(){vec4 a=inverseViewProj*vec4(v,-1,1),b=inverseViewProj*vec4(v,0,1);' +
        'o=vec4(texture(sky,b.xyz/b.w-a.xyz/a.w).rgb,1);}'); // the way through this pixel, near plane to beyond
    if (glFailedPrograms.has(r.skyBoxProgram)) return false;
    r.skyBoxVao ||= gl.createVertexArray();
    const depthTest = gl.isEnabled(gl.DEPTH_TEST), blend = gl.isEnabled(gl.BLEND), cull = gl.isEnabled(gl.CULL_FACE);
    const depthWrite = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.useProgram(r.skyBoxProgram);
    r.currentProgram = undefined; // the next draw picks its program again
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, render3DCubeTexture(cube));
    gl.bindSampler(6, null);
    gl.uniform1i(glUniformLocation(r.skyBoxProgram, 'sky'), 6);
    // the view turned but not moved: the way through a pixel does not depend on where the camera is, and two points
    // near the origin keep their difference, where points a long way out lose it to float precision
    const turn = r.viewMatrix.copy();
    turn.m[12] = turn.m[13] = turn.m[14] = 0;
    gl.uniformMatrix4fv(glUniformLocation(r.skyBoxProgram, 'inverseViewProj'), false,
        r.projectionMatrix.copy().multiply(turn).invert().m);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.bindVertexArray(r.skyBoxVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(r.vao);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    gl.activeTexture(gl.TEXTURE0);
    depthTest && gl.enable(gl.DEPTH_TEST);
    blend && gl.enable(gl.BLEND);
    cull && gl.enable(gl.CULL_FACE);
    gl.depthMask(depthWrite);
    return true;
}

function render3DContextLost()
{
    const r = render3D;
    r.program = r.currentProgram = r.shadowShader = r.vao = r.streamBuffer = r.whiteTexture = undefined;
    r.skyBoxProgram = r.skyBoxVao = r.captureFramebuffer = r.captureDepth = undefined;
    r.captureDepthSize = 0;
    for (const shader of glShaderObjects)
        shader.program3D = undefined; // compiled again by the next draw
    r.lightCount = 0;
    r.instanceBuffers = [];
    r.samplers = new Map;
    r.samplerKey = undefined;
    render3DClearInstances();
    r.shadowFramebuffer = r.shadowTexture = undefined;
    r.shadowTextureSize = 0;
    r.cameraDepthFramebuffer = r.cameraDepthTexture = undefined;
    r.cameraDepthWidth = r.cameraDepthHeight = 0;
    r.streamCount = 0;
    ++r.contextGeneration; // every uploaded mesh is stale now, the soft dot is a TextureInfo the engine restores
}

function render3DContextRestored()
{
    render3DInitGL();
}

// a uniform location, looked up once per program
function render3DUniform(name, program=render3D.currentProgram)
{
    const u = render3D.uniforms;
    let cache = u.get(program);
    cache || u.set(program, cache = {});
    return cache[name] ??= glContext.getUniformLocation(program, name);
}

// the model matrix, the tint and the uv rect as constant attributes for one draw
function render3DDrawAttribs(m, tint, uvRect)
{
    const gl = glContext;
    gl.vertexAttrib4f(4, m[0], m[1], m[2], m[3]);
    gl.vertexAttrib4f(5, m[4], m[5], m[6], m[7]);
    gl.vertexAttrib4f(6, m[8], m[9], m[10], m[11]);
    gl.vertexAttrib4f(7, m[12], m[13], m[14], m[15]);
    render3DAttrib4f(11, tint.r, tint.g, tint.b, tint.a);
    render3DAttrib4f(12, uvRect.x, uvRect.y, uvRect.w, uvRect.h);
}

// set a constant vec4 attribute only when its value changed since the last time
function render3DAttrib4f(location, x, y, z, w)
{
    const values = render3D.attribValues, last = values[location] ||= [NaN, NaN, NaN, NaN]; // kept, not made per draw
    if (last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    last[0] = x, last[1] = y, last[2] = z, last[3] = w;
    glContext.vertexAttrib4f(location, x, y, z, w);
}

// textures in 3D shrink into the distance far more than sprites do, so the pass samples them through their mipmaps;
// a sampler sets the filtering for the 3D pass only and leaves the engine's textures as they are for 2D; they are
// made as textures need them, and all dropped when the settings change
function render3DUpdateSamplers()
{
    const r = render3D, key = tilesPixelated + ' ' + r.anisotropy;
    if (r.samplerKey === key) return;
    r.samplerKey = key;
    for (const sampler of r.samplers.values())
        glContext.deleteSampler(sampler); // the set being replaced, a lost context empties this first
    r.samplers.clear();
}

// the sampler for a texture's wrap modes, smooth or hard edged, made the first time it is needed; pixelated is the
// draw's, texturePixelated the texture's own, which a smooth texture in a pixel art game sets false
function render3DSampler(wrap, pixelated, texturePixelated=tilesPixelated)
{
    const gl = glContext, r = render3D, [wrapS, wrapT] = glWrapModes(wrap);
    const key = wrapS * 1e5 + wrapT * 4 + (pixelated ? 1 : 0) + (texturePixelated ? 2 : 0); // the modes are 5 digit numbers
    let sampler = r.samplers.get(key);
    if (sampler) return sampler;
    sampler = gl.createSampler();
    const sharp = pixelated || texturePixelated;
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, sharp ? gl.NEAREST : gl.LINEAR);
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, pixelated ? gl.NEAREST
        : texturePixelated ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrapS);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrapT);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy && !pixelated)
    {
        const most = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.samplerParameterf(sampler, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, clamp(r.anisotropy, 1, most));
    }
    r.samplers.set(key, sampler);
    return sampler;
}

// bind the texture of a tile or texture, white when there is none or it is not loaded, with the 3D sampler that
// matches its wrap mode; the first time a texture is used in 3D it gets its mipmaps; on unit 0, the color texture,
// or another unit, the material maps, after which unit 0 is active again
function render3DBindTexture(tileInfo, state=render3D, unit=0)
{
    const gl = glContext, r = render3D;
    const textureInfo = render3DTextureOf(tileInfo);
    const texture = textureInfo?.glTexture || r.whiteTexture;
    unit && gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (texture === r.whiteTexture || !r.mipmaps && !state.pixelated)
        gl.bindSampler(unit, null); // the texture's own filtering, as in 2D; the white texel needs no mipmaps
                                    // or anisotropy, and filtering it that way costs every untextured fragment
    else
    {
        gl.bindSampler(unit, render3DSampler(textureInfo?.wrap, state.pixelated, textureInfo?.pixelated ?? tilesPixelated));
        glUpdateMipmaps(texture); // drawn into since its mipmaps were made
        if (!state.pixelated && !glMipmappedTextures.has(texture)) // a hard edged draw never reads them
        {
            glMipmappedTextures.add(texture); // the core makes them again when the texture changes
            gl.generateMipmap(gl.TEXTURE_2D);
        }
    }
    unit && gl.activeTexture(gl.TEXTURE0);
}

// the material's uniforms and maps for a draw: the normal map on unit 2 and the emissive map on unit 3, white when
// unused and bound only when they change, and the sky a reflection shows, the colors setSky was given or the
// ambient ones; with nothing set every part of it is skipped in the shader, and a map with no GL texture yet, or
// one freed, counts as none, since the white texture in its place would bend every normal or light the surface
function render3DSetMaterialUniforms(state)
{
    const r = render3D, loaded = (map)=> render3DTextureOf(map)?.glTexture ? map : undefined;
    const normalMap = state.normalScale ? loaded(state.normalMap) : undefined, emissiveMap = loaded(state.emissiveMap);
    render3DUniform4f('materialParams', normalMap ? state.normalScale : 0, max(state.shininess, 1e-3), state.reflectivity, 0);
    const ec = state.emissiveMapColor || WHITE;
    emissiveMap ? render3DUniform4f('emissiveTint', ec.r, ec.g, ec.b, 1) : render3DUniform4f('emissiveTint', 0, 0, 0, 0);
    render3DBindMap(2, normalMap, state);
    render3DBindMap(3, emissiveMap, state);
    if (state.reflectivity > 0)
    {
        // the draw's own environment or the scene's, never the cube map a capture is drawing
        let environment = state.environmentMap || r.environment;
        environment === r.capturingCube && (environment = undefined);
        render3DBindEnvironment(environment);
        // a rough reflection is blurred over half of sqrt(2 / (shininess + 2)), the spread Blinn-Phong and Beckmann
        // give a shininess, narrower than the Phong highlight the shader draws, and a texel of mipmap
        // L spans (PI/2) / size * 2^L, so the shader reads level log2(size * .45) - log2(shininess + 2)
        // / 2: the same blur for any size of map; it stops at 4 by 4 a face, where sampling across the edges still
        // blends neighboring faces
        const size = environment ? environment.size : 1;
        // a turn of one radian a pixel covers size / (PI/2) texels of a face, log2 of that the level that blurs it
        render3DUniform4f('envParams', environment ? 1 : 0, max(0, log2(size) - 2), log2(size * .45), log2(size * 2 / PI));
        const sky = r.sky && render3DSkyColors.get(r.sky), a = r.ambientColor, g = r.ambientGroundColor || a;
        const top = sky ? sky[0] : a, bottom = sky ? sky[2] : g;
        render3DUniform4f('skyTop', top.r, top.g, top.b, 1);
        render3DUniform4f('skyBottom', bottom.r, bottom.g, bottom.b, 1);
        sky ? render3DUniform4f('skyHorizon', sky[1].r, sky[1].g, sky[1].b, 1) :
            render3DUniform4f('skyHorizon', (a.r + g.r) / 2, (a.g + g.g) / 2, (a.b + g.b) / 2, 1);
    }
}

// the cube map bound to the environment unit, 5, so a draw binds only when it changes; null for none, undefined when
// not known, forgotten at the start and end of each pass and around a capture
let render3DBoundEnvironment;

// bind a draw's environment to unit 5 when it is not bound already; none leaves the unit as it is, its reflection
// reads the sky's colors
function render3DBindEnvironment(cube)
{
    const gl = glContext;
    if (!cube || cube === render3DBoundEnvironment || !gl) return;
    gl.activeTexture(gl.TEXTURE0 + 5);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, render3DCubeTexture(cube) || null);
    gl.activeTexture(gl.TEXTURE0);
    render3DBoundEnvironment = cube;
}

// what each material map unit has bound, index 2 and 3 the maps and 4 and 5 whether each is pixelated, forgotten at
// the start and end of each pass
let render3DBoundMaps = [];

// bind a material map to its unit, or white for none, only when it or its filtering changed since the last draw
function render3DBindMap(unit, map, state)
{
    const bound = render3DBoundMaps, pixelated = !!map && state.pixelated;
    if (bound[unit] === map && bound[unit + 2] === pixelated) return;
    bound[unit] = map, bound[unit + 2] = pixelated;
    render3DBindTexture(map, state, unit);
}

// send a vec4 uniform of the main shader only when its value changed since the last send
function render3DUniform4f(name, x, y, z, w)
{
    const values = render3D.uniformValues, last = values[name] ||= [NaN, NaN, NaN, NaN]; // kept, not made per draw
    if (last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    last[0] = x, last[1] = y, last[2] = z, last[3] = w;
    glContext.uniform4f(render3DUniform(name), x, y, z, w);
}

// send an int uniform of the main shader only when its value changed since the last send
function render3DUniform1i(name, x)
{
    const values = render3D.uniformValues;
    if (values[name] === x)
        return;
    values[name] = x;
    glContext.uniform1i(render3DUniform(name), x);
}

// bind a vertex buffer and point the attributes at it
function render3DBindVertexBuffer(buffer)
{
    const gl = glContext;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const a of RENDER3D_ATTRIBS)
        gl.vertexAttribPointer(a[0], a[1], a[2], a[3], RENDER3D_VERTEX_BYTES, a[4]);
}

// a mesh's vertices and its triangle indices, ready for drawElements
function render3DBindMesh(mesh)
{
    render3DBindVertexBuffer(mesh.buffer);
    glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
}

// the texture a draw samples: a tile's texture, a TextureInfo as it is, or undefined for white
function render3DTextureOf(tileInfo) { return tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo; }

// where a tile sits in its texture, pulled in slightly at the edges so neighbors do not bleed in
// the level's solid geometry in 3D, the height maps and voxel maps that objects with collideLevel collide with, as
// tileCollisionLayers is in 2D; each joins when made and leaves when destroyed
const render3DLevel = [];

// take one of the level's parts out of it, when it is destroyed
function render3DLevelLeave(o)
{
    const i = render3DLevel.indexOf(o);
    i >= 0 && render3DLevel.splice(i, 1);
}

// the level's parts are looked up in world space, so they stay upright and unscaled at the root
function render3DLevelAssertPlaced(o)
{
    ASSERT(!o.parent && !o.rotation3D.lengthSquared() && o.scale3D.x === 1 && o.scale3D.y === 1 && o.scale3D.z === 1,
        'a height map or voxel map stays upright and unscaled at the root, its lookups are in world space');
}

// this returns one shared object, so read it before calling again
const render3DTileUVRect = {x:0, y:0, w:1, h:1};
// the tiles of objects made from a whole TextureInfo, they cover all of it even after the texture is resized
const render3DWholeTiles = new WeakSet;
function render3DGetTileUVs(tileInfo)
{
    // a headless tile has no texture, and a whole texture's tile covers it at any size
    if (!(tileInfo instanceof TileInfo) || !tileInfo.textureInfo || render3DWholeTiles.has(tileInfo))
        return RENDER3D_FULL_UV_RECT;
    const inv = tileInfo.textureInfo.sizeInverse, rect = render3DTileUVRect;
    const bleedX = inv.x * tileInfo.bleed, bleedY = inv.y * tileInfo.bleed;
    rect.x = tileInfo.pos.x * inv.x + bleedX;
    rect.y = tileInfo.pos.y * inv.y + bleedY;
    rect.w = tileInfo.size.x * inv.x - 2*bleedX;
    rect.h = tileInfo.size.y * inv.y - 2*bleedY;
    return rect;
}

// set the per draw uniforms and gl state for a draw, in the shadow pass only the per draw attributes, the texture
// and the depth shader's cut
// tileInfo may be a TileInfo, a TextureInfo, or undefined for the white texture
// state is the plugin's current fields, or the captured state of a stream batch
function render3DSetDrawUniforms(matrix, tileInfo, tint, uvRect, state=render3D)
{
    const gl = glContext, r = render3D;

    // the per draw values are constant vertex attributes, a batch turns on a per instance array over them
    uvRect ||= render3DGetTileUVs(tileInfo);
    render3DDrawAttribs(matrix.m, tint, uvRect);
    render3DBindTexture(tileInfo, state);
    if (r.shadowPass)
    {
        // the shadow map needs only how to cut: by the alpha it blends with, or the texture's as an opaque draw
        const cut = state.blend ? 1 : 0;
        if (render3DShadowCut !== cut)
            glContext.uniform1f(render3DUniform('cut', r.shadowShader), render3DShadowCut = cut);
        return;
    }

    // the program: a Shader's own, compiled by its first draw, or the plugin's; switching sends the pass uniforms
    const program = state.shader ? render3DShaderProgram(state.shader) : r.program;
    program === r.currentProgram || render3DUseProgram(program);

    // blending, matches the engine's 2D blend functions
    if (state.blend)
    {
        gl.enable(gl.BLEND);
        const destBlend = state.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA;
        gl.blendFuncSeparate(gl.SRC_ALPHA, destBlend, gl.ONE, destBlend);
    }
    else
        gl.disable(gl.BLEND);

    // depth and culling
    state.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthWrite);
    state.cullBackFaces ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
    gl.frontFace(state.mirrored ? gl.CCW : gl.CW); // the pass's strips read clockwise, a mirror turns that around

    // lights, fog and shadows are scene state read at draw time, sent only when they change
    // the shader takes the way the sunlight travels, away from the sun
    const s = r.sunDirection, sl = -(s.length() || 1), lc = r.sunColor, ac = r.ambientColor, fc = r.fogColor || canvasClearColor;
    render3DUniform4f('lightDir', s.x / sl, s.y / sl, s.z / sl, state.lighting ? state.emissive : 1);
    render3DUniform4f('lightColor', lc.r, lc.g, lc.b, state.specular);
    render3DUniform4f('ambientFog', ac.r, ac.g, ac.b, r.fogEnd);
    const gc = r.ambientGroundColor;
    // its alpha says whether the ground color is on
    gc ? render3DUniform4f('ambientGround', gc.r, gc.g, gc.b, 1) : render3DUniform4f('ambientGround', 0, 0, 0, 0);

    render3DUniform4f('fogColor', fc.r, fc.g, fc.b, r.fogEnd ? min(r.fogStart, r.fogEnd - 1e-3) : r.fogStart);
    // how the fragment shader finishes: 1 drops see through texels and keeps the draw opaque,
    // 0 blends them away instead, and -1 is additive, which has to fade into fog differently
    const blendMode = state.blend ? (state.additive ? -1 : 0) : 1;
    const receives = r.shadows && r.passIsDefault && state.receiveShadow ? 1 : 0;
    // 1 the sun's shadow, 2 and up the shadow of that Light3D, the spotlight that casts them
    const shadowOf = receives && r.shadowLightIndex >= 0 ? 2 + r.shadowLightIndex : receives;
    render3DUniform4f('shadowParams', shadowOf, r.shadowDepthBias, r.shadowSoftness / r.shadowTextureSize, blendMode);

    // a render target's texture holds premultiplied color, the blend writes it that way, so the shader undoes it
    const textureInfo = render3DTextureOf(tileInfo);
    render3DUniform1i('premultipliedTexture', +!!(textureInfo?.glTexture && glPremultipliedTextures.has(textureInfo.glTexture)));
    render3DSetMaterialUniforms(state);
}

// the six flat sides of the camera's visible box, each as [x, y, z, w] facing inward
// a point is inside when x*px + y*py + z*pz + w is zero or more
function render3DFrustumPlanes(matrix)
{
    const m = matrix.m, planes = [];
    for (let i = 0; i < 3; ++i)
    for (const sign of [1, -1])
    {
        const p = [m[3] + sign * m[i], m[7] + sign * m[4+i], m[11] + sign * m[8+i], m[15] + sign * m[12+i]];
        const l = hypot(p[0], p[1], p[2]) || 1;
        planes.push(p.map(v=> v / l));
    }
    return planes;
}

// the preRender hook, before gameRender: the layer under the 2D scene
function render3DPreRender()
{
    const r = render3D;
    editor3DCameraBegin(); // debug builds draw with the free camera or the 3D editor's, the game's is back after
    r.updateMatrices();
    r.shadowMapDrawn = false;
    render3DRenderPass(false);
}

// the render hook, after gameRenderPost: the layer on top of the 2D scene
function render3DRender()
{
    render3DRenderPass(true);
    editor3DCameraEnd();
}

// one 3D pass for the objects of a layer: take over the gl state, draw the shadow map once a frame and the stages, hand
// the state back
// the layer matching render3D.renderAfter2D is the default and always runs, the other only when an object asks for it
function render3DRenderPass(after2D)
{
    const gl = glContext, r = render3D;
    if (!r.program || !glEnable) return; // headless, gl disabled, or context lost
    render3DUpdateSamplers();
    ASSERT(!r.fogEnd || r.fogStart < r.fogEnd, 'fogStart must be less than fogEnd');
    ASSERT(!glRenderTarget, 'the 3D pass needs the canvas depth buffer, it can not draw into a render target');
    const isDefault = after2D === !!r.renderAfter2D, objects = render3DLayerObjects(after2D);
    if (!isDefault && !objects.length) return;
    r.passIsDefault = isDefault;
    // the 2D sprites drawn so far go under this layer, and a batch a plugin left pending before the layer under
    // the 2D scene draws now, with the engine's own gl state, not after the pass with its own
    glFlush();

    // a previous frame that threw must not leave anything pending
    r.streamCount = 0;
    r.capture = r.transparentQueue = undefined;
    render3DClearInstances();

    // the Light3D objects, a directional one sends the direction toward it, from the origin, and a negative radius
    // gathered before the gl state is taken over, so an assert here leaves nothing to hand back
    const lights = render3DCollectLights();
    r.lightCount = lights.length;
    const caster = render3DShadowCaster();
    r.shadowLightIndex = caster ? lights.indexOf(caster) : -1;
    const positions = r.lightPositions, colors = r.lightColors;
    lights.forEach((light, i)=>
    {
        const p = light.directional ? light.getWorldPos3D().normalize() : light.getWorldPos3D();
        ASSERT(!light.directional || p.lengthSquared(),
            'a directional light shines from its position toward the origin, so it cannot sit on the origin');
        const c = light.color, k = i * 4;
        positions[k] = p.x, positions[k+1] = p.y, positions[k+2] = p.z;
        positions[k+3] = light.directional ? -1 : max(0, light.radius); // a negative radius marks a direction
        colors[k] = c.r, colors[k+1] = c.g, colors[k+2] = c.b, colors[k+3] = c.a * light.intensity;
        r.lightCones.set(render3DLightCone(light), k);
    });

    // take over the gl state
    gl.bindVertexArray(r.vao);
    // the leading repeat on every strip shifts the triangles by one, which flips
    // which way they read, so tell WebGL that clockwise is the front here
    gl.frontFace(gl.CW);
    // every program's shadow sampler is on unit 1, where a 2D plugin like PostProcessPlugin or LightSystemPlugin
    // may have left its own texture, which fails every draw; the shadow map goes back there even with shadows off
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, r.shadowTexture || null);
    // the material maps' units start white, a 2D plugin may have left its own textures there, and the shadow
    // light's gel goes on its unit for the pass, white when it has none
    render3DSetMapUnits(r.whiteTexture);
    const gel = render3DTextureOf(render3DShadowCaster()?.gel)?.glTexture;
    if (gel)
    {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, gel);
        gl.activeTexture(gl.TEXTURE0);
    }
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    r.isRendering = true;
    try
    {
        // the shadow map from the light once a frame, then the stages sample it
        if (r.shadows && !r.shadowMapDrawn)
        {
            render3DRenderShadowMap();
            r.shadowMapDrawn = true;
        }
        // the camera's depth for post processing, from the default layer
        r.depthTexture && isDefault && render3DRenderDepth();
        // the cube maps asked for by capture, drawn with this frame's shadow map
        isDefault && r.cubeCaptures.size && render3DCaptureCubes(objects);
        render3DUseProgram(r.program); // after the shadow map, so the light matrix it sends is this frame's
        r.renderStages(objects, isDefault);
    }
    finally
    {
        // hand the state back to the engine's 2D batching, even when a draw threw
        r.isRendering = false;
        r.currentProgram = undefined; // the engine's 2D program takes over below
        r.streamCount = 0;
        r.capture = r.transparentQueue = undefined;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.frontFace(gl.CCW);
        gl.bindSampler(0, null); // back to the textures' own filtering for 2D
        render3DSetMapUnits(null); // the material maps leave no texture or sampler behind for 2D
        if (glActiveTexture)
            gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
        // ARRAY_BUFFER is not part of VAO state in WebGL2, so bindVertexArray alone would not restore it
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
        glSetInstancedMode(true);
    }
}

// put a texture on the material map units and the gel's with no sampler, white at the start of the pass and none at
// its end, and forget what the map cache thought was bound; unit 0 is active after
function render3DSetMapUnits(texture)
{
    const gl = glContext;
    for (const unit of [2, 3, 4])
    {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.bindSampler(unit, null);
    }
    // the environment cube on unit 5 for the pass, emptied at its end with the others
    gl.activeTexture(gl.TEXTURE0 + 5);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture && render3DCubeTexture(render3D.environment) || null);
    gl.bindSampler(5, null);
    render3DBoundEnvironment = texture && render3D.environment || null;
    gl.activeTexture(gl.TEXTURE0);
    render3DBoundMaps = [];
}

// create the shadow map depth texture and framebuffer at a size, or keep them when the size matches
function render3DUpdateShadowMap(size)
{
    const gl = glContext, r = render3D;
    ASSERT(size > 0, 'shadowMapSize must be positive');
    size = glClampTextureSize(size); // a size the device does not have falls back to the largest it has
    if (r.shadowTexture && r.shadowTextureSize === size) return;
    r.shadowTexture && gl.deleteTexture(r.shadowTexture);
    r.shadowFramebuffer && gl.deleteFramebuffer(r.shadowFramebuffer);
    const texture = r.shadowTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // smooth filtering softens shadow edges for free
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    const framebuffer = r.shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]); // depth only
    gl.readBuffer(gl.NONE);
    ASSERT(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE,
        'shadow map framebuffer is incomplete, try a smaller shadowMapSize');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    r.shadowTextureSize = size;
}

// draw the lit opaque casters from the light into the shadow map with the depth only shader
function render3DRenderShadowMap()
{
    const gl = glContext, r = render3D;
    render3DUpdateShadowMap(r.shadowMapSize | 0);
    r.updateShadowMatrix();

    // the map can not be read while it is drawn
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.shadowFramebuffer);
    gl.viewport(0, 0, r.shadowTextureSize, r.shadowTextureSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(r.shadowShader);
    gl.uniformMatrix4fv(render3DUniform('viewProj', r.shadowShader), false, r.shadowMatrix.m);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    r.shadowPass = true;
    try
    {
        // see through objects cast only when textured, their alpha cuts the shadow out
        const casters = render3DLayerObjects(!!r.renderAfter2D).filter(o=>
            render3DSetting(o, 'castShadow') && !render3DSetting(o, 'additive') && (!o.transparent || o.tileInfo));
        render3DDrawObjects(casters);
        r.onRenderOpaque?.();
        r.flush();
        render3DFlushInstances();
    }
    finally
    {
        // back to the frame with the map ready to sample
        r.shadowPass = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // backing store size, mainCanvasSize is css pixels
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, r.shadowTexture);
        gl.activeTexture(gl.TEXTURE0);
    }
}

// the camera's depth texture and its framebuffer at a size, made again when the canvas changes size; depth values
// are not filtered, so it is read texel by texel
function render3DUpdateCameraDepth(width, height)
{
    const gl = glContext, r = render3D;
    if (r.cameraDepthTexture && r.cameraDepthWidth === width && r.cameraDepthHeight === height) return;
    r.cameraDepthTexture && gl.deleteTexture(r.cameraDepthTexture);
    r.cameraDepthFramebuffer && gl.deleteFramebuffer(r.cameraDepthFramebuffer);
    const texture = r.cameraDepthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const framebuffer = r.cameraDepthFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]); // depth only
    gl.readBuffer(gl.NONE);
    ASSERT(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE, 'camera depth framebuffer is incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    r.cameraDepthWidth = width, r.cameraDepthHeight = height;
}

// draw the camera's depth for post processing: the solid objects from the camera with the shadow map's depth only
// shader, into a texture the size of the canvas; what is see through is cut by its alpha as it is for shadows
function render3DRenderDepth()
{
    const gl = glContext, r = render3D, width = glCanvas.width, height = glCanvas.height;
    render3DUpdateCameraDepth(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.cameraDepthFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(r.shadowShader);
    gl.uniformMatrix4fv(render3DUniform('viewProj', r.shadowShader), false, r.viewProjection.m);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    r.shadowPass = r.depthPass = true;
    try
    {
        const solids = render3DLayerObjects(!!r.renderAfter2D).filter(o=>
            !render3DSetting(o, 'additive') && (!o.transparent || o.tileInfo));
        render3DDrawObjects(solids);
        r.onRenderOpaque?.();
        r.flush();
        render3DFlushInstances();
    }
    finally
    {
        r.shadowPass = r.depthPass = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Strips: every strip repeats its first point once at the start and its last
// point once at the end. Those repeats make flat triangles with no area, which
// are invisible, and they let one strip run straight into the next.
// An odd count gets one more repeat at the end. Triangles in a strip alternate
// which way they face, so keeping the count even keeps every strip facing out.

// make room in the stream for a strip of count vertices under the current state and texture, flushing a batch that
// differs first; returns the uv rect to map the vertices with, or undefined when nothing can be drawn; unlit draws
// the batch unlit whatever the state says, so a billboard does not set the state and set it back at every draw
function render3DBeginStrip(count, tileInfo, unlit=false)
{
    const r = render3D;
    if (!render3DCanDraw()) return;
    if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
    ASSERT(count <= RENDER3D_MAX_STREAM_VERTS, 'strip is too large for the stream, bake it into a mesh');
    if (count > RENDER3D_MAX_STREAM_VERTS) return;
    const textureInfo = render3DTextureOf(tileInfo);
    if (r.streamCount && (textureInfo !== r.streamTileInfo || r.streamUnlit !== unlit
        || render3DStateChanged(r.streamState) || r.streamCount + count > RENDER3D_MAX_STREAM_VERTS))
        r.flush();
    render3DFlushBeforeOverlay();
    if (!r.streamCount)
        r.streamState = render3DCaptureBatchState();
    r.streamUnlit = unlit;
    r.streamTileInfo = textureInfo;
    return render3DGetTileUVs(tileInfo);
}

// a draw that is not depth tested goes over what is already drawn, so the batches drawn before it go first, or they
// would draw at the end of the stage and cover it whatever its render order; a stream open with the same state is
// drawn too, so each such draw splits the batches: one draw per object for meshes each with an overlay
function render3DFlushBeforeOverlay()
{
    const r = render3D;
    if (r.depthTest || r.shadowPass || !r.instanceMeshes.length) return;
    r.flush();
    render3DFlushInstances();
}

// upload a mesh that is new, changed, or from before the context was lost
function render3DMeshUpload(mesh)
{
    if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== render3D.contextGeneration)
        mesh.upload();
}

// an object's size3D in the world, grown by its scale and its parents', the size its sprite is drawn at and that
// collecting, picking and collision measure it at
function render3DWorldSize(o, m)
{
    const s = o.size3D;
    return vec3(s.x * hypot(m[0], m[1], m[2]), s.y * hypot(m[4], m[5], m[6]), s.z * hypot(m[8], m[9], m[10]));
}

// the surface normal of a height function at x, z, from the slope across a cell each way, clamped to the edges so a
// border sample leans the same as its neighbor; buildGrid and HeightMap both light their slopes by it, and it makes
// one vector, a big terrain has millions of vertices
function render3DSlopeNormal(heightFunction, x, z, ex, ez, halfX, halfZ)
{
    const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX), z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
    const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
    const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
    const s = 1 / hypot(dx, 1, dz);
    return vec3(-dx * s, s, -dz * s);
}

// the half axes of a camera facing quad of a size turned by an angle, right then up, in one shared array
// so a particle costs no vectors; read it before calling again
const render3DBillboardAxesScratch = new Float64Array(6);
function render3DBillboardAxes(size, angle, upright)
{
    const r = render3D.cameraRight, u = render3D.cameraUp;
    let rx = r.x, ry = r.y, rz = r.z, ux = u.x, uy = u.y, uz = u.z;
    if (upright)
    {
        // an upright quad stands on world up and only turns to face the camera
        const l = hypot(rx, rz); // a rolled camera has no flat right
        rx = l ? rx / l : 1, ry = 0, rz = l ? rz / l : 0;
        ux = 0, uy = 1, uz = 0;
    }
    const c = cos(angle), s = sin(angle), w = size.x / 2, h = size.y / 2, a = render3DBillboardAxesScratch;
    a[0] = (rx * c + ux * s) * w, a[1] = (ry * c + uy * s) * w, a[2] = (rz * c + uz * s) * w;
    a[3] = (ux * c - rx * s) * h, a[4] = (uy * c - ry * s) * h, a[5] = (uz * c - rz * s) * h;
    return a;
}

// the four corners of a camera facing quad in strip order
function render3DBillboardCorners(pos, size, angle, upright)
{
    const a = render3DBillboardAxes(size, angle, upright);
    const rx = a[0], ry = a[1], rz = a[2], ux = a[3], uy = a[4], uz = a[5];
    return [
        vec3(pos.x - rx + ux, pos.y - ry + uy, pos.z - rz + uz), vec3(pos.x - rx - ux, pos.y - ry - uy, pos.z - rz - uz),
        vec3(pos.x + rx + ux, pos.y + ry + uy, pos.z + rz + uz), vec3(pos.x + rx - ux, pos.y + ry - uy, pos.z + rz - uz)];
}
