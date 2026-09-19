/**
 * LittleJS 3D Rendering Plugin
 * - Draws meshes, billboards, lines and particles into the engine's WebGL canvas, under the 2D layer by default
 * - One shader: directional and ambient light, point lights, specular, fog, shadows, textures and vertex colors
 * - Meshes are triangle strips uploaded once and drawn by matrix, immediate mode draws batch into a stream
 * - Shape builders, extruded sprites and text, height map terrain, a sky dome and OBJ loading
 * - EngineObject3D is an EngineObject with a 3D transform and a mesh, with lights, particles and trails built on it
 * - Requires the Math3D plugin, call new Render3DPlugin() in gameInit
 * @namespace Render3D
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global Render3D plugin object
 *  @type {Render3DPlugin}
 *  @memberof Render3D */
let render3D;

/** Default shading for the shape builders, true for smooth vertex normals, false for flat faceted faces
 *  @type {boolean}
 *  @default
 *  @memberof Render3D */
let render3DSmoothShading = false;

/** Set the default shading for the shape builders, each builder can still be given its own smooth argument
 *  @param {boolean} smooth
 *  @memberof Render3D */
function setRender3DSmoothShading(smooth) { render3DSmoothShading = smooth; }

// vertex format: position xyz, normal xyz, uv, rgba bytes
const RENDER3D_VERTEX_FLOATS = 9;
const RENDER3D_VERTEX_BYTES = RENDER3D_VERTEX_FLOATS * 4;
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_MAX_POINT_LIGHTS = 8; // per frame, the shader loops over this many
const RENDER3D_QUAD_UVS = Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv))); // strip order
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(rgb(0, 0, 0, .5));
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
    if (!render3D.shader) return false;
    ASSERT(render3D.isRendering, '3D draws are only valid during the 3D pass, draw from an EngineObject3D or render3D.onRenderOpaque');
    return render3D.isRendering;
}

// the draw state fields a batch is drawn under; lights and fog are not captured, they are read live at flush
const RENDER3D_STATE_FIELDS = ['blend', 'additive', 'depthTest', 'depthWrite', 'cullBackFaces', 'lighting', 'receiveShadow', 'specular'];

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

// the matrix that transforms normals for a model matrix
function render3DNormalMatrix(matrix) { return matrix.copy().invert().transpose(); }

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
    r.lighting = !o?.unlit;
    r.additive = !!o?.additive;
    r.specular = o?.specular || 0;
    r.receiveShadow = !o || o.receiveShadow;
    r.cullBackFaces = !!o?.cullBackFaces;
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

// the point lights the shader gets this frame, the nearest to the camera
function render3DCollectLights()
{
    const lights = [];
    for (const o of engineObjects)
        if (!o.destroyed && o instanceof Light3D)
            lights.push(o);
    if (lights.length > RENDER3D_MAX_POINT_LIGHTS)
    {
        const cameraPos = render3D.camera.pos, distances = new Map;
        for (const light of lights)
            distances.set(light, light.getWorldPos3D().distanceSquared(cameraPos));
        lights.sort((a, b)=> distances.get(a) - distances.get(b));
        lights.length = RENDER3D_MAX_POINT_LIGHTS;
    }
    return lights;
}

// unit circle directions for a number of sides, [cos, sin, cos, sin, ...] including the closing point, cached
const render3DCircleCache = new Map;
function render3DCircle(sides)
{
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
    const size = 32, canvas = new OffscreenCanvas(size, size), context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]]) // the same falloff as a soft disc
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return render3DSoftDotTexture = new TextureInfo(canvas);
}

