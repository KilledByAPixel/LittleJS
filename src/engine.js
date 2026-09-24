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

'use strict';

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

/** Actual clock time since start in seconds (not affected by pause, timescale, or frame rate clamping; the debug speed keys scale it in debug builds)
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

// the pairs of objects asked about a collision this update and left overlapping, so the other's own physics does not
// ask again, a set of others for each asker so the lookup stays quick when many objects pile up on one spot
const engineObjectsCollidePairs = new Map;
function engineObjectsCollidePairAsked(asker, other)
{ return !!engineObjectsCollidePairs.get(asker)?.has(other); }
function engineObjectsCollidePairAdd(asker, other)
{
    let others = engineObjectsCollidePairs.get(asker);
    others || engineObjectsCollidePairs.set(asker, others = new Set);
    others.add(other);
}
let engineInitialized = false; // engineInit ran, with or without a canvas
let engineObjectsUpdateCount = 0; // passes of engineObjectsUpdate so far, how a child knows it moved this pass
const engineChildStack = []; // the children being updated, taken off the live lists so one leaving does not skip the next
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
 *  - update runs on every fixed tick, paused and timeScale 0 included; a plugin that simulates should skip those
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
 *  @param {GameInitCallback} [gameInit] - Called once after the engine starts up, can be async for loading
 *  @param {GameCallback} [gameUpdate] - Called every frame before objects are updated (60fps), use for game logic
 *  @param {GameCallback} [gameUpdatePost] - Called after physics and objects are updated, even when paused, use for UI updates
 *  @param {GameCallback} [gameRender] - Called before objects are rendered, use for drawing backgrounds/world elements
 *  @param {GameCallback} [gameRenderPost] - Called after objects are rendered, use for drawing UI/overlays
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
    ASSERT(!engineInitialized, 'engine already initialized');
    // runtime guard so release builds (where the assert is stripped) don't
    // double-register listeners / double-add canvases on a second call
    if (engineInitialized) return;
    engineInitialized = true;
    ASSERT(isArray(imageSources), 'pass in images as array');

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
        setShader(); // a shader left set last frame does not carry into this one

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
        // paused or a time scale of 0 is frozen: it ticks on unscaled time, so the update rate stays fixed instead of
        // following however fast the display refreshes, and gameUpdatePost and input still run to leave it
        const frozen = paused || !combinedScale;
        frameTimeBufferMS += frozen ? frameTimeDeltaUnscaledMS : frameTimeDeltaMS;
        frameTimeBufferMS = min(frameTimeBufferMS, 50 * (frozen ? 1 : max(1, combinedScale))); // clamp min framerate

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
            // read again each tick, so a pause set by the game stops the rest of this frame's catch-up ticks
            const frozenTick = paused || !(timeScale * debugScale);

            // increment frame and update time, frozen does not advance time
            if (!frozenTick)
                time = frame++ / frameRate;

            // update game and objects, when frozen update everything except them
            wasUpdated = true;
            engineUpdateCanvas();
            inputUpdate();
            if (!frozenTick)
                gameUpdate();
            pluginList.forEach(plugin=>plugin.update?.());
            if (frozenTick)
            {
                // update object transforms even when paused
                for (const o of engineObjects)
                    o.parent || o.updateTransforms();

                // objects made and destroyed while paused, like a menu's effects, still leave the list
                engineObjects = engineObjects.filter(o=>!o.destroyed);
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
        {
            if (typeof requestAnimationFrame === 'function')
                requestAnimationFrame(engineUpdate);
            else // a headless server in Node has no display to wait for, a timer keeps the pace
                setTimeout(()=> engineUpdate(performance.now()), 1e3 / frameRate);
        }

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
            setShader(); // plugin, input and debug draws start from the engine's state
            setAdditiveBlendMode(false);
            pluginList.forEach(plugin=>plugin.render?.());
            inputRender();
            debugRender();
            glFlush();
            debugRenderPost();
            drawCount = 0;
            primitiveCount = 0;
        }
    }

    // skip setup if headless
    if (headlessMode) return startEngine();

    // ensure body exists for minimal HTML where the script runs before <body> is parsed
    if (!document.body)
        document.documentElement.appendChild(document.createElement('body'));
    rootElement ||= document.body;

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
        engineUpdateInternal = engineUpdate; // engineStep only runs once the game is set up
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
        ASSERT(!canvasMaxAspect || canvasMinAspect <= canvasMaxAspect);
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

    // set default line join and cap, round on purpose: it looks better, suits text and keeps sharp corners from
    // spiking far out; WebGL outlines are square and mitered for speed, the two are not meant to match
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

/** Update each engine object and remove destroyed objects; time and frame do not advance, engineStep does that
 * can be called manually if objects need to be updated outside of main loop
 *  @memberof Engine */
