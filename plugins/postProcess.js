/**
 * LittleJS Post Processing Plugin
 * - Supports shadertoy style post processing shaders
 * - call initPostProcess to set it up
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// post processing - can be enabled to pass other canvases through a final shader

let glPostShader, glPostTexture, glPostIncludeOverlay;

/** Set up a post processing shader
 *  @param {String} shaderCode
 *  @param {Boolean} includeOverlay
 *  @memberof WebGL */
function initPostProcess(shaderCode, includeOverlay=false)
{
    ASSERT(!glPostShader, 'can only have 1 post effects shader');
    if (headlessMode) return;
    
    if (!shaderCode) // default shader pass through
        shaderCode = 'void mainImage(out vec4 c,vec2 p){c=texture(iChannel0,p/iResolution.xy);}';

    // create the shader
    glPostShader = glCreateProgram(
        '#version 300 es\n' +            // specify GLSL ES version
        'precision highp float;'+        // use highp for better accuracy
        'in vec2 p;'+                    // position
        'void main(){'+                  // shader entry point
        'gl_Position=vec4(p+p-1.,1,1);'+ // set position
        '}'                              // end of shader
        ,
        '#version 300 es\n' +            // specify GLSL ES version
        'precision highp float;'+        // use highp for better accuracy
        'uniform sampler2D iChannel0;'+  // input texture
        'uniform vec3 iResolution;'+     // size of output texture
        'uniform float iTime;'+          // time
        'out vec4 c;'+                   // out color
        '\n' + shaderCode + '\n'+        // insert custom shader code
        'void main(){'+                  // shader entry point
        'mainImage(c,gl_FragCoord.xy);'+ // call post process function
        'c.a=1.;'+                       // always use full alpha
        '}'                              // end of shader
    );

    // create buffer and texture
    glPostTexture = glCreateTexture(undefined);
    glPostIncludeOverlay = includeOverlay;

    // Render the post processing shader, called automatically by the engine
    engineAddPlugin(undefined, postProcessRender);
    function postProcessRender()
    {
        if (headlessMode) return;
        
        // prepare to render post process shader
        if (glEnable)
        {
            glFlush(); // clear out the buffer
            mainContext.drawImage(glCanvas, 0, 0); // copy to the main canvas
        }
        else
        {
            // set the viewport
            glContext.viewport(0, 0, glCanvas.width = mainCanvas.width, glCanvas.height = mainCanvas.height);
        }

        if (glPostIncludeOverlay)
        {
            // copy overlay canvas so it will be included in post processing
            mainContext.drawImage(overlayCanvas, 0, 0);
            overlayCanvas.width |= 0;
        }

        // setup shader program to draw one triangle
        glContext.useProgram(glPostShader);
        glContext.bindBuffer(gl_ARRAY_BUFFER, glGeometryBuffer);
        glContext.pixelStorei(gl_UNPACK_FLIP_Y_WEBGL, 1);
        glContext.disable(gl_BLEND);

        // set textures, pass in the 2d canvas and gl canvas in separate texture channels
        glContext.activeTexture(gl_TEXTURE0);
        glContext.bindTexture(gl_TEXTURE_2D, glPostTexture);
        glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, mainCanvas);

        // set vertex position attribute
        const vertexByteStride = 8;
        const pLocation = glContext.getAttribLocation(glPostShader, 'p');
        glContext.enableVertexAttribArray(pLocation);
        glContext.vertexAttribPointer(pLocation, 2, gl_FLOAT, false, vertexByteStride, 0);

        // set uniforms and draw
        const uniformLocation = (name)=>glContext.getUniformLocation(glPostShader, name);
        glContext.uniform1i(uniformLocation('iChannel0'), 0);
        glContext.uniform1f(uniformLocation('iTime'), time);
        glContext.uniform3f(uniformLocation('iResolution'), mainCanvas.width, mainCanvas.height, 1);
        glContext.drawArrays(gl_TRIANGLE_STRIP, 0, 4);
    }
}