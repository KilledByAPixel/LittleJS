/**
 * LittleJS WebGL Interface
 * - All webgl used by the engine is wrapped up here
 * - For normal stuff you won't need to see or call anything in this file
 * - For advanced stuff there are helper functions to create shaders, textures, etc
 * - Can be disabled with glEnable to revert to 2D canvas rendering
 * - Batches sprite rendering on GPU for incredibly fast performance
 * - Sprite transform math is done in the shader where possible
 * - Supports shadertoy style post processing shaders
 * @namespace WebGL
 */

'use strict';

/** The WebGL canvas which appears above the main canvas and below the overlay canvas
 *  @type {HTMLCanvasElement}
 *  @memberof WebGL */
let glCanvas;

/** 2d context for glCanvas
 *  @type {WebGL2RenderingContext}
 *  @memberof WebGL */
let glContext;

/** Should webgl be setup with anti-aliasing? must be set before calling engineInit
 *  @type {boolean}
 *  @memberof WebGL */
let glAntialias = true;

// WebGL internal variables not exposed to documentation
let glShader, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glInstanceCount, glAdditive, glBatchAdditive;

// WebGL internal constants 
const gl_MAX_INSTANCES = 1e4;
const gl_INDICES_PER_INSTANCE = 11;
const gl_INSTANCE_BYTE_STRIDE = gl_INDICES_PER_INSTANCE * 4;
const gl_INSTANCE_BUFFER_SIZE = gl_MAX_INSTANCES * gl_INSTANCE_BYTE_STRIDE;

///////////////////////////////////////////////////////////////////////////////

// Initialize WebGL, called automatically by the engine
function glInit()
{
    if (!glEnable || headlessMode) return;

    // create the canvas and textures
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl2', {antialias:glAntialias});

    // create the webgl canvas
    const rootElement = mainCanvas.parentElement;
    rootElement.appendChild(glCanvas);

    // setup vertex and fragment shaders
    glShader = glCreateProgram(
        '#version 300 es\n' +     // specify GLSL ES version
        'precision highp float;'+ // use highp for better accuracy
        'uniform mat4 m;'+        // transform matrix
        'in vec2 g;'+             // in: geometry
        'in vec4 p,u,c,a;'+       // in: position/size, uvs, color, additiveColor
        'in float r;'+            // in: rotation
        'out vec2 v;'+            // out: uv
        'out vec4 d,e;'+          // out: color, additiveColor
        'void main(){'+           // shader entry point
        'vec2 s=(g-.5)*p.zw;'+    // get size offset
        'gl_Position=m*vec4(p.xy+s*cos(r)-vec2(-s.y,s)*sin(r),1,1);'+ // transform position
        'v=mix(u.xw,u.zy,g);'+    // pass uv to fragment shader
        'd=c;e=a;'+               // pass colors to fragment shader
        '}'                       // end of shader
        ,
        '#version 300 es\n' +     // specify GLSL ES version
        'precision highp float;'+ // use highp for better accuracy
        'uniform sampler2D s;'+   // texture
        'in vec2 v;'+             // in: uv
        'in vec4 d,e;'+           // in: color, additiveColor
        'out vec4 c;'+            // out: color
        'void main(){'+           // shader entry point
        'c=texture(s,v)*d+e;'+    // modulate texture by color plus additive
        '}'                       // end of shader
    );

    // init buffers
    const glInstanceData = new ArrayBuffer(gl_INSTANCE_BUFFER_SIZE);
    glPositionData = new Float32Array(glInstanceData);
    glColorData = new Uint32Array(glInstanceData);
    glArrayBuffer = glContext.createBuffer();
    glGeometryBuffer = glContext.createBuffer();

    // create the geometry buffer, triangle strip square
    const geometry = new Float32Array([glInstanceCount=0,0,1,0,0,1,1,1]);
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, geometry, glContext.STATIC_DRAW);
}

// Setup webgl render each frame, called automatically by engine
// Also used by tile layer rendering when redrawing tiles
function glPreRender()
{
    if (!glEnable || headlessMode) return;

    // set up the shader and canvas
    glClearCanvas();
    glContext.useProgram(glShader);
    glContext.activeTexture(glContext.TEXTURE0);
    if (textureInfos[0])
        glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture = textureInfos[0].glTexture);

    // set vertex attributes
    let offset = glAdditive = glBatchAdditive = 0;
    const initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        const stride = typeSize && gl_INSTANCE_BYTE_STRIDE; // only if not geometry
        const divisor = typeSize && 1; // only if not geometry
        const normalize = typeSize == 1; // only if color
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, divisor);
        offset += size*typeSize;
    }
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
    initVertexAttribArray('g', glContext.FLOAT, 0, 2); // geometry
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, gl_INSTANCE_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
    initVertexAttribArray('p', glContext.FLOAT, 4, 4); // position & size
    initVertexAttribArray('u', glContext.FLOAT, 4, 4); // texture coords
    initVertexAttribArray('c', glContext.UNSIGNED_BYTE, 1, 4); // color
    initVertexAttribArray('a', glContext.UNSIGNED_BYTE, 1, 4); // additiveColor
    initVertexAttribArray('r', glContext.FLOAT, 4, 1); // rotation
    
    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    const rotatedCam = cameraPos.rotate(-cameraAngle);
    const p = vec2(-1).subtract(rotatedCam.multiply(s));
    const ca = Math.cos(cameraAngle);
    const sa = Math.sin(cameraAngle);
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), false,
    [
        s.x  * ca,  s.y * sa, 0, 0,
        -s.x * sa,  s.y * ca, 0, 0,
        1,          1,        1, 0,
        p.x,        p.y,      0, 1
    ]);
}

