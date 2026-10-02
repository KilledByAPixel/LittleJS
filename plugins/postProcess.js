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
 * - It runs after gameRenderPost, so a HUD drawn there with WebGL is shaded (and bloomed) too;
 *   draw the HUD with useWebGL=false (the main canvas) or from a plugin created after this one
 * @memberof PostProcess
 */
class PostProcessPlugin
{
    /** Create global post processing shader
    *  @param {string} [shaderCode] - Shadertoy style mainImage code, a pass-through when left out
    *  @param {boolean} [includeMainCanvas] - combine mainCanvas onto glCanvas
    *  @param {boolean} [feedbackTexture] - also pass the shader's own output from the previous frame as iChannel1,
    *                                       for trails and echoes; iChannel0 is still the frame just drawn
    *  @example
    *  // create the post process plugin object
    *  new PostProcessPlugin(shaderCode);
    */
    constructor(shaderCode, includeMainCanvas=false, feedbackTexture=false)
    {
        ASSERT(engineInitialized || headlessMode, 'create the plugin after engineInit, e.g. in gameInit');
        ASSERT(!postProcess, 'Post process already initialized');
        ASSERT(!(includeMainCanvas && feedbackTexture), 'Post process cannot both include main canvas and use feedback texture');
        postProcess = this;

        /** @property {string} - The shadertoy style mainImage code it shades with, see setShaderCode */
        this.shaderCode = shaderCode || postProcessEffects(); // no code passes the frame through

        /** @property {WebGLProgram|undefined} - Shader for post processing
         *  @type {WebGLProgram|undefined} */
        this.shader = undefined;
        /** @property {WebGLTexture|undefined} - Texture for post processing
         *  @type {WebGLTexture|undefined} */
        this.texture = undefined;
        /** @property {WebGLTexture|undefined} - The previous frame's output, iChannel1, when feedbackTexture is set
         *  @type {WebGLTexture|undefined} */
        this.feedbackTexture = undefined;
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

            // create resources, the feedback starting black, as if the frame before the first were empty
            if (feedbackTexture)
            {
                postProcess.feedbackTexture = glCreateTexture();
                glContext.bindTexture(glContext.TEXTURE_2D, postProcess.feedbackTexture);
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, 1, 1, 0, glContext.RGBA,
                    glContext.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
                glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
            }
            postProcess.texture = glCreateTexture();
            postProcess.shader = glCreateProgram(
                '#version 300 es\n' +            // specify GLSL ES version
                'precision highp float;'+        // use highp for accuracy
                'in vec2 p;'+                    // position
                'void main(){'+                  // shader entry point
                'gl_Position=vec4(p+p-1.,1,1);'+ // set position
                '}'                              // end of shader
                ,
                postProcessFragmentSource(postProcess.shaderCode)
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

            // the engine's own vertex array and buffer back, its next batch is written into the buffer bound
            glContext.bindVertexArray(glPolyMode ? glPolyVAO : glInstancedVAO);
            glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
        }
        function postProcessContextLost()
        {
            postProcess.shader = undefined;
            postProcess.texture = undefined;
            postProcess.feedbackTexture = undefined;
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

            // clear out the buffer, before anything here binds its own
            glFlush();

            // made now if WebGL was off when the plugin was made, when a lost context came back, or when
            // setShaderCode gave it new code
            if (!postProcess.shader)
            {
                if (glContext.isContextLost()) return;
                initPostProcess();
            }

            // ensure we render to the default framebuffer (in case any earlier
            // caller this frame left a render target bound)
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);

            // setup shader program to draw a quad
            glContext.useProgram(postProcess.shader);
            glContext.bindVertexArray(postProcess.vao);
            glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true);
            // upload the canvas the way it shows, premultiplied, since the shader writes full alpha; unpremultiplied
            // a see-through pixel would come out at its full brightness instead of faded over the background
            glContext.pixelStorei(glContext.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            glContext.disable(glContext.BLEND);

            // setup texture
            glContext.activeTexture(glContext.TEXTURE0);
            glContext.bindTexture(glContext.TEXTURE_2D, postProcess.texture);
            if (includeMainCanvas)
            {
                // copy main canvas to work canvas at the backing store size,
                // mainCanvasSize is css pixels so it would lose resolution
                // sized again only when the canvas changed, setting a size remakes the canvas even to the same one
                if (workCanvas.width !== mainCanvas.width || workCanvas.height !== mainCanvas.height)
                    workCanvas.width = mainCanvas.width, workCanvas.height = mainCanvas.height;
                else
                    workContext.clearRect(0, 0, workCanvas.width, workCanvas.height);
                glCopyToContext(workContext);
                workContext.drawImage(mainCanvas, 0, 0);
                // clear the main canvas with clearRect, resizing it would also
                // reset the context state (smoothing, line caps) for anything
                // drawn after this and reallocate the canvas every frame
                mainContext.save();
                mainContext.setTransform(1, 0, 0, 1, 0, 0);
                mainContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                mainContext.restore();

                // copy work canvas to texture
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, workCanvas);
            }
            else
            {
                // copy glCanvas to texture
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, glCanvas);
            }

            // the previous frame's output, on the second texture unit
            if (feedbackTexture)
            {
                glContext.activeTexture(glContext.TEXTURE1);
                glContext.bindTexture(glContext.TEXTURE_2D, postProcess.feedbackTexture);
            }

            // the 3D depth, when render3D draws it, on the third texture unit, with what sceneDepth needs to read it
            const depth = typeof render3D != 'undefined' && render3D?.depthTexture ? render3D : undefined;
            glContext.activeTexture(glContext.TEXTURE2);
            glContext.bindTexture(glContext.TEXTURE_2D, depth?.cameraDepthTexture || null);
            glContext.activeTexture(glContext.TEXTURE0);
            const camera = depth?.camera;
            camera && glContext.uniform3f(glUniformLocation(postProcess.shader, 'iDepthRange'), camera.near,
                camera.far == Infinity ? 0 : camera.far, camera.orthographic ? 1 : 0);

            // set uniforms and draw
            const uniformLocation = (name)=>glUniformLocation(postProcess.shader, name);
            glContext.uniform1i(uniformLocation('iChannel0'), 0);
            glContext.uniform1i(uniformLocation('iChannel1'), 1);
            glContext.uniform1i(uniformLocation('iChannel2'), 2);
            glContext.uniform1f(uniformLocation('iTime'), time);
            glContext.uniform3f(uniformLocation('iResolution'), mainCanvas.width, mainCanvas.height, 1);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

            if (feedbackTexture)
            {
                // keep this frame's output for the next one, in the feedback texture still bound to the second
                // unit, then hand the first texture unit back to the engine
                glContext.activeTexture(glContext.TEXTURE1);
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, glCanvas);
                glContext.activeTexture(glContext.TEXTURE0);
            }

            // the depth leaves the third unit for whatever draws next
            glContext.activeTexture(glContext.TEXTURE2);
            glContext.bindTexture(glContext.TEXTURE_2D, null);
            glContext.activeTexture(glContext.TEXTURE0);

            // restore defaults so subsequent dynamic texture uploads aren't flipped or premultiplied
            glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, false);
            glContext.pixelStorei(glContext.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

            // bind back the texture the 2D batch thinks is bound, a plugin drawing after this one uses it
            if (glActiveTexture)
                glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);

            // force it to set instanced mode
            glSetInstancedMode(true);
        }
    }

    /** Shade with new code from the next frame on, to switch effects while the game runs; the shader is made again
     *  @param {string} [shaderCode] - Shadertoy style mainImage code, postProcessEffects builds it; none passes the
     *  frame through */
    setShaderCode(shaderCode)
    {
        ASSERT(!shaderCode || typeof shaderCode === 'string', 'shader code must be a string');
        this.shaderCode = shaderCode || postProcessEffects();
        if (!this.shader || headlessMode || !glContext) return;

        // what the new shader replaces, made again by the next render
        glContext.deleteProgram(this.shader);
        glContext.deleteTexture(this.texture);
        this.feedbackTexture && glContext.deleteTexture(this.feedbackTexture);
        glContext.deleteVertexArray(this.vao);
        this.shader = this.texture = this.feedbackTexture = this.vao = undefined;
    }
}

