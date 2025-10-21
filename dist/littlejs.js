// LittleJS Engine - MIT License - Copyright 2021 Frank Force
// https://github.com/KilledByAPixel/LittleJS

'use strict';

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
 * - Post processing effects
 * - Call engineInit() to start it up!
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
const engineVersion = '1.15.3';

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

/** Actual clock time since start in seconds (not affected by pause or frame rate clamping)
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

// Frame time tracking
let frameTimeLastMS = 0, frameTimeBufferMS = 0, averageFPS = 0;

///////////////////////////////////////////////////////////////////////////////
// plugin hooks

const pluginList = [];
class EnginePlugin
{
    constructor(update, render, glContextLost, glContextRestored)
    {
        this.update = update;
        this.render = render;
        this.glContextLost = glContextLost;
        this.glContextRestored = glContextRestored;
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
 *  @memberof Engine */
function engineAddPlugin(update, render, glContextLost, glContextRestored)
{
    // make sure plugin functions are unique
    ASSERT(!pluginList.find(p=>
        p.update === update && p.render === render &&
        p.glContextLost === glContextLost &&
        p.glContextRestored === glContextRestored));

    const plugin = new EnginePlugin(update, render, glContextLost, glContextRestored);
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
 *    () => { LOG('Game initialized!'); },  // gameInit
 *    () => { updateGameLogic(); },         // gameUpdate
 *    () => { updateUI(); },                // gameUpdatePost
 *    () => { drawBackground(); },          // gameRender
 *    () => { drawHUD(); },                 // gameRenderPost
 *    ['tiles.png', 'tilesLevel.png']       // images to load
 *  );
 *  @memberof Engine */
async function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement=document.body)
{
    ASSERT(!mainContext, 'engine already initialized');
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
        if (debug) // +/- to speed/slow time
            frameTimeDeltaMS *= debugSpeedUp ? 10 : debugSpeedDown ? .1 : 1;
        timeReal += frameTimeDeltaMS / 1e3;
        frameTimeBufferMS += paused ? 0 : frameTimeDeltaMS;
        if (!debugSpeedUp)
            frameTimeBufferMS = min(frameTimeBufferMS, 50); // clamp min framerate

        let wasUpdated = false;
        if (paused)
        {
            // update everything except the game and objects
            wasUpdated = true;
            updateCanvas();
            inputUpdate();
            pluginList.forEach(plugin=>plugin.update?.());

            // update object transforms even when paused
            for (const o of engineObjects)
                o.parent || o.updateTransforms();

            // do post update
            debugUpdate();
            gameUpdatePost();
            inputUpdatePost();
        }
        else
        {
            // apply time delta smoothing, improves smoothness of framerate in some browsers
            let deltaSmooth = 0;
            if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
            {
                // force at least one update each frame since it is waiting for refresh
                deltaSmooth = frameTimeBufferMS;
                frameTimeBufferMS = 0;
            }

            // update multiple frames if necessary in case of slow framerate
            for (; frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
            {
                // increment frame and update time
                time = frame++ / frameRate;

                // update game and objects
                wasUpdated = true;
                updateCanvas();
                inputUpdate();
                gameUpdate();
                pluginList.forEach(plugin=>plugin.update?.());
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
        }

        if (!debugVideoCaptureIsActive())
            renderFrame();
        requestAnimationFrame(engineUpdate);

        function renderFrame()
        {
            if (headlessMode) return;

            // canvas must be updated before rendering
            if (!wasUpdated)
                updateCanvas();

            // render sort then render while removing destroyed objects
            enginePreRender();
            gameRender();
            engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
            for (const o of engineObjects)
                o.destroyed || o.render();
            gameRenderPost();
            pluginList.forEach(plugin=>plugin.render?.());
            touchGamepadRender();
            debugRender();
            glFlush();
            debugVideoCaptureUpdate();

            if (showWatermark && !debugVideoCaptureIsActive())
            {
                // update fps display
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
            }
            drawCount = 0;
        }
    }

    function updateCanvas()
    {
        if (headlessMode) return;

        if (canvasFixedSize.x)
        {
            // clear canvas and set fixed size
            mainCanvas.width  = canvasFixedSize.x;
            mainCanvas.height = canvasFixedSize.y;

            // fit to window by adding space on top or bottom if necessary
            const aspect = innerWidth / innerHeight;
            const fixedAspect = mainCanvas.width / mainCanvas.height;
            (glCanvas||mainCanvas).style.width = mainCanvas.style.width = overlayCanvas.style.width  = aspect < fixedAspect ? '100%' : '';
            (glCanvas||mainCanvas).style.height = mainCanvas.style.height = overlayCanvas.style.height = aspect < fixedAspect ? '' : '100%';
        }
        else
        {
            // clear canvas and set size to same as window
            mainCanvas.width = min(innerWidth, canvasMaxSize.x);
            mainCanvas.height = min(innerHeight, canvasMaxSize.y);
        }

        // apply the clear color to main canvas
        if (canvasClearColor.a > 0)
        {
            mainContext.fillStyle = canvasClearColor.toString();
            mainContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
            mainContext.fillStyle = BLACK.toString();
        }

        // clear overlay canvas and set size
        overlayCanvas.width  = mainCanvas.width;
        overlayCanvas.height = mainCanvas.height;

        // save canvas size
        mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);

        // set default line join and cap
        const lineJoin = 'round', lineCap = 'round';
        mainContext.lineJoin = overlayContext.lineJoin = lineJoin;
        mainContext.lineCap  = overlayContext.lineCap  = lineCap;
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
        'user-select:none;' +         // prevent hold to select
        '-webkit-user-select:none;' + // compatibility for ios
        'touch-action:none;' +        // prevent mobile pinch to resize
        '-webkit-touch-callout:none';// compatibility for ios
    rootElement.style.cssText = styleRoot;
    drawCanvas = mainCanvas = document.createElement('canvas');
    rootElement.appendChild(mainCanvas);
    drawContext = mainContext = mainCanvas.getContext('2d');

    // init stuff and start engine
    inputInit();
    audioInit();
    debugInit();
    glInit();

    // create overlay canvas for hud to appear above gl canvas
    overlayCanvas = document.createElement('canvas')
    rootElement.appendChild(overlayCanvas);
    overlayContext = overlayCanvas.getContext('2d');

    // set canvases
    const styleCanvas = 'position:absolute;'+ // allow canvases to overlap
        'top:50%;left:50%;transform:translate(-50%,-50%)'; // center on screen
    mainCanvas.style.cssText = overlayCanvas.style.cssText = styleCanvas;
    if (glCanvas)
        glCanvas.style.cssText = styleCanvas;
    setCanvasPixelated(canvasPixelated);
    setOverlayCanvasPixelated(overlayCanvasPixelated);
    updateCanvas();
    glPreRender();

    // create offscreen canvas for image processing
    workCanvas = new OffscreenCanvas(256, 256);
    workContext = workCanvas.getContext('2d', { willReadFrequently: true });

    // create promises for loading images
    const promises = imageSources.map((src, textureIndex)=>
        new Promise(resolve =>
        {
            ASSERT(isString(src), 'imageSources must be an array of strings');

            const image = new Image;
            image.onerror = image.onload = ()=>
            {
                const textureInfo = new TextureInfo(image);
                textureInfos[textureIndex] = textureInfo;
                resolve();
            }
            image.crossOrigin = 'anonymous';
            image.src = src;
        })
    );

    if (!imageSources.length)
    {
        // no images to load
        promises.push(new Promise(resolve =>
        {
            const textureInfo = new TextureInfo(new Image);
            textureInfos[0] = textureInfo;
            resolve();
        }));
    }

    if (showSplashScreen)
    {
        // draw splash screen
        promises.push(new Promise(resolve =>
        {
            let t = 0;
            console.log(`${engineName} Engine v${engineVersion}`);
            updateSplash();
            function updateSplash()
            {
                inputClear();
                drawEngineSplashScreen(t+=.01);
                t>1 ? resolve() : setTimeout(updateSplash, 16);
            }
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
        if (o.destroyed)
            return;

        o.update();
        for (const child of o.children)
            updateObject(child);
    }
    for (const o of engineObjects)
    {
        if (o.parent)
            continue;

        // update top level objects
        o.update();
        o.updatePhysics();
        for (const child of o.children)
            updateObject(child);
        o.updateTransforms();
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
 *  @param {Vector2} [pos] - Center of test area, or undefined for all objects
 *  @param {Vector2|number} [size] - Radius of circle if float, rectangle size if Vector2
 *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
 *  @return {Array<EngineObject>} - List of collected objects
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
            o.isOverlapping(pos, size) && collectedObjects.push(o);
    }
    else  // circle test
    {
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

///////////////////////////////////////////////////////////////////////////////
// LittleJS splash screen and logo

function drawEngineSplashScreen(t)
{
    const x = overlayContext;
    const w = overlayCanvas.width = innerWidth;
    const h = overlayCanvas.height = innerHeight;

    {
        // background
        const p3 = percent(t, 1, .8);
        const p4 = percent(t, 0, .5);
        const g = x.createRadialGradient(w/2,h/2,0,w/2,h/2,hypot(w,h)*.7);
        g.addColorStop(0,hsl(0,0,lerp(0,p3/2,p4),p3).toString());
        g.addColorStop(1,hsl(0,0,0,p3).toString());
        x.save();
        x.fillStyle = g;
        x.fillRect(0,0,w,h);
    }

    // draw LittleJS logo...
    const rect = (X, Y, W, H, C)=>
    {
        x.beginPath();
        x.rect(X,Y,W,C?H*p:H);
        x.fillStyle = C;
        C ? x.fill() : x.stroke();
    };
    const line = (X, Y, Z, W)=>
    {
        x.beginPath();
        x.lineTo(X,Y);
        x.lineTo(Z,W);
        x.stroke();
    };
    const circle = (X, Y, R, A=0, B=2*PI, C, F)=>
    {
        const D = (A+B)/2, E = p*(B-A)/2;
        x.beginPath();
        F && x.lineTo(X,Y);
        x.arc(X,Y,R,D-E,D+E);
        x.fillStyle = C;
        C ? x.fill() : x.stroke();
    };
    const color = (c=0, l=0) =>
        hsl([.98,.3,.57,.14][c%4]-10,.8,[0,.3,.5,.8,.9][l]).toString();
    const alpha = wave(1,1,t);
    const p = percent(alpha, .1, .5);

    // setup
    x.translate(w/2,h/2);
    const size = min(6, min(w,h)/99); // fit to screen
    x.scale(size,size);
    x.translate(-40,-35);
    x.lineJoin = x.lineCap = 'round';
    x.lineWidth = .1 + p*1.9;

    // drawing effect
    const p2 = percent(alpha,.1,1);
    x.setLineDash([99*p2,99]);

    // cab top
    rect(7,16,18,-8,color(2,2));
    rect(7,8,18,4,color(2,3));
    rect(25,8,8,8,color(2,1));
    rect(25,8,-18,8);
    rect(25,8,8,8);

    // cab
    rect(25,16,7,23,color());
    rect(11,39,14,-23,color(1,1));
    rect(11,16,14,18,color(1,2));
    rect(11,16,14,8,color(1,3));
    rect(25,16,-14,24);

    // cab window
    rect(15,29,6,-9,color(2,2));
    circle(15,21,5,0,PI/2,color(2,4),1);
    rect(21,21,-6,9);

    // little stack
    rect(37,14,9,6,color(3,2));
    rect(37,14,4.5,6,color(3,3));
    rect(37,14,9,6);

    // big stack
    rect(50,20,10,-8,color(0,1));
    rect(50,20,6.5,-8,color(0,2));
    rect(50,20,3.5,-8,color(0,3));
    rect(50,20,10,-8);
    circle(55,2,11.4,.5,PI-.5,color(3,3));
    circle(55,2,11.4,.5,PI/2,color(3,2),1);
    circle(55,2,11.4,.5,PI-.5);
    rect(45,7,20,-7,color(0,2));
    rect(45,-1,20,4,color(0,3));
    rect(45,-1,20,8);

    // engine
    for (let i=5; i--;)
    {
        // stagger radius to fix slight seam
        circle(60-i*6,30, 9.9,0,2*PI,color(i+2,3));
        circle(60-i*6,30,10.0,-.5,PI+.5,color(i+2,2));
        circle(60-i*6,30,10.1,.5,PI-.5,color(i+2,1));
    }

    // engine outline
    circle(36,30,10,PI/2,PI*3/2);
    circle(48,30,10,PI/2,PI*3/2);
    circle(60,30,10);
    line(36,20,60,20);

    // engine front light
    circle(60,30,4,PI,3*PI,color(3,2));
    circle(60,30,4,PI,2*PI,color(3,3));
    circle(60,30,4,PI,3*PI);

    // front brush
    for (let i=6; i--;)
    {
        x.beginPath();
        x.lineTo(53,54);
        x.lineTo(53,40);
        x.lineTo(53+(1+i*2.9)*p,40);
        x.lineTo(53+(4+i*3.5)*p,54);
        x.fillStyle = color(0,i%2+2);
        x.fill();
        i%2 && x.stroke();
    }

    // wheels
    rect(6,40,5,5);
    rect(6,40,5,5,color());
    rect(15,54,38,-14,color());
    for (let i=3; i--;)
    for (let j=2; j--;)
    {
        circle(15*i+15,47,j?7:1,PI,3*PI,color(i,3));
        x.stroke();
        circle(15*i+15,47,j?7:1,0,PI,color(i,2));
        x.stroke();
    }
    line(6,40,68,40); // center
    line(77,54,4,54); // bottom

    // draw engine name
    const s = engineName;
    x.font = '900 16px arial';
    x.textAlign = 'center';
    x.textBaseline = 'top';
    x.lineWidth = .1+p*3.9;
    let w2 = 0;
    for (let i=0; i<s.length; ++i)
        w2 += x.measureText(s[i]).width;
    for (let j=2; j--;)
    for (let i=0, X=41-w2/2; i<s.length; ++i)
    {
        x.fillStyle = color(i,2);
        const w = x.measureText(s[i]).width;
        x[j?'strokeText':'fillText'](s[i],X+w/2,55.5,17*p);
        X += w;
    }

    x.restore();
}
/**
 * LittleJS Debug System
 * - Press Esc to show debug overlay with mouse pick
 * - Number keys toggle debug functions
 * - +/- apply time scale
 * - Debug primitive rendering
 * - Save a 2d canvas as a png image
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
let showWatermark = true;

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
let debugPrimitives = [], debugPhysics = false, debugRaycast = false, debugParticles = false, debugGamepads = false, debugMedals = false, debugTakeScreenshot, downloadLink, debugCanvas;

///////////////////////////////////////////////////////////////////////////////
// Debug helper functions

/** Asserts if the expression is false, does nothing in release builds
 *  Halts execution if the assert fails and throws an error
 *  @param {boolean} assert
 *  @param {...Object} [output] - error message output
 *  @memberof Debug */
function ASSERT(assert, ...output)
{
    if (assert) return;
    console.assert(assert, ...output)
    throw new Error('Assert failed!'); // halt execution
}

/** Log to console if debug is enabled, does nothing in release builds
 *  @param {...Object} [output] - message output
 *  @memberof Debug */
function LOG(...output) { console.log(...output); }

/** Draw a debug rectangle in world space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=Vector2()]
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
    ASSERT(isString(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');

    if (typeof size === 'number')
        size = vec2(size); // allow passing in floats
    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    size = size.copy();
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
    ASSERT(isString(color) || isColor(color), 'color is invalid');
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
    ASSERT(isString(color) || isColor(color), 'color is invalid');
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
function debugLine(posA, posB, color, width=.1, time, screenSpace=false)
{
    ASSERT(isVector2(posA), 'posA must be a vec2');
    ASSERT(isVector2(posB), 'posB must be sa vec2');
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

/** Draw a debug axis aligned bounding box in world space
 *  @param {string} text
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
    ASSERT(isString(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isString(color) || isColor(color), 'color is invalid');
    ASSERT(isNumber(time), 'time must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(isString(font), 'font must be a string');

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

/** Save a canvas to disk
 *  @param {HTMLCanvasElement|OffscreenCanvas} canvas
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Debug */
function debugSaveCanvas(canvas, filename='screenshot', type='image/png')
{
    if (canvas instanceof OffscreenCanvas)
    {
        // copy to temporary canvas and save
        if (!debugCanvas)
            debugCanvas = document.createElement('canvas');
        debugCanvas.width = canvas.width;
        debugCanvas.height = canvas.height;
        debugCanvas.getContext('2d').drawImage(canvas, 0, 0);
        debugSaveDataURL(debugCanvas.toDataURL(type), filename);
    }
    else
        debugSaveDataURL(canvas.toDataURL(type), filename);
}

/** Save a text file to disk
 *  @param {string}     text
 *  @param {string}     [filename]
 *  @param {string}     [type]
 *  @memberof Debug */
function debugSaveText(text, filename='text', type='text/plain')
{ debugSaveDataURL(URL.createObjectURL(new Blob([text], {'type':type})), filename); }

/** Save a data url to disk
 *  @param {string}     dataURL
 *  @param {string}     filename
 *  @memberof Debug */
function debugSaveDataURL(dataURL, filename)
{
    downloadLink.download = filename;
    downloadLink.href = dataURL;
    downloadLink.click();
}

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
    // create link for saving screenshots
    downloadLink = document.createElement('a');
}

function debugUpdate()
{
    if (!debug)
        return;

    if (keyWasPressed(debugKey)) // Esc
        debugOverlay = !debugOverlay;
    if (debugOverlay)
    {
        if (keyWasPressed('Digit0'))
            showWatermark = !showWatermark;
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
        if (keyWasPressed('Digit6'))
            debugVideoCaptureIsActive() ? debugVideoCaptureStop() : debugVideoCaptureStart();
    }
}

function debugRender()
{
    if (debugVideoCaptureIsActive())
        return; // don't show debug info when capturing video

    // flush any gl sprites before drawing debug info
    glFlush();

    if (debugTakeScreenshot)
    {
        // combine canvases, remove alpha and save
        combineCanvases();
        const w = mainCanvas.width, h = mainCanvas.height;
        overlayContext.fillRect(0,0,w,h);
        overlayContext.drawImage(mainCanvas, 0, 0);
        debugSaveCanvas(overlayCanvas);
        debugTakeScreenshot = 0;
    }

    if (debugGamepads && gamepadsEnable && navigator.getGamepads)
    {
        // gamepad debug display
        const gamepads = navigator.getGamepads();
        for (let i = gamepads.length; i--;)
        {
            const gamepad = gamepads[i];
            if (gamepad)
            {
                const stickScale = 1;
                const buttonScale = .2;
                const centerPos = cameraPos;
                const sticks = gamepadStickData[i];
                for (let j = sticks.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*stickScale*2, i*stickScale*3));
                    const stickPos = drawPos.add(sticks[j].scale(stickScale));
                    debugCircle(drawPos, stickScale*2, '#fff7',0,true);
                    debugLine(drawPos, stickPos, '#f00');
                    debugPoint(stickPos, '#f00');
                }
                for (let j = gamepad.buttons.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*buttonScale*2, i*stickScale*3-stickScale-buttonScale));
                    const pressed = gamepad.buttons[j].pressed;
                    debugCircle(drawPos, buttonScale*2, pressed ? '#f00' : '#fff7', 0, true);
                    debugText(''+j, drawPos, .2);
                }
            }
        }
    }

    let debugObject;
    if (debugOverlay)
    {
        const saveContext = mainContext;
        mainContext = overlayContext;

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
            drawRect(mousePos.floor().add(vec2(.5)), vec2(1), rgb(1,1,0,.5));
        }
        mainContext = saveContext;
    }

    {
        // draw debug primitives
        overlayContext.lineWidth = 2;
        debugPrimitives.forEach(p=>
        {
            overlayContext.save();

            // create canvas transform from world space to screen space
            // without scaling because we want consistent pixel sizes
            let pos = p.pos, scale = 1, angle = p.angle;
            if (!p.screenSpace)
            {
                pos = worldToScreen(p.pos);
                scale = cameraScale;
                angle -= cameraAngle;
            }
            overlayContext.translate(pos.x|0, pos.y|0);
            overlayContext.rotate(angle);
            overlayContext.scale(1, p.text ? 1 : -1);
            overlayContext.fillStyle = overlayContext.strokeStyle = p.color;
            if (p.text !== undefined)
            {
                overlayContext.font = p.size*scale + 'px '+ p.font;
                overlayContext.textAlign = 'center';
                overlayContext.textBaseline = 'middle';
                overlayContext.fillText(p.text, 0, 0);
            }
            else if (p.points !== undefined)
            {
                // poly
                overlayContext.beginPath();
                for (const point of p.points)
                {
                    const p2 = point.scale(scale).floor();
                    overlayContext.lineTo(p2.x, p2.y);
                }
                overlayContext.closePath();
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }
            else if (p.size === 0 || (p.size.x === 0 && p.size.y === 0))
            {
                // point
                const pointSize = debugPointSize * scale;
                overlayContext.fillRect(-pointSize/2, -1, pointSize, 3);
                overlayContext.fillRect(-1, -pointSize/2, 3, pointSize);
            }
            else if (p.size.x !== undefined)
            {
                // rect
                const s = p.size.scale(scale).floor();
                const w = s.x, h = s.y;
                p.fill && overlayContext.fillRect(-w/2|0, -h/2|0, w, h);
                overlayContext.strokeRect(-w/2|0, -h/2|0, w, h);
            }
            else
            {
                // circle
                overlayContext.beginPath();
                overlayContext.arc(0, 0, p.size*scale/2, 0, 9);
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }

            overlayContext.restore();
        });

        // remove expired primitives
        debugPrimitives = debugPrimitives.filter(r=>r.timer<0);
    }

    if (debugObject)
    {
        const saveContext = mainContext;
        mainContext = overlayContext;
        const raycastHitPos = tileCollisionRaycast(debugObject.pos, mousePos);
        raycastHitPos && drawRect(raycastHitPos.floor().add(vec2(.5)), vec2(1), rgb(0,1,1,.3));
        drawLine(mousePos, debugObject.pos, .1, raycastHitPos ? rgb(1,0,0,.5) : rgb(0,1,0,.5));

        const debugText = 'mouse pos = ' + mousePos +
            '\nmouse collision = ' + tileCollisionGetData(mousePos) +
            '\n\n--- object info ---\n' +
            debugObject.toString();
        drawTextScreen(debugText, mousePosScreen, 24, rgb(), .05, undefined, 'center', 'monospace');
        mainContext = saveContext;
    }

    {
        // draw debug overlay
        const fontSize = 20;
        const lineHeight = fontSize * 1.2 | 0;
        overlayContext.save();
        overlayContext.fillStyle = '#fff';
        overlayContext.textAlign = 'left';
        overlayContext.textBaseline = 'top';
        overlayContext.font = fontSize + 'px monospace';
        overlayContext.shadowColor = '#000';
        overlayContext.shadowBlur = 9;

        let x = 9, y = 0, h = lineHeight;
        if (debugOverlay)
        {
            overlayContext.fillText(`${engineName} v${engineVersion}`, x, y += h/2 );
            overlayContext.fillText('Time: ' + formatTime(time), x, y += h);
            overlayContext.fillText('FPS: ' + averageFPS.toFixed(1) + (glEnable?' WebGL':' Canvas2D'), 
                x, y += h);
            overlayContext.fillText('Objects: ' + engineObjects.length, x, y += h);
            overlayContext.fillText('Draw Count: ' + drawCount, x, y += h);
            overlayContext.fillText('---------', x, y += h);
            overlayContext.fillStyle = '#f00';
            overlayContext.fillText('ESC: Debug Overlay', x, y += h);
            overlayContext.fillStyle = debugPhysics ? '#f00' : '#fff';
            overlayContext.fillText('1: Debug Physics', x, y += h);
            overlayContext.fillStyle = debugParticles ? '#f00' : '#fff';
            overlayContext.fillText('2: Debug Particles', x, y += h);
            overlayContext.fillStyle = debugGamepads ? '#f00' : '#fff';
            overlayContext.fillText('3: Debug Gamepads', x, y += h);
            overlayContext.fillStyle = debugRaycast ? '#f00' : '#fff';
            overlayContext.fillText('4: Debug Raycasts', x, y += h);
            overlayContext.fillStyle = '#fff';
            overlayContext.fillText('5: Save Screenshot', x, y += h);
            overlayContext.fillText('6: Toggle Video Capture', x, y += h);

            let keysPressed = '';
            let mousePressed = '';
            for (const i in inputData[0])
            {
                if (!keyIsDown(i, 0))
                    continue;
                if (parseInt(i) < 3)
                    mousePressed += i + ' ' ;
                else if (keyIsDown(i, 0))
                    keysPressed += i + ' ' ;
            }
            mousePressed && overlayContext.fillText('Mouse: ' + mousePressed, x, y += h);
            keysPressed && overlayContext.fillText('Keys: ' + keysPressed, x, y += h);

            let buttonsPressed = '';
            if (inputData[1])
            for (const i in inputData[1])
            {
                if (keyIsDown(i, 1))
                    buttonsPressed += i + ' ' ;
            }
            buttonsPressed && overlayContext.fillText('Gamepad: ' + buttonsPressed, x, y += h);
        }
        else
        {
            overlayContext.fillText(debugPhysics ? 'Debug Physics' : '', x, y += h);
            overlayContext.fillText(debugParticles ? 'Debug Particles' : '', x, y += h);
            overlayContext.fillText(debugRaycast ? 'Debug Raycasts' : '', x, y += h);
            overlayContext.fillText(debugGamepads ? 'Debug Gamepads' : '', x, y += h);
        }

        overlayContext.restore();
    }
}

