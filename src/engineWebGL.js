/**
 * LittleJS WebGL Interface
 * - All WebGL used by the engine is wrapped up here
 * - Will fall back to 2D canvas rendering if WebGL is not supported
 * - For normal stuff you won't need to see or call anything in this file
 * - For advanced stuff there are helper functions to create shaders, textures, etc
 * - Can be disabled with glEnable to revert to 2D canvas rendering
 * - Batches sprite rendering on GPU for incredibly fast performance
 * - Sprite transform math is done in the shader where possible
 * - Supports shadertoy style post processing shaders via plugin
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
let glShader, glPolyShader, glPolyMode, glAdditive, glBatchAdditive, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glBatchCount, glTextureInfos, glCanBeEnabled = true;

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
function glInit(rootElement)
{
    // keep set of texture infos so they can be restored if context is lost
    glTextureInfos = new Set;

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
    
    // startup webgl
    initWebGL();

    // setup context lost and restore handlers
    glCanvas.addEventListener('webglcontextlost', (e)=>
    {
        glEnable = false; // disable WebGL rendering
        glCanvas.style.display = 'none'; // hide the gl canvas
        e.preventDefault(); // prevent default to allow restoration
        LOG('WebGL context lost! Switching to Canvas2d rendering.');

        // remove WebGL textures
        for (const info of glTextureInfos)
            info.glTexture = undefined;
        glActiveTexture = undefined;
        pluginList.forEach(plugin=>plugin.glContextLost?.());
    });
    glCanvas.addEventListener('webglcontextrestored', ()=>
    {
        glEnable = true; // re-enable WebGL rendering
        glCanvas.style.display = ''; // show the gl canvas
        LOG('WebGL context restored, reinitializing...');

        // reinit WebGL and restore textures
        initWebGL();
        for (const info of glTextureInfos)
            info.glTexture = glCreateTexture(info.image);
        pluginList.forEach(plugin=>plugin.glContextRestored?.());
    });

    function initWebGL()
    {
        // setup instanced rendering shader program
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

        // create the geometry buffer, triangle strip square
        const geometry = new Float32Array([glBatchCount=0,0,1,0,0,1,1,1]);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, geometry, glContext.STATIC_DRAW);
    }
}

function glSetInstancedMode()
{
    if (!glPolyMode)
        return;
    
    // setup instanced mode
    glFlush();
    glPolyMode = false;
    glContext.useProgram(glShader);

    // set vertex attributes
    let offset = 0;
    const initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        const stride = typeSize && gl_INSTANCE_BYTE_STRIDE; // only if not geometry
        const divisor = typeSize && 1; // only if not geometry
        const normalize = typeSize === 1; // only if color
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, divisor);
        offset += size*typeSize;
    }
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
    initVertexAttribArray('g', glContext.FLOAT, 0, 2); // geometry
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
    initVertexAttribArray('p', glContext.FLOAT, 4, 4); // position & size
    initVertexAttribArray('u', glContext.FLOAT, 4, 4); // texture coords
    initVertexAttribArray('c', glContext.UNSIGNED_BYTE, 1, 4); // color
    initVertexAttribArray('a', glContext.UNSIGNED_BYTE, 1, 4); // additiveColor
    initVertexAttribArray('r', glContext.FLOAT, 4, 1); // rotation
}

function glSetPolyMode()
{
    if (glPolyMode)
        return;
    
    // setup poly mode
    glFlush();
    glPolyMode = true;
    glContext.useProgram(glPolyShader);

    // set vertex attributes
    let offset = 0;
    const initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glPolyShader, name);
        const normalize = typeSize === 1; // only normalize if color
        const stride = gl_POLY_VERTEX_BYTE_STRIDE;
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, 0);
        offset += size*typeSize;
    }
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
    initVertexAttribArray('p', glContext.FLOAT, 4, 2);         // position
    initVertexAttribArray('c', glContext.UNSIGNED_BYTE, 1, 4); // color
}

// Setup WebGL render each frame, called automatically by engine
// Also used by tile layer rendering when redrawing tiles
function glPreRender()
{
    if (!glEnable || !glContext) return;

    // clear the canvas
    glClearCanvas();

    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    const rotatedCam = cameraPos.rotate(-cameraAngle);
    const p = vec2(-1).subtract(rotatedCam.multiply(s));
    const ca = cos(cameraAngle);
    const sa = sin(cameraAngle);
    const transform = [
        s.x  * ca,  s.y * sa, 0, 0,
        -s.x * sa,  s.y * ca, 0, 0,
        1,          1,        1, 0,
        p.x,        p.y,      0, 1];

    // set the same transform matrix for both shaders
    const initUniform = (program, uniform, value) =>
    {
        glContext.useProgram(program);
        const location = glContext.getUniformLocation(program, uniform);
        glContext.uniformMatrix4fv(location, false, value);
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

    // start with additive blending off
    glAdditive = glBatchAdditive = false;

    // force it to set instanced mode by first setting poly mode true
    glPolyMode = true;
    glSetInstancedMode();
}

/** Clear the canvas and setup the viewport
 *  @memberof WebGL */
