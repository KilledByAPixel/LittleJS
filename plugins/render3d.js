/**
 * LittleJS 3D Rendering Plugin
 * - Draws meshes, billboards and lines into the engine's WebGL canvas underneath the 2D layer
 * - One shader: directional + ambient light, optional specular, fog, textures, vertex colors
 * - Meshes are static triangle strips drawn by matrix, the stream batches immediate mode pushes
 * - Shape builders, height map terrain, a sky dome, billboards, soft discs, shadows and lines
 * - EngineObject3D is an EngineObject with a 3D transform and a mesh
 * - Requires the Math3D plugin, call new Render3DPlugin() in gameInit
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
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_QUAD_UVS = Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv)));
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(rgb(0, 0, 0, .5));
const RENDER3D_IDENTITY = new Matrix4; // never modified
const RENDER3D_MAX_POINT_LIGHTS = 8; // per frame, the shader loops over this many

// the Light3D objects the shader gets this frame, the first ones in the object list
function render3DCollectLights()
{
    const lights = [];
    for (const o of engineObjects)
        if (!o.destroyed && o instanceof Light3D && lights.length < RENDER3D_MAX_POINT_LIGHTS)
            lights.push(o);
    return lights;
}

// outward normal of a triangle or a quad given its corners in loop order,
// from the diagonals so a collapsed corner still works
function render3DFaceNormal(a, b, c, d=a)
{
    const n = c.subtract(a).cross(d.subtract(b));
    return n.lengthSquared() ? n.normalize() : RENDER3D_DEFAULT_NORMAL;
}

// 3D draws are only valid during the pass with a live shader
function render3DCanDraw()
{
    if (!render3D.shader) return false;
    ASSERT(render3D.isRendering, '3D draws are only valid during the 3D pass, use render3D.onRender or EngineObject3D.render3D');
    return render3D.isRendering;
}

/** Default shading for the shape builders, true for smooth vertex normals, false for flat faceted faces
 *  @type {boolean}
 *  @default
 *  @memberof Render3D */
let render3DSmoothShading = false;

/** Set the default shading for the shape builders, each builder can still be given its own smooth argument
 *  @param {boolean} smooth
 *  @memberof Render3D */
function setRender3DSmoothShading(smooth) { render3DSmoothShading = smooth; }

// the draw state a stream batch is drawn under; a push whose state differs flushes the
// pending batch first, so each batch draws under the state its own pushes shared.
// lights and fog are not captured, they are read live when the batch flushes
function render3DCaptureBatchState()
{
    const r = render3D;
    return {blend: r.blend, additive: r.additive, depthTest: r.depthTest, depthWrite: r.depthWrite,
        cullBackFaces: r.cullBackFaces, lighting: r.lighting, specular: r.specular};
}

