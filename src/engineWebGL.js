/**
 * LittleJS WebGL Interface
 * - WebGL2 rendering engine for high-performance graphics
 * - Batched sprite rendering for drawing thousands of sprites efficiently
 * - Instanced rendering using vertex array objects (VAOs)
 * - Polygon rendering with triangle strip support
 * - Shader system with custom vertex and fragment shaders
 * - Texture management with automatic atlas support
 * - Post-processing effects via framebuffer and shader plugins
 * - Automatic fallback to Canvas2D if WebGL is unavailable
 * - Context loss and restoration handling
 * - Can be disabled with glEnable setting
 * - Advanced users can create custom shaders and render targets
 * @namespace WebGL
 */

'use strict';

/** The WebGL canvas which appears below the main canvas
 *  @type {HTMLCanvasElement}
 *  @memberof WebGL */
let glCanvas;

/** WebGL2 context for `glCanvas`
 *  @type {WebGL2RenderingContext}
 *  @memberof WebGL */
let glContext;

/** Should WebGL be setup with anti-aliasing? must be set before calling engineInit
 *  @type {boolean}
 *  @memberof WebGL */
let glAntialias = true;

// WebGL internal variables not exposed to documentation
let glMipmappedTextures = new WeakSet, glMipmapsUntilTarget = new WeakSet, glMipmapsStale = new Set, glPremultipliedTextures = new WeakSet, glShaderPremultiplied, glEnableBeforeLoss = true, glShader, glPolyShader, glPolyMode, glAdditive, glBatchAdditive, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glBatchCount, glTextureInfos = new Set, glInstancedVAO, glPolyVAO, glFramebuffer, glRenderTarget, glShaderObjects = [], glCustomShader, glBatchShader, glProgramCustom, glTransform, glRenderTargetSaved, glUniformLocations = new WeakMap, glCanBeEnabled = true;
// ANDed onto every packed color as a draw is queued; the light system's shadow pass sets 0xff000000
// to draw everything black with its alpha kept (rgbaInt packs alpha in the top byte)
let glColorMask = -1;
// set by the light system's shadow pass, which draws the world with its own camera, so a screen space
// WebGL draw in a render() is skipped instead of landing somewhere in the world
let glSkipScreenSpace = false;

// WebGL internal constants
const gl_ARRAY_BUFFER_SIZE = 5e5;
const gl_INDICES_PER_INSTANCE = 11;
const gl_INSTANCE_BYTE_STRIDE = gl_INDICES_PER_INSTANCE * 4;
const gl_MAX_INSTANCES = gl_ARRAY_BUFFER_SIZE / gl_INSTANCE_BYTE_STRIDE | 0;
const gl_INDICES_PER_POLY_VERTEX = 3;
const gl_POLY_VERTEX_BYTE_STRIDE = gl_INDICES_PER_POLY_VERTEX * 4;
const gl_MAX_POLY_VERTEXES = gl_ARRAY_BUFFER_SIZE / gl_POLY_VERTEX_BYTE_STRIDE | 0;

///////////////////////////////////////////////////////////////////////////////

// Initialize WebGL, called automatically by the engine
// the sprite vertex shader, shared by the engine's program and every Shader so one vertex layout fits all
const gl_VERTEX_SOURCE =
    '#version 300 es\n' +            // specify GLSL ES version
    'precision highp float;'+        // use highp for accuracy
    'uniform mat4 m;'+               // transform matrix
    'layout(location=0) in vec2 g;'+ // in: geometry
    'layout(location=1) in vec4 p;'+ // in: position/size
    'layout(location=2) in vec4 u;'+ // in: uvs
    'layout(location=3) in vec4 c;'+ // in: color
    'layout(location=4) in vec4 a;'+ // in: additiveColor
    'layout(location=5) in float r;'+// in: rotation
    'out vec2 v,l;'+                 // out: uv, and 0 to 1 across the sprite for a Shader's localUV
    'out vec4 d,e;'+                 // out: color, additiveColor
    'void main(){'+                  // shader entry point
    'vec2 s=(g-.5)*p.zw;'+           // get size offset
    'gl_Position=m*vec4(p.xy+s*cos(r)-vec2(-s.y,s)*sin(r),1,1);'+ // transform position
    'v=mix(u.xw,u.zy,g);'+           // pass uv to fragment shader
    'l=g;d=c;e=a;'+                  // pass local uv and colors to fragment shader
    '}';                             // end of shader

// the end of every sprite fragment shader, the engine's and each Shader's: t is the surface color
// a render target's texture holds premultiplied color, so that batch blends with ONE and premultiplies here,
// giving what a straight texel gives, clamped as the blend clamps it: exactly when the additive alpha is 0 or
// the texel is clear or opaque, and close otherwise, since the straight color is not kept to be multiplied
const gl_FRAGMENT_TINT_SOURCE =
    'c=t*d+e;'+                      // modulate by color plus additive
    'if(premultipliedTexture){'+     // a render target
    'c.a=min(c.a,1.);'+              // the alpha the blend uses
    'c.rgb=min(t.rgb*d.rgb*min(d.a+e.a,1.)+e.rgb*c.a,c.a);}';

