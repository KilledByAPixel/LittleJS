/**
 * LittleJS 3D Rendering Plugin
 * - Adds a 3D scene that draws into the same WebGL canvas as the 2D game
 * - Call new Render3DPlugin() in gameInit, then move render3D.camera and make EngineObject3D objects
 * - EngineObject3D is an EngineObject with a 3D position, rotation and mesh
 * - The 3D scene draws under the 2D sprites, so HUD and text land on top
 * - Lighting is the sun plus ambient, with optional extra lights, fog and shadows
 * - Build shapes with buildBox, buildSphere and friends, or load a model with loadOBJ
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

// per draw values the shaders read as vertex attributes: the model matrix columns (4-7), the normal matrix columns
// (8-10), the tint (11) and the uv rect (12); constants for one draw, one per instance for a batch
const RENDER3D_INSTANCE_FLOATS = 33;
const RENDER3D_INSTANCE_BYTES = RENDER3D_INSTANCE_FLOATS * 4;
const RENDER3D_INSTANCE_ATTRIBS = [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 4, 48], [8, 3, 64], [9, 3, 76], [10, 3, 88], [11, 4, 100], [12, 4, 116]];
const RENDER3D_VERTEX_INPUTS =
    'layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 t;layout(location=3) in vec4 c;' +
    'layout(location=4) in vec4 m0;layout(location=5) in vec4 m1;layout(location=6) in vec4 m2;layout(location=7) in vec4 m3;' +
    'layout(location=8) in vec3 n0;layout(location=9) in vec3 n1;layout(location=10) in vec3 n2;' +
    'layout(location=11) in vec4 tint;layout(location=12) in vec4 uvRect;';
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_MAX_LIGHTS = 8; // Light3D objects per frame, the shader loops over this many
const RENDER3D_QUAD_UVS = Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv))); // strip order
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(hsl(0, 0, 0, .5));
const RENDER3D_IDENTITY = new Matrix4; // never modified
const RENDER3D_DEBUG_WIDTH = .05; // line width of the debug primitives
// gap between lines of 3D text, as a share of the character height; flat text can let lines touch
// the way the 2D font does, but extruded glyphs seen from an angle then overlap the line below
const RENDER3D_TEXT_LEADING = 1.3;

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
const RENDER3D_STATE_FIELDS = ['blend', 'additive', 'depthTest', 'depthWrite', 'cullBackFaces', 'mirrored', 'lighting', 'emissive', 'receiveShadow', 'specular', 'pixelated', 'shader'];

// a copy of the current draw state
function render3DCaptureBatchState()
{
    const state = {};
    for (const field of RENDER3D_STATE_FIELDS)
        state[field] = render3D[field];
    return state;
}

// true when the current draw state differs from a captured one, so a pending batch must flush first
function render3DStateChanged(state)
{
    for (const field of RENDER3D_STATE_FIELDS)
        if (render3D[field] !== state[field])
            return true;
    return false;
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
function render3DSize3(size) { return isNumber(size) ? vec3(size) : size; }

// a transform given as a matrix, or as a vec3 for one that only moves there
function render3DMatrix(matrix)
{
    if (matrix instanceof Vector3)
        return buildMatrix(matrix);
    ASSERT(matrix instanceof Matrix4, 'takes a Matrix4, or a Vector3 for a position');
    return matrix;
}

// the matrix that keeps normals pointing out when an object is scaled unevenly
function render3DNormalMatrix(matrix) { return matrix.copy().invert().transpose(); }

// a column of a matrix as a direction: 0 is the right axis, 4 up, 8 back
function render3DAxis(m, i) { return vec3(m[i], m[i+1], m[i+2]); }

// surface normal from the slope of a height function, sampled half a cell each way but kept inside the half sizes
function render3DSlopeNormal(heightFunction, x, z, ex, ez, halfX, halfZ)
{
    const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX), z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
    const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
    const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
    return vec3(-dx, 1, -dz).normalize();
}

// the largest axis scale of a matrix, how much it grows a bounding sphere
function render3DMaxScale(m)
{
    return max(m[0]*m[0] + m[1]*m[1] + m[2]*m[2], m[4]*m[4] + m[5]*m[5] + m[6]*m[6], m[8]*m[8] + m[9]*m[9] + m[10]*m[10]) ** .5;
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

// let go of the parent but stay where the object was in the world; a destroyed parent has already let go, so the
// position remembered by the last update stands in
function render3DDetach(o)
{
    if (o.parent)
        o.pos3D = o.getWorldPos3D(), o.parent.removeChild(o);
    else if (o.worldPos3D)
        o.pos3D = o.worldPos3D;
}

// add a draw of a mesh to its batch; a batch is one mesh under one texture and draw state, so a change flushes it
function render3DInstance(mesh, matrix, tileInfo, color)
{
    const r = render3D, textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    if (mesh.instanceCount && (mesh.instanceTextureInfo !== textureInfo || render3DStateChanged(mesh.instanceState)))
        render3DFlushInstances(mesh);
    if (!mesh.instanceCount)
    {
        mesh.instanceTextureInfo = textureInfo;
        mesh.instanceState = render3DCaptureBatchState();
        r.instanceMeshes.push(mesh);
    }

    // room for one more, doubling as the batch grows
    let data = mesh.instanceData;
    const k = mesh.instanceCount++ * RENDER3D_INSTANCE_FLOATS;
    if (!data || data.length < k + RENDER3D_INSTANCE_FLOATS)
    {
        const grown = new Float32Array(max(64 * RENDER3D_INSTANCE_FLOATS, data ? data.length * 2 : 0));
        data && grown.set(data);
        mesh.instanceData = data = grown;
    }
    data.set(matrix.m, k);
    render3DNormalMatrix3(matrix.m, data, k + 16);
    data[k+25] = color.r; data[k+26] = color.g; data[k+27] = color.b; data[k+28] = color.a;
    const uv = render3DGetTileUVs(tileInfo);
    data[k+29] = uv.x; data[k+30] = uv.y; data[k+31] = uv.w; data[k+32] = uv.h;
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
        const buffers = r.instanceBuffers;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[r.instanceBufferIndex = (r.instanceBufferIndex + 1) % buffers.length]);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.instanceData, gl.DYNAMIC_DRAW, 0, count * RENDER3D_INSTANCE_FLOATS);
        for (const [location, size, offset] of RENDER3D_INSTANCE_ATTRIBS)
        {
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, RENDER3D_INSTANCE_BYTES, offset);
            gl.enableVertexAttribArray(location);
        }
        render3DSetDrawUniforms(RENDER3D_IDENTITY, mesh.instanceTextureInfo, WHITE, RENDER3D_FULL_UV_RECT, mesh.instanceState);
        render3DBindVertexBuffer(mesh.buffer);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, mesh.bufferCount, count);
        for (const [location] of RENDER3D_INSTANCE_ATTRIBS)
            gl.disableVertexAttribArray(location);
        ++drawCount;
        primitiveCount += mesh.bufferCount * count;
    }
    if (!only)
        r.instanceMeshes.length = 0;
    else
    {
        const i = r.instanceMeshes.indexOf(only);
        i < 0 || r.instanceMeshes.splice(i, 1);
    }
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
{ return engineObjects.filter(o=> !o.destroyed && o instanceof EngineObject3D && render3DIsAfter2D(o) === after2D); }

// the Light3D objects the shader gets this frame: directional lights light the whole scene so they come first,
// then the point lights nearest the camera
function render3DCollectLights()
{
    // a light switched off by its radius or its alpha is left out, so it cannot take one of the few slots
    const lights = engineObjects.filter(o=> !o.destroyed && o instanceof Light3D &&
        o.color.a > 0 && o.intensity > 0 && (o.directional || o.radius > 0));
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

// a soft white dot for untextured particles, made once from a canvas, undefined headless or without a canvas
let render3DSoftDotTexture;
function render3DSoftDot()
{
    if (render3DSoftDotTexture || !glContext || typeof OffscreenCanvas == 'undefined') return render3DSoftDotTexture;
    const size = 32, context = createCanvasContext(size);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]]) // the same falloff as a soft disc
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return render3DSoftDotTexture = new TextureInfo(context.canvas);
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

        /** @property {Camera3D} - The camera */
        this.camera = new Camera3D;

        // lights and fog
        /** @property {Vector3} - Direction toward the sun, where its light comes from, like a directional Light3D;
         *  read at each draw, and any length will do, the shading and the shadows normalize it themselves;
         *  the sun is the one light that casts shadows and makes specular highlights */
        this.sunDirection = vec3(-.3, 1, .5);
        /** @property {Color} - Sunlight color */
        this.sunColor = WHITE.copy();
        /** @property {Color} - Ambient light color */
        this.ambientColor = hsl(0, 0, .3);
        /** @property {Color|undefined} - Fog color, uses canvasClearColor when undefined
         *  @type {Color|undefined} */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;
        /** @property {Vector3} - Added to the velocity3D of every object with a mass each frame, scaled by its gravityScale; sync2D objects use the 2D gravity */
        this.gravity = vec3();
        /** @property {number|HeightMap|Function} - Floor for objects with a softShadow: a height, a HeightMap, or (x, z) => y
         *  @type {number|HeightMap|Function} */
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
        /** @property {boolean} - Test against the depth buffer, reset to true before each object and callback */
        this.depthTest = true;
        /** @property {boolean} - Write to the depth buffer, owned by the stages: on for opaque, off for transparent */
        this.depthWrite = true;
        // batch state set by drawMesh from each mesh: whether its back faces are skipped, off for strips so they
        // show from both sides, and whether its transform mirrors it so the other winding is the front
        this.cullBackFaces = false;
        this.mirrored = false;
        /** @property {number} - Strength of the highlight where the sunlight reflects, 0 is none and 1 adds the sun's full color at its brightest; its size is fixed */
        this.specular = 0;
        /** @property {Shader} - Custom Shader for the next draws, set from each object's shader; undefined draws with the plugin's own */
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
        this.frustumPlanes = [];     // the view as six inward planes [x, y, z, w]
        this.shadowPlanes = [];      // the shadow map's box as six planes
        this.program = undefined;    // the main program, undefined when not available
        this.currentProgram = undefined; // the program in use during a pass, a Shader's or the main one
        this.lightCount = 0;         // Light3D objects sent this pass
        this.shadowShader = undefined;
        this.vao = undefined;
        this.whiteTexture = undefined; // 1x1 white for untextured draws
        this.samplers = [];            // how textures are filtered in 3D, clamped and wrapping, see render3DInitGL
        this.samplerKey = undefined;   // the settings the samplers were made for, they are rebuilt when it changes
        this.mipmapped = new WeakSet;  // textures given mipmaps for the 3D pass
        this.shadowTexture = undefined;
        this.shadowFramebuffer = undefined;
        this.shadowTextureSize = 0;
        this.contextGeneration = 0;  // counts context losses, a mesh uploaded under an older one uploads again
        this.uniforms = new Map;     // uniform locations by program
        this.uniformValues = {};     // last values sent for the cached vec4 uniforms
        this.shadowMapDrawn = false; // the shadow map is drawn by the first pass of the frame
        this.passIsDefault = true;   // the running pass is the default layer, the only one shadowed
        this.lightPositions = new Float32Array(RENDER3D_MAX_LIGHTS * 4); // Light3D uniforms, filled each pass
        this.lightColors = new Float32Array(RENDER3D_MAX_LIGHTS * 4);

        // the stream of immediate mode draws
        this.streamBuffer = undefined;
        this.instanceBuffers = [];       // the per instance values of the batches being drawn, used in turn
        this.instanceBufferIndex = 0;
        this.instanceMeshes = [];        // meshes with a batch pending this stage
        this.attribValues = [];          // last values sent for the cached constant attributes
        this.streamData = new ArrayBuffer(RENDER3D_MAX_STREAM_VERTS * RENDER3D_VERTEX_BYTES);
        this.streamFloats = new Float32Array(this.streamData);
        this.streamInts = new Uint32Array(this.streamData);
        this.streamCount = 0;
        this.streamTileInfo = undefined;
        this.streamState = undefined; // captured state the pending batch was drawn under
        this.capture = undefined;     // the mesh a bake is filling
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
     *  @return {Ray3D} - Starts at the camera with a unit direction, or on the camera plane when orthographic */
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
        return camera.orthographic
            ? new Ray3D(camera.pos.add(offset), this.cameraForward.copy())
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
     *  - Each object is tested as a sphere around its mesh, or around a sprite's size3D, not triangle by triangle
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
                nearest = {object: o, distance};
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
     *  @return {SoundInstance|undefined} - undefined when out of range or sound is off */
    playSound(sound, pos3D, volume=1, pitch=1, randomnessScale=1, loop=false)
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
            volume *= percent(distance, range, range * sound.taper);
        }
        const pan = offset.normalize().dot(this.cameraRight);
        const rate = pitch + pitch * sound.randomness * randomnessScale * rand(-1, 1);
        return new SoundInstance(sound, volume, rate, pan, loop);
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
    isSphereVisible(center, radius)
    {
        for (const p of this.shadowPass ? this.shadowPlanes : this.frustumPlanes)
            if (p[0] * center.x + p[1] * center.y + p[2] * center.z + p[3] < -radius)
                return false;
        return true;
    }

    ///////////////////////////////////////////////////////////////////////////
    // Meshes and the stream

    /** Draw a mesh with the current draw state, batched with its other uses in the opaque stage when instancing is on
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    drawMesh(mesh, matrix=RENDER3D_IDENTITY, tileInfo, color=WHITE)
    {
        matrix = render3DMatrix(matrix);
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        ASSERT(isColor(color), 'color must be a Color');
        if (this.capture)
            return void this.capture.combine(mesh, matrix, color);
        if (this.transparentQueue)
            return this.queueTransparent(matrix.getTranslation(), ()=> this.drawMesh(mesh, matrix, tileInfo, color));
        if (!render3DCanDraw()) return;
        if (this.shadowPass && !this.lighting) return; // unlit things cast no shadow
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== this.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        if (this.frustumCulling && !this.isSphereVisible(matrix.getTranslation(), mesh.radius * render3DMaxScale(matrix.m)))
            return;
        // the mesh says whether its back faces can be skipped, and a mirroring transform, one with a negative
        // determinant, turns the winding around so the other one is its front
        const m = matrix.m, cullBackFaces = this.cullBackFaces, mirrored = this.mirrored;
        this.cullBackFaces = !mesh.doubleSided;
        this.mirrored = m[0]*(m[5]*m[10] - m[6]*m[9]) - m[4]*(m[1]*m[10] - m[2]*m[9]) + m[8]*(m[1]*m[6] - m[2]*m[5]) < 0;
        if (!this.blend && this.depthTest && (mesh.instanced ?? this.instancing)) // the stage draws the batch at its end
            render3DInstance(mesh, matrix, tileInfo, color);
        else
        {
            this.flush();
            render3DSetDrawUniforms(matrix, tileInfo, color);
            render3DBindVertexBuffer(mesh.buffer);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, mesh.bufferCount);
            ++drawCount;
            primitiveCount += mesh.bufferCount;
        }
        this.cullBackFaces = cullBackFaces, this.mirrored = mirrored;
    }

    /** Draw a triangle strip, batched into the stream with the current draw state
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  - inside a bake the strip goes into the mesh instead, in the transparent stage it is queued for sorting
     *  @param {Array<Vector3>} points - In strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, 0-1 across the tile
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, vertex colors come before the texture
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for this strip */
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
            const i = render3DStripIndex(k, n);
            const uv = uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV;
            render3DWriteVertex(floats, ints, this.streamCount++ * RENDER3D_VERTEX_FLOATS, points[i],
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
                    const m = o.getMatrix();
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
     *  @param {Vector3} pos - Where the draw is, for sorting
     *  @param {Function} draw */
    queueTransparent(pos, draw)
    {
        if (!this.transparentQueue)
            return draw();
        this.transparentQueue.push({distance: pos.distanceSquared(this.camera.pos), state: render3DCaptureBatchState(), draw});
    }

    /** Draw the queued transparent draws far to near with the state each was drawn under, called automatically at the end of the transparent stage */
    flushTransparentQueue()
    {
        const queue = this.transparentQueue;
        if (!queue) return;
        this.transparentQueue = undefined;
        queue.sort((a, b)=> b.distance - a.distance);
        for (const item of queue)
            render3DWithState(item.state, item.draw); // each under the state it was queued with
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

    /** Build a sky dome, set it as the sky and set the fog color to the horizon color
     *  @param {Color} [topColor] - Straight up
     *  @param {Color} [horizonColor] - Level with the camera
     *  @param {Color} [bottomColor] - Straight down, defaults to the horizon color
     *  @return {Mesh} - The dome, also in render3D.sky */
    setSky(topColor, horizonColor=hsl(.6, 1, .9), bottomColor)
    {
        this.sky?.dispose();
        this.sky = buildSky(topColor, horizonColor, bottomColor);
        this.fogColor = horizonColor.copy();
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
     *  @param {boolean} [upright] - Stand on world up and only turn to face the camera, for sprites on the ground */
    drawBillboard(pos, size=vec2(1), tileInfo, color=WHITE, angle=0, upright=false)
    {
        if (this.capture)
            return this.drawStripUnlit(render3DBillboardCorners(pos, size, angle, upright), this.cameraBack, RENDER3D_QUAD_UVS, color, tileInfo);
        if (this.transparentQueue) // sort by the exact position, a shadow under it sorts by the floor
            return this.queueTransparent(pos, ()=> this.drawBillboard(pos, size, tileInfo, color, angle, upright));

        // the particle path: the quad's six stream vertices written straight in, unlit
        const count = render3DStripCount(4);
        const lighting = this.shadowPass && this.lighting; // unlit on screen, in the shadow map the object's flag decides
        const uvRect = render3DWithState({lighting}, ()=> render3DBeginStrip(count, tileInfo));
        if (!uvRect) return;
        const corners = render3DBillboardCorners(pos, size, angle, upright), rgba = color.rgbaInt();
        const floats = this.streamFloats, ints = this.streamInts;
        for (let k = 0; k < count; ++k)
        {
            const i = render3DStripIndex(k, 4), uv = RENDER3D_QUAD_UVS[i];
            render3DWriteVertex(floats, ints, this.streamCount++ * RENDER3D_VERTEX_FLOATS, corners[i], this.cameraBack,
                uvRect.x + uv.x * uvRect.w, uvRect.y + uv.y * uvRect.h, rgba);
        }
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
        this.drawStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS, render3DQuadValues(color), tileInfo);
    }

    /** Draw a triangle, counter clockwise from outside is the front
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Color} [color] */
    drawTriangle(a, b, c, color=WHITE)
    {
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
            const c = isArray(color) ? color[i] : color;
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
     *  @param {number} [sides] */
    drawSoftDisc(pos, size=1, color=WHITE, normal=this.cameraBack, sides=16)
    {
        render3DAssertBlending();
        if (this.transparentQueue && !this.capture)
            return this.queueTransparent(pos, ()=> this.drawSoftDisc(pos, size, color, normal, sides));
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
     *  @param {number|HeightMap|Function} [floorHeight] - Height of the ground, a HeightMap, or (x, z) => y to follow terrain
     *  @param {Color} [color]
     *  @param {number} [lift] - How far above the ground to draw, raise it if the shadow cuts into rough ground */
    drawSoftShadow(pos, size=1, floorHeight=0, color=RENDER3D_SHADOW_COLOR, lift=.02)
    {
        render3DAssertBlending();
        const height = isNumber(floorHeight) ? ()=> floorHeight
            : floorHeight instanceof HeightMap ? (x, z)=> floorHeight.getHeight(x, z) : floorHeight;
        if (this.transparentQueue && !this.capture) // sort from the floor, under whatever casts it
            return this.queueTransparent(vec3(pos.x, height(pos.x, pos.z) + lift, pos.z), ()=> this.drawSoftShadow(pos, size, floorHeight, color, lift));
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

let render3DDebugPrimitives = [];

// draw the live debug primitives with depth test off so they show through walls, drop the expired ones
function render3DRenderDebug()
{
    if (!render3DDebugPrimitives.length) return;
    render3DWithState({lighting: false, depthTest: false, receiveShadow: false, additive: false, shader: undefined}, ()=>
    {
        for (const p of render3DDebugPrimitives)
            p.draw();
    });
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.timer < 0); // a Timer compares as negative until it elapses
}

// record a debug draw for a time
function render3DDebugPush(duration, draw)
{
    ASSERT(isNumber(duration), 'duration must be a number');
    debug && render3D?.program && render3DDebugPrimitives.push({timer: new Timer(duration), draw});
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
        this.lookAt(target);
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
const RENDER3D_ATTRIBS = [[0, 3, 5126, false, 0], [1, 3, 5126, false, 12], [2, 2, 5126, false, 24], [3, 4, 5121, true, 32]];

// the vertex shader, shared by the plugin's program and every Shader's
// attributes: p position, n normal, t uv, c color, at fixed slots the depth shader also uses
// uniforms: viewProj, lightViewProj; the model matrix, the normal matrix, the tint and the uv rect are vertex
// attributes, see RENDER3D_VERTEX_INPUTS; L is the mesh's own uv for a Shader's localUV
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
    'N=mat3(n0,n1,n2)*n;' +
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
        'uniform vec4 lightDir,lightColor,ambientFog,fogColor,shadowParams;' +
        'uniform vec4 extraLights[' + RENDER3D_MAX_LIGHTS + '],extraLightColors[' + RENDER3D_MAX_LIGHTS + '];' +
        'uniform int extraLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
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
        'if(shadowParams.w>0.&&t.a<.5)discard;' + // an opaque draw drops see through texels, as the shadow map does
        'vec4 c=C*t;' +
        'float e=lightDir.w;' +
        'if(e<1.){' +
        'vec3 n=dot(N,N)>0.?normalize(N):vec3(0,1,0);' +
        'if(!gl_FrontFacing)n=-n;' + // only a double sided mesh shows a back face, light it on the side that is seen
        'float nl=dot(n,-lightDir.xyz);' +
        'float s=shadow();' +
        'vec3 l=ambientFog.rgb+lightColor.rgb*max(nl,0.)*s;' +
        // the Light3D objects, diffuse only: a point light falls off with distance, a directional one does not and
        // carries the direction toward it in xyz, marked by a negative radius
        'for(int i=0;i<' + RENDER3D_MAX_LIGHTS + ';++i){' +
        'if(i>=extraLightCount)break;' +
        'vec4 L=extraLights[i];' +
        'bool directional=L.w<0.;' +
        'vec3 v=directional?L.xyz:L.xyz-P;' +
        'float d=length(v);' +
        'float a=directional?1.:max(0.,1.-d/L.w);' +
        'l+=extraLightColors[i].rgb*extraLightColors[i].a*a*a*max(0.,dot(n,v/max(d,1e-6)));' +
        '}' +
        'c.rgb*=l*(1.-e)+e;' + // lit, blended toward its own color by how emissive it is
        // specular: only where the light hits, skipped entirely when the strength is zero
        'if(lightColor.a>0.){' +
        'vec3 v=normalize(cameraPos-P);' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,v),0.),16.)*lightColor.a*step(0.,nl)*s*(1.-e);' +
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
    r.vao = gl.createVertexArray();
    gl.bindVertexArray(r.vao);
    for (const [location] of RENDER3D_ATTRIBS)
        gl.enableVertexAttribArray(location);
    for (const [location] of RENDER3D_INSTANCE_ATTRIBS)
        gl.vertexAttribDivisor(location, 1); // one value per instance whenever a batch turns these arrays on

    // the stream buffer
    r.streamBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.streamBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, r.streamData.byteLength, gl.DYNAMIC_DRAW);
    r.streamCount = 0;
    r.instanceBuffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];

    // white texture for untextured draws, and a one texel shadow map that keeps the shadow sampler valid until shadows are on
    r.whiteTexture = glCreateTexture();
    r.mipmapped = new WeakSet;

    r.samplers = [];
    r.samplerKey = undefined;
    render3DUpdateShadowMap(1);

    // hand the engine back its own buffer and vertex array, in that order so a pending 2D batch flushes right
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
    r.instanceBuffers = r.samplers = [];
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