function engineObjectsUpdate()
{
    ++engineObjectsUpdateCount;
    engineObjectsCollidePairs.clear();
    // get list of solid objects for physics optimization
    engineObjectsCollide = engineObjects.filter(o=>o.collideSolidObjects);

    // update physics before object update
    for (const o of engineObjects)
        if (!o.parent && !o.destroyed)
            o.updatePhysics();

    // recursive object update: the children are walked from a copy on a shared stack, since a child that
    // destroys itself leaves its parent's list on the spot and the next child would slide past the loop
    function updateChildObjects(children)
    {
        const start = engineChildStack.length;
        for (const child of children)
            engineChildStack.push(child);
        for (let i = start; i < engineChildStack.length; ++i)
            updateChildObject(engineChildStack[i]);
        engineChildStack.length = start;
    }
    const pass = engineObjectsUpdateCount;
    function updateChildObject(o)
    {
        if (o.destroyed || o.updatePass === pass) return;

        // its parent is up to date, so it updates from where it is now, and its children from where it is after
        o.updatePass = pass;
        o.updateTransforms(false);
        o.update();
        o.children.length && o.updateTransforms(false);
        updateChildObjects(o.children);
    }
    for (const o of engineObjects)
    {
        if (o.parent || o.destroyed || o.updatePass === pass) continue; // a child that let go is not updated twice

        // update top level objects, each child places itself before it updates so it sees this frame's position,
        // then the whole tree is placed again so what the children changed in their localPos lands before render
        o.updatePass = pass;
        o.update();
        updateChildObjects(o.children);
        o.updateTransforms();
    }

    // remove destroyed objects
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Destroy and remove all objects
 *  - This can be used to clear out all objects when restarting a level
 *  - Objects with the persistent flag set are left alone, for things that outlive a level
 *  - Objects can override their destroy function to do cleanup or stick around
 *  @param {boolean} [immediate] - true removes attached effects like particle emitters at once, false lets them finish first
 *  @memberof Engine */
function engineObjectsDestroy(immediate=true)
{
    for (const o of engineObjects)
        o.parent || o.persistent || o.destroy(immediate);
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Collects all object within a given area
 *  - Objects destroyed this frame are left out, they are only in the list until the frame ends
 *  @param {Vector2} [pos] - Center of test area, or undefined for all objects
 *  @param {Vector2|number} [size] - Diameter of a circle if a number, full size of a rectangle if a Vector2,
 *                                   left out the objects that overlap the point at pos
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
            o.destroyed || collectedObjects.push(o);
    }
    else if (size === undefined || size instanceof Vector2)
    {
        // bounding box test, a point when there is no size
        size ??= vec2();
        for (const o of objects)
            o.destroyed || o.isOverlapping(pos, size) && collectedObjects.push(o);
    }
    else
    {
        // circle test, a diameter like every other size
        const radiusSquared = (size/2)**2;
        for (const o of objects)
            o.destroyed || pos.distanceSquared(o.pos) < radiusSquared && collectedObjects.push(o);
    }
    return collectedObjects;
}

/**
 * @callback ObjectCallbackFunction - Function that processes an object
 * @param {EngineObject} object
 *  @memberof Engine
 */

/** Triggers a callback for each object within a given area, objects destroyed this frame left out
 *  @param {Vector2} [pos] - Center of test area, or undefined for all objects
 *  @param {Vector2|number} [size] - Diameter of a circle if a number, full size of a rectangle if a Vector2
 *  @param {ObjectCallbackFunction} [callbackFunction] - Calls this function on every object that passes the test, needed
 *                                                     (marked optional only because the area before it is)
 *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
 *  @memberof Engine */
function engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects)
{
    // an object an earlier callback destroyed is skipped
    for (const o of engineObjectsCollect(pos, size, objects))
        o.destroyed || callbackFunction(o);
}

/** Return a list of objects intersecting a ray, objects destroyed this frame left out
 *  - Only objects with collideRaycast set are hit, which setCollision turns on
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
        if (o.collideRaycast && !o.destroyed && isIntersecting(start, end, o.pos, o.size))
        {
            debugRaycast && debugRect(o.pos, o.size, '#f00');
            hitObjects.push(o);
        }
    }

    debugRaycast && debugLine(start, end, hitObjects.length ? '#f00' : '#00f', .02);
    return hitObjects;
}