// the rotation that points -Z along a direction, as vec3(pitch, yaw, 0)
function render3DLookRotation(direction)
{
    const d = direction.normalize();
    return vec3(Math.asin(clamp(d.y, -1, 1)), atan2(-d.x, -d.z), 0);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Render3D Plugin - The 3D renderer, camera, lights, shadows, fog and draw state
 * - The 3D pass runs before gameRender, so 2D drawing lands on top; renderAfter2D flips that
 * - Draw state fields are read at each draw, the pass sets them from each object's flags and resets them for the callbacks
 * @memberof Render3D
 * @example
 * new Render3DPlugin();
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
        /** @property {Vector3} - Direction the directional light travels, read at each draw */
        this.lightDirection = vec3(.5, -1, .3).normalize();
        /** @property {Color} - Directional light color */
        this.lightColor = WHITE.copy();
        /** @property {Color} - Ambient light color */
        this.ambientColor = rgb(.3, .3, .3);
        /** @property {Color|undefined} - Fog color, uses canvasClearColor when undefined */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;

        // shadows
        /** @property {boolean} - Draw a shadow map from the directional light so lit opaque meshes shadow everything lit, off by default and free when off */
        this.shadows = false;
        /** @property {number} - Shadow map width and height in texels, rebuilt when it changes */
        this.shadowMapSize = 1024;
        /** @property {number} - World size the shadow map covers around shadowCenter, smaller is sharper */
        this.shadowRange = 40;
        /** @property {Vector3|undefined} - Center of the shadowed area, read each frame, undefined follows the camera */
        this.shadowCenter = undefined;
        /** @property {number} - Depth offset that keeps surfaces from shadowing themselves, raise it for speckles, lower it if shadows float away from their casters */
        this.shadowBias = .003;
        /** @property {number} - Blur radius in shadow map texels */
        this.shadowSoftness = 1;

        // draw state, read at each draw
        /** @property {boolean} - Apply lighting, when false draws plain vertex color times texture */
        this.lighting = true;
        /** @property {boolean} - Additive blending instead of alpha, in the transparent stage */
        this.additive = false;
        /** @property {boolean} - Test against the depth buffer, reset to true before each object and callback */
        this.depthTest = true;
        /** @property {boolean} - Write to the depth buffer, owned by the stages: on for opaque, off for transparent */
        this.depthWrite = true;
        /** @property {boolean} - Skip faces that point away from the camera, set per object with its cullBackFaces flag */
        this.cullBackFaces = false;
        /** @property {number} - Phong highlight strength */
        this.specular = 0;
        /** @property {boolean} - Darken by the shadow map when shadows are on, turn it off for things that should stay lit inside a shadow */
        this.receiveShadow = true;

        // the pass
        /** @property {Function|undefined} - Called in the opaque stage after the opaque objects, for world geometry drawn outside of objects; called again in the shadow pass when shadows are on, so keep it to drawing */
        this.onRenderOpaque = undefined;
        /** @property {Function|undefined} - Called in the transparent stage after the transparent objects, for billboards, glows and shadows drawn outside of objects */
        this.onRenderTransparent = undefined;
        /** @property {Mesh|undefined} - Sky dome from buildSky or setSky, drawn around the camera behind everything */
        this.sky = undefined;
        /** @property {boolean} - Draw the 3D scene after the 2D scene instead of before it, the default for objects that do not set their own renderAfter2D */
        this.renderAfter2D = false;
        /** @property {boolean} - Sort the transparent stage far to near so alpha and additive mix correctly, when false transparent draws land in object order */
        this.sortTransparent = true;
        /** @property {boolean} - Skip meshes whose bounding sphere is outside the view */
        this.frustumCulling = true;

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
        this.shader = undefined;     // the main shader, undefined when not available
        this.shadowShader = undefined;
        this.vao = undefined;
        this.whiteTexture = undefined; // 1x1 white for untextured draws
        this.shadowTexture = undefined;
        this.shadowFramebuffer = undefined;
        this.shadowTextureSize = 0;
        this.contextGeneration = 0;  // counts context losses, a mesh uploaded under an older one uploads again
        this.uniforms = new Map;     // uniform locations by program
        this.uniformValues = {};     // last values sent for the cached vec4 uniforms
        this.shadowMapDrawn = false; // the shadow map is drawn by the first pass of the frame
        this.passIsDefault = true;   // the running pass is the default layer, the only one shadowed
        this.boxMesh = undefined;    // unit shapes for drawBox and drawSphere
        this.sphereMesh = undefined;

        // the stream of immediate mode draws
        this.streamBuffer = undefined;
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
        const m = cameraMatrix.m; // the axes are its columns
        this.cameraRight = vec3(m[0], m[1], m[2]);
        this.cameraUp = vec3(m[4], m[5], m[6]);
        this.cameraForward = vec3(-m[8], -m[9], -m[10]);
        this.cameraBack = vec3(m[8], m[9], m[10]); // the normal of anything facing the camera
        this.frustumPlanes = render3DFrustumPlanes(this.viewProjection);
    }

    /** Project a world point to clip space, x and y in -1 to 1, z is depth; uses this frame's matrices, call updateMatrices after moving the camera
     *  @param {Vector3} pos
     *  @return {Vector3|undefined} - undefined when behind the camera */
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
     *  @param {Vector3} pos
     *  @return {Vector2|undefined} - undefined when behind the camera */
    worldToScreen(pos)
    {
        const clip = this.worldToClip(pos);
        if (!clip)
            return;
        return vec2((clip.x + 1) / 2 * mainCanvasSize.x, (1 - clip.y) / 2 * mainCanvasSize.y);
    }

    /** Get the world space ray under a screen position, for picking with the raycast functions; always returns a ray
     *  - uses the camera as it is now, so it is safe to call from gameUpdate after moving the camera
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size
     *  @return {{origin: Vector3, direction: Vector3}} - Ray start and unit direction */
    screenToRay(screenPos, canvasSize=mainCanvasSize)
    {
        this.updateMatrices();
        const clipX = screenPos.x / canvasSize.x * 2 - 1;
        const clipY = 1 - screenPos.y / canvasSize.y * 2;
        const aspect = canvasSize.x / canvasSize.y || 1, camera = this.camera;
        // the screen offset moves a parallel ray's origin, or bends a perspective ray's direction
        const h = camera.orthographic ? camera.orthographic / 2 : tan(camera.fov / 2);
        const offset = this.cameraRight.scale(clipX * h * aspect).add(this.cameraUp.scale(clipY * h));
        return camera.orthographic
            ? {origin: camera.pos.add(offset), direction: this.cameraForward.copy()}
            : {origin: camera.pos.copy(), direction: this.cameraForward.add(offset).normalize()};
    }

    /** Where a screen position lands on a flat ground plane, for top down games; use HeightMap.raycast for terrain
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {number} [groundHeight] - World height of the ground plane
     *  @return {Vector3|undefined} - undefined when the ray misses the plane */
    screenToGround(screenPos, groundHeight=0)
    {
        const ray = this.screenToRay(screenPos);
        const t = raycastPlane(ray.origin, ray.direction, vec3(0, groundHeight, 0), RENDER3D_DEFAULT_NORMAL);
        return t === undefined ? undefined : ray.origin.add(ray.direction.scale(t));
    }

    /** Find the nearest object whose bounding sphere a ray hits, for picking; the test is against each mesh's bounding sphere, not its triangles
     *  @param {Vector3} origin
     *  @param {Vector3} direction - Need not be normalized, the distance is in units of it
     *  @param {Array<EngineObject>} [objects] - Defaults to every EngineObject3D with a mesh, other objects are skipped
     *  @return {{object: EngineObject3D, distance: number}|undefined} */
    raycastObjects(origin, direction, objects=engineObjects)
    {
        let nearest;
        for (const o of objects)
        {
            if (o.destroyed || !(o instanceof EngineObject3D) || !o.mesh) continue;
            const matrix = o.getMatrix();
            const radius = (o.mesh.radius || o.mesh.computeRadius()) * render3DMaxScale(matrix.m);
            const distance = raycastSphere(origin, direction, matrix.getTranslation(), radius);
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

    /** Is a sphere at least partly inside the view this frame, the test drawMesh uses to skip meshes off screen; inside the shadow pass it tests the shadow map's box
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

    /** Draw a mesh with the current draw state, flushes the stream first so draw order holds
     *  @param {Mesh} mesh
     *  @param {Matrix4} [matrix] - Object transform
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    drawMesh(mesh, matrix=RENDER3D_IDENTITY, tileInfo, color=WHITE)
    {
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo, it comes before color');
        ASSERT(isColor(color), 'color must be a Color');
        if (this.transparentQueue)
            return this.queueTransparent(matrix.getTranslation(), ()=> this.drawMesh(mesh, matrix, tileInfo, color));
        if (!render3DCanDraw()) return;
        if (this.shadowPass && !this.lighting) return; // unlit things cast no shadow
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== this.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        if (this.frustumCulling && !this.isSphereVisible(matrix.getTranslation(), mesh.radius * render3DMaxScale(matrix.m)))
            return;
        this.flush();
        render3DSetDrawUniforms(matrix, tileInfo, color);
        render3DBindVertexBuffer(mesh.buffer);
        glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, mesh.bufferCount);
        ++drawCount;
        primitiveCount += mesh.bufferCount;
    }

    /** Draw a triangle strip, batched into the stream with the current draw state
     *  - the first three points wound counter clockwise from outside are a front face
     *  - inside a bake the strip goes into the mesh instead, in the transparent stage it is queued for sorting
     *  @param {Array<Vector3>} points - Strip order
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
    {
        const lighting = this.lighting;
        this.lighting = false;
        try { this.drawStrip(points, normals, uvs, colors, tileInfo); }
        finally { this.lighting = lighting; }
    }

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

    /** Run a draw function with every strip captured into a new mesh instead of the stream
     *  - strips inside a bake ignore their tileInfo, the baked mesh takes its texture at render time
     *  - drawMesh is not captured: inside the pass it draws immediately, outside it asserts like any draw
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

    /** Run the opaque and transparent stages over a layer's objects, called automatically by the pass; the default layer also gets the sky, the callbacks and the debug primitives
     *  @param {Array<EngineObject3D>} objects
     *  @param {boolean} [isDefault] */
    renderStages(objects, isDefault=true)
    {
        const opaque = [], transparent = [];
        for (const o of objects)
            (o.transparent || o.additive ? transparent : opaque).push(o);

        // sky first, behind everything
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

        // transparent: blending on, depth writes off, every draw queued then replayed far to near
        this.blend = true;
        this.depthWrite = false;
        this.transparentQueue = this.sortTransparent ? [] : undefined;
        try
        {
            render3DDrawObjects(transparent);
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
        const state = render3DCaptureBatchState();
        try
        {
            for (const item of queue)
            {
                Object.assign(this, item.state);
                item.draw();
            }
        }
        finally { Object.assign(this, state); } // the last item's state must not leak
    }

    /** Draw render3D.sky around the camera, unlit, unfogged and behind everything, called automatically by the pass */
    drawSky()
    {
        this.flush();
        const radius = (this.camera.near + this.camera.far) / 2;
        render3DWithState({lighting: false, blend: false, depthTest: false, depthWrite: false, fogEnd: 0}, ()=>
            this.drawMesh(this.sky, buildMatrix(this.camera.pos, undefined, vec3(radius))));
    }

    /** Rebuild the light's view projection around the shadow center, called automatically each frame shadows are on */
    updateShadowMatrix()
    {
        const range = this.shadowRange, half = range / 2;
        const direction = this.lightDirection.normalize();
        const center = this.shadowCenter || this.camera.pos.add(this.cameraForward.scale(half * .8));
        const up = abs(direction.y) > .99 ? vec3(0, 0, 1) : vec3(0, 1, 0);
        const view = Matrix4.lookAt(center.subtract(direction.scale(range)), center, up).invert();
        // snap the view to whole texels so shadow edges hold still as the camera moves
        const texel = range / (this.shadowTextureSize || this.shadowMapSize), m = view.m; // no texture headless
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
    setSky(topColor, horizonColor=rgb(.8, .9, 1), bottomColor)
    {
        this.sky?.dispose();
        this.sky = buildSky(topColor, horizonColor, bottomColor);
        this.fogColor = horizonColor.copy();
        return this.sky;
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
        this.boxMesh ||= buildBox();
        this.drawMesh(this.boxMesh, buildMatrix(pos, rotation, render3DSize3(size)), undefined, color);
    }

    /** Draw a sphere, untextured and smooth shaded
     *  @param {Vector3} pos - Center
     *  @param {number} [size] - Diameter
     *  @param {Color} [color] */
    drawSphere(pos, size=1, color=WHITE)
    {
        this.sphereMesh ||= buildSphere(1, 12, 6, true);
        this.drawMesh(this.sphereMesh, buildMatrix(pos, undefined, vec3(size)), undefined, color);
    }

    /** Draw a camera facing quad, unlit so it keeps its own colors; draw it in the transparent stage for alpha
     *  @param {Vector3} pos - Center
     *  @param {Vector2} size - World units
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color} [color]
     *  @param {number} [angle] - Rotation in the camera plane, counter clockwise */
    drawBillboard(pos, size=vec2(1), tileInfo, color=WHITE, angle=0)
    {
        if (this.transparentQueue && !this.capture) // sort by the exact position, a shadow under it sorts by the floor
            return this.queueTransparent(pos, ()=> this.drawBillboard(pos, size, tileInfo, color, angle));
        if (this.capture)
            return this.drawStripUnlit(render3DBillboardCorners(pos, size, angle), this.cameraBack, RENDER3D_QUAD_UVS, color, tileInfo);

        // the particle path: six stream vertices written straight in, unlit
        const lighting = this.lighting;
        this.lighting = false;
        const uvRect = render3DBeginStrip(6, tileInfo);
        this.lighting = lighting;
        if (!uvRect) return;
        const corners = render3DBillboardCorners(pos, size, angle), rgba = color.rgbaInt();
        const floats = this.streamFloats, ints = this.streamInts;
        for (let k = 0; k < 6; ++k)
        {
            const i = k < 1 ? 0 : k <= 4 ? k - 1 : 3, uv = RENDER3D_QUAD_UVS[i]; // one leading and one trailing repeat
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
        this.drawRibbon([posA, posB], width, color);
    }

    /** Draw a ribbon along a path, unlit and visible from both sides; width and color can change along it
     *  - The texture runs along the length, u from the first point to the last
     *  @param {Array<Vector3>} points - Center line in order, at least two
     *  @param {number|Array<number>} [width] - Full width, one for all or one per point
     *  @param {Color|Array<Color>} [color] - One for all or one per point
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Vector3|Array<Vector3>} [side] - Direction across the ribbon, one for all or one per point, default faces the camera */
    drawRibbon(points, width=.1, color=WHITE, tileInfo, side)
    {
        const count = points.length;
        ASSERT(count > 1, 'a ribbon needs at least two points');
        const strip = [], uvs = tileInfo ? [] : undefined, colors = [], forward = this.cameraForward;
        let across = vec3(1, 0, 0); // kept from the last point where the direction vanishes
        for (let i = 0; i < count; ++i)
        {
            const p = points[i];
            const w = isArray(width) ? width[i] : width;
            const c = isArray(color) ? color[i] : color;
            const s = side && (isArray(side) ? side[i] : side);
            // across the path in the camera plane unless a side is given
            const dir = s || points[min(i + 1, count - 1)].subtract(points[max(i - 1, 0)]).cross(forward);
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

    /** Draw a soft round shadow on the ground under a position, unlit, cheaper than the shadow map and fine alongside it; draw it in the transparent stage
     *  @param {Vector3} pos - Position of the thing casting the shadow
     *  @param {number} [size] - Diameter
     *  @param {number|Function} [floorHeight] - Height of the ground, or (x, z) => y so the shadow follows terrain
     *  @param {Color} [color]
     *  @param {number} [lift] - How far above the ground to draw, raise it if the shadow cuts into rough ground */
    drawSoftShadow(pos, size=1, floorHeight=0, color=RENDER3D_SHADOW_COLOR, lift=.02)
    {
        render3DAssertBlending();
        const height = isNumber(floorHeight) ? ()=> floorHeight : floorHeight;
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
    render3DWithState({lighting: false, depthTest: false, receiveShadow: false, additive: false}, ()=>
    {
        for (const p of render3DDebugPrimitives)
            p.draw();
    });
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p => p.timer < 0);
}

// record a debug draw for a time
function render3DDebugPush(duration, draw)
{
    ASSERT(isNumber(duration), 'time must be a number');
    debug && render3D?.shader && render3DDebugPrimitives.push({timer: new Timer(duration), draw});
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
            render3D.drawRibbon(points, RENDER3D_DEBUG_WIDTH, color);
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
        /** @property {number} - Far clip distance */
        this.far = 1e3;
        /** @property {number} - Visible height in world units for an orthographic view, 0 is perspective */
        this.orthographic = 0;
        /** @property {boolean} - Each frame park the camera so the z=0 plane matches LittleJS 2D world space */
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
    forward() { const m = this.getMatrix().m; return vec3(-m[8], -m[9], -m[10]); }

    /** Returns the camera's right axis
     *  @return {Vector3} */
    right() { const m = this.getMatrix().m; return vec3(m[0], m[1], m[2]); }

    /** Returns the camera's up axis
     *  @return {Vector3} */
    up() { const m = this.getMatrix().m; return vec3(m[4], m[5], m[6]); }

    /** Point the camera at a target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target) { this.rotation = render3DLookRotation(target.subtract(this.pos)); }

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

    /** Park the camera so the z=0 plane matches LittleJS 2D world space, called automatically when align2D is set
     *  @param {number} [canvasHeight] - Defaults to the main canvas height */
    update2D(canvasHeight=mainCanvasSize.y)
    {
        const halfHeight = canvasHeight / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.fov/2);
        this.orthographic &&= halfHeight * 2; // an orthographic view shows the same height
        this.pos = vec3(cameraPos.x, cameraPos.y, distance);
        this.rotation = vec3(0, 0, -cameraAngle); // littlejs 2D angles are clockwise
    }
}

///////////////////////////////////////////////////////////////////////////////
// GL setup, shaders and the frame hooks

// the four attributes of a 36 byte vertex at the locations the shaders declare: location, size, type, normalize, byte offset
const RENDER3D_ATTRIBS = [[0, 3, 5126, false, 0], [1, 3, 5126, false, 12], [2, 2, 5126, false, 24], [3, 4, 5121, true, 32]];

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

    // the shader
    // attributes: p position, n normal, t uv, c color, at fixed locations shared with the depth shader
    // vertex uniforms: viewProj, model, normalMat (inverse transpose of model), lightViewProj
    // fragment uniforms: tint, lightDir (xyz, w = lighting on), lightColor (rgb, a = specular),
    //   ambientColor (rgb, a = fogEnd), fogColor (rgb, a = fogStart), cameraPos, uvRect, tex,
    //   shadowMap, shadowParams (x = shadows on, y = bias, z = blur step in texture space)
    r.shader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj,model,normalMat,lightViewProj;' +
        'uniform vec4 uvRect;' +
        'layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 t;layout(location=3) in vec4 c;' +
        'out vec3 P,N;out vec2 T;out vec4 C,S;' +
        'void main(){' +
        'vec4 w=model*vec4(p,1.);' +
        'gl_Position=viewProj*w;' +
        'P=w.xyz;' +
        'N=mat3(normalMat)*n;' +
        'T=uvRect.xy+t*uvRect.zw;' +
        'C=c;' +
        'S=lightViewProj*w;' +
        '}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform vec4 tint,lightDir,lightColor,ambientColor,fogColor,shadowParams;' +
        'uniform vec4 pointLights[' + RENDER3D_MAX_POINT_LIGHTS + '],pointLightColors[' + RENDER3D_MAX_POINT_LIGHTS + '];' +
        'uniform int pointLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
        'uniform highp sampler2DShadow shadowMap;' +
        'in vec3 P,N;in vec2 T;in vec4 C,S;' +
        'out vec4 o;' +
        'void main(){' +
        'vec4 c=C*tint*texture(tex,T);' +
        'if(lightDir.w>0.){' +
        'vec3 n=normalize(N);' +
        'float nl=dot(n,-lightDir.xyz);' +
        // shadow: compare against the light's depth map with a 3x3 blur, outside the map is lit
        'float s=1.;' +
        'if(shadowParams.x>0.){' +
        'vec3 q=S.xyz/S.w*.5+.5;' +
        'if(all(lessThan(abs(q-.5),vec3(.5)))){' +
        'q.z-=shadowParams.y;' +
        's=0.;' +
        'for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y)' +
        's+=texture(shadowMap,vec3(q.xy+vec2(x,y)*shadowParams.z,q.z));' +
        's/=9.;' +
        '}}' +
        'vec3 l=ambientColor.rgb+lightColor.rgb*max(nl,0.)*s;' +
        // point lights: linear falloff squared, diffuse only
        'for(int i=0;i<' + RENDER3D_MAX_POINT_LIGHTS + ';++i){' +
        'if(i>=pointLightCount)break;' +
        'vec3 v=pointLights[i].xyz-P;' +
        'float d=length(v);' +
        'float a=max(0.,1.-d/pointLights[i].w);' +
        'l+=pointLightColors[i].rgb*pointLightColors[i].a*a*a*max(0.,dot(n,v/max(d,1e-6)));' +
        '}' +
        'c.rgb*=l;' +
        // specular: only where the light hits, skipped entirely when the strength is zero
        'if(lightColor.a>0.){' +
        'vec3 e=normalize(cameraPos-P);' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,e),0.),16.)*lightColor.a*step(0.,nl)*s;' +
        '}}' +
        'if(ambientColor.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,fogColor.rgb,smoothstep(fogColor.a,ambientColor.a,z));' +
        '}' +
        'o=c;' +
        '}'
    );

    // the depth only shader for the shadow map, same vertex layout, position only
    r.shadowShader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj,model;' +
        'layout(location=0) in vec3 p;' +
        'void main(){gl_Position=viewProj*model*vec4(p,1.);}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'void main(){}'
    );

    // the vertex array object with the attributes enabled once, pointers are set per buffer by render3DBindVertexBuffer
    r.vao = gl.createVertexArray();
    gl.bindVertexArray(r.vao);
    for (const [location] of RENDER3D_ATTRIBS)
        gl.enableVertexAttribArray(location);

    // the stream buffer
    r.streamBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.streamBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, r.streamData.byteLength, gl.DYNAMIC_DRAW);
    r.streamCount = 0;

    // white texture for untextured draws, and a one texel shadow map that keeps the shadow sampler valid until shadows are on
    r.whiteTexture = glCreateTexture();
    render3DUpdateShadowMap(1);

    // hand the engine back its own vertex array and buffer
    glSetInstancedMode(true);
    gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
}