// the model matrix, its normal matrix, the tint and the uv rect as constant attributes for one draw
const render3DNormalScratch = new Float32Array(9);
function render3DDrawAttribs(m, tint, uvRect)
{
    const gl = glContext;
    gl.vertexAttrib4f(4, m[0], m[1], m[2], m[3]);
    gl.vertexAttrib4f(5, m[4], m[5], m[6], m[7]);
    gl.vertexAttrib4f(6, m[8], m[9], m[10], m[11]);
    gl.vertexAttrib4f(7, m[12], m[13], m[14], m[15]);
    if (!render3D.shadowPass) // the shadow map has no lighting
    {
        const n = render3DNormalMatrix3(m, render3DNormalScratch, 0);
        gl.vertexAttrib3f(8, n[0], n[1], n[2]);
        gl.vertexAttrib3f(9, n[3], n[4], n[5]);
        gl.vertexAttrib3f(10, n[6], n[7], n[8]);
    }
    render3DAttrib4f(11, tint.r, tint.g, tint.b, tint.a);
    render3DAttrib4f(12, uvRect.x, uvRect.y, uvRect.w, uvRect.h);
}

// set a constant vec4 attribute only when its value changed since the last time
function render3DAttrib4f(location, x, y, z, w)
{
    const values = render3D.attribValues, last = values[location];
    if (last && last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    values[location] = [x, y, z, w];
    glContext.vertexAttrib4f(location, x, y, z, w);
}

// write the 3x3 matrix that keeps normals pointing out when the model matrix scales unevenly, the inverse transpose
// of its top left 3x3 by cofactors; a flat model with no inverse keeps its own axes
function render3DNormalMatrix3(m, out, offset)
{
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const c00 = e*i - h*f, c01 = h*c - b*i, c02 = b*f - e*c;
    const det = a*c00 + d*c01 + g*c02;
    if (abs(det) < 1e-12)
    {
        out[offset] = a; out[offset+1] = b; out[offset+2] = c;
        out[offset+3] = d; out[offset+4] = e; out[offset+5] = f;
        out[offset+6] = g; out[offset+7] = h; out[offset+8] = i;
        return out;
    }
    const s = 1 / det;
    out[offset]   = c00 * s;             out[offset+1] = (g*f - d*i) * s;   out[offset+2] = (d*h - g*e) * s;
    out[offset+3] = c01 * s;             out[offset+4] = (a*i - g*c) * s;   out[offset+5] = (g*b - a*h) * s;
    out[offset+6] = c02 * s;             out[offset+7] = (d*c - a*f) * s;   out[offset+8] = (a*e - d*b) * s;
    return out;
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
    if (!r.mipmaps && !state.pixelated)
        return gl.bindSampler(0, null); // the texture's own filtering, as in 2D
    gl.bindSampler(0, r.samplers[(textureInfo?.wrap ? 1 : 0) + (state.pixelated ? 2 : 0)]);
    if (!state.pixelated && !r.mipmapped.has(texture)) // a hard edged draw never reads them
    {
        r.mipmapped.add(texture);
        gl.generateMipmap(gl.TEXTURE_2D);
    }
}

// send a vec4 uniform of the main shader only when its value changed since the last send
function render3DUniform4f(name, x, y, z, w)
{
    const values = render3D.uniformValues, last = values[name];
    if (last && last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    values[name] = [x, y, z, w];
    glContext.uniform4f(render3DUniform(name), x, y, z, w);
}

// bind a vertex buffer and point the attributes at it
function render3DBindVertexBuffer(buffer)
{
    const gl = glContext;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const a of RENDER3D_ATTRIBS)
        gl.vertexAttribPointer(a[0], a[1], a[2], a[3], RENDER3D_VERTEX_BYTES, a[4]);
}

// where a tile sits in its texture, pulled in slightly at the edges so neighbors do not bleed in
// this returns one shared object, so read it before calling again
const render3DTileUVRect = {x:0, y:0, w:1, h:1};
function render3DGetTileUVs(tileInfo)
{
    if (!(tileInfo instanceof TileInfo))
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
    render3DUniform4f('fogColor', fc.r, fc.g, fc.b, r.fogStart);
    // how the fragment shader finishes: 1 drops see through texels and keeps the draw opaque,
    // 0 blends them away instead, and -1 is additive, which has to fade into fog differently
    const blendMode = state.blend ? (state.additive ? -1 : 0) : 1;
    render3DUniform4f('shadowParams', r.shadows && r.passIsDefault && state.receiveShadow ? 1 : 0, r.shadowBias, r.shadowSoftness / r.shadowTextureSize, blendMode);
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
    if (!r.program) return; // headless, gl disabled, or context lost
    render3DUpdateSamplers();
    ASSERT(!r.fogEnd || r.fogStart < r.fogEnd, 'fogStart must be less than fogEnd');
    ASSERT(!glRenderTarget, 'the 3D pass needs the canvas depth buffer, it can not draw into a render target');
    const isDefault = after2D === !!r.renderAfter2D, objects = render3DLayerObjects(after2D);
    if (!isDefault && !objects.length) return;
    r.passIsDefault = isDefault;
    after2D && glFlush(); // the 2D sprites drawn so far go under this layer

    // a previous frame that threw must not leave anything pending
    r.streamCount = 0;
    r.capture = r.transparentQueue = undefined;
    render3DClearInstances();

    // take over the gl state
    gl.bindVertexArray(r.vao);
    // the leading repeat on every strip shifts the triangles by one, which flips
    // which way they read, so tell WebGL that clockwise is the front here
    gl.frontFace(gl.CW);
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // the Light3D objects, a directional one sends the direction toward it, from the origin, and a negative radius
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
    if (!r.streamCount)
        r.streamState = render3DCaptureBatchState();
    r.streamTileInfo = textureInfo;
    return render3DGetTileUVs(tileInfo);
}

// the four corners of a camera facing quad in strip order
function render3DBillboardCorners(pos, size, angle, upright)
{
    // an upright quad stands on world up and only turns to face the camera
    let r = render3D.cameraRight, u = render3D.cameraUp;
    if (upright)
    {
        const flat = vec3(r.x, 0, r.z);
        r = flat.lengthSquared() ? flat.normalize() : vec3(1, 0, 0); // a rolled camera has no flat right
        u = RENDER3D_DEFAULT_NORMAL;
    }
    const c = cos(angle), s = sin(angle), w = size.x / 2, h = size.y / 2;
    const rx = (r.x * c + u.x * s) * w, ry = (r.y * c + u.y * s) * w, rz = (r.z * c + u.z * s) * w;
    const ux = (u.x * c - r.x * s) * h, uy = (u.y * c - r.y * s) * h, uz = (u.z * c - r.z * s) * h;
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
function render3DWriteVertex(floats, ints, j, p, n, u, v, rgba)
{
    floats[j]   = p.x; floats[j+1] = p.y; floats[j+2] = p.z;
    floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
    floats[j+6] = u;   floats[j+7] = v;
    ints[j+8] = rgba;
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

///////////////////////////////////////////////////////////////////////////////

// frees the GPU buffer of a mesh that is garbage collected without dispose, some time after it goes; it holds the
// buffer and its context, never the mesh, or the mesh could not be collected, and dispose unregisters the mesh
const render3DMeshBuffers = typeof FinalizationRegistry == 'undefined' ? undefined :
    new FinalizationRegistry(({buffer, generation})=>
        generation === render3D?.contextGeneration && glContext?.deleteBuffer(buffer));

/**
 * Mesh - A triangle strip with positions, normals, uvs and colors, uploaded once and drawn by matrix
 * - Build with addStrip, addQuad, combine or the shape builders, then render each frame
 * - Its back faces are skipped unless doubleSided is set, which the open builders like buildGrid do for you
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
        /** @property {Array<Vector3>} - Vertex positions in strip order
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
        /** @property {WebGLBuffer|undefined} - GPU buffer, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.buffer = undefined;
        /** @property {number} - Vertices in the GPU buffer */
        this.bufferCount = 0;
        /** @property {boolean} - The mesh changed and needs uploading again, set it yourself if you edit the arrays */
        this.dirty = false;
        /** @property {boolean|undefined} - Draw every use of this mesh in the opaque stage as one instanced call, undefined follows render3D.instancing
         *  @type {boolean|undefined} */
        this.instanced = undefined;
        /** @property {boolean} - Draw both sides, each lit as the side that is seen; off skips the faces pointing away,
         *  which is faster and right for closed shapes, the open builders like buildGrid and buildRibbon turn it on */
        this.doubleSided = false;
        this.instanceCount = 0; // draws waiting in this mesh's batch, with their values, texture and draw state
        this.instanceData = undefined;
        /** @property {number} - Bounding sphere radius around the origin, for culling and picking, computed by upload */
        this.radius = 0;
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
        render3DForEachStripVertex(points, normals, uvs, colors, (p, n, uv, c)=>
        {
            this.points.push(p);
            this.normals.push(n);
            this.uvs.push(uv);
            this.colors.push(c);
        });
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
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < mesh.points.length; ++i)
        {
            this.points.push(matrix.transformPoint(mesh.points[i]));
            this.normals.push(normalMatrix.transformDirection(mesh.normals[i] || RENDER3D_DEFAULT_NORMAL).normalize());
            this.uvs.push((mesh.uvs[i] || RENDER3D_DEFAULT_UV).copy());
            this.colors.push((mesh.colors[i] || WHITE).multiply(color));
        }
        this.doubleSided ||= mesh.doubleSided; // an open part leaves the whole mesh open
        this.dirty = true;
        return this;
    }

    /** Scale every uv, so a whole texture repeats across the mesh when its TextureInfo wraps
     *  @param {Vector2|number} scale - Repeats across and up, a number for both
     *  @return {Mesh} */
    scaleUVs(scale)
    {
        const s = isNumber(scale) ? vec2(scale) : scale;
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
        this.dirty = true;
        return this;
    }

    /** Turn the mesh inside out so it is lit and drawn from within, for rooms and domes
     *  @return {Mesh} */
    flipNormals()
    {
        // one extra point at each end flips which way every triangle faces, and keeps the count even
        for (const key of ['points', 'normals', 'uvs', 'colors'])
        {
            const a = this[key];
            if (a.length)
                a.unshift(a[0]), a.push(a[a.length - 1]);
        }
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
        return this.radius = r ** .5;
    }

    /** Derive normals from the strip's triangles
     *  @param {boolean} [smooth] - Round the lighting across faces instead of giving each face a hard edge
     *  @return {Mesh} */
    computeNormals(smooth=false)
    {
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
        this.dirty = true;
        return this;
    }

    /** Pack the vertices and create the GPU buffer, called automatically by render
     *  @return {Mesh} */
    upload()
    {
        this.computeRadius();
        if (!render3D?.program) return this;
        this.dispose();
        const count = this.points.length;
        const data = new ArrayBuffer(count * RENDER3D_VERTEX_BYTES);
        const floats = new Float32Array(data), ints = new Uint32Array(data);
        for (let i = 0; i < count; ++i)
        {
            const uv = this.uvs[i] || RENDER3D_DEFAULT_UV; // a hand built mesh may leave normals, uvs and colors empty
            render3DWriteVertex(floats, ints, i * RENDER3D_VERTEX_FLOATS, this.points[i],
                this.normals[i] || RENDER3D_DEFAULT_NORMAL, uv.x, uv.y, (this.colors[i] || WHITE).rgbaInt());
        }
        const gl = glContext;
        this.buffer = gl.createBuffer();
        this.bufferCount = count;
        this.dirty = false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        this.contextGeneration = render3D.contextGeneration;
        render3DMeshBuffers?.register(this, {buffer: this.buffer, generation: this.contextGeneration}, this);
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
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
            glContext?.deleteBuffer(this.buffer);
        this.buffer = undefined;
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
        // an open end on the axis is a pole and points along it
        if (!closed && (!i || i == rings - 1) && abs(profile[i][0]) < 1e-9)
            return vec2(0, i ? 1 : -1);
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
            for (let j = 0; j <= sides; ++j)
            {
                const a = j / sides * 2 * PI, u = j / sides;
                points.push(point(i + 1, a), point(i, a));
                normals.push(normal3D(n1, a), normal3D(n0, a));
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
        for (const [i, up] of [[0, false], [rings - 1, true]])
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
 * Build a cylinder standing on the Y axis, centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [size / 2, height / 2]], sides, smooth, capped);
}