function glInit(rootElement)
{
    if (!glEnable || headlessMode)
    {
        glCanBeEnabled = false;
        return;
    }

    // create the canvas and textures
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl2', {antialias:glAntialias});

    if (!glContext)
    {
        console.warn('WebGL2 not supported, falling back to 2D canvas rendering!');
        glCanvas = glContext = undefined;
        glEnable = false;
        glCanBeEnabled = false;
        return;
    }

    // attach the WebGL canvas;
    rootElement.appendChild(glCanvas);
    
    // startup webgl, and make the textures of any texture infos made before it
    initWebGL();
    for (const info of glTextureInfos)
        info.glTexture ||= glCreateTexture(info.image, info.wrap);

    // setup context lost and restore handlers
    glCanvas.addEventListener('webglcontextlost', (e)=>
    {
        glEnableBeforeLoss = glEnable;
        glEnable = false; // disable WebGL rendering
        glCanvas.style.display = 'none'; // hide the gl canvas
        e.preventDefault(); // prevent default to allow restoration
        LOG('WebGL context lost! Switching to Canvas2d rendering.');

        // remove WebGL textures
        for (const info of glTextureInfos)
            info.glTexture = undefined;
        glActiveTexture = undefined;
        // every Shader compiles again on its next draw, and the first flush after restore picks its program again
        for (const shader of glShaderObjects)
            shader.program = undefined;
        glBatchShader = undefined;
        glProgramCustom = true;
        glUniformLocations = new WeakMap; // the programs those belonged to are gone
        // drop any partially-filled batch so the next glFlush doesn't
        // upload stale glBatchCount against fresh empty buffers on restore
        glBatchCount = 0;
        glPolyMode = false;
        pluginList.forEach(plugin=>plugin.glContextLost?.());
    });
    glCanvas.addEventListener('webglcontextrestored', ()=>
    {
        glEnable = glEnableBeforeLoss; // WebGL rendering as it was before the loss
        glCanvas.style.display = ''; // show the gl canvas
        LOG('WebGL context restored, reinitializing...');

        // reinit WebGL and restore textures
        glMipmappedTextures = new WeakSet;
        glMipmapsUntilTarget = new WeakSet;
        glMipmapsStale.clear();
        glPremultipliedTextures = new WeakSet; // the tile layers draw into their new textures again below
        initWebGL();
        for (const info of glTextureInfos)
            info.glTexture = glCreateTexture(info.image, info.wrap);
        pluginList.forEach(plugin=>plugin.glContextRestored?.());

        // a tile layer drawn on the GPU only had its tiles in the lost texture, it draws them again
        for (const o of engineObjects)
            o instanceof TileLayer && o.isUsingWebGL && !o.destroyed && o.redraw();
    });

    function initWebGL()
    {
        // setup instanced rendering shader program
        glShader = glCreateProgram(gl_VERTEX_SOURCE,
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for accuracy
            'uniform sampler2D s;'+   // texture
            'uniform bool premultipliedTexture;'+ // is the texture a render target
            'in vec2 v;'+             // in: uv
            'in vec4 d,e;'+           // in: color, additiveColor
            'out vec4 c;'+            // out: color
            'void main(){'+           // shader entry point
            'vec4 t=texture(s,v);'+   // sample the texture
            gl_FRAGMENT_TINT_SOURCE + // apply color and additive
            '}'                       // end of shader
        );
        glShaderPremultiplied = false; // a new program starts with its uniforms at 0

        // setup poly rendering shaders
        glPolyShader = glCreateProgram(
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for better accuracy
            'uniform mat4 m;'+        // transform matrix
            'in vec2 p;'+             // in: position
            'in vec4 c;'+             // in: color
            'out vec4 d;'+            // out: color
            'void main(){'+           // shader entry point
            'gl_Position=m*vec4(p,1,1);'+ // transform position
            'd=c;'+                   // pass color to fragment shader
            '}'                       // end of shader
            ,
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for better accuracy
            'in vec4 d;'+             // in: color
            'out vec4 c;'+            // out: color
            'void main(){'+           // shader entry point
            'c=d;'+                   // set color
            '}'                       // end of shader
        );

        // init buffers
        const glInstanceData = new ArrayBuffer(gl_ARRAY_BUFFER_SIZE);
        glPositionData = new Float32Array(glInstanceData);
        glColorData = new Uint32Array(glInstanceData);
        glArrayBuffer = glContext.createBuffer();
        glGeometryBuffer = glContext.createBuffer();
        glFramebuffer = glContext.createFramebuffer();
        glBatchCount = 0;

        // create the geometry buffer, triangle strip square
        const geometry = new Float32Array([0,0,1,0,0,1,1,1]);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, geometry, glContext.STATIC_DRAW);
        
        let offset, shader, stride;
        const initVertexAttrib = (name, type, typeSize, size, divisor=0)=>
        {
            const location = glContext.getAttribLocation(shader, name);
            const normalize = typeSize === 1;
            const fixedStride = typeSize && stride;
            glContext.enableVertexAttribArray(location);
            glContext.vertexAttribPointer(location, size, type, normalize, fixedStride, offset);
            glContext.vertexAttribDivisor(location, divisor);
            offset += size*typeSize;
        }

        // setup VAO for instanced rendering
        glInstancedVAO = glContext.createVertexArray();
        glContext.bindVertexArray(glInstancedVAO);
        
        // configure instanced vertex attributes
        offset = 0, shader = glShader, stride = gl_INSTANCE_BYTE_STRIDE;
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        initVertexAttrib('g', glContext.FLOAT, 0, 2); // geometry
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
        initVertexAttrib('p', glContext.FLOAT, 4, 4, 1); // position & size
        initVertexAttrib('u', glContext.FLOAT, 4, 4, 1); // texture coords
        initVertexAttrib('c', glContext.UNSIGNED_BYTE, 1, 4, 1); // color
        initVertexAttrib('a', glContext.UNSIGNED_BYTE, 1, 4, 1); // additiveColor
        initVertexAttrib('r', glContext.FLOAT, 4, 1, 1); // rotation

        // setup VAO for poly rendering
        glPolyVAO = glContext.createVertexArray();
        glContext.bindVertexArray(glPolyVAO);
        
        // configure poly vertex attributes
        offset = 0, shader = glPolyShader, stride = gl_POLY_VERTEX_BYTE_STRIDE;
        initVertexAttrib('p', glContext.FLOAT, 4, 2);         // position
        initVertexAttrib('c', glContext.UNSIGNED_BYTE, 1, 4); // color
    }
}