function render3DContextLost()
{
    const r = render3D;
    r.shader = r.shadowShader = r.vao = r.streamBuffer = r.whiteTexture = undefined;
    r.shadowFramebuffer = r.shadowTexture = undefined;
    r.shadowTextureSize = 0;
    r.streamCount = 0;
    ++r.contextGeneration; // every uploaded mesh is stale now
    render3DSoftDotTexture = undefined;
}

function render3DContextRestored()
{
    render3DInitGL();
}

// a uniform location, looked up once per program
function render3DUniform(name, program=render3D.shader)
{
    const u = render3D.uniforms;
    let cache = u.get(program);
    cache || u.set(program, cache = {});
    return cache[name] ??= glContext.getUniformLocation(program, name);
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

// uv rect of a tile in texture space with bleed, or the whole texture; one shared rect, use it before the next call
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
    const gl = glContext, r = render3D, m = matrix.m;
    if (r.shadowPass)
    {
        gl.uniformMatrix4fv(render3DUniform('model', r.shadowShader), false, m);
        return;
    }
    gl.uniformMatrix4fv(render3DUniform('model'), false, m);

    // the shader normalizes, so a uniformly scaled rotation is its own normal matrix; only uneven scale needs the inverse transpose
    const sx = m[0]*m[0] + m[1]*m[1] + m[2]*m[2], sy = m[4]*m[4] + m[5]*m[5] + m[6]*m[6], sz = m[8]*m[8] + m[9]*m[9] + m[10]*m[10];
    const mirrored = m[0] * (m[5]*m[10] - m[6]*m[9]) - m[4] * (m[1]*m[10] - m[2]*m[9]) + m[8] * (m[1]*m[6] - m[2]*m[5]) < 0;
    const uniform = !mirrored && abs(sx - sy) < 1e-6 * sx && abs(sx - sz) < 1e-6 * sx;
    gl.uniformMatrix4fv(render3DUniform('normalMat'), false, uniform ? m : render3DNormalMatrix(matrix).m);

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

    // texture, on unit 0 with the shadow map on unit 1
    let texture = r.whiteTexture;
    if (tileInfo instanceof TileInfo)
        texture = tileInfo.textureInfo.glTexture || texture;
    else if (tileInfo instanceof TextureInfo)
        texture = tileInfo.glTexture || texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    uvRect ||= render3DGetTileUVs(tileInfo);
    render3DUniform4f('uvRect', uvRect.x, uvRect.y, uvRect.w, uvRect.h);
    render3DUniform4f('tint', tint.r, tint.g, tint.b, tint.a);

    // lights, fog and shadows are scene state read at draw time, sent only when they change
    const l = r.lightDirection, ll = l.length() || 1, lc = r.lightColor, ac = r.ambientColor, fc = r.fogColor || canvasClearColor;
    render3DUniform4f('lightDir', l.x / ll, l.y / ll, l.z / ll, state.lighting ? 1 : 0);
    render3DUniform4f('lightColor', lc.r, lc.g, lc.b, state.specular);
    render3DUniform4f('ambientColor', ac.r, ac.g, ac.b, r.fogEnd);
    render3DUniform4f('fogColor', fc.r, fc.g, fc.b, r.fogStart);
    render3DUniform4f('shadowParams', r.shadows && r.passIsDefault && state.receiveShadow ? 1 : 0, r.shadowBias, r.shadowSoftness / r.shadowTextureSize, 0);
}

