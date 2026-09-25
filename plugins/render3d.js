/**
 * LittleJS 3D Rendering Plugin
 * - Adds a 3D scene that draws into the same WebGL canvas as the 2D game
 * - Call new Render3DPlugin() in gameInit, then move render3D.camera and make EngineObject3D objects
 * - EngineObject3D is an EngineObject with a 3D position, rotation and mesh
 * - The 3D scene draws under the 2D sprites, so HUD and text land on top
 * - Lighting is the sun plus ambient, with optional extra lights, fog and shadows
 * - Any object or draw can bring its own Shader, a mainImage snippet the lighting then applies to
 * - Build shapes with buildBox, buildSphere, buildGrid and buildLathe; the other builders, terrain, particles,
 *   camera controls and the OBJ loader are in the Render3D Extras plugin, which goes after this one
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
const RENDER3D_INSTANCE_ATTRIBS = [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 4, 48], [11, 4, 64], [12, 4, 80]];
const RENDER3D_VERTEX_INPUTS =
    'layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 t;layout(location=3) in vec4 c;' +
    'layout(location=4) in vec4 m0;layout(location=5) in vec4 m1;layout(location=6) in vec4 m2;layout(location=7) in vec4 m3;' +
    'layout(location=11) in vec4 tint;layout(location=12) in vec4 uvRect;';
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_MAX_LIGHTS = 8; // Light3D objects per frame, the shader loops over this many
// strip order, frozen, and typed as the plain array the uv parameters take
const RENDER3D_QUAD_UVS = /** @type {Array<Vector2>} */ (Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv))));
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(hsl(0, 0, 0, .5));
const RENDER3D_IDENTITY = new Matrix4; // never modified
const RENDER3D_DEBUG_WIDTH = .05; // line width of the debug primitives
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
    ASSERT(render3D.isRendering, '3D draws are only valid during the 3D pass, draw from an EngineObject3D or render3D.onRenderOpaque');
    return render3D.isRendering;
}

// the draw state fields a batch is drawn under; lights and fog are not captured, they are read live at flush
// the three functions below write them out by hand for speed, so a new field goes in all four
const RENDER3D_STATE_FIELDS = ['blend', 'additive', 'depthTest', 'depthWrite', 'cullBackFaces', 'mirrored', 'lighting', 'emissive', 'receiveShadow', 'specular', 'pixelated', 'shader'];

// a copy of the draw state in one fixed shape, the fields of RENDER3D_STATE_FIELDS written out so the
// compare below stays a handful of direct reads, it runs for every instance drawn
function render3DCaptureBatchState()
{
    const r = render3D;
    return {blend: r.blend, additive: r.additive, depthTest: r.depthTest, depthWrite: r.depthWrite,
        cullBackFaces: r.cullBackFaces, mirrored: r.mirrored, lighting: r.lighting, emissive: r.emissive,
        receiveShadow: r.receiveShadow, specular: r.specular, pixelated: r.pixelated, shader: r.shader};
}

// put a captured draw state back, written out the same way; the transparent stage does this for every queued draw
function render3DApplyBatchState(s)
{
    const r = render3D;
    r.blend = s.blend, r.additive = s.additive, r.depthTest = s.depthTest, r.depthWrite = s.depthWrite,
    r.cullBackFaces = s.cullBackFaces, r.mirrored = s.mirrored, r.lighting = s.lighting, r.emissive = s.emissive,
    r.receiveShadow = s.receiveShadow, r.specular = s.specular, r.pixelated = s.pixelated, r.shader = s.shader;
}

// true when the current draw state differs from a captured one, so a pending batch must flush first
function render3DStateChanged(s)
{
    const r = render3D;
    return r.blend !== s.blend || r.additive !== s.additive || r.depthTest !== s.depthTest
        || r.depthWrite !== s.depthWrite || r.cullBackFaces !== s.cullBackFaces || r.mirrored !== s.mirrored
        || r.lighting !== s.lighting || r.emissive !== s.emissive || r.receiveShadow !== s.receiveShadow
        || r.specular !== s.specular || r.pixelated !== s.pixelated || r.shader !== s.shader;
}