function glSetInstancedMode(force=false)
{
    if (!force && !glPolyMode) return;
    
    // setup instanced mode
    glFlush();
    glPolyMode = false;
    glContext.useProgram(glShader);
    glContext.bindVertexArray(glInstancedVAO);
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer); // a VAO does not keep this binding
}

function glSetPolyMode()
{
    if (glPolyMode) return;
    
    // setup poly mode
    glFlush();
    glPolyMode = true;
    glContext.useProgram(glPolyShader);
    glContext.bindVertexArray(glPolyVAO);
}

// Setup WebGL render each frame, called automatically by engine
// Also used by tile layer rendering when redrawing tiles
function glPreRender(clear=true)
{
    if (!glEnable || !glContext) return;

    ASSERT(!glBatchCount, 'glPreRender called with unflushed batch.');

    // mainCanvasSize is css pixels, the backing store is scaled by the pixel
    // ratio, render targets are offscreen so they are never scaled
    const dpr = glRenderTarget ? 1 : getCanvasPixelRatio();
    const bufferSizeX = mainCanvasSize.x * dpr | 0;
    const bufferSizeY = mainCanvasSize.y * dpr | 0;
    if (!glRenderTarget)
    {
        // set to same size as main canvas, only when it changes because
        // setting it reallocates the drawing buffer and invalidates the frame
        if (glCanvas.width !== bufferSizeX || glCanvas.height !== bufferSizeY)
        {
            glCanvas.width = bufferSizeX;
            glCanvas.height = bufferSizeY;
        }
    }
    glContext.viewport(0, 0, bufferSizeX, bufferSizeY);
    clear && glClearCanvas();

    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    if (glRenderTarget)
        s.y = -s.y; // invert y when using render target
    const rotatedCam = cameraPos.rotate(-cameraAngle);
    const p = vec2(-1).subtract(rotatedCam.multiply(s));
    const ca = cos(cameraAngle);
    const sa = sin(cameraAngle);
    const transform = [
        s.x  * ca,  s.y * sa, 0, 0,
        -s.x * sa,  s.y * ca, 0, 0,
        1,          1,        1, 0,
        p.x,        p.y,      0, 1];
    glTransform = transform;

    // set the same transform matrix for both shaders
    const initUniform = (program, uniform, value)=>
    {
        glContext.useProgram(program);
        glContext.uniformMatrix4fv(glUniformLocation(program, uniform), false, value);
    }
    initUniform(glPolyShader, 'm', transform);
    initUniform(glShader, 'm', transform);

    // set the active texture
    glContext.activeTexture(glContext.TEXTURE0);
    if (textureInfos[0])
    {
        glActiveTexture = textureInfos[0].glTexture;
        glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
    }

    // rebind the array buffer
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);

    // start with additive blending off
    glAdditive = glBatchAdditive = false;

    // force it to set instanced mode
    glSetInstancedMode(true);
}

/** Clear the canvas or render target to canvasClearColor
 *  @memberof WebGL */
function glClearCanvas()
{
    if (!glContext) return;

    // clear using the canvasClearColor, premultiplied like everything the blend writes
    const color = canvasClearColor;
    glContext.clearColor(color.r*color.a, color.g*color.a, color.b*color.a, color.a);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
}

/** Set the WebGL texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @memberof WebGL */
function glSetTexture(texture)
{
    if (!glContext) return;
    if (texture !== glActiveTexture)
    {
        // must flush cache with the old texture to set a new one
        glFlush();
        glActiveTexture = texture;
        glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
    }
    glMipmapsStale.size && glUpdateMipmaps(texture); // bound already or not, drawn into since
}

// make the smaller levels of a texture again if it was drawn into since, it must be the bound texture
function glUpdateMipmaps(texture)
{
    if (!glMipmapsStale.has(texture)) return;
    glMipmapsStale.delete(texture);
    glContext.generateMipmap(glContext.TEXTURE_2D);
}

