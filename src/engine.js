/** 
 * LittleJS - The Tiny Fast JavaScript Game Engine
 * MIT License - Copyright 2021 Frank Force
 * 
 * Engine Features
 * - Object oriented system with base class engine object
 * - Base class object handles update, physics, collision, rendering, etc
 * - Engine helper classes and functions like Vector2, Color, and Timer
 * - Super fast rendering system for tile sheets
 * - Sound effects audio with zzfx and music with zzfxm
 * - Input processing system with gamepad and touchscreen support
 * - Tile layer rendering and collision system
 * - Particle effect system
 * - Medal system tracks and displays achievements
 * - Debug tools and debug rendering system
 * - Call engineInit() to start it up!
 * @namespace Engine
 */

'use strict';

/** Name of engine
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineName = 'LittleJS';

/** Version of engine
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineVersion = '1.18.25-js13k';

/** Frames per second to update
 *  @type {Number}
 *  @default
 *  @memberof Engine */
const frameRate = 60;

/** How many seconds each frame lasts, engine uses a fixed time step
 *  @type {Number}
 *  @default 1/60
 *  @memberof Engine */
const timeDelta = 1/frameRate;

/** Array containing all engine objects
 *  @type {Array}
 *  @memberof Engine */
let engineObjects = [];

/** Array with only objects set to collide with other objects this frame (for optimization)
 *  @type {Array}
 *  @memberof Engine */
let engineObjectsCollide = [];

/** Current update frame, used to calculate time
 *  @type {Number}
 *  @memberof Engine */
let frame = 0;

/** Current engine time since start in seconds
 *  @type {Number}
 *  @memberof Engine */
let time = 0;

/** Actual clock time since start in seconds (not affected by pause or frame rate clamping)
 *  @type {Number}
 *  @memberof Engine */
let timeReal = 0;

/** Is the game paused? Causes time and objects to not be updated
 *  @type {Boolean}
 *  @default false
 *  @memberof Engine */
let paused = false;
/** Get if game is paused
 *  @return {Boolean}
 *  @memberof Engine */
function getPaused() { return paused; }

/** Set if game is paused
 *  @param {Boolean} [isPaused]
 *  @memberof Engine */
function setPaused(isPaused=true) { paused = isPaused; }

// Frame time tracking
let frameTimeLastMS = 0, frameTimeBufferMS = 0, averageFPS = 0;

///////////////////////////////////////////////////////////////////////////////
// medal display

// only medalsInit sets this, so a game that never uses medals pays nothing to draw them
// - declared here rather than in engineMedals.js so that file can be left out of a build
let medalsRender;

///////////////////////////////////////////////////////////////////////////////
// Main engine functions

/** Startup LittleJS engine with your callback functions
 *  @param {Function|function():Promise} gameInit - Called once after the engine starts up
 *  @param {Function} gameUpdate - Called every frame before objects are updated
 *  @param {Function} gameUpdatePost - Called after physics and objects are updated, even when paused
 *  @param {Function} gameRender - Called before objects are rendered, for drawing the background
 *  @param {Function} gameRenderPost - Called after objects are rendered, useful for drawing UI
 *  @param {Array} [imageSources=[]] - List of images to load
 *  @param {HTMLElement} [rootElement] - Root element to attach to, the document body by default
 *  @memberof Engine */
