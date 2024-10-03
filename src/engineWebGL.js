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

// WebGL internal variables not exposed to documentation
let glShader, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glInstanceCount, glAdditive, glBatchAdditive;

///////////////////////////////////////////////////////////////////////////////

// Initalize WebGL, called automatically by the engine
function glInit()
{
    if (!glEnable || headlessMode) return;

    // create the canvas and textures
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl2');

    // some browsers are much faster without copying the gl buffer so we just overlay it instead
    glOverlay && document.body.appendChild(glCanvas);

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
    glContext.bindBuffer(gl_ARRAY_BUFFER, glGeometryBuffer);
    glContext.bufferData(gl_ARRAY_BUFFER, geometry, gl_STATIC_DRAW);
}

// Setup render each frame, called automatically by engine
function glPreRender()
{
    if (!glEnable || headlessMode) return;

    // clear and set to same size as main canvas
    glContext.viewport(0, 0, glCanvas.width=mainCanvas.width, glCanvas.height=mainCanvas.height);
    glContext.clear(gl_COLOR_BUFFER_BIT);

    // set up the shader
    glContext.useProgram(glShader);
    glContext.activeTexture(gl_TEXTURE0);
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = textureInfos[0].glTexture);

    // set vertex attributes
    let offset = glAdditive = glBatchAdditive = 0;
    let initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        const stride = typeSize && gl_INSTANCE_BYTE_STRIDE; // only if not geometry
        const divisor = typeSize && 1; // only if not geometry
        const normalize = typeSize==1; // only if color
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, divisor);
        offset += size*typeSize;
    }
    glContext.bindBuffer(gl_ARRAY_BUFFER, glGeometryBuffer);
    initVertexAttribArray('g', gl_FLOAT, 0, 2); // geometry
    glContext.bindBuffer(gl_ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(gl_ARRAY_BUFFER, gl_INSTANCE_BUFFER_SIZE, gl_DYNAMIC_DRAW);
    initVertexAttribArray('p', gl_FLOAT, 4, 4); // position & size
    initVertexAttribArray('u', gl_FLOAT, 4, 4); // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4); // color
    initVertexAttribArray('a', gl_UNSIGNED_BYTE, 1, 4); // additiveColor
    initVertexAttribArray('r', gl_FLOAT, 4, 1); // rotation

    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    const p = vec2(-1).subtract(cameraPos.multiply(s));
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), false,
        [
            s.x, 0,   0,   0,
            0,   s.y, 0,   0,
            1,   1,   1,   1,
            p.x, p.y, 0,   0
        ]
    );
}

/** Set the WebGl texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @memberof WebGL */
function glSetTexture(texture)
{
    // must flush cache with the old texture to set a new one
    if (headlessMode || texture == glActiveTexture)
        return;

    glFlush();
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
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
    if (debug && !glContext.getShaderParameter(shader, gl_COMPILE_STATUS))
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
    glContext.attachShader(program, glCompileShader(vsSource, gl_VERTEX_SHADER));
    glContext.attachShader(program, glCompileShader(fsSource, gl_FRAGMENT_SHADER));
    glContext.linkProgram(program);

    // check for errors
    if (debug && !glContext.getProgramParameter(program, gl_LINK_STATUS))
        throw glContext.getProgramInfoLog(program);
    return program;
}

/** Create WebGL texture from an image and init the texture settings
 *  @param {HTMLImageElement} image
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    if (image)
        glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);

    // use point filtering for pixelated rendering
    const filter = canvasPixelated ? gl_NEAREST : gl_LINEAR;
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, filter);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, filter);
    return texture;
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (!glInstanceCount) return;

    const destBlend = glBatchAdditive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, glPositionData);
    glContext.drawArraysInstanced(gl_TRIANGLE_STRIP, 0, 4, glInstanceCount);
    if (showWatermark)
        drawCount += glInstanceCount;
    glInstanceCount = 0;
    glBatchAdditive = glAdditive;
}

/** Draw any sprites still in the buffer, copy to main canvas and clear
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @param {Boolean} [forceDraw]
 *  @memberof WebGL */
function glCopyToContext(context, forceDraw=false)
{
    if (!glEnable || !glInstanceCount && !forceDraw) return;

    glFlush();

    // do not draw in overlay mode because the canvas is visible
    if (!glOverlay || forceDraw)
        context.drawImage(glCanvas, 0, 0);
}

/** Add a sprite to the gl draw list, used by all gl draw functions
 *  @param {Number} x
 *  @param {Number} y
 *  @param {Number} sizeX
 *  @param {Number} sizeY
 *  @param {Number} angle
 *  @param {Number} uv0X
 *  @param {Number} uv0Y
 *  @param {Number} uv1X
 *  @param {Number} uv1Y
 *  @param {Number} rgba
 *  @param {Number} [rgbaAdditive=0]
 *  @memberof WebGL */
function glDraw(x, y, sizeX, sizeY, angle, uv0X, uv0Y, uv1X, uv1Y, rgba, rgbaAdditive=0)
{
    ASSERT(typeof rgba == 'number' && typeof rgbaAdditive == 'number', 'invalid color');

    // flush if there is not enough room or if different blend mode
    if (glInstanceCount >= gl_MAX_INSTANCES || glBatchAdditive != glAdditive)
        glFlush();

    let offset = glInstanceCount * gl_INDICIES_PER_INSTANCE;
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
    glInstanceCount++;
}

///////////////////////////////////////////////////////////////////////////////
// store gl constants as integers so their name doesn't use space in minifed
const
gl_ONE = 1,
gl_TRIANGLE_STRIP = 5,
gl_SRC_ALPHA = 770,
gl_ONE_MINUS_SRC_ALPHA = 771,
gl_BLEND = 3042,
gl_TEXTURE_2D = 3553,
gl_UNSIGNED_BYTE = 5121,
gl_FLOAT = 5126,
gl_RGBA = 6408,
gl_NEAREST = 9728,
gl_LINEAR = 9729,
gl_TEXTURE_MAG_FILTER = 10240,
gl_TEXTURE_MIN_FILTER = 10241,
gl_COLOR_BUFFER_BIT = 16384,
gl_TEXTURE0 = 33984,
gl_ARRAY_BUFFER = 34962,
gl_STATIC_DRAW = 35044,
gl_DYNAMIC_DRAW = 35048,
gl_FRAGMENT_SHADER = 35632,
gl_VERTEX_SHADER = 35633,
gl_COMPILE_STATUS = 35713,
gl_LINK_STATUS = 35714,
gl_UNPACK_FLIP_Y_WEBGL = 37440,

// constants for batch rendering
gl_INDICIES_PER_INSTANCE = 11,
gl_MAX_INSTANCES = 1e4,
gl_INSTANCE_BYTE_STRIDE = gl_INDICIES_PER_INSTANCE * 4, // 11 * 4
gl_INSTANCE_BUFFER_SIZE = gl_MAX_INSTANCES * gl_INSTANCE_BYTE_STRIDE;