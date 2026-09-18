/**
 * LittleJS 3D Rendering Plugin
 * - Draws meshes, billboards and lines into the engine's WebGL canvas underneath the 2D layer
 * - One shader: directional + ambient light, optional specular, fog, textures, vertex colors
 * - Meshes are static triangle strips drawn by matrix, the stream batches immediate mode pushes
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
const RENDER3D_MAX_BATCH = 32768; // stream vertices per flush
const RENDER3D_QUAD_UVS = [vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)];
const RENDER3D_FULL_UV_RECT = {x:0, y:0, w:1, h:1};

// a key for the state fields a stream batch is drawn under, so a change flushes first
function render3DStateKey()
{
    const r = render3D;
    return (r.blend ? 1 : 0) | (r.additive ? 2 : 0) | (r.depthTest ? 4 : 0) | (r.depthWrite ? 8 : 0)
        | (r.cullBackFaces ? 16 : 0) | (r.lighting ? 32 : 0) | (r.specular * 1024 | 0) << 6;
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
        /** @property {Vector3} - Direction the directional light travels */
        this.lightDirection = vec3(.5, -1, .3).normalize();
        /** @property {Color} - Directional light color */
        this.lightColor = WHITE.copy();
        /** @property {Color} - Ambient light color */
        this.ambientColor = rgb(.3, .3, .3);
        /** @property {Color} - Fog color, uses canvasClearColor when undefined */
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
        /** @property {Function} - Called after the opaque objects and before the transparent ones, for drawing outside of objects */
        this.onRender = undefined;
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

        /** @property {WebGLProgram} - The shader, undefined when not available */
        this.shader = undefined;
        /** @property {WebGLVertexArrayObject} - Vertex array object */
        this.vao = undefined;
        /** @property {WebGLTexture} - 1x1 white texture used when no tile is given */
        this.whiteTexture = undefined;
        /** @property {Set<Mesh>} - Uploaded meshes, so context loss can drop their buffers */
        this.uploadedMeshes = new Set;

        // cached shader locations, reset when the shader is rebuilt
        this.uniforms = {};
        this.attribs = undefined;

        // the stream, filled in by the stream task
        this.streamBuffer = undefined;
        this.streamData = new ArrayBuffer(RENDER3D_MAX_BATCH * RENDER3D_VERTEX_BYTES);
        this.streamFloats = new Float32Array(this.streamData);
        this.streamInts = new Uint32Array(this.streamData);
        this.streamCount = 0;
        this.streamTileInfo = undefined;
        this.streamState = undefined;
        this.capture = undefined;

        render3DInitGL();
        engineAddPlugin(undefined, undefined, render3DContextLost, render3DContextRestored, render3DPreRender);
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

    /** Draw a mesh with the current state, flushes the stream first so draw order holds
     *  @param {Mesh} mesh
     *  @param {Matrix4} [matrix] - Object transform
     *  @param {Color} [color] - Tint
     *  @param {TileInfo} [tileInfo] - Texture, mesh uvs map across the tile */
    drawMesh(mesh, matrix=new Matrix4, color=WHITE, tileInfo)
    {
        if (!this.shader) return;
        ASSERT(this.isRendering, '3D draws are only valid during the 3D pass, use render3D.onRender or EngineObject3D.render3D');
        if (!this.isRendering) return;
        this.flush();
        mesh.buffer || mesh.upload();
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

    /** Push a strip into the stream, or into the mesh being baked
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
        if (!this.shader) return;
        ASSERT(this.isRendering, '3D draws are only valid during the 3D pass, use render3D.onRender or EngineObject3D.render3D');
        if (!this.isRendering) return;

        // flush when the texture or state differs from the pending batch, or it would overflow
        const state = render3DStateKey();
        const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
        const needed = points.length + 3;
        if (this.streamCount && (textureInfo !== this.streamTileInfo || state !== this.streamState
            || this.streamCount + needed > RENDER3D_MAX_BATCH))
            this.flush();
        this.streamTileInfo = textureInfo;
        this.streamState = state;

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

    /** Draw the pending stream vertices as one strip, called automatically when needed */
    flush()
    {
        if (!this.streamCount || !this.shader) return;
        ASSERT(this.isRendering, '3D draws are only valid during the 3D pass, use render3D.onRender or EngineObject3D.render3D');
        if (!this.isRendering) return;
        const gl = glContext;
        const identity = new Matrix4;
        gl.uniformMatrix4fv(render3DUniform('model'), false, identity.m);
        gl.uniformMatrix4fv(render3DUniform('normalMat'), false, identity.m);
        render3DApplyState(this.streamTileInfo, WHITE, RENDER3D_FULL_UV_RECT);
        render3DBindVertexBuffer(this.streamBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.streamFloats, 0, this.streamCount * RENDER3D_VERTEX_FLOATS);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.streamCount);
        ++drawCount;
        primitiveCount += this.streamCount;
        this.streamCount = 0;
    }

    /** Run a draw function with every push captured into a new mesh instead of the stream
     *  @param {Function} drawFunction
     *  @return {Mesh} */
    bake(drawFunction)
    {
        this.flush();
        ASSERT(!this.capture, 'bake cannot be nested');
        this.capture = new Mesh;
        drawFunction();
        const mesh = this.capture;
        this.capture = undefined;
        return mesh;
    }

    /** Run the opaque and transparent stages over every EngineObject3D, called automatically by the 3D pass */
    renderStages()
    {
        const opaque = [], transparent = [];
        for (const o of engineObjects)
            if (!o.destroyed && o instanceof EngineObject3D)
                (o.transparent ? transparent : opaque).push(o);

        // opaque: no blending, depth writes on, by render order
        this.blend = this.additive = false;
        this.depthTest = this.depthWrite = true;
        opaque.sort((a, b)=> a.renderOrder - b.renderOrder);
        for (const o of opaque)
            o.render3D();
        this.onRender?.();

        // transparent: blending on, depth writes off, far to near
        this.flush();
        this.blend = true;
        this.additive = false;
        this.depthTest = true;
        this.depthWrite = false;
        const c = this.camera.pos;
        transparent.sort((a, b)=> b.pos3D.distanceSquared(c) - a.pos3D.distanceSquared(c));
        for (const o of transparent)
            o.render3D();
        this.flush();
    }

    /** Draw a camera facing quad
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
        this.pushStrip(
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
    drawQuad3D(a, b, c, d, color=WHITE, tileInfo)
    {
        const normal = b.subtract(a).cross(d.subtract(a)).normalize();
        this.pushStrip([a, b, d, c], normal, RENDER3D_QUAD_UVS, color, tileInfo);
    }

    /** Draw a triangle, counter clockwise from outside is the front
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Color} [color] */
    drawTriangle3D(a, b, c, color=WHITE)
    {
        const normal = b.subtract(a).cross(c.subtract(a)).normalize();
        this.pushStrip([a, b, c], normal, undefined, color);
    }

    /** Draw a line as a camera facing ribbon
     *  @param {Vector3} start
     *  @param {Vector3} end
     *  @param {number} [thickness] - World units
     *  @param {Color} [color] */
    drawLine3D(start, end, thickness=.1, color=WHITE)
    {
        const side = end.subtract(start).cross(this.cameraForward).normalize(thickness / 2);
        this.pushStrip(
            [start.add(side), start.subtract(side), end.add(side), end.subtract(side)],
            this.cameraForward.scale(-1), undefined, color);
    }

    /** Draw a disc that fades to transparent at the rim, for shadows, glows and sky dots
     *  @param {Vector3} pos - Center
     *  @param {Vector3} normal - Facing direction
     *  @param {number} radius
     *  @param {Color} [color]
     *  @param {number} [sides] */
    drawSoftDisc(pos, normal, radius, color=WHITE, sides=16)
    {
        // basis in the disc's plane
        const n = normal.normalize();
        const helper = abs(n.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
        const u = helper.cross(n).normalize(), w = u.cross(n);
        const alpha = [1, .9, .7, 0]; // by ring, center to rim
        for (let k = 0; k < 3; ++k)
        {
            const points = [], colors = [];
            const c0 = color.withAlpha(color.a * alpha[k]), c1 = color.withAlpha(color.a * alpha[k+1]);
            const r0 = radius * k / 3, r1 = radius * (k + 1) / 3;
            for (let i = 0; i <= sides; ++i)
            {
                const a = i / sides * 2 * PI;
                const dir = u.scale(cos(a)).add(w.scale(sin(a)));
                points.push(pos.add(dir.scale(r1)), pos.add(dir.scale(r0)));
                colors.push(c1, c0);
            }
            this.pushStrip(points, n, undefined, colors);
        }
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
// GL setup and the frame, module level so the plugin object stays a plain data holder

function render3DInitGL()
{
    if (headlessMode) return;
    if (!glEnable || !glContext)
    {
        console.warn('Render3DPlugin: WebGL not enabled!');
        return;
    }

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
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
        'in vec3 P,N;in vec2 T;in vec4 C;' +
        'out vec4 o;' +
        'void main(){' +
        'vec4 c=C*tint*texture(tex,T);' +
        'if(lightDir.w>0.){' +
        'vec3 n=normalize(N);' +
        'float d=max(dot(n,-lightDir.xyz),0.);' +
        'vec3 e=normalize(cameraPos-P);' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb*=ambientColor.rgb+lightColor.rgb*d;' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,e),0.),16.)*lightColor.a;' +
        '}' +
        'if(ambientColor.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,fogColor.rgb,smoothstep(fogColor.a,ambientColor.a,z));' +
        '}' +
        'o=c;' +
        '}'
    );

    render3D.uniforms = {};
    render3D.attribs = undefined;

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

    // strips get one leading repeat, which shifts real triangles to odd indices, so front faces read as clockwise
    glContext.frontFace(glContext.CW);

    // leave the engine's array buffer bound, a context restore can land mid-frame
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
        return {x:0, y:0, w:1, h:1};
    const textureInfo = tileInfo.textureInfo;
    const inv = textureInfo.sizeInverse;
    const bleedX = inv.x * tileInfo.bleed, bleedY = inv.y * tileInfo.bleed;
    return {
        x: tileInfo.pos.x * inv.x + bleedX,
        y: tileInfo.pos.y * inv.y + bleedY,
        w: tileInfo.size.x * inv.x - 2*bleedX,
        h: tileInfo.size.y * inv.y - 2*bleedY };
}

// apply the plugin's state fields and the per draw uniforms before a draw call
// tileInfo may be a TileInfo, a TextureInfo, or undefined for the white texture
function render3DApplyState(tileInfo, tint=WHITE, uvRect)
{
    const gl = glContext, r = render3D, uniform = render3DUniform;

    // blending, matches the engine's 2D blend functions
    if (r.blend)
    {
        gl.enable(gl.BLEND);
        const destBlend = r.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA;
        gl.blendFuncSeparate(gl.SRC_ALPHA, destBlend, gl.ONE, destBlend);
    }
    else
        gl.disable(gl.BLEND);

    // depth and culling
    r.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
    gl.depthMask(r.depthWrite);
    r.cullBackFaces ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);

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

    // per draw uniforms
    gl.uniform4f(uniform('tint'), tint.r, tint.g, tint.b, tint.a);
    const l = r.lightDirection, lc = r.lightColor, ac = r.ambientColor, fc = r.fogColor || canvasClearColor;
    gl.uniform4f(uniform('lightDir'), l.x, l.y, l.z, r.lighting ? 1 : 0);
    gl.uniform4f(uniform('lightColor'), lc.r, lc.g, lc.b, r.specular);
    gl.uniform4f(uniform('ambientColor'), ac.r, ac.g, ac.b, r.fogEnd);
    gl.uniform4f(uniform('fogColor'), fc.r, fc.g, fc.b, r.fogStart);
}