/**
 * Build a cone standing on the Y axis, centered on the origin, the point up
 * @param {number} [size] - Diameter of the base
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the base
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCone(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [0, height / 2]], sides, smooth, capped);
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
 * Build a capsule standing on the Y axis, centered on the origin: a cylinder with a half sphere on each end
 * @param {number} [size] - Diameter
 * @param {number} [height] - Total height including the rounded ends, at least the size
 * @param {number} [sides] - Around
 * @param {number} [rings] - On each end
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCapsule(size=1, height=1, sides=16, rings=4, smooth=render3D?.smoothShading)
{
    // the rounded ends alone are already the size tall, so a shorter capsule is only a sphere
    ASSERT(height >= size, 'a capsule is at least as tall as it is wide, the ends take up the size', size, height);
    const profile = [], r = size / 2, straight = max(0, height - size) / 2;
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * sin(a), -straight - r * cos(a)]);
    }
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * cos(a), straight + r * sin(a)]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a donut lying flat around the Y axis
 * @param {number} [size] - Diameter of the whole donut, outside edge to outside edge
 * @param {number} [tubeSize] - Diameter of the tube
 * @param {number} [sides] - Around the ring
 * @param {number} [tubeSides] - Around the tube
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth=render3D?.smoothShading)
{
    ASSERT(tubeSize <= size, 'the tube must fit inside the torus');
    const profile = [], radius = (size - tubeSize) / 2, tubeRadius = tubeSize / 2;
    for (let i = 0; i <= tubeSides; ++i)
    {
        const a = i / tubeSides * 2 * PI;
        profile.push([radius + tubeRadius * cos(a), tubeRadius * sin(a)]);
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
 * Build a lit ribbon along a path, for roads, tracks and walls
 * - Each segment is a flat quad, the sides are across the path in the plane of the up vector
 * - doubleSided, so it is seen and lit from below as well
 * @param {Array<Vector3>} points - Center line in order
 * @param {number|Array<number>} [width] - Full width, one for all or one per point
 * @param {Color|Array<Color>} [color] - One for all or one per point
 * @param {boolean} [closed] - Join the last point back to the first
 * @param {Vector3} [up] - Which way the ribbon faces
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const road = buildRibbon(trackPoints, 8, GRAY, true); // a loop of road
 */
