/**
 * LittleJS Post Processing Plugin
 * - Supports shadertoy style post processing shaders
 * - call new PostProcessPlugin() to setup post processing
 * - can be enabled to pass other canvases through a final shader
 * - iResolution is the canvas backing store, so it grows with canvasPixelRatio
 *   like shadertoy does. Effects that use it only for uv (p/iResolution.xy) are
 *   unaffected, but ones that set a feature size from it, like scan lines, get
 *   finer as the ratio rises. Divide by getCanvasPixelRatio() to pin them.
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
 * Post Process Plugin - Applies a full screen shader to the rendered output
 * - Create it after any plugin that draws, since plugins render in the order they are made
 *   and this one shades what is on the canvas when its turn comes
 * @memberof PostProcess
 */
class PostProcessPlugin
{
    /** Create global post processing shader
    *  @param {string} shaderCode
    *  @param {boolean} [includeMainCanvas] - combine mainCanvas onto glCanvas
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

        /** @property {WebGLProgram|undefined} - Shader for post processing
         *  @type {WebGLProgram|undefined} */
        this.shader = undefined;
        /** @property {WebGLTexture|undefined} - Texture for post processing
         *  @type {WebGLTexture|undefined} */
        this.texture = undefined;
        /** @property {WebGLVertexArrayObject|undefined} - Vertex array object
         *  @type {WebGLVertexArrayObject|undefined} */
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

            // ensure we render to the default framebuffer (in case any earlier
            // caller this frame left a render target bound)
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);

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
                // copy main canvas to work canvas at the backing store size,
                // mainCanvasSize is css pixels so it would lose resolution
                workCanvas.width = mainCanvas.width;
                workCanvas.height = mainCanvas.height;
                glCopyToContext(workContext);
                workContext.drawImage(mainCanvas, 0, 0);
                mainCanvas.width |= 0; // setting size clears the main canvas

                // that also reset the transform, restore it so anything drawn
                // later this frame is still in css pixels
                const dpr = getCanvasPixelRatio();
                mainContext.setTransform(dpr, 0, 0, dpr, 0, 0);

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

            // restore default so subsequent dynamic texture uploads aren't flipped
            glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, false);

            // force it to set instanced mode
            glSetInstancedMode(true);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Shader code for a bloom effect, the bright parts of the image blurred back over it
 * - Pass it to PostProcessPlugin, or edit the string to build an effect on top of it
 * @param {number} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels, which also sets how many samples it takes
 * @return {string}
 * @memberof PostProcess
 */
function postProcessBloomShader(threshold=.6, strength=1, size=6)
{
    ASSERT(isNumber(threshold) && isNumber(strength) && isNumber(size), 'bloom settings must be numbers');
    ASSERT(size > 0, 'bloom size must be above zero');
    ASSERT(size <= 32, 'a bloom this wide takes a sample every few pixels of every ring, which is hundreds of samples a pixel', size);

    // Taps on three rings over a disc of the given size, one every three pixels or so of each ring
    // so there is no gap wide enough to show. The count follows the ring all the way out: hold it
    // still and a wider glow only spreads the same taps further apart, until they show up as the
    // ring of evenly spaced copies a single ring of eight leaves around anything bright.
    // Each ring has its own count, odd and unequal, and its own turn off the last, so the little
    // the taps do miss comes out as fine ripple instead of a shape of its own.
    const rings = 3;
    let code = '', taps = 0;
    for (let j = 0; j < rings; ++j)
    {
        const radius = ((j + .5) / rings) ** .5 * size;   // equal area per ring
        const count = max(5 + 2 * j, round(2 * radius)) | 1;
        taps += count;
        code += `
        for (int k = 0; k < ${count}; ++k)
        {
            float a = float(k) * ${(2 * PI / count).toFixed(7)}${j ? ' + ' + (j * 2.3999632).toFixed(7) : ''};
            glow += max(vec3(0), texture(iChannel0, uv + vec2(cos(a), sin(a)) * ${radius.toFixed(4)} / iResolution.xy).rgb - ${threshold.toFixed(4)});
        }`;
    }
    return `
    void mainImage(out vec4 color, vec2 pixel)
    {
        vec2 uv = pixel / iResolution.xy;
        color = texture(iChannel0, uv);
        vec3 glow = vec3(0);${code}
        color.rgb += glow * ${(strength / taps).toFixed(6)};
    }`;
}

/**
 * Set up post processing with a bloom effect, so bright colors and lights glow
 * @param {number} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels
 * @param {boolean} [includeMainCanvas] - Glow the 2D canvas too, off by default so HUD text stays crisp
 * @return {PostProcessPlugin}
 * @memberof PostProcess
 * @example
 * postProcessBloom(); // in gameInit, after any Render3DPlugin
 */
function postProcessBloom(threshold=.6, strength=1, size=6, includeMainCanvas=false)
{ return new PostProcessPlugin(postProcessBloomShader(threshold, strength, size), includeMainCanvas); }