/** Set the wrap mode (REPEAT or CLAMP_TO_EDGE) on an existing WebGL texture
 *  Flushes the current batch only if the texture is the active one
 *  @param {WebGLTexture} texture
 *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE
 *  @memberof WebGL */
function glSetTextureWrap(texture, wrap=true)
{
    if (!glContext || !texture) return;

    // flush only if changing wrap on the currently bound texture
    const isCurrent = texture === glActiveTexture;
    if (isCurrent)
        glFlush();
    else
        glContext.bindTexture(glContext.TEXTURE_2D, texture);

    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);

    if (!isCurrent && glActiveTexture)
        glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
}

/** Compile WebGL shader of the given type, will throw errors if in debug mode
 *  @param {string} source
 *  @param {number} type
 *  @return {WebGLShader}
 *  @memberof WebGL */
function glCompileShader(source, type)
{
    if (!glContext) return;

    // build the shader
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    // check for errors
    if (debug && !glContext.getShaderParameter(shader, glContext.COMPILE_STATUS))
        throw glContext.getShaderInfoLog(shader);
    return shader;
}

/** Create WebGL program with given shaders
 *  @param {string} vsSource
 *  @param {string} fsSource
 *  @return {WebGLProgram}
 *  @memberof WebGL */
function glCreateProgram(vsSource, fsSource)
{
    if (!glContext) return;

    // build the program
    const program = glContext.createProgram();
    glContext.attachShader(program, glCompileShader(vsSource, glContext.VERTEX_SHADER));
    glContext.attachShader(program, glCompileShader(fsSource, glContext.FRAGMENT_SHADER));
    glContext.linkProgram(program);

    // check for errors
    if (debug && !glContext.getProgramParameter(program, glContext.LINK_STATUS))
        throw glContext.getProgramInfoLog(program);
    return program;
}

// a uniform location, looked up once per program
function glUniformLocation(program, name)
{
    let cache = glUniformLocations.get(program);
    cache || glUniformLocations.set(program, cache = {});
    return cache[name] ??= glContext.getUniformLocation(program, name);
}

// a Shader's 2D program, compiled the first time a batch needs it: the snippet's mainImage gives the surface
// color, then the sprite's color and additive color apply as the engine's own fragment shader does
function glShaderProgram(shader)
{
    return shader.program ||= glCreateProgram(gl_VERTEX_SOURCE,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform sampler2D iChannel0;' + // the texture
        'uniform vec3 iResolution;' +    // canvas size in pixels
        'uniform float iTime;' +         // engine time
        'uniform bool premultipliedTexture;' + // is the texture a render target
        'in vec2 v,l;in vec4 d,e;out vec4 c;\n' + // a define needs its own line
        '#define localUV l\n' +
        shader.fragmentCode + '\n' +
        'void main(){vec4 t;mainImage(t,v);' + gl_FRAGMENT_TINT_SOURCE + '}');
}

/** Create WebGL texture from an image and init the texture settings
 *  Restores the active texture when done
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|ImageBitmap} [image]
 *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image, wrap=false)
{
    if (!glContext) return;

    // build the texture
    const texture = glContext.createTexture();
    let mipMap = false;
    if (image?.width)
    {
        glSetTextureData(texture, image);
        glContext.bindTexture(glContext.TEXTURE_2D, texture);
        // WebGL2 makes mipmaps at any size, a texture that becomes a render target keeps them only at powers of two
        mipMap = !tilesPixelated;
        if (mipMap && !(isPowerOfTwo(image.width) && isPowerOfTwo(image.height)))
            glMipmapsUntilTarget.add(texture);
    }
    else
    {
        // create a white texture
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        glContext.bindTexture(glContext.TEXTURE_2D, texture);
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, 1, 1, 0, glContext.RGBA, glContext.UNSIGNED_BYTE, whitePixel);
    }

    // set texture filtering
    const magFilter = tilesPixelated ? glContext.NEAREST : glContext.LINEAR;
    const minFilter = mipMap ? glContext.LINEAR_MIPMAP_LINEAR : magFilter;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, magFilter);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, minFilter);
    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);
    if (mipMap)
    {
        glContext.generateMipmap(glContext.TEXTURE_2D);
        glMipmappedTextures.add(texture);
    }

    // rebind active texture
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
    return texture;
}

/** Deletes a WebGL texture
 *  @param {WebGLTexture} [texture]
 *  @memberof WebGL */
function glDeleteTexture(texture)
{
    if (!glContext) return;
    
    glContext.deleteTexture(texture);
}

/** Set WebGL texture data from an image, restores the active texture when done
 *  @param {WebGLTexture} texture
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|ImageBitmap} image
 *  @memberof WebGL */
function glSetTextureData(texture, image)
{
    if (!glContext) return;

    // build the texture, after drawing what was queued with the old image
    ASSERT(image?.width > 0, 'Invalid image data.');
    texture === glActiveTexture && glFlush();
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, image);
    glPremultipliedTextures.delete(texture); // an image uploads straight color, even into a used render target

    // keep mipmaps in sync with new level 0 data, for any texture that has them
    if (glMipmappedTextures.has(texture))
        glContext.generateMipmap(glContext.TEXTURE_2D);

    // rebind active texture
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
}

/** Internal: tells WebGL to create or update the glTexture and start tracking it, TextureInfo calls it
 *  @param {TextureInfo} textureInfo
 *  @ignore */