function buildRibbon(points, width=1, color=WHITE, closed=false, up=vec3(0, 1, 0))
{
    ASSERT(isArray(points) && points.length > 1, 'ribbon needs at least 2 points');
    const mesh = new Mesh, count = points.length, edges = [];
    let across = (abs(up.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0)).cross(up).normalize(); // anything across up
    for (let i = 0; i < count; ++i)
    {
        // across the path, from the tangent through this point; a step along up keeps the last across
        const next = points[closed ? (i + 1) % count : min(i + 1, count - 1)];
        const last = points[closed ? (i + count - 1) % count : max(i - 1, 0)];
        const dir = next.subtract(last).cross(up);
        if (dir.lengthSquared() > 1e-12)
            across = dir.normalize();
        const half = across.scale((isArray(width) ? width[i] : width) / 2);
        edges.push([points[i].subtract(half), points[i].add(half)]);
    }
    for (let i = 0; i + 1 < count + (closed ? 1 : 0); ++i)
    {
        const j = (i + 1) % count, a = edges[i], b = edges[j];
        const c = isArray(color) ? [color[i], color[i], color[j], color[j]] : color;
        mesh.addQuad(a[0], a[1], b[1], b[0], c); // counter clockwise seen from above
    }
    mesh.doubleSided = true; // a flat strip, seen from both sides
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth rounds the lighting across cells and colors each corner
 * - flat lights and colors each cell on its own, so a checkerboard stays crisp
 * - doubleSided, a sheet seen from both sides; turn it off for ground only ever seen from above
 * - One cell is a plain square, render3D.planeMesh and planeMeshDoubleSided are shared ones
 * @param {Vector2} [size] - World size along X and Z
 * @param {Vector2|number} [segments] - Cells along X and Z, a number for both
 * @param {Color|Function} [color] - One Color for the whole grid, or (x, z) => Color
 * @param {Function} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const ground = buildGrid(vec2(20), 10, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? GRAY : WHITE); // 2 unit checks
 */
function buildGrid(size=vec2(1), segments=1, color, heightFunction=()=>0, smooth=render3D?.smoothShading)
{
    if (isNumber(segments))
        segments = vec2(segments);
    ASSERT(segments.x > 0 && segments.y > 0 && segments.x % 1 === 0 && segments.y % 1 === 0, 'grid segments must be whole numbers above zero');
    const mesh = new Mesh;
    const segmentsX = segments.x, segmentsZ = segments.y;
    const cellX = size.x / segmentsX, cellZ = size.y / segmentsZ;
    const px = (i)=> i * cellX - size.x / 2, pz = (j)=> j * cellZ - size.y / 2;
    const point = (i, j)=> { const x = px(i), z = pz(j); return vec3(x, heightFunction(x, z), z); };
    const normal = (i, j)=> render3DSlopeNormal(heightFunction, px(i), pz(j), cellX / 2, cellZ / 2, size.x / 2, size.y / 2);
    const uv = (i, j)=> vec2(i / segmentsX, j / segmentsZ);
    const cellColor = (i, j)=> !color ? WHITE : isColor(color) ? color : color(px(i), pz(j));
    for (let j = 0; j < segmentsZ; ++j)
    {
        if (smooth)
        {
            // one ribbon per row with vertex normals from the slope
            const points = [], normals = [], uvs = [], colors = [];
            for (let i = 0; i <= segmentsX; ++i)
            {
                points.push(point(i, j), point(i, j + 1));
                normals.push(normal(i, j), normal(i, j + 1));
                uvs.push(uv(i, j), uv(i, j + 1));
                colors.push(cellColor(i, j), cellColor(i, j + 1));
            }
            mesh.addStrip(points, normals, uvs, colors);
        }
        else
        {
            // one quad per cell with its face normal and one color sampled at its center
            for (let i = 0; i < segmentsX; ++i)
                mesh.addQuad(point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j), cellColor(i + .5, j + .5),
                    [uv(i, j), uv(i, j + 1), uv(i + 1, j + 1), uv(i + 1, j)]);
        }
    }
    mesh.doubleSided = true; // a sheet, seen from both sides; terrain seen only from above can turn it off
    return mesh;
}

/**
 * Build a hull from a row of diamond shaped slices along Z, for ships, planes and cars
 * - Each slice is [z, width, top, bottom, sideHeight]
 * - sideHeight is 0 to 1 and puts the side corners between the bottom and the top
 * - List the slices nose first, with the nose at the largest z
 * @param {Array<Array<number>>} stations
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const hull = buildLoft([[1.2, .4, .2, -.1], [0, 1.4, .5, -.4], [-1, 1, .3, -.3]]);
 */