// whether a sphere is inside the view, or the shadow map's box during the shadow pass, without a vector
function render3DSphereVisible(x, y, z, radius)
{
    const planes = render3D.shadowPass ? render3D.shadowPlanes : render3D.frustumPlanes;
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
function render3DIsAfter2D(o) { return !!(o.renderAfter2D ?? render3D.renderAfter2D); }

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
function render3DMirrors(m) { return render3DDeterminant(m) < 0; }

// the determinant of a matrix's 3x3 part, 0 when it flattens a shape and has no inverse
function render3DDeterminant(m)
{ return m[0]*(m[5]*m[10] - m[6]*m[9]) - m[4]*(m[1]*m[10] - m[2]*m[9]) + m[8]*(m[1]*m[6] - m[2]*m[5]); }

// a column of a matrix as a direction: 0 is the right axis, 4 up, 8 back
function render3DAxis(m, i) { return vec3(m[i], m[i+1], m[i+2]); }

// the largest axis scale of a matrix, how much it grows a bounding sphere
function render3DMaxScale(m)
{
    return max(m[0]*m[0] + m[1]*m[1] + m[2]*m[2], m[4]*m[4] + m[5]*m[5] + m[6]*m[6], m[8]*m[8] + m[9]*m[9] + m[10]*m[10]) ** .5;
}

// how far a matrix at offset k can move a point that is one unit from its origin, for a bounding sphere: the
// longest axis when the axes are square to each other, more when they are not, as a turned child under a parent
// scaled on one axis leaves them; the axes' dot products bound the largest stretch by their largest row sum
function render3DMaxStretch(m, k=0)
{
    const xx = m[k]*m[k] + m[k+1]*m[k+1] + m[k+2]*m[k+2];
    const yy = m[k+4]*m[k+4] + m[k+5]*m[k+5] + m[k+6]*m[k+6];
    const zz = m[k+8]*m[k+8] + m[k+9]*m[k+9] + m[k+10]*m[k+10];
    const xy = abs(m[k]*m[k+4] + m[k+1]*m[k+5] + m[k+2]*m[k+6]);
    const xz = abs(m[k]*m[k+8] + m[k+1]*m[k+9] + m[k+2]*m[k+10]);
    const yz = abs(m[k+4]*m[k+8] + m[k+5]*m[k+9] + m[k+6]*m[k+10]);
    return max(xx + xy + xz, yy + xy + yz, zz + xz + yz) ** .5;
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
    const emissive = o?.emissive || 0;
    ASSERT(isNumber(emissive) && emissive >= 0, 'emissive must be a number, 0 or more', emissive);
    r.lighting = true;
    r.emissive = emissive;
    r.additive = !!o?.additive;
    r.specular = o?.specular || 0;
    r.receiveShadow = !o || o.receiveShadow;
    r.cullBackFaces = r.mirrored = false; // each mesh sets these as it draws
    r.pixelated = !!o?.pixelated;
    ASSERT(!o?.shader || o.shader instanceof Shader, 'shader must be a Shader, not the snippet itself');
    r.shader = o?.shader || undefined; // null is no shader too, so it batches with none
    r.depthTest = true;
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

// add a draw of a mesh to its batch; a batch is one mesh under one texture and draw state, so a change flushes it
function render3DInstance(mesh, matrix, tileInfo, color)
{
    const k = render3DInstanceSlot(mesh, tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo), data = mesh.instanceData;
    data.set(matrix.m, k);
    if (!render3D.shadowPass) // the depth shader reads only the matrix and the uv rect, the tint can stay stale
        data[k+16] = color.r, data[k+17] = color.g, data[k+18] = color.b, data[k+19] = color.a;
    const uv = render3DGetTileUVs(tileInfo);
    data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
}

// make room for one more instance of a mesh under a texture and the current draw state, flushing a batch that
// differs first, and return where its 24 floats go in mesh.instanceData: the matrix, the tint and the uv rect
function render3DInstanceSlot(mesh, textureInfo)
{
    const r = render3D;
    if (mesh.instanceCount && (mesh.instanceTextureInfo !== textureInfo || render3DStateChanged(mesh.instanceState)))
        render3DFlushInstances(mesh);
    if (!mesh.instanceCount)
    {
        mesh.instanceTextureInfo = textureInfo;
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
        render3DDrawInstanced(mesh, buffer, count, mesh.instanceTextureInfo, mesh.instanceState);
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
function render3DDrawInstanced(mesh, buffer, count, textureInfo, state)
{
    const gl = glContext;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [location, size, offset] of RENDER3D_INSTANCE_ATTRIBS)
    {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, RENDER3D_INSTANCE_BYTES, offset);
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
{ return /** @type {Array<EngineObject3D>} */ (engineObjects.filter(o=> !o.destroyed && o instanceof EngineObject3D && render3DIsAfter2D(o) === after2D)); }

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
        lights.length = RENDER3D_MAX_LIGHTS;
    }
    return lights;
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
        ASSERT(Object.keys(render3DCaptureBatchState()).join() === RENDER3D_STATE_FIELDS.join(), 'the batch state functions must list RENDER3D_STATE_FIELDS');

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
        /** @property {Color|undefined} - Ambient light from below: set, the ambient blends from this on faces pointing down
         *  to ambientColor on faces pointing up, the way a sky and a ground light a scene; setSky sets both from its colors
         *  @type {Color|undefined} */
        this.ambientGroundColor = undefined;
        /** @property {Color|undefined} - Fog color, uses canvasClearColor when undefined
         *  @type {Color|undefined} */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;
        /** @property {Vector3} - Added to the velocity3D of every object with a mass each frame, scaled by its gravityScale; sync2D objects use the 2D gravity */
        this.gravity = vec3();
        /** @property {number|HeightMap|function(number, number): number} - Floor for objects with a softShadow: a height, a HeightMap, or (x, z) => y
         *  @type {number|HeightMap|function(number, number): number} */
        this.softShadowHeight = 0;
        /** @property {boolean} - Default for every builder's smooth argument: true for smooth vertex normals, false for flat faces */
        this.smoothShading = false;

        // shadows
        /** @property {boolean} - Cast real shadows from the sun, off by default and free when off */
        this.shadows = false;
        /** @property {number} - Size of the shadow map in pixels, bigger is sharper and slower */
        this.shadowMapSize = 1024;
        /** @property {number} - World size the shadow map covers around shadowCenter, smaller is sharper; it is a square
         *  facing the light, so it turns as the light does, and about 1.5 times an area's width covers it from any angle */
        this.shadowRange = 40;
        /** @property {Vector3|undefined} - Center of the shadowed area, read each frame, undefined follows the camera
         *  @type {Vector3|undefined} */
        this.shadowCenter = undefined;
        /** @property {number} - Stops surfaces shadowing themselves, raise for speckles, lower if shadows drift off */
        this.shadowBias = .003;
        /** @property {number} - How much to blur the shadow edges */
        this.shadowSoftness = 1;

        // draw state, read at each draw
        /** @property {boolean} - Apply lighting, when false draws plain vertex color times texture and casts no shadow;
         *  off for billboards, lines, ribbons and soft discs, an object sets emissive instead */
        this.lighting = true;
        /** @property {number} - How much a surface lights itself, set per object by its emissive */
        this.emissive = 0;
        /** @property {boolean} - Additive blending instead of alpha, in the transparent stage */
        this.additive = false;
        /** @property {boolean} - Test against the depth buffer, reset to true before each object and callback; a draw
         *  with it off goes over what was drawn before it and under what is drawn after, by render order, which
         *  ends the batch of meshes before it, so one per object costs a draw per object */
        this.depthTest = true;
        /** @property {boolean} - Write to the depth buffer, owned by the stages: on for opaque, off for transparent */
        this.depthWrite = true;
        // batch state set by drawMesh from each mesh: whether its back faces are skipped, off for strips so they
        // show from both sides, and whether its transform mirrors it so the other winding is the front
        this.cullBackFaces = false;
        this.mirrored = false;
        /** @property {number} - Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and 1 adds a light's full color at its brightest; its size is fixed */
        this.specular = 0;
        /** @property {Shader|undefined} - Custom Shader for the next draws, set from each object's shader; undefined draws with the plugin's own
         *  @type {Shader|undefined} */
        this.shader = undefined;
        /** @property {boolean} - Darken by the shadow map when shadows are on, turn it off for things that should stay lit inside a shadow */
        this.receiveShadow = true;

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
        /** @property {boolean} - Draw the 3D scene on top of the 2D scene instead of under it */
        this.renderAfter2D = false;
        /** @property {boolean} - Draw see through things far to near so they blend correctly */
        this.sortTransparent = true;
        /** @property {boolean} - Skip meshes whose bounding sphere is outside the view */
        this.frustumCulling = true;
        /** @property {boolean} - Draw every use of a mesh in the opaque stage as one instanced call, mesh.instanced overrides it per mesh */
        this.instancing = true;
        /** @property {boolean} - Sample textures through mipmaps so they do not shimmer in the distance, false uses each texture's own filtering like 2D */
        this.mipmaps = true;
        /** @property {boolean} - Draw state: keep texture pixels hard edged, no mipmaps and no blending between them, set per object by pixelated */
        this.pixelated = false;
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
        /** @property {Mesh} - A square of size 1 facing +Z with the tile across it, the corners in the order drawBillboard
         *  writes them; a ParticleEmitter3D draws its particles as instances of it, each with its own matrix */
        this.billboardMesh = new Mesh().addStrip([vec3(-.5, .5, 0), vec3(-.5, -.5, 0), vec3(.5, .5, 0), vec3(.5, -.5, 0)], vec3(0, 0, 1), RENDER3D_QUAD_UVS);
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
        /** @property {Vector3} - Camera right axis this frame */
        this.cameraRight = vec3(1, 0, 0);
        /** @property {Vector3} - Camera up axis this frame */
        this.cameraUp = vec3(0, 1, 0);
        /** @property {Vector3} - Camera forward axis this frame */
        this.cameraForward = vec3(0, 0, -1);
        this.cameraBack = vec3(0, 0, 1); // its opposite, the normal of camera facing draws

        // internal state
        this.blend = false;          // blending on, set by the stages
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
        /** @type {WebGLTexture|undefined} */
        this.whiteTexture = undefined; // 1x1 white for untextured draws
        /** @type {Array<WebGLSampler>} */
        this.samplers = [];            // how textures are filtered in 3D, clamped and wrapping, see render3DInitGL
        /** @type {string|undefined} */
        this.samplerKey = undefined;   // the settings the samplers were made for, they are rebuilt when it changes
        /** @type {WebGLTexture|undefined} */
        this.shadowTexture = undefined;
        /** @type {WebGLFramebuffer|undefined} */
        this.shadowFramebuffer = undefined;
        this.shadowTextureSize = 0;
        this.contextGeneration = 0;  // counts context losses, a mesh uploaded under an older one uploads again
        this.uniforms = new Map;     // uniform locations by program
        /** @type {Object<string, Array<number>>} */
        this.uniformValues = {};     // last values sent for the cached vec4 uniforms
        this.shadowMapDrawn = false; // the shadow map is drawn by the first pass of the frame
        this.passIsDefault = true;   // the running pass is the default layer, the only one shadowed
        this.lightPositions = new Float32Array(RENDER3D_MAX_LIGHTS * 4); // Light3D uniforms, filled each pass
        this.lightColors = new Float32Array(RENDER3D_MAX_LIGHTS * 4);

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
        this.streamState = undefined; // captured state the pending batch was drawn under
        /** @type {Mesh|undefined} */
        this.capture = undefined;     // the mesh a bake is filling
        /** @type {Array<{distance: number, state: Object, draw: function(): void}>|undefined} */
        this.transparentQueue = undefined; // draws queued during the transparent stage, replayed far to near

        render3DInitGL();
        engineAddPlugin(undefined, render3DRender, render3DContextLost, render3DContextRestored, render3DPreRender);
    }

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
        const width = canvasSize.x || 1, height = canvasSize.y || 1; // a canvas with no size stands in as 1x1, rather than dividing by zero
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
     *  - Each object is tested as the box around its mesh in its own space, or a sphere around a sprite's size3D,
     *    not triangle by triangle
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

    /** Play a sound at a 3D position, quieter with distance from the camera and panned by its side, like Sound.play with a 2D position
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
        // keep in step with Sound.play, only the pan differs
        ASSERT(sound instanceof Sound, 'sound must be a Sound');
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        if (!soundEnable || headlessMode) return;
        if (!sound.sampleBuffer && !sound._sampleChannels) return; // still loading
        const offset = pos3D.subtract(this.camera.pos), range = sound.range;
        if (range)
        {
            const distance = offset.length();
            if (distance > range)
                return; // out of range
            const taperRange = range * sound.taper;
            if (distance > taperRange)
                volume *= percent(distance, range, taperRange);
        }
        const pan = offset.normalize().dot(this.cameraRight);
        const rate = pitch + pitch * sound.randomness * randomnessScale * rand(-1, 1);
        return new SoundInstance(sound, volume, rate, pan, loop, paused);
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
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
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
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== this.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        const m = matrix.m;
        if (this.frustumCulling && !render3DSphereVisible(m[12], m[13], m[14], mesh.radius * render3DMaxStretch(m)))
            return;
        // the mesh says whether its back faces can be skipped, and a mirroring transform, one with a negative
        // determinant, turns the winding around so the other one is its front
        const cullBackFaces = this.cullBackFaces, mirrored = this.mirrored;
        this.cullBackFaces = !mesh.doubleSided;
        this.mirrored = render3DMirrors(m);
        if (!this.blend && this.depthTest && (mesh.instanced ?? this.instancing)) // the stage draws the batch at its end
            render3DInstance(mesh, matrix, tileInfo, color);
        else
        {
            // a draw that is not depth tested goes over what is already drawn, so the batches drawn before it go
            // first, or they would draw at the end of the stage and cover it whatever its render order
            this.flush();
            this.depthTest || this.shadowPass || render3DFlushInstances();
            render3DSetDrawUniforms(matrix, tileInfo, color);
            render3DBindMesh(mesh);
            glContext.drawElements(glContext.TRIANGLES, mesh.bufferCount, mesh.indexType, 0);
            ++drawCount;
            primitiveCount += mesh.bufferCount / 3;
        }
        this.cullBackFaces = cullBackFaces, this.mirrored = mirrored;
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
            return this.queueTransparent(vec3(x, y, z).scale(1 / points.length), ()=> this.drawStrip(points, normals, uvs, colors, tileInfo));
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
            (o.transparent || o.additive ? transparent : opaque).push(o);

        isDefault && this.sky && this.drawSky();

        // opaque: no blending, depth writes on, by render order
        this.blend = false;
        this.depthWrite = true;
        const byOrder = (a, b)=> a.renderOrder - b.renderOrder;
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
        isDefault && render3DRenderDebug();
        this.flush();

        // leave the fields at the opaque defaults for anything reading them outside the pass
        render3DSetObjectState();
        this.blend = false;
        this.depthWrite = true;
    }

    /** Queue a draw for the transparent stage, replayed far to near with the current draw state, or draw it now when sorting is off
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

    /** Draw the queued transparent draws far to near with the state each was drawn under, called automatically at the end of the transparent stage */
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

    /** Draw render3D.sky around the camera, unlit, unfogged and behind everything, called automatically by the pass */
    drawSky()
    {
        this.flush();
        // the dome only has to sit between the clip planes, the pass draws it first with no depth test;
        // a far plane at Infinity has no midpoint, so put it a long way out instead
        const {near, far} = this.camera;
        const radius = far == Infinity ? near * 1e4 : (near + far) / 2;
        render3DWithState({lighting: false, blend: false, depthTest: false, depthWrite: false, fogEnd: 0, shader: undefined}, ()=>
            this.drawMesh(this.sky, buildMatrix(this.camera.pos, undefined, vec3(radius))));
    }

    /** Rebuild the light's view projection around the shadow center, called automatically each frame shadows are on */
    updateShadowMatrix()
    {
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
            return this.drawStripUnlit(render3DBillboardCorners(pos, size, angle, upright), this.cameraBack, RENDER3D_QUAD_UVS, color.copy(), tileInfo);
        if (this.transparentQueue) // sort by the exact position, a shadow under it sorts by the floor
        {
            const p = pos.copy(), s = size.copy(), c = color.copy(); // copies, the queue replays later
            return this.queueTransparent(p, ()=> this.drawBillboard(p, s, tileInfo, c, angle, upright));
        }

        // the particle path: the quad's six stream vertices written straight in with no vectors made, unlit
        const lit = this.lighting;
        this.lighting = this.shadowPass && lit; // unlit on screen, in the shadow map the object's flag decides
        let uvRect;
        try { uvRect = render3DBeginStrip(6, tileInfo); }
        finally { this.lighting = lit; }
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
            a = a.copy(), b = b.copy(), c = c.copy(), d = d.copy(), color = isArray(color) ? color.map(k=> k.copy()) : color.copy();
        this.drawStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS, render3DQuadValues(color), tileInfo);
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
     *  @param {Vector3|Array<Vector3>} [side] - Direction across the ribbon, one for all or one per point, default faces the camera */
    drawRibbon(points, width=.1, tileInfo, color=WHITE, side)
    {
        const count = points.length;
        ASSERT(count > 1, 'a ribbon needs at least two points');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
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
        render3DWithState({lighting: false, cullBackFaces: false}, ()=> this.drawStrip(strip, forward.scale(-1), uvs, colors, tileInfo));
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
     *  @param {number|HeightMap|function(number, number): number} [floorHeight] - Height of the ground, a HeightMap, or (x, z) => y to follow terrain
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
            return this.queueTransparent(vec3(p.x, height(p.x, p.z) + lift, p.z), ()=> this.drawSoftShadow(p, size, floorHeight, c, lift));
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
    ASSERT(r.blend || r.capture || r.shadowPass || !r.isRendering, 'soft discs and shadows need blending: set the object transparent or draw from onRenderTransparent');
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
// Debug primitives, drawn on top of the 3D scene like the 2D debug functions, only in debug builds

let render3DDebugPrimitives = []; // each keeps the debugClear count it was made under, a debugClear since drops it

// draw the live debug primitives with depth test off so they show through walls, drop the expired ones
function render3DRenderDebug()
{
    if (!render3DDebugPrimitives.length) return;
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.clearCount === debugClearCount);
    if (!debugVideoCaptureIsActive()) // hidden from a video capture like the 2D ones, but they still expire
    {
        render3DWithState({lighting: false, depthTest: false, receiveShadow: false, additive: false, shader: undefined}, ()=>
        {
            for (const p of render3DDebugPrimitives)
                p.draw();
        });
    }
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.timer < 0); // a Timer compares as negative until it elapses
}

// record a debug draw for a time
function render3DDebugPush(duration, draw)
{
    ASSERT(isNumber(duration), 'duration must be a number');
    debug && glEnable && render3D?.program &&
        render3DDebugPrimitives.push({timer: new Timer(duration, true), draw, clearCount: debugClearCount}); // real time, like 2D
}

/** Draw a debug wireframe box
 *  @param {Vector3} pos - Center
 *  @param {Vector3|number} [size] - Full size, a number for a cube
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {Vector3} [rotation] - vec3(pitch, yaw, roll)
 *  @memberof Render3D */
function debugBox3D(pos, size=1, color=WHITE, time=0, rotation)
{
    const matrix = buildMatrix(pos, rotation, render3DSize3(size));
    const corner = (i)=> matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
    render3DDebugPush(time, ()=>
    {
        for (let i = 0; i < 8; ++i)
        for (const bit of [1, 2, 4])
            if (!(i & bit))
                render3D.drawLine(corner(i), corner(i | bit), RENDER3D_DEBUG_WIDTH, color);
    });
}

/** Draw a debug wireframe sphere as three rings
 *  @param {Vector3} pos - Center
 *  @param {number} [size] - Diameter
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugSphere3D(pos, size=1, color=WHITE, time=0)
{
    pos = pos.copy(); // where it is now, a timed one stays put when the object moves
    const circle = render3DCircle(24), r = size / 2;
    render3DDebugPush(time, ()=>
    {
        for (const ring of [(c, s)=> vec3(c, s, 0), (c, s)=> vec3(c, 0, s), (c, s)=> vec3(0, c, s)])
        {
            const points = [];
            for (let i = 0; i <= 24; ++i)
                points.push(pos.add(ring(circle[i*2], circle[i*2 + 1]).scale(r)));
            render3D.drawRibbon(points, RENDER3D_DEBUG_WIDTH, undefined, color);
        }
    });
}

/** Draw a debug line
 *  @param {Vector3} posA
 *  @param {Vector3} posB
 *  @param {Color} [color]
 *  @param {number} [width]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugLine3D(posA, posB, color=WHITE, width=RENDER3D_DEBUG_WIDTH, time=0)
{
    posA = posA.copy(), posB = posB.copy(); // where they are now, a timed one stays put when the ends move
    render3DDebugPush(time, ()=> render3D.drawLine(posA, posB, width, color));
}

/** Draw a debug point as a small cross of three lines
 *  @param {Vector3} pos
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {number} [size] - Length of the cross
 *  @memberof Render3D */
function debugPoint3D(pos, color=WHITE, time=0, size=.2)
{
    pos = pos.copy(); // where it is now, a timed one stays put when the object moves
    render3DDebugPush(time, ()=>
    {
        for (const axis of [vec3(size / 2, 0, 0), vec3(0, size / 2, 0), vec3(0, 0, size / 2)])
            render3D.drawLine(pos.subtract(axis), pos.add(axis), RENDER3D_DEBUG_WIDTH, color);
    });
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
        /** @property {boolean} - Line the 3D camera up with the 2D camera, so 3D things at z=0 sit on the 2D sprites */
        this.align2D = false;
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
        return h ? Matrix4.orthographic(-w, w, -h, h, this.near, this.far) : Matrix4.perspective(this.fov, aspect, this.near, this.far);
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
        this.pos = vec3(cameraPos.x, cameraPos.y, distance);
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
    'N=mat3(c0/dot(c0,c0),c1/dot(c1,c1),c2/dot(c2,c2))*n;' +
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

// the fragment shader; given a Shader's snippet, its mainImage replaces the texture sample and all else is the same
// uniforms: lightDir (xyz the way the sunlight travels, w = emissive, 1 or more skips the lighting),
//   lightColor (the sun's rgb, a = specular), ambientFog (rgb, a = fogEnd), fogColor (rgb, a = fogStart),
//   cameraPos, tex, shadowMap, shadowParams (x = shadows on, y = bias, z = blur step in texture space,
//   w = how the draw finishes: 1 opaque and alpha tested, 0 blended, -1 additive)
function render3DFragmentSource(fragmentCode)
{
    return '#version 300 es\n' +
        'precision highp float;' +
        'uniform vec4 lightDir,lightColor,ambientFog,ambientGround,fogColor,shadowParams;' +
        'uniform vec4 extraLights[' + RENDER3D_MAX_LIGHTS + '],extraLightColors[' + RENDER3D_MAX_LIGHTS + '];' +
        'uniform int extraLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
        'uniform bool premultipliedTexture;' + // is the texture a render target, which holds premultiplied color
        'uniform highp sampler2DShadow shadowMap;' +
        'in vec3 P,N;in vec2 T,L;in vec4 C,S;' +
        'out vec4 o;' +
        // the sun shadow at this fragment, 0 to 1: the light's depth map with a 3x3 blur, outside the map is lit
        'float shadow(){' +
        'if(shadowParams.x<=0.)return 1.;' +
        'vec3 q=S.xyz/S.w*.5+.5;' +
        'if(any(greaterThanEqual(abs(q-.5),vec3(.5))))return 1.;' +
        'q.z-=shadowParams.y;' +
        'float s=0.;' +
        'for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y)' +
        's+=texture(shadowMap,vec3(q.xy+vec2(x,y)*shadowParams.z,q.z));' +
        'return s/9.;}' +
        (fragmentCode ? RENDER3D_SNIPPET_NAMES + fragmentCode + '\n' : '') +
        'void main(){' +
        (fragmentCode ? 'vec4 t;mainImage(t,T);' : 'vec4 t=texture(tex,T);') +
        'if(premultipliedTexture&&t.a>0.)t.rgb/=t.a;' + // back to straight color, what the lighting and blend expect
        'if(shadowParams.w>0.&&t.a<.5)discard;' + // an opaque draw drops see through texels, as the shadow map does
        'vec4 c=C*t;' +
        'float e=lightDir.w;' +
        'if(e<1.){' +
        'vec3 n=dot(N,N)>0.?normalize(N):vec3(0,1,0);' +
        'if(!gl_FrontFacing)n=-n;' + // only a double sided mesh shows a back face, light it on the side that is seen
        'float nl=dot(n,-lightDir.xyz);' +
        'float s=shadow();' +
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
        'l+=lc*max(0.,ln);' +
        'if(lightColor.a>0.)sp+=lc*pow(max(dot(reflect(-v,n),eye),0.),16.)*step(0.,ln);' +
        '}' +
        'c.rgb*=l*(1.-e)+e;' + // lit, blended toward its own color by how emissive it is
        // specular: the sun's only where its light hits and out of shadow, then the Light3D highlights,
        // skipped entirely when the strength is zero
        'if(lightColor.a>0.){' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,eye),0.),16.)*lightColor.a*step(0.,nl)*s*(1.-e)+sp*lightColor.a*(1.-e);' +
        '}}else c.rgb*=e;' + // fully emissive: its own color, or brighter, with no lighting to work out
        'if(ambientFog.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,shadowParams.w<0.?vec3(0):fogColor.rgb,smoothstep(fogColor.a,ambientFog.a,z));' +
        '}' +
        'o=vec4(c.rgb,shadowParams.w>0.?1.:c.a);' + // an opaque draw stays opaque whatever the tint alpha says
        '}';
}

