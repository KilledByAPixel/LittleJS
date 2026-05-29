/**
 * LittleJS Light System Plugin
 * - Adds 2D dynamic lighting to the scene
 * - Lights are first-class EngineObjects (the Light class)
 * - Each Light draws a soft falloff blob of its color into a shared lightmap
 * - Lights accumulate ADDITIVELY in the lightmap (red + blue = magenta)
 * - The lightmap is then MULTIPLIED with the scene during composite, so unlit
 *   areas go to the ambient color and lit areas show the scene tinted by the
 *   accumulated light color
 * - Draw the world at full brightness — the lightmap does the darkening
 * - Any EngineObject may override renderLight() to additively contribute to the
 *   lightmap (e.g. emissive lava tiles, weapon flashes, glowing crystals)
 * - Must be constructed BEFORE PostProcessPlugin so post-process sees lit pixels
 * @namespace LightSystem
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global Light System plugin object
 *  @type {LightSystemPlugin}
 *  @memberof LightSystem */
let lightSystem;

///////////////////////////////////////////////////////////////////////////////

/**
 * LightSystemPlugin
 * - Owns the offscreen lightmap texture, falloff/composite shaders, and the
 *   per-frame render pass that multiplies the lightmap onto the WebGL scene
 * - The composite is MULTIPLICATIVE: unlit areas get the ambient color, lit
 *   areas show the scene tinted by the accumulated light color. So you should
 *   draw your world at full brightness — the lightmap handles the darkening.
 * @memberof LightSystem
 */
class LightSystemPlugin
{
    /** Create the global light system plugin.
     *  @param {Vector2} [textureSize]  - Size of the lightmap texture (defaults to mainCanvasSize)
     *  @param {Color}   [ambientColor] - Color applied to unlit areas of the scene (defaults to BLACK = pitch dark). Set a small RGB like rgb(0.1,0.1,0.15) for a faint "moonlight" baseline so unlit areas aren't fully black.
     *  @example
     *  // simplest usage
     *  new LightSystemPlugin();
     */
    constructor(textureSize, ambientColor)
    {
        ASSERT(!lightSystem, 'LightSystemPlugin already initialized');
        ASSERT(!postProcess, 'LightSystemPlugin must be created before PostProcessPlugin');
        lightSystem = this;

        /** @property {boolean} - When false, the render pass is skipped entirely */
        this.enabled = true;
        /** @property {Color} - Baseline color applied to unlit areas of the scene. Defaults to BLACK (pitch dark). Set to a small RGB for a faint ambient. The lightmap is cleared to this color each frame, then lights add on top, then the result multiplies the scene. */
        this.ambientColor = (ambientColor || BLACK).copy();
        /** @property {Vector2} - Size of the lightmap texture (set at construction; falls back to mainCanvasSize at init time) */
        this.textureSize = textureSize ? textureSize.copy() : undefined;

        /** @property {WebGLTexture} - The lightmap texture */
        this.texture = undefined;
        /** @property {WebGLProgram} - Shader for drawing per-Light falloff blobs into the lightmap */
        this.lightShader = undefined;
        /** @property {WebGLProgram} - Shader for compositing the lightmap over the main scene */
        this.compositeShader = undefined;
        /** @property {WebGLVertexArrayObject} - Vertex array object for the light shader */
        this.lightVAO = undefined;
        /** @property {WebGLVertexArrayObject} - Vertex array object for the composite shader */
        this.compositeVAO = undefined;

        initLightSystem();
        engineAddPlugin(undefined, lightSystemRender,
            lightSystemContextLost, lightSystemContextRestored);

        function initLightSystem()
        {
            if (headlessMode) return;
            if (!glEnable)
            {
                console.warn('LightSystemPlugin: WebGL not enabled!');
                return;
            }

            // resolve texture size default at init time (mainCanvasSize may
            // not be set yet at the moment the constructor first ran)
            if (!lightSystem.textureSize)
                lightSystem.textureSize = mainCanvasSize.copy();

            // allocate the lightmap texture with null data at textureSize
            lightSystem.texture = glContext.createTexture();
            glContext.bindTexture(glContext.TEXTURE_2D, lightSystem.texture);
            glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA,
                lightSystem.textureSize.x, lightSystem.textureSize.y, 0,
                glContext.RGBA, glContext.UNSIGNED_BYTE, null);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
            glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);

