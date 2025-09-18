/** 
 * LittleJS Debug System
 * - Press Esc to show debug overlay with mouse pick
 * - Number keys toggle debug functions
 * - +/- apply time scale
 * - Debug primitive rendering
 * - Save a 2d canvas as a png image
 * @namespace Debug
 */

'use strict';

/** True if debug is enabled
 *  @type {Boolean}
 *  @default
 *  @memberof Debug */
const debug = true;

/** True if asserts are enabled
 *  @type {Boolean}
 *  @default
 *  @memberof Debug */
const enableAsserts = true;

/** Size to render debug points by default
 *  @type {Number}
 *  @default
 *  @memberof Debug */
const debugPointSize = .5;

/** True if watermark with FPS should be shown, false in release builds
 *  @type {Boolean}
 *  @default
 *  @memberof Debug */
let showWatermark = true;

/** Key code used to toggle debug mode, Esc by default
 *  @type {String}
 *  @default
 *  @memberof Debug */
let debugKey = 'Escape';

/** True if the debug overlay is active, always false in release builds
 *  @type {Boolean}
 *  @default
 *  @memberof Debug */
let debugOverlay = false;

// Engine internal variables not exposed to documentation
let debugPrimitives = [], debugPhysics = false, debugRaycast = false, debugParticles = false, debugGamepads = false, debugMedals = false, debugTakeScreenshot, downloadLink;

///////////////////////////////////////////////////
// Debug settings

/** Set if watermark with FPS should be shown
 *  @param {Boolean} show
 *  @memberof Debug */
function setShowWatermark(show) { showWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {String} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }

///////////////////////////////////////////////////////////////////////////////
// Debug helper functions

/** Asserts if the expression is false, does not do anything in release builds
 *  @param {Boolean} assert
 *  @param {Object} [output]
 *  @memberof Debug */
function ASSERT(assert, output) 
{
    if (enableAsserts)
        output ? console.assert(assert, output) : console.assert(assert);
}

/** Draw a debug rectangle in world space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=Vector2()]
 *  @param {String}  [color]
 *  @param {Number}  [time]
 *  @param {Number}  [angle]
 *  @param {Boolean} [fill]
 *  @memberof Debug */
function debugRect(pos, size=vec2(), color='#fff', time=0, angle=0, fill=false)
{
    if (typeof size == 'number')
        size = vec2(size); // allow passing in floats
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugPrimitives.push({pos, size, color, time:new Timer(time), angle, fill});
}

/** Draw a debug poly in world space
 *  @param {Vector2} pos
 *  @param {Array}   points
 *  @param {String}  [color]
 *  @param {Number}  [time]
 *  @param {Number}  [angle]
 *  @param {Boolean} [fill]
 *  @memberof Debug */
function debugPoly(pos, points, color='#fff', time=0, angle=0, fill=false)
{
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugPrimitives.push({pos, points, color, time:new Timer(time), angle, fill});
}

/** Draw a debug circle in world space
 *  @param {Vector2} pos
 *  @param {Number}  [radius]
 *  @param {String}  [color]
 *  @param {Number}  [time]
 *  @param {Boolean} [fill]
 *  @memberof Debug */
function debugCircle(pos, radius=0, color='#fff', time=0, fill=false)
{
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugPrimitives.push({pos, size:radius, color, time:new Timer(time), angle:0, fill});
}

/** Draw a debug point in world space
 *  @param {Vector2} pos
 *  @param {String}  [color]
 *  @param {Number}  [time]
 *  @param {Number}  [angle]
 *  @memberof Debug */
function debugPoint(pos, color, time, angle)
{
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugRect(pos, undefined, color, time, angle);
}

/** Draw a debug line in world space
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {String}  [color]
 *  @param {Number}  [thickness]
 *  @param {Number}  [time]
 *  @memberof Debug */
function debugLine(posA, posB, color, thickness=.1, time)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    debugRect(posA.add(halfDelta), size, color, time, halfDelta.angle(), true);
}

/** Draw a debug combined axis aligned bounding box in world space
 *  @param {Vector2} pA - position A
 *  @param {Vector2} sA - size A
 *  @param {Vector2} pB - position B
 *  @param {Vector2} sB - size B
 *  @param {String}  [color]
 *  @memberof Debug */