async function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement=document.body)
{
    ASSERT(!mainContext, 'engine already initialized');
    ASSERT(Array.isArray(imageSources), 'pass in images as array');

    // allow passing in empty functions
    gameInit       ||= ()=>{};
    gameUpdate     ||= ()=>{};
    gameUpdatePost ||= ()=>{};
    gameRender     ||= ()=>{};
    gameRenderPost ||= ()=>{};

    // Called automatically by engine to setup render system
    function enginePreRender()
    {
        // save canvas size
        mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);

        // disable smoothing for pixel art
        overlayContext.imageSmoothingEnabled = 
            mainContext.imageSmoothingEnabled = !tilesPixelated;

        // setup gl rendering if enabled
        glPreRender();
    }

    // internal update loop for engine
    function engineUpdate(frameTimeMS=0)
    {
        // update time keeping
        let frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        frameTimeLastMS = frameTimeMS;
        if (debug || showWatermark)
            averageFPS = lerp(averageFPS, 1e3/(frameTimeDeltaMS||1), .05);
        const debugSpeedUp   = debug && keyIsDown('Equal'); // +
        const debugSpeedDown = debug && keyIsDown('Minus'); // -
        const frameTimeDeltaUnscaledMS = frameTimeDeltaMS;
        if (debug) // +/- to speed/slow time
            frameTimeDeltaMS *= debugSpeedUp ? 10 : debugSpeedDown ? .1 : 1;
        timeReal += frameTimeDeltaMS / 1e3;
        // paused buffers time like the running path, so a pause screen updates
        // at the fixed frame rate instead of however fast the display refreshes
        // - on unscaled time, so the debug speed keys do not change it either
        frameTimeBufferMS += paused ? frameTimeDeltaUnscaledMS : frameTimeDeltaMS;
        if (!debugSpeedUp)
            frameTimeBufferMS = min(frameTimeBufferMS, 50); // clamp min framerate
        updateCanvas();

        // apply time delta smoothing, improves smoothness of framerate in some browsers
        let deltaSmooth = 0;
        if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
        {
            // force at least one update each frame since it is waiting for refresh
            deltaSmooth = frameTimeBufferMS;
            frameTimeBufferMS = 0;
        }

        // update multiple frames if necessary in case of slow framerate
        for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
        {
            if (paused)
            {
                // everything except time, the game, and object updates
                // - transforms still update, so children follow a parent moved while paused
                inputUpdate();
                for (const o of engineObjects)
                    o.parent || o.updateTransforms();
            }
            else
            {
                // increment frame and update time
                time = frame++ / frameRate;

                // update game and objects
                inputUpdate();
                gameUpdate();
                engineObjectsUpdate();
            }

            // do post update
            debugUpdate();
            gameUpdatePost();
            inputUpdatePost();
        }

        // add the time smoothing back in
        frameTimeBufferMS += deltaSmooth;

        if (!headlessMode)
        {
            // render sort then render while removing destroyed objects
            enginePreRender();
            gameRender();
            engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
            for (const o of engineObjects)
                o.destroyed || o.render();
            gameRenderPost();
            medalsRender && medalsRender();
            touchGamepadRender();
            debugRender();
            glCopyToContext(mainContext);

            if (showWatermark)
            {
                // update fps
                overlayContext.textAlign = 'right';
                overlayContext.textBaseline = 'top';
                overlayContext.font = '1em monospace';
                overlayContext.fillStyle = '#000';
                const text = engineName + ' ' + 'v' + engineVersion + ' / ' 
                    + drawCount + ' / ' + engineObjects.length + ' / ' + averageFPS.toFixed(1)
                    + (glEnable ? ' GL' : ' 2D') ;
                overlayContext.fillText(text, mainCanvas.width-3, 3);
                overlayContext.fillStyle = '#fff';
                overlayContext.fillText(text, mainCanvas.width-2, 2);
                drawCount = 0;
            }
        }

        requestAnimationFrame(engineUpdate);
    }

    function updateCanvas()
    {
        if (headlessMode) return;
        
        let w, h;
        if (canvasFixedSize.x)
        {
            // use fixed size
            w = canvasFixedSize.x;
            h = canvasFixedSize.y;

            // fit to window by adding space on top or bottom if necessary
            const aspect = innerWidth / innerHeight;
            const fixedAspect = w / h;
            (glCanvas||mainCanvas).style.width = mainCanvas.style.width = overlayCanvas.style.width  = aspect < fixedAspect ? '100%' : '';
            (glCanvas||mainCanvas).style.height = mainCanvas.style.height = overlayCanvas.style.height = aspect < fixedAspect ? '' : '100%';
        }
        else
        {
            // use same size as window
            w = min(innerWidth,  canvasMaxSize.x);
            h = min(innerHeight, canvasMaxSize.y);
        }

        // only assign the size when it actually changes
        // - assigning width or height reallocates the canvas and makes the
        //   browser rebuild the page, which was a real bottleneck in some
        //   browsers when done every frame
        // - assigning it also cleared the canvas, so when the size is
        //   unchanged clear by hand instead
        // - it used to reset the whole 2D context too. It no longer does, so
        //   whatever you set on a context stays set: put back any transform
        //   or blend mode you change, the engine pairs its own
        if (mainCanvas.width != w || mainCanvas.height != h)
        {
            mainCanvas.width  = overlayCanvas.width  = w;
            mainCanvas.height = overlayCanvas.height = h;
        }
        else
        {
            // catch state the last frame left behind, see the note above
            // - everything here lives inside the ASSERT arguments so the
            //   release build drops it whole, do not wrap these in a loop:
            //   the loop would be live code and survive
            ASSERT(mainContext.getTransform().isIdentity && overlayContext.getTransform().isIdentity,
                'A canvas transform was still applied at the end of the frame. The engine stopped resizing the canvas every frame, which is what used to reset the 2D context, so put back any transform you set.');
            ASSERT(mainContext.globalCompositeOperation == 'source-over' && overlayContext.globalCompositeOperation == 'source-over',
                'A blend mode was still set at the end of the frame. Call setAdditiveBlendMode(false) when you are done with it, the engine no longer resets the 2D context for you.');
            ASSERT(mainContext.globalAlpha == 1 && overlayContext.globalAlpha == 1,
                'A global alpha was still set at the end of the frame. Set it back to 1, the engine no longer resets the 2D context for you.');

            mainContext.clearRect(0, 0, w, h);
            overlayContext.clearRect(0, 0, w, h);
        }

        // save canvas size
        mainCanvasSize = vec2(w, h);
    }

    // wait for gameInit to load
    async function startEngine()
    {
        await gameInit();
        engineUpdate();
    }
    if (headlessMode)
        return startEngine();

    // setup html
    const styleRoot = 
        'margin:0;' +                 // fill the window
        'overflow:hidden;' +          // no scroll bars
        'background:#000;' +          // set background color
        (canvasPixelated ? 'image-rendering:pixelated;' : '') + // pixel art
        'user-select:none;' +         // prevent hold to select
        '-webkit-user-select:none;' + // compatibility for ios
        (!touchInputEnable ? '' :     // no touch css settings
        'touch-action:none;' +        // prevent mobile pinch to resize
        '-webkit-touch-callout:none');// compatibility for ios
    rootElement.style.cssText = styleRoot;
    rootElement.appendChild(mainCanvas = document.createElement('canvas'));
    mainContext = mainCanvas.getContext('2d');

    // init stuff and start engine
    inputInit();
    audioInit();
    debugInit();
    glInit();

    // create overlay canvas for hud to appear above gl canvas
    rootElement.appendChild(overlayCanvas = document.createElement('canvas'));
    overlayContext = overlayCanvas.getContext('2d');

    // set canvas style
    const styleCanvas = 'position:absolute;'+ // allow canvases to overlap
        'inset:0;margin:auto'; // center on screen
    mainCanvas.style.cssText = overlayCanvas.style.cssText = styleCanvas;
    if (glCanvas)
        glCanvas.style.cssText = styleCanvas;
    updateCanvas();
    
    // create promises for loading images
    const promises = imageSources.map((src, textureIndex)=>
        new Promise(resolve => 
        {
            const image = new Image;
            image.crossOrigin = 'anonymous';
            image.onerror = image.onload = ()=> 
            {
                textureInfos[textureIndex] = new TextureInfo(image);
                resolve();
            }
            image.src = src;
        })
    );

    if (!imageSources.length)
    {
        // no images to load
        promises.push(new Promise(resolve => 
        {
            textureInfos[0] = new TextureInfo(new Image);
            resolve();
        }));
    }

    // wait for all the promises to finish
    await Promise.all(promises);
    return startEngine();
}

