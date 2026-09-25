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
 * - The pass runs after gameRenderPost, so a HUD drawn there with WebGL is
 *   darkened too; draw the HUD with useWebGL=false (the main canvas) or from
 *   a plugin created after this one
 * - Any EngineObject may override renderLight() to additively contribute to the
 *   lightmap (e.g. emissive lava tiles, weapon flashes, glowing crystals)
 * - Set lightSystem.shadows for objects to block light: each frame every object draws black into a
 *   shadow map through renderShadow(), which calls render() by default; obj.castShadow = false keeps it
 *   out (a floor TileLayer, a background), and setShadowTransparent lets a draw's color tint the light
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
     *  @param {Vector2} [textureSize]  - Size of the lightmap texture (defaults to following mainCanvasSize, which is css pixels, so the lightmap is not scaled by canvasPixelRatio; pass mainCanvasSize.scale(getCanvasPixelRatio()) for a full resolution lightmap)
     *  @param {Color}   [ambientColor] - Color applied to unlit areas of the scene (defaults to BLACK = pitch dark). Set a small RGB like rgb(0.1,0.1,0.15) for a faint "moonlight" baseline so unlit areas aren't fully black.
     *  @example
     *  // simplest usage
     *  new LightSystemPlugin();
     */
    constructor(textureSize, ambientColor)
    {
        ASSERT(engineInitialized || headlessMode, 'create the plugin after engineInit, e.g. in gameInit');
        ASSERT(!lightSystem, 'LightSystemPlugin already initialized');
        ASSERT(!postProcess, 'LightSystemPlugin must be created before PostProcessPlugin');
        lightSystem = this;

        /** @property {boolean} - When false, the render pass is skipped entirely */
        this.enabled = true;
        /** @property {Color} - Baseline color applied to unlit areas of the scene. Defaults to BLACK (pitch dark). Set to a small RGB for a faint ambient. The lightmap is cleared to this color each frame, then lights add on top, then the result multiplies the scene. */
        this.ambientColor = (ambientColor || BLACK).copy();
        /** @property {Vector2} - Size of the lightmap texture, follows mainCanvasSize (css pixels, so it is not scaled by canvasPixelRatio) unless a size was passed */
        this.textureSize = textureSize ? textureSize.copy() : undefined;
        /** @property {boolean} - True when no size was passed, so the lightmap follows mainCanvasSize */
        this.textureSizeAuto = !textureSize;

        /** @property {WebGLTexture|undefined} - The lightmap texture
         *  @type {WebGLTexture|undefined} */
        this.texture = undefined;
        /** @property {WebGLProgram|undefined} - Shader for drawing per-Light falloff blobs into the lightmap
         *  @type {WebGLProgram|undefined} */
        this.lightShader = undefined;
        /** @property {WebGLProgram|undefined} - Shader for compositing the lightmap over the main scene
         *  @type {WebGLProgram|undefined} */
        this.compositeShader = undefined;
        /** @property {WebGLVertexArrayObject|undefined} - Vertex array object for the light shader
         *  @type {WebGLVertexArrayObject|undefined} */
        this.lightVAO = undefined;
        /** @property {WebGLVertexArrayObject|undefined} - Vertex array object for the composite shader
         *  @type {WebGLVertexArrayObject|undefined} */
        this.compositeVAO = undefined;

        /** @property {boolean} - Cast shadows: every object draws black into a shadow map once a frame and each light's rays stop at them; off by default and free when off */
        this.shadows = false;
        /** @property {number} - Pixels across the square shadow map, made again when changed */
        this.shadowMapSize = 1024;
        /** @property {number} - How many times the larger side of the view the shadow map covers, so casters just off screen still cast in; raise it for a camera that turns */
        this.shadowMapScale = 2;
        /** @property {number} - Pixels across each light's own shadow texture, made again when changed */
        this.shadowTextureSize = 256;
        /** @property {number} - Stretch passes per shadow casting light, fewer is cheaper and shorter shadows */
        this.shadowPassCount = 11;
        /** @property {number} - How much light bleeds into a caster's near side, 0 for hard edged casters, 1 for most */
        this.shadowSoftness = .5;
        /** @property {boolean} - True while the shadow pass runs, read only, so a render() can skip parts that should not cast */
        this.shadowPass = false;
        /** @property {WebGLTexture|undefined} - The shadow map, casters drawn black on white around the camera, read only
         *  @type {WebGLTexture|undefined} */
        this.shadowMap = undefined;
        /** @property {WebGLTexture|undefined} - One of the two textures each light's shadow is built in
         *  @type {WebGLTexture|undefined} */
        this.shadowTextureA = undefined;
        /** @property {WebGLTexture|undefined} - The other
         *  @type {WebGLTexture|undefined} */
        this.shadowTextureB = undefined;
        /** @property {WebGLProgram|undefined} - Copies the shadow map around a light into its texture
         *  @type {WebGLProgram|undefined} */
        this.shadowCopyShader = undefined;
        /** @property {WebGLProgram|undefined} - One stretch pass of a light's shadow texture
         *  @type {WebGLProgram|undefined} */
        this.shadowStretchShader = undefined;
        /** @property {WebGLVertexArrayObject|undefined} - Vertex array object for the copy shader
         *  @type {WebGLVertexArrayObject|undefined} */
        this.shadowCopyVAO = undefined;
        /** @property {WebGLVertexArrayObject|undefined} - Vertex array object for the stretch shader
         *  @type {WebGLVertexArrayObject|undefined} */
        this.shadowStretchVAO = undefined;
        /** @property {OffscreenCanvasRenderingContext2D|undefined} - Where Canvas2D draws go during the shadow pass, a 1x1 canvas, so text in a render() is not drawn twice
         *  @type {OffscreenCanvasRenderingContext2D|undefined} */
        this.shadowContext = undefined;
        /** @property {Vector2} - World position of the shadow map's bottom left corner, set each shadow pass */
        this.shadowMapOrigin = vec2();
        /** @property {number} - World size the shadow map covers, set each shadow pass */
        this.shadowMapWorldSize = 0;
        this.shadowMapSizeAllocated = 0;     // sizes the textures were made at, to remake them on a change
        this.shadowTextureSizeAllocated = 0;

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
            // not be set yet at the moment the constructor first ran), and
            // again on a context restore, the canvas may have changed since
            if (lightSystem.textureSizeAuto)
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

            // one quad VAO per program, the engine's unit triangle strip through the named attribute
            lightSystem.lightVAO = createQuadVAO(lightSystem.lightShader, 'g');
            lightSystem.compositeVAO = createQuadVAO(lightSystem.compositeShader, 'p');
        }
        function createQuadVAO(program, attribute)
        {
            const gl = glContext, vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, glGeometryBuffer);
            const location = gl.getAttribLocation(program, attribute);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 8, 0);
            return vao;
        }
        function createTexture(size)
        {
            const gl = glContext, texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return texture;
        }
        function initShadows()
        {
            const gl = glContext, ls = lightSystem;
            ls.shadowMap = createTexture(ls.shadowMapSize);
            ls.shadowTextureA = createTexture(ls.shadowTextureSize);
            ls.shadowTextureB = createTexture(ls.shadowTextureSize);
            ls.shadowMapSizeAllocated = ls.shadowMapSize;
            ls.shadowTextureSizeAllocated = ls.shadowTextureSize;
            ls.shadowContext ||= new OffscreenCanvas(1, 1).getContext('2d');
            // put back the texture the engine tracks
            if (glActiveTexture)
                gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);

            const quadVertex =
                '#version 300 es\n' +
                'precision highp float;'+
                'in vec2 p;'+                   // unit quad [0..1]
                'out vec2 uv;'+
                'void main(){gl_Position=vec4(p+p-1.,1,1);uv=p;}';

            // copy: the shadow map around the light into the light's texture, light at the center
            ls.shadowCopyShader = glCreateProgram(quadVertex,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform sampler2D s;'+         // the shadow map
                'uniform vec2 lightPos;'+
                'uniform float radius;'+
                'uniform vec2 mapOrigin;'+      // world bottom left of the map
                'uniform float mapInvSize;'+    // 1 over the world size it covers
                'in vec2 uv;'+
                'out vec4 c;'+
                'void main(){'+
                'vec2 w=lightPos+(uv-.5)*2.*radius;'+  // world position of this texel
                'vec2 m=(w-mapOrigin)*mapInvSize;'+     // in the map, which holds world up at v=0 like an image
                'c=vec4(texture(s,vec2(m.x,1.-m.y)).rgb,1);'+
                '}');

            // stretch: soften, then multiply by the same texture stretched out from the center
            ls.shadowStretchShader = glCreateProgram(quadVertex,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform sampler2D s;'+         // the previous pass
                'uniform float scale;'+         // how much further out this pass pushes the casters
                'uniform float brightness;'+    // light bled into the near side of casters this pass
                'in vec2 uv;'+
                'out vec4 c;'+
                'void main(){'+
                'float mask=clamp(1.-2.*length(uv-.5),0.,1.);'+  // brightest at the light
                'vec3 a=texture(s,uv).rgb+brightness*mask;'+
                'vec3 b=texture(s,(uv-.5)/scale+.5).rgb;'+
                'c=vec4(a*b,1);'+
                '}');

            ls.shadowCopyVAO = createQuadVAO(ls.shadowCopyShader, 'p');
            ls.shadowStretchVAO = createQuadVAO(ls.shadowStretchShader, 'p');

            // the plugin samples on unit 1 so the engine's tracked texture on unit 0 is untouched
            gl.useProgram(ls.shadowCopyShader);
            gl.uniform1i(glUniformLocation(ls.shadowCopyShader, 's'), 1);
            gl.useProgram(ls.shadowStretchShader);
            gl.uniform1i(glUniformLocation(ls.shadowStretchShader, 's'), 1);
        }
        function freeShadows()
        {
            const gl = glContext, ls = lightSystem;
            gl.deleteTexture(ls.shadowMap);
            gl.deleteTexture(ls.shadowTextureA);
            gl.deleteTexture(ls.shadowTextureB);
            gl.deleteProgram(ls.shadowCopyShader);
            gl.deleteProgram(ls.shadowStretchShader);
            gl.deleteVertexArray(ls.shadowCopyVAO);
            gl.deleteVertexArray(ls.shadowStretchVAO);
            clearShadows();
        }
        function clearShadows()
        {
            const ls = lightSystem;
            ls.shadowMap = ls.shadowTextureA = ls.shadowTextureB = undefined;
            ls.shadowCopyShader = ls.shadowStretchShader = undefined;
            ls.shadowCopyVAO = ls.shadowStretchVAO = undefined;
        }
        function lightSystemShadowPass()
        {
            const ls = lightSystem;

            // make the resources the first time, and again when a size changed
            if (!ls.shadowMap || ls.shadowMapSize !== ls.shadowMapSizeAllocated
                || ls.shadowTextureSize !== ls.shadowTextureSizeAllocated)
            {
                ls.shadowMap && freeShadows();
                initShadows();
            }

            // a square of world space around the camera, rounded to its own texels so the
            // grid stays put in the world as the camera moves, or the shadows would shimmer
            const size = ls.shadowMapSize;
            const view = mainCanvasSize.scale(1/cameraScale);
            const worldSize = ls.shadowMapScale * max(view.x, view.y);
            const texel = worldSize / size;
            const center = vec2(floor(cameraPos.x/texel)*texel, floor(cameraPos.y/texel)*texel);
            ls.shadowMapOrigin = center.subtract(vec2(worldSize/2));
            ls.shadowMapWorldSize = worldSize;

            // draw with the map's camera, the way a tile layer redraw does; Canvas2D draws
            // go to a 1x1 canvas so text in a render() does not reach the screen twice
            const saved = [drawContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle, canvasClearColor, glCustomShader];
            drawContext = ls.shadowContext;
            mainCanvasSize = vec2(size);
            cameraPos = center;
            cameraScale = size / worldSize;
            cameraAngle = 0;
            canvasClearColor = WHITE;
            glSetRenderTarget(ls.shadowMap, true);
            glColorMask = 0xff000000; // every color black, its alpha kept
            ls.shadowPass = true;
            for (const o of engineObjects)
            {
                if (o.destroyed || !o.castShadow) continue;
                setShader(o.shader); // its own Shader as in the main pass, so a snippet that cuts holes casts the same shape
                o.renderShadow();
            }
            ls.shadowPass = false;
            glColorMask = -1;
            glSetRenderTarget();
            [drawContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle, canvasClearColor, glCustomShader] = saved;
        }
        function lightSystemRender()
        {
            if (headlessMode || !glEnable) return;
            if (!lightSystem.enabled) return;
            if (!lightSystem.texture)
            {
                // made now if WebGL was off when the plugin was made, or when a lost context came back
                if (glContext.isContextLost()) return;
                initLightSystem();
                if (!lightSystem.texture) return;
            }

            // 1. flush any in-flight sprite batch from earlier render passes
            glFlush();
            const prevAdditive = glAdditive;

            // 1b. the shadow pass draws every caster black into the shadow map
            if (lightSystem.shadows)
                lightSystemShadowPass();

            // an automatic size follows the canvas, so reallocate the lightmap when
            // the canvas changed size, after the flush so the batch keeps its texture
            const size = lightSystem.textureSize;
            if (lightSystem.textureSizeAuto &&
                (size.x !== mainCanvasSize.x || size.y !== mainCanvasSize.y))
            {
                lightSystem.textureSize = mainCanvasSize.copy();
                glContext.bindTexture(glContext.TEXTURE_2D, lightSystem.texture);
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA,
                    mainCanvasSize.x, mainCanvasSize.y, 0,
                    glContext.RGBA, glContext.UNSIGNED_BYTE, null);
                // put back the texture the engine tracks, a draw in renderLight must not sample the lightmap
                if (glActiveTexture)
                    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
            }

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
            setAdditiveBlendMode();
            glContext.enable(glContext.BLEND);
            glContext.blendFunc(glContext.ONE, glContext.ONE);

            // the camera transform is the same for every light, and a uniform
            // keeps its value per program, so set it once for the whole pass.
            // It is the canvas transform glPreRender built: world→NDC over
            // mainCanvasSize (not textureSize), the viewport handles the
            // lightmap's actual resolution. No y-flip: the composite samples
            // this FBO with gl_FragCoord/iResolution (origin bottom-left), so
            // storing world +Y at the top of the texture lines up with the canvas.
            const ls = lightSystem.lightShader;
            glContext.useProgram(ls);
            glContext.uniformMatrix4fv(glUniformLocation(ls, 'm'), false, glTransform);
            glSetInstancedMode(true);

            for (const o of engineObjects)
                o.destroyed || o.renderLight();

            // 4. drain any sprite-batched draws (e.g. drawTile inside a
            //    custom renderLight override) so they hit the FBO, not the
            //    canvas after we unbind
            glFlush();
            glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);

            // backing store size, mainCanvasSize is css pixels
            glContext.viewport(0, 0, glCanvas.width, glCanvas.height);

            // 5. composite: fullscreen quad, multiplicative blend onto glCanvas
            //    (scene * lightmap — unlit areas go to black, lit areas are
            //    the scene tinted by the accumulated light color)
            glContext.useProgram(lightSystem.compositeShader);
            glContext.bindVertexArray(lightSystem.compositeVAO);
            glContext.activeTexture(glContext.TEXTURE0);
            glContext.bindTexture(glContext.TEXTURE_2D, lightSystem.texture);
            const cs = lightSystem.compositeShader;
            glContext.uniform1i(glUniformLocation(cs, 's'), 0);
            glContext.uniform3f(glUniformLocation(cs, 'iResolution'),
                mainCanvas.width, mainCanvas.height, 1);
            glContext.blendFunc(glContext.DST_COLOR, glContext.ZERO);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

            // 6. restore engine state so subsequent draws use the engine's
            //    tracked texture binding (otherwise glSetTexture would think
            //    the prior texture was still bound when actually the lightmap
            //    is, and any debug text / future draw could sample the lightmap)
            if (glActiveTexture)
                glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
            setAdditiveBlendMode(prevAdditive);
            glSetInstancedMode(true);
        }
        function lightSystemContextLost()
        {
            lightSystem.texture = undefined;
            lightSystem.lightShader = undefined;
            lightSystem.compositeShader = undefined;
            lightSystem.lightVAO = undefined;
            lightSystem.compositeVAO = undefined;
            clearShadows();
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

        // skip a light that can not touch the screen, its quad is the full
        // radius out from its center on every side
        if (!isOnScreen(light.pos, light.radius*2)) return;

        // drain any sprite-batched draws queued by a previous custom
        // renderLight() override (e.g. drawRect inside a LavaTile). They were
        // queued in the engine's instanced-vertex format and must flush with
        // the engine's shader+VAO bound — NOT this plugin's light shader.
        glFlush();

        glContext.useProgram(this.lightShader);
        glContext.bindVertexArray(this.lightVAO);

        // the camera transform 'm' was set once for the pass by the plugin
        const ls = this.lightShader;
        glContext.uniform2f(glUniformLocation(ls, 'lightPos'), light.pos.x, light.pos.y);
        glContext.uniform1f(glUniformLocation(ls, 'radius'), light.radius);
        glContext.uniform1f(glUniformLocation(ls, 'fadeRange'), light.fadeRange);
        const c = light.color;
        glContext.uniform4f(glUniformLocation(ls, 'color'), c.r, c.g, c.b, c.a);

        glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

        // restore engine's instanced shader+VAO so subsequent renderLight()
        // overrides that batch through drawRect/drawTile work correctly
        glSetInstancedMode(true);
    }

    /** In the shadow pass, let the draws that follow keep their color in the shadow map, so light passing
     *  through them is tinted instead of blocked: a stained glass window, colored smoke. Does nothing outside
     *  the pass, so a render() can call it around those draws unconditionally; set it back to false after them.
     *  @param {boolean} [transparent] */
    setShadowTransparent(transparent=true)
    {
        // the mask applies as each draw is queued, so nothing needs flushing
        if (this.shadowPass)
            glColorMask = transparent ? -1 : 0xff000000;
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * A Light is an EngineObject that contributes a soft additive blob of color
 * to the LightSystem plugin's lightmap.
 * - castShadow on a Light means its rays stop at casters when lightSystem.shadows is on, three.js's meaning
 *   for a light; a Light's own render() draws nothing so the object meaning never applies to it
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
        this.mass = 0; // static, a light stays where it is put in a game with gravity
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