/** Clear the canvas and setup the viewport
 *  @memberof WebGL */
function glClearCanvas()
{
    // clear and set to same size as main canvas
    glContext.viewport(0, 0, glCanvas.width=drawCanvas.width, glCanvas.height=drawCanvas.height);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
}

/** Set the WebGl texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @param {boolean} wrap - Should the texture wrap or clamp
 *  @memberof WebGL */
function glSetTexture(texture, wrap=false)
{
    // must flush cache with the old texture to set a new one
    if (headlessMode || texture == glActiveTexture)
        return;

    glFlush();
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture = texture);

    // set wrap mode
    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);
}

/** Compile WebGL shader of the given type, will throw errors if in debug mode
 *  @param {String} source
 *  @param {Number} type
 *  @return {WebGLShader}
 *  @memberof WebGL */
function glCompileShader(source, type)
{
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
 *  @param {String} vsSource
 *  @param {String} fsSource
 *  @return {WebGLProgram}
 *  @memberof WebGL */
function glCreateProgram(vsSource, fsSource)
{
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

/** Create WebGL texture from an image and init the texture settings
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} [image]
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    if (image && image.width)
    {
        glSetTextureData(texture, image);
        if (!tilesPixelated && isPowerOfTwo(image.width) && isPowerOfTwo(image.height))
        {
            // use mipmap filtering
            glContext.generateMipmap(glContext.TEXTURE_2D);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR_MIPMAP_LINEAR);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR);
            return texture;
        }
    }
    else
    {
        // create a white texture
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, 1, 1, 0, glContext.RGBA, glContext.UNSIGNED_BYTE, whitePixel);
    }
    
    // set texture filtering
    const filter = tilesPixelated ? glContext.NEAREST : glContext.LINEAR;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, filter);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, filter);
    return texture;
}


/** Deletes a WebGL texture
 *  @param {WebGLTexture} [texture]
 *  @memberof WebGL */
function glDeleteTexture(texture)
{
    glContext.deleteTexture(texture);
}

/** Set WebGL texture data from an image
 *  @param {WebGLTexture} texture
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} image
 *  @memberof WebGL */
function glSetTextureData(texture, image)
{
    // build the texture
    ASSERT(!!image && image.width > 0, 'Invalid image data.');
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, image);
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (!glEnable || !glInstanceCount) return;

    const destBlend = glBatchAdditive ? glContext.ONE : glContext.ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(glContext.SRC_ALPHA, destBlend, glContext.ONE, destBlend);
    glContext.enable(glContext.BLEND);

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(glContext.ARRAY_BUFFER, 0, glPositionData);
    glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, glInstanceCount);
    if (debug || showWatermark)
        drawCount += glInstanceCount;
    glInstanceCount = 0;
    glBatchAdditive = glAdditive;
}

/** Flush any sprites still in the buffer and copy to main canvas
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @memberof WebGL */
function glCopyToContext(context)
{
    if (!glEnable)
        return;

    glFlush();
    context.drawImage(glCanvas, 0, 0);
}

/** Set anti-aliasing for webgl canvas
 *  @param {boolean} [antialias]
 *  @memberof WebGL */
function glSetAntialias(antialias=true)
{
    ASSERT(!glCanvas, 'must be called before engineInit');
    glAntialias = antialias;
}

/** Add a sprite to the gl draw list, used by all gl draw functions
 *  @param {Number} x
 *  @param {Number} y
 *  @param {Number} sizeX
 *  @param {Number} sizeY
 *  @param {Number} [angle]
 *  @param {Number} [uv0X]
 *  @param {Number} [uv0Y]
 *  @param {Number} [uv1X]
 *  @param {Number} [uv1Y]
 *  @param {Number} [rgba=-1] - white is -1
 *  @param {Number} [rgbaAdditive=0] - black is 0
 *  @memberof WebGL */
function glDraw(x, y, sizeX, sizeY, angle=0, uv0X=0, uv0Y=0, uv1X=1, uv1Y=1, rgba=-1, rgbaAdditive=0)
{
    // flush if there is not enough room or if different blend mode
    if (glInstanceCount >= gl_MAX_INSTANCES || glBatchAdditive != glAdditive)
        glFlush();

    let offset = glInstanceCount++ * gl_INDICES_PER_INSTANCE;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv0Y;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    glPositionData[offset++] = angle;
}