// the 3D pass, runs from the preRender hook before gameRender
function render3DPreRender()
{
    const gl = glContext, r = render3D;
    r.updateMatrices();
    if (!r.shader) return; // headless, gl disabled, or context lost

    // take over the gl state
    gl.useProgram(r.shader);
    gl.bindVertexArray(r.vao);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(render3DUniform('viewProj'), false, r.viewProjection.m);
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);

    // stages are filled in by the objects task
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
const RENDER3D_DEFAULT_NORMAL = vec3(0, 1, 0);
const RENDER3D_DEFAULT_UV = vec2();

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
        return this;
    }

    /** Derive normals from the strip's triangles
     *  @param {boolean} [smooth] - Average normals at shared positions, otherwise one normal per face
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
        glContext.bindBuffer(glContext.ARRAY_BUFFER, this.buffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, data, glContext.STATIC_DRAW);
        render3D.uploadedMeshes.add(this);
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
 * @param {Array<Array<number>>} profile
 * @param {number} [sides]
 * @param {boolean} [smooth] - Vertex normals and shared vertices, otherwise one normal per face
 * @return {Mesh}
 * @memberof Render3D
 */
function buildLathe(profile, sides=8, smooth=false)
{
    ASSERT(isArray(profile) && profile.length > 1, 'lathe profile needs at least 2 points');
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
        lengths[i] = lengths[i-1] + Math.hypot(profile[i][0] - profile[i-1][0], profile[i][1] - profile[i-1][1]);
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
    return mesh;
}

