/**
 * LittleJS Post Processing Plugin
 * - Supports shadertoy style post processing shaders
 * - call new PostProcessPlugin() to setup post processing
 * - can be enabled to pass other canvases through a final shader
 * @namespace PostProcess
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global Post Process plugin object
 *  @type {PostProcessPlugin}
 *  @memberof PostProcess */
let postProcess;

/////////////////////////////////////////////////////////////////////////
/** 
 * UI System Global Object
 * @memberof PostProcess
 */
class PostProcessPlugin
{
    /** Create global post processing shader
    *  @param {string} shaderCode
    *  @param {boolean} [includeMainCanvas] - combine mainCanvs onto glCanvas
    *  @param {boolean} [feedbackTexture] - use glCanvas from previous frame as the texture
    *  @example
    *  // create the post process plugin object
    *  new PostProcessPlugin(shaderCode);
    */
    constructor(shaderCode, includeMainCanvas=false, feedbackTexture=false)
    {
        ASSERT(!postProcess, 'Post process already initialized');
        ASSERT(!(includeMainCanvas && feedbackTexture), 'Post process cannot both include main canvas and use feedback texture');
        postProcess = this;

        if (!shaderCode) // default shader pass through
            shaderCode = 'void mainImage(out vec4 c,vec2 p){c=texture(iChannel0,p/iResolution.xy);}';

        /** @property {WebGLProgram} - Shader for post processing */
        this.shader = undefined;
        /** @property {WebGLTexture} - Texture for post processing */
        this.texture = undefined;
        /** @property {WebGLVertexArrayObject} - Vertex array object */
        this.vao = undefined;

        // setup the post processing plugin
        initPostProcess();
        engineAddPlugin(undefined, postProcessRender, postProcessContextLost, postProcessContextRestored);

        function initPostProcess()
        {
            if (headlessMode) return;
            if (!glEnable)
            {
                console.warn('PostProcessPlugin: WebGL not enabled!');
                return;
            }

            // create resources
            postProcess.texture = glCreateTexture();
            postProcess.shader = glCreateProgram(
                '#version 300 es\n' +            // specify GLSL ES version
                'precision highp float;'+        // use highp for accuracy
                'in vec2 p;'+                    // position
                'void main(){'+                  // shader entry point
                'gl_Position=vec4(p+p-1.,1,1);'+ // set position
                '}'                              // end of shader
                ,
                '#version 300 es\n' +            // specify GLSL ES version
                'precision highp float;'+        // use highp for accuracy
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

            // setup VAO for post processing
            postProcess.vao = glContext.createVertexArray();
            glContext.bindVertexArray(postProcess.vao);
            glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);

            // configure vertex attributes
            const vertexByteStride = 8;
            const pLocation = glContext.getAttribLocation(postProcess.shader, 'p');
            glContext.enableVertexAttribArray(pLocation);
            glContext.vertexAttribPointer(pLocation, 2, glContext.FLOAT, false, vertexByteStride, 0);
        }
        function postProcessContextLost()
        {
            postProcess.shader = undefined;
            postProcess.texture = undefined;
            LOG('PostProcessPlugin: WebGL context lost');
        }
        function postProcessContextRestored()
        {
            initPostProcess();
            LOG('PostProcessPlugin: WebGL context restored');
        }
        function postProcessRender()
        {
            if (headlessMode || !glEnable) return;
            
            // clear out the buffer
            glFlush();

            // setup shader program to draw a quad
            glContext.useProgram(postProcess.shader);
            glContext.bindVertexArray(postProcess.vao);
            glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true);
            glContext.disable(glContext.BLEND);

            // setup texture
            glContext.activeTexture(glContext.TEXTURE0);
            glContext.bindTexture(glContext.TEXTURE_2D, postProcess.texture);
            if (includeMainCanvas)
            {
                // copy main canvas to work canvas
                workCanvas.width = mainCanvasSize.x;
                workCanvas.height = mainCanvasSize.y;
                glCopyToContext(workContext);
                workContext.drawImage(mainCanvas, 0, 0);
                mainCanvas.width |= 0
                
                // copy work canvas to texture
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, workCanvas);
            }
            else if (!feedbackTexture)
            {
                // copy glCanvas to texture
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, glCanvas);
            }
            
            // set uniforms and draw
            const uniformLocation = (name)=>glContext.getUniformLocation(postProcess.shader, name);
            glContext.uniform1i(uniformLocation('iChannel0'), 0);
            glContext.uniform1f(uniformLocation('iTime'), time);
            glContext.uniform3f(uniformLocation('iResolution'), mainCanvas.width, mainCanvas.height, 1);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

            if (feedbackTexture)
            {
                // pass glCanvas back to overlay texture
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, glCanvas);
            }

            // force it to set instanced mode
            glSetInstancedMode(true);
        }
    }
}