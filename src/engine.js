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
const engineVersion = '1.16.1';

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
    // transform way is still more reliable then flexbox or grid
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

    async function startEngine()
    {
        // wait for gameInit to load
        await gameInit();
        engineUpdate();
    }

    ///////////////////////////////////////////////////////////////////////////
    // LittleJS Splash Screen
    function drawEngineSplashScreen(t)
    {
        const x = mainContext;
        const w = mainCanvas.width = innerWidth;
        const h = mainCanvas.height = innerHeight;

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
            hsl([.98,.3,.57,.14][c%4],.8,[0,.3,.5,.8,.9][l]).toString();
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
    ///////////////////////////////////////////////////////////////////////////
}

/** Update each engine object, remove destroyed objects, and update time
 * can be called manually if objects need to be updated outside of main loop
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