///////////////////////////////////////////////////////////////////////////////

// the fragment shader of the post process pass around its mainImage snippet: the frame on iChannel0, the last output
// on iChannel1 with a feedback texture, and the 3D depth on iChannel2 when render3D.depthTexture is on, read with
// sceneDepth(uv), the distance from the camera along its view in world units, uv 0 to 1 across the screen
function postProcessFragmentSource(shaderCode)
{
    return '#version 300 es\n' +        // specify GLSL ES version
        'precision highp float;'+        // use highp for accuracy
        'uniform sampler2D iChannel0;'+  // input texture
        'uniform sampler2D iChannel1;'+  // the previous frame's output, when feedbackTexture is set
        'uniform sampler2D iChannel2;'+  // the 3D depth, when render3D.depthTexture is on
        'uniform vec3 iResolution;'+     // size of output texture
        'uniform float iTime;'+          // time
        'uniform vec3 iDepthRange;'+     // the camera's near, its far or 0 for none, and 1 when orthographic
        'out vec4 c;'+                   // out color
        // the depth texture's value back to a distance, as the camera's projection put it there
        'float sceneDepth(vec2 uv){'+
        'float d=texture(iChannel2,uv).r*2.-1.,n=iDepthRange.x,f=iDepthRange.y;'+
        'return iDepthRange.z>0.?(d*(f-n)+f+n)/2.:f>0.?2.*n*f/(f+n-d*(f-n)):2.*n/(1.-d);}'+
        '\n' + shaderCode + '\n'+        // insert custom shader code
        'void main(){'+                  // shader entry point
        'mainImage(c,gl_FragCoord.xy);'+ // call post process function
        'c.a=1.;'+                       // always use full alpha
        '}';                             // end of shader
}

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
    return postProcessEffects(postProcessGlow(threshold, strength, size));
}