// a Shader's 3D program, compiled the first time a draw needs it
function render3DShaderProgram(shader)
{
    ASSERT(shader instanceof Shader, 'render3D.shader must be a Shader, not the snippet itself');
    return shader.program3D ||= glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource(shader.fragmentCode));
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
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);
    gl.uniform1i(render3DUniform('extraLightCount'), r.lightCount);
    if (r.lightCount)
    {
        gl.uniform4fv(render3DUniform('extraLights'), r.lightPositions, 0, r.lightCount * 4);
        gl.uniform4fv(render3DUniform('extraLightColors'), r.lightColors, 0, r.lightCount * 4);
    }
    if (program !== r.program)
    {
        gl.uniform1f(render3DUniform('iTime'), time);
        gl.uniform3f(render3DUniform('iResolution'), glCanvas.width, glCanvas.height, 1);
    }
}

function render3DInitGL()
{
    if (headlessMode) return;
    if (!glEnable || !glContext)
    {
        console.warn('Render3DPlugin: WebGL not enabled, construct the plugin in gameInit with glEnable set');
        return;
    }
    const gl = glContext, r = render3D;
    glFlush(); // a pending 2D batch draws now, while the engine's own buffer, vertex array and program are bound
    r.uniforms = new Map;
    r.uniformValues = {};
    r.attribValues = []; // a fresh context has its own attribute defaults, so nothing sent before it counts

    // the shader, see RENDER3D_VERTEX_SOURCE and render3DFragmentSource
    r.program = glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource());

    // the depth only shader for the shadow map, same vertex layout; see through pixels cast nothing,
    // so sprites and cut out textures cast their outline
    r.shadowShader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj;' +
        RENDER3D_VERTEX_INPUTS +
        'out vec2 T;' +
        'void main(){T=uvRect.xy+t*uvRect.zw;gl_Position=viewProj*mat4(m0,m1,m2,m3)*vec4(p,1.);}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform sampler2D tex;' +
        'in vec2 T;' +
        'void main(){if(texture(tex,T).a<.5)discard;}'
    );

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

    // white texture for untextured draws, and a one texel shadow map that keeps the shadow sampler valid until shadows are on
    r.whiteTexture = glCreateTexture();

    r.samplers = [];
    r.samplerKey = undefined;
    render3DUpdateShadowMap(1);

    // hand the engine back its own buffer, vertex array and program, the 2D batch was flushed before they changed
    gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
    glSetInstancedMode(true);
}

function render3DContextLost()
{
    const r = render3D;
    r.program = r.currentProgram = r.shadowShader = r.vao = r.streamBuffer = r.whiteTexture = undefined;
    for (const shader of glShaderObjects)
        shader.program3D = undefined; // compiled again by the next draw
    r.lightCount = 0;
    r.instanceBuffers = [];
    r.samplers = [];
    r.samplerKey = undefined;
    render3DClearInstances();
    r.shadowFramebuffer = r.shadowTexture = undefined;
    r.shadowTextureSize = 0;
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
// a sampler sets the filtering for the 3D pass only and leaves the engine's textures as they are for 2D, one for
// clamped textures and one for wrapping ones, rebuilt when the settings change
function render3DUpdateSamplers()
{
    const gl = glContext, r = render3D, key = tilesPixelated + ' ' + r.anisotropy;
    if (r.samplerKey === key) return;
    r.samplerKey = key;
    for (const sampler of r.samplers)
        gl.deleteSampler(sampler); // the set being replaced, a lost context empties this first
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    // four samplers: clamped and wrapping, each smooth or hard edged
    r.samplers = [false, true].flatMap(pixelated=> [gl.CLAMP_TO_EDGE, gl.REPEAT].map(wrap=>
    {
        const sampler = gl.createSampler();
        const sharp = pixelated || tilesPixelated;
        gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, sharp ? gl.NEAREST : gl.LINEAR);
        gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, pixelated ? gl.NEAREST
            : tilesPixelated ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_LINEAR);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap);
        if (anisotropy && !pixelated)
        {
            const most = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            gl.samplerParameterf(sampler, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, clamp(r.anisotropy, 1, most));
        }
        return sampler;
    }));
}

// bind the texture of a tile or texture, white when there is none or it is not loaded, with the 3D sampler that
// matches its wrap mode; the first time a texture is used in 3D it gets its mipmaps
function render3DBindTexture(tileInfo, state=render3D)
{
    const gl = glContext, r = render3D;
    const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    const texture = textureInfo?.glTexture || r.whiteTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (texture === r.whiteTexture || !r.mipmaps && !state.pixelated)
        return gl.bindSampler(0, null); // the texture's own filtering, as in 2D; the white texel needs no mipmaps
                                        // or anisotropy, and filtering it that way costs every untextured fragment
    gl.bindSampler(0, r.samplers[(textureInfo?.wrap ? 1 : 0) + (state.pixelated ? 2 : 0)]);
    glUpdateMipmaps(texture); // drawn into since its mipmaps were made
    if (!state.pixelated && !glMipmappedTextures.has(texture)) // a hard edged draw never reads them
    {
        glMipmappedTextures.add(texture); // the core makes them again when the texture changes
        gl.generateMipmap(gl.TEXTURE_2D);
    }
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

// where a tile sits in its texture, pulled in slightly at the edges so neighbors do not bleed in
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

// set the per draw uniforms and gl state for a draw, in the shadow pass only the model matrix of the depth shader
// tileInfo may be a TileInfo, a TextureInfo, or undefined for the white texture
// state is the plugin's current fields, or the captured state of a stream batch
function render3DSetDrawUniforms(matrix, tileInfo, tint, uvRect, state=render3D)
{
    const gl = glContext, r = render3D;

    // the per draw values are constant vertex attributes, a batch turns on a per instance array over them
    uvRect ||= render3DGetTileUVs(tileInfo);
    render3DDrawAttribs(matrix.m, tint, uvRect);
    render3DBindTexture(tileInfo, state);
    if (r.shadowPass) return; // the shadow map needs nothing else

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
    gc ? render3DUniform4f('ambientGround', gc.r, gc.g, gc.b, 1) : render3DUniform4f('ambientGround', 0, 0, 0, 0); // a is on

    render3DUniform4f('fogColor', fc.r, fc.g, fc.b, r.fogStart);
    // how the fragment shader finishes: 1 drops see through texels and keeps the draw opaque,
    // 0 blends them away instead, and -1 is additive, which has to fade into fog differently
    const blendMode = state.blend ? (state.additive ? -1 : 0) : 1;
    render3DUniform4f('shadowParams', r.shadows && r.passIsDefault && state.receiveShadow ? 1 : 0, r.shadowBias, r.shadowSoftness / r.shadowTextureSize, blendMode);

    // a render target's texture holds premultiplied color, the blend writes it that way, so the shader undoes it
    const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    render3DUniform1i('premultipliedTexture', +!!(textureInfo?.glTexture && glPremultipliedTextures.has(textureInfo.glTexture)));
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
    r.updateMatrices();
    r.shadowMapDrawn = false;
    render3DRenderPass(false);
}

// the render hook, after gameRenderPost: the layer on top of the 2D scene
function render3DRender()
{
    render3DRenderPass(true);
}

// one 3D pass for the objects of a layer: take over the gl state, draw the shadow map once a frame and the stages, hand the state back
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
    const positions = r.lightPositions, colors = r.lightColors;
    lights.forEach((light, i)=>
    {
        const p = light.directional ? light.getWorldPos3D().normalize() : light.getWorldPos3D();
        ASSERT(!light.directional || p.lengthSquared(), 'a directional light shines from its position toward the origin, so it cannot sit on the origin');
        const c = light.color, k = i * 4;
        positions[k] = p.x, positions[k+1] = p.y, positions[k+2] = p.z;
        positions[k+3] = light.directional ? -1 : max(0, light.radius); // a negative radius marks a direction
        colors[k] = c.r, colors[k+1] = c.g, colors[k+2] = c.b, colors[k+3] = c.a * light.intensity;
    });

    // take over the gl state
    gl.bindVertexArray(r.vao);
    // the leading repeat on every strip shifts the triangles by one, which flips
    // which way they read, so tell WebGL that clockwise is the front here
    gl.frontFace(gl.CW);
    gl.activeTexture(gl.TEXTURE0);
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
        if (glActiveTexture)
            gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
        // ARRAY_BUFFER is not part of VAO state in WebGL2, so bindVertexArray alone would not restore it
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
        glSetInstancedMode(true);
    }
}