// a key for a captured state, so a change flushes the pending batch first (specular in steps of 1/1024)
function render3DStateKey(s)
{
    return (s.blend ? 1 : 0) | (s.additive ? 2 : 0) | (s.depthTest ? 4 : 0) | (s.depthWrite ? 8 : 0)
        | (s.cullBackFaces ? 16 : 0) | (s.lighting ? 32 : 0) | (s.specular * 1024 | 0) << 6;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Render3D Plugin - The 3D renderer, camera, lights, fog and draw state
 * - State fields are read at each draw, so set them before drawing
 * - The 3D pass runs before gameRender, so 2D drawing lands on top
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
        /** @property {Vector3} - Direction the directional light travels, read when a draw is issued or the stream flushes, so set lights and fog before drawing */
        this.lightDirection = vec3(.5, -1, .3).normalize();
        /** @property {Color} - Directional light color */
        this.lightColor = WHITE.copy();
        /** @property {Color} - Ambient light color */
        this.ambientColor = rgb(.3, .3, .3);
        /** @property {Color} - Fog color, uses canvasClearColor when undefined, read when a draw is issued or the stream flushes, so set lights and fog before drawing */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;
        /** @property {boolean} - Apply lighting, when false draws plain vertex color times texture */
        this.lighting = true;
        /** @property {boolean} - Blend with the frame, the opaque stage sets this false and the transparent stage true */
        this.blend = false;
        /** @property {boolean} - Additive blending instead of alpha, only when blend is on */
        this.additive = false;
        /** @property {boolean} - Test against the depth buffer */
        this.depthTest = true;
        /** @property {boolean} - Write to the depth buffer */
        this.depthWrite = true;
        /** @property {boolean} - Skip faces that point away from the camera */
        this.cullBackFaces = false;
        /** @property {number} - Phong highlight strength for the next draws */
        this.specular = 0;
        /** @property {Function} - Called in the opaque stage after the opaque objects, for drawing world geometry outside of objects */
        this.onRender = undefined;
        /** @property {Function} - Called in the transparent stage, with blending on and depth writes off, for billboards, glows and shadows outside of objects; every transparent draw is sorted far to near before it lands, so alpha and additive mix correctly */
        this.onRenderTransparent = undefined;
        /** @property {boolean} - Draw the 3D pass after the 2D scene instead of before it, for 3D on top of a 2D game */
        this.renderAfter2D = false;
        /** @property {Mesh} - Sky dome from buildSky, drawn around the camera behind everything when set */
        this.sky = undefined;
        /** @property {boolean} - True while the 3D pass is running, 3D draws are only valid then, read only */
        this.isRendering = false;

        /** @property {Matrix4} - This frame's view matrix, read only */
        this.viewMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's projection matrix, read only */
        this.projectionMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's combined view projection, read only */
        this.viewProjection = new Matrix4;
        /** @property {Vector3} - Camera right axis this frame, read only */
        this.cameraRight = vec3(1, 0, 0);
        /** @property {Vector3} - Camera up axis this frame, read only */
        this.cameraUp = vec3(0, 1, 0);
        /** @property {Vector3} - Camera forward axis this frame, read only */
        this.cameraForward = vec3(0, 0, -1);

        // the shader, undefined when not available
        this.shader = undefined;
        // vertex array object
        this.vao = undefined;
        // 1x1 white texture used when no tile is given
        this.whiteTexture = undefined;
        // uploaded meshes, so context loss can drop their buffers
        this.uploadedMeshes = new Set;

        // cached shader locations, reset when the shader is rebuilt
        this.uniforms = {};
        this.attribs = undefined;

        this.streamBuffer = undefined;
        this.streamData = new ArrayBuffer(RENDER3D_MAX_STREAM_VERTS * RENDER3D_VERTEX_BYTES);
        this.streamFloats = new Float32Array(this.streamData);
        this.streamInts = new Uint32Array(this.streamData);
        this.streamCount = 0;
        this.streamTileInfo = undefined;
        this.streamState = undefined; // captured state the pending batch was pushed under
        this.streamStateKey = 0;
        this.capture = undefined;
        this.transparentQueue = undefined; // draws queued during the transparent stage, replayed far to near

        render3DInitGL();
        engineAddPlugin(undefined, render3DRender, render3DContextLost, render3DContextRestored, render3DPreRender);
    }

    /** Rebuild the view and projection matrices from the camera, called automatically each frame
     *  @param {number} [aspect] - Width over height, defaults to the main canvas */
    updateMatrices(aspect=mainCanvasSize.x/mainCanvasSize.y || 1)
    {
        const camera = this.camera;
        if (camera.align2D)
            camera.update2D();
        const cameraMatrix = camera.getMatrix();
        this.viewMatrix = cameraMatrix.copy().invert();
        this.projectionMatrix = camera.getProjectionMatrix(aspect);
        this.viewProjection = this.projectionMatrix.copy().multiply(this.viewMatrix);
        this.cameraRight = cameraMatrix.transformDirection(vec3(1, 0, 0));
        this.cameraUp = cameraMatrix.transformDirection(vec3(0, 1, 0));
        this.cameraForward = cameraMatrix.transformDirection(vec3(0, 0, -1));
    }

    /** Project a world point to clip space, x and y in -1 to 1, z is depth
     *  @param {Vector3} pos
     *  @return {Vector3|undefined} - undefined when behind the camera */
    worldToClip(pos)
    {
        const m = this.viewProjection.m;
        const w = m[3]*pos.x + m[7]*pos.y + m[11]*pos.z + m[15];
        if (w <= 0)
            return;
        return vec3(
            (m[0]*pos.x + m[4]*pos.y + m[8]*pos.z  + m[12]) / w,
            (m[1]*pos.x + m[5]*pos.y + m[9]*pos.z  + m[13]) / w,
            (m[2]*pos.x + m[6]*pos.y + m[10]*pos.z + m[14]) / w);
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

    /** Get the world space ray under a screen position, for picking with the raycast functions
     *  - uses the camera as it is now, so it is safe to call from gameUpdate after moving the camera
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size
     *  @return {{origin: Vector3, direction: Vector3}} - Ray start and unit direction, for the raycast functions */
    screenToRay(screenPos, canvasSize=mainCanvasSize)
    {
        this.updateMatrices();
        const clipX = screenPos.x / canvasSize.x * 2 - 1;
        const clipY = 1 - screenPos.y / canvasSize.y * 2;
        const tanHalf = tan(this.camera.fov / 2);
        const aspect = canvasSize.x / canvasSize.y || 1;
        const direction = this.cameraForward
            .add(this.cameraRight.scale(clipX * tanHalf * aspect))
            .add(this.cameraUp.scale(clipY * tanHalf)).normalize();
        return {origin: this.camera.pos.copy(), direction};
    }

    /** Draw a mesh with the current state, flushes the stream first so draw order holds
     *  @param {Mesh} mesh
     *  @param {Matrix4} [matrix] - Object transform
     *  @param {Color} [color] - Tint
     *  @param {TileInfo} [tileInfo] - Texture, mesh uvs map across the tile */
    drawMesh(mesh, matrix=RENDER3D_IDENTITY, color=WHITE, tileInfo)
    {
        if (this.transparentQueue)
            return this.queueTransparent(matrix.getTranslation(), ()=> this.drawMesh(mesh, matrix, color, tileInfo));
        if (!render3DCanDraw()) return;
        this.flush();
        if (!mesh.buffer || mesh.dirty)
            mesh.upload();
        if (!mesh.bufferCount) return;

        const gl = glContext;
        gl.uniformMatrix4fv(render3DUniform('model'), false, matrix.m);
        gl.uniformMatrix4fv(render3DUniform('normalMat'), false, matrix.copy().invert().transpose().m);
        render3DApplyState(tileInfo, color);
        render3DBindVertexBuffer(mesh.buffer);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, mesh.bufferCount);
        ++drawCount;
        primitiveCount += mesh.bufferCount;
    }

    /** Push a strip into the stream, into the mesh being baked, or onto the transparent queue during that stage
     *  - the first three points wound counter clockwise from outside are a front face
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, 0-1 across the tile
     *  @param {Color|Array<Color>} [colors] - One for all or one per point
     *  @param {TileInfo} [tileInfo] - Texture for this strip */
    pushStrip(points, normals, uvs, colors, tileInfo)
    {
        if (this.capture)
        {
            this.capture.addStrip(points, normals, uvs, colors);
            return;
        }
        ASSERT(points.length + 3 <= RENDER3D_MAX_STREAM_VERTS, 'strip is too large for the stream, bake it into a mesh');
        if (this.transparentQueue)
        {
            // sort by the center of the strip
            let center = vec3();
            for (const p of points)
                center = center.add(p);
            return this.queueTransparent(center.scale(1 / points.length), ()=> this.pushStrip(points, normals, uvs, colors, tileInfo));
        }
        if (!render3DCanDraw()) return;

        // flush when the texture or state differs from the pending batch, or it would overflow
        const state = render3DCaptureBatchState(), stateKey = render3DStateKey(state);
        const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
        const needed = points.length + 3;
        if (this.streamCount && (textureInfo !== this.streamTileInfo || stateKey !== this.streamStateKey
            || this.streamCount + needed > RENDER3D_MAX_STREAM_VERTS))
            this.flush();
        this.streamTileInfo = textureInfo;
        this.streamState = state;
        this.streamStateKey = stateKey;

        const uvRect = render3DGetTileUVs(tileInfo);
        const floats = this.streamFloats, ints = this.streamInts;
        render3DForEachStripVertex(points, normals, uvs, colors, (p, n, uv, c)=>
        {
            const j = this.streamCount++ * RENDER3D_VERTEX_FLOATS;
            floats[j]   = p.x; floats[j+1] = p.y; floats[j+2] = p.z;
            floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
            floats[j+6] = uvRect.x + uv.x * uvRect.w;
            floats[j+7] = uvRect.y + uv.y * uvRect.h;
            ints[j+8] = c.rgbaInt();
        });
    }

    /** Draw the pending stream vertices as one strip with the state they were pushed under, called automatically when needed */
    flush()
    {
        if (!this.streamCount || !render3DCanDraw()) return;
        const gl = glContext;
        gl.uniformMatrix4fv(render3DUniform('model'), false, RENDER3D_IDENTITY.m);
        gl.uniformMatrix4fv(render3DUniform('normalMat'), false, RENDER3D_IDENTITY.m);
        // the tile rect was applied to each uv at push time, so the whole texture maps here
        render3DApplyState(this.streamTileInfo, WHITE, RENDER3D_FULL_UV_RECT, this.streamState);
        render3DBindVertexBuffer(this.streamBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.streamFloats, 0, this.streamCount * RENDER3D_VERTEX_FLOATS);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.streamCount);
        ++drawCount;
        primitiveCount += this.streamCount;
        this.streamCount = 0;
    }

    /** Run a draw function with every push captured into a new mesh instead of the stream
     *  - pushes inside a bake ignore their tileInfo, the baked mesh takes its texture at render time
     *  - drawMesh is not captured: inside the pass it draws immediately, outside it does nothing
     *  @param {Function} drawFunction
     *  @return {Mesh} */
    bake(drawFunction)
    {
        this.flush();
        ASSERT(!this.capture, 'bake cannot be nested');
        this.capture = new Mesh;
        const mesh = this.capture;
        try { drawFunction(); }
        finally { this.capture = undefined; }
        return mesh;
    }

    /** Run the opaque and transparent stages over every EngineObject3D, called automatically by the 3D pass */
    renderStages()
    {
        const opaque = [], transparent = [];
        for (const o of engineObjects)
            if (!o.destroyed && o instanceof EngineObject3D)
                (o.transparent ? transparent : opaque).push(o);

        // sky first, behind everything
        this.sky && this.drawSky(this.sky);

        // opaque: no blending, depth writes on, by render order
        this.blend = this.additive = false;
        this.depthTest = this.depthWrite = true;
        opaque.sort((a, b)=> a.renderOrder - b.renderOrder);
        for (const o of opaque)
            o.render3D();
        this.onRender?.();

        // transparent: blending on, depth writes off, every draw queued then replayed far to near
        this.flush();
        this.blend = true;
        this.additive = false;
        this.depthTest = true;
        this.depthWrite = false;
        this.transparentQueue = [];
        try
        {
            for (const o of transparent)
                o.render3D();
            this.onRenderTransparent?.();
        }
        finally { this.flushTransparentQueue(); }
        this.flush();

        // leave the fields honest for anything reading them outside the pass
        this.blend = false;
        this.depthWrite = true;
    }

    /** Queue a draw for the transparent stage, replayed far to near with the current draw state
     *  @param {Vector3} pos - Where the draw is, for sorting
     *  @param {Function} draw */
    queueTransparent(pos, draw)
    {
        this.transparentQueue.push({distance: pos.distanceSquared(this.camera.pos), state: render3DCaptureBatchState(), draw});
    }

    /** Draw the queued transparent draws far to near with the state each was pushed under, called automatically at the end of the transparent stage */
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
        finally { Object.assign(this, state); } // the last item's state must not leak into the next frame
    }

    /** Build a sky dome, set it as the sky and match the fog color to the horizon
     *  @param {Color} [topColor]
     *  @param {Color} [horizonColor]
     *  @param {Color} [bottomColor] - Defaults to the horizon color
     *  @return {Mesh} - The dome, also in render3D.sky */
    setSky(topColor, horizonColor, bottomColor)
    {
        this.sky?.dispose();
        this.sky = buildSky(topColor, horizonColor, bottomColor);
        this.fogColor = horizonColor ? horizonColor.copy() : undefined;
        return this.sky;
    }

    /** Draw a sky dome around the camera, unlit, unfogged and behind everything, called automatically when render3D.sky is set
     *  @param {Mesh} mesh - From buildSky */
    drawSky(mesh)
    {
        const state = render3DCaptureBatchState(), fogEnd = this.fogEnd;
        this.lighting = this.blend = this.depthTest = this.depthWrite = false;
        this.fogEnd = 0;
        const radius = (this.camera.near + this.camera.far) / 2;
        try { mesh.render(buildMatrix(this.camera.pos, undefined, vec3(radius))); }
        finally
        {
            this.fogEnd = fogEnd;
            Object.assign(this, state);
        }
    }

    /** Push a strip with lighting off, for camera facing shapes where the light direction means nothing
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals]
     *  @param {Vector2|Array<Vector2>} [uvs]
     *  @param {Color|Array<Color>} [colors]
     *  @param {TileInfo} [tileInfo] */
    pushStripUnlit(points, normals, uvs, colors, tileInfo)
    {
        const lighting = this.lighting;
        this.lighting = false;
        try { this.pushStrip(points, normals, uvs, colors, tileInfo); }
        finally { this.lighting = lighting; }
    }

    /** Draw a camera facing quad, unlit so it keeps its own colors; draw it in the transparent stage for alpha
     *  @param {Vector3} pos - Center
     *  @param {Vector2} size - World units
     *  @param {TileInfo} [tileInfo]
     *  @param {Color} [color]
     *  @param {number} [angle] - Rotation in the camera plane, counter clockwise */
    drawBillboard(pos, size, tileInfo, color=WHITE, angle=0)
    {
        const c = cos(angle), s = sin(angle);
        const right = this.cameraRight.scale(c).add(this.cameraUp.scale(s)).scale(size.x / 2);
        const up = this.cameraUp.scale(c).subtract(this.cameraRight.scale(s)).scale(size.y / 2);
        this.pushStripUnlit(
            [pos.subtract(right).add(up), pos.subtract(right).subtract(up), pos.add(right).add(up), pos.add(right).subtract(up)],
            this.cameraForward.scale(-1),
            RENDER3D_QUAD_UVS, color, tileInfo);
    }

    /** Draw a quad from four corners in loop order, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {Color} [color]
     *  @param {TileInfo} [tileInfo] */
    drawQuad(a, b, c, d, color=WHITE, tileInfo)
    {
        this.pushStrip([a, b, d, c], render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS, color, tileInfo);
    }

    /** Draw a triangle, counter clockwise from outside is the front
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Color} [color] */
    drawTriangle(a, b, c, color=WHITE)
    {
        this.pushStrip([a, b, c], render3DFaceNormal(a, b, c), undefined, color);
    }

    /** Draw a line as a camera facing ribbon, unlit
     *  @param {Vector3} start
     *  @param {Vector3} end
     *  @param {number} [thickness] - World units
     *  @param {Color} [color] */
    drawLine(start, end, thickness=.1, color=WHITE)
    {
        const side = end.subtract(start).cross(this.cameraForward).normalize(thickness / 2);
        this.pushStripUnlit(
            [start.add(side), start.subtract(side), end.add(side), end.subtract(side)],
            this.cameraForward.scale(-1), undefined, color);
    }

    /** Draw a soft round shadow on the ground under a position, unlit; draw it in the transparent stage
     *  @param {Vector3} pos - Position of the thing casting the shadow
     *  @param {number} radius
     *  @param {number|Function} [floorHeight] - Height of the ground, or (x, z) => y so the shadow follows terrain
     *  @param {Color} [color]
     *  @param {number} [lift] - How far above the ground to draw, raise it if the shadow cuts into rough ground */
    drawShadow(pos, radius, floorHeight=0, color=RENDER3D_SHADOW_COLOR, lift=.02)
    {
        const height = isNumber(floorHeight) ? ()=> floorHeight : floorHeight;
        render3DPushSoftDisc(this, radius, color, 16, RENDER3D_DEFAULT_NORMAL, (dir, r)=>
        {
            const x = pos.x + dir.x * r, z = pos.z + dir.y * r;
            return vec3(x, height(x, z) + lift, z);
        });
    }

    /** Draw a disc that fades to transparent at the rim, unlit, for glows, puffs, shadows and sky dots
     *  @param {Vector3} pos - Center
     *  @param {number} radius
     *  @param {Color} [color]
     *  @param {Vector3} [normal] - Facing direction, faces the camera by default
     *  @param {number} [sides] */
    drawSoftDisc(pos, radius, color=WHITE, normal=this.cameraForward.scale(-1), sides=16)
    {
        // basis in the disc's plane
        const n = normal.normalize();
        const helper = abs(n.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
        const u = helper.cross(n).normalize(), w = u.cross(n);
        render3DPushSoftDisc(this, radius, color, sides, n, (dir, r)=> pos.add(u.scale(dir.x * r)).add(w.scale(dir.y * r)));
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
        /** @property {number} - Far clip distance */
        this.far = 1e3;
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
    getProjectionMatrix(aspect) { return Matrix4.perspective(this.fov, aspect, this.near, this.far); }

    /** Returns the direction the camera looks
     *  @return {Vector3} */
    forward() { return Matrix4.rotation(this.rotation).transformDirection(vec3(0, 0, -1)); }

    /** Returns the camera's right axis
     *  @return {Vector3} */
    right() { return Matrix4.rotation(this.rotation).transformDirection(vec3(1, 0, 0)); }

    /** Returns the camera's up axis
     *  @return {Vector3} */
    up() { return Matrix4.rotation(this.rotation).transformDirection(vec3(0, 1, 0)); }

    /** Point the camera at a target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target)
    {
        const d = target.subtract(this.pos).normalize();
        this.rotation = vec3(Math.asin(clamp(d.y, -1, 1)), atan2(-d.x, -d.z), 0);
    }

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

    /** Park the camera so the z=0 plane matches LittleJS 2D world space, called automatically when align2D is set
     *  @param {number} [canvasHeight] - Defaults to the main canvas height */
    update2D(canvasHeight=mainCanvasSize.y)
    {
        const halfHeight = canvasHeight / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.fov/2);
        this.pos = vec3(cameraPos.x, cameraPos.y, distance);
        this.rotation = vec3(0, 0, -cameraAngle); // littlejs 2D angles are clockwise
    }
}

