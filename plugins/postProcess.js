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

        /** @property {Object<string, number|Array<number>>} - The game's own values for the shader, a uniform each
         *  by its name, a number a float and a list of 2 to 4 numbers a vector, set every frame as they are; an
         *  effect setting can be one of these names, so it changes every frame without making the shader again, all
         *  but glow's size, which sets how many samples it takes; adding or removing a name makes the shader again,
         *  and the shader is first made at the first render, so values set right after the plugin are in it; a name
         *  is a GLSL name not starting with an underscore, which the effects keep for their own, nor i and a capital
         *  or gl_, and not c, uv or p, the names mainImage works on
         *  @type {Object<string, number|Array<number>>} */
        this.values = {};
        // the names of the values the shader was made with
        this.valueNames = '';

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

        // the shader is made at the first render, so values the game sets after this, which its code may name, are
        // declared in it
        !headlessMode && !glEnable && console.warn('PostProcessPlugin: WebGL not enabled!');
        engineAddPlugin(undefined, postProcessRender, postProcessContextLost, postProcessContextRestored);

        function initPostProcess()
        {
            if (headlessMode || !glEnable) return;

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
                postProcessFragmentSource(postProcess.shaderCode, postProcess.values)
            );
            postProcess.valueNames = postProcessValueKey(postProcess.values);

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

            // made now if WebGL was off when the plugin was made, when a lost context came back, when setShaderCode
            // gave it new code, or when the game added or took away a value, which the shader declares
            if (postProcess.shader && postProcessValueKey(postProcess.values) !== postProcess.valueNames)
                postProcess.setShaderCode(postProcess.shaderCode);
            if (!postProcess.shader)
            {
                if (glContext.isContextLost()) return;
                initPostProcess();
            }
            if (glFailedPrograms.has(postProcess.shader))
                return; // a shader that did not build in a release build, the frame shows as it is

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
            // all 0 without one, which an effect reads as no depth
            const camera = depth?.camera;
            glContext.uniform3f(glUniformLocation(postProcess.shader, 'iDepthRange'), camera?.near || 0,
                !camera || camera.far == Infinity ? 0 : camera.far, camera?.orthographic ? 1 : 0);

            // set uniforms and draw
            const uniformLocation = (name)=>glUniformLocation(postProcess.shader, name);
            glContext.uniform1i(uniformLocation('iChannel0'), 0);
            glContext.uniform1i(uniformLocation('iChannel1'), 1);
            glContext.uniform1i(uniformLocation('iChannel2'), 2);
            glContext.uniform1f(uniformLocation('iTime'), time);
            glContext.uniform3f(uniformLocation('iResolution'), mainCanvas.width, mainCanvas.height, 1);
            for (const name in postProcess.values)
            {
                const value = postProcess.values[name], location = uniformLocation(name);
                if (isArray(value))
                    [, , glContext.uniform2fv, glContext.uniform3fv, glContext.uniform4fv][value.length]?.call(glContext, location, value);
                else
                    glContext.uniform1f(location, value);
            }
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

// what the shader declares of the game's values, each name and its length, so a value that changes either makes the
// shader again
const postProcessValueKey = (values)=> Object.entries(values).map(([name, v])=> name + ':' + (isArray(v) ? v.length : 1)).join();