function debugOverlap(pA, sA, pB, sB, color)
{
    const minPos = vec2(min(pA.x - sA.x/2, pB.x - sB.x/2), min(pA.y - sA.y/2, pB.y - sB.y/2));
    const maxPos = vec2(max(pA.x + sA.x/2, pB.x + sB.x/2), max(pA.y + sA.y/2, pB.y + sB.y/2));
    debugRect(minPos.lerp(maxPos,.5), maxPos.subtract(minPos), color);
}

/** Draw a debug axis aligned bounding box in world space
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {String}  [color]
 *  @param {Number}  [time]
 *  @param {Number}  [angle]
 *  @param {String}  [font]
 *  @memberof Debug */
function debugText(text, pos, size=1, color='#fff', time=0, angle=0, font='monospace')
{
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugPrimitives.push({text, pos, size, color, time:new Timer(time), angle, font});
}

/** Clear all debug primitives in the list
 *  @memberof Debug */
function debugClear() { debugPrimitives = []; }

/** Save a canvas to disk 
 *  @param {HTMLCanvasElement} canvas
 *  @param {String}            [filename]
 *  @param {String}            [type]
 *  @memberof Debug */
function debugSaveCanvas(canvas, filename='screenshot', type='image/png')
{ debugSaveDataURL(canvas.toDataURL(type), filename); }

/** Save a text file to disk 
 *  @param {String}     text
 *  @param {String}     [filename]
 *  @param {String}     [type]
 *  @memberof Debug */
function debugSaveText(text, filename='text', type='text/plain')
{ debugSaveDataURL(URL.createObjectURL(new Blob([text], {'type':type})), filename); }

/** Save a data url to disk 
 *  @param {String}     dataURL
 *  @param {String}     filename
 *  @memberof Debug */
function debugSaveDataURL(dataURL, filename)
{
    downloadLink.download = filename;
    downloadLink.href = dataURL;
    downloadLink.click();
}

/** Show error as full page of red text
 *  @memberof Debug */
function debugShowErrors()
{
    const showError = (message)=>
    {
        // replace entire page with error message
        document.body.style.display = '';
        document.body.style.backgroundColor = '#111';
        document.body.innerHTML = `<pre style=color:#f00;font-size:50px;white-space:pre-wrap>` + message;
    }
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
            debugTakeScreenshot = 1;
        if (keyWasPressed('Digit6'))
            debugVideoCaptureIsActive() ? 
                debugVideoCaptureStop() : debugVideoCaptureStart();
    }
}