///////////////////////////////////////////////////////////////////////////////
// video capture - records video and audio at 60 fps using MediaRecorder API

// internal variables used to capture video
let debugVideoCapture, debugVideoCaptureTrack, debugVideoCaptureIcon, debugVideoCaptureTimer;

/** Check if video capture is active
 *  @memberof Debug */
function debugVideoCaptureIsActive() { return !!debugVideoCapture; }

/** Start capturing video
 *  @memberof Debug */
function debugVideoCaptureStart()
{
    if (debugVideoCaptureIsActive())
        return; // already recording

    // captureStream passing in 0 to only capture when requestFrame() is called
    const stream = mainCanvas.captureStream(0);
    const chunks = [];
    debugVideoCaptureTrack = stream.getVideoTracks()[0];
    if (debugVideoCaptureTrack.applyConstraints)
        debugVideoCaptureTrack.applyConstraints({frameRate:60}); // force 60 fps
    debugVideoCapture = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp8'});
    debugVideoCapture.ondataavailable = (e)=> chunks.push(e.data);
    debugVideoCapture.onstop = ()=>
    {
        const blob = new Blob(chunks, {type: 'video/webm'});
        const url = URL.createObjectURL(blob);
        downloadLink.download = 'capture.webm';
        downloadLink.href = url;
        downloadLink.click();
        URL.revokeObjectURL(url);
    };

    if (audioMasterGain)
    {
        // connect to audio master gain node
        const audioStreamDestination = audioContext.createMediaStreamDestination();
        audioMasterGain.connect(audioStreamDestination);
        for (const track of audioStreamDestination.stream.getAudioTracks())
            stream.addTrack(track); // add audio tracks to capture stream
    }

    // start recording
    LOG('Video capture started.');
    debugVideoCapture.start();
    debugVideoCaptureTimer = new Timer(0);

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
}

/** Stop capturing video and save to disk
 *  @memberof Debug */
function debugVideoCaptureStop()
{
    if (!debugVideoCaptureIsActive())
        return; // not recording

    // stop recording
    LOG(`Video capture ended. ${debugVideoCaptureTimer.get().toFixed(2)} seconds recorded.`);
    debugVideoCapture.stop();
    debugVideoCapture = 0;
    debugVideoCaptureIcon.style.display = 'none';
}

// update video capture, called automatically by engine
function debugVideoCaptureUpdate()
{
    if (!debugVideoCaptureIsActive())
        return; // not recording

    // save the video frame
    combineCanvases();
    debugVideoCaptureTrack.requestFrame();
    debugVideoCaptureIcon.textContent = '● REC ' + formatTime(debugVideoCaptureTimer);
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
                get: () => values[prop],
                set: (value) => 
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
 * LittleJS Utility Classes and Functions
 * - General purpose math library
 * - Vector2 - fast, simple, easy 2D vector class
 * - Color - holds a rgba color with some math functions
 * - Timer - tracks time automatically
 * - RandomGenerator - seeded random number generator
 * @namespace Utilities
 */

/** The value of PI
 *  @type {number}
 *  @default Math.PI
 *  @memberof Utilities */
const PI = Math.PI;

/** Returns absolute value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const abs = Math.abs;

/** Returns floored value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const floor = Math.floor;

/** Returns ceiled value of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const ceil = Math.ceil;

/** Returns rounded value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const round = Math.round;

/** Returns lowest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const min = Math.min;

/** Returns highest value passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const max = Math.max;

/** Returns the sign of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const sign = Math.sign;

/** Returns hypotenuse of values passed in
 *  @param {...number} values
 *  @return {number}
 *  @memberof Utilities */
const hypot = Math.hypot;

/** Returns log2 of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const log2 = Math.log2;

/** Returns sin of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const sin = Math.sin;

/** Returns cos of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const cos = Math.cos;

/** Returns tan of value passed in
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
const tan = Math.tan;

/** Returns atan2 of values passed in
 *  @param {number} y
 *  @param {number} x
 *  @return {number}
 *  @memberof Utilities */
const atan2 = Math.atan2;

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {number} dividend
 *  @param {number} [divisor]
 *  @return {number}
 *  @memberof Utilities */
function mod(dividend, divisor=1) { return ((dividend % divisor) + divisor) % divisor; }

/** Clamps the value between max and min
 *  @param {number} value
 *  @param {number} [min]
 *  @param {number} [max]
 *  @return {number}
 *  @memberof Utilities */
function clamp(value, min=0, max=1) { return value < min ? min : value > max ? max : value; }

/** Returns what percentage the value is between valueA and valueB
 *  @param {number} value
 *  @param {number} valueA
 *  @param {number} valueB
 *  @return {number}
 *  @memberof Utilities */
function percent(value, valueA, valueB)
{ return (valueB-=valueA) ? clamp((value-valueA)/valueB) : 0; }

/** Linearly interpolates between values passed in using percent
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function lerp(valueA, valueB, percent)
{
    if (valueA >= 0 && valueA <= 1 && ((valueB < 0 || valueB > 1) && (percent < 0 || percent > 1)))
        console.warn('lerp() parameter order changed! use lerp(start, end, p)');
    return valueA + clamp(percent) * (valueB-valueA);
}

/** Gets percent between percentA and percentB and linearly interpolates between lerpA and lerpB
 *  A shortcut for lerp(lerpA, lerpB, percent(value, percentA, percentB))
 *  @param {number} value
 *  @param {number} percentA
 *  @param {number} percentB
 *  @param {number} lerpA
 *  @param {number} lerpB
 *  @return {number}
 *  @memberof Utilities */
function percentLerp(value, percentA, percentB, lerpA, lerpB)
{ return lerp(lerpA, lerpB, percent(value, percentA, percentB)); }

/** Returns signed wrapped distance between the two values passed in
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Utilities */
function distanceWrap(valueA, valueB, wrapSize=1)
{ const d = (valueA - valueB) % wrapSize; return d*2 % wrapSize - d; }

/** Linearly interpolates between values passed in with wrapping
 *  @param {number} valueA
 *  @param {number} valueB
 *  @param {number} percent
 *  @param {number} [wrapSize]
 *  @return {number}
 *  @memberof Utilities */
function lerpWrap(valueA, valueB, percent, wrapSize=1)
{
    if (valueA >= 0 && valueA <= 1 && ((valueB < 0 || valueB > 1) && (percent < 0 || percent > 1)))
        console.warn('lerpWrap() parameter order changed! use lerpWrap(start, end, p)');
    return valueA + clamp(percent) * distanceWrap(valueB, valueA, wrapSize);
}

/** Returns signed wrapped distance between the two angles passed in
 *  @param {number} angleA
 *  @param {number} angleB
 *  @return {number}
 *  @memberof Utilities */
function distanceAngle(angleA, angleB) { return distanceWrap(angleA, angleB, 2*PI); }

/** Linearly interpolates between the angles passed in with wrapping
 *  @param {number} angleA
 *  @param {number} angleB
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function lerpAngle(angleA, angleB, percent) { return lerpWrap(angleA, angleB, percent, 2*PI); }

/** Applies smoothstep function to the percentage value
 *  @param {number} percent
 *  @return {number}
 *  @memberof Utilities */
function smoothStep(percent) { return percent * percent * (3 - 2 * percent); }

/** Checks if the value passed in is a power of two
 *  @param {number} value
 *  @return {boolean}
 *  @memberof Utilities */
function isPowerOfTwo(value) { return !(value & (value - 1)); }

/** Returns the nearest power of two not less than the value
 *  @param {number} value
 *  @return {number}
 *  @memberof Utilities */
function nearestPowerOfTwo(value) { return 2**ceil(log2(value)); }

/** Returns true if two axis aligned bounding boxes are overlapping
 *  this can be used for simple collision detection between objects
 *  @param {Vector2} posA          - Center of box A
 *  @param {Vector2} sizeA         - Size of box A
 *  @param {Vector2} posB          - Center of box B
 *  @param {Vector2} [sizeB=(0,0)] - Size of box B, uses a point if undefined
 *  @return {boolean}              - True if overlapping
 *  @memberof Utilities */
function isOverlapping(posA, sizeA, posB, sizeB=vec2())
{
    const dx = (posA.x - posB.x)*2;
    const dy = (posA.y - posB.y)*2;
    const sx = sizeA.x + sizeB.x;
    const sy = sizeA.y + sizeB.y;
    return dx >= -sx && dx < sx && dy >= -sy && dy < sy;
}

/** Returns true if a line segment is intersecting an axis aligned box
 *  @param {Vector2} start - Start of raycast
 *  @param {Vector2} end   - End of raycast
 *  @param {Vector2} pos   - Center of box
 *  @param {Vector2} size  - Size of box
 *  @return {boolean}      - True if intersecting
 *  @memberof Utilities */
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

/** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
 *  @param {number} [frequency] - Frequency of the wave in Hz
 *  @param {number} [amplitude] - Amplitude (max height) of the wave
 *  @param {number} [t=time]    - Value to use for time of the wave
 *  @param {number} [offset]    - Value to use for time offset of the wave
 *  @return {number}            - Value waving between 0 and amplitude
 *  @memberof Utilities */
function wave(frequency=1, amplitude=1, t=time, offset=0)
{ return amplitude/2 * (1 - cos(offset + t*frequency*2*PI)); }

/** Formats seconds to mm:ss style for display purposes
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t)
{
    const sign = t < 0 ? '-' : '';
    t = abs(t)|0;
    return sign + (t/60|0) + ':' + (t%60<10?'0':'') + t%60;
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

/**
 * Check if object is a valid number, not NaN or undefined, but it may be infinite
 * @param {any} n
 * @return {boolean}
 * @memberof Utilities */
function isNumber(n) { return typeof n === 'number' && !isNaN(n); }

/**
 * Check if object is a valid string or can be converted to one
 * @param {any} s
 * @return {boolean}
 * @memberof Utilities */
function isString(s) { return s !== undefined && s !== null && typeof s.toString() === 'string'; }

/**
 * Check if object is an array
 * @param {any} a
 * @return {boolean}
 * @memberof Utilities */
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
 * @memberof Utilities */
function lineTest(posStart, posEnd, testFunction, normal)
{
    ASSERT(isVector2(posStart), 'posStart must be a vec2');
    ASSERT(isVector2(posEnd), 'posEnd must be a vec2');
    ASSERT(typeof testFunction === 'function', 'testFunction must be a function');
    ASSERT(!normal || isVector2(normal), 'normal must be a vec2');

    // get ray direction and length
    const dx = posEnd.x - posStart.x;
    const dy = posEnd.y - posStart.y;
    const totalLength = hypot(dx, dy);
    if (!totalLength)
        return;

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

            // move inside of tile if on positive edge
            const e = 1e-9;
            if (wasX)
            {
                if (stepX < 0)
                    hitPos.x -= e;
            }
            if (stepY < 0)
                hitPos.y -= e;

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
{ return radius > 0 ? randVec2(radius * rand(minRadius / radius, 1)**.5) : new Vector2; }

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=(1,1,1,1)]
 *  @param {Color}   [colorB=(0,0,0,1)]
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
    floatSign(valueA=1, valueB=0) { return this.float(valueA, valueB) * this.sign(); }

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
    *  @param {Color}   [colorA=(1,1,1,1)]
    *  @param {Color}   [colorB=(0,0,0,1)]
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
 * @memberof Utilities */
function vec2(x=0, y) { return new Vector2(x, y === undefined ? x : y); }

/**
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {boolean}
 * @memberof Utilities */
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
        return this;
    }

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
        return l > length ? this.scale(length/l) : this;
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
 * @memberof Utilities
 */
function rgb(r, g, b, a) { return new Color(r, g, b, a); }

/**
 * Create a color object with HSLA values, white by default
 * @param {number} [h=0] - hue
 * @param {number} [s=0] - saturation
 * @param {number} [l=1] - lightness
 * @param {number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities */
function hsl(h, s, l, a) { return new Color().setHSLA(h, s, l, a); }

/**
 * Check if object is a valid Color
 * @param {any} c
 * @return {boolean}
 * @memberof Utilities */
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
        return this;
    }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

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
            return `#000`;
        const toHex = (c)=> ((c=clamp(c)*255|0)<16 ? '0' : '') + c.toString(16);
        return '#' + toHex(this.r) + toHex(this.g) + toHex(this.b) + (useAlpha ? toHex(this.a) : '');
    }

    /** Set this color from a hex code
     * @param {string} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        ASSERT(isString(hex), 'Color hex code must be a string');
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
 *  @memberof Utilities */
const WHITE = debugProtectConstant(rgb());

/** Color - Clear White #757474ff with 0 alpha
 *  @type {Color}
 *  @memberof Utilities */
