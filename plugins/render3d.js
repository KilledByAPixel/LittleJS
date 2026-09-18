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
    render3DRenderStages();

    // hand the state back to the engine's 2D batching
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    if (glActiveTexture)
        gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
    glSetInstancedMode(true);
}

// the opaque and transparent stages, replaced by the objects task
function render3DRenderStages() {}

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