/**
 * Set up post processing with a bloom effect, so bright colors and lights glow
 * @param {number} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels
 * @param {boolean} [includeMainCanvas] - Glow the 2D canvas too, off by default so HUD text stays crisp
 *   (a HUD drawn with WebGL in gameRenderPost glows either way, draw it with useWebGL=false)
 * @return {PostProcessPlugin}
 * @memberof PostProcess
 * @example
 * postProcessBloom(); // in gameInit, after any Render3DPlugin
 */
function postProcessBloom(threshold=.6, strength=1, size=6, includeMainCanvas=false)
{ return new PostProcessPlugin(postProcessBloomShader(threshold, strength, size), includeMainCanvas); }

///////////////////////////////////////////////////////////////////////////////
// Effects: pieces of shader code, each with its settings written in as numbers, that postProcessEffects joins in
// order into one shader; a piece works on c, the pixel's color, and uv, where it is on the screen from 0 to 1, with p
// its pixel; one that bends uv or samples the frame, the curve, chromatic and glow, goes before the ones that shade

// a number as GLSL writes it, a float with a point
const postProcessNumber = (n)=> (ASSERT(isNumber(n), 'effect settings must be numbers', n), n.toFixed(4));

/**
 * Join effects into one post process shader, in the order given, for PostProcessPlugin or setShaderCode
 * - Each effect is a piece of shader code on c, the pixel's color, and uv, where it is on the screen from 0 to 1;
 *   your own code is a piece too, a line of GLSL or many, dropped in where you put it
 * - Put the ones that bend the picture or sample it first: postProcessCurve, postProcessChromatic, postProcessGlow
 * @param {...string} effects - The pieces, from the effect functions or your own code
 * @return {string} - Shadertoy style mainImage code
 * @example
 * new PostProcessPlugin(postProcessEffects(
 *     postProcessScanlines(.5), postProcessVignette(), 'c.rgb *= vec3(1, .9, .8);'));
 * @memberof PostProcess
 */
function postProcessEffects(...effects)
{
    ASSERT(effects.every((e)=> typeof e === 'string'), 'each effect is a piece of shader code, a string');
    return 'void mainImage(out vec4 c, vec2 p)\n{\n' +
        '    vec2 uv = p / iResolution.xy;\n' +
        '    c = texture(iChannel0, uv);\n' +
        effects.map((e)=> '    {\n' + e + '\n    }\n').join('') + '}\n';
}

/**
 * Bright parts glow, the bloom as an effect to join with others; postProcessBloom sets up bloom on its own
 * @param {number} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels, which also sets how many samples it takes
 * @return {string}
 * @memberof PostProcess
 */
function postProcessGlow(threshold=.6, strength=1, size=6)
{
    ASSERT(isNumber(threshold) && isNumber(strength) && isNumber(size), 'glow settings must be numbers');
    ASSERT(size > 0, 'glow size must be above zero');
    ASSERT(size <= 32, 'a glow this wide takes a sample every few pixels of every ring, which is hundreds of samples a pixel', size);

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
    return `        // glow
        vec3 glow = vec3(0);${code}
        c.rgb += glow * ${(strength / taps).toFixed(6)};`;
}

/**
 * Scan lines across the screen, like an old TV
 * @param {number} [strength] - How dark the lines are, and how bright between them
 * @param {number} [spacing] - Pixels from one line to the next
 * @return {string}
 * @memberof PostProcess
 */
function postProcessScanlines(strength=.5, spacing=6)
{
    return `        // scanlines
        c.rgb *= 1. - ${postProcessNumber(strength)} * cos(p.y * 6.2832 / ${postProcessNumber(spacing)});`;
}

/**
 * Static noise over the picture, changing every frame
 * @param {number} [strength] - How bright the static is
 * @param {number} [size] - Size of a speck in pixels
 * @return {string}
 * @memberof PostProcess
 */