const CLEAR_WHITE = debugProtectConstant(rgb(1,1,1,0));

/** Color - Black #000000
 *  @type {Color}
 *  @memberof Utilities */
const BLACK = debugProtectConstant(rgb(0,0,0));

/** Color - Clear Black #000000 with 0 alpha
 *  @type {Color}
 *  @memberof Utilities */
const CLEAR_BLACK = debugProtectConstant(rgb(0,0,0,0));

/** Color - Gray #808080
 *  @type {Color}
 *  @memberof Utilities */
const GRAY = debugProtectConstant(rgb(.5,.5,.5));

/** Color - Red #ff0000
 *  @type {Color}
 *  @memberof Utilities */
const RED = debugProtectConstant(rgb(1,0,0));

/** Color - Orange #ff8000
 *  @type {Color}
 *  @memberof Utilities */
const ORANGE = debugProtectConstant(rgb(1,.5,0));

/** Color - Yellow #ffff00
 *  @type {Color}
 *  @memberof Utilities */
const YELLOW = debugProtectConstant(rgb(1,1,0));

/** Color - Green #00ff00
 *  @type {Color}
 *  @memberof Utilities */
const GREEN = debugProtectConstant(rgb(0,1,0));

/** Color - Cyan #00ffff
 *  @type {Color}
 *  @memberof Utilities */
const CYAN = debugProtectConstant(rgb(0,1,1));

/** Color - Blue #0000ff
 *  @type {Color}
 *  @memberof Utilities */
const BLUE = debugProtectConstant(rgb(0,0,1));

/** Color - Purple #8000ff
 *  @type {Color}
 *  @memberof Utilities */
const PURPLE = debugProtectConstant(rgb(.5,0,1));

/** Color - Magenta #ff00ff
 *  @type {Color}
 *  @memberof Utilities */
const MAGENTA = debugProtectConstant(rgb(1,0,1));

///////////////////////////////////////////////////////////////////////////////

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
     *  @param {number} [timeLeft] - How much time left before the timer 
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

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {number} */
    getPercent() { return this.isSet()? 1-percent(this.time - this.getGlobalTime(), 0, this.setTime) : 0; }

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
// Display settings

/** Enable applying color to tiles when using canvas2d
 *  - This is slower but should be the same as WebGL rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasColorTiles = true;

/** Color to clear the canvas to before render
 *  @type {Color}
 *  @memberof Draw */
let canvasClearColor = CLEAR_BLACK;

/** The max size of the canvas, centered if window is larger
 *  @type {Vector2}
 *  @default Vector2(1920,1080)
 *  @memberof Settings */
let canvasMaxSize = vec2(1920, 1080);

/** Fixed size of the canvas, if enabled canvas size never changes
 * - you may also need to set mainCanvasSize if using screen space coords in startup
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let canvasFixedSize = vec2();

/** Use nearest canvas scaling for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasPixelated = true;

/** Use nearest canvas scaling for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
 *  - This defaults to false because text looks better with smoothing
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let overlayCanvasPixelated = false;

/** Disables texture filtering for crisper pixel art
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let tilesPixelated = true;

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
let tileSizeDefault = vec2(16);

/** How many pixels smaller to draw tiles to prevent bleeding from neighbors
 *  @type {number}
 *  @default
 *  @memberof Settings */
let tileFixBleedScale = 0;

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
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = false;

/** True if touch gamepad should have start button in the center
 *  - When the game is paused, any touch will press the button
 *  - This can function as a way to pause/unpause the game
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadCenterButton = true;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = true;

/** Number of buttons on touch gamepad
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadButtonCount = 4;

/** Size of virtual gamepad for touch devices in pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 99;

/** Transparency of touch gamepad overlay
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

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

/** Set if tiles should be colorized when using canvas2d
 *  This can be slower but results should look nearly identical to WebGL rendering
 *  It can be enabled/disabled at any time
 *  Optimized for performance, and will use faster method if color is white or untextured
 *  @param {boolean} colorTiles
 *  @memberof Settings */
function setCanvasColorTiles(colorTiles) { canvasColorTiles = colorTiles; }

/** Set color to clear the canvas to before render
 *  @param {Color} color
 *  @memberof Settings */
function setCanvasClearColor(color) { canvasClearColor = color.copy(); }

/** Set max size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasMaxSize(size) { canvasMaxSize = size.copy(); }

/** Set fixed size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasFixedSize(size) { canvasFixedSize = size.copy(); }

/** Use nearest scaling algorithm for canvas for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
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

/** Use nearest scaling algorithm for canvas for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
 *  - This defaults to false because text looks better with smoothing
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setOverlayCanvasPixelated(pixelated)
{
    overlayCanvasPixelated = pixelated;
    if (overlayCanvas)
        overlayCanvas.style.imageRendering = pixelated ? 'pixelated' : '';
}

/** Disables texture filtering for crisper pixel art
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setTilesPixelated(pixelated) { tilesPixelated = pixelated; }

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
function setTileSizeDefault(size) { tileSizeDefault = size.copy(); }

/** Set to prevent tile bleeding from neighbors in pixels
 *  @param {number} scale
 *  @memberof Settings */
function setTileFixBleedScale(scale) { tileFixBleedScale = scale; }

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

/** True if touch gamepad should have start button in the center
 *  - This can function as a way to pause/unpause the game
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadCenterButton(enable) { touchGamepadCenterButton = enable; }

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set size of virtual gamepad for touch devices in pixels
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

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

/** Set if watermark with FPS should be shown
 *  @param {boolean} show
 *  @memberof Debug */
function setShowWatermark(show) { showWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {string} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }
/**
 * LittleJS Object System
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
     *  @param {Vector2}  [pos=(0,0)]   - World space position of the object
     *  @param {Vector2}  [size=(1,1)]  - World space size of the object
     *  @param {TileInfo} [tileInfo]    - Tile info to render object (undefined is untextured)
     *  @param {number}   [angle]       - Angle the object is rotated by
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
        /** @property {boolean} - Should it flip along y axis when rendered */
        this.mirror = false;

        // physical properties
        /** @property {number} [mass=objectDefaultMass] - How heavy the object is, static if 0 */
        this.mass = objectDefaultMass;
        /** @property {number} [damping=objectDefaultDamping] - How much to slow down velocity each frame (0-1) */
        this.damping = objectDefaultDamping;
        /** @property {number} [angleDamping=objectDefaultAngleDamping] - How much to slow down rotation each frame (0-1) */
        this.angleDamping = objectDefaultAngleDamping;
        /** @property {number} [restitution=objectDefaultRestitution] - How bouncy the object is when colliding (0-1) */
        this.restitution = objectDefaultRestitution;
        /** @property {number} [friction=objectDefaultFriction] - How much friction to apply when sliding (0-1) */
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

        // add to list of objects
        engineObjects.push(this);
    }

    /** Update the object transform, called automatically by engine even when paused */
    updateTransforms()
    {
        const parent = this.parent;
        if (parent)
        {
            // copy parent pos/angle
            const mirror = parent.getMirrorSign();
            this.pos = this.localPos.multiply(vec2(mirror,1)).rotate(parent.angle).add(parent.pos);
            this.angle = mirror*this.localAngle + parent.angle;
        }

        // update children
        for (const child of this.children)
            child.updateTransforms();
    }

    /** Update the object physics, called automatically by engine once each frame */
    updatePhysics()
    {
        // child objects do not have physics
        ASSERT(!this.parent);

        if (this.clampSpeed)
        {
            // limit max speed to prevent missing collisions
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }

        // apply physics
        const oldPos = this.pos.copy();
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

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);
        if (!enablePhysicsSolver || !this.mass) // don't do collision for static objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const friction = max(this.friction, this.groundObject.friction);
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * friction;
            this.groundObject = undefined;
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = .001; // necessary to push slightly outside of the collision
            for (const o of engineObjectsCollide)
            {
                // non solid objects don't collide with each other
                if ((!this.isSolid && !o.isSolid) || o.destroyed || o.parent || o === this)
                    continue;

                // check collision
                if (!this.isOverlappingObject(o))
                    continue;

                // notify objects of collision and check if should be resolved
                const collide1 = this.collideWithObject(o);
                const collide2 = o.collideWithObject(this);
                if (!collide1 || !collide2)
                    continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001; // push away if already overlapping
                    const velocity = length < .01 ? randVec2(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
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
                    if ((o.groundObject && wasMovingDown) || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
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
            const hitLayer = tileCollisionTest(this.pos, this.size, this)
            if (hitLayer)
            {
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const blockedLayerY = tileCollisionTest(vec2(oldPos.x, this.pos.y), this.size, this);
                    const blockedLayerX = tileCollisionTest(vec2(this.pos.x, oldPos.y), this.size, this);

                    if (blockedLayerX)
                    {
                        // try to move up a tiny bit
                        const epsilon = 1e-3;
                        const maxMoveUp = .1;
                        const y = floor(oldPos.y-this.size.y/2+1) +
                            this.size.y/2 + epsilon;
                        const delta = y - this.pos.y;
                        if (delta < maxMoveUp)
                        if (!tileCollisionTest(vec2(this.pos.x, y), this.size, this))
                        {   
                            this.pos.y = y;
                            debugPhysics && debugRect(this.pos, this.size, '#ff0');
                            return;
                        }

                        // move to previous position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.restitution;
                    }
                    if (blockedLayerY || !blockedLayerX)
                    {
                        // bounce velocity
                        const restitution = max(this.restitution, hitLayer.restitution);
                        this.velocity.y *= -restitution;

                        if (wasMovingDown)
                        {
                            // adjust position to slightly above nearest tile boundary
                            // this prevents gap between object and ground
                            const epsilon = .0001;
                            this.pos.y = (oldPos.y-this.size.y/2|0)+this.size.y/2+epsilon;

                            // set ground object for tile collision
                            this.groundObject = hitLayer;
                        }
                        else
                        {
                            // move to previous position
                            this.pos.y = oldPos.y;
                            this.groundObject = undefined;
                        }
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

    /** Destroy this object, destroy its children, detach its parent, and mark it for removal */
    destroy()
    {
        if (this.destroyed)
            return;

        // disconnect from parent and destroy children
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
        {
            child.parent = 0;
            child.destroy();
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

    /** Called to check if a tile collision should be resolved
     *  @param {number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos      - tile where the collision occurred
     *  @return {boolean}         - true if the collision should be resolved */
    collideWithTile(tileData, pos) { return tileData > 0; }

    /** Called to check if a object collision should be resolved
     *  @param {EngineObject} object - the object to test against
     *  @return {boolean}            - true if the collision should be resolved
     */
    collideWithObject(object) { return true; }

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

    /** Attaches a child to this with a given local transform
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=(0,0)]
     *  @param {number}       [localAngle] */
    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        ASSERT(child instanceof EngineObject, 'child must be an EngineObject');
        ASSERT(child !== this, 'cannot add self as child');
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }

    /** Removes a child from this one
     *  @param {EngineObject} child */
    removeChild(child)
    {
        ASSERT(child.parent === this && this.children.includes(child));
        ASSERT(child instanceof EngineObject, 'child must be an EngineObject');
        const index = this.children.indexOf(child);
        ASSERT(index >= 0, 'child not found in children array');
        index >= 0 && this.children.splice(index, 1);
        child.parent = 0;
    }

    /** Check if overlapping another engine object
     *  Collisions are resoloved to prevent overlaps
     *  @param {EngineObject} object
     *  @return {boolean} */
    isOverlappingObject(object)
    { return this.isOverlapping(object.pos, object.size); }

    /** Check if overlapping a point or aligned bounding box
     *  @param {Vector2} pos          - Center of box
     *  @param {Vector2} [size=(0,0)] - Size of box, uses a point if undefined
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
        if (debug)
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
    }

    /** Render debug info for this object  */
    renderDebugInfo()
    {
        if (!debug)
            return;

        // show object info for debugging
        const size = vec2(max(this.size.x, .2), max(this.size.y, .2));
        const color = rgb(this.collideTiles?1:0, this.collideSolidObjects?1:0, this.isSolid?1:0, .5);
        drawRect(this.pos, size, color, this.angle);
        if (this.parent)
            drawRect(this.pos, size.scale(.8), rgb(1,1,1,.5), this.angle);
        this.parent && drawLine(this.pos, this.parent.pos, .1, rgb(1,1,1,.5));
    }
}
/**
 * LittleJS Drawing System
 * - Hybrid system with both Canvas2D and WebGL available
 * - Super fast tile sheet rendering with WebGL
 * - Can apply rotation, mirror, color and additive color
 * - Font rendering system with built in engine font
 * - Many useful utility functions
 *
 * LittleJS uses a hybrid rendering solution with the best of both Canvas2D and WebGL.
 * There are 3 canvas/contexts available to draw to...
 * mainCanvas - 2D background canvas, non WebGL stuff like tile layers are drawn here.
 * glCanvas - Used by the accelerated WebGL batch rendering system.
 * overlayCanvas - Another 2D canvas that appears on top of the other 2 canvases.
 *
 * The WebGL rendering system is very fast with some caveats...
 * - Switching blend modes (additive) or textures causes another draw call which is expensive in excess
 * - Group additive rendering together using renderOrder to mitigate this issue
 *
 * The LittleJS rendering solution is intentionally simple, feel free to adjust it for your needs!
 * @namespace Draw
 */

/** The primary 2D canvas visible to the user
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let mainCanvas;

/** 2d context for mainCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let mainContext;

/** A canvas that appears on top of everything the same size as mainCanvas
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let overlayCanvas;

/** 2d context for overlayCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let overlayContext;

/** The default canvas to use for drawing, usually mainCanvas
 *  @type {HTMLCanvasElement|OffscreenCanvas}
 *  @memberof Draw */
let drawCanvas;

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

/** The size of the main canvas (and other secondary canvases)
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

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {Vector2|number} [pos=0] - Position of the tile in pixels, or tile index
 * @param {Vector2|number} [size=tileSizeDefault] - Size of tile in pixels
 * @param {number} [textureIndex] - Texture index to use
 * @param {number} [padding] - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw */
function tile(pos=new Vector2, size=tileSizeDefault, textureIndex=0, padding=0)
{
    if (headlessMode)
        return new TileInfo;

    // if size is a number, make it a vector
    if (typeof size === 'number')
    {
        ASSERT(size > 0);
        size = new Vector2(size, size);
    }

    // create tile info object
    const tileInfo = new TileInfo(new Vector2, size, textureIndex, padding);

    // get the position of the tile
    const textureInfo = textureInfos[textureIndex];
    ASSERT(!!textureInfo, 'Texture not loaded');
    const sizePaddedX = size.x + padding*2;
    const sizePaddedY = size.y + padding*2;
    if (typeof pos === 'number')
    {
        const cols = textureInfo.size.x / sizePaddedX |0;
        ASSERT(cols > 0, 'Tile size is too big for texture');
        const posX = pos % cols, posY = (pos / cols) |0;
        tileInfo.pos.set(posX*sizePaddedX+padding, posY*sizePaddedY+padding);
    }
    else
        tileInfo.pos.set(pos.x*sizePaddedX+padding, pos.y*sizePaddedY+padding);
    return tileInfo;
}

/**
 * Tile Info - Stores info about how to draw a tile
 * @memberof Draw
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {number}  [textureIndex]         - Texture index to use
     *  @param {number}  [padding]              - How many pixels padding around tiles
     *  @param {number}  [bleedScale]           - How many pixels smaller to draw tiles
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0, bleedScale=tileFixBleedScale)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {number} - Texture index to use */
        this.textureIndex = textureIndex;
        /** @property {number} - How many pixels padding around tiles */
        this.padding = padding;
        /** @property {TextureInfo} - The texture info for this tile */
        this.textureInfo = textureInfos[this.textureIndex];
        /** @property {float} - Shrinks tile by this many pixels to prevent neighbors bleeding */
        this.bleedScale = bleedScale;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex, this.padding, this.bleedScale); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame === 'number');
        return this.offset(new Vector2(frame*(this.size.x+this.padding*2), 0));
    }

    /**
     * Set this tile to use a full image in a texture info
     * @param {TextureInfo} textureInfo
     * @return {TileInfo}
     */
    setFullImage(textureInfo)
    {
        this.pos = new Vector2;
        this.size = textureInfo.size.copy();
        this.textureInfo = textureInfo;
        // do not use padding or bleed
        this.bleedScale = this.padding = 0;
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
     */
    constructor(image, useWebGL=true)
    {
        /** @property {HTMLImageElement|OffscreenCanvas} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = image ? vec2(image.width, image.height) : vec2();
        /** @property {Vector2} - inverse of the size, cached for rendering */
        this.sizeInverse = image ? vec2(1/image.width, 1/image.height) : vec2();
        /** @property {WebGLTexture} - WebGL texture */
        this.glTexture = undefined;
        useWebGL && this.createWebGLTexture();
    }

    /** Creates the WebGL texture, updates if already created */
    createWebGLTexture() { glRegisterTextureInfo(this); }

    /** Destroys the WebGL texture */
    destroyWebGLTexture() { glUnregisterTextureInfo(this); }

    /** Check if the texture is webgl enabled
     * @return {boolean} */
    hasWebGL() { return !!this.glTexture; }
}

///////////////////////////////////////////////////////////////////////////////
// Drawing functions

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2}  pos                 - Center of the tile in world space
 *  @param {Vector2}  [size=(1,1)]        - Size of the tile in world space
 *  @param {TileInfo} [tileInfo]          - Tile info to use, untextured if undefined
 *  @param {Color}    [color=(1,1,1,1)]   - Color to modulate with
 *  @param {number}   [angle]             - Angle to rotate by
 *  @param {boolean}  [mirror]            - Is image flipped along the Y axis?
 *  @param {Color}    [additiveColor]     - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are the pos and size are in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=new Vector2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    const textureInfo = tileInfo && tileInfo.textureInfo;
    const bleedScale = tileInfo ? tileInfo.bleedScale : 0;
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
            if (bleedScale)
            {
                const tileImageFixBleedX = sizeInverse.x*bleedScale;
                const tileImageFixBleedY = sizeInverse.y*bleedScale;
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x + tileImageFixBleedX,     y + tileImageFixBleedY,
                    x - tileImageFixBleedX + w, y - tileImageFixBleedY + h,
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
            // if no tile info, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt());
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        size = new Vector2(size.x, -size.y); // flip upside down sprites
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // calculate uvs and render
                const x = tileInfo.pos.x,  y = tileInfo.pos.y;
                const w = tileInfo.size.x, h = tileInfo.size.y;
                drawImageColor(context, textureInfo.image, x, y, w, h, -.5, -.5, 1, 1, color, additiveColor, bleedScale);
            }
            else
            {
                // if no tile info, use untextured rect
                const c = additiveColor ? color.add(additiveColor) : color;
                context.fillStyle = c.toString();
                context.fillRect(-.5, -.5, 1, 1);
            }
        }, screenSpace, context);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [color=(1,1,1,1)]
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
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [colorTop=(1,1,1,1)]
 *  @param {Color}   [colorBottom=(0,0,0,1)]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRectGradient(pos, size, colorTop=WHITE, colorBottom=BLACK, angle=0, useWebGL=glEnable, screenSpace=false, context)
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
        size = new Vector2(size.x, -size.y); // fix upside down sprites
        drawCanvas2D(pos, size, angle, false, (context)=>
        {
            // if no tile info, use untextured rect
            const gradient = context.createLinearGradient(0, -.5, 0, .5);
            gradient.addColorStop(0, colorTop.toString());
            gradient.addColorStop(1, colorBottom.toString());
            context.fillStyle = gradient;
            context.fillRect(-.5, -.5, 1, 1);
        }, screenSpace, context);
    }
}

