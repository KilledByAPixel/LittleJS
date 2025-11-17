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
const engineVersion = '1.17.10';

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

// Engine internal variables
let frameTimeLastMS = 0, frameTimeBufferMS = 0, averageFPS = 0;
let showEngineVersion = true;

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
 *    ()=> { LOG('Game initialized!'); },  // gameInit
 *    ()=> { updateGameLogic(); },         // gameUpdate
 *    ()=> { updateUI(); },                // gameUpdatePost
 *    ()=> { drawBackground(); },          // gameRender
 *    ()=> { drawHUD(); },                 // gameRenderPost
 *    ['tiles.png', 'tilesLevel.png']       // images to load
 *  );
 *  @memberof Engine */
async function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement=document.body)
{
    showEngineVersion && console.log(`${engineName} Engine v${engineVersion}`);
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
        if (debug || debugWatermark)
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
            if (debugVideoCaptureIsActive())
                renderFrame();
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

            // render the game and objects
            enginePreRender();
            gameRender();
            engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
            for (const o of engineObjects)
                o.destroyed || o.render();

            // post rendering
            gameRenderPost();
            pluginList.forEach(plugin=>plugin.render?.());
            inputRender();
            debugRender();
            glFlush();
            debugRenderPost();
            drawCount = 0;
        }
    }

    function updateCanvas()
    {
        if (headlessMode) return;

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
            // get main canvas size based on window size
            mainCanvasSize.x = min(innerWidth,  canvasMaxSize.x);
            mainCanvasSize.y = min(innerHeight, canvasMaxSize.y);
            
            // responsive aspect ratio with native resolution
            const innerAspect = innerWidth / innerHeight;
            ASSERT(canvasMinAspect <= canvasMaxAspect);
            if (canvasMaxAspect && innerAspect > canvasMaxAspect)
            {
                // full height
                const w = mainCanvasSize.y * canvasMaxAspect | 0;
                mainCanvasSize.x = min(w,  canvasMaxSize.x);
            }
            else if (innerAspect < canvasMinAspect)
            {
                // full width
                const h = mainCanvasSize.x / canvasMinAspect | 0;
                mainCanvasSize.y = min(h, canvasMaxSize.y);
            }
        }

        // clear main canvas and set size
        mainCanvas.width  = mainCanvasSize.x;
        mainCanvas.height = mainCanvasSize.y;

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
    updateCanvas();
    glPreRender();

    // create offscreen canvases for image processing
    workCanvas = new OffscreenCanvas(64, 64);
    workContext = workCanvas.getContext('2d');
    workReadCanvas = new OffscreenCanvas(64, 64);
    workReadContext = workReadCanvas.getContext('2d', { willReadFrequently: true });

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

    // load engine font image
    promises.push(fontImageInit());

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
        engineUpdate();
    }
}

/** Update each engine object, remove destroyed objects, and update time
 * can be called manually if objects need to be updated outside of main loop
 *  @memberof Engine */
function engineObjectsUpdate()
{
    // get list of solid objects for physics optimization
    engineObjectsCollide = engineObjects.filter(o=>o.collideSolidObjects);

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
        o.updatePhysics();
        for (const child of o.children)
            updateChildObject(child);
        o.updateTransforms();
    }

    // remove destroyed objects
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

/** Destroy and remove all objects
 *  - This can be used to clear out all objects when restarting a level
 *  - Objects can override their destroy function to do cleanup or stick around
 *  @param {boolean} [immediate] - should attached effects be allowed to die off?
 *  @memberof Engine */
function engineObjectsDestroy(immediate=true)
{
    for (const o of engineObjects)
        o.parent || o.destroy(immediate);
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

///////////////////////////////////////////////////////////////////////////////
function drawEngineLogo(t)
{
    const blackAndWhite = 0;
    const showName = 1;

    // LittleJS Logo and Splash Screen
    const x = mainContext;
    const w = mainCanvas.width = innerWidth;
    const h = mainCanvas.height = innerHeight;
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
    const color = (c,l)=> l?`hsl(${[.95,.56,.13][c%3]*360} 99%${[0,50,75][l]}%`:'#000';

    // center and fit tos screen
    const alpha = wave(1,1,t);
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
        rect(11,Y+2,59,8*p,-1);
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
    rect(38,15,6,6,2);    // little stack

    // big stack
    rect(49,20,10,-6,0);
    const stackPoints = [vec2(44,8),vec2(64,8),vec2(59,8+6*p),vec2(49,8+6*p)];
    poly(stackPoints,2,8,6*p);
    rect(44,8,20,-7,0);

    // engine
    for (let i=5;i--;) circle(59-i*6,30,10,0,9,1,0);
    circle(59,30,4,0,9,2); // light

    // engine outline
    rect(35,20,24,0);  // top
    circle(59,30,10);  // front
    circle(47,30,10,PI/2,PI*3/2); // middle
    circle(35,30,10,PI/2,PI*3/2); // back
    rect(7,40,13,7,-1);   // bottom back
    rect(17,40,43,14,-1); // bottom center

    // wheels
    for (let i=3;i--;)
    for (let j=2;j--;)
        circle(15*i+17,47,j?7:1,PI,3*PI,2);
    
    // cowcatcher
    for (let i=2;i--;)
    {
        let w=6, s=7, o=53+w*p*i
        const points = [vec2(o+s,54),vec2(o,40),vec2(o+w*p,40),vec2(o+s+w*p,54)];
        poly(points,0,40,14);
    }

    x.restore();
}