function buildLoft(stations)
{
    ASSERT(isArray(stations) && stations.length > 1, 'loft needs at least 2 stations');
    // the caps and the winding both assume the nose leads, so the other order turns the hull inside out
    ASSERT(stations[0][0] > stations[stations.length-1][0], 'loft stations go nose first, from the largest z to the smallest');
    const mesh = new Mesh;
    // section points: left, top, right, bottom, wound clockwise seen from +z
    const section = ([z, w, t, b, m=.5])=>
        [vec3(-w / 2, lerp(b, t, m), z), vec3(0, t, z), vec3(w / 2, lerp(b, t, m), z), vec3(0, b, z)];
    for (let i = 0; i + 1 < stations.length; ++i)
    {
        const s1 = section(stations[i]), s2 = section(stations[i + 1]);
        for (let k = 0; k < 4; ++k)
            mesh.addQuad(s1[k], s1[(k + 1) % 4], s2[(k + 1) % 4], s2[k]);
    }
    const tail = section(stations[stations.length - 1]), nose = section(stations[0]);
    mesh.addQuad(tail[0], tail[1], tail[2], tail[3]);
    mesh.addQuad(nose[3], nose[2], nose[1], nose[0]);
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

/**
 * Turn a sprite into a 3D block model by giving its pixels thickness
 * - A pixel counts as solid when it is more than half opaque
 * - Each pixel keeps its own color, so white art takes the object's tint
 * - Runs of matching pixels merge into one face, and side walls appear only at the sprite's edges
 * - A texture's pixels are read once and kept, so redrawing a canvas texture will not change what this builds
 * - Pixels can also be an array of rows, each a Color, a truthy value for white, or a falsy value for empty
 * @param {TileInfo|Array<Array<Color|number|boolean>>} pixels - A tile from a loaded texture, or rows of pixels,
 *  each a Color (empty when see through), a truthy value for white or a falsy value for empty
 * @param {Vector2} [size] - World width and height of the whole tile, centered like buildBox
 * @param {number} [depth] - Thickness along Z
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), buildExtrude(tile(3, 16), vec2(2), .5)); // a chunky version of tile 3
 */
function buildExtrude(pixels, size=vec2(1), depth=1)
{
    let rows = pixels, width, height;
    if (pixels instanceof TileInfo)
    {
        // colors for the tile's pixels only, undefined where alpha is half or less
        const image = render3DReadPixels(pixels.textureInfo), data = image.data;
        const x0 = pixels.pos.x | 0, y0 = pixels.pos.y | 0;
        width = pixels.size.x | 0, height = pixels.size.y | 0;
        rows = [];
        for (let y = 0; y < height; ++y)
        {
            const row = rows[y] = [];
            for (let x = 0; x < width; ++x)
            {
                const k = ((y0 + y) * image.width + x0 + x) * 4;
                row.push(data[k + 3] > 127 ? rgb(data[k] / 255, data[k + 1] / 255, data[k + 2] / 255) : undefined);
            }
        }
    }
    else
    {
        ASSERT(isArray(pixels) && pixels.length, 'pixels must be a TileInfo or rows of pixels');
        height = rows.length, width = rows[0].length;
    }

    // the color of a solid pixel, undefined outside or where it is empty
    const solid = (x, y)=>
    {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const c = rows[y] && rows[y][x];
        if (!c) return;
        return isColor(c) ? (c.a > .5 ? c : undefined) : WHITE; // a see through Color is empty too
    };
    const same = (a, b)=> a === b || !!a && !!b && a.rgbaInt() === b.rgbaInt();

    // call emit(start, end, color) for each run of same colored pixels, colorAt(i) undefined breaks the run
    const runs = (count, colorAt, emit)=>
    {
        let start = 0, color;
        for (let i = 0; i <= count; ++i)
        {
            const c = i < count ? colorAt(i) : undefined;
            if (same(c, color)) continue;
            if (color) emit(start, i, color);
            start = i, color = c;
        }
    };

    // pixel edges in world space, y runs down the image
    const mesh = new Mesh, sx = size.x / width, sy = size.y / height, hz = depth / 2;
    const px = x=> x * sx - size.x / 2, py = y=> size.y / 2 - y * sy;
    const quad = (origin, right, up, normal, color)=>
        mesh.addStrip(render3DQuadAxes(origin.add(right.scale(.5)).add(up.scale(.5)), right.scale(.5), up.scale(.5)), normal, RENDER3D_QUAD_UVS, color);
    const X = vec3(1, 0, 0), Y = vec3(0, 1, 0), Z = vec3(0, 0, 1);
    for (let y = 0; y < height; ++y)
    {
        // front and back faces along each row
        runs(width, x=> solid(x, y), (a, b, c)=>
        {
            const w = X.scale((b - a) * sx), h = Y.scale(sy);
            quad(vec3(px(a), py(y + 1), hz), w, h, Z, c);
            quad(vec3(px(b), py(y + 1), -hz), w.scale(-1), h, Z.scale(-1), c);
        });
        // walls facing up and down where the pixel above or below is empty
        runs(width, x=> solid(x, y - 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y), hz), X.scale((b - a) * sx), Z.scale(-depth), Y, c));
        runs(width, x=> solid(x, y + 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y + 1), -hz), X.scale((b - a) * sx), Z.scale(depth), Y.scale(-1), c));
    }
    for (let x = 0; x < width; ++x)
    {
        // walls facing left and right where the pixel beside is empty
        runs(height, y=> solid(x - 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x), py(b), -hz), Z.scale(depth), Y.scale((b - a) * sy), X.scale(-1), c));
        runs(height, y=> solid(x + 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x + 1), py(b), hz), Z.scale(-depth), Y.scale((b - a) * sy), X, c));
    }
    return mesh;
}

/**
 * Build a mesh of extruded text from an image font, the engine font by default so it needs no assets
 * - Each glyph is extruded once per font and reused, the block is centered and faces +Z
 * - Newlines stack downward, spaced a little wider than the character height so the sides do not collide
 * - Every call builds a new mesh, dispose the old one when text changes often
 * - Glyphs are white in the engine font, so the object's color tints the text
 * @param {string|number} text
 * @param {number} [size] - Character height in world units
 * @param {number} [depth] - Thickness along Z
 * @param {ImageFont} [font] - Defaults to engineImageFont
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(0, 2, 0), buildText3D('HELLO'), undefined, YELLOW);
 */