function glRegisterTextureInfo(textureInfo)
{
    if (headlessMode) return;

    // add texture info to tracking list even if gl is not enabled
    glTextureInfos.add(textureInfo);

    if (!glContext) return;

    // create or set the texture data
    if (textureInfo.glTexture)
        glSetTextureData(textureInfo.glTexture, textureInfo.image);
    else
        textureInfo.glTexture = glCreateTexture(textureInfo.image, textureInfo.wrap);
}

/** Internal: tells WebGL to destroy the glTexture and stop tracking it, TextureInfo calls it
 *  @param {TextureInfo} textureInfo
 *  @ignore */
function glUnregisterTextureInfo(textureInfo)
{
    if (headlessMode) return;

    // delete texture info from tracking list even if gl is not enabled
    glTextureInfos.delete(textureInfo);

    // unset and destroy the texture, drawing what is batched with it first, since deleting unbinds it
    const glTexture = textureInfo.glTexture;
    textureInfo.glTexture = undefined;
    if (glTexture && glTexture === glActiveTexture)
    {
        glFlush();
        glActiveTexture = undefined; // so nothing binds the deleted texture again
    }
    glMipmapsStale.delete(glTexture);
    glPremultipliedTextures.delete(glTexture);
    glDeleteTexture(glTexture);
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (glEnable && glContext && glBatchCount)
    {
        // a render target holds premultiplied color, a batch drawing one takes its color as it is
        // glSetTexture flushes on every change, so the whole batch drew with the bound texture
        const premultiplied = !glPolyMode && glPremultipliedTextures.has(glActiveTexture);

        // set blend mode
        const sourceBlend = premultiplied ? glContext.ONE : glContext.SRC_ALPHA;
        const destBlend = glBatchAdditive ? glContext.ONE : glContext.ONE_MINUS_SRC_ALPHA;
        glContext.blendFuncSeparate(sourceBlend, destBlend, glContext.ONE, destBlend);
        glContext.enable(glContext.BLEND);

        // a Shader's program for this batch, or the engine's own again after one
        if (!glPolyMode && (glBatchShader || glProgramCustom))
        {
            const program = glBatchShader ? glShaderProgram(glBatchShader) : glShader;
            glContext.useProgram(program);
            glProgramCustom = !!glBatchShader;
            if (glBatchShader)
            {
                const uniform = (name)=> glUniformLocation(program, name);
                glContext.uniformMatrix4fv(uniform('m'), false, glTransform);
                glContext.uniform1f(uniform('iTime'), time);
                // a render target is the size glPreRender gave its viewport
                const width = glRenderTarget ? mainCanvasSize.x : glCanvas.width;
                const height = glRenderTarget ? mainCanvasSize.y : glCanvas.height;
                glContext.uniform3f(uniform('iResolution'), width, height, 1);
                glContext.uniform1i(uniform('premultipliedTexture'), +premultiplied);
            }
        }
        if (!glPolyMode && !glBatchShader && glShaderPremultiplied !== premultiplied)
        {
            // the engine's program is the one in use, and it keeps the flag until it changes
            glContext.uniform1i(glUniformLocation(glShader, 'premultipliedTexture'), +premultiplied);
            glShaderPremultiplied = premultiplied;
        }

        const byteLength = glBatchCount * 
            (glPolyMode ? gl_INDICES_PER_POLY_VERTEX : gl_INDICES_PER_INSTANCE);
        glContext.bufferSubData(glContext.ARRAY_BUFFER, 0, glPositionData, 0, byteLength);
        
        // draw the batch
        if (glPolyMode)
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, glBatchCount);
        else
            glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, glBatchCount);
        ++drawCount;
        primitiveCount += glBatchCount;
        glBatchCount = 0;
    }
    glBatchAdditive = glAdditive;
    glBatchShader = glCustomShader;
}

/** Flush any sprites still in the buffer and copy to main canvas
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @memberof WebGL */
function glCopyToContext(context)
{
    if (!glEnable || !glContext) return;

    glFlush();
    context.drawImage(glCanvas, 0, 0);
}

/** Set anti-aliasing for WebGL canvas
 *  Must be called before engineInit
 *  @param {boolean} [antialias]
 *  @memberof WebGL */
function glSetAntialias(antialias=true)
{
    ASSERT(!glCanvas, 'must be called before engineInit');
    glAntialias = antialias;
}

/** Add a sprite to the gl draw list, used by all gl draw functions
 *  @param {number} x
 *  @param {number} y
 *  @param {number} sizeX
 *  @param {number} sizeY
 *  @param {number} [angle]
 *  @param {number} [uv0X]
 *  @param {number} [uv0Y]
 *  @param {number} [uv1X]
 *  @param {number} [uv1Y]
 *  @param {number} [rgba=-1] - white is -1
 *  @param {number} [rgbaAdditive=0] - black is 0
 *  @memberof WebGL */