function debugRender()
{
    if (debugVideoCaptureIsActive())
        return; // don't show debug info when capturing video

    glCopyToContext(mainContext);

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
                    debugCircle(drawPos, stickScale, '#fff7',0,true);
                    debugLine(drawPos, stickPos, '#f00');
                    debugPoint(stickPos, '#f00');
                }
                for (let j = gamepad.buttons.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*buttonScale*2, i*stickScale*3-stickScale-buttonScale));
                    const pressed = gamepad.buttons[j].pressed;
                    debugCircle(drawPos, buttonScale, pressed ? '#f00' : '#fff7', 0, true);
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
            if (o.canvas || o.destroyed)
                continue;

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

        if (tileCollisionSize.x > 0 && tileCollisionSize.y > 0)
            drawRect(mousePos.floor().add(vec2(.5)), vec2(1), rgb(0,0,1,.5), 0, false);
        mainContext = saveContext;

        //glCopyToContext(mainContext = saveContext);
    }

    {
        // draw debug primitives
        overlayContext.lineWidth = 2;
        const pointSize = debugPointSize * cameraScale;
        debugPrimitives.forEach(p=>
        {
            overlayContext.save();

            // create canvas transform from world space to screen space
            const pos = worldToScreen(p.pos);
            overlayContext.translate(pos.x|0, pos.y|0);
            overlayContext.rotate(p.angle);
            overlayContext.scale(1, p.text ? 1 : -1);
            overlayContext.fillStyle = overlayContext.strokeStyle = p.color;

            if (p.text != undefined)
            {
                overlayContext.font = p.size*cameraScale + 'px '+ p.font;
                overlayContext.textAlign = 'center';
                overlayContext.textBaseline = 'middle';
                overlayContext.fillText(p.text, 0, 0);
            }
            else if (p.points != undefined)
            {
                // poly
                overlayContext.beginPath();
                for (const point of p.points)
                {
                    const p2 = point.scale(cameraScale).floor();
                    overlayContext.lineTo(p2.x, p2.y);
                }
                overlayContext.closePath();
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }
            else if (p.size == 0 || p.size.x === 0 && p.size.y === 0)
            {
                // point
                overlayContext.fillRect(-pointSize/2, -1, pointSize, 3);
                overlayContext.fillRect(-1, -pointSize/2, 3, pointSize);
            }
            else if (p.size.x != undefined)
            {
                // rect
                const s = p.size.scale(cameraScale).floor();
                const w = s.x, h = s.y;
                p.fill && overlayContext.fillRect(-w/2|0, -h/2|0, w, h);
                overlayContext.strokeRect(-w/2|0, -h/2|0, w, h);
            }
            else
            {
                // circle
                overlayContext.beginPath();
                overlayContext.arc(0, 0, p.size*cameraScale, 0, 9);
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }
            
            overlayContext.restore();
        });

        // remove expired primitives
        debugPrimitives = debugPrimitives.filter(r=>r.time<0);
    }
    
    if (debugObject)
    {
        const saveContext = mainContext;
        mainContext = overlayContext;
        const raycastHitPos = tileCollisionRaycast(debugObject.pos, mousePos);
        raycastHitPos && drawRect(raycastHitPos.floor().add(vec2(.5)), vec2(1), rgb(0,1,1,.3));
        drawLine(mousePos, debugObject.pos, .1, raycastHitPos ? rgb(1,0,0,.5) : rgb(0,1,0,.5), false);

        const debugText = 'mouse pos = ' + mousePos + 
            '\nmouse collision = ' + getTileCollisionData(mousePos) + 
            '\n\n--- object info ---\n' +
            debugObject.toString();
        drawTextScreen(debugText, mousePosScreen, 24, rgb(), .05, undefined, 'center', 'monospace');
        mainContext = saveContext;
    }

    {
        // draw debug overlay
        overlayContext.save();
        overlayContext.fillStyle = '#fff';
        overlayContext.textAlign = 'left';
        overlayContext.textBaseline = 'top';
        overlayContext.font = '28px monospace';
        overlayContext.shadowColor = '#000';
        overlayContext.shadowBlur = 9;

        let x = 9, y = -20, h = 30;
        if (debugOverlay)
        {
            overlayContext.fillText(engineName, x, y += h);
            overlayContext.fillText('Objects: ' + engineObjects.length, x, y += h);
            overlayContext.fillText('Time: ' + formatTime(time), x, y += h);
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
            overlayContext.fillText('6: Capture Video', x, y += h);

            let keysPressed = '';
            for(const i in inputData[0])
            {
                if (keyIsDown(i, 0))
                    keysPressed += i + ' ' ;
            }
            keysPressed && overlayContext.fillText('Keys Down: ' + keysPressed, x, y += h);

            let buttonsPressed = '';
            if (inputData[1])
            for(const i in inputData[1])
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
let debugVideoCapture, debugVideoCaptureTrack, debugVideoCaptureIcon;

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
        debugVideoCaptureTrack.applyConstraints({frameRate:frameRate}); // force 60 fps
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

    if (audioGainNode)
    {
        // connect to audio master gain node
        const audioStreamDestination = audioContext.createMediaStreamDestination();
        audioGainNode.connect(audioStreamDestination);
        for (const track of audioStreamDestination.stream.getAudioTracks())
            stream.addTrack(track); // add audio tracks to capture stream
    }

    // start recording
    console.log('Video capture started.');
    debugVideoCapture.start();

    if (!debugVideoCaptureIcon)
    {
        // create recording icon to show it is capturing video
        debugVideoCaptureIcon = document.createElement('div');
        debugVideoCaptureIcon.textContent = '● Recording';
        debugVideoCaptureIcon.style.position = 'absolute';
        debugVideoCaptureIcon.style.padding = '9px';
        debugVideoCaptureIcon.style.color = '#f00';
        debugVideoCaptureIcon.style.font = '50px monospace';
        document.body.appendChild(debugVideoCaptureIcon);
    }
    // show recording icon
    debugVideoCaptureIcon.style.display = '';
}

/** Stop capturing video and save to disk
 *  @memberof Debug */
function debugVideoCaptureStop()
{
    if (!debugVideoCaptureIsActive())
        return; // not recording

    // stop recording
    console.log('Video capture ended.');
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
}