///////////////////////////////////////////////////////////////////////////////
// GL setup and the frame hooks, module level because they are not public API

function render3DInitGL()
{
    if (headlessMode) return;
    if (!glEnable || !glContext)
    {
        console.warn('Render3DPlugin: WebGL not enabled, construct the plugin in gameInit with glEnable set');
        return;
    }

    // cached locations belong to the shader built below
    render3D.uniforms = {};
    render3D.attribs = undefined;

    // the shader
    // attributes: p position, n normal, t uv, c color
    // vertex uniforms: viewProj, model, normalMat (inverse transpose of model)
    // fragment uniforms: tint, lightDir (xyz, w = lighting on), lightColor (rgb, a = specular),
    //   ambientColor (rgb, a = fogEnd), fogColor (rgb, a = fogStart), cameraPos, uvRect, tex
    render3D.shader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj,model,normalMat;' +
        'uniform vec4 uvRect;' +
        'in vec3 p,n;in vec2 t;in vec4 c;' +
        'out vec3 P,N;out vec2 T;out vec4 C;' +
        'void main(){' +
        'vec4 w=model*vec4(p,1.);' +
        'gl_Position=viewProj*w;' +
        'P=w.xyz;' +
        'N=mat3(normalMat)*n;' +
        'T=uvRect.xy+t*uvRect.zw;' +
        'C=c;' +
        '}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform vec4 tint,lightDir,lightColor,ambientColor,fogColor;' +
        'uniform vec4 pointLights[' + RENDER3D_MAX_POINT_LIGHTS + '],pointLightColors[' + RENDER3D_MAX_POINT_LIGHTS + '];' +
        'uniform int pointLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
        'in vec3 P,N;in vec2 T;in vec4 C;' +
        'out vec4 o;' +
        'void main(){' +
        'vec4 c=C*tint*texture(tex,T);' +
        'if(lightDir.w>0.){' +
        'vec3 n=normalize(N);' +
        'float nl=dot(n,-lightDir.xyz);' +
        'float d=max(nl,0.);' +
        'vec3 e=normalize(cameraPos-P);' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'vec3 l=ambientColor.rgb+lightColor.rgb*d;' +
        // point lights: linear falloff squared, diffuse only
        'for(int i=0;i<' + RENDER3D_MAX_POINT_LIGHTS + ';++i){' +
        'if(i>=pointLightCount)break;' +
        'vec3 v=pointLights[i].xyz-P;' +
        'float a=max(0.,1.-length(v)/pointLights[i].w);' +
        'l+=pointLightColors[i].rgb*pointLightColors[i].a*a*a*max(0.,dot(n,normalize(v)));' +
        '}' +
        'c.rgb*=l;' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,e),0.),16.)*lightColor.a*step(0.,nl);' +
        '}' +
        'if(ambientColor.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,fogColor.rgb,smoothstep(fogColor.a,ambientColor.a,z));' +
        '}' +
        'o=c;' +
        '}'
    );

    // the vertex array object, attribute pointers are set per buffer by render3DBindVertexBuffer
    render3D.vao = glContext.createVertexArray();

    // the stream buffer
    render3D.streamBuffer = glContext.createBuffer();
    glContext.bindVertexArray(render3D.vao);
    glContext.bindBuffer(glContext.ARRAY_BUFFER, render3D.streamBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, render3D.streamData.byteLength, glContext.DYNAMIC_DRAW);
    render3D.streamCount = 0;

    // white texture for untextured draws
    render3D.whiteTexture = glCreateTexture();

    // leave the engine's array buffer bound, its 2D batch writes through this binding
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
}