// the fragment shader of the post process pass around its mainImage snippet: the frame on iChannel0, the last output
// on iChannel1 with a feedback texture, and the 3D depth on iChannel2 when render3D.depthTexture is on, read with
// sceneDepth(uv), the distance from the camera along its view in world units, uv 0 to 1 across the screen; and a
// uniform for each of the game's values, a float or a vector of the list's length
function postProcessFragmentSource(shaderCode, values={})
{
    let declared = '';
    for (const name in values)
    {
        const value = values[name], length = isArray(value) ? value.length : 1;
        ASSERT(postProcessNameCheck(name), 'a postProcess value needs a name GLSL takes that the shader does not use', name);
        ASSERT(!isArray(value) || length >= 2 && length <= 4, 'a postProcess value is a number or 2 to 4 of them', name);
        declared += `uniform ${length > 1 ? 'vec' + length : 'float'} ${name};`;
    }
    return '#version 300 es\n' +        // specify GLSL ES version
        'precision highp float;'+        // use highp for accuracy
        'uniform sampler2D iChannel0;'+  // input texture
        'uniform sampler2D iChannel1;'+  // the previous frame's output, when feedbackTexture is set
        'uniform highp sampler2D iChannel2;'+ // the 3D depth, when render3D.depthTexture is on, highp or it is 11 bits
        'uniform vec3 iResolution;'+     // size of output texture
        'uniform float iTime;'+          // time
        'uniform vec3 iDepthRange;'+     // the camera's near, its far or 0 for none, and 1 when orthographic
        declared +                       // the game's own values
        'out vec4 c;'+                   // out color
        // the depth texture's value back to a distance, as the camera's projection put it there
        'float sceneDepth(vec2 uv){'+
        'float d=texture(iChannel2,uv).r*2.-1.,n=iDepthRange.x,f=iDepthRange.y;'+
        'return iDepthRange.z>0.?(d*(f-n)+f+n)/2.:f>0.?2.*n*f/(f+n-d*(f-n)):2.*n/max(1.-d,1e-7);}'+
        // whether there is depth to read: a range of all 0 is none, an orthographic near plane may be behind
        '\n#define LJS_HAS_DEPTH (iDepthRange != vec3(0))\n'+ // a define needs a line of its own
        '\n' + shaderCode + '\n'+        // insert custom shader code
        'void main(){'+                  // shader entry point
        'mainImage(c,gl_FragCoord.xy);'+ // call post process function
        'c.a=1.;'+                       // always use full alpha
        '}';                             // end of shader
}

/**
 * Shader code for a bloom effect, the bright parts of the image blurred back over it
 * - Pass it to PostProcessPlugin, or edit the string to build an effect on top of it
 * @param {number|string} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number|string} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels, which also sets how many samples it takes, so a
 *   number and not a value's name
 * @return {string}
 * @memberof PostProcess
 */
function postProcessBloomShader(threshold=.6, strength=1, size=6)
{
    return postProcessEffects(postProcessGlow(threshold, strength, size));
}

/**
 * Set up post processing with a bloom effect, so bright colors and lights glow
 * @param {number|string} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number|string} [strength] - How much glow to add
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
// an effect setting: a number written into the code, or the name of a postProcess value, read from it each frame
const postProcessNumber = (n)=> typeof n === 'string' ?
    (ASSERT(postProcessNameCheck(n), 'an effect setting is a number or the name of a postProcess value', n), n) :
    (ASSERT(isNumber(n) && isFinite(n), 'an effect setting is a finite number or the name of a postProcess value', n),
        n && abs(n) < .01 ? String(n) : n.toFixed(4)); // a small one keeps its digits, as 1.5e-7 or 0.00015

// a GLSL name for a value or a setting, which no part of the shader uses already: not the engine's own, i and a
// capital, nor those of mainImage or an effect's own locals, which start with an underscore, nor a GLSL word
const postProcessGLSLWords = new Set(('c uv p sceneDepth mainImage main ' +
    // keywords and reserved words
    'attribute const uniform varying layout centroid flat smooth noperspective patch sample break continue do for ' +
    'while switch case default if else subroutine in out inout float double int void bool true false invariant ' +
    'precise discard return lowp mediump highp precision struct common partition active asm class union enum ' +
    'typedef template this resource goto inline noinline public static extern external interface long short half ' +
    'fixed unsigned superp input output filter sizeof cast namespace using coherent volatile restrict readonly ' +
    'writeonly atomic_uint uint mat2 mat3 mat4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uvec2 uvec3 uvec4 ' +
    // built in functions
    'radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt ' +
    'inversesqrt abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan ' +
    'isinf length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose ' +
    'determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not textureSize ' +
    'texture textureProj textureLod textureOffset texelFetch texelFetchOffset textureProjOffset textureLodOffset ' +
    'textureProjLod textureProjLodOffset textureGrad textureGradOffset textureProjGrad textureProjGradOffset dFdx ' +
    'dFdy fwidth').split(' '));
const postProcessNameCheck = (name)=> /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !name.includes('__') &&
    !/^(i[A-Z]|gl_|webgl_|GL_|mat[2-4]|[dfh]vec[2-4]|[iu]?(sampler|image)([123]D|Cube|Buffer|External))/.test(name) && !postProcessGLSLWords.has(name);

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
 * @param {number|string} [threshold] - Brightness where the glow starts, 0 is everything and 1 is only pure white
 * @param {number|string} [strength] - How much glow to add
 * @param {number} [size] - How far the glow spreads in pixels, which also sets how many samples it takes, so a
 *   number and not a value's name
 * @return {string}
 * @memberof PostProcess
 */