function buildText3D(text, size=1, depth=.2, font=engineImageFont)
{
    ASSERT(font instanceof ImageFont, 'font must be an ImageFont, the engine font loads before gameInit');
    const tileInfo = font.tileInfo, padding = tileInfo.padding;
    const paddedX = tileInfo.size.x + padding * 2, paddedY = tileInfo.size.y + padding * 2;
    const columns = tileInfo.textureInfo.size.x / paddedX | 0;
    let glyphs = render3DGlyphCache.get(font); // unit sized, scaled when combined
    glyphs || render3DGlyphCache.set(font, glyphs = new Map);
    const charSize = vec2(size * tileInfo.size.x / tileInfo.size.y, size);
    const mesh = new Mesh, lines = (text + '').split('\n');
    lines.forEach((line, j)=>
    {
        const y = ((lines.length - 1) / 2 - j) * charSize.y * RENDER3D_TEXT_LEADING;
        for (let i = 0; i < line.length; ++i)
        {
            const charCode = line.charCodeAt(i);
            const index = charCode < 32 || charCode > 127 ? 95 : charCode - 32; // like ImageFont
            if (!index) continue; // space
            let glyph = glyphs.get(index);
            if (!glyph)
            {
                const pos = vec2(index % columns * paddedX + padding, (index / columns | 0) * paddedY + padding);
                glyphs.set(index, glyph = buildExtrude(new TileInfo(pos, tileInfo.size, tileInfo.textureInfo)));
            }
            const x = (i - (line.length - 1) / 2) * charSize.x;
            mesh.combine(glyph, buildMatrix(vec3(x, y, 0), undefined, vec3(charSize.x, charSize.y, depth)));
        }
    });
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * HeightMap - Terrain built from a grid of heights, with a mesh, a height lookup and a raycast
 * - heights is a 2D array [row][column] of 0 to 1 values
 * - Row 0 is the far edge at -Z and column 0 is the left edge at -X
 * - It can be an image instead, where the red channel is the height
 * - colors is an optional 2D array of Colors or an image, sampled per vertex
 * - images are read through a canvas, so they must be same origin or loaded with crossOrigin set
 * @memberof Render3D
 * @example
 * const terrain = new HeightMap(heightImage, vec2(100, 100), 10, colorImage);
 * new EngineObject3D(vec3(), terrain.buildMesh());
 * const y = terrain.getHeight(x, z); // stand things on it
 */
class HeightMap
{
    /** Create a height map from an array or an image
     *  @param {Array<Array<number>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} heights
     *  @param {Vector2} [size] - World size along X and Z
     *  @param {number} [height] - World height of a full value
     *  @param {Array<Array<Color>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} [colors] */
    constructor(heights, size=vec2(1), height=1, colors)
    {
        if (!isArray(heights))
            heights = render3DImageToArray(heights, (r)=> r / 255);
        if (colors && !isArray(colors))
            colors = render3DImageToArray(colors, (r, g, b, a)=> rgb(r / 255, g / 255, b / 255, a / 255));
        ASSERT(isArray(heights) && heights.length > 1 && isArray(heights[0]) && heights[0].length > 1, 'height map needs at least 2 rows and 2 columns');
        ASSERT(size.x > 0 && size.y > 0, 'height map size must be positive, a zero size has nowhere to look things up');

        /** @property {Array<Array<number>>} - Heights 0-1 as [row][column], rows along Z */
        this.heights = heights;
        /** @property {Array<Array<Color>>|undefined} - Vertex colors as [row][column], undefined for white
         *  @type {Array<Array<Color>>|undefined} */
        this.colors = colors;
        /** @property {Vector2} - World size along X and Z */
        this.size = size.copy();
        /** @property {number} - World height of a full value */
        this.height = height;
    }

    /** Number of rows, along Z
     *  @return {number} */
    get rows() { return this.heights.length; }

    /** Number of columns, along X
     *  @return {number} */
    get columns() { return this.heights[0].length; }

    /** World height at a position, exactly the height of the mesh buildMesh draws there, clamped at the edges
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {number} */
    getHeight(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x; // a position works as well as its two numbers, its own y is ignored
        const columns = this.columns, rows = this.rows, h = this.heights;
        const u = clamp((x / this.size.x + .5) * (columns - 1), 0, columns - 1);
        const v = clamp((z / this.size.y + .5) * (rows - 1), 0, rows - 1);
        const i = min(floor(u), columns - 2), j = min(floor(v), rows - 2);
        const fu = u - i, fv = v - j;
        // each cell is two triangles split from (i, j+1) to (i+1, j), the same split buildGrid's quads use
        const a = h[j][i], b = h[j+1][i], c = h[j+1][i+1], d = h[j][i+1];
        const height = fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
        return height * this.height;
    }

    /** Surface normal at a position, from the slope across a sample
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Vector3} */
    getNormal(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const ex = this.size.x / (this.columns - 1) / 2, ez = this.size.y / (this.rows - 1) / 2;
        return render3DSlopeNormal((x, z)=> this.getHeight(x, z), x, z, ex, ez, this.size.x / 2, this.size.y / 2);
    }

    /** Color of the nearest sample to a position, white when there are no colors
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Color} */
    getColor(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const c = this.colors;
        if (!c) return WHITE;
        const columns = c[0].length, rows = c.length;
        const i = clamp(round((x / this.size.x + .5) * (columns - 1)), 0, columns - 1);
        const j = clamp(round((z / this.size.y + .5) * (rows - 1)), 0, rows - 1);
        return c[j][i];
    }

    /** Distance along a ray to where it crosses the terrain surface, or undefined for a miss
     *  - Steps along the ray half a cell at a time, then narrows in on the exact spot
     *  - A ray that starts under the ground crosses on its way out, so the hit is still on the surface
     *  @param {Ray3D} ray - From screenToRay, or any ray
     *  @return {number|undefined} */
    raycast(ray)
    {
        const {origin, direction} = ray;
        const size = this.size, height = this.height, length = direction.length();
        if (!length) return;

        // clip to the box around the terrain, and walk it in half cell steps from there
        let t = raycastBox(ray, vec3(0, height / 2, 0), vec3(size.x, abs(height) + 1e-3, size.y));
        if (t === undefined) return;
        const cell = min(size.x / (this.columns - 1), size.y / (this.rows - 1));
        const step = cell / 2 / length, end = t + hypot(size.x, size.y, height) / length;
        if (!(step > 0)) return; // a zero size

        // is the ray below the ground this far along, or undefined where it is off the map
        const under = (at)=>
        {
            const p = origin.add(direction.scale(at));
            if (abs(p.x) > size.x / 2 || abs(p.z) > size.y / 2) return;
            return p.y <= this.getHeight(p.x, p.z);
        };

        // look for where the ray changes sides, so one coming up from under the ground
        // lands on the surface it breaks through instead of wherever it entered the box
        const startUnder = under(t);
        if (startUnder === undefined) return; // it meets the box outside the map itself
        for (; t < end; t += step)
        {
            const u = under(t + step);
            if (u === undefined) return; // it left the map before crossing
            if (u === startUnder) continue;

            // it crossed between the last two samples, halve the gap until it is exact
            let a = t, b = t + step;
            for (let i = 0; i < 16; ++i)
            {
                const mid = (a + b) / 2;
                under(mid) === startUnder ? a = mid : b = mid;
            }
            return b;
        }
    }

    /** Build the terrain mesh, one vertex per sample, centered on the origin
     *  @param {boolean} [smooth] - Defaults to render3D.smoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3D?.smoothShading)
    {
        return buildGrid(this.size, vec2(this.columns - 1, this.rows - 1),
            this.colors && ((x, z)=> this.getColor(x, z)), (x, z)=> this.getHeight(x, z), smooth);
    }
}

// read an image's pixel bytes through the engine's work canvas, as {data, width, height}
function render3DImageData(image)
{
    if (image instanceof TextureInfo)
        image = image.image;
    ASSERT(image && image.width && image.height, 'image is not loaded');
    ASSERT(workReadCanvas, 'reading an image needs a canvas, pass arrays in headless mode');
    const width = image.width, height = image.height;
    workReadCanvas.width = width;
    workReadCanvas.height = height;
    workReadContext.drawImage(image, 0, 0);
    return workReadContext.getImageData(0, 0, width, height);
}

// read an image into a 2D array [row][column], sample is called with (r, g, b, a) bytes for each pixel
function render3DImageToArray(image, sample)
{
    const {data, width, height} = render3DImageData(image);
    const rows = [];
    for (let y = 0; y < height; ++y)
    {
        const row = rows[y] = [];
        for (let x = 0; x < width; ++x)
        {
            const k = (y * width + x) * 4;
            row.push(sample(data[k], data[k+1], data[k+2], data[k+3]));
        }
    }
    return rows;
}

// extruded glyph meshes by font, and the pixel bytes of a texture, read once per image
const render3DGlyphCache = new WeakMap, render3DPixelCache = new WeakMap;
function render3DReadPixels(textureInfo)
{
    const image = textureInfo.image;
    let pixels = render3DPixelCache.get(image);
    if (!pixels)
        render3DPixelCache.set(image, pixels = render3DImageData(image));
    return pixels;
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
 * - Set sync2D for a 2D game with 3D looks, pos and angle then drive pos3D and rotation3D,
 *   which is the one way those 2D fields reach a 3D object
 * - setCollision takes the same flags as in 2D, but the solid collision happens in 3D against size3D
 * - Its tile and raycast halves are 2D only so they default off here, and a child sits solid collision out
 * - A sync2D object collides in 2D instead, which needs the 2D size set as well as size3D
 * - setMesh swaps the mesh and frees the old one, for text and terrain that get built again
 * - addChild attaches the 3D transform, and pos3D becomes an offset from the parent
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
            tileInfo = new TileInfo(vec2(), tileInfo.size, tileInfo, 0, 0);
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
        /** @property {Vector3} - Size for the collect and callback helpers, and of the sprite when there is a tileInfo
         *  and no mesh; scale3D and any parent's scale grow it, so drawing and picking agree */
        this.size3D = vec3(1);
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
        /** @property {number} - Strength of the highlight where the sunlight reflects, 0 is none and 1 adds the sun's full color at its brightest; its size is fixed */
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
     *  called automatically each frame */
    updateTransforms()
    {
        if (!paused)
        {
            // a child is never given updatePhysics, so it moves here, as an offset from its parent
            this.parent && render3DMove(this);
            if (this.sync2D)
                this.pos3D.x = this.pos.x, this.pos3D.y = this.pos.y, this.rotation3D.z = -this.angle;
        }
        super.updateTransforms();
    }

    /** Set how this object collides, the same flags as in 2D
     *  - Solid collision happens in 3D here, against size3D boxes or spheres; a child sits it out
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
    getWorldPos3D() { return this.getMatrix().getTranslation(); }

    /** Returns the direction the object faces, its -Z axis in the world
     *  @return {Vector3} */
    getForward3D() { return render3DAxis(this.getMatrix().m, 8).normalize(-1); }

    /** Returns the object's right axis in the world
     *  @return {Vector3} */
    getRight3D() { return render3DAxis(this.getMatrix().m, 0).normalize(); }

    /** Returns the object's up axis in the world
     *  @return {Vector3} */
    getUp3D() { return render3DAxis(this.getMatrix().m, 4).normalize(); }

    /** Returns the object's world transform, relative to the parent's when attached to an EngineObject3D
     *  @return {Matrix4} */
    getMatrix()
    {
        const matrix = buildMatrix(this.pos3D, this.rotation3D, this.scale3D);
        return this.parent instanceof EngineObject3D ? this.parent.getMatrix().multiply(matrix) : matrix;
    }

    /** Turn the object so its -Z axis points at a world space target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target)
    {
        // rotation3D is local to the parent, so a child has to aim at the target from the parent's point of view
        const parent = this.parent instanceof EngineObject3D ? this.parent : undefined;
        const local = parent ? parent.getMatrix().invert().transformPoint(target) : target;
        this.rotation3D = render3DLookRotation(local.subtract(this.pos3D), this.rotation3D);
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
        if (old && old !== mesh && old.buffer && !engineObjects.some(o=> o.mesh === old))
            old.dispose();
        return mesh;
    }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass with the draw state set from this object's flags, draws the mesh by default */
    render3D()
    {
        // an opaque draw comes out solid however low its alpha is, so a fade with no flag looks like nothing happened
        ASSERT(this.transparent || this.additive || this.color.a >= 1, 'an object that fades needs its transparent flag, an opaque draw ignores the color alpha', this.color);
        if (this.mesh)
            render3D.drawMesh(this.mesh, this.getMatrix(), this.tileInfo, this.color);
        else if (this.tileInfo)
        {
            // a sprite: size3D grown by its own scale and its parents', the same world size the
            // collect, pick and solid collision helpers measure it at
            const m = this.getMatrix().m;
            render3D.drawBillboard(vec3(m[12], m[13], m[14]),
                vec2(this.size3D.x * hypot(m[0], m[1], m[2]), this.size3D.y * hypot(m[4], m[5], m[6])),
                this.tileInfo, this.color, this.rotation3D.z, this.upright);
        }
    }
}

// move an object by its 3D velocities, an object with mass falling with render3D.gravity and slowing by its damping
function render3DMove(o)
{
    if (o.mass && !o.sync2D) // a 2D driven object gets the 2D gravity instead
    {
        // damped first and gravity added after, the order EngineObject.updatePhysics uses,
        // so the same mass, damping and gravity fall the same way in both
        const v = o.velocity3D, g = render3D.gravity, s = o.gravityScale, d = o.damping;
        o.velocity3D = vec3(v.x * d + g.x * s, v.y * d + g.y * s, v.z * d + g.z * s);
    }
    o.pos3D = o.pos3D.add(o.velocity3D);
    o.rotation3D = o.rotation3D.add(o.angleVelocity3D);
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
        if (b.destroyed || b.parent || b.sync2D || !(b instanceof EngineObject3D)) continue; // a child is part of its parent
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
        const normal = push.normalize();
        if (a.velocity3D.dot(normal) < 0)
            a.velocity3D = a.velocity3D.reflect(normal, a.restitution);
        if (b.velocity3D.dot(normal) > 0)
            b.velocity3D = b.velocity3D.reflect(normal, b.restitution);
    }
}

/**
 * Collect the EngineObject3D objects whose boxes overlap a box, sizes are full sizes
 * - Boxes are axis aligned around the world position, rotation3D is ignored; lights, emitters and trails have no size
 * @param {Vector3} pos - Center of the box
 * @param {Vector3|number} size - Full size of the box, a number for a cube
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsCollect3D(pos, size, objects=engineObjects)
{
    size = render3DSize3(size);
    const collected = [];
    for (const o of objects)
    {
        if (!(o instanceof EngineObject3D) || o.destroyed) continue;
        const m = o.getMatrix().m, s = o.size3D; // the box in world space, scaled by the object and its parents
        if (!(s.x || s.y || s.z)) continue;
        const worldSize = vec3(s.x * hypot(m[0], m[1], m[2]), s.y * hypot(m[4], m[5], m[6]), s.z * hypot(m[8], m[9], m[10]));
        if (isOverlapping3D(pos, size, vec3(m[12], m[13], m[14]), worldSize))
            collected.push(o);
    }
    return collected;
}

// how far along a ray an object is hit, or undefined for a miss; each one is tested as a sphere
// around its mesh, or around a sprite's size3D, not triangle by triangle
function render3DRaycastObject(ray, o)
{
    if (o.destroyed || !(o instanceof EngineObject3D) || !(o.mesh || o.tileInfo)) return;
    const matrix = o.getMatrix(), mesh = o.mesh; // a sprite is picked by its size3D
    const radius = (mesh ? mesh.radius || mesh.computeRadius() : hypot(o.size3D.x, o.size3D.y) / 2) * render3DMaxScale(matrix.m);
    if (!(radius > 0)) return; // nothing to hit
    return raycastSphere(ray, matrix.getTranslation(), radius);
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
        if (distance !== undefined)
            hits.push({o, distance});
    }
    return hits.sort((a, b)=> a.distance - b.distance).map(hit=> hit.o);
}

/**
 * Call a function for each EngineObject3D whose box overlaps a box
 * @param {Vector3} pos - Center of the box
 * @param {Vector3|number} size - Full size of the box, a number for a cube
 * @param {Function} callback
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @memberof Render3D
 */