// a uniform location, looked up once per shader
function render3DUniform(name)
{
    const u = render3D.uniforms;
    return u[name] ??= glContext.getUniformLocation(render3D.shader, name);
}

// bind a vertex buffer and point the four attributes at its 36 byte vertices
function render3DBindVertexBuffer(buffer)
{
    const gl = glContext, r = render3D;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // name, size, type, normalize, byte offset
    r.attribs ||= [
        ['p', 3, gl.FLOAT, false, 0],
        ['n', 3, gl.FLOAT, false, 12],
        ['t', 2, gl.FLOAT, false, 24],
        ['c', 4, gl.UNSIGNED_BYTE, true, 32],
    ].map(([name, ...rest])=> [gl.getAttribLocation(r.shader, name), ...rest]);
    for (const [location, size, type, normalize, offset] of r.attribs)
    {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, type, normalize, RENDER3D_VERTEX_BYTES, offset);
    }
}

// uv rect of a tile in texture space with bleed, or the whole texture
function render3DGetTileUVs(tileInfo)
{
    if (!tileInfo || !(tileInfo instanceof TileInfo))
        return RENDER3D_FULL_UV_RECT;
    const textureInfo = tileInfo.textureInfo;
    const inv = textureInfo.sizeInverse;
    const bleedX = inv.x * tileInfo.bleed, bleedY = inv.y * tileInfo.bleed;
    return {
        x: tileInfo.pos.x * inv.x + bleedX,
        y: tileInfo.pos.y * inv.y + bleedY,
        w: tileInfo.size.x * inv.x - 2*bleedX,
        h: tileInfo.size.y * inv.y - 2*bleedY };
}

