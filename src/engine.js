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
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineName = 'LittleJS';

/** Version of engine
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineVersion = '1.9.3';

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

/** Set if game is paused
 *  @param {Boolean} isPaused
 *  @memberof Engine */
function setPaused(isPaused) { paused = isPaused; }

// Frame time tracking
let frameTimeLastMS = 0, frameTimeBufferMS = 0, averageFPS = 0;

///////////////////////////////////////////////////////////////////////////////

/** Startup LittleJS engine with your callback functions
 *  @param {Function} gameInit       - Called once after the engine starts up, setup the game
 *  @param {Function} gameUpdate     - Called every frame at 60 frames per second, handle input and update the game state
 *  @param {Function} gameUpdatePost - Called after physics and objects are updated, setup camera and prepare for render
 *  @param {Function} gameRender     - Called before objects are rendered, draw any background effects that appear behind objects
 *  @param {Function} gameRenderPost - Called after objects are rendered, draw effects or hud that appear above all objects
 *  @param {Array} [imageSources=['tiles.png']] - Image to load
 *  @memberof Engine */
function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=['tiles.png'])
{
    ASSERT(Array.isArray(imageSources), 'pass in images as array');

    // internal update loop for engine
    function engineUpdate(frameTimeMS=0)
    {
        // update time keeping
        let frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        frameTimeLastMS = frameTimeMS;
        if (debug || showWatermark)
            averageFPS = lerp(.05, averageFPS, 1e3/(frameTimeDeltaMS||1));
        const debugSpeedUp   = debug && keyIsDown('Equal'); // +
        const debugSpeedDown = debug && keyIsDown('Minus'); // -
        if (debug) // +/- to speed/slow time
            frameTimeDeltaMS *= debugSpeedUp ? 5 : debugSpeedDown ? .2 : 1;
        timeReal += frameTimeDeltaMS / 1e3;
        frameTimeBufferMS += paused ? 0 : frameTimeDeltaMS;
        if (!debugSpeedUp)
            frameTimeBufferMS = min(frameTimeBufferMS, 50); // clamp in case of slow framerate
        updateCanvas();

        if (paused)
        {
            // do post update even when paused
            inputUpdate();
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
                // force an update each frame if time is close enough (not just a fast refresh rate)
                deltaSmooth = frameTimeBufferMS;
                frameTimeBufferMS = 0;
            }
            
            // update multiple frames if necessary in case of slow framerate
            for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
            {
                // increment frame and update time
                time = frame++ / frameRate;

                // update game and objects
                inputUpdate();
                gameUpdate();
                engineObjectsUpdate();

                // do post update
                debugUpdate();
                gameUpdatePost();
                inputUpdatePost();
            }

            // add the time smoothing back in
            frameTimeBufferMS += deltaSmooth;
        }
        
        // render sort then render while removing destroyed objects
        enginePreRender();
        gameRender();
        engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
        for (const o of engineObjects)
            o.destroyed || o.render();
        gameRenderPost();
        glRenderPostProcess();
        medalsRender();
        touchGamepadRender();
        debugRender();
        glEnable && glCopyToContext(mainContext);

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

        requestAnimationFrame(engineUpdate);
    }

    function updateCanvas()
    {
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
            mainCanvas.width  = min(innerWidth,  canvasMaxSize.x);
            mainCanvas.height = min(innerHeight, canvasMaxSize.y);
        }
        
        // clear overlay canvas and set size
        overlayCanvas.width  = mainCanvas.width;
        overlayCanvas.height = mainCanvas.height;

        // save canvas size
        mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);
    }

    // setup html
     const styleBody = 
        'margin:0;overflow:hidden;' + // fill the window
        'background:#000;' +          // set background color
        'touch-action:none;' +        // prevent mobile pinch to resize
        'user-select:none;' +         // prevent mobile hold to select
        '-webkit-user-select:none;' + // compatibility for ios
        '-webkit-touch-callout:none'; // compatibility for ios
    document.body.style.cssText = styleBody;
    document.body.appendChild(mainCanvas = document.createElement('canvas'));
    mainContext = mainCanvas.getContext('2d');

    // init stuff and start engine
    debugInit();
    glEnable && glInit();

    // create overlay canvas for hud to appear above gl canvas
    document.body.appendChild(overlayCanvas = document.createElement('canvas'));
    overlayContext = overlayCanvas.getContext('2d');

    // set canvas style
    const styleCanvas = 'position:absolute;' +             // position
        'top:50%;left:50%;transform:translate(-50%,-50%)'; // center
    (glCanvas||mainCanvas).style.cssText = mainCanvas.style.cssText = overlayCanvas.style.cssText = styleCanvas;
    updateCanvas();
    
    // create promises for loading images
    const promises = imageSources.map((src, textureIndex)=>
        new Promise(resolve => 
        {
            const image = new Image;
            image.onerror = image.onload = ()=> 
            {
                textureInfos[textureIndex] = new TextureInfo(image);
                resolve();
            }
            image.src = src;
        })
    )

    // draw splash screen
    showSplashScreen && promises.push(new Promise(resolve => 
    {
        let t = 0;
        console.log(`${engineName} Engine v${engineVersion}`);
        updateSplash();
        function updateSplash()
        {
            clearInput();
            drawEngineSplashScreen(t+=.01);
            t>1 ? resolve() : setTimeout(updateSplash, 16);
        }
    }));

    // load all of the images
    Promise.all(promises).then(()=> 
    {
        // start the engine
        gameInit();
        engineUpdate();
    });
}