function engineObjectsCallback3D(pos, size, callback, objects=engineObjects)
{ engineObjectsCollect3D(pos, size, objects).forEach(callback); }

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A light that is an EngineObject3D, so it can move, follow a parent or be destroyed like anything else
 * - A point light: it lights what is near it and fades out by its radius, DirectionalLight3D shines from far away
 * - Only the sun, render3D.sunDirection, casts shadows and makes highlights, these light without either
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
 * - Like every Light3D it casts no shadow and makes no highlight, only the sun, render3D.sunDirection, does
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

///////////////////////////////////////////////////////////////////////////////
/**
 * CameraControl3D - Drag to turn the camera around a point, roll the wheel to zoom
 * - An EngineObject3D, so move its pos3D to follow something, or parent it to an object
 * - Destroy it to hand the camera back, and it stops driving the camera
 * - Set persistent to keep it when engineObjectsDestroy clears out a level
 * - Every part of it is a field, so a game can change the buttons, speeds and limits
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * new CameraControl3D(vec3(0, 1, 0), 15); // look at a point from 15 units away
 */
class CameraControl3D extends EngineObject3D
{
    /** Create a camera control, it drives render3D.camera every frame
     *  @param {Vector3} [target] - The point to look at, its pos3D
     *  @param {number} [distance] - How far the camera sits from the target
     *  @param {number} [pitch] - Angle above the horizon, PI/2 looks straight down
     *  @param {number} [idleSpin] - Turned each frame while not dragging, 0 holds still */
    constructor(target=vec3(), distance=10, pitch=.4, idleSpin=0)
    {
        super(target);
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How far the camera sits from the target */
        this.distance = distance;
        /** @property {number} - Angle above the horizon */
        this.pitch = pitch;
        /** @property {number} - Turned each frame while not dragging */
        this.idleSpin = idleSpin;
        /** @property {number} - Angle around the target, dragging changes it */
        this.yaw = 0;
        /** @property {number} - Mouse button that turns the camera, 0 is left and 2 is right */
        this.dragButton = 0;
        /** @property {number} - How far dragging a pixel turns the camera */
        this.dragSpeed = .01;
        /** @property {number} - How much one wheel notch zooms, 0 turns zooming off */
        this.zoomSpeed = .1;
        /** @property {Vector2} - Closest and furthest the wheel can zoom to */
        this.zoomRange = vec2(distance/4, distance*3);
        /** @property {Vector2} - Lowest and highest pitch, so it cannot tip over the top */
        this.pitchRange = vec2(-.2, 1.4);
    }

    /** Read the mouse and put the camera on its orbit, called automatically each frame */
    update()
    {
        if (mouseIsDown(this.dragButton))
        {
            // the scene follows the drag
            this.yaw -= mouseDeltaScreen.x * this.dragSpeed;
            this.pitch += mouseDeltaScreen.y * this.dragSpeed;
        }
        else
            this.yaw += this.idleSpin;
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);
        if (this.zoomSpeed && mouseWheel)
            this.distance = clamp(this.distance * (1 + sign(mouseWheel) * this.zoomSpeed), this.zoomRange.x, this.zoomRange.y);
        render3D.camera.orbit(this.getWorldPos3D(), this.distance, this.yaw, this.pitch);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * FirstPersonCamera3D - Look around with the mouse and move with the keys, with the camera at its position
 * - Click to capture the mouse so looking needs no button held, Esc lets it go; holding the button looks too, for touch
 * - WASD or the arrow keys walk level, or move the way it looks when fly is set
 * - An EngineObject3D that moves by velocity3D, so give it a size3D and call setCollision to walk into solid
 *   objects instead of through them; walking keeps velocity3D.y, so render3D.gravity can pull it down
 * - Starts from wherever render3D.camera is, so it can take over from another camera without a jump
 * - Destroy it to hand the camera back
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const player = new FirstPersonCamera3D(vec3(0, 1.5, 5));
 * player.size3D = vec3(1); // bump into solid objects
 * player.collideAsSphere3D = true;
 * player.setCollision();
 */
class FirstPersonCamera3D extends EngineObject3D
{
    /** Create a first person camera, it drives render3D.camera every frame
     *  @param {Vector3} [pos3D] - Where the eye is, defaults to where the camera is now
     *  @param {number} [yaw] - Radians around Y, defaults to the camera's
     *  @param {number} [pitch] - Radians up from level, defaults to the camera's */
    constructor(pos3D=render3D.camera.pos, yaw=render3D.camera.rotation.y, pitch=render3D.camera.rotation.x)
    {
        super(pos3D);
        this.size3D = vec3(); // not a solid thing to pick or collect until it is given a size
        this.mass = 1; // so solids push it out, and render3D.gravity pulls on it
        /** @property {number} - Angle around Y, the mouse turns it */
        this.yaw = yaw;
        /** @property {number} - Angle up from level, the mouse tilts it */
        this.pitch = pitch;
        /** @property {number} - World units per frame at full speed */
        this.moveSpeed = .1;
        /** @property {number} - How far a pixel of mouse movement turns the view */
        this.lookSpeed = .003;
        /** @property {Vector2} - Lowest and highest pitch */
        this.pitchRange = vec2(-1.5, 1.5);
        /** @property {boolean} - Move the way it looks, up and down included, instead of walking level */
        this.fly = false;
        /** @property {boolean} - Capture the mouse on a click, so looking needs no button held */
        this.lockPointer = true;
    }

    /** Read the mouse and keys and put the camera at the eye, called automatically each frame */
    update()
    {
        // a click captures the mouse, then it looks around while captured or while a button is held
        if (this.lockPointer && mouseWasPressed(0))
            pointerLockRequest();
        if (pointerLockIsActive() || mouseIsDown(0))
        {
            this.yaw -= mouseDeltaScreen.x * this.lookSpeed;
            this.pitch -= mouseDeltaScreen.y * this.lookSpeed;
        }
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);

        // the keys move it level, or the way it looks when flying, and walking keeps its fall
        const input = keyDirection();
        const move = vec3(input.x, 0, -input.y).clampLength(1).scale(this.moveSpeed)
            .rotateX(this.fly ? this.pitch : 0).rotateY(this.yaw);
        this.velocity3D = this.fly ? move : vec3(move.x, this.velocity3D.y, move.z);

        // the camera sits at the eye, where this frame's physics left it
        render3D.camera.pos = this.getWorldPos3D();
        render3D.camera.rotation = vec3(this.pitch, this.yaw, 0);
    }

    /** Let go of the mouse and stop driving the camera
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        this.lockPointer && pointerLockIsActive() && pointerLockExit();
        super.destroy(immediate);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Each particle is a flat square facing the camera, with a soft round dot when no tile is given
 * - Set trailTime to draw each particle as a streak along where it has been, for sparks
 * - Set angleSpeed to tumble them in the camera plane, which the 2D emitter takes as an argument
 * - Particles shoot out along the emitter's own up axis, turned by rotation3D
 * - emitConeAngle spreads them, PI sprays in every direction
 * - Speeds are per frame and sizes are world units, the same as the 2D emitter
 * - scale3D, its own or a parent's, grows the whole effect: the spawn area, the sizes, the speed and the fall
 * - gravity here is its own number added to velocity y each frame: it is neither the engine's 2D
 *   gravity nor render3D.gravity, so an effect keeps its own fall wherever it is used
 * - An emitter with an emitTime destroys itself once its last particle is gone, like the 2D emitter
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * // fire: a stream upward, yellow fading to transparent red, additive
 * new ParticleEmitter3D(vec3(), .5, 0, 100, .3, undefined, hsl(.12, 1, .6), hsl(.08, 1, .5), hsl(0, 1, .5, 0), hsl(0, 1, .25, 0), 1, .5, 1.5, .05, .95, 0, .3, .2, true);
 */
class ParticleEmitter3D extends EngineObject3D
{
    /** Create a particle emitter
     *  @param {Vector3} [pos3D] - World space position of the emitter
     *  @param {number|Vector3} [emitSize] - Spawn area, a number for a sphere diameter or a vec3 for a box
     *  @param {number} [emitTime] - How long to keep emitting, 0 is forever
     *  @param {number} [emitRate] - Particles per second, 0 does not emit
     *  @param {number} [emitConeAngle] - Half angle around the emit direction, PI is every direction
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile to render particles with, or a whole texture, undefined is untextured
     *  @param {Color} [colorStartA] - Color at start of life, randomized between the start colors
     *  @param {Color} [colorStartB]
     *  @param {Color} [colorEndA] - Color at end of life, randomized between the end colors
     *  @param {Color} [colorEndB]
     *  @param {number} [particleTime] - How long particles live in seconds
     *  @param {number} [sizeStart] - Particle size at start of life
     *  @param {number} [sizeEnd] - Particle size at end of life
     *  @param {number} [speed] - Spawn speed in world units per frame
     *  @param {number} [damping] - Per frame velocity multiplier, 1 is none
     *  @param {number} [gravity] - Per frame change to velocity y, negative pulls down; its own number,
     *    not render3D.gravity, so the 2D emitter's gravityScale has no equivalent here
     *  @param {number} [fadeRate] - Fraction of life spent fading, half in and half out
     *  @param {number} [randomness] - Extra randomness applied to speed, size and life
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), emitSize=0, emitTime=0, emitRate=100, emitConeAngle=PI, tileInfo,
        colorStartA=WHITE, colorStartB=WHITE, colorEndA=CLEAR_WHITE, colorEndB=CLEAR_WHITE,
        particleTime=.5, sizeStart=.1, sizeEnd=1, speed=.1, damping=1, gravity=0, fadeRate=.1, randomness=.2, additive=false)
    {
        super(pos3D, undefined, tileInfo);
        this.transparent = true;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect

        /** @property {number|Vector3} - Spawn area, a number for a sphere diameter or a vec3 for a box */
        this.emitSize = emitSize;
        /** @property {number} - How long to keep emitting, 0 is forever */
        this.emitTime = emitTime;
        /** @property {number} - Particles per second, 0 does not emit */
        this.emitRate = emitRate;
        /** @property {number} - Half angle around the emit direction, PI is every direction */
        this.emitConeAngle = emitConeAngle;
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndA = colorEndA.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndB = colorEndB.copy();
        /** @property {number} - How long particles live in seconds */
        this.particleTime = particleTime;
        /** @property {number} - Particle size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Particle size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {number} - Spawn speed in world units per frame */
        this.speed = speed;
        /** @property {number} - Per frame velocity multiplier */
        this.damping = damping;
        /** @property {number} - Per frame change to velocity y, its own number and not render3D.gravity */
        this.gravity = gravity;
        /** @property {number} - Fraction of life spent fading, half in and half out */
        this.fadeRate = fadeRate;
        /** @property {number} - Extra randomness applied to speed, size and life */
        this.randomness = randomness;
        /** @property {boolean} - Additive blending */
        this.additive = additive;
        /** @property {number} - Seconds of each particle's path to draw as a ribbon behind it, 0 draws billboards */
        this.trailTime = 0;
        /** @property {number} - Radians per frame each particle turns in the camera plane, either way; 0 is no spin */
        this.angleSpeed = 0;
        /** @property {number} - Per frame multiplier on that spin, 1 keeps it */
        this.angleDamping = 1;
        /** @property {Array<Object>} - Live particles
         *  @type {Array<Object>} */
        this.particles = [];
        this.emitTimeBuffer = 0;
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // one transform for the frame: where the emitter is, and how big the effect it makes is
        const matrix = this.getMatrix();
        this.worldPos3D = matrix.getTranslation(); // remembered for when the parent is destroyed
        const scale = render3DMaxScale(matrix.m);