function glDraw(x, y, sizeX, sizeY, angle=0, uv0X=0, uv0Y=0, uv1X=1, uv1Y=1, rgba=-1, rgbaAdditive=0)
{
    // flush if there is not enough room or if different blend mode
    if (glBatchCount >= gl_MAX_INSTANCES || glBatchAdditive !== glAdditive || glBatchShader !== glCustomShader)
        glFlush();
    glSetInstancedMode();

    let offset = glBatchCount++ * gl_INDICES_PER_INSTANCE;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv0Y;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba & glColorMask;
    glColorData[offset++] = rgbaAdditive & glColorMask;
    glPositionData[offset++] = angle;
}

/** Add an untextured rect to the gl draw list
 *  Zeroes the uvs and rgba so the texture contribution multiplies to 0,
 *  then carries the real color in the additive slot. Works regardless of
 *  which texture is currently bound.
 *  @param {number} x
 *  @param {number} y
 *  @param {number} sizeX
 *  @param {number} sizeY
 *  @param {number} angle
 *  @param {number} rgba - color as 32-bit integer
 *  @memberof WebGL */
function glDrawUntextured(x, y, sizeX, sizeY, angle, rgba)
{
    glDraw(x, y, sizeX, sizeY, angle, 0, 0, 0, 0, 0, rgba);
}

/** Transform and add a polygon to the gl draw list
 *  @param {Array<Vector2>} points - Array of Vector2 points
 *  @param {number} rgba - Color of the polygon as a 32-bit integer
 *  @param {number} x
 *  @param {number} y
 *  @param {number} sx
 *  @param {number} sy
 *  @param {number} angle
 *  @param {boolean} [tristrip] - should tristrip algorithm be used
 *  @memberof WebGL */
function glDrawPointsTransform(points, rgba, x, y, sx, sy, angle, tristrip=true)
{
    const pointsOut = [];
    const sa = sin(-angle);
    const ca = cos(-angle);
    for (const p of points)
    {
        // transform the point
        const px = p.x*sx;
        const py = p.y*sy;
        pointsOut.push(vec2(x + ca*px - sa*py, y + sa*px + ca*py));
    }
    const drawPoints = tristrip ? glPolyStrip(pointsOut) : pointsOut;
    glDrawPoints(drawPoints, rgba);
}

/** Transform and add a polygon to the gl draw list
 *  @param {Array<Vector2>} points - Array of Vector2 points
 *  @param {number} rgba - Color of the polygon as a 32-bit integer
 *  @param {number} lineWidth - Width of the outline
 *  @param {number} x
 *  @param {number} y
 *  @param {number} sx
 *  @param {number} sy
 *  @param {number} angle
 *  @param {boolean} [wrap] - Should the outline connect the first and last points
 *  @memberof WebGL */
function glDrawOutlineTransform(points, rgba, lineWidth, x, y, sx, sy, angle, wrap=true)
{
    const outlinePoints = glMakeOutline(points, lineWidth, wrap);
    glDrawPointsTransform(outlinePoints, rgba, x, y, sx, sy, angle, false);
}

/** Add a list of points to the gl draw list
 *  @param {Array<Vector2>} points - Array of Vector2 points in tri strip order
 *  @param {number} rgba - Color as a 32-bit integer
 *  @memberof WebGL */
function glDrawPoints(points, rgba)
{
    if (!glEnable || points.length < 3)
        return; // needs at least 3 points to have area

    // flush if there is not enough room or if different blend mode
    const vertCount = points.length + 2;
    if (glBatchCount+vertCount >= gl_MAX_POLY_VERTEXES || glBatchAdditive !== glAdditive)
        glFlush();
    ASSERT(vertCount < gl_MAX_POLY_VERTEXES, 'poly exceeds max batch size');
    if (vertCount >= gl_MAX_POLY_VERTEXES) return; // release-build safety net
    glSetPolyMode();
  
    // setup triangle strip with degenerate verts at start and end
    let offset = glBatchCount * gl_INDICES_PER_POLY_VERTEX;
    for (let i = vertCount; i--;)
    {
        const j = clamp(i-1, 0, vertCount-3);
        const point = points[j];
        glPositionData[offset++] = point.x;
        glPositionData[offset++] = point.y;
        glColorData[offset++] = rgba & glColorMask;
    }
    glBatchCount += vertCount;
}

/** Add a list of colored points to the gl draw list
 *  @param {Array<Vector2>} points - Array of Vector2 points in tri strip order
 *  @param {Array<number>} pointColors - Array of 32-bit integer colors
 *  @memberof WebGL */
function glDrawColoredPoints(points, pointColors)
{
    if (!glEnable || points.length < 3)
        return; // needs at least 3 points to have area

    // flush if there is not enough room or if different blend mode
    const vertCount = points.length + 2;
    if (glBatchCount+vertCount >= gl_MAX_POLY_VERTEXES || glBatchAdditive !== glAdditive)
        glFlush();
    ASSERT(vertCount < gl_MAX_POLY_VERTEXES, 'poly exceeds max batch size');
    if (vertCount >= gl_MAX_POLY_VERTEXES) return; // release-build safety net
    glSetPolyMode();
  
    // setup triangle strip with degenerate verts at start and end
    let offset = glBatchCount * gl_INDICES_PER_POLY_VERTEX;
    for (let i = vertCount; i--;)
    {
        const j = clamp(i-1, 0, vertCount-3);
        const point = points[j];
        const color = pointColors[j];
        glPositionData[offset++] = point.x;
        glPositionData[offset++] = point.y;
        glColorData[offset++] = color & glColorMask;
    }
    glBatchCount += vertCount;
}