// apply draw state and the per draw uniforms before a draw call
// tileInfo may be a TileInfo, a TextureInfo, or undefined for the white texture
// state is the plugin's current fields, or the captured state of a stream batch
function render3DApplyState(tileInfo, tint=WHITE, uvRect, state=render3D)
{
    const gl = glContext, r = render3D, uniform = render3DUniform;

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

    // texture
    let texture = r.whiteTexture;
    if (tileInfo instanceof TileInfo)
        texture = tileInfo.textureInfo.glTexture || texture;
    else if (tileInfo instanceof TextureInfo)
        texture = tileInfo.glTexture || texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniform('tex'), 0);
    uvRect ||= render3DGetTileUVs(tileInfo);
    gl.uniform4f(uniform('uvRect'), uvRect.x, uvRect.y, uvRect.w, uvRect.h);

    // per draw uniforms, lights and fog are scene state read from the plugin at draw time
    gl.uniform4f(uniform('tint'), tint.r, tint.g, tint.b, tint.a);
    const l = r.lightDirection, lc = r.lightColor, ac = r.ambientColor, fc = r.fogColor || canvasClearColor;
    gl.uniform4f(uniform('lightDir'), l.x, l.y, l.z, state.lighting ? 1 : 0);
    gl.uniform4f(uniform('lightColor'), lc.r, lc.g, lc.b, state.specular);
    ASSERT(!r.fogEnd || r.fogStart < r.fogEnd, 'fogStart must be less than fogEnd');
    gl.uniform4f(uniform('ambientColor'), ac.r, ac.g, ac.b, r.fogEnd);
    gl.uniform4f(uniform('fogColor'), fc.r, fc.g, fc.b, r.fogStart);
}

// the 3D pass, runs from the preRender hook before gameRender
function render3DPreRender()
{
    const r = render3D;
    r.updateMatrices();
    r.renderAfter2D || render3DRenderPass();
}

// the plugin render hook, after gameRenderPost: the 3D pass lands on top of the 2D scene when asked
function render3DRender()
{
    const r = render3D;
    if (!r.renderAfter2D) return;
    glFlush(); // the 2D sprites drawn so far go under the 3D
    render3DRenderPass();
}

// the 3D pass itself: take over the gl state, draw the stages, hand the state back
function render3DRenderPass()
{
    const gl = glContext, r = render3D;
    if (!r.shader) return; // headless, gl disabled, or context lost

    // take over the gl state
    gl.useProgram(r.shader);
    gl.bindVertexArray(r.vao);
    // strips get one leading repeat, which shifts real triangles to odd indices, so front faces read as clockwise
    gl.frontFace(gl.CW);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(render3DUniform('viewProj'), false, r.viewProjection.m);
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);

    // point lights: the first few Light3D objects
    const lights = render3DCollectLights();
    gl.uniform1i(render3DUniform('pointLightCount'), lights.length);
    if (lights.length)
    {
        const positions = new Float32Array(lights.length * 4), colors = new Float32Array(lights.length * 4);
        lights.forEach((light, i)=>
        {
            const p = light.getMatrix().getTranslation();
            positions.set([p.x, p.y, p.z, light.radius], i * 4);
            colors.set([light.color.r, light.color.g, light.color.b, light.color.a], i * 4);
        });
        gl.uniform4fv(render3DUniform('pointLights'), positions);
        gl.uniform4fv(render3DUniform('pointLightColors'), colors);
    }

    r.isRendering = true;
    r.renderStages();
    r.isRendering = false;

    // hand the state back to the engine's 2D batching
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    if (glActiveTexture)
        gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
    // ARRAY_BUFFER is not part of VAO state in WebGL2, so bindVertexArray above did not restore it
    gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
    glSetInstancedMode(true);
}