// create the shadow map depth texture and framebuffer at a size, or keep them when the size matches
function render3DUpdateShadowMap(size)
{
    const gl = glContext, r = render3D;
    ASSERT(size > 0, 'shadowMapSize must be positive');
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
    ASSERT(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE, 'shadow map framebuffer is incomplete, try a smaller shadowMapSize');
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
        const casters = render3DLayerObjects(!!r.renderAfter2D).filter(o=> o.castShadow && !o.additive && (!o.transparent || o.tileInfo));
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

///////////////////////////////////////////////////////////////////////////////
// Strips: every strip repeats its first point once at the start and its last
// point once at the end. Those repeats make flat triangles with no area, which
// are invisible, and they let one strip run straight into the next.
// An odd count gets one more repeat at the end. Triangles in a strip alternate
// which way they face, so keeping the count even keeps every strip facing out.

// make room in the stream for a strip of count vertices under the current state and texture, flushing a batch that
// differs first; returns the uv rect to map the vertices with, or undefined when nothing can be drawn
function render3DBeginStrip(count, tileInfo)
{
    const r = render3D;
    if (!render3DCanDraw()) return;
    if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
    ASSERT(count <= RENDER3D_MAX_STREAM_VERTS, 'strip is too large for the stream, bake it into a mesh');
    if (count > RENDER3D_MAX_STREAM_VERTS) return;
    const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    if (r.streamCount && (textureInfo !== r.streamTileInfo || render3DStateChanged(r.streamState)
        || r.streamCount + count > RENDER3D_MAX_STREAM_VERTS))
        r.flush();
    if (!r.depthTest && !r.shadowPass && r.instanceMeshes.length)
    {
        // as in drawMesh, what was drawn before goes under it, a stream open with the same state included,
        // so each such strip splits the batches: one draw per object for meshes each with an overlay
        r.flush();
        render3DFlushInstances();
    }
    if (!r.streamCount)
        r.streamState = render3DCaptureBatchState();
    r.streamTileInfo = textureInfo;
    return render3DGetTileUVs(tileInfo);
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

// how many vertices a strip of n points takes with its repeats, and which point vertex k of it is
function render3DStripCount(n) { return n + 2 + (n & 1); }
function render3DStripIndex(k, n) { return k < 1 ? 0 : k <= n ? k - 1 : n - 1; }

// walk a strip's vertices with the repeats applied, calling back with (point, normal, uv, color)
// normals, uvs and colors may be one value for all points, an array per point, or undefined
function render3DForEachStripVertex(points, normals, uvs, colors, callback)
{
    ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
    const n = points.length, count = render3DStripCount(n);
    const normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
    for (let k = 0; k < count; ++k)
    {
        const i = render3DStripIndex(k, n);
        callback(points[i],
            normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL,
            uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV,
            colorArray ? colors[i] : colors || WHITE);
    }
}

// write one vertex into a packed buffer at float index j
function render3DWriteVertex(floats, ints, j, x, y, z, n, u, v, rgba)
{
    floats[j]   = x;   floats[j+1] = y;   floats[j+2] = z;
    floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
    floats[j+6] = u;   floats[j+7] = v;
    ints[j+8] = rgba;
}

// turn every triangle of an index list the other way round, in place: the authoring form reads counter clockwise
// from the front and the pass draws clockwise, as a strip's triangles come out after its leading repeat
function render3DFlipTriangles(indices)
{
    for (let t = 0; t < indices.length; t += 3)
    {
        const b = indices[t+1];
        indices[t+1] = indices[t+2], indices[t+2] = b;
    }
    return indices;
}

// the triangles of a strip of count entries as an index list, given which vertex each entry maps to and which place
// it is at: the strip's triangle i is (i-2, i-1, i), its odd ones read the other way as the GPU reads a strip, and a
// triangle with two corners in one place has no area, it is a join between pieces or a sliver at a pole, and is left out
function render3DStripTriangles(count, remap, place)
{
    const indices = [];
    for (let i = 2; i < count; ++i)
    {
        const a = i & 1 ? i - 1 : i - 2, b = i & 1 ? i - 2 : i - 1;
        if (place[a] != place[b] && place[b] != place[i] && place[a] != place[i])
            indices.push(remap[a], remap[b], remap[i]);
    }
    return indices;
}

// a mesh's packed vertex data for the GPU, one vertex per entry of a layout, which is the strip index of each,
// written into data when given, the buffer an earlier call returned for the same layout
function render3DMeshVertexData(mesh, vertices, data=new ArrayBuffer(vertices.length * RENDER3D_VERTEX_BYTES))
{
    const count = vertices.length;
    const floats = new Float32Array(data), ints = new Uint32Array(data);
    for (let j = 0; j < count; ++j)
    {
        const i = vertices[j], p = mesh.points[i], uv = mesh.uvs[i] || RENDER3D_DEFAULT_UV; // a hand built mesh may leave normals, uvs and colors empty
        render3DWriteVertex(floats, ints, j * RENDER3D_VERTEX_FLOATS, p.x, p.y, p.z,
            mesh.normals[i] || RENDER3D_DEFAULT_NORMAL, uv.x, uv.y, (mesh.colors[i] || WHITE).rgbaInt());
    }
    return data;
}

// reorder a convex polygon's points, counter clockwise from outside, into one triangle strip
function render3DPolygonStrip(points)
{
    const strip = [points[0]];
    for (let i = 1, j = points.length - 1; i <= j; ++i, --j)
    {
        strip.push(points[i]);
        if (i !== j)
            strip.push(points[j]);
    }
    return strip;
}

// turn every triangle of a mesh the other way round, the normals left alone: an index list reads each one in the
// other order, and a strip gets one extra point at each end, which flips every triangle and keeps the count even
function render3DFlipWinding(mesh)
{
    if (mesh.indices)
        return void render3DFlipTriangles(mesh.indices);
    for (const key of ['points', 'normals', 'uvs', 'colors'])
    {
        const a = mesh[key];
        if (a.length)
            a.unshift(a[0]), a.push(a[a.length - 1]);
    }
    mesh.vertexKeys = undefined;
}

///////////////////////////////////////////////////////////////////////////////

// frees the GPU buffer of a mesh that is garbage collected without dispose, some time after it goes; it holds the
// buffer and its context, never the mesh, or the mesh could not be collected, and dispose unregisters the mesh
const render3DMeshBuffers = typeof FinalizationRegistry == 'undefined' ? undefined :
    new FinalizationRegistry(({buffer, indexBuffer, generation})=>
    {
        if (generation !== render3D?.contextGeneration || !glContext) return;
        glContext.deleteBuffer(buffer);
        glContext.deleteBuffer(indexBuffer);
    });

/**
 * Mesh - Triangles with positions, normals, uvs and colors, uploaded once and drawn by matrix
 * - Build with addStrip, addQuad, combine or the shape builders, then render each frame
 * - Its back faces are skipped unless doubleSided is set, which the open builders like buildGrid do for you
 * - Two forms: a triangle strip, what the builders make, or an indexed list of triangles over their own vertices,
 *   what addTriangles and the model loaders make; upload sends the GPU an indexed list either way, see getTriangles,
 *   so a strip's joins between its pieces cost nothing to draw, and toIndexed turns a strip mesh into the list form
 * - The GPU buffer is created lazily on first render and dropped by dispose, or freed once the mesh is garbage
 *   collected, so dispose is only needed to free it right away, like for a mesh rebuilt often
 * @memberof Render3D
 * @example
 * const mesh = buildLathe([[0, -1], [1, 0], [0, 1]], 4); // octahedron
 * mesh.render(buildMatrix(vec3(0, 1, 0)), undefined, RED);
 */
class Mesh
{
    /** Create an empty mesh */
    constructor()
    {
        /** @property {Array<Vector3>} - Vertex positions, in strip order or one per vertex of an indexed mesh
         *  @type {Array<Vector3>} */
        this.points = [];
        /** @property {Array<Vector3>} - Vertex normals
         *  @type {Array<Vector3>} */
        this.normals = [];
        /** @property {Array<Vector2>} - Vertex texture coords, 0-1 across the tile
         *  @type {Array<Vector2>} */
        this.uvs = [];
        /** @property {Array<Color>} - Vertex colors
         *  @type {Array<Color>} */
        this.colors = [];
        /** @property {WebGLBuffer|undefined} - GPU vertex buffer, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.buffer = undefined;
        /** @property {WebGLBuffer|undefined} - GPU index buffer, the triangles, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.indexBuffer = undefined;
        /** @property {number} - Indices in the GPU index buffer, three per triangle */
        this.bufferCount = 0;
        this.indexType = 0; // gl.UNSIGNED_SHORT, or UNSIGNED_INT past 65535 vertices
        /** @property {boolean} - The mesh changed and needs uploading again, set it yourself if you edit the arrays */
        this.dirty = false;
        /** @property {boolean|undefined} - Draw every use of this mesh in the opaque stage as one instanced call, undefined follows render3D.instancing
         *  @type {boolean|undefined} */
        this.instanced = undefined;
        /** @property {boolean} - Draw both sides, each lit as the side that is seen; off skips the faces pointing away,
         *  which is faster and right for closed shapes, the open builders like buildGrid and buildRibbon turn it on */
        this.doubleSided = false;
        /** @property {boolean} - The values change often but the shape never does, for a water surface or a cloth: set once,
         *  the mesh keeps its GPU layout and a dirty upload only rewrites the vertices into the buffer it has; the strip
         *  must keep the same points in the same order, a new point count asserts; the layout is decided by the first
         *  upload, so strip entries equal then stay one vertex and triangles with no area then stay dropped, set
         *  vertexKeys or give it distinct values at the start, not a flat grid of one color or points all in one place */
        this.dynamicDraw = false;
        /** @property {Array<number>|undefined} - The mesh as an indexed triangle list instead of a strip: the arrays hold each vertex
         *  once and this says how they join, three vertex numbers per triangle, counter clockwise seen from the front like a
         *  strip's first triangle; addTriangles and the loaders fill it, toIndexed turns a strip mesh into this form
         *  @type {Array<number>|undefined} */
        this.indices = undefined;
        /** @property {Int32Array|undefined} - Which strip entries are one vertex, set by a builder that knows, one whole number
         *  per entry with equal numbers meaning the same vertex; upload skips its search for them, then drops the keys, since
         *  an edit after that may tell the entries apart; adding geometry or recomputing normals drops them too
         *  @type {Int32Array|undefined} */
        this.vertexKeys = undefined;
        /** @type {{vertices: Array<number>, pointCount: number, data: ArrayBuffer}|undefined} */
        this.vertexLayout = undefined; // the strip index of each GPU vertex, the point count and packed data of the last upload, for a dynamicDraw mesh
        this.instanceCount = 0; // draws waiting in this mesh's batch, with their values, texture and draw state
        /** @type {Float32Array|undefined} */
        this.instanceData = undefined;
        /** @property {number} - Bounding sphere radius around the origin, for culling and picking, computed by upload */
        this.radius = 0;
        /** @property {{min: Vector3, max: Vector3}|undefined} - Bounding box, for picking, measured with the radius
         *  @type {{min: Vector3, max: Vector3}|undefined} */
        this.bounds = undefined;
        this.contextGeneration = 0; // the context the buffer belongs to, see render3D.contextGeneration
    }

    /** Number of vertices in the mesh
     *  @return {number} */
    get vertexCount() { return this.points.length; }

    /** Add a triangle strip, joined to the previous one by invisible flat triangles so one mesh holds many strips
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @return {Mesh} */
    addStrip(points, normals, uvs, colors)
    {
        if (this.indices)
        {
            // an indexed mesh takes the strip as the triangles it makes
            const part = new Mesh().addStrip(points, normals, uvs, colors).toIndexed();
            return this.addTriangles(part.points, part.indices, part.normals, part.uvs, part.colors);
        }
        render3DForEachStripVertex(points, normals, uvs, colors, (p, n, uv, c)=>
        {
            this.points.push(p);
            this.normals.push(n);
            this.uvs.push(uv);
            this.colors.push(c);
        });
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Add triangles over their own vertices, the indexed form a model file comes in
     *  - The mesh becomes indexed: a strip mesh is turned into triangles first, and strips added later join as triangles
     *  - List each triangle counter clockwise as seen from the front, like a strip's first triangle
     *  @param {Array<Vector3>} points - Each vertex once
     *  @param {Array<number>} indices - Three vertex numbers per triangle, into points
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @return {Mesh} */
    addTriangles(points, indices, normals, uvs, colors)
    {
        ASSERT(isArray(points) && isArray(indices) && indices.length % 3 === 0, 'addTriangles takes points and three indices per triangle');
        ASSERT(indices.every(i=> i >= 0 && i < points.length && i % 1 === 0), 'an index points past the vertices given');
        this.toIndexed();
        const offset = this.points.length, normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
        for (let i = 0; i < points.length; ++i)
        {
            this.points.push(points[i]);
            this.normals.push(normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL);
            this.uvs.push(uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV);
            this.colors.push(colorArray ? colors[i] : colors || WHITE);
        }
        for (const i of indices)
            this.indices.push(i + offset);
        this.dirty = true;
        return this;
    }

    /** Turn a strip mesh into the indexed form, each distinct vertex once and the real triangles over them, in place
     *  - An indexed mesh is left as it is; the builders make strips and a loader makes this, and either draws the same
     *  @return {Mesh} */
    toIndexed()
    {
        if (this.indices) return this;
        const {vertices, indices} = this.getTriangles();
        this.points = vertices.map(i=> this.points[i]);
        this.normals = vertices.map(i=> this.normals[i] || RENDER3D_DEFAULT_NORMAL);
        this.uvs = vertices.map(i=> this.uvs[i] || RENDER3D_DEFAULT_UV);
        this.colors = vertices.map(i=> this.colors[i] || WHITE);
        // the list upload sends reads clockwise, the pass draws it that way; the authoring form is counter clockwise
        this.indices = render3DFlipTriangles(indices);
        this.vertexKeys = undefined;
        this.dirty = true;
        return this;
    }

    /** Add a flat quad from four corners in loop order, counter clockwise seen from the front, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {Color|Array<Color>} [color] - One for all or one per corner
     *  @param {Array<Vector2>} [uvs] - One per corner, default across the tile
     *  @return {Mesh} */
    addQuad(a, b, c, d, color, uvs)
    {
        return this.addStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d),
            uvs ? render3DQuadValues(uvs) : RENDER3D_QUAD_UVS, render3DQuadValues(color));
    }

    /** Append another mesh transformed by a matrix, for building one shape out of several
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Transform, or just a position to move it to
     *  @param {Color} [color] - Multiplies the appended vertex colors
     *  @return {Mesh} */
    combine(mesh, matrix=RENDER3D_IDENTITY, color=WHITE)
    {
        matrix = render3DMatrix(matrix); // most parts only need moving into place
        const normalMatrix = render3DNormalMatrix(matrix), mirrors = render3DMirrors(matrix.m);
        let part = mesh, order;
        if (this.indices || mesh.indices)
        {
            // one of them is indexed, so both are: the part as a copy if it is a strip
            this.toIndexed();
            part = mesh.indices ? mesh : new Mesh().combine(mesh).toIndexed();
            const offset = this.points.length, indices = part.indices;
            // the count read once, a mesh combined with itself grows as it is read; a mirror turns every triangle the other way round
            for (let t = 0, n = indices.length; t < n; t += 3)
                this.indices.push(indices[t] + offset, indices[t + (mirrors ? 2 : 1)] + offset, indices[t + (mirrors ? 1 : 2)] + offset);
        }
        else if (mirrors && part.points.length)
        {
            // a strip reads the other way round with one more point at each end, as in flipNormals
            const last = part.points.length - 1;
            order = [0, ...part.points.keys(), last];
        }
        for (let j = 0, count = order ? order.length : part.points.length; j < count; ++j)
        {
            const i = order ? order[j] : j;
            this.points.push(matrix.transformPoint(part.points[i]));
            this.normals.push(normalMatrix.transformDirection(part.normals[i] || RENDER3D_DEFAULT_NORMAL).normalize());
            this.uvs.push((part.uvs[i] || RENDER3D_DEFAULT_UV).copy());
            this.colors.push((part.colors[i] || WHITE).multiply(color));
        }
        this.doubleSided ||= mesh.doubleSided; // an open part leaves the whole mesh open
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Scale every uv, so a whole texture repeats across the mesh when its TextureInfo wraps
     *  @param {Vector2|number} scale - Repeats across and up, a number for both
     *  @return {Mesh} */
    scaleUVs(scale)
    {
        const s = render3DSize2(scale);
        this.uvs = this.uvs.map(uv=> vec2(uv.x * s.x, uv.y * s.y)); // new vectors, builders share uv objects between faces
        this.dirty = true;
        return this;
    }

    /** Move, turn or scale every vertex in place, normals follow along
     *  @param {Matrix4|Vector3} matrix - Transform, or just an offset to move by
     *  @return {Mesh} */
    transform(matrix)
    {
        matrix = render3DMatrix(matrix);
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < this.points.length; ++i)
        {
            this.points[i] = matrix.transformPoint(this.points[i]);
            // a mesh built by hand may have no normals yet, and then there is nothing to turn
            this.normals[i] &&= normalMatrix.transformDirection(this.normals[i]).normalize();
        }
        render3DMirrors(matrix.m) && render3DFlipWinding(this); // a mirror would leave the faces pointing in
        this.dirty = true;
        return this;
    }

    /** Turn the mesh inside out so it is lit and drawn from within, for rooms and domes
     *  @return {Mesh} */
    flipNormals()
    {
        render3DFlipWinding(this);
        this.normals = this.normals.map(n=> n.scale(-1));
        this.dirty = true;
        return this;
    }

    /** Set every vertex color
     *  @param {Color} color
     *  @return {Mesh} */
    setColor(color)
    {
        // one per point, not one per color already there, so a mesh built by hand with no
        // colors gets them instead of quietly staying white
        this.colors = this.points.map(()=> color);
        this.dirty = true;
        return this;
    }

    /** Measure the axis aligned box around the vertices
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds()
    {
        if (!this.points.length)
            return {min: vec3(), max: vec3()};
        const lo = vec3(Infinity), hi = vec3(-Infinity);
        for (const p of this.points)
        {
            lo.x = min(lo.x, p.x); lo.y = min(lo.y, p.y); lo.z = min(lo.z, p.z);
            hi.x = max(hi.x, p.x); hi.y = max(hi.y, p.y); hi.z = max(hi.z, p.z);
        }
        return {min: lo, max: hi};
    }

    /** Move the mesh so the center of its bounds is on the origin
     *  @return {Mesh} */
    center()
    {
        const bounds = this.getBounds();
        return this.transform(bounds.min.add(bounds.max).scale(-.5));
    }

    /** Scale the mesh evenly so its largest extent is a size, for loaded models of unknown units
     *  @param {number} [size]
     *  @return {Mesh} */
    fit(size=1)
    {
        const bounds = this.getBounds();
        const extent = bounds.max.subtract(bounds.min);
        const scale = size / (max(extent.x, extent.y, extent.z) || 1);
        return this.transform(Matrix4.scaling(vec3(scale)));
    }

    /** Measure the bounding sphere around the origin into radius, called by upload
     *  @return {number} */
    computeRadius()
    {
        let r = 0;
        for (const p of this.points)
            r = max(r, p.lengthSquared());
        this.bounds = this.getBounds(); // measured with it, a pick tests a mesh's box after its sphere
        return this.radius = r ** .5;
    }

    /** Derive normals from the triangles, of the strip or of the index list
     *  @param {boolean} [smooth] - Round the lighting across faces instead of giving each face a hard edge; flat
     *    normals on an indexed mesh give every corner its own vertex
     *  @return {Mesh} */
    computeNormals(smooth=false)
    {
        if (this.indices)
        {
            // the triangles are listed: smooth normals add up around each position, weighted by the corner angle
            // like the strip's, so vertices split apart at one place smooth back together and a mesh can go flat and
            // smooth again; flat ones need a vertex per corner, so the vertices are split up first
            if (!smooth)
            {
                const split = (a)=> this.indices.map(i=> a[i]);
                this.points = split(this.points), this.normals = split(this.normals), this.uvs = split(this.uvs), this.colors = split(this.colors);
                this.indices = this.indices.map((_, i)=> i);
            }
            const points = this.points, indices = this.indices, normals = points.map(()=> RENDER3D_DEFAULT_NORMAL), sums = new Map;
            const key = (p)=> `${round(p.x * 1e5)},${round(p.y * 1e5)},${round(p.z * 1e5)}`;
            for (let t = 0; t < indices.length; t += 3)
            {
                const a = points[indices[t]], b = points[indices[t+1]], c = points[indices[t+2]];
                const cross = b.subtract(a).cross(c.subtract(a));
                if (!cross.lengthSquared()) continue;
                const normal = cross.normalize();
                if (!smooth)
                {
                    normals[indices[t]] = normals[indices[t+1]] = normals[indices[t+2]] = normal; // its own three corners
                    continue;
                }
                for (let j = 0; j < 3; ++j)
                {
                    const p = points[indices[t+j]], u = points[indices[t+(j+1)%3]].subtract(p), v = points[indices[t+(j+2)%3]].subtract(p);
                    const angle = Math.acos(clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
                    const k = key(p);
                    sums.set(k, (sums.get(k) || vec3()).add(normal.scale(angle)));
                }
            }
            this.normals = smooth ? points.map(p=> { const s = sums.get(key(p)); return s && s.lengthSquared() ? s.normalize() : RENDER3D_DEFAULT_NORMAL; }) : normals;
            this.dirty = true;
            return this;
        }

        // the outward normal of each triangle in the strip
        const points = this.points, n = points.length;
        const faceNormals = [];
        for (let i = 0; i + 2 < n; ++i)
        {
            const a = points[i], b = points[i+1], c = points[i+2];
            const normal = b.subtract(a).cross(c.subtract(a));
            // triangles in a strip alternate which way they wind, so every other one is flipped back
            // a zero normal means a flat triangle joining two strips, so skip it
            faceNormals.push(normal.lengthSquared() ? normal.normalize(i & 1 ? 1 : -1) : undefined);
        }

        // then hand those to the vertices, shared around a position or kept per face
        const normals = points.map(()=> RENDER3D_DEFAULT_NORMAL);
        if (smooth)
        {
            // add up the face normals meeting at each position, each weighted by its corner angle so a cube
            // corner averages its three faces evenly however the strips cut them, then normalize
            const sums = new Map;
            const key = (p)=> `${round(p.x * 1e5)},${round(p.y * 1e5)},${round(p.z * 1e5)}`;
            faceNormals.forEach((f, i)=> f && [0, 1, 2].forEach(j=>
            {
                const a = points[i + j], u = points[i + (j + 1) % 3].subtract(a), v = points[i + (j + 2) % 3].subtract(a);
                const angle = Math.acos(clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
                const k = key(a);
                sums.set(k, (sums.get(k) || vec3()).add(f.scale(angle)));
            }));
            for (let i = 0; i < n; ++i)
                normals[i] = (sums.get(key(points[i])) || RENDER3D_DEFAULT_NORMAL).normalize();
        }
        else
            // every triangle writes its own three corners, so the only vertices left with the default
            // are the repeats at the ends of a strip, which no triangle with any area uses
            faceNormals.forEach((f, i)=> f && (normals[i] = normals[i+1] = normals[i+2] = f));

        this.normals = normals;
        this.vertexKeys = undefined; // flat normals tell entries at one place apart
        this.dirty = true;
        return this;
    }

    /** Pack the vertices and create the GPU buffer, called automatically by render
     *  @return {Mesh} */
    upload()
    {
        this.computeRadius();
        if (!render3D?.program || !glContext) return this;
        const gl = glContext, layout = this.vertexLayout;
        // no layout when dynamicDraw was turned on after an upload, the next upload makes one
        if (this.dynamicDraw && layout && this.buffer && this.contextGeneration === render3D.contextGeneration)
        {
            // the layout of the last upload stands, only the values are written again into the buffer it has,
            // packed into the same memory each time so a mesh uploaded every frame makes no garbage
            ASSERT(layout.pointCount === this.points.length, 'a dynamicDraw mesh keeps its shape, the same points in the same order; for a new shape make a new mesh or turn dynamicDraw off', this.points.length);
            if (layout.pointCount === this.points.length)
            {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, render3DMeshVertexData(this, layout.vertices, layout.data));
                gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
                this.dirty = false;
                return this;
            }
        }
        this.dispose();
        const {vertices, indices} = this.getTriangles(), count = vertices.length, wide = count > 65535;
        const data = render3DMeshVertexData(this, vertices);
        this.vertexLayout = this.dynamicDraw ? {vertices, pointCount: this.points.length, data} : undefined;
        this.vertexKeys = undefined; // used once: an edit after this may tell entries apart
        this.buffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        this.bufferCount = indices.length;
        this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        this.dirty = false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, this.dynamicDraw ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wide ? new Uint32Array(indices) : new Uint16Array(indices), gl.STATIC_DRAW);
        this.contextGeneration = render3D.contextGeneration;
        render3DMeshBuffers?.register(this, {buffer: this.buffer, indexBuffer: this.indexBuffer, generation: this.contextGeneration}, this);
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
    }

    /** The mesh as an indexed triangle list, what upload sends to the GPU: the strip's real triangles over its
     *  distinct vertices, the joins between its pieces dropped and every triangle facing the way it did in the strip
     *  - Vertices are compared to a millionth, so two at one place with the same normal, uv and color are one
     *  @return {{vertices: Array<number>, indices: Array<number>}} - vertices are strip indices, one per distinct
     *    vertex; indices are the triangles, three per triangle, into vertices */
    getTriangles()
    {
        const count = this.points.length, vertices = [];
        if (this.indices)
        {
            // already a list: every vertex as it is, and the triangles read the way the pass draws, clockwise
            for (let i = 0; i < count; ++i)
                vertices.push(i);
            return {vertices, indices: render3DFlipTriangles(this.indices.slice())};
        }
        const remap = new Int32Array(count), place = new Int32Array(count), keys = this.vertexKeys;
        if (keys && keys.length === count)
        {
            // a builder said which entries are one vertex: the first entry with a key stands for every entry with it,
            // and is their place, so nothing is searched
            const first = new Int32Array(count).fill(-1);
            for (let i = 0; i < count; ++i)
            {
                const key = keys[i];
                ASSERT(key >= 0 && key < count, 'vertexKeys must be whole numbers below the entry count', key);
                const j = first[key];
                if (j < 0)
                    first[key] = i, remap[i] = vertices.length, vertices.push(i);
                else
                    remap[i] = remap[j];
                place[i] = first[key];
            }
            return {vertices, indices: render3DStripTriangles(count, remap, place)};
        }

        // each vertex as nine whole numbers, its values in millionths and its color, so vertices hash and compare as
        // numbers; a hash table over all nine finds the distinct vertices and one over the first three the places,
        // each slot holding a vertex index plus one and a taken slot moving on to the next
        const values = new Float64Array(count * 9);
        let size = 1;
        while (size < count * 2) size *= 2;
        const mask = size - 1, seen = new Int32Array(size), places = new Int32Array(size);
        const mix = (h, v)=> Math.imul(h ^ v, 0x9e3779b1) >>> 0;
        for (let i = 0; i < count; ++i)
        {
            const p = this.points[i], n = this.normals[i] || RENDER3D_DEFAULT_NORMAL, uv = this.uvs[i] || RENDER3D_DEFAULT_UV, k = i * 9;
            const x = values[k] = round(p.x * 1e6), y = values[k+1] = round(p.y * 1e6), z = values[k+2] = round(p.z * 1e6);
            values[k+3] = round(n.x * 1e6), values[k+4] = round(n.y * 1e6), values[k+5] = round(n.z * 1e6);
            values[k+6] = round(uv.x * 1e6), values[k+7] = round(uv.y * 1e6);
            values[k+8] = (this.colors[i] || WHITE).rgbaInt();
            let h = mix(mix(mix(0x811c9dc5, x), y), z);

            // the place, shared with a vertex there that has another normal or uv, as at a lathe's poles
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = places[slot] - 1;
                if (o < 0) { places[slot] = i + 1, place[i] = i; break; }
                if (values[o*9] === x && values[o*9+1] === y && values[o*9+2] === z) { place[i] = o; break; }
            }

            // the whole vertex
            for (let m = 3; m < 9; ++m)
                h = mix(h, values[k+m]);
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = seen[slot] - 1;
                if (o < 0) { seen[slot] = i + 1, remap[i] = vertices.length, vertices.push(i); break; }
                let same = true;
                for (let m = 0; same && m < 9; ++m)
                    same = values[o*9+m] === values[k+m];
                if (same) { remap[i] = remap[o]; break; }
            }
        }
        return {vertices, indices: render3DStripTriangles(count, remap, place)};
    }

    /** Draw the mesh with the current draw state, batched with its other uses in the opaque stage
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    render(matrix, tileInfo, color) { render3D?.drawMesh(this, matrix, tileInfo, color); }

    /** Delete the GPU buffer now, the CPU arrays stay so the mesh can be rendered again
     *  - Optional, the buffer is freed anyway once the mesh is garbage collected, this frees it right away */
    dispose()
    {
        if (!this.buffer) return;
        render3DMeshBuffers?.unregister(this); // freed here, so not again when the mesh is collected
        // a buffer from a context that was lost is gone with it, and the new context refuses to delete it
        if (this.contextGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer), glContext?.deleteBuffer(this.indexBuffer);
        this.buffer = this.indexBuffer = undefined;
        this.bufferCount = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Shape builders, all centered on the origin so buildMatrix does placement
// Sizes are full sizes like buildBox and the 2D drawCircle, sides go around an axis and rings along it

/**
 * Spin a flat outline around the Y axis to make a round shape, like a vase or a wheel
 * - profile is [[radius, y], ...] from bottom to top
 * - A profile that ends where it starts makes a closed ring like a donut
 * - An end left open, with a radius and no cap, makes the mesh doubleSided so its inside shows
 * - An end on the axis smooth shades as a round pole like a sphere's when its segment is within 45 degrees of
 *   level, and as a point like a cone's tip when it is steeper
 * @param {Array<Array<number>>} profile
 * @param {number} [sides] - Around the axis
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends that have a radius with flat discs
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const vase = buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 12);
 */
function buildLathe(profile, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    ASSERT(isArray(profile) && profile.length > 1, 'lathe profile needs at least 2 points');
    sides |= 0;
    ASSERT(sides > 2, 'lathe needs at least 3 sides');
    const mesh = new Mesh;
    const rings = profile.length;
    const point = (i, a)=> vec3(sin(a) * profile[i][0], profile[i][1], cos(a) * profile[i][0]);

    // 2D outward normal of each profile segment, in (radius, y) space
    const segmentNormal = (i)=>
    {
        const [r0, y0] = profile[i], [r1, y1] = profile[i+1];
        const n = vec2(y1 - y0, r0 - r1);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    // vertex normal: average of the adjacent segment normals, across the seam when the profile is closed,
    // and a closed profile needs no caps
    const closed = rings > 2 && abs(profile[0][0] - profile[rings-1][0]) < 1e-9 && abs(profile[0][1] - profile[rings-1][1]) < 1e-9;
    const segmentLength = (i)=> hypot(profile[i+1][0] - profile[i][0], profile[i+1][1] - profile[i][1]);
    const vertexNormal = (i)=>
    {
        // an open end on the axis is a pole and points along it, like a sphere's, when the surface there is
        // within 45 degrees of level; a steeper one is a point like a cone's tip and takes its side's normal
        if (!closed && (!i || i == rings - 1) && abs(profile[i][0]) < 1e-9)
        {
            const up = i ? 1 : -1;
            if (segmentNormal(i ? i - 1 : 0).y * up > Math.SQRT1_2 - 1e-9)
                return vec2(0, up);
        }
        // otherwise the neighbors weighted by their length, so a short band does not tilt a long wall
        let n = vec2();
        const add = (s)=> n = n.add(segmentNormal(s).scale(segmentLength(s)));
        if (i > 0) add(i - 1);
        else if (closed) add(rings - 2);
        if (i < rings - 1) add(i);
        else if (closed) add(0);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    const normal3D = (n, a)=> vec3(sin(a) * n.x, n.y, cos(a) * n.x);

    // v runs along the profile by arc length
    const lengths = [0];
    for (let i = 1; i < rings; ++i)
        lengths[i] = lengths[i-1] + hypot(profile[i][0] - profile[i-1][0], profile[i][1] - profile[i-1][1]);
    const total = lengths[rings - 1] || 1;
    const v = (i)=> 1 - lengths[i] / total;

    for (let i = 0; i + 1 < rings; ++i)
    {
        if (smooth)
        {
            // one ribbon around the ring pair, top point then bottom point per column
            const points = [], normals = [], uvs = [];
            const n0 = vertexNormal(i), n1 = vertexNormal(i + 1);
            // a point on the axis is one per column, each drawn by the face beside it, so its normal turns half
            // a side toward the middle of that face; a pole's points along the axis and does not turn
            const half = PI / sides, turn1 = abs(profile[i + 1][0]) < 1e-9 ? -half : 0, turn0 = abs(profile[i][0]) < 1e-9 ? half : 0;
            for (let j = 0; j <= sides; ++j)
            {
                const a = j / sides * 2 * PI, u = j / sides;
                points.push(point(i + 1, a), point(i, a));
                normals.push(normal3D(n1, a + turn1), normal3D(n0, a + turn0));
                uvs.push(vec2(u, v(i + 1)), vec2(u, v(i)));
            }
            mesh.addStrip(points, normals, uvs);
        }
        else
        {
            // one quad per side with its face normal
            const n = segmentNormal(i);
            for (let j = 0; j < sides; ++j)
            {
                const a0 = j / sides * 2 * PI, a1 = (j + 1) / sides * 2 * PI;
                const u0 = j / sides, u1 = (j + 1) / sides;
                mesh.addStrip(
                    [point(i + 1, a0), point(i, a0), point(i + 1, a1), point(i, a1)],
                    normal3D(n, (a0 + a1) / 2),
                    [vec2(u0, v(i + 1)), vec2(u0, v(i)), vec2(u1, v(i + 1)), vec2(u1, v(i))]);
            }
        }
    }

    // flat discs close the ends that have a radius, a hard edge even when the sides are smooth
    if (capped && !closed)
        for (const [i, up] of /** @type {Array<[number, boolean]>} */ ([[0, false], [rings - 1, true]]))
        {
            if (abs(profile[i][0]) < 1e-9) continue; // a pole has no cap
            const points = [], uvs = [];
            for (let j = 0; j < sides; ++j)
            {
                const a = (up ? j : -j) / sides * 2 * PI; // counter clockwise seen from outside
                points.push(point(i, a));
                uvs.push(vec2(sin(a) * .5 + .5, cos(a) * .5 + .5));
            }
            mesh.addStrip(render3DPolygonStrip(points), vec3(0, up ? 1 : -1, 0), render3DPolygonStrip(uvs));
        }

    // an end left open shows the inside, so it is seen from both sides
    mesh.doubleSided = !closed && !capped && (abs(profile[0][0]) > 1e-9 || abs(profile[rings-1][0]) > 1e-9);
    return mesh;
}

/**
 * Build a sphere centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(size=1, sides=16, rings=8, smooth=render3D?.smoothShading)
{
    ASSERT(rings > 1, 'sphere needs at least 2 rings');
    const profile = [];
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI - PI/2;
        profile.push([cos(a) * size / 2, sin(a) * size / 2]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a box centered on the origin, six flat faces with uvs covering each face
 * @param {Vector3|number} [size] - Full size, a number for a cube
 * @return {Mesh}
 * @memberof Render3D
 */
function buildBox(size=1)
{
    const mesh = new Mesh;
    const half = render3DSize3(size).scale(.5);
    // each face: normal, right axis, up axis (right cross up = normal)
    const faces = [
        [vec3(0, 0, 1),  vec3(1, 0, 0),  vec3(0, 1, 0)],
        [vec3(0, 0, -1), vec3(-1, 0, 0), vec3(0, 1, 0)],
        [vec3(1, 0, 0),  vec3(0, 0, -1), vec3(0, 1, 0)],
        [vec3(-1, 0, 0), vec3(0, 0, 1),  vec3(0, 1, 0)],
        [vec3(0, 1, 0),  vec3(1, 0, 0),  vec3(0, 0, -1)],
        [vec3(0, -1, 0), vec3(1, 0, 0),  vec3(0, 0, 1)],
    ];
    for (const [n, r, u] of faces)
    {
        const center = n.multiply(half);
        const right = r.multiply(half), up = u.multiply(half);
        mesh.addStrip(render3DQuadAxes(center, right, up), n, RENDER3D_QUAD_UVS);
    }
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth rounds the lighting across cells and colors each corner
 * - flat lights and colors each cell on its own, so a checkerboard stays crisp
 * - doubleSided, a sheet seen from both sides; turn it off for ground only ever seen from above
 * - One cell is a plain square, render3D.planeMesh and planeMeshDoubleSided are shared ones
 * @param {Vector2|number} [size] - World size along X and Z, a number for a square
 * @param {Vector2|number} [segments] - Cells along X and Z, a number for both
 * @param {Color|function(number, number): Color} [color] - One Color for the whole grid, or (x, z) => Color
 * @param {function(number, number): number} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const ground = buildGrid(vec2(20), 10, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? GRAY : WHITE); // 2 unit checks
 */
function buildGrid(size=vec2(1), segments=1, color, heightFunction=()=>0, smooth=render3D?.smoothShading)
{
    size = render3DSize2(size);
    segments = render3DSize2(segments);
    ASSERT(segments.x > 0 && segments.y > 0 && segments.x % 1 === 0 && segments.y % 1 === 0, 'grid segments must be whole numbers above zero');
    const mesh = new Mesh;
    const segmentsX = segments.x, segmentsZ = segments.y;
    const cellX = size.x / segmentsX, cellZ = size.y / segmentsZ;
    const halfX = size.x / 2, halfZ = size.y / 2, ex = cellX / 2, ez = cellZ / 2;
    const px = (i)=> i * cellX - halfX, pz = (j)=> j * cellZ - halfZ;
    const colorAt = /** @type {function(number, number): Color} */ (color);
    const cellColor = (i, j)=> !color ? WHITE : isColor(color) ? /** @type {Color} */ (color) : colorAt(px(i), pz(j));
    // a big terrain has millions of vertices, so each one is made once, shared by the rows above and below it,
    // and its slope normal is worked out in numbers, the same normal render3DSlopeNormal gives
    const row = (j)=>
    {
        const points = [], normals = [], uvs = [], colors = [], z = pz(j);
        const z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
        for (let i = 0; i <= segmentsX; ++i)
        {
            const x = px(i);
            points.push(vec3(x, heightFunction(x, z), z));
            uvs.push(vec2(i / segmentsX, j / segmentsZ));
            if (!smooth) continue;
            const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX);
            const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
            const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
            const s = 1 / hypot(dx, 1, dz);
            normals.push(vec3(-dx * s, s, -dz * s));
            colors.push(cellColor(i, j));
        }
        return {points, normals, uvs, colors};
    };
    let above = row(0);
    for (let j = 0; j < segmentsZ; ++j)
    {
        const below = row(j + 1);
        if (smooth)
        {
            // one ribbon per row with vertex normals from the slope
            const points = [], normals = [], uvs = [], colors = [];
            for (let i = 0; i <= segmentsX; ++i)
            {
                points.push(above.points[i], below.points[i]);
                normals.push(above.normals[i], below.normals[i]);
                uvs.push(above.uvs[i], below.uvs[i]);
                colors.push(above.colors[i], below.colors[i]);
            }
            mesh.addStrip(points, normals, uvs, colors);
        }
        else
        {
            // one quad per cell with its face normal and one color sampled at its center
            for (let i = 0; i < segmentsX; ++i)
                mesh.addQuad(above.points[i], below.points[i], below.points[i+1], above.points[i+1], cellColor(i + .5, j + .5),
                    [above.uvs[i], below.uvs[i], below.uvs[i+1], above.uvs[i+1]]);
        }
        above = below;
    }
    if (smooth)
    {
        // the grid knows which strip entries are one vertex, each shared by the rows above and below it and by the
        // repeats at the ends of its ribbons, so the upload of a big terrain skips searching millions of entries
        const n = 2 * (segmentsX + 1) + 2, keys = mesh.vertexKeys = new Int32Array(mesh.points.length);
        const id = (i, j)=> j * (segmentsX + 1) + i;
        for (let j = 0; j < segmentsZ; ++j)
        {
            const start = j * n;
            keys[start] = id(0, j); // the leading repeat
            for (let i = 0; i <= segmentsX; ++i)
                keys[start + 1 + 2*i] = id(i, j), keys[start + 2 + 2*i] = id(i, j + 1);
            keys[start + n - 1] = id(segmentsX, j + 1); // the trailing repeat
        }
    }
    mesh.doubleSided = true; // a sheet, seen from both sides; terrain seen only from above can turn it off
    return mesh;
}

/**
 * Build a sky dome: a sphere colored by direction, wound to be seen from inside
 * - set it as render3D.sky and the pass draws it around the camera behind everything
 * @param {Color} [topColor] - Straight up
 * @param {Color} [horizonColor] - Level with the camera
 * @param {Color} [bottomColor] - Straight down, what a camera looking at the ground sees past its edge; defaults to the horizon color
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSky(topColor=hsl(.6, .8, .55), horizonColor=hsl(.6, 1, .9), bottomColor=horizonColor, sides=16, rings=8)
{
    const mesh = new Mesh;
    const point = (i, a)=>
    {
        const e = i / rings * PI - PI/2;
        return vec3(sin(a) * cos(e), sin(e), cos(a) * cos(e));
    };
    const color = (i)=>
    {
        const y = point(i, 0).y;
        return y < 0 ? horizonColor.lerp(bottomColor, -y) : horizonColor.lerp(topColor, y);
    };
    for (let i = 0; i < rings; ++i)
    {
        // bottom point then top point per column, the reverse of the lathe, so the front faces inward
        const points = [], colors = [];
        for (let j = 0; j <= sides; ++j)
        {
            const a = j / sides * 2 * PI;
            points.push(point(i, a), point(i + 1, a));
            colors.push(color(i), color(i + 1));
        }
        mesh.addStrip(points, undefined, undefined, colors);
    }
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Set pos3D, rotation3D and scale3D instead of the 2D pos, size and angle
 * - Gets update, children, timers, destroy and renderOrder from EngineObject
 * - velocity3D is added to pos3D each frame, along with render3D.gravity and damping once it has a mass
 * - Objects face -Z, the same way the camera does, so lookAt turns them to face a point
 * - The 2D pos and velocity are still there but nothing draws them
 * - These inherited fields are 2D only and do nothing here: angle, angleVelocity, angleDamping,
 *   additiveColor, drawSize, mirror, clampSpeed, friction and groundObject
 * - The inherited shader works here as in 2D, and with emissive at 1 its snippet does its own lighting
 * - Set sync2D for a 2D game with 3D looks, pos and angle then drive pos3D and rotation3D,
 *   which is the one way those 2D fields reach a 3D object
 * - setCollision takes the same flags as in 2D, but the solid collision happens in 3D against size3D
 * - The solid box is axis aligned in the world, rotation3D is ignored like angle is in 2D, so give a turned wall a
 *   size3D along the world axes
 * - Its tile and raycast halves are 2D only so they default off here, and a child sits solid collision out
 * - A sync2D object collides in 2D instead, which needs the 2D size set as well as size3D
 * - setMesh swaps the mesh and frees the old one, for text and terrain that get built again
 * - addChild attaches the 3D transform, and pos3D becomes an offset from the parent; attach keeps the child where
 *   it is and works the offset out, and removeChild leaves it where it was in the world
 * - The 2D offset arguments of addChild do nothing here, set the child's pos3D
 * @extends EngineObject
 * @memberof Render3D
 * @example
 * class Spinner extends EngineObject3D
 * {
 *     constructor(pos) { super(pos, buildBox(), undefined, RED); }
 *     update() { this.rotation3D.y += .02; }
 * }
 */
class EngineObject3D extends EngineObject
{
    /** Create a 3D object and add it to the object list
     *  @param {Vector3} [pos3D] - World space position
     *  @param {Mesh} [mesh] - Mesh to draw, undefined draws nothing
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile; a whole TextureInfo becomes the tile that covers it
     *  @param {Color} [color] - Tint */
    constructor(pos3D=vec3(), mesh, tileInfo, color=WHITE)
    {
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        // a whole texture is stored as the tile that covers it, with no padding or bleed to trim
        // the edges, so this is always a TileInfo like the 2D one and the object stays an EngineObject
        if (tileInfo instanceof TextureInfo)
            render3DWholeTiles.add(tileInfo = new TileInfo(vec2(), tileInfo.size, tileInfo, 0, 0));
        super(vec2(), vec2(), tileInfo, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        this.mass = 0; // static: no 2D physics, and no 3D gravity until a mass is set

        /** @property {Vector3} - World space position, local to the parent when attached to an EngineObject3D */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians, local to the parent when attached to an EngineObject3D */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale, local to the parent when attached to an EngineObject3D */
        this.scale3D = vec3(1);
        /** @property {Vector3} - Added to pos3D each frame by the engine before update, like the 2D velocity, no super call needed;
         *  damping and render3D.gravity act on it once the object has a mass */
        this.velocity3D = vec3();
        /** @property {Vector3} - Added to rotation3D each frame by the engine before update, angleDamping is 2D only */
        this.angleVelocity3D = vec3();
        /** @property {Mesh|undefined} - Mesh to draw
         *  @type {Mesh|undefined} */
        this.mesh = mesh;
        /** @property {Vector3} - Size for solid collision and the collect and callback helpers, and of the sprite when
         *  there is a tileInfo and no mesh; starts at the size of the mesh's box, or 1 with no mesh, and setMesh leaves
         *  it as it is; scale3D and any parent's scale grow it, so drawing and picking agree */
        const bounds = mesh && mesh.points.length ? mesh.getBounds() : undefined;
        this.size3D = bounds ? bounds.max.subtract(bounds.min) : vec3(1);
        /** @property {number} - Diameter of a soft shadow drawn under the object on render3D.softShadowHeight, 0 for none;
         *  scale3D and a parent's scale grow it, so set it once for the unscaled object */
        this.softShadow = 0;
        /** @property {boolean} - A sprite stands on world up instead of tilting toward the camera */
        this.upright = false;
        /** @property {boolean} - Keep this object's texture pixels hard edged, for pixel art that should not blur or bleed */
        this.pixelated = false;
        /** @property {boolean} - Copy the 2D pos and angle into pos3D and rotation3D each frame, for 2D games with 3D looks;
         *  set mass to use 2D physics, and pos3D.z stays yours to set or move with velocity3D.z */
        this.sync2D = false;
        /** @property {boolean} - Draw in the transparent stage, blended and sorted far to near with depth writes off; on for a sprite */
        this.transparent = !mesh && !!tileInfo;
        /** @property {boolean} - Additive blending, in the transparent stage */
        this.additive = false;
        /** @property {number} - How much it lights itself: 0 is lit as normal, 1 is its own color with no shading, for
         *  lamps and glowing things, between is partly self lit, and above 1 is brighter than its color, for bloom */
        this.emissive = 0;
        /** @property {number} - Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and 1 adds a light's full color at its brightest; its size is fixed */
        this.specular = 0;
        /** @property {boolean} - Draw into the shadow map when render3D.shadows is on; sprites and cut out textures cast their outline, additive objects never cast */
        this.castShadow = true;
        /** @property {boolean} - Collide as the sphere that fits size3D instead of as the size3D box, so it rolls around corners */
        this.collideAsSphere3D = false;
        /** @property {boolean} - Darkened by the shadow map when render3D.shadows is on */
        this.receiveShadow = true;
        /** @property {boolean|undefined} - Draw this object over the 2D scene, undefined uses render3D.renderAfter2D
         *  @type {boolean|undefined} */
        this.renderAfter2D = undefined;
        /** @property {Matrix4|undefined} - The transform from its parent, used in place of pos3D, rotation3D and
         *  scale3D when set, for one they cannot hold like a glTF pose with shear; read every frame it is set
         *  @type {Matrix4|undefined} */
        this.localMatrix = undefined;
        this.worldMatrix = new Matrix4;  // the world transform, kept up to date by render3DObjectMatrix; getMatrix returns a copy
        this.matrixBuilt = new Float64Array(9).fill(NaN); // the position, rotation and scale it was built from
        this.matrixVersion = 0;          // counts the rebuilds, so a child knows when its parent's changed
        /** @type {EngineObject3D|undefined} */
        this.matrixParent = undefined;   // the parent it was built under, and that parent's version then
        this.matrixParentVersion = 0;
        this.movePass = engineObjectsUpdateCount; // the engine pass a child last moved in, so a refresh is not a step
    }

    /** Move by the 3D velocities and push out of solids, called automatically each frame before update, like the 2D physics
     *  - update runs once every object has moved and collided, so bounce off anything else there, it lands before the draw
     *  - Override this and call super to change how the object moves itself
     *  - A sync2D object runs the 2D physics as well, and collides there instead */
    updatePhysics()
    {
        // a sync2D object collides in 2D, which measures the 2D size, and that starts at zero on a 3D object
        ASSERT(!this.sync2D || !this.collideSolidObjects || (this.size.x && this.size.y),
            'a sync2D object collides in 2D, so give it a 2D size as well as a size3D', this.size);
        if (this.sync2D)
            super.updatePhysics();
        render3DMove(this);
        // the engine only runs this for objects that own where they are, a child rides along with its parent
        if (this.collideSolidObjects && !this.sync2D)
            render3DCollideSolid(this);
    }

    /** Move a child by its own velocities, bring a sync2D object's pos3D up to its 2D pos, then update the children,
     *  called automatically each frame
     *  @param {boolean} [updateChildren] - Also update the children's transforms */
    updateTransforms(updateChildren=true)
    {
        if (!paused)
        {
            // a child is never given updatePhysics, so it moves here, as an offset from its parent: once per
            // engine pass, since addChild, attach and a game bring the transforms up to date too
            if (this.parent && this.movePass !== engineObjectsUpdateCount)
            {
                this.movePass = engineObjectsUpdateCount;
                render3DMove(this);
            }
        }

        // placed from its parent first, so a sync2D object copies where it is now, then its children from it
        super.updateTransforms(false);
        if (!paused && this.sync2D)
            this.pos3D.x = this.pos.x, this.pos3D.y = this.pos.y, this.rotation3D.z = -this.angle;
        if (updateChildren)
            for (const child of this.children)
                child.updateTransforms();
    }

    /** Set how this object collides, the same flags as in 2D
     *  - Solid collision happens in 3D here, against size3D boxes or spheres; a child sits it out
     *  - The boxes are axis aligned in the world, rotation3D is ignored
     *  - A sync2D object collides in 2D instead, against the 2D size, so set that as well as size3D
     *  @param {boolean} [collideSolidObjects] - Take part in solid collision
     *  @param {boolean} [isSolid] - Block other objects, a pair where neither one blocks passes through;
     *    blocking needs collideSolidObjects, so isSolid on its own is not allowed
     *  @param {boolean} [collideTiles] - Tile collision, 2D only so it needs sync2D
     *  @param {boolean} [collideRaycast] - Raycasts, 2D only; 3D has render3D.pick and engineObjectsRaycast3D */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=false, collideRaycast=false)
    { super.setCollision(collideSolidObjects, isSolid, collideTiles, collideRaycast); }

    /** Returns the world position
     *  @return {Vector3} */
    getWorldPos3D() { return render3DObjectMatrix(this).getTranslation(); }

    /** Returns the direction the object faces, its -Z axis in the world
     *  @return {Vector3} */
    getForward3D() { return render3DAxis(render3DObjectMatrix(this).m, 8).normalize(-1); }

    /** Returns the object's right axis in the world
     *  @return {Vector3} */
    getRight3D() { return render3DAxis(render3DObjectMatrix(this).m, 0).normalize(); }

    /** Returns the object's up axis in the world
     *  @return {Vector3} */
    getUp3D() { return render3DAxis(render3DObjectMatrix(this).m, 4).normalize(); }

    /** Returns a copy of the object's world transform, the parent's included when attached to an EngineObject3D
     *  - The object keeps its matrix and rebuilds it only when its position, rotation or scale changed, so this is cheap to call
     *  @return {Matrix4} */
    getMatrix() { return render3DObjectMatrix(this).copy(); }

    /** Turn the object so its -Z axis points at a world space target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target)
    {
        // rotation3D is local to the parent, so a child has to aim at the target from the parent's point of view
        const parent = this.parent instanceof EngineObject3D ? this.parent : undefined;
        const local = parent ? parent.getMatrix().invert().transformPoint(target) : target;
        this.rotation3D = render3DLookRotation(local.subtract(this.pos3D), this.rotation3D);
    }

    /** Attaches a child, its pos3D, rotation3D and scale3D taken as the offset from this one; returns child for chaining
     *  - The 2D offset arguments do nothing for an EngineObject3D child, set its pos3D
     *  @param {EngineObject} child
     *  @param {Vector2} [localPos]
     *  @param {number} [localAngle]
     *  @return {EngineObject} The child object attached */
    addChild(child, localPos, localAngle)
    {
        // addChild brings the child's transform up to date, which is not a step: it already moved this pass as
        // a root, or moves in the next one, so it must not move by its velocity again here
        if (child instanceof EngineObject3D)
            child.movePass = engineObjectsUpdateCount;
        return super.addChild(child, localPos, localAngle);
    }

    /** Attaches a child without moving it: its pos3D, rotation3D and scale3D become what they have to be under this
     *  parent to keep its world transform, where addChild takes them as the offset; returns child for chaining
     *  - A parent scaled unevenly and a child turned under it make a shear, which those three values cannot hold,
     *    so the child comes out as close as they can get; a uniform scale is exact
     *  @param {EngineObject} child
     *  @return {EngineObject} The child object attached */
    attach(child)
    {
        if (!(child instanceof EngineObject3D))
            return super.attach(child); // a 2D child only has the 2D transform to keep
        child.parent?.removeChild(child); // keeps its world values, so its own matrix is its world matrix
        const local = render3DObjectMatrix(this).copy().invert().multiply(render3DObjectMatrix(child));
        super.attach(child);
        child.pos3D = local.getTranslation();
        child.rotation3D = local.getRotation();
        child.scale3D = local.getScale();
        if (child.localMatrix)
            child.localMatrix = local; // a matrix given whole stays whole, shear and all
        return child;
    }

    /** Removes a child from this one, it stays where it is in the world: its pos3D, rotation3D and scale3D become
     *  its world values, with the same shear caveat as attach; a child being destroyed is let go as it is
     *  @param {EngineObject} child */
    removeChild(child)
    {
        if (child instanceof EngineObject3D && !child.destroyed)
        {
            const world = render3DObjectMatrix(child);
            child.pos3D = world.getTranslation();
            child.rotation3D = world.getRotation();
            child.scale3D = world.getScale();
            if (child.localMatrix)
                child.localMatrix = world.copy(); // a matrix given whole stays whole, shear and all
        }
        super.removeChild(child);
    }

    /** Draw a different mesh and free the GPU buffer of the one it replaces
     *  - For a mesh built again when something changes, like a score, a rebuilt terrain or a loaded model
     *  - A mesh another object is still drawing is left alone, since builders are often shared
     *  - Freeing one held somewhere else only costs it an upload, the points it was built from stay
     *  @param {Mesh} [mesh] - The mesh to draw from now on, undefined to draw nothing
     *  @return {Mesh|undefined} - The mesh passed in */
    setMesh(mesh)
    {
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        const old = this.mesh;
        this.mesh = mesh;
        // nothing to free and nothing to look for when it was never uploaded
        if (old && old !== mesh && old.buffer && !engineObjects.some(o=> /** @type {EngineObject3D} */ (o).mesh === old))
            old.dispose();
        return mesh;
    }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass with the draw state set from this object's flags, draws the mesh by default
     *  @return {void} */
    render3D()
    {
        // an opaque draw comes out solid however low its alpha is, so a fade with no flag looks like nothing happened
        ASSERT(this.transparent || this.additive || this.color.a >= 1, 'an object that fades needs its transparent flag, an opaque draw ignores the color alpha', this.color);
        // the matrix the object keeps, rebuilt only when it moved, the same one for the shadow pass and the main pass
        const matrix = render3DObjectMatrix(this);
        if (this.mesh)
            render3D.drawMesh(this.mesh, matrix, this.tileInfo, this.color);
        else if (this.tileInfo)
        {
            // a sprite: size3D grown by its own scale and its parents', the same world size the
            // collect, pick and solid collision helpers measure it at
            const m = matrix.m;
            render3D.drawBillboard(vec3(m[12], m[13], m[14]),
                vec2(this.size3D.x * hypot(m[0], m[1], m[2]), this.size3D.y * hypot(m[4], m[5], m[6])),
                this.tileInfo, this.color, this.rotation3D.z, this.upright);
        }
    }
}

// an object's world matrix, the one it keeps: rebuilt only when its position, rotation or scale changed since the
// last build, or its parent's matrix did, so an object that stands still costs nine compares a frame instead of
// the trig and a new matrix; the matrix returned is the object's own, read it and never change it
const render3DLocalMatrix = new Matrix4;
function render3DObjectMatrix(o)
{
    const parent = o.parent instanceof EngineObject3D ? o.parent : undefined;
    const parentMatrix = parent && render3DObjectMatrix(parent); // the parent first, so its version is current
    const p = o.pos3D, r = o.rotation3D, s = o.scale3D, k = o.matrixBuilt, local = o.localMatrix;
    if (local)
    {
        // a matrix given whole is taken as it is each time, it can change in place
        if (parent)
        {
            o.worldMatrix.m.set(parentMatrix.m);
            o.worldMatrix.multiply(local);
            o.matrixParentVersion = parent.matrixVersion;
        }
        else
            o.worldMatrix.m.set(local.m);
        k[0] = NaN; // built from the matrix, so going back to pos3D builds again
        o.matrixParent = parent;
        ++o.matrixVersion;
    }
    else if (k[0] !== p.x || k[1] !== p.y || k[2] !== p.z || k[3] !== r.x || k[4] !== r.y || k[5] !== r.z
        || k[6] !== s.x || k[7] !== s.y || k[8] !== s.z || o.matrixParent !== parent
        || parent && o.matrixParentVersion !== parent.matrixVersion)
    {
        k[0] = p.x, k[1] = p.y, k[2] = p.z, k[3] = r.x, k[4] = r.y, k[5] = r.z, k[6] = s.x, k[7] = s.y, k[8] = s.z;
        if (parent)
        {
            // the parent's world matrix times the local one
            buildMatrix(p, r, s, render3DLocalMatrix);
            o.worldMatrix.m.set(parentMatrix.m);
            o.worldMatrix.multiply(render3DLocalMatrix);
            o.matrixParentVersion = parent.matrixVersion;
        }
        else
            buildMatrix(p, r, s, o.worldMatrix);
        o.matrixParent = parent;
        ++o.matrixVersion;
    }
    return o.worldMatrix;
}

// move an object by its 3D velocities, an object with mass falling with render3D.gravity and slowing by its damping
function render3DMove(o)
{
    // the vectors change in place, as the 2D object's do: this runs for every object every frame
    const p = o.pos3D, v = o.velocity3D, r = o.rotation3D, a = o.angleVelocity3D;
    if (o.mass && !o.sync2D) // a 2D driven object gets the 2D gravity instead
    {
        // damped first and gravity added after, the order EngineObject.updatePhysics uses,
        // so the same mass, damping and gravity fall the same way in both
        const g = render3D.gravity, s = o.gravityScale, d = o.damping;
        v.x = v.x * d + g.x * s, v.y = v.y * d + g.y * s, v.z = v.z * d + g.z * s;
    }
    p.x += v.x, p.y += v.y, p.z += v.z;
    r.x += a.x, r.y += a.y, r.z += a.z;
}

// where a solid object is in the world and what it collides as: the sphere that fits size3D, or the size3D box,
// each grown by the object's scale
// only objects that own where they are take part, so pos3D is already world space, and however the object is
// turned its axes come out as long as its scale makes them; building the transform to read that back off it
// costs six trig calls and a matrix for every pair tested, which is the whole cost of a crowded scene
function render3DSolidShape(o)
{
    ASSERT(!o.parent, 'a child rides along with its parent, it has no world pos3D of its own to collide with');
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return {pos: o.pos3D.copy(), radius: max(s.x, s.y, s.z) / 2 * max(kx, ky, kz)};
    return {pos: o.pos3D.copy(), size: vec3(s.x * kx, s.y * ky, s.z * kz)};
}

// how far a solid shape can reach from its own center, for a quick reject before the exact test
// it has to be the shape's own radius, or a wider one: a box reaches to its corner, and a sphere
// takes the largest scale the same way render3DSolidShape does, or the reject would skip real touches
function render3DSolidReach(o)
{
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return max(s.x, s.y, s.z) / 2 * max(kx, ky, kz);
    return hypot(s.x * kx, s.y * ky, s.z * kz) / 2;
}

// what it takes to move shape a clear of shape b, whichever pair of shapes they are, or undefined for no touch
function render3DSolidPush(a, b)
{
    if (!a.size) // a is a sphere
        return b.size ? collideSphereBox(a.pos, a.radius, b.pos, b.size)
            : collideSphereSphere(a.pos, a.radius, b.pos, b.radius);
    if (!b.size) // only b is, so push b out of a and turn it around
    {
        const push = collideSphereBox(b.pos, b.radius, a.pos, a.size);
        return push && push.scale(-1);
    }
    return collideBoxBox3D(a.pos, a.size, b.pos, b.size);
}

// push a solid object out of the solids before it in the engine's list of them, so each pair is resolved once:
// the ones after it update later and test against it then, and an object that is not in the list yet, because it
// turned collision on this frame, tests them all itself and is not tested back
// one pair per test is half the work of the 2D solver, which tests both directions; the difference only shows
// when a collideWithObject destroys some third object, whose own turn then finds the pair already gone
function render3DCollideSolid(a)
{
    let shapeA = render3DSolidShape(a);
    const reachA = render3DSolidReach(a);
    for (const b of engineObjectsCollide)
    {
        if (b === a) break;
        if (b.destroyed || !(b instanceof EngineObject3D) || b.parent || b.sync2D) continue; // a child is part of its parent
        if (!a.isSolid && !b.isSolid) continue; // neither one blocks, so they pass through each other

        // the pairs nowhere near each other are almost all of them in a scene of any size, so
        // settle those with one distance check instead of building a shape for each
        const p = shapeA.pos, q = b.pos3D, reach = reachA + render3DSolidReach(b);
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        if (dx*dx + dy*dy + dz*dz > reach*reach)
            continue;

        const push = render3DSolidPush(shapeA, render3DSolidShape(b));
        if (!push) continue;

        // both objects hear about it, and either one can take the touch over
        const resolveA = a.collideWithObject(b, push);
        const resolveB = b.collideWithObject(a, push.scale(-1));
        if (!resolveA || !resolveB) continue;

        // heavier objects move less, mass 0 stays put; then bounce apart when moving toward each other
        const total = a.mass + b.mass;
        const weightA = !a.mass ? 0 : !b.mass ? 1 : b.mass / total;
        const weightB = !b.mass ? 0 : !a.mass ? 1 : a.mass / total;
        a.pos3D = a.pos3D.add(push.scale(weightA));
        b.pos3D = b.pos3D.subtract(push.scale(weightB));
        if (weightA)
            shapeA = render3DSolidShape(a); // it moved, so the next solid must be tested against where it is now
        // mass 0 keeps its velocity too, so a moving platform keeps moving, and what hits it bounces by its own
        // restitution as it would off a static wall
        const normal = push.normalize();
        if (weightA && a.velocity3D.dot(normal) < 0)
            a.velocity3D = a.velocity3D.reflect(normal, a.restitution);
        if (weightB && b.velocity3D.dot(normal) > 0)
            b.velocity3D = b.velocity3D.reflect(normal, b.restitution);
    }
}

/**
 * Collect the EngineObject3D objects whose boxes overlap a sphere or a box, the 3D twin of engineObjectsCollect
 * - Boxes are axis aligned around the world position, rotation3D is ignored; lights, emitters and trails have no size
 *   and are never collected
 * @param {Vector3} pos - Center of the area
 * @param {Vector3|number} size - Diameter of a sphere if a number, 0 for a point, full size of a box if a Vector3
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @param {boolean} [testCenters] - Test only each object's center, a little faster, and ignores object sizes
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsCollect3D(pos, size, objects=engineObjects, testCenters=false)
{
    // a size of 0 is a point, tested against each box, since a sphere of no size could never hit
    const radiusSquared = typeof size === 'number' && size > 0 ? (size/2)**2 : undefined;
    const box = radiusSquared ? undefined : typeof size === 'number' ? vec3() : render3DSize3(size);
    const collected = [];
    for (const o of objects)
    {
        if (!(o instanceof EngineObject3D) || o.destroyed) continue;
        const m = render3DObjectMatrix(o).m, s = o.size3D; // the box in world space, scaled by the object and its parents
        if (!(s.x || s.y || s.z)) continue;
        const center = vec3(m[12], m[13], m[14]);
        const worldSize = testCenters ? vec3() : vec3(s.x * hypot(m[0], m[1], m[2]), s.y * hypot(m[4], m[5], m[6]), s.z * hypot(m[8], m[9], m[10]));
        let hit;
        if (box)
            hit = isOverlapping3D(pos, box, center, worldSize);
        else
        {
            // a sphere against the nearest point of the box
            const dx = max(abs(pos.x - center.x) - worldSize.x/2, 0);
            const dy = max(abs(pos.y - center.y) - worldSize.y/2, 0);
            const dz = max(abs(pos.z - center.z) - worldSize.z/2, 0);
            hit = dx*dx + dy*dy + dz*dz < radiusSquared;
        }
        hit && collected.push(o);
    }
    return collected;
}

// how far along a ray an object is hit, or undefined for a miss; each one is tested as the box around its mesh in
// its own space, or a sphere around a sprite's size3D, not triangle by triangle
function render3DRaycastObject(ray, o)
{
    if (o.destroyed || !(o instanceof EngineObject3D) || !(o.mesh || o.tileInfo)) return;
    if (o instanceof InstancedMesh3D) return; // its instances are not objects, and its one sphere is not a thing to hit
    const matrix = render3DObjectMatrix(o), mesh = o.mesh; // a sprite is picked by its size3D
    // a mesh that changed since it was measured is measured again, an upload may not have come yet
    const radius = (mesh ? mesh.dirty || !mesh.radius ? mesh.computeRadius() : mesh.radius : hypot(o.size3D.x, o.size3D.y) / 2) * render3DMaxStretch(matrix.m);
    if (!(radius > 0)) return; // nothing to hit
    const distance = raycastSphere(ray, matrix.getTranslation(), radius);
    if (distance === undefined || !mesh) return distance;

    // the sphere is a quick reject, a mesh is hit where the ray meets its box in its own space, since a wide floor's
    // sphere reaches far above it; the direction is not made unit length, so the distance holds in the world;
    // a mesh flattened to nothing on an axis has no inverse, its sphere is all there is to hit
    if (!render3DDeterminant(matrix.m)) return distance;
    const inverse = matrix.copy().invert(), bounds = mesh.bounds || mesh.getBounds();
    const local = new Ray3D(inverse.transformPoint(ray.origin), inverse.transformDirection(ray.direction));
    const hit = raycastBox(local, bounds.min.add(bounds.max).scale(.5), bounds.max.subtract(bounds.min));
    if (hit !== 0) return hit;

    // it starts inside the box, like a camera on terrain or in a room, so it is hit where it leaves, and what stands
    // inside comes first
    let exit = Infinity;
    for (const k of ['x', 'y', 'z'])
    {
        const d = local.direction[k];
        if (d)
            exit = min(exit, ((d > 0 ? bounds.max[k] : bounds.min[k]) - local.origin[k]) / d);
    }
    return exit;
}

/**
 * Collect every EngineObject3D a ray passes through, nearest first, the 3D twin of engineObjectsRaycast
 * - The ray has no end, so everything along it counts however far away it is
 * - Use render3D.pick for the nearest one on its own, with the distance to it
 * @param {Ray3D} ray - From render3D.screenToRay, or any ray
 * @param {Array<EngineObject>} [objects] - Defaults to every object; only those with a mesh or a sprite count
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsRaycast3D(ray, objects=engineObjects)
{
    const hits = [];
    for (const o of objects)
    {
        const distance = render3DRaycastObject(ray, o);
        if (distance !== undefined) // only a 3D object has a distance
            hits.push({o: /** @type {EngineObject3D} */ (o), distance});
    }
    return hits.sort((a, b)=> a.distance - b.distance).map(hit=> hit.o);
}

