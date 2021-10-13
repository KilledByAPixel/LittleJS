/*
    LittleJS - The Tiny JavaScript Game Engine That Can
    MIT License - Copyright 2019 Frank Force

    Engine Features
    - Engine and debug system are separate from game code
    - Object oriented with base class engine object
    - Engine handles core update loop
    - Base class object handles update, physics, collision, rendering, etc
    - Engine helper classes and functions like Vector2, Color, and Timer
    - Super fast rendering system for tile sheets
    - Sound effects audio with zzfx and music with zzfxm
    - Input processing system with gamepad and touchscreen support
    - Tile layer rendering and collision system
    - Particle effect system
    - Automatically calls gameInit(), gameUpdate(), gameUpdatePost(), gameRender(), gameRenderPost()
    - Debug tools and debug rendering system
    - Call engineInit() to start it up!
*/

'use strict';

const engineName = 'LittleJS';
const engineVersion = '1.0.11';
const FPS = 60, timeDelta = 1/FPS; // engine uses a fixed time step
const tileImage = new Image(); // everything uses the same tile sheet

// core engine variables
let mainCanvas, mainContext, overlayCanvas, overlayContext, mainCanvasSize=vec2(), 
    engineObjects=[], engineCollideObjects=[],
    cameraPos=vec2(), cameraScale=max(defaultTileSize.x, defaultTileSize.y),
    frame=0, time=0, realTime=0, paused=0, frameTimeLastMS=0, frameTimeBufferMS=0, debugFPS=0, gravity=0, 
    tileImageSize, tileImageSizeInverse, shrinkTilesX, shrinkTilesY, drawCount;

// call this function to start the engine
function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, tileImageSource)
{
    // init engine when tiles load
    tileImage.onload = ()=>
    {
        // save tile image info
        tileImageSizeInverse = vec2(1).divide(tileImageSize = vec2(tileImage.width, tileImage.height));
        debug && (tileImage.onload=()=>ASSERT(1)); // tile sheet can not reloaded
        shrinkTilesX = tileBleedShrinkFix/tileImageSize.x;
        shrinkTilesY = tileBleedShrinkFix/tileImageSize.y;

        // setup html
        document.body.appendChild(mainCanvas = document.createElement('canvas'));
        document.body.style = 'margin:0;overflow:hidden;background:#000';
        mainCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' +
            (pixelated ? ';image-rendering:crisp-edges;image-rendering:pixelated' : ''); // pixelated rendering
        mainContext = mainCanvas.getContext('2d');

        // init stuff and start engine
        debugInit();
        glInit();

        // create overlay canvas for hud to appear above gl canvas
        document.body.appendChild(overlayCanvas = document.createElement('canvas'));
        overlayCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
        overlayContext = overlayCanvas.getContext('2d');

        gameInit();
        engineUpdate();
    };

    // main update loop
    const engineUpdate = (frameTimeMS=0)=>
    {
        requestAnimationFrame(engineUpdate);
        
        if (!document.hasFocus())
            inputData[0].length = 0; // clear input when lost focus (prevent stuck keys)

        // prepare to update time
        const realFrameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        let frameTimeDeltaMS = realFrameTimeDeltaMS;
        if (debug)
            frameTimeDeltaMS *= keyIsDown(107) ? 5 : keyIsDown(109) ? .2 : 1; // +/- to speed/slow time
        frameTimeLastMS = frameTimeMS;
        realTime = frameTimeMS / 1e3;
        frameTimeBufferMS += !paused * frameTimeDeltaMS;

        // apply time delta smoothing, improves smoothness of framerate in some browsers
        let deltaSmooth = 0;
        if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
        {
            // force an update each frame if time is close enough (not just a fast refresh rate)
            deltaSmooth = frameTimeBufferMS;
            frameTimeBufferMS = 0;
            //debug && frameTimeBufferMS < 0 && console.log('time smoothing: ' + -deltaSmooth);
        }
        //debug && frameTimeBufferMS < 0 && console.log('skipped frame! ' + -frameTimeBufferMS);

        // clamp incase of extra long frames (slow framerate)
        frameTimeBufferMS = min(frameTimeBufferMS, 50);

        // prepare to update the frame
        mousePos = screenToWorld(mousePosScreen);
        updateGamepads();
        
        if (paused)
        {
            // do post update even when paused
            gameUpdatePost();
            debugUpdate();
            updateInput();
        }
        else
        {
            // update multiple frames if necessary in case of slow framerate
            for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / FPS)
            {
                gameUpdate();
                engineUpdateObjects();

                // do post update
                gameUpdatePost();
                debugUpdate();
                updateInput();
            }
        }

        // add the time smoothing back in
        frameTimeBufferMS += deltaSmooth;

        if (fixedWidth)
        {
            // clear and fill window if smaller
            mainCanvas.width = fixedWidth;
            mainCanvas.height = fixedHeight;
            
            // fit to window width if smaller
            const fixedAspect = fixedWidth / fixedHeight;
            const aspect = innerWidth / innerHeight;
            overlayCanvas.style.width = mainCanvas.style.width = aspect < fixedAspect ? '100%' : '';
            overlayCanvas.style.height = mainCanvas.style.height = aspect < fixedAspect ? '' : '100%';
            if (glCanvas)
            {
                glCanvas.style.width = mainCanvas.style.width;
                glCanvas.style.height = mainCanvas.style.height;
            }
        }
        else
        {
            // clear and fill the window
            mainCanvas.width = min(innerWidth, maxWidth);
            mainCanvas.height = min(innerHeight, maxHeight);
        }
        
        // save canvas size and clear overlay canvas
        mainCanvasSize = vec2(overlayCanvas.width = mainCanvas.width, overlayCanvas.height = mainCanvas.height);
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art

        // render sort then render while removing destroyed objects
        glPreRender(mainCanvas.width, mainCanvas.height);
        gameRender();
        engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
        for (const o of engineObjects)
            o.destroyed || o.render();
        gameRenderPost();
        medalsRender();
        debugRender();
        glCopyToContext(mainContext);

        if (showWatermark)
        {
            // update fps
            debugFPS = lerp(.05, 1e3/(realFrameTimeDeltaMS||1), debugFPS);
            overlayContext.textAlign = 'right';
            overlayContext.textBaseline = 'top';
            overlayContext.font = '1em monospace';
            overlayContext.fillStyle = '#000';
            const text = engineName + ' ' + 'v' + engineVersion + ' / ' 
                + drawCount + ' / ' + engineObjects.length + ' / ' + debugFPS.toFixed(1);
            overlayContext.fillText(text, mainCanvas.width-3, 3);
            overlayContext.fillStyle = '#fff';
            overlayContext.fillText(text, mainCanvas.width-2, 2);
            drawCount = 0;
        }
    }

    // set tile image source to load the image and start the engine
    tileImageSource ? tileImage.src = tileImageSource : tileImage.onload();
}

function engineUpdateObjects()
{
    // recursive object update
    const updateObject = (o)=>
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
    engineCollideObjects = engineCollideObjects.filter(o=>!o.destroyed);

    // increment frame and update time
    time = ++frame / FPS;
}