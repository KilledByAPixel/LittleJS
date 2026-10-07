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
 *   lightmap (e.g. lava that lights the floor around it, weapon flashes, glowing crystals)
 * - Set obj.emissive to 1 to show an object at full brightness in its own colors, lit or not, or between 0 and 1 for
 *   partly: it draws its shape into the lightmap through renderEmissive(), which calls render() by default; exact for
 *   solid pixels, a partly transparent one is self lit by its alpha too, so it shows darker
 * - Set lightSystem.shadows for objects to block light: each frame every object draws black into a
 *   shadow map through renderShadow(), which calls render() by default; obj.castShadow = false keeps it
 *   out (a floor TileLayer, a background), a draw's alpha sets how much light it blocks, and
 *   setShadowTransparent lets its color tint the light
 * - Set light.glow for a soft hazy glow over a light, like a lamp at night; it is added over the lit scene after the
 *   lightmap, so it shows in the dark and sits in front of everything there
 * - A DirectionalLight is a sun: one per scene, it lights everything from one direction, foreground casters throw long
 *   shadows and objects with castBackgroundShadow are lit only at their edges facing it
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
    /** Create the global light system plugin
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
        this.shadersFailed = false; // a shader did not build on this device, so the system draws nothing
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
        /** @property {number} - How many times the larger side of the view the shadow map covers, so casters just off screen still cast in; raise it when lights reach further than a view past the screen */
        this.shadowMapScale = 2;
        /** @property {number} - Pixels across each light's own shadow texture, made again when changed; larger is sharper,
         *  and a gap between casters narrower than about 4*radius/shadowTextureSize world units closes */
        this.shadowTextureSize = 256;
        /** @property {number} - Stretch passes per shadow casting light, fewer is cheaper and shorter shadows */
        this.shadowPassCount = 16;
        /** @property {number} - How much light bleeds into a caster's near side, 0 for hard edged casters, 1 for most;
         *  the bleed reaches further in under a bigger light, so a thin wall under a big one lets some through, lower it
         *  for those */
        this.shadowSoftness = .5;
        /** @property {boolean} - True while the shadow pass runs, read only, so a render() can skip parts that should not cast */
        this.shadowPass = false;
        /** @property {boolean} - True while emissive objects draw into the lightmap, read only, see EngineObject.emissive */
        this.emissivePass = false;
        /** @property {WebGLTexture|undefined} - The shadow map, casters drawn black on white around the camera, read only
         *  @type {WebGLTexture|undefined} */
        this.shadowMap = undefined;
        /** @property {WebGLTexture|undefined} - The background map, objects with castBackgroundShadow drawn black on
         *  white, the shadow map's size and place, made by a directional light when something casts into it and kept while the light is, read only
         *  @type {WebGLTexture|undefined} */
        this.backgroundMap = undefined;
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
        /** @property {OffscreenCanvasRenderingContext2D|undefined} - Where Canvas2D draws go during the shadow and emissive passes, a 1x1 canvas, so text in a render() is not drawn twice
         *  @type {OffscreenCanvasRenderingContext2D|undefined} */
        this.shadowContext = undefined;
        /** @property {Vector2} - World position of the shadow map's bottom left corner, set each shadow pass */
        this.shadowMapOrigin = vec2();
        /** @property {number} - World size the shadow map covers, set each shadow pass */
        this.shadowMapWorldSize = 0;
        /** @property {DirectionalLight|undefined} - The scene's directional light, a sun, or undefined, read only
         *  @type {DirectionalLight|undefined} */
        this.directionalLight = undefined;
        /** @property {number} - Pixels across the square textures a directional light is built in, covering the
         *  shadow map's area; larger is sharper and slower; a power of two, as shadowMapSize, so their texels line up */
        this.directionalTextureSize = 512;
        /** @property {WebGLTexture|undefined} - The directional light as built this frame, white where it reaches,
         *  over the shadow map's area, read only
         *  @type {WebGLTexture|undefined} */
        this.directionalTexture = undefined;
        /** @type {WebGLTexture|undefined} */
        this.directionalTextureA = undefined; // where it is built, ping ponged
        /** @type {WebGLTexture|undefined} */
        this.directionalTextureB = undefined;
        this.directionalTextureSizeAllocated = 0;
        this.backgroundCasters = false; // anything has castBackgroundShadow, checked each shadow pass
        /** @type {Object<string, WebGLProgram|WebGLVertexArrayObject>} */
        this.directionalPrograms = {}; // its programs and their vertex arrays, by name
        this.shadowMapSizeAllocated = 0;     // sizes the textures were made at, to remake them on a change
        this.shadowTextureSizeAllocated = 0;

        // a full texture quad, the vertex shader of the shadow and directional programs
        const quadVertex =
            '#version 300 es\n' +
            'precision highp float;'+
            'in vec2 p;'+                   // unit quad [0..1]
            'out vec2 uv;'+
            'void main(){gl_Position=vec4(p+p-1.,1,1);uv=p;}';
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

            // where Canvas2D draws go during the shadow and emissive passes
            lightSystem.shadowContext ||= createCanvasContext(1);

            // resolve texture size default at init time (mainCanvasSize may
            // not be set yet at the moment the constructor first ran), and
            // again on a context restore, the canvas may have changed since
            if (lightSystem.textureSizeAuto)
                lightSystem.textureSize = mainCanvasSize.copy();
            lightSystem.clampTextureSizes();

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
                'out vec2 vUV;'+           // across the light's quad, the shadow texture's uv
                'void main(){'+
                'vec2 worldP=lightPos+(g-.5)*2.*radius;'+
                'gl_Position=m*vec4(worldP,1,1);'+
                'vWorldPos=worldP;'+
                'vUV=g;'+
                '}'
                ,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform vec2 lightPos;'+
                'uniform float radius;'+
                'uniform float fadeRange;'+
                'uniform vec4 color;'+
                'uniform sampler2D shadowTexture;'+ // this light's shadow, white where its rays reach
                'uniform bool useShadow;'+
                'in vec2 vWorldPos;'+
                'in vec2 vUV;'+
                'out vec4 c;'+
                'void main(){'+
                'float dist=distance(vWorldPos,lightPos);'+
                'float t=clamp((radius-dist)/max(fadeRange,1e-6),0.,1.);'+
                'c=vec4(color.rgb*t*color.a,1.);'+
                'if(useShadow)c.rgb*=texture(shadowTexture,vUV).rgb;'+
                '}'
            );
            if (lightSystemShadersFailed(lightSystem.lightShader)) return;
            // the shadow texture is on unit 1, the engine's tracked texture stays on unit 0
            glContext.useProgram(lightSystem.lightShader);
            glContext.uniform1i(glUniformLocation(lightSystem.lightShader, 'shadowTexture'), 1);

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

            if (lightSystemShadersFailed(lightSystem.compositeShader)) return;

            // one quad VAO per program, the engine's unit triangle strip through the named attribute
            lightSystem.lightVAO = createQuadVAO(lightSystem.lightShader, 'g');
            lightSystem.compositeVAO = createQuadVAO(lightSystem.compositeShader, 'p');
        }
        // a program that did not build in a release build draws nothing, so the light system turns itself off, said
        // once, and the scene draws as it would without it; true when it is off
        function lightSystemShadersFailed(...programs)
        {
            if (!lightSystem.shadersFailed && programs.some((program)=> glFailedPrograms.has(program)))
            {
                console.error('LightSystemPlugin: its shaders did not build on this device, the scene draws without it');
                lightSystem.shadersFailed = true;
            }
            return lightSystem.shadersFailed;
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
            // put back the texture the engine tracks
            if (glActiveTexture)
                gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
            if (ls.shadowCopyShader)
                return; // the programs are kept while the textures are made again

            // copy: the shadow map around the light into the light's texture, light at the center
            ls.shadowCopyShader = glCreateProgram(quadVertex,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform sampler2D s;'+         // the shadow map
                'uniform vec2 lightPos;'+
                'uniform float radius;'+
                'uniform vec2 mapOrigin;'+      // world bottom left of the map
                'uniform float mapInvSize;'+    // 1 over the world size it covers
                'uniform float tap;'+           // half a texel of the light's texture, in world units
                'uniform float core;'+          // radius around the light where casters are left out
                'in vec2 uv;'+
                'out vec4 c;'+
                'void main(){'+
                'vec2 w=lightPos+(uv-.5)*2.*radius;'+  // world position of this texel
                'vec3 o=vec3(1);'+
                // the darkest of four taps a half texel out, so a caster a texel thin still covers two whole
                // texels, the stretch's filtering between two would leak through one
                'for(int i=0;i<4;i++){'+
                'vec2 m=(w+tap*(vec2(i%2,i/2)*2.-1.)-mapOrigin)*mapInvSize;'+ // in the map, world up at v=0
                // past the map's edge is open, clamping would stretch its edge texels across the light
                'o=min(o,m==clamp(m,0.,1.)?texture(s,vec2(m.x,1.-m.y)).rgb:vec3(1));'+
                '}'+
                'c=vec4(length(w-lightPos)<core?vec3(1):o,1);'+
                '}');

            // stretch: each texel keeps the darkest of itself and the texel toward the light, so a caster's
            // alpha and color carry through as they are; the bleed lights a caster's near side only where
            // the ray from the light still reaches, so it never lifts a texel already in shadow
            ls.shadowStretchShader = glCreateProgram(quadVertex,
                '#version 300 es\n' +
                'precision highp float;'+
                'uniform sampler2D s;'+         // the previous pass
                'uniform float scale;'+         // how much further out this pass pushes the casters
                'uniform float brightness;'+    // light bled into the near side of casters this pass
                'in vec2 uv;'+
                'out vec4 c;'+
                'void main(){'+
                'float mask=1.-smoothstep(.35,.525,length(uv-.5));'+ // full out to 70% of the radius, FrankEngine's light mask
                'vec3 b=texture(s,(uv-.5)/scale+.5).rgb;'+
                'c=vec4(min(texture(s,uv).rgb+brightness*mask*b,b),1);'+
                '}');

            if (lightSystemShadersFailed(ls.shadowCopyShader, ls.shadowStretchShader)) return;
            ls.shadowCopyVAO = createQuadVAO(ls.shadowCopyShader, 'p');
            ls.shadowStretchVAO = createQuadVAO(ls.shadowStretchShader, 'p');

            // the plugin samples on unit 1 so the engine's tracked texture on unit 0 is untouched
            gl.useProgram(ls.shadowCopyShader);
            gl.uniform1i(glUniformLocation(ls.shadowCopyShader, 's'), 1);
            gl.useProgram(ls.shadowStretchShader);
            gl.uniform1i(glUniformLocation(ls.shadowStretchShader, 's'), 1);
        }
        // let go of the shadow textures, the programs stay, small, so a new size or a sun made again compiles nothing
        function freeShadowTextures()
        {
            const gl = glContext, ls = lightSystem;
            gl.deleteTexture(ls.shadowMap);
            gl.deleteTexture(ls.shadowTextureA);
            gl.deleteTexture(ls.shadowTextureB);
            gl.deleteTexture(ls.backgroundMap);
            ls.shadowMap = ls.shadowTextureA = ls.shadowTextureB = ls.backgroundMap = undefined;
        }
        function clearShadows()
        {
            const ls = lightSystem;
            ls.shadowMap = ls.shadowTextureA = ls.shadowTextureB = ls.backgroundMap = undefined;
            ls.shadowCopyShader = ls.shadowStretchShader = undefined;
            ls.shadowCopyVAO = ls.shadowStretchVAO = undefined;
        }
        function lightSystemShadowPass()
        {
            const ls = lightSystem;

            // make the resources the first time, and again when a size changed
            ls.clampTextureSizes();
            if (!ls.shadowMap || ls.shadowMapSize !== ls.shadowMapSizeAllocated
                || ls.shadowTextureSize !== ls.shadowTextureSizeAllocated)
            {
                ls.shadowMap && freeShadowTextures();
                initShadows();
                if (ls.shadersFailed) return;
            }

            // a square of world space around the camera, rounded to its own texels so the
            // grid stays put in the world as the camera moves, or the shadows would shimmer
            const size = ls.shadowMapSize;
            const view = mainCanvasSize.scale(1/cameraScale);
            const worldSize = ls.shadowMapScale * max(view.x, view.y);
            // with a sun, on the coarser of its texels and the map's, or its area would move by half its texels and a
            // still caster's shadow edge would jump as the camera pans
            const grid = ls.directionalLight ? min(size, ls.directionalTextureSize) : size;
            ASSERT(!ls.directionalLight || max(size, ls.directionalTextureSize) % grid === 0,
                'with a DirectionalLight, shadowMapSize and directionalTextureSize must each be a whole multiple of the ' +
                'other, as powers of two are, or the shadows shimmer as the camera pans', size, ls.directionalTextureSize);
            const texel = worldSize / grid;
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
            glSkipScreenSpace = true; // the map's camera would put them anywhere
            ls.shadowPass = true;
            try
            {
                // the foreground map, then the background map while a directional light needs it, each cleared to
                // white, every caster black with its alpha kept, set for each object since a render that left
                // setShadowTransparent on ends with it
                const drawMap = (target, casts)=>
                {
                    glSetRenderTarget(target, true);
                    for (const o of engineObjects)
                    {
                        if (o.destroyed || !casts(o)) continue;
                        glColorMask = 0xff000000;
                        setShader(o.shader); // its own Shader as in the main pass, so a snippet that cuts holes casts the same shape
                        o.renderShadow();
                    }
                    glFlush();
                };
                if (ls.shadows || ls.directionalLight?.castShadow)
                    drawMap(ls.shadowMap, (o)=> o.castShadow); // nothing reads it for a sun that casts no shadows
                // the background map only when something casts into it, most scenes have nothing there
                ls.backgroundCasters = !!ls.directionalLight &&
                    engineObjects.some((o)=> !o.destroyed && o.castBackgroundShadow);
                if (ls.backgroundCasters)
                {
                    if (!ls.backgroundMap)
                    {
                        ls.backgroundMap = createTexture(size);
                        glActiveTexture && glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
                    }
                    drawMap(ls.backgroundMap, (o)=> o.castBackgroundShadow);
                }
            }
            finally
            {
                // hand everything back even when a render threw, or every frame after it draws black with no text
                ls.shadowPass = false;
                glColorMask = -1;
                glSkipScreenSpace = false;
                glSetRenderTarget();
                [drawContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle, canvasClearColor, glCustomShader] = saved;
            }
        }
        // the directional light's textures and programs, made when one is first drawn and again when the size changes
        function initDirectionalTextures()
        {
            const gl = glContext, ls = lightSystem, size = ls.directionalTextureSize;
            ls.directionalTexture = createTexture(size);
            ls.directionalTextureA = createTexture(size);
            ls.directionalTextureB = createTexture(size);
            ls.directionalTextureSizeAllocated = size;
            glActiveTexture && gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
        }
        function freeDirectionalTextures()
        {
            const gl = glContext, ls = lightSystem;
            for (const texture of [ls.directionalTexture, ls.directionalTextureA, ls.directionalTextureB])
                gl.deleteTexture(texture);
            ls.directionalTexture = ls.directionalTextureA = ls.directionalTextureB = undefined;
            ls.directionalTextureSizeAllocated = 0;
        }
        // its programs, made once, a new texture size keeps them
        function initDirectional()
        {
            const gl = glContext, ls = lightSystem, p = ls.directionalPrograms;

            // the maps are stored world up at v=0, the work textures world up at v=1, so a map is read at 1-v
            const header = '#version 300 es\nprecision highp float;in vec2 uv;out vec4 c;';

            // seed: the darkest of four taps across a work texel, so a caster thinner than a texel still darkens it;
            // the foreground when useF is on, times the background when useB is
            p.seed = glCreateProgram(quadVertex, header +
                'uniform sampler2D f,b;uniform float useF,useB,tap;'+
                'void main(){vec3 o=vec3(1);'+
                'for(int i=0;i<4;i++){vec2 m=uv+tap*(vec2(i%2,i/2)*2.-1.);m.y=1.-m.y;'+
                'vec3 v=mix(vec3(1),texture(f,m).rgb,useF)*mix(vec3(1),texture(b,m).rgb,useB);o=min(o,v);}'+
                'c=vec4(o,1);}');

            // long shadow pass: the darker of this texel and the one a shift upstream made lighter by fade, so a
            // shadow lightens with its distance from the caster; past the area upstream is open
            p.shadow = glCreateProgram(quadVertex, header +
                'uniform sampler2D s;uniform vec2 shift;uniform float fade;'+
                'void main(){vec2 u=uv-shift;'+
                'vec3 b=u==clamp(u,0.,1.)?texture(s,u).rgb+fade:vec3(1);'+
                'c=vec4(min(texture(s,uv).rgb,b),1);}');

            // background leak pass, the long shadow pass turned around: the brighter of this texel and the light a
            // shift upstream made dimmer by fade, so light comes into a background area from its edges facing the
            // light and fades evenly to nothing by backgroundDepth; past the area upstream is open sky
            p.leak = glCreateProgram(quadVertex, header +
                'uniform sampler2D s;uniform vec2 shift;uniform float fade;'+
                'void main(){vec2 u=uv-shift;'+
                'vec3 b=(u==clamp(u,0.,1.)?texture(s,u).rgb:vec3(1))-fade;'+
                'c=vec4(max(texture(s,uv).rgb,b),1);}');

            // combine: long shadows times the leak, and a caster's texels take some of the light just upstream
            // of them, a rim on its side facing the light
            p.combine = glCreateProgram(quadVertex, header +
                'uniform sampler2D s,t,f;uniform vec2 rim;uniform float useF,useT;'+
                'void main(){vec3 l=texture(s,uv).rgb*mix(vec3(1),texture(t,uv).rgb,useT);'+
                'vec2 u=uv-rim;vec3 up=u==clamp(u,0.,1.)?texture(s,u).rgb*mix(vec3(1),texture(t,u).rgb,useT):vec3(1);'+
                'vec3 dark=1.-mix(vec3(1),texture(f,vec2(uv.x,1.-uv.y)).rgb,useF);'+
                'c=vec4(max(l,.8*up*dark),1);}');

            // add: a world space quad over the area, the built light in the light's color, into the lightmap
            p.add = glCreateProgram(
                '#version 300 es\nprecision highp float;uniform mat4 m;uniform vec2 origin;uniform float worldSize;'+
                // three times the area, its edge texels carried on by the clamp, so the sun reaches the whole view however
                // small the map or turned the camera
                'in vec2 g;out vec2 uv;void main(){uv=g*3.-1.;gl_Position=m*vec4(origin+uv*worldSize,1,1);}',
                header + 'uniform sampler2D s;uniform vec4 color;'+
                'void main(){c=vec4(texture(s,uv).rgb*color.rgb*color.a,1);}');

            if (lightSystemShadersFailed(p.seed, p.shadow, p.leak, p.combine, p.add)) return;
            p.seedVAO = createQuadVAO(p.seed, 'p');
            p.shadowVAO = createQuadVAO(p.shadow, 'p');
            p.leakVAO = createQuadVAO(p.leak, 'p');
            p.combineVAO = createQuadVAO(p.combine, 'p');
            p.addVAO = createQuadVAO(p.add, 'g');

            // samplers on units 1, 2 and 3, the engine's tracked texture on unit 0 stays as it is
            const units = (program, names)=>
            {
                gl.useProgram(program);
                names.forEach((name, i)=> gl.uniform1i(glUniformLocation(program, name), i + 1));
            };
            units(p.seed, ['f', 'b']);
            units(p.shadow, ['s']);
            units(p.leak, ['s']);
            units(p.combine, ['s', 't', 'f']);
            units(p.add, ['s']);
        }
        // let go of the textures a directional light made, its work textures and the background map; its programs
        // stay, small, so a sun made again, as a day and night or a level with its own does, compiles nothing
        function freeDirectional()
        {
            freeDirectionalTextures();
            glContext.deleteTexture(lightSystem.backgroundMap);
            lightSystem.backgroundMap = undefined;
            lightSystem.backgroundCasters = false;
        }
        function clearDirectional()
        {
            const ls = lightSystem;
            ls.directionalTexture = ls.directionalTextureA = ls.directionalTextureB = undefined;
            ls.directionalPrograms = {};
            ls.directionalTextureSizeAllocated = 0;
        }

        // build the directional light into directionalTexture, over the shadow map's area: long shadows from the
        // foreground, times the background leak, with a rim on casters; leaves no framebuffer bound
        function lightSystemDirectionalPass()
        {
            const gl = glContext, ls = lightSystem, light = ls.directionalLight;
            if (!ls.directionalPrograms.seed)
            {
                initDirectional();
                if (ls.shadersFailed) return;
            }
            if (!ls.directionalTexture || ls.directionalTextureSize !== ls.directionalTextureSizeAllocated)
            {
                ls.directionalTexture && freeDirectionalTextures();
                initDirectionalTextures();
            }
            const p = ls.directionalPrograms, N = ls.directionalTextureSize, W = ls.shadowMapWorldSize;
            const d = light.sunDirection.normalize(-1), toUV = (texels)=> vec2(d.x * texels / N, d.y * texels / N);
            const casts = light.castShadow ? 1 : 0;
            const cap = ceil(log2(N)) + 1; // passes enough to cross the texture, so a long shadow fades out, never cut off

            gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);
            gl.viewport(0, 0, N, N);
            gl.disable(gl.BLEND);
            const target = (texture)=> gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            const bind = (unit, texture)=> { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); };
            const use = (name)=> { gl.useProgram(p[name]); gl.bindVertexArray(p[name + 'VAO']); return p[name]; };
            const draw = ()=> gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            const u = glUniformLocation;

            // long shadows: the foreground seeded into A, then passes shifting twice as far each time, ping ponged
            let program = use('seed');
            bind(1, ls.shadowMap); bind(2, ls.backgroundMap || ls.shadowMap); // a texture on the unit, though unread
            gl.uniform1f(u(program, 'useF'), casts);
            gl.uniform1f(u(program, 'useB'), 0);
            gl.uniform1f(u(program, 'tap'), .25 / N);
            target(ls.directionalTextureA); draw();
            let src = ls.directionalTextureA, dst = ls.directionalTextureB;
            const L = light.shadowLength * N / W;
            if (casts && L > 0)
            {
                program = use('shadow');
                const passes = clamp(ceil(log2(max(L, 1))), 1, cap);
                for (let k = 0; k < passes; ++k)
                {
                    const shift = toUV(2**k);
                    gl.uniform2f(u(program, 'shift'), shift.x, shift.y);
                    gl.uniform1f(u(program, 'fade'), 2**k / L);
                    bind(1, src); target(dst); draw();
                    [src, dst] = [dst, src];
                }
            }
            const shadows = src, free = dst; // the long shadows, and the other work texture

            // the background leak, seeded from the background alone into the free texture, only when something casts
            // into the background map; with nothing there the combine leaves it out; the foreground is in the long
            // shadows already, and seeding it here too darkened a see through caster twice, only beside a background
            const leaks = ls.backgroundCasters;
            if (leaks)
            {
                program = use('seed');
                bind(1, ls.shadowMap); bind(2, ls.backgroundMap);
                gl.uniform1f(u(program, 'useF'), 0);
                gl.uniform1f(u(program, 'useB'), 1);
                target(free); draw();
            }
            let leakSrc = free, leakDst = ls.directionalTexture;
            const D = light.backgroundDepth * N / W;
            if (leaks && D > 0)
            {
                // passes shifting twice as far each time, as the long shadows, so the light fades in evenly by D
                program = use('leak');
                const passes = clamp(ceil(log2(max(D, 1))), 1, cap);
                for (let k = 0; k < passes; ++k)
                {
                    const shift = toUV(2**k);
                    gl.uniform2f(u(program, 'shift'), shift.x, shift.y);
                    gl.uniform1f(u(program, 'fade'), 2**k / D);
                    bind(1, leakSrc); target(leakDst); draw();
                    [leakSrc, leakDst] = [leakDst, leakSrc];
                }
            }

            // combine into the one of the three textures left, long shadows times the leak, with a rim on casters;
            // it is the built light from now on, the other two its work textures
            const textures = [ls.directionalTexture, ls.directionalTextureA, ls.directionalTextureB];
            const built = textures.find((texture)=> texture !== shadows && texture !== leakSrc);
            program = use('combine');
            bind(1, shadows); bind(2, leakSrc); bind(3, ls.shadowMap);
            const rim = toUV(3);
            gl.uniform2f(u(program, 'rim'), rim.x, rim.y);
            gl.uniform1f(u(program, 'useF'), casts);
            gl.uniform1f(u(program, 'useT'), leaks ? 1 : 0);
            target(built); draw();
            [ls.directionalTextureA, ls.directionalTextureB] = textures.filter((texture)=> texture !== built);
            ls.directionalTexture = built;

            // hand the engine its state back: unit 0 active with its texture, no framebuffer
            bind(1, null); bind(2, null); bind(3, null);
            gl.activeTexture(gl.TEXTURE0);
            glActiveTexture && gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.enable(gl.BLEND);
        }
        function lightSystemRender()
        {
            if (headlessMode || !glEnable || lightSystem.shadersFailed) return;
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

            // 1b. the shadow pass draws every caster black into the shadow map, for shadows or a directional light
            if (lightSystem.shadows || lightSystem.directionalLight)
                lightSystemShadowPass();
            if (lightSystem.shadersFailed) return;

            // 1c. the directional light is built from the maps, before the lightmap is bound
            const sun = lightSystem.directionalLight;
            if (sun)
                lightSystemDirectionalPass();
            else
            {
                // the sun is gone, so are its textures, and the shadow map it made when shadows are off
                if (lightSystem.directionalTexture || lightSystem.backgroundMap)
                    freeDirectional();
                if (!lightSystem.shadows && lightSystem.shadowMap)
                    freeShadowTextures();
            }
            if (lightSystem.shadersFailed) return;

            // an automatic size follows the canvas, so reallocate the lightmap when
            // the canvas changed size, after the flush so the batch keeps its texture
            const size = lightSystem.textureSize;
            const wantX = glClampTextureSize(mainCanvasSize.x), wantY = glClampTextureSize(mainCanvasSize.y);
            if (lightSystem.textureSizeAuto && (size.x !== wantX || size.y !== wantY))
            {
                lightSystem.textureSize = vec2(wantX, wantY);
                glContext.bindTexture(glContext.TEXTURE_2D, lightSystem.texture);
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA,
                    wantX, wantY, 0,
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

            // a target set and ended while the lights draw, a tile layer redrawn in a renderLight, comes back here
            glRenderTargetBase = [lightSystem.texture, lightSystem.textureSize];
            try
            {
                for (const o of engineObjects)
                {
                    if (o.destroyed) continue;
                    glAdditive || setAdditiveBlendMode(); // added again, an emitter ends its render with it off
                    o.renderLight();
                }

                // 3a. the directional light, added over the shadow map's area in its color
                if (sun && lightSystem.directionalTexture)
                {
                    glFlush();
                    const gl = glContext, p = lightSystem.directionalPrograms, as = p.add, c = sun.color;
                    gl.useProgram(as);
                    gl.bindVertexArray(p.addVAO);
                    gl.uniformMatrix4fv(glUniformLocation(as, 'm'), false, glTransform);
                    gl.uniform2f(glUniformLocation(as, 'origin'), lightSystem.shadowMapOrigin.x, lightSystem.shadowMapOrigin.y);
                    gl.uniform1f(glUniformLocation(as, 'worldSize'), lightSystem.shadowMapWorldSize);
                    gl.uniform4f(glUniformLocation(as, 'color'), c.r, c.g, c.b, c.a);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, lightSystem.directionalTexture);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    glSetInstancedMode(true);
                }

                // 3b. emissive objects draw their shape in gray at their emissive level, white at 1, adding that much
                //     light where they are so they show their own colors; text goes to the 1x1 canvas as in the
                //     shadow pass, so it is not drawn twice
                const saved = [drawContext, glCustomShader];
                drawContext = lightSystem.shadowContext;
                lightSystem.emissivePass = true;
                try
                {
                    for (const o of engineObjects)
                    {
                        if (o.destroyed || !(o.emissive > 0)) continue;
                        const level = clamp(o.emissive)*255+.5|0; // packed like rgbaInt, red in the low byte
                        glColorMask = 0xff000000; // its own alpha, and the gray from the additive color
                        glColorAdditive = level | level<<8 | level<<16;
                        glAdditive || setAdditiveBlendMode(); // added, an emitter ends its render with it off
                        setShader(o.shader);
                        o.renderEmissive();
                    }
                    glFlush();
                }
                finally
                {
                    lightSystem.emissivePass = false;
                    glColorMask = -1;
                    glColorAdditive = 0;
                    [drawContext, glCustomShader] = saved;
                }
            }
            finally
            {
                glRenderTargetBase = undefined;
            }

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
            glSetInstancedMode(true);

            // 7. the lights' glows, added over the lit scene so the darkness does not dim them
            setAdditiveBlendMode();
            for (const o of engineObjects)
                o instanceof Light && !o.destroyed && o.renderGlow();
            glFlush();
            setAdditiveBlendMode(prevAdditive);
        }
        function lightSystemContextLost()
        {
            lightSystem.texture = undefined;
            lightSystem.lightShader = undefined;
            lightSystem.compositeShader = undefined;
            lightSystem.lightVAO = undefined;
            lightSystem.compositeVAO = undefined;
            clearShadows();
            clearDirectional();
            LOG('LightSystemPlugin: WebGL context lost');
        }
        function lightSystemContextRestored()
        {
            lightSystem.shadersFailed = false; // tried again on the new context, as the 3D renderer is
            initLightSystem();
            LOG('LightSystemPlugin: WebGL context restored');
        }
    }

    /** Bring the sizes of the textures it makes down to what the device can make: shadowMapSize, shadowTextureSize
     *  and a textureSize given by hand; called before they are made, so a size too big falls back instead of failing */
    clampTextureSizes()
    {
        this.shadowMapSize = glClampTextureSize(this.shadowMapSize);
        this.shadowTextureSize = glClampTextureSize(this.shadowTextureSize);
        ASSERT(isNumber(this.directionalTextureSize) && this.directionalTextureSize >= 1,
            'directionalTextureSize is texels, 1 or more, taken down to whole texels', this.directionalTextureSize);
        this.directionalTextureSize = glClampTextureSize(max(1, floor(this.directionalTextureSize) || 1));
        const size = this.textureSize;
        if (!size) return;
        const x = glClampTextureSize(size.x), y = glClampTextureSize(size.y);
        if (x !== size.x || y !== size.y)
            this.textureSize = vec2(x, y); // only when it is too large, this runs every frame
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

        // a shadow casting light builds its shadow texture first, leaving it on unit 1 and the lightmap bound
        const useShadow = this.shadows && light.castShadow && !!this.shadowMap;
        useShadow && this.renderLightShadow(light);

        glContext.useProgram(this.lightShader);
        glContext.bindVertexArray(this.lightVAO);
        glContext.enable(glContext.BLEND);
        glContext.blendFunc(glContext.ONE, glContext.ONE); // added, whatever a tile layer redrawn before it left set

        // the camera transform 'm' was set once for the pass by the plugin
        const ls = this.lightShader;
        glContext.uniform2f(glUniformLocation(ls, 'lightPos'), light.pos.x, light.pos.y);
        glContext.uniform1f(glUniformLocation(ls, 'radius'), light.radius);
        glContext.uniform1f(glUniformLocation(ls, 'fadeRange'), light.fadeRange);
        glContext.uniform1i(glUniformLocation(ls, 'useShadow'), useShadow ? 1 : 0);
        const c = light.color;
        glContext.uniform4f(glUniformLocation(ls, 'color'), c.r, c.g, c.b, c.a);

        glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);

        // restore engine's instanced shader+VAO so subsequent renderLight()
        // overrides that batch through drawRect/drawTile work correctly
        glSetInstancedMode(true);
    }

    /** Build a light's shadow texture from the shadow map: the map around the light, its casters stretched
     *  away from the light a little further each pass with light bled into their near sides. Leaves the
     *  result on texture unit 1 and the lightmap bound again. Called by drawLight.
     *  @param {Light} light */
    renderLightShadow(light)
    {
        const gl = glContext, size = this.shadowTextureSize;
        gl.disable(gl.BLEND);
        gl.viewport(0, 0, size, size);
        gl.activeTexture(gl.TEXTURE1);

        // the shadow map around the light, light at the center of the texture
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTextureA, 0);
        const cs = this.shadowCopyShader;
        gl.useProgram(cs);
        gl.bindVertexArray(this.shadowCopyVAO);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
        gl.uniform2f(glUniformLocation(cs, 'lightPos'), light.pos.x, light.pos.y);
        gl.uniform1f(glUniformLocation(cs, 'radius'), light.radius);
        gl.uniform2f(glUniformLocation(cs, 'mapOrigin'), this.shadowMapOrigin.x, this.shadowMapOrigin.y);
        gl.uniform1f(glUniformLocation(cs, 'mapInvSize'), 1/this.shadowMapWorldSize);
        gl.uniform1f(glUniformLocation(cs, 'tap'), light.radius/size);
        gl.uniform1f(glUniformLocation(cs, 'core'), light.shadowCore);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // stretch the casters out from the light, starting a 128th of the texture and growing 1.5x a pass, which
        // reaches the edge in about 16 passes with no gaps since each pass scales by less than the shadow already
        // extends; small steps, so the bleed does not show as stairs along the shadow edges; a fraction of the
        // texture rather than a count of texels, so a larger texture only makes the shadows sharper, not shorter;
        // the bleed fades out over the first 10 passes, the distances FrankEngine's soften covered at 1.8x
        const ss = this.shadowStretchShader;
        gl.useProgram(ss);
        gl.bindVertexArray(this.shadowStretchVAO);
        let src = this.shadowTextureA, dst = this.shadowTextureB;
        for (let k = 0; k < this.shadowPassCount; ++k)
        {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
            gl.bindTexture(gl.TEXTURE_2D, src);
            gl.uniform1f(glUniformLocation(ss, 'scale'), 1 + 2*1.5**k/256);
            gl.uniform1f(glUniformLocation(ss, 'brightness'), clamp((10.1-k)/7.2)**2 * this.shadowSoftness);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            [src, dst] = [dst, src];
        }

        // leave the result on unit 1 for the light shader and go back to the lightmap
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.activeTexture(gl.TEXTURE0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
        gl.viewport(0, 0, this.textureSize.x, this.textureSize.y);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
    }

    /** In the shadow pass, let the draws that follow keep their color in the shadow map, so light passing
     *  through them is tinted instead of blocked: a stained glass window, colored smoke. Any draw blocks light
     *  by its alpha, so a fading sprite casts a fading shadow; this keeps the color as well. It covers what was drawn
     *  under it in the map as any draw does, so glass drawn after a wall cuts a tinted window in the wall's shadow, and
     *  a wall drawn after the glass covers it. Does nothing outside
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
 * - A light inside a caster is blocked entirely, so the object that holds it, its lamp, a torch, the player
 *   carrying it, needs a shadowCore that reaches past it, castShadow = false, or a renderShadow that leaves
 *   the light's spot out
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
        /** @property {number} - Radius around the light where casters are left out of its shadow, so the lamp
         *  or torch that holds it, or the player carrying it, does not block it; it has to reach past that object's
         *  corners, about half its diagonal and a little more, or dark rays run out from them */
        this.shadowCore = 0;
        /** @property {number} - Size across of a soft hazy glow drawn over the light, like a lamp at night, 0 for
         *  none; it is added over the lit scene, in front of everything there */
        this.glow = 0;
        /** @property {number} - How fast the glow fades from its middle: 1 by default, .5 a wide haze, 2 a tight
         *  bright core */
        this.glowFalloff = 1;
        /** @type {TileInfo|undefined} */
        this.glowTileInfo = undefined; // the whole glow texture, kept for the falloff it was made for
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

    /** Draw this light's glow, soft and round, its glow size across and in its color, added over the lit scene;
     *  called by LightSystemPlugin after the lightmap is applied */
    renderGlow()
    {
        if (!(this.glow > 0)) return;
        const size = vec2(this.glow);
        if (!isOnScreen(this.pos, size)) return;
        const texture = engineGlowTexture(this.glowFalloff);
        if (!texture) return;
        if (this.glowTileInfo?.textureInfo !== texture)
            this.glowTileInfo = new TileInfo(vec2(), texture.size, texture);
        drawTile(this.pos, size, this.glowTileInfo, this.color, 0, false, undefined, true, false);
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * A DirectionalLight is a sun for the 2D light system: it lights the whole scene from one direction, added into the
 * lightmap with the point lights
 * - One at a time, made after the LightSystemPlugin, lightSystem.directionalLight is the one; a debug build asserts on
 *   a second while the first lives, a release build destroys the first
 * - Its castShadow lets foreground casters, objects with castShadow, throw long shadows across open space, fading out
 *   by shadowLength; a light does not need lightSystem.shadows for that
 * - Objects with castBackgroundShadow, a background layer, are dark to it inside and lit at the edges that face it,
 *   fading in by backgroundDepth
 * @extends EngineObject
 * @memberof LightSystem
 * @example
 * new DirectionalLight(vec2(-1, 1), hsl(.1, .3, 1)); // a warm sun up and to the left, shining down and to the right
 */
class DirectionalLight extends EngineObject
{
    /** Create the scene's directional light
     *  @param {Vector2} [sunDirection] - Toward the sun, it shines the other way, as render3D.sunDirection
     *  @param {Color} [color] - Color of the light; alpha modulates intensity */
    constructor(sunDirection=vec2(-1, 1), color=WHITE)
    {
        ASSERT(!!lightSystem, 'make a LightSystemPlugin before a DirectionalLight');
        ASSERT(isVector2(sunDirection) && !!(sunDirection.x || sunDirection.y),
            'DirectionalLight: sunDirection is a vec2 that is not zero, toward the sun', sunDirection);
        ASSERT(!lightSystem?.directionalLight, 'there is one DirectionalLight at a time, destroy the old one first');
        super(vec2(), vec2(), undefined, 0, color);
        this.mass = 0; // it does not fall in a game with gravity

        /** @property {Vector2} - Toward the sun, it shines the other way, as render3D.sunDirection */
        this.sunDirection = sunDirection.copy();
        /** @property {number} - World units a long shadow reaches before it has faded out; a caster casts only from
         *  inside the shadow map, shadowMapScale views across, so past (shadowMapScale - 1) / 2 of a view beyond the
         *  screen it throws none in */
        this.shadowLength = 20;
        /** @property {number} - World units the light gets into a background area from its edges facing it */
        this.backgroundDepth = 3;
        // castShadow is EngineObject's, true: foreground casters throw long shadows; it draws nothing, so never casts
        // in a release build, with no assert, a second takes over and the first goes, not left alive doing nothing
        lightSystem?.directionalLight?.destroy();
        lightSystem && (lightSystem.directionalLight = this);
    }

    /** Check its settings, called automatically each frame */
    update()
    {
        ASSERT(isVector2(this.sunDirection) && !!(this.sunDirection.x || this.sunDirection.y),
            'DirectionalLight: sunDirection is a vec2 that is not zero, toward the sun', this.sunDirection);
        ASSERT(this.shadowLength >= 0 && this.backgroundDepth >= 0,
            'DirectionalLight: shadowLength and backgroundDepth are world units, 0 or more', this.shadowLength,
            this.backgroundDepth);
    }

    /** A directional light draws nothing of its own, it is added into the lightmap by the plugin */
    render() {}

    /** Destroy the light, the scene goes without it from the next frame
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (lightSystem?.directionalLight === this)
            lightSystem.directionalLight = undefined;
        super.destroy(immediate);
    }
}