// the six planes of a view projection as [x, y, z, w] with unit normals facing inward, a point is inside when x*px + y*py + z*pz + w >= 0
function render3DFrustumPlanes(matrix)
{
    const m = matrix.m, planes = [];
    for (let i = 0; i < 3; ++i)
    for (const sign of [1, -1])
    {
        const p = [m[3] + sign * m[i], m[7] + sign * m[4+i], m[11] + sign * m[8+i], m[15] + sign * m[12+i]];
        const l = hypot(p[0], p[1], p[2]) || 1;
        planes.push(p.map(v => v / l));
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
    if (!r.shader) return; // headless, gl disabled, or context lost
    ASSERT(!r.fogEnd || r.fogStart < r.fogEnd, 'fogStart must be less than fogEnd');
    ASSERT(!glRenderTarget, 'the 3D pass needs the canvas depth buffer, it can not draw into a render target');
    const isDefault = after2D === !!r.renderAfter2D, objects = [];
    for (const o of engineObjects)
        if (!o.destroyed && o instanceof EngineObject3D && render3DIsAfter2D(o) === after2D)
            objects.push(o);
    if (!isDefault && !objects.length) return;
    r.passIsDefault = isDefault;
    after2D && glFlush(); // the 2D sprites drawn so far go under this layer

    // a previous frame that threw must not leave anything pending
    r.streamCount = 0;
    r.capture = r.transparentQueue = undefined;

    // take over the gl state
    gl.useProgram(r.shader);
    gl.bindVertexArray(r.vao);
    // strips get one leading repeat, which shifts real triangles to odd indices, so front faces read as clockwise
    gl.frontFace(gl.CW);
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(render3DUniform('viewProj'), false, r.viewProjection.m);
    gl.uniform1i(render3DUniform('tex'), 0);
    gl.uniform1i(render3DUniform('shadowMap'), 1);
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);

    // point lights: the nearest Light3D objects
    const lights = render3DCollectLights();
    gl.uniform1i(render3DUniform('pointLightCount'), lights.length);
    if (lights.length)
    {
        const positions = new Float32Array(lights.length * 4), colors = new Float32Array(lights.length * 4);
        lights.forEach((light, i)=>
        {
            const p = light.getWorldPos3D();
            positions.set([p.x, p.y, p.z, light.radius], i * 4);
            colors.set([light.color.r, light.color.g, light.color.b, light.color.a], i * 4);
        });
        gl.uniform4fv(render3DUniform('pointLights'), positions);
        gl.uniform4fv(render3DUniform('pointLightColors'), colors);
    }

    r.isRendering = true;
    try
    {
        // the shadow map from the light once a frame, then the stages sample it
        if (r.shadows && !r.shadowMapDrawn)
        {
            render3DRenderShadowMap();
            r.shadowMapDrawn = true;
        }
        gl.uniformMatrix4fv(render3DUniform('lightViewProj'), false, r.shadowMatrix.m);
        r.renderStages(objects, isDefault);
    }
    finally
    {
        // hand the state back to the engine's 2D batching, even when a draw threw
        r.isRendering = false;
        r.streamCount = 0;
        r.capture = r.transparentQueue = undefined;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.frontFace(gl.CCW);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // linear on a compare texture filters the comparison, softer edges for free
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
        const casters = engineObjects.filter(o => !o.destroyed && o instanceof EngineObject3D && o.castShadow
            && !o.transparent && !o.additive && render3DIsAfter2D(o) === !!r.renderAfter2D); // the other layer is a different scene
        render3DDrawObjects(casters);
        r.onRenderOpaque?.();
        r.flush();
    }
    finally
    {
        // back to the frame with the map ready to sample
        r.shadowPass = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, mainCanvasSize.x, mainCanvasSize.y);
        gl.useProgram(r.shader);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, r.shadowTexture);
        gl.activeTexture(gl.TEXTURE0);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Strips: every strip gets a leading repeat of its first vertex and a trailing