        // emit until the emit time is up, then wait for the last particle and go away
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // a rate of zero is an emitter fed by hand, and the global scale only quiets it,
            // neither is a reason to stop counting down the emit time
            if (this.emitRate && particleEmitRateScale)
            {
                this.emitTimeBuffer += this.emitRate * particleEmitRateScale * timeDelta;
                for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                    this.emitParticle();
            }
        }
        else if (!this.particles.length)
            this.destroy();

        // move the particles and drop the dead ones
        const particles = this.particles;
        for (let i = particles.length; i--;)
        {
            // damped first and gravity added after, the order the 2D particle uses, so the same
            // damping and gravity give the same arc in both
            const p = particles[i], v = p.velocity;
            v.x *= this.damping, v.y *= this.damping, v.z *= this.damping; // in place, this runs per particle
            v.y += this.gravity * scale; // a bigger effect has to fall faster to keep the same arc
            p.pos = p.pos.add(v);
            p.angle += p.angleVelocity *= this.angleDamping;
            if (this.trailTime)
            {
                // remember where it has been, oldest first
                const trail = p.trail || (p.trail = []);
                trail.push(p.pos);
                const extra = trail.length - this.trailTime / timeDelta;
                extra > 0 && trail.splice(0, extra);
            }
            if ((p.age += timeDelta) >= p.life)
                particles[i] = particles[particles.length - 1], particles.pop(); // swap with the last, order does not matter
        }
    }

    /** Stop emitting, and go away once the particles already out have finished like the 2D emitter's do
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.particles.length || this.destroyed)
            return super.destroy(immediate);
        this.emitTime = -1; // stops emitting, and update destroys it once the particles are gone
        render3DDetach(this); // the particles are in world space, they no longer need the parent
    }

    /** Spawn one particle now */
    emitParticle()
    {
        const random = ()=> rand(1 - this.randomness, 1 + this.randomness);
        const matrix = this.getMatrix();
        // the whole effect grows with the emitter, not just the area the particles start in
        const scale = render3DMaxScale(matrix.m);

        // spawn offset: inside a box or a sphere
        const size = this.emitSize;
        const offset = isVector3(size) ? vec3(rand(-.5, .5) * size.x, rand(-.5, .5) * size.y, rand(-.5, .5) * size.z)
            : randInSphere(size / 2);

        // direction inside the cone around local +Y
        const direction = matrix.transformDirection(randVector3(1, this.emitConeAngle)).normalize();

        this.particles.push({
            pos: matrix.transformPoint(offset),
            velocity: direction.scale(this.speed * random() * scale),
            colorStart: randColor(this.colorStartA, this.colorStartB, true),
            colorEnd: randColor(this.colorEndA, this.colorEndB, true),
            sizeStart: this.sizeStart * random() * scale,
            sizeEnd: this.sizeEnd * random() * scale,
            life: this.particleTime * random(),
            // a spinning particle starts anywhere and turns either way, one that is not stays at zero
            angle: this.angleSpeed ? rand(2*PI) : 0,
            angleVelocity: this.angleSpeed ? this.angleSpeed * random() * randSign() : 0,
            age: 0 });
    }

    /** Draw the particles, as flat squares or as streaks when trailTime is set
     *  - The whole emitter sorts as one thing, its particles are not sorted against each other */
    render3D()
    {
        if (render3D.transparentQueue)
            return render3D.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        const fade = this.fadeRate / 2, texture = this.tileInfo || render3DSoftDot(); // no dot headless
        for (const p of this.particles)
        {
            const t = p.age / p.life;
            const alpha = t < fade ? t / fade : t > 1 - fade ? (1 - t) / fade : 1;
            const color = p.colorStart.lerp(p.colorEnd, t), size = lerp(p.sizeStart, p.sizeEnd, t);
            color.a *= alpha;
            const trail = p.trail;
            if (trail && trail.length > 1)
            {
                // a ribbon from the tail to the head, the tail thins and fades out
                const widths = [], colors = [];
                for (let i = 0; i < trail.length; ++i)
                {
                    const s = (i + 1) / trail.length;
                    widths.push(size * s);
                    colors.push(color.scale(1, s));
                }
                render3D.drawRibbon(trail, widths, this.tileInfo, colors);
            }
            else if (texture)
                render3D.drawBillboard(p.pos, vec2(size), texture, color, p.angle);
            else
                render3D.drawSoftDisc(p.pos, size, color, undefined, 8); // no canvas for the dot, headless
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Trail3D - A ribbon through where the object has been, thinning and fading with age
 * - Records its world position each frame it moves, so parent it to something that moves or set pos3D yourself
 * - The samples are world space, so width is a world width and scale3D does nothing to the ribbon
 * - Drawn unlit in the transparent stage, dies down on its own once the object stops
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const trail = new Trail3D(vec3(), 1, .3, undefined, hsl(.08, 1, .5), hsl(0, 1, .5, 0), true);
 * ball.addChild(trail); // follows the ball
 */
class Trail3D extends EngineObject3D
{
    /** Create a trail
     *  @param {Vector3} [pos3D]
     *  @param {number} [lifeTime] - Seconds the ribbon takes to thin and fade from head to tail,
     *    Infinity keeps every sample at full width and never drops one, so it grows as long as the object moves
     *  @param {number} [width] - Width at the head, it thins to nothing at the tail
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile or whole texture stretched along the trail, undefined is untextured
     *  @param {Color} [color] - Color at the head
     *  @param {Color} [colorEnd] - Color at the tail
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), lifeTime=1, width=.2, tileInfo, color=WHITE, colorEnd=CLEAR_WHITE, additive=false)
    {
        super(pos3D, undefined, tileInfo, color);
        this.transparent = true;
        this.additive = additive;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect
        this.finishing = false; // set by destroy, the ribbon fades out then goes away

        /** @property {number} - Seconds the ribbon takes to thin and fade from head to tail, Infinity never drops a sample */
        this.lifeTime = lifeTime;
        /** @property {number} - Width at the head */
        this.width = width;
        /** @property {Color} - Color at the tail */
        this.colorEnd = colorEnd.copy();
        /** @property {Vector3|undefined} - Direction across the ribbon, recorded with each sample, undefined faces the camera
         *  @type {Vector3|undefined} */
        this.side = undefined;
        /** @property {Array<Object>} - Recorded samples, oldest first
         *  @type {Array<Object>} */
        this.samples = [];
    }

    /** Forget the trail so far, for when the object teleports */
    clear() { this.samples.length = 0; }

    /** Stop recording, and go away once the ribbon has faded
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.samples.length || this.destroyed || this.lifeTime == Infinity)
            return super.destroy(immediate);
        this.finishing = true;
        render3DDetach(this); // the samples are in world space, they no longer need the parent
    }

    /** Record the position when it moved and drop old samples, called automatically each frame */
    update()
    {
        const samples = this.samples;
        if (!this.finishing)
        {
            const pos = this.worldPos3D = this.getWorldPos3D(), last = samples[samples.length - 1];
            if (!last || pos.distanceSquared(last.pos) > 1e-8)
                samples.push({pos, side: this.side?.copy(), time});
        }
        while (samples.length && time - samples[0].time > this.lifeTime)
            samples.shift();
        this.finishing && !samples.length && this.destroy();
    }

    /** Draw the ribbon */
    render3D()
    {
        const samples = this.samples;
        if (samples.length < 2) return;
        const points = [], widths = [], colors = [], sides = this.side ? [] : undefined;
        for (const s of samples)
        {
            const age = clamp((time - s.time) / this.lifeTime);
            points.push(s.pos);
            widths.push(this.width * (1 - age));
            colors.push(this.color.lerp(this.colorEnd, age));
            sides?.push(s.side);
        }
        render3D.drawRibbon(points, widths, this.tileInfo, colors, sides);
    }
}

///////////////////////////////////////////////////////////////////////////////
// OBJ meshes

/**
 * Parse Wavefront OBJ text into a Mesh
 * - Reads v, vt, vn and f lines with convex polygons of any size, materials and groups are ignored
 * - Normals come from the file when every corner of a face has one, otherwise from the face
 * - Use mesh.center() and mesh.fit(size) to bring a model of unknown units to the origin
 * - Back faces are skipped like any mesh, set doubleSided for a model with open walls or single sided parts
 * @param {string} text
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), parseOBJ(objText).center().fit(4));
 */
function parseOBJ(text, smooth=render3D?.smoothShading)
{
    const positions = [], normals = [], uvs = [], mesh = new Mesh;
    let fileNormals = false;

    // OBJ indices count from 1, and a negative one counts back from the end of the list so far
    const lookup = (s, list)=> { const i = parseInt(s); return list[i < 0 ? list.length + i : i - 1]; };
    for (const line of text.split('\n'))
    {
        const parts = line.trim().split(/\s+/);
        switch (parts[0])
        {
            case 'v':  positions.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vn': normals.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vt': uvs.push(vec2(+parts[1], 1 - +parts[2])); break; // OBJ v runs up, tiles run down
            case 'f':
            {
                const corners = parts.slice(1).map(c=> c.split('/'));
                if (corners.length < 3) break;
                const points = corners.map(c=> lookup(c[0], positions));
                ASSERT(points.every(isVector3), 'OBJ face uses a vertex index the file does not have', line);
                const uv = corners.map(c=> c[1] ? lookup(c[1], uvs) : RENDER3D_DEFAULT_UV);
                const hasNormals = corners.every(c=> c[2]);
                fileNormals ||= hasNormals;
                const n = hasNormals ? render3DPolygonStrip(corners.map(c=> lookup(c[2], normals)))
                    : render3DFaceNormal(points[0], points[1], points[2], points[3]);
                mesh.addStrip(render3DPolygonStrip(points), n, render3DPolygonStrip(uv));
            }
        }
    }
    if (!fileNormals && smooth)
        mesh.computeNormals(true);
    return mesh;
}

/**
 * Fetch and parse an OBJ file
 * @param {string} url
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3D.smoothShading
 * @return {Promise<Mesh>}
 * @memberof Render3D
 * @example
 * const mesh = await loadOBJ('ship.obj'); // in an async gameInit
 */
async function loadOBJ(url, smooth=render3D?.smoothShading)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadOBJ failed: ' + url);
    return parseOBJ(await response.text(), smooth);
}