            // light falloff shader: one quad per Light, fragment computes radial falloff
            lightSystem.lightShader = glCreateProgram(
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform mat4 m;'+
                'uniform vec2 lightPos;'+
                'uniform float radius;'+
                'in vec2 g;'+              // unit quad geometry [0..1]
                'out vec2 vWorldPos;'+
                'void main(){'+
                'vec2 worldP=lightPos+(g-.5)*2.*radius;'+
                'gl_Position=m*vec4(worldP,1,1);'+
                'vWorldPos=worldP;'+
                '}'
                ,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform vec2 lightPos;'+
                'uniform float radius;'+
                'uniform float fadeRange;'+
                'uniform vec4 color;'+
                'in vec2 vWorldPos;'+
                'out vec4 c;'+
                'void main(){'+
                'float dist=distance(vWorldPos,lightPos);'+
                'float t=clamp((radius-dist)/max(fadeRange,1e-6),0.,1.);'+
                'c=vec4(color.rgb*t*color.a,1.);'+
                '}'
            );

            // composite shader: fullscreen quad, samples the lightmap
            lightSystem.compositeShader = glCreateProgram(
                '#version 300 es\n' +
                'precision highp float;'+
                'in vec2 p;'+
                'void main(){'+
                'gl_Position=vec4(p+p-1.,1,1);'+
                '}'
                ,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform sampler2D s;'+
                'uniform vec3 iResolution;'+
                'out vec4 c;'+
                'void main(){'+
                'vec2 uv=gl_FragCoord.xy/iResolution.xy;'+
                'c=vec4(texture(s,uv).rgb,1.);'+
                '}'
            );

            // VAO for the per-Light quad — reuses the engine unit triangle-strip
            lightSystem.lightVAO = glContext.createVertexArray();
            glContext.bindVertexArray(lightSystem.lightVAO);
            glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
            const gLight = glContext.getAttribLocation(lightSystem.lightShader, 'g');
            glContext.enableVertexAttribArray(gLight);
            glContext.vertexAttribPointer(gLight, 2, glContext.FLOAT, false, 8, 0);

