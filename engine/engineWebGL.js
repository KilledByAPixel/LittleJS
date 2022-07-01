/** 
 * LittleJS WebGL Interface
 * <br> - All webgl used by the engine is wrapped up here
 * <br> - For normal stuff you won't need to see or call anything in this file
 * <br> - For advanced stuff there are helper functions to create shaders, textures, etc
 * <br> - Can be disabled with glEnable to revert to 2D canvas rendering
 * <br> - Batches sprite rendering on GPU for incredibly fast performance
 * <br> - Sprite transform math is done in the shader where possible
 * @namespace WebGL
 */

'use strict';

/** The WebGL canvas which appears above the main canvas and below the overlay canvas
 *  @type {HTMLCanvasElement}
 *  @memberof WebGL */
let glCanvas;

/** 2d context for glCanvas 
 *  @type {WebGLRenderingContext}
 *  @memberof WebGL */
let glContext;

/** Main tile sheet texture automatically loaded by engine
 *  @type {WebGLTexture}
 *  @memberof WebGL */
let glTileTexture;

// WebGL internal variables not exposed to documentation
let glActiveTexture, glShader, glPositionData, glColorData, glBatchCount, glBatchAdditive, glAdditive;

///////////////////////////////////////////////////////////////////////////////

// Init WebGL, called automatically by the engine
function glInit()
{
    if (!glEnable) return;

    // create the canvas and tile texture
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl', {antialias: false});
    glCanvas.style = styleCanvas;
    glTileTexture = glCreateTexture(tileImage);

    // some browsers are much faster without copying the gl buffer so we just overlay it instead
    glOverlay && document.body.appendChild(glCanvas);

    // setup vertex and fragment shaders
    glShader = glCreateProgram(
        'precision highp float;'+     // use highp for better accuracy
        'uniform mat4 m;'+            // transform matrix
        'attribute vec2 p,t;'+        // position, uv
        'attribute vec4 c,a;'+        // color, additiveColor
        'varying vec2 v;'+            // return uv
        'varying vec4 d,e;'+          // return color, additiveColor
        'void main(){'+               // shader entry point
        'gl_Position=m*vec4(p,1,1);'+ // transform position
        'v=t;d=c;e=a;'+               // pass stuff to fragment shader
        '}'                           // end of shader
        ,
        'precision highp float;'+           // use highp for better accuracy
        'varying vec2 v;'+                  // uv
        'varying vec4 d,e;'+                // color, additiveColor
        'uniform sampler2D s;'+             // texture
        'void main(){'+                     // shader entry point
        'gl_FragColor=texture2D(s,v)*d+e;'+ // modulate texture by color plus additive
        '}'                                 // end of shader
    );

    // init buffers
    const glVertexData = new ArrayBuffer(gl_MAX_BATCH * gl_VERTICES_PER_QUAD * gl_VERTEX_BYTE_STRIDE);
    glCreateBuffer(gl_ARRAY_BUFFER, glVertexData.byteLength, gl_DYNAMIC_DRAW);
    glPositionData = new Float32Array(glVertexData);
    glColorData = new Uint32Array(glVertexData);

    // setup the vertex data array
    let offset = glBatchCount = 0;
    const initVertexAttribArray = (name, type, typeSize, size, normalize=0)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, gl_VERTEX_BYTE_STRIDE, offset);
        offset += size*typeSize;
    }
    initVertexAttribArray('p', gl_FLOAT, 4, 2);            // position
    initVertexAttribArray('t', gl_FLOAT, 4, 2);            // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4, 1); // color
    initVertexAttribArray('a', gl_UNSIGNED_BYTE, 1, 4, 1); // additiveColor
}

/** Set the WebGl blend mode, normally you should call setBlendMode instead
 *  @param {Boolean} [additive=0]
 *  @memberof WebGL */
function glSetBlendMode(additive)
{
    if (!glEnable) return;
        
    // setup blending
    glAdditive = additive;
}

/** Set the WebGl texture, not normally necessary unless multiple tile sheets are used
 *  <br> - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} [texture=glTileTexture]
 *  @memberof WebGL */
function glSetTexture(texture=glTileTexture)
{
    if (!glEnable) return;
    
    // must flush cache with the old texture to set a new one
    if (texture != glActiveTexture)
        glFlush();

    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
}

/** Compile WebGL shader of the given type, will throw errors if in debug mode
 *  @param {String} source
 *  @param          type
 *  @return {WebGLShader}
 *  @memberof WebGL */