/** Draw connected lines between a series of points
 *  @param {Array<Vector2>} points
 *  @param {number}  [width]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {boolean} [wrap] - Should the last point connect to the first?
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLineList(points, width=.1, color, wrap=false, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace, context)
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
        drawCanvas2D(pos, vec2(1), angle, false, (context)=>
        {
            context.strokeStyle = color.toString();
            context.lineWidth = width;
            context.beginPath();
            for (let i=0; i<points.length; ++i)
            {
                const point = points[i];
                if (i)
                    context.lineTo(point.x, point.y);
                else
                    context.moveTo(point.x, point.y);
            }
            if (wrap)
                context.closePath();
            context.stroke();
        }, screenSpace, context);
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [width]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, width=.1, color, pos=vec2(), angle=0, useWebGL, screenSpace, context)
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
 *  @param {Vector2} [size=(1,1)]
 *  @param {number}  [sides]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
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
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
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
 *  @param {Vector2} [size=(1,1)] - Width and height diameter
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
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
    ASSERT(lineWidth >= 0 && lineWidth < size.x && lineWidth < size.y, 'invalid lineWidth');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

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
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipse(pos, vec2(size), color, 0, lineWidth, lineColor, useWebGL, screenSpace, context);
}

/**
 * @callback Canvas2DDrawFunction - A function that draws to a 2D canvas context
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 * @memberof Draw
 */

/** Draw directly to a 2d canvas context in world space
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
        [pos, size, angle] = worldToScreenTransform(pos, size, angle);
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
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, fontStyle, maxWidth, angle=0, context=drawContext)
{
    // convert to screen space
    pos = worldToScreen(pos);
    size *= cameraScale;
    lineWidth *= cameraScale;
    angle -= cameraAngle;
    angle *= -1;

    drawTextScreen(text, pos, size, color, lineWidth, lineColor, textAlign, font, fontStyle, maxWidth, angle, context);
}

/** Draw text on overlay canvas in world space
 *  Automatically splits new lines into rows
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @memberof Draw */
function drawTextOverlay(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, fontStyle, maxWidth, angle=0)
{
    drawText(text, pos, size, color, lineWidth, lineColor, textAlign, font, fontStyle, maxWidth, angle, overlayContext);
}

/** Draw text on overlay canvas in screen space
 *  Automatically splits new lines into rows
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=overlayContext)
{
    ASSERT(isString(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isColor(color), 'color must be a color');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isColor(lineColor), 'lineColor must be a color');
    ASSERT(['left','center','right'].includes(textAlign), 'align must be left, center, or right');
    ASSERT(isString(font), 'font must be a string');
    ASSERT(isString(fontStyle), 'fontStyle must be a string');
    ASSERT(isNumber(angle), 'angle must be a number');
    
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = fontStyle + ' ' + size + 'px '+ font;
    context.textBaseline = 'middle';

    const lines = (text+'').split('\n');
    const posY = pos.y - (lines.length-1) * size/2; // center vertically
    context.save();
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

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    let x = (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale;
    let y = (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const rotatedX = x * c - y * s;
        const rotatedY = x * s + y * c;
        x = rotatedX;
        y = rotatedY;
    }
    return new Vector2(x + cameraPos.x, y + cameraPos.y);
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    let x = worldPos.x - cameraPos.x;
    let y = worldPos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const rotatedX = x * c - y * s;
        const rotatedY = x * s + y * c;
        x = rotatedX;
        y = rotatedY;
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
    let x = screenDelta.x /  cameraScale;
    let y = screenDelta.y / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const rotatedX = x * c - y * s;
        const rotatedY = x * s + y * c;
        x = rotatedX;
        y = rotatedY;
    }
    return new Vector2(x, y);
}

/** Convert from screen to world space coordinates for a directional vector (no translation)
 *  @param {Vector2} worldDelta
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreenDelta(worldDelta)
{
    let x = worldDelta.x;
    let y = worldDelta.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const rotatedX = x * c - y * s;
        const rotatedY = x * s + y * c;
        x = rotatedX;
        y = rotatedY;
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
    return [
        screenToWorld(screenPos),
        screenSize.scale(1/cameraScale),
        screenAngle + cameraAngle
    ];
}

/** Convert world space transform to screen space
 *  @param {Vector2} worldPos
 *  @param {Vector2} worldSize  
 *  @param {number} [worldAngle]
 *  @return {[Vector2, Vector2, number]} - [pos, size, angle]
 *  @memberof Draw */
function worldToScreenTransform(worldPos, worldSize, worldAngle=0)
{
    return [
        worldToScreen(worldPos),
        worldSize.scale(cameraScale),
        worldAngle - cameraAngle
    ];
}

/** Get the camera's visible area in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

/** Enable normal or additive blend mode
 *  @param {boolean} [additive]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function setBlendMode(additive=false, context)
{
    glAdditive = additive;
    context ||= drawContext;
    context.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}

/** Combines all LittleJS canvases onto the main canvas and clears them
 *  This is necessary for things like saving a screenshot
 *  @memberof Draw */