// Called automatically by engine to setup render system
function enginePreRender()
{
    // save canvas size
    mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);

    // disable smoothing for pixel art
    mainContext.imageSmoothingEnabled = !canvasPixelated;

    // setup gl rendering if enabled
    glEnable && glPreRender();
}

/** Update each engine object, remove destroyed objects, and update time
 *  @memberof Engine */
function engineObjectsUpdate()
{
    // get list of solid objects for physics optimzation
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
        o.parent || updateObject(o);

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

/** Triggers a callback for each object within a given area
 *  @param {Vector2} [pos]                 - Center of test area
 *  @param {Number|Vector2} [size]         - Radius of circle if float, rectangle size if Vector2
 *  @param {Function} [callbackFunction]   - Calls this function on every object that passes the test
 *  @param {Array} [objects=engineObjects] - List of objects to check
 *  @memberof Engine */
function engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects)
{
    if (!pos) // all objects
    {
        for (const o of objects)
            callbackFunction(o);
    }
    else if (typeof size === 'object')  // bounding box test
    {
        for (const o of objects)
            isOverlapping(pos, size, o.pos, o.size) && callbackFunction(o);
    }
    else  // circle test
    {
        const sizeSquared = size*size;
        for (const o of objects)
            pos.distanceSquared(o.pos) < sizeSquared && callbackFunction(o);
    }
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
        const g = x.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.hypot(w,h)*.7);
        g.addColorStop(0,hsl(0,0,lerp(p4,0,p3/2),p3).toString());
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
    rect(7,17,18,-8,color(2,2));
    rect(7,9,18,4,color(2,3));
    rect(25,9,8,8,color(2,1));
    rect(25,9,-18,8);
    rect(25,9,8,8);

    // cab
    rect(25,17,7,22,color());
    rect(11,40,14,-23,color(1,1));
    rect(11,17,14,17,color(1,2));
    rect(11,17,14,9,color(1,3));
    rect(15,31,6,-9,color(2,2));
    circle(15,23,5,0,PI/2,color(2,4),1);
    rect(25,17,-14,23);
    rect(21,22,-6,9);

    // little stack
    rect(37,14,9,6,color(3,2));
    rect(37,14,4.5,6,color(3,3));
    rect(37,14,9,6);

    // big stack
    rect(50,20,10,-10,color(0,1));
    rect(50,20,6.5,-10,color(0,2));
    rect(50,20,3.5,-10,color(0,3));
    rect(50,20,10,-10);
    circle(55,2,11.4,.5,PI-.5,color(3,3));
    circle(55,2,11.4,.5,PI/2,color(3,2),1);
    circle(55,2,11.4,.5,PI-.5);
    rect(45,7,20,-7,color(0,2));
    rect(45,0,20,3,color(0,3));
    rect(45,0,20,7);

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