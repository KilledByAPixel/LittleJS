// LittleJS Engine - MIT License - Copyright 2021 Frank Force
// https://github.com/KilledByAPixel/LittleJS

'use strict';

/**
 * LittleJS - The Tiny Fast JavaScript Game Engine
 * MIT License - Copyright 2021 Frank Force
 *
 * Engine Features
 * - Object oriented system with EngineObject base class
 * - Automatic object lifecycle (update, physics, collision, rendering)
 * - Engine helper classes: Vector2, Color, Timer, RandomGenerator
 * - Hybrid rendering with WebGL batching and Canvas2D fallback
 * - Audio system with wave, mp3, or ZzFX sound effects
 * - Input system with keyboard, mouse, gamepad, and touch support
 * - Tile layer rendering and collision detection
 * - Particle effect system with emitters
 * - Medal/achievement system with local storage
 * - Comprehensive debug tools and visualizations
 * - Fixed 60 FPS timestep with configurable time scale
 * - Raycast and spatial query utilities
 * - Plugin system for extending engine functionality
 * - Start with engineInit() and provide your game callbacks
 * @namespace Engine
 */

/** Name of engine
 *  @type {string}
 *  @default
 *  @memberof Engine */
const engineName = 'LittleJS';

/** Version of engine
 *  @type {string}
 *  @default
 *  @memberof Engine */
const engineVersion = '1.19.4';

/** Frames per second to update
 *  @type {number}
 *  @default
 *  @memberof Engine */
const frameRate = 60;

/** How many seconds each frame lasts, engine uses a fixed time step
 *  @type {number}
 *  @default 1/60
 *  @memberof Engine */
const timeDelta = 1/frameRate;

/** Array containing all engine objects
 *  @type {Array<EngineObject>}
 *  @memberof Engine */
let engineObjects = [];

/** Array with only objects set to collide with other objects this frame (for optimization)
 *  @type {Array<EngineObject>}
 *  @memberof Engine */
let engineObjectsCollide = [];

/** Current update frame, used to calculate time
 *  @type {number}
 *  @memberof Engine */
let frame = 0;

/** Current engine time since start in seconds
 *  @type {number}
 *  @memberof Engine */
let time = 0;

/** Actual clock time since start in seconds (not affected by pause, timescale, or frame rate clamping)
 *  @type {number}
 *  @memberof Engine */
let timeReal = 0;

/** Is the game paused? Causes time and objects to not be updated
 *  @type {boolean}
 *  @default false
 *  @memberof Engine */
let paused = false;

/** Get if game is paused
 *  @return {boolean}
 *  @memberof Engine */
function getPaused() { return paused; }

/** Set if game is paused
 *  @param {boolean} [isPaused]
 *  @memberof Engine */
function setPaused(isPaused=true) { paused = isPaused; }

// Engine internal variables
let frameTimeLastMS = 0, frameTimeBufferMS = 0, averageFPS = 0;
let windowWidthLast = 0, windowHeightLast = 0, windowPixelRatioLast = 0;
let engineUpdateInternal; // assigned by engineInit so engineStep can drive it
let showEngineVersion = true;

///////////////////////////////////////////////////////////////////////////////
// plugin hooks

const pluginList = [];
class EnginePlugin
{
    constructor(update, render, glContextLost, glContextRestored, preRender)
    {
        this.update = update;
        this.render = render;
        this.glContextLost = glContextLost;
        this.glContextRestored = glContextRestored;
        this.preRender = preRender;
    }
}

/**
 * @callback PluginCallback - Update or render function for a plugin
 * @memberof Engine
 */

/** Add a new update function for a plugin
 *  @param {PluginCallback} [update]
 *  @param {PluginCallback} [render]
 *  @param {PluginCallback} [glContextLost]
 *  @param {PluginCallback} [glContextRestored]
 *  @param {PluginCallback} [preRender] - Called after the canvas is cleared and before gameRender
 *  @memberof Engine */
function engineAddPlugin(update, render, glContextLost, glContextRestored, preRender)
{
    // make sure plugin functions are unique
    ASSERT(!pluginList.find(p=>
        p.update === update && p.render === render &&
        p.glContextLost === glContextLost &&
        p.glContextRestored === glContextRestored &&
        p.preRender === preRender));

    const plugin = new EnginePlugin(update, render, glContextLost, glContextRestored, preRender);
    pluginList.push(plugin);
}

///////////////////////////////////////////////////////////////////////////////
// Main Engine Functions

/**
 * @callback GameInitCallback - Called after the engine starts, can be async
 * @return {void|Promise<void>}
 * @memberof Engine
 */
/**
 * @callback GameCallback - Update or render function for the game
 * @memberof Engine
 */

/** Startup LittleJS engine with your callback functions
 *  @param {GameInitCallback} gameInit - Called once after the engine starts up, can be async for loading
 *  @param {GameCallback} gameUpdate - Called every frame before objects are updated (60fps), use for game logic
 *  @param {GameCallback} gameUpdatePost - Called after physics and objects are updated, even when paused, use for UI updates
 *  @param {GameCallback} gameRender - Called before objects are rendered, use for drawing backgrounds/world elements
 *  @param {GameCallback} gameRenderPost - Called after objects are rendered, use for drawing UI/overlays
 *  @param {Array<string>} [imageSources=[]] - List of image file paths to preload (e.g., ['player.png', 'tiles.png'])
 *  @param {HTMLElement} [rootElement] - Root DOM element to attach canvas to, defaults to document.body
 *  @example
 *  // Basic engine startup
 *  engineInit(
 *    ()=> { LOG('Game initialized!'); },  // gameInit
 *    ()=> { updateGameLogic(); },         // gameUpdate
 *    ()=> { updateUI(); },                // gameUpdatePost
 *    ()=> { drawBackground(); },          // gameRender
 *    ()=> { drawHUD(); },                 // gameRenderPost
 *    ['tiles.png', 'tilesLevel.png']       // images to load
 *  );
 *  @memberof Engine */
async function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement)
{
    showEngineVersion && console.log(`${engineName} Engine v${engineVersion}`);
    ASSERT(!mainContext, 'engine already initialized');
    // runtime guard so release builds (where the assert is stripped) don't
    // double-register listeners / double-add canvases on a second call
    if (mainContext) return;
    ASSERT(isArray(imageSources), 'pass in images as array');

    // ensure body exists for minimal HTML where the script runs before <body> is parsed
    if (!document.body)
        document.documentElement.appendChild(document.createElement('body'));
    rootElement ||= document.body;

    // allow passing in empty functions
    gameInit       ||= ()=>{};
    gameUpdate     ||= ()=>{};
    gameUpdatePost ||= ()=>{};
    gameRender     ||= ()=>{};
    gameRenderPost ||= ()=>{};

    // Called automatically by engine to setup render system
    function enginePreRender()
    {
        // mainCanvasSize is set by engineUpdateCanvas which always runs first,
        // it is css pixels so it does not match the canvas backing store

        // disable smoothing for pixel art
        mainContext.imageSmoothingEnabled = !tilesPixelated;

        // setup gl rendering if enabled
        glPreRender();

        // plugins that draw underneath the 2D layer
        pluginList.forEach(plugin=>plugin.preRender?.());
    }

    // internal update loop for engine
    function engineUpdate(frameTimeMS=0)
    {
        // update time keeping
        let frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        // skip delta on the very first frame so timeReal doesn't jump
        // by ~page-load-time when RAF starts handing real timestamps
        if (!frameTimeLastMS) frameTimeDeltaMS = 0;
        frameTimeLastMS = frameTimeMS;
        if (debug || debugWatermark)
            averageFPS = lerp(averageFPS, 1e3/(frameTimeDeltaMS||1), .05);
        const debugSpeedUp   = debug && keyIsDown('Equal'); // +
        const debugSpeedDown = debug && keyIsDown('Minus'); // -
        const debugScale = debugSpeedUp ? 10 : debugSpeedDown ? .1 : 1;

        // apply time deltas
        const frameTimeDeltaUnscaledMS = frameTimeDeltaMS;
        timeReal += frameTimeDeltaMS * debugScale / 1e3;
        const combinedScale = timeScale * debugScale;
        frameTimeDeltaMS *= combinedScale;
        // when paused tick on unscaled time so the pause update rate stays
        // fixed instead of following however fast the display refreshes
        frameTimeBufferMS += paused ? frameTimeDeltaUnscaledMS : frameTimeDeltaMS;
        if (paused || combinedScale <= 1)
            frameTimeBufferMS = min(frameTimeBufferMS, 50); // clamp min framerate

        // apply time delta smoothing, improves smoothness of framerate in some browsers
        let wasUpdated = false, deltaSmooth = 0;
        if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
        {
            // force at least one update each frame since it is waiting for refresh
            deltaSmooth = frameTimeBufferMS;
            frameTimeBufferMS = 0;
        }

        // update multiple frames if necessary in case of slow framerate
        for (; frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
        {
            // increment frame and update time, paused does not advance time
            if (!paused)
                time = frame++ / frameRate;

            // update game and objects, when paused update everything except them
            wasUpdated = true;
            engineUpdateCanvas();
            inputUpdate();
            if (!paused)
                gameUpdate();
            pluginList.forEach(plugin=>plugin.update?.());
            if (paused)
            {
                // update object transforms even when paused
                for (const o of engineObjects)
                    o.parent || o.updateTransforms();
            }
            else
                engineObjectsUpdate();

            // do post update
            debugUpdate();
            gameUpdatePost();
            inputUpdatePost();
            if (debugVideoCaptureIsActive())
                renderFrame();
        }

        // add the time smoothing back in
        frameTimeBufferMS += deltaSmooth;

        // check if the window changed so a resize is picked up even when
        // the game is not updating, for example when timeScale is 0
        let windowChanged = false;
        if (!headlessMode)
        {
            const dpr = devicePixelRatio;
            windowChanged = windowWidthLast !== innerWidth ||
                windowHeightLast !== innerHeight || windowPixelRatioLast !== dpr;
            windowWidthLast = innerWidth;
            windowHeightLast = innerHeight;
            windowPixelRatioLast = dpr;
        }

        // render only when something changed, displays that refresh faster
        // than the fixed update rate would otherwise redraw identical frames
        if (!debugVideoCaptureIsActive() && (wasUpdated || windowChanged))
            renderFrame();
        if (!engineManualStep)
            requestAnimationFrame(engineUpdate);

        function renderFrame()
        {
            if (headlessMode) return;

            // canvas must be updated before rendering
            if (!wasUpdated)
                engineUpdateCanvas();

            // render the game and objects
            enginePreRender();
            gameRender();
            engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
            for (const o of engineObjects)
            {
                if (o.destroyed) continue;
                setShader(o.shader); // each object draws with its own shader, or none
                o.render();
            }
            setShader(); // back to the engine's for gameRenderPost

            // post rendering
            gameRenderPost();
            pluginList.forEach(plugin=>plugin.render?.());
            inputRender();
            debugRender();
            glFlush();
            debugRenderPost();
            drawCount = 0;
            primitiveCount = 0;
        }
    }
    engineUpdateInternal = engineUpdate;

    // skip setup if headless
    if (headlessMode) return startEngine();

    // setup webgl
    glInit(rootElement);

    // setup html
    const styleRoot =
        'margin:0;' +                 // fill the window
        'overflow:hidden;' +          // no scroll bars
        'background:#000;' +          // set background color
        'user-select:none;' +         // prevent hold to select
        '-webkit-user-select:none;' + // compatibility for ios
        'touch-action:none;' +        // prevent mobile pinch to resize
        '-webkit-touch-callout:none'; // compatibility for ios
    rootElement.style.cssText = styleRoot;
    mainCanvas = rootElement.appendChild(document.createElement('canvas'));
    drawContext = mainContext = mainCanvas.getContext('2d');

    // init stuff and start engine
    inputInit();
    audioInit();
    debugInit();

    // setup canvases
    // transform way is still more reliable than flexbox or grid
    const styleCanvas = 'position:absolute;'+ // allow canvases to overlap
        'top:50%;left:50%;transform:translate(-50%,-50%)'; // center on screen
    mainCanvas.style.cssText = styleCanvas;
    if (glCanvas)
        glCanvas.style.cssText = styleCanvas;
    setCanvasPixelated(canvasPixelated);
    engineUpdateCanvas();
    glPreRender();

    // create offscreen canvases for image processing
    workContext = createCanvasContext(64);
    workCanvas = workContext.canvas;
    workReadContext = createCanvasContext(64, 64, true);
    workReadCanvas = workReadContext.canvas;

    // create promises for loading images
    const promises = imageSources.map((src, i)=> loadTexture(i, src));

    // no images to load
    if (!imageSources.length)
        promises.push(loadTexture(0));

    // load engine font image
    promises.push(imageFontInit());

    if (showSplashScreen)
    {
        // draw splash screen
        promises.push(new Promise(resolve =>
        {
            let t = 0;
            updateSplash();
            function updateSplash()
            {
                inputClear();
                drawEngineLogo(t+=.01);
                t>1 ? resolve() : setTimeout(updateSplash, 16);
            }
        }));
    }

    // wait for all the promises to finish
    await Promise.all(promises);
    return startEngine();

    async function startEngine()
    {
        // wait for gameInit to load
        await gameInit();
        engineManualStep || engineUpdate();
    }
}

// Resize the canvas to fit the window and prepare it for a new frame
// Called automatically each frame and by the splash screen before the loop starts
// mainCanvasSize is css pixels and the backing store is that scaled by the
// pixel ratio, so the ratio only changes sharpness, never how big things look
function engineUpdateCanvas()
{
    if (headlessMode) return;

    // the backing store is scaled by this, every size below is css pixels
    const dpr = getCanvasPixelRatio();

    if (canvasFixedSize.x)
    {
        // set canvas fixed size
        mainCanvasSize = canvasFixedSize.copy();

        // fit to window using css width and height
        const innerAspect = innerWidth / innerHeight;
        const fixedAspect = canvasFixedSize.x / canvasFixedSize.y;
        const w = innerAspect < fixedAspect ? '100%' : '';
        const h = innerAspect < fixedAspect ? '' : '100%';
        mainCanvas.style.width  = w;
        mainCanvas.style.height = h;
        if (glCanvas)
        {
            glCanvas.style.width  = w;
            glCanvas.style.height = h;
        }
    }
    else
    {
        // get main canvas size based on window size, in css pixels so
        // canvasMaxSize caps how big the canvas looks, not its resolution
        mainCanvasSize.x = min(innerWidth,  canvasMaxSize.x) | 0;
        mainCanvasSize.y = min(innerHeight, canvasMaxSize.y) | 0;

        // responsive aspect ratio
        const innerAspect = innerWidth / innerHeight;
        ASSERT(canvasMinAspect <= canvasMaxAspect);
        if (canvasMaxAspect && innerAspect > canvasMaxAspect)
        {
            // full height
            const w = mainCanvasSize.y * canvasMaxAspect | 0;
            mainCanvasSize.x = min(w, canvasMaxSize.x);
        }
        else if (innerAspect < canvasMinAspect)
        {
            // full width
            const h = mainCanvasSize.x / canvasMinAspect | 0;
            mainCanvasSize.y = min(h, canvasMaxSize.y);
        }

        // css size is the canvas size, the backing store is scaled up below
        mainCanvas.style.width  = mainCanvasSize.x + 'px';
        mainCanvas.style.height = mainCanvasSize.y + 'px';
        if (glCanvas)
        {
            glCanvas.style.width  = mainCanvasSize.x + 'px';
            glCanvas.style.height = mainCanvasSize.y + 'px';
        }
    }

    // clear main canvas and set size
    // only set the size when it changes, setting it invalidates the canvas
    // frame which makes the browser rebuild the display list for the page
    const bufferSizeX = mainCanvasSize.x * dpr | 0;
    const bufferSizeY = mainCanvasSize.y * dpr | 0;
    if (mainCanvas.width !== bufferSizeX || mainCanvas.height !== bufferSizeY)
    {
        mainCanvas.width  = bufferSizeX;
        mainCanvas.height = bufferSizeY;
    }
    else
    {
        // setting the size also resets the context state, match that
        mainContext.setTransform(1, 0, 0, 1, 0, 0);
        mainContext.globalCompositeOperation = 'source-over';
        mainContext.clearRect(0, 0, bufferSizeX, bufferSizeY);
    }

    // scale the context so 2d drawing is in css pixels
    mainContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    // apply the clear color to main canvas
    if (canvasClearColor.a > 0 && !glEnable)
    {
        mainContext.fillStyle = canvasClearColor.toString();
        mainContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
        mainContext.fillStyle = BLACK.toString();
    }

    // set default line join and cap
    mainContext.lineJoin = 'round';
    mainContext.lineCap  = 'round';
}

// max frames engineStep can advance in one call, 10 minutes at 60fps
// large counts block until they finish, so this catches runaway values
const engineStepMaxFrames = 36000;

/** Advance the engine by a number of frames
 *  Requires setEngineManualStep(true) before engineInit
 *  Respects paused exactly as the normal update loop does
 *  @param {number} [frames] - number of engine update ticks, max 36000, each running one fixed update at timeScale 1
 *  @example
 *  setHeadlessMode(true);
 *  setEngineManualStep(true);
 *  await engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
 *  engineStep(600); // advance 10 seconds of game time
 *  @memberof Engine */
function engineStep(frames=1)
{
    ASSERT(engineManualStep,
        'engineStep requires setEngineManualStep(true) before engineInit');
    ASSERT(engineUpdateInternal, 'engineStep requires engineInit to complete');
    // runtime guard so release builds (where the asserts are stripped) can't
    // start a second requestAnimationFrame chain or call an undefined update
    if (!engineManualStep || !engineUpdateInternal) return;
    ASSERT(Number.isInteger(frames) && frames >= 0 && frames <= engineStepMaxFrames,
        'engineStep requires a whole frame count from 0 to ' + engineStepMaxFrames);
    frames = min(frames, engineStepMaxFrames); // release has no asserts, don't freeze
    for (let i = frames; i > 0; --i)
        engineUpdateInternal(frameTimeLastMS + 1e3 / frameRate);
}

/** Update each engine object, remove destroyed objects, and update time
 * can be called manually if objects need to be updated outside of main loop
 *  @memberof Engine */
function engineObjectsUpdate()
{
    // get list of solid objects for physics optimization
    engineObjectsCollide = engineObjects.filter(o=>o.collideSolidObjects);

    // update physics before object update
    for (const o of engineObjects)
        if (!o.parent && !o.destroyed)
            o.updatePhysics();

    // recursive object update
    function updateChildObject(o)
    {
        if (o.destroyed) return;

        o.update();
        for (const child of o.children)
            updateChildObject(child);
    }
    for (const o of engineObjects)
    {
        if (o.parent || o.destroyed) continue;

        // update top level objects
        o.update();
        for (const child of o.children)
            updateChildObject(child);
        o.updateTransforms();
    }

    // remove destroyed objects
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Destroy and remove all objects
 *  - This can be used to clear out all objects when restarting a level
 *  - Objects with the persistent flag set are left alone, for things that outlive a level
 *  - Objects can override their destroy function to do cleanup or stick around
 *  @param {boolean} [immediate] - should attached effects be allowed to die off?
 *  @memberof Engine */
function engineObjectsDestroy(immediate=true)
{
    for (const o of engineObjects)
        o.parent || o.persistent || o.destroy(immediate);
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Collects all object within a given area
 *  @param {Vector2} [pos] - Center of test area, or undefined for all objects
 *  @param {Vector2|number} [size] - Radius of circle if float, rectangle size if Vector2
 *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
 *  @return {Array<EngineObject>} - List of collected objects
 *  @memberof Engine */
function engineObjectsCollect(pos, size, objects=engineObjects)
{
    const collectedObjects = [];
    if (!pos)
    {
        // all objects
        for (const o of objects)
            collectedObjects.push(o);
    }
    else if (size instanceof Vector2)
    {
        // bounding box test
        for (const o of objects)
            o.isOverlapping(pos, size) && collectedObjects.push(o);
    }
    else
    {
        // circle test
        const sizeSquared = size*size;
        for (const o of objects)
            pos.distanceSquared(o.pos) < sizeSquared && collectedObjects.push(o);
    }
    return collectedObjects;
}

/**
 * @callback ObjectCallbackFunction - Function that processes an object
 * @param {EngineObject} object
 *  @memberof Engine
 */

/** Triggers a callback for each object within a given area
 *  @param {Vector2} [pos] - Center of test area, or undefined for all objects
 *  @param {Vector2|number} [size] - Radius of circle if float, rectangle size if Vector2
 *  @param {ObjectCallbackFunction} [callbackFunction] - Calls this function on every object that passes the test
 *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
 *  @memberof Engine */
function engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects)
{ engineObjectsCollect(pos, size, objects).forEach(o => callbackFunction(o)); }

/** Return a list of objects intersecting a ray
 *  @param {Vector2} start
 *  @param {Vector2} end
 *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
 *  @return {Array<EngineObject>} - List of objects hit
 *  @memberof Engine */
function engineObjectsRaycast(start, end, objects=engineObjects)
{
    const hitObjects = [];
    for (const o of objects)
    {
        if (o.collideRaycast && isIntersecting(start, end, o.pos, o.size))
        {
            debugRaycast && debugRect(o.pos, o.size, '#f00');
            hitObjects.push(o);
        }
    }

    debugRaycast && debugLine(start, end, hitObjects.length ? '#f00' : '#00f', .02);
    return hitObjects;
}
/**
 * LittleJS Debug System
 * - Press Esc to toggle debug overlay with object picking
 * - Number keys toggle debug visualizations (physics, particles, etc.)
 * - +/- keys control time scale for slow motion/fast forward
 * - ASSERT and LOG macros for development (removed in release builds)
 * - Debug primitive rendering (rectangles, circles, lines, points, text)
 * - Screenshot and video capture support
 * - FPS counter and performance watermark
 * - Debug overlay shows mouse position and picked objects
 * @namespace Debug
 */

/** True if debug is enabled
 *  @type {boolean}
 *  @default
 *  @memberof Debug */
const debug = true;

/** Size to render debug points by default
 *  @type {number}
 *  @default
 *  @memberof Debug */
const debugPointSize = .5;

/** True if watermark with FPS should be shown, false in release builds
 *  @type {boolean}
 *  @default
 *  @memberof Debug */
let debugWatermark = true;

/** Key code used to toggle debug mode, Esc by default
 *  @type {string}
 *  @default
 *  @memberof Debug */
let debugKey = 'Escape';

/** True if the debug overlay is active, always false in release builds
 *  @type {boolean}
 *  @default
 *  @memberof Debug */
let debugOverlay = false;

// Engine internal variables not exposed to documentation
let debugPrimitives = [], debugPhysics = false, debugRaycast = false, debugParticles = false, debugGamepads = false, debugSound = false, debugTakeScreenshot;

///////////////////////////////////////////////////////////////////////////////
// Debug helper functions

/** Asserts if the expression is false, does nothing in release builds
 *  Halts execution if the assert fails and throws an error
 *  @param {boolean} assert
 *  @param {...Object} output - error message output
 *  @memberof Debug */
function ASSERT(assert, ...output)
{
    if (assert) return;
    console.assert(assert, ...output)
    throw new Error('Assert failed!'); // halt execution
}

/** Log to console if debug is enabled, does nothing in release builds
 *  @param {...Object} output - message output
 *  @memberof Debug */
function LOG(...output) { console.log(...output); }

/** Draw a debug rectangle in world space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(0)]
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {boolean} [fill]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugRect(pos, size=vec2(), color=WHITE, time=0, angle=0, fill=false, screenSpace=false)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isStringLike(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');

    if (isColor(color))
        color = color.toString();
    const timer = new Timer(time);
    debugPrimitives.push({pos:pos.copy(), size:size.copy(), color, timer, angle, fill, screenSpace});
}

/** Draw a debug poly in world space
 *  @param {Vector2} pos
 *  @param {Array<Vector2>} points
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {boolean} [fill]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugPoly(pos, points, color=WHITE, time=0, angle=0, fill=false, screenSpace=false)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isArray(points), 'points must be an array');
    ASSERT(isStringLike(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');

    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    points = points.map(p=>p.copy());
    const timer = new Timer(time);
    debugPrimitives.push({pos, points, color, timer, angle, fill, screenSpace});
}

/** Draw a debug circle in world space
 *  @param {Vector2} pos
 *  @param {number} [size] - diameter
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {boolean} [fill]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugCircle(pos, size=0, color=WHITE, time=0, fill=false, screenSpace=false)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isStringLike(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');

    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    const timer = new Timer(time);
    debugPrimitives.push({pos, size, color, timer, angle:0, fill, screenSpace});
}

/** Draw a debug point in world space
 *  @param {Vector2} pos
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugPoint(pos, color, time, angle, screenSpace=false)
{ debugRect(pos, undefined, color, time, angle, false, screenSpace); }

/** Draw a debug line in world space
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Color|string} [color]
 *  @param {number} [width]
 *  @param {number} [time]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugLine(posA, posB, color, width=.1, time=0, screenSpace=false)
{
    ASSERT(isVector2(posA), 'posA must be a vec2');
    ASSERT(isVector2(posB), 'posB must be a vec2');
    ASSERT(isNumber(width), 'width must be a number');

    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(width, halfDelta.length()*2);
    debugRect(posA.add(halfDelta), size, color, time, halfDelta.angle(), true, screenSpace);
}

/** Draw a debug combined axis aligned bounding box in world space
 *  @param {Vector2} posA
 *  @param {Vector2} sizeA
 *  @param {Vector2} posB
 *  @param {Vector2} sizeB
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugOverlap(posA, sizeA, posB, sizeB, color, time, screenSpace=false)
{
    ASSERT(isVector2(posA), 'posA must be a vec2');
    ASSERT(isVector2(posB), 'posB must be a vec2');
    ASSERT(isVector2(sizeA), 'sizeA must be a vec2');
    ASSERT(isVector2(sizeB), 'sizeB must be a vec2');

    const minPos = vec2(
        min(posA.x - sizeA.x/2, posB.x - sizeB.x/2),
        min(posA.y - sizeA.y/2, posB.y - sizeB.y/2)
    );
    const maxPos = vec2(
        max(posA.x + sizeA.x/2, posB.x + sizeB.x/2),
        max(posA.y + sizeA.y/2, posB.y + sizeB.y/2)
    );
    debugRect(minPos.lerp(maxPos,.5), maxPos.subtract(minPos), color, time, 0, false, screenSpace);
}

/** Draw debug text in world space
 *  @param {string|number} text
 *  @param {Vector2} pos
 *  @param {number} [size]
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {string} [font]
 *  @param {boolean} [screenSpace]
 *  @memberof Debug */
function debugText(text, pos, size=1, color=WHITE, time=0, angle=0, font='monospace', screenSpace=false)
{
    ASSERT(isStringLike(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isStringLike(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(isStringLike(font), 'font must be a string');

    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    const timer = new Timer(time);
    debugPrimitives.push({text, pos, size, color, timer, angle, font, screenSpace});
}

/** Clear all debug primitives in the list
 *  @memberof Debug */
function debugClear() { debugPrimitives = []; }

/** Trigger debug system to take a screenshot
 *  @memberof Debug */
function debugScreenshot() { debugTakeScreenshot = 1; }

/** Breaks on all asserts/errors, hides the canvas, and shows message in plain text
 *  This is a good function to call at the start of your game to catch all errors
 *  In release builds this function has no effect
 *  @memberof Debug */
function debugShowErrors()
{
    const showError = (message)=>
    {
        // replace entire page with error message
        document.body.style = 'background-color:#111;margin:8px';
        document.body.innerHTML = `<pre style=color:#f00;font-size:28px;white-space:pre-wrap>` + message;
    }
    
    const originalAssert = console.assert;
    console.assert = (assertion, ...output)=>
    {
        originalAssert(assertion, ...output);
        if (!assertion)
        {
            const message = output.join(' ');
            const stack = new Error().stack;
            throw 'Assertion failed!\n' + message + '\n' + stack;
        }
    };
    onunhandledrejection = (event)=>
        showError(event.reason.stack || event.reason);
    onerror = (message, source, lineno, colno)=>
        showError(`${message}\n${source}\nLn ${lineno}, Col ${colno}`);
}

///////////////////////////////////////////////////////////////////////////////
// Engine debug functions (called automatically)

function debugInit()
{
    if (showEngineVersion)
        console.warn("LittleJS DEBUG build loaded. Use the release build for production.");
}

function debugUpdate()
{
    if (!debug) return;

    if (keyWasPressed(debugKey)) // Esc
        debugOverlay = !debugOverlay;
    if (debugOverlay)
    {
        if (keyWasPressed('Digit1'))
            debugPhysics = !debugPhysics, debugParticles = false;
        if (keyWasPressed('Digit2'))
            debugParticles = !debugParticles, debugPhysics = false;
        if (keyWasPressed('Digit3'))
            debugGamepads = !debugGamepads;
        if (keyWasPressed('Digit4'))
            debugRaycast = !debugRaycast;
        if (keyWasPressed('Digit5'))
            debugScreenshot();
        if (keyWasPressed('Digit7'))
            debugSound = !debugSound;
    }
    if (debugVideoCaptureIsActive())
    {
        // control to stop video capture
        if (!debugOverlay || keyWasPressed('Digit6'))
            debugVideoCaptureStop();
    }
    else if (debugOverlay && keyWasPressed('Digit6'))
        debugVideoCaptureStart();
}

function debugRender()
{
    if (debugVideoCaptureIsActive())
        return; // don't show debug info when capturing video

    // flush any gl sprites before drawing debug info
    glFlush();

    const savedDrawCount = drawCount;
    const savedPrimitiveCount = primitiveCount;

    if (debugTakeScreenshot)
    {
        // combine canvases, remove alpha and save
        combineCanvases();
        saveCanvas(mainCanvas);
        debugTakeScreenshot = 0;
    }

    const debugContext = mainContext;
    if (debugGamepads && gamepadsEnable)
    {
        // draw gamepads
        const maxGamepads = 8;
        let gamepadConnectedCount = 0;
        for (let i = 0; i < maxGamepads; i++)
            gamepadConnected(i) && gamepadConnectedCount++;

        for (let i = 0; i < maxGamepads; i++)
        {
            if (!gamepadConnected(i))
                continue;

            const stickScale = 1;
            const buttonScale = .2;
            const cornerPos = cameraPos.add(vec2(-stickScale*2, ((gamepadConnectedCount-1)/2-i)*stickScale*3));
            debugText(i, cornerPos.add(vec2(-stickScale, stickScale)), 1);
            if (i === gamepadPrimary)
                debugText('Main', cornerPos.add(vec2(-stickScale*2, 0)),1, '#0f0');

            // read analog sticks
            const stickCount = gamepadStickData[i].length;
            for (let j = 0; j < stickCount; j++)
            {
                if (!(j in gamepadStickData[i]))
                    continue; // skip sticks that are not present (eg a disabled touch left stick)
                const stick = gamepadStick(j, i);
                const drawPos = cornerPos.add(vec2(j*stickScale*2, 0));
                const stickPos = drawPos.add(stick.scale(stickScale));
                debugCircle(drawPos, stickScale*2, '#fff7',0,true);
                debugLine(drawPos, stickPos, '#f00');
                debugText(j, drawPos, .3);
                debugPoint(stickPos, '#f00');
            }

            const buttonCount = inputData[i+1].length;
            for (let j = 0; j < buttonCount; j++)
            {
                const drawPos = cornerPos.add(vec2(j*buttonScale*2, -stickScale-buttonScale*2));
                const pressed = gamepadIsDown(j, i);
                debugCircle(drawPos, buttonScale*2, pressed ? '#f00' : '#fff7', 0, true);
                debugText(j, drawPos, .3);
            }
        }
    }

    let debugObject;
    if (debugOverlay)
    {
        // draw red rectangle around screen
        const cameraSize = getCameraSize();
        debugRect(cameraPos, cameraSize.subtract(vec2(.1)), '#f008');

        // mouse pick
        let bestDistance = Infinity;
        for (const o of engineObjects)
        {
            if (o.destroyed)
                continue;

            if (o instanceof TileLayer)
                continue; // prevent tile layers from being picked

            o.renderDebugInfo();
            if (!o.size.x || !o.size.y)
                continue;

            const distance = mousePos.distanceSquared(o.pos);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                debugObject = o;
            }
        }

        if (tileCollisionTest(mousePos))
        {
            // show floored tile pick for tile collision
            drawRect(mousePos.floor().add(vec2(.5)), vec2(1), rgb(1,1,0,.5), 0, false);
        }
    }

    {
        // draw debug primitives
        debugContext.lineWidth = 2;
        debugPrimitives.forEach(p=>
        {
            debugContext.save();

            // create canvas transform from world space to screen space
            // without scaling because we want consistent pixel sizes
            let pos = p.pos, scale = 1, angle = p.angle;
            if (!p.screenSpace)
            {
                pos = worldToScreen(p.pos);
                scale = cameraScale;
                angle -= cameraAngle;
            }
            debugContext.translate(pos.x|0, pos.y|0);
            debugContext.rotate(angle);
            debugContext.scale(1, p.text ? 1 : -1);
            debugContext.fillStyle = p.color;
            debugContext.strokeStyle = p.color;
            if (p.text !== undefined)
            {
                debugContext.font = p.size*scale + 'px '+ p.font;
                debugContext.textAlign = 'center';
                debugContext.textBaseline = 'middle';
                debugContext.fillText(p.text, 0, 0);
            }
            else if (p.points !== undefined)
            {
                // poly
                debugContext.beginPath();
                for (const point of p.points)
                {
                    const p2 = point.scale(scale).floor();
                    debugContext.lineTo(p2.x, p2.y);
                }
                debugContext.closePath();
                p.fill && debugContext.fill();
                debugContext.stroke();
            }
            else if (p.size === 0 || (p.size.x === 0 && p.size.y === 0))
            {
                // point
                const pointSize = debugPointSize * scale;
                debugContext.fillRect(-pointSize/2, -1, pointSize, 3);
                debugContext.fillRect(-1, -pointSize/2, 3, pointSize);
            }
            else if (p.size.x !== undefined)
            {
                // rect
                const s = p.size.scale(scale).floor();
                const w = s.x, h = s.y;
                p.fill && debugContext.fillRect(-w/2|0, -h/2|0, w, h);
                debugContext.strokeRect(-w/2|0, -h/2|0, w, h);
            }
            else
            {
                // circle
                debugContext.beginPath();
                debugContext.arc(0, 0, p.size*scale/2, 0, 9);
                p.fill && debugContext.fill();
                debugContext.stroke();
            }

            debugContext.restore();
        });

        // remove expired primitives
        debugPrimitives = debugPrimitives.filter(r=>r.timer<0);
    }

    if (debugObject)
    {
        const raycastHitPos = tileCollisionRaycast(debugObject.pos, mousePos);
        raycastHitPos && drawRect(raycastHitPos.floor().add(vec2(.5)), vec2(1), rgb(0,1,1,.3), 0, false);
        drawLine(mousePos, debugObject.pos, .1, raycastHitPos ? rgb(1,0,0,.5) : rgb(0,1,0,.5), undefined, undefined, false);

        let debugText = 'mouse pos = ' + mousePos;
        if (tileCollisionLayers.length)
            debugText += '\nmouse collision = ' + tileCollisionGetData(mousePos);
        debugText += '\n\n--- object info ---\n';
        debugText += debugObject.toString();
        drawTextScreen(debugText, mousePosScreen, 24, rgb(), .05, undefined, 'center', 'monospace');
    }

    {
        // draw debug overlay
        const fontSize = 20;
        const lineHeight = fontSize * 1.2 | 0;
        debugContext.save();
        debugContext.fillStyle = '#fff';
        debugContext.textAlign = 'left';
        debugContext.textBaseline = 'top';
        debugContext.font = fontSize + 'px monospace';
        debugContext.shadowColor = '#000';
        debugContext.shadowBlur = 9;

        let x = 9, y = 0, h = lineHeight;
        if (debugOverlay)
        {
            debugContext.fillText(`${engineName} v${engineVersion}`, x, y += h/2 );
            debugContext.fillText('Time: ' + formatTime(time), x, y += h);
            debugContext.fillText('FPS: ' + averageFPS.toFixed(1) + (glEnable?' WebGL':' Canvas2D'), 
                x, y += h);
            debugContext.fillText('Objects: ' + engineObjects.length, x, y += h);
            debugContext.fillText('Draw Calls: ' + drawCount, x, y += h);
            debugContext.fillText('Primitives: ' + primitiveCount, x, y += h);
            debugContext.fillText('---------', x, y += h);
            debugContext.fillStyle = '#f00';
            debugContext.fillText('ESC: Debug Overlay', x, y += h);
            debugContext.fillStyle = debugPhysics ? '#f00' : '#fff';
            debugContext.fillText('1: Debug Physics', x, y += h);
            debugContext.fillStyle = debugParticles ? '#f00' : '#fff';
            debugContext.fillText('2: Debug Particles', x, y += h);
            debugContext.fillStyle = debugGamepads ? '#f00' : '#fff';
            debugContext.fillText('3: Debug Gamepads', x, y += h);
            debugContext.fillStyle = debugRaycast ? '#f00' : '#fff';
            debugContext.fillText('4: Debug Raycasts', x, y += h);
            debugContext.fillStyle = '#fff';
            debugContext.fillText('5: Save Screenshot', x, y += h);
            debugContext.fillText('6: Toggle Video Capture', x, y += h);
            debugContext.fillStyle = debugSound ? '#f00' : '#fff';
            debugContext.fillText('7: Debug Sound', x, y += h);

            let keysPressed = '';
            let mousePressed = '';
            for (const i in inputData[0])
            {
                if (!keyIsDown(i, 0))
                    continue;
                if (parseInt(i) < 3)
                    mousePressed += i + ' ' ;
                else
                    keysPressed += i + ' ' ;
            }
            mousePressed && debugContext.fillText('Mouse: ' + mousePressed, x, y += h);
            keysPressed && debugContext.fillText('Keys: ' + keysPressed, x, y += h);

            // show gamepad buttons
            for (let i = 1; i < inputData.length; i++)
            {
                let buttonsPressed = '';
                if (inputData[i])
                for (const j in inputData[i])
                {
                    if (keyIsDown(j, i))
                        buttonsPressed += j + ' ' ;
                }
                buttonsPressed && debugContext.fillText(`Gamepad ${i-1}: ` + buttonsPressed, x, y += h);
            }
        }
        else
        {
            debugContext.fillText(debugPhysics ? 'Debug Physics' : '', x, y += h);
            debugContext.fillText(debugParticles ? 'Debug Particles' : '', x, y += h);
            debugContext.fillText(debugRaycast ? 'Debug Raycasts' : '', x, y += h);
            debugContext.fillText(debugGamepads ? 'Debug Gamepads' : '', x, y += h);
            debugContext.fillText(debugSound ? 'Debug Sound' : '', x, y += h);
        }

        debugContext.restore();
    }
    
    if (debugWatermark || debugOverlay)
    {
        // show fps stats display
        mainContext.textAlign = 'right';
        mainContext.textBaseline = 'top';
        mainContext.font = '1em monospace';
        mainContext.fillStyle = '#000';
        const text = engineName + ' v' + engineVersion + ' / '
            + savedDrawCount + ' / ' + savedPrimitiveCount + ' / '
            + engineObjects.length + ' / ' + averageFPS.toFixed(1)
            + (glEnable ? ' GL' : ' 2D') ;
        mainContext.fillText(text, mainCanvasSize.x-3, 3);
        mainContext.fillStyle = '#fff';
        mainContext.fillText(text, mainCanvasSize.x-2, 2);
    }
}

function debugRenderPost()
{
    if (debugVideoCaptureIsActive())
    {
        debugVideoCaptureUpdate();
        return;
    }
}

///////////////////////////////////////////////////////////////////////////////
// video capture - records video and audio at 60 fps using MediaRecorder API

// internal variables used to capture video
let debugVideoCapture, debugVideoCaptureIcon;

/** Check if video capture is active
 *  @memberof Debug */
function debugVideoCaptureIsActive() { return !!debugVideoCapture; }

/** Start capturing video
 *  @memberof Debug */
function debugVideoCaptureStart()
{
    ASSERT(!debugVideoCaptureIsActive(), 'Already capturing video!');

    if (!debugVideoCaptureIcon)
    {
        // create recording icon to show it is capturing video
        debugVideoCaptureIcon = document.createElement('div');
        debugVideoCaptureIcon.style.position = 'absolute';
        debugVideoCaptureIcon.style.padding = '9px';
        debugVideoCaptureIcon.style.color = '#f00';
        debugVideoCaptureIcon.style.font = '50px monospace';
        document.body.appendChild(debugVideoCaptureIcon);
    }
    // show recording icon
    debugVideoCaptureIcon.textContent = '';
    debugVideoCaptureIcon.style.display = '';

    // setup captureStream to capture manually by passing 0
    const stream = mainCanvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0];
    const captureTimer = new Timer(0, true);
    const chunks = [];
    videoTrack.applyConstraints({frameRate:frameRate});

    // set up the media recorder
    const mediaRecorder = new MediaRecorder(stream, 
        {mimeType:'video/webm;codecs=vp8'});
    mediaRecorder.ondataavailable = (e)=> chunks.push(e.data);
    mediaRecorder.onstop = ()=>
    {
        const blob = new Blob(chunks, {type: 'video/webm'});
        const url = URL.createObjectURL(blob);
        saveDataURL(url, 'capture.webm', 1e3);
    };

    let audioStreamDestination, silentAudioSource, audioTapNode;
    if (soundEnable)
    {
        // create silent audio source
        // fixes issue where video can not start recording without audio
        silentAudioSource = new ConstantSourceNode(audioContext, { offset: 0 });
        silentAudioSource.connect(audioMasterGain);
        silentAudioSource.start();

        // tap the end of the master chain so a master effect is in the recording
        // (a master effect swapped mid-capture drops the tap, the rest records silent)
        audioStreamDestination = audioContext.createMediaStreamDestination();
        audioTapNode = audioMasterEffectOutput || audioMasterGain;
        audioTapNode.connect(audioStreamDestination);
        for (const track of audioStreamDestination.stream.getAudioTracks())
            stream.addTrack(track); // add audio tracks to capture stream
    }

    // start recording
    try { mediaRecorder.start(); }
    catch(e)
    {
        LOG('Video capture not supported in this browser!');
        silentAudioSource?.stop();
        audioStreamDestination && audioTapNode.disconnect(audioStreamDestination);
        return;
    }

    LOG('Video capture started.');

    // save debug video info
    debugVideoCapture =
    {
        mediaRecorder,
        captureTimer,
        videoTrack,
        silentAudioSource,
        audioStreamDestination,
        audioTapNode
    };
}

/** Stop capturing video and save to disk
 *  @memberof Debug */
function debugVideoCaptureStop()
{
    ASSERT(debugVideoCaptureIsActive(), 'Not capturing video!');

    // stop recording
    LOG(`Video capture ended. ${debugVideoCapture.captureTimer.get().toFixed(2)} seconds recorded.`);
    debugVideoCaptureIcon.style.display = 'none';
    debugVideoCapture.silentAudioSource?.stop();
    debugVideoCapture.mediaRecorder?.stop();
    debugVideoCapture.videoTrack?.stop();
    if (debugVideoCapture.audioStreamDestination)
    {
        // the tap is already gone if the master effect changed during the capture
        try { debugVideoCapture.audioTapNode.disconnect(debugVideoCapture.audioStreamDestination); }
        catch { }
    }
    debugVideoCapture = undefined;
}

// update video capture, called automatically by engine
function debugVideoCaptureUpdate()
{
    ASSERT(debugVideoCaptureIsActive(), 'Not capturing video!');

    // save the video frame
    combineCanvases();
    debugVideoCapture.videoTrack.requestFrame();
    debugVideoCaptureIcon.textContent = '● REC ' 
        + formatTime(debugVideoCapture.captureTimer);
}

///////////////////////////////////////////////////////////////////////////////
// debug utility functions

// make color constants immutable with debug assertions
function debugProtectConstant(obj)
{
    if (debug)
    {
        // get properties and store original values
        const props = Object.keys(obj), values = {};
        props.forEach(prop => values[prop] = obj[prop]);
        
        // replace with getters/setters that assert
        props.forEach(prop =>
        {
            Object.defineProperty(obj, prop, {
                get: ()=> values[prop],
                set: (value)=> 
                {
                    ASSERT(false, `Cannot modify engine constant. Attempted to set constant (${obj}) property '${prop}' to '${value}'.`);
                },
                enumerable: true
            });
        });
    }
    
    // freeze the object to prevent adding new properties
    return Object.freeze(obj);
}
/**
 * LittleJS Math Classes and Functions
 * - Comprehensive math utilities for game development
 * - Vector2 class for 2D positions, directions, and math operations
 * - Color class for RGBA colors with interpolation and manipulation
 * - RandomGenerator for seeded pseudo-random number generation
 * - Math shortcuts (PI, abs, floor, ceil, min, max, sin, cos, etc.)
 * - Interpolation functions (lerp, smoothStep, percent)
 * - Clamping, wrapping, and modulo operations
 * - Angle utilities with wrap-around support
 * - Collision detection (overlapping, intersection, line tests)
 * - Random number generation and seeding
 * - Type checking utilities
 * @namespace Math
 */

/** The value of PI
 *  @type {number}
 *  @default Math.PI
 *  @memberof Math */
const PI = Math.PI;

/** Returns absolute value of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const abs = Math.abs;

/** Returns floored value of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const floor = Math.floor;

/** Returns ceiled value of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const ceil = Math.ceil;

/** Returns rounded value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const round = Math.round;

/** Returns lowest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Math */
const min = Math.min;

/** Returns highest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Math */
const max = Math.max;

/** Returns the sign of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const sign = (x) => Math.sign(x);

/** Returns hypotenuse of values passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Math */
const hypot = (...values) => Math.hypot(...values);

/** Returns log2 of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const log2 = (x) => Math.log2(x);

/** Returns sin of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const sin = Math.sin;

/** Returns cos of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const cos = Math.cos;

/** Returns tan of value passed in
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const tan = Math.tan;

/** Returns atan2 of values passed in
 *  @param {number} y
 *  @param {number} x
 *  @return {number}
 *  @memberof Math */
const atan2 = Math.atan2;

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {number} dividend
 *  @param {number} [divisor]
 *  @return {number}
 *  @memberof Math */
function mod(dividend, divisor=1) { return ((dividend % divisor) + divisor) % divisor; }

/** Clamps the value between max and min
 *  @param {number} value
 *  @param {number} [min]
 *  @param {number} [max]
 *  @return {number}
 *  @memberof Math */
function clamp(value, min=0, max=1) { return value < min ? min : value > max ? max : value; }

/** Returns what percentage the value is between valueA and valueB
 *  @param {number} value
 *  @param {number} valueA
 *  @param {number} valueB
 *  @return {number}
 *  @memberof Math */
function percent(value, valueA, valueB)
{ return (valueB-=valueA) ? clamp((value-valueA)/valueB) : 0; }

/** Linearly interpolates between values passed in using percent
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Math */
function lerp(valueA, valueB, percent)
{ return valueA + clamp(percent) * (valueB-valueA); }

/** Gets percent between percentA and percentB and linearly interpolates between lerpA and lerpB
 *  A shortcut for lerp(lerpA, lerpB, percent(value, percentA, percentB))
 *  @param {number} value
 *  @param {number} percentA
 *  @param {number} percentB
 *  @param {number} lerpA
 *  @param {number} lerpB
 *  @return {number}
 *  @memberof Math */
function percentLerp(value, percentA, percentB, lerpA, lerpB)
{ return lerp(lerpA, lerpB, percent(value, percentA, percentB)); }

/** Returns signed wrapped distance between the two values passed in
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Math */
function distanceWrap(valueA, valueB, wrapSize=1)
{
    ASSERT(wrapSize > 0, 'distanceWrap wrapSize must be > 0');
    const d = (valueA - valueB) % wrapSize;
    return d*2 % wrapSize - d;
}

/** Linearly interpolates between values passed in with wrapping
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Math */
function lerpWrap(valueA, valueB, percent, wrapSize=1)
{ return valueA + clamp(percent) * distanceWrap(valueB, valueA, wrapSize); }

/** Returns signed wrapped distance between the two angles passed in
 *  @param {number} angleA
 *  @param {number} angleB
 *  @return {number}
 *  @memberof Math */
function distanceAngle(angleA, angleB) { return distanceWrap(angleA, angleB, 2*PI); }

/** Linearly interpolates between the angles passed in with wrapping
 *  @param {number} angleA
 *  @param {number} angleB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Math */
function lerpAngle(angleA, angleB, percent) { return lerpWrap(angleA, angleB, percent, 2*PI); }

/** Applies smoothstep function to the percentage value
 *  @param {number} percent
 *  @return {number}
 *  @memberof Math */
function smoothStep(percent) { return percent * percent * (3 - 2 * percent); }

/** Checks if the value passed in is a power of two
 *  @param {number} value
 *  @return {boolean}
 *  @memberof Math */
function isPowerOfTwo(value) { return value > 0 && !(value & (value - 1)); }

/** Returns the nearest power of two not less than the value
 *  @param {number} value
 *  @return {number}
 *  @memberof Math */
function nearestPowerOfTwo(value) { return 2**ceil(log2(value)); }

/** Returns true if two axis aligned bounding boxes are overlapping
 *  this can be used for simple collision detection between objects
 *  @param {Vector2} posA - Center of box A
 *  @param {Vector2} sizeA - Size of box A
 *  @param {Vector2} posB - Center of box B
 *  @param {Vector2} [sizeB=vec2()] - Size of box B, uses a point if undefined
 *  @return {boolean} - True if overlapping
 *  @memberof Math */
function isOverlapping(posA, sizeA, posB, sizeB=vec2())
{
    const dx = (posA.x - posB.x)*2;
    const dy = (posA.y - posB.y)*2;
    const sx = sizeA.x + sizeB.x;
    const sy = sizeA.y + sizeB.y;
    // symmetric so isOverlapping(A,B) === isOverlapping(B,A) at touching edges
    return abs(dx) < sx && abs(dy) < sy;
}

/** Returns true if a line segment is intersecting an axis aligned box
 *  @param {Vector2} start - Start of raycast
 *  @param {Vector2} end   - End of raycast
 *  @param {Vector2} pos   - Center of box
 *  @param {Vector2} size  - Size of box
 *  @return {boolean}      - True if intersecting
 *  @memberof Math */
function isIntersecting(start, end, pos, size)
{
    // Liang-Barsky algorithm
    const boxMin = pos.subtract(size.scale(.5));
    const boxMax = boxMin.add(size);
    const delta = end.subtract(start);
    const a = start.subtract(boxMin);
    const b = start.subtract(boxMax);
    const p = [-delta.x, delta.x, -delta.y, delta.y];
    const q = [a.x, -b.x, a.y, -b.y];
    let tMin = 0, tMax = 1;
    for (let i = 4; i--;)
    {
        if (p[i])
        {
            const t = q[i] / p[i];
            if (p[i] < 0)
            {
                if (t > tMax) return false;
                tMin = max(t, tMin);
            }
            else
            {
                if (t < tMin) return false;
                tMax = min(t, tMax);
            }
        }
        else if (q[i] < 0)
            return false;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////
// Collision helpers, none of them change anything that is passed in
// Boxes are axis aligned and centered on pos with a full size, like drawRect
// Each returns how far to move the first shape to get it clear, or undefined when they are not touching
// isOverlapping answers whether two boxes touch, these answer how far out

/** Returns the vector to move circle A by so it no longer overlaps circle B, or undefined
 *  @param {Vector2} posA - Center of circle A
 *  @param {number} radiusA
 *  @param {Vector2} posB - Center of circle B
 *  @param {number} radiusB
 *  @return {Vector2|undefined}
 *  @memberof Math */
function collideCircleCircle(posA, radiusA, posB, radiusB)
{
    const d = posA.subtract(posB);
    const r = radiusA + radiusB;
    const dist = d.length();
    if (dist >= r)
        return undefined;
    return d.normalize(r - dist); // coincident centers normalize to straight up
}

/** Returns the vector to move a circle out of an axis aligned box, or undefined
 *  @param {Vector2} pos - Center of the circle
 *  @param {number} radius
 *  @param {Vector2} boxPos - Center of the box
 *  @param {Vector2} boxSize - Full size of the box
 *  @return {Vector2|undefined}
 *  @memberof Math */
function collideCircleBox(pos, radius, boxPos, boxSize)
{
    const h = boxSize.scale(.5);
    const closest = vec2(clamp(pos.x, boxPos.x - h.x, boxPos.x + h.x), clamp(pos.y, boxPos.y - h.y, boxPos.y + h.y));
    const d = pos.subtract(closest), distSq = d.lengthSquared();
    if (distSq)
        return distSq >= radius*radius ? undefined : d.normalize(radius - distSq**.5);

    // center is inside the box, push out along the axis of least penetration
    const offset = pos.subtract(boxPos);
    return pushOutAxis(offset, h.x - abs(offset.x), h.y - abs(offset.y), radius);
}

/** Returns the vector to move box A by so it no longer overlaps box B, the shortest way out, or undefined
 *  - isOverlapping is the yes or no version of this
 *  @param {Vector2} posA - Center of box A
 *  @param {Vector2} sizeA - Full size of box A
 *  @param {Vector2} posB - Center of box B
 *  @param {Vector2} sizeB - Full size of box B
 *  @return {Vector2|undefined}
 *  @memberof Math */
function collideBoxBox(posA, sizeA, posB, sizeB)
{
    const d = posA.subtract(posB);
    const overlapX = (sizeA.x + sizeB.x)/2 - abs(d.x);
    const overlapY = (sizeA.y + sizeB.y)/2 - abs(d.y);
    if (overlapX <= 0 || overlapY <= 0)
        return undefined;
    return pushOutAxis(d, overlapX, overlapY);
}

// the axis with the smallest penetration, pointing the way d does, with extra distance added
function pushOutAxis(d, penX, penY, extra=0)
{
    const s = (v)=> v >= 0 ? 1 : -1; // sign() gives 0 on a tie, which would be no push
    return penX <= penY ? vec2(s(d.x)*(penX + extra), 0) : vec2(0, s(d.y)*(penY + extra));
}

/** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
 *  @param {number} [frequency] - Frequency of the wave in Hz
 *  @param {number} [amplitude] - Amplitude (max height) of the wave
 *  @param {number} [t=time]    - Value to use for time of the wave
 *  @param {number} [offset]    - Value to use for time offset of the wave
 *  @param {number} [type]      - Wave type: 0=sine, 1=triangle, 2=square, 3=sawtooth
 *  @return {number}            - Value waving between 0 and amplitude
 *  @memberof Math */
function oscillate(frequency=1, amplitude=1, t=time, offset=0, type=0)
{
    const phase = mod(offset + t*frequency, 1);
    let value;
    
    if (type === 1) // triangle
        value = 2 * abs(2 * phase - 1) - 1;
    else if (type === 2) // square
        value = phase < .5 ? -1 : 1;
    else if (type === 3) // sawtooth
        value = 2 * phase - 1;
    else // sine
        value = -cos(phase * 2*PI);
    return amplitude/2 * (value + 1);
}

/**
 * Check if object is a valid number, not NaN or undefined, but it may be infinite
 * @param {any} n
 * @return {boolean}
 * @memberof Math */
function isNumber(n) { return typeof n === 'number' && !isNaN(n); }

/**
 * Check if a value is stringifiable — i.e. it has a toString that returns
 * a string. Use this for ASSERTs and inputs that will be coerced to text;
 * use `typeof x === 'string'` inline if you need strict-string semantics.
 * - Returns true for strings, numbers, and most objects
 * - Returns false for null and undefined
 * @param {any} s
 * @return {boolean}
 * @memberof Math */
function isStringLike(s) { return s != null && typeof s?.toString() === 'string'; }

/**
 * Check if object is an array
 * @param {any} a
 * @return {a is Array<any>}
 * @memberof Math */
function isArray(a) { return Array.isArray(a); }

/**
 * @callback LineTestFunction - Checks if a position is colliding
 * @param {Vector2} pos
 * @memberof Draw
 */

/**
 * Casts a ray and returns position of the first collision found, or undefined if none are found
 * @param {Vector2} posStart
 * @param {Vector2} posEnd
 * @param {LineTestFunction} testFunction - Check if colliding
 * @param {Vector2} [normal] - Optional vector to store the normal
 * @return {Vector2|undefined} - Position of the collision or undefined if none found
 * @memberof Math */
function lineTest(posStart, posEnd, testFunction, normal)
{
    ASSERT(isVector2(posStart), 'posStart must be a vec2');
    ASSERT(isVector2(posEnd), 'posEnd must be a vec2');
    ASSERT(typeof testFunction === 'function', 'testFunction must be a function');
    ASSERT(!normal || isVector2(normal), 'normal must be a vec2');

    // get ray direction and length
    const dx = posEnd.x - posStart.x;
    const dy = posEnd.y - posStart.y;
    const totalLength = (dx*dx + dy*dy)**.5;
    if (!totalLength) return;

    // current integer cell we are in
    const pos = posStart.floor();

    // normalize ray direction
    const dirX = dx / totalLength;
    const dirY = dy / totalLength;

    // step direction in grid
    const stepX = sign(dirX);
    const stepY = sign(dirY);

    // distance along the ray to cross one full cell in X or Y
    const tDeltaX = dirX ? abs(1 / dirX) : Infinity;
    const tDeltaY = dirY ? abs(1 / dirY) : Infinity;

    // distance along the ray from start to the first grid boundary
    const nextGridX = stepX > 0 ? pos.x + 1 : pos.x;
    const nextGridY = stepY > 0 ? pos.y + 1 : pos.y;
    const tMaxX = dirX ? (nextGridX - posStart.x) / dirX : Infinity;
    const tMaxY = dirY ? (nextGridY - posStart.y) / dirY : Infinity;

    // use line drawing algorithm to test for collisions
    let t = 0, tX = tMaxX, tY = tMaxY, wasX = tDeltaX < tDeltaY;
    while (t < totalLength)
    {
        if (testFunction(pos))
        {
            // set hit point
            const hitPos = vec2(posStart.x + dirX*t, posStart.y + dirY*t);

            // ensure result is inside the tile
            const e = 1e-9;
            const hitPosFloor = hitPos.floor();
            if (hitPosFloor.x < pos.x)
                hitPos.x = pos.x;
            else if (hitPosFloor.x > pos.x)
                hitPos.x = pos.x + 1 - e;
            if (hitPosFloor.y < pos.y)
                hitPos.y = pos.y;
            else if (hitPosFloor.y > pos.y) 
                hitPos.y = pos.y + 1 - e;

            // set normal
            if (normal)
                wasX ? normal.set(-stepX,0) : normal.set(0,-stepY);
            return hitPos;
        }

        // advance to the next grid boundary
        if (wasX = tX < tY)
        {
            pos.x += stepX;
            t = tX;
            tX += tDeltaX;
        }
        else
        {
            pos.y += stepY;
            t = tY;
            tY += tDeltaY;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Random global functions
 *  @namespace Random */

/** Returns a random value between the two values passed in
 *  @param {number} [valueA]
 *  @param {number} [valueB]
 *  @return {number}
 *  @memberof Random */
function rand(valueA=1, valueB=0) { return valueB + Math.random() * (valueA-valueB); }

/** Returns a floored random value between the two values passed in
 *  The upper bound is exclusive. (If 2 is passed in, result will be 0 or 1)
 *  @param {number} valueA
 *  @param {number} [valueB]
 *  @return {number}
 *  @memberof Random */
function randInt(valueA, valueB=0) { return floor(rand(valueA,valueB)); }

/** Randomly returns true or false given the chance of true passed in
 *  @param {number} [chance]
 *  @return {boolean}
 *  @memberof Random */
function randBool(chance=.5) { return rand() < chance; }

/** Randomly returns either -1 or 1
 *  @return {number}
 *  @memberof Random */
function randSign() { return randInt(2) * 2 - 1; }

/** Returns a random Vector2 with the passed in length
 *  @param {number} [length]
 *  @return {Vector2}
 *  @memberof Random */
function randVec2(length=1) { return new Vector2().setAngle(rand(2*PI), length); }

/** Returns a random Vector2 within a circular shape
 *  @param {number} [radius]
 *  @param {number} [minRadius]
 *  @return {Vector2}
 *  @memberof Random */
function randInCircle(radius=1, minRadius=0)
{
    // r is uniform in area ⇒ r² uniform in [minRadius², radius²]
    // (the squared inner bound is what makes minRadius the actual exclusion edge)
    if (radius <= 0) return new Vector2;
    const ratio = clamp(minRadius / radius);
    return randVec2(radius * rand(ratio*ratio, 1)**.5);
}

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=WHITE]
 *  @param {Color}   [colorB=BLACK]
 *  @param {boolean} [linear]
 *  @return {Color}
 *  @memberof Random */
function randColor(colorA=new Color, colorB=new Color(0,0,0,1), linear=false)
{
    return linear ? colorA.lerp(colorB, rand()) :
        new Color(rand(colorA.r,colorB.r), rand(colorA.g,colorB.g), rand(colorA.b,colorB.b), rand(colorA.a,colorB.a));
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Seeded random number generator
 * - Can be used to create a deterministic random number sequence
 * @memberof Engine
 * @example
 * let r = new RandomGenerator(123); // random number generator with seed 123
 * let a = r.float();                // random value between 0 and 1
 * let b = r.int(10);                // random integer between 0 and 9
 * r.seed = 123;                     // reset the seed
 * let c = r.float();                // the same value as a
 */
class RandomGenerator
{
    /** Create a random number generator with the seed passed in
     *  @param {number} [seed] - Starting seed or engine default seed */
    constructor(seed = 123456789)
    {
        ASSERT(seed !== 0, 'RandomGenerator seed must be non-zero (xorshift is fixed at 0)');
        /** @property {number} - random seed */
        this.seed = seed;
    }

    /** Returns a seeded random value between the two values passed in
    *  @param {number} [valueA]
    *  @param {number} [valueB]
    *  @return {number} */
    float(valueA=1, valueB=0)
    {
        // xorshift algorithm
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return valueB + (valueA - valueB) * ((this.seed >>> 0) / 2**32);
    }

    /** Returns a floored seeded random value the two values passed in
    *  @param {number} valueA
    *  @param {number} [valueB]
    *  @return {number} */
    int(valueA, valueB=0) { return floor(this.float(valueA, valueB)); }

    /** Randomly returns true or false given the chance of true passed in
    *  @param {number} [chance]
    *  @return {boolean} */
    bool(chance=.5) { return this.float() < chance; }

    /** Randomly returns either -1 or 1 deterministically
    *  @return {number} */
    sign() { return this.float() > .5 ? 1 : -1; }

    /** Returns a seeded random value between the two values passed in with a random sign
    *  @param {number} [valueA]
    *  @param {number} [valueB]
    *  @return {number} */
    floatSign(valueA=1, valueB=0)
    {
        const lo = min(valueA, valueB);
        const hi = max(valueA, valueB);
        const d = hi - lo;
        const e = this.float(d*2);
        return e < d ? lo + e : d - lo - e;
    }

    /** Returns a random angle between -PI and PI
    *  @return {number} */
    angle() { return this.float(-PI, PI); }

    /** Returns a seeded vec2 with size between the two values passed in
    *  @param {number} valueA
    *  @param {number} [valueB]
    *  @return {Vector2} */
    vec2(valueA=1, valueB=0)
    { return vec2(this.float(valueA, valueB), this.float(valueA, valueB)); }

    /** Returns a random color between the two passed in colors, combine components if linear
    *  @param {Color}   [colorA=WHITE]
    *  @param {Color}   [colorB=BLACK]
    *  @param {boolean} [linear]
    *  @return {Color} */
    randColor(colorA=new Color, colorB=new Color(0,0,0,1), linear=false)
    {
        return linear ? colorA.lerp(colorB, this.float()) :
            new Color(
                this.float(colorA.r,colorB.r), 
                this.float(colorA.g,colorB.g), 
                this.float(colorA.b,colorB.b), 
                this.float(colorA.a,colorB.a));
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {Color} color
     * @param {number} [amount]
     * @param {number} [alphaAmount]
     * @return {Color} */
    mutateColor(color, amount=.05, alphaAmount=0)
    {
        ASSERT_NUMBER_VALID(amount);
        ASSERT_NUMBER_VALID(alphaAmount);
        return new Color
        (
            color.r + this.float(amount, -amount),
            color.g + this.float(amount, -amount),
            color.b + this.float(amount, -amount),
            color.a + this.float(alphaAmount, -alphaAmount)
        ).clamp();
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a 2d vector, can take 1 or 2 scalar values
 * @param {number} [x]
 * @param {number} [y] - if y is undefined, x is used for both
 * @return {Vector2}
 * @example
 * let a = vec2(0, 1); // vector with coordinates (0, 1)
 * a = vec2(5);        // set a to (5, 5)
 * b = vec2();         // set b to (0, 0)
 * @memberof Math */
function vec2(x=0, y) { return new Vector2(x, y ?? x); }

/**
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {boolean}
 * @memberof Math */
function isVector2(v) { return v instanceof Vector2 && v.isValid(); }

// vector2 asserts
function ASSERT_VECTOR2_VALID(v) { ASSERT(isVector2(v), 'Vector2 is invalid.', v); }
function ASSERT_NUMBER_VALID(n) { ASSERT(isNumber(n), 'Number is invalid.', n); }
function ASSERT_VECTOR2_NORMAL(v)
{
    ASSERT_VECTOR2_VALID(v);
    ASSERT(abs(v.lengthSquared()-1) < .01, 'Vector2 is not normal.', v);
}

/**
 * 2D Vector object with vector math library
 * - Functions do not change this so they can be chained together
 * @memberof Engine
 * @example
 * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
 * let b = new Vector2;       // vector with coordinates (0, 0)
 * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
 * let d = a.add(b).scale(5); // operators can be chained
 */
class Vector2
{
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {number} [x] - X axis location
     *  @param {number} [y] - Y axis location */
    constructor(x=0, y=0)
    {
        /** @property {number} - X axis location */
        this.x = x;
        /** @property {number} - Y axis location */
        this.y = y;
        ASSERT(this.isValid(), 'Constructed Vector2 is invalid.', this);
    }

    /** Sets values of this vector and returns self
     *  @param {number} [x] - X axis location
     *  @param {number} [y] - Y axis location
     *  @return {Vector2} */
    set(x=0, y=0)
    {
        this.x = x;
        this.y = y;
        ASSERT_VECTOR2_VALID(this);
        return this;
    }

    /** Sets this vector from another vector and returns self
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    setFrom(v) { return this.set(v.x, v.y); }

    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    copy() { return new Vector2(this.x, this.y); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    add(v) { return new Vector2(this.x + v.x, this.y + v.y);}

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    multiply(v) { return new Vector2(this.x * v.x, this.y * v.y); }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    divide(v) { return new Vector2(this.x / v.x, this.y / v.y); }

    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {number} s - scale
     *  @return {Vector2} */
    scale(s) { return new Vector2(this.x * s, this.y * s); }

    /** Returns the length of this vector
     * @return {number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     * @return {number} */
    lengthSquared() { return this.x**2 + this.y**2; }

    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    distance(v) { return this.distanceSquared(v)**.5; }

    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    distanceSquared(v) { return (this.x - v.x)**2 + (this.y - v.y)**2; }

    /** Returns a new vector in same direction as this one with the length passed in
     * - A zero vector has no direction, so it normalizes to straight up
     * @param {number} [length]
     * @return {Vector2} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector2(0, length);
    }

    /** Returns a new vector clamped to length passed in
     * @param {number} [length]
     * @return {Vector2} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this.copy();
    }

    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    dot(v) { return this.x*v.x + this.y*v.y; }

    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {number} */
    cross(v) { return this.x*v.y - this.y*v.x; }

    /** Returns a copy this vector reflected by the surface normal
     * @param {Vector2} normal - surface normal (should be normalized)
     * @param {number} restitution - how much to bounce, 1 is perfect bounce, 0 is no bounce
     * @return {Vector2} */
    reflect(normal, restitution=1)
    { return this.subtract(normal.scale((1+restitution)*this.dot(normal))); }

    /** Returns the clockwise angle of this vector, up is angle 0
     * @return {number} */
    angle() { return atan2(this.x, this.y); }

    /** Sets this vector with clockwise angle and length passed in
     * @param {number} [angle]
     * @param {number} [length]
     * @return {Vector2} */
    setAngle(angle=0, length=1)
    {
        ASSERT_NUMBER_VALID(angle);
        ASSERT_NUMBER_VALID(length);
        this.x = length*sin(angle);
        this.y = length*cos(angle);
        return this;
    }

    /** Returns copy of this vector rotated by the clockwise angle passed in
     * @param {number} angle
     * @return {Vector2} */
    rotate(angle)
    {
        ASSERT_NUMBER_VALID(angle);
        const c = cos(-angle), s = sin(-angle);
        return new Vector2(this.x*c - this.y*s, this.x*s + this.y*c);
    }

    /** Sets this this vector to point in the specified integer direction (0-3), corresponding to multiples of 90 degree rotation
     * @param {number} [direction]
     * @param {number} [length]
     * @return {Vector2} */
    setDirection(direction, length=1)
    {
        ASSERT_NUMBER_VALID(direction);
        ASSERT_NUMBER_VALID(length);
        direction = mod(direction, 4);
        ASSERT(direction===0 || direction===1 || direction===2 || direction===3,
            'Vector2.setDirection() direction must be an integer between 0 and 3.');
        
        this.x = direction%2 ? direction-1 ? -length : length : 0;
        this.y = direction%2 ? 0 : direction ? -length : length;
        return this;
    }

    /** Returns the integer direction of this vector, corresponding to multiples of 90 degree rotation (0-3)
     * @return {number} */
    direction()
    { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

    /** Returns a copy of this vector with absolute values
     * @return {Vector2} */
    abs() { return new Vector2(abs(this.x), abs(this.y)); }

    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    floor() { return new Vector2(floor(this.x), floor(this.y)); }

    /** Returns a copy of this vector snapped to a grid. Note that `grid` is
     *  the number of snap steps per unit (so `grid=2` snaps to halves and
     *  `grid=0.5` snaps to twos), not the cell size.
     *  @param {number} grid - snap steps per unit
     *  @return {Vector2} */
    snap(grid)
    {
        ASSERT_NUMBER_VALID(grid);
        return new Vector2(floor(this.x*grid)/grid, floor(this.y*grid)/grid);
    }

    /** Returns new vec2 with modded values
    *  @param {number} [divisor]
    *  @return {Vector2} */
    mod(divisor=1)
    { return new Vector2(mod(this.x, divisor), mod(this.y, divisor)); }

    /** Returns the area this vector covers as a rectangle
     * @return {number} */
    area() { return abs(this.x * this.y); }

    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} v - other vector
     * @param {number}  percent
     * @return {Vector2} */
    lerp(v, percent)
    {
        ASSERT_VECTOR2_VALID(v);
        ASSERT_NUMBER_VALID(percent);
        const p = clamp(percent);
        return new Vector2(v.x*p + this.x*(1-p), v.y*p + this.y*(1-p));
    }

    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {boolean} */
    arrayCheck(arraySize)
    { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; }

    /** Returns this vector expressed as a string
     * @param {number} digits - precision to display
     * @return {string} */
    toString(digits=3)
    {
        ASSERT_NUMBER_VALID(digits);
        if (this.isValid())
            return `(${(this.x<0?'':' ') + this.x.toFixed(digits)},${(this.y<0?'':' ') + this.y.toFixed(digits)} )`;
        else
            return `(${this.x}, ${this.y})`;
    }

    /** Checks if this is a valid vector
     * @return {boolean} */
    isValid() { return isNumber(this.x) && isNumber(this.y); }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a color object with RGBA values, white by default
 * @param {number} [r=1] - red
 * @param {number} [g=1] - green
 * @param {number} [b=1] - blue
 * @param {number} [a=1] - alpha
 * @return {Color}
 * @memberof Math
 */
function rgb(r, g, b, a) { return new Color(r, g, b, a); }

/**
 * Create a color object with HSLA values, white by default
 * @param {number} [h=0] - hue
 * @param {number} [s=0] - saturation
 * @param {number} [l=1] - lightness
 * @param {number} [a=1] - alpha
 * @return {Color}
 * @memberof Math */
function hsl(h, s, l, a) { return new Color().setHSLA(h, s, l, a); }

/**
 * Check if object is a valid Color
 * @param {any} c
 * @return {boolean}
 * @memberof Math */
function isColor(c) { return c instanceof Color && c.isValid(); }

// color asserts
function ASSERT_COLOR_VALID(c) { ASSERT(isColor(c), 'Color is invalid.', c); }

/**
 * Color object (red, green, blue, alpha) with some helpful functions
 * @memberof Engine
 * @example
 * let a = new Color;              // white
 * let b = new Color(1, 0, 0);     // red
 * let c = new Color(0, 0, 0, 0);  // transparent black
 * let d = rgb(0, 0, 1);         // blue using rgb color
 * let e = hsl(.3, 1, .5);         // green using hsl color
 */
class Color
{
    /** Create a color with the rgba components passed in, white by default
     *  @param {number} [r] - red
     *  @param {number} [g] - green
     *  @param {number} [b] - blue
     *  @param {number} [a] - alpha*/
    constructor(r=1, g=1, b=1, a=1)
    {
        /** @property {number} - Red */
        this.r = r;
        /** @property {number} - Green */
        this.g = g;
        /** @property {number} - Blue */
        this.b = b;
        /** @property {number} - Alpha */
        this.a = a;
        ASSERT(this.isValid(), 'Constructed Color is invalid.', this);
    }

    /** Sets values of this color and returns self
     *  @param {number} [r] - red
     *  @param {number} [g] - green
     *  @param {number} [b] - blue
     *  @param {number} [a] - alpha
     *  @return {Color} */
    set(r=1, g=1, b=1, a=1)
    {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Sets this color from another color and returns self
     * @param {Color} c - other color
     * @return {Color} */
    setFrom(c) { return this.set(c.r, c.g, c.b, c.a); }

    /** Sets the alpha of this color and returns self
     *  @param {number} [a] - alpha
     *  @return {Color} */
    setAlpha(a=1)
    {
        this.a = a;
        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

    /** Returns a copy of this color with the alpha set
     *  @param {number} [a] - alpha
     *  @return {Color} */
    withAlpha(a=1) { return new Color(this.r, this.g, this.b, a); }

    /** Returns a copy of this color plus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    add(c) { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }

    /** Returns a copy of this color minus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }

    /** Returns a copy of this color times the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }

    /** Returns a copy of this color divided by the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    divide(c) { return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a); }

    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {number} scale
     * @param {number} [alphaScale=scale]
     * @return {Color} */
    scale(scale, alphaScale=scale)
    { return new Color(this.r*scale, this.g*scale, this.b*scale, this.a*alphaScale); }

    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }

    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color}  c - other color
     * @param {number} percent
     * @return {Color} */
    lerp(c, percent)
    {
        ASSERT_COLOR_VALID(c);
        ASSERT_NUMBER_VALID(percent);
        const p = clamp(percent);
        return new Color(
            c.r*p + this.r*(1-p),
            c.g*p + this.g*(1-p),
            c.b*p + this.b*(1-p),
            c.a*p + this.a*(1-p));
    }

    /** Sets this color given a hue, saturation, lightness, and alpha
     * @param {number} [h] - hue
     * @param {number} [s] - saturation
     * @param {number} [l] - lightness
     * @param {number} [a] - alpha
     * @return {Color} */
    setHSLA(h=0, s=0, l=1, a=1)
    {
        h = mod(h,1);
        s = clamp(s);
        l = clamp(l);
        const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q,
            f = (p, q, t)=>
                (t = mod(t,1))*6 < 1 ? p+(q-p)*6*t :
                t*2 < 1 ? q :
                t*3 < 2 ? p+(q-p)*(4-t*6) : p;
        this.r = f(p, q, h + 1/3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1/3);
        this.a = a;
        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Returns this color expressed in hsla format
     * @return {Array<number>} */
    HSLA()
    {
        const r = clamp(this.r);
        const g = clamp(this.g);
        const b = clamp(this.b);
        const a = clamp(this.a);
        const maxC = max(r, g, b);
        const minC = min(r, g, b);
        const l = (maxC + minC) / 2;
        let h = 0, s = 0;
        if (maxC !== minC)
        {
            let d = maxC - minC;
            s = l > .5 ? d / (2 - maxC - minC) : d / (maxC + minC);
            if (r === maxC)
                h = (g - b) / d + (g < b ? 6 : 0);
            else if (g === maxC)
                h = (b - r) / d + 2;
            else if (b === maxC)
                h =  (r - g) / d + 4;
        }
        return [h / 6, s, l, a];
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {number} [amount]
     * @param {number} [alphaAmount]
     * @return {Color} */
    mutate(amount=.05, alphaAmount=0)
    {
        ASSERT_NUMBER_VALID(amount);
        ASSERT_NUMBER_VALID(alphaAmount);
        return new Color
        (
            this.r + rand(amount, -amount),
            this.g + rand(amount, -amount),
            this.b + rand(amount, -amount),
            this.a + rand(alphaAmount, -alphaAmount)
        ).clamp();
    }

    /** Returns this color expressed as a hex color code
     * @param {boolean} [useAlpha] - if alpha should be included in result
     * @return {string} */
    toString(useAlpha = true)
    {
        if (debug && !this.isValid())
            return '#000';
        const toHex = (c)=> ((c=clamp(c)*255|0)<16 ? '0' : '') + c.toString(16);
        return '#' + toHex(this.r) + toHex(this.g) + toHex(this.b) + (useAlpha ? toHex(this.a) : '');
    }

    /** Set this color from a hex code
     * @param {string} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        ASSERT(isStringLike(hex), 'Color hex code must be a string');
        ASSERT(hex[0] === '#', 'Color hex code must start with #');
        ASSERT([4,5,7,9].includes(hex.length), 'Invalid hex');

        if (hex.length < 6)
        {
            const fromHex = (c)=> clamp(parseInt(hex[c],16)/15);
            this.r = fromHex(1);
            this.g = fromHex(2);
            this.b = fromHex(3);
            this.a = hex.length === 5 ? fromHex(4) : 1;
        }
        else
        {
            const fromHex = (c)=> clamp(parseInt(hex.slice(c,c+2),16)/255);
            this.r = fromHex(1);
            this.g = fromHex(3);
            this.b = fromHex(5);
            this.a = hex.length === 9 ? fromHex(7) : 1;
        }

        ASSERT_COLOR_VALID(this);
        return this;
    }

    /** Returns this color expressed as 32 bit RGBA value
     * @return {number} */
    rgbaInt()
    {
        const r = clamp(this.r)*255|0;
        const g = clamp(this.g)*255<<8;
        const b = clamp(this.b)*255<<16;
        const a = clamp(this.a)*255<<24;
        return r + g + b + a;
    }

    /** Checks if this is a valid color
     * @return {boolean} */
    isValid()
    { return isNumber(this.r) && isNumber(this.g) && isNumber(this.b) && isNumber(this.a); }
}

///////////////////////////////////////////////////////////////////////////////
// Default Colors

/** Color - White #ffffff
 *  @type {Color}
 *  @memberof Math */
const WHITE = debugProtectConstant(rgb());

/** Color - Clear White #ffffff00 with 0 alpha
 *  @type {Color}
 *  @memberof Math */
const CLEAR_WHITE = debugProtectConstant(rgb(1,1,1,0));

/** Color - Black #000000
 *  @type {Color}
 *  @memberof Math */
const BLACK = debugProtectConstant(rgb(0,0,0));

/** Color - Clear Black #00000000 with 0 alpha
 *  @type {Color}
 *  @memberof Math */
const CLEAR_BLACK = debugProtectConstant(rgb(0,0,0,0));

/** Color - Gray #808080
 *  @type {Color}
 *  @memberof Math */
const GRAY = debugProtectConstant(rgb(.5,.5,.5));

/** Color - Red #ff0000
 *  @type {Color}
 *  @memberof Math */
const RED = debugProtectConstant(rgb(1,0,0));

/** Color - Orange #ff8000
 *  @type {Color}
 *  @memberof Math */
const ORANGE = debugProtectConstant(rgb(1,.5,0));

/** Color - Yellow #ffff00
 *  @type {Color}
 *  @memberof Math */
const YELLOW = debugProtectConstant(rgb(1,1,0));

/** Color - Green #00ff00
 *  @type {Color}
 *  @memberof Math */
const GREEN = debugProtectConstant(rgb(0,1,0));

/** Color - Cyan #00ffff
 *  @type {Color}
 *  @memberof Math */
const CYAN = debugProtectConstant(rgb(0,1,1));

/** Color - Blue #0000ff
 *  @type {Color}
 *  @memberof Math */
const BLUE = debugProtectConstant(rgb(0,0,1));

/** Color - Purple #8000ff
 *  @type {Color}
 *  @memberof Math */
const PURPLE = debugProtectConstant(rgb(.5,0,1));

/** Color - Magenta #ff00ff
 *  @type {Color}
 *  @memberof Math */
const MAGENTA = debugProtectConstant(rgb(1,0,1));
/**
 * LittleJS Utility Classes and Functions
 * - Timer - tracks time automatically with support for pause and real-time modes
 * - Time formatting helper
 * - JSON file fetching
 * - File saving (text, canvas, data URLs)
 * - Native share dialog support
 * - Local storage save data management
 * - Gradient noise (1D and 2D)
 * @namespace Utilities
 */

/**
 * Timer object tracks how long has passed since it was set
 * @memberof Engine
 * @example
 * let a = new Timer;    // creates a timer that is not set
 * a.set(3);             // sets the timer to 3 seconds
 *
 * let b = new Timer(1); // creates a timer with 1 second left
 * b.unset();            // unset the timer
 */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds (undefined = unset)
     *  @param {boolean} [useRealTime] - Should the timer keep running even when the game is paused? (useful for UI) */
    constructor(timeLeft, useRealTime=false)
    {
        ASSERT(timeLeft === undefined || isNumber(timeLeft), 'Constructed Timer is invalid.', timeLeft);
        this.useRealTime = useRealTime;
        const globalTime = this.getGlobalTime();
        this.time = timeLeft === undefined ? undefined : globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set the timer with seconds passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0)
    {
        ASSERT(isNumber(timeLeft), 'Timer is invalid.', timeLeft);
        const globalTime = this.getGlobalTime();
        this.time = globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set if the timer should keep running even when the game is paused
     *  @param {boolean} [useRealTime] */
    setUseRealTime(useRealTime=true)
    {
        ASSERT(!this.isSet(), 'Cannot change global time setting while timer is set.');
        this.useRealTime = useRealTime;
    }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {boolean} */
    isSet() { return this.time !== undefined; }

    /** Returns true if set and has not elapsed
     * @return {boolean} */
    active() { return this.getGlobalTime() < this.time; }

    /** Returns true if set and elapsed
     * @return {boolean} */
    elapsed() { return this.getGlobalTime() >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    get() { return this.isSet()? this.getGlobalTime() - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set.
     *  Zero-duration timers report 1 (already elapsed).
     * @return {number} */
    getPercent()
    {
        if (!this.isSet()) return 0;
        if (!this.setTime) return 1;
        return 1 - percent(this.time - this.getGlobalTime(), 0, this.setTime);
    }

    /** Get the time this timer was set to, returns 0 if not set
     * @return {number} */
    getSetTime() { return this.isSet() ? this.setTime : 0; }

    /** Get the current global time this timer is based on
     * @return {number} */
    getGlobalTime() { return this.useRealTime ? timeReal : time; }

    /** Returns this timer expressed as a string
     * @return {string} */
    toString() { return this.isSet() ? abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    valueOf() { return this.get(); }
}

///////////////////////////////////////////////////////////////////////////////

/** Formats seconds to mm:ss style for display purposes
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t)
{
    const signStr = t < 0 ? '-' : '';
    t = abs(t)|0;
    return signStr + (t/60|0) + ':' + (t%60<10?'0':'') + t%60;
}

/** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
 *  @param {string} url - URL of JSON file
 *  @return {Promise<object>}
 *  @memberof Utilities */
async function fetchJSON(url)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch JSON from ${url}: ${response.status} ${response.statusText}`);
    return response.json();
}

///////////////////////////////////////////////////////////////////////////////

/** Save a text file to disk
 *  @param {string} text
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveText(text, filename='text', type='text/plain')
{ saveDataURL(URL.createObjectURL(new Blob([text], {'type':type})), filename); }

/** Create an offscreen canvas to draw into, and return its 2D context
 *  - The canvas is context.canvas, which is what TextureInfo and the like take
 *  @param {number} width - In pixels
 *  @param {number} [height] - In pixels, defaults to the width for a square
 *  @param {boolean} [willReadFrequently] - Keep it in software, faster when getImageData is called on it often
 *  @return {OffscreenCanvasRenderingContext2D}
 *  @memberof Utilities */
function createCanvasContext(width, height=width, willReadFrequently=false)
{
    ASSERT(isNumber(width) && isNumber(height), 'canvas width and height must be numbers', width, height);
    return new OffscreenCanvas(width, height).getContext('2d', {willReadFrequently});
}

/** Save a canvas to disk
 *  @param {HTMLCanvasElement|OffscreenCanvas} canvas
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveCanvas(canvas, filename='screenshot', type='image/png')
{
    if (canvas instanceof OffscreenCanvas)
    {
        // copy to temporary canvas and save
        const saveCanvas = document.createElement('canvas');
        saveCanvas.width = canvas.width;
        saveCanvas.height = canvas.height;
        saveCanvas.getContext('2d').drawImage(canvas, 0, 0);
        saveDataURL(saveCanvas.toDataURL(type), filename);
    }
    else
        saveDataURL(canvas.toDataURL(type), filename);
}

/** Save a data url to disk
 *  @param {string} url
 *  @param {string} [filename]
 *  @param {number} [revokeTime] - how long before revoking the url
 *  @memberof Utilities */
function saveDataURL(url, filename='download', revokeTime)
{
    ASSERT(isStringLike(url), 'saveDataURL requires url string');
    ASSERT(isStringLike(filename), 'saveDataURL requires filename string');

    // create link for saving screenshots
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    if (revokeTime !== undefined)
        setTimeout(()=> URL.revokeObjectURL(url), revokeTime);
}

/** Share content using the native share dialog if available
 *  @param {string} title - title of the share
 *  @param {string} url - url to share
 *  @param {Function} [callback] - Called when share is complete
 *  @memberof Utilities */
function shareURL(title, url, callback)
{
    ASSERT(isStringLike(title), 'shareURL requires title string');
    ASSERT(isStringLike(url), 'shareURL requires url string');
    navigator.share?.({title, url}).then(()=>callback?.());
}

///////////////////////////////////////////////////////////////////////////////

/** Read save data from local storage
 *  @param {string} saveName - unique name for the game/save
 *  @param {Object} [defaultSaveData] - default values, result is {...default, ...loaded} so this must be an object
 *  @return {Object}
 *  @memberof Utilities */
function readSaveData(saveName, defaultSaveData)
{
    ASSERT(isStringLike(saveName), 'readSaveData requires saveName string');
    ASSERT(defaultSaveData === undefined ||
        (typeof defaultSaveData === 'object' && defaultSaveData !== null),
        'readSaveData: default must be an object - the result is ' +
        '{...default, ...loaded}, so a scalar default yields {}. ' +
        'Use readSaveData(key, {best:0}).best');

    // tolerate localStorage being unavailable (iOS private mode, sandboxed
    // iframes) and corrupt JSON in stored data
    let loadedData = {};
    try
    {
        const data = localStorage[saveName];
        if (data)
        {
            try { loadedData = JSON.parse(data); }
            catch { LOG('readSaveData: corrupt JSON for', saveName, '— using defaults'); }
        }
    }
    catch { LOG('readSaveData: localStorage unavailable — using defaults'); }
    return { ...defaultSaveData, ...loadedData };
}

/** Write save data to local storage
 *  @param {string} saveName - unique name for the game/save
 *  @param {Object} saveData - object containing data to be saved
 *  @memberof Utilities */
function writeSaveData(saveName, saveData)
{
    ASSERT(isStringLike(saveName), 'writeSaveData requires saveName string');
    // tolerate localStorage being unavailable or quota exceeded
    try { localStorage[saveName] = JSON.stringify(saveData); }
    catch { LOG('writeSaveData: failed to write', saveName); }
}

///////////////////////////////////////////////////////////////////////////////

// Deterministic well-distributed hash of an integer lattice index to [0, 1).
// Murmur3 finalizer — adjacent integers produce uncorrelated outputs.
function noiseHash(i)
{
    let h = (i | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 2**32;
}

/** 1D gradient noise — returns a smooth value in [0, 1] for any real x.
 *  Integer inputs land on deterministic lattice values; non-integer inputs
 *  are interpolated with smoothStep for C1 continuity.
 *  @param {number} x
 *  @return {number}
 *  @memberof Utilities */
function noise1D(x)
{
    const i = floor(x);
    return lerp(noiseHash(i), noiseHash(i + 1), smoothStep(x - i));
}

/** 2D gradient noise — returns a smooth value in [0, 1] for any real (x, y).
 *  @param {number} x
 *  @param {number} y
 *  @return {number}
 *  @memberof Utilities */
function noise2D(x, y)
{
    const ix = floor(x), iy = floor(y);
    const fx = smoothStep(x - ix), fy = smoothStep(y - iy);
    // large prime decorrelates neighboring rows
    const h = (a, b) => noiseHash(a + b * 374761393);
    return lerp(
        lerp(h(ix,     iy    ), h(ix + 1, iy    ), fx),
        lerp(h(ix,     iy + 1), h(ix + 1, iy + 1), fx),
        fy);
}
/**
 * LittleJS Engine Settings
 * - All settings for the engine are here
 * @namespace Settings
 */

///////////////////////////////////////////////////////////////////////////////
// Camera settings

/** Position of camera in world space
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let cameraPos = vec2();

/** Rotation angle of camera in world space
 *  @type {number}
 *  @default
 *  @memberof Settings */
let cameraAngle = 0;

/** Scale of camera in world space
 *  @type {number}
 *  @default
 *  @memberof Settings */
let cameraScale = 32;

///////////////////////////////////////////////////////////////////////////////
// Time settings

/** Scale applied to engine time, can be used for slow motion or fast forward
 *  - 1 is normal speed, 2 is double speed, 0.5 is half speed
 *  - 0 freezes the simulation without setting the paused flag
 *  - Should be >= 0; stacks multiplicatively with the debug +/- shortcut
 *  @type {number}
 *  @default
 *  @memberof Settings */
let timeScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Display settings

/** Enable applying color to tiles when using canvas2d
 *  - This is slower but should be the same as WebGL rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasColorTiles = true;

/** Color to clear the canvas to before render, does not clear if alpha is 0
 *  @type {Color}
 *  @memberof Settings */
let canvasClearColor = CLEAR_BLACK;

/** The max size of the canvas in css pixels, centered if window is larger
 *  - Not affected by canvasPixelRatio, the backing store may be larger than this
 *  @type {Vector2}
 *  @default Vector2(3840,2160)
 *  @memberof Settings */
let canvasMaxSize = vec2(3840, 2160);

/** Minimum aspect ratio of the canvas (width/height), unused if 0
 *  Can be used with canvasMaxAspect to limit aspect ratio
 *  @type {number}
 *  @default
 *  @memberof Settings */
let canvasMinAspect = 0;

/** Maximum aspect ratio of the canvas (width/height), unused if 0
 *  Can be used with canvasMinAspect to limit aspect ratio
 *  @type {number}
 *  @default
 *  @memberof Settings */
let canvasMaxAspect = 0;

/** Fixed size of the canvas in css pixels, if enabled canvas size never changes
 * - you may also need to set mainCanvasSize if using screen space coords in startup
 * - canvasPixelRatio still applies, it only scales the backing store
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let canvasFixedSize = vec2();

/** Use nearest canvas scaling for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasPixelated = false;

/** Disables texture filtering for crisper pixel art
 *  - Leave true for pixel art so sprites stay sharp when scaled (uses NEAREST filtering)
 *  - Set false for smooth/high-resolution art to enable bilinear filtering and mipmaps
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let tilesPixelated = true;

/** Scale factor applied to the canvas resolution for sharper rendering
 *  Pass 1 for no scaling, a number for an explicit ratio, or undefined to track devicePixelRatio each frame.
 *  - Only the backing store scales, so this changes sharpness and nothing else
 *  - mainCanvasSize, cameraScale, mousePos and screen space stay in css pixels,
 *    so the same code draws the same size at any ratio
 *  - Pixel art usually looks best left at 1 or set to whole numbers,
 *    a fractional ratio samples texels unevenly
 *  @type {number|undefined}
 *  @default
 *  @memberof Settings */
let canvasPixelRatio = 1;

/** Default font used for text rendering
 *  @type {string}
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

/** Enable to show the LittleJS splash screen on startup
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let showSplashScreen = false;

/** Disables all rendering, audio, and input for servers
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let headlessMode = false;

/** Disables the automatic requestAnimationFrame loop so the engine only
 *  advances when engineStep is called, for tests and frame-stepping tools
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let engineManualStep = false;

///////////////////////////////////////////////////////////////////////////////
// WebGL settings

/** Enable WebGL accelerated rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let glEnable = true;

/** How many sided poly to use when drawing circles and ellipses with WebGL
 *  @type {number}
 *  @default
 *  @memberof Settings */
let glCircleSides = 32;

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2}
 *  @default Vector2(16,16)
 *  @memberof Settings */
let tileDefaultSize = vec2(16);

/** Default padding pixels around tiles
 *  @type {number}
 *  @default
 *  @memberof Settings */
let tileDefaultPadding = 0;

/** Default amount of pixels smaller to draw tiles to prevent neighbor bleeding
 *  @type {number}
 *  @default
 *  @memberof Settings */
let tileDefaultBleed = 0;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Enable physics solver for collisions between objects
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = true;

/** Default object mass for collision calculations (how heavy objects are)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = 1;

/** How much to slow angular velocity each frame (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = 1;

/** How much to bounce when a collision occurs (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultRestitution = 0;

/** How much to slow when touching (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects, negative Y is down
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
let gravity = vec2();

/** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let particleEmitRateScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadsEnable = true;

/** If true, the dpad input is also routed to the left analog stick (for better accessibility)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadDirectionEmulateStick = true;

/** If true, axes that do not rest near center are ignored on gamepads without
 *  standard mapping. Steering wheels and flight sticks report pedal and throttle
 *  axes that rest at full deflection, which otherwise reads as a stick held down.
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadAxisFilterEnable = true;

/** If true the WASD keys are also routed to the direction keys (for better accessibility)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let inputWASDEmulateDirection = true;

/** True if touch input is enabled for mobile devices
 *  - Touch events will be routed to mouse events
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchInputEnable = true;

/** True if touch gamepad should appear on mobile devices
 *  - Supports left analog stick, 4 face buttons and start button (button 9)
 *  - setTouchGamepadButtonCount(1) to use face buttons as right analog stick
 *  - Analog stick buttons 10 and 11 are also activated when virtual sticks are touched
 *  - Rendered as a full-viewport HTML/SVG overlay, so controls may sit outside the game canvas
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = false;

/** True if touches outside the gamepad controls should still drive mouse/touch input
 *  - When false (the default), enabling the touch gamepad suppresses touch-to-mouse input entirely
 *  - Set true to also pass touches outside the controls through to the game as mouse/touch input
 *  - Touches on the gamepad controls never drive the mouse regardless of this setting
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadPassthrough = false;

/** Size of center button if touch gamepad should have start button in the center
 *  - Prevents activating when pressed near virtual stick or face buttons
 *  - When the game is paused, any touch will press the button
 *  - Measured in viewport CSS pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadCenterButtonSize = 0;

/** Number of buttons on the right side of the touch gamepad (0-4), using gamepad buttons 0-3
 *  - A count of 1 is a single large button (the size of a stick)
 *  - Ignored when touchGamepadRightStick is set (the right side is a stick instead)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadButtonCount = 4;

/** True if the touch gamepad should have a left analog stick (or dpad)
 *  - When false, the left side is face buttons (touchGamepadLeftButtonCount) or nothing
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadLeftStick = true;

/** Number of buttons on the left side of the touch gamepad (0-4), using gamepad buttons 4-7
 *  - Only used when touchGamepadLeftStick is false (otherwise the left side is a stick)
 *  - A count of 1 is a single large button (the size of a stick)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadLeftButtonCount = 0;

/** True if the touch gamepad right side should be an analog stick (or dpad) instead of face buttons
 *  - When set, touchGamepadButtonCount is ignored and the right side is a stick
 *  - Uses an analog stick when touchGamepadAnalog is true, otherwise an 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadRightStick = false;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = true;

/** True if touch gamepad directional controls should float to where you press
 *  - Only affects analog sticks and dpads, not face buttons
 *  - Directional controls re-anchor to where you press within the bottom ~60% of their screen half; the top ~40% passes through to the game
 *  - The right side floats only when it acts as the right analog stick (touchGamepadRightStick is set)
 *  - A center button (touchGamepadCenterButtonSize) still works since it ignores touches near the sticks
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadFloating = false;

/** Size of virtual gamepad for touch devices in viewport CSS pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 100;

/** Transparency of touch gamepad overlay
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

/** How long to display the touch gamepad on screen in seconds, set to 0 to always display
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadDisplayTime = 3;

/** Duration in ms to vibrate when a touch gamepad face button or start button is pressed
 *  - Set to 0 to disable, also requires vibrateEnable and hardware support (ignored on iOS)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadVibration = 0;

/** Allow vibration hardware if it exists
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let vibrateEnable = true;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** All audio code can be disabled and removed from build
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let soundEnable = true;

/** Volume scale to apply to all sound, music and speech
 *  Use setSoundVolume to also update the audio master gain immediately
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundVolume = .3;

/** Default range where sound no longer plays
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundDefaultRange = 40;

/** Default range percent to start tapering off sound (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundDefaultTaper = .7;

/** Pause all sound while the page is hidden, and pick up where it was when it shows again
 *  - A hidden page stops the game, so without this a looping sound plays on over a frozen game
 *  - Turn it off to keep music playing in a background tab
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let soundPauseWhenHidden = true;

///////////////////////////////////////////////////////////////////////////////
// Setters for global variables

/** Set position of camera in world space
 *  @param {Vector2} pos
 *  @memberof Settings */
function setCameraPos(pos) { cameraPos = pos.copy(); }

/** Set angle of camera in world space
 *  @param {number} angle
 *  @memberof Settings */
function setCameraAngle(angle) { cameraAngle = angle; }

/** Set scale of camera in world space
 *  @param {number} scale
 *  @memberof Settings */
function setCameraScale(scale) { cameraScale = scale; }

/** Set scale applied to engine time
 *  @param {number} scale
 *  @memberof Settings */
function setTimeScale(scale) { timeScale = scale; }

/** Set if tiles should be colorized when using canvas2d
 *  This can be slower but results should look nearly identical to WebGL rendering
 *  It can be enabled/disabled at any time
 *  Optimized for performance, and will use faster method if color is white or untextured
 *  @param {boolean} colorTiles
 *  @memberof Settings */
function setCanvasColorTiles(colorTiles) { canvasColorTiles = colorTiles; }

/** Set color to clear the canvas to before render, does not clear if alpha is 0
 *  @param {Color} color
 *  @memberof Settings */
function setCanvasClearColor(color) { canvasClearColor = color.copy(); }

/** Set max size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasMaxSize(size) { canvasMaxSize = size.copy(); }

/** Set minimum aspect ratio of the canvas (width/height), unused if 0
 *  @param {number} aspect
 *  @memberof Settings */
function setCanvasMinAspect(aspect) { canvasMinAspect = aspect; }

/** Set maximum aspect ratio of the canvas (width/height), unused if 0
 *  @param {number} aspect
 *  @memberof Settings */
function setCanvasMaxAspect(aspect) { canvasMaxAspect = aspect; }

/** Set fixed size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasFixedSize(size) { canvasFixedSize = size.copy(); }

/** Use nearest scaling algorithm for canvas for more pixelated look
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setCanvasPixelated(pixelated)
{
    canvasPixelated = pixelated;
    if (mainCanvas)
        mainCanvas.style.imageRendering = pixelated ? 'pixelated' : '';
    if (glCanvas)
        glCanvas.style.imageRendering = pixelated ? 'pixelated' : '';
}

/** Disables texture filtering for crisper pixel art
 *  - Leave true for pixel art; set false for smooth/high-resolution art
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setTilesPixelated(pixelated) { tilesPixelated = pixelated; }

/** Set the canvas pixel ratio, scales the render resolution for sharper output
 *  Pass a number for an explicit ratio, or call with no argument to track devicePixelRatio each frame.
 *  - The canvas stays the same size on screen and everything draws the same
 *    size, it just renders at a higher resolution so nothing looks blurry
 *  - Game code is unaffected, it always works in css pixels
 *  @param {number} [pixelRatio]
 *  @example
 *  // render at native resolution, capped so phones don't pay for 3x
 *  setCanvasPixelRatio(min(devicePixelRatio, 2));
 *  @memberof Settings */
function setCanvasPixelRatio(pixelRatio) { canvasPixelRatio = pixelRatio; }

/** Get the pixel ratio currently applied to the canvas backing store
 *  - Resolves canvasPixelRatio, falling back to devicePixelRatio when it is undefined
 *  - Game code works in css pixels so this is rarely needed, it is for sizing
 *    render targets and viewports that must match the backing store
 *  @return {number}
 *  @memberof Settings */
function getCanvasPixelRatio() { return canvasPixelRatio ?? (devicePixelRatio || 1); }

/** Set default font used for text rendering
 *  @param {string} font
 *  @memberof Settings */
function setFontDefault(font) { fontDefault = font; }

/** Set if the LittleJS splash screen should be shown on startup
 *  @param {boolean} show
 *  @memberof Settings */
function setShowSplashScreen(show) { showSplashScreen = show; }

/** Set to disable rendering, audio, and input for servers
 *  @param {boolean} headless
 *  @memberof Settings */
function setHeadlessMode(headless) { headlessMode = headless; }

/** Set if the engine only advances when engineStep is called
 *  Must be set before engineInit
 *  @param {boolean} [enable]
 *  @memberof Settings */
function setEngineManualStep(enable=true) { engineManualStep = enable; }

/** Set if WebGL rendering is enabled
 *  @param {boolean} enable
 *  @memberof Settings */
function setGLEnable(enable)
{
    if (enable && !glCanBeEnabled)
    {
        console.warn('Can not enable WebGL if it was disabled on start.');
        return;
    }
    glEnable = enable;
    if (glCanvas) // hide glCanvas if WebGL is disabled
        glCanvas.style.display = enable ? '' : 'none';
}

/** Set how many sided polygons to use when drawing circles and ellipses with WebGL
 *  @param {number} sides
 *  @memberof Settings */
function setGLCircleSides(sides) { glCircleSides = sides; }

/** Set default size of tiles in pixels
 *  @param {Vector2} size
 *  @memberof Settings */
function setTileDefaultSize(size) { tileDefaultSize = size.copy(); }

/** Default padding pixels around tiles
 *  @param {number} padding
 *  @memberof Settings */
function setTileDefaultPadding(padding) { tileDefaultPadding = padding; }

/** Default amount of pixels smaller to draw tiles to prevent neighbor bleeding
 *  @param {number} bleed
 *  @memberof Settings */
function setTileDefaultBleed(bleed) { tileDefaultBleed = bleed; }

/** Set if collisions between objects are enabled
 *  @param {boolean} enable
 *  @memberof Settings */
function setEnablePhysicsSolver(enable) { enablePhysicsSolver = enable; }

/** Set default object mass for collision calculations
 *  @param {number} mass
 *  @memberof Settings */
function setObjectDefaultMass(mass) { objectDefaultMass = mass; }

/** Set how much to slow velocity by each frame
 *  @param {number} damp
 *  @memberof Settings */
function setObjectDefaultDamping(damp) { objectDefaultDamping = damp; }

/** Set how much to slow angular velocity each frame
 *  @param {number} damp
 *  @memberof Settings */
function setObjectDefaultAngleDamping(damp) { objectDefaultAngleDamping = damp; }

/** Set how much to bounce when a collision occurs
 *  @param {number} restitution
 *  @memberof Settings */
function setObjectDefaultRestitution(restitution) { objectDefaultRestitution = restitution; }

/** Set how much to slow when touching
 *  @param {number} friction
 *  @memberof Settings */
function setObjectDefaultFriction(friction) { objectDefaultFriction = friction; }

/** Set max speed to avoid fast objects missing collisions
 *  @param {number} speed
 *  @memberof Settings */
function setObjectMaxSpeed(speed) { objectMaxSpeed = speed; }

/** Set how much gravity to apply to objects
 *  @param {Vector2} newGravity
 *  @memberof Settings */
function setGravity(newGravity) { gravity = newGravity.copy(); }

/** Set to scales emit rate of particles
 *  @param {number} scale
 *  @memberof Settings */
function setParticleEmitRateScale(scale) { particleEmitRateScale = scale; }

/** Set if gamepads are enabled
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadsEnable(enable) { gamepadsEnable = enable; }

/** Set if the dpad input is also routed to the left analog stick
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadDirectionEmulateStick(enable) { gamepadDirectionEmulateStick = enable; }

/** Set if axes that do not rest near center are ignored on non-standard gamepads
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadAxisFilterEnable(enable) { gamepadAxisFilterEnable = enable; }

/** Set if true the WASD keys are also routed to the direction keys
 *  @param {boolean} enable
 *  @memberof Settings */
function setInputWASDEmulateDirection(enable) { inputWASDEmulateDirection = enable; }

/** Set if touch input is allowed
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchInputEnable(enable) { touchInputEnable = enable; }

/** Set if touch gamepad should appear on mobile devices
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadEnable(enable) { touchGamepadEnable = enable; }

/** Set if touches outside the gamepad controls should still drive mouse/touch input
 *  @param {boolean} passthrough
 *  @memberof Settings */
function setTouchGamepadPassthrough(passthrough) { touchGamepadPassthrough = passthrough; }

/** Set if touch gamepad should have start button in the center
 *  - Set size to enable the center button
 *  - When the game is paused, any touch will press the button
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadCenterButtonSize(size) { touchGamepadCenterButtonSize = size; }

/** Set number of buttons on the right side of the touch gamepad (0-4, gamepad buttons 0-3)
 *  @param {number} count
 *  @memberof Settings */
function setTouchGamepadButtonCount(count)
{
    touchGamepadButtonCount = count;
    if (count > 0)
        touchGamepadRightStick = false;
}

/** Set if the touch gamepad should have a left analog stick (or dpad)
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadLeftStick(enable)
{
    touchGamepadLeftStick = enable;
    if (enable)
        touchGamepadLeftButtonCount = 0;
}

/** Set number of buttons on the left side of the touch gamepad (0-4, gamepad buttons 4-7)
 *  - Only used when touchGamepadLeftStick is false
 *  @param {number} count
 *  @memberof Settings */
function setTouchGamepadLeftButtonCount(count)
{
    touchGamepadLeftButtonCount = count;
    if (count > 0)
        touchGamepadLeftStick = false;
}

/** Set if the touch gamepad right side is an analog stick (or dpad) instead of face buttons
 *  @param {boolean} rightStick
 *  @memberof Settings */
function setTouchGamepadRightStick(rightStick)
{
    touchGamepadRightStick = rightStick;
    if (rightStick)
        touchGamepadButtonCount = 0;
}

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set if touch gamepad directional controls should float to where you press
 *  @param {boolean} floating
 *  @memberof Settings */
function setTouchGamepadFloating(floating) { touchGamepadFloating = floating; }

/** Set size of virtual gamepad for touch devices in pixels
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

/** Set how long to display the touch gamepad on screen in seconds, set to 0 to always display
 *  @param {number} time
 *  @memberof Settings */
function setTouchGamepadDisplayTime(time) { touchGamepadDisplayTime = time; }

/** Set duration in ms to vibrate when a touch gamepad face or start button is pressed (0 disables)
 *  @param {number} ms
 *  @memberof Settings */
function setTouchGamepadVibration(ms) { touchGamepadVibration = ms; }

/** Set to allow vibration hardware if it exists
 *  @param {boolean} enable
 *  @memberof Settings */
function setVibrateEnable(enable) { vibrateEnable = enable; }

/** Set to disable all audio code
 *  @param {boolean} enable
 *  @memberof Settings */
function setSoundEnable(enable) { soundEnable = enable; }

/** Set volume scale to apply to all sound, music and speech
 *  @param {number} volume
 *  @memberof Settings */
function setSoundVolume(volume)
{
    soundVolume = volume;
    if (soundEnable && !headlessMode && audioMasterGain)
        audioMasterGain.gain.value = volume; // update gain immediately
}

/** Set default range where sound no longer plays
 *  @param {number} range
 *  @memberof Settings */
function setSoundDefaultRange(range) { soundDefaultRange = range; }

/** Set default range percent to start tapering off sound
 *  @param {number} taper
 *  @memberof Settings */
function setSoundDefaultTaper(taper) { soundDefaultTaper = taper; }

/** Set if all sound pauses while the page is hidden
 *  @param {boolean} pause
 *  @memberof Settings */
function setSoundPauseWhenHidden(pause) { soundPauseWhenHidden = pause; }

/** Set if watermark with FPS should be shown
 *  @param {boolean} show
 *  @memberof Debug */
function setDebugWatermark(show) { debugWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {string} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }
/**
 * LittleJS Object System
 * - EngineObject is the base class for all game objects
 * - Handles automatic updating, rendering, physics, and collision
 * - Supports parent-child hierarchies with transform inheritance
 * - 2D physics with velocity, acceleration, damping, and gravity
 * - Collision system with tiles and other objects
 * - Renders sprites from tile sheets with color and rotation
 * - Objects sorted by renderOrder for layered rendering
 */

/**
 * LittleJS Object Base Object Class
 * - Top level object class used by the engine
 * - Automatically adds self to object list
 * - Will be updated and rendered each frame
 * - Renders as a sprite from a tilesheet by default
 * - Can have color and additive color applied
 * - 2D Physics and collision system
 * - Sorted by renderOrder
 * - Objects can have children attached
 * - Parents are updated before children, and set child transform
 * - Call destroy() to get rid of objects
 *
 * The physics system used by objects is simple and fast with some caveats...
 * - Collision uses the axis aligned size, the object's rotation angle is only for rendering
 * - Objects are guaranteed to not intersect tile collision from physics
 * - If an object starts or is moved inside tile collision, it will not collide with that tile
 * - Collision for objects can be set to be solid to block other objects
 * - Objects may get pushed into overlapping other solid objects, if so they will push away
 * - Solid objects are more performance intensive and should be used sparingly
 * @memberof Engine
 * @example
 * // create an engine object, normally you would first extend the class with your own
 * const pos = vec2(2,3);
 * const object = new EngineObject(pos);
 */
class EngineObject
{
    /** Create an engine object and adds it to the list of objects
     *  @param {Vector2}  [pos=vec2()] - World space position of the object
     *  @param {Vector2}  [size=vec2(1)] - World space size of the object
     *  @param {TileInfo} [tileInfo] - Tile info to render object (undefined is untextured)
     *  @param {number}   [angle] - Angle the object is rotated by
     *  @param {Color}    [color=WHITE] - Color to apply to tile when rendered
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder before being rendered
     */
    constructor(pos=vec2(), size=vec2(1), tileInfo, angle=0, color=WHITE, renderOrder=0)
    {
        // check passed in params
        ASSERT(isVector2(pos), 'object pos must be a vec2');
        ASSERT(isVector2(size), 'object size must be a vec2');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo, 'object tileInfo should be a TileInfo or undefined');
        ASSERT(typeof angle === 'number' && isFinite(angle), 'object angle should be a number');
        ASSERT(isColor(color), 'object color should be a valid rgba color');
        ASSERT(typeof renderOrder === 'number', 'object renderOrder should be a number');

        /** @property {Vector2} - World space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - World space width and height of the object */
        this.size = size.copy();
        /** @property {Vector2} - Size of object used for drawing, uses size if not set */
        this.drawSize = undefined;
        /** @property {TileInfo} - Tile info to render object (undefined is untextured) */
        this.tileInfo = tileInfo;
        /** @property {number} - Angle to rotate the object */
        this.angle = angle;
        /** @property {Color} - Color to apply when rendered */
        this.color = color.copy();
        /** @property {Color} - Additive color to apply when rendered */
        this.additiveColor = undefined;
        /** @property {Shader|undefined} - Custom shader to render with, undefined for the engine's own
         *  @type {Shader|undefined} */
        this.shader = undefined;
        /** @property {boolean} - Should the rendered tile flip along the y axis. Affects rendering and the local→world transform of attached children (a mirrored parent flips its children's localPos.x and localAngle). Does not affect this object's own physics, collision, or localToWorld/worldToLocal. */
        this.mirror = false;
        /** @property {boolean} - Has object been destroyed? */
        this.destroyed = false;

        // physical properties
        /** @property {number} - How heavy the object is, static if 0 */
        this.mass = objectDefaultMass;
        /** @property {number} - How much to slow down velocity each frame (0-1) */
        this.damping = objectDefaultDamping;
        /** @property {number} - How much to slow down rotation each frame (0-1) */
        this.angleDamping = objectDefaultAngleDamping;
        /** @property {number} - How bouncy the object is when colliding (0-1) */
        this.restitution = objectDefaultRestitution;
        /** @property {number} - How much friction to apply when sliding (0-1) */
        this.friction  = objectDefaultFriction;
        /** @property {number} - How much to scale gravity by for this object */
        this.gravityScale = 1;
        /** @property {number} - Objects are sorted by render order */
        this.renderOrder = renderOrder;
        /** @property {Vector2} - Velocity of the object */
        this.velocity = vec2();
        /** @property {number} - Angular velocity of the object */
        this.angleVelocity = 0;
        /** @property {number} - Track when object was created  */
        this.spawnTime = time;
        /** @property {Array<EngineObject>} - List of children of this object */
        this.children = [];
        /** @property {boolean} - Limit object speed along x and y axis */
        this.clampSpeed = true;
        /** @property {EngineObject} - Object we are standing on, if any  */
        this.groundObject = undefined;

        // parent child system
        /** @property {EngineObject} - Parent of object if in local space  */
        this.parent = undefined;
        /** @property {Vector2} - Local position if child */
        this.localPos = vec2();
        /** @property {number} - Local angle if child  */
        this.localAngle = 0;

        // collision flags
        /** @property {boolean} - Object collides with the tile collision */
        this.collideTiles = false;
        /** @property {boolean} - Object collides with solid objects */
        this.collideSolidObjects = false;
        /** @property {boolean} - Object collides with and blocks other objects */
        this.isSolid = false;
        /** @property {boolean} - Object collides with raycasts */
        this.collideRaycast = false;

        /** @property {boolean} - Object is skipped by engineObjectsDestroy, for things that outlive a level like a camera
         *  - Calling destroy on it still destroys it, and its children go with it either way */
        this.persistent = false;

        // add to list of objects
        engineObjects.push(this);
    }

    /** Update the object transform, called automatically by engine even when paused */
    updateTransforms()
    {
        const parent = this.parent;
        if (parent)
        {
            // compose with parent transform inline to avoid intermediate vector allocs
            const mirror = parent.getMirrorSign();
            const lp = this.localPos, pp = parent.pos;
            const lx = lp.x*mirror, ly = lp.y, pa = parent.angle;
            if (pa)
            {
                const c = cos(-pa), s = sin(-pa);
                this.pos.set(lx*c - ly*s + pp.x, lx*s + ly*c + pp.y);
            }
            else
                this.pos.set(lx + pp.x, ly + pp.y);
            this.angle = mirror*this.localAngle + pa;
        }

        // update children
        for (const child of this.children)
            child.updateTransforms();
    }

    /** Update the object physics, called automatically by engine once each frame. Can be overridden to stop or change how physics works for an object. */
    updatePhysics()
    {
        // child objects do not have physics
        ASSERT(!this.parent);

        // bail if a collision callback destroyed us mid-frame
        if (this.destroyed) return;

        if (this.clampSpeed)
        {
            // limit max speed to prevent missing collisions
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);

        // apply physics; only the solver needs where the object was, so only then is it copied
        const solve = enablePhysicsSolver && this.mass;
        const oldPos = solve ? this.pos.copy() : undefined;
        this.velocity.x *= this.damping;
        this.velocity.y *= this.damping;
        if (this.mass)
        {
            // apply gravity only if it has mass
            this.velocity.x += gravity.x * this.gravityScale;
            this.velocity.y += gravity.y * this.gravityScale;
        }
        this.pos.x += this.velocity.x;
        this.pos.y += this.velocity.y;
        this.angle += this.angleVelocity *= this.angleDamping;

        // don't do collision for static objects or if solver disabled
        if (!solve) return;

        const wasFalling = this.velocity.y < 0 && gravity.y < 0 || this.velocity.y > 0 && gravity.y > 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const friction = max(this.friction, this.groundObject.friction);
            const groundSpeed = this.groundObject.velocity.x;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * friction;
            this.groundObject = undefined;
        }

        // an object with no width or height has no box to push out of, or to be pushed out of
        if (this.collideSolidObjects && this.size.x && this.size.y)
        {
            // check collisions against solid objects
            const epsilon = .001; // necessary to push slightly outside of the collision
            for (const o of engineObjectsCollide)
            {
                // skip destroyed, child objects, self collision, or objects with no box
                if (o.destroyed || o.parent || o === this || !o.size.x || !o.size.y) continue;

                // non solid objects don't collide with each other
                if (!this.isSolid && !o.isSolid) continue;

                // check collision
                if (!this.isOverlappingObject(o)) continue;

                // notify objects of collision and check if should be resolved
                const collide1 = this.collideWithObject(o);
                const collide2 = o.collideWithObject(this);
                if (!collide1 || !collide2) continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001;
                    const velocity = length < .001 ? vec2(0,1) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away other object if not fixed
                        o.velocity = o.velocity.subtract(velocity);

                    debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sizeBoth = this.size.add(o.size);
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sizeBoth.y + gravity.y; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sizeBoth.y;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sizeBoth.x;
                const restitution = max(this.restitution, o.restitution);

                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sizeBoth.y/2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if ((o.groundObject && wasFalling) || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasFalling)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -restitution;
                    }
                    else if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.y + o.mass * o.velocity.y) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.y * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.y * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.y * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.y * 2 * this.mass / (this.mass + o.mass);

                        // lerp between elastic or inelastic based on restitution
                        this.velocity.y = lerp(inelastic, elastic0, restitution);
                        o.velocity.y = lerp(inelastic, elastic1, restitution);
                    }
                }
                if (!smallStepUp && isBlockedX) // resolve x collision
                {
                    // push outside collision
                    this.pos.x = o.pos.x + (sizeBoth.x/2 + epsilon) * sign(oldPos.x - o.pos.x);
                    if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.x + o.mass * o.velocity.x) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.x * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.x * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.x * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.x * 2 * this.mass / (this.mass + o.mass);

                        // lerp between elastic or inelastic based on restitution
                        this.velocity.x = lerp(inelastic, elastic0, restitution);
                        o.velocity.x = lerp(inelastic, elastic1, restitution);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -restitution;
                }
                debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            const hitLayer = tileCollisionTest(this.pos, this.size, this);
            if (hitLayer)
            {
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedX = tileCollisionTest(vec2(this.pos.x, oldPos.y), this.size, this);
                    const isBlockedY = tileCollisionTest(vec2(oldPos.x, this.pos.y), this.size, this);
                    const restitution = max(this.restitution, hitLayer.restitution);
                    if (isBlockedX)
                    {
                        // try to step over a 1-tile bump (direction follows gravity sign
                        // so inverted gravity steps down off a ceiling bump instead of up;
                        // zero gravity defaults to the normal-gravity step-up direction)
                        const epsilon = 1e-3;
                        const maxMove = .1;
                        const gravitySign = gravity.y > 0 ? -1 : 1;
                        const y = gravitySign > 0 ?
                            floor(oldPos.y-this.size.y/2+1) + this.size.y/2 + epsilon :
                            ceil( oldPos.y+this.size.y/2-1) - this.size.y/2 - epsilon;
                        const delta = abs(y - this.pos.y);
                        if (delta < maxMove)
                        if (!tileCollisionTest(vec2(this.pos.x, y), this.size, this))
                        {
                            this.pos.y = y;
                            debugPhysics && debugRect(this.pos, this.size, '#ff0');
                            return;
                        }

                        // move to previous X position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -restitution;
                    }
                    if (isBlockedY || !isBlockedX)
                    {
                        if (wasFalling)
                        {
                            // adjust position to slightly away from nearest tile
                            // this prevents gap between object and ground
                            const epsilon = .0001;
                            const offset = this.size.y/2 + epsilon;
                            this.pos.y = gravity.y < 0 ?
                                floor(oldPos.y-this.size.y/2) + offset :
                                ceil( oldPos.y+this.size.y/2) - offset;

                            // set ground object for tile collision
                            this.groundObject = hitLayer;
                        }
                        else
                        {
                            // move to previous Y position
                            this.pos.y = oldPos.y;
                            this.groundObject = undefined;
                        }
                        // bounce velocity
                        this.velocity.y *= -restitution;
                    }
                    debugPhysics && debugRect(this.pos, this.size, '#f00');
                }
            }
        }
    }

    /** Update the object, called automatically by engine once each frame. Does nothing by default. */
    update() {}

    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileInfo, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Optional hook called during the light system plugin's lightmap pass to draw this object's lightmap contribution. Does nothing by default. */
    renderLight() {}

    /** Destroy this object, destroy its children, detach its parent, and mark it for removal
     *  @param {boolean} [immediate] - should attached effects be allowed to die off? */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        // disconnect from parent and destroy children
        this.destroyed = true;
        this.parent?.removeChild(this);
        for (const child of this.children)
        {
            child.parent = undefined;
            child.destroy(immediate);
        }
    }

    /** Convert from local space to world space
     *  @param {Vector2} pos - local space point */
    localToWorld(pos) { return this.pos.add(pos.rotate(this.angle)); }

    /** Convert from world space to local space
     *  @param {Vector2} pos - world space point */
    worldToLocal(pos) { return pos.subtract(this.pos).rotate(-this.angle); }

    /** Convert from local space to world space for a vector (rotation only)
     *  @param {Vector2} vec - local space vector */
    localToWorldVector(vec) { return vec.rotate(this.angle); }

    /** Convert from world space to local space for a vector (rotation only)
     *  @param {Vector2} vec - world space vector */
    worldToLocalVector(vec) { return vec.rotate(-this.angle); }

    /** Called to check if a tile collision should be resolved. Return true for physics to resolve the collision or false to ignore and resolve it manually.
     *  @param {number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - tile where the collision occurred
     *  @return {boolean} - true if the collision should be resolved by modifying it's position and velocity */
    collideWithTile(tileData, pos) { return tileData > 0; }

    /** Called by the engine to check if an object collision should be resolved. Return true for physics to resolve the collision or false to ignore and resolve it manually.
     *  @param {EngineObject} object - the object to test against
     *  @param {Object} [push] - what it would take to move this object clear, a Vector3 from the 3D plugin, undefined in 2D
     *  @return {boolean} - true if the collision should be resolved by modifying it's position and velocity
     */
    collideWithObject(object, push) { return true; }

    /** Get this object's up vector
     *  @param {number} [scale] - length of the vector
     *  @return {Vector2} */
    getUp(scale=1) { return vec2().setAngle(this.angle, scale); }

    /** Get this object's right vector
     *  @param {number} [scale] - length of the vector
     *  @return {Vector2} */
    getRight(scale=1) { return vec2().setAngle(this.angle+PI/2, scale); }

    /** How long since the object was created
     *  @return {number} */
    getAliveTime() { return time - this.spawnTime; }

    /** Get the speed of this object
     *  @return {number} */
    getSpeed() { return this.velocity.length(); }

    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    applyAcceleration(acceleration)
    { if (this.mass) this.velocity = this.velocity.add(acceleration); }

    /** Apply angular acceleration to this object
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    { if (this.mass) this.angleVelocity += acceleration; }

    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    applyForce(force)
    { if (this.mass) this.applyAcceleration(force.scale(1/this.mass)); }

    /** Get the direction of the mirror
     *  @return {number} -1 if this.mirror is true, or 1 if not mirrored */
    getMirrorSign() { return this.mirror ? -1 : 1; }

    /** Attaches a child to this with a local transform, returns child for chaining
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=vec2()]
     *  @param {number}       [localAngle]
     *  @return {EngineObject} The child object added */
    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!this.destroyed, 'cannot add child to destroyed object');
        if (this.destroyed) return child;
        ASSERT(!child.parent && !this.children.includes(child));
        ASSERT(child instanceof EngineObject, 'child must be an EngineObject');
        ASSERT(child !== this, 'cannot add self as child');
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
        child.updateTransforms();
        return child;
    }

    /** Removes a child from this one
     *  @param {EngineObject} child */
    removeChild(child)
    {
        ASSERT(child.parent === this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = undefined;
    }

    /** Check if overlapping another engine object
     *  Collisions are resolved to prevent overlaps
     *  @param {EngineObject} object
     *  @return {boolean} */
    isOverlappingObject(object)
    { return this.isOverlapping(object.pos, object.size); }

    /** Check if overlapping a point or aligned bounding box
     *  @param {Vector2} pos          - Center of box
     *  @param {Vector2} [size=vec2()] - Size of box, uses a point if undefined
     *  @return {boolean} */
    isOverlapping(pos, size=vec2())
    { return isOverlapping(this.pos, this.size, pos, size); }

    /** Set how this object collides
     *  @param {boolean} [collideSolidObjects] - Does it collide with solid objects?
     *  @param {boolean} [isSolid]             - Does it collide with and block other objects? (expensive in large numbers)
     *  @param {boolean} [collideTiles]        - Does it collide with the tile collision?
     *  @param {boolean} [collideRaycast]      - Does it collide with raycasts? */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=true, collideRaycast=true)
    {
        ASSERT(collideSolidObjects || !isSolid, 'solid objects must be set to collide');

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
        this.collideRaycast = collideRaycast;
    }

    /** Returns string containing info about this object for debugging
     *  @return {string} */
    toString()
    {
        let text = 'type = ' + this.constructor.name;
        if (this.pos.x || this.pos.y)
            text += '\npos = ' + this.pos;
        if (this.velocity.x || this.velocity.y)
            text += '\nvelocity = ' + this.velocity;
        if (this.size.x || this.size.y)
            text += '\nsize = ' + this.size;
        if (this.angle)
            text += '\nangle = ' + this.angle.toFixed(3);
        if (this.color)
            text += '\ncolor = ' + this.color;
        return text;
    }

    /** Render debug info for this object  */
    renderDebugInfo()
    {
        if (!debug) return;

        // check if there is anything to show
        const hasPhysics = this.collideTiles || this.collideSolidObjects || this.isSolid;
        if (!hasPhysics && !this.parent) return;

        // show object info for debugging
        const size = vec2(max(this.size.x, .2), max(this.size.y, .2));
        const color = rgb(this.collideTiles?1:0, this.collideSolidObjects?1:0, this.isSolid?1:0, .5);
        debugRect(this.pos, size, color, 0, this.angle, hasPhysics);
        if (this.parent)
            debugRect(this.pos, size.scale(.8), rgb(1,1,1,.5), 0, this.angle);
        this.parent && debugLine(this.pos, this.parent.pos, rgb(1,1,1,.5), .5);
    }
}
/**
 * LittleJS Drawing System
 * - Hybrid rendering with both Canvas2D and WebGL support
 * - Optimized tile sheet sprite rendering using WebGL batching
 * - Primitive drawing for polygons, ellipses, and lines
 * - Tile-based rendering with TileInfo and TextureInfo classes
 * - Text rendering with custom fonts and ImageFont support
 * - Color and additive color blending for effects
 * - Rotation, mirroring, and scaling transformations
 * - Camera system with position, scale, and rotation
 * - Multiple canvas support (main, WebGL, work canvases)
 * - Gradient fills and outlined shapes
 * - Image manipulation and color tinting
 *
 * Rendering Architecture:
 * - glCanvas: WebGL canvas for accelerated sprite batch rendering
 * - mainCanvas: Canvas2D overlay for text, UI, and custom drawing
 * - All draw functions default to WebGL when enabled, can force Canvas2D with useWebGL parameter
 *
 * @namespace Draw
 */

/** The primary 2D canvas visible to the user
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let mainCanvas;

/** 2d context for mainCanvas
 *  - Scaled by canvasPixelRatio, so drawing to it is in css pixels
 *  - getImageData and putImageData ignore that scale and work in backing store
 *    pixels, so use workReadCanvas to read pixels back instead of this
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let mainContext;

/** The default 2d context to use for drawing, usually mainContext
 *  @type {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let drawContext;

/** Offscreen canvas that can be used for image processing
 *  @type {OffscreenCanvas}
 *  @memberof Draw */
let workCanvas;

/** Offscreen canvas that can be used for image processing
 *  @type {OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let workContext;

/** Offscreen canvas with willReadFrequently that can be used for image processing
 *  @type {OffscreenCanvas}
 *  @memberof Draw */
let workReadCanvas;

/** Offscreen canvas with willReadFrequently that can be used for image processing
 *  @type {OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let workReadContext;

/** Extra canvas to composite behind the engine canvases when combining canvases
 *  Set by plugins that render to their own canvas below the LittleJS canvases
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let backgroundCanvas;

/** The size of the main canvas (and other secondary canvases) in css pixels
 *  - This is the screen space coordinate system, matching mousePos
 *  - With canvasPixelRatio set the backing store is larger than this
 *  @type {Vector2}
 *  @memberof Draw */
let mainCanvasSize = vec2();

/** Array containing texture info for batch rendering system
 *  @type {Array<TextureInfo>}
 *  @memberof Draw */
let textureInfos = [];

/** Keeps track of how many draw calls there were each frame for debugging
 *  @type {number}
 *  @memberof Draw */
let drawCount;

/** Keeps track of how many primitives were drawn each frame for debugging
 *  A single draw call can render many primitives (e.g. a WebGL sprite batch).
 *  @type {number}
 *  @memberof Draw */
let primitiveCount;

// internal predicates for tint short-circuiting in canvas2D draw paths
// isWhite ignores alpha because alpha is applied via globalAlpha, not multiply
// isBlack includes alpha so additive colors that only contribute alpha are not skipped
/** @param {Color} c */ function isWhite(c) { return c.r >= 1 && c.g >= 1 && c.b >= 1; }
/** @param {Color} c */ function isBlack(c) { return c.r <= 0 && c.g <= 0 && c.b <= 0 && c.a <= 0; }

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {Vector2|number} [index=0] - Index of the tile in 1d or 2d form
 * @param {Vector2|number} [size] - Size of tile in pixels
 * @param {TextureInfo|number} [texture] - Texture index or info to use
 * @param {number} [padding] - How many pixels padding around tiles
 * @param {number} [bleed] - How many pixels smaller to draw tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw */
function tile(index=0, size=tileDefaultSize, texture=0, padding=tileDefaultPadding, bleed=tileDefaultBleed)
{
    ASSERT(isVector2(index) || typeof index === 'number', 'index must be a vec2 or number');
    ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');
    ASSERT(isNumber(texture) || texture instanceof TextureInfo, 'texture must be a number or TextureInfo');
    ASSERT(isNumber(padding), 'padding must be a number');

    if (headlessMode) return new TileInfo;

    if (typeof size === 'number')
    {
        // if size is a number, make it a vector
        ASSERT(size > 0);
        size = new Vector2(size, size);
    }

    // create tile info object
    const textureInfo = typeof texture === 'number' ?
        textureInfos[texture] : texture;
    ASSERT(textureInfo instanceof TextureInfo, 'tile texture is not loaded');
    ASSERT(textureInfo.size.x > 0, 'tile texture is not loaded');

    // get the position of the tile
    const sizePaddedX = size.x + padding*2;
    const sizePaddedY = size.y + padding*2;
    let x, y;
    if (typeof index === 'number')
    {
        const cols = textureInfo.size.x / sizePaddedX |0;
        x = index % cols;
        y = index / cols |0;
    }
    else
    {
        x = index.x;
        y = index.y;
    }
    const pos = new Vector2(x*sizePaddedX + padding, y*sizePaddedY + padding);
    return new TileInfo(pos, size, textureInfo, padding, bleed);
}

/**
 * Tile Info - Stores info about how to draw a tile
 * @memberof Draw
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=vec2()] - Top left corner of tile in pixels
     *  @param {Vector2} [size] - Size of tile in pixels
     *  @param {TextureInfo} [textureInfo] - Texture info to use
     *  @param {number} [padding] - How many pixels padding around all sides of each tile (increases grid size, does not affect tile size)
     *  @param {number} [bleed] - How many pixels smaller to shrink UVS of tiles (does not affect grid size, only UVs)
     *  @param {number} [columns] - How many frames per row for frame(), 0 to keep frames on a single row
     */
    constructor(pos=vec2(), size=tileDefaultSize, textureInfo=textureInfos[0], padding=tileDefaultPadding, bleed=tileDefaultBleed, columns=0)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {number} - How many pixels padding around tiles */
        this.padding = padding;
        /** @property {TextureInfo} - The texture info for this tile */
        this.textureInfo = textureInfo;
        /** @property {number} - Shrinks tile by this many pixels to prevent neighbors bleeding */
        this.bleed = bleed;
        /** @property {number} - How many frames per row for frame(), 0 to keep frames on a single row */
        this.columns = columns;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureInfo, this.padding, this.bleed, this.columns); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  Frames wrap down to the next row if columns is set
    *  @param {number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame === 'number');
        const w = this.size.x + this.padding*2;
        const h = this.size.y + this.padding*2;
        const x = (this.columns ? frame % this.columns : frame) * w;
        const y = (this.columns ? frame / this.columns | 0 : 0) * h;
        ASSERT(this.pos.x + x + this.size.x <= this.textureInfo.size.x, 'frame extends beyond texture width!');
        ASSERT(this.pos.y + y + this.size.y <= this.textureInfo.size.y, 'frame extends beyond texture height!');
        return this.offset(new Vector2(x, y));
    }

    /** Set how many frames per row this tile uses, so frame() can wrap
    *  @param {number} [columns] - Frames per row, 0 to keep frames on a single row
    *  @return {TileInfo}
    */
    setColumns(columns=0)
    {
        ASSERT(isNumber(columns) && columns >= 0, 'columns must be a number >= 0');
        this.columns = columns;
        return this;
    }

    /**
     * Returns a tile info for an index using this tile as reference
     * @param {Vector2|number} [index=0]
     * @return {TileInfo}
     */
    index(index)
    { return tile(index, this.size, this.textureInfo, this.padding, this.bleed).setColumns(this.columns); }

    /**
     * Set this tile to use a full image in a texture info
     * @param {TextureInfo} [textureInfo]
     * @return {TileInfo}
     */
    setFullImage(textureInfo=this.textureInfo)
    {
        this.textureInfo = textureInfo;
        this.pos = new Vector2;
        this.size = textureInfo.size.copy();
        this.bleed = this.padding = this.columns = 0;
        return this;
    }
}

/**
 * Tile Info - Stores info about each texture
 * @memberof Draw
 */
class TextureInfo
{
    /**
     * Create a TextureInfo, called automatically by the engine
     * @param {HTMLImageElement|OffscreenCanvas} image
     * @param {boolean} [useWebGL] - Should use WebGL if available?
     * @param {boolean} [wrap] - Should the texture wrap (REPEAT) or clamp (CLAMP_TO_EDGE)?
     */
    constructor(image, useWebGL=true, wrap=false)
    {
        /** @property {HTMLImageElement|OffscreenCanvas} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = image ? vec2(image.width, image.height) : vec2();
        /** @property {Vector2} - inverse of the size, cached for rendering */
        this.sizeInverse = image ? vec2(1/image.width, 1/image.height) : vec2();
        /** @property {WebGLTexture|undefined} - WebGL texture
         *  @type {WebGLTexture|undefined} */
        this.glTexture = undefined;
        /** @property {boolean} - true for REPEAT wrap mode, false for CLAMP_TO_EDGE */
        this.wrap = wrap;
        useWebGL && this.createWebGLTexture();
    }

    /** Creates the WebGL texture, updates if already created */
    createWebGLTexture() { glRegisterTextureInfo(this); }

    /** Destroys the WebGL texture */
    destroyWebGLTexture() { glUnregisterTextureInfo(this); }

    /** Check if the texture is webgl enabled
     * @return {boolean} */
    hasWebGL() { return !!this.glTexture; }

    /** Set the wrap mode for this texture
     *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE */
    setWrap(wrap=true)
    {
        this.wrap = wrap;
        glSetTextureWrap(this.glTexture, wrap);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * SpriteAnimation - Steps a tile through its frames over time: looping, once, or there and back
 * - Driven by the engine time like a Timer, so it pauses with the game and needs no update call
 * - Read tileInfo each frame for the frame to draw, from an object's update or before a drawTile
 * - loop, play and pingPong each start over from the first frame; stop holds the current one
 * - Frames follow each other along the row, as tileInfo.frame counts them
 * @example
 * const walk = new SpriteAnimation(tile(0, 16), 4, .1); // four frames, a tenth of a second each
 * const attack = new SpriteAnimation(tile(4, 16), 3, .05).play(); // once, then holds the last frame
 * // in update: this.tileInfo = (attack.isDone ? walk : attack).tileInfo;
 * @memberof Draw
 */
class SpriteAnimation
{
    /** Create an animation over a run of frames, looping from the start
     *  @param {TileInfo} tileInfo - The first frame
     *  @param {number} frameCount - How many frames, one or more
     *  @param {number} [frameTime] - Seconds each frame shows for */
    constructor(tileInfo, frameCount, frameTime=.1)
    {
        ASSERT(tileInfo instanceof TileInfo, 'the first frame must be a TileInfo');
        ASSERT(frameCount >= 1 && frameTime > 0, 'an animation needs at least one frame and a positive frame time');
        /** @property {TileInfo} - The first frame, the others follow it along the row */
        this.firstTile = tileInfo;
        /** @property {number} - How many frames */
        this.frameCount = frameCount;
        /** @property {number} - Seconds each frame shows for */
        this.frameTime = frameTime;
        /** @property {number} - Rate multiplier, 2 plays twice as fast; set it before starting */
        this.speed = 1;
        /** @property {string} - How it runs: 'loop', 'once' or 'pingPong', set by loop, play and pingPong */
        this.mode = 'loop';
        /** @property {number} - Engine time it started at */
        this.startTime = time;
        /** @property {number|undefined} - The frame held by stop, undefined while running
         *  @type {number|undefined} */
        this.heldFrame = undefined;
    }

    /** Start over from the first frame and repeat forever
     *  @return {SpriteAnimation} */
    loop() { return this.restart('loop'); }

    /** Start over from the first frame, run through once and hold the last frame
     *  @return {SpriteAnimation} */
    play() { return this.restart('once'); }

    /** Start over from the first frame and run there and back forever
     *  @return {SpriteAnimation} */
    pingPong() { return this.restart('pingPong'); }

    /** Hold the current frame
     *  @return {SpriteAnimation} */
    stop() { this.heldFrame = this.frame; return this; }

    /** Start over from the first frame in a mode
     *  @param {string} [mode] - 'loop', 'once' or 'pingPong', the current mode when left out
     *  @return {SpriteAnimation} */
    restart(mode=this.mode)
    {
        this.mode = mode;
        this.startTime = time;
        this.heldFrame = undefined;
        return this;
    }

    /** How many frames have gone by since the start, fractional
     *  @return {number} */
    get elapsedFrames() { return (time - this.startTime) * this.speed / this.frameTime; }

    /** The frame showing now, 0 to frameCount-1
     *  @return {number} */
    get frame()
    {
        if (this.heldFrame !== undefined)
            return this.heldFrame;
        const n = this.frameCount, f = floor(this.elapsedFrames);
        if (this.mode == 'once')
            return min(f, n - 1);
        if (this.mode == 'loop')
            return f % n;
        const period = max(2 * n - 2, 1), k = f % period; // there and back, the ends once each
        return k < n ? k : period - k;
    }

    /** The tile of the frame showing now
     *  @return {TileInfo} */
    get tileInfo() { return this.firstTile.frame(this.frame); }

    /** True once a play has shown its last frame for its time
     *  @return {boolean} */
    get isDone() { return this.mode == 'once' && this.heldFrame === undefined && this.elapsedFrames >= this.frameCount; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Shader - A custom fragment shader for objects and draws, 2D or 3D
 * - Write a mainImage function in the post processing style, the renderer wraps it with its own program
 * - It gives the surface color, then the object's color and additive color apply in 2D, and the lighting,
 *   shadows and fog in 3D; set emissive to 1 on a 3D object for the snippet's color to be final
 * - Set it as obj.shader, or use setShader for 2D draws and render3D.shader for 3D draws
 * - Draws that share a Shader share a batch; with no Shader set nothing changes
 * - In 2D it shades textured draws, untextured ones like drawRect draw as they are
 * - Compiled once per renderer by the first draw that needs it; a bad snippet throws with the GLSL log in debug
 * - Make each Shader once, at init, and share it; every one made lives for the session with its programs
 * - Names in both renderers: iChannel0 the texture, iTime, iResolution, and localUV, 0 to 1 across the sprite
 *   or the mesh's own uv
 * - Names in 3D only: worldPos, worldNormal, cameraPos, sunDirection, sunColor, ambientColor, lightCount,
 *   lights[i], lightColors[i] and shadow()
 * @example
 * const fade = new Shader(`
 * void mainImage(out vec4 c, vec2 uv)
 * {
 *     c = texture(iChannel0, uv);
 *     c.a *= .5 + .5*sin(iTime);
 * }`);
 * obj.shader = fade;
 * @memberof Draw
 */
class Shader
{
    /** Create a shader from a fragment snippet that defines void mainImage(out vec4 c, vec2 uv)
     *  @param {string} fragmentCode */
    constructor(fragmentCode)
    {
        ASSERT(isStringLike(fragmentCode) && String(fragmentCode).includes('mainImage'), 'a Shader needs fragment code that defines mainImage');
        /** @property {string} - The mainImage snippet */
        this.fragmentCode = String(fragmentCode);
        /** @property {WebGLProgram|undefined} - The 2D program, compiled by the first draw that needs it, read only
         *  @type {WebGLProgram|undefined} */
        this.program = undefined;
        /** @property {WebGLProgram|undefined} - The 3D program, compiled by the 3D plugin the same way, read only
         *  @type {WebGLProgram|undefined} */
        this.program3D = undefined;
        glShaderObjects.push(this); // a lost context drops the programs of every one
    }
}

///////////////////////////////////////////////////////////////////////////////
// Drawing functions

/** Draw textured tile centered in world space
 *  @param {Vector2}  pos - Center of the tile in world space
 *  @param {Vector2}  [size=vec2(1)] - Size of the tile in world space
 *  @param {TileInfo} [tileInfo] - Tile info to use, untextured if undefined
 *  @param {Color}    [color=WHITE] - Color to modulate with
 *  @param {number}   [angle] - Angle to rotate by
 *  @param {boolean}  [mirror] - Is image flipped along the Y axis?
 *  @param {Color}    [additiveColor] - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are the pos and size are in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    const textureInfo = tileInfo?.textureInfo;
    const bleed = tileInfo?.bleed ?? 0;
    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        if (textureInfo)
        {
            // calculate uvs and render
            const sizeInverse = textureInfo.sizeInverse;
            const x = tileInfo.pos.x * sizeInverse.x;
            const y = tileInfo.pos.y * sizeInverse.y;
            const w = tileInfo.size.x * sizeInverse.x;
            const h = tileInfo.size.y * sizeInverse.y;
            glSetTexture(textureInfo.glTexture);
            if (bleed)
            {
                const bleedX = sizeInverse.x*bleed;
                const bleedY = sizeInverse.y*bleed;
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x + bleedX,     y + bleedY,
                    x - bleedX + w, y - bleedY + h,
                    color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
            }
            else
            {
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x, y, x + w, y + h,
                    color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
            }
        }
        else
        {
            // untextured: fold color+additive to match the Canvas2D path's
            // color.add(additiveColor) on line ~337.
            const combined = additiveColor ? color.add(additiveColor) : color;
            glDrawUntextured(pos.x, pos.y, size.x, size.y, angle, combined.rgbaInt());
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // un-flip Y so the image renders right-side up under drawCanvas2D's Y flip
                context.scale(1, -1);
                // calculate uvs and render
                const x = tileInfo.pos.x,  y = tileInfo.pos.y;
                const w = tileInfo.size.x, h = tileInfo.size.y;
                drawImageColor(context, textureInfo.image, x, y, w, h, -.5, -.5, 1, 1, color, additiveColor, bleed);
            }
            else
            {
                // if no tile info, use untextured rect (Y-symmetric, no compensation needed)
                const c = additiveColor ? color.add(additiveColor) : color;
                context.fillStyle = c.toString();
                context.fillRect(-.5, -.5, 1, 1);
            }
        }, screenSpace, context);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)]
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace, context)
{
    drawTile(pos, size, undefined, color, angle, false, undefined, useWebGL, screenSpace, context);
}

/** Draw a rect centered on pos with a gradient from top to bottom
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)]
 *  @param {Color}   [colorTop=WHITE]
 *  @param {Color}   [colorBottom=CLEAR_WHITE]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRectGradient(pos, size, colorTop=WHITE, colorBottom=CLEAR_WHITE, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(colorTop) && isColor(colorBottom), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
            angle += cameraAngle;
        }
        // build 4 corner points for the rectangle
        const points = [], colors = [];
        const halfSizeX = size.x/2, halfSizeY = size.y/2;
        const colorTopInt = colorTop.rgbaInt();
        const colorBottomInt = colorBottom.rgbaInt();
        const c = cos(-angle), s = sin(-angle);
        for (let i=4; i--;)
        {
            const x = i & 1 ? halfSizeX : -halfSizeX;
            const y = i & 2 ? halfSizeY : -halfSizeY;
            const rx = x * c - y * s;
            const ry = x * s + y * c;
            const color = i & 2 ? colorTopInt : colorBottomInt;
            points.push(vec2(pos.x + rx, pos.y + ry));
            colors.push(color);
        }
        glDrawColoredPoints(points, colors);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
        drawCanvas2D(pos, size, angle, false, (context)=>
        {
            // gradient endpoints are flipped to match the Y flip inside drawCanvas2D
            const gradient = context.createLinearGradient(0, .5, 0, -.5);
            gradient.addColorStop(0, colorTop.toString());
            gradient.addColorStop(1, colorBottom.toString());
            context.fillStyle = gradient;
            context.fillRect(-.5, -.5, 1, 1);
        }, screenSpace, context);
    }
}

/** Draw a texture tiled (wrapped) across a rectangle in world space.
 *  Useful for backgrounds, repeating patterns, and seamless fills.
 *  The whole texture is tiled — sub-region (TileInfo) wrapping is not supported.
 *  @param {Vector2}  pos          - Center of the rect in world space
 *  @param {Vector2}  size         - Size of the rect in world space
 *  @param {Vector2}  wrapCount    - How many times the texture repeats (x, y)
 *  @param {TextureInfo|number} [texture=0] - TextureInfo or texture index into textureInfos
 *  @param {Color}    [color=WHITE] - Color to modulate with
 *  @param {number}   [angle=0] - Angle to rotate by
 *  @param {Color}    [additiveColor] - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are pos and size in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTextureWrapped(pos, size, wrapCount, texture=0, color=WHITE,
    angle=0, additiveColor, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isVector2(wrapCount), 'wrapCount must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    ASSERT(!(texture instanceof TileInfo),
        'pass a TextureInfo or texture index, not a TileInfo — use tileInfo.textureInfo');

    // short-circuit before texture lookup — textureInfos[0] is undefined in headless mode
    if (headlessMode) return;

    // resolve texture argument: TextureInfo or index
    const textureInfo = typeof texture === 'number' ? textureInfos[texture] : texture;
    ASSERT(textureInfo instanceof TextureInfo, 'texture not loaded');
    ASSERT(textureInfo.size.x > 0, 'texture not loaded');
    ASSERT(textureInfo.wrap,
        'drawTextureWrapped requires a wrap-enabled texture; call textureInfo.setWrap(true) first');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glSetTexture(textureInfo.glTexture);
        glDraw(pos.x, pos.y, size.x, size.y, angle,
            0, 0, wrapCount.x, wrapCount.y,
            color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
        return;
    }

    // Canvas2D path — increment counts here (WebGL counts via glFlush)
    ++drawCount;
    ++primitiveCount;

    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
        angle -= cameraAngle;
    }

    // pick image source: raw, or tinted bake. Match drawImageColor's
    // "no tint needed" predicate so behavior stays consistent.
    const noTint = !canvasColorTiles ||
        (additiveColor
            ? isWhite(color.add(additiveColor)) && additiveColor.a <= 0
            : isWhite(color));
    // alpha is baked into pixels by bakeTintedImage's additive branch;
    // in that case globalAlpha must NOT also apply color.a
    const alphaBaked = !noTint && additiveColor && !isBlack(additiveColor);
    const source = noTint
        ? textureInfo.image
        : bakeTintedImage(textureInfo.image, color, additiveColor);

    context = context || drawContext;
    context.save();
    context.translate(pos.x + .5, pos.y + .5);
    context.rotate(angle);
    context.globalAlpha = alphaBaked ? 1 : color.a;

    const pattern = context.createPattern(source, 'repeat');
    // map pattern-source pixels into user space so the rect contains
    // wrapCount.x × wrapCount.y repeats
    const m = new DOMMatrix()
        .translate(-size.x/2, -size.y/2)
        .scale(size.x / (wrapCount.x * source.width),
               size.y / (wrapCount.y * source.height));
    pattern.setTransform(m);
    context.fillStyle = pattern;
    context.fillRect(-size.x/2, -size.y/2, size.x, size.y);
    context.globalAlpha = 1;
    context.restore();
}

/** Draw connected lines between a series of points
 *  @param {Array<Vector2>} points
 *  @param {number}  [width]
 *  @param {Color}   [color=WHITE]
 *  @param {boolean} [wrap] - Should the last point connect to the first?
 *  @param {Vector2} [pos=vec2()] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLineList(points, width=.1, color=WHITE, wrap=false, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isArray(points), 'points must be an array');
    ASSERT(isNumber(width), 'width must be a number');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        let size = vec2(1);
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glDrawOutlineTransform(points, color.rgbaInt(), width, pos.x, pos.y, size.x, size.y, angle, wrap);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
        drawCanvas2D(pos, vec2(1), angle, false, (context)=>
        {
            context.strokeStyle = color.toString();
            context.lineWidth = width;
            context.beginPath();
            for (let i=0; i<points.length; ++i)
            {
                const point = points[i];
                context.lineTo(point.x, point.y);
            }
            wrap && context.closePath();
            context.stroke();
        }, screenSpace, context);
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [width]
 *  @param {Color}   [color=WHITE]
 *  @param {Vector2} [pos=vec2()] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, width=.1, color=WHITE, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(width, halfDelta.length()*2);
    pos = pos.add(posA.add(halfDelta));
    if (screenSpace)
        halfDelta.y *= -1;  // flip angle Y if screen space
    angle += halfDelta.angle();
    drawRect(pos, size, color, angle, useWebGL, screenSpace, context);
}

/** Draw colored regular polygon using passed in number of sides
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)]
 *  @param {number}  [sides]
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRegularPoly(pos, size=vec2(1), sides=3, color=WHITE, lineWidth=0, lineColor=BLACK, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isNumber(sides), 'sides must be a number');

    // build regular polygon points
    const points = [];
    const sizeX = size.x/2, sizeY = size.y/2;
    for (let i=sides; i--;)
    {
        const a = (i/sides)*PI*2;
        points.push(vec2(sin(a)*sizeX, cos(a)*sizeY));
    }
    drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, screenSpace, context);
}

/** Draw colored polygon using passed in points
 *  @param {Array<Vector2>} points - Array of Vector2 points
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {Vector2} [pos=vec2()] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawPoly(points, color=WHITE, lineWidth=0, lineColor=BLACK, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context=undefined)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isArray(points), 'points must be an array');
    ASSERT(isColor(color) && isColor(lineColor), 'color is invalid');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        let size = vec2(1);
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glDrawPointsTransform(points, color.rgbaInt(), pos.x, pos.y, size.x, size.y, angle);
        if (lineWidth > 0)
            glDrawOutlineTransform(points, lineColor.rgbaInt(), lineWidth, pos.x, pos.y, size.x, size.y, angle);
    }
    else
    {
        drawCanvas2D(pos, vec2(1), angle, false, context=>
        {
            context.fillStyle = color.toString();
            context.beginPath();
            for (const point of points)
                context.lineTo(point.x, point.y);
            context.closePath();
            context.fill();
            if (lineWidth)
            {
                context.strokeStyle = lineColor.toString();
                context.lineWidth = lineWidth;
                context.stroke();
            }
        }, screenSpace, context);
    }
}

/** Draw colored ellipse using passed in point
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)] - Width and height diameter
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawEllipse(pos, size=vec2(1), color=WHITE, angle=0, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color) && isColor(lineColor), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(lineWidth >= 0, 'lineWidth must be a positive value or 0');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    // clamp line width to prevent artifacts
    lineWidth = clamp(lineWidth, 0, min(size.x, size.y));

    if (useWebGL && glEnable)
    {
        // draw as a regular polygon
        const sides = glCircleSides;
        drawRegularPoly(pos, size, sides, color, lineWidth, lineColor, angle, useWebGL, screenSpace, context);
    }
    else
    {
        drawCanvas2D(pos, vec2(1), angle, false, context=>
        {
            context.fillStyle = color.toString();
            context.beginPath();
            context.ellipse(0, 0, size.x/2, size.y/2, 0, 0, 9);
            context.fill();
            if (lineWidth)
            {
                context.strokeStyle = lineColor.toString();
                context.lineWidth = lineWidth;
                context.stroke();
            }
        }, screenSpace, context);
    }
}

/** Draw colored circle using passed in point
 *  @param {Vector2} pos
 *  @param {number}  [size=1] - Diameter
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth=0]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipse(pos, vec2(size), color, 0, lineWidth, lineColor, useWebGL, screenSpace, context);
}

/** Draw an ellipse filled with a radial gradient from the center to the rim
 *  - Best when batched with other untextured polys
 *  - If drawing mostly textured sprites, bake the gradient into a texture and use drawTile instead
 *  - Stacking gradients at the exact same position may show a faint vertical artifact
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)] - Width and height diameter
 *  @param {Color}   [colorInner=WHITE]
 *  @param {Color}   [colorOuter=CLEAR_WHITE]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
let drawEllipseGradientOffset = 0;
function drawEllipseGradient(pos, size=vec2(1), colorInner=WHITE, colorOuter=CLEAR_WHITE, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(colorInner) && isColor(colorOuter), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (headlessMode) return;

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
            angle += cameraAngle;
        }
        // fan as tristrip; rotate the boundary vertex by one slice per call
        // so back-to-back gradients at the same position have their hole
        // (from gpu edge-rule on the boundary line-degen) at different rim
        // verts and don't visibly stack
        const sides = glCircleSides;
        const radiusX = size.x/2, radiusY = size.y/2;
        const innerInt = colorInner.rgbaInt();
        const outerInt = colorOuter.rgbaInt();
        const offset = drawEllipseGradientOffset++;
        const c = cos(-angle), s = sin(-angle);
        const rim = (a) =>
        {
            const lx = sin(a)*radiusX, ly = cos(a)*radiusY;
            return vec2(pos.x + lx*c - ly*s, pos.y + lx*s + ly*c);
        };
        const startA = (offset%sides)/sides*PI*2;
        const points = [rim(startA)];
        const colors = [outerInt];
        for (let i=sides; i--;)
        {
            const a = ((i+offset)%sides)/sides*PI*2;
            points.push(pos);
            colors.push(innerInt);
            points.push(rim(a));
            colors.push(outerInt);
        }
        glDrawColoredPoints(points, colors);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
        drawCanvas2D(pos, size, angle, false, (context)=>
        {
            const gradient = context.createRadialGradient(0, 0, 0, 0, 0, .5);
            gradient.addColorStop(0, colorInner.toString());
            gradient.addColorStop(1, colorOuter.toString());
            context.fillStyle = gradient;
            context.beginPath();
            context.ellipse(0, 0, .5, .5, 0, 0, 9);
            context.fill();
        }, screenSpace, context);
    }
}

/** Draw a circle filled with a radial gradient from the center to the rim
 *  - Best when batched with other untextured polys
 *  - If drawing mostly textured sprites, bake the gradient into a texture and use drawTile instead
 *  - Stacking gradients at the exact same position may show a faint vertical artifact
 *  @param {Vector2} pos
 *  @param {number}  [size=1] - Diameter
 *  @param {Color}   [colorInner=WHITE]
 *  @param {Color}   [colorOuter=CLEAR_WHITE]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircleGradient(pos, size=1, colorInner=WHITE, colorOuter=CLEAR_WHITE, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipseGradient(pos, vec2(size), colorInner, colorOuter, 0, useWebGL, screenSpace, context);
}

/**
 * @callback Canvas2DDrawFunction - A function that draws to a 2D canvas context
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 * @memberof Draw
 */

/** Draw directly to a 2d canvas context in world space.
 *  The Y axis is flipped so world-Y-up coordinates render right-side up
 *  (matches the WebGL path). Callers whose drawing depends on Y direction
 *  (e.g. linear gradients) should flip their own Y endpoints accordingly.
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {number}   angle
 *  @param {boolean}  [mirror]
 *  @param {Canvas2DDrawFunction} [drawFunction]
 *  @param {boolean}  [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle=0, mirror=false, drawFunction, screenSpace=false, context=drawContext)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(typeof drawFunction === 'function', 'drawFunction must be a function');

    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
        angle -= cameraAngle;
    }
    context.save();
    context.translate(pos.x+.5, pos.y+.5);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, -size.y);
    drawFunction(context);
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Text Drawing Functions

/** Draw text on main canvas in world space
 *  Automatically splits new lines into rows
 *  @param {string|number}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=drawContext)
{
    // convert to screen space
    pos = worldToScreen(pos);
    size *= cameraScale;
    lineWidth *= cameraScale;
    angle -= cameraAngle;
    angle *= -1;

    drawTextScreen(text, pos, size, color, lineWidth, lineColor, textAlign, font, fontStyle, maxWidth, angle, context);
}

/** Draw text in screen space
 *  Automatically splits new lines into rows
 *  @param {string|number}  text
 *  @param {Vector2} pos
 *  @param {number}  size
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=drawContext)
{
    ASSERT(isStringLike(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isColor(color), 'color must be a color');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isColor(lineColor), 'lineColor must be a color');
    ASSERT(['left','center','right'].includes(textAlign), 'align must be left, center, or right');
    ASSERT(isStringLike(font), 'font must be a string');
    ASSERT(isStringLike(fontStyle), 'fontStyle must be a string');
    ASSERT(isNumber(angle), 'angle must be a number');
    
    const lines = (text+'').split('\n');
    const posY = pos.y - (lines.length-1) * size/2; // center vertically
    // save before style mutations so caller's context state is preserved
    context.save();
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = fontStyle + ' ' + size + 'px '+ font;
    context.textBaseline = 'middle';
    context.translate(pos.x, posY);
    context.rotate(-angle);
    let yOffset = 0;
    lines.forEach(line=>
    {
        lineWidth && context.strokeText(line, 0, yOffset, maxWidth);
        context.fillText(line, 0, yOffset, maxWidth);
        yOffset += size;
    });
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Drawing utilities

/** Load a texture at a specific index
 *  @param {number} textureIndex - Index to store the texture at
 *  @param {string} [src] - Image source path
 *  @return {Promise} Promise that resolves when texture is loaded
 *  @memberof Draw */
async function loadTexture(textureIndex, src)
{
    ASSERT(isNumber(textureIndex), 'textureIndex must be a number');
    ASSERT(!textureInfos[textureIndex], 'textureIndex is already loaded!');
    ASSERT(!src || isStringLike(src), 'image src must be a string');
    
    const image = new Image;
    if (src)
    {
        await new Promise(resolve =>
        {
            image.onerror = image.onload = resolve;
            image.crossOrigin = 'anonymous';
            image.src = src;
        });
    }
    
    textureInfos[textureIndex] = new TextureInfo(image);
}

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    ASSERT(isVector2(screenPos), 'screenPos must be a vec2');

    let x = (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale;
    let y = (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x + cameraPos.x, y + cameraPos.y);
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    ASSERT(isVector2(worldPos), 'worldPos must be a vec2');

    let x = worldPos.x - cameraPos.x;
    let y = worldPos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2
    (
        x *  cameraScale + mainCanvasSize.x/2 - .5,
        y * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Convert from screen to world space coordinates for a directional vector (no translation)
 *  @param {Vector2} screenDelta
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorldDelta(screenDelta)
{
    ASSERT(isVector2(screenDelta), 'screenDelta must be a vec2');

    let x = screenDelta.x /  cameraScale;
    let y = screenDelta.y / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x, y);
}

/** Convert from screen to world space coordinates for a directional vector (no translation)
 *  @param {Vector2} worldDelta
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreenDelta(worldDelta)
{
    ASSERT(isVector2(worldDelta), 'worldDelta must be a vec2');

    let x = worldDelta.x;
    let y = worldDelta.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x *  cameraScale, y * -cameraScale);
}

/** Convert screen space transform to world space
 *  @param {Vector2} screenPos
 *  @param {Vector2} screenSize
 *  @param {number} [screenAngle]
 *  @return {[Vector2, Vector2, number]} - [pos, size, angle]
 *  @memberof Draw */
function screenToWorldTransform(screenPos, screenSize, screenAngle=0)
{
    ASSERT(isVector2(screenPos), 'screenPos must be a vec2');
    ASSERT(isVector2(screenSize), 'screenSize must be a vec2');
    ASSERT(isNumber(screenAngle), 'screenAngle must be a number');

    return [
        screenToWorld(screenPos),
        screenSize.scale(1/cameraScale),
        screenAngle + cameraAngle
    ];
}

/** Get the size of the camera window in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

/** Fit the camera to a rectangle in world space by setting cameraPos and cameraScale
 *  - worldMargin pads the content rectangle in world units, so the gap scales with the content on resize
 *  - screenInset reserves space in screen pixels on each viewport edge (for example a HUD band) and
 *    re-centers the content away from that edge, so the reserved band stays a fixed pixel size on resize
 *  - worldMargin and screenInset may each be a number for all sides, a Vector2 (x=left/right, y=top/bottom),
 *    or an object with any of {top, right, bottom, left}
 *  @param {Vector2} center - Center of the rectangle in world space
 *  @param {Vector2} size - Size of the rectangle in world space
 *  @param {number|Vector2|Object} [worldMargin] - World space padding added around the content rectangle
 *  @param {number|Vector2|Object} [screenInset] - Screen space padding in pixels reserved on each viewport edge
 *  @return {number} - The new camera scale
 *  @memberof Draw */
function cameraFit(center, size, worldMargin, screenInset)
{
    ASSERT(isVector2(center), 'center must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');

    // pad the content
    const margin = padSides(worldMargin);
    const inset  = padSides(screenInset);
    const worldW = size.x + margin.left + margin.right;
    const worldH = size.y + margin.top  + margin.bottom;
    const viewW  = mainCanvasSize.x - inset.left - inset.right;
    const viewH  = mainCanvasSize.y - inset.top  - inset.bottom;

    // bail on a degenerate rect or viewport rather than NaN the camera
    if (!(worldW > 0 && worldH > 0 && viewW > 0 && viewH > 0))
        return cameraScale;

    // scale to fit the padded content
    cameraScale = min(viewW / worldW, viewH / worldH);

    // calculate offset vectors
    const marginVector = vec2(margin.right - margin.left, margin.top - margin.bottom).scale(.5);
    const insetVector = vec2(inset.right - inset.left, inset.top - inset.bottom).scale(.5 / cameraScale);

    // apply the offsets and return camera scale
    cameraPos = center.add(marginVector).add(insetVector);
    return cameraScale;

    function padSides(p)
    {
        // normalize a padding option to {top, right, bottom, left}
        if (p === undefined || isNumber(p))
            p = vec2(p);
        if (isVector2(p))
            return { top: p.y, right: p.x, bottom: p.y, left: p.x };
        return {
            top:    p.top    || 0,
            right:  p.right  || 0,
            bottom: p.bottom || 0,
            left:   p.left   || 0,
        };
    }
}

/** Check if a box, point, or circle is on screen with a circle test
 *  If size is a Vector2, uses the length as diameter
 *  This can be used to cull offscreen objects from render or update
 *  @param {Vector2} pos - world space position
 *  @param {Vector2|number} size - world space size or diameter
 *  @return {boolean}
 *  @memberof Draw */
function isOnScreen(pos, size=0)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size) || isNumber(size), 'size must be a vec2 or number');

    // cameraScale of 0 collapses world coords; nothing is visible
    if (!cameraScale) return false;

    // optimized circle on screen test
    // pos = worldToScreen(pos);
    let x = pos.x - cameraPos.x;
    let y = pos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    x *= cameraScale*2; y *= -cameraScale*2;

    if (size instanceof Vector2)
        size = size.length(); // use length of vector as diameter
    size *= cameraScale;

    // check against screen bounds
    const w = mainCanvasSize.x, h = mainCanvasSize.y;
    return x + size > -w && x - size < w &&
           y + size > -h && y - size < h;
}

/** Enable additive blending
 *  @param {boolean} [additive]
 *  @memberof Draw */
function setAdditiveBlendMode(additive=true)
{
    glAdditive = additive;
    drawContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}

/** Set the Shader that 2D draws use from now on, none for the engine's own
 *  - The object render loop sets each object's own shader, so this is for draws in gameRender and gameRenderPost
 *  @param {Shader} [shader]
 *  @memberof Draw */
function setShader(shader)
{
    ASSERT(!shader || shader instanceof Shader, 'shader must be a Shader');
    glCustomShader = shader || undefined; // null is no shader too, so it batches with none
}

/** Set an extra canvas to composite behind the engine canvases when combining
 *  Plugins that insert their own canvas below the LittleJS canvases should set
 *  this so it appears in screenshots and video capture
 *  @param {HTMLCanvasElement} [canvas]
 *  @memberof Draw */
function setBackgroundCanvas(canvas) { backgroundCanvas = canvas; }

/** Combines LittleJS canvases onto the main canvas
 *  This is necessary for things like screenshots and video
 *  @memberof Draw */
function combineCanvases()
{
    // this composites raw canvases so it works in backing store pixels,
    // mainCanvasSize is css pixels and would throw away resolution
    const w = mainCanvas.width, h = mainCanvas.height;
    workCanvas.width = w;
    workCanvas.height = h;
    // remove background alpha — explicit fillStyle so a previous caller
    // leaving workContext.fillStyle transparent can't silently no-op this
    workContext.fillStyle = '#000';
    workContext.fillRect(0,0,w,h);
    if (backgroundCanvas)
        workContext.drawImage(backgroundCanvas, 0, 0, w, h);
    glCopyToContext(workContext);
    workContext.drawImage(mainCanvas, 0, 0);

    // draw back 1:1, mainContext is scaled to css pixels
    mainContext.save();
    mainContext.setTransform(1, 0, 0, 1, 0, 0);
    mainContext.drawImage(workCanvas, 0, 0);
    mainContext.restore();
}

// Internal: bake a color/additive-color tint into workReadCanvas at the
// image's native resolution. Returns the work canvas, suitable for
// passing to context.createPattern. Used by drawTextureWrapped's
// Canvas2D path. Caller is responsible for short-circuiting when no
// tint is needed (i.e. color is white and additiveColor is black/none).
function bakeTintedImage(image, color, additiveColor)
{
    const w = image.width|0, h = image.height|0;
    workReadCanvas.width = w;
    workReadCanvas.height = h;
    workReadContext.drawImage(image, 0, 0);

    const imageData = workReadContext.getImageData(0, 0, w, h);
    const data = imageData.data;
    if (additiveColor && !isBlack(additiveColor))
    {
        // multiply + additive (slower)
        const colorMultiply = [color.r, color.g, color.b, color.a];
        const colorAdd = [additiveColor.r * 255, additiveColor.g * 255,
                          additiveColor.b * 255, additiveColor.a * 255];
        for (let i = 0; i < data.length; ++i)
            data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
    }
    else
    {
        // RGB only, faster — alpha left intact for the caller
        for (let i = 0; i < data.length; i+=4)
        {
            data[i  ] *= color.r;
            data[i+1] *= color.g;
            data[i+2] *= color.b;
        }
    }
    workReadContext.putImageData(imageData, 0, 0);
    return workReadCanvas;
}

/** Helper function to draw an image with color and additive color applied
 *  This is slower then normal drawImage when color is applied
    *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
    *  @param {HTMLImageElement|OffscreenCanvas} image
    *  @param {number} sx
    *  @param {number} sy
    *  @param {number} sWidth
    *  @param {number} sHeight
    *  @param {number} dx
    *  @param {number} dy
    *  @param {number} dWidth
    *  @param {number} dHeight
    *  @param {Color} color
    *  @param {Color} [additiveColor]
    *  @param {number} [bleed] - How many pixels to shrink the source, used to fix bleeding
 *  @memberof Draw */
function drawImageColor(context, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, color, additiveColor, bleed=0)
{
    const sx2 = bleed;
    const sy2 = bleed;
    sWidth  = max(1,sWidth|0);
    sHeight = max(1,sHeight|0);
    const sWidth2  = sWidth  - 2*bleed;
    const sHeight2 = sHeight - 2*bleed;
    if (!canvasColorTiles || (additiveColor ? isWhite(color.add(additiveColor)) && additiveColor.a <= 0 : isWhite(color)))
    {
        // white texture with no additive alpha, no need to tint
        context.globalAlpha = color.a;
        context.drawImage(image, sx+sx2, sy+sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
        context.globalAlpha = 1;
    }
    else
    {
        // copy to offscreen canvas
        workReadCanvas.width = sWidth;
        workReadCanvas.height = sHeight;
        workReadContext.drawImage(image, sx|0, sy|0, sWidth, sHeight, 0, 0, sWidth, sHeight);

        // tint image using offscreen work context
        const imageData = workReadContext.getImageData(0, 0, sWidth, sHeight);
        const data = imageData.data;
        if (additiveColor && !isBlack(additiveColor))
        {
            // slower path with additive color
            const colorMultiply = [color.r, color.g, color.b, color.a];
            const colorAdd = [additiveColor.r * 255, additiveColor.g * 255, additiveColor.b * 255, additiveColor.a * 255];
            for (let i = 0; i < data.length; ++i)
                data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
            workReadContext.putImageData(imageData, 0, 0);
            context.drawImage(workReadCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
        }
        else
        {
            // faster path with no additive color
            for (let i = 0; i < data.length; i+=4)
            {
                data[i  ] *= color.r;
                data[i+1] *= color.g;
                data[i+2] *= color.b;
            }
            workReadContext.putImageData(imageData, 0, 0);
            context.globalAlpha = color.a;
            context.drawImage(workReadCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
            context.globalAlpha = 1;
        }
    }
}


/** Returns true if fullscreen mode is active
 *  @return {boolean}
 *  @memberof Draw */
function isFullscreen() { return !!document.fullscreenElement; }

/** Toggle fullscreen mode
 *  @memberof Draw */
function toggleFullscreen()
{
    const rootElement = mainCanvas.parentElement;
    if (isFullscreen())
    {
        if (document.exitFullscreen)
            document.exitFullscreen();
    }
    else if (rootElement.requestFullscreen)
        rootElement.requestFullscreen();
}

/** Set the cursor style
 *  @param {string}  [cursorStyle] - CSS cursor style (auto, none, crosshair, etc)
 *  @memberof Draw */
function setCursor(cursorStyle = 'auto')
{
    const rootElement = mainCanvas.parentElement;
    rootElement.style.cursor = cursorStyle;
}

///////////////////////////////////////////////////////////////////////////////

/** Engine font image, 8x8 font provided by the engine
 *  @type {ImageFont}
 *  @memberof Draw */
let engineImageFont;

/**
 * Image Font Object - Draw text by using tiles in an image
 * - 96 characters (from space to tilde) are stored in an image
 * - A 8x8 default engine font is supplied for general use
 * - This system is WebGL enabled for fast text rendering
 * - Fonts can also be colored and scaled along each axis
 *
 * @memberof Draw
 * @example
 * // use built in font
 * const font = engineImageFont;
 *
 * // draw text
 * font.drawTextScreen('LittleJS\nHello World!', vec2(200, 50));
 */
class ImageFont
{
    /** Create an image font
     *  @param {TileInfo} tileInfo - Tile info of first character in font
     */
    constructor(tileInfo)
    {
        ASSERT(!!tileInfo, 'tileInfo is required for ImageFont');
        
        /** @property {TileInfo} - Tile info for the font */
        this.tileInfo = tileInfo.frame(0);
    }

    /** Draw text in world space using the image font
     *  @param {string|number} text
     *  @param {Vector2} pos
     *  @param {Vector2|number} [size]
     *  @param {boolean} [center=true]
     *  @param {Color} [color=WHITE]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] 
     */
    drawText(text, pos, size=1, center, color, useWebGL, context)
    {
        ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');

        if (typeof size === 'number')
        {
            // if size is a number, make it a vector
            ASSERT(size > 0);
            size *= cameraScale;
            size = new Vector2(size, size);
        }
        else
            size = size.scale(cameraScale);
        this.drawTextScreen(text, worldToScreen(pos), size, center, color, useWebGL, context);
    }

    /** Draw text in screen space using the image font
     *  @param {string|number} text
     *  @param {Vector2} pos
     *  @param {Vector2|number} size
     *  @param {boolean} [center]
     *  @param {Color} [color=WHITE]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
     */
    drawTextScreen(text, pos, size, center=true, color=WHITE, useWebGL=glEnable, context)
    {
        ASSERT(isStringLike(text), 'text must be a string');
        ASSERT(isVector2(pos), 'pos must be a vec2');
        ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');
        ASSERT(isColor(color), 'color must be a color');

        // if size is a number, make it a vector
        size = typeof size === 'number' ? new Vector2(size, size) : size;

        // precache objects for drawing
        const drawPos = new Vector2;
        const tileInfo = this.tileInfo;
        const padding = tileInfo.padding;
        const sizePaddedX = tileInfo.size.x + padding*2;
        const sizePaddedY = tileInfo.size.y + padding*2;
        const cols = tileInfo.textureInfo.size.x / sizePaddedX |0;

        // draw each line of text
        (text+'').split('\n').forEach((line, j)=>
        {
            const centerOffset = center ? (line.length-1) * size.x / 2 : 0;
            for (let i=line.length; i--;)
            {
                // get the character index
                const charCode = line.charCodeAt(i);
                const index = charCode < 32 || charCode > 127 ?
                    95 : charCode - 32; // handle out of range characters

                // get the position of the tile
                const x = index % cols;
                const y = index / cols |0;
                tileInfo.pos.x = x*sizePaddedX + padding;
                tileInfo.pos.y = y*sizePaddedY + padding;

                // snap the glyph edges to whole pixels
                // tiles are drawn from their center, so snapping the center
                // to a whole pixel puts the edges on half pixels when the
                // size is even, and a row or column of the glyph then has
                // no pixel center inside it and is not rasterized at all
                // ceil picks the nearest aligned position, breaking ties
                // downward to match how this used to truncate
                drawPos.x = ceil(pos.x + i * size.x - centerOffset - size.x/2) + size.x/2 - .5;
                drawPos.y = ceil(pos.y + j * size.y - size.y/2) + size.y/2 - .5;
                drawTile(drawPos, size, tileInfo, color, 0, false, undefined, useWebGL, true, context);
            }
        });
    }
}

// load engine font, called automatically on startup
async function imageFontInit()
{
    const image = new Image;
    await new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAAeAQMAAABnrVXaAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAjpJREFUOMu9kzFu2zAUhn+CAROgqrk+B2l0BWYxMjlXeYaAtFtbdA1sGgHqRQfI0CNkSG5AwYB0BQ8d5Bsomwah6CPVeGg6tEPzAxLwyI+P78cP4u9lNO9OoMKnLMOobG5020/yaj/MrRcCGh1gBbyiLTPJEYaIiom5KM9Jq7KgynMGtb6L4GL4MF2H4LQKCXTvDVw2I4MsgZT7QLExdiutH+D08VOP3INXRrWX1/mmpbkNgAPYRVANb4xpcegYvhiNbIXauQICEjBuYLfMakaakWQeXxiZ0VDtuJCKs3ztMV59QtsHJNcRxDzfdL21ty3PrfIcXTN+E+GFAv6T5nbT9jd50/WFxb5ksdAv49qS6ouymG66ji08UMT6moykYLAo+V0j23GN4m829ZySAD5K7QsBfQTvOG8eE+gTeGYRAmnNAubN3hf5Zv9tJWDHp/VTuaSm7SN4fyINQqaNO3RMVxvpSPXnOChnRNvFcGY0gnwiPswYwTKVPE0zVtX3mTEIOoFzaqLrGuJaV+Uqumb71fVk/VoOH3cdLNQP/FHi8hV0CQNoqBZsUPlLPMsdCJro9QAaQQ0woDy9BJm0eTxCFnO9srcYlhNVlfR2EyTrph1uUtbUtAJifwRgrKuYdXVHeb0YI3QpawohQHkloI3J5FuVwI5ORxC9k2Tuz9Ir1IjgeIPGMHYkAZe2RuYkmWFmt3gGbTPOmBUWVTmRmHtGrfpzG/yuQNOKa6gBB/WA9khitPgl6/GP+gl2Af6tCbvaygAAAABJRU5ErkJggg==';
    });
    
    const tilePos=vec2(), tileSize=vec2(8), padding=1, bleed=0;
    const textureInfo = new TextureInfo(image);
    const tileInfo = new TileInfo(tilePos, tileSize, textureInfo, padding, bleed);
    engineImageFont = new ImageFont(tileInfo);
}
/**
 * LittleJS Input System
 * - Keyboard input with key down, pressed, and released states
 * - Mouse input with position (world and screen space), buttons, and wheel
 * - Gamepad support for multiple controllers with analog sticks and buttons
 * - Touch input mapped to mouse position and buttons
 * - Virtual on-screen gamepad for mobile devices
 * - Automatic gamepad vs keyboard/mouse detection
 * - Input event prevention for canvas focus
 * - Clipboard copy/paste support
 * @namespace Input
 */

/** Mouse pos in world space
 *  @type {Vector2}
 *  @memberof Input */
let mousePos = vec2();

/** Mouse pos in screen space
 *  @type {Vector2}
 *  @memberof Input */
let mousePosScreen = vec2();

/** Mouse movement delta in world space
 *  @type {Vector2}
 *  @memberof Input */
let mouseDelta = vec2();

/** Mouse movement delta in screen space
 *  @type {Vector2}
 *  @memberof Input */
let mouseDeltaScreen = vec2();

/** Mouse wheel delta this frame
 *  @type {number}
 *  @memberof Input */
let mouseWheel = 0;

/** True if mouse was inside the document window, set to false when mouse leaves
 *  @type {boolean}
 *  @memberof Input */
let mouseInWindow = true;

/** True if a gamepad is the most recently used input device.
 *  Equivalent to usingGamepadInput(); derived from lastInputDevice each frame.
 *  @type {boolean}
 *  @memberof Input */
let isUsingGamepad = false;

/** The most recently used input device: 'mouse' | 'keyboard' | 'gamepad'.
 *  Sticky: it holds its value while every device is idle, so a mouse-follow
 *  control (e.g. paddle = mousePos) won't snap back the instant the stick/keys
 *  are released. With several devices in play at once (e.g. keyboard to move +
 *  mouse to aim) it tracks whichever was touched last each frame, so it may
 *  alternate — that's intended; use it to pick which control drives a shared
 *  action. Updated every frame by inputUpdate().
 *  @type {string}
 *  @memberof Input */
let lastInputDevice = 'mouse';

/** Screen-pixel mouse movement per frame that counts as "using the mouse"
 *  (so sub-pixel hand jitter doesn't steal focus from the keyboard/gamepad).
 *  @type {number}
 *  @default
 *  @memberof Input */
let inputMouseMoveThreshold = 6;

/** Prevents input continuing to the default browser handling (true by default)
 *  @type {boolean}
 *  @memberof Input */
let inputPreventDefault = true;

/** Primary gamepad index, automatically set to first gamepad with input
 *  @type {number}
 *  @memberof Input */
let gamepadPrimary = 0;

/** True if a touch device has been detected
 *  @memberof Input */
const isTouchDevice = !headlessMode && window.ontouchstart !== undefined;

/** Prevents input continuing to the default browser handling
 *  This is useful to disable for html menus so the browser can handle input normally
 *  @param {boolean} preventDefault
 *  @memberof Input */
function setInputPreventDefault(preventDefault=true) { inputPreventDefault = preventDefault; }

/** Set the screen-pixel mouse movement per frame that counts as using the mouse
 *  @param {number} threshold
 *  @memberof Input */
function setInputMouseMoveThreshold(threshold) { inputMouseMoveThreshold = threshold; }

/** @return {boolean} - Is the mouse the most recently used input device?    @memberof Input */
function usingMouseInput()    { return lastInputDevice === 'mouse'; }
/** @return {boolean} - Is the keyboard the most recently used input device? @memberof Input */
function usingKeyboardInput() { return lastInputDevice === 'keyboard'; }
/** @return {boolean} - Is a gamepad the most recently used input device?    @memberof Input */
function usingGamepadInput()  { return lastInputDevice === 'gamepad'; }

/** Clears an input key state
 *  @param {string|number} key
 *  @param {number} [device]
 *  @param {boolean} [clearDown=true]
 *  @param {boolean} [clearPressed=true]
 *  @param {boolean} [clearReleased=true]
 *  @memberof Input */
function inputClearKey(key, device=0, clearDown=true, clearPressed=true, clearReleased=true)
{
    if (!inputData[device])
        return;
    inputData[device][key] &= ~((clearDown?1:0)|(clearPressed?2:0)|(clearReleased?4:0));
}

/** Clears all input
 *  @memberof Input */
function inputClear()
{
    inputData.length = 0;
    inputData[0] = [];
    touchGamepadButtons.length = 0;
    touchGamepadSticks.length = 0;
    touchGamepadStickPointerId.length = 0; // release floating sticks so they re-anchor
    gamepadStickData.length = 0;
    gamepadDpadData.length = 0;
    gamepadAxisCentered.length = 0;
}

///////////////////////////////////////////////////////////////////////////////

/** Returns true if device key is down
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyIsDown(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 1);
}

/** Returns true if device key was pressed this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasPressed(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 2);
}

/** Returns true if device key was released this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasReleased(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 4);
}

/** Returns input vector from arrow keys or WASD if enabled
 *  @param {string} [up]
 *  @param {string} [down]
 *  @param {string} [left]
 *  @param {string} [right]
 *  @return {Vector2}
 *  @memberof Input */
function keyDirection(up='ArrowUp', down='ArrowDown', left='ArrowLeft', right='ArrowRight')
{
    ASSERT(isStringLike(up),    'up key must be a string');
    ASSERT(isStringLike(down),  'down key must be a string');
    ASSERT(isStringLike(left),  'left key must be a string');
    ASSERT(isStringLike(right), 'right key must be a string');
    const k = (key)=> keyIsDown(key) ? 1 : 0;
    return vec2(k(right) - k(left), k(up) - k(down));
}

/** Returns true if mouse button is down
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseIsDown(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyIsDown(button);
}

/** Returns true if mouse button was pressed
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasPressed(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyWasPressed(button);
}

/** Returns true if mouse button was released
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasReleased(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyWasReleased(button);
}

/** Returns true if gamepad button is down
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadIsDown(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyIsDown(button, gamepad+1);
}

/** Returns true if gamepad button was pressed
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasPressed(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyWasPressed(button, gamepad+1);
}

/** Returns true if gamepad button was released
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasReleased(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyWasReleased(button, gamepad+1);
}

/** Returns gamepad stick value
 *  @param {number} stick
 *  @param {number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadStick(stick, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(stick), 'stick must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadStickData[gamepad]?.[stick] ?? vec2();
}

/** Returns gamepad dpad value
 *  @param {number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadDpad(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadDpadData[gamepad] ?? vec2();
}

/** Returns true if passed in gamepad is connected
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadConnected(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return !!inputData[gamepad+1];
}

/** Returns how many control sticks the passed in gamepad has
 *  @param {number} [gamepad]
 *  @return {number}
 *  @memberof Input */
function gamepadStickCount(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadStickData[gamepad]?.length ?? 0;
}

/** Pulse a gamepad's vibration hardware using the dual-rumble effect if it exists
 *  Strong magnitude is usually the left side motor, weak magnitude is usually the right side motor
 *  @param {number} [gamepad] - gamepad index
 *  @param {number} [duration] - effect duration in ms
 *  @param {number} [strongMagnitude] - strong (left) motor intensity, 0 to 1
 *  @param {number} [weakMagnitude] - weak (right) motor intensity, 0 to 1
 *  @param {number} [startDelay] - delay in ms before the effect starts
 *  @memberof Input */
function gamepadVibrate(gamepad=gamepadPrimary, duration=200, strongMagnitude=1, weakMagnitude=1, startDelay=0)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    if (!vibrateEnable || headlessMode) return;
    const pad = navigator?.getGamepads?.()[gamepad];
    pad?.vibrationActuator?.playEffect?.('dual-rumble', {duration, strongMagnitude, weakMagnitude, startDelay});
}

/** Stop vibration on a gamepad
 *  @memberof Input */
function gamepadVibrateStop(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    if (!vibrateEnable || headlessMode) return;
    const pad = navigator?.getGamepads?.()[gamepad];
    pad?.vibrationActuator?.reset?.();
}

///////////////////////////////////////////////////////////////////////////////

/** Pulse the vibration hardware if it exists
 *  @param {number|Array} [pattern] - single value in ms or vibration interval array
 *  @memberof Input */
function vibrate(pattern=100)
{
    ASSERT(isNumber(pattern) || isArray(pattern), 'pattern must be a number or array');
    vibrateEnable && !headlessMode && navigator?.vibrate?.(pattern);
}

/** Cancel any ongoing vibration
 *  @memberof Input */
function vibrateStop() { vibrate(0); }

///////////////////////////////////////////////////////////////////////////////
// Pointer Lock

/** Request to lock the pointer, does not work on touch devices
 *  @memberof Input */
function pointerLockRequest()
{ !isTouchDevice && mainCanvas.requestPointerLock?.(); }

/** Request to unlock the pointer
 *  @memberof Input */
function pointerLockExit()
{ document.exitPointerLock?.(); }

/** Check if pointer is locked (true if locked)
 *  @return {boolean}
 *  @memberof Input */
function pointerLockIsActive()
{ return document.pointerLockElement === mainCanvas; }

///////////////////////////////////////////////////////////////////////////////
// Input variables used by engine

// input uses bit field for each key: 1=isDown, 2=wasPressed, 4=wasReleased
// mouse and keyboard stored in device 0, gamepads stored in devices > 0
const inputData = [[]];

// gamepad internal variables
const gamepadStickData = [], gamepadDpadData = [], gamepadHadInput = [];
// per gamepad, how many consecutive frames each axis has rested inside the
// dead zone, used to tell stick axes from axes that rest at full deflection
const gamepadAxisCentered = [];
// how long an axis must rest inside the dead zone before it counts as a stick
const gamepadAxisCenteredFrames = 15;

// touch gamepad internal variables
const touchGamepadTimer = new Timer, touchGamepadButtons = [], touchGamepadSticks = [];
// floating stick anchors (stage-local CSS pixels) and owning pointer ids, indexed by stick (0=left, 1=right)
const touchGamepadStickAnchors = [], touchGamepadStickPointerId = [];
// pointerId -> control role ('stick0', 'stick1', 'face<n>', or 'start')
const touchGamepadPointerRole = new Map();
// overlay DOM elements (created lazily on touch devices) and cached SVG shapes
let touchGamepadOverlay, touchGamepadStage, touchGamepadSvg, touchGamepadSvgEls;
let touchGamepadSideZones = [], touchGamepadZoneC;
let touchGamepadNeedRelayout = true, touchGamepadLastLayout;

///////////////////////////////////////////////////////////////////////////////
// Input system functions used by engine

function inputInit()
{
    if (headlessMode) return;

    // add event listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('wheel', onMouseWheel, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('blur', onBlur);

    // init touch input
    if (isTouchDevice && touchInputEnable)
        touchInputInit();

    function onKeyDown(e)
    {
        if (!e.repeat)
        {
            inputData[0][e.code] = 3;
            if (inputWASDEmulateDirection)
                inputData[0][remapKey(e.code)] = 3;
        }

        // try to prevent default browser handling of input
        if (!inputPreventDefault || !e.cancelable || !document.hasFocus()) return;

        // don't break browser shortcuts
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // don't interfere with user typing into UI fields
        if (isTextInput(e.target) || isTextInput(document.activeElement)) return;

        // fix browser setting "Search for text when you start typing"
        const printable = typeof e.key === 'string' && e.key.length === 1;

        // prevent arrow key and other default keys from messing with stuff
        const preventDefaultKeys = 
        [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', // scrolling
            'Space',        // page down scroll
            'Tab',          // focus navigation
            'Backspace',    // browser back
        ];
        if (preventDefaultKeys.includes(e.code) || printable)
            e.preventDefault();
                    
        function isTextInput(element)
        {
            const tag = element?.tagName;
            const editable = element?.isContentEditable;
            return editable || ['INPUT','TEXTAREA','SELECT'].includes(tag);
        }
    }
    function onKeyUp(e)
    {
        inputData[0][e.code] = (inputData[0][e.code]&2) | 4;
        if (inputWASDEmulateDirection)
        {
            const remap = remapKey(e.code);
            inputData[0][remap] = (inputData[0][remap]&2) | 4;
        }
    }
    function remapKey(k)
    {
        // handle remapping wasd keys to directions
        return inputWASDEmulateDirection ?
            k === 'KeyW' ? 'ArrowUp' :
            k === 'KeyS' ? 'ArrowDown' :
            k === 'KeyA' ? 'ArrowLeft' :
            k === 'KeyD' ? 'ArrowRight' : k : k;
    }
    function onMouseDown(e)
    {
        if (isTouchDevice && touchInputEnable) return;

        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        inputData[0][e.button] = 3;

        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));

        if (inputPreventDefault && e.cancelable && document.hasFocus())
            e.preventDefault();
    }
    function onMouseUp(e)
    {
        if (isTouchDevice && touchInputEnable) return;

        inputData[0][e.button] = (inputData[0][e.button]&2) | 4;
    }
    function onMouseMove(e)
    {
        mouseInWindow = true;
        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));

        // when pointer is locked use movementX/Y for delta
        const movement = pointerLockIsActive() ?
            vec2(e.movementX, e.movementY) :
            mousePosScreen.subtract(mousePosScreenLast);
        mouseDeltaScreen = mouseDeltaScreen.add(movement);
    }
    function onMouseLeave() { mouseInWindow = false; } // mouse moved off window
    function onMouseWheel(e)
    {
        // accumulate so multiple wheel events in one frame are not lost
        if (!e.ctrlKey)
            mouseWheel += sign(e.deltaY);
        if (inputPreventDefault && e.cancelable && document.hasFocus())
            e.preventDefault(); // prevent page scrolling
    }
    function onContextMenu(e) { e.preventDefault(); } // prevent right click menu
    function onBlur()
    {
        inputClear();
        // release any held virtual gamepad controls so they don't stick
        touchGamepadPointerRole.clear();
        touchGamepadButtons.length = 0;
        touchGamepadSticks.length = 0;
        touchGamepadStickPointerId.length = 0;
    }

    // enable touch input mouse passthrough
    function touchInputInit()
    {
        // add non passive touch event listeners
        document.addEventListener('touchstart', (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchmove',  (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchend',   (e)=> handleTouch(e), { passive: false });

        // handle all touch events the same way
        let wasTouching, touchIdentifier;
        function handleTouch(e)
        {
            if (!touchInputEnable) return;

            // fix stalled audio requiring user interaction
            if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
                audioContext.resume();

            // when the touch gamepad is enabled it owns touch input: suppress the
            // touch->mouse passthrough entirely unless touchGamepadPassthrough is set
            // (its own zones drive gameplay via pointer events)
            if (!touchGamepadEnable || touchGamepadPassthrough)
            {
                // touches that landed on a virtual gamepad zone are owned by the gamepad
                // (handled by its own pointer listeners) and must not drive the game mouse
                const isGamepadTouch = (t)=>
                    touchGamepadSideZones.includes(t.target) || t.target === touchGamepadZoneC;
                const gameTouches = [];
                for (const t of e.touches)
                    if (!isGamepadTouch(t)) gameTouches.push(t);

                // check if touching and pass to mouse events
                const touching = gameTouches.length;
                const button = 0; // all touches are left mouse button
                if (touching)
                {
                    // set event pos and pass it along
                    const pos = vec2(gameTouches[0].clientX, gameTouches[0].clientY);
                    const mousePosScreenLast = mousePosScreen;
                    mousePosScreen = mouseEventToScreen(pos);
                    if (wasTouching && gameTouches[0].identifier === touchIdentifier)
                        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
                    else if (!wasTouching)
                        inputData[0][button] = 3;
                    touchIdentifier = gameTouches[0].identifier;
                }
                else if (wasTouching)
                    inputData[0][button] = inputData[0][button] & 2 | 4;

                // set was touching
                wasTouching = touching;
            }

            // prevent default handling like copy, magnifier lens, and scrolling
            if (inputPreventDefault && e.cancelable && document.hasFocus())
                e.preventDefault();

            // must return true so the document will get focus
            return true;
        }

    }

    // convert a mouse or touch event position to screen space
    function mouseEventToScreen(mousePos)
    {
        const rect = mainCanvas.getBoundingClientRect();
        const px = percent(mousePos.x, rect.left, rect.right);
        const py = percent(mousePos.y, rect.top, rect.bottom);
        return vec2(px*mainCanvasSize.x, py*mainCanvasSize.y);
    }
}

function inputUpdate()
{
    if (headlessMode) return;

    // clear input when lost focus (prevent stuck keys)
    if (!(touchInputEnable && isTouchDevice) && !document.hasFocus())
        inputClear();

    // update mouse world space position and delta
    mousePos = screenToWorld(mousePosScreen);
    mouseDelta = screenToWorldDelta(mouseDeltaScreen);

    // build the touch gamepad overlay lazily once enabled on a touch device
    touchGamepadInit();

    // update gamepads if enabled
    gamepadsUpdate();

    // update most recently used input device
    updateLastInputDevice();

    function updateLastInputDevice()
    {
        // mouse: any button held or moved
        const mouseActive = mouseIsDown(0) || mouseIsDown(1) || mouseIsDown(2) || mouseDeltaScreen.length() > inputMouseMoveThreshold;

        // gamepad: any button held or stick moved
        let gamepadActive = false;
        for (let s = gamepadStickCount(); s-- && !gamepadActive;)
            gamepadActive = gamepadStick(s).lengthSquared() > .2;
        for (let b = 17; b-- && !gamepadActive;)
            gamepadActive = gamepadIsDown(b);

        // keyboard: any non-mouse key down
        let keyboardActive = false;
        for (const k in inputData[0])
            if (isNaN(+k) && (inputData[0][k] & 1))
            {
                keyboardActive = true;
                break;
            }

        // update the last input
        if (gamepadActive)
            lastInputDevice = 'gamepad';
        else if (mouseActive)
            lastInputDevice = 'mouse';
        else if (keyboardActive)
            lastInputDevice = 'keyboard';

        // set flag if gamepad is last device
        isUsingGamepad = lastInputDevice === 'gamepad';
    }

    // gamepads are updated by engine every frame automatically
    function gamepadsUpdate()
    {
        const deadZoneMin=.3, deadZoneMax=.8;
        const applyDeadZones = (v)=>
        {
            const deadZone = (v)=>
                v > deadZoneMin ? percent(v, deadZoneMin, deadZoneMax) :
                v < -deadZoneMin ? -percent(-v, deadZoneMin, deadZoneMax) : 0;
            return vec2(deadZone(v.x), deadZone(-v.y)).clampLength();
        };

        // update touch gamepad if enabled
        if (touchGamepadEnable && isTouchDevice)
        {
            // a side is either a stick or buttons - setting both is ambiguous
            ASSERT(!touchGamepadLeftStick || !touchGamepadLeftButtonCount,
                'set touchGamepadLeftStick or touchGamepadLeftButtonCount, not both');
            ASSERT(!touchGamepadRightStick || !touchGamepadButtonCount,
                'set touchGamepadRightStick or touchGamepadButtonCount, not both');

            if (!touchGamepadTimer.isSet()) return;

            // read virtual analog stick
            gamepadPrimary = 0; // touch gamepad uses index 0
            const sticks = gamepadStickData[0] ?? (gamepadStickData[0] = []);
            const dpad = gamepadDpadData[0] ?? (gamepadDpadData[0] = vec2());
            sticks.length = 0; // only report sticks that are enabled
            dpad.set();
            // read each side's directional stick (analog, or quantized to an 8 way dpad)
            for (let side = 0; side < 2; side++)
            {
                if (!touchGamepadSideStick(side)) continue;
                const out = touchGamepadStickOut(side);
                sticks[out] = vec2();
                const touchStick = touchGamepadSticks[side] ?? vec2();
                if (touchGamepadAnalog)
                    sticks[out] = applyDeadZones(touchStick);
                else if (touchStick.lengthSquared() > .3)
                {
                    const x = clamp(round(touchStick.x), -1, 1);
                    const y = clamp(round(touchStick.y), -1, 1);
                    sticks[out] = vec2(x, -y).clampLength(); // clamp to circle
                    if (!out) dpad.set(x, -y); // the primary (stick 0) also drives the dpad vector
                }
            }

            // read virtual gamepad buttons
            const data = inputData[1] ?? (inputData[1] = []);
            for (let i=12; i--;)
            {
                const wasDown = gamepadIsDown(i,0);
                data[i] = touchGamepadButtons[i] ? wasDown ? 1 : 3 : wasDown ? 4 : 0;

                // haptic tap when a face button or start button is first pressed (3 = newly down)
                // skip stick touches (10, 11) so movement doesn't buzz
                if (touchGamepadVibration && data[i] === 3 &&
                    (i === 9 || touchGamepadIsFaceButton(i)))
                    vibrate(touchGamepadVibration);
            }

            // disable normal gamepads when touch gamepad is active
            return;
        }

        // return if gamepads are disabled or not supported
        try {
            // protect against getGamepads disallowed security error 
            if (!gamepadsEnable || !navigator?.getGamepads)
                return;
        } catch(e) {
            return;
        }

        // only poll gamepads when focused or in debug mode
        if (!debug && !document.hasFocus()) return;

        // poll gamepads
        const maxGamepads = 8;
        const gamepads = navigator.getGamepads();
        const gamepadCount = min(maxGamepads, gamepads.length);
        for (let i=0; i<gamepadCount; ++i)
        {
            // get or create gamepad data
            const gamepad = gamepads[i];
            if (!gamepad)
            {
                // clear gamepad data if not connected
                inputData[i+1] = undefined;
                gamepadStickData[i] = undefined;
                gamepadDpadData[i] = undefined;
                gamepadHadInput[i] = undefined;
                gamepadAxisCentered[i] = undefined;
                continue;
            }

            const data = inputData[i+1] ?? (inputData[i+1] = []);
            const sticks = gamepadStickData[i] ?? (gamepadStickData[i] = []);
            const dpad = gamepadDpadData[i] ?? (gamepadDpadData[i] = vec2());

            // read analog sticks
            // gamepads without standard mapping (steering wheels, flight sticks)
            // can report axes that rest at full deflection instead of center,
            // which would otherwise read as a stick held down forever, so only
            // trust an axis once it has rested inside the dead zone for a moment
            const isStandard = gamepad.mapping === 'standard';
            const centered = gamepadAxisCentered[i] ?? (gamepadAxisCentered[i] = []);
            const readAxis = (j)=>
            {
                const v = gamepad.axes[j];
                if (isStandard && j < 4)
                    return v; // spec guarantees axes 0-3 are the two sticks
                if (!gamepadAxisFilterEnable)
                    return v;

                // once an axis has proven it rests at center it stays trusted,
                // otherwise moving it would immediately disqualify it again
                const frames = centered[j] | 0;
                if (frames > gamepadAxisCenteredFrames)
                    return v;
                centered[j] = abs(v) < deadZoneMin ? frames + 1 : 0;
                return 0;
            };
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = applyDeadZones(vec2(readAxis(j), readAxis(j+1)));

            // read buttons
            let hadInput = false;
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                const wasDown = gamepadIsDown(j,i);
                data[j] = button.pressed ? wasDown ? 1 : 3 : wasDown ? 4 : 0;

                // check for any input on this gamepad, analog must be full press
                if (button.pressed && (!button.value || button.value > .9))
                    hadInput = true;
            }
            
            // set new primary gamepad if current is not connected
            if (hadInput)
            {
                gamepadHadInput[i] = true;
                if (!gamepadHadInput[gamepadPrimary])
                    gamepadPrimary = i;
            }

            if (gamepad.mapping === 'standard')
            {
                // get dpad buttons (standard mapping)
                dpad.set(
                    (gamepadIsDown(15,i)&&1) - (gamepadIsDown(14,i)&&1),
                    (gamepadIsDown(12,i)&&1) - (gamepadIsDown(13,i)&&1));
            }

            // copy dpad to left analog stick when pressed
            if (gamepadDirectionEmulateStick && (dpad.x || dpad.y))
                sticks[0] = dpad.clampLength();
        }

        // disable touch gamepad if using real gamepad
        touchGamepadEnable && isUsingGamepad && touchGamepadTimer.unset();
    }
}

function inputUpdatePost()
{
    if (headlessMode) return;

    // clear input to prepare for next frame
    for (const deviceInputData of inputData)
    for (const i in deviceInputData)
        deviceInputData[i] &= 1;
    mouseWheel = 0;
    mouseDelta = vec2();
    mouseDeltaScreen = vec2();
}

function inputRender()
{
    touchGamepadRender();
}

///////////////////////////////////////////////////////////////////////////////
// Touch gamepad - full-viewport HTML/SVG overlay driven by Pointer Events

const touchGamepadSvgNS = 'http://www.w3.org/2000/svg';

// build the overlay DOM once; no-op if already built, disabled, headless, or non-touch
function touchGamepadInit()
{
    if (touchGamepadOverlay || !touchGamepadEnable || !isTouchDevice || headlessMode ||
        !document.body) // body may not exist yet; retry on a later frame
        return;

    // full-viewport overlay; only the input zones receive pointer events. The
    // env() padding insets the stage out of notches / home indicators natively.
    const overlay = touchGamepadOverlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:50;pointer-events:none;opacity:0;' +
        'touch-action:none;user-select:none;-webkit-user-select:none;' +
        '-webkit-touch-callout:none;transition:opacity .2s;box-sizing:border-box;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left)';

    // stage fills the padded (safe-area) content box; all controls live inside it
    const stage = touchGamepadStage = document.createElement('div');
    stage.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none';
    overlay.appendChild(stage);

    // svg draws every visual and never blocks input
    const svg = touchGamepadSvg = document.createElementNS(touchGamepadSvgNS, 'svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
        'pointer-events:none;overflow:visible;fill:none;stroke:#fff;stroke-width:3';
    stage.appendChild(svg);

    // invisible input zones (left stick, right buttons/stick, center start)
    const makeZone = ()=>
    {
        const z = document.createElement('div');
        z.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none';
        z.addEventListener('pointerdown', e=> touchGamepadPointerDown(e, z));
        z.addEventListener('pointermove', e=> touchGamepadPointerMove(e));
        z.addEventListener('pointerup', e=> touchGamepadPointerUp(e));
        z.addEventListener('pointercancel', e=> touchGamepadPointerUp(e));
        stage.appendChild(z);
        return z;
    };
    touchGamepadSideZones[0] = makeZone(); // left
    touchGamepadSideZones[1] = makeZone(); // right
    touchGamepadZoneC = makeZone(); // center/start, appended last so it sits above the sides

    addEventListener('resize', ()=> touchGamepadNeedRelayout = true);
    document.body.appendChild(overlay);
    touchGamepadNeedRelayout = true;
}

// stage-local size in CSS pixels (excludes safe-area insets)
function touchGamepadStageRect() { return touchGamepadStage.getBoundingClientRect(); }

// per-side touch gamepad config (side 0 = left, 1 = right) - the left and right
// sides behave identically, differing only in position and gamepad button indices
function touchGamepadSideStick(side)
{ return side ? touchGamepadRightStick : touchGamepadLeftStick; }
function touchGamepadSideButtonCount(side)
{ return side ? touchGamepadButtonCount : touchGamepadLeftButtonCount; }
// gamepad button index a side's buttons start at (right 0-3, left 4-7)
function touchGamepadSideButtonBase(side)
{ return side ? 0 : 4; }
// output stick index for a side: the right stick uses stick 0 when there is no left stick
function touchGamepadStickOut(side)
{ return side && touchGamepadLeftStick ? 1 : 0; }
// true if the side has any control (a stick or at least one button)
function touchGamepadSideHasControl(side)
{ return touchGamepadSideStick(side) || touchGamepadSideButtonCount(side) > 0; }

// true if gamepad button index i is an active touch gamepad face/single button
function touchGamepadIsFaceButton(i)
{
    for (let side = 0; side < 2; side++)
    {
        const base = touchGamepadSideButtonBase(side);
        if (!touchGamepadSideStick(side) &&
            i >= base && i < base + touchGamepadSideButtonCount(side))
            return true;
    }
    return false;
}

// center of a side's controls in stage-local CSS pixels (stick rest / button cluster)
// returns the floating stick anchor when that side is an active floating stick
function touchGamepadSideCenter(side, W, H)
{
    if (touchGamepadFloating && touchGamepadSideStick(side) && touchGamepadStickAnchors[side])
        return touchGamepadStickAnchors[side];
    let y = H - touchGamepadSize;
    const count = touchGamepadSideButtonCount(side);
    if (!touchGamepadSideStick(side) && (count === 2 || count === 3))
        y -= touchGamepadSize/4; // nudge a 2/3 button cluster up a bit
    return vec2(side ? W - touchGamepadSize : touchGamepadSize, y);
}

// position the input zones for the current mode and rebuild the SVG visuals
function touchGamepadRelayout()
{
    if (!touchGamepadOverlay) return;
    const r = touchGamepadStageRect();
    const W = r.width, H = r.height, S = touchGamepadSize;
    const setZone = (z, css)=> z.style.cssText =
        'position:absolute;pointer-events:auto;touch-action:none;' + css;

    if (paused)
    {
        // the gamepad is hidden while paused, so its side zones must not capture
        // touches - otherwise they silently steal taps from menus and dialogs
        for (const zone of touchGamepadSideZones) zone.style.display = 'none';
        if (touchGamepadCenterButtonSize)
        {
            // any touch presses start
            setZone(touchGamepadZoneC, 'inset:0');
            touchGamepadZoneC.style.display = '';
        }
        else
            touchGamepadZoneC.style.display = 'none';
    }
    else
    {
        // position each side zone (left/right differ only by which edge they hug)
        for (let side = 0; side < 2; side++)
        {
            const zone = touchGamepadSideZones[side], edge = side ? 'right' : 'left';
            zone.style.display = touchGamepadSideHasControl(side) ? '' : 'none';
            if (touchGamepadFloating)
            {
                // bottom 60% grabs the control; the top 40% passes through. A side with no
                // control on the other side uses the full width (matching the hit-test)
                const width = touchGamepadSideHasControl(side ? 0 : 1) ? '50%' : '100%';
                setZone(zone, `${edge}:0;bottom:0;width:${width};height:60%`);
            }
            else // fixed: a compact box hugging the corner control
                setZone(zone, `${edge}:0;bottom:0;width:${3*S}px;height:${3*S}px`);
        }
        touchGamepadZoneC.style.display = touchGamepadCenterButtonSize ? '' : 'none';
        const c = touchGamepadCenterButtonSize;
        setZone(touchGamepadZoneC,
            `left:50%;top:50%;width:${2*c}px;height:${2*c}px;transform:translate(-50%,-50%)`);
    }

    touchGamepadBuildSvg(W, H);
    touchGamepadNeedRelayout = false;
}

// (re)build the SVG shapes for the current layout; dynamic bits update per-frame
function touchGamepadBuildSvg(W, H)
{
    const svg = touchGamepadSvg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const els = touchGamepadSvgEls = { face: [], thumb: [] };
    const S = touchGamepadSize;
    const circle = (cx, cy, rr, fill)=>
    {
        const c = document.createElementNS(touchGamepadSvgNS, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', rr);
        if (fill) c.setAttribute('fill', fill);
        svg.appendChild(c);
        return c;
    };
    const cross = (ctr)=>
    {
        // plus-shaped dpad outline centered at ctr
        const a = S*.18, b = S*.5, x = ctr.x, y = ctr.y;
        const p = document.createElementNS(touchGamepadSvgNS, 'path');
        p.setAttribute('d',
            `M ${x-a} ${y-b} H ${x+a} V ${y-a} H ${x+b} V ${y+a} H ${x+a} ` +
            `V ${y+b} H ${x-a} V ${y+a} H ${x-b} V ${y-a} H ${x-a} Z`);
        svg.appendChild(p);
    };

    // draw each side: a directional stick, a single large button, or face buttons
    for (let side = 0; side < 2; side++)
    {
        const count = touchGamepadSideButtonCount(side);
        const base = touchGamepadSideButtonBase(side);
        const ctr = touchGamepadSideCenter(side, W, H);
        if (touchGamepadSideStick(side))
        {
            // directional stick (circle or cross) with a thumb dot that moves per-frame
            if (touchGamepadAnalog) circle(ctr.x, ctr.y, S/2); else cross(ctr);
            els.thumb[side] = circle(ctr.x, ctr.y, S/4, '#fff');
        }
        else if (count === 1)
            els.face[base] = circle(ctr.x, ctr.y, S/2, '#000'); // single large button
        else for (let i = 0; i < count; i++)
        {
            const j = mod(i-1, 4);
            let button = count > 2 ? j : min(j, count-1);
            button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
            const offset = vec2().setDirection(j, S/2);
            if (count === 2) offset.x *= -1;
            // left side mirrors the right layout's positions, keeping indices in order
            // (e.g. 2 buttons -> button 4 at bottom, button 5 at left)
            if (!side) offset.x *= -1;
            const pos = ctr.add(offset);
            els.face[base + button] = circle(pos.x, pos.y, S/4, '#000');
        }
    }

    // debug: draw the proximity hit regions the hit-test actually uses
    if (debug && debugGamepads) touchGamepadBuildDebug(W, H);
}

// draw debug outlines of the touch control hit regions into the overlay svg
function touchGamepadBuildDebug(W, H)
{
    const S = touchGamepadSize, svg = touchGamepadSvg;
    const shape = (tag, attrs, stroke)=>
    {
        const el = document.createElementNS(touchGamepadSvgNS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', 2);
        el.setAttribute('fill', 'none');
        svg.appendChild(el);
    };
    const ring = (c, rr, stroke)=> shape('circle', {cx:c.x, cy:c.y, r:rr}, stroke);

    // green line: the left/right split that assigns a stick press to a side
    shape('line', {x1:W/2, y1:0, x2:W/2, y2:H}, '#0f0');

    // cyan: where each side's control can be grabbed
    for (let side = 0; side < 2; side++)
    {
        if (touchGamepadSideStick(side))
        {
            if (touchGamepadFloating)
            {
                // grab region: this side's half (or the full width if the other side is empty)
                const top = H*.4, full = !touchGamepadSideHasControl(side ? 0 : 1);
                const x = full ? 0 : (side ? W/2 : 0);
                shape('rect', {x, y:top, width:full ? W : W/2, height:H-top}, '#0ff');
            }
            else
                ring(touchGamepadSideCenter(side, W, H), 2*S, '#0ff');
        }
        else if (touchGamepadSideButtonCount(side) >= 1)
            ring(touchGamepadSideCenter(side, W, H), S, '#0ff'); // face / single-button radius
    }

    // yellow: start button radius; magenta: where start is blocked (near a control)
    if (touchGamepadCenterButtonSize)
    {
        ring(vec2(W/2, H/2), touchGamepadCenterButtonSize, '#ff0');
        for (let side = 0; side < 2; side++)
            if (touchGamepadSideHasControl(side))
                ring(touchGamepadSideCenter(side, W, H), 2*S, '#f0f');
    }
}

// per-frame: fade the overlay and move the thumbs / set pressed states
function touchGamepadRender()
{
    if (!touchGamepadOverlay || headlessMode) return;

    // hide and bail if disabled at runtime (overlay stays in the DOM for reuse)
    // display:none also takes the input zones out of hit-testing so touches are
    // not silently captured away from the game while disabled
    if (!touchGamepadEnable || !isTouchDevice)
    {
        if (touchGamepadOverlay.style.display !== 'none')
        {
            // just disabled: hide the overlay and release any held controls
            touchGamepadOverlay.style.display = 'none';
            touchGamepadPointerRole.clear();
            touchGamepadButtons.length = 0;
            touchGamepadSticks.length = 0;
            touchGamepadStickPointerId.length = 0;
        }
        return;
    }
    touchGamepadOverlay.style.display = '';

    // relayout when the paused state, a layout setting, or the debug view changes
    const dbg = debug && debugGamepads;
    const layout = [touchGamepadButtonCount, touchGamepadLeftButtonCount, touchGamepadLeftStick,
        touchGamepadRightStick, touchGamepadAnalog, touchGamepadSize, touchGamepadFloating,
        touchGamepadCenterButtonSize, paused, dbg].join();
    if (layout !== touchGamepadLastLayout)
    {
        touchGamepadLastLayout = layout;
        touchGamepadNeedRelayout = true;
    }
    // relayout before the visibility bail-out so the paused full-screen start zone applies
    if (touchGamepadNeedRelayout) touchGamepadRelayout();

    // fade out when idle (always show when displayTime is 0, or while debugging)
    const fade = touchGamepadDisplayTime ?
        percent(touchGamepadTimer.get(), touchGamepadDisplayTime+1, touchGamepadDisplayTime) : 1;
    const visible = dbg || (touchGamepadTimer.isSet() && fade > 0 && !paused);
    touchGamepadOverlay.style.opacity = !visible ? 0 : dbg ? 1 : fade*touchGamepadAlpha;
    if (!visible) return;

    const r = touchGamepadStageRect();
    const W = r.width, H = r.height, S = touchGamepadSize;
    const els = touchGamepadSvgEls;
    if (!els) return;

    for (let side = 0; side < 2; side++)
        if (touchGamepadSideStick(side) && els.thumb[side])
        {
            const ctr = touchGamepadSideCenter(side, W, H);
            const t = ctr.add((touchGamepadSticks[side] ?? vec2()).scale(S/2));
            els.thumb[side].setAttribute('cx', t.x);
            els.thumb[side].setAttribute('cy', t.y);
        }
    for (let i = 0; i < els.face.length; i++)
        if (els.face[i])
            els.face[i].setAttribute('fill', touchGamepadButtons[i] ? '#fff' : '#000');
}

// convert a pointer event to stage-local CSS pixels
function touchGamepadEventPos(e)
{
    const r = touchGamepadStageRect();
    return vec2(e.clientX - r.left, e.clientY - r.top);
}

// set a directional stick from a stage-local point and flag its stick-touch button
// (stick 0 press = button 10, stick 1 press = button 11, following the output index)
function touchGamepadApplyStick(side, p)
{
    const delta = p.subtract(touchGamepadStickAnchors[side]);
    touchGamepadSticks[side] = delta.scale(2/touchGamepadSize).clampLength();
    touchGamepadButtons[touchGamepadStickOut(side) ? 11 : 10] = 1;
}

// pick a side's gamepad button index from a stage-local point, or -1 if outside the cluster
function touchGamepadFaceButtonAt(side, p, W, H)
{
    const count = touchGamepadSideButtonCount(side);
    const base = touchGamepadSideButtonBase(side);
    const bc = touchGamepadSideCenter(side, W, H);
    if (bc.distance(p) >= touchGamepadSize) return -1;
    if (count === 1) return base; // single large button
    const d = bc.subtract(p);
    if (!side) d.x *= -1; // left side mirrors the right layout's positions horizontally
    let button = count === 2 ? (d.x < d.y ? 1 : 0) : mod(d.direction()+2, 4);
    button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
    return button < count ? base + button : -1;
}

// pick which control a stage-local press activates, by priority then proximity,
// independent of which zone element captured it - so overlapping zones on small
// screens resolve to the nearest control instead of whichever zone is topmost
// returns {role:'stick', side} or {role:'face', btn} or {role:'start'} or undefined
function touchGamepadControlAt(p, W, H)
{
    const S = touchGamepadSize;
    const leftHalf = p.x < W/2;
    const floatTop = H*.4; // floating grab region is the bottom 60% of the screen

    // check each side (left first for priority); a side is a stick or buttons
    for (let side = 0; side < 2; side++)
    {
        const onHalf = side ? !leftHalf : leftHalf;
        if (touchGamepadSideStick(side))
        {
            // a side with no control on the other side uses the full width
            const otherControl = touchGamepadSideHasControl(side ? 0 : 1);
            const grab = touchGamepadFloating ?
                (!otherControl || onHalf) && p.y > floatTop :
                onHalf && touchGamepadSideCenter(side, W, H).distance(p) < 2*S;
            if (grab) return {role:'stick', side};
        }
        else if (touchGamepadSideButtonCount(side) >= 1)
        {
            const btn = touchGamepadFaceButtonAt(side, p, W, H);
            if (btn >= 0) return {role:'face', btn};
        }
    }

    // center start button, blocked within 2*size of a control so drift off a
    // control can't accidentally fire start (matches the original exclusion logic)
    if (touchGamepadCenterButtonSize)
    {
        for (let side = 0; side < 2; side++)
            if (touchGamepadSideHasControl(side) &&
                touchGamepadSideCenter(side, W, H).distance(p) < 2*S)
                return;
        if (vec2(W/2, H/2).distance(p) < touchGamepadCenterButtonSize)
            return {role:'start'};
    }
}

function touchGamepadPointerDown(e, zone)
{
    if (!touchGamepadEnable) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    touchGamepadTimer.set();

    // resume audio on first interaction
    if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
        audioContext.resume();

    // while paused, any touch is the start button
    if (paused)
    {
        if (touchGamepadCenterButtonSize)
        {
            touchGamepadButtons[9] = 1;
            touchGamepadPointerRole.set(e.pointerId, 'start');
        }
        return;
    }

    const r = touchGamepadStageRect();
    const W = r.width, H = r.height;
    const p = vec2(e.clientX - r.left, e.clientY - r.top);

    // choose the control by proximity/priority, not by which zone captured the touch
    const hit = touchGamepadControlAt(p, W, H);
    if (!hit) return;
    if (hit.role === 'stick')
    {
        const side = hit.side;
        touchGamepadStickAnchors[side] = touchGamepadFloating ? p : touchGamepadSideCenter(side, W, H);
        touchGamepadStickPointerId[side] = e.pointerId;
        touchGamepadPointerRole.set(e.pointerId, 'stick'+side);
        touchGamepadNeedRelayout = true; // base may have re-anchored
        touchGamepadApplyStick(side, p);
    }
    else if (hit.role === 'face')
    {
        touchGamepadButtons[hit.btn] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'face'+hit.btn);
    }
    else // 'start'
    {
        touchGamepadButtons[9] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'start');
    }
}

function touchGamepadPointerMove(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const p = touchGamepadEventPos(e);
    if (role === 'stick0' || role === 'stick1')
        touchGamepadApplyStick(role === 'stick1' ? 1 : 0, p);
    // face buttons & start are held until release (no slide-between this pass)
}

function touchGamepadPointerUp(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    touchGamepadPointerRole.delete(e.pointerId);
    if (role === 'stick0' || role === 'stick1')
    {
        const side = role === 'stick1' ? 1 : 0;
        touchGamepadStickPointerId[side] = undefined;
        touchGamepadSticks[side] = vec2();
        delete touchGamepadButtons[touchGamepadStickOut(side) ? 11 : 10];
    }
    else if (role === 'start')
        delete touchGamepadButtons[9];
    else // 'face<n>'
        delete touchGamepadButtons[+role.slice(4)];
    touchGamepadTimer.set();
}
/**
 * LittleJS Audio System
 * - Play audio files (mp3, ogg, wave) and generate sounds with ZzFX
 * - ZzFX sound generator integration: <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX</a>
 * - Sound caching for fast playback and memory efficiency
 * - Volume control with attenuation and stereo panning
 * - 2D spatial audio based on camera position with distance-based falloff
 * - Sound instance management (pause, resume, stop)
 * - Speech synthesis for text-to-speech
 * - Music playback with ZzFXM support
 * - Web Audio API integration with master gain control
 * - Sounds and the master bus can route through effects, see the audio effects plugin
 * @namespace Audio
 */

/** Audio context used by the engine
 *  @type {AudioContext}
 *  @memberof Audio */
let audioContext = new AudioContext;

/** Master gain node for all audio to pass through, made at load so effects can connect to it any time
 *  @type {GainNode}
 *  @memberof Audio */
let audioMasterGain = audioContext.createGain();
audioMasterGain.connect(audioContext.destination);
audioMasterGain.gain.value = soundVolume; // set starting value

// the current master effect, kept so setAudioMasterEffect can undo the route it made,
// and whether its output came from an effect, which gets its default route back
let audioMasterEffectInput, audioMasterEffectOutput, audioMasterEffectOutputIsEffect;

/** Default sample rate used for sounds
 *  @default 44100
 *  @memberof Audio */
const audioDefaultSampleRate = 44100;

/** Check if the audio context is running and available for playback
 *  @return {boolean} - True if the audio context is running
 *  @memberof Audio */
function audioIsRunning()
{ return audioContext.state === 'running'; }

function audioInit()
{
    if (!soundEnable || headlessMode) return;

    document.addEventListener('visibilitychange', audioVisibilityChange);
}

// a hidden page stops the game, so its sound stops too, and the audio clock with it so every sound picks up
// exactly where it was; only a suspend made here is undone, not one the browser holds until the first input
let audioSuspendedWhenHidden = false;
function audioVisibilityChange()
{
    if (document.hidden)
    {
        if (!soundPauseWhenHidden || audioContext.state != 'running') return;
        audioSuspendedWhenHidden = true;
        audioContext.suspend();
    }
    else if (audioSuspendedWhenHidden)
    {
        audioSuspendedWhenHidden = false;
        audioContext.resume();
    }
}

/** Anything with input and output audio nodes, like an effect from the audio effects plugin
 *  @typedef {{input: AudioNode, output: AudioNode}} AudioEffectNodes
 *  @memberof Audio */

/** Route all sound through an effect between the master gain and the speakers
 *  - Pass a node or an effect, or the first and last of a chain, each a node or an effect
 *  - With one argument a node is both ends, and an effect uses its own input and output
 *  - The output node is disconnected from everything else first, so it only feeds the speakers
 *  - The two ends of a chain must already be connected to each other, like effectA.connect(effectB)
 *  - Call with no arguments to remove the effect, an effect that was the master goes back to feeding the master gain
 *  - Debug video capture records the end of the master chain, but loses its tap if the effect changes mid-capture
 *  @param {AudioNode|AudioEffectNodes} [input] - Node or effect the master gain connects to
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect that connects to the audio destination, defaults to the input's output
 *  @memberof Audio */
function setAudioMasterEffect(input, output)
{
    // an effect stands in for its nodes, and a node is both ends when no output is passed
    // (the output resolves first since its default comes from the input effect)
    const outputArg = output || input;
    const outputIsEffect = !!outputArg && 'input' in outputArg;
    output = audioEffectNode(output, 'output') || audioEffectNode(input, 'output');
    input = audioEffectNode(input, 'input');
    ASSERT(!input || typeof input.connect === 'function', 'input must be an AudioNode or an effect with input and output nodes');
    ASSERT(!output || typeof output.connect === 'function', 'output must be an AudioNode or an effect with input and output nodes');

    // undo the current route, the master gain selectively so other taps on it survive,
    // but the output node from everything since it only ever fed the speakers;
    // an effect's output then goes back to the master gain, its default, so it still works for sounds
    audioMasterGain.disconnect(audioMasterEffectInput || audioContext.destination);
    audioMasterEffectOutput?.disconnect();
    if (audioMasterEffectOutputIsEffect)
        audioMasterEffectOutput.connect(audioMasterGain);
    audioMasterEffectInput = input;
    audioMasterEffectOutput = output;
    audioMasterEffectOutputIsEffect = outputIsEffect;

    // connect the master gain to the speakers, through the effect if there is one
    if (input)
    {
        audioMasterGain.connect(input);
        output.disconnect();
        output.connect(audioContext.destination);
    }
    else
        audioMasterGain.connect(audioContext.destination);
}

// get one of an effect's nodes, or the thing itself when it is already a node
/** @param {AudioNode|AudioEffectNodes|undefined} effectOrNode
 *  @param {'input'|'output'} key
 *  @return {AudioNode} */
function audioEffectNode(effectOrNode, key)
{
    if (effectOrNode && 'input' in effectOrNode)
        return /** @type {AudioEffectNodes} */ (effectOrNode)[key];
    return /** @type {AudioNode} */ (effectOrNode);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Sound Object - Stores a sound for later
 * - this can be used to load and play wave, mp3, and ogg files
 * - it can also create sounds using the ZzFX sound generator
 * - can attenuate and apply stereo panning to sounds
 * - sound instance control with pause/resume capability
 *
 * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 * @memberof Audio
 * @example
 * // load an audio asset file
 * const sound_example = new Sound('sound.mp3');
 *
 * // create a zzfx sound
 * const sound_example = new Sound([.5,.5]);
 *
 * // play a sound
 * sound_example.play();
 */
class Sound
{
    /**
     * @callback SoundLoadCallback - Function called when sound is loaded
     * @param {Sound} sound
     * @memberof Audio
     */
    
    /** Create a sound object and cache the audio for later use
     *  @param {string|Array} [asset] - Filename of audio file or zzfx array
     *  @param {number} [randomness] - How much to randomize frequency each time sound plays, for zzfx sounds the zzfx default is used if undefined
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     *  @param {SoundLoadCallback} [onloadCallback] - callback function to call when sound is loaded
     */
    constructor(asset, randomness, range=soundDefaultRange, taper=soundDefaultTaper, onloadCallback)
    {
        if (!soundEnable || headlessMode) return;

        ASSERT(!asset || isArray(asset) || isStringLike(asset), 'asset must be a file name or zzfx array');
        ASSERT(randomness === undefined || isNumber(randomness), 'randomness must be a number');
        ASSERT(randomness === undefined || randomness >= 0 && randomness <=1, 'randomness must be between 0 and 1');
        ASSERT(isNumber(range), 'range must be a number');
        ASSERT(isNumber(taper), 'taper must be a number');

        /** @property {number} - World space max range of sound */
        this.range = range;
        /** @property {number} - At what percentage of range should it start tapering */
        this.taper = taper;
        /** @property {number} - How much to randomize frequency each time sound plays */
        this.randomness = randomness ?? 0;
        /** @property {number} - Sample rate for this sound */
        this.sampleRate = audioDefaultSampleRate;
        /** @property {number} - How many samples per channel this sound has */
        this.sampleLength = 0;
        /** @property {AudioBuffer} - Decoded audio shared by every play of this sound
         *  @type {AudioBuffer} */
        this.sampleBuffer = undefined;
        /** @private
         *  @type {Array<Array<number>|Float32Array>} */
        this._sampleChannels = undefined;
        /** @property {number} - Percentage of this sound currently loaded, sounds
         *  fetched from a url stay at 0 until decoding completes */
        this.loadedPercent = 0;
        /** @property {SoundLoadCallback} - function to call when sound is loaded */
        this.onloadCallback = onloadCallback;
        /** @property {AudioNode|AudioEffectNodes} - Node or effect to route every play of this sound through instead of the master gain
         *  - Where this sound's audio goes, unlike AudioEffect.output which is an effect's own node, effects chain with connect()
         *  @type {AudioNode|AudioEffectNodes} */
        this.output = undefined;

        if (isArray(asset))
        {
            // generate zzfx sound — copy so we don't mutate the caller's array
            const zzfxSound = asset.slice();

            // remove randomness so it can be applied on playback
            const defaultRandomness = randomness ?? .05;
            const randomnessIndex = 1;
            this.randomness = zzfxSound[randomnessIndex] ?? defaultRandomness;
            zzfxSound[randomnessIndex] = 0;

            // generate the zzfx samples, then hand them to an audio buffer so
            // the plain arrays can be released and every play shares the buffer
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.buildSampleBuffer();
            this.loadedPercent = 1;
            onloadCallback?.(this);
        }
        else if (typeof asset === 'string')
        {
            // load the audio file, report failures rather than leaving an
            // unhandled rejection, the sound just stays unloaded and silent
            const filename = asset;
            this.loadSound(filename).catch(e=>
                LOG('Sound load failed for', filename, '-', e.message));
        }
    }

    /** Sample data for each channel
     *  Sounds keep their samples in an audio buffer, so reading this rebuilds
     *  the arrays from it and caches them. The copies are safe to hold onto,
     *  playing a sound detaches the buffer's own channel arrays.
     *  @type {Array<Array<number>|Float32Array>} */
    get sampleChannels()
    {
        const buffer = this.sampleBuffer;
        if (!this._sampleChannels && buffer)
        {
            const channels = [];
            for (let i = 0; i < buffer.numberOfChannels; i++)
                channels.push(buffer.getChannelData(i).slice());
            this._sampleChannels = channels;
        }
        return this._sampleChannels;
    }

    /** @param {Array<Array<number>|Float32Array>} sampleChannels */
    set sampleChannels(sampleChannels)
    {
        // new samples invalidate the buffer built from the old ones
        this._sampleChannels = sampleChannels;
        this.sampleBuffer = undefined;
        this.sampleLength = sampleChannels?.[0]?.length || 0;
    }

    /** Move this sound's samples into an audio buffer that every play can share
     *  Does nothing if there is already a buffer or no samples to build one from */
    buildSampleBuffer()
    {
        if (this.sampleBuffer || !this._sampleChannels || headlessMode) return;

        this.sampleBuffer = createAudioBuffer(this._sampleChannels, this.sampleRate);

        // the buffer owns the samples now, release the arrays we built it from
        this._sampleChannels = undefined;
    }

    /** Play the sound
     *  Sounds may not play until a user interaction occurs
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop] - Should the sound loop?
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance} - The sound instance, or undefined if sound is disabled, not loaded, or running in headless mode
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false)
    {
        ASSERT(!pos || isVector2(pos), 'pos must be a vec2');
        ASSERT(isNumber(volume), 'volume must be a number');
        ASSERT(isNumber(pitch), 'pitch must be a number');
        ASSERT(isNumber(randomnessScale), 'randomnessScale must be a number');

        if (!soundEnable || headlessMode) return;
        if (!this.sampleBuffer && !this._sampleChannels) return;

        let pan;
        if (pos)
        {
            const range = this.range;
            if (range)
            {
                // apply range based fade
                const lengthSquared = cameraPos.distanceSquared(pos);
                if (lengthSquared > range*range)
                    return; // out of range

                // attenuate volume by distance
                volume *= percent(lengthSquared**.5, range, range*this.taper);
            }

            // get pan from screen space coords
            pan = worldToScreen(pos).x * 2/mainCanvasSize.x - 1;
        }
        
        // Create sound instance
        const rate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        const instance = new SoundInstance(this, volume, rate, pan, loop, paused);

        if (debug && debugSound && pos)
        {
            // visualize where positioned sounds play and their falloff range
            debugCircle(pos, .5, '#0ff', .5, true);
            if (this.range)
            {
                debugCircle(pos, 2*this.range, '#0ff', .5);            // silent radius
                debugCircle(pos, 2*this.range*this.taper, '#0ff', .5); // full volume radius
            }
            debugText('vol '+volume.toFixed(2)+' pitch '+rate.toFixed(2), pos, .5, '#0ff', .5);
        }

        return instance;
    }
    
    /** Play the sound on a loop, the same as play with loop on; stop or change it through the SoundInstance returned
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance} - The sound instance, or undefined if sound is disabled, not loaded, or running in headless mode */
    playLoop(pos, volume=1, pitch=1, randomnessScale=1, paused=false)
    { return this.play(pos, volume, pitch, randomnessScale, true, paused); }

    /** Play a music track that loops by default
     *  @param {number} [volume] - Volume to play the music at
     *  @param {boolean} [loop] - Should the music loop?
     *  @param {boolean} [paused] - Should the music start paused
     *  @return {SoundInstance} - The sound instance
     */
    playMusic(volume=1, loop=true, paused=false)
    { return this.play(undefined, volume, 1, 0, loop, paused); }

    /** Play the sound as a musical note with a semitone offset
     *  This can be used to play music with chromatic scales
     *  @param {number}  [semitoneOffset] - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume=1] - How much to scale volume by
     *  @return {SoundInstance} - The sound instance
     */
    playNote(semitoneOffset=0, pos, volume)
    {
        ASSERT(isNumber(semitoneOffset), 'semitoneOffset must be a number');
        const pitch = getNoteFrequency(semitoneOffset, 1);
        return this.play(pos, volume, pitch, 0);
    }

    /** Get how long this sound is in seconds
     *  @return {number} - How long the sound is in seconds (0 if loading)
     */
    getDuration()
    { return this.sampleLength / this.sampleRate || 0; }

    /** Check if sound is loaded, for sounds fetched from a url
     *  @return {boolean} - True if sound is loaded and ready to play
     */
    isLoaded() { return this.loadedPercent === 1; }
    
    /** Loads a sound from a URL and decodes it into sample data.
    *  @param {string} filename
    *  @return {Promise} */
    async loadSound(filename)
    {
        const response = await fetch(filename);
        if (!response.ok)
            throw new Error(`Failed to load sound from ${filename}: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // keep the decoded buffer as is, it is exactly what playback needs and
        // every play shares it, no channel data is read or copied
        this.sampleRate = audioBuffer.sampleRate;
        this.sampleLength = audioBuffer.length;
        this.sampleBuffer = audioBuffer;
        this.loadedPercent = 1;
        this.onloadCallback?.(this);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Sound Instance - Wraps an AudioBufferSourceNode for individual sound control
 * Represents a single playing instance of a sound with pause/resume capabilities
 * @memberof Audio
 * @example
 * // Play a sound and get an instance for control
 * const jumpSound = new Sound([.5,.5,220]);
 * const instance = jumpSound.play();
 * 
 * // Control the individual instance
 * instance.setVolume(.5);
 * instance.pause();
 * instance.resume();
 * instance.stop();
 */
class SoundInstance
{
    /** Create a sound instance
     *  @param {Sound}    sound    - The sound object
     *  @param {number}   [volume] - How much to scale volume by
     *  @param {number}   [rate]   - The playback rate to use
     *  @param {number}   [pan]    - How much to apply stereo panning
     *  @param {boolean}  [loop]   - Should the sound loop?
     *  @param {boolean}  [paused] - Should the sound start paused? */
    constructor(sound, volume=1, rate=1, pan=0, loop=false, paused=false)
    {
        ASSERT(sound instanceof Sound, 'SoundInstance requires a valid Sound object');
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        ASSERT(rate >= 0, 'Sound rate must be positive or zero');
        ASSERT(isNumber(pan), 'Sound pan must be a number');

        /** @property {Sound} - The sound object */
        this.sound = sound;
        /** @property {number} - How much to scale volume by */
        this.volume = volume;
        /** @property {number} - The playback rate to use */
        this.rate = rate;
        /** @property {number} - How much to apply stereo panning */
        this.pan = pan;
        /** @property {boolean} - Should the sound loop */
        this.loop = loop;
        /** @property {number} - Timestamp for audio context when paused */
        this.pausedTime = 0;
        /** @property {number} - Timestamp for audio context when started */
        this.startTime = undefined;
        /** @property {GainNode} - Gain node for the sound */
        this.gainNode = undefined;
        /** @property {AudioBufferSourceNode} - Source node of the audio */
        this.source = undefined;
        /** @property {AudioNode|AudioEffectNodes} - Node or effect to route this instance through, copied from the sound
         *  @type {AudioNode|AudioEffectNodes} */
        this.output = sound.output;
        // setup end callback and start sound, a sound that ends is stopped, its time back at 0
        this.onendedCallback = (source)=>
        {
            if (source === this.source)
            {
                this.source = undefined;
                this.startTime = undefined;
                this.pausedTime = 0;
            }
        };
        if (!paused)
            this.start();
    }

    /** Start playing the sound instance from the offset time
     *  @param {number} [offset] - Offset in seconds to start playback from 
     */
    start(offset=0)
    {
        ASSERT(offset >= 0, 'Sound start offset must be positive or zero');
        if (this.isPlaying())
            this.stop();
        this.gainNode = audioContext.createGain();

        // build the shared buffer if it was not made at load time, then play it
        this.sound.buildSampleBuffer();
        this.source = this.sound.sampleBuffer ?
            playAudioBuffer(this.sound.sampleBuffer, this.volume, this.rate, this.pan, this.loop, this.gainNode, offset, this.onendedCallback, this.output) :
            playSamples(this.sound.sampleChannels, this.volume, this.rate, this.pan, this.loop, this.sound.sampleRate, this.gainNode, offset, this.onendedCallback, this.output);
        if (this.source)
        {
            this.startTime = audioContext.currentTime - offset;
            this.pausedTime = undefined;
        }
        else
        {
            // the sound could not start, keep the place so a later resume picks it up
            this.startTime = undefined;
            this.pausedTime = offset;
        }
    }

    /** Set the volume of this sound instance, with an optional fade to it
     *  - A fade ducks music under dialogue or cross fades two tracks without a click
     *  @param {number} volume
     *  @param {number} [fadeTime] - Seconds to fade to the new volume over */
    setVolume(volume, fadeTime=0)
    {
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        this.volume = volume;
        if (!this.gainNode) return;

        // drop any fade still scheduled so stacked calls don't fight,
        // then ramp from wherever the gain is now or jump straight there
        const gain = this.gainNode.gain;
        const startFade = audioContext.currentTime;
        gain.cancelScheduledValues(startFade);
        if (fadeTime)
        {
            gain.setValueAtTime(gain.value, startFade);
            gain.linearRampToValueAtTime(volume, startFade + fadeTime);
        }
        else
            gain.value = volume;
    }

    /** Set the playback rate of this sound instance, its speed and pitch, while it plays
     *  - A looping sound can follow something smoothly this way, like an engine with the speed
     *  - A rate of 0 freezes the sound in place, its current time is not tracked until it moves again
     *  @param {number} rate - 1 is normal, 2 is twice as fast and an octave up */
    setRate(rate)
    {
        ASSERT(rate >= 0, 'Sound rate must be positive or zero');
        // keep the place in the sound, only the speed changes from here, so the current time stays true
        if (this.isPlaying() && rate)
            this.startTime = audioContext.currentTime - this.getCurrentTime() * this.rate / rate;
        this.rate = rate;
        if (this.source)
            this.source.playbackRate.value = rate;
    }

    /** Stop this sound instance and reset position to the start
     *  @param {number} [fadeTime] - Seconds to fade out over before stopping */
    stop(fadeTime=0)
    {
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        if (this.isPlaying())
        {
            if (fadeTime)
            {
                // ramp off gain from where it is now (not 1, or low-volume
                // instances would jump back up before fading, and a volume
                // fade in flight carries on down from its current point);
                // cancel any prior scheduling so stacked stop calls don't
                // re-anchor partway through a previous fade
                const gain = this.gainNode.gain;
                const startFade = audioContext.currentTime;
                const endFade = startFade + fadeTime;
                gain.cancelScheduledValues(startFade);
                gain.setValueAtTime(gain.value, startFade);
                gain.linearRampToValueAtTime(0, endFade);
                this.source.stop(endFade);
            }
            else
                this.source.stop();
        }
        this.pausedTime = 0;
        this.source = undefined;
        this.startTime = undefined;
    }

    /** Pause this sound instance */
    pause()
    {
        if (this.isPaused()) return;

        // save current time and stop sound
        this.pausedTime = this.getCurrentTime();
        this.source.stop();
        this.source = undefined;
        this.startTime = undefined;
    }

    /** Resume this sound instance */
    resume()
    {
        if (!this.isPaused()) return;
        
        // restart sound from paused time
        this.start(this.pausedTime);
    }

    /** Check if this instance is currently playing
     *  @return {boolean} - True if playing
     */
    isPlaying() { return !!this.source; }

    /** Check if this instance is paused or stopped (not currently playing)
     *  @return {boolean} - True if not playing
     */
    isPaused() { return !this.isPlaying(); }

    /** Get the current playback time in seconds
     *  @return {number} - Current playback time
     */
    getCurrentTime()
    {
        if (!this.isPlaying()) return this.pausedTime;
        const duration = this.getDuration();
        // guard mod against 0 duration (rate=0 or sound not loaded)
        return duration ? mod(audioContext.currentTime - this.startTime, duration) : 0;
    }

    /** Get the total duration of this sound
     *  @return {number} - Total duration in seconds (0 if loading)
     */
    getDuration() { return this.rate ? this.sound.getDuration() / this.rate : 0; }

    /** Get source of this sound instance
     *  @return {AudioBufferSourceNode}
     */
    getSource() { return this.source; }
}

///////////////////////////////////////////////////////////////////////////////

/** Speak text with passed in settings
 *  @param {string} text - The text to speak
 *  @param {number} [volume] - How much to scale volume by
 *  @param {number} [rate] - How quickly to speak
 *  @param {number} [pitch] - How much to change the pitch by
 *  @param {string} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @return {SpeechSynthesisUtterance|undefined} - The utterance that was spoken, or undefined if speech is unavailable
 *  @memberof Audio */
function speak(text, volume=1, rate=1, pitch=1, language='')
{
    ASSERT(typeof volume !== 'string', 'speak() signature changed: language is now the last parameter, after pitch');
    if (!soundEnable || headlessMode) return;
    if (typeof speechSynthesis === 'undefined') return;

    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean

    // build utterance and speak
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = clamp(volume*soundVolume);
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
    return utterance;
}

/** Stop all queued speech
 *  @memberof Audio */
function speakStop()
{
    if (typeof speechSynthesis !== 'undefined')
        speechSynthesis.cancel();
}

/** Get frequency of a note on a musical scale
 *  @param {number} semitoneOffset - How many semitones away from the root note
 *  @param {number} [rootFrequency] - Frequency at semitone offset 0
 *  @return {number} - The frequency of the note
 *  @memberof Audio */
function getNoteFrequency(semitoneOffset, rootFrequency=220)
{ return rootFrequency * 2**(semitoneOffset/12); }

///////////////////////////////////////////////////////////////////////////////

/**
 * @callback AudioEndedCallback - Function called when a sound ends
 * @param {AudioBufferSourceNode} source
 * @memberof Audio
 */

/** Play cached audio samples with given settings
 *  @param {Array}    sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {number}   [volume] - How much to scale volume by
 *  @param {number}   [rate] - The playback rate to use
 *  @param {number}   [pan] - How much to apply stereo panning
 *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {number}   [sampleRate=44100] - Sample rate for the sound
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing (disconnected when the sound ends)
 *  @param {number}   [offset] - Offset in seconds to start playback from
 *  @param {AudioEndedCallback} [onended] - Callback for when the sound ends
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect to connect the gain to instead of the master gain
 *  @return {AudioBufferSourceNode} - The source node of the sound played, may be undefined if play fails
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=audioDefaultSampleRate, gainNode, offset=0, onended, output)
{
    if (!soundEnable || headlessMode) return;

    if (!audioIsRunning())
    {
        // fix stalled audio, don't build a buffer that can't be played
        audioContext.resume();
        return;
    }

    const buffer = createAudioBuffer(sampleChannels, sampleRate);
    return playAudioBuffer(buffer, volume, rate, pan, loop, gainNode, offset, onended, output);
}

/** Copy arrays of samples into a new audio buffer
 *  @param {Array}  sampleChannels - Array of arrays of samples (for stereo playback)
 *  @param {number} [sampleRate=44100] - Sample rate for the sound
 *  @return {AudioBuffer} - The audio buffer holding the samples
 *  @memberof Audio */
function createAudioBuffer(sampleChannels, sampleRate=audioDefaultSampleRate)
{
    const channelCount = sampleChannels.length;
    const sampleLength = sampleChannels[0].length;
    const buffer = audioContext.createBuffer(channelCount, sampleLength, sampleRate);
    sampleChannels.forEach((c,i)=> buffer.getChannelData(i).set(c));
    return buffer;
}

/** Play an audio buffer with given settings
 *  The buffer can be shared by any number of sounds playing at once
 *  @param {AudioBuffer} buffer - The audio buffer to play
 *  @param {number}   [volume] - How much to scale volume by
 *  @param {number}   [rate] - The playback rate to use
 *  @param {number}   [pan] - How much to apply stereo panning
 *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing (disconnected when the sound ends)
 *  @param {number}   [offset] - Offset in seconds to start playback from
 *  @param {AudioEndedCallback} [onended] - Callback for when the sound ends
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect to connect the gain to instead of the master gain
 *  @return {AudioBufferSourceNode} - The source node of the sound played, may be undefined if play fails
 *  @memberof Audio */
function playAudioBuffer(buffer, volume=1, rate=1, pan=0, loop=false, gainNode, offset=0, onended, output)
{
    if (!soundEnable || headlessMode) return;

    if (!audioIsRunning())
    {
        // fix stalled audio, this sound won't be able to play
        audioContext.resume();
        return;
    }

    // setup source, many sources can share one buffer
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    // create and connect gain node
    gainNode = gainNode || audioContext.createGain();
    gainNode.gain.value = volume;
    const outputNode = audioEffectNode(output, 'input') || audioMasterGain;
    ASSERT(typeof outputNode.connect === 'function', 'output must be an AudioNode or an effect with input and output nodes');
    gainNode.connect(outputNode);

    // connect source to stereo panner and gain
    const pannerNode = new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)});
    source.connect(pannerNode).connect(gainNode);

    // disconnect nodes when the sound ends so the audio graph doesn't grow
    // unbounded across many play() calls (source.stop() also fires 'ended')
    source.addEventListener('ended', ()=>
    {
        gainNode.disconnect();
        pannerNode.disconnect();
        if (onended) onended(source);
    });

    // play and return sound
    const startOffset = offset * rate;
    source.start(0, startOffset);

    if (debug && debugSound)
        LOG('sound', 'vol', volume.toFixed(2), 'rate', rate.toFixed(2), 'pan', pan.toFixed(2), loop ? 'loop' : '');

    return source;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.3.2 by Frank Force

/** Generate and play a ZzFX sound
 *
 *  <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function zzfx(...zzfxSound) { return playSamples([zzfxG(...zzfxSound)]); }

/** Generate samples for a ZzFX sound
 *  @param {number}  [volume] - Volume scale (percent)
 *  @param {number}  [randomness] - How much to randomize frequency (percent Hz)
 *  @param {number}  [frequency] - Frequency of sound (Hz)
 *  @param {number}  [attack] - Attack time, how fast sound starts (seconds)
 *  @param {number}  [sustain] - Sustain time, how long sound holds (seconds)
 *  @param {number}  [release] - Release time, how fast sound fades out (seconds)
 *  @param {number}  [shape] - Shape of the sound wave
 *  @param {number}  [shapeCurve] - Squareness of wave (0=square, 1=normal, 2=pointy)
 *  @param {number}  [slide] - How much to slide frequency (kHz/s)
 *  @param {number}  [deltaSlide] - How much to change slide (kHz/s/s)
 *  @param {number}  [pitchJump] - Frequency of pitch jump (Hz)
 *  @param {number}  [pitchJumpTime] - Time of pitch jump (seconds)
 *  @param {number}  [repeatTime] - Resets some parameters periodically (seconds)
 *  @param {number}  [noise] - How much random noise to add (percent)
 *  @param {number}  [modulation] - Frequency of modulation wave, negative flips phase (Hz)
 *  @param {number}  [bitCrush] - Resamples at a lower frequency in (samples*100)
 *  @param {number}  [delay] - Overlap sound with itself for reverb and flanger effects (seconds)
 *  @param {number}  [sustainVolume] - Volume level for sustain (percent)
 *  @param {number}  [decay] - Decay time, how long to reach sustain after attack (seconds)
 *  @param {number}  [tremolo] - Trembling effect, rate controlled by repeat time (percent)
 *  @param {number}  [filter] - Filter cutoff frequency, positive for HPF, negative for LPF (Hz)
 *  @return {Array} - Array of audio samples
 *  @memberof Audio */
function zzfxG
(
    volume = 1,
    randomness = .05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = .1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0
)
{
    // init parameters
    let sampleRate = audioDefaultSampleRate,
        PI2 = PI*2,
        startSlide = slide *= 500 * PI2 / sampleRate / sampleRate,
        startFrequency = frequency *=
            (1 + rand(randomness,-randomness)) * PI2 / sampleRate,
        modOffset = 0, // modulation offset
        repeat = 0,    // repeat offset
        crush = 0,     // bit crush offset
        jump = 1,      // pitch jump timer
        length,        // sample length
        b = [],        // sample buffer
        t = 0,         // sample time
        i = 0,         // sample index
        s = 0,         // sample value
        f,             // wave frequency

        // biquad LP/HP filter
        quality = 2, w = PI2 * abs(filter) * 2 / sampleRate,
        cosw = cos(w), alpha = sin(w) / 2 / quality,
        a0 = 1 + alpha, a1 = -2*cosw / a0, a2 = (1 - alpha) / a0,
        b0 = (1 + sign(filter) * cosw) / 2 / a0,
        b1 = -(sign(filter) + cosw) / a0, b2 = b0,
        x2 = 0, x1 = 0, y2 = 0, y1 = 0;

        // scale by sample rate
        const minAttack = 9; // prevent pop if attack is 0
        attack = attack * sampleRate || minAttack;
        decay *= sampleRate;
        sustain *= sampleRate;
        release *= sampleRate;
        delay *= sampleRate;
        deltaSlide *= 500 * PI2 / sampleRate**3;
        modulation *= PI2 / sampleRate;
        pitchJump *= PI2 / sampleRate;
        pitchJumpTime *= sampleRate;
        repeatTime = repeatTime * sampleRate | 0;

    // generate waveform
    for (length = attack + decay + sustain + release + delay | 0;
        i < length; b[i++] = s * volume)                   // sample
    {
        if (!(++crush%(bitCrush*100|0)))                   // bit crush
        {
            s = shape? shape>1? shape>2? shape>3? shape>4? // wave shape
                (t/PI2%1 < shapeCurve/2? 1 : -1) : // 5 square duty
                sin(t**3) :                        // 4 noise
                max(min(tan(t),1),-1):             // 3 tan
                1-(2*t/PI2%2+2)%2:                 // 2 saw
                1-4*abs(round(t/PI2)-t/PI2):       // 1 triangle
                sin(t);                            // 0 sin

            s = (repeatTime ?
                    1 - tremolo + tremolo*sin(PI2*i/repeatTime) // tremolo
                    : 1) *
                (shape>4?s:sign(s)*abs(s)**shapeCurve) * // shape curve
                (i < attack ? i/attack :                 // attack
                i < attack + decay ?                     // decay
                1-((i-attack)/decay)*(1-sustainVolume) : // decay falloff
                i < attack  + decay + sustain ?          // sustain
                sustainVolume :                          // sustain volume
                i < length - delay ?                     // release
                (length - i - delay)/release *           // release falloff
                sustainVolume :                          // release volume
                0);                                      // post release

            s = delay ? s/2 + (delay > i ? 0 :           // delay
                (i<length-delay? 1 : (length-i)/delay) * // release delay
                b[i-delay|0]/2/volume) : s;              // sample delay

            if (filter)                                  // apply filter
                s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
        }

        f = (frequency += slide += deltaSlide) *// frequency
            cos(modulation*modOffset++);        // modulation
        t += f + f*noise*sin(i**5);             // noise

        if (jump && ++jump > pitchJumpTime)     // pitch jump
        {
            frequency += pitchJump;             // apply pitch jump
            startFrequency += pitchJump;        // also apply to start
            jump = 0;                           // stop pitch jump time
        }

        if (repeatTime && !(++repeat % repeatTime)) // repeat
        {
            frequency = startFrequency;   // reset frequency
            slide = startSlide;           // reset slide
            jump ||= 1;                   // reset pitch jump time
        }
    }

    return b; // return sample buffer
}
/**
 * LittleJS Tile Layer System
 * - Renders large tile-based levels efficiently using cached canvases
 * - Unlimited tile layers with automatic canvas allocation
 * - Layers support both rendering and collision detection
 * - Direct canvas2d drawing access for custom tile rendering
 * - TileLayer for rendering, TileCollisionLayer for physics
 * - Collision callbacks for tile interactions with objects
 * - Optimized raycast support for tile-based physics
 * - Integration with Box2D physics via Box2DTileLayer plugin
 * @namespace TileLayers
 */

///////////////////////////////////////////////////////////////////////////////
// Tile Layer System

/** Keep track of all tile layers with collision
 *  @type {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
const tileCollisionLayers = [];

/** Get tile collision data for a given cell in the grid
*  @param {Vector2} pos
*  @param {boolean} [solidOnly] - Only check solid layers?
*  @return {number}
*  @memberof TileLayers */
function tileCollisionGetData(pos, solidOnly=true)
{
    // check all tile collision layers
    for (const layer of tileCollisionLayers)
        if (!solidOnly || layer.isSolid)
        {
            // convert world pos to layer local space
            const layerPos = pos.subtract(layer.pos);
            if (layerPos.arrayCheck(layer.size))
            {
                const data = layer.getCollisionData(layerPos);
                if (data) return data;
            }
        }
    return 0;
}

/** Check if a tile layer collides with another object
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2()]
 *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
 *  @param {boolean} [solidOnly] - Only check solid layers?
 *  @return {TileCollisionLayer}
 *  @memberof TileLayers */
function tileCollisionTest(pos, size=vec2(), callbackObject, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        if (layer.collisionTest(pos, size, callbackObject))
            return layer;
    }
}

/**
 *  @callback TileCollisionCallback - Function to handle a tile collision test
 *  @param {number} tileData - the value of the tile at the position
 *  @param {Vector2} pos - world space position of tile where the collision occurred
 *  @memberof TileLayers
 */

/** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
 *  The point will be inside the colliding tile if it hits
 *  @param {Vector2} posStart
 *  @param {Vector2} posEnd
 *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
 *  @param {Vector2} [normal] - Optional normal of the surface hit
 *  @param {boolean} [solidOnly=true] - Only check solid layers?
 *  @return {Vector2|undefined} - position of the center of the tile hit or undefined if no hit
 *  @memberof TileLayers */
function tileCollisionRaycast(posStart, posEnd, callbackObject, normal, solidOnly=true)
{
    // check every layer and keep the closest hit so a far hit in an
    // earlier-registered layer doesn't shadow a closer hit in a later one
    let closestHit, closestDistSq, closestNormal;
    const scratchNormal = normal && vec2();
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        {
            const hitPos = layer.collisionRaycast(posStart, posEnd, callbackObject, scratchNormal);
            if (hitPos)
            {
                const d = posStart.distanceSquared(hitPos);
                if (closestHit === undefined || d < closestDistSq)
                {
                    closestHit = hitPos;
                    closestDistSq = d;
                    if (normal) closestNormal = scratchNormal.copy();
                }
            }
        }
    }
    if (closestHit && normal) normal.setFrom(closestNormal);
    return closestHit;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Load tile layers from exported data
 *  @param {Object}   tileMapData - Level data from exported data
 *  @param {TileInfo} [tileInfo] - Default tile info (used for size and texture)
 *  @param {number}   [renderOrder] - Render order of the top layer
 *  @param {number}   [collisionLayer] - Layer to use for collision if any
 *  @param {boolean}  [draw] - Should the layer be drawn automatically
 *  @return {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
function tileLayersLoad(tileMapData, tileInfo=tile(), renderOrder=0, collisionLayer, draw=true)
{
    if (!tileMapData)
    {
        // default level data if loading failed
        const s = 50;
        tileMapData = {};
        tileMapData.height = tileMapData.width = s;
        tileMapData.layers = [{}];
        tileMapData.layers[0].data = new Array(s*s).fill(0);
    }

    // validate the tile map data
    ASSERT(tileMapData.width && tileMapData.height);
    ASSERT(tileMapData.layers && tileMapData.layers.length);

    // create tile layers and fill with data
    const tileLayers = [];
    const levelSize = vec2(tileMapData.width, tileMapData.height);
    const layerCount = tileMapData.layers.length;
    for (let layerIndex=layerCount; layerIndex--;)
    {
        const dataLayer = tileMapData.layers[layerIndex];
        ASSERT(dataLayer.data && dataLayer.data.length);
        ASSERT(levelSize.area() === dataLayer.data.length);

        const layerRenderOrder = renderOrder - (layerCount - 1 - layerIndex);
        const tileLayer = new TileCollisionLayer(vec2(), levelSize, tileInfo, layerRenderOrder);
        tileLayers[layerIndex] = tileLayer;

        // apply layer color
        const layerColor = dataLayer.tintcolor ?
            new Color().setHex(dataLayer.tintcolor) :
            dataLayer.color || WHITE;
        ASSERT(isColor(layerColor), 'layer color is not a color');

        for (let x=levelSize.x; x--;)
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x, levelSize.y-1-y);
            const data = dataLayer.data[x + y*levelSize.x];
            if (data)
            {
                const layerData = new TileLayerData(data-1, 0, false, layerColor);
                tileLayer.setData(pos, layerData);

                // set collision for top layer
                if (layerIndex === collisionLayer)
                    tileLayer.setCollisionData(pos, 1);
            }
        }
        if (draw)
            tileLayer.redraw();
    }
    return tileLayers;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile layer data object stores info about how to draw a tile
 * @memberof TileLayers
 * @example
 * // create tile layer data with tile index 0 and random orientation and color
 * const tileIndex = 0;
 * const direction = randInt(4)
 * const mirror = randInt(2);
 * const color = randColor();
 * const data = new TileLayerData(tileIndex, direction, mirror, color);
 */
class TileLayerData
{
    /** Create a tile layer data object, one for each tile in a TileLayer
     *  @param {number}  [tile] - The tile to use, untextured if undefined
     *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {boolean} [mirror] - If the tile should be mirrored along the x axis
     *  @param {Color}   [color] - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {number} - The tile to use, untextured if undefined */
        this.tile = tile;
        /** @property {number} - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        this.mirror = mirror;
        /** @property {Color} - Color of the tile */
        this.color = color.copy();
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Canvas Layer - cached off screen rendering system
 * - Contains an offscreen canvas that can be rendered to
 * - WebGL rendering is optional, call updateWebGL to enable/update
 * @extends EngineObject
 * @memberof TileLayers
 * @example
 * const canvasLayer = new CanvasLayer(vec2(), vec2(200,100));
 */
class CanvasLayer extends EngineObject
{
    /** Create a canvas layer object
     *  @param {Vector2}  [pos] - World space position of the layer
     *  @param {Vector2}  [size] - World space size of the layer
     *  @param {number}   [angle] - Angle the layer is rotated by
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder
     *  @param {Vector2}  [canvasSize] - Default size of canvas, can be changed later
     *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, angle=0, renderOrder=0, canvasSize=vec2(512), useWebGL=true)
    {
        ASSERT(isVector2(canvasSize), 'canvasSize must be a Vector2');
        super(pos, size, undefined, angle, WHITE, renderOrder);

        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this layer */
        this.context = headlessMode ? undefined : createCanvasContext(canvasSize.x, canvasSize.y);
        /** @property {OffscreenCanvas} - The canvas used by this layer */
        this.canvas = this.context?.canvas;
        /** @property {TextureInfo} - Texture info to use for this object rendering */
        this.textureInfo = new TextureInfo(this.canvas, useWebGL);

        // disable physics by default
        this.mass = 0;
    }

    /** Destroy this canvas layer */
    destroy()
    {
        if (this.destroyed) return;

        this.textureInfo.destroyWebGLTexture();
        super.destroy();
    }

    // Render the layer, called automatically by the engine
    render()
    {
        this.draw(this.pos, this.size, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Draw this canvas layer centered in world space, with color applied if using WebGL
    *  @param {Vector2} pos - Center in world space
    *  @param {Vector2} [size] - Size in world space
    *  @param {Color}   [color] - Color to modulate with
    *  @param {number}  [angle] - Angle to rotate by
    *  @param {boolean} [mirror] - If true image is flipped along the Y axis
    *  @param {Color}   [additiveColor] - Additive color to be applied if any
    *  @param {boolean} [screenSpace] - If true the pos and size are in screen space
    *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
    *  @memberof Draw */
    draw(pos, size, color=WHITE, angle=0, mirror=false, additiveColor, screenSpace=false, context)
    {
        // draw the canvas layer as a single tile that uses the whole texture
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        const useWebGL = this.hasWebGL();
        drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor, useWebGL, screenSpace, context);
    }

    /** Create WebGL texture if necessary and copy layer canvas to it */
    updateWebGL()
    { this.textureInfo.createWebGLTexture(); }

    /** Check if this layer is using WebGL
     *  @return {boolean} */
    hasWebGL()
    { return glEnable && this.textureInfo.hasWebGL(); }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Layer - cached rendering system for tile layers
 * - Each Tile layer is rendered to an off screen canvas
 * - To allow dynamic modifications, layers are rendered using canvas 2d
 * - Some devices like mobile phones are limited to 4k texture resolution
 * - For with 16x16 tiles this limits layers to 256x256 on mobile devices
 * - Tile layers are centered on their corner, so normal levels are at (0,0)
 * @extends CanvasLayer
 * @memberof TileLayers
 * @example
 * const tileLayer = new TileLayer(vec2(), vec2(200,100));
 */
class TileLayer extends CanvasLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  pos - World space position
    *  @param {Vector2}  size - World space size
    *  @param {TileInfo} [tileInfo] - Default tile info for layer (used for size and texture)
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tile(), renderOrder=0, useWebGL=true)
    {
        const canvasSize = tileInfo ? size.multiply(tileInfo.size) : size;
        super(pos, size, 0, renderOrder, canvasSize, useWebGL);
        
        /** @property {TileInfo} - Default tile info for layer */
        this.tileInfo = undefined;
        /** @property {Array<TileLayerData>} - Array of tile data for the layer */
        this.data = [];
        /** @property {boolean} - Is this layer using a webgl texture? */
        this.isUsingWebGL = false;

        if (headlessMode)
        {
            // disable rendering in headless mode
            this.render         = ()=> {};
            this.redraw         = ()=> {};
            this.redrawStart    = ()=> {};
            this.redrawEnd      = ()=> {};
            this.drawTileData   = ()=> {};
            this.redrawTileData = ()=> {};
            this.drawLayerTile  = ()=> {};
            this.drawLayerRect  = ()=> {};
            this.drawTile       = ()=> {};
            this.drawRect       = ()=> {};
            this.clearLayerRect = ()=> {};
            return;
        }
        
        if (tileInfo)
        {
            // set tile info
            this.tileInfo = tileInfo.frame(0);
            this.tileInfo.bleed = 0; // disable bleed for tile layers
        }

        // init tile data
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData);
    }

    /** Set data at a given position in the array
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data - Data to set
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        layerPos = layerPos.floor();
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        ASSERT(data instanceof TileLayerData, 'data must be a TileLayerData');

        if (!layerPos.arrayCheck(this.size)) return;
        this.data[(layerPos.y|0)*this.size.x + (layerPos.x|0)] = data;

        if (!redraw) return;
        const isRedraw = drawContext === this.context;
        isRedraw ? this.drawTileData(layerPos) : this.redrawTileData(layerPos);
    }

    /** Clear data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @param {boolean} [redraw] - Force the tile to redraw if true */
    clearData(layerPos, redraw=false)
    { this.setData(layerPos, new TileLayerData, redraw) }

    /** Get data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData|undefined} */
    getData(layerPos)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        return layerPos.arrayCheck(this.size) ? this.data[(layerPos.y|0)*this.size.x + (layerPos.x|0)] : undefined;
    }

    // Update the tile layer, refresh texture if needed
    update()
    {
        if (!glEnable && this.isUsingWebGL)
        {
            // redraw the layer if webgl was disabled or context lost
            this.isUsingWebGL = false;
            this.redraw();
        }
    }

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(drawContext !== this.context, 'must call redrawEnd() after drawing tiles!');

        const size = this.drawSize || this.size;
        const pos = this.pos.add(size.scale(.5));
        this.draw(pos, size, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Called after this layer is redrawn, does nothing by default */
    onRedraw() {}

    /** Draw all the tile data to an offscreen canvas
     *  - This may be slow if not using webgl but only needs to be done once */
    redraw()
    {
        this.redrawStart(true);
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
            this.drawTileData(vec2(x,y), false);
        this.isUsingWebGL && glFlush();
        this.onRedraw();
        this.redrawEnd();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update parts of the level
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        if (!this.context) return;
        ASSERT(drawContext !== this.context);
        
        // save current render settings
        /** @type {[CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D, Vector2, Vector2, number, Color]} */
        this.savedRenderSettings = [drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor];

        // set the draw canvas and context to this layer
        // use camera settings to match this layer's canvas
        drawContext = this.context;
        const tileSize = this.tileInfo?.size ?? vec2(1);
        mainCanvasSize = this.size.multiply(tileSize);
        canvasClearColor = CLEAR_BLACK;
        cameraPos = this.size.multiply(tileSize).scale(.5);
        cameraScale = 1;

        // set render target to this layer
        this.isUsingWebGL = this.hasWebGL();
        if (this.isUsingWebGL)
            glSetRenderTarget(this.textureInfo.glTexture, clear);
        else
        {
            // disable smoothing for pixel art
            this.context.imageSmoothingEnabled = !tilesPixelated;
            if (clear)
            {
                // clear and set size
                this.canvas.width  = mainCanvasSize.x;
                this.canvas.height = mainCanvasSize.y;
            }
        }
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        if (!this.context) return;
        ASSERT(drawContext === this.context);

        // set stuff back to normal
        if (this.isUsingWebGL)
            glSetRenderTarget();
        [drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile layer
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
        
        // clear out where the tile was, can be skipped for fully opaque tiles
        const drawSize = this.tileInfo?.size ?? vec2(1);
        const drawPos = layerPos.multiply(drawSize);
        clear && this.clearLayerRect(drawPos, drawSize);

        // draw the tile if it has layer data
        const d = this.getData(layerPos);
        if (!d || !d.tile) return;

        const tileInfo = this.tileInfo && this.tileInfo.index(d.tile);
        this.drawLayerTile(drawPos, drawSize, tileInfo, d.color, d.direction*PI/2, d.mirror);
    }

    /** Draw the tile at a given position in the tile layer
     *  This can be used to clear tiles when they are destroyed
     *  For better performance use drawTileData inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared
     */
    redrawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        ASSERT(drawContext !== this.context, 'redrawStart() should not be active when calling redrawTileData(), instead use drawTileData()');

        this.redrawStart();
        this.drawTileData(layerPos, clear);
        this.redrawEnd();
    }

    /** Draw textured tile in layer space
     *  @param {Vector2}  pos - Position in pixel coordinates
     *  @param {Vector2}  [size=vec2(1)] - Size of the tile
     *  @param {TileInfo} [tileInfo] - Tile info to use, untextured if undefined
     *  @param {Color}    [color=WHITE] - Color to modulate with
     *  @param {number}   [angle] - Angle to rotate by
     *  @param {boolean}  [mirror] - Is image flipped along the Y axis?
     *  @param {Color}    [additiveColor] - Additive color to be applied if any */
    drawLayerTile(pos, size=vec2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor)
    {
        const drawPos = pos.add(size.scale(.5));
        drawTile(drawPos, size, tileInfo, color, angle, mirror, additiveColor, this.isUsingWebGL);
    }

    /** Clear a rectangle in layer space
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @param {Color} [color=WHITE] - Color to modulate with
     *  @param {number} [angle] - Angle to rotate by
     */
    drawLayerRect(pos, size, color, angle=0)
    { this.drawLayerTile(pos, size, undefined, color, angle); }

    /** Draw a tile onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=vec2(1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=WHITE]
     *  @param {number}   [angle]
     *  @param {boolean}  [mirror] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle=0, mirror=false)
    {
        pos = pos.subtract(this.pos).multiply(this.tileInfo.size);
        size = size.multiply(this.tileInfo.size);
        pos.y = this.canvas.height - pos.y;

        // draw the tile onto the layer canvas
        const oldMainCanvasSize = mainCanvasSize;
        mainCanvasSize = vec2(this.canvas.width, this.canvas.height);
        const useWebGL = this.hasWebGL();
        useWebGL && glSetRenderTarget(this.textureInfo.glTexture);
        const drawContext = useWebGL ? undefined : this.context;
        drawTile(pos, size, tileInfo, color, angle, mirror, undefined, useWebGL, true, drawContext);
        useWebGL && glSetRenderTarget();
        mainCanvasSize = oldMainCanvasSize;
    }

    /** Draw a rectangle onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=vec2(1)]
     *  @param {Color}   [color=WHITE]
     *  @param {number}  [angle] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }

    /** Clear a rectangle in layer space
     *  @param {Vector2} pos - position in pixel coordinates
     *  @param {Vector2} size
     */
    clearLayerRect(pos, size)
    {
        ASSERT(drawContext === this.context, 'must call redrawStart() before clearing tiles');

        const x = pos.x, y = this.canvas.height - pos.y - size.y;
        const useWebGL = this.hasWebGL();
        if (useWebGL)
            glClearRect(x, y, size.x, size.y);
        else
            this.context.clearRect(x, y, size.x, size.y);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Collision Layer - a tile layer with collision
 * - adds collision data and functions to TileLayer
 * - there can be multiple tile collision layers
 * @extends TileLayer
 * @memberof TileLayers
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  pos - World space position
    *  @param {Vector2}  size - World space size
    *  @param {TileInfo} [tileInfo] - Tile info for layer
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tile(), renderOrder=0, useWebGL=true)
    {
        super(pos, size.floor(), tileInfo, renderOrder, useWebGL);

        /** @property {Array<number>} - The tile collision grid */
        this.collisionData = [];
        this.initCollision(this.size);

        // keep track of all collision layers
        tileCollisionLayers.push(this);

        // tile collision layers are solid by default
        this.isSolid = true;
    }

    /** Destroy this tile layer */
    destroy()
    {
        if (this.destroyed) return;

        // remove from collision layers array and destroy
        const index = tileCollisionLayers.indexOf(this);
        ASSERT(index >= 0, 'tile collision layer not found in array');
        index >= 0 && tileCollisionLayers.splice(index, 1);
        super.destroy();
    }

    /** Clear and initialize tile collision to new size
    *  @param {Vector2} size - width and height of tile collision 2d grid */
    initCollision(size)
    {
        ASSERT(isVector2(size), 'size must be a Vector2');
        this.size = size.floor();
        this.collisionData = [];
        this.collisionData.length = size.area();
        this.collisionData.fill(0);
    }

    /** Set tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos
    *  @param {number}  [data] */
    setCollisionData(layerPos, data=1)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        const i = (layerPos.y|0)*this.size.x + (layerPos.x|0);
        layerPos.arrayCheck(this.size) && (this.collisionData[i] = data);
    }

    /** Clear tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos */
    clearCollisionData(layerPos)
    { this.setCollisionData(layerPos, 0); }

    /** Get tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos
    *  @return {number} */
    getCollisionData(layerPos)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        const i = (layerPos.y|0)*this.size.x + (layerPos.x|0);
        return layerPos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=vec2()]
    *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
    *  @return {boolean} */
    collisionTest(pos, size=new Vector2, callbackObject)
    {
        ASSERT(isVector2(pos) && isVector2(size), 'pos and size must be Vector2s');
        ASSERT(!callbackObject || typeof callbackObject === 'function' || callbackObject instanceof EngineObject, 'callbackObject must be a function or EngineObject');

        // make function to check for collision
        const collisionTest = callbackObject ? typeof callbackObject === 'function' ?
            (tileData, pos)=> callbackObject(tileData, pos) :
            (tileData, pos)=> callbackObject.collideWithTile(tileData, pos) :
            ()=> true;

        // check any tiles in the area for collision
        const posX = pos.x - this.pos.x;
        const posY = pos.y - this.pos.y;
        // reject AABBs entirely past either edge; without this, the negative
        // side leaks into row/col 0 because minX/minY clamp to 0 and the
        // point-test floor below forces maxX/maxY up to 1
        if (posX + size.x/2 < 0 || posX - size.x/2 > this.size.x) return false;
        if (posY + size.y/2 < 0 || posY - size.y/2 > this.size.y) return false;
        const minX = max(posX - size.x/2|0, 0);
        const minY = max(posY - size.y/2|0, 0);
        // ensure at least one cell is visited even when size is 0 and pos
        // lands exactly on an integer boundary (documented point-test mode)
        const maxX = min(max(posX + size.x/2, minX + 1), this.size.x);
        const maxY = min(max(posY + size.y/2, minY + 1), this.size.y);
        const hitPos = new Vector2;
        for (let y = minY; y < maxY; ++y)
        for (let x = minX; x < maxX; ++x)
        {
            // check if the object should collide with this tile
            const tileData = this.collisionData[y*this.size.x+x];
            if (tileData && collisionTest(tileData, hitPos.set(x+this.pos.x, y+this.pos.y)))
                return true;
        }
        return false;
    }

    /** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
    *  The point will be inside the colliding tile if it hits (may have a tiny shift)
    *  @param {Vector2} posStart
    *  @param {Vector2} posEnd
    *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
    *  @param {Vector2} [normal] - Optional normal of the surface hit
    *  @return {Vector2|undefined} */
    collisionRaycast(posStart, posEnd, callbackObject, normal)
    {
        ASSERT(isVector2(posStart) && isVector2(posEnd), 'positions must be Vector2s');
        ASSERT(!callbackObject || typeof callbackObject === 'function' || callbackObject instanceof EngineObject, 'callbackObject must be a function or EngineObject');

        // make function to check for collision
        const collisionTest = callbackObject ? typeof callbackObject === 'function' ?
            (tileData, pos)=> callbackObject(tileData, pos) :
            (tileData, pos)=> callbackObject.collideWithTile(tileData, pos) :
            (tileData)=> tileData > 0;
        const testFunction = (pos)=>
        {
            const tileData = this.getCollisionData(localPos.set(pos.x - this.pos.x, pos.y - this.pos.y));
            return tileData && collisionTest(tileData, pos);
        }

        // use line test against tile collision
        const localPos = new Vector2;
        const hitPos = lineTest(posStart, posEnd, testFunction, normal);
        if (debugRaycast && hitPos)
        {
            const tilePos = hitPos.floor().add(vec2(.5));
            debugRect(tilePos, vec2(1), '#f008');
            debugLine(posStart, posEnd, '#00f', .02);
            debugLine(posStart, hitPos, '#f00', .02);
            debugPoint(hitPos, '#0f0');
            normal && debugLine(hitPos, hitPos.add(normal), '#ff0', .02);
        }
        return hitPos;
    }
}
/**
 * LittleJS Particle System
 * - Fast and flexible particle effects system
 * - ParticleEmitter spawns and manages lightweight Particle objects
 * - Particles support color gradients, fading, rotation, and scaling
 * - Physics simulation with velocity, gravity, and damping
 * - Collision detection with tile layers
 * - Additive blending for glowing effects
 * - Cone-based emission with randomization
 * - Particle design tool available for easy emitter creation
 * @namespace Particles
 */

/**
 *  @callback ParticleCallback - Function that processes a particle
 *  @param {Particle} particle
 *  @memberof Particles
 */

/**
 *  @callback ParticleCollideCallback - Collide callback for particles
 *  @param {Particle} particle
 *  @param {number} tileData
 *  @param {Vector2} pos
 *  @memberof Particles
 */

/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @memberof Particles
 * @example
 * // create a particle emitter
 * let pos = vec2(2,3);
 * let particleEmitter = new ParticleEmitter
 * (
 *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emitCone
 *     tile(0, 16),                // tileInfo
 *     rgb(1,1,1,1), rgb(0,0,0,1), // colorStartA, colorStartB
 *     rgb(1,1,1,0), rgb(0,0,0,0), // colorEndA, colorEndB
 *     1, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate
 *     .5, 1                // randomness, collide
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} pos - World space position of the emitter
     *  @param {number} [angle] - Angle to emit the particles
     *  @param {number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
     *  @param {number} [emitTime] - How long to stay alive (0 is forever)
     *  @param {number} [emitRate] - How many particles per second to spawn, does not emit if 0
     *  @param {number} [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
     *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
     *  @param {Color} [colorStartA=WHITE] - Color at start of life 1, randomized between start colors
     *  @param {Color} [colorStartB=WHITE] - Color at start of life 2, randomized between start colors
     *  @param {Color} [colorEndA=CLEAR_WHITE] - Color at end of life 1, randomized between end colors
     *  @param {Color} [colorEndB=CLEAR_WHITE] - Color at end of life 2, randomized between end colors
     *  @param {number} [particleTime]      - How long particles live
     *  @param {number} [sizeStart]         - How big are particles at start
     *  @param {number} [sizeEnd]           - How big are particles at end
     *  @param {number} [speed]             - How fast are particles when spawned, in world units per frame (at 60fps, so multiply units/sec by 1/60)
     *  @param {number} [angleSpeed]        - How fast are particles rotating, in radians per frame (at 60fps)
     *  @param {number} [damping]           - How much to dampen particle speed, per-frame velocity multiplier (1 = no damping, .9 = lose 10% speed each frame)
     *  @param {number} [angleDamping]      - How much to dampen particle angular speed, per-frame multiplier (1 = no damping)
     *  @param {number} [gravityScale]      - How much gravity effect particles
     *  @param {number} [particleConeAngle] - Cone for start particle angle
     *  @param {number} [fadeRate]          - Fraction of life spent fading: half at fade-in (start), half at fade-out (end). e.g. .2 = 10% fade-in, 80% full opacity, 10% fade-out
     *  @param {number} [randomness]    - Apply extra randomness percent
     *  @param {boolean} [collideTiles] - Do particles collide against tiles
     *  @param {boolean} [additive]     - Should particles use additive blend
     *  @param {boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
     */
    constructor
    (
        pos,
        angle,
        emitSize = 0,
        emitTime = 0,
        emitRate = 100,
        emitConeAngle = PI,
        tileInfo,
        colorStartA = WHITE,
        colorStartB = WHITE,
        colorEndA = CLEAR_WHITE,
        colorEndB = CLEAR_WHITE,
        particleTime = .5,
        sizeStart = .1,
        sizeEnd = 1,
        speed = .1,
        angleSpeed = .05,
        damping = 1,
        angleDamping = 1,
        gravityScale = 0,
        particleConeAngle = PI,
        fadeRate = .1,
        randomness = .2,
        collideTiles = false,
        additive = false,
        randomColorLinear = true,
        renderOrder = additive ? 1e9 : 0,
        localSpace = false
    )
    {
        super(pos, vec2(), tileInfo, angle, undefined, renderOrder);

        // emitter settings
        /** @property {boolean} - Should particles be emitted in a circle */
        this.emitCircle = typeof emitSize === 'number';
        /** @property {number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        this.emitSize = typeof emitSize === 'number' ? vec2(emitSize) : emitSize.copy();
        /** @property {number} - How long to stay alive (0 is forever) */
        this.emitTime = emitTime;
        /** @property {number} - How many particles per second to spawn, does not emit if 0 */
        this.emitRate = emitRate;
        /** @property {number} - Local angle to apply velocity to particles from emitter */
        this.emitConeAngle = emitConeAngle;

        // color settings
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        this.colorEndA = colorEndA.copy();
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB = colorEndB.copy();
        /** @property {boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {number} - Particle speed when spawned, in world units per frame (at 60fps) */
        this.speed             = speed;
        /** @property {number} - Particle angular speed when spawned, in radians per frame (at 60fps) */
        this.angleSpeed        = angleSpeed;
        /** @property {number} - Per-frame velocity multiplier (1 = no damping, .9 = lose 10% speed each frame) */
        this.damping           = damping;
        /** @property {number} - Per-frame angular velocity multiplier (1 = no damping) */
        this.angleDamping      = angleDamping;
        /** @property {number} - How much gravity affects particles */
        this.gravityScale      = gravityScale;
        /** @property {number} - Cone for start particle angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {number} - Fraction of life spent fading, split half at start and half at end (e.g. .2 = 10% fade-in + 10% fade-out) */
        this.fadeRate          = fadeRate;
        /** @property {number} - Apply extra randomness percent */
        this.randomness        = randomness;
        /** @property {boolean} - Do particles collide against tiles */
        this.collideTiles      = collideTiles;
        /** @property {boolean} - Should particles use additive blend */
        this.additive          = additive;
        /** @property {boolean} - Should it be in local space of emitter */
        this.localSpace        = localSpace;
        /** @property {number} - If non zero the particle is drawn as a trail, stretched in the direction of velocity */
        this.trailScale        = 0;
        /** @property {ParticleCallback} - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {ParticleCallback} - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {ParticleCollideCallback} - Callback when particle collides */
        this.particleCollideCallback = undefined;
        /** @property {number} - Percentage of velocity to pass to particles (0-1) */
        this.velocityInheritance = 0;
        /** @property {number} - Track particle emit time */
        this.emitTimeBuffer = 0;
        /** @property {Array<Particle>} - Array of particles for this emitter */
        this.particles = [];

        // track previous position and angle
        this.previousAngle = this.angle;
        this.previousPos = this.pos.copy();
    }

    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);

        if (this.velocityInheritance)
        {
            // pass emitter velocity to particles
            const p = this.velocityInheritance;
            this.velocity.x = p * (this.pos.x - this.previousPos.x);
            this.velocity.y = p * (this.pos.y - this.previousPos.y);
            this.angleVelocity = p * (this.angle - this.previousAngle);
            this.previousAngle = this.angle;
            this.previousPos.x = this.pos.x;
            this.previousPos.y = this.pos.y;
        }

        // update emitter
        if (this.isActive())
        {
            // emit particles
            if (this.emitRate && particleEmitRateScale)
            {
                const rate = 1/this.emitRate/particleEmitRateScale;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else if (this.particles.length === 0)
            this.destroy(true);
            
        // update and remove destroyed particles in place to avoid per-frame array allocation
        const particles = this.particles;
        let alive = 0;
        for (let i = 0; i < particles.length; ++i)
        {
            const p = particles[i];
            p.update();
            if (!p.destroyed) particles[alive++] = p;
        }
        particles.length = alive;

        if (debugParticles)
        {
            // show emitter bounds
            if (this.emitCircle)
                debugCircle(this.pos, this.emitSize.x/2, '#0f0');
            else
                debugRect(this.pos, this.emitSize, '#0f0', 0, this.angle);
        }
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = this.emitCircle ?            // check if circle emitter
            randInCircle(this.emitSize.x/2)    // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5)) // box emitter
                .multiply(this.emitSize).rotate(this.angle)
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            pos.x += this.pos.x;
            pos.y += this.pos.y;
            angle += this.angle;
        }

        // randomness scales each parameter by a percentage
        const randomness = this.randomness;
        const randomizeScale = (v)=> v + v*rand(randomness, -randomness);

        // randomize particle settings
        const particleTime  = randomizeScale(this.particleTime);
        const sizeStart     = randomizeScale(this.sizeStart);
        const sizeEnd       = randomizeScale(this.sizeEnd);
        const speed         = randomizeScale(this.speed);
        const angleSpeed    = randomizeScale(this.angleSpeed) * randSign();
        const coneAngle     = rand(this.emitConeAngle, -this.emitConeAngle);
        const colorStart    = randColor(this.colorStartA, this.colorStartB, this.randomColorLinear);
        const colorEnd      = randColor(this.colorEndA,   this.colorEndB, this.randomColorLinear);
        const velocityAngle = this.localSpace ? coneAngle : this.angle + coneAngle;

        // build particle
        const velocity = vec2(speed*sin(velocityAngle), speed*cos(velocityAngle));
        let angleVelocity = angleSpeed;
        if (!this.localSpace && this.velocityInheritance > 0)
        {
            // apply emitter velocity to particle
            velocity.x += this.velocity.x;
            velocity.y += this.velocity.y;
            angleVelocity += this.angleVelocity;
        }
        const particle = new Particle(this, pos, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, velocity, angleVelocity);
        this.particles.push(particle);

        // call particle create callback
        this.particleCreateCallback?.(particle);

        // return the newly created particle
        return particle;
    }

    /** Particle emitters do not have physics */
    updatePhysics() {}

    /** Render all particles for this emitter */
    render()
    {
        // render all particles
        for (const particle of this.particles)
            particle.render();
    }

    /** is emitter actively spawning */
    isActive() { return !this.emitTime || this.getAliveTime() < this.emitTime; }

    /** Destroy the particle emitter
     *  @param {boolean} [immediate] - should particle emitters and other attached effects be allowed to die off */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        super.destroy(immediate);
        if (!immediate && this.particles.length > 0)
        {
            // wait for particles to die off
            this.destroyed = false;
            this.emitTime = -1;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// scratch vector reused by Particle.render to avoid per-frame allocations
const particleDrawPos = new Vector2;

/**
 * Particle Object - Created automatically by Particle Emitters
 * @memberof Particles
 */
class Particle
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {ParticleEmitter} emitter - The emitter that created this particle
     * @param {Vector2} pos             - World or local space position
     * @param {number}  angle           - Angle of the particle
     * @param {Color}   colorStart      - Color at start of life
     * @param {Color}   colorEnd        - Color at end of life
     * @param {number}  lifeTime        - How long to live for
     * @param {number}  sizeStart       - Size at start of life
     * @param {number}  sizeEnd         - Size at end of life
     * @param {Vector2} [velocity]      - Velocity of the particle
     * @param {number}  [angleVelocity] - Angular speed of the particle
     */
    constructor(emitter, pos, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, velocity = vec2(), angleVelocity = 0)
    {
        /** @property {ParticleEmitter} */
        this.emitter = emitter;
        /** @property {Vector2} */
        this.pos = pos;
        /** @property {number} */
        this.angle = angle;
        /** @property {Vector2} */
        this.size = vec2(sizeStart);
        /** @property {Color} */
        this.color = colorStart.copy();
        /** @property {Color} */
        this.colorStart = colorStart;
        /** @property {Color} */
        this.colorEnd = colorEnd;
        /** @property {number} */
        this.lifeTime = lifeTime;
        /** @property {number} */
        this.sizeStart = sizeStart;
        /** @property {number} */
        this.sizeEnd = sizeEnd;
        /** @property {Vector2} */
        this.velocity = velocity;
        /** @property {number} */
        this.angleVelocity = angleVelocity;
        /** @property {number} */
        this.spawnTime = time;
        /** @property {boolean} */
        this.mirror = randBool();
        /** @property {EngineObject} */
        this.groundObject = undefined;
        /** @property {boolean} */
        this.destroyed = false;
        /** @property {TileInfo} */
        this.tileInfo = emitter.tileInfo;
    }

    /** Update the particle */
    update()
    {
        // emitter properties
        const emitter = this.emitter;
        const damping = emitter.damping;
        const angleDamping = emitter.angleDamping;
        const restitution = emitter.restitution;
        const friction = emitter.friction;
        const gravityScale = emitter.gravityScale;
        const collideTiles = emitter.collideTiles;
        const collideCallback = emitter.particleCollideCallback;

        // destroy particle when its time runs out
        if (this.lifeTime > 0 && time - this.spawnTime > this.lifeTime)
        {
            this.destroy();
            return;
        }

        // apply physics; only the tile collision needs where the particle was, so only then is it copied
        const solve = enablePhysicsSolver && collideTiles;
        const oldPos = solve ? this.pos.copy() : undefined;
        this.velocity.x *= damping;
        this.velocity.y *= damping;
        this.pos.x += this.velocity.x += gravity.x * gravityScale;
        this.pos.y += this.velocity.y += gravity.y * gravityScale;
        this.angle += this.angleVelocity *= angleDamping;

        // don't do collision if solver disabled
        if (!solve) return;
        
        // apply max circular speed to prevent going through collision
        const length2 = this.velocity.lengthSquared();
        if (length2 > objectMaxSpeed*objectMaxSpeed)
        {
            const s = objectMaxSpeed / length2**.5;
            this.velocity.x *= s;
            this.velocity.y *= s;
        }

        // check collision against tiles
        this.groundObject = undefined;
        const testCollision = collideCallback ? (pos)=>
        {
            const data = tileCollisionGetData(pos);
            return data && collideCallback(this, data, pos);
        } : (pos)=> tileCollisionGetData(pos) > 0;

        if (testCollision(this.pos))
        {
            // if already was stuck in collision, don't do anything
            const hitLayer = tileCollisionTest(this.pos);
            if (!testCollision(oldPos))
            {
                // test which side we bounced off (or both if a corner)
                const isBlockedX = testCollision(vec2(this.pos.x, oldPos.y));
                const isBlockedY = testCollision(vec2(oldPos.x, this.pos.y));
                // collide callback may hit where the layer test does not, so hitLayer can be undefined
                const hitRestitution = hitLayer ? max(restitution, hitLayer.restitution) : restitution;
                const hitFriction = hitLayer ? max(friction, hitLayer.friction) : friction;
                if (isBlockedX)
                {
                    // move to previous X position and bounce
                    this.pos.x = oldPos.x;
                    this.velocity.x *= -hitRestitution;
                    this.velocity.y *= hitFriction;
                }
                if (isBlockedY || !isBlockedX)
                {
                    const wasFalling = this.velocity.y < 0 && gravity.y < 0 || this.velocity.y > 0 && gravity.y > 0;
                    if (wasFalling)
                        this.groundObject = hitLayer;

                    // move to previous Y position and bounce
                    this.pos.y = oldPos.y;
                    this.velocity.y *= -hitRestitution;
                    this.velocity.x *= hitFriction;
                }
                debugPhysics && debugRect(this.pos, this.size, '#f00');
            }
        }
    }

    /** Destroy this particle */
    destroy()
    {
        const destroyCallback = this.emitter.particleDestroyCallback;
        const c = this.colorEnd;
        this.color.set(c.r, c.g, c.b, c.a);
        this.size.set(this.sizeEnd, this.sizeEnd);
        this.destroyed = true;
        destroyCallback?.(this);
    }

    /** Render the particle, automatically called each frame */
    render()
    {
        // emitter properties
        const emitter = this.emitter;
        const localSpace = emitter.localSpace;
        const additive = emitter.additive;
        const trailScale = emitter.trailScale;
        const fadeRate = emitter.fadeRate / 2;

        // lerp color and size
        const p1 = this.lifeTime > 0 ? min((time - this.spawnTime) / this.lifeTime, 1) : 1, p2 = 1-p1;
        const radius = p2 * this.sizeStart + p1 * this.sizeEnd;
        const size = vec2(radius);
        const alphaFade = p1 < fadeRate ? p1/fadeRate : 
            p1 > 1-fadeRate ? (1-p1)/fadeRate : 1;
        this.color.r = p2 * this.colorStart.r + p1 * this.colorEnd.r;
        this.color.g = p2 * this.colorStart.g + p1 * this.colorEnd.g;
        this.color.b = p2 * this.colorStart.b + p1 * this.colorEnd.b;
        this.color.a = (p2 * this.colorStart.a + p1 * this.colorEnd.a) * alphaFade;

        // update the position and angle for drawing
        const pos = particleDrawPos.set(this.pos.x, this.pos.y);
        let angle = this.angle;
        if (localSpace)
        {
            // in local space of emitter
            const a = emitter.angle;
            const c = cos(-a), s = sin(-a);
            pos.set(emitter.pos.x + pos.x*c - pos.y*s,
                emitter.pos.y + pos.x*s + pos.y*c);
            angle += a;
        }

        // draw the particle
        additive && setAdditiveBlendMode();
        if (trailScale)
        {
            // trail style particles
            const velocity = localSpace ?
                this.velocity.rotate(emitter.angle) : this.velocity;
            const speed = velocity.length();
            if (speed)
            {
                // stretch in direction of motion
                const trailLength = speed * trailScale;
                size.y = max(size.x, trailLength);
                angle = atan2(velocity.x, velocity.y);
                drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
        additive && setAdditiveBlendMode(false);
        debugParticles && debugRect(pos, size, '#f005', 0, angle);
    }
}
/**
 * LittleJS WebGL Interface
 * - WebGL2 rendering engine for high-performance graphics
 * - Batched sprite rendering for drawing thousands of sprites efficiently
 * - Instanced rendering using vertex array objects (VAOs)
 * - Polygon rendering with triangle strip support
 * - Shader system with custom vertex and fragment shaders
 * - Texture management with automatic atlas support
 * - Post-processing effects via framebuffer and shader plugins
 * - Automatic fallback to Canvas2D if WebGL is unavailable
 * - Context loss and restoration handling
 * - Can be disabled with glEnable setting
 * - Advanced users can create custom shaders and render targets
 * @namespace WebGL
 */

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
let glShader, glPolyShader, glPolyMode, glAdditive, glBatchAdditive, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glBatchCount, glTextureInfos, glInstancedVAO, glPolyVAO, glFramebuffer, glRenderTarget, glShaderObjects = [], glCustomShader, glBatchShader, glProgramCustom, glTransform, glUniformLocations = new Map, glCanBeEnabled = true;

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
// the sprite vertex shader, shared by the engine's program and every Shader so one vertex layout fits all
const gl_VERTEX_SOURCE =
    '#version 300 es\n' +            // specify GLSL ES version
    'precision highp float;'+        // use highp for accuracy
    'uniform mat4 m;'+               // transform matrix
    'layout(location=0) in vec2 g;'+ // in: geometry
    'layout(location=1) in vec4 p;'+ // in: position/size
    'layout(location=2) in vec4 u;'+ // in: uvs
    'layout(location=3) in vec4 c;'+ // in: color
    'layout(location=4) in vec4 a;'+ // in: additiveColor
    'layout(location=5) in float r;'+// in: rotation
    'out vec2 v,l;'+                 // out: uv, and 0 to 1 across the sprite for a Shader's localUV
    'out vec4 d,e;'+                 // out: color, additiveColor
    'void main(){'+                  // shader entry point
    'vec2 s=(g-.5)*p.zw;'+           // get size offset
    'gl_Position=m*vec4(p.xy+s*cos(r)-vec2(-s.y,s)*sin(r),1,1);'+ // transform position
    'v=mix(u.xw,u.zy,g);'+           // pass uv to fragment shader
    'l=g;d=c;e=a;'+                  // pass local uv and colors to fragment shader
    '}';                             // end of shader

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
        // every Shader compiles again on its next draw, and the first flush after restore picks its program again
        for (const shader of glShaderObjects)
            shader.program = undefined;
        glBatchShader = undefined;
        glProgramCustom = true;
        glUniformLocations = new Map; // the programs those belonged to are gone
        // drop any partially-filled batch so the next glFlush doesn't
        // upload stale glBatchCount against fresh empty buffers on restore
        glBatchCount = 0;
        glPolyMode = false;
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
            info.glTexture = glCreateTexture(info.image, info.wrap);
        pluginList.forEach(plugin=>plugin.glContextRestored?.());
    });

    function initWebGL()
    {
        // setup instanced rendering shader program
        glShader = glCreateProgram(gl_VERTEX_SOURCE,
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for accuracy
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
        glFramebuffer = glContext.createFramebuffer();
        glBatchCount = 0;

        // create the geometry buffer, triangle strip square
        const geometry = new Float32Array([0,0,1,0,0,1,1,1]);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, geometry, glContext.STATIC_DRAW);
        
        let offset, shader, stride;
        const initVertexAttrib = (name, type, typeSize, size, divisor=0)=>
        {
            const location = glContext.getAttribLocation(shader, name);
            const normalize = typeSize === 1;
            const fixedStride = typeSize && stride;
            glContext.enableVertexAttribArray(location);
            glContext.vertexAttribPointer(location, size, type, normalize, fixedStride, offset);
            glContext.vertexAttribDivisor(location, divisor);
            offset += size*typeSize;
        }

        // setup VAO for instanced rendering
        glInstancedVAO = glContext.createVertexArray();
        glContext.bindVertexArray(glInstancedVAO);
        
        // configure instanced vertex attributes
        offset = 0, shader = glShader, stride = gl_INSTANCE_BYTE_STRIDE;
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        initVertexAttrib('g', glContext.FLOAT, 0, 2); // geometry
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
        initVertexAttrib('p', glContext.FLOAT, 4, 4, 1); // position & size
        initVertexAttrib('u', glContext.FLOAT, 4, 4, 1); // texture coords
        initVertexAttrib('c', glContext.UNSIGNED_BYTE, 1, 4, 1); // color
        initVertexAttrib('a', glContext.UNSIGNED_BYTE, 1, 4, 1); // additiveColor
        initVertexAttrib('r', glContext.FLOAT, 4, 1, 1); // rotation

        // setup VAO for poly rendering
        glPolyVAO = glContext.createVertexArray();
        glContext.bindVertexArray(glPolyVAO);
        
        // configure poly vertex attributes
        offset = 0, shader = glPolyShader, stride = gl_POLY_VERTEX_BYTE_STRIDE;
        initVertexAttrib('p', glContext.FLOAT, 4, 2);         // position
        initVertexAttrib('c', glContext.UNSIGNED_BYTE, 1, 4); // color
    }
}

function glSetInstancedMode(force=false)
{
    if (!force && !glPolyMode) return;
    
    // setup instanced mode
    glFlush();
    glPolyMode = false;
    glContext.useProgram(glShader);
    glContext.bindVertexArray(glInstancedVAO);
}

function glSetPolyMode()
{
    if (glPolyMode) return;
    
    // setup poly mode
    glFlush();
    glPolyMode = true;
    glContext.useProgram(glPolyShader);
    glContext.bindVertexArray(glPolyVAO);
}

// Setup WebGL render each frame, called automatically by engine
// Also used by tile layer rendering when redrawing tiles
function glPreRender(clear=true)
{
    if (!glEnable || !glContext) return;

    ASSERT(!glBatchCount, 'glPreRender called with unflushed batch.');

    // mainCanvasSize is css pixels, the backing store is scaled by the pixel
    // ratio, render targets are offscreen so they are never scaled
    const dpr = glRenderTarget ? 1 : getCanvasPixelRatio();
    const bufferSizeX = mainCanvasSize.x * dpr | 0;
    const bufferSizeY = mainCanvasSize.y * dpr | 0;
    if (!glRenderTarget)
    {
        // set to same size as main canvas, only when it changes because
        // setting it reallocates the drawing buffer and invalidates the frame
        if (glCanvas.width !== bufferSizeX || glCanvas.height !== bufferSizeY)
        {
            glCanvas.width = bufferSizeX;
            glCanvas.height = bufferSizeY;
        }
    }
    glContext.viewport(0, 0, bufferSizeX, bufferSizeY);
    clear && glClearCanvas();

    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    if (glRenderTarget)
        s.y = -s.y; // invert y when using render target
    const rotatedCam = cameraPos.rotate(-cameraAngle);
    const p = vec2(-1).subtract(rotatedCam.multiply(s));
    const ca = cos(cameraAngle);
    const sa = sin(cameraAngle);
    const transform = [
        s.x  * ca,  s.y * sa, 0, 0,
        -s.x * sa,  s.y * ca, 0, 0,
        1,          1,        1, 0,
        p.x,        p.y,      0, 1];
    glTransform = transform;

    // set the same transform matrix for both shaders
    const initUniform = (program, uniform, value)=>
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

    // rebind the array buffer
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);

    // start with additive blending off
    glAdditive = glBatchAdditive = false;

    // force it to set instanced mode
    glSetInstancedMode(true);
}

/** Clear the canvas and setup the viewport
 *  @memberof WebGL */
function glClearCanvas()
{
    if (!glContext) return;

    // clear using the canvasClearColor
    const color = canvasClearColor;
    glContext.clearColor(color.r, color.g, color.b, color.a);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
}

/** Set the WebGL texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @memberof WebGL */
function glSetTexture(texture)
{
    // must flush cache with the old texture to set a new one
    if (!glContext || texture === glActiveTexture) return;

    glFlush();
    glActiveTexture = texture;
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
}

/** Set the wrap mode (REPEAT or CLAMP_TO_EDGE) on an existing WebGL texture
 *  Flushes the current batch only if the texture is the active one
 *  @param {WebGLTexture} texture
 *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE
 *  @memberof WebGL */
function glSetTextureWrap(texture, wrap=true)
{
    if (!glContext || !texture) return;

    // flush only if changing wrap on the currently bound texture
    const isCurrent = texture === glActiveTexture;
    if (isCurrent)
        glFlush();
    else
        glContext.bindTexture(glContext.TEXTURE_2D, texture);

    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);

    if (!isCurrent && glActiveTexture)
        glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
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

// a uniform location, looked up once per program
function glUniformLocation(program, name)
{
    let cache = glUniformLocations.get(program);
    cache || glUniformLocations.set(program, cache = {});
    return cache[name] ??= glContext.getUniformLocation(program, name);
}

// a Shader's 2D program, compiled the first time a batch needs it: the snippet's mainImage gives the surface
// color, then the sprite's color and additive color apply as the engine's own fragment shader does
function glShaderProgram(shader)
{
    return shader.program ||= glCreateProgram(gl_VERTEX_SOURCE,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform sampler2D iChannel0;' + // the texture
        'uniform vec3 iResolution;' +    // canvas size in pixels
        'uniform float iTime;' +         // engine time
        'in vec2 v,l;in vec4 d,e;out vec4 c;\n' + // a define needs its own line
        '#define localUV l\n' +
        shader.fragmentCode + '\n' +
        'void main(){vec4 t;mainImage(t,v);c=t*d+e;}');
}

/** Create WebGL texture from an image and init the texture settings
 *  Restores the active texture when done
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} [image]
 *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image, wrap=false)
{
    if (!glContext) return;

    // build the texture
    const texture = glContext.createTexture();
    let mipMap = false;
    if (image?.width)
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
    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);
    if (mipMap)
        glContext.generateMipmap(glContext.TEXTURE_2D);

    // rebind active texture
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
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
    ASSERT(image?.width > 0, 'Invalid image data.');
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, image);

    // keep mipmaps in sync with new level 0 data (same condition as glCreateTexture)
    if (!tilesPixelated && isPowerOfTwo(image.width) && isPowerOfTwo(image.height))
        glContext.generateMipmap(glContext.TEXTURE_2D);

    // rebind active texture
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);
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
        textureInfo.glTexture = glCreateTexture(textureInfo.image, textureInfo.wrap);
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
        // set blend mode
        const destBlend = glBatchAdditive ? glContext.ONE : glContext.ONE_MINUS_SRC_ALPHA;
        glContext.blendFuncSeparate(glContext.SRC_ALPHA, destBlend, glContext.ONE, destBlend);
        glContext.enable(glContext.BLEND);

        // a Shader's program for this batch, or the engine's own again after one
        if (!glPolyMode && (glBatchShader || glProgramCustom))
        {
            const program = glBatchShader ? glShaderProgram(glBatchShader) : glShader;
            glContext.useProgram(program);
            glProgramCustom = !!glBatchShader;
            if (glBatchShader)
            {
                const uniform = (name)=> glUniformLocation(program, name);
                glContext.uniformMatrix4fv(uniform('m'), false, glTransform);
                glContext.uniform1f(uniform('iTime'), time);
                glContext.uniform3f(uniform('iResolution'), glCanvas.width, glCanvas.height, 1);
            }
        }
        
        const byteLength = glBatchCount * 
            (glPolyMode ? gl_INDICES_PER_POLY_VERTEX : gl_INDICES_PER_INSTANCE);
        glContext.bufferSubData(glContext.ARRAY_BUFFER, 0, glPositionData, 0, byteLength);
        
        // draw the batch
        if (glPolyMode)
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, glBatchCount);
        else
            glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, glBatchCount);
        ++drawCount;
        primitiveCount += glBatchCount;
        glBatchCount = 0;
    }
    glBatchAdditive = glAdditive;
    glBatchShader = glCustomShader;
}

/** Flush any sprites still in the buffer and copy to main canvas
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @memberof WebGL */
function glCopyToContext(context)
{
    if (!glEnable || !glContext) return;

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
    if (glBatchCount >= gl_MAX_INSTANCES || glBatchAdditive !== glAdditive || glBatchShader !== glCustomShader)
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

/** Add an untextured rect to the gl draw list
 *  Zeroes the uvs and rgba so the texture contribution multiplies to 0,
 *  then carries the real color in the additive slot. Works regardless of
 *  which texture is currently bound.
 *  @param {number} x
 *  @param {number} y
 *  @param {number} sizeX
 *  @param {number} sizeY
 *  @param {number} angle
 *  @param {number} rgba - color as 32-bit integer
 *  @memberof WebGL */
function glDrawUntextured(x, y, sizeX, sizeY, angle, rgba)
{
    glDraw(x, y, sizeX, sizeY, angle, 0, 0, 0, 0, 0, rgba);
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
    const sa = sin(-angle);
    const ca = cos(-angle);
    for (const p of points)
    {
        // transform the point
        const px = p.x*sx;
        const py = p.y*sy;
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
    ASSERT(vertCount < gl_MAX_POLY_VERTEXES, 'poly exceeds max batch size');
    if (vertCount >= gl_MAX_POLY_VERTEXES) return; // release-build safety net
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
    ASSERT(vertCount < gl_MAX_POLY_VERTEXES, 'poly exceeds max batch size');
    if (vertCount >= gl_MAX_POLY_VERTEXES) return; // release-build safety net
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

/** Set the WebGL render target to the given texture or back to the canvas
 *  @param {WebGLTexture} [texture] - a texture or undefined to use normal glCanvas
 *  @param {boolean} [clear] - should the render target be cleared
 *  @memberof WebGL */
function glSetRenderTarget(texture, clear=false)
{
    if (texture)
    {
        glRenderTarget = texture;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, glFramebuffer);
        glContext.framebufferTexture2D(glContext.FRAMEBUFFER, 
            glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, texture, 0);
        glPreRender(clear);
    }
    else
    {
        glFlush();
        glRenderTarget = undefined;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);

        // use the backing store size, mainCanvasSize is css pixels and may
        // still be the render target's size when unwinding a layer redraw
        glContext.viewport(0, 0, glCanvas.width, glCanvas.height);
    }
}

/** Clear out a rectangle area of the WebGL canvas or render target
 *  @param {number} x
 *  @param {number} y
 *  @param {number} width
 *  @param {number} height
 *  @memberof WebGL */
function glClearRect(x, y, width, height)
{
    if (!glEnable) return;

    // Enable scissor test to clear only the specified area
    glContext.enable(glContext.SCISSOR_TEST);
    glContext.scissor(x, y, width, height);
    glContext.clearColor(0, 0, 0, 0);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
    glContext.disable(glContext.SCISSOR_TEST);
}

///////////////////////////////////////////////////////////////////////////////

// WebGL internal function to convert polygon to outline triangle strip
function glMakeOutline(points, width, wrap=true)
{
    if (points.length < 2)
        return [];
    
    const halfWidth = width / 2;
    const strip = [];
    const n = points.length;
    const e = 1e-6;
    // miter ratio cap (dimensionless, matches SVG/Canvas2D convention)
    const miterLimit = 10;
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

    // ensure counter-clockwise winding (slice first so we don't mutate caller's array)
    if (signedArea(points) < 0)
        points = points.slice().reverse();

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
            if (cross(a, b, c) < e) continue;
                
            // check if any other point is inside
            let hasInside = false;
            for (let j = 0; j < indices.length; j++)
            {
                const k = indices[j];
                if (k === i0 || k === i1 || k === i2) continue;

                const p = points[k];
                hasInside = pointInTriangle(p, a, b, c);
                if (hasInside) break;
            }
            if (hasInside) continue;

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
            if (worstIndex < 0) break;
            
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
/**
 * LittleJS Engine Logo
 * - Draws the LittleJS splash screen logo
 * - Used internally during engine startup
 */

///////////////////////////////////////////////////////////////////////////////
function drawEngineLogo(t)
{
    const blackAndWhite = 0;
    const showName = 1;

    // LittleJS Logo and Splash Screen
    // the splash runs before the engine loop so size the canvas here too
    engineUpdateCanvas();
    const x = mainContext;
    const w = mainCanvasSize.x;
    const h = mainCanvasSize.y;
    {
        // background
        const p3 = percent(t, 1, .8);
        const p4 = percent(t, 0, .5);
        const g = x.createRadialGradient(w/2,h/2,0,w/2,h/2,hypot(w,h)*.6);
        g.addColorStop(0,hsl(0,0,lerp(0,p3/2,p4),p3).toString());
        g.addColorStop(1,hsl(0,0,0,p3).toString());
        x.save();
        x.fillStyle = g;
        x.fillRect(0,0,w,h);
    }
    const gradient = (X1,Y1,X2,Y2,C,S=1)=>
    {
        if (C >= 0)
        {
            if (blackAndWhite)
                x.fillStyle = '#fff';
            else
            {
                const g = x.fillStyle = x.createLinearGradient(X1,Y1,X2,Y2);
                g.addColorStop(0,color(C,2));
                g.addColorStop(1,color(C,1));
            }
        }
        else
            x.fillStyle = '#000';
        C >= -1 ? (x.fill(), S && x.stroke()) : x.stroke();
    }
    const circle = (X,Y,R,A=0,B=2*PI,C,S)=>
    {
        x.beginPath();
        x.arc(X,Y,R,p*A,p*B);
        gradient(X,Y-R,X,Y+R,C,S);
    }
    const rect = (X,Y,W,H,C)=>
    {
        x.beginPath();
        x.rect(X,Y,W,H*p);
        gradient(X,Y+H,X+W,Y,C);
    }
    const poly = (points,C,Y,H)=>
    {
        x.beginPath();
        for (const p of points)
            x.lineTo(p.x, p.y);
        x.closePath();
        gradient(0, Y, 0, Y+H,C);
    }
    const color = (c,l)=> l?`hsl(${[.95,.56,.13][c%3]*360} 99%${[0,50,75][l]}%)`:'#000';

    // center and fit to screen
    const alpha = oscillate(1,1,t);
    const p = percent(alpha, .1, .5);
    const size = min(6, min(w,h)/99);
    x.translate(w/2,h/2);
    x.scale(size,size);
    x.translate(-40,-35);
    p < 1 && x.setLineDash([99*p,99]);
    x.lineJoin = x.lineCap = 'round';
    x.lineWidth = .1 + p*1.9;
    //x.strokeStyle='#fff7';

    if (showName)
    {
        // engine name text
        const Y = 54;
        const s = 'LittleJS';
        x.font = '900 15.5px arial';
        x.lineWidth = .1+p*3.9;
        x.textAlign = 'center';
        x.textBaseline = 'top';
        rect(11,Y+1,59,8*p,-1);
        x.beginPath();

        let w2 = 0;
        for (let i=0;i<s.length;++i)
            w2 += x.measureText(s[i]).width;
        for (let j=2;j--;)
        for (let i=0,X=40-w2/2;i<s.length;++i)
        {
            const w = x.measureText(s[i]).width, X2 = X+w/2;
            gradient(X2,Y,X2+2,Y+13,i>5?1:0);
            x[j?'strokeText':'fillText'](s[i],X2,Y+.5,17*p);
            X += w;
        }

        x.lineWidth = .1 + p*1.9;
        rect(3,Y,73,0); // bottom
    }

    rect(7,15,26,-7,0);   // cab top
    rect(25,15,8,25,-1);  // cab front
    rect(10,40,15,-25,1); // cab back
    rect(14,21,7,9,2);    // cab window
    rect(38,20,6,-6,2);   // little stack

    // big stack
    rect(49,20,10,-6,0);
    const stackPoints = [vec2(44,8),vec2(64,8),vec2(59,8+6*p),vec2(49,8+6*p)];
    poly(stackPoints,2,8,6*p);
    rect(44,8,20,-7,0);

    // engine
    for (let i=5;i--;) circle(59-i*6*p,30,10,0,2*PI,1,0);
    circle(59,30,4,0,7,2); // light

    // engine outline
    rect(35,20,24,0);  // top
    circle(59,30,10);  // front
    circle(47,30,10,PI/2,PI*3/2); // middle
    circle(35,30,10,PI/2,PI*3/2); // back
    rect(7,40,13,7,-1);   // bottom back
    rect(17,40,43,14,-1); // bottom center

    // wheels
    for (let i=3;i--;) for (let j=2;j--;) circle(17+15*i,47,j?7:1,0,2*PI,2);

    // cowcatcher
    for (let i=2;i--;)
    {
        let w=6, s=7, o=53+w*p*i
        const points = [vec2(o+s,54),vec2(o,40),vec2(o+w*p,40),vec2(o+s+w*p,54)];
        poly(points,0,40,14);
    }

    x.restore();
}

/**
 * LittleJS Medal System
 * - Achievement/trophy system for games
 * - Medal class with name, description, icon, and unlock tracking
 * - Automatic saving to local storage
 * - Visual display queue with slide-in notifications
 * - Newgrounds API integration for online achievements
 * - Debug mode to unlock/reset medals during development
 * @namespace Medals
 */

let debugMedals = false;

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Size of medal display
 *  @type {Vector2}
 *  @default Vector2(640,80)
 *  @memberof Settings */
let medalDisplaySize = vec2(640, 80);

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let medalsPreventUnlock = false;

/** List of all medals
 *  @type {Object}
 *  @memberof Medals */
const medals = {};

// Engine internal variables not exposed to documentation
let medalsDisplayQueue = [], medalsSaveName, medalsDisplayTimeLast;

///////////////////////////////////////////////////////////////////////////////

/** Initialize medals with a save name used for storage
 *  - Call this after creating all medals
 *  - Checks if medals are unlocked
 *  @param {string} saveName
 *  @memberof Medals */
function medalsInit(saveName)
{
    // check if medals are unlocked
    medalsSaveName = saveName;
    if (!debugMedals)
    {
        let saved = {};
        try { saved = JSON.parse(localStorage[saveName] || '{}'); }
        catch (e) { saved = {}; }
        medalsForEach(medal => {
            medal.unlocked = !!(saved[medal.id] && saved[medal.id].unlocked);
        });
        medalsSave();
    }

    // engine automatically renders medals
    engineAddPlugin(undefined, medalsRender);

    // plugin functions
    function medalsRender()
    {
        if (!medalsDisplayQueue.length) return;

        // update first medal in queue
        const medal = medalsDisplayQueue[0];
        const time = timeReal - medalsDisplayTimeLast;
        if (!medalsDisplayTimeLast)
            medalsDisplayTimeLast = timeReal;
        else if (time > medalDisplayTime)
        {
            medalsDisplayTimeLast = 0;
            medalsDisplayQueue.shift();
        }
        else
        {
            // slide on/off medals
            const slideOffTime = medalDisplayTime - medalDisplaySlideTime;
            const hidePercent =
                time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
                time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
            medal.render(hidePercent);
        }
    }
}

/**
 *  @callback MedalCallbackFunction - Function that processes a medal
 *  @param {Medal} medal
 *  @memberof Medals
 */

/** Calls a function for each medal
 *  @param {MedalCallbackFunction} callback
 *  @memberof Medals */
function medalsForEach(callback)
{ Object.values(medals).forEach(medal=>callback(medal)); }

/** Reset all medals to locked and persist the cleared catalog
 *  @memberof Medals */
function medalsReset()
{
    medalsForEach(medal => medal.unlocked = false);
    medalsSave();
}

function medalsSave()
{
    if (!medalsSaveName) return;
    const data = {};
    medalsForEach(medal => {
        const entry = {
            name: medal.name,
            description: medal.description,
            icon: medal.icon,
            unlocked: medal.unlocked,
        };
        if (medal.image) entry.src = medal.image.src;
        data[medal.id] = entry;
    });
    localStorage[medalsSaveName] = JSON.stringify(data);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Medal - Tracks an unlockable medal
 * @memberof Medals
 * @example
 * // create a medal
 * const medal_example = new Medal(0, 'Example Medal', 'More info about the medal goes here.', '🎖️');
 *
 * // initialize medals
 * medalsInit('Example Game');
 *
 * // unlock the medal
 * medal_example.unlock();
 */
class Medal
{
    /** Create a medal object and adds it to the list of medals
     *  @param {number} id            - The unique identifier of the medal
     *  @param {string} name          - Name of the medal
     *  @param {string} [description] - Description of the medal
     *  @param {string} [icon]        - Icon for the medal
     *  @param {string} [src]         - Image location for the medal
     */
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(id >= 0 && !medals[id]);

        /** @property {number} - The unique identifier of the medal */
        this.id = id;

        /** @property {string} - Name of the medal */
        this.name = name;

        /** @property {string} - Description of the medal */
        this.description = description;

        /** @property {string} - Icon for the medal */
        this.icon = icon;

        /** @property {boolean} - Is the medal unlocked? */
        this.unlocked = false;

        /** @property {HTMLImageElement|undefined} - Source image for the medal icon, if any */
        this.image = undefined;
        if (src)
            (this.image = new Image).src = src;

        // add this to list of medals
        medals[id] = this;
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked) return;

        ASSERT(medalsSaveName, 'save name must be set');
        this.unlocked = true;
        medalsSave();
        medalsDisplayQueue.push(this);
    }

    /** Render a medal
     *  @param {number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = mainContext;
        const width = min(medalDisplaySize.x, mainCanvasSize.x);
        const height = medalDisplaySize.y;
        const x = mainCanvasSize.x - width;
        const y = -height*hidePercent;
        const backgroundColor = hsl(0,0,.9);

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = backgroundColor.toString();
        context.strokeStyle = BLACK.toString();
        context.lineWidth = 3;
        context.rect(x, y, width, height);
        context.fill();
        context.stroke();
        context.clip();

        // draw the icon
        const gap = vec2(.1, .05).scale(height);
        const medalDisplayIconSize = height - 2*gap.x;
        this.renderIcon(vec2(x + gap.x + medalDisplayIconSize/2, y + height/2), medalDisplayIconSize);

        // draw the name
        const nameSize = height*.5;
        const descriptionSize = height*.3;
        const pos = vec2(x + medalDisplayIconSize + 2*gap.x, y + gap.y*2 + nameSize/2);
        const textWidth = width - medalDisplayIconSize - 3*gap.x;
        drawTextScreen(this.name, pos, nameSize, BLACK, 0, undefined, 'left', undefined, undefined, textWidth);

        // draw the description
        pos.y = y + height - gap.y*2 - descriptionSize/2;
        drawTextScreen(this.description, pos, descriptionSize, BLACK, 0, undefined, 'left', undefined, undefined, textWidth);
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Vector2} pos - Screen space position
     *  @param {number} size - Screen space size
     */
    renderIcon(pos, size)
    {
        // draw the image or icon
        if (this.image)
            mainContext.drawImage(this.image, pos.x-size/2, pos.y-size/2, size, size);
        else
            drawTextScreen(this.icon, pos, size*.7, BLACK);
    }

}

///////////////////////////////////////////////////////////////////////////////
// Medals setting setters

/** Set how long to show medals for in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplayTime(time) { medalDisplayTime = time; }

/** Set how quickly to slide on/off medals in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplaySlideTime(time) { medalDisplaySlideTime = time; }

/** Set size of medal display
 *  @param {Vector2} size
 *  @memberof Settings */
function setMedalDisplaySize(size) { medalDisplaySize = size.copy(); }

/** Set to stop medals from being unlockable
 *  @param {boolean} preventUnlock
 *  @memberof Settings */
function setMedalsPreventUnlock(preventUnlock) { medalsPreventUnlock = preventUnlock; }

/**
 * LittleJS Newgrounds Plugin
 * - NewgroundsMedal extends Medal with Newgrounds API functionality
 * - Call new NewgroundsPlugin(app_id) to setup Newgrounds
 * - Encrypts calls with the browser's own WebCrypto when the app has a cipher, no library needed
 * - provides functions to interact with medals scoreboards
 * - Keeps connection alive and logs views
 * - Every call is a fetch, so the functions return promises; await newgrounds.ready for the medals and scoreboards
 * @namespace Newgrounds
 */

/** Global Newgrounds object
 *  @type {NewgroundsPlugin}
 *  @memberof Newgrounds */
let newgrounds;

///////////////////////////////////////////////////////////////////////////////
/**
 * Newgrounds medal auto unlocks in newgrounds API
 * @extends Medal
 * @memberof Newgrounds
 */
class NewgroundsMedal extends Medal
{
    /** Create a newgrounds medal object and adds it to the list of medals
     *  @param {number} id            - The unique identifier of the medal
     *  @param {string} name          - Name of the medal
     *  @param {string} [description] - Description of the medal
     *  @param {string} [icon]        - Icon for the medal
     *  @param {string} [src]         - Image location for the medal
     */
    constructor(id, name, description, icon, src)
    { super(id, name, description, icon, src); }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        super.unlock();
        newgrounds && newgrounds.unlockMedal(this.id);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Newgrounds API object
 * @memberof Newgrounds
 */
class NewgroundsPlugin
{
    /** Create the global newgrounds object
     *  @param {string} app_id   - The newgrounds App ID
     *  @param {string} [cipher] - The encryption key from the app's settings, AES-128 as Base64; calls are encrypted with
     *    the browser's WebCrypto, which needs a secure page, https or localhost
     *  @example
     *  // create the newgrounds object, replace the app id with your own
     *  const app_id = 'your_app_id_here';
     *  new NewgroundsPlugin(app_id);
     */
    constructor(app_id, cipher)
    {
        ASSERT(!newgrounds, 'there can only be one newgrounds object');
        ASSERT(!cipher || typeof crypto != 'undefined' && crypto.subtle, 'a cipher needs WebCrypto, which the browser only has on a secure page');

        newgrounds = this; // set global newgrounds object
        /** @property {string} - The newgrounds App ID */
        this.app_id = app_id;
        /** @property {string|undefined} - AES-128/Base64 encryption key, if any */
        this.cipher = cipher;
        this.cryptoKey = undefined; // the cipher imported for WebCrypto, on the first encrypted call
        const hasLocation = typeof location != 'undefined';
        /** @property {string} - Hostname used when logging views */
        this.host = hasLocation ? location.hostname : '';
        /** @property {Array} - Medals fetched from Newgrounds, empty until ready */
        this.medals = [];
        /** @property {Array} - Scoreboards fetched from Newgrounds, empty until ready */
        this.scoreboards = [];

        // get session id from url search params
        /** @property {string|null} - Newgrounds session id from the URL (null when not logged in) */
        this.session_id = hasLocation ? new URL(location.href).searchParams.get('ngio_session_id') : null;

        /** @property {Promise<NewgroundsPlugin>} - Resolves once the medals and scoreboards have been fetched, or right away when not logged in */
        this.ready = this.session_id ? this.init() : Promise.resolve(this); // only use newgrounds when logged in
    }

    // fetch the medals and scoreboards, then keep the session alive
    async init()
    {
        const medalsResult = await this.call('Medal.getList');

        // bail early if the first call failed (offline / bad session / server error)
        if (!medalsResult || !medalsResult.result || medalsResult.result.error)
        {
            debugMedals && LOG('Newgrounds session unavailable; skipping plugin init');
            return this;
        }

        this.medals = medalsResult.result.data?.['medals'] || [];
        debugMedals && LOG(this.medals);
        for (const newgroundsMedal of this.medals)
        {
            const medal = medals[newgroundsMedal['id']];
            if (medal)
            {
                // copy newgrounds medal data
                medal.image =       new Image;
                medal.image.src =   newgroundsMedal['icon'];
                medal.name =        newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked =    newgroundsMedal['unlocked'];
                medal.difficulty =  newgroundsMedal['difficulty'];
                medal.value =       newgroundsMedal['value'];

                if (medal.value) // add value to description
                    medal.description = medal.description + ` (${ medal.value })`;
            }
        }

        const scoreboardResult = await this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult?.result?.data?.scoreboards || [];
        debugMedals && LOG(this.scoreboards);

        // keep the session alive with a ping every minute
        const keepAliveMS = 60 * 1e3;
        setInterval(()=>this.call('Gateway.ping', 0), keepAliveMS);
        return this;
    }

    /** Send message to unlock a medal by id
     * @param {number} id - The medal id
     * @return {Promise<Object>} - The response JSON object */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}); }

    /** Send message to post score
     * @param {number} id    - The scoreboard id
     * @param {number} value - The score value
     * @return {Promise<Object>} - The response JSON object */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}); }

    /** Get scores from a scoreboard
     * @param {number} id       - The scoreboard id
     * @param {string} [user]   - A user's id or name
     * @param {number} [social] - If true, only social scores will be loaded
     * @param {number} [skip]   - Number of scores to skip over
     * @param {number} [limit]  - Number of scores to include in the list
     * @return {Promise<Object>} - The response JSON object
     */
    getScores(id, user, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view
     * @return {Promise<Object>} - The response JSON object */
    logView() { return this.call('App.logView', {'host':this.host}); }

    /** Encrypt text the way the Newgrounds gateway expects, AES-128 CBC with a random iv in front, as Base64
     * @param {string} text
     * @return {Promise<string>} */
    async encrypt(text)
    {
        if (!this.cryptoKey)
        {
            const keyBytes = Uint8Array.from(atob(this.cipher), c=> c.charCodeAt(0));
            this.cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
        }
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({'name':'AES-CBC', iv}, this.cryptoKey, new TextEncoder().encode(text)));
        const bytes = new Uint8Array(iv.length + encrypted.length);
        bytes.set(iv);
        bytes.set(encrypted, iv.length);
        let binary = '';
        for (const b of bytes)
            binary += String.fromCharCode(b);
        return btoa(binary);
    }

    /** Send a message to call a component of the Newgrounds API
     * @param {string}  component    - Name of the component
     * @param {Object}  [parameters] - Parameters to use for call
     * @return {Promise<Object>}     - The response JSON object, undefined when the call failed
     */
    async call(component, parameters)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // the whole call goes encrypted in its place
            call['secure'] = await this.encrypt(JSON.stringify(call));
            call['parameters'] = 0;
        }

        // build the input object
        const input =
        {
            'app_id':     this.app_id,
            'session_id': this.session_id,
            'call':       call
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));

        // send post data
        const url = 'https://newgrounds.io/gateway_v3.php';
        try
        {
            const response = await fetch(url, {'method':'POST', 'body':formData});
            const text = await response.text();
            debugMedals && LOG(text);
            return text && JSON.parse(text);
        }
        catch(e) { debugMedals && LOG('newgrounds call failed', e); }
    }
}

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
     *  @param {Vector2} [textureSize]  - Size of the lightmap texture (defaults to mainCanvasSize, which is css pixels, so the lightmap is not scaled by canvasPixelRatio; pass mainCanvasSize.scale(getCanvasPixelRatio()) for a full resolution lightmap)
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
        /** @property {Vector2} - Size of the lightmap texture (set at construction; falls back to mainCanvasSize in css pixels at init time, so it is not scaled by canvasPixelRatio) */
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
            setAdditiveBlendMode();
            glContext.enable(glContext.BLEND);
            glContext.blendFunc(glContext.ONE, glContext.ONE);

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

        // drain any sprite-batched draws queued by a previous custom
        // renderLight() override (e.g. drawRect inside a LavaTile). They were
        // queued in the engine's instanced-vertex format and must flush with
        // the engine's shader+VAO bound — NOT this plugin's light shader.
        glFlush();

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

        // restore engine's instanced shader+VAO so subsequent renderLight()
        // overrides that batch through drawRect/drawTile work correctly
        glSetInstancedMode(true);
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

/**
 * LittleJS ZzFXM Plugin
 * @namespace ZzFXM
 */

/**
 * Music Object - Stores a zzfx music track for later use
 * 
 * <a href=https://keithclark.github.io/ZzFXM/>Create music with the ZzFXM tracker.</a>
 * @extends Sound
 * @memberof ZzFXM
 * @example
 * // create some music
 * const music_example = new ZzFXMusic(
 * [
 *     [                         // instruments
 *       [,0,400]                // simple note
 *     ], 
 *     [                         // patterns
 *         [                     // pattern 1
 *             [                 // channel 0
 *                 0, -1,        // instrument 0, left speaker
 *                 1, 0, 9, 1    // channel notes
 *             ], 
 *             [                 // channel 1
 *                 0, 1,         // instrument 0, right speaker
 *                 0, 12, 17, -1 // channel notes
 *             ]
 *         ],
 *     ],
 *     [0, 0, 0, 0], // sequence, play pattern 0 four times
 *     90            // BPM
 * ]);
 * 
 * // play the music on a loop
 * music_example.playMusic();
 */
class ZzFXMusic extends Sound
{
    /** Create a music object and cache the zzfx music samples for later use
     *  @param {[Array, Array, Array, number]} zzfxMusic - Array of zzfx music parameters
     */
    constructor(zzfxMusic)
    {
        super(undefined);

        if (!soundEnable || headlessMode) return;
        this.randomness = 0;
        super.sampleChannels = zzfxM(...zzfxMusic); // the setter, without declaring a field that hides it in the typings
        this.loadedPercent = 1; // generated in place, so it is loaded like a zzfx sound
        this.onloadCallback?.(this);
    }
}

///////////////////////////////////////////////////////////////////////////////
// ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force

/** Generate samples for a ZzFM song with given parameters
 *  @param {Array} instruments - Array of ZzFX sound parameters
 *  @param {Array} patterns - Array of pattern data
 *  @param {Array} sequence - Array of pattern indexes
 *  @param {number} [BPM] - Playback speed of the song in BPM
 *  @return {Array} - Left and right channel sample data
 *  @memberof ZzFXM */
function zzfxM(instruments, patterns, sequence, BPM = 125) 
{
  let i, j, k;
  let instrumentParameters;
  let note;
  let sample;
  let patternChannel;
  let notFirstBeat;
  let stop;
  let instrument;
  let attenuation;
  let outSampleOffset;
  let isSequenceEnd;
  let sampleOffset = 0;
  let nextSampleOffset;
  let sampleBuffer = [];
  let leftChannelBuffer = [];
  let rightChannelBuffer = [];
  let channelIndex = 0;
  let panning = 0;
  let hasMore = 1;
  let sampleCache = {};
  let beatLength = audioDefaultSampleRate / BPM * 60 >> 2;

  // for each channel in order until there are no more
  for (; hasMore; channelIndex++) {

    // reset current values
    sampleBuffer = [hasMore = notFirstBeat = outSampleOffset = 0];

    // for each pattern in sequence
    sequence.forEach((patternIndex, sequenceIndex)=> {
      // get pattern for current channel, use empty 1 note pattern if none found
      patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];

      // check if there are more channels
      hasMore |= patterns[patternIndex][channelIndex]&&1;

      // get next offset, use the length of first channel
      nextSampleOffset = outSampleOffset + (patterns[patternIndex][0].length - 2 - (notFirstBeat?0:1)) * beatLength;
      // for each beat in pattern, plus one extra if end of sequence
      isSequenceEnd = sequenceIndex === sequence.length - 1;
      for (i = 2, k = outSampleOffset; i < patternChannel.length + isSequenceEnd; notFirstBeat = ++i) {

        // <channel-note>
        note = patternChannel[i];

        // stop if end, different instrument or new note
        stop = i === patternChannel.length + isSequenceEnd - 1 && isSequenceEnd ||
            instrument !== (patternChannel[0] || 0) || note | 0;

        // fill buffer with samples for previous beat, most cpu intensive part
        for (j = 0; j < beatLength && notFirstBeat;

            // fade off attenuation at end of beat if stopping note, prevents clicking
            j++ > beatLength - 99 && stop && attenuation < 1? attenuation += 1 / 99 : 0
        ) {
          // copy sample to stereo buffers with panning
          sample = (1 - attenuation) * sampleBuffer[sampleOffset++] / 2 || 0;
          leftChannelBuffer[k] = (leftChannelBuffer[k] || 0) - sample * panning + sample;
          rightChannelBuffer[k] = (rightChannelBuffer[k++] || 0) + sample * panning + sample;
        }

        // set up for next note
        if (note) {
          // set attenuation
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          if (note |= 0) {
            // get cached sample
            sampleBuffer = sampleCache[
              [
                instrument = patternChannel[sampleOffset = 0] || 0,
                note
              ]
            ] = sampleCache[[instrument, note]] || (
                // add sample to cache
                instrumentParameters = [...instruments[instrument]],
                instrumentParameters[2] = (instrumentParameters[2] || 220) * 2**(note / 12 - 1),

                // allow negative values to stop notes
                note > 0 ? zzfxG(...instrumentParameters) : []
            );
          }
        }
      }

      // update the sample offset
      outSampleOffset = nextSampleOffset;
    });
  }

  return [leftChannelBuffer, rightChannelBuffer];
}
/**
 * LittleJS Audio Effects Plugin
 * - Web Audio effects with a wet/dry mix: filter, reverb, delay, distortion, compressor
 * - Route a sound through one with sound.output = effect
 * - Route everything with setAudioMasterEffect(effect)
 * - Chain effects with effect.connect(nextEffect)
 * @namespace AudioEffects
 */

///////////////////////////////////////////////////////////////////////////////

// ramp an audio param to a value, cancelling anything already scheduled so stacked calls don't fight
function audioParamRamp(param, value, fadeTime=0)
{
    ASSERT(fadeTime >= 0, 'fadeTime must be positive or zero');
    const startTime = audioContext.currentTime;
    param.cancelScheduledValues(startTime);
    if (fadeTime)
    {
        param.setValueAtTime(param.value, startTime);
        param.linearRampToValueAtTime(value, startTime + fadeTime);
    }
    else
        param.value = value;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Base class for audio effects, an input and output with a wet/dry mix between them
 * - Sounds connect to input, output goes to the master gain until connect() moves it
 * - Subclasses put their nodes between input and the wet gain with connectEffect
 * @memberof AudioEffects
 * @example
 * const cave = new AudioReverb(3, 2);
 * footstep.output = cave; // every play of this sound is in the cave
 */
class AudioEffect
{
    /** Create an audio effect
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(mix=1)
    {
        ASSERT(isNumber(mix), 'mix must be a number');

        /** @property {GainNode} - Connect sounds to this node */
        this.input = audioContext.createGain();
        /** @property {GainNode} - This node carries the mixed result, send it somewhere with connect(), never by assigning here
         *  - Unlike sound.output, which is where a sound's audio goes and can be set to an effect */
        this.output = audioContext.createGain();
        /** @property {GainNode} - Level of the unprocessed signal */
        this.dryGain = audioContext.createGain();
        /** @property {GainNode} - Level of the processed signal */
        this.wetGain = audioContext.createGain();
        /** @property {number} - Wet/dry balance, 0 is fully dry and 1 is fully wet */
        this.mix = mix;

        this.input.connect(this.dryGain).connect(this.output);
        this.wetGain.connect(this.output);
        this.setMix(mix);

        // send the result to the speakers, connect() moves it into a chain instead
        this.output.connect(audioMasterGain);
    }

    /** Set the wet/dry balance
     *  @param {number} mix - 0 is fully dry and 1 is fully wet
     *  @param {number} [fadeTime] - Seconds to ramp over so the change doesn't click */
    setMix(mix, fadeTime=0)
    {
        ASSERT(isNumber(mix), 'mix must be a number');
        this.mix = mix = clamp(mix);
        this.rampParam(this.dryGain.gain, 1-mix, fadeTime);
        this.rampParam(this.wetGain.gain, mix, fadeTime);
    }

    /** Ramp one of this effect's params, keeping the effect running until the ramp is done
     *  - The browser drops an effect from rendering while nothing plays through it, which
     *    would freeze a ramp partway, so a silent source feeds the input for the ramp's length
     *  @param {AudioParam} param - The param to ramp
     *  @param {number} value - Where to ramp to
     *  @param {number} [fadeTime] - Seconds to ramp over, 0 sets the value at once
     *  @protected */
    rampParam(param, value, fadeTime=0)
    {
        audioParamRamp(param, value, fadeTime);
        if (!fadeTime) return;
        const keepAlive = new ConstantSourceNode(audioContext, { offset: 0 });
        keepAlive.connect(this.input);
        keepAlive.onended = ()=> keepAlive.disconnect();
        keepAlive.start();
        keepAlive.stop(audioContext.currentTime + fadeTime);
    }

    /** Send this effect's output into another effect or audio node instead of the speakers
     *  @param {AudioEffect|AudioNode} target - The next effect in the chain, or any audio node
     *  @return {AudioEffect|AudioNode} - The target, so chains read left to right */
    connect(target)
    {
        // an effect stands in for its input node, the same rule as sound.output
        const node = /** @type {AudioNode} */ (target && 'input' in target ? target.input : target);
        ASSERT(node && typeof node.connect === 'function', 'target must be an AudioEffect or AudioNode');
        this.output.disconnect();
        this.output.connect(node);
        return target;
    }

    /** Stop sending this effect's output anywhere */
    disconnect() { this.output.disconnect(); }

    /** Wire nodes between the input and the wet gain, for subclasses
     *  @param {AudioNode} first - Node the input connects to
     *  @param {AudioNode} [last=first] - Node that connects to the wet gain
     *  @protected */
    connectEffect(first, last=first)
    {
        this.input.connect(first);
        last.connect(this.wetGain);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Filter effect, muffle sounds underwater or behind a wall
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const muffle = new AudioFilter('lowpass', 400);
 * setAudioMasterEffect(muffle);
 * muffle.setFrequency(20000, .5); // sweep back to clear
 */
class AudioFilter extends AudioEffect
{
    /** Create a filter effect
     *  @param {BiquadFilterType} [type] - lowpass, highpass, bandpass, notch, etc.
     *  @param {number} [frequency] - Cutoff or center frequency in Hz
     *  @param {number} [q] - Resonance at the cutoff, higher is sharper
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(type='lowpass', frequency=1000, q=1, mix=1)
    {
        super(mix);
        ASSERT(isNumber(frequency) && frequency >= 0, 'frequency must be positive or zero');
        ASSERT(isNumber(q), 'q must be a number');

        /** @property {BiquadFilterNode} - The filter node */
        this.node = audioContext.createBiquadFilter();
        this.node.type = type;
        this.node.frequency.value = frequency;
        this.node.Q.value = q;
        this.connectEffect(this.node);
    }

    /** Set the cutoff or center frequency
     *  @param {number} frequency - Frequency in Hz
     *  @param {number} [fadeTime] - Seconds to sweep over */
    setFrequency(frequency, fadeTime=0)
    {
        ASSERT(isNumber(frequency) && frequency >= 0, 'frequency must be positive or zero');
        this.rampParam(this.node.frequency, frequency, fadeTime);
    }

    /** Set the resonance at the cutoff
     *  @param {number} q - Higher is sharper
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setQ(q, fadeTime=0)
    {
        ASSERT(isNumber(q), 'q must be a number');
        this.rampParam(this.node.Q, q, fadeTime);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Reverb effect, puts sounds in a room, cave, or hall
 * - The impulse response is generated, no audio file needed
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const hall = new AudioReverb(4, 1.5, .4);
 * footstep.output = hall;
 */
class AudioReverb extends AudioEffect
{
    /** Create a reverb effect
     *  @param {number} [duration] - Seconds until the reverb tail is silent
     *  @param {number} [decay] - How quickly the tail fades, higher is faster
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(duration=2, decay=2, mix=.5)
    {
        super(mix);

        /** @property {ConvolverNode} - The convolver node */
        this.node = audioContext.createConvolver();
        this.setRoom(duration, decay);
        this.connectEffect(this.node);
    }

    /** Change the room by rebuilding the impulse response
     *  @param {number} duration - Seconds until the reverb tail is silent
     *  @param {number} [decay] - How quickly the tail fades, higher is faster */
    setRoom(duration, decay=2)
    {
        ASSERT(isNumber(duration) && duration > 0, 'duration must be positive');
        ASSERT(isNumber(decay) && decay > 0, 'decay must be positive');
        this.node.buffer = this.createImpulse(duration, decay);
    }

    /** Build a stereo impulse response of decaying noise
     *  @param {number} duration - Seconds until silence
     *  @param {number} decay - How quickly it fades, higher is faster
     *  @return {AudioBuffer} */
    createImpulse(duration, decay)
    {
        const sampleRate = audioContext.sampleRate;
        const length = max(1, sampleRate * duration | 0);
        const buffer = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 2; channel--;)
        {
            const samples = buffer.getChannelData(channel);
            for (let i = length; i--;)
                samples[i] = rand(-1, 1) * (1 - i/length) ** decay;
        }
        return buffer;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Delay effect, echoes that repeat and fade
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const canyon = new AudioDelay(.4, .5);
 * shout.output = canyon;
 */
class AudioDelay extends AudioEffect
{
    /** Create a delay effect
     *  @param {number} [time] - Seconds between echoes, up to 5
     *  @param {number} [feedback] - How much of each echo repeats, 0 to .95
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(time=.3, feedback=.4, mix=.5)
    {
        super(mix);

        /** @property {DelayNode} - The delay node */
        this.node = audioContext.createDelay(5);
        /** @property {GainNode} - How much of the delayed signal feeds back in */
        this.feedbackGain = audioContext.createGain();
        this.node.connect(this.feedbackGain).connect(this.node);
        this.connectEffect(this.node);
        this.setTime(time);
        this.setFeedback(feedback);
    }

    /** Set the time between echoes
     *  - Browsers hold a delay in a feedback loop to at least one render quantum, so 0 is not a bypass
     *  @param {number} time - Seconds, up to 5
     *  @param {number} [fadeTime] - Seconds to ramp over, pitch bends while it moves */
    setTime(time, fadeTime=0)
    {
        ASSERT(isNumber(time) && time >= 0 && time <= 5, 'time must be between 0 and 5');
        this.rampParam(this.node.delayTime, time, fadeTime);
    }

    /** Set how much of each echo repeats, clamped below 1 so it always dies out
     *  @param {number} feedback - 0 to .95
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setFeedback(feedback, fadeTime=0)
    {
        ASSERT(isNumber(feedback), 'feedback must be a number');
        this.rampParam(this.feedbackGain.gain, clamp(feedback, 0, .95), fadeTime);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Distortion effect, overdrive for radios, damaged robots, and engines
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const radio = new AudioDistortion(.8);
 * voice.output = radio;
 */
class AudioDistortion extends AudioEffect
{
    /** Create a distortion effect
     *  @param {number} [amount] - How hard to drive the signal, 0 is clean and 1 is crushed
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(amount=.5, mix=1)
    {
        super(mix);

        /** @property {WaveShaperNode} - The wave shaper node */
        this.node = audioContext.createWaveShaper();
        this.node.oversample = '2x';
        /** @property {number} - How hard the signal is driven, 0 is clean and 1 is crushed */
        this.amount = amount;
        this.setAmount(amount);
        this.connectEffect(this.node);
    }

    /** Set how hard to drive the signal, rebuilds the shaping curve
     *  @param {number} amount - 0 is clean and 1 is crushed */
    setAmount(amount)
    {
        ASSERT(isNumber(amount), 'amount must be a number');
        this.amount = amount = clamp(amount);

        // soft clip curve, drive grows with the square of amount so low values stay subtle
        // enough points that quiet signals are still shaped at high drive, where the curve is steep near 0
        const drive = 100 * amount * amount;
        const samples = 1024;
        const curve = new Float32Array(samples);
        for (let i = samples; i--;)
        {
            const x = i * 2 / (samples - 1) - 1;
            curve[i] = (1 + drive) * x / (1 + drive * abs(x));
        }
        this.node.curve = curve;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Compressor effect, evens out loud and quiet so many sounds at once don't clip
 * - Meant for the master bus, it is not on by default
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const compressor = new AudioCompressor;
 * setAudioMasterEffect(compressor);
 */
class AudioCompressor extends AudioEffect
{
    /** Create a compressor effect
     *  @param {number} [threshold] - Level in dB above which the signal is reduced
     *  @param {number} [ratio] - How much to reduce it, 12 means 12 dB in becomes 1 dB out
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(threshold=-24, ratio=12, mix=1)
    {
        super(mix);
        ASSERT(isNumber(threshold), 'threshold must be a number');
        ASSERT(isNumber(ratio) && ratio >= 1, 'ratio must be 1 or more');

        /** @property {DynamicsCompressorNode} - The compressor node */
        this.node = audioContext.createDynamicsCompressor();
        this.node.threshold.value = threshold;
        this.node.ratio.value = ratio;
        this.connectEffect(this.node);
    }

    /** Set the level above which the signal is reduced
     *  @param {number} threshold - Level in dB
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setThreshold(threshold, fadeTime=0)
    {
        ASSERT(isNumber(threshold), 'threshold must be a number');
        this.rampParam(this.node.threshold, threshold, fadeTime);
    }

    /** Set how much the signal is reduced above the threshold
     *  @param {number} ratio - 1 is no reduction, 20 is a hard limit
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setRatio(ratio, fadeTime=0)
    {
        ASSERT(isNumber(ratio) && ratio >= 1, 'ratio must be 1 or more');
        this.rampParam(this.node.ratio, ratio, fadeTime);
    }
}

/**
 * LittleJS User Interface Plugin
 * - call new UISystemPlugin() to setup the UI system
 * - Gamepad and keyboard navigation support
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 * - Sliders
 * - Video
 * @namespace UISystem
 */

///////////////////////////////////////////////////////////////////////////////

/** Global UI system plugin object
 *  @type {UISystemPlugin}
 *  @memberof UISystem */
let uiSystem;

/** Enable UI system debug drawing
 *  0=off, 1=normal, 2=show invisible
 *  @type {number}
 *  @default
 *  @memberof UISystem */
let uiDebug = 0;

/** Enable UI system debug drawing
 *  0=off, 1=normal, 2=show invisible
 *  @param {number|boolean} debugMode
 *  @memberof UISystem */
function uiSetDebug(debugMode)
{ uiDebug = typeof debugMode === 'boolean' ? (debugMode ? 1 : 0) : debugMode; }

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI System Global Object
 * @memberof UISystem
 */
class UISystemPlugin
{
    /** Create the global UI system object
     *  @param {CanvasRenderingContext2D} [context]
     *  @example
     *  // create the ui plugin object
     *  new UISystemPlugin;
     */
    constructor(context=mainContext)
    {
        ASSERT(!uiSystem, 'UI system already initialized');
        uiSystem = this;

        // default settings
        /** @property {boolean} - Activate when mouse is pressed down instead of clicked */
        this.activateOnPress = false;
        /** @property {Color} - Default fill color for UI elements */
        this.defaultColor = WHITE;
        /** @property {Color} - Default outline color for UI elements */
        this.defaultLineColor = BLACK;
        /** @property {Color} - Default text color for UI elements */
        this.defaultTextColor = BLACK;
        /** @property {Color} - Default button color for UI elements */
        this.defaultButtonColor = hsl(0,0,.7);
        /** @property {Color} - Default hover color for UI elements */
        this.defaultHoverColor = hsl(0,0,.9);
        /** @property {Color} - Default color for disabled UI elements */
        this.defaultDisabledColor = hsl(0,0,.3);
        /** @property {Color} - Uses a gradient fill combined with color */
        this.defaultGradientColor = undefined;
        /** @property {number} - Default line width for UI elements */
        this.defaultLineWidth = 4;
        /** @property {number} - Default rounded rect corner radius for UI elements */
        this.defaultCornerRadius = 0;
        /** @property {number} - Default scale to use for fitting text to object */
        this.defaultTextFitScale = .8;
        /** @property {string} - Default font for UI elements */
        this.defaultFont = fontDefault;
        /** @property {Sound} - Default sound when interactive UI element is pressed */
        this.defaultSoundPress = undefined;
        /** @property {Sound} - Default sound when interactive UI element is released */
        this.defaultSoundRelease = undefined;
        /** @property {Sound} - Default sound when interactive UI element is clicked */
        this.defaultSoundClick = undefined;
        /** @property {Color} - Color for shadow */
        this.defaultShadowColor = CLEAR_BLACK;
        /** @property {number} - Size of shadow blur */
        this.defaultShadowBlur = 5;
        /** @property {Vector2} - Offset of shadow blur */
        this.defaultShadowOffset = vec2(5);
        /** @property {number} - If set ui coords will be renormalized to this canvas height */
        this.nativeHeight = 0;

        // navigation properties
        /** @property {UIObject} - Object currently selected by navigation (gamepad or keyboard) */
        this.navigationObject = undefined;
        /** @property {Timer} - Cool down timer for navigation inputs */
        this.navigationTimer = new Timer(undefined, true);
        /** @property {number} - Time between navigation inputs in seconds */
        this.navigationDelay = .2;
        /** @property {boolean} - should the navigation be horizontal, vertical, or both? */
        this.navigationDirection = 1;
        /** @property {boolean} - True if user last used navigation instead of mouse */
        this.navigationMode = false;

        // system state
        /** @property {Array<UIObject>} - List of all UI elements */
        this.uiObjects = [];
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - Context to render UI elements to */
        this.uiContext = context;
        /** @property {UIObject} - Object user is currently interacting with */
        this.activeObject = undefined;
        /** @property {UIObject} - Top most object user is over */
        this.hoverObject = undefined;
        /** @property {UIObject} - Hover object at start of update */
        this.lastHoverObject = undefined;
        /** @property {UIObject} - Current confirm menu being shown */
        this.confirmDialog = undefined;
        /** @private */
        this._keyInputObject = undefined;
        /** @private */
        this._onKeyDown = (e) => this._keyInputObject?.onKeyDown(e);

        engineAddPlugin(uiUpdate, uiRender);

        // set object position based on anchor target (parent box, or canvas for roots),
        // self-pivot, and localPos offset
        function updateTransforms(o)
        {
            let targetPos, targetSize;
            if (o.parent)
            {
                targetPos = o.parent.nativePos;
                targetSize = o.parent.size;
            }
            else
            {
                // anchor to canvas in native coords (handles nativeHeight if set)
                targetPos = uiSystem.screenToNative(mainCanvasSize.scale(.5));
                targetSize = uiSystem.nativeHeight
                    ? vec2(mainCanvasSize.x * uiSystem.nativeHeight / mainCanvasSize.y,
                           uiSystem.nativeHeight)
                    : mainCanvasSize;
            }

            const a = o.anchor;
            o.nativePos = targetPos
                .add(targetSize.multiply(a).scale(.5))   // anchor point on target
                .subtract(o.size.multiply(a).scale(.5))  // pivot shift on self
                .add(o.localPos);                        // user offset
        }

        // setup recursive update and render
        // update in reverse order to detect mouse enter/leave
        function uiUpdate()
        {
            if (uiSystem.activeObject && !uiSystem.activeObject.visible)
                uiSystem.activeObject = undefined;

            // reset hover object at start of update
            uiSystem.lastHoverObject = uiSystem.hoverObject;
            uiSystem.hoverObject = undefined;
            
            if (mouseWasPressed(0))
            {
                // exit navigation mode on mouse press
                uiSystem.navigationMode = false;
                uiSystem.navigationObject = undefined;
            }
            if (uiSystem.keyInputObject)
            {
                // handle text input
                uiSystem.activeObject = uiSystem.keyInputObject;
                uiSystem.hoverObject = uiSystem.keyInputObject;
                uiSystem.navigationMode = false;
                uiSystem.navigationObject = undefined;
            }

            // navigation with gamepad/keyboard
            const navigableObjects = uiSystem.getNavigableObjects();
            if (!navigableObjects.length)
                uiSystem.navigationObject = undefined;
            else if (!uiSystem.keyInputObject)
            {
                // unselect object if it is no longer navigable
                if (!navigableObjects.includes(uiSystem.navigationObject))
                    uiSystem.navigationObject = undefined;

                if (!isTouchDevice)
                if (uiSystem.navigationMode && !uiSystem.navigationObject)
                {
                    // select first auto focus object
                    uiSystem.navigationObject = navigableObjects.find(o=>o.navigationAutoSelect);
                }
                
                // navigate with dpad or left stick
                if (!uiSystem.navigationTimer.active())
                {
                    // navigate through list with gamepad or keyboard
                    const direction = sign(uiSystem.getNavigationDirection());
                    if (direction)
                    {
                        let newNavigationObject;
                        if (!uiSystem.navigationObject)
                        {
                            // use auto select object
                            newNavigationObject = navigableObjects.find(o=>o.navigationAutoSelect);

                            if (!newNavigationObject)
                            {
                                // try first or last object
                                const newIndex = direction > 0 ? 0 : navigableObjects.length-1;
                                newNavigationObject = navigableObjects[newIndex];
                            }
                        }
                        else
                        {
                            const currentIndex = navigableObjects.indexOf(uiSystem.navigationObject);
                            const newIndex = mod(currentIndex + direction, navigableObjects.length);
                            newNavigationObject = navigableObjects[newIndex];
                        }
                        
                        if (uiSystem.navigationObject !== newNavigationObject)
                        {
                            uiSystem.navigationMode = true;
                            uiSystem.hoverObject = undefined;
                            uiSystem.navigationObject = newNavigationObject;
                            uiSystem.navigationTimer.set(uiSystem.navigationDelay);
                            newNavigationObject.soundPress &&
                                newNavigationObject.soundPress.play();
                        }
                    }
                }

                // activate the navigation object when pressed
                if (uiSystem.navigationObject)
                if (uiSystem.getNavigationWasPressed())
                    uiSystem.navigationObject.navigatePressed();
            }

            // update in reverse order so topmost objects get priority
            for (let i = uiSystem.uiObjects.length; i--;)
            {
                const o = uiSystem.uiObjects[i];
                o.parent || updateObject(o);
            }

            // remove destroyed objects
            uiSystem.uiObjects = uiSystem.uiObjects.filter(o=>!o.destroyed);

            function updateObject(o)
            {
                if (o.destroyed || !o.visible) return;

                // update in reverse order to detect mouse enter/leave
                updateTransforms(o);
                for (let i=o.children.length; i--;)
                {
                    // a child may destroy siblings mid-update (e.g. dialog close)
                    const child = o.children[i];
                    child && updateObject(child);
                }
                if (!o.destroyed)
                    o.update();
            }
        }
        function uiRender()
        {
            const context = uiSystem.uiContext;
            context.save();
            if (uiSystem.nativeHeight)
            {
                // convert to native height
                const s = mainCanvasSize.y / uiSystem.nativeHeight;
                context.translate(-s*mainCanvasSize.x/2,0);
                context.scale(s,s);
                context.translate(mainCanvasSize.x/2/s,0);
            }

            function renderObject(o)
            {
                if (!o.visible) return;

                // render object and children
                updateTransforms(o);
                o.render();
                for (const c of o.children)
                    renderObject(c);
            }
            uiSystem.uiObjects.forEach(o=> o.parent || renderObject(o));

            if (uiDebug > 0)
            {
                // debug render all objects
                function renderDebug(o, visible=true)
                {
                    visible &&= !!o.visible;
                    updateTransforms(o);
                    o.renderDebug(visible);
                    for (const c of o.children)
                        renderDebug(c, visible);
                }
                uiSystem.uiObjects.forEach(o=> o.parent || renderDebug(o));
            }
            context.restore();
        }
    }

    /** Draw a rectangle to the UI context
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color]
    *  @param {number}  [lineWidth]
    *  @param {Color}   [lineColor]
    *  @param {number}  [cornerRadius]
    *  @param {Color}   [gradientColor]
    *  @param {Color}   [shadowColor]
    *  @param {number}  [shadowBlur]
    *  @param {Color}   [shadowOffset] */
    drawRect(pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, cornerRadius=0, gradientColor, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
    {
        ASSERT(isVector2(pos), 'pos must be a vec2');
        ASSERT(isVector2(size), 'size must be a vec2');
        ASSERT(isColor(color), 'color must be a color');
        ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
        ASSERT(isColor(lineColor), 'lineColor must be a color');
        ASSERT(isNumber(cornerRadius), 'cornerRadius must be a number');
        
        const context = uiSystem.uiContext;
        if (gradientColor)
        {
            const g = context.createLinearGradient(
                pos.x, pos.y-size.y/2, pos.x, pos.y+size.y/2);
            const c = color.toString();
            g.addColorStop(0, c);
            g.addColorStop(.5, gradientColor.toString());
            g.addColorStop(1, c);
            context.fillStyle = g;
        }
        else
            context.fillStyle = color.toString();
        if (shadowBlur || shadowOffset.x || shadowOffset.y)
        if (shadowColor.a > 0)
        {
            // setup shadow
            context.shadowColor = shadowColor.toString();
            context.shadowBlur = shadowBlur;
            context.shadowOffsetX = shadowOffset.x;
            context.shadowOffsetY = shadowOffset.y;
        }
        context.beginPath();
        if (cornerRadius && context['roundRect'])
            context['roundRect'](pos.x-size.x/2, pos.y-size.y/2, size.x, size.y, cornerRadius);
        else
            context.rect(pos.x-size.x/2, pos.y-size.y/2, size.x, size.y);
        context.fill();
        context.shadowColor = '#0000';
        if (lineWidth && lineColor.a > 0)
        {
            context.strokeStyle = lineColor.toString();
            context.lineWidth = lineWidth;
            context.stroke();
        }
    }

    /** Draw a line to the UI context
    *  @param {Vector2} posA
    *  @param {Vector2} posB
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
    drawLine(posA, posB, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor)
    {
        ASSERT(isVector2(posA), 'posA must be a vec2');
        ASSERT(isVector2(posB), 'posB must be a vec2');
        ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
        ASSERT(isColor(lineColor), 'lineColor must be a color');

        const context = uiSystem.uiContext;
        context.strokeStyle = lineColor.toString();
        context.lineWidth = lineWidth;
        context.beginPath();
        context.lineTo(posA.x, posA.y);
        context.lineTo(posB.x, posB.y);
        context.stroke();
    }

    /** Draw a tile to the UI context
    *  @param {Vector2}  pos
    *  @param {Vector2}  size
    *  @param {TileInfo} tileInfo
    *  @param {Color}    [color=uiSystem.defaultColor]
    *  @param {number}   [angle]
    *  @param {boolean}  [mirror]
    *  @param {Color}    [shadowColor]
    *  @param {number}   [shadowBlur]
    *  @param {Color}    [shadowOffset] */
    drawTile(pos, size, tileInfo, color=uiSystem.defaultColor, angle=0, mirror=false, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
    {
        const context = uiSystem.uiContext;
        if (shadowBlur || shadowOffset.x || shadowOffset.y)
        if (shadowColor.a > 0)
        {
            // setup shadow
            context.shadowColor = shadowColor.toString();
            context.shadowBlur = shadowBlur;
            context.shadowOffsetX = shadowOffset.x;
            context.shadowOffsetY = shadowOffset.y;
        }
        drawTile(pos, size, tileInfo, color, angle, mirror, CLEAR_BLACK, false, true, context);
        context.shadowColor = '#0000';
    }

    /** Draw text to the UI context
    *  @param {string}  text
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color=uiSystem.defaultColor]
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor]
    *  @param {string}  [align]
    *  @param {string}  [font=uiSystem.defaultFont]
    *  @param {string}  [fontStyle]
    *  @param {boolean} [applyMaxWidth=true]
    *  @param {Vector2} [textShadow]
    *  @param {Color}   [shadowColor]
    *  @param {number}  [shadowBlur]
    *  @param {Color}   [shadowOffset] */
    drawText(text, pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor, align='center', font=uiSystem.defaultFont, fontStyle='', applyMaxWidth=true, textShadow=undefined, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
    {
        const context = uiSystem.uiContext;
        if (shadowColor.a > 0)
        {
            if (textShadow)
                drawTextScreen(text, pos.add(textShadow), size.y, shadowColor, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, context);
            if (shadowBlur || shadowOffset.x || shadowOffset.y)
            {
                // setup shadow
                context.shadowColor = shadowColor.toString();
                context.shadowBlur = shadowBlur;
                context.shadowOffsetX = shadowOffset.x;
                context.shadowOffsetY = shadowOffset.y;
            }
        }
        drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, context);
        context.shadowColor = '#0000';
    }

    /**
     * @callback DragAndDropCallback - Callback for drag and drop events
     * @param {DragEvent} event - The drag event
     * @memberof UISystem
     */

    /** Setup drag and drop event handlers
    *  Automatically prevents defaults and calls the given functions
    *  @param {DragAndDropCallback} [onDrop] - when a file is dropped
    *  @param {DragAndDropCallback} [onDragEnter] - when a file is dragged onto the window
    *  @param {DragAndDropCallback} [onDragLeave] - when a file is dragged off the window
    *  @param {DragAndDropCallback} [onDragOver] - continuously when dragging over */
    setupDragAndDrop(onDrop, onDragEnter, onDragLeave, onDragOver)
    {
        // remove any prior listeners so repeated setup calls don't stack
        if (this._dragListeners)
            for (const [type, listener] of this._dragListeners)
                document.removeEventListener(type, listener);
        this._dragListeners = [];
        const setCallback = (callback, listenerType)=>
        {
            const listener = (e)=> { e.preventDefault(); callback && callback(e); };
            document.addEventListener(listenerType, listener);
            this._dragListeners.push([listenerType, listener]);
        };
        setCallback(onDrop,      'drop');
        setCallback(onDragEnter, 'dragenter');
        setCallback(onDragLeave, 'dragleave');
        setCallback(onDragOver,  'dragover');
    }

    /** Convert a screen space position to native UI position
     *  @param {Vector2} pos
     *  @return {Vector2} */
    screenToNative(pos)
    {
        if (!uiSystem.nativeHeight)
            return pos;
    
        const s = mainCanvasSize.y / uiSystem.nativeHeight;
        const sInv = 1/s;
        const p = pos.copy();
        p.x += s*mainCanvasSize.x/2;
        p.x *= sInv;
        p.y *= sInv;
        p.x -= sInv*mainCanvasSize.x/2;
        return p;
    }

    /** Object to send keyboard input to (typically a UITextInput).
     *  The document keydown listener is only attached while this is set,
     *  so games that never use text input pay no event-handling cost.
     *  @type {UIObject} */
    get keyInputObject() { return this._keyInputObject; }
    set keyInputObject(obj)
    {
        const had = !!this._keyInputObject;
        this._keyInputObject = obj;
        if (!had && obj)
            document.addEventListener('keydown', this._onKeyDown);
        else if (had && !obj)
            document.removeEventListener('keydown', this._onKeyDown);
    }

    /** Destroy and remove all objects
    *  @memberof UISystem */
    destroyObjects()
    {
        for (const o of this.uiObjects)
            o.parent || o.destroy();
        this.uiObjects = this.uiObjects.filter(o=>!o.destroyed);
        this.activeObject = undefined;
        this.hoverObject = undefined;
        this.lastHoverObject = undefined;
        this.keyInputObject = undefined;
    }

    /** Get all navigable UI objects sorted by navigationIndex
     *  @return {Array<UIObject>} */
    getNavigableObjects()
    {
        function getNavigableRecursive(o)
        {
            if (!o.visible || o.disabled)
                return; // skip children if parent is invisible or disabled

            if (o.isInteractive() && o.navigationIndex !== undefined)
                objects.push(o);
            for (let i=o.children.length; i--;)
                getNavigableRecursive(o.children[i]);
        }

        // get all the valid navigable objects recursively
        let objects = [];
        for (let i = uiSystem.uiObjects.length; i--;)
        {
            const o = uiSystem.uiObjects[i];
            if (uiSystem.confirmDialog && o !== uiSystem.confirmDialog)
                continue;
            o.parent || getNavigableRecursive(o);
        }

        // sort by navigationIndex (lower numbers first)
        objects.sort((a, b)=> a.navigationIndex - b.navigationIndex);
        return objects;
    }

    /** Get navigation direction from gamepad or keyboard
     *  @return {number} */
    getNavigationDirection()
    {
        const vertical = uiSystem.navigationDirection === 1;
        const both = uiSystem.navigationDirection === 2;
        if (isUsingGamepad)
        {
            const stick = gamepadStick(0, gamepadPrimary);
            const dpad = gamepadDpad(gamepadPrimary);
            if (both)
                return -(stick.y || dpad.y) || (stick.x || dpad.x);
            return vertical ? -(stick.y || dpad.y) : (stick.x || dpad.x);
        }
        const up = 'ArrowUp', down = 'ArrowDown', left = 'ArrowLeft', right = 'ArrowRight';
        if (both)
        {
            return keyIsDown(up) || keyIsDown(left) ? -1 :
                keyIsDown(down) || keyIsDown(right) ? 1 : 0;
        }
        const back = vertical ? up : left;
        const forward = vertical ? down : right;
        return keyIsDown(back) ? -1 : keyIsDown(forward) ? 1 : 0;
    }

    /** Get other axis navigation direction from gamepad or keyboard
     *  @return {number} */
    getNavigationOtherDirection()
    {
        if (uiSystem.navigationDirection === 2)
            return 0; // other direction disabled

        const vertical = uiSystem.navigationDirection === 1;
        if (isUsingGamepad)
        {
            const stick = gamepadStick(0, gamepadPrimary);
            const dpad = gamepadDpad(gamepadPrimary);
            return !vertical ? (stick.y || dpad.y) : (stick.x || dpad.x);
        }
        const back = !vertical ? 'ArrowUp' : 'ArrowLeft';
        const forward = !vertical ? 'ArrowDown' : 'ArrowRight';
        return keyIsDown(back) ? -1 : keyIsDown(forward) ? 1 : 0;
    }

    /** Get if navigation button was pressed from gamepad or keyboard
     *  @return {boolean} */
    getNavigationWasPressed()
    {
        return isUsingGamepad ? gamepadWasPressed(0, gamepadPrimary) :
            keyWasPressed('Space') || keyWasPressed('Enter');
    }
        
    /** Show a confirmation dialog with Yes/No buttons
     *  Centers the dialog on the screen with darkened background
     *  @param {string} [text] - The message to display
     *  @param {Function} [yesCallback] - Called when Yes is clicked
     *  @param {Function} [noCallback] - Called when No is clicked
     *  @param {Vector2} [size] - Size of the confirmation dialog
     *  @param {string} [exitKey] - Key that can exit the menu
     *  @return {UIObject} The confirmation menu object
     */
    showConfirmDialog(text='Are you sure?', yesCallback, noCallback, size=vec2(500,250), exitKey='Escape')
    {
        ASSERT(!uiSystem.confirmDialog);

        const savedNavigationDirection = uiSystem.navigationDirection;

        // allow both axes for navigation
        uiSystem.navigationDirection = 2;

        // confirm menu
        const confirmMenu = new UIObject(vec2(), size);
        uiSystem.confirmDialog = confirmMenu;
        confirmMenu.onRender = ()=>
        {
            const backgroundColor = hsl(0,0,0,.7);
            uiSystem.drawRect(vec2(), vec2(1e9), backgroundColor);
        }
        confirmMenu.onUpdate = ()=>
        {
            if (keyWasPressed(exitKey))
                closeMenu();
        }
        confirmMenu.isMouseOverlapping = ()=> true; // always hover
        
        // title text
        const gap = 50;
        const textTitle = new UIText(vec2(0,-50), vec2(size.x-gap,70), text);
        confirmMenu.addChild(textTitle);
        
        // yes button
        const buttonYes = new UIButton(vec2(-80,50), vec2(120,70), 'Yes');
        buttonYes.textHeight = 40;
        buttonYes.navigationIndex = 1;
        buttonYes.hoverColor = hsl(0,1,.5);
        buttonYes.onClick = ()=> { closeMenu(); yesCallback && yesCallback(); };
        confirmMenu.addChild(buttonYes);
        
        // no button
        const buttonNo = new UIButton(vec2(80,50), vec2(120,70), 'No');
        buttonNo.textHeight = 40;
        buttonNo.navigationIndex = 2;
        buttonNo.navigationAutoSelect = true;
        buttonNo.onClick = ()=> { closeMenu(); noCallback && noCallback(); };
        confirmMenu.addChild(buttonNo);

        // close menu and return to normal navigation
        function closeMenu()
        {
            ASSERT(uiSystem.confirmDialog === confirmMenu);
            confirmMenu.destroy();
            uiSystem.confirmDialog = undefined;
            uiSystem.navigationDirection = savedNavigationDirection;
            inputClear();
        }
        return confirmMenu;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI Object - Base level object for all UI elements
 * @memberof UISystem */
class UIObject
{
    /** Create a UIObject
     *  @param {Vector2}  [pos=vec2()]
     *  @param {Vector2}  [size=vec2(1)]
     */
    constructor(pos=vec2(), size=vec2())
    {
        ASSERT(isVector2(pos), 'ui object pos must be a vec2');
        ASSERT(isVector2(size), 'ui object size must be a vec2');

        /** @property {Vector2} - Position you set: an offset from this object's
         *  anchor point (the parent box, or the canvas for roots). This is the
         *  input that controls placement — set this, not nativePos. */
        this.localPos = pos.copy();
        /** @property {Vector2} - Resolved position in native UI space, recomputed
         *  every frame from localPos + anchor (and nativeHeight, if set). This is a
         *  derived output used for drawing and hit-testing; assigning to it has no
         *  effect since it is overwritten each frame. Set localPos instead. */
        this.nativePos = pos.copy();
        /** @property {Vector2} - Screen space size of the object */
        this.size = size.copy();
        /** @property {Color} - Color of the object */
        this.color = uiSystem.defaultColor.copy();
        /** @property {Color} - Color of the object when active, uses hoverColor if undefined */
        this.activeColor = undefined;
        /** @property {string} - Text for this ui object */
        this.text = undefined;
        /** @property {Color} - Color when disabled */
        this.disabledColor = uiSystem.defaultDisabledColor.copy();
        /** @property {boolean} - Is this object disabled? */
        this.disabled = false;
        /** @property {Color} - Color for text */
        this.textColor = uiSystem.defaultTextColor.copy();
        /** @property {Color} - Color used when hovering over the object */
        this.hoverColor = uiSystem.defaultHoverColor.copy();
        /** @property {Color} - Color for line drawing */
        this.lineColor = uiSystem.defaultLineColor.copy();
        /** @property {Color} - Uses a gradient fill combined with color */
        this.gradientColor = uiSystem.defaultGradientColor ? uiSystem.defaultGradientColor.copy() : undefined;
        /** @property {number} - Width for line drawing */
        this.lineWidth = uiSystem.defaultLineWidth;
        /** @property {number} - Corner radius for rounded rects */
        this.cornerRadius = uiSystem.defaultCornerRadius;
        /** @property {string} - Font for this object */
        this.font = uiSystem.defaultFont;
        /** @property {string} - Font style for this object or undefined */
        this.fontStyle = undefined;
        /** @property {number} - Override for text width */
        this.textWidth = undefined;
        /** @property {number} - Override for text height */
        this.textHeight = undefined;
        /** @property {number} - Scale text to fit in the object */
        this.textFitScale = uiSystem.defaultTextFitScale;
        /** @property {Vector2} - How much to offset the text shadow or undefined */
        this.textShadow = undefined;
        /** @property {number} - Color for text line drawing  */
        this.textLineColor = uiSystem.defaultLineColor.copy();
        /** @property {number} - Width for text line drawing */
        this.textLineWidth = 0;
        /** @property {boolean} - Should this object be drawn */
        this.visible  = true;
        /** @property {Array<UIObject>} - A list of this object's children */
        this.children = [];
        /** @property {UIObject} - This object's parent, position is in parent space */
        this.parent = undefined;
        /** @property {number} - Added size to make small buttons easier to touch on mobile devices */
        this.extraTouchSize = 0;
        /** @property {Sound} - Sound when interactive element is pressed */
        this.soundPress = uiSystem.defaultSoundPress;
        /** @property {Sound} - Sound when interactive element is released */
        this.soundRelease = uiSystem.defaultSoundRelease;
        /** @property {Sound} - Sound when interactive element is clicked */
        this.soundClick = uiSystem.defaultSoundClick;
        /** @property {boolean} - Is this element interactive */
        this.interactive = false;
        /** @property {boolean} - Activate when dragged over with mouse held down */
        this.dragActivate = false;
        /** @property {boolean} - True if this can be a hover object */
        this.canBeHover = true;
        /** @property {Color} - Color for shadow, undefined if no shadow */
        this.shadowColor = uiSystem.defaultShadowColor?.copy();
        /** @property {number} - Size of shadow blur */
        this.shadowBlur = uiSystem.defaultShadowBlur;
        /** @property {Vector2} - Offset of shadow blur */
        this.shadowOffset = uiSystem.defaultShadowOffset?.copy();
        /** @property {number} - Optional navigation order index, lower values are selected first */
        this.navigationIndex = undefined;
        /** @property {boolean} - Should this be auto selected by navigation? Must also have valid navigation index. */
        this.navigationAutoSelect = false;
        /** @property {Vector2} - Where on parent (or canvas if no parent) this object is anchored.
         *  Components in [-1, 1]: (0,0)=center, (-1,-1)=top-left, (1,1)=bottom-right.
         *  Also acts as self-pivot — e.g. (1,-1) puts your top-right corner at the anchor point. */
        this.anchor = vec2();

        uiSystem.uiObjects.push(this);
    }

    /** Add a child UIObject to this object, returns child for chaining
     *  @param {UIObject} child
     *  @return {UIObject} The child object added */
    addChild(child)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        return child;
    }

    /** Remove a child UIObject from this object
     *  @param {UIObject} child */
    removeChild(child)
    {
        ASSERT(child.parent === this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = undefined;
    }

    /** Destroy this object, destroy its children, detach its parent, and mark it for removal */
    destroy()
    {
        if (this.destroyed)
            return;

        // clear ui-system references that point at this object so events
        // don't keep firing against a destroyed target (especially the
        // keydown listener attached for keyInputObject)
        if (uiSystem.activeObject     === this) uiSystem.activeObject     = undefined;
        if (uiSystem.hoverObject      === this) uiSystem.hoverObject      = undefined;
        if (uiSystem.lastHoverObject  === this) uiSystem.lastHoverObject  = undefined;
        if (uiSystem.navigationObject === this) uiSystem.navigationObject = undefined;
        if (uiSystem.keyInputObject   === this) uiSystem.keyInputObject   = undefined;

        // disconnect from parent and destroy children
        this.destroyed = 1;
        this.parent?.removeChild(this);
        for (const child of this.children)
        {
            child.parent = undefined;
            child.destroy();
        }
        // clear references so destroyed children can be GC'd
        this.children.length = 0;
    }

    /** Check if the mouse is overlapping this ui object
     *  @return {boolean} - True if overlapping */
    isMouseOverlapping()
    {
        if (!mouseInWindow) return false;

        const size = !isTouchDevice ? this.size :
                this.size.add(vec2(this.extraTouchSize || 0));
        const pos = uiSystem.screenToNative(mousePosScreen);
        return isOverlapping(this.nativePos, size, pos);
    }

    /** Update the object, called automatically by plugin once each frame */
    update()
    {
        // call the custom update callback
        this.onUpdate();

        // unset active if disabled
        if (this.disabled)
        {
            if (this === uiSystem.activeObject)
                uiSystem.activeObject = undefined;
            if (this === uiSystem.keyInputObject)
                uiSystem.keyInputObject = undefined;
        }

        if (uiSystem.keyInputObject)
            return;

        const wasHover = uiSystem.lastHoverObject === this;
        const isActive = this.isActiveObject();
        const mouseDown = mouseIsDown(0);
        const mousePress = this.dragActivate ? mouseDown : mouseWasPressed(0);
        if (this.canBeHover)
        if (!uiSystem.navigationMode) // no mouse hover in navigation mode
        if (mousePress || isActive || (!mouseDown && !isTouchDevice))
        if (!uiSystem.hoverObject && this.isMouseOverlapping())
            uiSystem.hoverObject = this;
        if (this.isHoverObject())
        {
            if (!this.disabled)
            {
                if (mousePress)
                {
                    if (this.interactive)
                    {
                        if (!this.dragActivate || (!wasHover || mouseWasPressed(0)))
                            this.onPress();
                        this.soundPress && this.soundPress.play();
                        if (uiSystem.activeObject && !isActive)
                            uiSystem.activeObject.onRelease();
                        uiSystem.activeObject = this;

                        if (uiSystem.activateOnPress)
                            this.click(!this.soundPress);
                    }
                }
                if (!uiSystem.activateOnPress)
                if (!mouseDown && this.isActiveObject() && this.interactive)
                    this.click();
            }

            // clear mouse was pressed state even when disabled
            mousePress && inputClearKey(0,0,0,1,0);
        }
        if (isActive)
        if (!mouseDown || (this.dragActivate && !this.isHoverObject()))
        {
            this.onRelease();
            this.soundRelease && this.soundRelease.play();
            uiSystem.activeObject = undefined;
        }

        // call enter/leave events
        if (this.isHoverObject() !== wasHover)
            this.isHoverObject() ? this.onEnter() : this.onLeave();
    }

    /** Render the object, called automatically by plugin once each frame */
    render()
    {
        // call the custom render callback
        this.onRender();

        if (!this.size.x || !this.size.y) return;

        const isNavigationObject = this.isNavigationObject();
        const lineColor = isNavigationObject ? this.color :
            this.interactive && this.isActiveObject() && !this.disabled ?
            this.color : this.lineColor;
        const color = isNavigationObject ? this.hoverColor :
            this.disabled ? this.disabledColor :
            this.interactive ?
                this.isActiveObject() ? this.activeColor || this.hoverColor :
                this.isHoverObject() ? this.hoverColor :
                this.color : this.color;
        const lineWidth = this.lineWidth * (isNavigationObject ? 1.5 : 1);
        
        uiSystem.drawRect(this.nativePos, this.size, color, lineWidth, lineColor, this.cornerRadius, this.gradientColor, this.shadowColor, this.shadowBlur, this.shadowOffset);
    }

    /** Get the size for text with overrides and scale
     *  @return {Vector2} */
    getTextSize()
    {
        return vec2(
            this.textWidth  || this.textFitScale * this.size.x,
            this.textHeight || this.textFitScale * this.size.y);
    }

    /** Called when the navigation button is pressed on this object */
    navigatePressed() { this.click(); }

    /** @return {boolean} - Is the mouse hovering over this element */
    isHoverObject() { return uiSystem.hoverObject === this; }

    /** @return {boolean} - Is the mouse held onto this element */
    isActiveObject() { return uiSystem.activeObject === this; }

    /** @return {boolean} - Is the gamepad or keyboard navigation object */
    isNavigationObject() { return uiSystem.navigationObject === this; }

    /** @return {boolean} - Is this object in keyboard input mode */
    isKeyInputObject() { return uiSystem.keyInputObject === this; }

    /** @return {boolean} - Can it be interacted with */
    isInteractive() { return this.interactive && this.visible && !this.disabled;}

    /** Returns string containing info about this object for debugging
     *  @return {string} */
    toString()
    {
        let text = 'type = ' + this.constructor.name;
        if (this.text)
            text += '\ntext = ' + this.text;
        if (this.nativePos.x || this.nativePos.y)
            text += '\nnativePos = ' + this.nativePos;
        if (this.localPos.x || this.localPos.y)
            text += '\nlocalPos = ' + this.localPos;
        if (this.size.x || this.size.y)
            text += '\nsize = ' + this.size;
        if (this.color)
            text += '\ncolor = ' + this.color;
        return text;
    }

    /** Called if uiDebug is enabled
     *  @param {boolean} visible */
    renderDebug(visible=true)
    {
        // apply color based on state
        const color =
            !visible ? GREEN :
            this.isHoverObject() ? YELLOW :
            this.disabled ? PURPLE :
            this.interactive ? RED : BLUE;
        uiSystem.drawRect(this.nativePos, this.size, CLEAR_BLACK, 4, color);
    }

    /** Internal function called when object is clicked
     *  @param {boolean} [playSound] */
    click(playSound=true)
    {
        this.onClick(); 
        if (playSound && this.soundClick)
            this.soundClick.play();
    }

    /** Called each frame before object updates */
    onUpdate() {}

    /** Called each frame before object renders */
    onRender() {}

    /** Called when the mouse enters the object */
    onEnter() {}

    /** Called when the mouse leaves the object */
    onLeave() {}

    /** Called when the mouse is pressed while over the object */
    onPress() {}

    /** Called when the mouse is released while over the object */
    onRelease() {}

    /** Called when user clicks on this object */
    onClick() {}

    /** Called when the state of this object changes */
    onChange() {}
};

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIText - A UI object that displays text
 * @extends UIObject
 * @memberof UISystem
 */
class UIText extends UIObject
{
    /** Create a UIText object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string}  [text]
     *  @param {string}  [align]
     *  @param {string}  [font=uiSystem.defaultFont]
     */
    constructor(pos, size, text='', align='center', font=uiSystem.defaultFont)
    {
        super(pos, size);

        ASSERT(isStringLike(text), 'ui text must be a string');
        ASSERT(['left','center','right'].includes(align), 'ui text align must be left, center, or right');
        ASSERT(isStringLike(font), 'ui text font must be a string');

        // set properties
        this.text = text;
        this.align = align;
        this.font = font;

        // text can not be a hover object by default
        this.canBeHover = false;
        
        // no background by default
        this.color = CLEAR_BLACK;
        this.shadowColor = CLEAR_BLACK;
        this.gradientColor = undefined;
        this.lineWidth = 0;

        // use max fit scale by default
        this.textFitScale = 1;
    }
    render()
    {
        super.render();

        // render the text
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.nativePos, textSize, this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow, this.shadowColor, this.shadowBlur, this.shadowOffset);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UITextInput - An editable text input field
 * - A simple text entry field that supports basic editing
 * - Suitable for short text input like names or numbers
 * @extends UIObject
 * @memberof UISystem
 */
class UITextInput extends UIObject
{
    /** Create a UITextInput object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string}  [text]
     */
    constructor(pos, size, text='')
    {
        super(pos, size);

        ASSERT(isStringLike(text), 'ui text must be a string');

        /** @property {number} - Max length of input (0 = no limit) */
        this.maxLength = 0;

        // set properties
        this.text = text;
        this.interactive = true;
        this.canBeHover = true;
    }

    click()
    {
        // start editing the text
        uiSystem.keyInputObject = this;
        this.onClick();
    }

    /** Stop editing the text */
    stopEditing()
    {
        if (!this.isKeyInputObject())
            return;

        if (this.soundRelease)
            this.soundRelease.play();
        uiSystem.activeObject = undefined;
        uiSystem.keyInputObject = undefined;
        this.onChange();
    }

    /** Key down event handler if this object is being edited
     *  @param {KeyboardEvent} [e] */
    onKeyDown(e)
    {
        const code = e.code, key = e.key
        if (code === 'Backspace')
            this.text = this.text.slice(0, -1);
        else if (code === 'Enter' || code === 'Escape')
            this.stopEditing();
        else if (key.length === 1) // printable characters
        {
            if (!this.maxLength || this.text.length < this.maxLength)
                this.text += key;
        }
    }

    update()
    {
        super.update();

        if (!this.isKeyInputObject())
            return;

        // click off object to stop editing
        if (mouseWasPressed(0) && !this.isMouseOverlapping() ||
            gamepadWasPressed(0, gamepadPrimary))
        {
            this.stopEditing();
            inputClearKey(0,0);
        }
    }

    render()
    {
        super.render();

        // draw the text scaled to fit
        const textSize = this.getTextSize();
        let text = this.text;
        if (this.isKeyInputObject()) // add a cursor to end of text
            text += timeReal%1 < .5 ?  '█' : '░';
        uiSystem.drawText(text, this.nativePos, textSize, 
            this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UITile - A UI object that displays a tile image
 * @extends UIObject
 * @memberof UISystem
 */
class UITile extends UIObject
{
    /** Create a UITile object
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=WHITE]
     *  @param {number}   [angle]
     *  @param {boolean}  [mirror]
     */
    constructor(pos, size, tileInfo, color=WHITE, angle=0, mirror=false)
    {
        super(pos, size);

        ASSERT(tileInfo instanceof TileInfo, 'ui tile tileInfo must be a TileInfo');
        ASSERT(isColor(color), 'ui tile color must be a color');
        ASSERT(isNumber(angle), 'ui tile angle must be a number');

        /** @property {TileInfo} - Tile image to use */
        this.tileInfo = tileInfo;
        /** @property {number} - Angle to rotate in radians */
        this.angle = angle;
        /** @property {boolean} - Should it be mirrored? */
        this.mirror = mirror;
        // set properties
        this.color = color.copy();

        // no shadow by default
        this.shadowColor = CLEAR_BLACK;
    }
    render()
    {
        uiSystem.drawTile(this.nativePos, this.size, this.tileInfo, this.color, this.angle, this.mirror, this.shadowColor, this.shadowBlur, this.shadowOffset);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIButton - A UI object that acts as a button
 * @extends UIObject
 * @memberof UISystem
 */
class UIButton extends UIObject
{
    /** Create a UIButton object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     */
    constructor(pos, size, text='', color=uiSystem.defaultButtonColor)
    {
        super(pos, size);

        ASSERT(isStringLike(text), 'ui button must be a string');
        ASSERT(isColor(color), 'ui button color must be a color');

        /** @property {Vector2} - Text offset for the button */
        this.textOffset = vec2();

        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    render()
    {
        super.render();
        
        // draw the text scaled to fit
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.nativePos.add(this.textOffset), textSize, 
            this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UICheckbox - A UI object that acts as a checkbox
 * @extends UIObject
 * @memberof UISystem
 */
class UICheckbox extends UIObject
{
    /** Create a UICheckbox object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {boolean} [checked]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     */
    constructor(pos, size, checked=false, text='', color=uiSystem.defaultButtonColor)
    {
        super(pos, size);

        ASSERT(isStringLike(text), 'ui checkbox must be a string');
        ASSERT(isColor(color), 'ui checkbox color must be a color');

        /** @property {boolean} - Is the checkbox currently checked? */
        this.checked = checked;
        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    click()
    {
        this.checked = !this.checked;
        this.onClick();
        this.onChange();
    }
    render()
    {
        super.render();
        if (this.checked)
        {
            const p = this.cornerRadius / min(this.size.x, this.size.y) * 2;
            const length = lerp(1, 2**.5/2, p) / 2;
            let s = this.size.scale(length);
            uiSystem.drawLine(this.nativePos.add(s.multiply(vec2(-1))), this.nativePos.add(s.multiply(vec2(1))), this.lineWidth, this.lineColor);
            uiSystem.drawLine(this.nativePos.add(s.multiply(vec2(-1,1))), this.nativePos.add(s.multiply(vec2(1,-1))), this.lineWidth, this.lineColor);
        }
        
        // draw the text next to the checkbox
        const textSize = this.getTextSize();
        const pos = this.nativePos.add(vec2(this.size.x,0));
        uiSystem.drawText(this.text, pos, textSize, 
            this.textColor, this.textLineWidth, this.textLineColor, 'left', this.font, this.fontStyle, false, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UISlider - A UI object that acts as a slider or scrollbar
 * @extends UIObject
 * @memberof UISystem
 */
class UISlider extends UIObject
{
    /** Create a UISlider object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {number}  [value]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     *  @param {Color}   [handleColor=WHITE]
     */
    constructor(pos, size, value=.5, text='', color=uiSystem.defaultButtonColor, handleColor=WHITE)
    {
        super(pos, size);

        ASSERT(isNumber(value), 'ui slider value must be a number');
        ASSERT(isStringLike(text), 'ui slider must be a string');
        ASSERT(isColor(color), 'ui slider color must be a color');
        ASSERT(isColor(handleColor), 'ui slider handleColor must be a color');

        /** @property {number} - Current percentage value of this slider 0-1 */
        this.value = value;
        /** @property {Color} - Color for the handle part of the slider */
        this.handleColor = handleColor.copy();
        /** @property {boolean} - Should it fill up like a progress bar? */
        this.fillMode = false;

        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    update()
    {
        super.update();
        if (!this.interactive)
            return;

        const oldValue = this.value;
        if (this.isActiveObject())
        {
            // handle horizontal or vertical slider
            const isHorizontal = this.size.x > this.size.y;
            const handleSize = isHorizontal ? this.size.y : this.size.x;
            const barSize = isHorizontal ? this.size.x : this.size.y;
            const centerPos = isHorizontal ? this.nativePos.x : this.nativePos.y;

            // check if value changed
            const handleWidth = barSize - handleSize;
            const p1 = centerPos - handleWidth/2;
            const p2 = centerPos + handleWidth/2;
            const p = uiSystem.screenToNative(mousePosScreen);
            this.value = isHorizontal ? 
                percent(p.x, p1, p2) :
                percent(p.y, p2, p1);
        }
        else if (this.isNavigationObject())
        {
            // gamepad/keyboard navigation adjustment
            const direction = uiSystem.getNavigationOtherDirection();
            if (!uiSystem.navigationTimer.active())
                this.value = clamp(this.value + direction*.01);
        }
        this.value === oldValue || this.onChange();
    }
    render()
    {
        super.render();

        // handle horizontal or vertical slider
        const isHorizontal = this.size.x > this.size.y;
        const barWidth = isHorizontal ? this.size.x : this.size.y;
        const handleWidth = isHorizontal ? this.size.y : this.size.x;
        if (this.fillMode)
        {
            // draw progress bar
            const minWidth = min(handleWidth, this.cornerRadius * 2);
            const progressWidth = lerp(minWidth, barWidth, this.value);
            const p = (progressWidth - barWidth) * (isHorizontal ? .5 : -.5);
            const pos = this.nativePos.add(isHorizontal ? vec2(p, 0) : vec2(0, p));
            const color = this.disabled ? this.disabledColor : this.handleColor;
            const drawSize = isHorizontal ? 
                vec2(progressWidth, this.size.y) : vec2(this.size.x, progressWidth);
            uiSystem.drawRect(pos, drawSize, color, this.lineWidth, this.lineColor, this.cornerRadius, this.gradientColor);
        }
        else
        {
            // draw the slider handle
            const value = clamp(isHorizontal ? this.value : 1 - this.value);
            const p = (barWidth - handleWidth) * (value - .5);
            const pos = this.nativePos.add(isHorizontal ? vec2(p, 0) : vec2(0, p));
            const color = this.disabled ? this.disabledColor : this.handleColor;
            const drawSize = vec2(handleWidth);
            uiSystem.drawRect(pos, drawSize, color, this.lineWidth, this.lineColor, this.cornerRadius, this.gradientColor);
        }

        // draw the text scaled to fit on the slider
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.nativePos, textSize, 
            this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
    navigatePressed()
    {
        // toggle value between 0 and 1
        this.value = this.value ? 0 : 1;
        this.onChange();
        this.onRelease();
        super.navigatePressed();
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * VideoPlayerUIObject - A UI object that plays video
 * @extends UIObject
 * @example
 * // Create a video player UI object
 * const video = new VideoPlayerUIObject(vec2(400, 300), vec2(320, 240), 'video.mp4', true);
 * video.play();
 * @memberof UISystem
 */
class UIVideo extends UIObject
{
    /** Create a video player UI object
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @param {string} src - Video file path or URL
     *  @param {boolean} [autoplay=false] - Start playing immediately?
     *  @param {boolean} [loop=false] - Loop the video?
     *  @param {number} [volume=1] - Volume percent scaled by global volume (0-1)
     */
    constructor(pos, size, src, autoplay=false, loop=false, volume=1)
    {
        super(pos, size || vec2());
        
        ASSERT(isStringLike(src), 'video src must be a string');
        ASSERT(isNumber(volume), 'video volume must be a number');

        this.color = BLACK; // default to black background
        this.cornerRadius = 0; // default to no corner radius

        /** @property {number} - The video volume */
        this.volume = volume;

        // create video element
        /** @property {HTMLVideoElement} - The video player */
        this.video = document.createElement('video');
        this.video.loop = loop;
        this.video.volume = clamp(volume * soundVolume);
        this.video.muted = !soundEnable;
        this.video.style.display = 'none';
        this.video.src = src;
        document.body.appendChild(this.video);
        autoplay && this.play();
    }
    
    /** Play or resume the video
     *  @return {Promise} Promise that resolves when playback starts */
    async play()
    {
        // try to play the video, catch any errors (autoplay may be blocked)
        try { await this.video.play(); }
        catch(e) {}
    }
    
    /** Pause the video */
    pause() { this.video.pause(); }
    
    /** Stop and reset the video */
    stop() { this.video.pause(); this.video.currentTime = 0; }
    
    /** Check if video is currently loading
     *  @return {boolean} */
    isLoading()
    { return this.video.readyState < this.video.HAVE_CURRENT_DATA; }
    
    /** Check if video is currently paused
     *  @return {boolean} */
    isPaused() { return this.video.paused; }
    
    /** Check if video is currently playing
     *  @return {boolean} */
    isPlaying()
    { return !this.isPaused() && !this.hasEnded() && !this.isLoading(); }
    
    /** Check if video has ended playing
     *  @return {boolean} */
    hasEnded() { return this.video.ended; }
    
    /** Set volume (0-1)
     *  @param {number} volume - Volume level (0-1) */
    setVolume(volume)
    {
        this.volume = volume;
        this.video.volume = clamp(volume * soundVolume);
    }
    
    /** Set playback speed
     *  @param {number} rate - Playback rate multiplier */
    setPlaybackRate(rate) { this.video.playbackRate = rate; }
    
    /** Get current time in seconds
     *  @return {number} Current playback time */
    getCurrentTime() { return this.video.currentTime || 0; }
    
    /** Get duration in seconds
     *  @return {number} Total video duration */
    getDuration() { return this.video.duration || 0; }
    
    /** Get the native video dimensions 
     *  @return {Vector2} Video dimensions (may be 0,0 if metadata not loaded) */
    getVideoSize()
    { return vec2(this.video.videoWidth, this.video.videoHeight); }
    
    /** Seek to time in seconds
     *  @param {number} time - Time in seconds to seek to */
    setTime(time)
    { this.video.currentTime = clamp(time, 0, this.getDuration()); }

    update()
    {
        super.update();

        // update volume based on global sound volume
        this.video.volume = clamp(this.volume * soundVolume);
    }
    
    /** Render video to UI canvas */
    render()
    {
        super.render();

        if (this.isLoading())
            return;
        const context = uiSystem.uiContext;
        const s = this.size;
        context.save();
        context.translate(this.nativePos.x, this.nativePos.y);
        context.drawImage(this.video, -s.x/2, -s.y/2, s.x, s.y);
        context.restore();
    }
    
    /** Clean up video on destroy */
    destroy()
    {
        if (this.destroyed)
            return;

        this.video.pause();
        this.video.remove();
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * UILayout - A container that auto-arranges children in a vertical list, horizontal list, or grid
 * - Set columns to 1 for a vertical list (default)
 * - Set columns to children.length for a horizontal list
 * - Set columns to N (1 < N < children.length) for a grid with N columns
 * - Per-child sizing: each row's height = max child.size.y in that row, each column's width = max child.size.x in that column
 * - Children are positioned centered in their cell
 * - Container auto-sizes to fit children plus padding
 * @extends UIObject
 * @memberof UISystem
 */
class UILayout extends UIObject
{
    /** Create a UILayout container that auto-arranges children
     *  @param {Vector2} [pos]
     *  @param {number}  [columns=1]     - Number of columns (1 = vertical list)
     *  @param {number}  [gap=10]        - Space between children
     *  @param {number}  [padding=10]    - Space between container border and children
     *  @param {boolean} [transparent=false] - If true, draws no background, outline, or shadow
     */
    constructor(pos, columns=1, gap=10, padding=10, transparent=false)
    {
        super(pos);

        ASSERT(isNumber(columns) && columns >= 1, 'ui layout columns must be a number >= 1');
        ASSERT(isNumber(gap), 'ui layout gap must be a number');
        ASSERT(isNumber(padding), 'ui layout padding must be a number');

        /** @property {number} - Number of columns in the layout */
        this.columns = columns;
        /** @property {number} - Space between children */
        this.gap = gap;
        /** @property {number} - Space between container border and children */
        this.padding = padding;

        if (transparent)
        {
            // pure positioning helper - skip background, outline, and shadow
            this.color = CLEAR_BLACK;
            this.gradientColor = undefined;
            this.lineWidth = 0;
            this.shadowColor = CLEAR_BLACK;
        }
        this.relayout();
    }

    /** Add a child UIObject and re-layout
     *  @param {UIObject} child
     *  @return {UIObject} The child object added */
    addChild(child)
    {
        super.addChild(child);
        this.relayout();
        return child;
    }

    /** Remove a child UIObject and re-layout
     *  @param {UIObject} child */
    removeChild(child)
    {
        super.removeChild(child);
        this.relayout();
    }

    /** Recompute child positions and container size based on per-child sizes.
     *  Called automatically by addChild and removeChild. Call manually if you
     *  mutate a child's size or change columns, gap, or padding. */
    relayout()
    {
        const n = this.children.length;
        if (!n)
        {
            this.size = vec2(this.padding * 2);
            return;
        }

        const cols = this.columns;
        const rows = ceil(n / cols);
        const colWidths = new Array(cols).fill(0);
        const rowHeights = new Array(rows).fill(0);

        // first pass: compute column widths and row heights from child sizes
        for (let i = 0; i < n; ++i)
        {
            const col = i % cols;
            const row = floor(i / cols);
            const child = this.children[i];
            colWidths[col] = max(colWidths[col], child.size.x);
            rowHeights[row] = max(rowHeights[row], child.size.y);
        }

        // total content size (sum of column widths/row heights plus gaps between them)
        let contentWidth = this.gap * (cols - 1);
        for (const w of colWidths) contentWidth += w;
        let contentHeight = this.gap * (rows - 1);
        for (const h of rowHeights) contentHeight += h;

        // cumulative column/row offsets so positioning is O(n) not O(n^2)
        const colOffsets = new Array(cols);
        let xAcc = 0;
        for (let c = 0; c < cols; ++c)
        {
            colOffsets[c] = xAcc;
            xAcc += colWidths[c];
        }
        const rowOffsets = new Array(rows);
        let yAcc = 0;
        for (let r = 0; r < rows; ++r)
        {
            rowOffsets[r] = yAcc;
            yAcc += rowHeights[r];
        }

        // second pass: position each child centered in its cell
        for (let i = 0; i < n; ++i)
        {
            const col = i % cols;
            const row = floor(i / cols);
            const x = -contentWidth/2 + colOffsets[col] + this.gap * col + colWidths[col] / 2;
            const y = -contentHeight/2 + rowOffsets[row] + this.gap * row + rowHeights[row] / 2;
            this.children[i].localPos = vec2(x, y);
        }

        // container size = content + padding on all sides
        this.size = vec2(contentWidth + this.padding * 2, contentHeight + this.padding * 2);
    }
}
/**
 * LittleJS Box2D Physics Plugin
 * - Box2dObject extends EngineObject with Box2D physics
 * - Call box2dInit() to enable
 * - You will also need to include box2d.wasm.js
 * - Uses a super fast web assembly port of Box2D v2.3.1
 * - More info: https://github.com/kripken/box2d.js
 * - Functions to create polygon, circle, and edge shapes
 * - Contact begin and end callbacks
 * - Wraps b2Vec2 type to/from Vector2
 * - Raycasting and querying
 * - Box2dTileLayer for grid based collision
 * - Every type of joint
 * - Debug physics drawing
 * @namespace Box2D
 */

/** Global Box2d Plugin object
 *  @type {Box2dPlugin}
 *  @memberof Box2D */
let box2d;

/** Enable Box2D debug drawing
 *  @type {boolean}
 *  @default
 *  @memberof Box2D */
let box2dDebug = false;

/** Enable Box2D debug drawing
 *  @param {boolean} enable
 *  @memberof Box2D */
function box2dSetDebug(enable) { box2dDebug = enable; }

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Object - extend with your own custom physics objects
 * - A LittleJS object with Box2D physics, dynamic by default
 * - Provides interface for Box2D body and fixture functions
 * - Each object can have multiple fixtures and joints
 * @extends EngineObject
 * @memberof Box2D
 */
class Box2dObject extends EngineObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [bodyType]
     *  @param {number}   [renderOrder] */
    constructor(pos=vec2(), size=vec2(), tileInfo, angle=0, color, bodyType=box2d.bodyTypeDynamic, renderOrder=0)
    {
        super(pos, size, tileInfo, angle, color, renderOrder);

        // create physics body
        const bodyDef = new box2d.instance.b2BodyDef();
        bodyDef.set_type(bodyType);
        bodyDef.set_position(box2d.vec2dTo(pos));
        bodyDef.set_angle(-angle);
        
        /** @property {Object} - The Box2d body */
        this.body = box2d.world.CreateBody(bodyDef);
        /** @property {Color} - Line color used for default box2d drawing */
        this.lineColor = BLACK;
        /** @property {Array<Object>} - List of all edges for default box2d drawing */
        this.edgeLists = [];
        /** @property {Array<Object>} - List of all edge loops for default box2d drawing */
        this.edgeLoops = [];

        this.body.object = this; // link body to this object
        box2d.objects.push(this); // keep track of all box2d objects
    }

    /** Destroy this object and its physics body */
    destroy()
    {
        if (this.destroyed) return;

        // destroy physics body, fixtures, and joints
        ASSERT(this.body, 'Box2dObject has no body to destroy');
        box2d.world.DestroyBody(this.body);

        // remove from tracked list so paused / headless sessions don't leak
        const i = box2d.objects.indexOf(this);
        if (i >= 0)
            box2d.objects.splice(i, 1);
        super.destroy();
    }

    /** Box2d objects updated with Box2d world step */
    updatePhysics() {}

    /** Render the object, uses box2d drawing if no tile info exists */
    render()
    {
        // use default render or draw fixtures
        if (this.tileInfo)
            super.render();
        else
            this.drawFixtures(this.color, this.lineColor, this.lineWidth);
    }

    /** Render debug info */
    renderDebugInfo()
    {
        const isAsleep = !this.getIsAwake();
        const isStatic = this.getBodyType() === box2d.bodyTypeStatic;
        const color = rgb(isAsleep?1:0, isAsleep?1:0, isStatic?1:0, .5);
        this.drawFixtures(color);
    }

    /** Draws all this object's fixtures 
     *  @param {Color}   [color]
     *  @param {Color}   [lineColor]
     *  @param {number}  [lineWidth]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixtures(color=WHITE, lineColor=BLACK, lineWidth=.1, useWebGL, context)
    {
        // draw non-edge fixtures
        this.getFixtureList().forEach((fixture)=>
        {
            const shape = box2d.castShapeObject(fixture.GetShape());
            if (shape.GetType() !== box2d.instance.b2Shape.e_edge)
            {
                box2d.drawFixture(fixture, this.pos, this.angle, color, lineColor, lineWidth, useWebGL, context);
            }
        });

        // draw edges using a single draw line for better connections
        this.edgeLists.forEach(points=>
            drawLineList(points, lineWidth, lineColor, false, this.pos, this.angle));
        this.edgeLoops.forEach(points=>
            drawLineList(points, lineWidth, lineColor, true, this.pos, this.angle));
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics contact callbacks

    /** Called when a contact begins
     *  @param {Box2dObject} otherObject */
    beginContact(otherObject) {}

    /** Called when a contact ends
     *  @param {Box2dObject} otherObject */
    endContact(otherObject) {}

    ///////////////////////////////////////////////////////////////////////////////
    // physics fixtures and shapes

    /** Add a shape fixture to the body
     *  @param {Object} shape
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addShape(shape, density=1, friction=.2, restitution=0, isSensor=false)
    {
        ASSERT(isNumber(density), 'density must be a number');
        ASSERT(isNumber(friction), 'friction must be a number');
        ASSERT(isNumber(restitution), 'restitution must be a number');

        const fd = new box2d.instance.b2FixtureDef();
        fd.set_shape(shape);
        fd.set_density(density);
        fd.set_friction(friction);
        fd.set_restitution(restitution);
        fd.set_isSensor(isSensor);
        return this.body.CreateFixture(fd);
    }

    /** Add a box shape to the body
     *  @param {Vector2} [size]
     *  @param {Vector2} [offset]
     *  @param {number}  [angle] - LittleJS convention (clockwise positive).
     *      Negated internally to match Box2D's CCW-positive convention so the
     *      fixture aligns with the same angle passed to drawRect/drawTile.
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addBox(size=vec2(1), offset=vec2(), angle=0, density, friction, restitution, isSensor)
    {
        ASSERT(isVector2(size), 'size must be a Vector2');
        ASSERT(size.x > 0 && size.y > 0, 'size must be positive');
        ASSERT(isVector2(offset), 'offset must be a Vector2');
        ASSERT(isNumber(angle), 'angle must be a number');

        const shape = new box2d.instance.b2PolygonShape();
        shape.SetAsBox(size.x/2, size.y/2, box2d.vec2dTo(offset), -angle);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add a polygon shape to the body
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addPoly(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');

        function box2dCreatePolygonShape(points)
        {
            ASSERT(3 <= points.length && points.length <= 8);
            const buffer = box2d.instance._malloc(points.length * 8);
            for (let i=0, offset=0; i<points.length; ++i)
            {
                box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].x;
                offset += 4;
                box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].y;
                offset += 4;
            }
            const box2dPoints = box2d.instance.wrapPointer(buffer, box2d.instance.b2Vec2);
            const shape = new box2d.instance.b2PolygonShape();
            shape.Set(box2dPoints, points.length);
            box2d.instance._free(buffer);
            return shape;
        }

        const shape = box2dCreatePolygonShape(points);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add a regular polygon shape to the body
     *  @param {number}  [diameter]
     *  @param {number}  [sides]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addRegularPoly(diameter=1, sides=8, density, friction, restitution, isSensor)
    {
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');
        ASSERT(isNumber(sides) && sides>2, 'sides must be a positive number greater than 2');

        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(radius,0).rotate((i+.5)/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    /** Add a random polygon shape to the body
     *  @param {number}  [diameter]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addRandomPoly(diameter=1, density, friction, restitution, isSensor)
    {
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');

        const sides = randInt(3, 9);
        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(rand(radius/2,radius*1.5),0).rotate(i/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    /** Add a circle shape to the body
     *  @param {number}  [diameter]
     *  @param {Vector2} [offset]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addCircle(diameter=1, offset=vec2(), density, friction, restitution, isSensor)
    {
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');
        ASSERT(isVector2(offset), 'offset must be a Vector2');
        
        const shape = new box2d.instance.b2CircleShape();
        shape.set_m_p(box2d.vec2dTo(offset));
        shape.set_m_radius(diameter/2);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add an edge shape to the body
     *  @param {Vector2} point1
     *  @param {Vector2} point2
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdge(point1, point2, density, friction, restitution, isSensor)
    {
        ASSERT(isVector2(point1), 'point1 must be a Vector2');
        ASSERT(isVector2(point2), 'point2 must be a Vector2');

        const shape = new box2d.instance.b2EdgeShape();
        shape.Set(box2d.vec2dTo(point1), box2d.vec2dTo(point2));
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add an edge list to the body
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeList(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');
        const fixtures = [], edgePoints = [];
        for (let i=0; i<points.length-1; ++i)
        {
            const shape = new box2d.instance.b2EdgeShape();
            points[i-1] && shape.set_m_vertex0(box2d.vec2dTo(points[i-1]));
            points[i+0] && shape.set_m_vertex1(box2d.vec2dTo(points[i+0]));
            points[i+1] && shape.set_m_vertex2(box2d.vec2dTo(points[i+1]));
            points[i+2] && shape.set_m_vertex3(box2d.vec2dTo(points[i+2]));
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            fixtures.push(f);
            edgePoints.push(points[i].copy());
        }
        edgePoints.push(points[points.length-1].copy());
        this.edgeLists.push(edgePoints);
        return fixtures;
    }

    /** Add an edge loop to the body, an edge loop connects the end points
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeLoop(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');
        const fixtures = [], edgePoints = [];
        const getPoint = i=> points[mod(i,points.length)];
        for (let i=0; i<points.length; ++i)
        {
            const shape = new box2d.instance.b2EdgeShape();
            shape.set_m_vertex0(box2d.vec2dTo(getPoint(i-1)));
            shape.set_m_vertex1(box2d.vec2dTo(getPoint(i+0)));
            shape.set_m_vertex2(box2d.vec2dTo(getPoint(i+1)));
            shape.set_m_vertex3(box2d.vec2dTo(getPoint(i+2)));
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            fixtures.push(f);
            edgePoints.push(points[i].copy());
        }
        this.edgeLoops.push(edgePoints);
        return fixtures;
    }

    /** Destroy a fixture from the body
     *  @param {Object} [fixture] */
    destroyFixture(fixture) { this.body.DestroyFixture(fixture); }

    /** Destroy all fixture from the body */
    destroyAllFixtures()
    { this.getFixtureList().forEach(fixture=>this.destroyFixture(fixture)); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics get functions

    /** Gets the center of mass
     *  @return {Vector2} */
    getCenterOfMass() { return box2d.vec2From(this.body.GetWorldCenter()); }

    /** Gets the linear velocity
     *  @return {Vector2} */
    getLinearVelocity() { return box2d.vec2From(this.body.GetLinearVelocity()); }

    /** Gets the angular velocity
     *  @return {Vector2} */
    getAngularVelocity() { return this.body.GetAngularVelocity(); }

    /** Gets the mass
     *  @return {number} */
    getMass() { return this.body.GetMass(); }

    /** Gets the rotational inertia
     *  @return {number} */
    getInertia() { return this.body.GetInertia(); }

    /** Check if this object is awake
     *  @return {boolean} */
    getIsAwake() { return this.body.IsAwake(); }

    /** Gets the physics body type
     *  @return {number} */
    getBodyType() { return this.body.GetType(); }
    
    /** Get the speed of this object
     *  @return {number} */
    getSpeed() { return this.getLinearVelocity().length(); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics set functions

    /** Sets the position and angle
     *  @param {Vector2} pos
     *  @param {number} angle */
    setTransform(pos, angle)
    {
        this.pos = pos;
        this.angle = angle;
        // box2d uses reverse angle
        this.body.SetTransform(box2d.vec2dTo(pos), -angle);
    }
    
    /** Sets the position
     *  @param {Vector2} pos */
    setPosition(pos)
    { this.setTransform(pos, -this.body.GetAngle()); }

    /** Sets the angle
     *  @param {number} angle */
    setAngle(angle)
    { this.setTransform(box2d.vec2From(this.body.GetPosition()), angle); }

    /** Sets the linear velocity
     *  @param {Vector2} velocity */
    setLinearVelocity(velocity)
    { this.body.SetLinearVelocity(box2d.vec2dTo(velocity)); }

    /** Sets the angular velocity
     *  @param {number} angularVelocity */
    setAngularVelocity(angularVelocity)
    { this.body.SetAngularVelocity(angularVelocity); }

    /** Sets the linear damping
     *  @param {number} damping */
    setLinearDamping(damping)
    { this.body.SetLinearDamping(damping); }

    /** Sets the angular damping
     *  @param {number} damping */
    setAngularDamping(damping)
    { this.body.SetAngularDamping(damping); }

    /** Sets the gravity scale
     *  @param {number} [scale] */
    setGravityScale(scale=1)
    { this.body.SetGravityScale(this.gravityScale = scale); }

    /** Should be like a bullet for continuous collision detection?
     *  @param {boolean} [isBullet] */
    setBullet(isBullet=true) { this.body.SetBullet(isBullet); }

    /** Set the sleep state of the body
     *  @param {boolean} [isAwake] */
    setAwake(isAwake=true) { this.body.SetAwake(isAwake); }
    
    /** Set the physics body type
     *  @param {number} type */
    setBodyType(type) { this.body.SetType(type); }

    /** Set whether the body is allowed to sleep
     *  @param {boolean} [isAllowed] */
    setSleepingAllowed(isAllowed=true)
    { this.body.SetSleepingAllowed(isAllowed); }
    
    /** Set whether the body can rotate
     *  @param {boolean} [isFixed] */
    setFixedRotation(isFixed=true)
    { this.body.SetFixedRotation(isFixed); }

    /** Set the center of mass of the body
     *  @param {Vector2} center */
    setCenterOfMass(center) { this.setMassData(center) }

    /** Set the mass of the body
     *  @param {number} mass */
    setMass(mass) { this.setMassData(undefined, mass) }
    
    /** Set the moment of inertia of the body
     *  @param {number} momentOfInertia */
    setMomentOfInertia(momentOfInertia)
    { this.setMassData(undefined, undefined, momentOfInertia) }
    
    /** Reset the mass, center of mass, and moment */
    resetMassData() { this.body.ResetMassData(); }
    
    /** Set the mass data of the body
     *  @param {Vector2} [localCenter]
     *  @param {number}  [mass]
     *  @param {number}  [momentOfInertia] */
    setMassData(localCenter, mass, momentOfInertia)
    {
        const data = new box2d.instance.b2MassData();
        this.body.GetMassData(data);
        // use !== undefined so setMass(0) (static-equivalent) isn't silently ignored
        if (localCenter !== undefined) data.set_center(box2d.vec2dTo(localCenter));
        if (mass !== undefined) data.set_mass(mass);
        if (momentOfInertia !== undefined) data.set_I(momentOfInertia);
        this.body.SetMassData(data);
    }

    /** Set the collision filter data for this body
     *  @param {number} [categoryBits]
     *  @param {number} [ignoreCategoryBits]
     *  @param {number} [groupIndex] */
    setFilterData(categoryBits=0, ignoreCategoryBits=0, groupIndex=0)
    {
        this.getFixtureList().forEach(fixture=>
        {
            const filter = fixture.GetFilterData();
            filter.set_categoryBits(categoryBits);
            filter.set_maskBits(0xffff & ~ignoreCategoryBits);
            filter.set_groupIndex(groupIndex);
            fixture.SetFilterData(filter); // applies and refilters contacts
        });
    }

    /** Set if this body is a sensor
     *  @param {boolean} [isSensor] */
    setSensor(isSensor=true)
    { this.getFixtureList().forEach(f=>f.SetSensor(isSensor)); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics force and torque functions

    /** Apply force to this object
     *  @param {Vector2} force
     *  @param {Vector2} [pos] */
    applyForce(force, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyForce(box2d.vec2dTo(force), box2d.vec2dTo(pos));
    }

    /** Apply acceleration to this object (changes velocity by acceleration,
     *  mass-independent — matches EngineObject.applyAcceleration semantics).
     *  Use applyImpulse if you want the mass-dependent velocity change
     *  Δv = impulse / mass, or applyForce for a Newton-style sustained force.
     *  @param {Vector2} acceleration
     *  @param {Vector2} [pos] */
    applyAcceleration(acceleration, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        const impulse = acceleration.scale(this.getMass());
        this.body.ApplyLinearImpulse(box2d.vec2dTo(impulse), box2d.vec2dTo(pos));
    }

    /** Apply an instantaneous linear impulse. Changes velocity immediately by
     *  impulse / mass (so heavier bodies move less for the same impulse).
     *  @param {Vector2} impulse
     *  @param {Vector2} [pos] */
    applyImpulse(impulse, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(box2d.vec2dTo(impulse), box2d.vec2dTo(pos));
    }

    /** Apply torque to this object
     *  @param {number} torque */
    applyTorque(torque)
    {
        this.setAwake();
        this.body.ApplyTorque(torque);
    }

    /** Apply angular acceleration to this object (changes angular velocity by
     *  acceleration, mass-independent — matches EngineObject semantics).
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    {
        this.setAwake();
        this.body.ApplyAngularImpulse(acceleration * this.getInertia());
    }

    /** Apply an instantaneous angular impulse. Changes angular velocity by
     *  impulse / inertia immediately.
     *  @param {number} impulse */
    applyAngularImpulse(impulse)
    {
        this.setAwake();
        this.body.ApplyAngularImpulse(impulse);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // lists of fixtures and joints

    /** Check if this object has any fixtures
     *  @return {boolean} */
    hasFixtures() { return !box2d.isNull(this.body.GetFixtureList()); }

    /** Get list of fixtures for this object
     *  @return {Array<Object>} */
    getFixtureList()
    {
        const fixtures = [];
        for (let fixture=this.body.GetFixtureList(); !box2d.isNull(fixture); )
        {
            fixtures.push(fixture);
            fixture = fixture.GetNext();
        }
        return fixtures;
    }

    /** Check if this object has any joints
     *  @return {boolean} */
    hasJoints() { return !box2d.isNull(this.body.GetJointList()); }
    
    /** Get list of joints for this object
     *  @return {Array<Object>} */
    getJointList()
    {
        const joints = [];
        for (let joint=this.body.GetJointList(); !box2d.isNull(joint); )
        {
            joints.push(joint);
            joint = joint.get_next();
        }
        return joints;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Static Object - Box2d with a static physics body
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dStaticObject extends Box2dObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [renderOrder] */
    constructor(pos, size, tileInfo, angle=0, color, renderOrder=0)
    {
        const bodyType = box2d.bodyTypeStatic;
        super(pos, size, tileInfo, angle, color, bodyType, renderOrder);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Kinematic Object - Box2d with a kinematic physics body
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dKinematicObject extends Box2dObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [renderOrder] */
    constructor(pos, size, tileInfo, angle=0, color, renderOrder=0)
    {
        const bodyType = box2d.bodyTypeKinematic;
        super(pos, size, tileInfo, angle, color, bodyType, renderOrder);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Box2d Tile Layer
 * - adds Box2d support to tile layers
 * - creates static box2d fixtures for solid tiles
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dTileLayer extends Box2dStaticObject
{
    /** Create a Box2d tile layer object
    *  @param {TileCollisionLayer} tileLayer - Tile layer for this object */
    constructor(tileLayer)
    {
        ASSERT(tileLayer instanceof TileCollisionLayer, 'tileLayer must be a TileCollisionLayer');
        super(tileLayer.pos, tileLayer.size);

        /** @property {TileLayer} - The tile layer */
        this.tileLayer = tileLayer;
        this.addChild(tileLayer);
    }

    render()
    {
        // do not render fixtures, tile layer handles rendering
    }
    
    /** Create box2d collision fixtures for solid tiles
    *  @param {number} [friction]
    *  @param {number} [restitution] */
    buildCollision(friction=.2, restitution=0)
    {
        // destroy all fixtures and create new ones
        this.destroyAllFixtures();

        // create box2d object for this layer
        this.pos = this.tileLayer.pos.copy();
        this.size = this.tileLayer.size.copy();

        // track which tiles have been processed
        const processed = [];
        const getIndex = (x, y)=> x + y * this.size.x;
        const isSolidUnprocessed = (x, y)=>
            !processed[getIndex(x, y)] &&
            this.tileLayer.getCollisionData(vec2(x, y)) > 0;

        // combine tiles into larger boxes
        for (let x = 0; x < this.size.x; ++x)
        for (let y = 0; y < this.size.y; ++y)
        {
            if (!isSolidUnprocessed(x, y)) continue;

            // find max width by scanning right
            let width = 1, height = 1, canExpand = true;
            while (isSolidUnprocessed(x + width, y))
                ++width;

            // find max height by scanning up, ensuring all rows have the same width
            while (canExpand)
            {
                for (let checkX = 0; checkX < width; ++checkX)
                {
                    if (!isSolidUnprocessed(x + checkX, y + height))
                    {
                        canExpand = false;
                        break;
                    }
                }
                if (canExpand)
                    ++height;
            }

            // mark all tiles in this rectangle as processed
            for (let rectX = width;  rectX--;)
            for (let rectY = height; rectY--;)
                processed[getIndex(x + rectX, y + rectY)] = true;

            // create a single fixture for the entire rectangle
            const shapeSize = vec2(width, height);
            const offset = vec2(x + width/2, y + height/2);
            this.addBox(shapeSize, offset, 0, 0, friction, restitution);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Raycast Result
 * - Holds results from a box2d raycast queries
 * - Automatically created by box2d raycast functions
 */
class Box2dRaycastResult
{
    /** Create a raycast result
     *  @param {Object}  fixture
     *  @param {Vector2} point
     *  @param {Vector2} normal
     *  @param {number}  fraction */
    constructor(fixture, point, normal, fraction)
    {
        /** @property {Box2dObject} - The box2d object */
        this.object   = fixture.GetBody().object;
        /** @property {Object} - The fixture that was hit */
        this.fixture  = fixture;
        /** @property {Vector2} - The hit point */
        this.point    = point;
        /** @property {Vector2} - The hit normal */
        this.normal   = normal;
        /** @property {number} - Distance fraction at the point of intersection */
        this.fraction = fraction;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Joint
 * - Base class for Box2D joints 
 * - A joint is used to connect objects together
 * @memberof Box2D
 */
class Box2dJoint
{
    /** Create a box2d joint, the base class is not intended to be used directly
     *  @param {Object} jointDef */
    constructor(jointDef)
    {
        /** @property {Object} - The Box2d joint */
        this.box2dJoint = box2d.castJointObject(box2d.world.CreateJoint(jointDef));
    }

    /** Destroy this joint */
    destroy() { box2d.world.DestroyJoint(this.box2dJoint); this.box2dJoint = 0; }

    /** Get the first object attached to this joint
     *  @return {Box2dObject} */
    getObjectA() { return this.box2dJoint.GetBodyA().object; }
    
    /** Get the second object attached to this joint
     *  @return {Box2dObject} */
    getObjectB() { return this.box2dJoint.GetBodyB().object; }
    
    /** Get the first anchor for this joint in world coordinates
     *  @return {Vector2} */
    getAnchorA() { return box2d.vec2From(this.box2dJoint.GetAnchorA());}

    /** Get the second anchor for this joint in world coordinates
     *  @return {Vector2} */
    getAnchorB() { return box2d.vec2From(this.box2dJoint.GetAnchorB());}
    
    /** Get the reaction force on bodyB at the joint anchor given a time step
     *  @param {number} time
     *  @return {Vector2} */
    getReactionForce(time)  { return box2d.vec2From(this.box2dJoint.GetReactionForce(1/time));}

    /** Get the reaction torque on bodyB in N*m given a time step
     *  @param {number} time
     *  @return {number} */
    getReactionTorque(time) { return this.box2dJoint.GetReactionTorque(1/time);}
    
    /** Check if the connected bodies should collide
     *  @return {boolean} */
    getCollideConnected()   { return this.box2dJoint.GetCollideConnected();}

    /** Check if either connected body is active
     *  @return {boolean} */
    isActive() { return this.box2dJoint.IsActive();}
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Target Joint, also known as a mouse joint
 * - Used to make a point on a object track a specific world point target
 * - This a soft constraint with a max force
 * - This allows the constraint to stretch and without applying huge forces
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dTargetJoint extends Box2dJoint
{
    /** Create a target joint
     *  @param {Box2dObject} object
     *  @param {Box2dObject} fixedObject
     *  @param {Vector2} worldPos */
    constructor(object, fixedObject, worldPos)
    {
        object.setAwake();
        const jointDef = new box2d.instance.b2MouseJointDef();
        jointDef.set_bodyA(fixedObject.body);
        jointDef.set_bodyB(object.body);
        jointDef.set_target(box2d.vec2dTo(worldPos));
        jointDef.set_maxForce(2e3 * object.getMass());
        super(jointDef);
    }

    /** Set the target point in world coordinates
     *  @param {Vector2} pos */
    setTarget(pos) { this.box2dJoint.SetTarget(box2d.vec2dTo(pos)); }
    
    /** Get the target point in world coordinates
     *  @return {Vector2} */
    getTarget(){ return box2d.vec2From(this.box2dJoint.GetTarget()); }

    /** Sets the maximum force in Newtons
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }
    
    /** Gets the maximum force in Newtons
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }
    
    /** Sets the joint frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); }
    
    /** Gets the joint frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Distance Joint
 * - Constrains two points on two objects to remain at a fixed distance
 * - You can view this as a massless, rigid rod
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dDistanceJoint extends Box2dJoint
{
    /** Create a distance joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchorA, anchorB, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2DistanceJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_length(anchorA.distance(anchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    
    /** Set the length of the joint
     *  @param {number} length */
    setLength(length) { this.box2dJoint.SetLength(length); }
    
    /** Get the length of the joint
     *  @return {number} */
    getLength() { return this.box2dJoint.GetLength(); }
    
    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); }
    
    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }
    
    /** Set the damping ratio
     *  @param {number} ratio */
    setDampingRatio(ratio) { this.box2dJoint.SetDampingRatio(ratio); }
    
    /** Get the damping ratio
     *  @return {number} */
    getDampingRatio() { return this.box2dJoint.GetDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pin Joint
 * - Pins two objects together at a point
 * @extends Box2dDistanceJoint
 * @memberof Box2D
 */
class Box2dPinJoint extends Box2dDistanceJoint
{
    /** Create a pin joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [pos]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, pos=objectA.pos, collide=false)
    {
        super(objectA, objectB, undefined, pos, collide);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Rope Joint
 * - Enforces a maximum distance between two points on two objects
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dRopeJoint extends Box2dJoint
{
    /** Create a rope joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {number} extraLength
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchorA, anchorB, extraLength=0, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2RopeJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_maxLength(anchorA.distance(anchorB)+extraLength);
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    
    /** Set the max length of the joint
     *  @param {number} length */
    setMaxLength(length) { this.box2dJoint.SetMaxLength(length); }

    /** Get the max length of the joint
     *  @return {number} */
    getMaxLength() { return this.box2dJoint.GetMaxLength(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Revolute Joint
 * - Constrains two objects to share a point while they are free to rotate around the point
 * - The relative rotation about the shared point is the joint angle
 * - You can limit the relative rotation with a joint limit
 * - You can use a motor to drive the relative rotation about the shared point
 * - A maximum motor torque is provided so that infinite forces are not generated
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dRevoluteJoint extends Box2dJoint
{
    /** Create a revolute joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2RevoluteJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_referenceAngle(objectB.body.GetAngle() - objectA.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the reference angle, objectB angle minus objectA angle in the reference state 
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Get the current joint angle
     *  @return {number} */
    getJointAngle() { return this.box2dJoint.GetJointAngle(); }

    /** Get the current joint angle speed in radians per second
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }

    /** Is the joint limit enabled?
     *  @return {boolean} */
    isLimitEnabled() { return this.box2dJoint.IsLimitEnabled(); }

    /** Enable/disable the joint limit
     *  @param {boolean} [enable] */
    enableLimit(enable=true) { return this.box2dJoint.EnableLimit(enable); }

    /** Get the lower joint limit
     *  @return {number} */
    getLowerLimit() { return this.box2dJoint.GetLowerLimit(); }

    /** Get the upper joint limit
     *  @return {number} */
    getUpperLimit() { return this.box2dJoint.GetUpperLimit(); }

    /** Set the joint limits
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max) { return this.box2dJoint.SetLimits(min, max); }

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }

    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }

    /** Set the motor torque
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque given a time step
     *  @param {number} time 
     *  @return {number} */
    getMotorTorque(time) { return this.box2dJoint.GetMotorTorque(1/time); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Gear Joint
 * - A gear joint is used to connect two joints together
 * - Either joint can be a revolute or prismatic joint
 * - You specify a gear ratio to bind the motions together
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dGearJoint extends Box2dJoint
{
    /** Create a gear joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Box2dJoint} joint1
     *  @param {Box2dJoint} joint2
     *  @param {number} [ratio] */
    constructor(objectA, objectB, joint1, joint2, ratio=1)
    {
        const jointDef = new box2d.instance.b2GearJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_joint1(joint1.box2dJoint);
        jointDef.set_joint2(joint2.box2dJoint);
        jointDef.set_ratio(ratio);
        super(jointDef);

        this.joint1 = joint1;
        this.joint2 = joint2;
    }

    /** Get the first joint
     *  @return {Box2dJoint} */
    getJoint1() { return this.joint1; }

    /** Get the second joint
     *  @return {Box2dJoint} */
    getJoint2() { return this.joint2; }

    /** Set the gear ratio
     *  @param {number} ratio */
    setRatio(ratio) { return this.box2dJoint.SetRatio(ratio); }

    /** Get the gear ratio
     *  @return {number} */
    getRatio() { return this.box2dJoint.GetRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Prismatic Joint
 * - Provides one degree of freedom: translation along an axis fixed in objectA
 * - Relative rotation is prevented
 * - You can use a joint limit to restrict the range of motion
 * - You can use a joint motor to drive the motion or to model joint friction
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dPrismaticJoint extends Box2dJoint
{
    /** Create a prismatic joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {Vector2} worldAxis
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectA.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2PrismaticJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_localAxisA(box2d.vec2dTo(localAxisA));
        jointDef.set_referenceAngle(objectB.body.GetAngle() - objectA.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the local joint axis relative to bodyA
     *  @return {Vector2} */
    getLocalAxisA() { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }
    
    /** Get the reference angle
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Get the current joint translation
     *  @return {number} */
    getJointTranslation() { return this.box2dJoint.GetJointTranslation(); }
    
    /** Get the current joint translation speed
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }
    
    /** Is the joint limit enabled?
     *  @return {boolean} */
    isLimitEnabled() { return this.box2dJoint.IsLimitEnabled(); }
    
    /** Enable/disable the joint limit
     *  @param {boolean} [enable] */
    enableLimit(enable=true) { return this.box2dJoint.EnableLimit(enable); }
    
    /** Get the lower joint limit
     *  @return {number} */
    getLowerLimit() { return this.box2dJoint.GetLowerLimit(); }
    
    /** Get the upper joint limit
     *  @return {number} */
    getUpperLimit() { return this.box2dJoint.GetUpperLimit(); }
    
    /** Set the joint limits
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max) { return this.box2dJoint.SetLimits(min, max); }
    
    /** Is the motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }
    
    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }
    
    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }
    
    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }
    
    /** Set the maximum motor force
     *  @param {number} force */
    setMaxMotorForce(force) { return this.box2dJoint.SetMaxMotorForce(force); }
    
    /** Get the maximum motor force
     *  @return {number} */
    getMaxMotorForce() { return this.box2dJoint.GetMaxMotorForce(); }
    
    /** Get the motor force given a time step
     *  @param {number} time
     *  @return {number} */
    getMotorForce(time) { return this.box2dJoint.GetMotorForce(1/time); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Wheel Joint
 * - Provides two degrees of freedom: translation along an axis fixed in objectA and rotation
 * - You can use a joint limit to restrict the range of motion
 * - You can use a joint motor to drive the motion or to model joint friction
 * - This joint is designed for vehicle suspensions
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dWheelJoint extends Box2dJoint
{
    /** Create a wheel joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {Vector2} worldAxis
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectA.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2WheelJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_localAxisA(box2d.vec2dTo(localAxisA));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the local joint axis relative to bodyA
     *  @return {Vector2} */
    getLocalAxisA() { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }

    /** Get the current joint translation
     *  @return {number} */
    getJointTranslation() { return this.box2dJoint.GetJointTranslation(); }

    /** Get the current joint translation speed
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }

    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }

    /** Set the maximum motor torque
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque for a time step
     *  @return {number} */
    getMotorTorque(time) { return this.box2dJoint.GetMotorTorque(1/time); }

    /** Set the spring frequency in Hertz
     *  @param {number} hz */
    setSpringFrequencyHz(hz) { return this.box2dJoint.SetSpringFrequencyHz(hz); }

    /** Get the spring frequency in Hertz
     *  @return {number} */
    getSpringFrequencyHz() { return this.box2dJoint.GetSpringFrequencyHz(); }

    /** Set the spring damping ratio
     *  @param {number} ratio */
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }

    /** Get the spring damping ratio
     *  @return {number} */
    getSpringDampingRatio() { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Weld Joint
 * - Glues two objects together
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dWeldJoint extends Box2dJoint
{
    /** Create a weld joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2WeldJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_referenceAngle(objectB.body.GetAngle() - objectA.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the reference angle
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { return this.box2dJoint.SetFrequency(hz); }

    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }

    /** Set the damping ratio
     *  @param {number} ratio */
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }

    /** Get the damping ratio
     *  @return {number} */
    getSpringDampingRatio() { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Friction Joint
 * - Used to apply top-down friction
 * - Provides 2D translational friction and angular friction
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dFrictionJoint extends Box2dJoint
{
    /** Create a friction joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2FrictionJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Set the maximum friction force
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }

    /** Get the maximum friction force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum friction torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(torque); }

    /** Get the maximum friction torque
     *  @return {number} */
    getMaxTorque() { return this.box2dJoint.GetMaxTorque(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pulley Joint
 * - Connects to two objects and two fixed ground points
 * - The pulley supports a ratio such that: length1 + ratio * length2 <= constant
 * - The force transmitted is scaled by the ratio
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dPulleyJoint extends Box2dJoint
{
    /** Create a pulley joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} groundAnchorA
     *  @param {Vector2} groundAnchorB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {number}  [ratio]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, groundAnchorA, groundAnchorB, anchorA, anchorB, ratio=1, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2PulleyJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_groundAnchorA(box2d.vec2dTo(groundAnchorA));
        jointDef.set_groundAnchorB(box2d.vec2dTo(groundAnchorB));
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_ratio(ratio);
        jointDef.set_lengthA(groundAnchorA.distance(anchorA));
        jointDef.set_lengthB(groundAnchorB.distance(anchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the first ground anchor
     *  @return {Vector2} */
    getGroundAnchorA() { return box2d.vec2From(this.box2dJoint.GetGroundAnchorA()); }

    /** Get the second ground anchor
     *  @return {Vector2} */
    getGroundAnchorB() { return box2d.vec2From(this.box2dJoint.GetGroundAnchorB()); }

    /** Get the current length of the segment attached to objectA
     *  @return {number} */
    getLengthA() { return this.box2dJoint.GetLengthA(); }

    /** Get the current length of the segment attached to objectB
     *  @return {number} */
    getLengthB(){ return this.box2dJoint.GetLengthB(); }

    /** Get the pulley ratio
     *  @return {number} */
    getRatio() { return this.box2dJoint.GetRatio(); }

    /** Get the current length of the segment attached to objectA
     *  @return {number} */
    getCurrentLengthA() { return this.box2dJoint.GetCurrentLengthA(); }

    /** Get the current length of the segment attached to objectB
     *  @return {number} */
    getCurrentLengthB() { return this.box2dJoint.GetCurrentLengthB(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Motor Joint
 * - Controls the relative motion between two objects
 * - Typical usage is to control the movement of a object with respect to the ground
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dMotorJoint extends Box2dJoint
{
    /** Create a motor joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB */
    constructor(objectA, objectB)
    {
        const linearOffset = objectA.worldToLocal(box2d.vec2From(objectB.body.GetPosition()));
        const angularOffset = objectB.body.GetAngle() - objectA.body.GetAngle();
        const jointDef = new box2d.instance.b2MotorJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_linearOffset(box2d.vec2dTo(linearOffset));
        jointDef.set_angularOffset(angularOffset);
        super(jointDef);
    }

    /** Set the target linear offset, in frame A, in meters.
     *  @param {Vector2} offset */
    setLinearOffset(offset) { this.box2dJoint.SetLinearOffset(box2d.vec2dTo(offset)); }

    /** Get the target linear offset, in frame A, in meters.
     *  @return {Vector2} */
    getLinearOffset() { return box2d.vec2From(this.box2dJoint.GetLinearOffset()); }

    /** Set the target angular offset
     *  @param {number} offset */
    setAngularOffset(offset) { this.box2dJoint.SetAngularOffset(offset); }

    /** Get the target angular offset
     *  @return {number} */
    getAngularOffset() { return this.box2dJoint.GetAngularOffset(); }

    /** Set the maximum friction force
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }

    /** Get the maximum friction force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(torque); }

    /** Get the maximum torque
     *  @return {number} */
    getMaxTorque() { return this.box2dJoint.GetMaxTorque(); }

    /** Set the position correction factor in the range [0,1]
     *  @param {number} factor */
    setCorrectionFactor(factor) { this.box2dJoint.SetCorrectionFactor(factor); }

    /** Get the position correction factor in the range [0,1]
     *  @return {number} */
    getCorrectionFactor() { return this.box2dJoint.GetCorrectionFactor(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Global Object
 * - Wraps Box2d world and provides global functions
 * @memberof Box2D
 */
class Box2dPlugin
{
    /** Create the global UI system object
     *  @param {Object} instance */
    constructor(instance)
    {
        ASSERT(!box2d, 'Box2D already initialized');
        box2d = this;

        /** @property {Object} - The Box2d instance */
        this.instance = instance;
        /** @property {Object} - The Box2d world */
        this.world = new box2d.instance.b2World();
        /** @property {Array<Box2dObject>} - List of all Box2d objects */
        this.objects = [];
        /** @property {number} - Velocity iterations per update*/
        this.velocityIterations = 8;
        /** @property {number} - Position iterations per update*/
        this.positionIterations = 3;
        /** @property {number} - Static, zero mass, zero velocity, may be manually moved */
        this.bodyTypeStatic = instance.b2_staticBody;
        /** @property {number} - Kinematic, zero mass, non-zero velocity set by user, moved by solver */
        this.bodyTypeKinematic = instance.b2_kinematicBody;
        /** @property {number} - Dynamic, positive mass, non-zero velocity determined by forces, moved by solver */
        this.bodyTypeDynamic = instance.b2_dynamicBody;

        // setup contact listener
        const listener = new box2d.instance.JSContactListener();
        listener.BeginContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            // raw user-created b2Bodies may have no .object — skip those
            if (!objectA || !objectB) return;
            objectA.beginContact(objectB);
            objectB.beginContact(objectA);
        }
        listener.EndContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            if (!objectA || !objectB) return;
            objectA.endContact(objectB);
            objectB.endContact(objectA);
        };
        listener.PreSolve  = function() {};
        listener.PostSolve = function() {};
        box2d.world.SetContactListener(listener);
    }

    /** Step the physics world simulation
     *  @param {number} [frames] */
    step(frames=1)
    {
        box2d.world.SetGravity(box2d.vec2dTo(gravity));
        for (let i=frames; i--;)
            box2d.world.Step(timeDelta, this.velocityIterations, this.positionIterations);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // raycasting and querying

    /** raycast and return a list of all the results
     *  @param {Vector2} start 
     *  @param {Vector2} end */
    raycastAll(start, end)
    {
        const raycastCallback = new box2d.instance.JSRayCastCallback();
        raycastCallback.ReportFixture = function(fixturePointer, point, normal, fraction)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            point  = box2d.vec2FromPointer(point);
            normal = box2d.vec2FromPointer(normal);
            raycastResults.push(new Box2dRaycastResult(fixture, point, normal, fraction));
            return 1; // continue getting results
        };

        const raycastResults = [];
        box2d.world.RayCast(raycastCallback, box2d.vec2dTo(start), box2d.vec2dTo(end));
        debugRaycast && debugLine(start, end, raycastResults.length ? '#f00' : '#00f', .02);
        return raycastResults;
    }

    /** raycast and return the first result
     *  @param {Vector2} start 
     *  @param {Vector2} end */
    raycast(start, end)
    {
        const raycastResults = box2d.raycastAll(start, end);
        if (!raycastResults.length)
            return undefined;
        return raycastResults.reduce((a,b)=>a.fraction < b.fraction ? a : b);
    }

    /** box aabb cast and return all the objects
     *  @param {Vector2} pos 
     *  @param {Vector2} size */
    boxCastAll(pos, size)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            const o = fixture.GetBody().object;
            if (!queryObjects.includes(o))
                queryObjects.push(o); // add if not already in list
            return true; // continue getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2d.vec2dTo(pos.add(size.scale(.5))));

        let queryObjects = [];
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObjects.length ? '#f00' : '#00f', .02);
        return queryObjects;
    }

    /** box aabb cast and return the first object
     *  @param {Vector2} pos 
     *  @param {Vector2} size */
    boxCast(pos, size)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            queryObject = fixture.GetBody().object;
            return false; // stop getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2d.vec2dTo(pos.add(size.scale(.5))));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObject ? '#f00' : '#00f', .02);
        return queryObject;
    }

    /** circle cast and return all the objects
     *  @param {Vector2} pos 
     *  @param {number} diameter */
    circleCastAll(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        const results = box2d.boxCastAll(pos, vec2(diameter));
        return results.filter(o=>o.pos.distanceSquared(pos) < radius2);
    }

    /** circle cast and return the first object
     *  @param {Vector2} pos 
     *  @param {number} diameter */
    circleCast(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        let results = box2d.boxCastAll(pos, vec2(diameter));

        let bestResult, bestDistance2;
        for (const result of results)
        {
            const distance2 = result.pos.distanceSquared(pos);
            if (distance2 < radius2 && (!bestResult || distance2 < bestDistance2))
            {
                bestResult = result;
                bestDistance2 = distance2;
            }
        }
        return bestResult;
    }

    /** point cast and return the first object
     *  @param {Vector2} pos 
     *  @param {boolean} dynamicOnly */
    pointCast(pos, dynamicOnly=true)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            if (dynamicOnly && fixture.GetBody().GetType() !== box2d.instance.b2_dynamicBody)
                return true; // continue getting results
            if (!fixture.TestPoint(box2d.vec2dTo(pos)))
                return true; // continue getting results
            queryObject = fixture.GetBody().object;
            return false; // stop getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos));
        aabb.set_upperBound(box2d.vec2dTo(pos));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, vec2(), queryObject ? '#f00' : '#00f', .02);
        return queryObject;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // drawing

    /** draws a fixture
     *  @param {Object} fixture
     *  @param {Vector2} pos
     *  @param {number} angle
     *  @param {Color} [color]
     *  @param {Color} [lineColor]
     *  @param {number} [lineWidth]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixture(fixture, pos, angle, color=WHITE, lineColor=BLACK, lineWidth=.1, useWebGL, context)
    {
        const shape = box2d.castShapeObject(fixture.GetShape());
        switch (shape.GetType())
        {
            case box2d.instance.b2Shape.e_polygon:
            {
                let points = [];
                for (let i=shape.GetVertexCount(); i--;)
                    points.push(box2d.vec2From(shape.GetVertex(i)));
                drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, false, context);
                break;
            }
            case box2d.instance.b2Shape.e_circle:
            {
                const radius = shape.get_m_radius();
                drawCircle(pos, radius*2, color, lineWidth, lineColor, useWebGL, false, context);
                break;
            }
            case box2d.instance.b2Shape.e_edge:
            {
                const v1 = box2d.vec2From(shape.get_m_vertex1());
                const v2 = box2d.vec2From(shape.get_m_vertex2());
                drawLine(v1, v2, lineWidth, lineColor, pos, angle, useWebGL, false, context);
                break;
            }
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    // helper functions

    /** converts a box2d vec2 to a Vector2
     *  @param {Object} v */
    vec2From(v)
    {
        ASSERT(v instanceof box2d.instance.b2Vec2);
        return new Vector2(v.get_x(), v.get_y()); 
    }

    /** converts a box2d vec2 pointer to a Vector2
     *  @param {Object} vp */
    vec2FromPointer(vp)
    {
        const v = box2d.instance.wrapPointer(vp, box2d.instance.b2Vec2);
        return box2d.vec2From(v);
    }

    /** converts a Vector2 to a box2 vec2
     *  @param {Vector2} v */
    vec2dTo(v)
    {
        ASSERT(isVector2(v));
        return new box2d.instance.b2Vec2(v.x, v.y);
    }

    /** checks if a box2d object is null
     *  @param {Object} o */
    isNull(o) { return !box2d.instance.getPointer(o); }

    /** casts a box2d object to a shape type
     *  @param {Object} o */
    castShapeObject(o)
    {
        switch (o.GetType())
        {
            case box2d.instance.b2Shape.e_circle:
                return box2d.instance.castObject(o, box2d.instance.b2CircleShape);
            case box2d.instance.b2Shape.e_edge:
                return box2d.instance.castObject(o, box2d.instance.b2EdgeShape);
            case box2d.instance.b2Shape.e_polygon:
                return box2d.instance.castObject(o, box2d.instance.b2PolygonShape);
            case box2d.instance.b2Shape.e_chain:
                return box2d.instance.castObject(o, box2d.instance.b2ChainShape);
        }
        
        ASSERT(false, 'Unknown box2d object type');
    }

    /** casts a box2d object to a joint type
     *  @param {Object} o */
    castJointObject(o)
    {
        switch (o.GetType())
        {
            case box2d.instance.e_revoluteJoint:
                return box2d.instance.castObject(o, box2d.instance.b2RevoluteJoint);
            case box2d.instance.e_prismaticJoint:
                return box2d.instance.castObject(o, box2d.instance.b2PrismaticJoint);
            case box2d.instance.e_distanceJoint:
                return box2d.instance.castObject(o, box2d.instance.b2DistanceJoint);
            case box2d.instance.e_pulleyJoint:
                return box2d.instance.castObject(o, box2d.instance.b2PulleyJoint);
            case box2d.instance.e_mouseJoint:
                return box2d.instance.castObject(o, box2d.instance.b2MouseJoint);
            case box2d.instance.e_gearJoint:
                return box2d.instance.castObject(o, box2d.instance.b2GearJoint);
            case box2d.instance.e_wheelJoint:
                return box2d.instance.castObject(o, box2d.instance.b2WheelJoint);
            case box2d.instance.e_weldJoint:
                return box2d.instance.castObject(o, box2d.instance.b2WeldJoint);
            case box2d.instance.e_frictionJoint:
                return box2d.instance.castObject(o, box2d.instance.b2FrictionJoint);
            case box2d.instance.e_ropeJoint:
                return box2d.instance.castObject(o, box2d.instance.b2RopeJoint);
            case box2d.instance.e_motorJoint:
                return box2d.instance.castObject(o, box2d.instance.b2MotorJoint);
        }
        
        ASSERT(false, 'Unknown box2d object type');
    }
}

///////////////////////////////////////////////////////////////////////////////
/** Box2d Init - Call with await to init box2d
 *  @example
 *  await box2dInit();
 *  @return {Promise<Box2dPlugin>}
 *  @memberof Box2D */
async function box2dInit()
{
    // load box2d
    new Box2dPlugin(await Box2D());
    setupDebugDraw();
    engineAddPlugin(box2dUpdate, box2dRender);
    return box2d;

    // add the box2d plugin to the engine
    function box2dUpdate()
    {
        if (paused)
            return;

        box2d.step();

        // remove destroyed objects
        box2d.objects = box2d.objects.filter(o=>!o.destroyed);
        
        // copy box2d physics results to engine objects
        for (const o of box2d.objects)
        {
            if (o.body)
            {
                // box2d uses reverse angle
                o.pos = box2d.vec2From(o.body.GetPosition());
                o.angle = -o.body.GetAngle();
            }
        }
    }
    function box2dRender()
    {
        if (box2dDebug || debugPhysics)
            box2d.world.DrawDebugData();
    }
    
    // box2d debug drawing
    function setupDebugDraw()
    {
        // setup debug draw
        const debugLineWidth = .1;
        const debugDraw = new box2d.instance.JSDraw();
        const box2dColor = (c)=> new Color(c.get_r(), c.get_g(), c.get_b());
        const box2dColorPointer = (c)=>
            box2dColor(box2d.instance.wrapPointer(c, box2d.instance.b2Color));
        const getDebugColor = (color)=>box2dColorPointer(color).scale(1,.8);
        const getPointsList = (vertices, vertexCount)=>
        {
            const points = [];
            for (let i=vertexCount; i--;)
                points.push(box2d.vec2FromPointer(vertices+i*8));
            return points;
        }
        debugDraw.DrawSegment = function(point1, point2, color)
        {
            color = getDebugColor(color);
            point1 = box2d.vec2FromPointer(point1);
            point2 = box2d.vec2FromPointer(point2);
            drawLine(point1, point2, debugLineWidth, color, vec2(), 0, false);
        };
        debugDraw.DrawPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, CLEAR_WHITE, debugLineWidth, color, vec2(), 0, false);
        };
        debugDraw.DrawSolidPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, color, 0, color, vec2(), 0, false);
        };
        debugDraw.DrawCircle = function(center, radius, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            drawCircle(center, radius*2, CLEAR_WHITE, debugLineWidth, color, false);
        };
        debugDraw.DrawSolidCircle = function(center, radius, axis, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            axis = box2d.vec2FromPointer(axis).scale(radius);
            drawCircle(center, radius*2, color, debugLineWidth, color, false);
            drawLine(vec2(), axis, debugLineWidth, color, center, 0, false);
        };
        debugDraw.DrawTransform = function(transform)
        {
            transform = box2d.instance.wrapPointer(transform, box2d.instance.b2Transform);
            const pos = box2d.vec2From(transform.get_p());
            const angle = -transform.get_q().GetAngle();
            const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8);
            const p2 = vec2(0,1), c2 = rgb(0,.75,0,.8);
            drawLine(vec2(), p1, debugLineWidth, c1, pos, angle, false);
            drawLine(vec2(), p2, debugLineWidth, c2, pos, angle, false);
        }
            
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_shapeBit);
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_jointBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_aabbBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_pairBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_centerOfMassBit);
        box2d.world.SetDebugDraw(debugDraw);
    }
}
/**
 * LittleJS Drawing Utilities Plugin
 * - Extra drawing functions for LittleJS
 * - Nine slice and three slice drawing
 * @namespace DrawUtilities
 */

///////////////////////////////////////////////////////////////////////////////

/** Draw a scalable nine-slice UI element to the main canvas in screen space
 *  This function can not apply color because it draws using the 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Top-left tile of the 3x3 block to sample (see drawNineSlice)
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawNineSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true);
}

/** Draw a scalable nine-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  The nine-slice samples a 3x3 block of tiles from the tilesheet, it does not
 *  subdivide a single tile. Pass the top-left tile of that block as startTile;
 *  the other 8 tiles (edges, corners, and center) are taken automatically from
 *  the 3x3 grid of tiles extending right and down from it. borderSize only sets
 *  the rendered thickness of the edges and corners, not how the texture is cut.
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Top-left tile of the 3x3 block to sample the nine-slice from
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup nine slice tiles - startTile is the top-left of a 3x3 tile block,
    // so the center tile is one tile down and right from it
    const centerTile = startTile.offset(startTile.size);
    const centerSize = size.add(vec2(extraSpace-borderSize*2));
    const cornerSize = vec2(borderSize);
    const cornerOffset = size.scale(.5).subtract(cornerSize.scale(.5));
    const flip = screenSpace ? -1 : 1;
    const rotateAngle = screenSpace ? -angle : angle;

    // center
    drawTile(pos, centerSize, centerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    for (let i=4; i--;)
    {
        // sides
        const horizontal = i%2;
        const sidePos = cornerOffset.multiply(vec2(horizontal?i===1?1:-1:0, horizontal?0:i?-1:1));
        const sideSize = vec2(horizontal ? borderSize : centerSize.x, horizontal ? centerSize.y : borderSize);
        const sideTile = centerTile.offset(startTile.size.multiply(vec2(i===1?1:i===3?-1:0,i===0?-flip:i===2?flip:0)))
        drawTile(pos.add(sidePos.rotate(rotateAngle)), sideSize, sideTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
    for (let i=4; i--;)
    {
        // corners
        const flipX = i>1;
        const flipY = i && i<3;
        const cornerPos = cornerOffset.multiply(vec2(flipX?-1:1, flipY?-1:1));
        const cornerTile = centerTile.offset(startTile.size.multiply(vec2(flipX?-1:1,flipY?flip:-flip)));
        drawTile(pos.add(cornerPos.rotate(rotateAngle)), cornerSize, cornerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
}

/** Draw a scalable three-slice UI element to the main canvas in screen space
 *  This function can not apply color because it draws using the 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - First of 3 consecutive tiles: corner, side, center (see drawThreeSlice)
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawThreeSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true);
}

/** Draw a scalable three-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  The three-slice samples 3 consecutive tiles from the tilesheet, it does not
 *  subdivide a single tile. Pass the first tile as startTile; the three tiles
 *  are used in order as corner, side, and center, then rotated and mirrored to
 *  build all four edges and corners. borderSize only sets the rendered thickness.
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - First of 3 consecutive tiles (corner, side, center) for the three-slice
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup three slice tiles - 3 tiles in a row starting at startTile
    const cornerTile = startTile.frame(0);
    const sideTile   = startTile.frame(1);
    const centerTile = startTile.frame(2);
    const centerSize = size.add(vec2(extraSpace-borderSize*2));
    const cornerSize = vec2(borderSize);
    const cornerOffset = size.scale(.5).subtract(cornerSize.scale(.5));
    const flip = screenSpace ? -1 : 1;
    const rotateAngle = screenSpace ? -angle : angle;

    // center
    drawTile(pos, centerSize, centerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    for (let i=4; i--;)
    {
        // sides
        const a = angle + i*PI/2;
        const horizontal = i%2;
        const sidePos = cornerOffset.multiply(vec2(horizontal?i===1?1:-1:0, horizontal?0:i?-flip:flip));
        const sideSize = vec2(horizontal ? centerSize.y : centerSize.x, borderSize);
        drawTile(pos.add(sidePos.rotate(rotateAngle)), sideSize, sideTile, color, a, false, additiveColor, useWebGL, screenSpace, context);
    }
    for (let i=4; i--;)
    {
        // corners
        const a = angle + i*PI/2;
        const flipX = !i || i>2;
        const flipY = i>1;
        const cornerPos = cornerOffset.multiply(vec2(flipX?-1:1, flipY?-flip:flip));
        drawTile(pos.add(cornerPos.rotate(rotateAngle)), cornerSize, cornerTile, color, a, false, additiveColor, useWebGL, screenSpace, context);
    }
}

/** Draw a crescent / moon-phase shape built from a polygon
 *  Routes through drawPoly, so it supports WebGL, screen space, color, and outlines
 *  @param {Vector2} pos - Center position
 *  @param {number}  [size] - Diameter
 *  @param {number}  [percent] - Moon phase over a full cycle (0=new, .25=first quarter, .5=full, .75=last quarter), wraps
 *  @param {Color}   [color] - Fill color
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [invert] - Flip which side is illuminated
 *  @param {number}  [lineWidth] - Outline width, 0 for no outline
 *  @param {Color}   [lineColor] - Outline color
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawCrescent(pos, size=1, percent=0, color=WHITE, angle=0, invert=false, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    // build local-space points and let drawPoly apply pos/angle so screen space works
    const points = getCrescentPoints(vec2(), size, percent, 0, invert);
    drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, screenSpace, context);
}

/** Get the list of points that make up a crescent / moon-phase shape
 *  Returns world-space points with pos and angle baked in, ready for drawPoly or other use
 *  @param {Vector2} pos - Center position
 *  @param {number}  [size] - Diameter
 *  @param {number}  [percent] - Moon phase over a full cycle (0=new, .25=first quarter, .5=full, .75=last quarter), wraps
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [invert] - Flip which side is illuminated
 *  @param {number}  [sides=glCircleSides] - Number of sides for a full circle (halved per arc)
 *  @return {Array<Vector2>} - List of points making up the crescent
 *  @memberof DrawUtilities */
function getCrescentPoints(pos, size=1, percent=0, angle=0, invert=false, sides=glCircleSides)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size) && isNumber(percent), 'size and percent must be numbers');

    // map phase to a signed terminator curve: -1 new, 0 half, 1 full
    let p = mod(percent*4, 4); // quarter phase 0..4
    if (p >= 2)                // second half of cycle flips orientation
        angle += PI;
    p = p <= 2 ? p-1 : 3-p;
    if (invert)                // flip the illuminated side
    {
        p = -p;
        angle += PI;
    }

    // build the crescent: outer semicircle, then inner half-ellipse traced back
    const points = [];
    const segs = max(3, sides>>1);
    const radius = size/2;
    for (let i=0; i<=segs; i++)
    {
        const t = i/segs*PI;
        points.push(vec2(radius*cos(t), radius*sin(t)).rotate(angle).add(pos));
    }
    for (let i=segs; i>=0; i--)
    {
        const t = i/segs*PI;
        points.push(vec2(radius*cos(t), -radius*p*sin(t)).rotate(angle).add(pos));
    }
    return points;
}
/**
 * LittleJS Texture Sheet Plugin
 * - Packs images into texture sheets as they are loaded
 * - Sprites are placed automatically, callers get a TileInfo
 * - Sheets are created and filled as needed
 * - Sheets fill in call order, images decode in parallel
 * - Animation frames keep layout and wrap across rows as needed
 * - WebGL textures upload once per batch of loads
 * - loadAtlas imports pre-packed atlases (TexturePacker and Aseprite json)
 * @namespace TextureSheets
 */

/** Width and height in pixels of texture sheets created by loadSprite
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetSize = 2048;

/** Default padding pixels around each frame packed by loadSprite
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetPadding = 1;

/** Array of texture sheets created by loadSprite
 *  @type {Array<TextureSheet>}
 *  @memberof TextureSheets */
let textureSheets = [];

// pending loads pack through a queue so sheets fill in call order
let textureSheetQueue = Promise.resolve();
let textureSheetPendingCount = 0;

/**
 * Texture Sheet - A texture that images are packed into as they load
 * Uses shelf packing, images are placed left to right then wrap to a new row
 * @memberof TextureSheets
 */
class TextureSheet
{
    /** Create a texture sheet, called automatically by loadSprite
     *  @param {number} [size] - Width and height of the sheet in pixels */
    constructor(size=textureSheetSize)
    {
        ASSERT(size > 0, 'texture sheet size must be positive');

        /** @property {number} - Width and height of the sheet in pixels */
        this.size = size;
        /** @property {OffscreenCanvasRenderingContext2D} - 2d context for the canvas */
        this.context = headlessMode ? undefined : createCanvasContext(size);
        /** @property {OffscreenCanvas} - Canvas holding the packed images */
        this.canvas = this.context?.canvas;
        /** @property {TextureInfo} - The texture info for this sheet */
        this.textureInfo = new TextureInfo(this.canvas);
        /** @property {Vector2} - Where the next image will be packed */
        this.cursor = vec2();
        /** @property {number} - Height of the row being packed */
        this.rowHeight = 0;
        /** @property {boolean} - Has the canvas changed since the last webgl upload? */
        this.glDirty = false;

        if (headlessMode)
        {
            // tiles still need bounds when there is no canvas to measure
            this.textureInfo.size = vec2(size);
            this.textureInfo.sizeInverse = vec2(1/size);
        }
    }

    /** Find a spot for an image on this sheet without drawing it
     *  @param {Vector2} imageSize - Size of the source image in pixels
     *  @param {Vector2} [frameSize] - Size of each frame, or the whole image if not passed
     *  @param {number} [padding] - How many pixels padding around each frame
     *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image
     *  @return {TileInfo} Tile for the packed image, or undefined if the sheet is full */
    tryAdd(imageSize, frameSize=imageSize, padding=textureSheetPadding, sourcePadding=0)
    {
        ASSERT(isVector2(imageSize) && isVector2(frameSize), 'sizes must be vec2');
        ASSERT(frameSize.x > 0 && frameSize.y > 0, 'frame size must be positive');

        if (isNumber(sourcePadding))
            sourcePadding = vec2(sourcePadding);
        ASSERT(isVector2(sourcePadding) && sourcePadding.x >= 0 && sourcePadding.y >= 0,
            'sourcePadding must be a number or vec2 >= 0');

        // the source may have its own padding baked in around each frame
        const sourceCellWidth = frameSize.x + sourcePadding.x*2;
        const sourceCellHeight = frameSize.y + sourcePadding.y*2;
        ASSERT(imageSize.x % sourceCellWidth === 0 && imageSize.y % sourceCellHeight === 0,
            'image size must be a multiple of the padded frame size');

        const cellWidth = frameSize.x + padding*2;
        const cellHeight = frameSize.y + padding*2;
        const maxColumns = this.size / cellWidth | 0;
        ASSERT(maxColumns > 0, 'frame is too wide to fit on a texture sheet');

        // keep the layout of the source image, but narrow it if a row is too wide
        // frames wrap down to the next row, which TileInfo.frame handles via columns
        const sourceColumns = imageSize.x / sourceCellWidth;
        const frameCount = sourceColumns * (imageSize.y / sourceCellHeight);
        const columns = min(sourceColumns, maxColumns);
        const blockWidth = columns * cellWidth;
        const blockHeight = ceil(frameCount / columns) * cellHeight;

        // probe the placement using locals so a failed try leaves the sheet unchanged
        let x = this.cursor.x, y = this.cursor.y, rowHeight = this.rowHeight;
        if (x + blockWidth > this.size)
        {
            // start a new row if this one does not have enough space left
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }

        // out of space, the caller needs to use a different sheet
        if (y + blockHeight > this.size)
            return undefined;

        // commit the placement, tile pos points inside the padding to match how tile() works
        this.cursor.x = x + blockWidth;
        this.cursor.y = y;
        this.rowHeight = max(rowHeight, blockHeight);
        return new TileInfo(vec2(x + padding, y + padding), frameSize, this.textureInfo, padding, 0, columns);
    }

    /** Draw an image into this sheet at a tile returned by tryAdd
     *  @param {HTMLImageElement} image - Source image to copy from
     *  @param {TileInfo} tileInfo - Where to put it, from tryAdd
     *  @param {boolean} [update] - Upload to webgl now, pass false when batching
     *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image */
    drawImage(image, tileInfo, update=true, sourcePadding=0)
    {
        ASSERT(!!this.context, 'texture sheet has no canvas');

        if (isNumber(sourcePadding))
            sourcePadding = vec2(sourcePadding);

        // copy frames in order, reading the source left to right, top to bottom
        // the destination wraps at tileInfo.columns which may be narrower than the source
        const frameSize = tileInfo.size;
        const sourceCellWidth = frameSize.x + sourcePadding.x*2;
        const sourceCellHeight = frameSize.y + sourcePadding.y*2;
        const sourceColumns = image.width / sourceCellWidth;
        const frameCount = sourceColumns * (image.height / sourceCellHeight);
        const columns = tileInfo.columns || frameCount;
        const cellWidth = frameSize.x + tileInfo.padding*2;
        const cellHeight = frameSize.y + tileInfo.padding*2;
        for (let i = frameCount; i--;)
        {
            const sourceX = (i % sourceColumns) * sourceCellWidth + sourcePadding.x;
            const sourceY = (i / sourceColumns | 0) * sourceCellHeight + sourcePadding.y;
            this.context.drawImage(image,
                sourceX, sourceY, frameSize.x, frameSize.y,
                tileInfo.pos.x + (i % columns) * cellWidth,
                tileInfo.pos.y + (i / columns | 0) * cellHeight,
                frameSize.x, frameSize.y);
        }

        // upload now unless the caller is batching more images
        this.glDirty = true;
        update && this.updateTexture();
    }

    /** Upload the canvas to webgl if it has changed since the last upload
     *  Only needed after batching, drawImage uploads automatically by default */
    updateTexture()
    {
        if (!this.glDirty) return;
        this.glDirty = false;
        this.textureInfo.createWebGLTexture();
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Load an image and pack it into a texture sheet
 *  - Returns a TileInfo immediately which is filled in when the image loads
 *  - Nothing is visible until it loads, use spritesReady to wait for it
 *  - Pass frameSize for animations, then step through them with TileInfo.frame
 *  - Grid images keep their layout and frames wrap down to the next row
 *  - Pass sourcePadding if the source image has padding baked in around frames
 *  @param {string} src - Image source path
 *  @param {Vector2|number} [frameSize] - Size of each animation frame in pixels
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image
 *  @return {TileInfo}
 *  @example
 *  const playerTile = loadSprite('player.png');     // a single sprite
 *  const runTile = loadSprite('run.png', vec2(16)); // a 16x16 frame animation
 *  @memberof TextureSheets */
function loadSprite(src, frameSize, padding=textureSheetPadding, sourcePadding=0)
{
    ASSERT(isStringLike(src), 'image src must be a string');
    ASSERT(!frameSize || isVector2(frameSize) || isNumber(frameSize), 'frameSize must be a vec2 or number');
    ASSERT(isNumber(padding), 'padding must be a number');
    ASSERT(isNumber(sourcePadding) || isVector2(sourcePadding), 'sourcePadding must be a number or vec2');

    if (isNumber(frameSize))
        frameSize = vec2(frameSize);

    // start with an empty tile that gets filled in when the image loads
    const tileInfo = new TileInfo(vec2(), vec2(), undefined, padding, 0);
    if (headlessMode) return tileInfo;

    // point at a sheet right away so drawing before it loads picks up empty pixels
    tileInfo.textureInfo = (textureSheets[0] || textureSheetCreate()).textureInfo;

    // start decoding right away, images decode in parallel
    const image = new Image;
    const imagePromise = new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = src;
    });

    // pack through a queue so sheets fill in call order, not decode order
    ++textureSheetPendingCount;
    textureSheetQueue = textureSheetQueue.then(async ()=>
    {
        await imagePromise;
        if (image.width)
        {
            // pack onto a sheet, then fill in the tile that was already handed out,
            // copying every field so nothing is missed if TileInfo gains more of them
            const imageSize = vec2(image.width, image.height);
            const {sheet, tile} = textureSheetAdd(imageSize, frameSize, padding, sourcePadding);
            Object.assign(tileInfo, tile);
            sheet.drawImage(image, tileInfo, false, sourcePadding); // upload once per batch below
        }
        else
        {
            // leave the tile empty if the image failed to load
            LOG('loadSprite failed to load image:', src);
        }

        // upload to webgl once per batch, when the last pending load finishes
        if (!--textureSheetPendingCount)
            textureSheets.forEach(s=> s.updateTexture());
    });

    return tileInfo;
}

/** Load a pre-packed texture atlas and repack it onto texture sheets
 *  - Supports TexturePacker json (hash and array) and Aseprite json
 *  - Returns an empty object which is filled with TileInfos when loaded
 *  - Frames are named by the json, animations are grouped automatically
 *  - Aseprite frame tags become animations, so do names like run_0, run_1
 *  - Trimmed frames are restored to their full source size when packed
 *  - Rotated frames are rotated back upright when packed
 *  @param {string} imageSrc - Atlas image path
 *  @param {string|Object} jsonSrc - Atlas json path, or already parsed json data
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @return {Object} Object mapping frame and animation names to TileInfos
 *  @example
 *  const atlas = loadAtlas('sprites.png', 'sprites.json');
 *  await spritesReady();
 *  drawTile(pos, size, atlas.player);          // a single frame
 *  drawTile(pos, size, atlas.run.frame(2));    // frame 2 of the run animation
 *  @memberof TextureSheets */
function loadAtlas(imageSrc, jsonSrc, padding=textureSheetPadding)
{
    ASSERT(isStringLike(imageSrc), 'atlas image src must be a string');
    ASSERT(isStringLike(jsonSrc) || typeof jsonSrc === 'object', 'atlas json must be a path or object');
    ASSERT(isNumber(padding), 'padding must be a number');

    const atlas = {};
    if (headlessMode) return atlas;

    // start fetching the json and decoding the image right away, in parallel
    const jsonPromise = typeof jsonSrc === 'object' ? Promise.resolve(jsonSrc) :
        fetch(jsonSrc).then(r=> r.ok && r.json()).catch(()=> undefined);
    const image = new Image;
    const imagePromise = new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = imageSrc;
    });

    // pack through a queue so sheets fill in call order, not decode order
    ++textureSheetPendingCount;
    textureSheetQueue = textureSheetQueue.then(async ()=>
    {
        const data = await jsonPromise;
        await imagePromise;
        if (image.width && data)
        {
            for (const group of parseAtlas(data))
            {
                // reserve a block of full size cells, one per frame
                const sourceSize = group.frames[0].sourceSize;
                const blockSize = vec2(sourceSize.x*group.frames.length, sourceSize.y);
                const {sheet, tile} = textureSheetAdd(blockSize, sourceSize, padding);

                // draw each frame untrimmed into its cell
                const context = sheet.context;
                const cellWidth = sourceSize.x + padding*2;
                const cellHeight = sourceSize.y + padding*2;
                group.frames.forEach((f, i)=>
                {
                    const x = tile.pos.x + (i % tile.columns)*cellWidth + f.offset.x;
                    const y = tile.pos.y + (i / tile.columns |0)*cellHeight + f.offset.y;
                    if (f.rotated)
                    {
                        // stored rotated 90 degrees clockwise, draw it back upright
                        context.save();
                        context.translate(x, y);
                        context.rotate(-PI/2);
                        context.drawImage(image, f.pos.x, f.pos.y, f.size.y, f.size.x,
                            -f.size.y, 0, f.size.y, f.size.x);
                        context.restore();
                    }
                    else
                        context.drawImage(image, f.pos.x, f.pos.y, f.size.x, f.size.y,
                            x, y, f.size.x, f.size.y);
                });
                sheet.glDirty = true;
                atlas[group.name] = tile;
            }
        }
        else
        {
            // leave the atlas empty if either file failed to load
            LOG('loadAtlas failed to load:', imageSrc, jsonSrc);
        }

        // upload to webgl once per batch, when the last pending load finishes
        if (!--textureSheetPendingCount)
            textureSheets.forEach(s=> s.updateTexture());
    });

    return atlas;
}

/** Parse atlas json into a list of named frame groups, used by loadAtlas
 *  - Accepts TexturePacker json (hash and array) and Aseprite json
 *  - Frames tagged in Aseprite or named like run_0, run_1 group into animations
 *  @param {Object} data - Parsed atlas json data
 *  @return {Array<Object>} List of {name, frames} groups in atlas order
 *  @memberof TextureSheets */
function parseAtlas(data)
{
    ASSERT(!!data?.frames, 'unrecognized atlas format, expected TexturePacker or Aseprite json');

    // normalize both hash and array frame layouts into a single list
    const frames = (isArray(data.frames) ?
        data.frames.map(f=> [f.filename, f]) : Object.entries(data.frames))
        .map(([name, f])=> ({
            name: name.replace(/\.[^.\\/]+$/, ''), // strip file extension
            pos:        vec2(f.frame.x, f.frame.y),
            size:       vec2(f.frame.w, f.frame.h),
            offset:     vec2(f.spriteSourceSize?.x ?? 0, f.spriteSourceSize?.y ?? 0),
            sourceSize: vec2(f.sourceSize?.w ?? f.frame.w, f.sourceSize?.h ?? f.frame.h),
            rotated:    !!f.rotated,
        }));

    const groups = [];
    const tags = data.meta?.frameTags;
    if (tags?.length)
    {
        // aseprite tags are authoritative, untagged frames stay individual
        const tagged = new Set;
        for (const tag of tags)
        {
            groups.push({name: tag.name, frames: frames.slice(tag.from, tag.to + 1)});
            for (let i = tag.from; i <= tag.to; ++i)
                tagged.add(i);
        }
        frames.forEach((f, i)=> tagged.has(i) || groups.push({name: f.name, frames: [f]}));
        return groups;
    }

    // group frames that share a name stem with contiguous trailing numbers
    // run_0.png and run_1.png become a 2 frame animation named run
    const stems = new Map;
    for (const f of frames)
    {
        let match = f.name.match(/^(.+?)([-_ ])?(\d+)$/);
        if (match && !match[2] && /\d$/.test(match[1]))
            match = undefined; // all digit tails like 10 are a name, not frame 0 of 1
        const stem = match ? match[1] : f.name;
        f.groupIndex = match ? Number(match[3]) : undefined;
        stems.has(stem) || stems.set(stem, []);
        stems.get(stem).push(f);
    }
    for (const [stem, list] of stems)
    {
        // only group 2 or more frames with contiguous indices and matching sizes
        list.sort((a, b)=> a.groupIndex - b.groupIndex);
        const grouped = list.length > 1 &&
            list.every((f, i)=> f.groupIndex === list[0].groupIndex + i) &&
            list.every(f=> f.sourceSize.x === list[0].sourceSize.x &&
                           f.sourceSize.y === list[0].sourceSize.y);
        if (grouped)
            groups.push({name: stem, frames: list});
        else
            list.forEach(f=> groups.push({name: f.name, frames: [f]}));
    }
    return groups;
}

/** Wait for everything started by loadSprite and loadAtlas to finish packing
 *  @return {Promise}
 *  @example
 *  async function gameInit()
 *  {
 *      playerTile = loadSprite('player.png');
 *      runTile = loadSprite('run.png', vec2(16));
 *      await spritesReady();
 *  }
 *  @memberof TextureSheets */
async function spritesReady()
{
    // keep waiting until the queue drains, more sprites may load while waiting
    while (textureSheetPendingCount)
        await textureSheetQueue;
}

// create a new texture sheet and add it to the list
function textureSheetCreate()
{
    const sheet = new TextureSheet;
    textureSheets.push(sheet);
    return sheet;
}

// use the first sheet with enough space, or make a new one
function textureSheetAdd(imageSize, frameSize, padding, sourcePadding)
{
    let sheet, tile;
    for (sheet of textureSheets)
        if (tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding))
            break;
    if (!tile)
    {
        sheet = textureSheetCreate();
        tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding);
        ASSERT(!!tile, 'image is too large to fit on a texture sheet');
    }
    return {sheet, tile};
}

///////////////////////////////////////////////////////////////////////////////
// Texture sheet setting setters

/** Set width and height in pixels of texture sheets created by loadSprite
 *  @param {number} size
 *  @memberof Settings */
function setTextureSheetSize(size) { textureSheetSize = size; }

/** Set default padding pixels around each frame packed by loadSprite
 *  @param {number} padding
 *  @memberof Settings */
function setTextureSheetPadding(padding) { textureSheetPadding = padding; }

/**
 * LittleJS Tween System Plugin
 * - Lightweight tweens for numbers, Vector2, Color, or any .lerp-able type
 * - Chainable easing, looping, and ping-pong
 * - Property-path helper for the common case of animating an object field
 * - Auto-updates via engineAddPlugin; pauses with the game by default
 * @namespace TweenSystem
 */

///////////////////////////////////////////////////////////////////////////////

// Module-private list of tweens currently running.
const tweenActive = [];

// Time tracking for delta computation between engine plugin calls.
let lastTime = 0;
let lastTimeReal = 0;

// True if the value is an instance of a class that exposes a numeric-percent
// `lerp(other, percent)` method (Vector2, Color, or any future class).
function isLerpable(v) { return v && typeof v.lerp === 'function'; }

///////////////////////////////////////////////////////////////////////////////

/** A numeric tween: drives a callback with a value interpolated between
 *  `start` and `end` over `duration` seconds. Pauses with the game by default.
 *  @memberof TweenSystem
 *  @example
 *  // Animate a fade-out over 2 seconds with an ease-out sine curve.
 *  new Tween((v) => obj.alpha = v, 1, 0, 2, { ease: Ease.OUT(Ease.SINE) });
 */
class Tween
{
    /** Create a new tween. The callback fires immediately with `start` so the
     *  target snaps to the start value on the same frame the tween is created.
     *
     *  `start` and `end` may be numbers, Vector2 instances, Color instances, or
     *  any object exposing a `lerp(other, percent) => sameType` method. The
     *  callback receives the interpolated value (a number, or a fresh instance
     *  for lerp-able types). Both endpoints must be the same type.
     *  @param {function((number|Vector2|Color)):void} callback - Called with the interpolated value each frame
     *  @param {number|Vector2|Color} [start=0] - Starting value
     *  @param {number|Vector2|Color} [end=1] - Ending value
     *  @param {number} [duration=1] - Duration in seconds
     *  @param {Object} [options]
     *  @param {function(number):number} [options.ease] - Easing function (defaults to LINEAR)
     *  @param {boolean} [options.useRealTime=false] - Advance even when the game is paused (matches Timer's useRealTime)
     *  @param {boolean} [options.paused=false] - Start in paused state */
    constructor(callback, start = 0, end = 1, duration = 1, options = {})
    {
        ASSERT(typeof callback === 'function', 'Tween callback must be a function');
        if (isLerpable(start))
        {
            ASSERT(start.constructor === end.constructor,
                'Tween start and end must be the same type');
        }
        else
        {
            ASSERT(isNumber(start), 'Tween start must be a number or have a .lerp method');
            ASSERT(isNumber(end),   'Tween end must be a number when start is a number');
        }
        ASSERT(isNumber(duration) && duration > 0, 'Tween duration must be > 0');

        /** @property {function((number|Vector2|Color)):void} - Called with the interpolated value each frame */
        this.callback = callback;
        /** @property {number|Vector2|Color} - Starting value */
        this.start = start;
        /** @property {number|Vector2|Color} - Ending value */
        this.end = end;
        /** @property {number} - Total duration in seconds */
        this.duration = duration;
        /** @property {number} - Remaining time in seconds (counts down from duration to 0) */
        this.life = duration;
        /** @property {function(number):number} - Easing curve mapping [0,1] -> [0,1] */
        this.ease = options.ease || Ease.LINEAR;
        /** @property {boolean} - If true, advance even when the game is paused */
        this.useRealTime = !!options.useRealTime;
        /** @property {boolean} - If true, stop advancing until cleared */
        this.paused = !!options.paused;

        /** Completion callback set by then(), loop(), pingPong().
         *  @private */
        this.thenCallback = undefined;
        /** Remaining iterations including the current run (loop/pingPong only).
         *  @private */
        this.loopRemaining = 0;

        tweenActive.push(this);
        // Snap target to start immediately.
        callback(this.interp(duration));
    }

    /** Set the easing curve and return this for chaining.
     *  @param {function(number):number} easeFn
     *  @returns {Tween}
     *  @memberof TweenSystem */
    setEase(easeFn)
    {
        this.ease = easeFn;
        return this;
    }

    /** Set a single completion callback. Calling `then` again replaces the
     *  previous callback. Returns this for chaining.
     *
     *  Calling `then` after `loop` or `pingPong` overrides the loop chain
     *  (last call wins).
     *  @param {function():void} callback
     *  @returns {Tween}
     *  @memberof TweenSystem */
    then(callback)
    {
        this.thenCallback = callback;
        this.loopRemaining = 0;
        return this;
    }

    /** Repeat this tween `n` total times. After each iteration finishes, a
     *  fresh tween with the same parameters takes over via the `then` slot.
     *  `loop()` with no argument loops forever.
     *
     *  Mutually exclusive with `pingPong`; calling either replaces the other,
     *  and calling `then` after either clears the loop (last call wins).
     *  @param {number} [count=Infinity]
     *  @returns {Tween}
     *  @memberof TweenSystem */
    loop(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => loopContinuation(this);
        return this;
    }

    /** Like `loop`, but swap `start` and `end` between iterations so the value
     *  bounces back and forth. `pingPong()` with no argument bounces forever.
     *
     *  Mutually exclusive with `loop`; calling either replaces the other, and
     *  calling `then` after either clears the loop (last call wins).
     *  @param {number} [count=Infinity]
     *  @returns {Tween}
     *  @memberof TweenSystem */
    pingPong(count = Infinity)
    {
        this.loopRemaining = count;
        this.thenCallback = () => pingPongContinuation(this);
        return this;
    }

    /** Pause this tween. While paused, tweenUpdate skips it.
     *  @memberof TweenSystem */
    pause() { this.paused = true; }

    /** Resume a paused tween.
     *  @memberof TweenSystem */
    resume() { this.paused = false; }

    /** Reset this tween to the start: life back to duration, pause cleared,
     *  re-added to the active list if previously stopped, and the callback
     *  re-fired with the start value.
     *  @memberof TweenSystem */
    restart()
    {
        this.life = this.duration;
        this.paused = false;
        if (tweenActive.indexOf(this) < 0) tweenActive.push(this);
        this.callback(this.interp(this.duration));
    }

    /** True if this tween is in the active list and not paused.
     *  @returns {boolean}
     *  @memberof TweenSystem */
    isActive()
    {
        return !this.paused && tweenActive.indexOf(this) >= 0;
    }

    /** Get how far this tween has progressed, from 0 (just started) to 1
     *  (completed). Clamped — overshoot past completion still reads 1.
     *  @returns {number}
     *  @memberof TweenSystem */
    getPercent()
    {
        return percent(this.duration - this.life, 0, this.duration);
    }

    /** Get the current interpolated value (the value most recently passed to
     *  the callback). Returns a number, Vector2, or Color depending on the
     *  tween's start/end types.
     *  @returns {number|Vector2|Color}
     *  @memberof TweenSystem */
    getValue()
    {
        return this.interp(this.life);
    }

    /** Compute the interpolated value at the given remaining `life`.
     *  At life === duration the result is `start`; at life === 0 it is `end`.
     *  @param {number} life
     *  @returns {number}
     *  @memberof TweenSystem */
    interp(life)
    {
        const x = this.ease((this.duration - life) / this.duration);
        if (isLerpable(this.start))
            return this.start.lerp(this.end, x);
        return this.start + (this.end - this.start) * x;
    }

    /** Remove this tween from the active list and prevent any pending then-callback.
     *  @memberof TweenSystem */
    stop()
    {
        const i = tweenActive.indexOf(this);
        if (i >= 0) tweenActive.splice(i, 1);
        this.thenCallback = undefined;
    }
}

/** Library of named easing curves and direction modifiers.
 *  All curves accept `x` in [0,1] and return [0,1] (with possible overshoot
 *  for ELASTIC/BACK/SPRING/BOUNCE). Curves are values you pass to `setEase`
 *  or compose via the IN/OUT/IN_OUT/PIECEWISE/BEZIER modifiers.
 *  @memberof TweenSystem
 *  @example
 *  // Use a basic curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.SINE);
 *  // Use a modifier on a curve
 *  new Tween(callback, 0, 10, 1).setEase(Ease.OUT(Ease.BACK));
 */
const Ease =
{
    /** Linear (identity) curve.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    LINEAR: (x) => x,

    /** Power curve factory: `Ease.POWER(n)` returns `x => x**n`.
     *  Use n=2 for quadratic, n=3 for cubic, etc.
     *  @param {number} n
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    POWER: (n) => (x) => x ** n,

    /** Sine ease-in curve: starts slow, ends fast.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    SINE: (x) => 1 - cos(x * (PI / 2)),

    /** Circular ease-in curve.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    CIRC: (x) => 1 - (1 - x * x)**.5,

    /** Exponential ease-in curve (`2^(10x-10)`).
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    EXPO: (x) => x === 0 ? 0 : 2 ** (10 * x - 10),

    /** Back ease-in: overshoots backward at the start before snapping forward.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    BACK: (x) => x * x * (2.70158 * x - 1.70158),

    /** Elastic ease-in: oscillates with decreasing amplitude.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    ELASTIC: (x) =>
        x === 0 ? 0 :
        x === 1 ? 1 :
        -(2 ** (10 * x - 10)) * sin(((37 - 40 * x) * PI) / 6),

    /** Spring-like ease-out: oscillates outward after passing the target.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem */
    SPRING: (x) =>
        1 -
        (sin(PI * (1 - x) * (0.2 + 2.5 * (1 - x) ** 3)) *
            x ** 2.2 +
            (1 - x)) *
            (1.0 + 1.2 * x),

    /** Bouncing ease-in: slow ramp with bouncing impacts near the end.
     *  Symmetric with the other base curves, which are all ease-in. To get the
     *  classic "object falls and hits the ground" shape (bounces near x=1),
     *  wrap with `Ease.OUT`: `Ease.OUT(Ease.BOUNCE)`.
     *  @param {number} x
     *  @returns {number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.BOUNCE                  // ease-in bounce (slow, then bouncy at end)
     *  Ease.OUT(Ease.BOUNCE)        // ease-out bounce (object hits ground)
     *  Ease.IN_OUT(Ease.BOUNCE)     // bounces at both ends
     */
    BOUNCE: (x) =>
    {
        // Inverted form of the standard easeOutBounce: 1 - bounceOut(1 - x).
        let t = 1 - x, f;
        if (t < 4 / 11) f = 7.5625 * t * t;
        else if (t < 8 / 11) f = 7.5625 * (t -= 6 / 11) * t + 0.75;
        else if (t < 10 / 11) f = 7.5625 * (t -= 9 / 11) * t + 0.9375;
        else f = 7.5625 * (t -= 10.5 / 11) * t + 0.984375;
        return 1 - f;
    },

    /** Ease-in direction modifier: returns the curve unchanged. Symmetric
     *  with `OUT` and `IN_OUT`. Base curves are already ease-in by
     *  convention, so wrapping a curve in `IN` is a no-op — useful when
     *  picking the direction programmatically.
     *  @param {function(number):number} f - Curve to use as ease-in (returned unchanged)
     *  @returns {function(number):number}
     *  @memberof TweenSystem
     *  @example
     *  // Pick direction at runtime
     *  const dir = bouncyMode ? Ease.OUT : Ease.IN;
     *  new Tween(cb, 0, 10, 1).setEase(dir(Ease.BACK));
     */
    IN: (f) => f,

    /** Reverse a curve so it eases out instead of in: `x => 1 - f(1 - x)`.
     *  @param {function(number):number} f
     *  @returns {function(number):number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.OUT(Ease.POWER(2)) // ease-out quadratic
     */
    OUT: (f) => (x) => 1 - f(1 - x),

    /** Combine the first half of `f` with `Ease.OUT(f)` for a symmetric curve.
     *  Bug-fix vs the original library: the original referenced an undefined
     *  global `Piecewise`; this implementation routes through `Ease.PIECEWISE`.
     *  @param {function(number):number} f
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    IN_OUT: (f) => Ease.PIECEWISE(f, Ease.OUT(f)),

    /** Split [0,1] into N equal sections and run a different curve in each.
     *  Each curve is mapped to its section: section i runs over [i/n, (i+1)/n]
     *  and its output is mapped to [i/n, (i+1)/n] of the overall range.
     *  @param {...function(number):number} fns
     *  @returns {function(number):number}
     *  @memberof TweenSystem */
    PIECEWISE: (...fns) =>
    {
        const n = fns.length;
        return (x) =>
        {
            const i = (x * n - 1e-9) >> 0;
            return (fns[i]((x - i / n) * n) + i) / n;
        };
    },

    /** Cubic Bezier curve solver in the style of CSS `cubic-bezier`.
     *  Control points (0,0), (x1,y1), (x2,y2), (1,1).
     *  @param {number} x1
     *  @param {number} y1
     *  @param {number} x2
     *  @param {number} y2
     *  @returns {function(number):number}
     *  @memberof TweenSystem
     *  @example
     *  Ease.BEZIER(0.25, 0.1, 0.25, 1) // CSS "ease"
     */
    BEZIER: (x1, y1, x2, y2) =>
    {
        // Parametric cubic Bezier with implicit (0,0) and (1,1) endpoints.
        const curve = (t) =>
        {
            const u = 1 - t;
            const c1 = 3 * u * u * t;
            const c2 = 3 * u * t * t;
            const t3 = t ** 3;
            return [c1 * x1 + c2 * x2 + t3, c1 * y1 + c2 * y2 + t3];
        };
        return (x) =>
        {
            // Binary search for t such that curve(t).x ≈ x, then return curve(t).y.
            let t0 = 0, t1 = 1;
            for (let i = 0; i < 128; i++)
            {
                const tMid = (t0 + t1) / 2;
                const [bx, by] = curve(tMid);
                if (abs(bx - x) < 1e-5) return by;
                if (bx < x) t0 = tMid; else t1 = tMid;
            }
            return curve((t0 + t1) / 2)[1];
        };
    },
};

/** Tween a property on an object by dot-path. Returns the underlying Tween
 *  so all chaining methods (`setEase`, `then`, `loop`, `pingPong`, etc.)
 *  remain available.
 *
 *  `start` and `end` may be numbers, Vector2 instances, Color instances, or
 *  any object with a `lerp(other, percent) => sameType` method.
 *  @param {Object} target - The object whose property is being animated
 *  @param {string} propertyPath - Dot-separated path, e.g. `'pos.x'` or `'color'`
 *  @param {number|Vector2|Color} start - Starting value
 *  @param {number|Vector2|Color} end - Ending value
 *  @param {number} [duration=1] - Duration in seconds
 *  @param {Object} [options] - Same options as the Tween constructor
 *  @returns {Tween}
 *  @memberof TweenSystem
 *  @example
 *  // Numeric: slide an object's x with an ease-out sine curve
 *  tweenProperty(player, 'pos.x', 0, 10, 2).setEase(Ease.OUT(Ease.SINE));
 *  // Vector2: animate a position diagonally
 *  tweenProperty(player, 'pos', vec2(-5, 0), vec2(5, 3), 2);
 *  // Color: pulse between two colors
 *  tweenProperty(sprite, 'color', RED, BLUE, 1).pingPong();
 */
function tweenProperty(target, propertyPath, start, end, duration = 1, options = {})
{
    ASSERT(target != null && typeof target === 'object', 'tweenProperty target must be an object');
    ASSERT(isStringLike(propertyPath) && propertyPath.length > 0, 'tweenProperty propertyPath must be a non-empty string');

    const parts = propertyPath.split('.');
    const lastKey = parts.pop();
    const callback = (value) =>
    {
        let obj = target;
        for (const k of parts)
        {
            obj = obj[k];
            ASSERT(obj != null, 'tweenProperty path does not resolve: ' + propertyPath);
        }
        obj[lastKey] = value;
    };
    return new Tween(callback, start, end, duration, options);
}

// Continuation that schedules the next loop iteration when one finishes.
// Reuses the same Tween object across iterations so the user's handle
// from `.loop()` keeps working — calling `.stop()` mid-loop now cancels
// the entire chain instead of just the current iteration.
function loopContinuation(tween)
{
    if (tween.loopRemaining !== Infinity && tween.loopRemaining <= 1) return;
    if (tween.loopRemaining !== Infinity) tween.loopRemaining -= 1;
    tween.life = tween.duration;
    tween.thenCallback = () => loopContinuation(tween);
    tweenActive.push(tween);
    // snap to start for the new iteration (matches Tween constructor behavior)
    tween.callback(tween.interp(tween.duration));
}

// Continuation for pingPong: swaps start and end on the same tween each iteration.
function pingPongContinuation(tween)
{
    if (tween.loopRemaining !== Infinity && tween.loopRemaining <= 1) return;
    if (tween.loopRemaining !== Infinity) tween.loopRemaining -= 1;
    const tmp = tween.start;
    tween.start = tween.end;
    tween.end = tmp;
    tween.life = tween.duration;
    tween.thenCallback = () => pingPongContinuation(tween);
    tweenActive.push(tween);
    tween.callback(tween.interp(tween.duration));
}

/** Engine plugin hook: advance every active tween by the appropriate delta.
 *  Called once per render frame by the engine (no arguments). May also be
 *  called explicitly with `(gameDelta, realDelta)` to drive tweens manually
 *  — useful for headless tests or custom replay/scrubbing systems.
 *  @param {number} [gameDelta] - Game-time delta in seconds; default: time - lastTime
 *  @param {number} [realDelta] - Real-time delta in seconds; default: timeReal - lastTimeReal
 *  @memberof TweenSystem */
function tweenUpdate(gameDelta, realDelta)
{
    if (gameDelta === undefined)
    {
        // Engine path: compute deltas from engine time globals.
        gameDelta = time - lastTime;
        realDelta = timeReal - lastTimeReal;
        lastTime = time;
        lastTimeReal = timeReal;
    }
    else if (realDelta === undefined)
    {
        // Manual path with one arg: real and game advance together.
        realDelta = gameDelta;
    }

    // Iterate in reverse so removals don't disturb iteration.
    for (let i = tweenActive.length; i--;)
    {
        const t = tweenActive[i];
        if (t.paused) continue;
        const dt = t.useRealTime ? realDelta : gameDelta;
        if (dt <= 0) continue;

        t.life -= dt;
        if (t.life > 0)
        {
            t.callback(t.interp(t.life));
        }
        else
        {
            // Completion: fire end value, remove from active, fire then-callback.
            t.callback(t.interp(0));
            tweenActive.splice(i, 1);
            const cb = t.thenCallback;
            t.thenCallback = undefined;
            if (cb) cb();
        }
    }
}

/** Stop every active tween and clear their then-callbacks. Useful for resets
 *  on level transitions or when changing scenes.
 *  @memberof TweenSystem */
function tweenStopAll()
{
    for (const t of tweenActive) t.thenCallback = undefined;
    tweenActive.length = 0;
}

// Register with the engine so tweens auto-advance.
engineAddPlugin(tweenUpdate);

/**
 * LittleJS PathFinder Plugin
 * - Grid-based A* pathfinder with two-pass smoothing for natural-looking paths
 * - Works directly on a TileCollisionLayer, or override isWalkable/getCost for any grid
 * - Debug visualization via engine debug primitives (stripped in release builds)
 * - Port of frankforce.com pathFindingBase.cpp (2018)
 * @namespace PathFinding
 */

///////////////////////////////////////////////////////////////////////////////

// Diagonal step cost — pre-computed for the A* expansion inner loop.
const PATHFINDER_DIAGONAL_COST = Math.SQRT2;

// Shared 1x1 size vector for per-tile debugRect calls. debugRect copies the
// argument internally, so reusing one instance is safe.
const PATHFINDER_TILE_VEC = vec2(1);

///////////////////////////////////////////////////////////////////////////////

/** A single grid cell tracked by the pathfinder. Allocated once per cell at
 *  PathFinder construction; reset (not reallocated) at the start of every
 *  findPath call.
 *  @memberof PathFinding */
class PathFinderNode
{
    /** @param {number} x - Tile x
     *  @param {number} y - Tile y */
    constructor(x, y)
    {
        /** @property {Vector2} - Tile coords (integer) */
        this.pos = vec2(x, y);
        /** @property {Vector2} - World-space center of this tile (set by buildNodeData) */
        this.posWorld = vec2();
        /** @property {boolean} - True if this cell is passable (cleared each findPath call) */
        this.walkable = false;
        /** @property {number} - Extra cost added to A* G-score for stepping on this cell */
        this.cost = 0;
        /** @property {number} - A* G-score: actual cost from start to this node */
        this.g = 0;
        /** @property {number} - A* F-score: G + heuristic */
        this.f = 0;
        /** @property {PathFinderNode|null} - Parent for path reconstruction */
        this.parent = null;
        /** @property {boolean} - In the A* open list */
        this.isOpen = false;
        /** @property {boolean} - In the A* closed list */
        this.isClosed = false;
    }

    /** Reset per-search state (called at the start of buildNodeData). */
    reset()
    {
        this.walkable = false;
        this.cost = 0;
        this.g = 0;
        this.f = 0;
        this.parent = null;
        this.isOpen = false;
        this.isClosed = false;
    }

    /** True if walkable and not blocked by cost. */
    isClear()
    {
        return this.walkable && this.cost === 0;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Grid pathfinder using A* with two optional smoothing passes.
 *  @memberof PathFinding
 *  @example
 *  // Tile-layer driven (most common):
 *  const pf = new PathFinder(myTileCollisionLayer);
 *  const path = pf.findPath(player.pos, mousePos);
 *
 *  // Bare grid with custom walkability:
 *  const pf = new PathFinder(vec2(50, 50));
 *  pf.isWalkable = (x, y) => myGrid[y*50 + x] === 0;
 */
class PathFinder
{
    /** @param {TileCollisionLayer|Vector2} source - Either a TileCollisionLayer
     *  (size and walkability auto-derived) or a Vector2 grid size (user
     *  overrides isWalkable). */
    constructor(source)
    {
        // Accept either a Vector2 size or a TileCollisionLayer (which has a .size).
        // We don't import TileCollisionLayer to avoid coupling; we duck-type on
        // .size + .getCollisionData.
        if (isVector2(source))
        {
            /** @property {Vector2} - Grid dimensions in tiles */
            this.size = source.floor();
            /** @property {TileCollisionLayer|undefined} - Tile layer driving walkability, if any */
            this.tileLayer = undefined;
        }
        else
        {
            ASSERT(source && isVector2(source.size) && typeof source.getCollisionData === 'function',
                'PathFinder requires a Vector2 size or a TileCollisionLayer');
            this.size = source.size;
            this.tileLayer = source;
        }

        // Tunables (public, freely re-assignable).
        /** @property {number} - A* heuristic multiplier (1 = admissible, higher = greedier) */
        this.heuristicWeight = 1;
        /** @property {number} - Maximum A* expansions before giving up */
        this.maxLoop = 1e3;
        /** @property {boolean} - If true, post-process paths with two-pass smoothing */
        this.smoothPath = true;
        /** @property {boolean} - If true, draw debug visualization during findPath */
        this.debug = false;
        /** @property {number} - Debug primitive lifetime in seconds (0 disables drawing) */
        this.debugTime = 1;

        /** @property {Array<PathFinderNode>} - Flat row-major array of size.x*size.y nodes */
        this.nodes = new Array(this.size.x * this.size.y);
        for (let y = 0; y < this.size.y; ++y)
        for (let x = 0; x < this.size.x; ++x)
            this.nodes[x + y * this.size.x] = new PathFinderNode(x, y);

        // Scratch Vector2 reused to avoid allocations in the isWalkable hot path.
        this.collisionScratch = vec2();
    }

    /** Default walkability: if a tile layer was provided, returns true when the
     *  cell has no solid collision data; otherwise returns true. Override on
     *  the instance or via a subclass.
     *  @param {number} x - Tile x
     *  @param {number} y - Tile y
     *  @returns {boolean} */
    isWalkable(x, y)
    {
        if (!this.tileLayer) return true;
        return !this.tileLayer.getCollisionData(this.collisionScratch.set(x, y));
    }

    /** Default extra cost for stepping on a cell. Returns 0 (free) by default.
     *  Override to add cost-weighted terrain (mud, swamp, etc).
     *  @param {number} x - Tile x
     *  @param {number} y - Tile y
     *  @returns {number} */
    getCost(x, y)
    {
        return 0;
    }

    /** Get the node at tile coords, or null if out of bounds.
     *  @param {number} x
     *  @param {number} y
     *  @returns {PathFinderNode|null} */
    getNode(x, y)
    {
        if (x < 0 || y < 0 || x >= this.size.x || y >= this.size.y) return null;
        return this.nodes[x + y * this.size.x];
    }

    /** Convert a world-space position to integer tile coords (no clamping).
     *  @param {Vector2} worldPos
     *  @returns {Vector2}
     *  @memberof PathFinding */
    worldToTile(worldPos)
    {
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        return vec2(floor(worldPos.x - ox), floor(worldPos.y - oy));
    }

    /** Convert integer tile coords to the world-space center of that tile.
     *  @param {number} x
     *  @param {number} y
     *  @returns {Vector2}
     *  @memberof PathFinding */
    tileToWorld(x, y)
    {
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        return vec2(x + 0.5 + ox, y + 0.5 + oy);
    }

    /** Reset all nodes and re-populate walkable / cost / posWorld from the
     *  current isWalkable / getCost overrides. Called at the start of
     *  findPath; exposed so tests and tooling can drive it directly.
     *  @private */
    buildNodeData()
    {
        const w = this.size.x;
        const h = this.size.y;
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        for (let y = 0; y < h; ++y)
        for (let x = 0; x < w; ++x)
        {
            const node = this.nodes[x + y * w];
            node.reset();
            const walkable = !!this.isWalkable(x, y);
            const cost = walkable ? max(0, this.getCost(x, y)) : 0;
            node.walkable = walkable;
            node.cost = cost;
            node.posWorld.set(x + 0.5 + ox, y + 0.5 + oy);

            if (this.debug && this.debugTime > 0)
            {
                if (!walkable)
                    debugRect(node.posWorld, PATHFINDER_TILE_VEC, rgb(1, 0, 0, 0.25), this.debugTime);
                else if (cost > 0)
                    debugRect(node.posWorld, PATHFINDER_TILE_VEC, rgb(1, 0, 0, min(0.2, cost * 0.05)), this.debugTime);
            }
        }
    }

    /** Core A* search loop. Expects buildNodeData() to have been called first.
     *  Marks node.parent for path reconstruction. Returns true if endNode was
     *  reached; false on disconnected goal or maxLoop exhaustion.
     *  @param {PathFinderNode} startNode
     *  @param {PathFinderNode} endNode
     *  @returns {boolean}
     *  @private */
    aStarSearch(startNode, endNode)
    {
        ASSERT(startNode && endNode, 'aStarSearch needs both endpoints');
        ASSERT(startNode !== endNode, 'aStarSearch: start and end must differ — caller should handle trivial case');
        ASSERT(startNode.walkable && endNode.walkable, 'aStarSearch: endpoints must be walkable');

        const openList = [startNode];
        startNode.isOpen = true;
        let loopCount = 0;

        while (openList.length > 0)
        {
            // Find the open node with the smallest f score (linear scan).
            // Same as the C++ — fine up to a few thousand nodes.
            let bestIndex = 0;
            let bestF = openList[0].f;
            for (let i = 1; i < openList.length; ++i)
            {
                if (openList[i].f < bestF)
                {
                    bestF = openList[i].f;
                    bestIndex = i;
                }
            }
            const current = openList[bestIndex];

            if (current === endNode) break;
            if (++loopCount > this.maxLoop) break;

            // Move current from open to closed.
            current.isOpen = false;
            openList.splice(bestIndex, 1);
            current.isClosed = true;

            if (this.debug && this.debugTime > 0)
                debugRect(current.posWorld, PATHFINDER_TILE_VEC, rgb(1, 1, 1, 0.05), this.debugTime);

            // Expand all 8 neighbors.
            for (let dy = -1; dy <= 1; ++dy)
            for (let dx = -1; dx <= 1; ++dx)
            {
                if (dx === 0 && dy === 0) continue;
                const neighbor = this.getNode(current.pos.x + dx, current.pos.y + dy);
                if (!neighbor || !neighbor.walkable || neighbor.isClosed) continue;

                let stepCost = 1;
                if (dx !== 0 && dy !== 0)
                {
                    // Diagonal step: refuse if either cardinal neighbor is
                    // blocked. Prevents cutting through walls at corners.
                    // (Costed-but-walkable cardinals do not block — diagonal
                    // movement around expensive terrain is standard A*.)
                    const card1 = this.getNode(current.pos.x + dx, current.pos.y);
                    if (!card1 || !card1.walkable) continue;
                    const card2 = this.getNode(current.pos.x, current.pos.y + dy);
                    if (!card2 || !card2.walkable) continue;
                    stepCost = PATHFINDER_DIAGONAL_COST;
                }

                const tentativeG = current.g + stepCost + neighbor.cost;
                if (!neighbor.isOpen)
                {
                    neighbor.isOpen = true;
                    openList.push(neighbor);
                }
                else if (tentativeG >= neighbor.g)
                {
                    continue;
                }

                // Best path so far through neighbor — record it.
                neighbor.parent = current;
                neighbor.g = tentativeG;
                // Octile heuristic — tightest admissible distance for an
                // 8-connected grid with cardinal cost 1 and diagonal cost √2.
                const adx = abs(endNode.pos.x - neighbor.pos.x);
                const ady = abs(endNode.pos.y - neighbor.pos.y);
                const h = max(adx, ady) + (Math.SQRT2 - 1) * min(adx, ady);
                neighbor.f = neighbor.g + h * this.heuristicWeight;
            }
        }

        return endNode.parent !== null;
    }

    /** Find the clear (walkable, zero-cost) node closest to the given world
     *  position. Spirals outward in expanding boxes until a clear node is
     *  found or the search range is exhausted. Useful for snapping a click
     *  or NPC spawn position to the nearest open tile.
     *
     *  By default, calls `buildNodeData()` first so it works correctly on a
     *  fresh PathFinder. If you're calling it many times in a row with
     *  unchanged walkability, pass `rebuild=false` and call `buildNodeData()`
     *  once externally to avoid redundant work.
     *  @param {Vector2} worldPos
     *  @param {number} [searchRange=10] - Max box-radius in tiles
     *  @param {boolean} [rebuild=true] - Whether to call buildNodeData first
     *  @returns {PathFinderNode|null}
     *  @memberof PathFinding */
    getNearestClearNode(worldPos, searchRange = 10, rebuild = true)
    {
        ASSERT(isVector2(worldPos), 'worldPos must be a Vector2');
        if (rebuild) this.buildNodeData();

        // Inline worldToTile to avoid a Vector2 allocation per call.
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        const centerX = floor(worldPos.x - ox);
        const centerY = floor(worldPos.y - oy);

        for (let offset = 0; offset <= searchRange; ++offset)
        {
            let nearest = null;
            let nearestDistSq = 0;

            for (let dy = -offset; dy <= offset; ++dy)
            for (let dx = -offset; dx <= offset; ++dx)
            {
                // Only scan the perimeter of the current ring (skip the
                // interior we've already searched in earlier iterations).
                if (offset > 0 && abs(dx) !== offset && abs(dy) !== offset)
                    continue;

                const node = this.getNode(centerX + dx, centerY + dy);
                if (!node || !node.isClear()) continue;

                const ddx = node.posWorld.x - worldPos.x;
                const ddy = node.posWorld.y - worldPos.y;
                const distSq = ddx * ddx + ddy * ddy;
                if (!nearest || distSq < nearestDistSq)
                {
                    nearest = node;
                    nearestDistSq = distSq;
                }
            }
            if (nearest) return nearest;
        }
        return null;
    }

    /** Smooth a node path by removing redundant turns and tightening corners
     *  where a grid-aligned diagonal is clear. Modifies the path in place.
     *  Stays on the grid — does not introduce off-tile-center points.
     *  Port of ShortenPath() in pathFinding.cpp.
     *  @param {PathFinderNode[]} path
     *  @private */
    smoothPathCorners(path)
    {
        if (path.length <= 2) return;

        let i = 1;
        while (i < path.length - 1)
        {
            const prev = path[i - 1];
            const node = path[i];
            const next = path[i + 1];

            const dx = next.pos.x - prev.pos.x;
            const dy = next.pos.y - prev.pos.y;
            const lenSq = dx * dx + dy * dy;

            // dx,dy is the prev-to-current step direction; needed for the
            // 135° "mostly vertical/horizontal" disambiguation.
            const stepDx = node.pos.x - prev.pos.x;
            const stepDy = node.pos.y - prev.pos.y;
            const stepDxNext = next.pos.x - node.pos.x;
            const stepDyNext = next.pos.y - node.pos.y;

            if (lenSq === 1)
            {
                // 45° angle — middle node is off the straight line. Drop it.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(0.5, 0, 0.5, 0.5), this.debugTime);
                path.splice(i, 1);
                i = max(1, i - 1);
                continue;
            }
            else if (lenSq === 2)
            {
                // 90° corner. Check the alternative-diagonal cell.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(1, 0, 0, 0.5), this.debugTime);

                let sx, sy;
                if (prev.pos.y === node.pos.y && next.pos.x === node.pos.x)
                { sx = prev.pos.x; sy = next.pos.y; }
                else
                { sx = next.pos.x; sy = prev.pos.y; }

                const shortcut = this.getNode(sx, sy);
                if (shortcut && shortcut.isClear())
                {
                    path.splice(i, 1);
                    i = max(1, i - 1);
                    continue;
                }
            }
            else if (lenSq === 5)
            {
                // 135° angle (a knight's-move offset). Try to relocate the
                // middle node to whichever of two candidate cells is closer
                // to prev-of-prev, and only if the corner cut is also clear.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(1, 1, 0, 0.5), this.debugTime);

                const prevPrev = i >= 2 ? path[i - 2] : prev;
                let s1x, s1y, s2x, s2y;
                if (stepDx === 0 || stepDxNext === 0)
                {
                    // mostly vertical
                    s1x = next.pos.x; s1y = node.pos.y;
                    s2x = prev.pos.x; s2y = node.pos.y;
                }
                else
                {
                    // mostly horizontal
                    s1x = node.pos.x; s1y = next.pos.y;
                    s2x = node.pos.x; s2y = prev.pos.y;
                }
                const dd1x = s1x - prevPrev.pos.x;
                const dd1y = s1y - prevPrev.pos.y;
                const dd2x = s2x - prevPrev.pos.x;
                const dd2y = s2y - prevPrev.pos.y;
                const dist1Sq = dd1x * dd1x + dd1y * dd1y;
                const dist2Sq = dd2x * dd2x + dd2y * dd2y;
                const sx = dist1Sq < dist2Sq ? s1x : s1x === s2x && s1y === s2y ? s1x : s2x;
                const sy = dist1Sq < dist2Sq ? s1y : s1x === s2x && s1y === s2y ? s1y : s2y;

                const shortcut = this.getNode(sx, sy);
                if (shortcut && shortcut !== node && shortcut.isClear())
                {
                    // Also check the cut-corner cell is clear.
                    const ccx = next.pos.x + s2x - s1x;
                    const ccy = next.pos.y + s2y - s1y;
                    const cutCorner = this.getNode(ccx, ccy);
                    if (cutCorner && cutCorner.isClear())
                    {
                        path[i] = shortcut;
                        i = max(1, i - 1);
                        continue;
                    }
                }
            }
            else if (lenSq === 4 || lenSq === 8)
            {
                // Straight line or a 1-cell bump.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(0, 1, 0, 0.5), this.debugTime);

                if (stepDx === stepDxNext && stepDy === stepDyNext)
                {
                    // Truly straight — nothing to do, advance.
                    ++i;
                    continue;
                }
                else
                {
                    // Bump — try to flatten via the in-line cell.
                    let sx, sy;
                    if (prev.pos.y === next.pos.y)
                    { sx = node.pos.x; sy = prev.pos.y; }
                    else
                    { sx = prev.pos.x; sy = node.pos.y; }
                    const shortcut = this.getNode(sx, sy);
                    if (shortcut && shortcut.isClear())
                    {
                        path[i] = shortcut;
                        i = max(1, i - 1);
                        continue;
                    }
                }
            }

            ++i;
        }
    }

    /** Smooth a node path via line-of-sight ("string pulling"). Walks the
     *  input path collapsing runs of nodes into straight segments whenever
     *  isLineClear permits, so the result can leave grid centers and cut
     *  cleanly across open spaces.
     *
     *  Bails (leaves the path unchanged) if any node has nonzero cost — a
     *  straight geometric shortcut can't be trusted to be the lowest-cost
     *  route when cost-weighted terrain is in play.
     *
     *  Port of ShortenPath2() in pathFinding.cpp.
     *  @param {PathFinderNode[]} path
     *  @private */
    smoothPathStringPull(path)
    {
        if (path.length <= 2) return;
        for (const n of path)
        {
            if (!n.isClear()) return;
        }

        const original = path.slice();
        path.length = 0;
        path.push(original[0]);
        let searchIndex = 0;

        for (let i = 1; i < original.length; ++i)
        {
            const node = original[i];

            // Skip if node is collinear with the search-window start and the
            // previous node — it adds no information. Note: a == b is the
            // degenerate i=1, searchIndex=0 case; skip the test then.
            {
                const a = original[searchIndex];
                const b = original[i - 1];
                if (a !== b)
                {
                    const cross =
                        (b.pos.x - a.pos.x) * (node.pos.y - a.pos.y) -
                        (b.pos.y - a.pos.y) * (node.pos.x - a.pos.x);
                    if (cross === 0) continue;
                }
            }

            if (!this.isLineClear(node.pos, path[path.length - 1].pos))
            {
                // Look ahead — if any later node has a clear shot to the
                // back of our new path, skip this node and try later.
                let foundClearAfter = false;
                for (let j = i + 1; j < original.length; ++j)
                {
                    if (this.isLineClear(original[j].pos, path[path.length - 1].pos))
                    {
                        foundClearAfter = true;
                        break;
                    }
                }
                if (foundClearAfter)
                {
                    if (this.debug && this.debugTime > 0)
                        debugLine(node.posWorld, path[path.length - 1].posWorld, rgb(0, 0, 1, 0.3), 0.02, this.debugTime);
                    continue;
                }

                // No clear line ahead — fall back to the last waypoint we did
                // have a clear line to. searchIndex tracks our scan position.
                for (; searchIndex < original.length; ++searchIndex)
                {
                    const cand = original[searchIndex];
                    if (this.isLineClear(node.pos, cand.pos))
                    {
                        path.push(cand);
                        i = searchIndex;
                        break;
                    }
                }
                ASSERT(searchIndex < original.length, 'smoothPathStringPull: ran out of candidates');
            }
        }

        path.push(original[original.length - 1]);
    }

    /** Drop any middle node that lies exactly on the line through its two
     *  neighbors. Backstop for the smoothing passes — the corners pass
     *  intentionally keeps truly-straight runs, and the string-pulling pass
     *  checks collinearity against the original path, not the in-progress
     *  result, so it can leave 3+ collinear nodes in some edge cases.
     *  @param {PathFinderNode[]} path
     *  @private */
    dropCollinearNodes(path)
    {
        for (let i = path.length - 2; i >= 1; --i)
        {
            const a = path[i - 1], b = path[i], c = path[i + 1];
            if ((b.pos.x - a.pos.x) * (c.pos.y - a.pos.y) ===
                (b.pos.y - a.pos.y) * (c.pos.x - a.pos.x))
                path.splice(i, 1);
        }
    }

    /** Lookup helper: true when the node at tile coords (x, y) is in-bounds
     *  and clear (walkable, zero-cost). Used by isLineClear's hot path.
     *  @param {number} x
     *  @param {number} y
     *  @returns {boolean}
     *  @private */
    isNodeClear(x, y)
    {
        const n = this.getNode(x, y);
        return n !== null && n.isClear();
    }

    /** Check that the line between two tile-coord endpoints stays entirely
     *  inside walkable, zero-cost cells. Stricter than just sampling along
     *  the line — it also checks the diagonal-corner-adjacent cells so the
     *  line can never "scrape past" a wall corner.
     *
     *  Both endpoints must themselves be clear (asserted in debug). Port of
     *  CheckLine() in pathFinding.cpp.
     *  @param {Vector2} startPos - Tile coords
     *  @param {Vector2} endPos - Tile coords
     *  @returns {boolean}
     *  @private */
    isLineClear(startPos, endPos)
    {
        ASSERT(isVector2(startPos) && isVector2(endPos), 'isLineClear needs Vector2 endpoints');
        ASSERT(this.isNodeClear(startPos.x, startPos.y) && this.isNodeClear(endPos.x, endPos.y),
            'isLineClear endpoints must be in-bounds and clear');

        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const adx = abs(dx);
        const ady = abs(dy);
        const sx = sign(dx);
        const sy = sign(dy);
        let x = startPos.x;
        let y = startPos.y;

        if (ady === adx)
        {
            // Pure diagonal.
            while (x !== endPos.x)
            {
                if (x !== startPos.x)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    if (!this.isNodeClear(x, y - sy)) return false;
                }
                if (!this.isNodeClear(x, y + sy)) return false;
                x += sx;
                y += sy;
            }
            if (!this.isNodeClear(endPos.x, endPos.y - sy)) return false;
        }
        else if (ady < adx)
        {
            // Mostly horizontal.
            if (dy === 0)
            {
                // Purely horizontal.
                x += sx;
                while (x !== endPos.x)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    x += sx;
                }
            }
            else
            {
                let lastY = startPos.y;
                while (x !== endPos.x)
                {
                    y = startPos.y + Math.trunc((dy * (x - startPos.x)) / dx);
                    if (lastY !== y)
                    {
                        if (!this.isNodeClear(x - sx, y + sy)) return false;
                        if (!this.isNodeClear(x, y - sy)) return false;
                    }
                    lastY = y;
                    if (x !== startPos.x)
                    {
                        if (!this.isNodeClear(x, y)) return false;
                    }
                    y += sy;
                    if (!this.isNodeClear(x, y)) return false;
                    x += sx;
                }
                const finalY = endPos.y - sy;
                if (!this.isNodeClear(endPos.x, finalY)) return false;
            }
        }
        else
        {
            // Mostly vertical.
            if (dx === 0)
            {
                y += sy;
                while (y !== endPos.y)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    y += sy;
                }
            }
            else
            {
                let lastX = startPos.x;
                while (y !== endPos.y)
                {
                    x = startPos.x + Math.trunc((dx * (y - startPos.y)) / dy);
                    if (lastX !== x)
                    {
                        if (!this.isNodeClear(x + sx, y - sy)) return false;
                        if (!this.isNodeClear(x - sx, y)) return false;
                    }
                    lastX = x;
                    if (y !== startPos.y)
                    {
                        if (!this.isNodeClear(x, y)) return false;
                    }
                    x += sx;
                    if (!this.isNodeClear(x, y)) return false;
                    y += sy;
                }
                const finalX = endPos.x - sx;
                if (!this.isNodeClear(finalX, endPos.y)) return false;
            }
        }
        return true;
    }

    /** Find a path from startPos to endPos in world space. Returns an array
     *  of world-space Vector2 points; empty array if no path exists.
     *
     *  Start and end are snapped to the nearest walkable tile via
     *  getNearestClearNode. Intermediate points are tile centers unless the
     *  string-pulling smoothing pass moves them off-grid.
     *  @param {Vector2} startPos - World-space start
     *  @param {Vector2} endPos - World-space end
     *  @returns {Vector2[]}
     *  @memberof PathFinding */
    findPath(startPos, endPos)
    {
        ASSERT(isVector2(startPos) && isVector2(endPos), 'findPath needs Vector2 endpoints');

        this.buildNodeData();

        // rebuild=false because we just built — avoid redundant work per snap.
        const startNode = this.getNearestClearNode(startPos, 10, false);
        const endNode = this.getNearestClearNode(endPos, 10, false);
        if (!startNode || !endNode) return [];

        // Trivial case: start and end snapped to the same tile.
        if (startNode === endNode) return [startNode.posWorld.copy()];

        if (!this.aStarSearch(startNode, endNode)) return [];

        // Walk back from endNode via parent pointers, then reverse — cheaper
        // than unshifting on every step.
        const nodePath = [];
        for (let n = endNode; n; n = n.parent)
            nodePath.push(n);
        nodePath.reverse();

        if (this.smoothPath)
        {
            this.smoothPathCorners(nodePath);
            this.smoothPathStringPull(nodePath);
            this.dropCollinearNodes(nodePath);
        }

        // Convert to world-space Vector2 path. Return copies, not live node
        // references — callers shouldn't be able to mutate the grid.
        const result = nodePath.map(n => n.posWorld.copy());

        if (this.debug && this.debugTime > 0 && result.length > 0)
        {
            for (let i = 1; i < result.length; ++i)
                debugLine(result[i - 1], result[i], RED, 0.1, this.debugTime);
            for (const p of result)
                debugCircle(p, 0.5, rgb(1, 0, 0, 0.3), this.debugTime);
            debugCircle(result[0], 0.5, rgb(0, 1, 0, 0.5), this.debugTime);
            debugCircle(result[result.length - 1], 0.5, rgb(0, 1, 0, 0.5), this.debugTime);
        }

        return result;
    }
}

/**
 * LittleJS 3D Math Plugin
 * - Vector3 and Matrix4 for 3D games and plugins
 * - Right handed, Y up, angles in radians
 * - Used by the Render3D plugin, but has no rendering dependencies
 * @namespace Math3D
 */

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a 3D vector, can take 0, 1, 2 or 3 numbers
 * - vec3() is zero, vec3(s) fills all three, vec3(x, y) sets z to 0
 * @param {number} [x]
 * @param {number} [y]
 * @param {number} [z]
 * @return {Vector3}
 * @memberof Math3D
 */
function vec3(x=0, y, z)
{
    return y === undefined ? new Vector3(x, x, x) : new Vector3(x, y, z === undefined ? 0 : z);
}

/**
 * Check if the object is a valid Vector3
 * @param {any} v
 * @return {boolean}
 * @memberof Math3D
 */
function isVector3(v) { return v instanceof Vector3 && v.isValid(); }

// debug check that a value is a usable Vector3, stripped in release like the 2D one
function ASSERT_VECTOR3_VALID(v) { ASSERT(isVector3(v), 'Vector3 is invalid.', v); }

/**
 * Returns a random Vector3 of a given length, pointing any direction evenly, or within a cone around +Y
 * @param {number} [length]
 * @param {number} [coneAngle] - Half angle of the cone around +Y in radians, PI is every direction
 * @return {Vector3}
 * @memberof Math3D
 */
function randVector3(length=1, coneAngle=PI)
{
    // a random height on the sphere is uniform over its surface, then a random turn around Y
    const y = rand(cos(coneAngle), 1), s = (1 - y * y) ** .5, a = rand(2 * PI);
    return new Vector3(s * cos(a) * length, y * length, s * sin(a) * length);
}

/**
 * Returns a random Vector3 inside a sphere, spread evenly through its volume, the 3D twin of randInCircle
 * @param {number} [radius]
 * @param {number} [minRadius] - Leave a hollow middle this big
 * @return {Vector3}
 * @memberof Math3D
 */
function randInSphere(radius=1, minRadius=0)
{
    // the volume inside a radius grows with its cube, so that is what has to come out even
    if (radius <= 0) return new Vector3;
    const ratio = clamp(minRadius / radius);
    return randVector3(radius * rand(ratio**3, 1) ** (1/3));
}

/**
 * 3D Vector object, right handed with Y up
 * - Methods return new vectors except set and setFrom
 * @memberof Math3D
 * @example
 * const a = vec3(1, 2, 3);
 * const b = a.add(vec3(0, 1, 0)).normalize();
 */
class Vector3
{
    /** Create a 3D vector
     *  @param {number} [x]
     *  @param {number} [y]
     *  @param {number} [z] */
    constructor(x=0, y=0, z=0)
    {
        ASSERT(isNumber(x) && isNumber(y) && isNumber(z), 'Vector3 components must be numbers');
        /** @property {number} - X axis location */
        this.x = x;
        /** @property {number} - Y axis location */
        this.y = y;
        /** @property {number} - Z axis location */
        this.z = z;
    }

    /** Sets values of this vector and returns self
     *  @param {number} [x]
     *  @param {number} [y]
     *  @param {number} [z]
     *  @return {Vector3} */
    set(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; ASSERT_VECTOR3_VALID(this); return this; }

    /** Copies the values of another vector into this one and returns self
     *  @param {Vector3} v
     *  @return {Vector3} */
    setFrom(v) { return this.set(v.x, v.y, v.z); }

    /** Returns a new vector that is a copy of this
     *  @return {Vector3} */
    copy() { return new Vector3(this.x, this.y, this.z); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z); }

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    subtract(v) { return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z); }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    multiply(v) { return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z); }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    divide(v) { return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z); }

    /** Returns a copy of this vector scaled by the number passed in
     *  @param {number} s
     *  @return {Vector3} */
    scale(s) { return new Vector3(this.x * s, this.y * s, this.z * s); }

    /** Returns the length of this vector
     *  @return {number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     *  @return {number} */
    lengthSquared() { return this.x**2 + this.y**2 + this.z**2; }

    /** Returns a copy of this vector reflected by a surface normal
     *  @param {Vector3} normal - Surface normal, should be normalized
     *  @param {number} [restitution] - How much to bounce, 1 is a perfect bounce, 0 slides along the surface
     *  @return {Vector3} */
    reflect(normal, restitution=1) { return this.subtract(normal.scale((1 + restitution) * this.dot(normal))); }

    /** Returns the distance from this vector to the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    distance(v) { return this.distanceSquared(v)**.5; }

    /** Returns the distance squared from this vector to the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    distanceSquared(v) { return (this.x - v.x)**2 + (this.y - v.y)**2 + (this.z - v.z)**2; }

    /** Returns a new vector in the same direction with the length passed in, zero stays zero
     *  @param {number} [length]
     *  @return {Vector3} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector3;
    }

    /** Returns a new vector clamped to the length passed in
     *  @param {number} [length]
     *  @return {Vector3} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this.copy();
    }

    /** Returns the dot product of this vector and the vector passed in
     *  @param {Vector3} v
     *  @return {number} */
    dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }

    /** Returns a vector at right angles to both this and the one passed in
     *  @param {Vector3} v
     *  @return {Vector3} */
    cross(v)
    {
        return new Vector3(
            this.y*v.z - this.z*v.y,
            this.z*v.x - this.x*v.z,
            this.x*v.y - this.y*v.x);
    }

    /** Returns a new vector interpolated between this and the vector passed in, percent is clamped to 0-1
     *  @param {Vector3} v
     *  @param {number} percent
     *  @return {Vector3} */
    lerp(v, percent)
    {
        ASSERT_VECTOR3_VALID(v);
        return this.add(v.subtract(this).scale(clamp(percent)));
    }

    /** Returns a new vector turned around an axis, counter clockwise when the axis points at you
     *  @param {Vector3} axis - Unit length
     *  @param {number} angle - Radians
     *  @return {Vector3} */
    rotate(axis, angle)
    {
        ASSERT_VECTOR3_VALID(axis); // unlike Vector2.rotate this takes an axis first
        // Rodrigues' formula: the part along the axis stays, the rest turns
        const c = cos(angle), s = sin(angle), d = axis.dot(this) * (1 - c);
        return this.scale(c).add(axis.cross(this).scale(s)).add(axis.scale(d));
    }

    /** Returns a new vector turned around the X axis, the way a positive pitch in rotation3D turns things
     *  @param {number} angle - Radians
     *  @return {Vector3} */
    rotateX(angle)
    {
        const c = cos(angle), s = sin(angle);
        return new Vector3(this.x, this.y*c - this.z*s, this.y*s + this.z*c);
    }

    /** Returns a new vector turned around the Y axis, the way a positive yaw in rotation3D turns things
     *  @param {number} angle - Radians
     *  @return {Vector3} */
    rotateY(angle)
    {
        const c = cos(angle), s = sin(angle);
        return new Vector3(this.x*c + this.z*s, this.y, this.z*c - this.x*s);
    }

    /** Returns a new vector turned around the Z axis, the way a positive roll in rotation3D turns things
     *  @param {number} angle - Radians
     *  @return {Vector3} */
    rotateZ(angle)
    {
        const c = cos(angle), s = sin(angle);
        return new Vector3(this.x*c - this.y*s, this.x*s + this.y*c, this.z);
    }

    /** Returns a new vector with the absolute value of each component
     *  @return {Vector3} */
    abs() { return new Vector3(abs(this.x), abs(this.y), abs(this.z)); }

    /** Returns a new vector with each component floored
     *  @return {Vector3} */
    floor() { return new Vector3(floor(this.x), floor(this.y), floor(this.z)); }

    /** Returns a new vector with each component rounded
     *  @return {Vector3} */
    round() { return new Vector3(round(this.x), round(this.y), round(this.z)); }

    /** Returns a new vector snapped down to a grid, grid is the number of steps per unit like Vector2.snap
     *  @param {number} grid - Snap steps per unit, 2 snaps to halves
     *  @return {Vector3} */
    snap(grid)
    {
        ASSERT_NUMBER_VALID(grid);
        return new Vector3(floor(this.x*grid)/grid, floor(this.y*grid)/grid, floor(this.z*grid)/grid);
    }

    /** Returns this point transformed by a matrix, translation included
     *  @param {Matrix4} matrix
     *  @return {Vector3} */
    transform(matrix) { return matrix.transformPoint(this); }

    /** Returns this direction transformed by a matrix, rotation and scale only
     *  @param {Matrix4} matrix
     *  @return {Vector3} */
    transformDirection(matrix) { return matrix.transformDirection(this); }

    /** Checks if this is a valid vector
     *  @return {boolean} */
    isValid() { return isNumber(this.x) && isNumber(this.y) && isNumber(this.z); }

    /** Returns a string representation of this vector for debugging
     *  @param {number} [digits] - Number of digits to display
     *  @return {string} */
    toString(digits=3)
    {
        if (!this.isValid())
            return `(${this.x},${this.y},${this.z})`; // show the bad values instead of throwing
        const f = (v)=> (v < 0 ? '' : ' ') + v.toFixed(digits);
        return `(${f(this.x)},${f(this.y)},${f(this.z)} )`;
    }
}

///////////////////////////////////////////////////////////////////////////////

// scratch for multiply, nothing keeps a reference to it
const matrix4Scratch = new Float32Array(16);
const matrix4Identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

/**
 * 4x4 transform matrix for moving, rotating and scaling points in 3D
 * - Static builders like Matrix4.translation return a new matrix
 * - Methods on a matrix change it in place and return it, so calls can chain
 * - a.multiply(b) means b happens first, then a
 * - Stored the way WebGL wants it, so it can be sent to a shader as is
 * @memberof Math3D
 * @example
 * const m = buildMatrix(vec3(0, 1, 0), vec3(0, PI/2, 0)); // rotate then move up
 * const p = m.transformPoint(vec3(1, 0, 0));
 */
class Matrix4
{
    /** Create a matrix, identity by default
     *  @param {Float32Array|Array<number>} [m] - 16 column major values */
    constructor(m)
    {
        /** @property {Float32Array} - The 16 column major values */
        this.m = new Float32Array(16);
        ASSERT(!m || m.length == 16, 'Matrix4 takes 16 values, use copy() to duplicate a matrix');
        if (m)
            this.m.set(m);
        else
            this.m[0] = this.m[5] = this.m[10] = this.m[15] = 1;
    }

    /** Returns a new identity matrix
     *  @return {Matrix4} */
    static identity() { return new Matrix4; }

    /** Returns a new translation matrix
     *  @param {Vector3} v
     *  @return {Matrix4} */
    static translation(v)
    {
        ASSERT_VECTOR3_VALID(v);
        const r = new Matrix4;
        r.m[12] = v.x; r.m[13] = v.y; r.m[14] = v.z;
        return r;
    }

    /** Returns a rotation matrix, rolled first, then pitched, then yawed
     *  @param {Vector3} euler - vec3(pitch, yaw, roll) in radians
     *  @param {Matrix4} [matrix] - Written into instead of a new one, for a loop that builds many
     *  @return {Matrix4} */
    static rotation(euler, matrix=new Matrix4)
    {
        ASSERT_VECTOR3_VALID(euler);
        const cx = cos(euler.x), sx = sin(euler.x);
        const cy = cos(euler.y), sy = sin(euler.y);
        const cz = cos(euler.z), sz = sin(euler.z);
        const m = matrix.m;
        // R = Ry * Rx * Rz written out, column major, every element set so a reused matrix comes out clean
        m[0] = cy*cz + sy*sx*sz;  m[1] = cx*sz;  m[2]  = -sy*cz + cy*sx*sz; m[3] = 0;
        m[4] = -cy*sz + sy*sx*cz; m[5] = cx*cz;  m[6]  = sy*sz + cy*sx*cz;  m[7] = 0;
        m[8] = sy*cx;             m[9] = -sx;    m[10] = cy*cx;             m[11] = 0;
        m[12] = m[13] = m[14] = 0; m[15] = 1;
        return matrix;
    }

    /** Returns a new scale matrix
     *  @param {Vector3} v
     *  @return {Matrix4} */
    static scaling(v)
    {
        ASSERT_VECTOR3_VALID(v);
        const r = new Matrix4;
        r.m[0] = v.x; r.m[5] = v.y; r.m[10] = v.z;
        return r;
    }

    /** Returns a new perspective projection, camera looks down -Z
     *  @param {number} fov - Vertical field of view in radians
     *  @param {number} aspect - Width divided by height
     *  @param {number} near - Closest visible distance
     *  @param {number} far - Furthest visible distance, Infinity is allowed
     *  @return {Matrix4} */
    static perspective(fov, aspect, near, far)
    {
        ASSERT(near > 0 && far > near, 'a perspective projection needs 0 < near < far, or nothing is visible', near, far);
        const f = 1 / tan(fov/2);
        const r = new Matrix4;
        const m = r.m;
        m[0] = f / aspect;
        m[5] = f;
        m[10] = far == Infinity ? -1 : (far + near) / (near - far); // the infinite case is the limit of the formula
        m[11] = -1;
        m[14] = far == Infinity ? -2 * near : 2 * far * near / (near - far);
        m[15] = 0;
        return r;
    }

    /** Returns a new orthographic projection, camera looks down -Z
     *  @param {number} left - Edge of the visible box
     *  @param {number} right - Edge of the visible box
     *  @param {number} bottom - Edge of the visible box
     *  @param {number} top - Edge of the visible box
     *  @param {number} near - Closest visible distance
     *  @param {number} far - Furthest visible distance, Infinity is not allowed here
     *  @return {Matrix4} */
    static orthographic(left, right, bottom, top, near, far)
    {
        // an infinite far plane has no orthographic form: every depth would land on the near plane,
        // and the formula below works out to NaN, which quietly clips the whole scene away
        ASSERT(far > near && far != Infinity, 'an orthographic projection needs a real far plane past near, Infinity is perspective only', near, far);
        const r = new Matrix4;
        const m = r.m;
        m[0]  = 2 / (right - left);
        m[5]  = 2 / (top - bottom);
        m[10] = -2 / (far - near);
        m[12] = -(right + left) / (right - left);
        m[13] = -(top + bottom) / (top - bottom);
        m[14] = -(far + near) / (far - near);
        return r;
    }

    /** Returns the transform of something at eye turned to face target
     *  - Invert it to get a view matrix for a camera there
     *  @param {Vector3} eye
     *  @param {Vector3} target
     *  @param {Vector3} [up]
     *  @return {Matrix4} */
    static lookAt(eye, target, up=vec3(0, 1, 0))
    {
        let z = eye.subtract(target).normalize();
        if (!z.lengthSquared())
            z = vec3(0, 0, 1); // eye is on the target, face -Z
        let x = up.cross(z).normalize();
        if (!x.lengthSquared()) // up is along the view direction, pick another
            x = (abs(z.y) > .99 ? vec3(0, 0, 1) : vec3(0, 1, 0)).cross(z).normalize();
        const y = z.cross(x);
        return new Matrix4([x.x, x.y, x.z, 0,  y.x, y.y, y.z, 0,  z.x, z.y, z.z, 0,  eye.x, eye.y, eye.z, 1]);
    }

    /** Returns a new matrix that is a copy of this
     *  @return {Matrix4} */
    copy() { return new Matrix4(this.m); }

    /** Multiply this matrix by another and return this, the other happens first
     *  @param {Matrix4} matrix
     *  @return {Matrix4} */
    multiply(matrix)
    {
        const a = this.m, b = matrix.m, r = matrix4Scratch;
        for (let j = 0; j < 4; ++j)
        for (let i = 0; i < 4; ++i)
            r[j*4 + i] = a[i]*b[j*4] + a[4 + i]*b[j*4 + 1] + a[8 + i]*b[j*4 + 2] + a[12 + i]*b[j*4 + 3];
        this.m.set(r);
        return this;
    }

    /** Append a translation, returns self
     *  @param {Vector3} v
     *  @return {Matrix4} */
    translate(v) { return this.multiply(Matrix4.translation(v)); }

    /** Append a rotation, returns self
     *  @param {Vector3} euler - vec3(pitch, yaw, roll) in radians
     *  @return {Matrix4} */
    rotate(euler) { return this.multiply(Matrix4.rotation(euler)); }

    /** Append a scale, returns self
     *  @param {Vector3} v
     *  @return {Matrix4} */
    scale(v) { return this.multiply(Matrix4.scaling(v)); }

    /** Transpose this matrix in place, returns self
     *  @return {Matrix4} */
    transpose()
    {
        const m = this.m;
        for (let i = 0; i < 4; ++i)
        for (let j = i + 1; j < 4; ++j)
        {
            const t = m[i*4 + j];
            m[i*4 + j] = m[j*4 + i];
            m[j*4 + i] = t;
        }
        return this;
    }

    /** Flip this matrix so it undoes itself, returns this and does nothing if it cannot be inverted
     *  @return {Matrix4} */
    invert()
    {
        const m = this.m;
        const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
        const b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10;
        const b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12;
        const b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30;
        const b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
        let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
        if (!det)
            return this;
        det = 1 / det;
        m[0]  = (a11*b11 - a12*b10 + a13*b09) * det;
        m[1]  = (a02*b10 - a01*b11 - a03*b09) * det;
        m[2]  = (a31*b05 - a32*b04 + a33*b03) * det;
        m[3]  = (a22*b04 - a21*b05 - a23*b03) * det;
        m[4]  = (a12*b08 - a10*b11 - a13*b07) * det;
        m[5]  = (a00*b11 - a02*b08 + a03*b07) * det;
        m[6]  = (a32*b02 - a30*b05 - a33*b01) * det;
        m[7]  = (a20*b05 - a22*b02 + a23*b01) * det;
        m[8]  = (a10*b10 - a11*b08 + a13*b06) * det;
        m[9]  = (a01*b08 - a00*b10 - a03*b06) * det;
        m[10] = (a30*b04 - a31*b02 + a33*b00) * det;
        m[11] = (a21*b02 - a20*b04 - a23*b00) * det;
        m[12] = (a11*b07 - a10*b09 - a12*b06) * det;
        m[13] = (a00*b09 - a01*b07 + a02*b06) * det;
        m[14] = (a31*b01 - a30*b03 - a32*b00) * det;
        m[15] = (a20*b03 - a21*b01 + a22*b00) * det;
        return this;
    }

    /** Transform a point, translation included
     *  @param {Vector3} v
     *  @return {Vector3} */
    transformPoint(v)
    {
        const m = this.m;
        return new Vector3(
            m[0]*v.x + m[4]*v.y + m[8]*v.z  + m[12],
            m[1]*v.x + m[5]*v.y + m[9]*v.z  + m[13],
            m[2]*v.x + m[6]*v.y + m[10]*v.z + m[14]);
    }

    /** Transform a direction, rotation and scale only
     *  @param {Vector3} v
     *  @return {Vector3} */
    transformDirection(v)
    {
        const m = this.m;
        return new Vector3(
            m[0]*v.x + m[4]*v.y + m[8]*v.z,
            m[1]*v.x + m[5]*v.y + m[9]*v.z,
            m[2]*v.x + m[6]*v.y + m[10]*v.z);
    }

    /** Returns the translation part of this matrix
     *  @return {Vector3} */
    getTranslation() { return new Vector3(this.m[12], this.m[13], this.m[14]); }

    /** Returns a string representation of this matrix for debugging
     *  @return {string} */
    toString()
    {
        const m = this.m, f = (i)=> m[i].toFixed(2).padStart(7);
        let s = '';
        for (let row = 0; row < 4; ++row)
            s += `[${f(row)} ${f(4 + row)} ${f(8 + row)} ${f(12 + row)} ]\n`;
        return s;
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Build a transform for an object from its position, rotation and scale
 * - A point is scaled first, then rotated, then moved, which is what you want for a game object
 * @param {Vector3} [pos]
 * @param {Vector3} [rotation] - vec3(pitch, yaw, roll) in radians
 * @param {Vector3} [scale]
 * @param {Matrix4} [matrix] - Written into instead of a new one, for a loop that builds many
 * @return {Matrix4}
 * @memberof Math3D
 */
function buildMatrix(pos, rotation, scale, matrix=new Matrix4)
{
    ASSERT(!pos || isVector3(pos), 'pos must be a Vector3', pos);
    ASSERT(!scale || isVector3(scale), 'scale must be a Vector3', scale);
    ASSERT(matrix instanceof Matrix4, 'the matrix to write into must be a Matrix4');
    // scale the rotation columns and drop the position in, instead of multiplying three matrices
    // an object that is not turned at all is most of a big scene, and identity is what the six
    // trig calls would have worked out to anyway
    const turned = rotation && (rotation.x || rotation.y || rotation.z), m = matrix.m;
    turned ? Matrix4.rotation(rotation, matrix) : m.set(matrix4Identity);
    if (scale)
    {
        m[0] *= scale.x; m[1] *= scale.x; m[2]  *= scale.x;
        m[4] *= scale.y; m[5] *= scale.y; m[6]  *= scale.y;
        m[8] *= scale.z; m[9] *= scale.z; m[10] *= scale.z;
    }
    if (pos)
        m[12] = pos.x, m[13] = pos.y, m[14] = pos.z;
    return matrix;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Ray3D - A start point and a direction, what screenToRay returns and the raycast helpers take
 * - The direction need not be unit length, the distances that come back are in units of it
 * @memberof Math3D
 * @example
 * const ray = render3D.screenToRay(mousePosScreen);
 * const distance = raycastPlane(ray, vec3(), vec3(0, 1, 0));
 * if (distance !== undefined)
 *     ball.pos3D = ray.getPosition(distance);
 */
class Ray3D
{
    /** Create a ray
     *  @param {Vector3} [origin]
     *  @param {Vector3} [direction] - Defaults to -Z, forward */
    constructor(origin=vec3(), direction=vec3(0, 0, -1))
    {
        ASSERT_VECTOR3_VALID(origin);
        ASSERT_VECTOR3_VALID(direction);
        /** @property {Vector3} - Where the ray starts */
        this.origin = origin;
        /** @property {Vector3} - Which way it goes */
        this.direction = direction;
    }

    /** Returns the point a distance along the ray
     *  @param {number} distance - What the raycast helpers return
     *  @return {Vector3} */
    getPosition(distance) { return this.origin.add(this.direction.scale(distance)); }

    /** Returns a new ray that is a copy of this
     *  @return {Ray3D} */
    copy() { return new Ray3D(this.origin.copy(), this.direction.copy()); }
}

///////////////////////////////////////////////////////////////////////////////
// 3D collision helpers, none of them change anything that is passed in
// Boxes sit centered on pos and take a full size, like drawRect
// Cylinders stand up the Y axis, centered on pos, with a full height
// Names that could be mistaken for 2D functions get a 3D suffix

/**
 * Check if a point is inside an axis aligned box, boundary is inclusive
 * @param {Vector3} point
 * @param {Vector3} pos - Center of the box
 * @param {Vector3} size - Full size of the box
 * @return {boolean}
 * @memberof Math3D
 */
function isPointInBox3D(point, pos, size)
{
    return abs(point.x - pos.x) <= size.x/2 &&
        abs(point.y - pos.y) <= size.y/2 &&
        abs(point.z - pos.z) <= size.z/2;
}

/**
 * Check if two axis aligned boxes are overlapping, touching edges do not overlap
 * @param {Vector3} posA
 * @param {Vector3} sizeA - Full size of box A
 * @param {Vector3} posB
 * @param {Vector3} [sizeB] - Full size of box B, zero for a point
 * @return {boolean}
 * @memberof Math3D
 */
function isOverlapping3D(posA, sizeA, posB, sizeB=vec3())
{
    const d = posA.subtract(posB);
    return abs(d.x) < (sizeA.x + sizeB.x)/2 &&
        abs(d.y) < (sizeA.y + sizeB.y)/2 &&
        abs(d.z) < (sizeA.z + sizeB.z)/2;
}

/**
 * Returns the vector to move sphere A by so it no longer overlaps sphere B, or undefined
 * @param {Vector3} posA
 * @param {number} radiusA
 * @param {Vector3} posB
 * @param {number} radiusB
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereSphere(posA, radiusA, posB, radiusB)
{
    const d = posA.subtract(posB);
    const r = radiusA + radiusB;
    const dist = d.length();
    if (dist >= r)
        return undefined;
    if (!dist)
        return vec3(0, r, 0); // coincident centers, push straight up
    return d.normalize(r - dist);
}

/**
 * Returns the vector to move a sphere out of an axis aligned box, or undefined
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @param {Vector3} boxPos
 * @param {Vector3} boxSize - Full size of the box
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereBox(pos, radius, boxPos, boxSize)
{
    const h = boxSize.scale(.5);
    const closest = vec3(
        clamp(pos.x, boxPos.x - h.x, boxPos.x + h.x),
        clamp(pos.y, boxPos.y - h.y, boxPos.y + h.y),
        clamp(pos.z, boxPos.z - h.z, boxPos.z + h.z));
    const d = pos.subtract(closest), distSq = d.lengthSquared();
    if (distSq)
        return distSq >= radius*radius ? undefined : d.normalize(radius - distSq**.5);

    // center is inside the box, push out along the axis of least penetration
    const offset = pos.subtract(boxPos);
    return pushOutAxis3D(offset, h.x - abs(offset.x), h.y - abs(offset.y), h.z - abs(offset.z), radius);
}

/**
 * Returns the vector to move a sphere back inside an axis aligned box, or undefined when it is all inside
 * - The inside out twin of collideSphereBox, for keeping things in a room or an arena
 * - A sphere too big for the box on some axis is held at the middle of it on that axis
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @param {Vector3} boxPos
 * @param {Vector3} boxSize - Full size of the box
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereInBox(pos, radius, boxPos, boxSize)
{
    // the box shrunk by the radius is everywhere the center can be, so clamp the center into it
    const x = max(0, boxSize.x/2 - radius), y = max(0, boxSize.y/2 - radius), z = max(0, boxSize.z/2 - radius);
    const push = vec3(
        clamp(pos.x, boxPos.x - x, boxPos.x + x) - pos.x,
        clamp(pos.y, boxPos.y - y, boxPos.y + y) - pos.y,
        clamp(pos.z, boxPos.z - z, boxPos.z + z) - pos.z);
    return push.lengthSquared() ? push : undefined;
}

// the axis with the smallest penetration, pointing the way d does, with extra distance added
function pushOutAxis3D(d, penX, penY, penZ, extra=0)
{
    const s = (v)=> v >= 0 ? 1 : -1; // sign() gives 0 on a tie, which would be no push
    if (penX <= penY && penX <= penZ)
        return vec3(s(d.x)*(penX + extra), 0, 0);
    if (penY <= penZ)
        return vec3(0, s(d.y)*(penY + extra), 0);
    return vec3(0, 0, s(d.z)*(penZ + extra));
}

/**
 * Returns the vector to move a sphere out of a vertical cylinder, or undefined
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @param {Vector3} cylinderPos
 * @param {number} cylinderRadius
 * @param {number} cylinderHeight - Full height along Y
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideSphereCylinder(pos, radius, cylinderPos, cylinderRadius, cylinderHeight)
{
    const halfHeight = cylinderHeight/2;
    const offsetX = pos.x - cylinderPos.x;
    const offsetZ = pos.z - cylinderPos.z;
    const offsetY = pos.y - cylinderPos.y;
    const radialDist = (offsetX**2 + offsetZ**2)**.5;
    const radialScale = radialDist ? min(radialDist, cylinderRadius)/radialDist : 0; // pull the point onto the wall, or the axis
    const closest = vec3(
        cylinderPos.x + offsetX*radialScale,
        clamp(pos.y, cylinderPos.y - halfHeight, cylinderPos.y + halfHeight),
        cylinderPos.z + offsetZ*radialScale);
    const d = pos.subtract(closest), distSq = d.lengthSquared();
    if (distSq)
        return distSq >= radius*radius ? undefined : d.normalize(radius - distSq**.5);

    // center is inside the cylinder, push out through the nearer surface
    const sidePen = cylinderRadius - radialDist;
    const capPen = halfHeight - abs(offsetY);
    if (sidePen <= capPen)
    {
        const dir = radialDist ? vec3(offsetX/radialDist, 0, offsetZ/radialDist) : vec3(1, 0, 0);
        return dir.scale(sidePen + radius);
    }
    return vec3(0, (offsetY >= 0 ? 1 : -1)*(capPen + radius), 0);
}

/**
 * Returns the vector to move box A by so it no longer overlaps box B, the shortest way out, or undefined
 * - The 3D twin of collideBoxBox
 * @param {Vector3} posA
 * @param {Vector3} sizeA - Full size of box A
 * @param {Vector3} posB
 * @param {Vector3} sizeB - Full size of box B
 * @return {Vector3|undefined}
 * @memberof Math3D
 */
function collideBoxBox3D(posA, sizeA, posB, sizeB)
{
    const d = posA.subtract(posB);
    const overlapX = (sizeA.x + sizeB.x)/2 - abs(d.x);
    const overlapY = (sizeA.y + sizeB.y)/2 - abs(d.y);
    const overlapZ = (sizeA.z + sizeB.z)/2 - abs(d.z);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0)
        return undefined;
    return pushOutAxis3D(d, overlapX, overlapY, overlapZ);
}

/**
 * Returns the distance along the ray to the first intersection with a sphere, or undefined
 * - The hit is ray.getPosition(distance), a direction that is not unit length scales the distance
 * - A ray starting inside the sphere is already there, so it gets back 0
 * @param {Ray3D} ray
 * @param {Vector3} pos - Sphere center
 * @param {number} radius
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastSphere(ray, pos, radius)
{
    const {origin, direction} = ray;
    const oc = origin.subtract(pos);
    const a = direction.dot(direction);
    if (!a)
        return undefined;
    const c = oc.dot(oc) - radius*radius;
    if (c < 0)
        return 0; // origin is inside the sphere
    const b = 2*oc.dot(direction);
    const discriminant = b*b - 4*a*c;
    if (discriminant < 0)
        return undefined;
    const t = (-b - discriminant**.5)/(2*a);
    return t >= 0 ? t : undefined;
}

/**
 * Returns the distance along the ray to a plane, or undefined if parallel or behind
 * - The hit is ray.getPosition(distance), a direction that is not unit length scales the distance
 * @param {Ray3D} ray
 * @param {Vector3} planePos
 * @param {Vector3} planeNormal
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastPlane(ray, planePos, planeNormal)
{
    const {origin, direction} = ray;
    const denominator = direction.dot(planeNormal);
    if (abs(denominator) < 1e-9)
        return undefined;
    const t = planePos.subtract(origin).dot(planeNormal)/denominator;
    return t < 0 ? undefined : t;
}

/**
 * Returns the distance along the ray to the first intersection with an axis aligned box, or undefined
 * - The hit is ray.getPosition(distance), a direction that is not unit length scales the distance
 * - A ray starting inside the box is already there, so it gets back 0
 * @param {Ray3D} ray
 * @param {Vector3} pos - Center of the box
 * @param {Vector3} size - Full size of the box
 * @return {number|undefined}
 * @memberof Math3D
 */
function raycastBox(ray, pos, size)
{
    const {origin, direction} = ray;
    const h = size.scale(.5);
    const boxMin = pos.subtract(h), boxMax = pos.add(h);
    let tMin = 0, tMax = Infinity;
    for (const axis of 'xyz')
    {
        const o = origin[axis], d = direction[axis];
        const mn = boxMin[axis], mx = boxMax[axis];
        if (!d)
        {
            if (o < mn || o > mx)
                return undefined; // ray is parallel to this slab and outside it
            continue;
        }
        let t0 = (mn - o)/d;
        let t1 = (mx - o)/d;
        if (t0 > t1)
            [t0, t1] = [t1, t0];
        tMin = max(tMin, t0);
        tMax = min(tMax, t1);
        if (tMin > tMax)
            return undefined;
    }
    return tMin;
}

/**
 * LittleJS 3D Rendering Plugin
 * - Adds a 3D scene that draws into the same WebGL canvas as the 2D game
 * - Call new Render3DPlugin() in gameInit, then move render3D.camera and make EngineObject3D objects
 * - EngineObject3D is an EngineObject with a 3D position, rotation and mesh
 * - The 3D scene draws under the 2D sprites, so HUD and text land on top
 * - Lighting is the sun plus ambient, with optional extra lights, fog and shadows
 * - Any object or draw can bring its own Shader, a mainImage snippet the lighting then applies to
 * - Build shapes with buildBox, buildSphere, buildGrid and buildLathe; the other builders, terrain, particles,
 *   camera controls and the OBJ loader are in the Render3D Extras plugin, which goes after this one
 * - Requires the Math3D plugin
 * @namespace Render3D
 */

///////////////////////////////////////////////////////////////////////////////

/** Global Render3D plugin object
 *  @type {Render3DPlugin}
 *  @memberof Render3D */
let render3D;

// vertex format: position xyz, normal xyz, uv, rgba bytes
const RENDER3D_VERTEX_FLOATS = 9;
const RENDER3D_VERTEX_BYTES = RENDER3D_VERTEX_FLOATS * 4;

// per draw values the shaders read as vertex attributes: the model matrix columns (4-7), the tint (11) and the
// uv rect (12); constants for one draw, one per instance for a batch; the shader derives the normal matrix
const RENDER3D_INSTANCE_FLOATS = 24;
const RENDER3D_INSTANCE_BYTES = RENDER3D_INSTANCE_FLOATS * 4;
const RENDER3D_INSTANCE_ATTRIBS = [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 4, 48], [11, 4, 64], [12, 4, 80]];
const RENDER3D_VERTEX_INPUTS =
    'layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 t;layout(location=3) in vec4 c;' +
    'layout(location=4) in vec4 m0;layout(location=5) in vec4 m1;layout(location=6) in vec4 m2;layout(location=7) in vec4 m3;' +
    'layout(location=11) in vec4 tint;layout(location=12) in vec4 uvRect;';
const RENDER3D_MAX_STREAM_VERTS = 32768;
const RENDER3D_MAX_LIGHTS = 8; // Light3D objects per frame, the shader loops over this many
const RENDER3D_QUAD_UVS = Object.freeze([vec2(0, 0), vec2(0, 1), vec2(1, 0), vec2(1, 1)].map(uv=> Object.freeze(uv))); // strip order
const RENDER3D_FULL_UV_RECT = Object.freeze({x:0, y:0, w:1, h:1});
const RENDER3D_DEFAULT_NORMAL = Object.freeze(vec3(0, 1, 0));
const RENDER3D_DEFAULT_UV = Object.freeze(vec2());
const RENDER3D_SHADOW_COLOR = Object.freeze(hsl(0, 0, 0, .5));
const RENDER3D_IDENTITY = new Matrix4; // never modified
const RENDER3D_DEBUG_WIDTH = .05; // line width of the debug primitives
///////////////////////////////////////////////////////////////////////////////
// Private helpers

// outward normal of a triangle or a quad given its corners in loop order,
// from the diagonals so a collapsed corner still works
function render3DFaceNormal(a, b, c, d=a)
{
    const n = c.subtract(a).cross(d.subtract(b));
    return n.lengthSquared() ? n.normalize() : RENDER3D_DEFAULT_NORMAL;
}

// a quad's corners in loop order as a strip, the one place that knows the order
function render3DQuadStrip(a, b, c, d) { return [a, b, d, c]; }

// per corner values (colors, uvs) into strip order, a single value passes through
function render3DQuadValues(v) { return isArray(v) ? render3DQuadStrip(...v) : v; }

// 3D draws are only valid during the pass with a live shader
function render3DCanDraw()
{
    if (!render3D.program) return false;
    ASSERT(render3D.isRendering, '3D draws are only valid during the 3D pass, draw from an EngineObject3D or render3D.onRenderOpaque');
    return render3D.isRendering;
}

// the draw state fields a batch is drawn under; lights and fog are not captured, they are read live at flush
const RENDER3D_STATE_FIELDS = ['blend', 'additive', 'depthTest', 'depthWrite', 'cullBackFaces', 'mirrored', 'lighting', 'emissive', 'receiveShadow', 'specular', 'pixelated', 'shader'];

// a copy of the draw state in one fixed shape, the fields of RENDER3D_STATE_FIELDS written out so the
// compare below stays a handful of direct reads, it runs for every instance drawn
function render3DCaptureBatchState()
{
    const r = render3D;
    return {blend: r.blend, additive: r.additive, depthTest: r.depthTest, depthWrite: r.depthWrite,
        cullBackFaces: r.cullBackFaces, mirrored: r.mirrored, lighting: r.lighting, emissive: r.emissive,
        receiveShadow: r.receiveShadow, specular: r.specular, pixelated: r.pixelated, shader: r.shader};
}

// put a captured draw state back, written out the same way; the transparent stage does this for every queued draw
function render3DApplyBatchState(s)
{
    const r = render3D;
    r.blend = s.blend, r.additive = s.additive, r.depthTest = s.depthTest, r.depthWrite = s.depthWrite,
    r.cullBackFaces = s.cullBackFaces, r.mirrored = s.mirrored, r.lighting = s.lighting, r.emissive = s.emissive,
    r.receiveShadow = s.receiveShadow, r.specular = s.specular, r.pixelated = s.pixelated, r.shader = s.shader;
}

// true when the current draw state differs from a captured one, so a pending batch must flush first
function render3DStateChanged(s)
{
    const r = render3D;
    return r.blend !== s.blend || r.additive !== s.additive || r.depthTest !== s.depthTest
        || r.depthWrite !== s.depthWrite || r.cullBackFaces !== s.cullBackFaces || r.mirrored !== s.mirrored
        || r.lighting !== s.lighting || r.emissive !== s.emissive || r.receiveShadow !== s.receiveShadow
        || r.specular !== s.specular || r.pixelated !== s.pixelated || r.shader !== s.shader;
}

// whether a sphere is inside the view, or the shadow map's box during the shadow pass, without a vector
function render3DSphereVisible(x, y, z, radius)
{
    const planes = render3D.shadowPass ? render3D.shadowPlanes : render3D.frustumPlanes;
    for (let i = 0; i < planes.length; ++i)
    {
        const p = planes[i];
        if (p[0]*x + p[1]*y + p[2]*z + p[3] < -radius)
            return false;
    }
    return true;
}

// run a function with some draw state fields overridden, restored afterward even on a throw
function render3DWithState(fields, fn)
{
    const r = render3D, saved = {};
    for (const key in fields)
        saved[key] = r[key], r[key] = fields[key];
    try { return fn(); }
    finally { Object.assign(r, saved); }
}

// which side of the 2D scene an object draws on, its own flag or the plugin default
function render3DIsAfter2D(o) { return !!(o.renderAfter2D ?? render3D.renderAfter2D); }

// a size given as a number or a vec3
function render3DSize3(size) { return isNumber(size) ? vec3(size) : size; }

// a transform given as a matrix, or as a vec3 for one that only moves there
function render3DMatrix(matrix)
{
    if (matrix instanceof Vector3)
        return buildMatrix(matrix);
    ASSERT(matrix instanceof Matrix4, 'takes a Matrix4, or a Vector3 for a position');
    return matrix;
}

// the matrix that keeps normals pointing out when an object is scaled unevenly
function render3DNormalMatrix(matrix) { return matrix.copy().invert().transpose(); }

// a column of a matrix as a direction: 0 is the right axis, 4 up, 8 back
function render3DAxis(m, i) { return vec3(m[i], m[i+1], m[i+2]); }

// the largest axis scale of a matrix, how much it grows a bounding sphere
function render3DMaxScale(m)
{
    return max(m[0]*m[0] + m[1]*m[1] + m[2]*m[2], m[4]*m[4] + m[5]*m[5] + m[6]*m[6], m[8]*m[8] + m[9]*m[9] + m[10]*m[10]) ** .5;
}

// a quad as a strip from its center and half axes, the same corner order as render3DQuadStrip
function render3DQuadAxes(center, right, up)
{
    return [center.subtract(right).add(up), center.subtract(right).subtract(up),
        center.add(right).add(up), center.add(right).subtract(up)];
}

// set the draw state for an object's render3D, or the defaults for the stage callbacks
function render3DSetObjectState(o)
{
    const r = render3D;
    const emissive = o?.emissive || 0;
    ASSERT(isNumber(emissive) && emissive >= 0, 'emissive must be a number, 0 or more', emissive);
    r.lighting = true;
    r.emissive = emissive;
    r.additive = !!o?.additive;
    r.specular = o?.specular || 0;
    r.receiveShadow = !o || o.receiveShadow;
    r.cullBackFaces = r.mirrored = false; // each mesh sets these as it draws
    r.pixelated = !!o?.pixelated;
    ASSERT(!o?.shader || o.shader instanceof Shader, 'shader must be a Shader, not the snippet itself');
    r.shader = o?.shader || undefined; // null is no shader too, so it batches with none
    r.depthTest = true;
}

// draw objects each with the draw state set from its own flags, then reset to the defaults
function render3DDrawObjects(objects)
{
    for (const o of objects)
    {
        render3DSetObjectState(o);
        o.render3D();
    }
    render3DSetObjectState();
}

// add a draw of a mesh to its batch; a batch is one mesh under one texture and draw state, so a change flushes it
function render3DInstance(mesh, matrix, tileInfo, color)
{
    const k = render3DInstanceSlot(mesh, tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo), data = mesh.instanceData;
    data.set(matrix.m, k);
    if (!render3D.shadowPass) // the depth shader reads only the matrix and the uv rect, the tint can stay stale
        data[k+16] = color.r, data[k+17] = color.g, data[k+18] = color.b, data[k+19] = color.a;
    const uv = render3DGetTileUVs(tileInfo);
    data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
}

// make room for one more instance of a mesh under a texture and the current draw state, flushing a batch that
// differs first, and return where its 24 floats go in mesh.instanceData: the matrix, the tint and the uv rect
function render3DInstanceSlot(mesh, textureInfo)
{
    const r = render3D;
    if (mesh.instanceCount && (mesh.instanceTextureInfo !== textureInfo || render3DStateChanged(mesh.instanceState)))
        render3DFlushInstances(mesh);
    if (!mesh.instanceCount)
    {
        mesh.instanceTextureInfo = textureInfo;
        mesh.instanceState = render3DCaptureBatchState();
        r.instanceMeshes.push(mesh);
    }

    // room for one more, doubling as the batch grows
    const data = mesh.instanceData, k = mesh.instanceCount++ * RENDER3D_INSTANCE_FLOATS;
    if (!data || data.length < k + RENDER3D_INSTANCE_FLOATS)
    {
        const grown = new Float32Array(max(64 * RENDER3D_INSTANCE_FLOATS, data ? data.length * 2 : 0));
        data && grown.set(data);
        mesh.instanceData = grown;
    }
    return k;
}

// draw the pending batches, or just one mesh's, each as a single instanced call
function render3DFlushInstances(only)
{
    const r = render3D, gl = glContext;
    for (const mesh of only ? [only] : r.instanceMeshes)
    {
        const count = mesh.instanceCount;
        mesh.instanceCount = 0;
        if (!count || !mesh.buffer) continue;

        // the per instance values on top of the constant attributes, then the mesh under them
        // a ring of buffers with fresh storage each time, so the driver never waits for a draw still reading one
        const buffers = r.instanceBuffers, buffer = buffers[r.instanceBufferIndex = (r.instanceBufferIndex + 1) % buffers.length];
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.instanceData, gl.DYNAMIC_DRAW, 0, count * RENDER3D_INSTANCE_FLOATS);
        render3DDrawInstanced(mesh, buffer, count, mesh.instanceTextureInfo, mesh.instanceState);
    }
    if (!only)
        r.instanceMeshes.length = 0;
    else
    {
        const i = r.instanceMeshes.indexOf(only);
        i < 0 || r.instanceMeshes.splice(i, 1);
    }
}

// draw a mesh count times from a buffer that holds the per instance values, under a draw state
// the arrays are turned on with their instance divisor for this one call and both are turned off after: a single
// draw reads these slots as constant attributes, and in Firefox a draw that reads a constant through a slot whose
// divisor is set leaves the next batch on that slot reading the wrong values
function render3DDrawInstanced(mesh, buffer, count, textureInfo, state)
{
    const gl = glContext;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [location, size, offset] of RENDER3D_INSTANCE_ATTRIBS)
    {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, RENDER3D_INSTANCE_BYTES, offset);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 1);
    }
    render3DSetDrawUniforms(RENDER3D_IDENTITY, textureInfo, WHITE, RENDER3D_FULL_UV_RECT, state);
    render3DBindMesh(mesh);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.bufferCount, mesh.indexType, 0, count);
    for (const [location] of RENDER3D_INSTANCE_ATTRIBS)
    {
        gl.disableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 0);
    }
    ++drawCount;
    primitiveCount += mesh.bufferCount / 3 * count;
}

// forget the pending batches, for a frame that threw or a lost context
function render3DClearInstances()
{
    for (const mesh of render3D.instanceMeshes)
        mesh.instanceCount = 0;
    render3D.instanceMeshes.length = 0;
}

// the live objects drawn on one side of the 2D scene
function render3DLayerObjects(after2D)
{ return engineObjects.filter(o=> !o.destroyed && o instanceof EngineObject3D && render3DIsAfter2D(o) === after2D); }

// the Light3D objects the shader gets this frame: directional lights light the whole scene so they come first,
// then the point lights nearest the camera
function render3DCollectLights()
{
    // a light switched off by its radius or its alpha is left out, so it cannot take one of the few slots
    const lights = engineObjects.filter(o=> !o.destroyed && o instanceof Light3D &&
        o.color.a > 0 && o.intensity > 0 && (o.directional || o.radius > 0));
    if (lights.length > RENDER3D_MAX_LIGHTS)
    {
        // distances cached once, getWorldPos3D walks the parent chain and the sort asks many times
        const cameraPos = render3D.camera.pos, distances = new Map;
        for (const light of lights)
            distances.set(light, light.directional ? -1 : light.getWorldPos3D().distanceSquared(cameraPos));
        lights.sort((a, b)=> distances.get(a) - distances.get(b));
        lights.length = RENDER3D_MAX_LIGHTS;
    }
    return lights;
}

// unit circle directions for a number of sides, [cos, sin, cos, sin, ...] including the closing point, cached
const render3DCircleCache = new Map;
function render3DCircle(sides)
{
    sides |= 0;
    let circle = render3DCircleCache.get(sides);
    if (!circle)
    {
        circle = new Float32Array(sides * 2 + 2);
        for (let i = 0; i <= sides; ++i)
        {
            const a = i / sides * 2 * PI;
            circle[i*2] = cos(a), circle[i*2 + 1] = sin(a);
        }
        render3DCircleCache.set(sides, circle);
    }
    return circle;
}

// the rotation that points -Z along a direction, as vec3(pitch, yaw, 0); a zero direction keeps the current one
function render3DLookRotation(direction, current)
{
    const d = direction.normalize();
    if (!d.lengthSquared()) return current;
    if (abs(d.x) + abs(d.z) < 1e-9) // straight up or down has no yaw of its own
        return vec3(d.y > 0 ? PI / 2 : -PI / 2, current.y, 0);
    return vec3(Math.asin(clamp(d.y, -1, 1)), atan2(-d.x, -d.z), 0);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Render3D Plugin - The 3D renderer, camera, lights, shadows and fog
 * - There is one of these, in the global render3D
 * - It draws the 3D scene before gameRender, so 2D drawing lands on top
 * - Set renderAfter2D to draw the 3D scene over the 2D scene instead
 * - Settings like lighting and specular are read as each thing draws
 * - Every object sets them from its own flags, so you rarely touch them
 * @memberof Render3D
 * @example
 * new Render3DPlugin;
 * render3D.camera.pos = vec3(0, 5, 10);
 * render3D.camera.lookAt(vec3());
 * new EngineObject3D(vec3(), buildBox());
 */
class Render3DPlugin
{
    /** Create the global 3D renderer, call in gameInit */
    constructor()
    {
        ASSERT(!render3D, 'Render3D plugin already initialized');
        render3D = this;

        /** @property {Camera3D} - The camera */
        this.camera = new Camera3D;

        // lights and fog
        /** @property {Vector3} - Direction toward the sun, where its light comes from, like a directional Light3D;
         *  read at each draw, and any length will do, the shading and the shadows normalize it themselves;
         *  the sun is the one light that casts shadows */
        this.sunDirection = vec3(-.3, 1, .5);
        /** @property {Color} - Sunlight color */
        this.sunColor = WHITE.copy();
        /** @property {Color} - Ambient light color, from above when ambientGroundColor is set */
        this.ambientColor = hsl(0, 0, .3);
        /** @property {Color|undefined} - Ambient light from below: set, the ambient blends from this on faces pointing down
         *  to ambientColor on faces pointing up, the way a sky and a ground light a scene; setSky sets both from its colors
         *  @type {Color|undefined} */
        this.ambientGroundColor = undefined;
        /** @property {Color|undefined} - Fog color, uses canvasClearColor when undefined
         *  @type {Color|undefined} */
        this.fogColor = undefined;
        /** @property {number} - Distance from the camera where fog starts */
        this.fogStart = 0;
        /** @property {number} - Distance from the camera where fog is total, 0 disables fog */
        this.fogEnd = 0;
        /** @property {Vector3} - Added to the velocity3D of every object with a mass each frame, scaled by its gravityScale; sync2D objects use the 2D gravity */
        this.gravity = vec3();
        /** @property {number|HeightMap|Function} - Floor for objects with a softShadow: a height, a HeightMap, or (x, z) => y
         *  @type {number|HeightMap|Function} */
        this.softShadowHeight = 0;
        /** @property {boolean} - Default for every builder's smooth argument: true for smooth vertex normals, false for flat faces */
        this.smoothShading = false;

        // shadows
        /** @property {boolean} - Cast real shadows from the sun, off by default and free when off */
        this.shadows = false;
        /** @property {number} - Size of the shadow map in pixels, bigger is sharper and slower */
        this.shadowMapSize = 1024;
        /** @property {number} - World size the shadow map covers around shadowCenter, smaller is sharper; it is a square
         *  facing the light, so it turns as the light does, and about 1.5 times an area's width covers it from any angle */
        this.shadowRange = 40;
        /** @property {Vector3|undefined} - Center of the shadowed area, read each frame, undefined follows the camera
         *  @type {Vector3|undefined} */
        this.shadowCenter = undefined;
        /** @property {number} - Stops surfaces shadowing themselves, raise for speckles, lower if shadows drift off */
        this.shadowBias = .003;
        /** @property {number} - How much to blur the shadow edges */
        this.shadowSoftness = 1;

        // draw state, read at each draw
        /** @property {boolean} - Apply lighting, when false draws plain vertex color times texture and casts no shadow;
         *  off for billboards, lines, ribbons and soft discs, an object sets emissive instead */
        this.lighting = true;
        /** @property {number} - How much a surface lights itself, set per object by its emissive */
        this.emissive = 0;
        /** @property {boolean} - Additive blending instead of alpha, in the transparent stage */
        this.additive = false;
        /** @property {boolean} - Test against the depth buffer, reset to true before each object and callback */
        this.depthTest = true;
        /** @property {boolean} - Write to the depth buffer, owned by the stages: on for opaque, off for transparent */
        this.depthWrite = true;
        // batch state set by drawMesh from each mesh: whether its back faces are skipped, off for strips so they
        // show from both sides, and whether its transform mirrors it so the other winding is the front
        this.cullBackFaces = false;
        this.mirrored = false;
        /** @property {number} - Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and 1 adds a light's full color at its brightest; its size is fixed */
        this.specular = 0;
        /** @property {Shader|undefined} - Custom Shader for the next draws, set from each object's shader; undefined draws with the plugin's own
         *  @type {Shader|undefined} */
        this.shader = undefined;
        /** @property {boolean} - Darken by the shadow map when shadows are on, turn it off for things that should stay lit inside a shadow */
        this.receiveShadow = true;

        // the pass
        /** @property {Function|undefined} - Draw solid world here, it runs again for shadows so only draw in it
         *  @type {Function|undefined} */
        this.onRenderOpaque = undefined;
        /** @property {Function|undefined} - Draw see through things here, like glows, billboards and soft shadows
         *  @type {Function|undefined} */
        this.onRenderTransparent = undefined;
        /** @property {Mesh|undefined} - Sky dome from buildSky or setSky, drawn around the camera behind everything
         *  @type {Mesh|undefined} */
        this.sky = undefined;
        /** @property {boolean} - Draw the 3D scene on top of the 2D scene instead of under it */
        this.renderAfter2D = false;
        /** @property {boolean} - Draw see through things far to near so they blend correctly */
        this.sortTransparent = true;
        /** @property {boolean} - Skip meshes whose bounding sphere is outside the view */
        this.frustumCulling = true;
        /** @property {boolean} - Draw every use of a mesh in the opaque stage as one instanced call, mesh.instanced overrides it per mesh */
        this.instancing = true;
        /** @property {boolean} - Sample textures through mipmaps so they do not shimmer in the distance, false uses each texture's own filtering like 2D */
        this.mipmaps = true;
        /** @property {boolean} - Draw state: keep texture pixels hard edged, no mipmaps and no blending between them, set per object by pixelated */
        this.pixelated = false;
        /** @property {number} - Anisotropic filtering for textures seen at an angle, 1 to 16, 1 is off; needs mipmaps */
        this.anisotropy = 4;

        // shared meshes, every object using one draws in the same batch
        /** @property {Mesh} - A box of size 1 that drawBox uses, for any object that is a box; set the object's scale3D
         *  and color instead of editing the mesh, which would change every box that uses it */
        this.boxMesh = buildBox();
        /** @property {Mesh} - A smooth sphere of diameter 1 that drawSphere uses, shared the same way as boxMesh */
        this.sphereMesh = buildSphere(1, 16, 8, true);
        /** @property {Mesh} - A flat square of size 1 facing +Y, seen from above only, for floors, water and decals;
         *  stand it up with the object's rotation3D, and size it with scale3D */
        this.planeMesh = buildGrid();
        this.planeMesh.doubleSided = false;
        /** @property {Mesh} - The same square seen and lit from both sides, for signs, cards and leaves */
        this.planeMeshDoubleSided = buildGrid();
        /** @property {Mesh} - A square of size 1 facing +Z with the tile across it, the corners in the order drawBillboard
         *  writes them; a ParticleEmitter3D draws its particles as instances of it, each with its own matrix */
        this.billboardMesh = new Mesh().addStrip([vec3(-.5, .5, 0), vec3(-.5, -.5, 0), vec3(.5, .5, 0), vec3(.5, -.5, 0)], vec3(0, 0, 1), RENDER3D_QUAD_UVS);
        this.billboardMesh.doubleSided = true;

        // read only
        /** @property {boolean} - True while the 3D pass is running, 3D draws are only valid then */
        this.isRendering = false;
        /** @property {boolean} - True while the shadow map is being drawn, draws go to the depth only shader */
        this.shadowPass = false;
        /** @property {Matrix4} - This frame's view matrix */
        this.viewMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's projection matrix */
        this.projectionMatrix = new Matrix4;
        /** @property {Matrix4} - This frame's combined view projection */
        this.viewProjection = new Matrix4;
        /** @property {Matrix4} - This frame's light view projection for the shadow map */
        this.shadowMatrix = new Matrix4;
        /** @property {Vector3} - Camera right axis this frame */
        this.cameraRight = vec3(1, 0, 0);
        /** @property {Vector3} - Camera up axis this frame */
        this.cameraUp = vec3(0, 1, 0);
        /** @property {Vector3} - Camera forward axis this frame */
        this.cameraForward = vec3(0, 0, -1);
        this.cameraBack = vec3(0, 0, 1); // its opposite, the normal of camera facing draws

        // internal state
        this.blend = false;          // blending on, set by the stages
        this.frustumPlanes = [];     // the view as six inward planes [x, y, z, w]
        this.shadowPlanes = [];      // the shadow map's box as six planes
        this.program = undefined;    // the main program, undefined when not available
        this.currentProgram = undefined; // the program in use during a pass, a Shader's or the main one
        this.lightCount = 0;         // Light3D objects sent this pass
        this.shadowShader = undefined;
        this.vao = undefined;
        this.whiteTexture = undefined; // 1x1 white for untextured draws
        this.samplers = [];            // how textures are filtered in 3D, clamped and wrapping, see render3DInitGL
        this.samplerKey = undefined;   // the settings the samplers were made for, they are rebuilt when it changes
        this.mipmapped = new WeakSet;  // textures given mipmaps for the 3D pass
        this.shadowTexture = undefined;
        this.shadowFramebuffer = undefined;
        this.shadowTextureSize = 0;
        this.contextGeneration = 0;  // counts context losses, a mesh uploaded under an older one uploads again
        this.uniforms = new Map;     // uniform locations by program
        this.uniformValues = {};     // last values sent for the cached vec4 uniforms
        this.shadowMapDrawn = false; // the shadow map is drawn by the first pass of the frame
        this.passIsDefault = true;   // the running pass is the default layer, the only one shadowed
        this.lightPositions = new Float32Array(RENDER3D_MAX_LIGHTS * 4); // Light3D uniforms, filled each pass
        this.lightColors = new Float32Array(RENDER3D_MAX_LIGHTS * 4);

        // the stream of immediate mode draws
        this.streamBuffer = undefined;
        this.instanceBuffers = [];       // the per instance values of the batches being drawn, used in turn
        this.instanceBufferIndex = 0;
        this.instanceMeshes = [];        // meshes with a batch pending this stage
        this.attribValues = [];          // last values sent for the cached constant attributes
        this.streamData = new ArrayBuffer(RENDER3D_MAX_STREAM_VERTS * RENDER3D_VERTEX_BYTES);
        this.streamFloats = new Float32Array(this.streamData);
        this.streamInts = new Uint32Array(this.streamData);
        this.streamCount = 0;
        this.streamTileInfo = undefined;
        this.streamState = undefined; // captured state the pending batch was drawn under
        this.capture = undefined;     // the mesh a bake is filling
        this.transparentQueue = undefined; // draws queued during the transparent stage, replayed far to near

        render3DInitGL();
        engineAddPlugin(undefined, render3DRender, render3DContextLost, render3DContextRestored, render3DPreRender);
    }

    ///////////////////////////////////////////////////////////////////////////
    // Matrices and picking

    /** Rebuild the view and projection matrices from the camera, called automatically each frame
     *  @param {number} [aspect] - Width over height, defaults to the main canvas */
    updateMatrices(aspect=mainCanvasSize.y ? mainCanvasSize.x / mainCanvasSize.y : 1)
    {
        const camera = this.camera;
        if (camera.align2D)
            camera.update2D();
        const cameraMatrix = camera.getMatrix();
        this.viewMatrix = cameraMatrix.copy().invert();
        this.projectionMatrix = camera.getProjectionMatrix(aspect);
        this.viewProjection = this.projectionMatrix.copy().multiply(this.viewMatrix);
        const m = cameraMatrix.m;
        this.cameraRight = render3DAxis(m, 0);
        this.cameraUp = render3DAxis(m, 4);
        this.cameraBack = render3DAxis(m, 8); // the normal of anything facing the camera
        this.cameraForward = this.cameraBack.scale(-1);
        this.frustumPlanes = render3DFrustumPlanes(this.viewProjection);
    }

    /** Where a world point lands on screen as -1 to 1 across and up, with z as depth
     *  - Uses this frame's camera, call updateMatrices first if the camera just moved
     *  @param {Vector3} pos
     *  @return {Vector3|undefined} - undefined when behind the camera or closer than the near plane */
    worldToClip(pos)
    {
        const m = this.viewProjection.m;
        const w = m[3]*pos.x + m[7]*pos.y + m[11]*pos.z + m[15];
        const z = (m[2]*pos.x + m[6]*pos.y + m[10]*pos.z + m[14]) / w;
        if (w <= 0 || z < -1)
            return; // behind the camera, or in front of the near plane
        return vec3(
            (m[0]*pos.x + m[4]*pos.y + m[8]*pos.z  + m[12]) / w,
            (m[1]*pos.x + m[5]*pos.y + m[9]*pos.z  + m[13]) / w, z);
    }

    /** Project a world point to screen space pixels, same space as mousePosScreen
     *  - The opposite of screenToRay, and it takes the same canvas so the pair agree
     *  @param {Vector3} pos
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size, as in screenToRay;
     *    the projection is whatever updateMatrices last built, which screenToRay does for its canvas
     *  @return {Vector2|undefined} - undefined when behind the camera or closer than the near plane */
    worldToScreen(pos, canvasSize=mainCanvasSize)
    {
        const clip = this.worldToClip(pos);
        if (!clip)
            return;
        return vec2((clip.x + 1) / 2 * canvasSize.x, (1 - clip.y) / 2 * canvasSize.y);
    }

    /** Get the world ray under a screen position, for clicking on things in 3D
     *  - Uses the camera where it is right now, so it is fine to call from gameUpdate
     *  - It brings the view matrices up to date for that canvas, so worldToScreen stays its exact opposite
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size
     *  @return {Ray3D} - Starts at the camera with a unit direction, or on the camera plane when orthographic */
    screenToRay(screenPos, canvasSize=mainCanvasSize)
    {
        const width = canvasSize.x || 1, height = canvasSize.y || 1; // a canvas with no size stands in as 1x1, rather than dividing by zero
        const aspect = width / height, camera = this.camera;
        // bring the matrices up to date for this canvas, so worldToScreen and this agree on where things are
        this.updateMatrices(aspect);
        const clipX = screenPos.x / width * 2 - 1;
        const clipY = 1 - screenPos.y / height * 2;
        // the screen offset moves a parallel ray's origin, or bends a perspective ray's direction
        const h = camera.orthographic ? camera.orthographic / 2 : tan(camera.fov / 2);
        const offset = this.cameraRight.scale(clipX * h * aspect).add(this.cameraUp.scale(clipY * h));
        return camera.orthographic
            ? new Ray3D(camera.pos.add(offset), this.cameraForward.copy())
            : new Ray3D(camera.pos.copy(), this.cameraForward.add(offset).normalize());
    }

    /** Where a screen position lands on a flat ground plane, for top down games; use HeightMap.raycast for terrain
     *  @param {Vector2} screenPos - Same space as mousePosScreen
     *  @param {number} [groundHeight] - World height of the ground plane
     *  @param {Vector2} [canvasSize] - Defaults to the main canvas size, as in screenToRay
     *  @return {Vector3|undefined} - undefined when the ray misses the plane */
    screenToGround(screenPos, groundHeight=0, canvasSize=mainCanvasSize)
    {
        const ray = this.screenToRay(screenPos, canvasSize);
        const t = raycastPlane(ray, vec3(0, groundHeight, 0), RENDER3D_DEFAULT_NORMAL);
        return t === undefined ? undefined : ray.getPosition(t);
    }

    /** Find the nearest object under a screen position or along a ray, for clicking on things
     *  - Each object is tested as a sphere around its mesh, or around a sprite's size3D, not triangle by triangle
     *  - engineObjectsRaycast3D is the other half of this, every object along a ray instead of the nearest
     *  @param {Vector2|Ray3D} from - A screen position like mousePosScreen, or a ray to look along
     *  @param {Array<EngineObject>} [objects] - Defaults to every object; only those with a mesh or a sprite count
     *  @return {{object: EngineObject3D, distance: number}|undefined} */
    pick(from, objects=engineObjects)
    {
        const ray = from instanceof Ray3D ? from : this.screenToRay(from);
        let nearest;
        for (const o of objects)
        {
            const distance = render3DRaycastObject(ray, o);
            if (distance !== undefined && (!nearest || distance < nearest.distance))
                nearest = {object: o, distance};
        }
        return nearest;
    }

    /** Play a sound at a 3D position, quieter with distance from the camera and panned by its side, like Sound.play with a 2D position
     *  @param {Sound} sound
     *  @param {Vector3} pos3D
     *  @param {number} [volume]
     *  @param {number} [pitch]
     *  @param {number} [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop]
     *  @return {SoundInstance|undefined} - undefined when out of range or sound is off */
    playSound(sound, pos3D, volume=1, pitch=1, randomnessScale=1, loop=false)
    {
        // keep in step with Sound.play, only the pan differs
        ASSERT(sound instanceof Sound, 'sound must be a Sound');
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        if (!soundEnable || headlessMode) return;
        if (!sound.sampleBuffer && !sound._sampleChannels) return; // still loading
        const offset = pos3D.subtract(this.camera.pos), range = sound.range;
        if (range)
        {
            const distance = offset.length();
            if (distance > range)
                return; // out of range
            volume *= percent(distance, range, range * sound.taper);
        }
        const pan = offset.normalize().dot(this.cameraRight);
        const rate = pitch + pitch * sound.randomness * randomnessScale * rand(-1, 1);
        return new SoundInstance(sound, volume, rate, pan, loop);
    }

    /** Play a sound on a loop at a 3D position, the same as playSound with loop on
     *  - Its volume and pan are set when it starts, change or stop it through the SoundInstance returned
     *  @param {Sound} sound
     *  @param {Vector3} pos3D
     *  @param {number} [volume]
     *  @param {number} [pitch]
     *  @param {number} [randomnessScale] - How much to scale pitch randomness
     *  @return {SoundInstance|undefined} - undefined when out of range or sound is off */
    playSoundLoop(sound, pos3D, volume=1, pitch=1, randomnessScale=1)
    { return this.playSound(sound, pos3D, volume, pitch, randomnessScale, true); }

    /** Is any part of a sphere on screen this frame, the test that skips meshes the camera cannot see
     *  - While the shadow map is drawing it tests the shadow area instead
     *  @param {Vector3} center
     *  @param {number} radius
     *  @return {boolean} */
    isSphereVisible(center, radius) { return render3DSphereVisible(center.x, center.y, center.z, radius); }

    ///////////////////////////////////////////////////////////////////////////
    // Meshes and the stream

    /** Draw a mesh with the current draw state, batched with its other uses in the opaque stage when instancing is on
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    drawMesh(mesh, matrix=RENDER3D_IDENTITY, tileInfo, color=WHITE)
    {
        matrix = render3DMatrix(matrix);
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        ASSERT(isColor(color), 'color must be a Color');
        if (this.capture)
            return void this.capture.combine(mesh, matrix, color);
        if (this.transparentQueue)
            return this.queueTransparent(matrix.getTranslation(), ()=> this.drawMesh(mesh, matrix, tileInfo, color));
        if (!render3DCanDraw()) return;
        if (this.shadowPass && !this.lighting) return; // unlit things cast no shadow
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== this.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        const m = matrix.m;
        if (this.frustumCulling && !render3DSphereVisible(m[12], m[13], m[14], mesh.radius * render3DMaxScale(m)))
            return;
        // the mesh says whether its back faces can be skipped, and a mirroring transform, one with a negative
        // determinant, turns the winding around so the other one is its front
        const cullBackFaces = this.cullBackFaces, mirrored = this.mirrored;
        this.cullBackFaces = !mesh.doubleSided;
        this.mirrored = m[0]*(m[5]*m[10] - m[6]*m[9]) - m[4]*(m[1]*m[10] - m[2]*m[9]) + m[8]*(m[1]*m[6] - m[2]*m[5]) < 0;
        if (!this.blend && this.depthTest && (mesh.instanced ?? this.instancing)) // the stage draws the batch at its end
            render3DInstance(mesh, matrix, tileInfo, color);
        else
        {
            this.flush();
            render3DSetDrawUniforms(matrix, tileInfo, color);
            render3DBindMesh(mesh);
            glContext.drawElements(glContext.TRIANGLES, mesh.bufferCount, mesh.indexType, 0);
            ++drawCount;
            primitiveCount += mesh.bufferCount / 3;
        }
        this.cullBackFaces = cullBackFaces, this.mirrored = mirrored;
    }

    /** Draw a triangle strip, batched into the stream with the current draw state
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  - inside a bake the strip goes into the mesh instead, in the transparent stage it is queued for sorting
     *  @param {Array<Vector3>} points - In strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, 0-1 across the tile
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, vertex colors come before the texture
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for this strip */
    drawStrip(points, normals, uvs, colors, tileInfo)
    {
        if (this.capture)
        {
            this.capture.addStrip(points, normals, uvs, colors);
            return;
        }
        if (this.transparentQueue)
        {
            // sort by the center of the strip
            let x = 0, y = 0, z = 0;
            for (const p of points)
                x += p.x, y += p.y, z += p.z;
            return this.queueTransparent(vec3(x, y, z).scale(1 / points.length), ()=> this.drawStrip(points, normals, uvs, colors, tileInfo));
        }
        ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
        const n = points.length, count = render3DStripCount(n);
        const uvRect = render3DBeginStrip(count, tileInfo);
        if (!uvRect) return;

        // the tile rect is applied to each uv now, so the whole texture maps at flush
        const floats = this.streamFloats, ints = this.streamInts;
        const normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
        const rgba = colorArray ? 0 : (colors || WHITE).rgbaInt();
        for (let k = 0; k < count; ++k)
        {
            const i = render3DStripIndex(k, n), p = points[i];
            const uv = uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV;
            render3DWriteVertex(floats, ints, this.streamCount++ * RENDER3D_VERTEX_FLOATS, p.x, p.y, p.z,
                normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL,
                uvRect.x + uv.x * uvRect.w, uvRect.y + uv.y * uvRect.h, colorArray ? colors[i].rgbaInt() : rgba);
        }
    }

    /** Draw a strip with lighting off, for camera facing shapes where the light direction means nothing
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals]
     *  @param {Vector2|Array<Vector2>} [uvs]
     *  @param {Color|Array<Color>} [colors]
     *  @param {TileInfo|TextureInfo} [tileInfo] */
    drawStripUnlit(points, normals, uvs, colors, tileInfo)
    { render3DWithState({lighting: false}, ()=> this.drawStrip(points, normals, uvs, colors, tileInfo)); }

    /** Draw the pending stream vertices as one strip with the state they were drawn under, called automatically when needed */
    flush()
    {
        if (!this.streamCount || !render3DCanDraw()) return;
        const gl = glContext;
        render3DSetDrawUniforms(RENDER3D_IDENTITY, this.streamTileInfo, WHITE, RENDER3D_FULL_UV_RECT, this.streamState);
        render3DBindVertexBuffer(this.streamBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.streamFloats, 0, this.streamCount * RENDER3D_VERTEX_FLOATS);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.streamCount);
        ++drawCount;
        primitiveCount += this.streamCount;
        this.streamCount = 0;
    }

    /** Build a mesh once out of draw calls, instead of redrawing the shapes every frame
     *  - Call the same drawStrip, drawQuad and drawBox calls inside, and get a mesh back
     *  - Strips inside a bake ignore their tileInfo, the finished mesh picks the texture when it draws
     *  - drawMesh, drawBox and drawSphere copy their mesh in, moved and tinted, their tileInfo dropped too
     *  - The mesh skips its back faces like any, set doubleSided when what was drawn is open
     *  @param {Function} drawFunction
     *  @return {Mesh} */
    bake(drawFunction)
    {
        this.flush();
        ASSERT(!this.capture, 'bake cannot be nested');
        const mesh = this.capture = new Mesh;
        try { drawFunction(); }
        finally { this.capture = undefined; }
        return mesh;
    }

    ///////////////////////////////////////////////////////////////////////////
    // The stages, run by the pass

    /** Draw a layer's objects, solid ones first and see through ones after, called automatically
     *  - The main layer also draws the sky, the render callbacks and the debug shapes
     *  @param {Array<EngineObject3D>} objects
     *  @param {boolean} [isDefault] */
    renderStages(objects, isDefault=true)
    {
        const opaque = [], transparent = [];
        for (const o of objects)
            (o.transparent || o.additive ? transparent : opaque).push(o);

        isDefault && this.sky && this.drawSky();

        // opaque: no blending, depth writes on, by render order
        this.blend = false;
        this.depthWrite = true;
        const byOrder = (a, b)=> a.renderOrder - b.renderOrder;
        opaque.sort(byOrder);
        transparent.sort(byOrder);
        render3DDrawObjects(opaque);
        isDefault && this.onRenderOpaque?.();
        this.flush();
        render3DFlushInstances();

        // transparent: blending on, depth writes off, every draw queued then replayed far to near
        this.blend = true;
        this.depthWrite = false;
        this.transparentQueue = this.sortTransparent ? [] : undefined;
        try
        {
            render3DDrawObjects(transparent);
            for (const o of objects)
                if (o.softShadow)
                {
                    // the shadow grows with the object, by the same scale picking and culling
                    // measure it at, so one size set once holds however the object is scaled
                    const m = render3DObjectMatrix(o);
                    this.drawSoftShadow(m.getTranslation(), o.softShadow * render3DMaxScale(m.m), this.softShadowHeight);
                }
            isDefault && this.onRenderTransparent?.();
        }
        finally { this.flushTransparentQueue(); }
        isDefault && render3DRenderDebug();
        this.flush();

        // leave the fields at the opaque defaults for anything reading them outside the pass
        render3DSetObjectState();
        this.blend = false;
        this.depthWrite = true;
    }

    /** Queue a draw for the transparent stage, replayed far to near with the current draw state, or draw it now when sorting is off
     *  @param {Vector3} pos - Where the draw is, for sorting
     *  @param {Function} draw */
    queueTransparent(pos, draw)
    {
        if (!this.transparentQueue)
            return draw();
        this.transparentQueue.push({distance: pos.distanceSquared(this.camera.pos), state: render3DCaptureBatchState(), draw});
    }

    /** Draw the queued transparent draws far to near with the state each was drawn under, called automatically at the end of the transparent stage */
    flushTransparentQueue()
    {
        const queue = this.transparentQueue;
        if (!queue) return;
        this.transparentQueue = undefined;
        queue.sort((a, b)=> b.distance - a.distance);
        // each draw under the state it was queued with, and the state left as it was found
        const state = render3DCaptureBatchState();
        try
        {
            for (const item of queue)
                render3DApplyBatchState(item.state), item.draw();
        }
        finally { render3DApplyBatchState(state); }
    }

    /** Draw render3D.sky around the camera, unlit, unfogged and behind everything, called automatically by the pass */
    drawSky()
    {
        this.flush();
        // the dome only has to sit between the clip planes, the pass draws it first with no depth test;
        // a far plane at Infinity has no midpoint, so put it a long way out instead
        const {near, far} = this.camera;
        const radius = far == Infinity ? near * 1e4 : (near + far) / 2;
        render3DWithState({lighting: false, blend: false, depthTest: false, depthWrite: false, fogEnd: 0, shader: undefined}, ()=>
            this.drawMesh(this.sky, buildMatrix(this.camera.pos, undefined, vec3(radius))));
    }

    /** Rebuild the light's view projection around the shadow center, called automatically each frame shadows are on */
    updateShadowMatrix()
    {
        ASSERT(this.shadowRange > 0, 'shadowRange must be positive');
        const range = this.shadowRange > 0 ? this.shadowRange : 1, half = range / 2;
        const toSun = this.sunDirection.normalize();
        const center = this.shadowCenter || this.camera.pos.add(this.cameraForward.scale(half * .8));
        const view = Matrix4.lookAt(center.add(toSun.scale(range)), center).invert();
        // move the light's view in whole pixel steps so shadow edges do not crawl as the camera moves
        const texel = range / (this.shadowTextureSize || this.shadowMapSize), m = view.m; // no texture in headless mode
        m[12] = round(m[12] / texel) * texel;
        m[13] = round(m[13] / texel) * texel;
        this.shadowMatrix = Matrix4.orthographic(-half, half, -half, half, 0, range * 2).multiply(view);
        this.shadowPlanes = render3DFrustumPlanes(this.shadowMatrix);
    }

    /** Build a sky dome, set it as the sky, and light the scene by it: the fog takes the horizon color, and the
     *  ambient light comes from the top color above and the bottom color below, both at the ambient strength
     *  @param {Color} [topColor] - Straight up
     *  @param {Color} [horizonColor] - Level with the camera
     *  @param {Color} [bottomColor] - Straight down, defaults to the horizon color
     *  @param {number} [ambient] - How much of the sky colors lights the scene as ambient, 0 for none
     *  @return {Mesh} - The dome, also in render3D.sky */
    setSky(topColor=hsl(.6, .8, .55), horizonColor=hsl(.6, 1, .9), bottomColor=horizonColor, ambient=.5)
    {
        this.sky?.dispose();
        this.sky = buildSky(topColor, horizonColor, bottomColor);
        this.fogColor = horizonColor.copy();
        this.ambientColor = topColor.scale(ambient, 1);
        this.ambientGroundColor = bottomColor.scale(ambient, 1);
        return this.sky;
    }

    /** Set where fog starts and ends, and its color
     *  @param {number} fogStart - Distance from the camera where fog starts
     *  @param {number} fogEnd - Distance where fog is total, 0 disables fog
     *  @param {Color} [fogColor] - Leaves the color alone when not passed, setSky sets it to the horizon */
    setFog(fogStart, fogEnd, fogColor)
    {
        this.fogStart = fogStart;
        this.fogEnd = fogEnd;
        if (fogColor)
            this.fogColor = fogColor.copy();
    }

    ///////////////////////////////////////////////////////////////////////////
    // Immediate mode shapes

    /** Draw a box, untextured, for blocking out a scene without meshes or objects
     *  @param {Vector3} pos - Center
     *  @param {Vector3|number} [size] - Full size, a number for a cube
     *  @param {Color} [color]
     *  @param {Vector3} [rotation] - vec3(pitch, yaw, roll) */
    drawBox(pos, size=1, color=WHITE, rotation)
    {
        this.drawMesh(this.boxMesh, buildMatrix(pos, rotation, render3DSize3(size)), undefined, color);
    }

    /** Draw a sphere, untextured and smooth shaded
     *  @param {Vector3} pos - Center
     *  @param {number} [size] - Diameter
     *  @param {Color} [color] */
    drawSphere(pos, size=1, color=WHITE)
    {
        this.drawMesh(this.sphereMesh, buildMatrix(pos, undefined, vec3(size)), undefined, color);
    }

    /** Draw a flat square that always faces the camera, unlit so it keeps its own colors
     *  - Draw it from onRenderTransparent or a transparent object so it can fade
     *  @param {Vector3} pos - Center
     *  @param {Vector2} [size] - World units
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color} [color]
     *  @param {number} [angle] - Rotation in the camera plane, counter clockwise
     *  @param {boolean} [upright] - Stand on world up and only turn to face the camera, for sprites on the ground */
    drawBillboard(pos, size=vec2(1), tileInfo, color=WHITE, angle=0, upright=false)
    {
        if (this.capture) // the mesh keeps the color, so it gets its own, the particles reuse theirs
            return this.drawStripUnlit(render3DBillboardCorners(pos, size, angle, upright), this.cameraBack, RENDER3D_QUAD_UVS, color.copy(), tileInfo);
        if (this.transparentQueue) // sort by the exact position, a shadow under it sorts by the floor
            return this.queueTransparent(pos, ()=> this.drawBillboard(pos, size, tileInfo, color, angle, upright));

        // the particle path: the quad's six stream vertices written straight in with no vectors made, unlit
        const lit = this.lighting;
        this.lighting = this.shadowPass && lit; // unlit on screen, in the shadow map the object's flag decides
        let uvRect;
        try { uvRect = render3DBeginStrip(6, tileInfo); }
        finally { this.lighting = lit; }
        if (!uvRect) return;
        const a = render3DBillboardAxes(size, angle, upright);
        const rx = a[0], ry = a[1], rz = a[2], ux = a[3], uy = a[4], uz = a[5];
        const x = pos.x, y = pos.y, z = pos.z, n = this.cameraBack, rgba = color.rgbaInt();
        const u0 = uvRect.x, v0 = uvRect.y, u1 = u0 + uvRect.w, v1 = v0 + uvRect.h;
        const floats = this.streamFloats, ints = this.streamInts, stride = RENDER3D_VERTEX_FLOATS;
        let j = this.streamCount * stride;
        this.streamCount += 6;
        // the corners in strip order with the repeats: top left twice, bottom left, top right, bottom right twice
        render3DWriteVertex(floats, ints, j, x - rx + ux, y - ry + uy, z - rz + uz, n, u0, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x - rx + ux, y - ry + uy, z - rz + uz, n, u0, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x - rx - ux, y - ry - uy, z - rz - uz, n, u0, v1, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx + ux, y + ry + uy, z + rz + uz, n, u1, v0, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx - ux, y + ry - uy, z + rz - uz, n, u1, v1, rgba);
        render3DWriteVertex(floats, ints, j += stride, x + rx - ux, y + ry - uy, z + rz - uz, n, u1, v1, rgba);
    }

    /** Draw a quad from four corners in loop order, counter clockwise seen from the front, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color|Array<Color>} [color] - One for all or one per corner */
    drawQuad(a, b, c, d, tileInfo, color=WHITE)
    {
        this.drawStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d), RENDER3D_QUAD_UVS, render3DQuadValues(color), tileInfo);
    }

    /** Draw a triangle, counter clockwise from outside is the front
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Color} [color] */
    drawTriangle(a, b, c, color=WHITE)
    {
        this.drawStrip([a, b, c], render3DFaceNormal(a, b, c), undefined, color);
    }

    /** Draw a line as a camera facing ribbon, unlit
     *  @param {Vector3} posA
     *  @param {Vector3} posB
     *  @param {number} [width]
     *  @param {Color} [color] */
    drawLine(posA, posB, width=.1, color=WHITE)
    {
        this.drawRibbon([posA, posB], width, undefined, color);
    }

    /** Draw a ribbon along a path, unlit and visible from both sides; width and color can change along it
     *  - The texture runs along the length, u from the first point to the last
     *  - A path that ends where it starts is a loop, and joins with no seam
     *  @param {Array<Vector3>} points - Center line in order, at least two
     *  @param {number|Array<number>} [width] - Full width, one for all or one per point
     *  @param {TileInfo|TextureInfo} [tileInfo]
     *  @param {Color|Array<Color>} [color] - One for all or one per point
     *  @param {Vector3|Array<Vector3>} [side] - Direction across the ribbon, one for all or one per point, default faces the camera */
    drawRibbon(points, width=.1, tileInfo, color=WHITE, side)
    {
        const count = points.length;
        ASSERT(count > 1, 'a ribbon needs at least two points');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        const strip = [], uvs = tileInfo ? [] : undefined, colors = [], forward = this.cameraForward;
        let across = vec3(1, 0, 0); // kept from the last point where the direction vanishes
        // a loop's two ends take their direction across the join, so they meet edge to edge
        const loop = count > 2 && points[0].distanceSquared(points[count - 1]) < 1e-12;
        for (let i = 0; i < count; ++i)
        {
            const p = points[i];
            const w = isArray(width) ? width[i] : width;
            const c = isArray(color) ? color[i] : color;
            const s = side && (isArray(side) ? side[i] : side);
            // across the path in the camera plane unless a side is given
            const next = points[i < count - 1 ? i + 1 : loop ? 1 : i];
            const last = points[i > 0 ? i - 1 : loop ? count - 2 : i];
            const dir = s || next.subtract(last).cross(forward);
            if (dir.lengthSquared() > 1e-12)
                across = dir.normalize();
            const half = across.scale(w / 2);
            strip.push(p.add(half), p.subtract(half));
            uvs?.push(vec2(i / (count - 1), 0), vec2(i / (count - 1), 1));
            colors.push(c, c);
        }
        render3DWithState({lighting: false, cullBackFaces: false}, ()=> this.drawStrip(strip, forward.scale(-1), uvs, colors, tileInfo));
    }

    /** Draw a disc that fades to transparent at the rim, unlit, for glows, puffs and sky dots
     *  @param {Vector3} pos - Center
     *  @param {number} [size] - Diameter
     *  @param {Color} [color]
     *  @param {Vector3} [normal] - Facing direction, faces the camera by default
     *  @param {number} [sides] */
    drawSoftDisc(pos, size=1, color=WHITE, normal=this.cameraBack, sides=16)
    {
        render3DAssertBlending();
        if (this.transparentQueue && !this.capture)
            return this.queueTransparent(pos, ()=> this.drawSoftDisc(pos, size, color, normal, sides));
        // basis in the disc's plane
        const n = normal.normalize();
        const helper = abs(n.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
        const u = helper.cross(n).normalize(), w = u.cross(n);
        render3DDrawSoftDisc(size / 2, color, sides, n, (c, s, r)=>
            vec3(pos.x + (u.x * c + w.x * s) * r, pos.y + (u.y * c + w.y * s) * r, pos.z + (u.z * c + w.z * s) * r));
    }

    /** Draw a soft round shadow on the ground under something, much cheaper than a real shadow
     *  - Draw it from onRenderTransparent or from a transparent object
     *  @param {Vector3} pos - Position of the thing casting the shadow
     *  @param {number} [size] - Diameter
     *  @param {number|HeightMap|Function} [floorHeight] - Height of the ground, a HeightMap, or (x, z) => y to follow terrain
     *  @param {Color} [color]
     *  @param {number} [lift] - How far above the ground to draw, raise it if the shadow cuts into rough ground */
    drawSoftShadow(pos, size=1, floorHeight=0, color=RENDER3D_SHADOW_COLOR, lift=.02)
    {
        render3DAssertBlending();
        // a HeightMap is in the extras plugin, so it is known by its getHeight rather than its class
        const height = isNumber(floorHeight) ? ()=> floorHeight
            : floorHeight.getHeight ? (x, z)=> floorHeight.getHeight(x, z) : floorHeight;
        if (this.transparentQueue && !this.capture) // sort from the floor, under whatever casts it
            return this.queueTransparent(vec3(pos.x, height(pos.x, pos.z) + lift, pos.z), ()=> this.drawSoftShadow(pos, size, floorHeight, color, lift));
        render3DDrawSoftDisc(size / 2, color, 16, RENDER3D_DEFAULT_NORMAL, (c, s, r)=>
        {
            const x = pos.x + c * r, z = pos.z + s * r;
            return vec3(x, height(x, z) + lift, z);
        });
    }
}

function render3DAssertBlending()
{
    const r = render3D;
    ASSERT(r.blend || r.capture || r.shadowPass || !r.isRendering, 'soft discs and shadows need blending: set the object transparent or draw from onRenderTransparent');
}

// draw the three rings of a soft disc as unlit strips, pointAt(cos, sin, radius) gives the world point
function render3DDrawSoftDisc(radius, color, sides, normal, pointAt)
{
    const alpha = [1, .9, .7, 0], circle = render3DCircle(sides); // alpha by ring, center to rim
    for (let k = 0; k < 3; ++k)
    {
        const points = [], colors = [];
        const c0 = color.withAlpha(color.a * alpha[k]), c1 = color.withAlpha(color.a * alpha[k+1]);
        const r0 = radius * k / 3, r1 = radius * (k + 1) / 3;
        for (let i = 0; i <= sides; ++i)
        {
            const c = circle[i*2], s = circle[i*2 + 1];
            points.push(pointAt(c, s, r1), pointAt(c, s, r0));
            colors.push(c1, c0);
        }
        render3D.drawStripUnlit(points, normal, undefined, colors);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Debug primitives, drawn on top of the 3D scene like the 2D debug functions, only in debug builds

let render3DDebugPrimitives = [];

// draw the live debug primitives with depth test off so they show through walls, drop the expired ones
function render3DRenderDebug()
{
    if (!render3DDebugPrimitives.length) return;
    render3DWithState({lighting: false, depthTest: false, receiveShadow: false, additive: false, shader: undefined}, ()=>
    {
        for (const p of render3DDebugPrimitives)
            p.draw();
    });
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.timer < 0); // a Timer compares as negative until it elapses
}

// record a debug draw for a time
function render3DDebugPush(duration, draw)
{
    ASSERT(isNumber(duration), 'duration must be a number');
    debug && render3D?.program && render3DDebugPrimitives.push({timer: new Timer(duration), draw});
}

/** Draw a debug wireframe box
 *  @param {Vector3} pos - Center
 *  @param {Vector3|number} [size] - Full size, a number for a cube
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {Vector3} [rotation] - vec3(pitch, yaw, roll)
 *  @memberof Render3D */
function debugBox3D(pos, size=1, color=WHITE, time=0, rotation)
{
    const matrix = buildMatrix(pos, rotation, render3DSize3(size));
    const corner = (i)=> matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
    render3DDebugPush(time, ()=>
    {
        for (let i = 0; i < 8; ++i)
        for (const bit of [1, 2, 4])
            if (!(i & bit))
                render3D.drawLine(corner(i), corner(i | bit), RENDER3D_DEBUG_WIDTH, color);
    });
}

/** Draw a debug wireframe sphere as three rings
 *  @param {Vector3} pos - Center
 *  @param {number} [size] - Diameter
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugSphere3D(pos, size=1, color=WHITE, time=0)
{
    const circle = render3DCircle(24), r = size / 2;
    render3DDebugPush(time, ()=>
    {
        for (const ring of [(c, s)=> vec3(c, s, 0), (c, s)=> vec3(c, 0, s), (c, s)=> vec3(0, c, s)])
        {
            const points = [];
            for (let i = 0; i <= 24; ++i)
                points.push(pos.add(ring(circle[i*2], circle[i*2 + 1]).scale(r)));
            render3D.drawRibbon(points, RENDER3D_DEBUG_WIDTH, undefined, color);
        }
    });
}

/** Draw a debug line
 *  @param {Vector3} posA
 *  @param {Vector3} posB
 *  @param {Color} [color]
 *  @param {number} [width]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugLine3D(posA, posB, color=WHITE, width=RENDER3D_DEBUG_WIDTH, time=0)
{
    render3DDebugPush(time, ()=> render3D.drawLine(posA, posB, width, color));
}

/** Draw a debug point as a small cross of three lines
 *  @param {Vector3} pos
 *  @param {Color} [color]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {number} [size] - Length of the cross
 *  @memberof Render3D */
function debugPoint3D(pos, color=WHITE, time=0, size=.2)
{
    render3DDebugPush(time, ()=>
    {
        for (const axis of [vec3(size / 2, 0, 0), vec3(0, size / 2, 0), vec3(0, 0, size / 2)])
            render3D.drawLine(pos.subtract(axis), pos.add(axis), RENDER3D_DEBUG_WIDTH, color);
    });
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Camera3D - Position, rotation and lens for the 3D view
 * - Looks down its -Z axis, rotation is vec3(pitch, yaw, roll)
 * @memberof Render3D
 */
class Camera3D
{
    /** Create a camera, looking down -Z from z=10 by default */
    constructor()
    {
        /** @property {Vector3} - World position */
        this.pos = vec3(0, 0, 10);
        /** @property {Vector3} - Euler rotation, vec3(pitch, yaw, roll) in radians */
        this.rotation = vec3();
        /** @property {number} - Vertical field of view in radians */
        this.fov = PI/3;
        /** @property {number} - Near clip distance */
        this.near = .1;
        /** @property {number} - Far clip distance, Infinity is allowed for a perspective view */
        this.far = 1e3;
        /** @property {number} - Visible height in world units for an orthographic view, 0 is perspective */
        this.orthographic = 0;
        /** @property {boolean} - Line the 3D camera up with the 2D camera, so 3D things at z=0 sit on the 2D sprites */
        this.align2D = false;
    }

    /** Returns the camera's world transform
     *  @return {Matrix4} */
    getMatrix() { return buildMatrix(this.pos, this.rotation); }

    /** Returns the view matrix, world to camera space
     *  @return {Matrix4} */
    getViewMatrix() { return this.getMatrix().invert(); }

    /** Returns the projection matrix
     *  @param {number} aspect - Width over height
     *  @return {Matrix4} */
    getProjectionMatrix(aspect)
    {
        const h = this.orthographic / 2, w = h * aspect;
        return h ? Matrix4.orthographic(-w, w, -h, h, this.near, this.far) : Matrix4.perspective(this.fov, aspect, this.near, this.far);
    }

    /** Returns the direction the camera looks
     *  @return {Vector3} */
    getForward() { return render3DAxis(this.getMatrix().m, 8).scale(-1); }

    /** Returns the camera's right axis
     *  @return {Vector3} */
    getRight() { return render3DAxis(this.getMatrix().m, 0); }

    /** Returns the camera's up axis
     *  @return {Vector3} */
    getUp() { return render3DAxis(this.getMatrix().m, 4); }

    /** Point the camera at a target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target) { this.rotation = render3DLookRotation(target.subtract(this.pos), this.rotation); }

    /** Put the camera on an orbit around a target, looking at it
     *  @param {Vector3} target
     *  @param {number} distance
     *  @param {number} yaw - Radians around Y
     *  @param {number} [pitch] - Radians above the horizon */
    orbit(target, distance, yaw, pitch=.5)
    {
        const r = cos(pitch) * distance;
        this.pos = target.add(vec3(sin(yaw) * r, sin(pitch) * distance, cos(yaw) * r));
        this.lookAt(target);
    }

    /** Chase a target from an offset, easing toward it, and look at it
     *  @param {Vector3} target
     *  @param {Vector3} offset - Where to sit relative to the target
     *  @param {number} [percent] - How far to move toward the spot each call, 1 snaps */
    follow(target, offset, percent=1)
    {
        this.pos = this.pos.lerp(target.add(offset), percent);
        this.lookAt(target);
    }

    /** Line the 3D camera up with the 2D camera, called automatically when align2D is set
     *  @param {number} [canvasHeight] - Defaults to the main canvas height */
    update2D(canvasHeight=mainCanvasSize.y)
    {
        const halfHeight = canvasHeight / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.fov/2);
        // a zoomed out 2D camera sits a long way back, far enough to fall past the far plane and
        // clip the whole scene away, which looks like nothing rendering at all
        ASSERT(!canvasHeight || distance < this.far,
            'align2D needs this camera distance to match the 2D view, raise camera.far past it', distance);
        this.orthographic &&= halfHeight * 2; // an orthographic camera stays orthographic and shows the same height
        this.pos = vec3(cameraPos.x, cameraPos.y, distance);
        this.rotation = vec3(0, 0, -cameraAngle); // 2D angles turn the other way
    }
}

///////////////////////////////////////////////////////////////////////////////
// GL setup, shaders and the frame hooks

// the four attributes of a 36 byte vertex at the locations the shaders declare: location, size, type, normalize, byte offset
const RENDER3D_ATTRIBS = [[0, 3, 5126, false, 0], [1, 3, 5126, false, 12], [2, 2, 5126, false, 24], [3, 4, 5121, true, 32]];

// the vertex shader, shared by the plugin's program and every Shader's
// attributes: p position, n normal, t uv, c color, at fixed slots the depth shader also uses
// uniforms: viewProj, lightViewProj; the model matrix, the tint and the uv rect are vertex attributes, see
// RENDER3D_VERTEX_INPUTS; L is the mesh's own uv for a Shader's localUV
// the normal matrix comes from the model matrix here: each column over its squared length, which is the inverse
// transpose of any rotation and scale, mirrored or not, and skips a 3x3 inverse per draw on the CPU; a sheared
// matrix, one built by multiplying rotations with scales between them, gets normals that are only close
const RENDER3D_VERTEX_SOURCE =
    '#version 300 es\n' +
    'precision highp float;' +
    'uniform mat4 viewProj,lightViewProj;' +
    RENDER3D_VERTEX_INPUTS +
    'out vec3 P,N;out vec2 T,L;out vec4 C,S;' +
    'void main(){' +
    'vec4 w=mat4(m0,m1,m2,m3)*vec4(p,1.);' +
    'gl_Position=viewProj*w;' +
    'P=w.xyz;' +
    'vec3 c0=m0.xyz,c1=m1.xyz,c2=m2.xyz;' +
    'N=mat3(c0/dot(c0,c0),c1/dot(c1,c1),c2/dot(c2,c2))*n;' +
    'T=uvRect.xy+t*uvRect.zw;' +
    'L=t;' +
    'C=c*tint;' +
    'S=lightViewProj*w;' +
    '}';

// the names a Shader's snippet can use in 3D, over the plugin's own uniforms and varyings
const RENDER3D_SNIPPET_NAMES =
    'uniform float iTime;uniform vec3 iResolution;\n' +
    '#define iChannel0 tex\n' +
    '#define localUV L\n' +
    '#define worldPos P\n' +
    '#define worldNormal N\n' +
    '#define sunDirection (-lightDir.xyz)\n' +
    '#define sunColor lightColor.rgb\n' +
    '#define ambientColor ambientFog.rgb\n' +
    '#define ambientGroundColor ambientGround.rgb\n' +
    '#define lightCount extraLightCount\n' +
    '#define lights extraLights\n' +
    '#define lightColors extraLightColors\n';

// the fragment shader; given a Shader's snippet, its mainImage replaces the texture sample and all else is the same
// uniforms: lightDir (xyz the way the sunlight travels, w = emissive, 1 or more skips the lighting),
//   lightColor (the sun's rgb, a = specular), ambientFog (rgb, a = fogEnd), fogColor (rgb, a = fogStart),
//   cameraPos, tex, shadowMap, shadowParams (x = shadows on, y = bias, z = blur step in texture space,
//   w = how the draw finishes: 1 opaque and alpha tested, 0 blended, -1 additive)
function render3DFragmentSource(fragmentCode)
{
    return '#version 300 es\n' +
        'precision highp float;' +
        'uniform vec4 lightDir,lightColor,ambientFog,ambientGround,fogColor,shadowParams;' +
        'uniform vec4 extraLights[' + RENDER3D_MAX_LIGHTS + '],extraLightColors[' + RENDER3D_MAX_LIGHTS + '];' +
        'uniform int extraLightCount;' +
        'uniform vec3 cameraPos;' +
        'uniform sampler2D tex;' +
        'uniform highp sampler2DShadow shadowMap;' +
        'in vec3 P,N;in vec2 T,L;in vec4 C,S;' +
        'out vec4 o;' +
        // the sun shadow at this fragment, 0 to 1: the light's depth map with a 3x3 blur, outside the map is lit
        'float shadow(){' +
        'if(shadowParams.x<=0.)return 1.;' +
        'vec3 q=S.xyz/S.w*.5+.5;' +
        'if(any(greaterThanEqual(abs(q-.5),vec3(.5))))return 1.;' +
        'q.z-=shadowParams.y;' +
        'float s=0.;' +
        'for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y)' +
        's+=texture(shadowMap,vec3(q.xy+vec2(x,y)*shadowParams.z,q.z));' +
        'return s/9.;}' +
        (fragmentCode ? RENDER3D_SNIPPET_NAMES + fragmentCode + '\n' : '') +
        'void main(){' +
        (fragmentCode ? 'vec4 t;mainImage(t,T);' : 'vec4 t=texture(tex,T);') +
        'if(shadowParams.w>0.&&t.a<.5)discard;' + // an opaque draw drops see through texels, as the shadow map does
        'vec4 c=C*t;' +
        'float e=lightDir.w;' +
        'if(e<1.){' +
        'vec3 n=dot(N,N)>0.?normalize(N):vec3(0,1,0);' +
        'if(!gl_FrontFacing)n=-n;' + // only a double sided mesh shows a back face, light it on the side that is seen
        'float nl=dot(n,-lightDir.xyz);' +
        'float s=shadow();' +
        // the ambient: one color, or blended from the ground color below to the sky color above by the way the face points
        'vec3 l=(ambientGround.a>0.?mix(ambientGround.rgb,ambientFog.rgb,n.y*.5+.5):ambientFog.rgb)+lightColor.rgb*max(nl,0.)*s;' +
        // the Light3D objects: a point light falls off with distance, a directional one does not and carries the
        // direction toward it in xyz, marked by a negative radius; each adds its own highlight when there is a strength
        'vec3 eye=lightColor.a>0.?normalize(cameraPos-P):vec3(0),sp=vec3(0);' +
        'for(int i=0;i<' + RENDER3D_MAX_LIGHTS + ';++i){' +
        'if(i>=extraLightCount)break;' +
        'vec4 L=extraLights[i];' +
        'bool directional=L.w<0.;' +
        'vec3 v=directional?L.xyz:L.xyz-P;' +
        'float d=length(v);' +
        'float a=directional?1.:max(0.,1.-d/L.w);' +
        'v/=max(d,1e-6);' +
        'float ln=dot(n,v);' +
        'vec3 lc=extraLightColors[i].rgb*extraLightColors[i].a*a*a;' +
        'l+=lc*max(0.,ln);' +
        'if(lightColor.a>0.)sp+=lc*pow(max(dot(reflect(-v,n),eye),0.),16.)*step(0.,ln);' +
        '}' +
        'c.rgb*=l*(1.-e)+e;' + // lit, blended toward its own color by how emissive it is
        // specular: the sun's only where its light hits and out of shadow, then the Light3D highlights,
        // skipped entirely when the strength is zero
        'if(lightColor.a>0.){' +
        'vec3 r=reflect(lightDir.xyz,n);' +
        'c.rgb+=lightColor.rgb*pow(max(dot(r,eye),0.),16.)*lightColor.a*step(0.,nl)*s*(1.-e)+sp*lightColor.a*(1.-e);' +
        '}}else c.rgb*=e;' + // fully emissive: its own color, or brighter, with no lighting to work out
        'if(ambientFog.a>0.){' +
        'float z=distance(cameraPos,P);' +
        'c.rgb=mix(c.rgb,shadowParams.w<0.?vec3(0):fogColor.rgb,smoothstep(fogColor.a,ambientFog.a,z));' +
        '}' +
        'o=vec4(c.rgb,shadowParams.w>0.?1.:c.a);' + // an opaque draw stays opaque whatever the tint alpha says
        '}';
}

// a Shader's 3D program, compiled the first time a draw needs it
function render3DShaderProgram(shader)
{
    ASSERT(shader instanceof Shader, 'render3D.shader must be a Shader, not the snippet itself');
    return shader.program3D ||= glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource(shader.fragmentCode));
}

// make a program current for the pass and send it the pass uniforms: the matrices, the camera and the lights,
// plus the time and canvas size for a Shader's program; the per draw uniform cache starts over
function render3DUseProgram(program)
{
    const gl = glContext, r = render3D;
    gl.useProgram(r.currentProgram = program);
    r.uniformValues = {};
    gl.uniformMatrix4fv(render3DUniform('viewProj'), false, r.viewProjection.m);
    gl.uniformMatrix4fv(render3DUniform('lightViewProj'), false, r.shadowMatrix.m);
    gl.uniform1i(render3DUniform('tex'), 0);
    gl.uniform1i(render3DUniform('shadowMap'), 1);
    const c = r.camera.pos;
    gl.uniform3f(render3DUniform('cameraPos'), c.x, c.y, c.z);
    gl.uniform1i(render3DUniform('extraLightCount'), r.lightCount);
    if (r.lightCount)
    {
        gl.uniform4fv(render3DUniform('extraLights'), r.lightPositions, 0, r.lightCount * 4);
        gl.uniform4fv(render3DUniform('extraLightColors'), r.lightColors, 0, r.lightCount * 4);
    }
    if (program !== r.program)
    {
        gl.uniform1f(render3DUniform('iTime'), time);
        gl.uniform3f(render3DUniform('iResolution'), glCanvas.width, glCanvas.height, 1);
    }
}

function render3DInitGL()
{
    if (headlessMode) return;
    if (!glEnable || !glContext)
    {
        console.warn('Render3DPlugin: WebGL not enabled, construct the plugin in gameInit with glEnable set');
        return;
    }
    const gl = glContext, r = render3D;
    r.uniforms = new Map;
    r.uniformValues = {};
    r.attribValues = []; // a fresh context has its own attribute defaults, so nothing sent before it counts

    // the shader, see RENDER3D_VERTEX_SOURCE and render3DFragmentSource
    r.program = glCreateProgram(RENDER3D_VERTEX_SOURCE, render3DFragmentSource());

    // the depth only shader for the shadow map, same vertex layout; see through pixels cast nothing,
    // so sprites and cut out textures cast their outline
    r.shadowShader = glCreateProgram(
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform mat4 viewProj;' +
        RENDER3D_VERTEX_INPUTS +
        'out vec2 T;' +
        'void main(){T=uvRect.xy+t*uvRect.zw;gl_Position=viewProj*mat4(m0,m1,m2,m3)*vec4(p,1.);}'
        ,
        '#version 300 es\n' +
        'precision highp float;' +
        'uniform sampler2D tex;' +
        'in vec2 T;' +
        'void main(){if(texture(tex,T).a<.5)discard;}'
    );

    // the vertex array object with the attributes enabled once, pointers are set per buffer by render3DBindVertexBuffer
    // the per instance attributes get their divisor only while a batch has them on, see render3DDrawInstanced
    r.vao = gl.createVertexArray();
    gl.bindVertexArray(r.vao);
    for (const [location] of RENDER3D_ATTRIBS)
        gl.enableVertexAttribArray(location);

    // the stream buffer
    r.streamBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.streamBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, r.streamData.byteLength, gl.DYNAMIC_DRAW);
    r.streamCount = 0;
    r.instanceBuffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];

    // white texture for untextured draws, and a one texel shadow map that keeps the shadow sampler valid until shadows are on
    r.whiteTexture = glCreateTexture();
    r.mipmapped = new WeakSet;

    r.samplers = [];
    r.samplerKey = undefined;
    render3DUpdateShadowMap(1);

    // hand the engine back its own buffer and vertex array, in that order so a pending 2D batch flushes right
    gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
    glSetInstancedMode(true);
}

function render3DContextLost()
{
    const r = render3D;
    r.program = r.currentProgram = r.shadowShader = r.vao = r.streamBuffer = r.whiteTexture = undefined;
    for (const shader of glShaderObjects)
        shader.program3D = undefined; // compiled again by the next draw
    r.lightCount = 0;
    r.instanceBuffers = [];
    r.samplers = [];
    r.samplerKey = undefined;
    render3DClearInstances();
    r.shadowFramebuffer = r.shadowTexture = undefined;
    r.shadowTextureSize = 0;
    r.streamCount = 0;
    ++r.contextGeneration; // every uploaded mesh is stale now, the soft dot is a TextureInfo the engine restores
}

function render3DContextRestored()
{
    render3DInitGL();
}

// a uniform location, looked up once per program
function render3DUniform(name, program=render3D.currentProgram)
{
    const u = render3D.uniforms;
    let cache = u.get(program);
    cache || u.set(program, cache = {});
    return cache[name] ??= glContext.getUniformLocation(program, name);
}

// the model matrix, the tint and the uv rect as constant attributes for one draw
function render3DDrawAttribs(m, tint, uvRect)
{
    const gl = glContext;
    gl.vertexAttrib4f(4, m[0], m[1], m[2], m[3]);
    gl.vertexAttrib4f(5, m[4], m[5], m[6], m[7]);
    gl.vertexAttrib4f(6, m[8], m[9], m[10], m[11]);
    gl.vertexAttrib4f(7, m[12], m[13], m[14], m[15]);
    render3DAttrib4f(11, tint.r, tint.g, tint.b, tint.a);
    render3DAttrib4f(12, uvRect.x, uvRect.y, uvRect.w, uvRect.h);
}

// set a constant vec4 attribute only when its value changed since the last time
function render3DAttrib4f(location, x, y, z, w)
{
    const values = render3D.attribValues, last = values[location];
    if (last && last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    values[location] = [x, y, z, w];
    glContext.vertexAttrib4f(location, x, y, z, w);
}

// textures in 3D shrink into the distance far more than sprites do, so the pass samples them through their mipmaps;
// a sampler sets the filtering for the 3D pass only and leaves the engine's textures as they are for 2D, one for
// clamped textures and one for wrapping ones, rebuilt when the settings change
function render3DUpdateSamplers()
{
    const gl = glContext, r = render3D, key = tilesPixelated + ' ' + r.anisotropy;
    if (r.samplerKey === key) return;
    r.samplerKey = key;
    for (const sampler of r.samplers)
        gl.deleteSampler(sampler); // the set being replaced, a lost context empties this first
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    // four samplers: clamped and wrapping, each smooth or hard edged
    r.samplers = [false, true].flatMap(pixelated=> [gl.CLAMP_TO_EDGE, gl.REPEAT].map(wrap=>
    {
        const sampler = gl.createSampler();
        const sharp = pixelated || tilesPixelated;
        gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, sharp ? gl.NEAREST : gl.LINEAR);
        gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, pixelated ? gl.NEAREST
            : tilesPixelated ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_LINEAR);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap);
        if (anisotropy && !pixelated)
        {
            const most = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            gl.samplerParameterf(sampler, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, clamp(r.anisotropy, 1, most));
        }
        return sampler;
    }));
}

// bind the texture of a tile or texture, white when there is none or it is not loaded, with the 3D sampler that
// matches its wrap mode; the first time a texture is used in 3D it gets its mipmaps
function render3DBindTexture(tileInfo, state=render3D)
{
    const gl = glContext, r = render3D;
    const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    const texture = textureInfo?.glTexture || r.whiteTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (texture === r.whiteTexture || !r.mipmaps && !state.pixelated)
        return gl.bindSampler(0, null); // the texture's own filtering, as in 2D; the white texel needs no mipmaps
                                        // or anisotropy, and filtering it that way costs every untextured fragment
    gl.bindSampler(0, r.samplers[(textureInfo?.wrap ? 1 : 0) + (state.pixelated ? 2 : 0)]);
    if (!state.pixelated && !r.mipmapped.has(texture)) // a hard edged draw never reads them
    {
        r.mipmapped.add(texture);
        gl.generateMipmap(gl.TEXTURE_2D);
    }
}

// send a vec4 uniform of the main shader only when its value changed since the last send
function render3DUniform4f(name, x, y, z, w)
{
    const values = render3D.uniformValues, last = values[name];
    if (last && last[0] === x && last[1] === y && last[2] === z && last[3] === w)
        return;
    values[name] = [x, y, z, w];
    glContext.uniform4f(render3DUniform(name), x, y, z, w);
}

// bind a vertex buffer and point the attributes at it
function render3DBindVertexBuffer(buffer)
{
    const gl = glContext;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const a of RENDER3D_ATTRIBS)
        gl.vertexAttribPointer(a[0], a[1], a[2], a[3], RENDER3D_VERTEX_BYTES, a[4]);
}

// a mesh's vertices and its triangle indices, ready for drawElements
function render3DBindMesh(mesh)
{
    render3DBindVertexBuffer(mesh.buffer);
    glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
}

// where a tile sits in its texture, pulled in slightly at the edges so neighbors do not bleed in
// this returns one shared object, so read it before calling again
const render3DTileUVRect = {x:0, y:0, w:1, h:1};
function render3DGetTileUVs(tileInfo)
{
    if (!(tileInfo instanceof TileInfo))
        return RENDER3D_FULL_UV_RECT;
    const inv = tileInfo.textureInfo.sizeInverse, rect = render3DTileUVRect;
    const bleedX = inv.x * tileInfo.bleed, bleedY = inv.y * tileInfo.bleed;
    rect.x = tileInfo.pos.x * inv.x + bleedX;
    rect.y = tileInfo.pos.y * inv.y + bleedY;
    rect.w = tileInfo.size.x * inv.x - 2*bleedX;
    rect.h = tileInfo.size.y * inv.y - 2*bleedY;
    return rect;
}

// set the per draw uniforms and gl state for a draw, in the shadow pass only the model matrix of the depth shader
// tileInfo may be a TileInfo, a TextureInfo, or undefined for the white texture
// state is the plugin's current fields, or the captured state of a stream batch
function render3DSetDrawUniforms(matrix, tileInfo, tint, uvRect, state=render3D)
{
    const gl = glContext, r = render3D;

    // the per draw values are constant vertex attributes, a batch turns on a per instance array over them
    uvRect ||= render3DGetTileUVs(tileInfo);
    render3DDrawAttribs(matrix.m, tint, uvRect);
    render3DBindTexture(tileInfo, state);
    if (r.shadowPass) return; // the shadow map needs nothing else

    // the program: a Shader's own, compiled by its first draw, or the plugin's; switching sends the pass uniforms
    const program = state.shader ? render3DShaderProgram(state.shader) : r.program;
    program === r.currentProgram || render3DUseProgram(program);

    // blending, matches the engine's 2D blend functions
    if (state.blend)
    {
        gl.enable(gl.BLEND);
        const destBlend = state.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA;
        gl.blendFuncSeparate(gl.SRC_ALPHA, destBlend, gl.ONE, destBlend);
    }
    else
        gl.disable(gl.BLEND);

    // depth and culling
    state.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthWrite);
    state.cullBackFaces ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
    gl.frontFace(state.mirrored ? gl.CCW : gl.CW); // the pass's strips read clockwise, a mirror turns that around

    // lights, fog and shadows are scene state read at draw time, sent only when they change
    // the shader takes the way the sunlight travels, away from the sun
    const s = r.sunDirection, sl = -(s.length() || 1), lc = r.sunColor, ac = r.ambientColor, fc = r.fogColor || canvasClearColor;
    render3DUniform4f('lightDir', s.x / sl, s.y / sl, s.z / sl, state.lighting ? state.emissive : 1);
    render3DUniform4f('lightColor', lc.r, lc.g, lc.b, state.specular);
    render3DUniform4f('ambientFog', ac.r, ac.g, ac.b, r.fogEnd);
    const gc = r.ambientGroundColor;
    gc ? render3DUniform4f('ambientGround', gc.r, gc.g, gc.b, 1) : render3DUniform4f('ambientGround', 0, 0, 0, 0); // a is on

    render3DUniform4f('fogColor', fc.r, fc.g, fc.b, r.fogStart);
    // how the fragment shader finishes: 1 drops see through texels and keeps the draw opaque,
    // 0 blends them away instead, and -1 is additive, which has to fade into fog differently
    const blendMode = state.blend ? (state.additive ? -1 : 0) : 1;
    render3DUniform4f('shadowParams', r.shadows && r.passIsDefault && state.receiveShadow ? 1 : 0, r.shadowBias, r.shadowSoftness / r.shadowTextureSize, blendMode);
}

// the six flat sides of the camera's visible box, each as [x, y, z, w] facing inward
// a point is inside when x*px + y*py + z*pz + w is zero or more
function render3DFrustumPlanes(matrix)
{
    const m = matrix.m, planes = [];
    for (let i = 0; i < 3; ++i)
    for (const sign of [1, -1])
    {
        const p = [m[3] + sign * m[i], m[7] + sign * m[4+i], m[11] + sign * m[8+i], m[15] + sign * m[12+i]];
        const l = hypot(p[0], p[1], p[2]) || 1;
        planes.push(p.map(v=> v / l));
    }
    return planes;
}

// the preRender hook, before gameRender: the layer under the 2D scene
function render3DPreRender()
{
    const r = render3D;
    r.updateMatrices();
    r.shadowMapDrawn = false;
    render3DRenderPass(false);
}

// the render hook, after gameRenderPost: the layer on top of the 2D scene
function render3DRender()
{
    render3DRenderPass(true);
}

// one 3D pass for the objects of a layer: take over the gl state, draw the shadow map once a frame and the stages, hand the state back
// the layer matching render3D.renderAfter2D is the default and always runs, the other only when an object asks for it
function render3DRenderPass(after2D)
{
    const gl = glContext, r = render3D;
    if (!r.program) return; // headless, gl disabled, or context lost
    render3DUpdateSamplers();
    ASSERT(!r.fogEnd || r.fogStart < r.fogEnd, 'fogStart must be less than fogEnd');
    ASSERT(!glRenderTarget, 'the 3D pass needs the canvas depth buffer, it can not draw into a render target');
    const isDefault = after2D === !!r.renderAfter2D, objects = render3DLayerObjects(after2D);
    if (!isDefault && !objects.length) return;
    r.passIsDefault = isDefault;
    after2D && glFlush(); // the 2D sprites drawn so far go under this layer

    // a previous frame that threw must not leave anything pending
    r.streamCount = 0;
    r.capture = r.transparentQueue = undefined;
    render3DClearInstances();

    // take over the gl state
    gl.bindVertexArray(r.vao);
    // the leading repeat on every strip shifts the triangles by one, which flips
    // which way they read, so tell WebGL that clockwise is the front here
    gl.frontFace(gl.CW);
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // the Light3D objects, a directional one sends the direction toward it, from the origin, and a negative radius
    const lights = render3DCollectLights();
    r.lightCount = lights.length;
    const positions = r.lightPositions, colors = r.lightColors;
    lights.forEach((light, i)=>
    {
        const p = light.directional ? light.getWorldPos3D().normalize() : light.getWorldPos3D();
        ASSERT(!light.directional || p.lengthSquared(), 'a directional light shines from its position toward the origin, so it cannot sit on the origin');
        const c = light.color, k = i * 4;
        positions[k] = p.x, positions[k+1] = p.y, positions[k+2] = p.z;
        positions[k+3] = light.directional ? -1 : max(0, light.radius); // a negative radius marks a direction
        colors[k] = c.r, colors[k+1] = c.g, colors[k+2] = c.b, colors[k+3] = c.a * light.intensity;
    });

    r.isRendering = true;
    try
    {
        // the shadow map from the light once a frame, then the stages sample it
        if (r.shadows && !r.shadowMapDrawn)
        {
            render3DRenderShadowMap();
            r.shadowMapDrawn = true;
        }
        render3DUseProgram(r.program); // after the shadow map, so the light matrix it sends is this frame's
        r.renderStages(objects, isDefault);
    }
    finally
    {
        // hand the state back to the engine's 2D batching, even when a draw threw
        r.isRendering = false;
        r.currentProgram = undefined; // the engine's 2D program takes over below
        r.streamCount = 0;
        r.capture = r.transparentQueue = undefined;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.frontFace(gl.CCW);
        gl.bindSampler(0, null); // back to the textures' own filtering for 2D
        if (glActiveTexture)
            gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
        // ARRAY_BUFFER is not part of VAO state in WebGL2, so bindVertexArray alone would not restore it
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
        glSetInstancedMode(true);
    }
}

// create the shadow map depth texture and framebuffer at a size, or keep them when the size matches
function render3DUpdateShadowMap(size)
{
    const gl = glContext, r = render3D;
    ASSERT(size > 0, 'shadowMapSize must be positive');
    if (r.shadowTexture && r.shadowTextureSize === size) return;
    r.shadowTexture && gl.deleteTexture(r.shadowTexture);
    r.shadowFramebuffer && gl.deleteFramebuffer(r.shadowFramebuffer);
    const texture = r.shadowTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // smooth filtering softens shadow edges for free
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    const framebuffer = r.shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]); // depth only
    gl.readBuffer(gl.NONE);
    ASSERT(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE, 'shadow map framebuffer is incomplete, try a smaller shadowMapSize');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    r.shadowTextureSize = size;
}

// draw the lit opaque casters from the light into the shadow map with the depth only shader
function render3DRenderShadowMap()
{
    const gl = glContext, r = render3D;
    render3DUpdateShadowMap(r.shadowMapSize | 0);
    r.updateShadowMatrix();

    // the map can not be read while it is drawn
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.shadowFramebuffer);
    gl.viewport(0, 0, r.shadowTextureSize, r.shadowTextureSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(r.shadowShader);
    gl.uniformMatrix4fv(render3DUniform('viewProj', r.shadowShader), false, r.shadowMatrix.m);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    r.shadowPass = true;
    try
    {
        // see through objects cast only when textured, their alpha cuts the shadow out
        const casters = render3DLayerObjects(!!r.renderAfter2D).filter(o=> o.castShadow && !o.additive && (!o.transparent || o.tileInfo));
        render3DDrawObjects(casters);
        r.onRenderOpaque?.();
        r.flush();
        render3DFlushInstances();
    }
    finally
    {
        // back to the frame with the map ready to sample
        r.shadowPass = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // backing store size, mainCanvasSize is css pixels
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, r.shadowTexture);
        gl.activeTexture(gl.TEXTURE0);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Strips: every strip repeats its first point once at the start and its last
// point once at the end. Those repeats make flat triangles with no area, which
// are invisible, and they let one strip run straight into the next.
// An odd count gets one more repeat at the end. Triangles in a strip alternate
// which way they face, so keeping the count even keeps every strip facing out.

// make room in the stream for a strip of count vertices under the current state and texture, flushing a batch that
// differs first; returns the uv rect to map the vertices with, or undefined when nothing can be drawn
function render3DBeginStrip(count, tileInfo)
{
    const r = render3D;
    if (!render3DCanDraw()) return;
    if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
    ASSERT(count <= RENDER3D_MAX_STREAM_VERTS, 'strip is too large for the stream, bake it into a mesh');
    if (count > RENDER3D_MAX_STREAM_VERTS) return;
    const textureInfo = tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo;
    if (r.streamCount && (textureInfo !== r.streamTileInfo || render3DStateChanged(r.streamState)
        || r.streamCount + count > RENDER3D_MAX_STREAM_VERTS))
        r.flush();
    if (!r.streamCount)
        r.streamState = render3DCaptureBatchState();
    r.streamTileInfo = textureInfo;
    return render3DGetTileUVs(tileInfo);
}

// the half axes of a camera facing quad of a size turned by an angle, right then up, in one shared array
// so a particle costs no vectors; read it before calling again
const render3DBillboardAxesScratch = new Float64Array(6);
function render3DBillboardAxes(size, angle, upright)
{
    const r = render3D.cameraRight, u = render3D.cameraUp;
    let rx = r.x, ry = r.y, rz = r.z, ux = u.x, uy = u.y, uz = u.z;
    if (upright)
    {
        // an upright quad stands on world up and only turns to face the camera
        const l = hypot(rx, rz); // a rolled camera has no flat right
        rx = l ? rx / l : 1, ry = 0, rz = l ? rz / l : 0;
        ux = 0, uy = 1, uz = 0;
    }
    const c = cos(angle), s = sin(angle), w = size.x / 2, h = size.y / 2, a = render3DBillboardAxesScratch;
    a[0] = (rx * c + ux * s) * w, a[1] = (ry * c + uy * s) * w, a[2] = (rz * c + uz * s) * w;
    a[3] = (ux * c - rx * s) * h, a[4] = (uy * c - ry * s) * h, a[5] = (uz * c - rz * s) * h;
    return a;
}

// the four corners of a camera facing quad in strip order
function render3DBillboardCorners(pos, size, angle, upright)
{
    const a = render3DBillboardAxes(size, angle, upright);
    const rx = a[0], ry = a[1], rz = a[2], ux = a[3], uy = a[4], uz = a[5];
    return [
        vec3(pos.x - rx + ux, pos.y - ry + uy, pos.z - rz + uz), vec3(pos.x - rx - ux, pos.y - ry - uy, pos.z - rz - uz),
        vec3(pos.x + rx + ux, pos.y + ry + uy, pos.z + rz + uz), vec3(pos.x + rx - ux, pos.y + ry - uy, pos.z + rz - uz)];
}

// how many vertices a strip of n points takes with its repeats, and which point vertex k of it is
function render3DStripCount(n) { return n + 2 + (n & 1); }
function render3DStripIndex(k, n) { return k < 1 ? 0 : k <= n ? k - 1 : n - 1; }

// walk a strip's vertices with the repeats applied, calling back with (point, normal, uv, color)
// normals, uvs and colors may be one value for all points, an array per point, or undefined
function render3DForEachStripVertex(points, normals, uvs, colors, callback)
{
    ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
    const n = points.length, count = render3DStripCount(n);
    const normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
    for (let k = 0; k < count; ++k)
    {
        const i = render3DStripIndex(k, n);
        callback(points[i],
            normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL,
            uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV,
            colorArray ? colors[i] : colors || WHITE);
    }
}

// write one vertex into a packed buffer at float index j
function render3DWriteVertex(floats, ints, j, x, y, z, n, u, v, rgba)
{
    floats[j]   = x;   floats[j+1] = y;   floats[j+2] = z;
    floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
    floats[j+6] = u;   floats[j+7] = v;
    ints[j+8] = rgba;
}

// turn every triangle of an index list the other way round, in place: the authoring form reads counter clockwise
// from the front and the pass draws clockwise, as a strip's triangles come out after its leading repeat
function render3DFlipTriangles(indices)
{
    for (let t = 0; t < indices.length; t += 3)
    {
        const b = indices[t+1];
        indices[t+1] = indices[t+2], indices[t+2] = b;
    }
    return indices;
}

// the triangles of a strip of count entries as an index list, given which vertex each entry maps to and which place
// it is at: the strip's triangle i is (i-2, i-1, i), its odd ones read the other way as the GPU reads a strip, and a
// triangle with two corners in one place has no area, it is a join between pieces or a sliver at a pole, and is left out
function render3DStripTriangles(count, remap, place)
{
    const indices = [];
    for (let i = 2; i < count; ++i)
    {
        const a = i & 1 ? i - 1 : i - 2, b = i & 1 ? i - 2 : i - 1;
        if (place[a] != place[b] && place[b] != place[i] && place[a] != place[i])
            indices.push(remap[a], remap[b], remap[i]);
    }
    return indices;
}

// a mesh's packed vertex data for the GPU, one vertex per entry of a layout, which is the strip index of each
function render3DMeshVertexData(mesh, vertices)
{
    const count = vertices.length, data = new ArrayBuffer(count * RENDER3D_VERTEX_BYTES);
    const floats = new Float32Array(data), ints = new Uint32Array(data);
    for (let j = 0; j < count; ++j)
    {
        const i = vertices[j], p = mesh.points[i], uv = mesh.uvs[i] || RENDER3D_DEFAULT_UV; // a hand built mesh may leave normals, uvs and colors empty
        render3DWriteVertex(floats, ints, j * RENDER3D_VERTEX_FLOATS, p.x, p.y, p.z,
            mesh.normals[i] || RENDER3D_DEFAULT_NORMAL, uv.x, uv.y, (mesh.colors[i] || WHITE).rgbaInt());
    }
    return data;
}

// reorder a convex polygon's points, counter clockwise from outside, into one triangle strip
function render3DPolygonStrip(points)
{
    const strip = [points[0]];
    for (let i = 1, j = points.length - 1; i <= j; ++i, --j)
    {
        strip.push(points[i]);
        if (i !== j)
            strip.push(points[j]);
    }
    return strip;
}

///////////////////////////////////////////////////////////////////////////////

// frees the GPU buffer of a mesh that is garbage collected without dispose, some time after it goes; it holds the
// buffer and its context, never the mesh, or the mesh could not be collected, and dispose unregisters the mesh
const render3DMeshBuffers = typeof FinalizationRegistry == 'undefined' ? undefined :
    new FinalizationRegistry(({buffer, indexBuffer, generation})=>
    {
        if (generation !== render3D?.contextGeneration || !glContext) return;
        glContext.deleteBuffer(buffer);
        glContext.deleteBuffer(indexBuffer);
    });

/**
 * Mesh - Triangles with positions, normals, uvs and colors, uploaded once and drawn by matrix
 * - Build with addStrip, addQuad, combine or the shape builders, then render each frame
 * - Its back faces are skipped unless doubleSided is set, which the open builders like buildGrid do for you
 * - Two forms: a triangle strip, what the builders make, or an indexed list of triangles over their own vertices,
 *   what addTriangles and the model loaders make; upload sends the GPU an indexed list either way, see getTriangles,
 *   so a strip's joins between its pieces cost nothing to draw, and toIndexed turns a strip mesh into the list form
 * - The GPU buffer is created lazily on first render and dropped by dispose, or freed once the mesh is garbage
 *   collected, so dispose is only needed to free it right away, like for a mesh rebuilt often
 * @memberof Render3D
 * @example
 * const mesh = buildLathe([[0, -1], [1, 0], [0, 1]], 4); // octahedron
 * mesh.render(buildMatrix(vec3(0, 1, 0)), undefined, RED);
 */
class Mesh
{
    /** Create an empty mesh */
    constructor()
    {
        /** @property {Array<Vector3>} - Vertex positions, in strip order or one per vertex of an indexed mesh
         *  @type {Array<Vector3>} */
        this.points = [];
        /** @property {Array<Vector3>} - Vertex normals
         *  @type {Array<Vector3>} */
        this.normals = [];
        /** @property {Array<Vector2>} - Vertex texture coords, 0-1 across the tile
         *  @type {Array<Vector2>} */
        this.uvs = [];
        /** @property {Array<Color>} - Vertex colors
         *  @type {Array<Color>} */
        this.colors = [];
        /** @property {WebGLBuffer|undefined} - GPU vertex buffer, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.buffer = undefined;
        /** @property {WebGLBuffer|undefined} - GPU index buffer, the triangles, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.indexBuffer = undefined;
        /** @property {number} - Indices in the GPU index buffer, three per triangle */
        this.bufferCount = 0;
        this.indexType = 0; // gl.UNSIGNED_SHORT, or UNSIGNED_INT past 65535 vertices
        /** @property {boolean} - The mesh changed and needs uploading again, set it yourself if you edit the arrays */
        this.dirty = false;
        /** @property {boolean|undefined} - Draw every use of this mesh in the opaque stage as one instanced call, undefined follows render3D.instancing
         *  @type {boolean|undefined} */
        this.instanced = undefined;
        /** @property {boolean} - Draw both sides, each lit as the side that is seen; off skips the faces pointing away,
         *  which is faster and right for closed shapes, the open builders like buildGrid and buildRibbon turn it on */
        this.doubleSided = false;
        /** @property {boolean} - The values change often but the shape never does, for a water surface or a cloth: set once,
         *  the mesh keeps its GPU layout and a dirty upload only rewrites the vertices into the buffer it has; the strip
         *  must keep the same points in the same order, a new point count asserts */
        this.dynamicDraw = false;
        /** @property {Array<number>|undefined} - The mesh as an indexed triangle list instead of a strip: the arrays hold each vertex
         *  once and this says how they join, three vertex numbers per triangle, counter clockwise seen from the front like a
         *  strip's first triangle; addTriangles and the loaders fill it, toIndexed turns a strip mesh into this form
         *  @type {Array<number>|undefined} */
        this.indices = undefined;
        /** @property {Int32Array|undefined} - Which strip entries are one vertex, set by a builder that knows, one whole number
         *  per entry with equal numbers meaning the same vertex; upload skips its search for them, then drops the keys, since
         *  an edit after that may tell the entries apart; adding geometry or recomputing normals drops them too
         *  @type {Int32Array|undefined} */
        this.vertexKeys = undefined;
        this.vertexLayout = undefined; // the strip index of each GPU vertex and the point count of the last upload, for a dynamicDraw mesh
        this.instanceCount = 0; // draws waiting in this mesh's batch, with their values, texture and draw state
        this.instanceData = undefined;
        /** @property {number} - Bounding sphere radius around the origin, for culling and picking, computed by upload */
        this.radius = 0;
        this.contextGeneration = 0; // the context the buffer belongs to, see render3D.contextGeneration
    }

    /** Number of vertices in the mesh
     *  @return {number} */
    get vertexCount() { return this.points.length; }

    /** Add a triangle strip, joined to the previous one by invisible flat triangles so one mesh holds many strips
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @return {Mesh} */
    addStrip(points, normals, uvs, colors)
    {
        if (this.indices)
        {
            // an indexed mesh takes the strip as the triangles it makes
            const part = new Mesh().addStrip(points, normals, uvs, colors).toIndexed();
            return this.addTriangles(part.points, part.normals, part.uvs, part.colors, part.indices);
        }
        render3DForEachStripVertex(points, normals, uvs, colors, (p, n, uv, c)=>
        {
            this.points.push(p);
            this.normals.push(n);
            this.uvs.push(uv);
            this.colors.push(c);
        });
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Add triangles over their own vertices, the indexed form a model file comes in
     *  - The mesh becomes indexed: a strip mesh is turned into triangles first, and strips added later join as triangles
     *  - List each triangle counter clockwise as seen from the front, like a strip's first triangle
     *  @param {Array<Vector3>} points - Each vertex once
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @param {Array<number>} indices - Three vertex numbers per triangle, into points
     *  @return {Mesh} */
    addTriangles(points, normals, uvs, colors, indices)
    {
        ASSERT(isArray(points) && isArray(indices) && indices.length % 3 === 0, 'addTriangles takes points and three indices per triangle');
        ASSERT(indices.every(i=> i >= 0 && i < points.length && i % 1 === 0), 'an index points past the vertices given');
        this.toIndexed();
        const offset = this.points.length, normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
        for (let i = 0; i < points.length; ++i)
        {
            this.points.push(points[i]);
            this.normals.push(normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL);
            this.uvs.push(uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV);
            this.colors.push(colorArray ? colors[i] : colors || WHITE);
        }
        for (const i of indices)
            this.indices.push(i + offset);
        this.dirty = true;
        return this;
    }

    /** Turn a strip mesh into the indexed form, each distinct vertex once and the real triangles over them, in place
     *  - An indexed mesh is left as it is; the builders make strips and a loader makes this, and either draws the same
     *  @return {Mesh} */
    toIndexed()
    {
        if (this.indices) return this;
        const {vertices, indices} = this.getTriangles();
        this.points = vertices.map(i=> this.points[i]);
        this.normals = vertices.map(i=> this.normals[i] || RENDER3D_DEFAULT_NORMAL);
        this.uvs = vertices.map(i=> this.uvs[i] || RENDER3D_DEFAULT_UV);
        this.colors = vertices.map(i=> this.colors[i] || WHITE);
        // the list upload sends reads clockwise, the pass draws it that way; the authoring form is counter clockwise
        this.indices = render3DFlipTriangles(indices);
        this.vertexKeys = undefined;
        this.dirty = true;
        return this;
    }

    /** Add a flat quad from four corners in loop order, counter clockwise seen from the front, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {Color|Array<Color>} [color] - One for all or one per corner
     *  @param {Array<Vector2>} [uvs] - One per corner, default across the tile
     *  @return {Mesh} */
    addQuad(a, b, c, d, color, uvs)
    {
        return this.addStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d),
            uvs ? render3DQuadValues(uvs) : RENDER3D_QUAD_UVS, render3DQuadValues(color));
    }

    /** Append another mesh transformed by a matrix, for building one shape out of several
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Transform, or just a position to move it to
     *  @param {Color} [color] - Multiplies the appended vertex colors
     *  @return {Mesh} */
    combine(mesh, matrix=RENDER3D_IDENTITY, color=WHITE)
    {
        matrix = render3DMatrix(matrix); // most parts only need moving into place
        const normalMatrix = render3DNormalMatrix(matrix);
        let part = mesh;
        if (this.indices || mesh.indices)
        {
            // one of them is indexed, so both are: the part as a copy if it is a strip
            this.toIndexed();
            part = mesh.indices ? mesh : new Mesh().combine(mesh).toIndexed();
            const offset = this.points.length;
            for (const i of part.indices)
                this.indices.push(i + offset);
        }
        for (let i = 0; i < part.points.length; ++i)
        {
            this.points.push(matrix.transformPoint(part.points[i]));
            this.normals.push(normalMatrix.transformDirection(part.normals[i] || RENDER3D_DEFAULT_NORMAL).normalize());
            this.uvs.push((part.uvs[i] || RENDER3D_DEFAULT_UV).copy());
            this.colors.push((part.colors[i] || WHITE).multiply(color));
        }
        this.doubleSided ||= mesh.doubleSided; // an open part leaves the whole mesh open
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Scale every uv, so a whole texture repeats across the mesh when its TextureInfo wraps
     *  @param {Vector2|number} scale - Repeats across and up, a number for both
     *  @return {Mesh} */
    scaleUVs(scale)
    {
        const s = isNumber(scale) ? vec2(scale) : scale;
        this.uvs = this.uvs.map(uv=> vec2(uv.x * s.x, uv.y * s.y)); // new vectors, builders share uv objects between faces
        this.dirty = true;
        return this;
    }

    /** Move, turn or scale every vertex in place, normals follow along
     *  @param {Matrix4|Vector3} matrix - Transform, or just an offset to move by
     *  @return {Mesh} */
    transform(matrix)
    {
        matrix = render3DMatrix(matrix);
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < this.points.length; ++i)
        {
            this.points[i] = matrix.transformPoint(this.points[i]);
            // a mesh built by hand may have no normals yet, and then there is nothing to turn
            this.normals[i] &&= normalMatrix.transformDirection(this.normals[i]).normalize();
        }
        this.dirty = true;
        return this;
    }

    /** Turn the mesh inside out so it is lit and drawn from within, for rooms and domes
     *  @return {Mesh} */
    flipNormals()
    {
        if (this.indices)
        {
            render3DFlipTriangles(this.indices); // every triangle read the other way round
        }
        else
        {
            // one extra point at each end flips which way every triangle faces, and keeps the count even
            for (const key of ['points', 'normals', 'uvs', 'colors'])
            {
                const a = this[key];
                if (a.length)
                    a.unshift(a[0]), a.push(a[a.length - 1]);
            }
            this.vertexKeys = undefined;
        }
        this.normals = this.normals.map(n=> n.scale(-1));
        this.dirty = true;
        return this;
    }

    /** Set every vertex color
     *  @param {Color} color
     *  @return {Mesh} */
    setColor(color)
    {
        // one per point, not one per color already there, so a mesh built by hand with no
        // colors gets them instead of quietly staying white
        this.colors = this.points.map(()=> color);
        this.dirty = true;
        return this;
    }

    /** Measure the axis aligned box around the vertices
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds()
    {
        if (!this.points.length)
            return {min: vec3(), max: vec3()};
        const lo = vec3(Infinity), hi = vec3(-Infinity);
        for (const p of this.points)
        {
            lo.x = min(lo.x, p.x); lo.y = min(lo.y, p.y); lo.z = min(lo.z, p.z);
            hi.x = max(hi.x, p.x); hi.y = max(hi.y, p.y); hi.z = max(hi.z, p.z);
        }
        return {min: lo, max: hi};
    }

    /** Move the mesh so the center of its bounds is on the origin
     *  @return {Mesh} */
    center()
    {
        const bounds = this.getBounds();
        return this.transform(bounds.min.add(bounds.max).scale(-.5));
    }

    /** Scale the mesh evenly so its largest extent is a size, for loaded models of unknown units
     *  @param {number} [size]
     *  @return {Mesh} */
    fit(size=1)
    {
        const bounds = this.getBounds();
        const extent = bounds.max.subtract(bounds.min);
        const scale = size / (max(extent.x, extent.y, extent.z) || 1);
        return this.transform(Matrix4.scaling(vec3(scale)));
    }

    /** Measure the bounding sphere around the origin into radius, called by upload
     *  @return {number} */
    computeRadius()
    {
        let r = 0;
        for (const p of this.points)
            r = max(r, p.lengthSquared());
        return this.radius = r ** .5;
    }

    /** Derive normals from the triangles, of the strip or of the index list
     *  @param {boolean} [smooth] - Round the lighting across faces instead of giving each face a hard edge; flat
     *    normals on an indexed mesh give every corner its own vertex
     *  @return {Mesh} */
    computeNormals(smooth=false)
    {
        if (this.indices)
        {
            // the triangles are listed: smooth normals add up around each position, weighted by the corner angle
            // like the strip's, so vertices split apart at one place smooth back together and a mesh can go flat and
            // smooth again; flat ones need a vertex per corner, so the vertices are split up first
            if (!smooth)
            {
                const split = (a)=> this.indices.map(i=> a[i]);
                this.points = split(this.points), this.normals = split(this.normals), this.uvs = split(this.uvs), this.colors = split(this.colors);
                this.indices = this.indices.map((_, i)=> i);
            }
            const points = this.points, indices = this.indices, normals = points.map(()=> RENDER3D_DEFAULT_NORMAL), sums = new Map;
            const key = (p)=> `${round(p.x * 1e5)},${round(p.y * 1e5)},${round(p.z * 1e5)}`;
            for (let t = 0; t < indices.length; t += 3)
            {
                const a = points[indices[t]], b = points[indices[t+1]], c = points[indices[t+2]];
                const cross = b.subtract(a).cross(c.subtract(a));
                if (!cross.lengthSquared()) continue;
                const normal = cross.normalize();
                if (!smooth)
                {
                    normals[indices[t]] = normals[indices[t+1]] = normals[indices[t+2]] = normal; // its own three corners
                    continue;
                }
                for (let j = 0; j < 3; ++j)
                {
                    const p = points[indices[t+j]], u = points[indices[t+(j+1)%3]].subtract(p), v = points[indices[t+(j+2)%3]].subtract(p);
                    const angle = Math.acos(clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
                    const k = key(p);
                    sums.set(k, (sums.get(k) || vec3()).add(normal.scale(angle)));
                }
            }
            this.normals = smooth ? points.map(p=> { const s = sums.get(key(p)); return s && s.lengthSquared() ? s.normalize() : RENDER3D_DEFAULT_NORMAL; }) : normals;
            this.dirty = true;
            return this;
        }

        // the outward normal of each triangle in the strip
        const points = this.points, n = points.length;
        const faceNormals = [];
        for (let i = 0; i + 2 < n; ++i)
        {
            const a = points[i], b = points[i+1], c = points[i+2];
            const normal = b.subtract(a).cross(c.subtract(a));
            // triangles in a strip alternate which way they wind, so every other one is flipped back
            // a zero normal means a flat triangle joining two strips, so skip it
            faceNormals.push(normal.lengthSquared() ? normal.normalize(i & 1 ? 1 : -1) : undefined);
        }

        // then hand those to the vertices, shared around a position or kept per face
        const normals = points.map(()=> RENDER3D_DEFAULT_NORMAL);
        if (smooth)
        {
            // add up the face normals meeting at each position, each weighted by its corner angle so a cube
            // corner averages its three faces evenly however the strips cut them, then normalize
            const sums = new Map;
            const key = (p)=> `${round(p.x * 1e5)},${round(p.y * 1e5)},${round(p.z * 1e5)}`;
            faceNormals.forEach((f, i)=> f && [0, 1, 2].forEach(j=>
            {
                const a = points[i + j], u = points[i + (j + 1) % 3].subtract(a), v = points[i + (j + 2) % 3].subtract(a);
                const angle = Math.acos(clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
                const k = key(a);
                sums.set(k, (sums.get(k) || vec3()).add(f.scale(angle)));
            }));
            for (let i = 0; i < n; ++i)
                normals[i] = (sums.get(key(points[i])) || RENDER3D_DEFAULT_NORMAL).normalize();
        }
        else
            // every triangle writes its own three corners, so the only vertices left with the default
            // are the repeats at the ends of a strip, which no triangle with any area uses
            faceNormals.forEach((f, i)=> f && (normals[i] = normals[i+1] = normals[i+2] = f));

        this.normals = normals;
        this.vertexKeys = undefined; // flat normals tell entries at one place apart
        this.dirty = true;
        return this;
    }

    /** Pack the vertices and create the GPU buffer, called automatically by render
     *  @return {Mesh} */
    upload()
    {
        this.computeRadius();
        if (!render3D?.program || !glContext) return this;
        const gl = glContext, layout = this.vertexLayout;
        if (this.dynamicDraw && this.buffer && this.contextGeneration === render3D.contextGeneration)
        {
            // the layout of the last upload stands, only the values are written again into the buffer it has
            ASSERT(layout.pointCount === this.points.length, 'a dynamicDraw mesh keeps its shape, the same points in the same order; for a new shape make a new mesh or turn dynamicDraw off', this.points.length);
            if (layout.pointCount === this.points.length)
            {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, render3DMeshVertexData(this, layout.vertices));
                gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
                this.dirty = false;
                return this;
            }
        }
        this.dispose();
        const {vertices, indices} = this.getTriangles(), count = vertices.length, wide = count > 65535;
        this.vertexLayout = this.dynamicDraw ? {vertices, pointCount: this.points.length} : undefined;
        this.vertexKeys = undefined; // used once: an edit after this may tell entries apart
        this.buffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        this.bufferCount = indices.length;
        this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        this.dirty = false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, render3DMeshVertexData(this, vertices), this.dynamicDraw ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wide ? new Uint32Array(indices) : new Uint16Array(indices), gl.STATIC_DRAW);
        this.contextGeneration = render3D.contextGeneration;
        render3DMeshBuffers?.register(this, {buffer: this.buffer, indexBuffer: this.indexBuffer, generation: this.contextGeneration}, this);
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
    }

    /** The mesh as an indexed triangle list, what upload sends to the GPU: the strip's real triangles over its
     *  distinct vertices, the joins between its pieces dropped and every triangle facing the way it did in the strip
     *  - Vertices are compared to a millionth, so two at one place with the same normal, uv and color are one
     *  @return {{vertices: Array<number>, indices: Array<number>}} - vertices are strip indices, one per distinct
     *    vertex; indices are the triangles, three per triangle, into vertices */
    getTriangles()
    {
        const count = this.points.length, vertices = [];
        if (this.indices)
        {
            // already a list: every vertex as it is, and the triangles read the way the pass draws, clockwise
            for (let i = 0; i < count; ++i)
                vertices.push(i);
            return {vertices, indices: render3DFlipTriangles(this.indices.slice())};
        }
        const remap = new Int32Array(count), place = new Int32Array(count), keys = this.vertexKeys;
        if (keys && keys.length === count)
        {
            // a builder said which entries are one vertex: the first entry with a key stands for every entry with it,
            // and is their place, so nothing is searched
            const first = new Int32Array(count).fill(-1);
            for (let i = 0; i < count; ++i)
            {
                const key = keys[i];
                ASSERT(key >= 0 && key < count, 'vertexKeys must be whole numbers below the entry count', key);
                const j = first[key];
                if (j < 0)
                    first[key] = i, remap[i] = vertices.length, vertices.push(i);
                else
                    remap[i] = remap[j];
                place[i] = first[key];
            }
            return {vertices, indices: render3DStripTriangles(count, remap, place)};
        }

        // each vertex as nine whole numbers, its values in millionths and its color, so vertices hash and compare as
        // numbers; a hash table over all nine finds the distinct vertices and one over the first three the places,
        // each slot holding a vertex index plus one and a taken slot moving on to the next
        const values = new Float64Array(count * 9);
        let size = 1;
        while (size < count * 2) size *= 2;
        const mask = size - 1, seen = new Int32Array(size), places = new Int32Array(size);
        const mix = (h, v)=> Math.imul(h ^ v, 0x9e3779b1) >>> 0;
        for (let i = 0; i < count; ++i)
        {
            const p = this.points[i], n = this.normals[i] || RENDER3D_DEFAULT_NORMAL, uv = this.uvs[i] || RENDER3D_DEFAULT_UV, k = i * 9;
            const x = values[k] = round(p.x * 1e6), y = values[k+1] = round(p.y * 1e6), z = values[k+2] = round(p.z * 1e6);
            values[k+3] = round(n.x * 1e6), values[k+4] = round(n.y * 1e6), values[k+5] = round(n.z * 1e6);
            values[k+6] = round(uv.x * 1e6), values[k+7] = round(uv.y * 1e6);
            values[k+8] = (this.colors[i] || WHITE).rgbaInt();
            let h = mix(mix(mix(0x811c9dc5, x), y), z);

            // the place, shared with a vertex there that has another normal or uv, as at a lathe's poles
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = places[slot] - 1;
                if (o < 0) { places[slot] = i + 1, place[i] = i; break; }
                if (values[o*9] === x && values[o*9+1] === y && values[o*9+2] === z) { place[i] = o; break; }
            }

            // the whole vertex
            for (let m = 3; m < 9; ++m)
                h = mix(h, values[k+m]);
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = seen[slot] - 1;
                if (o < 0) { seen[slot] = i + 1, remap[i] = vertices.length, vertices.push(i); break; }
                let same = true;
                for (let m = 0; same && m < 9; ++m)
                    same = values[o*9+m] === values[k+m];
                if (same) { remap[i] = remap[o]; break; }
            }
        }
        return {vertices, indices: render3DStripTriangles(count, remap, place)};
    }

    /** Draw the mesh with the current draw state, batched with its other uses in the opaque stage
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    render(matrix, tileInfo, color) { render3D?.drawMesh(this, matrix, tileInfo, color); }

    /** Delete the GPU buffer now, the CPU arrays stay so the mesh can be rendered again
     *  - Optional, the buffer is freed anyway once the mesh is garbage collected, this frees it right away */
    dispose()
    {
        if (!this.buffer) return;
        render3DMeshBuffers?.unregister(this); // freed here, so not again when the mesh is collected
        // a buffer from a context that was lost is gone with it, and the new context refuses to delete it
        if (this.contextGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer), glContext?.deleteBuffer(this.indexBuffer);
        this.buffer = this.indexBuffer = undefined;
        this.bufferCount = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Shape builders, all centered on the origin so buildMatrix does placement
// Sizes are full sizes like buildBox and the 2D drawCircle, sides go around an axis and rings along it

/**
 * Spin a flat outline around the Y axis to make a round shape, like a vase or a wheel
 * - profile is [[radius, y], ...] from bottom to top
 * - A profile that ends where it starts makes a closed ring like a donut
 * - An end left open, with a radius and no cap, makes the mesh doubleSided so its inside shows
 * @param {Array<Array<number>>} profile
 * @param {number} [sides] - Around the axis
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends that have a radius with flat discs
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const vase = buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 12);
 */
function buildLathe(profile, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    ASSERT(isArray(profile) && profile.length > 1, 'lathe profile needs at least 2 points');
    sides |= 0;
    ASSERT(sides > 2, 'lathe needs at least 3 sides');
    const mesh = new Mesh;
    const rings = profile.length;
    const point = (i, a)=> vec3(sin(a) * profile[i][0], profile[i][1], cos(a) * profile[i][0]);

    // 2D outward normal of each profile segment, in (radius, y) space
    const segmentNormal = (i)=>
    {
        const [r0, y0] = profile[i], [r1, y1] = profile[i+1];
        const n = vec2(y1 - y0, r0 - r1);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    // vertex normal: average of the adjacent segment normals, across the seam when the profile is closed,
    // and a closed profile needs no caps
    const closed = rings > 2 && abs(profile[0][0] - profile[rings-1][0]) < 1e-9 && abs(profile[0][1] - profile[rings-1][1]) < 1e-9;
    const segmentLength = (i)=> hypot(profile[i+1][0] - profile[i][0], profile[i+1][1] - profile[i][1]);
    const vertexNormal = (i)=>
    {
        // an open end on the axis is a pole and points along it
        if (!closed && (!i || i == rings - 1) && abs(profile[i][0]) < 1e-9)
            return vec2(0, i ? 1 : -1);
        // otherwise the neighbors weighted by their length, so a short band does not tilt a long wall
        let n = vec2();
        const add = (s)=> n = n.add(segmentNormal(s).scale(segmentLength(s)));
        if (i > 0) add(i - 1);
        else if (closed) add(rings - 2);
        if (i < rings - 1) add(i);
        else if (closed) add(0);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    const normal3D = (n, a)=> vec3(sin(a) * n.x, n.y, cos(a) * n.x);

    // v runs along the profile by arc length
    const lengths = [0];
    for (let i = 1; i < rings; ++i)
        lengths[i] = lengths[i-1] + hypot(profile[i][0] - profile[i-1][0], profile[i][1] - profile[i-1][1]);
    const total = lengths[rings - 1] || 1;
    const v = (i)=> 1 - lengths[i] / total;

    for (let i = 0; i + 1 < rings; ++i)
    {
        if (smooth)
        {
            // one ribbon around the ring pair, top point then bottom point per column
            const points = [], normals = [], uvs = [];
            const n0 = vertexNormal(i), n1 = vertexNormal(i + 1);
            for (let j = 0; j <= sides; ++j)
            {
                const a = j / sides * 2 * PI, u = j / sides;
                points.push(point(i + 1, a), point(i, a));
                normals.push(normal3D(n1, a), normal3D(n0, a));
                uvs.push(vec2(u, v(i + 1)), vec2(u, v(i)));
            }
            mesh.addStrip(points, normals, uvs);
        }
        else
        {
            // one quad per side with its face normal
            const n = segmentNormal(i);
            for (let j = 0; j < sides; ++j)
            {
                const a0 = j / sides * 2 * PI, a1 = (j + 1) / sides * 2 * PI;
                const u0 = j / sides, u1 = (j + 1) / sides;
                mesh.addStrip(
                    [point(i + 1, a0), point(i, a0), point(i + 1, a1), point(i, a1)],
                    normal3D(n, (a0 + a1) / 2),
                    [vec2(u0, v(i + 1)), vec2(u0, v(i)), vec2(u1, v(i + 1)), vec2(u1, v(i))]);
            }
        }
    }

    // flat discs close the ends that have a radius, a hard edge even when the sides are smooth
    if (capped && !closed)
        for (const [i, up] of [[0, false], [rings - 1, true]])
        {
            if (abs(profile[i][0]) < 1e-9) continue; // a pole has no cap
            const points = [], uvs = [];
            for (let j = 0; j < sides; ++j)
            {
                const a = (up ? j : -j) / sides * 2 * PI; // counter clockwise seen from outside
                points.push(point(i, a));
                uvs.push(vec2(sin(a) * .5 + .5, cos(a) * .5 + .5));
            }
            mesh.addStrip(render3DPolygonStrip(points), vec3(0, up ? 1 : -1, 0), render3DPolygonStrip(uvs));
        }

    // an end left open shows the inside, so it is seen from both sides
    mesh.doubleSided = !closed && !capped && (abs(profile[0][0]) > 1e-9 || abs(profile[rings-1][0]) > 1e-9);
    return mesh;
}

/**
 * Build a sphere centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(size=1, sides=16, rings=8, smooth=render3D?.smoothShading)
{
    ASSERT(rings > 1, 'sphere needs at least 2 rings');
    const profile = [];
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI - PI/2;
        profile.push([cos(a) * size / 2, sin(a) * size / 2]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a box centered on the origin, six flat faces with uvs covering each face
 * @param {Vector3|number} [size] - Full size, a number for a cube
 * @return {Mesh}
 * @memberof Render3D
 */
function buildBox(size=1)
{
    const mesh = new Mesh;
    const half = render3DSize3(size).scale(.5);
    // each face: normal, right axis, up axis (right cross up = normal)
    const faces = [
        [vec3(0, 0, 1),  vec3(1, 0, 0),  vec3(0, 1, 0)],
        [vec3(0, 0, -1), vec3(-1, 0, 0), vec3(0, 1, 0)],
        [vec3(1, 0, 0),  vec3(0, 0, -1), vec3(0, 1, 0)],
        [vec3(-1, 0, 0), vec3(0, 0, 1),  vec3(0, 1, 0)],
        [vec3(0, 1, 0),  vec3(1, 0, 0),  vec3(0, 0, -1)],
        [vec3(0, -1, 0), vec3(1, 0, 0),  vec3(0, 0, 1)],
    ];
    for (const [n, r, u] of faces)
    {
        const center = n.multiply(half);
        const right = r.multiply(half), up = u.multiply(half);
        mesh.addStrip(render3DQuadAxes(center, right, up), n, RENDER3D_QUAD_UVS);
    }
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth rounds the lighting across cells and colors each corner
 * - flat lights and colors each cell on its own, so a checkerboard stays crisp
 * - doubleSided, a sheet seen from both sides; turn it off for ground only ever seen from above
 * - One cell is a plain square, render3D.planeMesh and planeMeshDoubleSided are shared ones
 * @param {Vector2} [size] - World size along X and Z
 * @param {Vector2|number} [segments] - Cells along X and Z, a number for both
 * @param {Color|Function} [color] - One Color for the whole grid, or (x, z) => Color
 * @param {Function} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const ground = buildGrid(vec2(20), 10, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? GRAY : WHITE); // 2 unit checks
 */
function buildGrid(size=vec2(1), segments=1, color, heightFunction=()=>0, smooth=render3D?.smoothShading)
{
    if (isNumber(segments))
        segments = vec2(segments);
    ASSERT(segments.x > 0 && segments.y > 0 && segments.x % 1 === 0 && segments.y % 1 === 0, 'grid segments must be whole numbers above zero');
    const mesh = new Mesh;
    const segmentsX = segments.x, segmentsZ = segments.y;
    const cellX = size.x / segmentsX, cellZ = size.y / segmentsZ;
    const halfX = size.x / 2, halfZ = size.y / 2, ex = cellX / 2, ez = cellZ / 2;
    const px = (i)=> i * cellX - halfX, pz = (j)=> j * cellZ - halfZ;
    const cellColor = (i, j)=> !color ? WHITE : isColor(color) ? color : color(px(i), pz(j));
    // a big terrain has millions of vertices, so each one is made once, shared by the rows above and below it,
    // and its slope normal is worked out in numbers, the same normal render3DSlopeNormal gives
    const row = (j)=>
    {
        const points = [], normals = [], uvs = [], colors = [], z = pz(j);
        const z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
        for (let i = 0; i <= segmentsX; ++i)
        {
            const x = px(i);
            points.push(vec3(x, heightFunction(x, z), z));
            uvs.push(vec2(i / segmentsX, j / segmentsZ));
            if (!smooth) continue;
            const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX);
            const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
            const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
            const s = 1 / hypot(dx, 1, dz);
            normals.push(vec3(-dx * s, s, -dz * s));
            colors.push(cellColor(i, j));
        }
        return {points, normals, uvs, colors};
    };
    let above = row(0);
    for (let j = 0; j < segmentsZ; ++j)
    {
        const below = row(j + 1);
        if (smooth)
        {
            // one ribbon per row with vertex normals from the slope
            const points = [], normals = [], uvs = [], colors = [];
            for (let i = 0; i <= segmentsX; ++i)
            {
                points.push(above.points[i], below.points[i]);
                normals.push(above.normals[i], below.normals[i]);
                uvs.push(above.uvs[i], below.uvs[i]);
                colors.push(above.colors[i], below.colors[i]);
            }
            mesh.addStrip(points, normals, uvs, colors);
        }
        else
        {
            // one quad per cell with its face normal and one color sampled at its center
            for (let i = 0; i < segmentsX; ++i)
                mesh.addQuad(above.points[i], below.points[i], below.points[i+1], above.points[i+1], cellColor(i + .5, j + .5),
                    [above.uvs[i], below.uvs[i], below.uvs[i+1], above.uvs[i+1]]);
        }
        above = below;
    }
    if (smooth)
    {
        // the grid knows which strip entries are one vertex, each shared by the rows above and below it and by the
        // repeats at the ends of its ribbons, so the upload of a big terrain skips searching millions of entries
        const n = 2 * (segmentsX + 1) + 2, keys = mesh.vertexKeys = new Int32Array(mesh.points.length);
        const id = (i, j)=> j * (segmentsX + 1) + i;
        for (let j = 0; j < segmentsZ; ++j)
        {
            const start = j * n;
            keys[start] = id(0, j); // the leading repeat
            for (let i = 0; i <= segmentsX; ++i)
                keys[start + 1 + 2*i] = id(i, j), keys[start + 2 + 2*i] = id(i, j + 1);
            keys[start + n - 1] = id(segmentsX, j + 1); // the trailing repeat
        }
    }
    mesh.doubleSided = true; // a sheet, seen from both sides; terrain seen only from above can turn it off
    return mesh;
}

/**
 * Build a sky dome: a sphere colored by direction, wound to be seen from inside
 * - set it as render3D.sky and the pass draws it around the camera behind everything
 * @param {Color} [topColor] - Straight up
 * @param {Color} [horizonColor] - Level with the camera
 * @param {Color} [bottomColor] - Straight down, what a camera looking at the ground sees past its edge; defaults to the horizon color
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSky(topColor=hsl(.6, .8, .55), horizonColor=hsl(.6, 1, .9), bottomColor=horizonColor, sides=16, rings=8)
{
    const mesh = new Mesh;
    const point = (i, a)=>
    {
        const e = i / rings * PI - PI/2;
        return vec3(sin(a) * cos(e), sin(e), cos(a) * cos(e));
    };
    const color = (i)=>
    {
        const y = point(i, 0).y;
        return y < 0 ? horizonColor.lerp(bottomColor, -y) : horizonColor.lerp(topColor, y);
    };
    for (let i = 0; i < rings; ++i)
    {
        // bottom point then top point per column, the reverse of the lathe, so the front faces inward
        const points = [], colors = [];
        for (let j = 0; j <= sides; ++j)
        {
            const a = j / sides * 2 * PI;
            points.push(point(i, a), point(i + 1, a));
            colors.push(color(i), color(i + 1));
        }
        mesh.addStrip(points, undefined, undefined, colors);
    }
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Set pos3D, rotation3D and scale3D instead of the 2D pos, size and angle
 * - Gets update, children, timers, destroy and renderOrder from EngineObject
 * - velocity3D is added to pos3D each frame, along with render3D.gravity and damping once it has a mass
 * - Objects face -Z, the same way the camera does, so lookAt turns them to face a point
 * - The 2D pos and velocity are still there but nothing draws them
 * - These inherited fields are 2D only and do nothing here: angle, angleVelocity, angleDamping,
 *   additiveColor, drawSize, mirror, clampSpeed, friction and groundObject
 * - The inherited shader works here as in 2D, and with emissive at 1 its snippet does its own lighting
 * - Set sync2D for a 2D game with 3D looks, pos and angle then drive pos3D and rotation3D,
 *   which is the one way those 2D fields reach a 3D object
 * - setCollision takes the same flags as in 2D, but the solid collision happens in 3D against size3D
 * - Its tile and raycast halves are 2D only so they default off here, and a child sits solid collision out
 * - A sync2D object collides in 2D instead, which needs the 2D size set as well as size3D
 * - setMesh swaps the mesh and frees the old one, for text and terrain that get built again
 * - addChild attaches the 3D transform, and pos3D becomes an offset from the parent
 * - The 2D offset arguments of addChild do nothing here, set the child's pos3D
 * @extends EngineObject
 * @memberof Render3D
 * @example
 * class Spinner extends EngineObject3D
 * {
 *     constructor(pos) { super(pos, buildBox(), undefined, RED); }
 *     update() { this.rotation3D.y += .02; }
 * }
 */
class EngineObject3D extends EngineObject
{
    /** Create a 3D object and add it to the object list
     *  @param {Vector3} [pos3D] - World space position
     *  @param {Mesh} [mesh] - Mesh to draw, undefined draws nothing
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile; a whole TextureInfo becomes the tile that covers it
     *  @param {Color} [color] - Tint */
    constructor(pos3D=vec3(), mesh, tileInfo, color=WHITE)
    {
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo, 'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        // a whole texture is stored as the tile that covers it, with no padding or bleed to trim
        // the edges, so this is always a TileInfo like the 2D one and the object stays an EngineObject
        if (tileInfo instanceof TextureInfo)
            tileInfo = new TileInfo(vec2(), tileInfo.size, tileInfo, 0, 0);
        super(vec2(), vec2(), tileInfo, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        this.mass = 0; // static: no 2D physics, and no 3D gravity until a mass is set

        /** @property {Vector3} - World space position, local to the parent when attached to an EngineObject3D */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians, local to the parent when attached to an EngineObject3D */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale, local to the parent when attached to an EngineObject3D */
        this.scale3D = vec3(1);
        /** @property {Vector3} - Added to pos3D each frame by the engine before update, like the 2D velocity, no super call needed;
         *  damping and render3D.gravity act on it once the object has a mass */
        this.velocity3D = vec3();
        /** @property {Vector3} - Added to rotation3D each frame by the engine before update, angleDamping is 2D only */
        this.angleVelocity3D = vec3();
        /** @property {Mesh|undefined} - Mesh to draw
         *  @type {Mesh|undefined} */
        this.mesh = mesh;
        /** @property {Vector3} - Size for the collect and callback helpers, and of the sprite when there is a tileInfo
         *  and no mesh; scale3D and any parent's scale grow it, so drawing and picking agree */
        this.size3D = vec3(1);
        /** @property {number} - Diameter of a soft shadow drawn under the object on render3D.softShadowHeight, 0 for none;
         *  scale3D and a parent's scale grow it, so set it once for the unscaled object */
        this.softShadow = 0;
        /** @property {boolean} - A sprite stands on world up instead of tilting toward the camera */
        this.upright = false;
        /** @property {boolean} - Keep this object's texture pixels hard edged, for pixel art that should not blur or bleed */
        this.pixelated = false;
        /** @property {boolean} - Copy the 2D pos and angle into pos3D and rotation3D each frame, for 2D games with 3D looks;
         *  set mass to use 2D physics, and pos3D.z stays yours to set or move with velocity3D.z */
        this.sync2D = false;
        /** @property {boolean} - Draw in the transparent stage, blended and sorted far to near with depth writes off; on for a sprite */
        this.transparent = !mesh && !!tileInfo;
        /** @property {boolean} - Additive blending, in the transparent stage */
        this.additive = false;
        /** @property {number} - How much it lights itself: 0 is lit as normal, 1 is its own color with no shading, for
         *  lamps and glowing things, between is partly self lit, and above 1 is brighter than its color, for bloom */
        this.emissive = 0;
        /** @property {number} - Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and 1 adds a light's full color at its brightest; its size is fixed */
        this.specular = 0;
        /** @property {boolean} - Draw into the shadow map when render3D.shadows is on; sprites and cut out textures cast their outline, additive objects never cast */
        this.castShadow = true;
        /** @property {boolean} - Collide as the sphere that fits size3D instead of as the size3D box, so it rolls around corners */
        this.collideAsSphere3D = false;
        /** @property {boolean} - Darkened by the shadow map when render3D.shadows is on */
        this.receiveShadow = true;
        /** @property {boolean|undefined} - Draw this object over the 2D scene, undefined uses render3D.renderAfter2D
         *  @type {boolean|undefined} */
        this.renderAfter2D = undefined;
        this.worldMatrix = new Matrix4;  // the world transform, kept up to date by render3DObjectMatrix; getMatrix returns a copy
        this.matrixBuilt = new Float64Array(9).fill(NaN); // the position, rotation and scale it was built from
        this.matrixVersion = 0;          // counts the rebuilds, so a child knows when its parent's changed
        this.matrixParent = undefined;   // the parent it was built under, and that parent's version then
        this.matrixParentVersion = 0;
    }

    /** Move by the 3D velocities and push out of solids, called automatically each frame before update, like the 2D physics
     *  - update runs once every object has moved and collided, so bounce off anything else there, it lands before the draw
     *  - Override this and call super to change how the object moves itself
     *  - A sync2D object runs the 2D physics as well, and collides there instead */
    updatePhysics()
    {
        // a sync2D object collides in 2D, which measures the 2D size, and that starts at zero on a 3D object
        ASSERT(!this.sync2D || !this.collideSolidObjects || (this.size.x && this.size.y),
            'a sync2D object collides in 2D, so give it a 2D size as well as a size3D', this.size);
        if (this.sync2D)
            super.updatePhysics();
        render3DMove(this);
        // the engine only runs this for objects that own where they are, a child rides along with its parent
        if (this.collideSolidObjects && !this.sync2D)
            render3DCollideSolid(this);
    }

    /** Move a child by its own velocities, bring a sync2D object's pos3D up to its 2D pos, then update the children,
     *  called automatically each frame */
    updateTransforms()
    {
        if (!paused)
        {
            // a child is never given updatePhysics, so it moves here, as an offset from its parent
            this.parent && render3DMove(this);
            if (this.sync2D)
                this.pos3D.x = this.pos.x, this.pos3D.y = this.pos.y, this.rotation3D.z = -this.angle;
        }
        super.updateTransforms();
    }

    /** Set how this object collides, the same flags as in 2D
     *  - Solid collision happens in 3D here, against size3D boxes or spheres; a child sits it out
     *  - A sync2D object collides in 2D instead, against the 2D size, so set that as well as size3D
     *  @param {boolean} [collideSolidObjects] - Take part in solid collision
     *  @param {boolean} [isSolid] - Block other objects, a pair where neither one blocks passes through;
     *    blocking needs collideSolidObjects, so isSolid on its own is not allowed
     *  @param {boolean} [collideTiles] - Tile collision, 2D only so it needs sync2D
     *  @param {boolean} [collideRaycast] - Raycasts, 2D only; 3D has render3D.pick and engineObjectsRaycast3D */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=false, collideRaycast=false)
    { super.setCollision(collideSolidObjects, isSolid, collideTiles, collideRaycast); }

    /** Returns the world position
     *  @return {Vector3} */
    getWorldPos3D() { return render3DObjectMatrix(this).getTranslation(); }

    /** Returns the direction the object faces, its -Z axis in the world
     *  @return {Vector3} */
    getForward3D() { return render3DAxis(render3DObjectMatrix(this).m, 8).normalize(-1); }

    /** Returns the object's right axis in the world
     *  @return {Vector3} */
    getRight3D() { return render3DAxis(render3DObjectMatrix(this).m, 0).normalize(); }

    /** Returns the object's up axis in the world
     *  @return {Vector3} */
    getUp3D() { return render3DAxis(render3DObjectMatrix(this).m, 4).normalize(); }

    /** Returns a copy of the object's world transform, relative to the parent's when attached to an EngineObject3D
     *  - The object keeps its matrix and rebuilds it only when its position, rotation or scale changed, so this is cheap to call
     *  @return {Matrix4} */
    getMatrix() { return render3DObjectMatrix(this).copy(); }

    /** Turn the object so its -Z axis points at a world space target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target)
    {
        // rotation3D is local to the parent, so a child has to aim at the target from the parent's point of view
        const parent = this.parent instanceof EngineObject3D ? this.parent : undefined;
        const local = parent ? parent.getMatrix().invert().transformPoint(target) : target;
        this.rotation3D = render3DLookRotation(local.subtract(this.pos3D), this.rotation3D);
    }

    /** Draw a different mesh and free the GPU buffer of the one it replaces
     *  - For a mesh built again when something changes, like a score, a rebuilt terrain or a loaded model
     *  - A mesh another object is still drawing is left alone, since builders are often shared
     *  - Freeing one held somewhere else only costs it an upload, the points it was built from stay
     *  @param {Mesh} [mesh] - The mesh to draw from now on, undefined to draw nothing
     *  @return {Mesh|undefined} - The mesh passed in */
    setMesh(mesh)
    {
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        const old = this.mesh;
        this.mesh = mesh;
        // nothing to free and nothing to look for when it was never uploaded
        if (old && old !== mesh && old.buffer && !engineObjects.some(o=> o.mesh === old))
            old.dispose();
        return mesh;
    }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass with the draw state set from this object's flags, draws the mesh by default */
    render3D()
    {
        // an opaque draw comes out solid however low its alpha is, so a fade with no flag looks like nothing happened
        ASSERT(this.transparent || this.additive || this.color.a >= 1, 'an object that fades needs its transparent flag, an opaque draw ignores the color alpha', this.color);
        // the matrix the object keeps, rebuilt only when it moved, the same one for the shadow pass and the main pass
        const matrix = render3DObjectMatrix(this);
        if (this.mesh)
            render3D.drawMesh(this.mesh, matrix, this.tileInfo, this.color);
        else if (this.tileInfo)
        {
            // a sprite: size3D grown by its own scale and its parents', the same world size the
            // collect, pick and solid collision helpers measure it at
            const m = matrix.m;
            render3D.drawBillboard(vec3(m[12], m[13], m[14]),
                vec2(this.size3D.x * hypot(m[0], m[1], m[2]), this.size3D.y * hypot(m[4], m[5], m[6])),
                this.tileInfo, this.color, this.rotation3D.z, this.upright);
        }
    }
}

// an object's world matrix, the one it keeps: rebuilt only when its position, rotation or scale changed since the
// last build, or its parent's matrix did, so an object that stands still costs nine compares a frame instead of
// the trig and a new matrix; the matrix returned is the object's own, read it and never change it
const render3DLocalMatrix = new Matrix4;
function render3DObjectMatrix(o)
{
    const parent = o.parent instanceof EngineObject3D ? o.parent : undefined;
    const parentMatrix = parent && render3DObjectMatrix(parent); // the parent first, so its version is current
    const p = o.pos3D, r = o.rotation3D, s = o.scale3D, k = o.matrixBuilt;
    if (k[0] !== p.x || k[1] !== p.y || k[2] !== p.z || k[3] !== r.x || k[4] !== r.y || k[5] !== r.z
        || k[6] !== s.x || k[7] !== s.y || k[8] !== s.z || o.matrixParent !== parent
        || parent && o.matrixParentVersion !== parent.matrixVersion)
    {
        k[0] = p.x, k[1] = p.y, k[2] = p.z, k[3] = r.x, k[4] = r.y, k[5] = r.z, k[6] = s.x, k[7] = s.y, k[8] = s.z;
        if (parent)
        {
            // the parent's world matrix times the local one
            buildMatrix(p, r, s, render3DLocalMatrix);
            o.worldMatrix.m.set(parentMatrix.m);
            o.worldMatrix.multiply(render3DLocalMatrix);
            o.matrixParentVersion = parent.matrixVersion;
        }
        else
            buildMatrix(p, r, s, o.worldMatrix);
        o.matrixParent = parent;
        ++o.matrixVersion;
    }
    return o.worldMatrix;
}

// move an object by its 3D velocities, an object with mass falling with render3D.gravity and slowing by its damping
function render3DMove(o)
{
    // the vectors change in place, as the 2D object's do: this runs for every object every frame
    const p = o.pos3D, v = o.velocity3D, r = o.rotation3D, a = o.angleVelocity3D;
    if (o.mass && !o.sync2D) // a 2D driven object gets the 2D gravity instead
    {
        // damped first and gravity added after, the order EngineObject.updatePhysics uses,
        // so the same mass, damping and gravity fall the same way in both
        const g = render3D.gravity, s = o.gravityScale, d = o.damping;
        v.x = v.x * d + g.x * s, v.y = v.y * d + g.y * s, v.z = v.z * d + g.z * s;
    }
    p.x += v.x, p.y += v.y, p.z += v.z;
    r.x += a.x, r.y += a.y, r.z += a.z;
}

// where a solid object is in the world and what it collides as: the sphere that fits size3D, or the size3D box,
// each grown by the object's scale
// only objects that own where they are take part, so pos3D is already world space, and however the object is
// turned its axes come out as long as its scale makes them; building the transform to read that back off it
// costs six trig calls and a matrix for every pair tested, which is the whole cost of a crowded scene
function render3DSolidShape(o)
{
    ASSERT(!o.parent, 'a child rides along with its parent, it has no world pos3D of its own to collide with');
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return {pos: o.pos3D.copy(), radius: max(s.x, s.y, s.z) / 2 * max(kx, ky, kz)};
    return {pos: o.pos3D.copy(), size: vec3(s.x * kx, s.y * ky, s.z * kz)};
}

// how far a solid shape can reach from its own center, for a quick reject before the exact test
// it has to be the shape's own radius, or a wider one: a box reaches to its corner, and a sphere
// takes the largest scale the same way render3DSolidShape does, or the reject would skip real touches
function render3DSolidReach(o)
{
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return max(s.x, s.y, s.z) / 2 * max(kx, ky, kz);
    return hypot(s.x * kx, s.y * ky, s.z * kz) / 2;
}

// what it takes to move shape a clear of shape b, whichever pair of shapes they are, or undefined for no touch
function render3DSolidPush(a, b)
{
    if (!a.size) // a is a sphere
        return b.size ? collideSphereBox(a.pos, a.radius, b.pos, b.size)
            : collideSphereSphere(a.pos, a.radius, b.pos, b.radius);
    if (!b.size) // only b is, so push b out of a and turn it around
    {
        const push = collideSphereBox(b.pos, b.radius, a.pos, a.size);
        return push && push.scale(-1);
    }
    return collideBoxBox3D(a.pos, a.size, b.pos, b.size);
}

// push a solid object out of the solids before it in the engine's list of them, so each pair is resolved once:
// the ones after it update later and test against it then, and an object that is not in the list yet, because it
// turned collision on this frame, tests them all itself and is not tested back
// one pair per test is half the work of the 2D solver, which tests both directions; the difference only shows
// when a collideWithObject destroys some third object, whose own turn then finds the pair already gone
function render3DCollideSolid(a)
{
    let shapeA = render3DSolidShape(a);
    const reachA = render3DSolidReach(a);
    for (const b of engineObjectsCollide)
    {
        if (b === a) break;
        if (b.destroyed || b.parent || b.sync2D || !(b instanceof EngineObject3D)) continue; // a child is part of its parent
        if (!a.isSolid && !b.isSolid) continue; // neither one blocks, so they pass through each other

        // the pairs nowhere near each other are almost all of them in a scene of any size, so
        // settle those with one distance check instead of building a shape for each
        const p = shapeA.pos, q = b.pos3D, reach = reachA + render3DSolidReach(b);
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        if (dx*dx + dy*dy + dz*dz > reach*reach)
            continue;

        const push = render3DSolidPush(shapeA, render3DSolidShape(b));
        if (!push) continue;

        // both objects hear about it, and either one can take the touch over
        const resolveA = a.collideWithObject(b, push);
        const resolveB = b.collideWithObject(a, push.scale(-1));
        if (!resolveA || !resolveB) continue;

        // heavier objects move less, mass 0 stays put; then bounce apart when moving toward each other
        const total = a.mass + b.mass;
        const weightA = !a.mass ? 0 : !b.mass ? 1 : b.mass / total;
        const weightB = !b.mass ? 0 : !a.mass ? 1 : a.mass / total;
        a.pos3D = a.pos3D.add(push.scale(weightA));
        b.pos3D = b.pos3D.subtract(push.scale(weightB));
        if (weightA)
            shapeA = render3DSolidShape(a); // it moved, so the next solid must be tested against where it is now
        const normal = push.normalize();
        if (a.velocity3D.dot(normal) < 0)
            a.velocity3D = a.velocity3D.reflect(normal, a.restitution);
        if (b.velocity3D.dot(normal) > 0)
            b.velocity3D = b.velocity3D.reflect(normal, b.restitution);
    }
}

/**
 * Collect the EngineObject3D objects whose boxes overlap a box, sizes are full sizes
 * - Boxes are axis aligned around the world position, rotation3D is ignored; lights, emitters and trails have no size
 * @param {Vector3} pos - Center of the box
 * @param {Vector3|number} size - Full size of the box, a number for a cube
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsCollect3D(pos, size, objects=engineObjects)
{
    size = render3DSize3(size);
    const collected = [];
    for (const o of objects)
    {
        if (!(o instanceof EngineObject3D) || o.destroyed) continue;
        const m = render3DObjectMatrix(o).m, s = o.size3D; // the box in world space, scaled by the object and its parents
        if (!(s.x || s.y || s.z)) continue;
        const worldSize = vec3(s.x * hypot(m[0], m[1], m[2]), s.y * hypot(m[4], m[5], m[6]), s.z * hypot(m[8], m[9], m[10]));
        if (isOverlapping3D(pos, size, vec3(m[12], m[13], m[14]), worldSize))
            collected.push(o);
    }
    return collected;
}

// how far along a ray an object is hit, or undefined for a miss; each one is tested as a sphere
// around its mesh, or around a sprite's size3D, not triangle by triangle
function render3DRaycastObject(ray, o)
{
    if (o.destroyed || !(o instanceof EngineObject3D) || !(o.mesh || o.tileInfo)) return;
    if (o instanceof InstancedMesh3D) return; // its instances are not objects, and its one sphere is not a thing to hit
    const matrix = render3DObjectMatrix(o), mesh = o.mesh; // a sprite is picked by its size3D
    const radius = (mesh ? mesh.radius || mesh.computeRadius() : hypot(o.size3D.x, o.size3D.y) / 2) * render3DMaxScale(matrix.m);
    if (!(radius > 0)) return; // nothing to hit
    return raycastSphere(ray, matrix.getTranslation(), radius);
}

/**
 * Collect every EngineObject3D a ray passes through, nearest first, the 3D twin of engineObjectsRaycast
 * - The ray has no end, so everything along it counts however far away it is
 * - Use render3D.pick for the nearest one on its own, with the distance to it
 * @param {Ray3D} ray - From render3D.screenToRay, or any ray
 * @param {Array<EngineObject>} [objects] - Defaults to every object; only those with a mesh or a sprite count
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsRaycast3D(ray, objects=engineObjects)
{
    const hits = [];
    for (const o of objects)
    {
        const distance = render3DRaycastObject(ray, o);
        if (distance !== undefined)
            hits.push({o, distance});
    }
    return hits.sort((a, b)=> a.distance - b.distance).map(hit=> hit.o);
}

/**
 * Call a function for each EngineObject3D whose box overlaps a box
 * @param {Vector3} pos - Center of the box
 * @param {Vector3|number} size - Full size of the box, a number for a cube
 * @param {Function} callback
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @memberof Render3D
 */
function engineObjectsCallback3D(pos, size, callback, objects=engineObjects)
{ engineObjectsCollect3D(pos, size, objects).forEach(callback); }

///////////////////////////////////////////////////////////////////////////////
/**
 * InstancedMesh3D - Many copies of one mesh drawn as one call, with their transforms kept on the GPU
 * - For big sets that mostly stay put: an instance costs nothing per frame until it changes, so a hundred thousand
 *   trees cost what one tree does; objects and drawMesh batch by themselves too, but rebuild their batch every frame
 * - setMatrixAt and setColorAt change one instance, and only the changed range uploads before the next draw
 * - The instances are in world space; the object's own pos3D, rotation3D and scale3D do not move them
 * - The whole set is culled by one bounding sphere around the origin, and casts and receives shadows like any object
 * - The object's flags cover the whole set, one emissive, one tileInfo, one shader; only the colors are per instance
 * - A mirrored instance, one with a negative scale, shows its inside unless the mesh is doubleSided
 * - A transparent set draws in one go in the transparent stage, its instances are not sorted against each other
 * - pick, the raycast and the collect helpers do not see the instances, test them yourself from instanceData
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const forest = new InstancedMesh3D(treeMesh, 1000);
 * for (let i = 0; i < 1000; ++i)
 *     forest.setMatrixAt(i, buildMatrix(randomGroundPos(), vec3(0, rand(2*PI), 0)));
 */
class InstancedMesh3D extends EngineObject3D
{
    /** Create a set of instances of a mesh, each at the origin in the object's color until it is set
     *  @param {Mesh} mesh
     *  @param {number} count - How many instances there is room for, all of them draw until count is lowered
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for all of them
     *  @param {Color} [color] - The color they start with */
    constructor(mesh, count, tileInfo, color=WHITE)
    {
        super(vec3(), mesh, tileInfo, color);
        ASSERT(mesh instanceof Mesh, 'an InstancedMesh3D needs a Mesh');
        ASSERT(count >= 1, 'an InstancedMesh3D needs room for at least one instance');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How many instances draw, the first ones, up to the count it was made with */
        this.count = count;
        /** @property {number} - How many instances it was made with */
        this.maxCount = count;
        /** @property {Float32Array} - The per instance values the shader reads, 24 floats each: the matrix, the color
         *  and the uv rect; edit it directly and call markDirty for the instances changed */
        this.instanceData = new Float32Array(count * RENDER3D_INSTANCE_FLOATS);
        /** @property {number} - Radius of the sphere around the origin that holds every instance set so far, for culling */
        this.radius = 0;
        /** @property {number} - First instance to upload before the next draw */
        this.dirtyStart = 0;
        /** @property {number} - One past the last instance to upload, so nothing uploads when it is not past dirtyStart */
        this.dirtyEnd = count;
        this.buffer = undefined;    // the GPU copy of instanceData
        this.bufferGeneration = -1; // the context it was made under
        this.uvTileInfo = tileInfo; // the tile the uv rects were written for
        const uv = render3DGetTileUVs(tileInfo), data = this.instanceData;
        for (let i = 0; i < count; ++i)
        {
            this.setMatrixAt(i, RENDER3D_IDENTITY);
            const k = i * RENDER3D_INSTANCE_FLOATS;
            data[k+16] = color.r; data[k+17] = color.g; data[k+18] = color.b; data[k+19] = color.a;
            data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
        }
    }

    /** Place an instance, in world space
     *  @param {number} i
     *  @param {Matrix4} matrix */
    setMatrixAt(i, matrix)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const data = this.instanceData, k = i * RENDER3D_INSTANCE_FLOATS, m = matrix.m;
        data.set(m, k);
        const meshRadius = this.mesh.radius || this.mesh.computeRadius(); // the builders leave it to upload
        this.radius = max(this.radius, (m[12]*m[12] + m[13]*m[13] + m[14]*m[14]) ** .5 + meshRadius * render3DMaxScale(m));
        this.markDirty(i);
    }

    /** The matrix of an instance
     *  @param {number} i
     *  @return {Matrix4} */
    getMatrixAt(i)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const k = i * RENDER3D_INSTANCE_FLOATS, matrix = new Matrix4;
        matrix.m.set(this.instanceData.subarray(k, k + 16));
        return matrix;
    }

    /** Color an instance
     *  @param {number} i
     *  @param {Color} color */
    setColorAt(i, color)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        ASSERT(isColor(color), 'color must be a Color');
        const data = this.instanceData, k = i * RENDER3D_INSTANCE_FLOATS;
        data[k+16] = color.r; data[k+17] = color.g; data[k+18] = color.b; data[k+19] = color.a;
        this.markDirty(i);
    }

    /** Note that an instance changed, so it uploads before the next draw; setMatrixAt and setColorAt call this
     *  @param {number} i */
    markDirty(i)
    {
        this.dirtyStart = min(this.dirtyStart, i);
        this.dirtyEnd = max(this.dirtyEnd, i + 1);
    }

    /** Draws every instance as one call, uploading the ones that changed first */
    render3D()
    {
        const r = render3D, gl = glContext, mesh = this.mesh;
        ASSERT(this.count >= 0 && this.count <= this.maxCount, 'count must be within the count it was made with');
        if (!mesh || !this.count || !render3DCanDraw()) return;
        if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
        if (!mesh.buffer || mesh.dirty || mesh.contextGeneration !== r.contextGeneration)
            mesh.upload();
        if (!mesh.bufferCount) return;
        if (r.frustumCulling && !render3DSphereVisible(0, 0, 0, this.radius)) return;

        // the uv rect is the object's tile for every instance, rewritten when the tile changes
        if (this.uvTileInfo !== this.tileInfo)
        {
            const uv = render3DGetTileUVs(this.tileInfo), data = this.instanceData;
            for (let k = 20; k < data.length; k += RENDER3D_INSTANCE_FLOATS)
                data[k] = uv.x, data[k+1] = uv.y, data[k+2] = uv.w, data[k+3] = uv.h;
            this.uvTileInfo = this.tileInfo;
            this.dirtyStart = 0, this.dirtyEnd = this.maxCount;
        }

        // the GPU copy: all of it under a fresh context, otherwise just the changed range
        if (!this.buffer || this.bufferGeneration !== r.contextGeneration)
        {
            this.buffer = gl.createBuffer();
            this.bufferGeneration = r.contextGeneration;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
        }
        else if (this.dirtyEnd > this.dirtyStart)
        {
            const start = this.dirtyStart * RENDER3D_INSTANCE_FLOATS, end = this.dirtyEnd * RENDER3D_INSTANCE_FLOATS;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, start * 4, this.instanceData, start, end - start);
        }
        this.dirtyStart = Infinity, this.dirtyEnd = 0;

        // one draw under the object's state, the mesh setting the culling as drawMesh does
        r.flush();
        const cullBackFaces = r.cullBackFaces, tileInfo = this.tileInfo;
        r.cullBackFaces = !mesh.doubleSided;
        render3DDrawInstanced(mesh, this.buffer, this.count, tileInfo instanceof TileInfo ? tileInfo.textureInfo : tileInfo, r);
        r.cullBackFaces = cullBackFaces;
    }

    /** Destroy the set and free its GPU buffer
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.buffer && this.bufferGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer);
        this.buffer = undefined;
        super.destroy(immediate);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A light that is an EngineObject3D, so it can move, follow a parent or be destroyed like anything else
 * - A point light: it lights what is near it and fades out by its radius, DirectionalLight3D shines from far away
 * - Only the sun, render3D.sunDirection, casts shadows; these light and make highlights without one
 * - Only the 8 lights nearest the camera are used each frame
 * - radius is where the light fades out, and it fades fast, so a small radius wants a higher intensity
 * - intensity multiplies the color, above 1 for a light brighter than white
 * - radius is a world distance, so scale3D does not change it
 * - An alpha, an intensity or a radius of 0 switches it off, and a light that is off takes none of those slots
 * - Draws nothing itself, add a glow with drawSoftDisc or a small emissive mesh if it should be seen
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const torch = new Light3D(vec3(0, 3, 0), 10, hsl(.1, 1, .65));
 */
class Light3D extends EngineObject3D
{
    /** Create a point light
     *  @param {Vector3} [pos3D] - Where it is
     *  @param {number} [radius] - Distance where the light fades to nothing
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(), radius=5, color=WHITE, intensity=1)
    {
        super(pos3D, undefined, undefined, color);
        ASSERT(radius >= 0, 'light radius cannot be negative, 0 is an off switch like an alpha of 0');
        ASSERT(intensity >= 0, 'light intensity cannot be negative, 0 is an off switch');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - Distance where the light fades to nothing */
        this.radius = radius;
        /** @property {number} - Brightness, multiplies the color, above 1 is brighter than white */
        this.intensity = intensity;
        /** @property {boolean} - Shine from far away, from its position toward the origin, instead of out from its
         *  position with a falloff; DirectionalLight3D sets it */
        this.directional = false;
    }

    /** Lights draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * DirectionalLight3D - A Light3D that shines from far away with no falloff, like sunlight
 * - It shines from its position toward the origin, like a three.js DirectionalLight: only the direction to it
 *   counts, so moving it or its parent swings the light around; parent it to a sun in the sky and it follows
 * - It cannot sit on the origin, since that leaves no direction
 * - Like every Light3D it casts no shadow, only the sun, render3D.sunDirection, does
 * @extends Light3D
 * @memberof Render3D
 * @example
 * const fill = new DirectionalLight3D(vec3(-1, 1, 1), hsl(.6, .5, .3)); // from the back left and above
 */
class DirectionalLight3D extends Light3D
{
    /** Create a directional light
     *  @param {Vector3} [pos3D] - Where it shines from, toward the origin
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(0, 1, 0), color=WHITE, intensity=1)
    {
        super(pos3D, 0, color, intensity);
        this.directional = true;
    }
}

/*
 * LittleJS 3D Extras Plugin
 * - Things built on the 3D renderer that it does not need in order to draw: the rest of the shape builders,
 *   HeightMap terrain, the camera controls, ParticleEmitter3D and Trail3D, and the OBJ loader
 * - Requires the Render3D plugin and goes after it, everything here is part of its Render3D namespace
 */

///////////////////////////////////////////////////////////////////////////////
// Helpers used only here

// gap between lines of 3D text, as a share of the character height; flat text can let lines touch
// the way the 2D font does, but extruded glyphs seen from an angle then overlap the line below
const RENDER3D_TEXT_LEADING = 1.3;

// surface normal from the slope of a height function, sampled half a cell each way but kept inside the half sizes
function render3DSlopeNormal(heightFunction, x, z, ex, ez, halfX, halfZ)
{
    const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX), z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
    const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
    const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
    return vec3(-dx, 1, -dz).normalize();
}

// let go of the parent but stay where the object was in the world; a destroyed parent has already let go, so the
// position remembered by the last update stands in
function render3DDetach(o)
{
    if (o.parent)
        o.pos3D = o.getWorldPos3D(), o.parent.removeChild(o);
    else if (o.worldPos3D)
        o.pos3D = o.worldPos3D;
}

// a soft white dot for untextured particles, made once from a canvas, undefined headless or without a canvas
let render3DSoftDotTexture;
function render3DSoftDot()
{
    if (render3DSoftDotTexture || !glContext || typeof OffscreenCanvas == 'undefined') return render3DSoftDotTexture;
    const size = 32, context = createCanvasContext(size);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]]) // the same falloff as a soft disc
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return render3DSoftDotTexture = new TextureInfo(context.canvas);
}

///////////////////////////////////////////////////////////////////////////////
// The rest of the shape builders: buildLathe, buildSphere, buildBox, buildGrid and buildSky live with the
// renderer, since it hands those out itself

/**
 * Build a cylinder standing on the Y axis, centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [size / 2, height / 2]], sides, smooth, capped);
}

/**
 * Build a cone standing on the Y axis, centered on the origin, the point up
 * @param {number} [size] - Diameter of the base
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the base
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCone(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [0, height / 2]], sides, smooth, capped);
}

/**
 * Build a capsule standing on the Y axis, centered on the origin: a cylinder with a half sphere on each end
 * @param {number} [size] - Diameter
 * @param {number} [height] - Total height including the rounded ends, at least the size
 * @param {number} [sides] - Around
 * @param {number} [rings] - On each end
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCapsule(size=1, height=1, sides=16, rings=4, smooth=render3D?.smoothShading)
{
    // the rounded ends alone are already the size tall, so a shorter capsule is only a sphere
    ASSERT(height >= size, 'a capsule is at least as tall as it is wide, the ends take up the size', size, height);
    const profile = [], r = size / 2, straight = max(0, height - size) / 2;
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * sin(a), -straight - r * cos(a)]);
    }
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * cos(a), straight + r * sin(a)]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a donut lying flat around the Y axis
 * @param {number} [size] - Diameter of the whole donut, outside edge to outside edge
 * @param {number} [tubeSize] - Diameter of the tube
 * @param {number} [sides] - Around the ring
 * @param {number} [tubeSides] - Around the tube
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth=render3D?.smoothShading)
{
    ASSERT(tubeSize <= size, 'the tube must fit inside the torus');
    const profile = [], radius = (size - tubeSize) / 2, tubeRadius = tubeSize / 2;
    for (let i = 0; i <= tubeSides; ++i)
    {
        const a = i / tubeSides * 2 * PI;
        profile.push([radius + tubeRadius * cos(a), tubeRadius * sin(a)]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a lit ribbon along a path, for roads, tracks and walls
 * - Each segment is a flat quad, the sides are across the path in the plane of the up vector
 * - doubleSided, so it is seen and lit from below as well
 * @param {Array<Vector3>} points - Center line in order
 * @param {number|Array<number>} [width] - Full width, one for all or one per point
 * @param {Color|Array<Color>} [color] - One for all or one per point
 * @param {boolean} [closed] - Join the last point back to the first
 * @param {Vector3} [up] - Which way the ribbon faces
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const road = buildRibbon(trackPoints, 8, GRAY, true); // a loop of road
 */
function buildRibbon(points, width=1, color=WHITE, closed=false, up=vec3(0, 1, 0))
{
    ASSERT(isArray(points) && points.length > 1, 'ribbon needs at least 2 points');
    const mesh = new Mesh, count = points.length, edges = [];
    let across = (abs(up.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0)).cross(up).normalize(); // anything across up
    for (let i = 0; i < count; ++i)
    {
        // across the path, from the tangent through this point; a step along up keeps the last across
        const next = points[closed ? (i + 1) % count : min(i + 1, count - 1)];
        const last = points[closed ? (i + count - 1) % count : max(i - 1, 0)];
        const dir = next.subtract(last).cross(up);
        if (dir.lengthSquared() > 1e-12)
            across = dir.normalize();
        const half = across.scale((isArray(width) ? width[i] : width) / 2);
        edges.push([points[i].subtract(half), points[i].add(half)]);
    }
    for (let i = 0; i + 1 < count + (closed ? 1 : 0); ++i)
    {
        const j = (i + 1) % count, a = edges[i], b = edges[j];
        const c = isArray(color) ? [color[i], color[i], color[j], color[j]] : color;
        mesh.addQuad(a[0], a[1], b[1], b[0], c); // counter clockwise seen from above
    }
    mesh.doubleSided = true; // a flat strip, seen from both sides
    return mesh;
}

/**
 * Build a hull from a row of diamond shaped slices along Z, for ships, planes and cars
 * - Each slice is [z, width, top, bottom, sideHeight]
 * - sideHeight is 0 to 1 and puts the side corners between the bottom and the top
 * - List the slices nose first, with the nose at the largest z
 * @param {Array<Array<number>>} stations
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const hull = buildLoft([[1.2, .4, .2, -.1], [0, 1.4, .5, -.4], [-1, 1, .3, -.3]]);
 */
function buildLoft(stations)
{
    ASSERT(isArray(stations) && stations.length > 1, 'loft needs at least 2 stations');
    // the caps and the winding both assume the nose leads, so the other order turns the hull inside out
    ASSERT(stations[0][0] > stations[stations.length-1][0], 'loft stations go nose first, from the largest z to the smallest');
    const mesh = new Mesh;
    // section points: left, top, right, bottom, wound clockwise seen from +z
    const section = ([z, w, t, b, m=.5])=>
        [vec3(-w / 2, lerp(b, t, m), z), vec3(0, t, z), vec3(w / 2, lerp(b, t, m), z), vec3(0, b, z)];
    for (let i = 0; i + 1 < stations.length; ++i)
    {
        const s1 = section(stations[i]), s2 = section(stations[i + 1]);
        for (let k = 0; k < 4; ++k)
            mesh.addQuad(s1[k], s1[(k + 1) % 4], s2[(k + 1) % 4], s2[k]);
    }
    const tail = section(stations[stations.length - 1]), nose = section(stations[0]);
    mesh.addQuad(tail[0], tail[1], tail[2], tail[3]);
    mesh.addQuad(nose[3], nose[2], nose[1], nose[0]);
    return mesh;
}

/**
 * Turn a sprite into a 3D block model by giving its pixels thickness
 * - A pixel counts as solid when it is more than half opaque
 * - Each pixel keeps its own color, so white art takes the object's tint
 * - Runs of matching pixels merge into one face, and side walls appear only at the sprite's edges
 * - A texture's pixels are read once and kept, so redrawing a canvas texture will not change what this builds
 * - Pixels can also be an array of rows, each a Color, a truthy value for white, or a falsy value for empty
 * @param {TileInfo|Array<Array<Color|number|boolean>>} pixels - A tile from a loaded texture, or rows of pixels,
 *  each a Color (empty when see through), a truthy value for white or a falsy value for empty
 * @param {Vector2} [size] - World width and height of the whole tile, centered like buildBox
 * @param {number} [depth] - Thickness along Z
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), buildExtrude(tile(3, 16), vec2(2), .5)); // a chunky version of tile 3
 */
function buildExtrude(pixels, size=vec2(1), depth=1)
{
    let rows = pixels, width, height;
    if (pixels instanceof TileInfo)
    {
        // colors for the tile's pixels only, undefined where alpha is half or less
        const image = render3DReadPixels(pixels.textureInfo), data = image.data;
        const x0 = pixels.pos.x | 0, y0 = pixels.pos.y | 0;
        width = pixels.size.x | 0, height = pixels.size.y | 0;
        rows = [];
        for (let y = 0; y < height; ++y)
        {
            const row = rows[y] = [];
            for (let x = 0; x < width; ++x)
            {
                const k = ((y0 + y) * image.width + x0 + x) * 4;
                row.push(data[k + 3] > 127 ? rgb(data[k] / 255, data[k + 1] / 255, data[k + 2] / 255) : undefined);
            }
        }
    }
    else
    {
        ASSERT(isArray(pixels) && pixels.length, 'pixels must be a TileInfo or rows of pixels');
        height = rows.length, width = rows[0].length;
    }

    // the color of a solid pixel, undefined outside or where it is empty
    const solid = (x, y)=>
    {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const c = rows[y] && rows[y][x];
        if (!c) return;
        return isColor(c) ? (c.a > .5 ? c : undefined) : WHITE; // a see through Color is empty too
    };
    const same = (a, b)=> a === b || !!a && !!b && a.rgbaInt() === b.rgbaInt();

    // call emit(start, end, color) for each run of same colored pixels, colorAt(i) undefined breaks the run
    const runs = (count, colorAt, emit)=>
    {
        let start = 0, color;
        for (let i = 0; i <= count; ++i)
        {
            const c = i < count ? colorAt(i) : undefined;
            if (same(c, color)) continue;
            if (color) emit(start, i, color);
            start = i, color = c;
        }
    };

    // pixel edges in world space, y runs down the image
    const mesh = new Mesh, sx = size.x / width, sy = size.y / height, hz = depth / 2;
    const px = x=> x * sx - size.x / 2, py = y=> size.y / 2 - y * sy;
    const quad = (origin, right, up, normal, color)=>
        mesh.addStrip(render3DQuadAxes(origin.add(right.scale(.5)).add(up.scale(.5)), right.scale(.5), up.scale(.5)), normal, RENDER3D_QUAD_UVS, color);
    const X = vec3(1, 0, 0), Y = vec3(0, 1, 0), Z = vec3(0, 0, 1);
    for (let y = 0; y < height; ++y)
    {
        // front and back faces along each row
        runs(width, x=> solid(x, y), (a, b, c)=>
        {
            const w = X.scale((b - a) * sx), h = Y.scale(sy);
            quad(vec3(px(a), py(y + 1), hz), w, h, Z, c);
            quad(vec3(px(b), py(y + 1), -hz), w.scale(-1), h, Z.scale(-1), c);
        });
        // walls facing up and down where the pixel above or below is empty
        runs(width, x=> solid(x, y - 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y), hz), X.scale((b - a) * sx), Z.scale(-depth), Y, c));
        runs(width, x=> solid(x, y + 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y + 1), -hz), X.scale((b - a) * sx), Z.scale(depth), Y.scale(-1), c));
    }
    for (let x = 0; x < width; ++x)
    {
        // walls facing left and right where the pixel beside is empty
        runs(height, y=> solid(x - 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x), py(b), -hz), Z.scale(depth), Y.scale((b - a) * sy), X.scale(-1), c));
        runs(height, y=> solid(x + 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x + 1), py(b), hz), Z.scale(-depth), Y.scale((b - a) * sy), X, c));
    }
    return mesh;
}

/**
 * Build a mesh of extruded text from an image font, the engine font by default so it needs no assets
 * - Each glyph is extruded once per font and reused, the block is centered and faces +Z
 * - Newlines stack downward, spaced a little wider than the character height so the sides do not collide
 * - Every call builds a new mesh, dispose the old one when text changes often
 * - Glyphs are white in the engine font, so the object's color tints the text
 * @param {string|number} text
 * @param {number} [size] - Character height in world units
 * @param {number} [depth] - Thickness along Z
 * @param {ImageFont} [font] - Defaults to engineImageFont
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(0, 2, 0), buildText3D('HELLO'), undefined, YELLOW);
 */
function buildText3D(text, size=1, depth=.2, font=engineImageFont)
{
    ASSERT(font instanceof ImageFont, 'font must be an ImageFont, the engine font loads before gameInit');
    const tileInfo = font.tileInfo, padding = tileInfo.padding;
    const paddedX = tileInfo.size.x + padding * 2, paddedY = tileInfo.size.y + padding * 2;
    const columns = tileInfo.textureInfo.size.x / paddedX | 0;
    let glyphs = render3DGlyphCache.get(font); // unit sized, scaled when combined
    glyphs || render3DGlyphCache.set(font, glyphs = new Map);
    const charSize = vec2(size * tileInfo.size.x / tileInfo.size.y, size);
    const mesh = new Mesh, lines = (text + '').split('\n');
    lines.forEach((line, j)=>
    {
        const y = ((lines.length - 1) / 2 - j) * charSize.y * RENDER3D_TEXT_LEADING;
        for (let i = 0; i < line.length; ++i)
        {
            const charCode = line.charCodeAt(i);
            const index = charCode < 32 || charCode > 127 ? 95 : charCode - 32; // like ImageFont
            if (!index) continue; // space
            let glyph = glyphs.get(index);
            if (!glyph)
            {
                const pos = vec2(index % columns * paddedX + padding, (index / columns | 0) * paddedY + padding);
                glyphs.set(index, glyph = buildExtrude(new TileInfo(pos, tileInfo.size, tileInfo.textureInfo)));
            }
            const x = (i - (line.length - 1) / 2) * charSize.x;
            mesh.combine(glyph, buildMatrix(vec3(x, y, 0), undefined, vec3(charSize.x, charSize.y, depth)));
        }
    });
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * HeightMap - Terrain built from a grid of heights, with a mesh, a height lookup and a raycast
 * - heights is a 2D array [row][column] of 0 to 1 values
 * - Row 0 is the far edge at -Z and column 0 is the left edge at -X
 * - It can be an image instead, where the red channel is the height
 * - colors is an optional 2D array of Colors or an image, sampled per vertex
 * - images are read through a canvas, so they must be same origin or loaded with crossOrigin set
 * @memberof Render3D
 * @example
 * const terrain = new HeightMap(heightImage, vec2(100, 100), 10, colorImage);
 * new EngineObject3D(vec3(), terrain.buildMesh());
 * const y = terrain.getHeight(x, z); // stand things on it
 */
class HeightMap
{
    /** Create a height map from an array or an image
     *  @param {Array<Array<number>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} heights
     *  @param {Vector2} [size] - World size along X and Z
     *  @param {number} [height] - World height of a full value
     *  @param {Array<Array<Color>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} [colors] */
    constructor(heights, size=vec2(1), height=1, colors)
    {
        if (!isArray(heights))
            heights = render3DImageToArray(heights, (r)=> r / 255);
        if (colors && !isArray(colors))
            colors = render3DImageToArray(colors, (r, g, b, a)=> rgb(r / 255, g / 255, b / 255, a / 255));
        ASSERT(isArray(heights) && heights.length > 1 && isArray(heights[0]) && heights[0].length > 1, 'height map needs at least 2 rows and 2 columns');
        ASSERT(size.x > 0 && size.y > 0, 'height map size must be positive, a zero size has nowhere to look things up');

        /** @property {Array<Array<number>>} - Heights 0-1 as [row][column], rows along Z */
        this.heights = heights;
        /** @property {Array<Array<Color>>|undefined} - Vertex colors as [row][column], undefined for white
         *  @type {Array<Array<Color>>|undefined} */
        this.colors = colors;
        /** @property {Vector2} - World size along X and Z */
        this.size = size.copy();
        /** @property {number} - World height of a full value */
        this.height = height;
    }

    /** Number of rows, along Z
     *  @return {number} */
    get rows() { return this.heights.length; }

    /** Number of columns, along X
     *  @return {number} */
    get columns() { return this.heights[0].length; }

    /** World height at a position, exactly the height of the mesh buildMesh draws there, clamped at the edges
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {number} */
    getHeight(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x; // a position works as well as its two numbers, its own y is ignored
        const columns = this.columns, rows = this.rows, h = this.heights;
        const u = clamp((x / this.size.x + .5) * (columns - 1), 0, columns - 1);
        const v = clamp((z / this.size.y + .5) * (rows - 1), 0, rows - 1);
        const i = min(floor(u), columns - 2), j = min(floor(v), rows - 2);
        const fu = u - i, fv = v - j;
        // each cell is two triangles split from (i, j+1) to (i+1, j), the same split buildGrid's quads use
        const a = h[j][i], b = h[j+1][i], c = h[j+1][i+1], d = h[j][i+1];
        const height = fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
        return height * this.height;
    }

    /** Surface normal at a position, from the slope across a sample
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Vector3} */
    getNormal(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const ex = this.size.x / (this.columns - 1) / 2, ez = this.size.y / (this.rows - 1) / 2;
        return render3DSlopeNormal((x, z)=> this.getHeight(x, z), x, z, ex, ez, this.size.x / 2, this.size.y / 2);
    }

    /** Color of the nearest sample to a position, white when there are no colors
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Color} */
    getColor(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const c = this.colors;
        if (!c) return WHITE;
        const columns = c[0].length, rows = c.length;
        const i = clamp(round((x / this.size.x + .5) * (columns - 1)), 0, columns - 1);
        const j = clamp(round((z / this.size.y + .5) * (rows - 1)), 0, rows - 1);
        return c[j][i];
    }

    /** Distance along a ray to where it crosses the terrain surface, or undefined for a miss
     *  - Steps along the ray half a cell at a time, then narrows in on the exact spot
     *  - A ray that starts under the ground crosses on its way out, so the hit is still on the surface
     *  @param {Ray3D} ray - From screenToRay, or any ray
     *  @return {number|undefined} */
    raycast(ray)
    {
        const {origin, direction} = ray;
        const size = this.size, height = this.height, length = direction.length();
        if (!length) return;

        // clip to the box around the terrain, and walk it in half cell steps from there
        let t = raycastBox(ray, vec3(0, height / 2, 0), vec3(size.x, abs(height) + 1e-3, size.y));
        if (t === undefined) return;
        const cell = min(size.x / (this.columns - 1), size.y / (this.rows - 1));
        const step = cell / 2 / length, end = t + hypot(size.x, size.y, height) / length;
        if (!(step > 0)) return; // a zero size

        // is the ray below the ground this far along, or undefined where it is off the map
        const under = (at)=>
        {
            const p = origin.add(direction.scale(at));
            if (abs(p.x) > size.x / 2 || abs(p.z) > size.y / 2) return;
            return p.y <= this.getHeight(p.x, p.z);
        };

        // look for where the ray changes sides, so one coming up from under the ground
        // lands on the surface it breaks through instead of wherever it entered the box
        const startUnder = under(t);
        if (startUnder === undefined) return; // it meets the box outside the map itself
        for (; t < end; t += step)
        {
            const u = under(t + step);
            if (u === undefined) return; // it left the map before crossing
            if (u === startUnder) continue;

            // it crossed between the last two samples, halve the gap until it is exact
            let a = t, b = t + step;
            for (let i = 0; i < 16; ++i)
            {
                const mid = (a + b) / 2;
                under(mid) === startUnder ? a = mid : b = mid;
            }
            return b;
        }
    }

    /** Build the terrain mesh, one vertex per sample, centered on the origin
     *  @param {boolean} [smooth] - Defaults to render3D.smoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3D?.smoothShading)
    {
        return buildGrid(this.size, vec2(this.columns - 1, this.rows - 1),
            this.colors && ((x, z)=> this.getColor(x, z)), (x, z)=> this.getHeight(x, z), smooth);
    }
}

// read an image's pixel bytes through the engine's work canvas, as {data, width, height}
function render3DImageData(image)
{
    if (image instanceof TextureInfo)
        image = image.image;
    ASSERT(image && image.width && image.height, 'image is not loaded');
    ASSERT(workReadCanvas, 'reading an image needs a canvas, pass arrays in headless mode');
    const width = image.width, height = image.height;
    workReadCanvas.width = width;
    workReadCanvas.height = height;
    workReadContext.drawImage(image, 0, 0);
    return workReadContext.getImageData(0, 0, width, height);
}

// read an image into a 2D array [row][column], sample is called with (r, g, b, a) bytes for each pixel
function render3DImageToArray(image, sample)
{
    const {data, width, height} = render3DImageData(image);
    const rows = [];
    for (let y = 0; y < height; ++y)
    {
        const row = rows[y] = [];
        for (let x = 0; x < width; ++x)
        {
            const k = (y * width + x) * 4;
            row.push(sample(data[k], data[k+1], data[k+2], data[k+3]));
        }
    }
    return rows;
}

// extruded glyph meshes by font, and the pixel bytes of a texture, read once per image
const render3DGlyphCache = new WeakMap, render3DPixelCache = new WeakMap;
function render3DReadPixels(textureInfo)
{
    const image = textureInfo.image;
    let pixels = render3DPixelCache.get(image);
    if (!pixels)
        render3DPixelCache.set(image, pixels = render3DImageData(image));
    return pixels;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * CameraControl3D - Drag to turn the camera around a point, roll the wheel to zoom
 * - An EngineObject3D, so move its pos3D to follow something, or parent it to an object
 * - Destroy it to hand the camera back, and it stops driving the camera
 * - Set persistent to keep it when engineObjectsDestroy clears out a level
 * - Every part of it is a field, so a game can change the buttons, speeds and limits
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * new CameraControl3D(vec3(0, 1, 0), 15); // look at a point from 15 units away
 */
class CameraControl3D extends EngineObject3D
{
    /** Create a camera control, it drives render3D.camera every frame
     *  @param {Vector3} [target] - The point to look at, its pos3D
     *  @param {number} [distance] - How far the camera sits from the target
     *  @param {number} [pitch] - Angle above the horizon, PI/2 looks straight down
     *  @param {number} [idleSpin] - Turned each frame while not dragging, 0 holds still */
    constructor(target=vec3(), distance=10, pitch=.4, idleSpin=0)
    {
        super(target);
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How far the camera sits from the target */
        this.distance = distance;
        /** @property {number} - Angle above the horizon */
        this.pitch = pitch;
        /** @property {number} - Turned each frame while not dragging */
        this.idleSpin = idleSpin;
        /** @property {number} - Angle around the target, dragging changes it */
        this.yaw = 0;
        /** @property {number} - Mouse button that turns the camera, 0 is left and 2 is right */
        this.dragButton = 0;
        /** @property {number} - How far dragging a pixel turns the camera */
        this.dragSpeed = .01;
        /** @property {number} - How much one wheel notch zooms, 0 turns zooming off */
        this.zoomSpeed = .1;
        /** @property {Vector2} - Closest and furthest the wheel can zoom to */
        this.zoomRange = vec2(distance/4, distance*3);
        /** @property {Vector2} - Lowest and highest pitch, so it cannot tip over the top */
        this.pitchRange = vec2(-.2, 1.4);
    }

    /** Read the mouse and put the camera on its orbit, called automatically each frame */
    update()
    {
        if (mouseIsDown(this.dragButton))
        {
            // the scene follows the drag
            this.yaw -= mouseDeltaScreen.x * this.dragSpeed;
            this.pitch += mouseDeltaScreen.y * this.dragSpeed;
        }
        else
            this.yaw += this.idleSpin;
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);
        if (this.zoomSpeed && mouseWheel)
            this.distance = clamp(this.distance * (1 + sign(mouseWheel) * this.zoomSpeed), this.zoomRange.x, this.zoomRange.y);
        render3D.camera.orbit(this.getWorldPos3D(), this.distance, this.yaw, this.pitch);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * FirstPersonCamera3D - Look around with the mouse and move with the keys, with the camera at its position
 * - Click to capture the mouse so looking needs no button held, Esc lets it go; holding the button looks too, for touch
 * - WASD or the arrow keys walk level, or move the way it looks when fly is set
 * - An EngineObject3D that moves by velocity3D, so give it a size3D and call setCollision to walk into solid
 *   objects instead of through them; walking keeps velocity3D.y, so render3D.gravity can pull it down
 * - Starts from wherever render3D.camera is, so it can take over from another camera without a jump
 * - Destroy it to hand the camera back
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const player = new FirstPersonCamera3D(vec3(0, 1.5, 5));
 * player.size3D = vec3(1); // bump into solid objects
 * player.collideAsSphere3D = true;
 * player.setCollision();
 */
class FirstPersonCamera3D extends EngineObject3D
{
    /** Create a first person camera, it drives render3D.camera every frame
     *  @param {Vector3} [pos3D] - Where the eye is, defaults to where the camera is now
     *  @param {number} [yaw] - Radians around Y, defaults to the camera's
     *  @param {number} [pitch] - Radians up from level, defaults to the camera's */
    constructor(pos3D=render3D.camera.pos, yaw=render3D.camera.rotation.y, pitch=render3D.camera.rotation.x)
    {
        super(pos3D);
        this.size3D = vec3(); // not a solid thing to pick or collect until it is given a size
        this.mass = 1; // so solids push it out, and render3D.gravity pulls on it
        /** @property {number} - Angle around Y, the mouse turns it */
        this.yaw = yaw;
        /** @property {number} - Angle up from level, the mouse tilts it */
        this.pitch = pitch;
        /** @property {number} - World units per frame at full speed */
        this.moveSpeed = .1;
        /** @property {number} - How far a pixel of mouse movement turns the view */
        this.lookSpeed = .003;
        /** @property {Vector2} - Lowest and highest pitch */
        this.pitchRange = vec2(-1.5, 1.5);
        /** @property {boolean} - Move the way it looks, up and down included, instead of walking level */
        this.fly = false;
        /** @property {boolean} - Capture the mouse on a click, so looking needs no button held */
        this.lockPointer = true;
    }

    /** Read the mouse and keys and put the camera at the eye, called automatically each frame */
    update()
    {
        // a click captures the mouse, then it looks around while captured or while a button is held
        if (this.lockPointer && mouseWasPressed(0))
            pointerLockRequest();
        if (pointerLockIsActive() || mouseIsDown(0))
        {
            this.yaw -= mouseDeltaScreen.x * this.lookSpeed;
            this.pitch -= mouseDeltaScreen.y * this.lookSpeed;
        }
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);

        // the keys move it level, or the way it looks when flying, and walking keeps its fall
        const input = keyDirection();
        const move = vec3(input.x, 0, -input.y).clampLength(1).scale(this.moveSpeed)
            .rotateX(this.fly ? this.pitch : 0).rotateY(this.yaw);
        this.velocity3D = this.fly ? move : vec3(move.x, this.velocity3D.y, move.z);

        // the camera sits at the eye, where this frame's physics left it
        render3D.camera.pos = this.getWorldPos3D();
        render3D.camera.rotation = vec3(this.pitch, this.yaw, 0);
    }

    /** Let go of the mouse and stop driving the camera
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        this.lockPointer && pointerLockIsActive() && pointerLockExit();
        super.destroy(immediate);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
// a particle is this many floats of its emitter's particleData: position, velocity, start color, end color, start
// and end size, life, age, angle, spin, and how many trail points it has in trailData
const RENDER3D_PARTICLE_FLOATS = 21;
// the position, color and size of the particle being drawn, shared by every emitter so the draw loop makes no objects
const render3DParticlePos = vec3(), render3DParticleColor = new Color, render3DParticleSize = vec2();

/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Each particle is a flat square facing the camera, with a soft round dot when no tile is given
 * - Set trailTime to draw each particle as a streak along where it has been, for sparks
 * - Set angleSpeed to tumble them in the camera plane, which the 2D emitter takes as an argument
 * - Particles shoot out along the emitter's own up axis, turned by rotation3D
 * - emitConeAngle spreads them, PI sprays in every direction
 * - Speeds are per frame and sizes are world units, the same as the 2D emitter
 * - scale3D, its own or a parent's, grows the whole effect: the spawn area, the sizes, the speed and the fall
 * - gravity here is its own number added to velocity y each frame: it is neither the engine's 2D
 *   gravity nor render3D.gravity, so an effect keeps its own fall wherever it is used
 * - An emitter with an emitTime destroys itself once its last particle is gone, like the 2D emitter
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * // fire: a stream upward, yellow fading to transparent red, additive
 * new ParticleEmitter3D(vec3(), .5, 0, 100, .3, undefined, hsl(.12, 1, .6), hsl(.08, 1, .5), hsl(0, 1, .5, 0), hsl(0, 1, .25, 0), 1, .5, 1.5, .05, .95, 0, .3, .2, true);
 */
class ParticleEmitter3D extends EngineObject3D
{
    /** Create a particle emitter
     *  @param {Vector3} [pos3D] - World space position of the emitter
     *  @param {number|Vector3} [emitSize] - Spawn area, a number for a sphere diameter or a vec3 for a box
     *  @param {number} [emitTime] - How long to keep emitting, 0 is forever
     *  @param {number} [emitRate] - Particles per second, 0 does not emit
     *  @param {number} [emitConeAngle] - Half angle around the emit direction, PI is every direction
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile to render particles with, or a whole texture, undefined is untextured
     *  @param {Color} [colorStartA] - Color at start of life, randomized between the start colors
     *  @param {Color} [colorStartB]
     *  @param {Color} [colorEndA] - Color at end of life, randomized between the end colors
     *  @param {Color} [colorEndB]
     *  @param {number} [particleTime] - How long particles live in seconds
     *  @param {number} [sizeStart] - Particle size at start of life
     *  @param {number} [sizeEnd] - Particle size at end of life
     *  @param {number} [speed] - Spawn speed in world units per frame
     *  @param {number} [damping] - Per frame velocity multiplier, 1 is none
     *  @param {number} [gravity] - Per frame change to velocity y, negative pulls down; its own number,
     *    not render3D.gravity, so the 2D emitter's gravityScale has no equivalent here
     *  @param {number} [fadeRate] - Fraction of life spent fading, half in and half out
     *  @param {number} [randomness] - Extra randomness applied to speed, size and life
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), emitSize=0, emitTime=0, emitRate=100, emitConeAngle=PI, tileInfo,
        colorStartA=WHITE, colorStartB=WHITE, colorEndA=CLEAR_WHITE, colorEndB=CLEAR_WHITE,
        particleTime=.5, sizeStart=.1, sizeEnd=1, speed=.1, damping=1, gravity=0, fadeRate=.1, randomness=.2, additive=false)
    {
        super(pos3D, undefined, tileInfo);
        this.transparent = true;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect

        /** @property {number|Vector3} - Spawn area, a number for a sphere diameter or a vec3 for a box */
        this.emitSize = emitSize;
        /** @property {number} - How long to keep emitting, 0 is forever */
        this.emitTime = emitTime;
        /** @property {number} - Particles per second, 0 does not emit */
        this.emitRate = emitRate;
        /** @property {number} - Half angle around the emit direction, PI is every direction */
        this.emitConeAngle = emitConeAngle;
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndA = colorEndA.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndB = colorEndB.copy();
        /** @property {number} - How long particles live in seconds */
        this.particleTime = particleTime;
        /** @property {number} - Particle size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Particle size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {number} - Spawn speed in world units per frame */
        this.speed = speed;
        /** @property {number} - Per frame velocity multiplier */
        this.damping = damping;
        /** @property {number} - Per frame change to velocity y, its own number and not render3D.gravity */
        this.gravity = gravity;
        /** @property {number} - Fraction of life spent fading, half in and half out */
        this.fadeRate = fadeRate;
        /** @property {number} - Extra randomness applied to speed, size and life */
        this.randomness = randomness;
        /** @property {boolean} - Additive blending */
        this.additive = additive;
        /** @property {number} - Seconds of each particle's path to draw as a ribbon behind it, 0 draws billboards */
        this.trailTime = 0;
        /** @property {number} - Radians per frame each particle turns in the camera plane, either way; 0 is no spin */
        this.angleSpeed = 0;
        /** @property {number} - Per frame multiplier on that spin, 1 keeps it */
        this.angleDamping = 1;
        /** @property {Float32Array} - The live particles, 21 floats each: position, velocity, start and end color, start
         *  and end size, life, age, angle, spin, and trail point count; the emitter owns them, nothing else needs to */
        this.particleData = new Float32Array(64 * RENDER3D_PARTICLE_FLOATS);
        /** @property {number} - How many particles are alive, the first that many of particleData */
        this.particleCount = 0;
        /** @property {Float32Array|undefined} - The trail points of every particle, trailMax per particle oldest first, when trailTime is set
         *  @type {Float32Array|undefined} */
        this.trailData = undefined;
        /** @property {number} - Trail points kept per particle, from trailTime */
        this.trailMax = 0;
        this.emitTimeBuffer = 0;
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // one transform for the frame: where the emitter is, and how big the effect it makes is
        const matrix = render3DObjectMatrix(this); // the object's own, read only
        this.worldPos3D = matrix.getTranslation(); // remembered for when the parent is destroyed
        const scale = render3DMaxScale(matrix.m);

        // emit until the emit time is up, then wait for the last particle and go away
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // a rate of zero is an emitter fed by hand, and the global scale only quiets it,
            // neither is a reason to stop counting down the emit time
            if (this.emitRate && particleEmitRateScale)
            {
                this.emitTimeBuffer += this.emitRate * particleEmitRateScale * timeDelta;
                for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                    this.emitParticle();
            }
        }
        else if (!this.particleCount)
            this.destroy();

        // the trail storage follows trailTime, a change starts every trail over
        const trailMax = this.trailTime ? max(1, round(this.trailTime / timeDelta)) : 0;
        if (trailMax !== this.trailMax)
        {
            this.trailMax = trailMax;
            this.trailData = trailMax ? new Float32Array(this.particleData.length / RENDER3D_PARTICLE_FLOATS * trailMax * 3) : undefined;
            for (let k = 20; k < this.particleData.length; k += RENDER3D_PARTICLE_FLOATS)
                this.particleData[k] = 0;
        }

        // move the particles and drop the dead ones, all in the typed array: this runs for every particle every frame
        const F = RENDER3D_PARTICLE_FLOATS, data = this.particleData, trail = this.trailData;
        const damping = this.damping, gravity = this.gravity * scale, angleDamping = this.angleDamping; // a bigger effect has to fall faster to keep the same arc
        for (let i = this.particleCount; i--;)
        {
            // damped first and gravity added after, the order the 2D particle uses, so the same
            // damping and gravity give the same arc in both
            const k = i * F;
            const vx = data[k+3] *= damping, vy = data[k+4] = data[k+4] * damping + gravity, vz = data[k+5] *= damping;
            data[k] += vx, data[k+1] += vy, data[k+2] += vz;
            data[k+18] += data[k+19] *= angleDamping;
            const t = i * trailMax * 3;
            if (trailMax)
            {
                // remember where it has been, oldest first; a full trail drops its oldest point
                let n = data[k+20];
                if (n === trailMax)
                    trail.copyWithin(t, t + 3, t + n * 3), --n;
                const j = t + n * 3;
                trail[j] = data[k], trail[j+1] = data[k+1], trail[j+2] = data[k+2];
                data[k+20] = n + 1;
            }
            if ((data[k+17] += timeDelta) >= data[k+16])
            {
                // dead: the last particle takes its slot, trail and all, order does not matter
                const last = --this.particleCount, kl = last * F;
                if (i !== last)
                {
                    data.copyWithin(k, kl, kl + F);
                    trailMax && trail.copyWithin(t, last * trailMax * 3, (last + 1) * trailMax * 3);
                }
            }
        }
    }

    /** Stop emitting, and go away once the particles already out have finished like the 2D emitter's do
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.particleCount || this.destroyed)
            return super.destroy(immediate);
        this.emitTime = -1; // stops emitting, and update destroys it once the particles are gone
        render3DDetach(this); // the particles are in world space, they no longer need the parent
    }

    /** Spawn one particle now */
    emitParticle()
    {
        const random = ()=> rand(1 - this.randomness, 1 + this.randomness);
        const matrix = render3DObjectMatrix(this); // the object's own, read only
        // the whole effect grows with the emitter, not just the area the particles start in
        const scale = render3DMaxScale(matrix.m);

        // spawn offset: inside a box or a sphere
        const size = this.emitSize;
        const offset = isVector3(size) ? vec3(rand(-.5, .5) * size.x, rand(-.5, .5) * size.y, rand(-.5, .5) * size.z)
            : randInSphere(size / 2);

        // direction inside the cone around local +Y
        const direction = matrix.transformDirection(randVector3(1, this.emitConeAngle)).normalize();

        const pos = matrix.transformPoint(offset), speed = this.speed * random() * scale;
        const colorStart = randColor(this.colorStartA, this.colorStartB, true), colorEnd = randColor(this.colorEndA, this.colorEndB, true);

        // room for one more, doubling as the set grows, the trails along with it
        const F = RENDER3D_PARTICLE_FLOATS, k = this.particleCount++ * F;
        if (k + F > this.particleData.length)
        {
            const grown = new Float32Array(this.particleData.length * 2);
            grown.set(this.particleData);
            this.particleData = grown;
            if (this.trailData)
            {
                const trails = new Float32Array(this.trailData.length * 2);
                trails.set(this.trailData);
                this.trailData = trails;
            }
        }
        const data = this.particleData;
        data[k] = pos.x, data[k+1] = pos.y, data[k+2] = pos.z;
        data[k+3] = direction.x * speed, data[k+4] = direction.y * speed, data[k+5] = direction.z * speed;
        data[k+6] = colorStart.r, data[k+7] = colorStart.g, data[k+8] = colorStart.b, data[k+9] = colorStart.a;
        data[k+10] = colorEnd.r, data[k+11] = colorEnd.g, data[k+12] = colorEnd.b, data[k+13] = colorEnd.a;
        data[k+14] = this.sizeStart * random() * scale;
        data[k+15] = this.sizeEnd * random() * scale;
        data[k+16] = this.particleTime * random(); // life
        data[k+17] = 0; // age
        // a spinning particle starts anywhere and turns either way, one that is not stays at zero
        data[k+18] = this.angleSpeed ? rand(2*PI) : 0;
        data[k+19] = this.angleSpeed ? this.angleSpeed * random() * randSign() : 0;
        data[k+20] = 0; // trail points
    }

    /** Draw the particles, as flat squares or as streaks when trailTime is set
     *  - The whole emitter sorts as one thing, its particles are not sorted against each other
     *  - With render3D.instancing on the squares go out as one instanced draw of render3D.billboardMesh */
    render3D()
    {
        const r = render3D;
        if (r.transparentQueue)
            return r.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        const fade = this.fadeRate / 2, texture = this.tileInfo || render3DSoftDot(); // no dot headless
        const color = render3DParticleColor, size = render3DParticleSize; // shared, so a particle makes no objects

        // the instanced path: one matrix per particle, its right and up axes the quad's size long, facing the camera,
        // written straight into the batch; the batch draws at the end so the order of the transparent stage holds
        const quad = r.billboardMesh, instanced = texture && r.instancing && !r.capture && render3DCanDraw();
        let data, textureInfo, uv, lit;
        if (instanced)
        {
            if (!quad.buffer || quad.dirty || quad.contextGeneration !== r.contextGeneration)
                quad.upload();
            textureInfo = texture instanceof TileInfo ? texture.textureInfo : texture;
            uv = render3DGetTileUVs(texture);
            lit = r.lighting;
            r.lighting = r.shadowPass && lit; // unlit on screen, in the shadow map the object's flag decides
            r.cullBackFaces = r.mirrored = false;
        }
        const cr = r.cameraRight, cu = r.cameraUp, cb = r.cameraBack, shadowPass = r.shadowPass;
        const F = RENDER3D_PARTICLE_FLOATS, particles = this.particleData, trailMax = this.trailMax, pos = render3DParticlePos;
        try
        {
            for (let i = 0, count = this.particleCount; i < count; ++i)
            {
                const p = i * F, t = particles[p+17] / particles[p+16];
                const alpha = t < fade ? t / fade : t > 1 - fade ? (1 - t) / fade : 1;
                color.r = particles[p+6] + (particles[p+10] - particles[p+6]) * t;
                color.g = particles[p+7] + (particles[p+11] - particles[p+7]) * t;
                color.b = particles[p+8] + (particles[p+12] - particles[p+8]) * t;
                color.a = (particles[p+9] + (particles[p+13] - particles[p+9]) * t) * alpha;
                const s = size.x = size.y = lerp(particles[p+14], particles[p+15], t), angle = particles[p+18];
                const trailCount = particles[p+20];
                if (trailCount > 1)
                {
                    // a ribbon from the tail to the head, the tail thins and fades out
                    const trail = this.trailData, points = [], widths = [], colors = [];
                    for (let j = 0; j < trailCount; ++j)
                    {
                        const f = (j + 1) / trailCount, q = (i * trailMax + j) * 3;
                        points.push(vec3(trail[q], trail[q+1], trail[q+2]));
                        widths.push(s * f);
                        colors.push(color.scale(1, f));
                    }
                    r.drawRibbon(points, widths, this.tileInfo, colors);
                }
                else if (instanced)
                {
                    // the axes turned by the particle's angle in the camera plane, as drawBillboard turns them
                    let rx = cr.x, ry = cr.y, rz = cr.z, ux = cu.x, uy = cu.y, uz = cu.z;
                    if (angle)
                    {
                        const c = cos(angle), n = sin(angle);
                        rx = cr.x * c + cu.x * n, ry = cr.y * c + cu.y * n, rz = cr.z * c + cu.z * n;
                        ux = cu.x * c - cr.x * n, uy = cu.y * c - cr.y * n, uz = cu.z * c - cr.z * n;
                    }
                    const k = render3DInstanceSlot(quad, textureInfo);
                    data = quad.instanceData;
                    data[k]    = rx * s; data[k+1]  = ry * s; data[k+2]  = rz * s; data[k+3]  = 0;
                    data[k+4]  = ux * s; data[k+5]  = uy * s; data[k+6]  = uz * s; data[k+7]  = 0;
                    data[k+8]  = cb.x;   data[k+9]  = cb.y;   data[k+10] = cb.z;   data[k+11] = 0;
                    data[k+12] = particles[p]; data[k+13] = particles[p+1]; data[k+14] = particles[p+2]; data[k+15] = 1;
                    if (!shadowPass)
                        data[k+16] = color.r, data[k+17] = color.g, data[k+18] = color.b, data[k+19] = color.a;
                    data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
                }
                else
                {
                    pos.x = particles[p], pos.y = particles[p+1], pos.z = particles[p+2];
                    if (texture)
                        r.drawBillboard(pos, size, texture, color, angle);
                    else
                        r.drawSoftDisc(pos, s, color, undefined, 8); // no canvas for the dot, headless
                }
            }
        }
        finally
        {
            if (instanced)
            {
                r.lighting = lit;
                r.flush(); // whatever the stream holds from before this emitter draws first
                render3DFlushInstances(quad);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Trail3D - A ribbon through where the object has been, thinning and fading with age
 * - Records its world position each frame it moves, so parent it to something that moves or set pos3D yourself
 * - The samples are world space, so width is a world width and scale3D does nothing to the ribbon
 * - Drawn unlit in the transparent stage, dies down on its own once the object stops
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const trail = new Trail3D(vec3(), 1, .3, undefined, hsl(.08, 1, .5), hsl(0, 1, .5, 0), true);
 * ball.addChild(trail); // follows the ball
 */
class Trail3D extends EngineObject3D
{
    /** Create a trail
     *  @param {Vector3} [pos3D]
     *  @param {number} [lifeTime] - Seconds the ribbon takes to thin and fade from head to tail,
     *    Infinity keeps every sample at full width and never drops one, so it grows as long as the object moves
     *  @param {number} [width] - Width at the head, it thins to nothing at the tail
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile or whole texture stretched along the trail, undefined is untextured
     *  @param {Color} [color] - Color at the head
     *  @param {Color} [colorEnd] - Color at the tail
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), lifeTime=1, width=.2, tileInfo, color=WHITE, colorEnd=CLEAR_WHITE, additive=false)
    {
        super(pos3D, undefined, tileInfo, color);
        this.transparent = true;
        this.additive = additive;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect
        this.finishing = false; // set by destroy, the ribbon fades out then goes away

        /** @property {number} - Seconds the ribbon takes to thin and fade from head to tail, Infinity never drops a sample */
        this.lifeTime = lifeTime;
        /** @property {number} - Width at the head */
        this.width = width;
        /** @property {Color} - Color at the tail */
        this.colorEnd = colorEnd.copy();
        /** @property {Vector3|undefined} - Direction across the ribbon, recorded with each sample, undefined faces the camera
         *  @type {Vector3|undefined} */
        this.side = undefined;
        /** @property {Array<Object>} - Recorded samples, oldest first
         *  @type {Array<Object>} */
        this.samples = [];
    }

    /** Forget the trail so far, for when the object teleports */
    clear() { this.samples.length = 0; }

    /** Stop recording, and go away once the ribbon has faded
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.samples.length || this.destroyed || this.lifeTime == Infinity)
            return super.destroy(immediate);
        this.finishing = true;
        render3DDetach(this); // the samples are in world space, they no longer need the parent
    }

    /** Record the position when it moved and drop old samples, called automatically each frame */
    update()
    {
        const samples = this.samples;
        if (!this.finishing)
        {
            const pos = this.worldPos3D = this.getWorldPos3D(), last = samples[samples.length - 1];
            if (!last || pos.distanceSquared(last.pos) > 1e-8)
                samples.push({pos, side: this.side?.copy(), time});
        }
        while (samples.length && time - samples[0].time > this.lifeTime)
            samples.shift();
        this.finishing && !samples.length && this.destroy();
    }

    /** Draw the ribbon */
    render3D()
    {
        const samples = this.samples;
        if (samples.length < 2) return;
        const points = [], widths = [], colors = [], sides = this.side ? [] : undefined;
        for (const s of samples)
        {
            const age = clamp((time - s.time) / this.lifeTime);
            points.push(s.pos);
            widths.push(this.width * (1 - age));
            colors.push(this.color.lerp(this.colorEnd, age));
            sides?.push(s.side);
        }
        render3D.drawRibbon(points, widths, this.tileInfo, colors, sides);
    }
}

///////////////////////////////////////////////////////////////////////////////
// OBJ meshes

/**
 * Parse Wavefront OBJ text into a Mesh
 * - Reads v, vt, vn and f lines with convex polygons of any size, materials and groups are ignored
 * - Normals come from the file when every corner of a face has one, otherwise from the face
 * - Use mesh.center() and mesh.fit(size) to bring a model of unknown units to the origin
 * - Back faces are skipped like any mesh, set doubleSided for a model with open walls or single sided parts
 * @param {string} text
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), parseOBJ(objText).center().fit(4));
 */
function parseOBJ(text, smooth=render3D?.smoothShading)
{
    const positions = [], normals = [], uvs = [];
    const points = [], vertexNormals = [], vertexUVs = [], indices = [], seen = new Map;
    let fileNormals = false, face = 0;

    // OBJ indices count from 1, and a negative one counts back from the end of the list so far
    const lookup = (s, list)=> { const i = parseInt(s); return list[i < 0 ? list.length + i : i - 1]; };
    for (const line of text.split('\n'))
    {
        const parts = line.trim().split(/\s+/);
        switch (parts[0])
        {
            case 'v':  positions.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vn': normals.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vt': uvs.push(vec2(+parts[1], 1 - +parts[2])); break; // OBJ v runs up, tiles run down
            case 'f':
            {
                const corners = parts.slice(1).map(c=> c.split('/'));
                if (corners.length < 3) break;
                const facePoints = corners.map(c=> lookup(c[0], positions));
                ASSERT(facePoints.every(isVector3), 'OBJ face uses a vertex index the file does not have', line);
                const hasNormals = corners.every(c=> c[2]);
                fileNormals ||= hasNormals;
                const faceNormal = hasNormals ? undefined : render3DFaceNormal(facePoints[0], facePoints[1], facePoints[2], facePoints[3]);
                // a corner is one vertex with the same position, uv and normal; without file normals the face's own
                // normal keeps its corners apart, unless they will be smoothed, when the position and uv are enough
                const ids = corners.map((c, i)=>
                {
                    const key = c[0] + '/' + (c[1] || '') + '/' + (hasNormals ? c[2] : smooth ? '' : 'f' + face);
                    let id = seen.get(key);
                    if (id === undefined)
                    {
                        seen.set(key, id = points.length);
                        points.push(facePoints[i]);
                        vertexUVs.push(c[1] ? lookup(c[1], uvs) : RENDER3D_DEFAULT_UV);
                        vertexNormals.push(hasNormals ? lookup(c[2], normals) : faceNormal);
                    }
                    return id;
                });
                // a fan around the second corner, counter clockwise as the file lists them; that cuts a quad along
                // the same diagonal the strip form did, so a smoothed model shades the same as before
                for (let k = 2; k < ids.length; ++k)
                    indices.push(ids[1], ids[k], ids[(k + 1) % ids.length]);
                ++face;
            }
        }
    }
    const mesh = new Mesh().addTriangles(points, vertexNormals, vertexUVs, undefined, indices);
    if (!fileNormals && smooth)
        mesh.computeNormals(true);
    return mesh;
}

/**
 * Fetch and parse an OBJ file
 * @param {string} url
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3D.smoothShading
 * @return {Promise<Mesh>}
 * @memberof Render3D
 * @example
 * const mesh = await loadOBJ('ship.obj'); // in an async gameInit
 */
async function loadOBJ(url, smooth=render3D?.smoothShading)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadOBJ failed: ' + url);
    return parseOBJ(await response.text(), smooth);
}

/**
 * LittleJS glTF Plugin
 * - Loads glTF 2.0 models: a .gltf with its .bin and images beside it, or a .glb with everything in one file
 * - A model comes back as parts, one Mesh per primitive of every node placed by the node tree, each with its
 *   material's color and base color texture, plus everything combined into one Mesh
 * - Static geometry only: positions, normals, uvs, vertex colors and indices; skins, animations and morph targets are not read
 * - glTF and LittleJS agree on the axes, y up and -z forward, on counter clockwise triangles and on uvs running down
 * - Requires the Render3D plugin
 * @namespace GLTF
 * @example
 * const model = await loadGLTF('ship.glb');   // in an async gameInit
 * model.createObject(vec3(0, 1, 0));           // an object with a child per part, textures and all
 * new EngineObject3D(vec3(), model.mesh);      // or the whole thing as one mesh
 */

///////////////////////////////////////////////////////////////////////////////
/**
 * GLTFPart - One primitive of a model, placed where its node put it
 * @memberof GLTF
 */
class GLTFPart
{
    /** @param {string} name @param {Mesh} mesh @param {Color} color @param {TextureInfo|undefined} textureInfo @param {boolean} transparent */
    constructor(name, mesh, color, textureInfo, transparent)
    {
        /** @property {string} - The node's name, or its mesh's */
        this.name = name;
        /** @property {Mesh} - The geometry in model space, the node transforms applied, with the vertex colors the file had */
        this.mesh = mesh;
        /** @property {Color} - The material's base color, to draw the mesh tinted with */
        this.color = color;
        /** @property {TextureInfo|undefined} - The material's base color texture, undefined without one or without WebGL
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textureInfo;
        /** @property {boolean} - The material blends, so the part belongs in the transparent stage */
        this.transparent = transparent;
    }
}

/**
 * GLTFModel - A loaded model: its parts, and everything as one mesh
 * @memberof GLTF
 */
class GLTFModel
{
    /** @param {Array<GLTFPart>} parts */
    constructor(parts)
    {
        /** @property {Array<GLTFPart>} - One per primitive of every node that has a mesh */
        this.parts = parts;
        /** @property {Mesh} - Every part combined, each tinted with its material color; the texture is textureInfo */
        this.mesh = new Mesh;
        for (const part of parts)
            this.mesh.combine(part.mesh, RENDER3D_IDENTITY, part.color);
        // the one texture every part uses, when they all do; a part without one has no uvs into it, so a model
        // that mixes plain and textured parts, or uses several textures, is drawn through createObject instead
        const textures = new Set(parts.map(p=> p.textureInfo));
        /** @property {TextureInfo|undefined} - The texture to draw mesh with, when every part uses the same one
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textures.size === 1 ? textures.values().next().value : undefined;
    }

    /** The box around every part
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds() { return this.mesh.getBounds(); }

    /** Move every part so the center of the model's bounds is on the origin, like Mesh.center
     *  @return {GLTFModel} */
    center()
    {
        const bounds = this.getBounds();
        return this.transform(bounds.min.add(bounds.max).scale(-.5));
    }

    /** Scale every part evenly so the model's largest extent is a size, like Mesh.fit, for models of unknown units
     *  @param {number} [size]
     *  @return {GLTFModel} */
    fit(size=1)
    {
        const bounds = this.getBounds(), extent = bounds.max.subtract(bounds.min);
        return this.transform(Matrix4.scaling(vec3(size / (max(extent.x, extent.y, extent.z) || 1))));
    }

    /** Move, turn or scale every part and the combined mesh together
     *  @param {Matrix4|Vector3} matrix - Transform, or just an offset to move by
     *  @return {GLTFModel} */
    transform(matrix)
    {
        for (const part of this.parts)
            part.mesh.transform(matrix);
        this.mesh.transform(matrix);
        return this;
    }

    /** Make an object at a position with a child per part, so each keeps its own texture, color and blending;
     *  the way to show a model with windows or other see through parts, which the combined mesh draws solid
     *  @param {Vector3} [pos3D]
     *  @return {EngineObject3D} - The root, move and turn it and the parts follow */
    createObject(pos3D=vec3())
    {
        const root = new EngineObject3D(pos3D);
        for (const part of this.parts)
        {
            const o = new EngineObject3D(vec3(), part.mesh, part.textureInfo, part.color);
            o.transparent = part.transparent;
            root.addChild(o);
        }
        return root;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Load a glTF or GLB model, the .bin and images of a .gltf from beside it
 *  @param {string} url
 *  @return {Promise<GLTFModel>}
 *  @memberof GLTF */
async function loadGLTF(url)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadGLTF failed: ' + url);
    return parseGLTF(await response.arrayBuffer(), url.slice(0, url.lastIndexOf('/') + 1));
}

/** Parse a model from GLB bytes or glTF JSON, fetching the buffers and images it refers to
 *  @param {ArrayBuffer|Object|string} data - GLB bytes, or the glTF JSON as bytes, text or an object
 *  @param {string} [baseUrl] - Where the .bin and image files are, with its trailing slash; loadGLTF passes the file's folder
 *  @return {Promise<GLTFModel>}
 *  @memberof GLTF */
async function parseGLTF(data, baseUrl='')
{
    let json = data, glbBuffer;
    if (data instanceof ArrayBuffer)
    {
        const view = new DataView(data);
        if (data.byteLength >= 12 && view.getUint32(0, true) === 0x46546C67) // 'glTF', the binary container
        {
            if (view.getUint32(4, true) !== 2)
                throw new Error('only GLB version 2 is read');
            for (let offset = 12; offset + 8 <= data.byteLength;)
            {
                const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
                const chunk = data.slice(offset + 8, offset + 8 + length);
                if (type === 0x4E4F534A) json = new TextDecoder().decode(chunk); // JSON
                else if (type === 0x004E4942) glbBuffer = chunk;                  // BIN
                offset += 8 + length;
            }
        }
        else
            json = new TextDecoder().decode(data);
    }
    if (typeof json == 'string')
        json = JSON.parse(json);
    if (!json.asset || !String(json.asset.version).startsWith('2'))
        throw new Error('only glTF 2.0 is read'); // a file problem, not a code one, so it throws in every build

    // the buffers: the GLB's own, a data uri, or a file beside the model
    const buffers = await Promise.all((json.buffers || []).map((buffer, i)=>
    {
        if (!buffer.uri)
        {
            ASSERT(glbBuffer && !i, 'a buffer without a uri is the GLB chunk, and only the first can be');
            return glbBuffer;
        }
        return gltfFetch(buffer.uri, baseUrl).then(r=> r.arrayBuffer());
    }));

    // the textures, decoded together first; none without WebGL, and a failed image only logs
    const textures = await Promise.all((json.textures || []).map(async (texture)=>
    {
        if (!glContext || typeof createImageBitmap == 'undefined') return;
        try
        {
            const image = json.images[texture.source], sampler = json.samplers?.[texture.sampler] || {};
            let blob;
            if (image.uri)
                blob = await gltfFetch(image.uri, baseUrl).then(r=> r.blob());
            else
            {
                const view = json.bufferViews[image.bufferView];
                blob = new Blob([new Uint8Array(buffers[view.buffer], view.byteOffset || 0, view.byteLength)], {type: image.mimeType});
            }
            return new TextureInfo(await createImageBitmap(blob), true, sampler.wrapS !== 33071); // CLAMP_TO_EDGE
        }
        catch (e) { LOG('glTF image not loaded', e); }
    }));

    // the parts: the scene's nodes walked with their transforms, every primitive of a node's mesh placed by it
    const parts = [];
    const visit = (index, parentMatrix)=>
    {
        const node = json.nodes[index], local = gltfNodeMatrix(node);
        const matrix = parentMatrix ? parentMatrix.copy().multiply(local) : local;
        if (node.mesh !== undefined)
        {
            const mesh = json.meshes[node.mesh];
            for (const primitive of mesh.primitives)
            {
                const part = gltfPart(json, buffers, textures, primitive, matrix, node.name || mesh.name || 'part ' + parts.length);
                part && parts.push(part);
            }
        }
        for (const child of node.children || [])
            visit(child, matrix);
    };
    const scene = json.scenes?.[json.scene ?? 0];
    if (scene)
        scene.nodes.forEach(i=> visit(i));
    else if (json.nodes)
    {
        // no scene: every node that is not another's child is a root
        const children = new Set(json.nodes.flatMap(n=> n.children || []));
        json.nodes.forEach((n, i)=> children.has(i) || visit(i));
    }
    return new GLTFModel(parts);
}

// fetch a uri beside the model, or decode a data uri without going out
function gltfFetch(uri, baseUrl)
{
    if (uri.startsWith('data:'))
    {
        const comma = uri.indexOf(','), bytes = atob(uri.slice(comma + 1)), data = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; ++i)
            data[i] = bytes.charCodeAt(i);
        return Promise.resolve(new Response(data.buffer, {headers: {'Content-Type': uri.slice(5, uri.indexOf(';'))}}));
    }
    return fetch(baseUrl + uri).then(r=>
    {
        if (!r.ok) throw new Error('glTF file not found: ' + baseUrl + uri);
        return r;
    });
}

// a node's local transform: its matrix, or translation, rotation quaternion and scale composed
function gltfNodeMatrix(node)
{
    if (node.matrix)
        return new Matrix4(node.matrix); // column major, like ours
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], t = node.translation || [0, 0, 0];
    return new Matrix4([
        (1 - 2*(y*y + z*z)) * sx, 2*(x*y + z*w) * sx,       2*(x*z - y*w) * sx,       0,
        2*(x*y - z*w) * sy,       (1 - 2*(x*x + z*z)) * sy, 2*(y*z + x*w) * sy,       0,
        2*(x*z + y*w) * sz,       2*(y*z - x*w) * sz,       (1 - 2*(x*x + y*y)) * sz, 0,
        t[0], t[1], t[2], 1]);
}

// an accessor's values as floats, one row per element, normalized integer types brought to 0 to 1
function gltfAccessor(json, buffers, index)
{
    const a = json.accessors[index], view = json.bufferViews[a.bufferView];
    ASSERT(!a.sparse, 'sparse accessors are not read');
    const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[a.type];
    const Type = {5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[a.componentType];
    const buffer = buffers[view.buffer], offset = (view.byteOffset || 0) + (a.byteOffset || 0), size = Type.BYTES_PER_ELEMENT;
    const stride = view.byteStride || components * size;
    const scale = a.normalized ? new Map([[Int8Array, 127], [Uint8Array, 255], [Int16Array, 32767], [Uint16Array, 65535]]).get(Type) || 1 : 1;
    const out = new Float32Array(a.count * components);
    if (stride === components * size)
        out.set(new Type(buffer, offset, a.count * components)); // packed, one view over all of it
    else
        for (let i = 0; i < a.count; ++i) // interleaved with other attributes, an element at each stride
            out.set(new Type(buffer, offset + i * stride, components), i * components);
    if (scale !== 1)
        for (let i = 0; i < out.length; ++i)
            out[i] /= scale;
    return {data: out, components, count: a.count};
}

// one primitive as a part: its attributes into a mesh, the indices as triangles, then placed and given its material
function gltfPart(json, buffers, textures, primitive, matrix, name)
{
    const mode = primitive.mode ?? 4; // triangles
    if (mode < 4)
    {
        LOG('glTF points and lines are not drawn:', name);
        return;
    }
    const attributes = primitive.attributes;
    ASSERT(attributes.POSITION !== undefined, 'a glTF primitive needs positions');
    const read = (index, make)=>
    {
        const {data, components, count} = gltfAccessor(json, buffers, index), list = [];
        for (let i = 0; i < count; ++i)
            list.push(make(data, i * components, components));
        return list;
    };
    const points = read(attributes.POSITION, (d, k)=> vec3(d[k], d[k+1], d[k+2]));
    const normals = attributes.NORMAL !== undefined ? read(attributes.NORMAL, (d, k)=> vec3(d[k], d[k+1], d[k+2])) : undefined;
    const uvs = attributes.TEXCOORD_0 !== undefined ? read(attributes.TEXCOORD_0, (d, k)=> vec2(d[k], d[k+1])) : undefined;
    const colors = attributes.COLOR_0 !== undefined ? read(attributes.COLOR_0, (d, k, n)=> rgb(d[k], d[k+1], d[k+2], n > 3 ? d[k+3] : 1)) : undefined;
    let indices = primitive.indices !== undefined ? Array.from(gltfAccessor(json, buffers, primitive.indices).data) : points.map((_, i)=> i);
    if (mode === 5) // a strip: triangle i is the three entries up to i, the odd ones read the other way
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : i & 1 ? [s[i-1], s[i-2], s[i]] : [s[i-2], s[i-1], s[i]]);
    else if (mode === 6) // a fan around the first entry
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : [s[0], s[i-1], s[i]]);
    const mesh = new Mesh().addTriangles(points, normals, uvs, colors, indices);
    normals || mesh.computeNormals(false); // flat when the file gives none, as the format says
    mesh.transform(matrix);
    const material = json.materials?.[primitive.material] || {}, pbr = material.pbrMetallicRoughness || {};
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    mesh.doubleSided = !!material.doubleSided;
    return new GLTFPart(name, mesh, rgb(factor[0], factor[1], factor[2], factor[3]),
        pbr.baseColorTexture ? textures[pbr.baseColorTexture.index] : undefined, material.alphaMode === 'BLEND');
}

/**
 * LittleJS Three.js Plugin
 * - Renders a three.js scene on a canvas behind the LittleJS canvases
 * - The three.js module is passed in by the user, nothing is bundled
 * - Keep canvasClearColor transparent so the 3D scene shows through
 * - Aligned camera mode locks the 3D camera to the LittleJS 2D camera
 * - ThreeJSObject lets LittleJS physics drive a three.js mesh
 * - Call new ThreeJSPlugin(THREE) in gameInit to set up
 * @namespace ThreeJS
 */

///////////////////////////////////////////////////////////////////////////////

/** Global ThreeJS plugin object
 *  @type {ThreeJSPlugin}
 *  @memberof ThreeJS */
let threeJS;

///////////////////////////////////////////////////////////////////////////////
/**
 * ThreeJS Plugin - Renders a three.js scene behind the LittleJS canvas
 * @example
 * // in gameInit, with three.js loaded by the user
 * new ThreeJSPlugin(THREE);
 * threeJS.scene.add(new THREE.AmbientLight);
 * @memberof ThreeJS
 */
class ThreeJSPlugin
{
    /** Set up the three.js rendering layer, call in gameInit
     *  @param {Object} THREE - The three.js module, supplied by the user
     *  @param {number} [cameraFOV] - Vertical field of view in degrees */
    constructor(THREE, cameraFOV=60)
    {
        ASSERT(!threeJS, 'ThreeJS plugin already initialized');
        threeJS = this;
        if (headlessMode) return;
        ASSERT(mainCanvas, 'ThreeJS plugin must be created after engineInit, call in gameInit');
        ASSERT(THREE && THREE.WebGLRenderer, 'three.js module must be passed in');

        /** @property {Object} - The three.js module passed into the constructor */
        this.THREE = THREE;
        /** @property {Object} - The three.js renderer */
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        /** @property {Object} - The three.js scene, add lights and meshes here */
        this.scene = new THREE.Scene();
        /** @property {Object} - The three.js perspective camera */
        this.camera = new THREE.PerspectiveCamera(cameraFOV, 1, .1, 1e3);
        /** @property {boolean} - Lock the camera to the LittleJS 2D camera so the z=0 plane matches world space */
        this.cameraAlign2D = true;

        // insert the canvas below the engine canvases and match the layout
        const threeCanvas = this.renderer.domElement;
        const rootElement = mainCanvas.parentElement;
        rootElement.insertBefore(threeCanvas, rootElement.firstChild);
        threeCanvas.style.cssText = mainCanvas.style.cssText;

        // composite the 3D canvas into screenshots and video capture
        setBackgroundCanvas(threeCanvas);

        // render automatically each frame after the engine renders
        engineAddPlugin(undefined, ()=> this.render());
    }

    /** Position the camera so the z=0 plane exactly matches LittleJS world space,
     *  called automatically when cameraAlign2D is set */
    alignCamera2D()
    {
        const halfHeight = mainCanvasSize.y / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.camera.fov/2 * PI/180);
        this.camera.position.set(cameraPos.x, cameraPos.y, distance);
        // reset all axes in case a free camera was used, littlejs angles are clockwise
        this.camera.rotation.set(0, 0, -cameraAngle);
    }

    /** Sync the canvas layout and render the scene, called automatically each frame */
    render()
    {
        if (!this.renderer) return; // headless mode

        // keep renderer size and css in sync with the LittleJS canvas
        // mainCanvasSize is css pixels, three scales it by the pixel ratio
        const threeCanvas = this.renderer.domElement;
        const dpr = getCanvasPixelRatio();
        const bufferSizeX = mainCanvasSize.x * dpr | 0;
        const bufferSizeY = mainCanvasSize.y * dpr | 0;
        if (threeCanvas.width != bufferSizeX || threeCanvas.height != bufferSizeY)
        {
            this.renderer.setPixelRatio(dpr);
            this.renderer.setSize(mainCanvasSize.x, mainCanvasSize.y, false);
            this.camera.aspect = mainCanvasSize.x / mainCanvasSize.y;
            this.camera.updateProjectionMatrix();
        }
        if (threeCanvas.style.cssText != mainCanvas.style.cssText)
            threeCanvas.style.cssText = mainCanvas.style.cssText;

        if (this.cameraAlign2D)
            this.alignCamera2D();
        this.renderer.render(this.scene, this.camera);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * ThreeJS Object - EngineObject that drives a three.js mesh
 * - LittleJS physics moves the object and the mesh follows automatically
 * - Destroying the object removes the mesh from the scene
 * @extends EngineObject
 * @memberof ThreeJS
 */
class ThreeJSObject extends EngineObject
{
    /** Create an engine object that drives a three.js mesh
     *  @param {Vector2} [pos] - World space position
     *  @param {Vector2} [size] - World space size
     *  @param {Object} [mesh] - The three.js object3d to drive
     *  @param {number} [z] - Mesh height above the 2D plane */
    constructor(pos, size, mesh, z=0)
    {
        super(pos, size);
        ASSERT(threeJS, 'ThreeJS plugin must be initialized first');

        /** @property {Object} - The three.js object3d this object drives */
        this.mesh = mesh;
        /** @property {number} - Mesh height above the 2D plane */
        this.z = z;
        if (mesh)
        {
            threeJS.scene.add(mesh);
            this.syncMesh();
        }
    }

    /** Update the object and sync the mesh to its transform */
    update()
    {
        super.update();
        this.syncMesh();
    }

    /** Copy this object's transform to the mesh */
    syncMesh()
    {
        if (!this.mesh) return;
        this.mesh.position.set(this.pos.x, this.pos.y, this.z);
        this.mesh.rotation.z = -this.angle; // littlejs angles are clockwise
    }

    /** The mesh is this object's visual, the default 2D rendering is skipped */
    render() {}

    /** Destroy this object and remove its mesh from the scene
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.destroyed) return;
        // note: frequently destroyed objects should also dispose geometry and material
        this.mesh && threeJS.scene.remove(this.mesh);
        super.destroy(immediate);
    }
}