/** Set the WebGL render target to the given texture or back to the canvas
 *  - What is drawn into a texture is stored premultiplied, and draws of that texture blend it as such
 *  @param {WebGLTexture} [texture] - a texture or undefined to use normal glCanvas
 *  @param {boolean} [clear] - should the render target be cleared, to canvasClearColor, CLEAR_BLACK for a transparent one
 *  @memberof WebGL */
function glSetRenderTarget(texture, clear=false)
{
    // what was batched so far draws where it was meant to, before the target changes
    glFlush();
    const previousTarget = glRenderTarget;
    if (texture)
    {
        if (glMipmapsUntilTarget.has(texture))
        {
            // a layer at a size other than a power of two draws without mipmaps as it always has,
            // so they are not made again after every redraw, the 3D renderer still makes its own
            glMipmapsUntilTarget.delete(texture);
            glMipmappedTextures.delete(texture);
            glContext.bindTexture(glContext.TEXTURE_2D, texture);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
            glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
        }
        glPremultipliedTextures.add(texture); // the blend writes premultiplied color into it
        // coming from the canvas, keep its transform and blend mode to put back after
        glRenderTarget || (glRenderTargetSaved = [glTransform, glAdditive]);
        glRenderTarget = texture;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, glFramebuffer);
        glContext.framebufferTexture2D(glContext.FRAMEBUFFER, 
            glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, texture, 0);
        glPreRender(clear);
    }
    else
    {
        glRenderTarget = undefined;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);

        // use the backing store size, mainCanvasSize is css pixels and may
        // still be the render target's size when unwinding a layer redraw
        glContext.viewport(0, 0, glCanvas.width, glCanvas.height);

        // the canvas's own transform and blend mode again, the target set its own
        if (glRenderTargetSaved)
        {
            [glTransform, glAdditive] = glRenderTargetSaved;
            glRenderTargetSaved = undefined;
            for (const program of [glPolyShader, glShader])
            {
                glContext.useProgram(program);
                glContext.uniformMatrix4fv(glUniformLocation(program, 'm'), false, glTransform);
            }
            glBatchAdditive = glAdditive;
            glSetInstancedMode(true);
        }
    }

    // a target with mipmaps drawn into has only its top level new, the smaller levels are made again from it
    // the next time it is drawn from
    if (previousTarget && previousTarget !== texture && glMipmappedTextures.has(previousTarget))
        glMipmapsStale.add(previousTarget);
}

/** Clear out a rectangle area of the WebGL canvas or render target
 *  - In framebuffer pixels from the bottom left: backing store pixels on the canvas, texture pixels in a
 *    render target
 *  @param {number} x
 *  @param {number} y
 *  @param {number} width
 *  @param {number} height
 *  @memberof WebGL */
function glClearRect(x, y, width, height)
{
    if (!glEnable) return;
    glFlush(); // tiles batched before the clear go down before it, not over what replaces them

    // Enable scissor test to clear only the specified area
    glContext.enable(glContext.SCISSOR_TEST);
    glContext.scissor(x, y, width, height);
    glContext.clearColor(0, 0, 0, 0);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
    glContext.disable(glContext.SCISSOR_TEST);
}

///////////////////////////////////////////////////////////////////////////////

// WebGL internal function to convert polygon to outline triangle strip
function glMakeOutline(points, width, wrap=true)
{
    if (points.length < 2)
        return [];
    
    const halfWidth = width / 2;
    const strip = [];
    const n = points.length;
    const e = 1e-6;
    // miter ratio cap (dimensionless, matches SVG/Canvas2D convention)
    const miterLimit = 10;
    for (let i = 0; i < n; i++)
    {
        // for each vertex, calculate normal based on adjacent edges
        const prev = points[wrap ? (i - 1 + n) % n : max(i - 1, 0)];
        const curr = points[i];
        const next = points[wrap ? (i + 1) % n : min(i + 1, n - 1)];
        
        // direction from previous to current
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const len1 = (dx1*dx1 + dy1*dy1)**.5;
        
        // direction from current to next
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const len2 = (dx2*dx2 + dy2*dy2)**.5;
        
        if (len1 < e && len2 < e)
            continue; // skip degenerate point
        
        // calculate perpendicular normals for each edge
        const nx1 = len1 > e ? -dy1 / len1 : 0;
        const ny1 = len1 > e ?  dx1 / len1 : 0;
        const nx2 = len2 > e ? -dy2 / len2 : 0;
        const ny2 = len2 > e ?  dx2 / len2 : 0;
        
        // average the normals for miter
        let nx = nx1 + nx2;
        let ny = ny1 + ny2;
        const nlen = (nx*nx + ny*ny)**.5;
        if (nlen < e)
        {
            // 180 degree turn - use perpendicular
            nx = nx1;
            ny = ny1;
        }
        else
        {
            // calculate miter length
            nx /= nlen;
            ny /= nlen;
            const dot = nx1 * nx + ny1 * ny;
            if (dot > e)
            {
                // scale normal by miter length, clamped to miterLimit
                const miterLength = min(1 / dot, miterLimit);
                nx *= miterLength;
                ny *= miterLength;
            }
        }
        
        // create inner and outer points along the normal
        const inner = vec2(curr.x - nx * halfWidth, curr.y - ny * halfWidth);
        const outer = vec2(curr.x + nx * halfWidth, curr.y + ny * halfWidth);
        strip.push(inner);
        strip.push(outer);
    }
    if (strip.length > 1 && wrap)
    {
        // close the loop
        strip.push(strip[0]);
        strip.push(strip[1]);
    }
    return strip;
}