function glClearCanvas()
{
    if (!glContext) return;

    // clear and set to same size as main canvas
    glCanvas.width = drawCanvas.width;
    glCanvas.height = drawCanvas.height;
    glContext.viewport(0, 0, glCanvas.width, glCanvas.height);
    const color = canvasClearColor;
    if (color.a > 0)
        glContext.clearColor(color.r, color.g, color.b, color.a);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
}

/** Set the WebGL texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @param {boolean} [wrap] - Should the texture wrap or clamp
 *  @memberof WebGL */
function glSetTexture(texture, wrap=false)
{
    // must flush cache with the old texture to set a new one
    if (!glContext || texture === glActiveTexture)
        return;

    glFlush();
    glActiveTexture = texture;
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);

    // set wrap mode
    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);
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

/** Create WebGL texture from an image and init the texture settings
 *  Restores the active texture when done
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} [image]
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    if (!glContext) return;

    // build the texture
    const texture = glContext.createTexture();
    let mipMap = false;
    if (image && image.width)
    {
        glSetTextureData(texture, image);
        glContext.bindTexture(glContext.TEXTURE_2D, texture);
        mipMap = !tilesPixelated && isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
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
    if (mipMap)
        glContext.generateMipmap(glContext.TEXTURE_2D);
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture); // rebind active texture
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
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} image
 *  @memberof WebGL */
function glSetTextureData(texture, image)
{
    if (!glContext) return;

    // build the texture
    ASSERT(!!image && image.width > 0, 'Invalid image data.');
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, image);
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture); // rebind active texture
}

/** Tells WebGL to create or update the glTexture and start tracking it
 *  @param {TextureInfo} textureInfo
 *  @memberof WebGL */
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
        textureInfo.glTexture = glCreateTexture(textureInfo.image);
}

/** Tells WebGL to destroy the glTexture and stop tracking it
 *  @param {TextureInfo} textureInfo
 *  @memberof WebGL */
function glUnregisterTextureInfo(textureInfo)
{
    if (headlessMode) return;

    // delete texture info from tracking list even if gl is not enabled
    glTextureInfos.delete(textureInfo);

    // unset and destroy the texture
    const glTexture = textureInfo.glTexture;
    textureInfo.glTexture = undefined;
    glDeleteTexture(glTexture);
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (glEnable && glContext && glBatchCount)
    {
        // set bend mode
        const destBlend = glBatchAdditive ? glContext.ONE : glContext.ONE_MINUS_SRC_ALPHA;
        glContext.blendFuncSeparate(glContext.SRC_ALPHA, destBlend, glContext.ONE, destBlend);
        glContext.enable(glContext.BLEND);
        
        const byteLength = glBatchCount * 
            (glPolyMode ? gl_INDICES_PER_POLY_VERTEX : gl_INDICES_PER_INSTANCE);
        glContext.bufferSubData(glContext.ARRAY_BUFFER, 0, glPositionData, 0, byteLength);
        
        // draw the batch
        if (glPolyMode)
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, glBatchCount);
        else
            glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, glBatchCount);
        drawCount += glBatchCount;
        glBatchCount = 0;
    }
    glBatchAdditive = glAdditive;
}

/** Flush any sprites still in the buffer and copy to main canvas
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @memberof WebGL */
function glCopyToContext(context)
{
    if (!glEnable || !glContext)
        return;

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
    if (glBatchCount >= gl_MAX_INSTANCES || glBatchAdditive !== glAdditive)
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
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    glPositionData[offset++] = angle;
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
    for (const p of points)
    {
        // transform the point
        const px = p.x*sx;
        const py = p.y*sy;
        const sa = sin(-angle);
        const ca = cos(-angle);
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
    glSetPolyMode();
  
    // setup triangle strip with degenerate verts at start and end
    let offset = glBatchCount * gl_INDICES_PER_POLY_VERTEX;
    for (let i = vertCount; i--;)
    {
        const j = clamp(i-1, 0, vertCount-3);
        const point = points[j];
        glPositionData[offset++] = point.x;
        glPositionData[offset++] = point.y;
        glColorData[offset++] = rgba;
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
        glColorData[offset++] = color;
    }
    glBatchCount += vertCount;
}

// WebGL internal function to convert polygon to outline triangle strip
function glMakeOutline(points, width, wrap=true)
{
    if (points.length < 2)
        return [];
    
    const halfWidth = width / 2;
    const strip = [];
    const n = points.length;
    const e = 1e-6;
    const miterLimit = width*100;
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

    // ensure counter-clockwise winding
    if (signedArea(points) < 0)
        points = points.reverse();

    // check if point is inside triangle
    const e = 1e-9;
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
            if (cross(a, b, c) < e)
                continue;
                
            // check if any other point is inside
            let hasInside = false;
            for (let j = 0; j < indices.length; j++)
            {
                const k = indices[j];
                if (k === i0 || k === i1 || k === i2)
                    continue;
                const p = points[k];
                hasInside = pointInTriangle(p, a, b, c);
                if (hasInside)
                    break;
            }
            if (hasInside)
                continue;

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
            if (worstIndex < 0)
                break;
            
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