            // VAO for the composite fullscreen quad — same buffer, attribute named 'p'
            lightSystem.compositeVAO = glContext.createVertexArray();
            glContext.bindVertexArray(lightSystem.compositeVAO);
            glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
            const pComp = glContext.getAttribLocation(lightSystem.compositeShader, 'p');
            glContext.enableVertexAttribArray(pComp);
            glContext.vertexAttribPointer(pComp, 2, glContext.FLOAT, false, 8, 0);
        }
        function lightSystemRender()
        {
            if (headlessMode || !glEnable) return;
            if (!lightSystem.enabled) return;
            if (!lightSystem.texture) return;     // init failed or context lost

            // 1. flush any in-flight sprite batch from earlier render passes
            glFlush();
            const prevAdditive = glAdditive;

            // 2. bind lightmap as render target, clear to ambientColor
            const ac = lightSystem.ambientColor;
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, glFramebuffer);
            glContext.framebufferTexture2D(glContext.FRAMEBUFFER,
                glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, lightSystem.texture, 0);
            glContext.viewport(0, 0, lightSystem.textureSize.x, lightSystem.textureSize.y);
            glContext.clearColor(ac.r, ac.g, ac.b, ac.a);
            glContext.clear(glContext.COLOR_BUFFER_BIT);

            // 3. walk engineObjects calling renderLight() — additive blend
            //    (lightmap accumulates raw additive color contributions)
            setBlendMode(true);
            glContext.enable(glContext.BLEND);
            glContext.blendFunc(glContext.ONE, glContext.ONE);

            for (const o of engineObjects)
                o.destroyed || o.renderLight();

            // 4. drain any sprite-batched draws (e.g. drawTile inside a
            //    custom renderLight override) so they hit the FBO, not the
            //    canvas after we unbind
            glFlush();
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
            glContext.viewport(0, 0, mainCanvasSize.x, mainCanvasSize.y);

            // 5. composite: fullscreen quad, multiplicative blend onto glCanvas
            //    (scene * lightmap — unlit areas go to black, lit areas are
            //    the scene tinted by the accumulated light color)
            glContext.useProgram(lightSystem.compositeShader);
            glContext.bindVertexArray(lightSystem.compositeVAO);
            glContext.activeTexture(glContext.TEXTURE0);
            glContext.bindTexture(glContext.TEXTURE_2D, lightSystem.texture);
            const cs = lightSystem.compositeShader;
            glContext.uniform1i(glContext.getUniformLocation(cs, 's'), 0);
            glContext.uniform3f(glContext.getUniformLocation(cs, 'iResolution'),
                mainCanvas.width, mainCanvas.height, 1);
            glContext.blendFunc(glContext.DST_COLOR, glContext.ZERO);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

            // 6. restore engine state so subsequent draws use the engine's
            //    tracked texture binding (otherwise glSetTexture would think
            //    the prior texture was still bound when actually the lightmap
            //    is, and any debug text / future draw could sample the lightmap)
            if (glActiveTexture)
                glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
            setBlendMode(prevAdditive);
            glSetInstancedMode(true);
        }
        function lightSystemContextLost()
        {
            lightSystem.texture = undefined;
            lightSystem.lightShader = undefined;
            lightSystem.compositeShader = undefined;
            lightSystem.lightVAO = undefined;
            lightSystem.compositeVAO = undefined;
            LOG('LightSystemPlugin: WebGL context lost');
        }
        function lightSystemContextRestored()
        {
            initLightSystem();
            LOG('LightSystemPlugin: WebGL context restored');
        }
    }

    /** Draw a single Light's falloff blob into the currently bound lightmap.
     *  Called by Light.renderLight() during the plugin's render pass.
     *  @param {Light} light */
    drawLight(light)
    {
        if (headlessMode || !glEnable || !this.lightShader) return;

        glContext.useProgram(this.lightShader);
        glContext.bindVertexArray(this.lightVAO);

        // re-apply the engine camera transform onto this shader. Divide by
        // mainCanvasSize (not textureSize) so world→NDC matches the main
        // pass; the viewport handles the lightmap's actual resolution.
        // No y-flip here: the composite samples this FBO with
        // gl_FragCoord/iResolution (origin bottom-left), so storing world
        // +Y at the top of the texture lines up with the canvas convention.
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

        const ls = this.lightShader;
        glContext.uniformMatrix4fv(glContext.getUniformLocation(ls, 'm'), false, transform);
        glContext.uniform2f(glContext.getUniformLocation(ls, 'lightPos'), light.pos.x, light.pos.y);
        glContext.uniform1f(glContext.getUniformLocation(ls, 'radius'), light.radius);
        glContext.uniform1f(glContext.getUniformLocation(ls, 'fadeRange'), light.fadeRange);
        const c = light.color;
        glContext.uniform4f(glContext.getUniformLocation(ls, 'color'), c.r, c.g, c.b, c.a);

        glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * A Light is an EngineObject that contributes a soft additive blob of color
 * to the LightSystem plugin's lightmap.
 * @extends EngineObject
 * @memberof LightSystem
 * @example
 * new Light(vec2(5, 5), 4, rgb(1, 0.5, 0));        // orange light, full soft blob
 * new Light(vec2(0, 0), 8, rgb(1, 1, 1), 2);       // white core with 2-unit soft halo
 */
class Light extends EngineObject
{
    /** Create a light object and add it to the engine object list
     *  @param {Vector2} pos - World space position
     *  @param {number} radius - Total extent of the light in world units
     *  @param {Color} [color] - Color of the light; alpha modulates intensity
     *  @param {number} [fadeRange] - Width of the soft edge in world units (defaults to radius) */
    constructor(pos, radius, color, fadeRange)
    {
        super(pos, vec2(1), undefined, 0, color);
        ASSERT(isNumber(radius) && radius >= 0, 'Light radius must be a non-negative number');
        ASSERT(fadeRange === undefined || (isNumber(fadeRange) && fadeRange >= 0),
            'Light fadeRange must be a non-negative number when provided');

        /** @property {number} - Total extent of the light in world units */
        this.radius = radius;
        /** @property {number} - Width of the soft edge in world units */
        this.fadeRange = fadeRange === undefined ? radius : fadeRange;
    }

    /** Lights are invisible in the main render pass — they only contribute
     *  to the lightmap via renderLight(). */
    render() {}

    /** Draw this light's falloff blob into the lightmap.
     *  Called by LightSystemPlugin during its render pass. No-op when the
     *  plugin or WebGL is unavailable. */
    renderLight()
    {
        lightSystem && lightSystem.drawLight(this);
    }
}
