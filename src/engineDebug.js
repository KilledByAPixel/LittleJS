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
 *  @param {boolean} assert
 *  @param {...Object} [output] - error message output
 *  @memberof Debug */
function ASSERT(assert, ...output) { console.assert(assert, ...output); }

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
 *  @memberof Debug */
function debugRect(pos, size=vec2(), color=WHITE, time=0, angle=0, fill=false)
{
    if (typeof size === 'number')
        size = vec2(size); // allow passing in floats
    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    size = size.copy();
    const timer = new Timer(time);
    debugPrimitives.push({pos:pos.copy(), size:size.copy(), color, timer, angle, fill});
}

/** Draw a debug poly in world space
 *  @param {Vector2} pos
 *  @param {Array<Vector2>} points
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {boolean} [fill]
 *  @memberof Debug */
function debugPoly(pos, points, color=WHITE, time=0, angle=0, fill=false)
{
    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    points = points.map(p=>p.copy());
    const timer = new Timer(time);
    debugPrimitives.push({pos, points, color, timer, angle, fill});
}

/** Draw a debug circle in world space
 *  @param {Vector2} pos
 *  @param {number} [size] - diameter
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {boolean} [fill]
 *  @memberof Debug */
function debugCircle(pos, size=0, color=WHITE, time=0, fill=false)
{
    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    const timer = new Timer(time);
    debugPrimitives.push({pos, size, color, timer, angle:0, fill});
}

/** Draw a debug point in world space
 *  @param {Vector2} pos
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @memberof Debug */
function debugPoint(pos, color, time, angle)
{ debugRect(pos, undefined, color, time, angle); }

/** Draw a debug line in world space
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Color|string} [color]
 *  @param {number} [width]
 *  @param {number} [time]
 *  @memberof Debug */
function debugLine(posA, posB, color, width=.1, time)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(width, halfDelta.length()*2);
    debugRect(posA.add(halfDelta), size, color, time, halfDelta.angle(), true);
}

/** Draw a debug combined axis aligned bounding box in world space
 *  @param {Vector2} posA
 *  @param {Vector2} sizeA
 *  @param {Vector2} posB
 *  @param {Vector2} sizeB
 *  @param {Color|string} [color]
 *  @memberof Debug */
function debugOverlap(posA, sizeA, posB, sizeB, color)
{
    const minPos = vec2(
        min(posA.x - sizeA.x/2, posB.x - sizeB.x/2),
        min(posA.y - sizeA.y/2, posB.y - sizeB.y/2)
    );
    const maxPos = vec2(
        max(posA.x + sizeA.x/2, posB.x + sizeB.x/2),
        max(posA.y + sizeA.y/2, posB.y + sizeB.y/2)
    );
    debugRect(minPos.lerp(maxPos,.5), maxPos.subtract(minPos), color);
}

/** Draw a debug axis aligned bounding box in world space
 *  @param {string} text
 *  @param {Vector2} pos
 *  @param {number} [size]
 *  @param {Color|string} [color]
 *  @param {number} [time]
 *  @param {number} [angle]
 *  @param {string} [font]
 *  @memberof Debug */
function debugText(text, pos, size=1, color=WHITE, time=0, angle=0, font='monospace')
{
    if (isColor(color))
        color = color.toString();
    pos = pos.copy();
    const timer = new Timer(time);
    debugPrimitives.push({text, pos, size, color, timer, angle, font});
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

            if (p.text !== undefined)
            {
                overlayContext.font = p.size*cameraScale + 'px '+ p.font;
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
                    const p2 = point.scale(cameraScale).floor();
                    overlayContext.lineTo(p2.x, p2.y);
                }
                overlayContext.closePath();
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }
            else if (p.size === 0 || (p.size.x === 0 && p.size.y === 0))
            {
                // point
                overlayContext.fillRect(-pointSize/2, -1, pointSize, 3);
                overlayContext.fillRect(-1, -pointSize/2, 3, pointSize);
            }
            else if (p.size.x !== undefined)
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
                overlayContext.arc(0, 0, p.size*cameraScale/2, 0, 9);
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