/** Update each engine object, remove destroyed objects, and update time
 *  @memberof Engine */
function engineObjectsUpdate()
{
    // get list of solid objects for physics optimization
    engineObjectsCollide = engineObjects.filter(o=>o.collideSolidObjects);

    // recursive object update
    function updateObject(o)
    {
        if (!o.destroyed)
        {
            o.update();
            for (const child of o.children)
                updateObject(child);
        }
    }
    for (const o of engineObjects)
    {
        // update top level objects
        if (!o.parent)
        {
            updateObject(o);
            o.updateTransforms();
        }
    }

    // remove destroyed objects
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Destroy and remove all objects
 *  @memberof Engine */
function engineObjectsDestroy()
{
    for (const o of engineObjects)
        o.parent || o.destroy();
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Collects all object within a given area
 *  @param {Vector2} [pos]                 - Center of test area, or undefined for all objects
 *  @param {Number|Vector2} [size]         - Radius of circle if float, rectangle size if Vector2
 *  @param {Array} [objects=engineObjects] - List of objects to check
 *  @return {Array}                        - List of collected objects
 *  @memberof Engine */
function engineObjectsCollect(pos, size, objects=engineObjects)
{
    const collectedObjects = [];
    if (!pos) // all objects
    {
        for (const o of objects)
            collectedObjects.push(o);
    }
    else if (size instanceof Vector2)  // bounding box test
    {
        for (const o of objects)
            isOverlapping(pos, size, o.pos, o.size) && collectedObjects.push(o);
    }
    else  // circle test
    {
        const sizeSquared = size*size;
        for (const o of objects)
            pos.distanceSquared(o.pos) < sizeSquared && collectedObjects.push(o);
    }
    return collectedObjects;
}

/** Triggers a callback for each object within a given area
 *  @param {Vector2} [pos]                 - Center of test area, or undefined for all objects
 *  @param {Number|Vector2} [size]         - Radius of circle if float, rectangle size if Vector2
 *  @param {Function} [callbackFunction]   - Calls this function on every object that passes the test
 *  @param {Array} [objects=engineObjects] - List of objects to check
 *  @memberof Engine */
function engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects)
{ engineObjectsCollect(pos, size, objects).forEach(o => callbackFunction(o)); }

/** Return a list of objects intersecting a ray
 *  @param {Vector2} start
 *  @param {Vector2} end
 *  @param {Array} [objects=engineObjects] - List of objects to check
 *  @return {Array} - List of objects hit
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

