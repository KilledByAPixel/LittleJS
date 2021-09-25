/*
    LittleJS WebGL Interface
    - All webgl used by the engine is wrapped up here
    - Can be disabled with glEnable to revert to 2D canvas rendering
    - Batches sprite rendering on GPU for incredibly fast performance
    - Sprite transform math is done in the shader where possible
    - For normal stuff you won't need to call any functions in this file
    - For advanced stuff there are helper functions to create shaders, textures, etc
*/

'use strict';

let glCanvas, glContext, glTileTexture, glActiveTexture, glShader, 
    glPositionData, glColorData, glBatchCount, glDirty, glAdditive, glOverlay;

function glInit()
{
    if (!glEnable) return;

    // create the canvas and tile texture
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl', {antialias:!pixelated});
    glTileTexture = glCreateTexture(tileImage);

    if (glOverlay)
    {
        // firefox is much faster without copying the gl buffer so we just overlay it with some tradeoffs
        document.body.appendChild(glCanvas);
        glCanvas.style = mainCanvas.style.cssText;
    }

    // setup vertex and fragment shaders
    glShader = glCreateProgram(
        'precision lowp float;'+    // use lowp for better performance
        'uniform mat4 m;'+          // transform matrix
        'attribute float a;'+       // angle
        'attribute vec2 p,s,t;'+    // position, size, uv
        'attribute vec4 c,b;'+      // color, additiveColor
        'varying vec2 v;'+          // return uv
        'varying vec4 d,e;'+        // return color, additiveColor
        'void main(){'+             // shader entry point
        'gl_Position=m*vec4((s*cos(-a)+vec2(-s.y,s.x)*sin(-a))*.5+p,1,1);'+// transform position
        'v=t;d=c;e=b;'+             // pass stuff to fragment shader
        '}'                         // end of shader
        ,
        'precision lowp float;'+             // use lowp for better performance
        'varying vec2 v;'+                   // uv
        'varying vec4 d,e;'+                 // color, additiveColor
        'uniform sampler2D j;'+              // texture
        'void main(){'+                      // shader entry point
        'gl_FragColor=texture2D(j,v)*d+e;'+  // modulate texture by color plus additive
        '}'                                  // end of shader
    );

    // init buffers
    const glVertexData = new ArrayBuffer(gl_MAX_BATCH * gl_VERTICES_PER_QUAD * gl_VERTEX_BYTE_STRIDE);
    glCreateBuffer(gl_ARRAY_BUFFER, glVertexData.byteLength, gl_DYNAMIC_DRAW);
    glPositionData = new Float32Array(glVertexData);
    glColorData = new Uint32Array(glVertexData);

    // setup the vertex data array
    const initVertexAttribArray = (name, type, typeSize, size, normalize=0)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, gl_VERTEX_BYTE_STRIDE, offset);
        offset += size*typeSize;
    }
    let offset = glDirty = glBatchCount = 0;
    initVertexAttribArray('a', gl_FLOAT, 4, 1);            // angle
    initVertexAttribArray('p', gl_FLOAT, 4, 2);            // position
    initVertexAttribArray('s', gl_FLOAT, 4, 2);            // size
    initVertexAttribArray('t', gl_FLOAT, 4, 2);            // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4, 1); // color
    initVertexAttribArray('b', gl_UNSIGNED_BYTE, 1, 4, 1); // additiveColor
}

function glSetBlendMode(additive)
{
    if (!glEnable) return;
        
    if (additive != glAdditive)
        glFlush();

    // setup blending
    glAdditive = additive;
    const destBlend = additive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);
}

function glSetTexture(texture=glTileTexture)
{
    if (!glEnable) return;
        
    if (texture != glActiveTexture)
        glFlush();

    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
}

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

function glCreateBuffer(bufferType, size, usage)
{
    if (!glEnable) return;

    // build the buffer
    const buffer = glContext.createBuffer();
    glContext.bindBuffer(bufferType, buffer);
    glContext.bufferData(bufferType, size, usage);
    return buffer;
}

function glCreateTexture(image)
{
    if (!glEnable) return;

    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);

    // use point filtering for pixelated rendering
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    return texture;
}

function glPreRender(width, height)
{
    if (!glEnable) return;

    // clear and set to same size as main canvas
    glCanvas.width = width;
    glCanvas.height = height;
    glContext.viewport(0, 0, width, height);

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
            -1-sx*cameraPos.x, -1-sy*cameraPos.y, 0, 0
        ])
    );
}

function glFlush()
{
    if (!glEnable) return;
    if (!glBatchCount)
        return;

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, glPositionData.subarray(0, glBatchCount * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT));
    glContext.drawArrays(gl_TRIANGLES, 0, glBatchCount * gl_VERTICES_PER_QUAD);
    glBatchCount = 0;
}

function glCopyToContext(context, forceDraw)
{
    if (!glEnable) return;
    if (!glDirty)  return;
    
    // draw any sprites still in the buffer, copy to main canvas and clear
    glFlush();

    if (!glOverlay || forceDraw)
    {
        // do not draw/clear in overlay mode because the canvas is visible
        context.drawImage(glCanvas, 0, glAdditive = glDirty = 0);
        glContext.clear(gl_COLOR_BUFFER_BIT);
    }
}

function glDraw(x, y, sizeX, sizeY, angle=0, uv0X=0, uv0Y=0, uv1X=1, uv1Y=1, rgba=0xffffffff, rgbaAdditive=0x00000000)
{
    if (!glEnable) return;
    
    // flush if there is no room for more verts
    if (glBatchCount >= gl_MAX_BATCH)
        glFlush();
        
    // setup 2 triangles to form a quad
    let offset = glBatchCount++ * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT;
    glDirty = 1;

    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 2
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;

    // vertex 3
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;

    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
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
gl_COLOR_BUFFER_BIT = 16384,
gl_ARRAY_BUFFER = 34962,
gl_DYNAMIC_DRAW = 35048,
gl_FRAGMENT_SHADER = 35632, 
gl_VERTEX_SHADER = 35633,
gl_COMPILE_STATUS = 35713,
gl_LINK_STATUS = 35714,

// constants for batch rendering
gl_VERTICES_PER_QUAD = 6,
gl_INDICIES_PER_VERT = 9,
gl_MAX_BATCH = 1<<16,
gl_VERTEX_BYTE_STRIDE = 4 + (4 * 2) * 3 + (4) * 2; // float + vec2 * 3 + (char * 4) * 2