// WebGL internal function to convert polys to tri strips
function glPolyStrip(points)
{
    // validate input
    if (points.length < 3)
        return [];
    
    // cross product helper: (b-a) x (c-a)
    const cross = (a,b,c)=> (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

    // calculate signed area of polygon
    const signedArea = (poly)=>
    {
        let area = 0;
        for (let i = poly.length; i--;)
        {
            const j = (i+1) % poly.length;
            area += poly[i].cross(poly[j]);
        }
        return area;
    }

    // ensure counter-clockwise winding (slice first so we don't mutate caller's array)
    if (signedArea(points) < 0)
        points = points.slice().reverse();

    // a convex polygon, which every circle, ellipse and regular polygon is, zigzags between its two sides
    // into one strip with no bridges, so it skips the ear clipping below and draws with a fifth of the vertices
    // convex is every corner turning left, and the edges going right then left only once each way round, since
    // a star listed point by point also turns left at every corner but winds around twice
    const e = 1e-9, n = points.length;
    let convex = true, flips = 0, lastSide = 0;
    for (let i = 0; convex && i < n; ++i)
    {
        const a = points[(i + n - 1) % n], b = points[i], dx = points[(i + 1) % n].x - b.x;
        convex = cross(a, b, points[(i + 1) % n]) > -e;
        const side = dx > e ? 1 : dx < -e ? -1 : 0;
        if (side && side !== lastSide)
            lastSide && ++flips, lastSide = side;
    }
    if (convex && flips <= 2)
    {
        const strip = [points[0]];
        for (let i = 1, j = n - 1; i <= j; ++i, --j)
        {
            strip.push(points[i]);
            i === j || strip.push(points[j]);
        }
        return strip;
    }

    // check if point is inside triangle
    const pointInTriangle = (p, a, b, c)=>
    {
        const c1 = cross(a, b, p);
        const c2 = cross(b, c, p);
        const c3 = cross(c, a, p);
        const negative = (c1<-e?1:0) + (c2<-e?1:0) + (c3<-e?1:0);
        const positive = (c1> e?1:0) + (c2> e?1:0) + (c3> e?1:0);
        return !(negative && positive);
    };

    // ear clipping triangulation
    const indices = [];
    for (let i = 0; i < points.length; ++i)
        indices[i] = i;
    const triangles = [];
    let attempts = 0;
    const maxAttempts = points.length ** 2 + 100;
    while (indices.length > 3 && attempts++ < maxAttempts)
    {
        let foundEar = false;
        for (let i = 0; i < indices.length; i++)
        {
            const i0 = indices[(i + indices.length - 1) % indices.length];
            const i1 = indices[i];
            const i2 = indices[(i + 1) % indices.length];
            const a = points[i0], b = points[i1], c = points[i2];

            // check if convex
            if (cross(a, b, c) < e) continue;
                
            // check if any other point is inside
            let hasInside = false;
            for (let j = 0; j < indices.length; j++)
            {
                const k = indices[j];
                if (k === i0 || k === i1 || k === i2) continue;

                const p = points[k];
                hasInside = pointInTriangle(p, a, b, c);
                if (hasInside) break;
            }
            if (hasInside) continue;

            // found valid ear
            triangles.push([i0, i1, i2]);
            indices.splice(i, 1);
            foundEar = true;
            break;
        }

        // fallback for degenerate cases
        if (!foundEar)
        {
            let worstIndex = -1, worstValue = Infinity;
            for (let i = 0; i < indices.length; i++)
            {
                const i0 = indices[(i + indices.length - 1) % indices.length];
                const i1 = indices[i];
                const i2 = indices[(i + 1) % indices.length];
                const value = abs(cross(points[i0], points[i1], points[i2]));
                if (value < worstValue)
                {
                    worstValue = value;
                    worstIndex = i;
                }
            }
            if (worstIndex < 0) break;
            
            const i0 = indices[(worstIndex + indices.length - 1) % indices.length];
            const i1 = indices[worstIndex];
            const i2 = indices[(worstIndex + 1) % indices.length];
            triangles.push([i0, i1, i2]);
            indices.splice(worstIndex, 1);
        }
    }
    
    // add final triangle
    if (indices.length === 3)
        triangles.push([indices[0], indices[1], indices[2]]);
    if (!triangles.length)
        return [];

    // convert triangles to triangle strip with degenerate connectors
    const strip = [];
    let [a0, b0, c0] = triangles[0];
    strip.push(points[a0], points[b0], points[c0]);
    for (let i = 1; i < triangles.length; i++)
    {
        // add degenerate bridge from last vertex to first of new triangle
        const [a, b, c] = triangles[i];
        strip.push(points[c0], points[a]);
        strip.push(points[a], points[b], points[c]);
        c0 = c;
    }
    return strip;
}