/**
 * Call a function for each EngineObject3D whose box overlaps a sphere or a box
 * - An object destroyed by an earlier callback is skipped
 * @param {Vector3} pos - Center of the area
 * @param {Vector3|number} size - Diameter of a sphere if a number, 0 for a point, full size of a box if a Vector3
 * @param {function(EngineObject3D): void} callback
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @param {boolean} [testCenters] - Test only each object's center, see engineObjectsCollect3D
 * @memberof Render3D
 */
function engineObjectsCallback3D(pos, size, callback, objects=engineObjects, testCenters=false)
{
    for (const o of engineObjectsCollect3D(pos, size, objects, testCenters))
        o.destroyed || callback(o);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * InstancedMesh3D - Many copies of one mesh drawn as one call, with their transforms kept on the GPU
 * - For big sets that mostly stay put: an instance costs nothing per frame until it changes, so a hundred thousand
 *   trees cost what one tree does; objects and drawMesh batch by themselves too, but rebuild their batch every frame
 * - setMatrixAt and setColorAt change one instance, and only the changed range uploads before the next draw
 * - The instances are in world space; the object's own pos3D, rotation3D and scale3D do not move them
 * - The whole set is culled by one bounding sphere around the origin, and casts and receives shadows like any object
 * - The object's flags cover the whole set, one emissive, one tileInfo, one shader; only the colors are per instance
 * - A mirrored instance, one with a negative scale, shows its inside unless the mesh is doubleSided
 * - A transparent set draws in one go in the transparent stage, its instances are not sorted against each other;
 *   the set sorts against other transparent draws by the object's position, so put pos3D at its middle
 * - pick, the raycast and the collect helpers do not see the instances, test them yourself from instanceData
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const forest = new InstancedMesh3D(treeMesh, 1000);
 * for (let i = 0; i < 1000; ++i)
 *     forest.setMatrixAt(i, buildMatrix(randomGroundPos(), vec3(0, rand(2*PI), 0)));
 */
class InstancedMesh3D extends EngineObject3D
{
    /** Create a set of instances of a mesh, each at the origin in the object's color until it is set
     *  @param {Mesh} mesh
     *  @param {number} count - How many instances there is room for, all of them draw until count is lowered
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for all of them
     *  @param {Color} [color] - The color they start with */
    constructor(mesh, count, tileInfo, color=WHITE)
    {
        super(vec3(), mesh, tileInfo, color);
        ASSERT(mesh instanceof Mesh, 'an InstancedMesh3D needs a Mesh');
        ASSERT(count >= 1, 'an InstancedMesh3D needs room for at least one instance');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How many instances draw, the first ones, up to the count it was made with */
        this.count = count;
        /** @property {number} - How many instances it was made with */
        this.maxCount = count;
        /** @property {Float32Array} - The per instance values the shader reads, 24 floats each: the matrix, the color
         *  and the uv rect; edit it directly and call markDirty for the instances changed */
        this.instanceData = new Float32Array(count * RENDER3D_INSTANCE_FLOATS);
        /** @property {number} - Radius of the sphere around the origin that holds every instance set so far, for culling;
         *  from the farthest instance and the largest scale, and the mesh's size when it draws */
        this.radius = 0;
        this.reach = 0;    // the farthest any instance's position has been from the origin
        this.maxScale = 0; // and the largest scale any instance has had
        /** @property {number} - First instance to upload before the next draw */
        this.dirtyStart = 0;
        /** @property {number} - One past the last instance to upload, so nothing uploads when it is not past dirtyStart */
        this.dirtyEnd = count;
        this.buffer = undefined;    // the GPU copy of instanceData
        this.bufferGeneration = -1; // the context it was made under
        this.uvTileInfo = tileInfo; // the tile the uv rects were written for
        const uv = render3DGetTileUVs(tileInfo), data = this.instanceData;
        for (let i = 0; i < count; ++i)
        {
            this.setMatrixAt(i, RENDER3D_IDENTITY);
            const k = i * RENDER3D_INSTANCE_FLOATS;
            data[k+16] = color.r; data[k+17] = color.g; data[k+18] = color.b; data[k+19] = color.a;
            data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
        }
    }

    /** Place an instance, in world space
     *  @param {number} i
     *  @param {Matrix4} matrix */
    setMatrixAt(i, matrix)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const data = this.instanceData, k = i * RENDER3D_INSTANCE_FLOATS, m = matrix.m;
        data.set(m, k);
        this.markDirty(i);
    }

    /** The matrix of an instance
     *  @param {number} i
     *  @return {Matrix4} */
    getMatrixAt(i)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const k = i * RENDER3D_INSTANCE_FLOATS, matrix = new Matrix4;
        matrix.m.set(this.instanceData.subarray(k, k + 16));
        return matrix;
    }

    /** Color an instance
     *  @param {number} i
     *  @param {Color} color */
    setColorAt(i, color)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        ASSERT(isColor(color), 'color must be a Color');
        const data = this.instanceData, k = i * RENDER3D_INSTANCE_FLOATS;
        data[k+16] = color.r; data[k+17] = color.g; data[k+18] = color.b; data[k+19] = color.a;
        this.markDirty(i);
    }

    /** Note that an instance changed, so it uploads before the next draw and the bounds hold it; setMatrixAt and
     *  setColorAt call this, and so must an edit made straight to instanceData
     *  @param {number} i */
    markDirty(i)
    {
        this.dirtyStart = min(this.dirtyStart, i);
        this.dirtyEnd = max(this.dirtyEnd, i + 1);

        // the bounds grow to hold where it is now and how big, read back from the matrix it has
        const d = this.instanceData, k = i * RENDER3D_INSTANCE_FLOATS;
        this.reach = max(this.reach, hypot(d[k+12], d[k+13], d[k+14]));
        this.maxScale = max(this.maxScale, render3DMaxStretch(d, k));
        const meshRadius = this.mesh.radius || this.mesh.computeRadius(); // measured once, the draw takes a new size up
        this.radius = this.reach + meshRadius * this.maxScale;
    }

    /** Draws every instance as one call, uploading the ones that changed first
     *  @return {void} */
    render3D()
    {
        const r = render3D, gl = glContext, mesh = this.mesh;
        ASSERT(this.count >= 0 && this.count <= this.maxCount, 'count must be within the count it was made with');
        if (r.transparentQueue) // sorted as one thing with the other transparent draws
            return r.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        if (!mesh || !this.count || !render3DCanDraw()) return;
        if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== r.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        this.radius = this.reach + mesh.radius * this.maxScale; // the mesh may have grown since
        if (r.frustumCulling && !render3DSphereVisible(0, 0, 0, this.radius)) return;

        // the uv rect is the object's tile for every instance, rewritten when the tile changes
        if (this.uvTileInfo !== this.tileInfo)
        {
            const uv = render3DGetTileUVs(this.tileInfo), data = this.instanceData;
            for (let k = 20; k < data.length; k += RENDER3D_INSTANCE_FLOATS)
                data[k] = uv.x, data[k+1] = uv.y, data[k+2] = uv.w, data[k+3] = uv.h;
            this.uvTileInfo = this.tileInfo;
            this.dirtyStart = 0, this.dirtyEnd = this.maxCount;
        }

        // the GPU copy: all of it under a fresh context, otherwise just the changed range
        if (!this.buffer || this.bufferGeneration !== r.contextGeneration)
        {
            this.buffer = gl.createBuffer();
            this.bufferGeneration = r.contextGeneration;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
        }
        else if (this.dirtyEnd > this.dirtyStart)
        {
            const start = this.dirtyStart * RENDER3D_INSTANCE_FLOATS, end = this.dirtyEnd * RENDER3D_INSTANCE_FLOATS;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, start * 4, this.instanceData, start, end - start);
        }
        this.dirtyStart = Infinity, this.dirtyEnd = 0;

        // one draw under the object's state, the mesh setting the culling as drawMesh does
        r.flush();
        r.depthTest || r.shadowPass || render3DFlushInstances(); // as in drawMesh, what was drawn before goes under it
        const cullBackFaces = r.cullBackFaces, tileInfo = this.tileInfo;
        r.cullBackFaces = !mesh.doubleSided;
        render3DDrawInstanced(mesh, this.buffer, this.count, tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo, r);
        r.cullBackFaces = cullBackFaces;
    }

    /** Destroy the set and free its GPU buffer
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.buffer && this.bufferGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer);
        this.buffer = undefined;
        super.destroy(immediate);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A light that is an EngineObject3D, so it can move, follow a parent or be destroyed like anything else
 * - A point light: it lights what is near it and fades out by its radius, DirectionalLight3D shines from far away
 * - Only the sun, render3D.sunDirection, casts shadows; these light and make highlights without one
 * - Only the 8 lights nearest the camera are used each frame
 * - radius is where the light fades out, and it fades fast, so a small radius wants a higher intensity
 * - intensity multiplies the color, above 1 for a light brighter than white
 * - radius is a world distance, so scale3D does not change it
 * - An alpha, an intensity or a radius of 0 switches it off, and a light that is off takes none of those slots
 * - Draws nothing itself, add a glow with drawSoftDisc or a small emissive mesh if it should be seen
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const torch = new Light3D(vec3(0, 3, 0), 10, hsl(.1, 1, .65));
 */