function combineCanvases()
{
    // combine canvases
    glCopyToContext(mainContext);
    mainContext.drawImage(overlayCanvas, 0, 0);

    // clear canvases
    glClearCanvas();
    overlayCanvas.width |= 0;
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
    *  @param {number} [bleedScale] - How much to shrink the source, used to fix bleeding
 *  @memberof Draw */
function drawImageColor(context, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, color, additiveColor, bleedScale=0)
{
    function isWhite(c) { return c.r >= 1 && c.g >= 1 && c.b >= 1; }
    function isBlack(c) { return c.r <= 0 && c.g <= 0 && c.b <= 0 && c.a <= 0; }
    const sx2 = bleedScale;
    const sy2 = bleedScale;
    sWidth  = max(1,sWidth|0);
    sHeight = max(1,sHeight|0);
    const sWidth2  = sWidth  - 2*bleedScale;
    const sHeight2 = sHeight - 2*bleedScale;
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
        workCanvas.width = sWidth;
        workCanvas.height = sHeight;
        workContext.drawImage(image, sx|0, sy|0, sWidth, sHeight, 0, 0, sWidth, sHeight);

        // tint image using offscreen work context
        const imageData = workContext.getImageData(0, 0, sWidth, sHeight);
        const data = imageData.data;
        if (additiveColor && !isBlack(additiveColor))
        {
            // slower path with additive color
            const colorMultiply = [color.r, color.g, color.b, color.a];
            const colorAdd = [additiveColor.r * 255, additiveColor.g * 255, additiveColor.b * 255, additiveColor.a * 255];
            for (let i = 0; i < data.length; ++i)
                data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
            workContext.putImageData(imageData, 0, 0);
            context.drawImage(workCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
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
            workContext.putImageData(imageData, 0, 0);
            context.globalAlpha = color.a;
            context.drawImage(workCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
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

let engineFontImage;

/**
 * Font Image Object - Draw text on a 2D canvas by using characters in an image
 * - 96 characters (from space to tilde) are stored in an image
 * - Uses a default 8x8 font if none is supplied
 * - You can also use fonts from the main tile sheet
 * @memberof Draw
 * @example
 * // use built in font
 * const font = new FontImage;
 *
 * // draw text
 * font.drawTextScreen('LittleJS\nHello World!', vec2(200, 50));
 */
class FontImage
{
    /** Create an image font
     *  @param {HTMLImageElement} [image] - Image for the font, default if undefined
     *  @param {Vector2} [tileSize=(8,8)] - Size of the font source tiles
     *  @param {Vector2} [paddingSize=(0,1)] - How much space between characters
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1))
    {
        // load default font image
        if (!engineFontImage)
        {
            engineFontImage = new Image;
            engineFontImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';
        }

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
    }

    /** Draw text in world space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale=.25]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext] 
     */
    drawText(text, pos, scale=1, center, context=drawContext)
    {
        this.drawTextScreen(text, worldToScreen(pos).floor(), scale*cameraScale|0, center, context);
    }

    /** Draw text on overlay canvas in world space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale]
     *  @param {boolean} [center]
     */
    drawTextOverlay(text, pos, scale=4, center)
    { this.drawText(text, pos, scale, center, overlayContext); }

    /** Draw text on overlay canvas in screen space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     */
    drawTextScreen(text, pos, scale=4, center=true, context=overlayContext)
    {
        context.save();
        const size = this.tileSize;
        const drawSize = size.add(this.paddingSize).scale(scale);
        const cols = this.image.width / this.tileSize.x |0;
        (text+'').split('\n').forEach((line, i)=>
        {
            const centerOffset = center ? line.length * size.x * scale / 2 |0 : 0;
            for (let j=line.length; j--;)
            {
                // draw each character
                let charCode = line[j].charCodeAt(0);
                if (charCode < 32 || charCode > 127)
                    charCode = 127; // unknown character

                // get the character source location and draw it
                const tile = charCode - 32;
                const x = tile % cols;
                const y = tile / cols |0;
                const drawPos = pos.add(vec2(j,i).multiply(drawSize));
                context.drawImage(this.image, x * size.x, y * size.y, size.x, size.y,
                    drawPos.x - centerOffset, drawPos.y, size.x * scale, size.y * scale);
            }
        });
        context.restore();
    }
}
/**
 * LittleJS Input System
 * - Tracks keyboard down, pressed, and released
 * - Tracks mouse buttons, position, and wheel
 * - Tracks multiple analog gamepads
 * - Touch input is handled as mouse input
 * - Virtual gamepad for touch devices
 * @namespace Input
 */

/** Returns true if device key is down
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyIsDown(key, device=0)
{
    ASSERT(key !== undefined, 'key is undefined');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 1);
}

/** Returns true if device key was pressed this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasPressed(key, device=0)
{
    ASSERT(key !== undefined, 'key is undefined');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 2);
}

/** Returns true if device key was released this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasReleased(key, device=0)
{
    ASSERT(key !== undefined, 'key is undefined');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 4);
}

/** Returns input vector from arrow keys or WASD if enabled
 *  @return {Vector2}
 *  @memberof Input */
function keyDirection(up='ArrowUp', down='ArrowDown', left='ArrowLeft', right='ArrowRight')
{
    const k = (key)=> keyIsDown(key) ? 1 : 0;
    return vec2(k(right) - k(left), k(up) - k(down));
}

/** Clears all input
 *  @memberof Input */
function inputClear() { inputData = [[]]; touchGamepadButtons = []; }

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

/** Returns true if mouse button is down
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseIsDown(button) { return keyIsDown(button); }

/** Returns true if mouse button was pressed
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasPressed(button) { return keyWasPressed(button); }

/** Returns true if mouse button was released
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasReleased(button) { return keyWasReleased(button); }

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

/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @type {boolean}
 *  @memberof Input */
let isUsingGamepad = false;

/** Prevents input continuing to the default browser handling (true by default)
 *  @type {boolean}
 *  @memberof Input */
let inputPreventDefault = true;

/** Prevents input continuing to the default browser handling
 *  This is useful to disable for html menus so the browser can handle input normally
 *  @param {boolean} preventDefault
 *  @memberof Input */
function setInputPreventDefault(preventDefault) { inputPreventDefault = preventDefault; }

/** Returns true if gamepad button is down
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadIsDown(button, gamepad=0)
{ return keyIsDown(button, gamepad+1); }

/** Returns true if gamepad button was pressed
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasPressed(button, gamepad=0)
{ return keyWasPressed(button, gamepad+1); }

/** Returns true if gamepad button was released
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasReleased(button, gamepad=0)
{ return keyWasReleased(button, gamepad+1); }

/** Returns gamepad stick value
 *  @param {number} stick
 *  @param {number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadStick(stick, gamepad=0)
{ return gamepadStickData[gamepad] ? gamepadStickData[gamepad][stick] || vec2() : vec2(); }

///////////////////////////////////////////////////////////////////////////////
// Input system functions called automatically by engine

// input is stored as a bit field for each key: 1 = isDown, 2 = wasPressed, 4 = wasReleased
// mouse and keyboard are stored together in device 0, gamepads are in devices > 0
let inputData = [[]];

function inputUpdate()
{
    if (headlessMode) return;

    // clear input when lost focus (prevent stuck keys)
    if (!(touchInputEnable && isTouchDevice) && !document.hasFocus())
        inputClear();

    // update mouse world space position and delta
    mousePos = screenToWorld(mousePosScreen);
    mouseDelta = screenToWorldDelta(mouseDeltaScreen);

    // update gamepads if enabled
    gamepadsUpdate();
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
    document.addEventListener('wheel', onMouseWheel);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('blur', onBlur);

    // init touch input
    if (isTouchDevice && touchInputEnable)
        touchInputInit();

    function onKeyDown(e)
    {
        if (!e.repeat)
        {
            isUsingGamepad = false;
            inputData[0][e.code] = 3;
            if (inputWASDEmulateDirection)
                inputData[0][remapKey(e.code)] = 3;
        }
    }
    function onKeyUp(e)
    {
        inputData[0][e.code] = (inputData[0][e.code]&2) | 4;
        if (inputWASDEmulateDirection)
            inputData[0][remapKey(e.code)] = 4;
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
        if (isTouchDevice && touchInputEnable)
            return;

        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        isUsingGamepad = false;
        inputData[0][e.button] = 3;

        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
        inputPreventDefault && e.button && e.preventDefault();
    }
    function onMouseUp(e)
    {
        if (isTouchDevice && touchInputEnable)
            return;
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
    function onMouseWheel(e) { mouseWheel = e.ctrlKey ? 0 : sign(e.deltaY); }
    function onContextMenu(e) { e.preventDefault(); } // prevent right click menu
    function onBlur() { inputClear(); } // reset input when focus is lost
}

// convert a mouse or touch event position to screen space
function mouseEventToScreen(mousePos)
{
    const rect = mainCanvas.getBoundingClientRect();
    const px = percent(mousePos.x, rect.left, rect.right);
    const py = percent(mousePos.y, rect.top, rect.bottom);
    return vec2(px*mainCanvas.width, py*mainCanvas.height);
}

///////////////////////////////////////////////////////////////////////////////
// Gamepad input

// gamepad internal variables
const gamepadStickData = [];

// gamepads are updated by engine every frame automatically
function gamepadsUpdate()
{
    const applyDeadZones = (v)=>
    {
        const min=.3, max=.8;
        const deadZone = (v)=>
            v > min ? percent(v, min, max) :
            v < -min ? -percent(-v, min, max) : 0;
        return vec2(deadZone(v.x), deadZone(-v.y)).clampLength();
    }

    // update touch gamepad if enabled
    if (touchGamepadEnable && isTouchDevice)
    {
        if (!touchGamepadTimer.isSet())
            return;

        // read virtual analog stick
        const sticks = gamepadStickData[0] || (gamepadStickData[0] = []);
        sticks[0] = vec2();
        if (touchGamepadAnalog)
            sticks[0] = applyDeadZones(touchGamepadStick);
        else if (touchGamepadStick.lengthSquared() > .3)
        {
            // convert to 8 way dpad
            sticks[0].x = round(touchGamepadStick.x);
            sticks[0].y = -round(touchGamepadStick.y);
            sticks[0] = sticks[0].clampLength();
        }

        // read virtual gamepad buttons
        const data = inputData[1] || (inputData[1] = []);
        for (let i=10; i--;)
        {
            const wasDown = gamepadIsDown(i,0);
            data[i] = touchGamepadButtons[i] ? wasDown ? 1 : 3 : wasDown ? 4 : 0;
        }

        // disable normal gamepads when touch gamepad is active
        return;
    }

    // return if gamepads are disabled or not supported
    if (!gamepadsEnable || !navigator || !navigator.getGamepads)
        return;

    // only poll gamepads when focused or in debug mode
    if (!debug && !document.hasFocus())
        return;

    // poll gamepads
    const gamepads = navigator.getGamepads();
    for (let i = gamepads.length; i--;)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        const data = inputData[i+1] || (inputData[i+1] = []);
        const sticks = gamepadStickData[i] || (gamepadStickData[i] = []);

        if (gamepad)
        {
            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = applyDeadZones(vec2(gamepad.axes[j],gamepad.axes[j+1]));

            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                const wasDown = gamepadIsDown(j,i);
                data[j] = button.pressed ? wasDown ? 1 : 3 : wasDown ? 4 : 0;
                if (!button.value || button.value > .9) // must be a full press
                if (!i && button.pressed)
                    isUsingGamepad = true;
            }

            if (gamepadDirectionEmulateStick)
            {
                // copy dpad to left analog stick when pressed
                const dpad = vec2(
                    (gamepadIsDown(15,i)&&1) - (gamepadIsDown(14,i)&&1),
                    (gamepadIsDown(12,i)&&1) - (gamepadIsDown(13,i)&&1));
                if (dpad.lengthSquared())
                    sticks[0] = dpad.clampLength();
            }

            // disable touch gamepad if using real gamepad
            touchGamepadEnable && isUsingGamepad && touchGamepadTimer.unset();
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Pulse the vibration hardware if it exists
 *  @param {number|Array} [pattern] - single value in ms or vibration interval array
 *  @memberof Input */
function vibrate(pattern=100)
{ vibrateEnable && !headlessMode && navigator && navigator.vibrate && navigator.vibrate(pattern); }

/** Cancel any ongoing vibration
 *  @memberof Input */
function vibrateStop() { vibrate(0); }

///////////////////////////////////////////////////////////////////////////////
// Touch input & virtual on screen gamepad

/** True if a touch device has been detected
 *  @memberof Input */
const isTouchDevice = !headlessMode && window.ontouchstart !== undefined;

// touch gamepad internal variables
let touchGamepadTimer = new Timer, touchGamepadButtons = [], touchGamepadStick = vec2();

function touchGamepadButtonCenter()
{
    // draw right face buttons
    const center = vec2(mainCanvasSize.x-touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    if (touchGamepadButtonCount <= 2)
        center.x += touchGamepadSize/2;
    return center;
}

// enable touch input mouse passthrough
function touchInputInit()
{
    // add non passive touch event listeners
    document.addEventListener('touchstart', (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchmove',  (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchend',   (e) => handleTouch(e), { passive: false });

    // handle all touch events the same way
    let wasTouching;
    function handleTouch(e)
    {
        if (!touchInputEnable)
            return;

        // route touch to gamepad
        if (touchGamepadEnable)
            handleTouchGamepad(e);

        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        const button = 0; // all touches are left mouse button
        if (touching)
        {
            // set event pos and pass it along
            const pos = vec2(e.touches[0].clientX, e.touches[0].clientY);
            const mousePosScreenLast = mousePosScreen;
            mousePosScreen = mouseEventToScreen(pos);
            if (wasTouching)
            {
                mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
                isUsingGamepad = touchGamepadEnable;
            }
            else
                inputData[0][button] = 3;
        }
        else if (wasTouching)
            inputData[0][button] = inputData[0][button] & 2 | 4;

        // set was touching
        wasTouching = touching;

        // prevent default handling like copy, magnifier lens, and scrolling
        if (inputPreventDefault && document.hasFocus() && e.cancelable)
            e.preventDefault();

        // must return true so the document will get focus
        return true;
    }

    // special handling for virtual gamepad mode
    function handleTouchGamepad(e)
    {
        // clear touch gamepad input
        touchGamepadStick = vec2();
        touchGamepadButtons = [];
        isUsingGamepad = true;

        const touching = e.touches.length;
        if (touching)
        {
            touchGamepadTimer.set();
            if (touchGamepadCenterButton && !wasTouching && paused)
            {
                // touch anywhere to press start when paused
                touchGamepadButtons[9] = 1;
                return;
            }
        }

        // get center of left and right sides
        const stickCenter = vec2(touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
        const buttonCenter = touchGamepadButtonCenter();
        const startCenter = mainCanvasSize.scale(.5);

        // check each touch point
        for (const touch of e.touches)
        {
            const touchPos = mouseEventToScreen(vec2(touch.clientX, touch.clientY));
            if (stickCenter.distance(touchPos) < touchGamepadSize)
            {
                // virtual analog stick
                touchGamepadStick = touchPos.subtract(stickCenter).scale(2/touchGamepadSize).clampLength();
            }
            else if (buttonCenter.distance(touchPos) < touchGamepadSize)
            {
                // virtual face buttons
                let button = buttonCenter.subtract(touchPos).direction();
                button = mod(button+2, 4);
                if (touchGamepadButtonCount === 1)
                    button = 0;
                else if (touchGamepadButtonCount === 2)
                {
                    const delta = buttonCenter.subtract(touchPos);
                    button = -delta.x < delta.y ? 1 : 0;
                }
                // fix button locations (swap 2 and 3 to match gamepad layout)
                button = button === 3 ? 2 : button === 2 ? 3 : button;
                if (button < touchGamepadButtonCount)
                    touchGamepadButtons[button] = 1;
            }
            else if (touchGamepadCenterButton && !wasTouching && 
                startCenter.distance(touchPos) < touchGamepadSize)
            {
                // virtual start button in center
                touchGamepadButtons[9] = 1;
            }
        }
    }
}

// render the touch gamepad, called automatically by the engine
function touchGamepadRender()
{
    if (!touchInputEnable || !isTouchDevice || headlessMode) return;
    if (!touchGamepadEnable || !touchGamepadTimer.isSet())
        return;

    // fade off when not touching or paused
    const alpha = percent(touchGamepadTimer.get(), 4, 3);
    if (!alpha || paused)
        return;

    // setup the canvas
    const context = overlayContext;
    context.save();
    context.globalAlpha = alpha*touchGamepadAlpha;
    context.strokeStyle = '#fff';
    context.lineWidth = 3;

    // draw left analog stick
    context.fillStyle = touchGamepadStick.lengthSquared() > 0 ? '#fff' : '#000';
    context.beginPath();
    const stickCenter = vec2(touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    if (touchGamepadAnalog) // draw circle shaped gamepad
    {
        context.arc(stickCenter.x, stickCenter.y, touchGamepadSize/2, 0, 9);
        context.fill();
        context.stroke();
    }
    else // draw cross shaped gamepad
    {
        for (let i=10; i--;)
        {
            const angle = i*PI/4;
            context.arc(stickCenter.x, stickCenter.y,touchGamepadSize*.6, angle + PI/8, angle + PI/8);
            i%2 && context.arc(stickCenter.x, stickCenter.y, touchGamepadSize*.33, angle, angle);
            i===1 && context.fill();
        }
        context.stroke();
    }

    // draw right face buttons
    const buttonCenter = touchGamepadButtonCenter();
    const buttonSize = touchGamepadButtonCount > 1 ? touchGamepadSize/4 : touchGamepadSize/2;
    for (let i=0; i<touchGamepadButtonCount; i++)
    {
        const j = mod(i-1, 4);
        let button = touchGamepadButtonCount > 2 ? 
            j : min(j, touchGamepadButtonCount-1);
        // fix button locations (swap 2 and 3 to match gamepad layout)
        button = button === 3 ? 2 : button === 2 ? 3 : button;
        const pos = buttonCenter.add(vec2().setDirection(j, touchGamepadSize/2));
        context.fillStyle = touchGamepadButtons[button] ? '#fff' : '#000';
        context.beginPath();
        context.arc(pos.x, pos.y, buttonSize, 0,9);
        context.fill();
        context.stroke();
    }

    // set canvas back to normal
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Pointer Lock

/** Request to lock the pointer, does not work on touch devices
 *  @memberof Input */
function pointerLockRequest()
{
    if (!isTouchDevice)
        mainCanvas.requestPointerLock && mainCanvas.requestPointerLock();
}

/** Request to unlock the pointer
 *  @memberof Input */
function pointerLockExit() { document.exitPointerLock && document.exitPointerLock(); }

/** Check if pointer is locked (true if locked)
 *  @return {boolean}
 *  @memberof Input */
function pointerLockIsActive() { return document.pointerLockElement === mainCanvas; }
/**
 * LittleJS Audio System
 * - <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX Sound Effects</a> - ZzFX Sound Effect Generator
 * - <a href=https://keithclark.github.io/ZzFXM/>ZzFXM Music</a> - ZzFXM Music System
 * - Caches sounds and music for fast playback
 * - Can attenuate and apply stereo panning to sounds
 * - Ability to play mp3, ogg, and wave files
 * - Speech synthesis functions
 * @namespace Audio
 */

/** Audio context used by the engine
 *  @type {AudioContext}
 *  @memberof Audio */
let audioContext = new AudioContext;

/** Master gain node for all audio to pass through
 *  @type {GainNode}
 *  @memberof Audio */
let audioMasterGain;

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

    audioMasterGain = audioContext.createGain();
    audioMasterGain.connect(audioContext.destination);
    audioMasterGain.gain.value = soundVolume; // set starting value
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Sound Object - Stores a sound for later use and can be played positionally
 *
 * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 * @memberof Audio
 * @example
 * // create a sound
 * const sound_example = new Sound([.5,.5]);
 *
 * // play the sound
 * sound_example.play();
 */
class Sound
{
    /** Create a sound object and cache the zzfx samples for later use
     *  @param {Array}  zzfxSound - Array of zzfx parameters, ex. [.5,.5]
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     */
    constructor(zzfxSound, range=soundDefaultRange, taper=soundDefaultTaper)
    {
        if (!soundEnable || headlessMode) return;

        ASSERT(!zzfxSound || isArray(zzfxSound), 'zzfxSound is invalid');
        ASSERT(isNumber(range), 'range must be a number');
        ASSERT(isNumber(taper), 'taper must be a number');

        /** @property {number} - World space max range of sound */
        this.range = range;
        /** @property {number} - At what percentage of range should it start tapering */
        this.taper = taper;
        /** @property {number} - How much to randomize frequency each time sound plays */
        this.randomness = 0;
        /** @property {number} - Sample rate for this sound */
        this.sampleRate = audioDefaultSampleRate;
        /** @property {number} - Percentage of this sound currently loaded */
        this.loadedPercent = 0;

        // generate zzfx sound now for fast playback
        if (zzfxSound)
        {
            // remove randomness so it can be applied on playback
            const randomnessIndex = 1, defaultRandomness = .05;
            this.randomness = zzfxSound[randomnessIndex] !== undefined ? 
                zzfxSound[randomnessIndex] : defaultRandomness;
            zzfxSound[randomnessIndex] = 0;

            // generate the zzfx samples
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.loadedPercent = 1;
        }
    }

    /** Play the sound
     *  Sounds may not play until a user interaction occurs
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop] - Should the sound loop?
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance} - The audio source node
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false)
    {
        ASSERT(!pos || isVector2(pos), 'pos must be a vec2');
        ASSERT(isNumber(volume), 'volume must be a number');
        ASSERT(isNumber(pitch), 'pitch must be a number');
        ASSERT(isNumber(randomnessScale), 'randomnessScale must be a number');

        if (!soundEnable || headlessMode) return;
        if (!this.sampleChannels) return;

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
            pan = worldToScreen(pos).x * 2/mainCanvas.width - 1;
        }
        
        // Create and return sound instance
        const rate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        return new SoundInstance(this, volume, rate, pan, loop, paused);
    }
    
    /** Play a music track that loops by default
     *  @param {number} [volume] - Volume to play the music at
     *  @param {boolean} [loop] - Should the music loop?
     *  @param {boolean} [paused] - Should the music start paused
     *  @return {SoundInstance} - The audio source node
     */
    playMusic(volume=1, loop=true, paused=false)
    { return this.play(undefined, volume, 1, 0, loop, paused); }

    /** Play the sound as a musical note with a semitone offset
     *  This can be used to play music with chromatic scales
     *  @param {number}  [semitoneOffset=0] - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume=1] - How much to scale volume by
     *  @return {SoundInstance} - The audio source node
     */
    playNote(semitoneOffset=0, pos, volume)
    {
        ASSERT(isNumber(semitoneOffset), 'semitoneOffset must be a number');
        const pitch = getNoteFrequency(semitoneOffset, 1);
        return this.play(pos, volume, pitch, 0);
    }

    /** Get how long this sound is in seconds
     *  @return {number} - How long the sound is in seconds (undefined if loading)
     */
    getDuration()
    { return this.sampleChannels && this.sampleRate ? this.sampleChannels[0].length / this.sampleRate : 0; }

    /** Check if sound is loaded, for sounds fetched from a url
     *  @return {boolean} - True if sound is loaded and ready to play
     */
    isLoaded() { return this.loadedPercent === 1; }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Sound Wave Object - Stores a wave sound for later use and can be played positionally
 * - this can be used to play wave, mp3, and ogg files
 * @extends Sound
 * @memberof Audio
 * @example
 * // create a sound
 * const sound_example = new SoundWave('sound.mp3');
 *
 * // play the sound
 * sound_example.play();
 */
class SoundWave extends Sound
{
    /**
     * @callback SoundLoadCallback - Function called when sound is loaded
     * @param {SoundWave} sound
     * @memberof Audio
     */
    
    /** Create a sound object and cache the wave file for later use
     *  @param {string} filename - Filename of audio file to load
     *  @param {number} [randomness] - How much to randomize frequency each time sound plays
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     *  @param {SoundLoadCallback} [onloadCallback] - callback function to call when sound is loaded
     */
    constructor(filename, randomness=0, range, taper, onloadCallback)
    {
        super(undefined, range, taper);
        if (!soundEnable || headlessMode) return;
        ASSERT(!filename || isString(filename), 'filename must be a string');
        ASSERT(isNumber(randomness), 'randomness must be a number');

        /** @property {SoundLoadCallback} - callback function to call when sound is loaded */
        this.onloadCallback = onloadCallback;
        this.randomness = randomness;
        filename && this.loadSound(filename);
    }

    /** Loads a sound from a URL and decodes it into sample data. Must be used with await!
    *  @param {string} filename
    *  @return {Promise<void>} */
    async loadSound(filename)
    {
        const response = await fetch(filename);
        if (!response.ok)
            throw new Error(`Failed to load sound from ${filename}: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // convert audio buffer to sample channels across multiple frames
        const channelCount = audioBuffer.numberOfChannels;
        const samplesPerFrame = 1e5;
        const sampleChannels = [];
        for (let channel = 0; channel < channelCount; channel++)
        {
            const channelData = audioBuffer.getChannelData(channel);
            const channelLength = channelData.length;
            sampleChannels[channel] = new Array(channelLength);
            let sampleIndex = 0;
            while (sampleIndex < channelLength)
            {
                // yield to next frame
                await new Promise(resolve => setTimeout(resolve, 0));

                // copy chunk of samples
                const endIndex = min(sampleIndex + samplesPerFrame, channelLength);
                for (; sampleIndex < endIndex; sampleIndex++)
                    sampleChannels[channel][sampleIndex] = channelData[sampleIndex];

                // update loaded percent
                const samplesTotal = channelCount * channelLength;
                const samplesProcessed = channel * channelLength + sampleIndex;
                this.loadedPercent = samplesProcessed / samplesTotal;
            }
        }
        
        // setup the sound to be played
        this.sampleRate = audioBuffer.sampleRate;
        this.sampleChannels = sampleChannels;
        this.loadedPercent = 1;
        if (this.onloadCallback)
            this.onloadCallback(this);
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
 * instance.unpause();
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
        // setup end callback and start sound
        this.onendedCallback = (source)=>
        {
            if (source === this.source)
                this.source = undefined;
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
        this.source = playSamples(this.sound.sampleChannels, this.volume, this.rate, this.pan, this.loop, this.sound.sampleRate, this.gainNode, offset, this.onendedCallback);
        if (this.source)
        {
            this.startTime = audioContext.currentTime - offset;
            this.pausedTime = undefined;
        }
        else
        {
            this.startTime = undefined;
            this.pausedTime = 0;
        }
    }

    /** Set the volume of this sound instance
     *  @param {number} volume */
    setVolume(volume)
    {
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        this.volume = volume;
        if (this.gainNode)
            this.gainNode.gain.value = volume;
    }

    /** Stop this sound instance and reset position to the start */
    stop(fadeTime=0)
    {
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        if (this.isPlaying())
        {
            if (fadeTime)
            {
                // ramp off gain
                const startFade = audioContext.currentTime;
                const endFade = startFade + fadeTime;
                this.gainNode.gain.linearRampToValueAtTime(1, startFade);
                this.gainNode.gain.linearRampToValueAtTime(0, endFade);
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
        if (this.isPaused())
            return;

        // save current time and stop sound
        this.pausedTime = this.getCurrentTime();
        this.source.stop();
        this.source = undefined;
        this.startTime = undefined;
    }

    /** Unpauses this sound instance */
    resume()
    {
        if (!this.isPaused())
            return;
        
        // restart sound from paused time
        this.start(this.pausedTime);
    }

    /** Check if this instance is currently playing
     *  @return {boolean} - True if playing
     */
    isPlaying() { return !!this.source; }

    /** Check if this instance is paused and was not stopped
     *  @return {boolean} - True if paused
     */
    isPaused() { return !this.isPlaying(); }

    /** Get the current playback time in seconds
     *  @return {number} - Current playback time
     */
    getCurrentTime()
    {
        const deltaTime = mod(audioContext.currentTime - this.startTime, 
            this.getDuration());
        return this.isPlaying() ? deltaTime : this.pausedTime;
    }

    /** Get the total duration of this sound
     *  @return {number} - Total duration in seconds
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
 *  @param {string} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @param {number} [volume] - How much to scale volume by
 *  @param {number} [rate] - How quickly to speak
 *  @param {number} [pitch] - How much to change the pitch by
 *  @return {SpeechSynthesisUtterance} - The utterance that was spoken
 *  @memberof Audio */
function speak(text, language='', volume=1, rate=1, pitch=1)
{
    if (!soundEnable || headlessMode) return;
    if (!speechSynthesis) return;

    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean

    // build utterance and speak
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = 2*volume*soundVolume;
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
    return utterance;
}

/** Stop all queued speech
 *  @memberof Audio */
function speakStop() {speechSynthesis && speechSynthesis.cancel();}

/** Get frequency of a note on a musical scale
 *  @param {number} semitoneOffset - How many semitones away from the root note
 *  @param {number} [rootFrequency=220] - Frequency at semitone offset 0
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
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing
 *  @param {number}   [offset] - Offset in seconds to start playback from
 *  @param {AudioEndedCallback} [onended] - Callback for when the sound ends
 *  @return {AudioBufferSourceNode} - The source node of the sound played, may be undefined if play fails
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=audioDefaultSampleRate, gainNode, offset=0, onended)
{
    if (!soundEnable || headlessMode) return;

    if (!audioIsRunning())
    {
        // fix stalled audio, this sound won't be able to play
        audioContext.resume();
        return;
    }

    // create buffer and source
    const channelCount = sampleChannels.length;
    const sampleLength = sampleChannels[0].length;
    const buffer = audioContext.createBuffer(channelCount, sampleLength, sampleRate);
    const source = audioContext.createBufferSource();

    // copy samples to buffer and setup source
    sampleChannels.forEach((c,i)=> buffer.getChannelData(i).set(c));
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    // create and connect gain node
    gainNode = gainNode || audioContext.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(audioMasterGain);

    // connect source to stereo panner and gain
    const pannerNode = new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)});
    source.connect(pannerNode).connect(gainNode);

    // callback when the sound ends
    if (onended)
        source.addEventListener('ended', ()=> onended(source));

    // play and return sound
    const startOffset = offset * rate;
    source.start(0, startOffset);
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
 * - Caches arrays of tiles to off screen canvas for fast rendering
 * - Unlimited numbers of layers, allocates canvases as needed
 * - Tile layers can be drawn to using their context with canvas2d
 * - Tile layers can also have collision with EngineObjects
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
*  @return {number}
*  @memberof TileLayers */
function tileCollisionGetData(pos)
{
    // check all tile collision layers
    for (const layer of tileCollisionLayers)
        if (pos.arrayCheck(layer.size))
            return layer.getCollisionData(pos);
    return 0;
}

/** Check if a tile layer collides with another object
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=(0,0)]
 *  @param {EngineObject} [object] - An object or undefined for generic test
 *  @param {boolean}      [solidOnly] - Only check solid layers if true
 *  @return {TileCollisionLayer}
 *  @memberof TileLayers */
function tileCollisionTest(pos, size=vec2(), object, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        if (layer.collisionTest(pos, size, object))
            return layer;
    }
}

/** Return the exact position of the boudnary of first tile hit, undefined if nothing was hit.
 *  The point will be inside the colliding tile if it hits (may have a tiny shift)
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object] - An object or undefined for generic test
 *  @param {Vector2}      [normal] - Optional normal of the surface hit
 *  @param {boolean}      [solidOnly=true] - Only check solid layers if true
 *  @return {Vector2|undefined} - position of the center of the tile hit or undefined if no hit
 *  @memberof TileLayers */
function tileCollisionRaycast(posStart, posEnd, object, normal, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        {
            const hitPos = layer.collisionRaycast(posStart, posEnd, object, normal)
            if (hitPos) return hitPos;
        }
    }
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
     *  @param {number}  [tile]      - The tile to use, untextured if undefined
     *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {boolean} [mirror]    - If the tile should be mirrored along the x axis
     *  @param {Color}   [color]     - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {number}  - The tile to use, untextured if undefined */
        this.tile      = tile;
        /** @property {number}  - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        this.mirror    = mirror;
        /** @property {Color}   - Color of the tile */
        this.color     = color.copy();
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Canvas Layer - cached off screen rendering system
 * - Contains an offscreen canvas that can be rendered to
 * - WebGL rendering is optional, call useWebGL to enable
 * @extends EngineObject
 * @memberof TileLayers
 * @example
 * const canvasLayer = new CanvasLayer(vec2(), vec2(200,100));
 */
class CanvasLayer extends EngineObject
{
    /** Create a canvas layer object
     *  @param {Vector2}  [position] - World space position of the layer
     *  @param {Vector2}  [size] - World space size of the layer
     *  @param {number}   [angle] - Angle the layer is rotated by
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder
     *  @param {Vector2}  [canvasSize] - Default size of canvas, can be changed later
    */
    constructor(position, size, angle=0, renderOrder=0, canvasSize=vec2(512))
    {
        ASSERT(isVector2(canvasSize), 'canvasSize must be a Vector2');
        super(position, size, undefined, angle, WHITE, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this layer */
        this.canvas = headlessMode ? undefined : new OffscreenCanvas(canvasSize.x, canvasSize.y);
        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this layer */
        this.context = this.canvas?.getContext('2d');
        /** @property {TextureInfo} - Texture info to use for this object rendering */
        const useWebGL = false; // do not use webgl by default
        this.textureInfo = new TextureInfo(this.canvas, useWebGL);
        /** @property {boolean} - True if WebGL texture needs to be refreshed */
        this.refreshWebGL = false;

        // disable physics by default
        this.mass = this.gravityScale = this.friction = this.restitution = 0;
    }

    /** Destroy this canvas layer */
    destroy()
    {
        if (this.destroyed)
            return;

        this.textureInfo.destroyWebGLTexture();
        super.destroy();
    }

    // Render the layer, called automatically by the engine
    render()
    {
        this.draw(this.pos, this.size, this.angle, this.color, this.mirror, this.additiveColor);
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
    draw(pos, size, angle=0, color=WHITE, mirror=false, additiveColor, screenSpace=false, context)
    {
        const useWebGL = glEnable && this.textureInfo.hasWebGL();
        if (useWebGL && this.refreshWebGL)
        {
            // update the WebGL texture
            this.textureInfo.createWebGLTexture();
            this.refreshWebGL = false;
        }

        // draw the canvas layer as a single tile that uses the whole texture
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor, useWebGL, screenSpace, context);
    }

    /**
     * @callback Canvas2DDrawCallback - Function that draws to a canvas 2D context
     * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
     * @memberof TileLayers
     */

    /** Draw onto the layer canvas in world space (bypass WebGL)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {number}   angle
     *  @param {boolean}  mirror
     *  @param {Canvas2DDrawCallback} drawFunction */
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
        if (!this.context) return;

        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileInfo.size);
        size = size.multiply(this.tileInfo.size);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror ? -size.x : size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    /** Draw a tile onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=(1,1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=(1,1,1,1)]
     *  @param {number}   [angle=0]
     *  @param {boolean}  [mirror=false] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            const textureInfo = tileInfo && tileInfo.textureInfo;
            if (textureInfo)
            {
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(textureInfo.image,
                    tileInfo.pos.x,  tileInfo.pos.y,
                    tileInfo.size.x, tileInfo.size.y, -.5, -.5, 1, 1);
                context.globalAlpha = 1;
            }
            else
            {
                // untextured
                context.fillStyle = color.toString();
                context.fillRect(-.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=(1,1)]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [angle=0] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }

    /** Create or update the WebGL texture for this layer
     *  @param {boolean} [enable] - enable WebGL rendering and update the texture 
     *  @param {boolean} [immediate] - shoulkd the texture be updated immediately
     */
    useWebGL(enable=true, immediate=false)
    {
        if (!immediate && enable && this.textureInfo.hasWebGL())
        {
            // refresh the texture when needed
            this.refreshWebGL = true;
            return;
        }

        if (enable)
            this.textureInfo.createWebGLTexture();
        else
            this.textureInfo.destroyWebGLTexture();
    }
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
    *  @param {Vector2}  position      - World space position
    *  @param {Vector2}  size          - World space size
    *  @param {TileInfo} [tileInfo]    - Default tile info for layer (used for size and texture)
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        const canvasSize = tileInfo ? size.multiply(tileInfo.size) : size;
        super(position, size, 0, renderOrder, canvasSize);

        // set tile info
        this.tileInfo = tileInfo;

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData);

        if (headlessMode)
        {
            // disable rendering
            this.redraw       = () => {};
            this.render       = () => {};
            this.redrawStart  = () => {};
            this.redrawEnd    = () => {};
            this.drawTileData = () => {};
            this.drawCanvas2D = () => {};
            this.useWebGL     = () => {};
        }
    }

    /** Set data at a given position in the array
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data     - Data to set
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        ASSERT(data instanceof TileLayerData, 'data must be a TileLayerData');
        if (layerPos.arrayCheck(this.size))
        {
            this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;
            redraw && this.drawTileData(layerPos);
        }
    }

    /** Get data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData} */
    getData(layerPos)
    { 
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; 
    }

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(drawContext !== this.context, 'must call redrawEnd() after drawing tiles!');

        if (this.refreshWebGL)
        {
            // update the WebGL texture
            this.textureInfo.createWebGLTexture();
            this.refreshWebGL = false;
        }

        // draw the tile layer as a single tile
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        const size = this.drawSize || this.size;
        const pos = this.pos.add(size.scale(.5));
        const useWebGL = glEnable && this.textureInfo.hasWebGL();
        drawTile(pos, size, tileInfo, WHITE, 0, false, CLEAR_BLACK, useWebGL);
    }

    /** Draw all the tile data to an offscreen canvas
     *  - This may be slow in some browsers but only needs to be done once */
    redraw()
    {
        this.redrawStart(true);
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
            this.drawTileData(vec2(x,y), false);
        this.redrawEnd();
        this.useWebGL();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update small parts of the level
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        if (!this.context) return;

        // save current render settings
        /** @type {[HTMLCanvasElement|OffscreenCanvas, CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D, Vector2, Vector2, number]} */
        this.savedRenderSettings = [drawCanvas, drawContext, mainCanvasSize, cameraPos, cameraScale];

        // set the draw canvas and context to this layer
        // use camera settings to match this layer's canvas
        drawCanvas = this.canvas;
        drawContext = this.context;
        cameraPos = this.size.scale(.5);
        const tileSize = this.tileInfo ? this.tileInfo.size : vec2(1);
        cameraScale = tileSize.x;
        mainCanvasSize = this.size.multiply(tileSize);
        if (clear)
        {
            // clear and set size
            drawCanvas.width  = mainCanvasSize.x;
            drawCanvas.height = mainCanvasSize.y;
        }

        // disable smoothing for pixel art
        this.context.imageSmoothingEnabled = !tilesPixelated;

        // setup gl rendering if enabled
        glPreRender();
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        if (!this.context) return;

        ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
        glCopyToContext(drawContext);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [drawCanvas, drawContext, mainCanvasSize, cameraPos, cameraScale] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile grid
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        
        // clear out where the tile was, for full opaque tiles this can be skipped
        const s = this.tileInfo.size;
        if (clear)
        {
            const pos = layerPos.multiply(s);
            this.context.clearRect(pos.x, this.canvas.height-pos.y, s.x, -s.y);
        }

        // draw the tile if it has layer data
        const d = this.getData(layerPos);
        if (d.tile !== undefined)
        {
            ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
            const pos = layerPos.add(vec2(.5));
            const tileInfo = tile(d.tile, s, this.tileInfo.textureIndex, this.tileInfo.padding);
            drawTile(pos, vec2(1), tileInfo, d.color, d.direction*PI/2, d.mirror);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Collision Layer - a tile layer with collision
 * - adds collision data and functions to TileLayer
 * - there can be multiple tile collision layers
 * - tile collision layers should not overlap each other
 * @extends TileLayer
 * @memberof TileLayers
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  position      - World space position
    *  @param {Vector2}  size          - World space size
    *  @param {TileInfo} [tileInfo]    - Tile info for layer
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        super(position, size.floor(), tileInfo, renderOrder);

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
        if (this.destroyed)
            return;

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

    /** Set tile collision data for a given cell in the grid
    *  @param {Vector2} gridPos
    *  @param {number}  [data] */
    setCollisionData(gridPos, data=1)
    {
        ASSERT(isVector2(gridPos), 'gridPos must be a Vector2');
        const i = (gridPos.y|0)*this.size.x + gridPos.x|0;
        gridPos.arrayCheck(this.size) && (this.collisionData[i] = data);
    }

    /** Get tile collision data for a given cell in the grid
    *  @param {Vector2} gridPos
    *  @return {number} */
    getCollisionData(gridPos)
    {
        ASSERT(isVector2(gridPos), 'gridPos must be a Vector2');
        const i = (gridPos.y|0)*this.size.x + gridPos.x|0;
        return gridPos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=(0,0)]
    *  @param {EngineObject} [object]
    *  @return {boolean} */
    collisionTest(pos, size=new Vector2, object)
    {
        ASSERT(isVector2(pos) && isVector2(size), 'pos and size must be Vector2s');
        ASSERT(!object || object instanceof EngineObject, 'object must be an EngineObject');
        
        // transform to local layer space
        const posX = pos.x - this.pos.x;
        const posY = pos.y - this.pos.y;

        // check any tiles in the area for collision
        const minX = max(posX - size.x/2|0, 0);
        const minY = max(posY - size.y/2|0, 0);
        const maxX = min(posX + size.x/2, this.size.x);
        const maxY = min(posY + size.y/2, this.size.y);
        const hitPos = new Vector2;
        for (let y = minY; y < maxY; ++y)
        for (let x = minX; x < maxX; ++x)
        {
            // check if the object should collide with this tile
            const tileData = this.collisionData[y*this.size.x+x];
            if (tileData)
            if (!object || object.collideWithTile(tileData, 
                hitPos.set(x + this.pos.x, y + this.pos.y)))
                return true;
        }
        return false;
    }

    /** Return the exact position of the boudnary of first tile hit, undefined if nothing was hit.
    *  The point will be inside the colliding tile if it hits (may have a tiny shift)
    *  @param {Vector2}      posStart
    *  @param {Vector2}      posEnd
    *  @param {EngineObject} [object] - An object or undefined for generic test
    *  @param {Vector2}      [normal] - Optional normal of the surface hit
    *  @return {Vector2|undefined} */
    collisionRaycast(posStart, posEnd, object, normal)
    {
        ASSERT(isVector2(posStart) && isVector2(posEnd), 'positions must be Vector2s');
        ASSERT(!object || object instanceof EngineObject, 'object must be an EngineObject');

        const localPos = new Vector2;
        const collisionTest = (pos)=>
        {
            // check for tile collision
            localPos.set(pos.x - this.pos.x, pos.y - this.pos.y);
            const tileData = this.getCollisionData(localPos);
            return tileData && (!object || object.collideWithTile(tileData, pos));
        }
        debugRaycast && debugLine(posStart, posEnd, '#00f', .02);
        const hitPos = lineTest(posStart, posEnd, collisionTest, normal);
        if (hitPos)
        {
            const tilePos = hitPos.floor().add(vec2(.5));
            debugRaycast && debugRect(tilePos, vec2(1), '#f008');
            debugRaycast && debugLine(posStart, hitPos, '#f00', .02);
            debugRaycast && debugPoint(hitPos, '#0f0');
            debugRaycast && normal && 
                debugLine(hitPos, hitPos.add(normal), '#ff0', .02);
            return hitPos;
        }
    }
}
/**
 * LittleJS Particle System
 */

/**
 *  @callback ParticleCallbackFunction - Function that processes a particle
 *  @param {Particle} particle
 *  @memberof Engine
 */

/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @memberof Engine
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
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate,
 *     .5, 1                // randomness, collide, additive, randomColorLinear, renderOrder
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} position - World space position of the emitter
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
     *  @param {number} [speed]             - How fast are particles when spawned
     *  @param {number} [angleSpeed]        - How fast are particles rotating
     *  @param {number} [damping]           - How much to dampen particle speed
     *  @param {number} [angleDamping]      - How much to dampen particle angular speed
     *  @param {number} [gravityScale]      - How much gravity effect particles
     *  @param {number} [particleConeAngle] - Cone for start particle angle
     *  @param {number} [fadeRate]          - How quick to fade particles at start/end in percent of life
     *  @param {number} [randomness]    - Apply extra randomness percent
     *  @param {boolean} [collideTiles] - Do particles collide against tiles
     *  @param {boolean} [additive]     - Should particles use additive blend
     *  @param {boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
     */
    constructor
    (
        position,
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
        super(position, vec2(), tileInfo, angle, undefined, renderOrder);

        // emitter settings
        /** @property {number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        this.emitSize = emitSize instanceof Vector2 ? 
            emitSize.copy() : emitSize;
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
        this.colorEndA   = colorEndA.copy();
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB   = colorEndB.copy();
        /** @property {boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {number} - How fast are particles when spawned */
        this.speed             = speed;
        /** @property {number} - How fast are particles rotating */
        this.angleSpeed        = angleSpeed;
        /** @property {number} - How much to dampen particle speed */
        this.damping           = damping;
        /** @property {number} - How much to dampen particle angular speed */
        this.angleDamping      = angleDamping;
        /** @property {number} - How much gravity affects particles */
        this.gravityScale      = gravityScale;
        /** @property {number} - Cone for start particle angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {number} - How quick to fade in particles at start/end in percent of life */
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
        /** @property {ParticleCallbackFunction} - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {ParticleCallbackFunction} - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {number} - Track particle emit time */
        this.emitTimeBuffer    = 0;
        /** @property {number} - Percentage of velocity to pass to particles (0-1) */
        this.velocityInheritance = 0;

        // track previous position and angle
        this.previousAngle = this.angle;
        this.previousPos = this.pos.copy();
    }

    /** Emitters do not have physics */
    updatePhysics() {}

    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
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
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate && particleEmitRateScale)
            {
                const rate = 1/this.emitRate/particleEmitRateScale;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        if (debugParticles)
        {
            // show emitter bounds
            const emitSize = typeof this.emitSize === 'number' ? vec2(this.emitSize) : this.emitSize;
            debugRect(this.pos, emitSize, '#0f0', 0, this.angle);
        }
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = typeof this.emitSize === 'number' ? // check if number was used
            randInCircle(this.emitSize/2)            // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5))       // box emitter
                .multiply(this.emitSize).rotate(this.angle)
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            pos = this.pos.add(pos);
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
        const particle = new Particle(pos, this.tileInfo, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, this.fadeRate, this.additive,  this.trailScale, this.localSpace && this, this.particleDestroyCallback);
        particle.velocity      = vec2().setAngle(velocityAngle, speed);
        particle.angleVelocity = angleSpeed;
        if (!this.localSpace && this.velocityInheritance > 0)
        {
            // apply emitter velocity to particle
            particle.velocity.x += this.velocity.x;
            particle.velocity.y += this.velocity.y;
            particle.angleVelocity += this.angleVelocity;
        }
        particle.fadeRate      = this.fadeRate;
        particle.damping       = this.damping;
        particle.angleDamping  = this.angleDamping;
        particle.restitution   = this.restitution;
        particle.friction      = this.friction;
        particle.gravityScale  = this.gravityScale;
        particle.collideTiles  = this.collideTiles;
        particle.renderOrder   = this.renderOrder;
        particle.mirror        = randBool();

        // call particle create callback
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    // Particle emitters are not rendered, only the particles are
    render() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Particle Object - Created automatically by Particle Emitters
 * @extends EngineObject
 * @memberof Engine
 */
class Particle extends EngineObject
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {Vector2}  position   - World space position of the particle
     * @param {TileInfo} tileInfo   - Tile info to render particles
     * @param {number}   angle      - Angle to rotate the particle
     * @param {Color}    colorStart - Color at start of life
     * @param {Color}    colorEnd   - Color at end of life
     * @param {number}   lifeTime   - How long to live for
     * @param {number}   sizeStart  - Size at start of life
     * @param {number}   sizeEnd    - Size at end of life
     * @param {number}   fadeRate   - How quick to fade in/out
     * @param {boolean}  additive   - Does it use additive blend mode
     * @param {number}   trailScale - If a trail, how long to make it
     * @param {ParticleEmitter} [localSpaceEmitter] - Parent emitter if local space
     * @param {ParticleCallbackFunction} [destroyCallback] - Callback when particle dies
     */
    constructor(position, tileInfo, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, fadeRate, additive, trailScale, localSpaceEmitter, destroyCallback
    )
    {
        super(position, vec2(), tileInfo, angle);

        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Color at end of life */
        this.colorEnd = colorEnd;
        /** @property {number} - How long to live for */
        this.lifeTime = lifeTime;
        /** @property {number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {number} - How quick to fade in/out */
        this.fadeRate = fadeRate;
        /** @property {boolean} - Is it additive */
        this.additive = additive;
        /** @property {number} - If a trail, how long to make it */
        this.trailScale = trailScale;
        /** @property {ParticleEmitter} - Parent emitter if local space */
        this.localSpaceEmitter = localSpaceEmitter;
        /** @property {ParticleCallbackFunction} - Called when particle dies */
        this.destroyCallback = destroyCallback;
        // particles do not clamp speed by default
        this.clampSpeed = false;
    }

    /** Update the object physics, called automatically by engine once each frame */
    update()
    {
        if (this.collideTiles || this.collideSolidObjects)
        {
            // only apply max circular speed if particle can collide
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }

        if (this.lifeTime > 0 && time - this.spawnTime > this.lifeTime)
        {
            // destroy particle when its time runs out
            const c = this.colorEnd;
            this.color.set(c.r, c.g, c.b, c.a);
            this.size.set(this.sizeEnd, this.sizeEnd);
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    }

    /** Render the particle, automatically called each frame, sorted by renderOrder */
    render()
    {
        // lerp color and size
        const p1 = this.lifeTime > 0 ? min((time - this.spawnTime) / this.lifeTime, 1) : 1, p2 = 1-p1;
        const radius = p2 * this.sizeStart + p1 * this.sizeEnd;
        const size = vec2(radius);
        this.color.r = p2 * this.colorStart.r + p1 * this.colorEnd.r;
        this.color.g = p2 * this.colorStart.g + p1 * this.colorEnd.g;
        this.color.b = p2 * this.colorStart.b + p1 * this.colorEnd.b;
        this.color.a = p2 * this.colorStart.a + p1 * this.colorEnd.a;
            
        // fade alpha
        const fadeRate = this.fadeRate/2;
        this.color.a *= p1 < fadeRate ? p1/fadeRate : 
            p1 > 1-fadeRate ? (1-p1)/fadeRate : 1;

        // draw the particle
        this.additive && setBlendMode(true);

        // update the position and angle for drawing
        let pos = this.pos, angle = this.angle;
        if (this.localSpaceEmitter)
        {
            // in local space of emitter
            const a = this.localSpaceEmitter.angle;
            const c = cos(a), s = sin(a);
            pos = this.localSpaceEmitter.pos.add(
                new Vector2(pos.x*c - pos.y*s, pos.x*s + pos.y*c));
            angle += this.localSpaceEmitter.angle;
        }
        if (this.trailScale)
        {
            // trail style particles
            const direction = this.localSpaceEmitter ? 
                this.velocity.rotate(-this.localSpaceEmitter.angle) :
                this.velocity;
            const speed = direction.length();
            if (speed)
            {
                // stretch in direction of motion
                const trailLength = speed * this.trailScale;
                size.y = max(size.x, trailLength);
                angle = atan2(direction.x, direction.y);
                drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
        this.additive && setBlendMode();
        debugParticles && debugRect(pos, size, '#f005', 0, angle);
    }
}
/**
 * LittleJS Medal System
 * - Tracks and displays medals
 * - Saves medals to local storage
 * - Newgrounds integration
 * @namespace Medals
 */

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
        medalsForEach(medal=> medal.unlocked = !!localStorage[medal.storageKey()]);

    // engine automatically renders medals
    engineAddPlugin(undefined, medalsRender);
    function medalsRender()
    {
        if (!medalsDisplayQueue.length)
            return;

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

        // load the source image if provided
        if (src)
            (this.image = new Image).src = src;

        // add this to list of medals
        medals[id] = this;
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal
        ASSERT(medalsSaveName, 'save name must be set');
        localStorage[this.storageKey()] = this.unlocked = true;
        medalsDisplayQueue.push(this);
    }

    /** Render a medal
     *  @param {number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const width = min(medalDisplaySize.x, mainCanvas.width);
        const height = medalDisplaySize.y;
        const x = overlayCanvas.width - width;
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
            overlayContext.drawImage(this.image, pos.x-size/2, pos.y-size/2, size, size);
        else
            drawTextScreen(this.icon, pos, size*.7, BLACK);
    }

    // Get local storage key used by the medal
    storageKey() { return medalsSaveName + '_' + this.id; }
}
/**
 * LittleJS WebGL Interface
 * - All WebGL used by the engine is wrapped up here
 * - Will fall back to 2D canvas rendering if WebGL is not supported
 * - For normal stuff you won't need to see or call anything in this file
 * - For advanced stuff there are helper functions to create shaders, textures, etc
 * - Can be disabled with glEnable to revert to 2D canvas rendering
 * - Batches sprite rendering on GPU for incredibly fast performance
 * - Sprite transform math is done in the shader where possible
 * - Supports shadertoy style post processing shaders via plugin
 * @namespace WebGL
 */

/** The WebGL canvas which appears above the main canvas and below the overlay canvas
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
let glShader, glPolyShader, glPolyMode, glAdditive, glBatchAdditive, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glBatchCount, glTextureInfos, glCanBeEnabled = true;

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
function glInit()
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

    // attach the WebGL canvas
    const rootElement = mainCanvas.parentElement;
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
            info.glTexture = glCreateTexture(info.image);
        pluginList.forEach(plugin=>plugin.glContextRestored?.());
    });

    function initWebGL()
    {
        // setup instanced rendering shader program
        glShader = glCreateProgram(
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for better accuracy
            'uniform mat4 m;'+        // transform matrix
            'in vec2 g;'+             // in: geometry
            'in vec4 p,u,c,a;'+       // in: position/size, uvs, color, additiveColor
            'in float r;'+            // in: rotation
            'out vec2 v;'+            // out: uv
            'out vec4 d,e;'+          // out: color, additiveColor
            'void main(){'+           // shader entry point
            'vec2 s=(g-.5)*p.zw;'+    // get size offset
            'gl_Position=m*vec4(p.xy+s*cos(r)-vec2(-s.y,s)*sin(r),1,1);'+ // transform position
            'v=mix(u.xw,u.zy,g);'+    // pass uv to fragment shader
            'd=c;e=a;'+               // pass colors to fragment shader
            '}'                       // end of shader
            ,
            '#version 300 es\n' +     // specify GLSL ES version
            'precision highp float;'+ // use highp for better accuracy
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

        // create the geometry buffer, triangle strip square
        const geometry = new Float32Array([glBatchCount=0,0,1,0,0,1,1,1]);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, geometry, glContext.STATIC_DRAW);
    }
}

function glSetInstancedMode()
{
    if (!glPolyMode)
        return;
    
    // setup instanced mode
    glFlush();
    glPolyMode = false;
    glContext.useProgram(glShader);

    // set vertex attributes
    let offset = 0;
    const initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        const stride = typeSize && gl_INSTANCE_BYTE_STRIDE; // only if not geometry
        const divisor = typeSize && 1; // only if not geometry
        const normalize = typeSize === 1; // only if color
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, divisor);
        offset += size*typeSize;
    }
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
    initVertexAttribArray('g', glContext.FLOAT, 0, 2); // geometry
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
    initVertexAttribArray('p', glContext.FLOAT, 4, 4); // position & size
    initVertexAttribArray('u', glContext.FLOAT, 4, 4); // texture coords
    initVertexAttribArray('c', glContext.UNSIGNED_BYTE, 1, 4); // color
    initVertexAttribArray('a', glContext.UNSIGNED_BYTE, 1, 4); // additiveColor
    initVertexAttribArray('r', glContext.FLOAT, 4, 1); // rotation
}

function glSetPolyMode()
{
    if (glPolyMode)
        return;
    
    // setup poly mode
    glFlush();
    glPolyMode = true;
    glContext.useProgram(glPolyShader);

    // set vertex attributes
    let offset = 0;
    const initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glPolyShader, name);
        const normalize = typeSize === 1; // only normalize if color
        const stride = gl_POLY_VERTEX_BYTE_STRIDE;
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, 0);
        offset += size*typeSize;
    }
    glContext.bindBuffer(glContext.ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, gl_ARRAY_BUFFER_SIZE, glContext.DYNAMIC_DRAW);
    initVertexAttribArray('p', glContext.FLOAT, 4, 2);         // position
    initVertexAttribArray('c', glContext.UNSIGNED_BYTE, 1, 4); // color
}

// Setup WebGL render each frame, called automatically by engine
// Also used by tile layer rendering when redrawing tiles
function glPreRender()
{
    if (!glEnable || !glContext) return;

    // clear the canvas
    glClearCanvas();

    // build the transform matrix
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

    // set the same transform matrix for both shaders
    const initUniform = (program, uniform, value) =>
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

    // start with additive blending off
    glAdditive = glBatchAdditive = false;

    // force it to set instanced mode by first setting poly mode true
    glPolyMode = true;
    glSetInstancedMode();
}

/** Clear the canvas and setup the viewport
 *  @memberof WebGL */
function glClearCanvas()
{
    if (!glContext) return;

    // clear and set to same size as main canvas
    glCanvas.width = drawCanvas.width;
    glCanvas.height = drawCanvas.height;
    glContext.viewport(0, 0, glCanvas.width, glCanvas.height);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
}

/** Set the WebGL texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @param {boolean} [wrap] - Should the texture wrap or clamp
 *  @memberof WebGL */
function glSetTexture(texture, wrap=false)
{
    // must flush cache with the old texture to set a new one
    if (!glContext || texture === glActiveTexture)
        return;

    glFlush();
    glActiveTexture = texture;
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture);

    // set wrap mode
    const wrapMode = wrap ? glContext.REPEAT : glContext.CLAMP_TO_EDGE;
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, wrapMode);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, wrapMode);
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

/** Create WebGL texture from an image and init the texture settings
 *  Restores the active texture when done
 *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} [image]
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    if (!glContext) return;

    // build the texture
    const texture = glContext.createTexture();
    let mipMap = false;
    if (image && image.width)
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
    if (mipMap)
        glContext.generateMipmap(glContext.TEXTURE_2D);
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture); // rebind active texture
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
    ASSERT(!!image && image.width > 0, 'Invalid image data.');
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, image);
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture); // rebind active texture
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
        textureInfo.glTexture = glCreateTexture(textureInfo.image);
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
        // set bend mode
        const destBlend = glBatchAdditive ? glContext.ONE : glContext.ONE_MINUS_SRC_ALPHA;
        glContext.blendFuncSeparate(glContext.SRC_ALPHA, destBlend, glContext.ONE, destBlend);
        glContext.enable(glContext.BLEND);
        
        const byteLength = glBatchCount * 
            (glPolyMode ? gl_INDICES_PER_POLY_VERTEX : gl_INDICES_PER_INSTANCE);
        glContext.bufferSubData(glContext.ARRAY_BUFFER, 0, glPositionData, 0, byteLength);
        
        // draw the batch
        if (glPolyMode)
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, glBatchCount);
        else
            glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, glBatchCount);
        drawCount += glBatchCount;
        glBatchCount = 0;
    }
    glBatchAdditive = glAdditive;
}

/** Flush any sprites still in the buffer and copy to main canvas
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @memberof WebGL */
function glCopyToContext(context)
{
    if (!glEnable || !glContext)
        return;

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
    if (glBatchCount >= gl_MAX_INSTANCES || glBatchAdditive !== glAdditive)
        glFlush();
    glSetInstancedMode();

    glPolyMode = false;
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
    for (const p of points)
    {
        // transform the point
        const px = p.x*sx;
        const py = p.y*sy;
        const sa = sin(-angle);
        const ca = cos(-angle);
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

// WebGL internal function to convert polygon to outline triangle strip
function glMakeOutline(points, width, wrap=true)
{
    if (points.length < 2)
        return [];
    
    const halfWidth = width / 2;
    const strip = [];
    const n = points.length;
    const e = 1e-6;
    const miterLimit = width*100;
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

    // ensure counter-clockwise winding
    if (signedArea(points) < 0)
        points = points.reverse();

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
            if (cross(a, b, c) < e)
                continue;
                
            // check if any other point is inside
            let hasInside = false;
            for (let j = 0; j < indices.length; j++)
            {
                const k = indices[j];
                if (k === i0 || k === i1 || k === i2)
                    continue;
                const p = points[k];
                hasInside = pointInTriangle(p, a, b, c);
                if (hasInside)
                    break;
            }
            if (hasInside)
                continue;

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
            if (worstIndex < 0)
                break;
            
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
 * LittleJS Newgrounds Plugin
 * - NewgroundsMedal extends Medal with Newgrounds API functionality
 * - Call new NewgroundsPlugin(app_id) to setup Newgrounds
 * - Uses CryptoJS for encryption if optional cipher is provided
 * - provides functions to interact with medals scoreboards
 * - Keeps connection alive and logs views
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
     *  @param {string} app_id     - The newgrounds App ID
     *  @param {string} [cipher]   - The encryption Key (AES-128/Base64)
     *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher 
     *  @example
     *  // create the newgrounds object, replace the app id with your own
     *  const app_id = 'your_app_id_here';
     *  new NewgroundsPlugin(app_id);
     */
    constructor(app_id, cipher, cryptoJS)
    {
        ASSERT(!newgrounds, 'there can only be one newgrounds object');
        ASSERT(!cipher || cryptoJS, 'must provide cryptojs if there is a cipher');

        newgrounds = this; // set global newgrounds object
        this.app_id = app_id;
        this.cipher = cipher;
        this.cryptoJS = cryptoJS;
        this.host = location ? location.hostname : '';

        // get session id from url search params
        const url = new URL(location.href);
        this.session_id = url.searchParams.get('ngio_session_id');

        if (!this.session_id)
            return; // only use newgrounds when logged in

        // get medals
        const medalsResult = this.call('Medal.getList');
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
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
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && LOG(this.scoreboards);

        // keep the session alive with a ping every minute
        const keepAliveMS = 60 * 1e3;
        setInterval(()=>this.call('Gateway.ping', 0, true), keepAliveMS);
    }

    /** Send message to unlock a medal by id
     * @param {number} id - The medal id */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}, true); }

    /** Send message to post score
     * @param {number} id    - The scoreboard id
     * @param {number} value - The score value */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}, true); }

    /** Get scores from a scoreboard
     * @param {number} id       - The scoreboard id
     * @param {string} [user]   - A user's id or name
     * @param {number} [social] - If true, only social scores will be loaded
     * @param {number} [skip]   - Number of scores to skip over
     * @param {number} [limit]  - Number of scores to include in the list
     * @return {Object}         - The response JSON object
     */
    getScores(id, user, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view */
    logView() { return this.call('App.logView', {'host':this.host}, true); }

    /** Send a message to call a component of the Newgrounds API
     * @param {string}  component    - Name of the component
     * @param {Object}  [parameters] - Parameters to use for call
     * @param {boolean} [async]      - If true, don't wait for response before continuing
     * @return {Object}              - The response JSON object
     */
    call(component, parameters, async=false)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // encrypt using AES-128 Base64 with cryptoJS
            const cryptoJS = this.cryptoJS;
            const aesKey = cryptoJS['enc']['Base64']['parse'](this.cipher);
            const iv = cryptoJS['lib']['WordArray']['random'](16);
            const encrypted = cryptoJS['AES']['encrypt'](JSON.stringify(call), aesKey, {'iv':iv});
            call['secure'] = cryptoJS['enc']['Base64']['stringify'](iv.concat(encrypted['ciphertext']));
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
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';
        xmlHttp.open('POST', url, !debugMedals && async);
        try { xmlHttp.send(formData); }
        catch(e)
        {
            debugMedals && LOG('newgrounds call failed', e);
            return;
        }
        debugMedals && LOG(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
}
/**
 * LittleJS Post Processing Plugin
 * - Supports shadertoy style post processing shaders
 * - call new PostProcessPlugin() to setup post processing
 * - can be enabled to pass other canvases through a final shader
 * @namespace PostProcess
 */

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
    *  @param {boolean} [includeOverlay]
    *  @param {boolean} [includeMainCanvas]
     *  @example
     *  // create the post process plugin object
     *  new PostProcessPlugin(shaderCode);
     */
    constructor(shaderCode, includeOverlay=false, includeMainCanvas=true)
    {
        ASSERT(!postProcess, 'Post process already initialized');
        postProcess = this;

        if (!shaderCode) // default shader pass through
            shaderCode = 'void mainImage(out vec4 c,vec2 p){c=texture(iChannel0,p/iResolution.xy);}';

        /** @property {WebGLProgram} - Shader for post processing */
        this.shader = undefined;

        /** @property {WebGLTexture} - Texture for post processing */
        this.texture = undefined;

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
                'precision highp float;'+        // use highp for better accuracy
                'in vec2 p;'+                    // position
                'void main(){'+                  // shader entry point
                'gl_Position=vec4(p+p-1.,1,1);'+ // set position
                '}'                              // end of shader
                ,
                '#version 300 es\n' +            // specify GLSL ES version
                'precision highp float;'+        // use highp for better accuracy
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
            if (headlessMode) return;

            if (!glEnable)
                return;
            
            // clear out the buffer
            glFlush();
            
            if (includeMainCanvas || includeOverlay)
            {
                // copy WebGL to the main canvas
                mainContext.drawImage(glCanvas, 0, 0);

                if (includeOverlay)
                {
                    // copy overlay canvas so it will be included in post processing
                    mainContext.drawImage(overlayCanvas, 0, 0);
                    overlayCanvas.width |= 0; // clear overlay canvas
                }
            }

            // setup shader program to draw a quad
            glContext.useProgram(postProcess.shader);
            glContext.bindBuffer(glContext.ARRAY_BUFFER, glGeometryBuffer);
            glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, 1);
            glContext.disable(glContext.BLEND);

            // set textures, pass in the 2d canvas and gl canvas in separate texture channels
            glContext.activeTexture(glContext.TEXTURE0);
            glContext.bindTexture(glContext.TEXTURE_2D, postProcess.texture);
            if (includeMainCanvas || includeOverlay)
            {
                glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, mainCanvas);
            }

            // set vertex position attribute
            const vertexByteStride = 8;
            const pLocation = glContext.getAttribLocation(postProcess.shader, 'p');
            glContext.enableVertexAttribArray(pLocation);
            glContext.vertexAttribPointer(pLocation, 2, glContext.FLOAT, false, vertexByteStride, 0);

            // set uniforms and draw
            const uniformLocation = (name)=>glContext.getUniformLocation(postProcess.shader, name);
            glContext.uniform1i(uniformLocation('iChannel0'), 0);
            glContext.uniform1f(uniformLocation('iTime'), time);
            glContext.uniform3f(uniformLocation('iResolution'), mainCanvas.width, mainCanvas.height, 1);
            glContext.drawArrays(glContext.TRIANGLE_STRIP, 0, 4);
        }
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
 * const music_example = new Music(
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
 * // play the music
 * music_example.play();
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
        this.sampleChannels = zzfxM(...zzfxMusic);
        this.sampleRate = audioDefaultSampleRate;
    }

    /** Play the music that loops by default
     *  @param {number}  [volume] - Volume to play the music at
     *  @param {boolean} [loop] - Should the music loop?
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    playMusic(volume=1, loop=true)
    { return super.play(undefined, volume, 1, 0, loop); }
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
    sequence.forEach((patternIndex, sequenceIndex) => {
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
 * LittleJS User Interface Plugin
 * - call new UISystemPlugin() to setup the UI system
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 * @namespace UISystem
 */

///////////////////////////////////////////////////////////////////////////////

/** Global UI system plugin object
 *  @type {UISystemPlugin}
 *  @memberof UISystem */
let uiSystem;

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
    constructor(context=overlayContext)
    {
        ASSERT(!uiSystem, 'UI system already initialized');
        uiSystem = this;

        // default settings
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
        this.defaultTextScale = .8;
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
        /** @property {number} - If set ui coords will be renormalized to this canvas height */
        this.nativeHeight = 0;

        engineAddPlugin(uiUpdate, uiRender);

        // setup recursive update and render
        // update in reverse order to detect mouse enter/leave
        function uiUpdate()
        {
            function updateInvisibleObject(o)
            {
                // update invisible objects
                for (const c of o.children)
                    updateInvisibleObject(c);
                o.updateInvisible();
            }
            function updateObject(o)
            {
                if (o.visible)
                {
                    // set position in parent space
                    if (o.parent)
                        o.pos = o.localPos.add(o.parent.pos);
                    // update in reverse order to detect mouse enter/leave
                    for (let i=o.children.length; i--;)
                        updateObject(o.children[i]);
                    o.update();
                }
                else
                    updateInvisibleObject(o);
            }
            // reset hover object at start of update
            uiSystem.lastHoverObject = uiSystem.hoverObject;
            uiSystem.hoverObject = undefined;

            // update in reverse order so topmost objects get priority
            for (let i = uiSystem.uiObjects.length; i--;)
            {
                const o = uiSystem.uiObjects[i];
                o.parent || updateObject(o)
            }

            // remove destroyed objects
            uiSystem.uiObjects = uiSystem.uiObjects.filter(o=>!o.destroyed);
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
                if (!o.visible)
                    return;
                if (o.parent)
                    o.pos = o.localPos.add(o.parent.pos);
                o.render();
                for (const c of o.children)
                    renderObject(c);
            }
            uiSystem.uiObjects.forEach(o=> o.parent || renderObject(o));
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
        context.shadowColor = '#0000'
        if (lineWidth)
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
    *  @param {boolean}  [mirror] */
    drawTile(pos, size, tileInfo, color=uiSystem.defaultColor, angle=0, mirror=false)
    {
        drawTile(pos, size, tileInfo, color, angle, mirror, CLEAR_BLACK, false, true, uiSystem.uiContext);
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
     */
    drawText(text, pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor, align='center', font=uiSystem.defaultFont, fontStyle='', applyMaxWidth=true, textShadow=undefined)
    {
        if (textShadow)
            drawTextScreen(text, pos.add(textShadow), size.y, BLACK, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, uiSystem.uiContext);
        drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, uiSystem.uiContext);
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
    *  @param {DragAndDropCallback} [onDragOver] - continously when dragging over */
    setupDragAndDrop(onDrop, onDragEnter, onDragLeave, onDragOver)
    {
        function setCallback(callback, listenerType)
        {
            function listener(e) { e.preventDefault(); callback && callback(e); }
            document.addEventListener(listenerType, listener);
        }
        setCallback(onDrop,      'drop');
        setCallback(onDragEnter, 'dragenter');
        setCallback(onDragLeave, 'dragleave');
        setCallback(onDragOver,  'dragover');
    }

    /** Convert a screen space position to native UI position
     *  @param {Vector2} pos
     *  @return {Vector2}
     */
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

    /** Destroy and remove all objects
    *  @memberof Engine */
    destroyObjects()
    {
        for (const o of this.uiObjects)
            o.parent || o.destroy();
        this.uiObjects = this.uiObjects.filter(o=>!o.destroyed);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI Object - Base level object for all UI elements
 * @memberof UISystem */
class UIObject
{
    /** Create a UIObject
     *  @param {Vector2}  [pos=(0,0)]
     *  @param {Vector2}  [size=(1,1)]
     */
    constructor(pos=vec2(), size=vec2())
    {
        ASSERT(isVector2(pos), 'ui object pos must be a vec2');
        ASSERT(isVector2(size), 'ui object size must be a vec2');

        /** @property {Vector2} - Local position of the object */
        this.localPos = pos.copy();
        /** @property {Vector2} - Screen space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - Screen space size of the object */
        this.size = size.copy();
        /** @property {Color} - Color of the object */
        this.color = uiSystem.defaultColor.copy();
        /** @property {Color} - Color of the object when active, uses color if undefined */
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
        /** @property {string} - Font for this objecct */
        this.font = uiSystem.defaultFont;
        /** @property {string} - Font style for this object or undefined */
        this.fontStyle = undefined;
        /** @property {number} - Override for text width */
        this.textWidth = undefined;
        /** @property {number} - Override for text height */
        this.textHeight = undefined;
        /** @property {number} - Scale text to fit in the object */
        this.textScale = uiSystem.defaultTextScale;
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
        this.shadowOffset = uiSystem.defaultShadowOffset.copy();
        uiSystem.uiObjects.push(this);
        
        /** @property {Vector2} - How much to offset the text shadow or undefined */
        this.textShadow = undefined;
    }

    /** Add a child UIObject to this object
     *  @param {UIObject} child
     */
    addChild(child)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
    }

    /** Remove a child UIObject from this object
     *  @param {UIObject} child
     */
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

        // disconnect from parent and destroy children
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
        {
            child.parent = 0;
            child.destroy();
        }
    }
    /** Check if the mouse is overlapping a box in screen space
     *  @return {boolean} - True if overlapping
     */
    isMouseOverlapping()
    {
        if (!mouseInWindow) return false;

        const size = !isTouchDevice ? this.size :
                this.size.add(vec2(this.extraTouchSize || 0));
        const pos = uiSystem.screenToNative(mousePosScreen);
        return isOverlapping(this.pos, size, pos);
    }

    /** Update the object, called automatically by plugin once each frame */
    update()
    {
        // call the custom update callback
        this.onUpdate();

        const wasHover = uiSystem.lastHoverObject === this;
        const isActive = this.isActiveObject();
        const mouseDown = mouseIsDown(0);
        const mousePress = this.dragActivate ? mouseDown : mouseWasPressed(0);
        if (this.canBeHover)
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
                        if (this.soundPress)
                            this.soundPress.play();
                        if (uiSystem.activeObject && !isActive)
                            uiSystem.activeObject.onRelease();
                        uiSystem.activeObject = this;
                    }
                }
                if (!mouseDown && this.isActiveObject() && this.interactive)
                {
                    this.onClick();
                    if (this.soundClick)
                        this.soundClick.play();
                }
            }
            // clear mouse was pressed state even when disabled
            mousePress && inputClearKey(0,0,0,1,0);
        }
        if (isActive)
        if (!mouseDown || (this.dragActivate && !this.isHoverObject()))
        {
            this.onRelease();
            if (this.soundRelease)
                this.soundRelease.play();
            uiSystem.activeObject = undefined;
        }

        // call enter/leave events
        if (this.isHoverObject() !== wasHover)
            this.isHoverObject() ? this.onEnter() : this.onLeave();
    }

    /** Render the object, called automatically by plugin once each frame */
    render()
    {
        if (!this.size.x || !this.size.y) return;

        const lineColor = this.interactive && this.isActiveObject() && !this.disabled ? this.color : this.lineColor;
        const color = this.disabled ? this.disabledColor : this.interactive ? this.isActiveObject() ? this.activeColor || this.color : this.isHoverObject() ? this.hoverColor : this.color : this.color;
        uiSystem.drawRect(this.pos, this.size, color, this.lineWidth, lineColor, this.cornerRadius, this.gradientColor, this.shadowColor, this.shadowBlur, this.shadowOffset);
    }

    /** Special update when object is not visible */
    updateInvisible()
    {
        // reset input state when not visible
        if (this.isActiveObject())
            uiSystem.activeObject = undefined;
    }

    /** Get the size for text with overrides and scale
     *  @return {Vector2}
     */
    getTextSize()
    {
        return vec2(
            this.textWidth  || this.textScale * this.size.x, 
            this.textHeight || this.textScale * this.size.y);
    }

    /** @return {boolean} - Is the mouse hovering over this element */
    isHoverObject() { return uiSystem.hoverObject === this; }

    /** @return {boolean} - Is the mouse held onto this element */
    isActiveObject() { return uiSystem.activeObject === this; }

    /** Called each frame when object updates */
    onUpdate() {}

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

        ASSERT(isString(text), 'ui text must be a string');
        ASSERT(['left','center','right'].includes(align), 'ui text align must be left, center, or right');
        ASSERT(isString(font), 'ui text font must be a string');

        // set properties
        this.text = text;
        this.align = align;
        this.font = font;

        // make text not outlined by default
        this.lineWidth = 0;
        // text can not be a hover object by default
        this.canBeHover = false;
    }
    render()
    {
        // only render the text
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, this.textColor, this.lineWidth, this.lineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
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
    }
    render()
    {
        uiSystem.drawTile(this.pos, this.size, this.tileInfo, this.color, this.angle, this.mirror);
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

        ASSERT(isString(text), 'ui button must be a string');
        ASSERT(isColor(color), 'ui button color must be a color');

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
        uiSystem.drawText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font, this.fontStyle, true, this.textShadow);
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

        ASSERT(isString(text), 'ui checkbox must be a string');
        ASSERT(isColor(color), 'ui checkbox color must be a color');

        /** @property {boolean} - Current percentage value of this scrollbar 0-1 */
        this.checked = checked;
        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    onClick()
    {
        this.checked = !this.checked;
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
            uiSystem.drawLine(this.pos.add(s.multiply(vec2(-1))), this.pos.add(s.multiply(vec2(1))), this.lineWidth, this.lineColor);
            uiSystem.drawLine(this.pos.add(s.multiply(vec2(-1,1))), this.pos.add(s.multiply(vec2(1,-1))), this.lineWidth, this.lineColor);
        }
        
        // draw the text next to the checkbox
        const textSize = this.getTextSize();
        const pos = this.pos.add(vec2(this.size.x,0));
        uiSystem.drawText(this.text, pos, textSize, 
            this.textColor, 0, undefined, 'left', this.font, this.fontStyle, false, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIScrollbar - A UI object that acts as a scrollbar
 * @extends UIObject
 * @memberof UISystem
 */
class UIScrollbar extends UIObject
{
    /** Create a UIScrollbar object
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

        ASSERT(isNumber(value), 'ui scrollbar value must be a number');
        ASSERT(isString(text), 'ui scrollbar must be a string');
        ASSERT(isColor(color), 'ui scrollbar color must be a color');
        ASSERT(isColor(handleColor), 'ui scrollbar handleColor must be a color');

        /** @property {number} - Current percentage value of this scrollbar 0-1 */
        this.value = value;
        /** @property {Color} - Color for the handle part of the scrollbar */
        this.handleColor = handleColor.copy();

        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    update()
    {
        super.update();
        if (this.isActiveObject() && this.interactive)
        {
            // handle horizontal or vertical scrollbar
            const isHorizontal = this.size.x > this.size.y;
            const handleSize = isHorizontal ? this.size.y : this.size.x;
            const barSize = isHorizontal ? this.size.x : this.size.y;
            const centerPos = isHorizontal ? this.pos.x : this.pos.y;

            // check if value changed
            const handleWidth = barSize - handleSize;
            const p1 = centerPos - handleWidth/2;
            const p2 = centerPos + handleWidth/2;
            const oldValue = this.value;

            const p = uiSystem.screenToNative(mousePosScreen);
            this.value = isHorizontal ? 
                percent(p.x, p1, p2) :
                percent(p.y, p2, p1);
            this.value === oldValue || this.onChange();
        }
    }
    render()
    {
        super.render();

        // handle horizontal or vertical scrollbar
        const isHorizontal = this.size.x > this.size.y;
        const handleSize = isHorizontal ? this.size.y : this.size.x;
        const barSize = isHorizontal ? this.size.x : this.size.y;
        const centerPos = isHorizontal ? this.pos.x : this.pos.y;
        
        // draw the scrollbar handle
        const handleWidth = barSize - handleSize;
        const p1 = centerPos - handleWidth/2;
        const p2 = centerPos + handleWidth/2;
        const handlePos = isHorizontal ? 
            vec2(lerp(p1, p2, this.value), this.pos.y) :
            vec2(this.pos.x, lerp(p2, p1, this.value))
        const handleColor = this.disabled ? this.disabledColor : this.handleColor;
        uiSystem.drawRect(handlePos, vec2(handleSize), handleColor, this.lineWidth, this.lineColor, this.cornerRadius, this.gradientColor);

        // draw the text scaled to fit on the scrollbar
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * VideoPlayerUIObject - A UI object that plays video
 * @extends UIObject
 * @example
 * // Create a video player UI object
 * const video = new VideoPlayerUIObject(vec2(400, 300), vec2(320, 240), 'cutscene.mp4', true);
 * video.play();
 * @memberof UISystem
 */
class UIVideo extends UIObject
{
    /** Create a video player UI object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string} src - Video file path or URL
     *  @param {boolean} [autoplay=false] - Start playing immediately?
     *  @param {boolean} [loop=false] - Loop the video?
     *  @param {number} [volume=1] - Volume percent scaled by global volume (0-1)
     */
    constructor(pos, size, src, autoplay=false, loop=false, volume=1)
    {
        super(pos, size || vec2());
        
        ASSERT(isString(src), 'video src must be a string');
        ASSERT(isNumber(volume), 'video volume must be a number');

        this.color = BLACK; // default to black background
        this.cornerRadius = 0; // default to no corner radius

        /** @property {float} - The video volume */
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
    play()
    {
        // try to play the video, catch any errors (autoplay may be blocked)
        const promise = this.video.play();
        promise?.catch(()=>{});
        return promise;
    }
    
    /** Pause the video */
    pause() { this.video.pause(); }
    
    /** Stop and reset the video */
    stop() { this.video.pause(); this.video.currentTime = 0; }
    
    /** Check if video is currently loading
     *  @return {boolean} */
    isLoadng()
    { return this.video.readyState < this.video.HAVE_CURRENT_DATA; }
    
    /** Check if video is currently paused
     *  @return {boolean} */
    isPaused() { return this.video.paused; }
    
    /** Check if video is currently playing
     *  @return {boolean} */
    isPlaying()
    { return !this.isPaused() && !this.hasEnded() && !this.isLoadng(); }
    
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

        if (this.isLoadng())
            return;
        const context = uiSystem.uiContext;
        const s = this.size;
        context.save();
        context.translate(this.pos.x, this.pos.y);
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
        this.body = box2d.world.CreateBody(bodyDef);
        this.body.object = this;
        this.lineColor = BLACK;
        box2d.objects.push(this);
        
        // edge lists and loops for drawing
        this.edgeLists = [];
        this.edgeLoops = [];
    }

    /** Destroy this object and its physics body */
    destroy()
    {
        if (this.destroyed)
            return;

        // destroy physics body, fixtures, and joints
        ASSERT(this.body, 'Box2dObject has no body to destroy');
        box2d.world.DestroyBody(this.body);
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
     *  @param {Color}  [color]
     *  @param {Color}  [lineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixtures(color=WHITE, lineColor=BLACK, lineWidth=.1, context)
    {
        // draw non-edge fixtures
        this.getFixtureList().forEach((fixture)=>
        {
            const shape = box2d.castObjectType(fixture.GetShape());
            if (shape.GetType() !== box2d.instance.b2Shape.e_edge)
            {
                box2d.drawFixture(fixture, this.pos, this.angle, color, lineColor, lineWidth, context);
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
     *  @param {number}  [angle]
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
        shape.SetAsBox(size.x/2, size.y/2, box2d.vec2dTo(offset), angle);
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
            function box2dCreatePointList(points)
            {
                const buffer = box2d.instance._malloc(points.length * 8);
                for (let i=0, offset=0; i<points.length; ++i)
                {
                    box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].x;
                    offset += 4;
                    box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].y;
                    offset += 4;
                }
                return box2d.instance.wrapPointer(buffer, box2d.instance.b2Vec2);
            }

            ASSERT(3 <= points.length && points.length <= 8);
            const shape = new box2d.instance.b2PolygonShape();
            const box2dPoints = box2dCreatePointList(points);
            shape.Set(box2dPoints, points.length);
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
            i < points.length && edgePoints.push(points[i].copy());
        }
        this.edgeLoops.push(edgePoints);
        return fixtures;
    }

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
        this.body.SetTransform(box2d.vec2dTo(pos), angle);
    }
    
    /** Sets the position
     *  @param {Vector2} pos */
    setPosition(pos)
    { this.setTransform(pos, this.body.GetAngle()); }

    /** Sets the angle
     *  @param {number} angle */
    setAngle(angle)
    { this.setTransform(box2d.vec2From(this.body.GetPosition()), -angle); }

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
        localCenter && data.set_center(box2d.vec2dTo(localCenter));
        mass && data.set_mass(mass);
        momentOfInertia && data.set_I(momentOfInertia);
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

    /** Apply acceleration to this object
     *  @param {Vector2} acceleration
     *  @param {Vector2} [pos] */
    applyAcceleration(acceleration, pos)
    { 
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(box2d.vec2dTo(acceleration), box2d.vec2dTo(pos));
    }

    /** Apply torque to this object
     *  @param {number} torque */
    applyTorque(torque)
    {
        this.setAwake();
        this.body.ApplyTorque(torque);
    }
    
    /** Apply angular acceleration to this object
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    {
        this.setAwake();
        this.body.ApplyAngularImpulse(acceleration);
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
        this.box2dJoint = box2d.castObjectType(box2d.world.CreateJoint(jointDef));
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
    getCollideConnected()   { return this.box2dJoint.getCollideConnected();}

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
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
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
    enableLimit(enable=true) { return this.box2dJoint.enableLimit(enable); }

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
     *  @param {ratio} [ratio] */
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
        const localAxisA = objectB.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2PrismaticJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_localAxisA(box2d.vec2dTo(localAxisA));
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
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
    enableLimit(enable=true) { return this.box2dJoint.enableLimit(enable); }
    
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
 * Box2D Kiematic Object - Box2d with a kinematic physics body
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dKiematicObject extends Box2dObject 
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
        const localAxisA = objectB.worldToLocalVector(worldAxis);
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
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
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
        this.instance = instance;
        this.world = new box2d.instance.b2World();
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
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixture(fixture, pos, angle, color=WHITE, lineColor=BLACK, lineWidth=.1, context)
    {
        const shape = box2d.castObjectType(fixture.GetShape());
        switch (shape.GetType())
        {
            case box2d.instance.b2Shape.e_polygon:
            {
                let points = [];
                for (let i=shape.GetVertexCount(); i--;)
                    points.push(box2d.vec2From(shape.GetVertex(i)));
                drawPoly(points, color, lineWidth, lineColor, pos, angle);
                break;
            }
            case box2d.instance.b2Shape.e_circle:
            {
                const radius = shape.get_m_radius();
                drawCircle(pos, radius*2, color, lineWidth, lineColor);
                break;
            }
            case box2d.instance.b2Shape.e_edge:
            {
                const v1 = box2d.vec2From(shape.get_m_vertex1());
                const v2 = box2d.vec2From(shape.get_m_vertex2());
                drawLine(v1, v2, lineWidth, lineColor, pos, angle);
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
     *  @param {Object} v */
    vec2FromPointer(vp)
    {
        const v = box2d.instance.wrapPointer(vp, box2d.instance.b2Vec2);
        return box2d.vec2From(v);
    }

    /** converts a Vector2 to a box2 vec2
     *  @param {Vector2} v */
    vec2dTo(v)
    {
        ASSERT(v instanceof Vector2);
        return new box2d.instance.b2Vec2(v.x, v.y);
    }

    /** checks if a box2d object is null
     *  @param {Object} o */
    isNull(o) { return !box2d.instance.getPointer(o); }

    /** casts a box2d object to its correct type
     *  @param {Object} o */
    castObjectType(o)
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
        const getPointsList = (vertices, vertexCount) =>
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
            drawLine(point1, point2, debugLineWidth, color, vec2(), 0, false, false, overlayContext);
        };
        debugDraw.DrawPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, CLEAR_WHITE, debugLineWidth, color, vec2(), 0, false, false, overlayContext);
        };
        debugDraw.DrawSolidPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, color, 0, color, vec2(), 0, false, false, overlayContext);
        };
        debugDraw.DrawCircle = function(center, radius, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            drawCircle(center, radius*2, CLEAR_WHITE, debugLineWidth, color, false, false, overlayContext);
        };
        debugDraw.DrawSolidCircle = function(center, radius, axis, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            axis = box2d.vec2FromPointer(axis).scale(radius);
            drawCircle(center, radius*2, color, debugLineWidth, color, false, false, overlayContext);
            drawLine(vec2(), axis, debugLineWidth, color, center, 0, false, false, overlayContext);
        };
        debugDraw.DrawTransform = function(transform)
        {
            transform = box2d.instance.wrapPointer(transform, box2d.instance.b2Transform);
            const pos = vec2(transform.get_p());
            const angle = -transform.get_q().GetAngle();
            const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8);
            const p2 = vec2(0,1), c2 = rgb(0,.75,0,.8);
            drawLine(vec2(), p1, debugLineWidth, c1, pos, angle, false, false, overlayContext);
            drawLine(vec2(), p2, debugLineWidth, c2, pos, angle, false, false, overlayContext);
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

/** Draw a scalable nine-slice UI element to the overlay canvas in screen space
 *  This function can not apply color because it draws using the overlay 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the nine-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawNineSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true, overlayContext);
}

/** Draw a scalable nine-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Starting tile for the nine-slice pattern
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup nine slice tiles
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

/** Draw a scalable three-slice UI element to the overlay canvas in screen space
 *  This function can not apply color because it draws using the overlay 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the three-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawThreeSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true, overlayContext);
}

/** Draw a scalable three-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Starting tile for the three-slice pattern
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup three slice tiles
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