function postProcessNoise(strength=.1, size=2)
{
    return `        // noise
        vec2 q = fract((floor(p / ${postProcessNumber(size)}) + mod(iTime * 500., 1e3)) * .3197);
        c.rgb += ${postProcessNumber(strength)} * fract(1. + sin(51. * q.x + 73. * q.y) * 13753.3);`;
}

/**
 * Darken toward the edges and corners
 * @param {number} [strength] - How dark the corners get, 1 is black
 * @param {number} [falloff] - How far in it reaches, low darkens most of the screen, high only the corners
 * @return {string}
 * @memberof PostProcess
 */
function postProcessVignette(strength=1, falloff=3)
{
    return `        // vignette
        vec2 d = uv * 2. - 1.;
        c.rgb *= 1. - ${postProcessNumber(strength)} * min(1., pow(dot(d, d) / 2., ${postProcessNumber(falloff)}));`;
}

/**
 * Bend the picture like the bulged glass of an old TV, black past the corners; put it first
 * @param {number} [strength] - How much it bends
 * @return {string}
 * @memberof PostProcess
 */
function postProcessCurve(strength=.1)
{
    return `        // curve
        vec2 d = uv * 2. - 1.;
        d *= 1. + ${postProcessNumber(strength)} * dot(d, d);
        uv = d * .5 + .5;
        c = all(lessThan(abs(d), vec2(1))) ? texture(iChannel0, uv) : vec4(0, 0, 0, 1);`;
}

/**
 * Split red and blue apart toward the edges, like a cheap lens; put it before what shades the picture
 * @param {number} [strength] - How far apart at the edge, as a part of the screen
 * @return {string}
 * @memberof PostProcess
 */
function postProcessChromatic(strength=.005)
{
    return `        // chromatic
        vec2 d = (uv - .5) * ${postProcessNumber(strength)} * 2.;
        c.r = texture(iChannel0, uv + d).r;
        c.b = texture(iChannel0, uv - d).b;`;
}

/**
 * Draw lines where the 3D depth jumps, around objects and along their creases; needs render3D.depthTexture on
 * @param {Color} [color] - The lines' color, its alpha how strong they are
 * @param {number} [thickness] - How wide the lines are in pixels
 * @param {number} [threshold] - How big a jump makes a line, as a part of the distance, lower draws more
 * @return {string}
 * @memberof PostProcess
 */
function postProcessOutline(color=BLACK, thickness=1, threshold=.02)
{
    ASSERT(isColor(color), 'outline color must be a Color');
    const n = postProcessNumber;
    return `        // outline
        vec2 o = ${n(thickness)} / iResolution.xy;
        float d = sceneDepth(uv);
        float dx = abs(sceneDepth(uv + vec2(o.x, 0)) + sceneDepth(uv - vec2(o.x, 0)) - 2. * d);
        float dy = abs(sceneDepth(uv + vec2(0, o.y)) + sceneDepth(uv - vec2(0, o.y)) - 2. * d);
        vec4 line = vec4(${n(color.r)}, ${n(color.g)}, ${n(color.b)}, ${n(color.a)});
        c.rgb = mix(c.rgb, line.rgb, line.a * step(${n(threshold)}, max(dx, dy) / d));`;
}

/**
 * The look of an old TV, as one effect to use alone or join with others: static noise, scan lines, a soft glow and
 * a vignette, and a bulged screen when curve is set; any setting at 0 leaves that part out
 * @param {Object} [settings]
 * @param {number} [settings.noise] - Static noise strength
 * @param {number} [settings.scanlines] - Scan line strength
 * @param {number} [settings.scanlineSpacing] - Pixels from one scan line to the next
 * @param {number} [settings.glow] - Soft glow strength
 * @param {number} [settings.vignette] - Vignette strength
 * @param {number} [settings.curve] - How much the screen bulges, 0 by default for flat
 * @return {string}
 * @example
 * new PostProcessPlugin(postProcessEffects(postProcessTV({scanlines: .4, curve: .1})));
 * @memberof PostProcess
 */
function postProcessTV({noise=.1, scanlines=.5, scanlineSpacing=6, glow=.4, vignette=1, curve=0}={})
{
    const parts = [];
    curve && parts.push(postProcessCurve(curve));
    glow && parts.push(postProcessGlow(0, glow, 2));
    scanlines && parts.push(postProcessScanlines(scanlines, scanlineSpacing));
    noise && parts.push(postProcessNoise(noise, 1));
    vignette && parts.push(postProcessVignette(vignette, 6));
    return parts.map((part)=> '    {\n' + part + '\n    }').join('\n');
}