function glCompileShader(source, type)
{
    if (!glEnable) return;

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
 *  @param {WebGLShader} vsSource
 *  @param {WebGLShader} fsSource
 *  @return {WebGLProgram}
 *  @memberof WebGL */
function glCreateProgram(vsSource, fsSource)
{
    if (!glEnable) return;

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

/** Create WebGL buffer
 *  @param bufferType
 *  @param size
 *  @param usage
 *  @return {WebGLBuffer}
 *  @memberof WebGL */
function glCreateBuffer(bufferType, size, usage)
{
    if (!glEnable) return;

    // build the buffer
    const buffer = glContext.createBuffer();
    glContext.bindBuffer(bufferType, buffer);
    glContext.bufferData(bufferType, size, usage);
    return buffer;
}

/** Create WebGL texture from an image and set the texture settings
 *  @param {Image} image
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    if (!glEnable || !image || !image.width) return;

    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);
        
    // use point filtering for pixelated rendering
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, cavasPixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, cavasPixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_S, gl_CLAMP_TO_EDGE);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_T, gl_CLAMP_TO_EDGE);
    return texture;
}

// called automatically by engine before render
function glPreRender(width, height, cameraX, cameraY, cameraScale)
{
    if (!glEnable) return;

    // clear and set to same size as main canvas
    glContext.viewport(0, 0, glCanvas.width = width, glCanvas.height = height);
    glContext.clear(gl_COLOR_BUFFER_BIT);

    // set up the shader
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = glTileTexture);
    glContext.useProgram(glShader);
    glSetBlendMode();

    // build the transform matrix
    const sx = 2 * cameraScale / width;
    const sy = 2 * cameraScale / height;
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), 0,
        new Float32Array([
            sx, 0, 0, 0,
            0, sy, 0, 0,
            1, 1, -1, 1,
            -1-sx*cameraX, -1-sy*cameraY, 0, 0
        ])
    );
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (!glEnable || !glBatchCount) return;

    const destBlend = glBatchAdditive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, 
        glPositionData.subarray(0, glBatchCount * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT));
    glContext.drawArrays(gl_TRIANGLES, 0, glBatchCount * gl_VERTICES_PER_QUAD);
    glBatchCount = 0;
    glBatchAdditive = glAdditive;
}

/** Draw any sprites still in the buffer, copy to main canvas and clear
 *  @param {CanvasRenderingContext2D} context
 *  @param {Boolean} [forceDraw=0]
 *  @memberof WebGL */
function glCopyToContext(context, forceDraw)
{
    if ((!glEnable || !glBatchCount) && !forceDraw) return;
    
    glFlush();
    
    // do not draw in overlay mode because the canvas is visible
    if (!glOverlay || forceDraw)
        context.drawImage(glCanvas, 0, 0);
}

/** Add a sprite to the gl draw list, used by all gl draw functions
 *  @param x
 *  @param y
 *  @param sizeX
 *  @param sizeY
 *  @param angle
 *  @param uv0X
 *  @param uv0Y
 *  @param uv1X
 *  @param uv1Y
 *  @param [rgba=0xffffffff]
 *  @param [rgbaAdditive=0]
 *  @memberof WebGL */
function glDraw(x, y, sizeX, sizeY, angle, uv0X, uv0Y, uv1X, uv1Y, rgba=0xffffffff, rgbaAdditive=0)
{
    if (!glEnable) return;

    // flush if there is no room for more verts or if different blend mode
    if (glBatchCount == gl_MAX_BATCH || glBatchAdditive != glAdditive)
        glFlush();

    // prepare to create the verts from size and angle
    const c = Math.cos(angle)/2, s = Math.sin(angle)/2;
    const cx = c*sizeX, cy = c*sizeY, sx = s*sizeX, sy = s*sizeY;
        
    // setup 2 triangles to form a quad
    let offset = glBatchCount++ * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT;

    // vertex 0
    glPositionData[offset++] = x - cx - sy;
    glPositionData[offset++] = y - cy + sx;
    glPositionData[offset++] = uv0X; glPositionData[offset++] = uv1Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;
    
    // vertex 1
    glPositionData[offset++] = x + cx + sy;
    glPositionData[offset++] = y + cy - sx;
    glPositionData[offset++] = uv1X; glPositionData[offset++] = uv0Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;
    
    // vertex 2
    glPositionData[offset++] = x - cx + sy;
    glPositionData[offset++] = y + cy + sx;
    glPositionData[offset++] = uv0X; glPositionData[offset++] = uv0Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;
    
    // vertex 0
    glPositionData[offset++] = x - cx - sy;      
    glPositionData[offset++] = y - cy + sx;  
    glPositionData[offset++] = uv0X; glPositionData[offset++] = uv1Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;

    // vertex 3
    glPositionData[offset++] = x + cx - sy;
    glPositionData[offset++] = y - cy - sx;
    glPositionData[offset++] = uv1X; glPositionData[offset++] = uv1Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;

    // vertex 1
    glPositionData[offset++] = x + cx + sy;
    glPositionData[offset++] = y + cy - sx;
    glPositionData[offset++] = uv1X; glPositionData[offset++] = uv0Y;
    glColorData[offset++]    = rgba; glColorData[offset++]    = rgbaAdditive;
}

///////////////////////////////////////////////////////////////////////////////
// store gl constants as integers so their name doesn't use space in minifed
const 
gl_ONE = 1,
gl_TRIANGLES = 4,
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
gl_TEXTURE_WRAP_S = 10242,
gl_TEXTURE_WRAP_T = 10243,
gl_COLOR_BUFFER_BIT = 16384,
gl_CLAMP_TO_EDGE = 33071,
gl_ARRAY_BUFFER = 34962,
gl_DYNAMIC_DRAW = 35048,
gl_FRAGMENT_SHADER = 35632, 
gl_VERTEX_SHADER = 35633,
gl_COMPILE_STATUS = 35713,
gl_LINK_STATUS = 35714,

// constants for batch rendering
gl_VERTICES_PER_QUAD = 6,
gl_INDICIES_PER_VERT = 6,
gl_MAX_BATCH = 1<<16,
gl_VERTEX_BYTE_STRIDE = (4 * 2) * 2 + (4) * 2; // vec2 * 2 + (char * 4) * 2