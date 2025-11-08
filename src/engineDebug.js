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
let debugPrimitives = [], debugPhysics = false, debugRaycast = false, debugParticles = false, debugGamepads = false, debugMedals = false, debugTakeScreenshot;

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
}

function debugUpdate()
{
    if (!debug) return;

    if (keyWasPressed(debugKey)) // Esc
        debugOverlay = !debugOverlay;
    if (debugOverlay)
    {
        if (keyWasPressed('Digit0'))
            debugWatermark = !debugWatermark;
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
            debugContext.fillText('Draw Count: ' + drawCount, x, y += h);
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
        }

        debugContext.restore();
    }
}

function debugRenderPost()
{
    if (debugVideoCaptureIsActive())
    {
        debugVideoCaptureUpdate();
        return;
    }

    if (!debugWatermark) return;
    
    // update fps display
    mainContext.textAlign = 'right';
    mainContext.textBaseline = 'top';
    mainContext.font = '1em monospace';
    mainContext.fillStyle = '#000';
    const text = engineName + ' v' + engineVersion + ' / '
        + drawCount + ' / ' + engineObjects.length + ' / ' + averageFPS.toFixed(1)
        + (glEnable ? ' GL' : ' 2D') ;
    mainContext.fillText(text, mainCanvas.width-3, 3);
    mainContext.fillStyle = '#fff';
    mainContext.fillText(text, mainCanvas.width-2, 2);
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

    let audioStreamDestination, silentAudioSource;
    if (soundEnable)
    {
        // create silent audio source
        // fixes issue where video can not start recording without audio
        silentAudioSource = new ConstantSourceNode(audioContext, { offset: 0 });
        silentAudioSource.connect(audioMasterGain);
        silentAudioSource.start();

        // connect to audio master gain node
        audioStreamDestination = audioContext.createMediaStreamDestination();
        audioMasterGain.connect(audioStreamDestination);
        for (const track of audioStreamDestination.stream.getAudioTracks())
            stream.addTrack(track); // add audio tracks to capture stream
    }

    // start recording
    try { mediaRecorder.start(); }
    catch(e)
    {
        LOG('Video capture not supported in this browser!');
        silentAudioSource?.stop();
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
        audioStreamDestination
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