// repeat of its last, which joins it to its neighbours with degenerate
// triangles, plus one more trailing repeat when the count is odd so winding
// parity holds across a whole mesh or batch

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
function render3DBillboardCorners(pos, size, angle)
{
    const c = cos(angle), s = sin(angle), r = render3D.cameraRight, u = render3D.cameraUp, w = size.x / 2, h = size.y / 2;
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
/**
 * Mesh - A triangle strip with positions, normals, uvs and colors, uploaded once and drawn by matrix
 * - Build with addStrip, addQuad, combine or the shape builders, then render each frame
 * - The GPU buffer is created lazily on first render and dropped by dispose
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
        /** @property {Array<Vector3>} - Vertex positions in strip order */
        this.points = [];
        /** @property {Array<Vector3>} - Vertex normals */
        this.normals = [];
        /** @property {Array<Vector2>} - Vertex texture coords, 0-1 across the tile */
        this.uvs = [];
        /** @property {Array<Color>} - Vertex colors */
        this.colors = [];
        /** @property {WebGLBuffer|undefined} - GPU buffer, created by upload */
        this.buffer = undefined;
        /** @property {number} - Vertices in the GPU buffer */
        this.bufferCount = 0;
        /** @property {boolean} - The CPU data changed since the last upload, set by every method that edits the arrays, or set it yourself after editing them directly */
        this.dirty = false;
        /** @property {number} - Bounding sphere radius around the origin, for culling and picking, computed by upload */
        this.radius = 0;
        this.contextGeneration = 0; // the context the buffer belongs to, see render3D.contextGeneration
    }

    /** Number of vertices in the mesh
     *  @return {number} */
    get vertexCount() { return this.points.length; }

    /** Add a triangle strip, joined to the previous one with degenerate triangles
     *  - the first three points wound counter clockwise from outside are a front face
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

    /** Append another mesh transformed by a matrix, for welding shapes into one draw call
     *  @param {Mesh} mesh
     *  @param {Matrix4} [matrix]
     *  @param {Color} [color] - Multiplies the appended vertex colors
     *  @return {Mesh} */
    combine(mesh, matrix=RENDER3D_IDENTITY, color=WHITE)
    {
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < mesh.points.length; ++i)
        {
            this.points.push(matrix.transformPoint(mesh.points[i]));
            this.normals.push(normalMatrix.transformDirection(mesh.normals[i]).normalize());
            this.uvs.push(mesh.uvs[i]);
            this.colors.push(mesh.colors[i].multiply(color));
        }
        this.dirty = true;
        return this;
    }

    /** Move every vertex in place, points by the matrix and normals by its inverse transpose
     *  @param {Matrix4} matrix
     *  @return {Mesh} */
    transform(matrix)
    {
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < this.points.length; ++i)
        {
            this.points[i] = matrix.transformPoint(this.points[i]);
            this.normals[i] = normalMatrix.transformDirection(this.normals[i]).normalize();
        }
        this.dirty = true;
        return this;
    }

    /** Turn the mesh inside out, for rooms and domes seen from within: negates the normals and shifts the strip so every face winds the other way
     *  @return {Mesh} */
    flipNormals()
    {
        // one more leading repeat moves every triangle to the other parity, one more trailing repeat keeps the count even
        for (const key of ['points', 'normals', 'uvs', 'colors'])
        {
            const a = this[key];
            if (a.length)
                a.unshift(a[0]), a.push(a[a.length - 1]);
        }
        this.normals = this.normals.map(n => n.scale(-1));
        this.dirty = true;
        return this;
    }

    /** Set every vertex color
     *  @param {Color} color
     *  @return {Mesh} */
    setColor(color)
    {
        this.colors = this.colors.map(()=> color);
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
        return this.transform(Matrix4.translation(bounds.min.add(bounds.max).scale(-.5)));
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
     *  @param {boolean} [smooth] - Average normals at shared positions, otherwise each vertex takes the normal of the last face that touches it, which is one normal per face when every quad is its own strip
     *  @return {Mesh} */
    computeNormals(smooth=false)
    {
        const points = this.points, n = points.length;
        const faceNormals = [];
        for (let i = 0; i + 2 < n; ++i)
        {
            const a = points[i], b = points[i+1], c = points[i+2];
            const normal = b.subtract(a).cross(c.subtract(a));
            // real triangles sit at odd strip indices, see render3DForEachStripVertex; a zero normal is a degenerate join
            faceNormals.push(normal.lengthSquared() ? normal.normalize(i & 1 ? 1 : -1) : undefined);
        }
        const normals = [];
        if (smooth)
        {
            const sums = new Map;
            const key = (p)=> `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
            for (let i = 0; i + 2 < n; ++i)
            {
                const f = faceNormals[i];
                if (!f) continue;
                for (let j = 0; j < 3; ++j)
                {
                    const k = key(points[i + j]);
                    sums.set(k, (sums.get(k) || vec3()).add(f));
                }
            }
            for (let i = 0; i < n; ++i)
                normals[i] = (sums.get(key(points[i])) || RENDER3D_DEFAULT_NORMAL).normalize();
        }
        else
        {
            for (let i = 0; i < n; ++i)
                normals[i] = RENDER3D_DEFAULT_NORMAL;
            for (let i = 0; i + 2 < n; ++i)
            {
                const f = faceNormals[i];
                if (f)
                    normals[i] = normals[i+1] = normals[i+2] = f;
            }
        }
        this.normals = normals;
        this.dirty = true;
        return this;
    }

    /** Pack the vertices and create the GPU buffer, called automatically by render
     *  @return {Mesh} */
    upload()
    {
        this.computeRadius();
        if (!render3D?.shader) return this;
        this.dispose();
        const count = this.points.length;
        const data = new ArrayBuffer(count * RENDER3D_VERTEX_BYTES);
        const floats = new Float32Array(data), ints = new Uint32Array(data);
        for (let i = 0; i < count; ++i)
        {
            const uv = this.uvs[i];
            render3DWriteVertex(floats, ints, i * RENDER3D_VERTEX_FLOATS, this.points[i], this.normals[i], uv.x, uv.y, this.colors[i].rgbaInt());
        }
        const gl = glContext;
        this.buffer = gl.createBuffer();
        this.bufferCount = count;
        this.dirty = false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        this.contextGeneration = render3D.contextGeneration;
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
    }

    /** Draw the mesh, one draw call with the current draw state
     *  @param {Matrix4} [matrix] - Object transform
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    render(matrix, tileInfo, color) { render3D?.drawMesh(this, matrix, tileInfo, color); }

    /** Delete the GPU buffer, the CPU arrays stay so the mesh can be rendered again */
    dispose()
    {
        if (!this.buffer) return;
        glContext?.deleteBuffer(this.buffer);
        this.buffer = undefined;
        this.bufferCount = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Shape builders, all centered on the origin so buildMatrix does placement
// Sizes are full sizes like buildBox and the 2D drawCircle, sides go around an axis and rings along it

/**
 * Build a surface of revolution about the Y axis
 * - profile is [[radius, y], ...] from bottom to top, a profile that ends where it starts is closed like a torus
 * @param {Array<Array<number>>} profile
 * @param {number} [sides] - Around the axis
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @param {boolean} [capped] - Close the ends that have a radius with flat discs
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const vase = buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 12);
 */
function buildLathe(profile, sides=12, smooth=render3DSmoothShading, capped=true)
{
    ASSERT(isArray(profile) && profile.length > 1, 'lathe profile needs at least 2 points');
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
    // vertex normal: average of the adjacent segment normals, across the seam when the profile is closed
    const closed = rings > 2 && abs(profile[0][0] - profile[rings-1][0]) < 1e-9 && abs(profile[0][1] - profile[rings-1][1]) < 1e-9;
    const vertexNormal = (i)=>
    {
        let n = vec2();
        if (i > 0) n = n.add(segmentNormal(i - 1));
        else if (closed) n = n.add(segmentNormal(rings - 2));
        if (i < rings - 1) n = n.add(segmentNormal(i));
        else if (closed) n = n.add(segmentNormal(0));
        return n.normalize();
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
    return mesh;
}

/**
 * Build a cylinder standing on the Y axis, centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @param {boolean} [capped] - Close the ends
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(size=1, height=1, sides=12, smooth=render3DSmoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [size / 2, height / 2]], sides, smooth, capped);
}

/**
 * Build a cone standing on the Y axis, centered on the origin, the point up
 * @param {number} [size] - Diameter of the base
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @param {boolean} [capped] - Close the base
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCone(size=1, height=1, sides=12, smooth=render3DSmoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [0, height / 2]], sides, smooth, capped);
}

/**
 * Build a sphere centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(size=1, sides=12, rings=6, smooth=render3DSmoothShading)
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
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCapsule(size=1, height=1, sides=12, rings=4, smooth=render3DSmoothShading)
{
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
 * Build a torus lying flat around the Y axis, a circle profile revolved
 * @param {number} [size] - Diameter from the outside of the tube to the outside of the tube
 * @param {number} [tubeSize] - Diameter of the tube
 * @param {number} [sides] - Around the ring
 * @param {number} [tubeSides] - Around the tube
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth=render3DSmoothShading)
{
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
    for (let i = 0; i < count; ++i)
    {
        // across the path, from the tangent through this point
        const next = points[closed ? (i + 1) % count : min(i + 1, count - 1)];
        const last = points[closed ? (i + count - 1) % count : max(i - 1, 0)];
        const across = next.subtract(last).cross(up).normalize((isArray(width) ? width[i] : width) / 2);
        edges.push([points[i].subtract(across), points[i].add(across)]);
    }
    for (let i = 0; i + 1 < count + (closed ? 1 : 0); ++i)
    {
        const j = (i + 1) % count, a = edges[i], b = edges[j];
        const c = isArray(color) ? [color[i], color[i], color[j], color[j]] : color;
        mesh.addQuad(a[0], a[1], b[1], b[0], c); // counter clockwise seen from above
    }
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth is one ribbon strip per row with slope normals and a color per vertex
 * - flat is one quad per cell with a face normal and one color sampled at the cell center, so checkerboards stay crisp
 * @param {Vector2} [size] - World size along X and Z
 * @param {Vector2|number} [segments] - Cells along X and Z, a number for both
 * @param {Color|Function} [color] - A Color for the whole grid or (x, z) => Color in mesh units, called per vertex when smooth and once per cell at its center when flat
 * @param {Function} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const floor = buildGrid(vec2(20), 10, (x, z)=> (floor(x) + floor(z)) & 1 ? GRAY : WHITE); // a checkerboard
 */
function buildGrid(size=vec2(1), segments=1, color, heightFunction=()=>0, smooth=render3DSmoothShading)
{
    if (isNumber(segments))
        segments = vec2(segments);
    ASSERT(segments.x > 0 && segments.y > 0 && segments.x % 1 === 0 && segments.y % 1 === 0, 'grid segments must be whole numbers above zero');
    const mesh = new Mesh;
    const segmentsX = segments.x, segmentsZ = segments.y;
    const cellX = size.x / segmentsX, cellZ = size.y / segmentsZ;
    const px = (i)=> i * cellX - size.x / 2, pz = (j)=> j * cellZ - size.y / 2;
    const point = (i, j)=> { const x = px(i), z = pz(j); return vec3(x, heightFunction(x, z), z); };
    const normal = (i, j)=>
    {
        const x = px(i), z = pz(j), ex = cellX / 2, ez = cellZ / 2;
        const dx = (heightFunction(x + ex, z) - heightFunction(x - ex, z)) / (2 * ex);
        const dz = (heightFunction(x, z + ez) - heightFunction(x, z - ez)) / (2 * ez);
        return vec3(-dx, 1, -dz).normalize();
    };
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
    return mesh;
}

/**
 * Build a loft: diamond cross sections swept along Z, quads between them, capped both ends
 * - station = [z, width, top, bottom, sideHeight] with sideHeight 0-1 placing the side points between bottom and top (default .5)
 * - stations are ordered nose first, nose at the largest z
 * @param {Array<Array<number>>} stations
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const hull = buildLoft([[1.2, .4, .2, -.1], [0, 1.4, .5, -.4], [-1, 1, .3, -.3]]);
 */
function buildLoft(stations)
{
    ASSERT(isArray(stations) && stations.length > 1, 'loft needs at least 2 stations');
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
function buildSky(topColor=rgb(.2, .4, .9), horizonColor=rgb(.8, .9, 1), bottomColor=horizonColor, sides=16, rings=8)
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
 * Build a mesh by extruding the solid pixels of a tile, a 3D sprite
 * - A pixel is solid when its alpha is over half, its color becomes the vertex color so sprites keep their colors and white glyphs take the tint
 * - Faces and walls are merged along runs of same colored pixels, walls only appear where a solid pixel meets an empty one
 * - Pixels can also be an array of rows, each a Color, a truthy value for white, or a falsy value for empty
 * @param {TileInfo|Array<Array<Color|number|boolean>>} pixels - A tile from a loaded texture, or rows of pixels
 * @param {Vector2} [size] - World width and height of the whole tile, centered like buildBox
 * @param {number} [depth] - Thickness along Z
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), buildExtrude(tile(3, 16), vec2(2), .5)); // a chunky version of tile 3
 */
function buildExtrude(pixels, size=vec2(1), depth=1)
{
    let rows = pixels, x0 = 0, y0 = 0, width, height;
    if (pixels instanceof TileInfo)
    {
        rows = render3DReadPixels(pixels.textureInfo);
        x0 = pixels.pos.x | 0, y0 = pixels.pos.y | 0;
        width = pixels.size.x | 0, height = pixels.size.y | 0;
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
        const c = rows[y0 + y] && rows[y0 + y][x0 + x];
        return c ? isColor(c) ? c : WHITE : undefined;
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
    const px = x => x * sx - size.x / 2, py = y => size.y / 2 - y * sy;
    const quad = (origin, right, up, normal, color)=>
        mesh.addStrip(render3DQuadAxes(origin.add(right.scale(.5)).add(up.scale(.5)), right.scale(.5), up.scale(.5)), normal, RENDER3D_QUAD_UVS, color);
    const X = vec3(1, 0, 0), Y = vec3(0, 1, 0), Z = vec3(0, 0, 1);
    for (let y = 0; y < height; ++y)
    {
        // front and back faces along each row
        runs(width, x => solid(x, y), (a, b, c)=>
        {
            const w = X.scale((b - a) * sx), h = Y.scale(sy);
            quad(vec3(px(a), py(y + 1), hz), w, h, Z, c);
            quad(vec3(px(b), py(y + 1), -hz), w.scale(-1), h, Z.scale(-1), c);
        });
        // walls facing up and down where the pixel above or below is empty
        runs(width, x => solid(x, y - 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y), hz), X.scale((b - a) * sx), Z.scale(-depth), Y, c));
        runs(width, x => solid(x, y + 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y + 1), -hz), X.scale((b - a) * sx), Z.scale(depth), Y.scale(-1), c));
    }
    for (let x = 0; x < width; ++x)
    {
        // walls facing left and right where the pixel beside is empty
        runs(height, y => solid(x - 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x), py(b), -hz), Z.scale(depth), Y.scale((b - a) * sy), X.scale(-1), c));
        runs(height, y => solid(x + 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x + 1), py(b), hz), Z.scale(-depth), Y.scale((b - a) * sy), X, c));
    }
    return mesh;
}

/**
 * Build a mesh of extruded text from an image font, the engine font by default so it needs no assets
 * - Each glyph is extruded once per font and reused, the block is centered and faces +Z, newlines stack downward
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
        const y = ((lines.length - 1) / 2 - j) * charSize.y;
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
 * HeightMap - Terrain from a grid of heights, with a mesh builder, height lookup and a raycast
 * - heights is a 2D array [row][column] of 0-1 values; row 0 is the far edge at -Z, column 0 is the left edge at -X
 * - or an image, where the red channel is the height, laid out the same way
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

        /** @property {Array<Array<number>>} - Heights 0-1 as [row][column], rows along Z */
        this.heights = heights;
        /** @property {Array<Array<Color>>|undefined} - Vertex colors as [row][column], undefined for white */
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
     *  @param {number} x
     *  @param {number} z
     *  @return {number} */
    getHeight(x, z)
    {
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
     *  @param {number} x
     *  @param {number} z
     *  @return {Vector3} */
    getNormal(x, z)
    {
        const dx = this.size.x / (this.columns - 1) / 2, dz = this.size.y / (this.rows - 1) / 2;
        const slopeX = (this.getHeight(x + dx, z) - this.getHeight(x - dx, z)) / (2 * dx);
        const slopeZ = (this.getHeight(x, z + dz) - this.getHeight(x, z - dz)) / (2 * dz);
        return vec3(-slopeX, 1, -slopeZ).normalize();
    }

    /** Color of the nearest sample to a position, white when there are no colors
     *  @param {number} x
     *  @param {number} z
     *  @return {Color} */
    getColor(x, z)
    {
        const c = this.colors;
        if (!c) return WHITE;
        const columns = c[0].length, rows = c.length;
        const i = clamp(round((x / this.size.x + .5) * (columns - 1)), 0, columns - 1);
        const j = clamp(round((z / this.size.y + .5) * (rows - 1)), 0, rows - 1);
        return c[j][i];
    }

    /** Distance along a ray to where it meets the terrain, or undefined; walks the ray half a cell at a time then narrows in
     *  @param {Vector3} origin
     *  @param {Vector3} direction - Need not be normalized, the distance is in units of it
     *  @return {number|undefined} */
    raycast(origin, direction)
    {
        const size = this.size, height = this.height, length = direction.length();
        if (!length) return;
        // clip to the box around the terrain, then step until the ray dips under the ground or leaves the map
        let t = raycastBox(origin, direction, vec3(0, height / 2, 0), vec3(size.x, abs(height) + 1e-3, size.y));
        if (t === undefined) return;
        const cell = min(size.x / (this.columns - 1), size.y / (this.rows - 1));
        const step = cell / 2 / length, end = t + hypot(size.x, size.y, height) / length;
        const under = (t)=>
        {
            const p = origin.add(direction.scale(t));
            if (abs(p.x) > size.x / 2 || abs(p.z) > size.y / 2) return;
            return p.y <= this.getHeight(p.x, p.z);
        };
        if (under(t)) return t;
        for (; t < end; t += step)
        {
            const u = under(t + step);
            if (u === undefined) return;
            if (u)
            {
                let a = t, b = t + step;
                for (let i = 0; i < 16; ++i)
                {
                    const mid = (a + b) / 2;
                    under(mid) ? b = mid : a = mid;
                }
                return b;
            }
        }
    }

    /** Build the terrain mesh, one vertex per sample, centered on the origin
     *  @param {boolean} [smooth] - Defaults to render3DSmoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3DSmoothShading)
    {
        return buildGrid(this.size, vec2(this.columns - 1, this.rows - 1),
            this.colors && ((x, z)=> this.getColor(x, z)), (x, z)=> this.getHeight(x, z), smooth);
    }
}

// read an image into a 2D array [row][column] through the engine's work canvas
// sample is called with (r, g, b, a) bytes for each pixel
function render3DImageToArray(image, sample)
{
    if (image instanceof TextureInfo)
        image = image.image;
    ASSERT(image && image.width && image.height, 'image is not loaded');
    ASSERT(workReadCanvas, 'reading an image needs a canvas, pass arrays in headless mode');
    const width = image.width, height = image.height;
    workReadCanvas.width = width;
    workReadCanvas.height = height;
    workReadContext.drawImage(image, 0, 0);
    const data = workReadContext.getImageData(0, 0, width, height).data;
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

// extruded glyph meshes by font, and the pixels of a texture as rows of Color, undefined where alpha is half or less, read once per image
const render3DGlyphCache = new WeakMap, render3DPixelCache = new WeakMap;
function render3DReadPixels(textureInfo)
{
    const image = textureInfo.image;
    let rows = render3DPixelCache.get(image);
    if (!rows)
        render3DPixelCache.set(image, rows = render3DImageToArray(image, (r, g, b, a)=> a > 127 ? rgb(r / 255, g / 255, b / 255) : undefined));
    return rows;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Inherits update, children, timers, destroy and renderOrder from EngineObject; children that are EngineObject3D follow the parent's 3D transform
 * - velocity3D is added to pos3D each frame, there is no other 3D physics, games do their own
 * - An object faces -Z like the camera: its forward is getMatrix().transformDirection(vec3(0, 0, -1)), or vec3(-sin(yaw), 0, -cos(yaw)) when only yawed
 * - The 2D pos and velocity still exist but rendering ignores them and mass is 0 so 2D physics leaves them alone; copy pos into pos3D for pseudo-3D games
 * - addChild parents the 3D transform, pos3D is then local to the parent; the 2D offset arguments of addChild do nothing in 3D, set the child's pos3D instead
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
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    constructor(pos3D=vec3(), mesh, tileInfo, color=WHITE)
    {
        super(vec2(), vec2(), undefined, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo, it comes before color');
        this.tileInfo = tileInfo; // set after super, a whole TextureInfo is allowed here
        this.mass = 0; // no 2D physics

        /** @property {Vector3} - World space position, local to the parent when attached to an EngineObject3D */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians, local to the parent when attached to an EngineObject3D */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale, local to the parent when attached to an EngineObject3D */
        this.scale3D = vec3(1);
        /** @property {Vector3} - Added to pos3D each frame by the engine after update, no super call needed */
        this.velocity3D = vec3();
        /** @property {Vector3} - Added to rotation3D each frame by the engine after update */
        this.angleVelocity3D = vec3();
        /** @property {Mesh|undefined} - Mesh to draw */
        this.mesh = mesh;
        /** @property {boolean} - Draw in the transparent stage, blended and sorted far to near with depth writes off */
        this.transparent = false;
        /** @property {boolean} - Additive blending, in the transparent stage */
        this.additive = false;
        /** @property {boolean} - Draw with lighting off, plain vertex color times texture, for lamps and glowing things; unlit objects cast no shadow */
        this.unlit = false;
        /** @property {number} - Phong highlight strength */
        this.specular = 0;
        /** @property {boolean} - Draw into the shadow map when render3D.shadows is on, lit opaque objects only */
        this.castShadow = true;
        /** @property {boolean} - Darkened by the shadow map when render3D.shadows is on */
        this.receiveShadow = true;
        /** @property {boolean} - Skip faces that point away from the camera, faster for closed meshes */
        this.cullBackFaces = false;
        /** @property {boolean|undefined} - Draw this object after the 2D scene instead of before it, undefined follows render3D.renderAfter2D; set it back to undefined to follow the default again */
        this.renderAfter2D = undefined;
    }

    /** Apply the 3D velocities, then update the children, called automatically each frame */
    updateTransforms()
    {
        if (!paused)
        {
            this.pos3D = this.pos3D.add(this.velocity3D);
            this.rotation3D = this.rotation3D.add(this.angleVelocity3D);
        }
        super.updateTransforms();
    }

    /** Returns the world position
     *  @return {Vector3} */
    getWorldPos3D() { return this.getMatrix().getTranslation(); }

    /** Returns the object's world transform, relative to the parent's when attached to an EngineObject3D
     *  @return {Matrix4} */
    getMatrix()
    {
        const matrix = buildMatrix(this.pos3D, this.rotation3D, this.scale3D);
        return this.parent instanceof EngineObject3D ? this.parent.getMatrix().multiply(matrix) : matrix;
    }

    /** Turn the object so its -Z axis points at a target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target) { this.rotation3D = render3DLookRotation(target.subtract(this.pos3D)); }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass with the draw state set from this object's flags, draws the mesh by default */
    render3D()
    {
        if (this.mesh)
            render3D.drawMesh(this.mesh, this.getMatrix(), this.tileInfo, this.color);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A point light that lights nearby surfaces, an EngineObject3D so it can move or follow a parent
 * - The 8 nearest to the camera light the frame, radius is where the light reaches zero; the falloff is steep, so a small radius needs a bright color
 * - Draws nothing itself, add a glow with drawSoftDisc or a small unlit mesh if it should be seen
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const torch = new Light3D(vec3(0, 3, 0), 10, rgb(1, .7, .3));
 */
class Light3D extends EngineObject3D
{
    /** Create a point light
     *  @param {Vector3} [pos3D]
     *  @param {number} [radius] - Distance where the light fades to nothing
     *  @param {Color} [color] - Light color, alpha scales the brightness */
    constructor(pos3D=vec3(), radius=5, color=WHITE)
    {
        super(pos3D, undefined, undefined, color);
        /** @property {number} - Distance where the light fades to nothing */
        this.radius = radius;
    }

    /** Lights draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Particles are billboards of the tile, or of a built in soft dot when there is no tile, drawn in the transparent stage so alpha and additive sort correctly
 * - Set trailTime to draw each particle as a ribbon along its recent path instead, for sparks and streaks
 * - Emits along the emitter's local +Y, turned by rotation3D, spread by emitConeAngle
 * - Speeds are per frame and sizes are world units like the 2D emitter; gravity is a per frame change to velocity y, not a scale of the engine's 2D gravity
 * - An emitter with an emitTime destroys itself once its last particle is gone, like the 2D emitter
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * // fire: a stream upward, yellow fading to transparent red, additive
 * new ParticleEmitter3D(vec3(), .5, 0, 100, .3, undefined, rgb(1, .8, .2), rgb(1, .5, 0), rgb(1, 0, 0, 0), rgb(.5, 0, 0, 0), 1, .5, 1.5, .05, .95, 0, .3, .2, true);
 */
class ParticleEmitter3D extends EngineObject3D
{
    /** Create a particle emitter
     *  @param {Vector3} [pos3D] - World space position of the emitter
     *  @param {number|Vector3} [emitSize] - Spawn area, a number for a sphere diameter or a vec3 for a box
     *  @param {number} [emitTime] - How long to keep emitting, 0 is forever
     *  @param {number} [emitRate] - Particles per second, 0 does not emit
     *  @param {number} [emitConeAngle] - Half angle around the emit direction, PI is every direction
     *  @param {TileInfo} [tileInfo] - Tile to render particles with, undefined is untextured
     *  @param {Color} [colorStartA] - Color at start of life, randomized between the start colors
     *  @param {Color} [colorStartB]
     *  @param {Color} [colorEndA] - Color at end of life, randomized between the end colors
     *  @param {Color} [colorEndB]
     *  @param {number} [particleTime] - How long particles live in seconds
     *  @param {number} [sizeStart] - Particle size at start of life
     *  @param {number} [sizeEnd] - Particle size at end of life
     *  @param {number} [speed] - Spawn speed in world units per frame
     *  @param {number} [damping] - Per frame velocity multiplier, 1 is none
     *  @param {number} [gravity] - Per frame change to velocity y, negative pulls down
     *  @param {number} [fadeRate] - Fraction of life spent fading, half in and half out
     *  @param {number} [randomness] - Extra randomness applied to speed, size and life
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), emitSize=0, emitTime=0, emitRate=100, emitConeAngle=PI, tileInfo,
        colorStartA=WHITE, colorStartB=WHITE, colorEndA=CLEAR_WHITE, colorEndB=CLEAR_WHITE,
        particleTime=.5, sizeStart=.1, sizeEnd=1, speed=.1, damping=1, gravity=0, fadeRate=.1, randomness=.2, additive=false)
    {
        super(pos3D, undefined, tileInfo);
        this.transparent = true;

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
        /** @property {number} - Per frame change to velocity y */
        this.gravity = gravity;
        /** @property {number} - Fraction of life spent fading, half in and half out */
        this.fadeRate = fadeRate;
        /** @property {number} - Extra randomness applied to speed, size and life */
        this.randomness = randomness;
        /** @property {boolean} - Additive blending */
        this.additive = additive;
        /** @property {number} - Seconds of each particle's path to draw as a ribbon behind it, 0 draws billboards */
        this.trailTime = 0;
        /** @property {Array<Object>} - Live particles */
        this.particles = [];
        this.emitTimeBuffer = 0;
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // emit at the rate until the emit time is up
        if (this.emitRate && particleEmitRateScale && (!this.emitTime || this.getAliveTime() <= this.emitTime))
        {
            this.emitTimeBuffer += this.emitRate * particleEmitRateScale * timeDelta;
            for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                this.emitParticle();
        }
        else if (this.emitTime && !this.particles.length)
            this.destroy();

        // move the particles and drop the dead ones
        const particles = this.particles;
        for (let i = particles.length; i--;)
        {
            const p = particles[i], v = p.velocity;
            v.y += this.gravity;
            v.x *= this.damping, v.y *= this.damping, v.z *= this.damping; // in place, this runs per particle
            p.pos = p.pos.add(v);
            if (this.trailTime)
            {
                // remember where it has been, oldest first
                const trail = p.trail || (p.trail = []);
                trail.push(p.pos);
                const extra = trail.length - this.trailTime / timeDelta;
                extra > 0 && trail.splice(0, extra);
            }
            if ((p.age += timeDelta) >= p.life)
                particles[i] = particles[particles.length - 1], particles.pop();
        }
    }

    /** Spawn one particle now */
    emitParticle()
    {
        const random = ()=> rand(1 - this.randomness, 1 + this.randomness);
        const matrix = this.getMatrix();

        // spawn offset: inside a box or a sphere
        const size = this.emitSize;
        const offset = isVector3(size) ? vec3(rand(-.5, .5) * size.x, rand(-.5, .5) * size.y, rand(-.5, .5) * size.z)
            : randVector3(rand() ** (1/3) * size / 2);

        // direction inside the cone around local +Y, uniform over the spherical cap
        const z = rand(cos(this.emitConeAngle), 1), s = (1 - z * z) ** .5, a = rand(2 * PI);
        const direction = matrix.transformDirection(vec3(s * cos(a), z, s * sin(a))).normalize();

        this.particles.push({
            pos: matrix.transformPoint(offset),
            velocity: direction.scale(this.speed * random()),
            colorStart: randColor(this.colorStartA, this.colorStartB, true),
            colorEnd: randColor(this.colorEndA, this.colorEndB, true),
            sizeStart: this.sizeStart * random(),
            sizeEnd: this.sizeEnd * random(),
            life: this.particleTime * random(),
            age: 0 });
    }

    /** Draw the particles as billboards, soft dots, or ribbons along their trails; the emitter sorts as one draw, its particles are not sorted against each other */
    render3D()
    {
        if (render3D.transparentQueue)
            return render3D.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        const fade = this.fadeRate / 2;
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
                render3D.drawRibbon(trail, widths, colors, this.tileInfo);
            }
            else if (this.tileInfo || render3DSoftDot())
                render3D.drawBillboard(p.pos, vec2(size), this.tileInfo || render3DSoftDot(), color);
            else
                render3D.drawSoftDisc(p.pos, size, color, undefined, 8); // no canvas for the dot, headless
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Trail3D - A ribbon through where the object has been, thinning and fading with age
 * - Records its world position each frame it moves, so parent it to something that moves or set pos3D yourself
 * - Drawn unlit in the transparent stage, dies down on its own once the object stops
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const trail = new Trail3D(vec3(), 1, .3, undefined, rgb(1, .5, 0), rgb(1, 0, 0, 0), true);
 * ball.addChild(trail); // follows the ball
 */
class Trail3D extends EngineObject3D
{
    /** Create a trail
     *  @param {Vector3} [pos3D]
     *  @param {number} [lifeTime] - Seconds a sample lasts, the length of the trail in time
     *  @param {number} [width] - Width at the head, it thins to nothing at the tail
     *  @param {TileInfo} [tileInfo] - Texture stretched along the trail, undefined is untextured
     *  @param {Color} [color] - Color at the head
     *  @param {Color} [colorEnd] - Color at the tail
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), lifeTime=1, width=.2, tileInfo, color=WHITE, colorEnd=CLEAR_WHITE, additive=false)
    {
        super(pos3D, undefined, tileInfo, color);
        this.transparent = true;
        this.additive = additive;

        /** @property {number} - Seconds a sample lasts */
        this.lifeTime = lifeTime;
        /** @property {number} - Width at the head */
        this.width = width;
        /** @property {Color} - Color at the tail */
        this.colorEnd = colorEnd.copy();
        /** @property {Vector3|undefined} - Direction across the ribbon, recorded with each sample, undefined faces the camera */
        this.side = undefined;
        /** @property {Array<Object>} - Recorded samples, oldest first */
        this.samples = [];
    }

    /** Record the position when it moved and drop old samples, called automatically each frame */
    update()
    {
        const samples = this.samples, pos = this.getWorldPos3D();
        const last = samples[samples.length - 1];
        if (!last || pos.distanceSquared(last.pos) > 1e-8)
            samples.push({pos, side: this.side?.copy(), time});
        while (samples.length && time - samples[0].time > this.lifeTime)
            samples.shift();
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
        render3D.drawRibbon(points, widths, colors, this.tileInfo, sides);
    }
}

///////////////////////////////////////////////////////////////////////////////
// OBJ meshes

/**
 * Parse Wavefront OBJ text into a Mesh
 * - Reads v, vt, vn and f lines with convex polygons of any size, materials and groups are ignored
 * - Normals come from the file when every corner of a face has one, otherwise from the face
 * - Use mesh.center() and mesh.fit(size) to bring a model of unknown units to the origin
 * @param {string} text
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), parseOBJ(objText).center().fit(4));
 */
function parseOBJ(text, smooth=render3DSmoothShading)
{
    const positions = [], normals = [], uvs = [], mesh = new Mesh;
    let fileNormals = false;
    const lookup = (s, list)=> { const i = parseInt(s); return list[i < 0 ? list.length + i : i - 1]; }; // 1 based, negatives count from the end
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
                const corners = parts.slice(1).map(c => c.split('/'));
                if (corners.length < 3) break;
                const points = corners.map(c => lookup(c[0], positions));
                const uv = corners.map(c => c[1] ? lookup(c[1], uvs) : RENDER3D_DEFAULT_UV);
                const hasNormals = corners.every(c => c[2]);
                fileNormals ||= hasNormals;
                const n = hasNormals ? render3DPolygonStrip(corners.map(c => lookup(c[2], normals)))
                    : render3DFaceNormal(points[0], points[1], points[2], points[3] || points[0]);
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
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3DSmoothShading
 * @return {Promise<Mesh>}
 * @memberof Render3D
 * @example
 * const mesh = await loadOBJ('ship.obj'); // in an async gameInit
 */
async function loadOBJ(url, smooth=render3DSmoothShading)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadOBJ failed: ' + url);
    return parseOBJ(await response.text(), smooth);
}