function render3DContextLost()
{
    const r = render3D;
    r.shader = r.vao = r.streamBuffer = r.whiteTexture = r.attribs = undefined;
    r.uniforms = {};
    r.streamCount = 0;
    for (const mesh of r.uploadedMeshes)
        mesh.buffer = undefined;
    r.uploadedMeshes.clear();
}

function render3DContextRestored()
{
    render3DInitGL();
}

///////////////////////////////////////////////////////////////////////////////
// Strips: every strip gets a leading repeat of its first vertex and a trailing
// repeat of its last, which joins it to its neighbours with degenerate
// triangles, plus one more trailing repeat when the count is odd so winding
// parity holds across a whole mesh or batch

// walk a strip's vertices with the repeats applied, calling back with (point, normal, uv, color)
// normals, uvs and colors may be one value for all points, an array per point, or undefined
function render3DForEachStripVertex(points, normals, uvs, colors, callback)
{
    ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
    const pick = (a, i, d)=> a === undefined ? d : isArray(a) ? a[i] : a;
    const emit = (i)=> callback(points[i], pick(normals, i, RENDER3D_DEFAULT_NORMAL), pick(uvs, i, RENDER3D_DEFAULT_UV), pick(colors, i, WHITE));
    const n = points.length, last = n - 1;
    emit(0);
    for (let i = 0; i < n; ++i)
        emit(i);
    emit(last);
    if (n & 1)
        emit(last);
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
 * - Build with addStrip, combine or the shape builders, then render each frame
 * - The GPU buffer is created lazily on first render and dropped by dispose
 * @memberof Render3D
 * @example
 * const mesh = buildLathe([[0, -1], [1, 0], [0, 1]], 4); // octahedron
 * mesh.render(buildMatrix(vec3(0, 1, 0)), RED);
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
        /** @property {WebGLBuffer} - GPU buffer, created by upload */
        this.buffer = undefined;
        /** @property {number} - Vertices in the GPU buffer */
        this.bufferCount = 0;
        /** @property {boolean} - The CPU data changed since the last upload, set by addStrip, combine and computeNormals, or set it after editing the arrays directly */
        this.dirty = false;
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

    /** Append another mesh transformed by a matrix, for welding a static world together
     *  @param {Mesh} mesh
     *  @param {Matrix4} [matrix]
     *  @param {Color} [color] - Multiplies the appended vertex colors
     *  @return {Mesh} */
    combine(mesh, matrix=new Matrix4, color=WHITE)
    {
        const normalMatrix = matrix.copy().invert().transpose();
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
            let normal = b.subtract(a).cross(c.subtract(a));
            if (!normal.lengthSquared())
            {
                faceNormals.push(undefined); // degenerate join
                continue;
            }
            // real triangles sit at odd strip indices, see render3DForEachStripVertex
            faceNormals.push(normal.normalize(i & 1 ? 1 : -1));
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
                if (!f) continue;
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
        if (!render3D?.shader) return this;
        this.dispose();
        const count = this.points.length;
        const data = new ArrayBuffer(count * RENDER3D_VERTEX_BYTES);
        const floats = new Float32Array(data), ints = new Uint32Array(data);
        for (let i = 0; i < count; ++i)
        {
            const j = i * RENDER3D_VERTEX_FLOATS;
            const p = this.points[i], n = this.normals[i], uv = this.uvs[i];
            floats[j]   = p.x; floats[j+1] = p.y; floats[j+2] = p.z;
            floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
            floats[j+6] = uv.x; floats[j+7] = uv.y;
            ints[j+8] = this.colors[i].rgbaInt();
        }
        this.buffer = glContext.createBuffer();
        this.bufferCount = count;
        this.dirty = false;
        glContext.bindBuffer(glContext.ARRAY_BUFFER, this.buffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, data, glContext.STATIC_DRAW);
        render3D.uploadedMeshes.add(this);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
    }

    /** Draw the mesh, one draw call with the current render3D state
     *  @param {Matrix4} [matrix] - Object transform
     *  @param {Color} [color] - Tint
     *  @param {TileInfo} [tileInfo] - Texture, mesh uvs map across the tile */
    render(matrix, color, tileInfo) { render3D?.drawMesh(this, matrix, color, tileInfo); }

    /** Delete the GPU buffer, the CPU arrays stay so the mesh can be rendered again */
    dispose()
    {
        if (!this.buffer) return;
        glContext?.deleteBuffer(this.buffer);
        this.buffer = undefined;
        this.bufferCount = 0;
        render3D?.uploadedMeshes.delete(this);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Shape builders, all centered on the origin so buildMatrix does placement

/**
 * Build a surface of revolution about the Y axis
 * - profile is [[radius, y], ...] from bottom to top
 * - [[r,-h],[r,h]] is a cylinder, [[0,-1],[1,0],[0,1]] with 4 sides is an octahedron
 * - capped closes each end that has a radius with a flat disc, so a cylinder or a cone is solid
 * @param {Array<Array<number>>} profile
 * @param {number} [sides] - Segments around the axis
 * @param {boolean} [smooth] - Vertex normals and shared vertices, otherwise one normal per face, defaults to render3DSmoothShading
 * @param {boolean} [capped] - Close the ends with flat discs
 * @return {Mesh}
 * @memberof Render3D
 */
function buildLathe(profile, sides=8, smooth=render3DSmoothShading, capped=false)
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
    // vertex normal: average of the adjacent segment normals
    const vertexNormal = (i)=>
    {
        let n = vec2();
        if (i > 0) n = n.add(segmentNormal(i - 1));
        if (i < rings - 1) n = n.add(segmentNormal(i));
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
    if (capped)
        for (const [i, up] of [[0, false], [rings - 1, true]])
        {
            if (!profile[i][0]) continue;
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
 * Build a cylinder standing on the Y axis, centered on the origin, capped by default
 * @param {number} [radius]
 * @param {number} [height]
 * @param {number} [sides]
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @param {boolean} [capped]
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(radius=.5, height=1, sides=12, smooth=render3DSmoothShading, capped=true)
{
    return buildLathe([[radius, -height / 2], [radius, height / 2]], sides, smooth, capped);
}

/**
 * Build a sphere of diameter 1
 * @param {number} [segments] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(segments=12, rings=6, smooth=render3DSmoothShading)
{
    ASSERT(rings > 1, 'sphere needs at least 2 rings');
    const profile = [];
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI - PI/2;
        profile.push([cos(a) * .5, sin(a) * .5]);
    }
    return buildLathe(profile, segments, smooth);
}

/**
 * Build a box centered on the origin, six flat faces with uvs covering each face
 * @param {Vector3} [size]
 * @return {Mesh}
 * @memberof Render3D
 */
function buildBox(size=vec3(1))
{
    const mesh = new Mesh;
    const half = size.scale(.5);
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
        mesh.addStrip(
            [center.subtract(right).add(up), center.subtract(right).subtract(up),
             center.add(right).add(up), center.add(right).subtract(up)],
            n,
            [vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)]);
    }
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth is one ribbon strip per row with slope normals and a color per vertex
 * - flat is one strip per cell with a face normal and one color sampled at the cell center, so checkerboards stay crisp
 * @param {number} sizeX
 * @param {number} sizeZ
 * @param {number} [segmentsX]
 * @param {number} [segmentsZ]
 * @param {Color|Function} [color] - A Color for the whole grid or (x, z) => Color, default white
 * @param {Function} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildGrid(sizeX, sizeZ, segmentsX=1, segmentsZ=1, color, heightFunction=()=>0, smooth=render3DSmoothShading)
{
    ASSERT(segmentsX > 0 && segmentsZ > 0, 'grid needs at least one segment per axis');
    const mesh = new Mesh;
    const cellX = sizeX / segmentsX, cellZ = sizeZ / segmentsZ;
    const px = (i)=> i * cellX - sizeX / 2, pz = (j)=> j * cellZ - sizeZ / 2;
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
            {
                const a = point(i, j), b = point(i, j + 1), c = point(i + 1, j + 1), d = point(i + 1, j);
                mesh.addStrip([a, b, d, c], render3DFaceNormal(a, b, c, d),
                    [uv(i, j), uv(i, j + 1), uv(i + 1, j), uv(i + 1, j + 1)], cellColor(i + .5, j + .5));
            }
        }
    }
    return mesh;
}

/**
 * Build a loft: diamond cross sections swept along Z, quads between them, capped both ends
 * - station = [z, halfWidth, top, bottom, sideHeight] with sideHeight 0-1 placing the side points between bottom and top (default .5)
 * - stations are ordered nose first, nose at the largest z
 * @param {Array<Array<number>>} stations
 * @return {Mesh}
 * @memberof Render3D
 */
function buildLoft(stations)
{
    ASSERT(isArray(stations) && stations.length > 1, 'loft needs at least 2 stations');
    const mesh = new Mesh;
    // section points: left, top, right, bottom, wound clockwise seen from +z
    const section = ([z, w, t, b, m=.5])=>
        [vec3(-w, lerp(b, t, m), z), vec3(0, t, z), vec3(w, lerp(b, t, m), z), vec3(0, b, z)];
    // quad a,b,c,d in loop order with the diagonal cross as its normal, which survives a collapsed corner
    const quad = (a, b, c, d)=>
    {
        mesh.addStrip([a, b, d, c], render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS);
    };
    for (let i = 0; i + 1 < stations.length; ++i)
    {
        const s1 = section(stations[i]), s2 = section(stations[i + 1]);
        for (let k = 0; k < 4; ++k)
            quad(s1[k], s1[(k + 1) % 4], s2[(k + 1) % 4], s2[k]);
    }
    const tail = section(stations[stations.length - 1]), nose = section(stations[0]);
    quad(tail[0], tail[1], tail[2], tail[3]);
    quad(nose[3], nose[2], nose[1], nose[0]);
    return mesh;
}

/**
 * Build a sky dome: a sphere colored by height, wound to be seen from inside
 * - set it as render3D.sky and the pass draws it around the camera behind everything
 * @param {Color} [topColor]
 * @param {Color} [horizonColor]
 * @param {Color} [bottomColor] - Defaults to the horizon color
 * @param {number} [segments] - Around
 * @param {number} [rings] - Top to bottom
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSky(topColor=rgb(.2, .4, .9), horizonColor=rgb(.8, .9, 1), bottomColor=horizonColor, segments=16, rings=8)
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
        for (let j = 0; j <= segments; ++j)
        {
            const a = j / segments * 2 * PI;
            points.push(point(i, a), point(i + 1, a));
            colors.push(color(i), color(i + 1));
        }
        mesh.addStrip(points, undefined, undefined, colors);
    }
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * HeightMap - Terrain from a grid of heights, with a mesh builder and height lookup
 * - heights is a 2D array [row][column] of 0-1 values, rows run along Z and columns along X
 * - or an image, where the red channel is the height and row 0 is the far edge (-Z)
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
        /** @property {Array<Array<Color>>} - Vertex colors as [row][column], undefined for white */
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
        // each cell is two triangles split from (i, j) to (i+1, j+1), the same split buildGrid uses
        const a = h[j][i], b = h[j+1][i], c = h[j+1][i+1], d = h[j][i+1];
        const height = fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
        return height * this.height;
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

    /** Build the terrain mesh, one vertex per sample, centered on the origin
     *  @param {boolean} [smooth] - Defaults to render3DSmoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3DSmoothShading)
    {
        return buildGrid(this.size.x, this.size.y, this.columns - 1, this.rows - 1,
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

///////////////////////////////////////////////////////////////////////////////
/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Inherits update, children, timers, destroy and renderOrder from EngineObject, children that are EngineObject3D follow the parent's 3D transform
 * - velocity3D is added to pos3D each frame, there is no other 3D physics, games do their own
 * - The 2D pos, velocity and physics still run but rendering ignores them, copy pos into pos3D for pseudo-3D games
 * - render() is empty, override render3D() for custom drawing
 * @extends EngineObject
 * @memberof Render3D
 * @example
 * class Spinner extends EngineObject3D
 * {
 *     constructor(pos) { super(pos, buildBox(), RED); }
 *     update() { this.rotation3D.y += .02; }
 * }
 */
class EngineObject3D extends EngineObject
{
    /** Create a 3D object and add it to the object list
     *  @param {Vector3} [pos3D] - World space position
     *  @param {Mesh} [mesh] - Mesh to draw, undefined draws nothing
     *  @param {Color} [color] - Tint
     *  @param {TileInfo} [tileInfo] - Texture, mesh uvs map across the tile */
    constructor(pos3D=vec3(), mesh, color=WHITE, tileInfo)
    {
        super(vec2(), vec2(), tileInfo, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');

        /** @property {Vector3} - World space position, local to the parent when attached to an EngineObject3D */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians, local to the parent when attached to an EngineObject3D */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale, local to the parent when attached to an EngineObject3D */
        this.scale3D = vec3(1);
        /** @property {Vector3} - Added to pos3D each frame */
        this.velocity3D = vec3();
        /** @property {Mesh} - Mesh to draw */
        this.mesh = mesh;
        /** @property {boolean} - Draw in the transparent stage, sorted far to near with depth writes off */
        this.transparent = false;
    }

    /** Apply the 3D velocity, then the inherited 2D physics, called automatically each frame */
    updatePhysics()
    {
        this.pos3D = this.pos3D.add(this.velocity3D);
        super.updatePhysics();
    }

    /** Returns the object's world transform, relative to the parent's when attached to an EngineObject3D
     *  @return {Matrix4} */
    getMatrix()
    {
        const matrix = buildMatrix(this.pos3D, this.rotation3D, this.scale3D);
        return this.parent instanceof EngineObject3D ? this.parent.getMatrix().multiply(matrix) : matrix;
    }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass, draws the mesh by default */
    render3D()
    {
        if (this.mesh)
            render3D.drawMesh(this.mesh, this.getMatrix(), this.color, this.tileInfo);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A point light that lights nearby surfaces, an EngineObject3D so it can move or follow a parent
 * - The first 8 in the object list light the frame, radius is where the light reaches zero
 * - Draws nothing itself, add a glow with drawSoftDisc or a small emissive mesh if it should be seen
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
        super(pos3D, undefined, color);
        /** @property {number} - Distance where the light fades to nothing */
        this.radius = radius;
    }

    /** Lights draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Particles are billboards, or soft round discs when there is no tile, drawn in the transparent stage so alpha and additive sort correctly
 * - Emits along the emitter's local +Y, turned by rotation3D, spread by emitCone
 * - Speeds are per frame like the 2D emitter, gravity is a per frame change to velocity y
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
     *  @param {number} [emitCone] - Half angle around the emit direction, PI is every direction
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
    constructor(pos3D=vec3(), emitSize=0, emitTime=0, emitRate=100, emitCone=PI, tileInfo,
        colorStartA=WHITE, colorStartB=WHITE, colorEndA=CLEAR_WHITE, colorEndB=CLEAR_WHITE,
        particleTime=.5, sizeStart=.1, sizeEnd=1, speed=.1, damping=1, gravity=0, fadeRate=.1, randomness=.2, additive=false)
    {
        super(pos3D, undefined, WHITE, tileInfo);
        this.transparent = true;

        /** @property {number|Vector3} - Spawn area, a number for a sphere diameter or a vec3 for a box */
        this.emitSize = emitSize;
        /** @property {number} - How long to keep emitting, 0 is forever */
        this.emitTime = emitTime;
        /** @property {number} - Particles per second, 0 does not emit */
        this.emitRate = emitRate;
        /** @property {number} - Half angle around the emit direction, PI is every direction */
        this.emitCone = emitCone;
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartA = colorStartA;
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartB = colorStartB;
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndA = colorEndA;
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndB = colorEndB;
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
        /** @property {Array<Object>} - Live particles */
        this.particles = [];
        this.emitTimeBuffer = 0;
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // emit at the rate until the emit time is up
        if (this.emitRate && (!this.emitTime || this.getAliveTime() <= this.emitTime))
        {
            this.emitTimeBuffer += this.emitRate * timeDelta;
            for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                this.emitParticle();
        }
        else if (this.emitTime && !this.particles.length)
            this.destroy();

        // move the particles and drop the dead ones
        const particles = this.particles;
        for (let i = particles.length; i--;)
        {
            const p = particles[i];
            p.velocity.y += this.gravity;
            p.velocity = p.velocity.scale(this.damping);
            p.pos = p.pos.add(p.velocity);
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
            : render3DRandomDirection().scale(rand() ** (1/3) * size / 2);

        // direction inside the cone around local +Y, uniform over the spherical cap
        const z = rand(cos(this.emitCone), 1), s = (1 - z * z) ** .5, a = rand(2 * PI);
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

    /** Draw the particles as billboards */
    render3D()
    {
        const additive = render3D.additive;
        render3D.additive = this.additive;
        const fade = this.fadeRate / 2;
        for (const p of this.particles)
        {
            const t = p.age / p.life;
            const alpha = t < fade ? t / fade : t > 1 - fade ? (1 - t) / fade : 1;
            const color = p.colorStart.lerp(p.colorEnd, t), size = lerp(p.sizeStart, p.sizeEnd, t);
            color.a *= alpha;
            if (this.tileInfo)
                render3D.drawBillboard(p.pos, vec2(size), this.tileInfo, color);
            else
                render3D.drawSoftDisc(p.pos, size / 2, color, undefined, 8); // untextured particles are round puffs
        }
        render3D.additive = additive;
    }
}

// push the three rings of a soft disc, pointAt maps a unit direction in the disc's plane and a radius to a world point
function render3DPushSoftDisc(r, radius, color, sides, normal, pointAt)
{
    const alpha = [1, .9, .7, 0]; // by ring, center to rim
    for (let k = 0; k < 3; ++k)
    {
        const points = [], colors = [];
        const c0 = color.withAlpha(color.a * alpha[k]), c1 = color.withAlpha(color.a * alpha[k+1]);
        const r0 = radius * k / 3, r1 = radius * (k + 1) / 3;
        for (let i = 0; i <= sides; ++i)
        {
            const a = i / sides * 2 * PI, dir = vec2(cos(a), sin(a));
            points.push(pointAt(dir, r1), pointAt(dir, r0));
            colors.push(c1, c0);
        }
        r.pushStripUnlit(points, normal, undefined, colors);
    }
}

// a random unit vector, uniform over the sphere
function render3DRandomDirection()
{
    const z = rand(-1, 1), s = (1 - z * z) ** .5, a = rand(2 * PI);
    return vec3(s * cos(a), z, s * sin(a));
}

///////////////////////////////////////////////////////////////////////////////
// OBJ meshes

/**
 * Parse Wavefront OBJ text into a Mesh
 * - Reads v, vt, vn and f lines with convex polygons of any size, materials and groups are ignored
 * - Normals come from the file when every corner of a face has one, otherwise from the face
 * @param {string} text
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3DSmoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), parseOBJ(objText));
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
    ASSERT(response.ok, 'loadOBJ failed: ' + url);
    return parseOBJ(await response.text(), smooth);
}