function postProcessGlow(threshold=.6, strength=1, size=6)
{
    ASSERT(isNumber(size), 'glow size is a number, it sets how many samples the glow takes');
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
        for (int _k = 0; _k < ${count}; ++_k)
        {
            float _a = float(_k) * ${(2 * PI / count).toFixed(7)}${j ? ' + ' + (j * 2.3999632).toFixed(7) : ''};
            _glow += max(vec3(0), texture(iChannel0, uv + vec2(cos(_a), sin(_a)) * ${radius.toFixed(4)} / iResolution.xy).rgb - ${postProcessNumber(threshold)});
        }`;
    }
    return `        // glow
        vec3 _glow = vec3(0);${code}
        c.rgb += _glow * ${typeof strength === 'string' ? postProcessNumber(strength) + ' / ' + taps + '.' :
            (strength / taps).toFixed(6)};`; // a number as before, a value's name divided in the shader
}

/**
 * Scan lines across the screen, like an old TV
 * @param {number|string} [strength] - How dark the lines are, and how bright between them
 * @param {number|string} [spacing] - Pixels from one line to the next
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
 * @param {number|string} [strength] - How bright the static is
 * @param {number|string} [size] - Size of a speck in pixels
 * @return {string}
 * @memberof PostProcess
 */
function postProcessNoise(strength=.1, size=2)
{
    return `        // noise
        vec2 _q = fract((floor(p / ${postProcessNumber(size)}) + mod(iTime * 500., 1e3)) * .3197);
        c.rgb += ${postProcessNumber(strength)} * fract(1. + sin(51. * _q.x + 73. * _q.y) * 13753.3);`;
}

/**
 * Darken toward the edges and corners
 * @param {number|string} [strength] - How dark the corners get, 1 is black
 * @param {number|string} [falloff] - How far in it reaches, low darkens most of the screen, high only the corners
 * @return {string}
 * @memberof PostProcess
 */
function postProcessVignette(strength=1, falloff=3)
{
    return `        // vignette
        vec2 _d = uv * 2. - 1.;
        c.rgb *= 1. - ${postProcessNumber(strength)} * min(1., pow(dot(_d, _d) / 2., ${postProcessNumber(falloff)}));`;
}

/**
 * Bend the picture like the bulged glass of an old TV, black past the corners; put it first
 * @param {number|string} [strength] - How much it bends
 * @return {string}
 * @memberof PostProcess
 */
function postProcessCurve(strength=.1)
{
    return `        // curve
        vec2 _d = uv * 2. - 1.;
        _d *= 1. + ${postProcessNumber(strength)} * dot(_d, _d);
        uv = _d * .5 + .5;
        c = all(lessThan(abs(_d), vec2(1))) ? texture(iChannel0, uv) : vec4(0, 0, 0, 1);`;
}

/**
 * Split red and blue apart toward the edges, like a cheap lens; put it before what shades the picture
 * @param {number|string} [strength] - How far apart at the edge, as a part of the screen
 * @return {string}
 * @memberof PostProcess
 */
function postProcessChromatic(strength=.005)
{
    return `        // chromatic
        vec2 _d = (uv - .5) * ${postProcessNumber(strength)} * 2.;
        c.r = texture(iChannel0, uv + _d).r;
        c.b = texture(iChannel0, uv - _d).b;`;
}

// a blur's widest is 32 pixels, past which its 24 taps sit far enough apart to show; a value's is the game's to keep
const postProcessBlurCheck = (blur)=>
    ASSERT(typeof blur === 'string' || blur <= 32, 'a blur of more than 32 pixels shows its taps as copies', blur);

// a blur over a disc of radius _r pixels around uv, of 24 taps spread evenly by the golden angle; weight, when given,
// is GLSL for how much a tap at _puv, _s of the radius out, counts, from 0 to 1
function postProcessDiscBlur(weight)
{
    return `
        vec3 _sum = vec3(0);
        float _total = 0.;
        for (int _k = 0; _k < 24; ++_k)
        {
            float _s = sqrt((float(_k) + .5) / 24.), _a = float(_k) * 2.39996;
            vec2 _puv = uv + vec2(cos(_a), sin(_a)) * _s * _r / iResolution.xy;
            float _w = ${weight || '1.'};
            _sum += texture(iChannel0, _puv).rgb * _w;
            _total += _w;
        }
        c.rgb = _total > 0. ? _sum / _total : c.rgb;`;
}

/**
 * Keep a band across the screen sharp and blur the picture above and below it, as a tilt shift lens does, which
 * makes a scene look like a small model; it reads only the screen, so it works in 2D and 3D; put it first
 * @param {number|string} [focus] - Height of the middle of the sharp band, 0 the bottom of the screen and 1 the top
 * @param {number|string} [size] - Height of the sharp band, as a part of the screen
 * @param {number|string} [blur] - Widest blur in pixels, reached half the screen past the band, at most 32
 * @return {string}
 * @memberof PostProcess
 * @example
 * new PostProcessPlugin(postProcessEffects(postProcessTiltShift(.4, .2, 10), postProcessVignette(.5)));
 */
function postProcessTiltShift(focus=.5, size=.25, blur=8)
{
    postProcessBlurCheck(blur);
    const n = postProcessNumber;
    return `        // tilt shift
        float _r = ${n(blur)} * smoothstep(0., .5, abs(uv.y - ${n(focus)}) - ${n(size)} * .5);${postProcessDiscBlur()}`;
}

/**
 * Keep what is a distance from the camera sharp and blur what is nearer or farther, as a camera lens does; needs
 * render3D.depthTexture on, and blurs 3D only, 2D draws having no depth; put it first
 * - What is in focus stays sharp at its edges: a blur in front of or behind it leaves out what is in focus
 * @param {number|string} [focus] - Distance from the camera, along its view, that is sharpest, in world units
 * @param {number|string} [range] - How deep the sharp part is; the blur grows over as far again past it
 * @param {number|string} [blur] - Widest blur in pixels, at most 32
 * @return {string}
 * @memberof PostProcess
 * @example
 * render3D.depthTexture = true;
 * new PostProcessPlugin(postProcessEffects(postProcessDepthOfField(10, 4, 8)));
 */
function postProcessDepthOfField(focus=10, range=4, blur=8)
{
    postProcessBlurCheck(blur);
    const n = postProcessNumber;
    const amount = (depth)=> `${n(blur)} * smoothstep(0., ${n(range)}, abs(${depth} - ${n(focus)}) - ${n(range)} * .5)`;
    // a tap counts as far as its own blur reaches back to here, so a sharp thing in front is not smeared over
    return `        // depth of field, none where there is no depth, as with render3D.depthTexture off
        float _r = LJS_HAS_DEPTH ? ${amount('sceneDepth(uv)')} : 0.;${postProcessDiscBlur(`clamp(${amount('sceneDepth(_puv)')} - _s * _r + 1., 0., 1.)`)}`;
}

/**
 * Draw lines where the 3D depth jumps, around objects and along their creases; needs render3D.depthTexture on
 * @param {Color} [color] - The lines' color, its alpha how strong they are
 * @param {number|string} [thickness] - How wide the lines are in pixels
 * @param {number|string} [threshold] - How big a jump makes a line, as a part of the distance, lower draws more
 * @return {string}
 * @memberof PostProcess
 */
function postProcessOutline(color=BLACK, thickness=1, threshold=.02)
{
    ASSERT(isColor(color), 'outline color must be a Color');
    const n = postProcessNumber;
    return `        // outline
        vec2 _o = ${n(thickness)} / iResolution.xy;
        float _d = sceneDepth(uv);
        float _dx = abs(sceneDepth(uv + vec2(_o.x, 0)) + sceneDepth(uv - vec2(_o.x, 0)) - 2. * _d);
        float _dy = abs(sceneDepth(uv + vec2(0, _o.y)) + sceneDepth(uv - vec2(0, _o.y)) - 2. * _d);
        vec4 _line = vec4(${n(color.r)}, ${n(color.g)}, ${n(color.b)}, ${n(color.a)});
        if (LJS_HAS_DEPTH)
            c.rgb = mix(c.rgb, _line.rgb, _line.a * step(${n(threshold)}, max(_dx, _dy) / max(abs(_d), 1e-6)));`;
}

/**
 * The look of an old TV, as one effect to use alone or join with others: static noise, scan lines, a soft glow and
 * a vignette, and a bulged screen when curve is set; any setting at 0 leaves that part out
 * @param {Object} [settings]
 * @param {number|string} [settings.noise] - Static noise strength
 * @param {number|string} [settings.scanlines] - Scan line strength
 * @param {number|string} [settings.scanlineSpacing] - Pixels from one scan line to the next
 * @param {number|string} [settings.glow] - Soft glow strength
 * @param {number|string} [settings.vignette] - Vignette strength
 * @param {number|string} [settings.curve] - How much the screen bulges, 0 by default for flat
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