class Light3D extends EngineObject3D
{
    /** Create a point light
     *  @param {Vector3} [pos3D] - Where it is
     *  @param {number} [radius] - Distance where the light fades to nothing
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(), radius=5, color=WHITE, intensity=1)
    {
        super(pos3D, undefined, undefined, color);
        ASSERT(radius >= 0, 'light radius cannot be negative, 0 is an off switch like an alpha of 0');
        ASSERT(intensity >= 0, 'light intensity cannot be negative, 0 is an off switch');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - Distance where the light fades to nothing */
        this.radius = radius;
        /** @property {number} - Brightness, multiplies the color, above 1 is brighter than white */
        this.intensity = intensity;
        /** @property {boolean} - Shine from far away, from its position toward the origin, instead of out from its
         *  position with a falloff; DirectionalLight3D sets it */
        this.directional = false;
    }

    /** Lights draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * DirectionalLight3D - A Light3D that shines from far away with no falloff, like sunlight
 * - It shines from its position toward the origin, like a three.js DirectionalLight: only the direction to it
 *   counts, so moving it or its parent swings the light around; parent it to a sun in the sky and it follows
 * - It cannot sit on the origin, since that leaves no direction
 * - Like every Light3D it casts no shadow, only the sun, render3D.sunDirection, does
 * @extends Light3D
 * @memberof Render3D
 * @example
 * const fill = new DirectionalLight3D(vec3(-1, 1, 1), hsl(.6, .5, .3)); // from the back left and above
 */
class DirectionalLight3D extends Light3D
{
    /** Create a directional light
     *  @param {Vector3} [pos3D] - Where it shines from, toward the origin
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(0, 1, 0), color=WHITE, intensity=1)
    {
        super(pos3D, 0, color, intensity);
        this.directional = true;
    }
}