/**
 * Build a sphere of diameter 1
 * @param {number} [segments] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth]
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(segments=12, rings=6, smooth=true)
{
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
 * Build a heightfield grid in the XZ plane centered on the origin, one strip per row
 * @param {number} sizeX
 * @param {number} sizeZ
 * @param {number} [segmentsX]
 * @param {number} [segmentsZ]
 * @param {Function} [heightFunction] - (x, z) => y, default flat
 * @param {Function} [colorFunction] - (x, z) => Color, default white
 * @return {Mesh}
 * @memberof Render3D
 */
function buildGrid(sizeX, sizeZ, segmentsX=1, segmentsZ=1, heightFunction=()=>0, colorFunction)
{
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
    const color = (i, j)=> colorFunction ? colorFunction(px(i), pz(j)) : WHITE;
    for (let j = 0; j < segmentsZ; ++j)
    {
        const points = [], normals = [], uvs = [], colors = [];
        for (let i = 0; i <= segmentsX; ++i)
        {
            points.push(point(i, j), point(i, j + 1));
            normals.push(normal(i, j), normal(i, j + 1));
            uvs.push(vec2(i / segmentsX, j / segmentsZ), vec2(i / segmentsX, (j + 1) / segmentsZ));
            colors.push(color(i, j), color(i, j + 1));
        }
        mesh.addStrip(points, normals, uvs, colors);
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
        const n = c.subtract(a).cross(d.subtract(b)).normalize();
        mesh.addStrip([a, b, d, c], n, [vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)]);
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

///////////////////////////////////////////////////////////////////////////////
/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Inherits update, children, timers, destroy and renderOrder from EngineObject
 * - The inherited 2D pos and physics are ignored by rendering, copy pos into pos3D for pseudo-3D games
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
        super(vec2(), vec2(1), tileInfo, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');

        /** @property {Vector3} - World space position */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale */
        this.scale3D = vec3(1);
        /** @property {Mesh} - Mesh to draw */
        this.mesh = mesh;
        /** @property {boolean} - Draw in the transparent stage, sorted far to near with depth writes off */
        this.transparent = false;
    }

    /** Returns the object's world transform
     *  @return {Matrix4} */
    getMatrix() { return buildMatrix(this.pos3D, this.rotation3D, this.scale3D); }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass, draws the mesh by default */
    render3D()
    {
        if (this.mesh)
            render3D.drawMesh(this.mesh, this.getMatrix(), this.color, this.tileInfo);
    }
}
