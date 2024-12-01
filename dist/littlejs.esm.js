// LittleJS - MIT License - Copyright 2021 Frank Force

'use strict';

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
 *  @type {Boolean}
 *  @default
 *  @memberof Debug */
const debug = true;

/** True if asserts are enaled
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
    ASSERT(typeof color == 'string', 'pass in css color strings'); 
    debugPrimitives.push({pos, size:vec2(size), color, time:new Timer(time), angle, fill});
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
    onunhandledrejection = (event)=>showError(event.reason);
    onerror = (event, source, lineno, colno)=>
        showError(`${event}\n${source}\nLn ${lineno}, Col ${colno}`);

    const showError = (message)=>
    {
        // replace entire page with error message
        document.body.style.backgroundColor = '#111';
        document.body.innerHTML = `<pre style=color:#f00;font-size:50px>` + message;
    }
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
    }
}

function debugRender()
{
    glCopyToContext(mainContext);

    if (debugTakeScreenshot)
    {
        // composite canvas
        glCopyToContext(mainContext, true);
        mainContext.drawImage(overlayCanvas, 0, 0);
        overlayCanvas.width |= 0;

        // remove alpha and save
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
/**
 * LittleJS Utility Classes and Functions
 * - General purpose math library
 * - Vector2 - fast, simple, easy 2D vector class
 * - Color - holds a rgba color with some math functions
 * - Timer - tracks time automatically
 * - RandomGenerator - seeded random number generator
 * @namespace Utilities
 */



/** A shortcut to get Math.PI
 *  @type {Number}
 *  @default Math.PI
 *  @memberof Utilities */
const PI = Math.PI;

/** Returns absoulte value of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function abs(value) { return Math.abs(value); }

/** Returns lowest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function min(valueA, valueB) { return Math.min(valueA, valueB); }

/** Returns highest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function max(valueA, valueB) { return Math.max(valueA, valueB); }

/** Returns the sign of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function sign(value) { return Math.sign(value); }

/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {Number} dividend
 *  @param {Number} [divisor]
 *  @return {Number}
 *  @memberof Utilities */
function mod(dividend, divisor=1) { return ((dividend % divisor) + divisor) % divisor; }

/** Clamps the value beween max and min
 *  @param {Number} value
 *  @param {Number} [min]
 *  @param {Number} [max]
 *  @return {Number}
 *  @memberof Utilities */
function clamp(value, min=0, max=1) { return value < min ? min : value > max ? max : value; }

/** Returns what percentage the value is between valueA and valueB
 *  @param {Number} value
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function percent(value, valueA, valueB)
{ return (valueB-=valueA) ? clamp((value-valueA)/valueB) : 0; }

/** Linearly interpolates between values passed in using percent
 *  @param {Number} percent
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
function lerp(percent, valueA, valueB) { return valueA + clamp(percent) * (valueB-valueA); }

/** Returns signed wrapped distance between the two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @param {Number} [wrapSize]
 *  @returns {Number}
 *  @memberof Utilities */
function distanceWrap(valueA, valueB, wrapSize=1)
{ const d = (valueA - valueB) % wrapSize; return d*2 % wrapSize - d; }

/** Linearly interpolates between values passed in with wrapping
 *  @param {Number} percent
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @param {Number} [wrapSize]
 *  @returns {Number}
 *  @memberof Utilities */
function lerpWrap(percent, valueA, valueB, wrapSize=1)
{ return valueB + clamp(percent) * distanceWrap(valueA, valueB, wrapSize); }

/** Returns signed wrapped distance between the two angles passed in
 *  @param {Number} angleA
 *  @param {Number} angleB
 *  @returns {Number}
 *  @memberof Utilities */
function distanceAngle(angleA, angleB) { return distanceWrap(angleA, angleB, 2*PI); }

/** Linearly interpolates between the angles passed in with wrapping
 *  @param {Number} percent
 *  @param {Number} angleA
 *  @param {Number} angleB
 *  @returns {Number}
 *  @memberof Utilities */
function lerpAngle(percent, angleA, angleB) { return lerpWrap(percent, angleA, angleB, 2*PI); }

/** Applies smoothstep function to the percentage value
 *  @param {Number} percent
 *  @return {Number}
 *  @memberof Utilities */
function smoothStep(percent) { return percent * percent * (3 - 2 * percent); }

/** Returns the nearest power of two not less then the value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
function nearestPowerOfTwo(value) { return 2**Math.ceil(Math.log2(value)); }

/** Returns true if two axis aligned bounding boxes are overlapping 
 *  @param {Vector2} posA          - Center of box A
 *  @param {Vector2} sizeA         - Size of box A
 *  @param {Vector2} posB          - Center of box B
 *  @param {Vector2} [sizeB=(0,0)] - Size of box B, a point if undefined
 *  @return {Boolean}              - True if overlapping
 *  @memberof Utilities */
function isOverlapping(posA, sizeA, posB, sizeB=vec2())
{ 
    return abs(posA.x - posB.x)*2 < sizeA.x + sizeB.x 
        && abs(posA.y - posB.y)*2 < sizeA.y + sizeB.y;
}

/** Returns true if a line segment is intersecting an axis aligned box
 *  @param {Vector2} start - Start of raycast
 *  @param {Vector2} end   - End of raycast
 *  @param {Vector2} pos   - Center of box
 *  @param {Vector2} size  - Size of box
 *  @return {Boolean}      - True if intersecting
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
 *  @param {Number} [frequency] - Frequency of the wave in Hz
 *  @param {Number} [amplitude] - Amplitude (max height) of the wave
 *  @param {Number} [t=time]    - Value to use for time of the wave
 *  @return {Number}            - Value waving between 0 and amplitude
 *  @memberof Utilities */
function wave(frequency=1, amplitude=1, t=time)
{ return amplitude/2 * (1 - Math.cos(t*frequency*2*PI)); }

/** Formats seconds to mm:ss style for display purposes 
 *  @param {Number} t - time in seconds
 *  @return {String}
 *  @memberof Utilities */
function formatTime(t) { return (t/60|0) + ':' + (t%60<10?'0':'') + (t%60|0); }

///////////////////////////////////////////////////////////////////////////////

/** Random global functions
 *  @namespace Random */

/** Returns a random value between the two values passed in
 *  @param {Number} [valueA]
 *  @param {Number} [valueB]
 *  @return {Number}
 *  @memberof Random */
function rand(valueA=1, valueB=0) { return valueB + Math.random() * (valueA-valueB); }

/** Returns a floored random value between the two values passed in
 *  The upper bound is exclusive. (If 2 is passed in, result will be 0 or 1)
 *  @param {Number} valueA
 *  @param {Number} [valueB]
 *  @return {Number}
 *  @memberof Random */
function randInt(valueA, valueB=0) { return Math.floor(rand(valueA,valueB)); }

/** Randomly returns either -1 or 1
 *  @return {Number}
 *  @memberof Random */
function randSign() { return randInt(2) * 2 - 1; }

/** Returns a random Vector2 with the passed in length
 *  @param {Number} [length]
 *  @return {Vector2}
 *  @memberof Random */
function randVector(length=1) { return new Vector2().setAngle(rand(2*PI), length); }

/** Returns a random Vector2 within a circular shape
 *  @param {Number} [radius]
 *  @param {Number} [minRadius]
 *  @return {Vector2}
 *  @memberof Random */
function randInCircle(radius=1, minRadius=0)
{ return radius > 0 ? randVector(radius * rand(minRadius / radius, 1)**.5) : new Vector2; }

/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=(1,1,1,1)]
 *  @param {Color}   [colorB=(0,0,0,1)]
 *  @param {Boolean} [linear]
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
     *  @param {Number} seed - Starting seed */
    constructor(seed)
    {
        /** @property {Number} - random seed */
        this.seed = seed;
    }

    /** Returns a seeded random value between the two values passed in
    *  @param {Number} [valueA]
    *  @param {Number} [valueB]
    *  @return {Number} */
    float(valueA=1, valueB=0)
    {
        // xorshift algorithm
        this.seed ^= this.seed << 13; 
        this.seed ^= this.seed >>> 17; 
        this.seed ^= this.seed << 5;
        return valueB + (valueA - valueB) * abs(this.seed % 1e8) / 1e8;
    }

    /** Returns a floored seeded random value the two values passed in
    *  @param {Number} valueA
    *  @param {Number} [valueB]
    *  @return {Number} */
    int(valueA, valueB=0) { return Math.floor(this.float(valueA, valueB)); }

    /** Randomly returns either -1 or 1 deterministically
    *  @return {Number} */
    sign() { return this.float() > .5 ? 1 : -1; }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
 * @param {(Number|Vector2)} [x]
 * @param {Number} [y]
 * @return {Vector2}
 * @example
 * let a = vec2(0, 1); // vector with coordinates (0, 1)
 * let b = vec2(a);    // copy a into b
 * a = vec2(5);        // set a to (5, 5)
 * b = vec2();         // set b to (0, 0)
 * @memberof Utilities
 */
function vec2(x=0, y)
{
    return typeof x == 'number' ? 
        new Vector2(x, y == undefined? x : y) : 
        new Vector2(x.x, x.y);
}

/** 
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {Boolean}
 * @memberof Utilities
 */
function isVector2(v) { return v instanceof Vector2; }

/** 
 * 2D Vector object with vector math library
 * - Functions do not change this so they can be chained together
 * @example
 * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
 * let b = new Vector2;       // vector with coordinates (0, 0)
 * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
 * let d = a.add(b).scale(5); // operators can be chained
 */
class Vector2
{
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {Number} [x] - X axis location
     *  @param {Number} [y] - Y axis location */
    constructor(x=0, y=0)
    {
        ASSERT(typeof x == 'number' && typeof y == 'number');
        /** @property {Number} - X axis location */
        this.x = x;
        /** @property {Number} - Y axis location */
        this.y = y;
    }

    /** Sets values of this vector and returns self
     *  @param {Number} [x] - X axis location
     *  @param {Number} [y] - Y axis location
     *  @return {Vector2} */
    set(x=0, y=0) { this.x=x; this.y=y; return this; }

    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    copy() { return new Vector2(this.x, this.y); }

    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    add(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    subtract(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    multiply(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x * v.x, this.y * v.y);
    }

    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} v - other vector
     *  @return {Vector2} */
    divide(v)
    {
        ASSERT(isVector2(v));
        return new Vector2(this.x / v.x, this.y / v.y);
    }

    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {Number} s - scale
     *  @return {Vector2} */
    scale(s)
    {
        ASSERT(!isVector2(s));
        return new Vector2(this.x * s, this.y * s);
    }

    /** Returns the length of this vector
     * @return {Number} */
    length() { return this.lengthSquared()**.5; }

    /** Returns the length of this vector squared
     * @return {Number} */
    lengthSquared() { return this.x**2 + this.y**2; }

    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    distance(v)
    {
        ASSERT(isVector2(v));
        return this.distanceSquared(v)**.5;
    }

    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    distanceSquared(v)
    {
        ASSERT(isVector2(v));
        return (this.x - v.x)**2 + (this.y - v.y)**2;
    }

    /** Returns a new vector in same direction as this one with the length passed in
     * @param {Number} [length]
     * @return {Vector2} */
    normalize(length=1)
    {
        const l = this.length();
        return l ? this.scale(length/l) : new Vector2(0, length);
    }

    /** Returns a new vector clamped to length passed in
     * @param {Number} [length]
     * @return {Vector2} */
    clampLength(length=1)
    {
        const l = this.length();
        return l > length ? this.scale(length/l) : this;
    }

    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    dot(v)
    {
        ASSERT(isVector2(v));
        return this.x*v.x + this.y*v.y;
    }

    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} v - other vector
     * @return {Number} */
    cross(v)
    {
        ASSERT(isVector2(v));
        return this.x*v.y - this.y*v.x;
    }

    /** Returns the angle of this vector, up is angle 0
     * @return {Number} */
    angle() { return Math.atan2(this.x, this.y); }

    /** Sets this vector with angle and length passed in
     * @param {Number} [angle]
     * @param {Number} [length]
     * @return {Vector2} */
    setAngle(angle=0, length=1) 
    {
        this.x = length*Math.sin(angle);
        this.y = length*Math.cos(angle);
        return this;
    }

    /** Returns copy of this vector rotated by the angle passed in
     * @param {Number} angle
     * @return {Vector2} */
    rotate(angle)
    { 
        const c = Math.cos(angle), s = Math.sin(angle); 
        return new Vector2(this.x*c - this.y*s, this.x*s + this.y*c);
    }

    /** Set the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @param {Number} [direction]
     * @param {Number} [length] */
    setDirection(direction, length=1)
    {
        direction = mod(direction, 4);
        ASSERT(direction==0 || direction==1 || direction==2 || direction==3);
        return vec2(direction%2 ? direction-1 ? -length : length : 0, 
            direction%2 ? 0 : direction ? -length : length);
    }

    /** Returns the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @return {Number} */
    direction()
    { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

    /** Returns a copy of this vector that has been inverted
     * @return {Vector2} */
    invert() { return new Vector2(this.y, -this.x); }

    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    floor() { return new Vector2(Math.floor(this.x), Math.floor(this.y)); }

    /** Returns the area this vector covers as a rectangle
     * @return {Number} */
    area() { return abs(this.x * this.y); }

    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} v - other vector
     * @param {Number}  percent
     * @return {Vector2} */
    lerp(v, percent)
    {
        ASSERT(isVector2(v));
        return this.add(v.subtract(this).scale(clamp(percent)));
    }

    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {Boolean} */
    arrayCheck(arraySize)
    {
        ASSERT(isVector2(arraySize));
        return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y;
    }

    /** Returns this vector expressed as a string
     * @param {Number} digits - precision to display
     * @return {String} */
    toString(digits=3) 
    {
        if (debug)
            return `(${(this.x<0?'':' ') + this.x.toFixed(digits)},${(this.y<0?'':' ') + this.y.toFixed(digits)} )`;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Create a color object with RGBA values, white by default
 * @param {Number} [r=1] - red
 * @param {Number} [g=1] - green
 * @param {Number} [b=1] - blue
 * @param {Number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities
 */
function rgb(r, g, b, a) { return new Color(r, g, b, a); }

/** 
 * Create a color object with HSLA values, white by default
 * @param {Number} [h=0] - hue
 * @param {Number} [s=0] - saturation
 * @param {Number} [l=1] - lightness
 * @param {Number} [a=1] - alpha
 * @return {Color}
 * @memberof Utilities
 */
function hsl(h, s, l, a) { return new Color().setHSLA(h, s, l, a); }

/** 
 * Check if object is a valid Color
 * @param {any} c
 * @return {Boolean}
 * @memberof Utilities
 */
function isColor(c) { return c instanceof Color; }

/** 
 * Color object (red, green, blue, alpha) with some helpful functions
 * @example
 * let a = new Color;              // white
 * let b = new Color(1, 0, 0);     // red
 * let c = new Color(0, 0, 0, 0);  // transparent black
 * let d = rgb(0, 0, 1);           // blue using rgb color
 * let e = hsl(.3, 1, .5);         // green using hsl color
 */
class Color
{
    /** Create a color with the rgba components passed in, white by default
     *  @param {Number} [r] - red
     *  @param {Number} [g] - green
     *  @param {Number} [b] - blue
     *  @param {Number} [a] - alpha*/
    constructor(r=1, g=1, b=1, a=1)
    {
        /** @property {Number} - Red */
        this.r = r;
        /** @property {Number} - Green */
        this.g = g;
        /** @property {Number} - Blue */
        this.b = b;
        /** @property {Number} - Alpha */
        this.a = a;
    }

    /** Sets values of this color and returns self
     *  @param {Number} [r] - red
     *  @param {Number} [g] - green
     *  @param {Number} [b] - blue
     *  @param {Number} [a] - alpha
     *  @return {Color} */
    set(r=1, g=1, b=1, a=1)
    { this.r=r; this.g=g; this.b=b; this.a=a; return this; }

    /** Returns a new color that is a copy of this
     * @return {Color} */
    copy() { return new Color(this.r, this.g, this.b, this.a); }

    /** Returns a copy of this color plus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    add(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a);
    }

    /** Returns a copy of this color minus the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    subtract(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a);
    }

    /** Returns a copy of this color times the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    multiply(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a);
    }

    /** Returns a copy of this color divided by the color passed in
     * @param {Color} c - other color
     * @return {Color} */
    divide(c)
    {
        ASSERT(isColor(c));
        return new Color(this.r/c.r, this.g/c.g, this.b/c.b, this.a/c.a);
    }

    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {Number} scale
     * @param {Number} [alphaScale=scale]
     * @return {Color} */
    scale(scale, alphaScale=scale) 
    { return new Color(this.r*scale, this.g*scale, this.b*scale, this.a*alphaScale); }

    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    clamp() { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }

    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color}  c - other color
     * @param {Number} percent
     * @return {Color} */
    lerp(c, percent)
    {
        ASSERT(isColor(c));
        return this.add(c.subtract(this).scale(clamp(percent)));
    }

    /** Sets this color given a hue, saturation, lightness, and alpha
     * @param {Number} [h] - hue
     * @param {Number} [s] - saturation
     * @param {Number} [l] - lightness
     * @param {Number} [a] - alpha
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
        return this;
    }

    /** Returns this color expressed in hsla format
     * @return {Array} */
    HSLA()
    {
        const r = clamp(this.r);
        const g = clamp(this.g);
        const b = clamp(this.b);
        const a = clamp(this.a);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        
        let h = 0, s = 0;
        if (max != min)
        {
            let d = max - min;
            s = l > .5 ? d / (2 - max - min) : d / (max + min);
            if (r == max)
                h = (g - b) / d + (g < b ? 6 : 0);
            else if (g == max)
                h = (b - r) / d + 2;
            else if (b == max)
                h =  (r - g) / d + 4;
        }

        return [h / 6, s, l, a];
    }

    /** Returns a new color that has each component randomly adjusted
     * @param {Number} [amount]
     * @param {Number} [alphaAmount]
     * @return {Color} */
    mutate(amount=.05, alphaAmount=0) 
    {
        return new Color
        (
            this.r + rand(amount, -amount),
            this.g + rand(amount, -amount),
            this.b + rand(amount, -amount),
            this.a + rand(alphaAmount, -alphaAmount)
        ).clamp();
    }

    /** Returns this color expressed as a hex color code
     * @param {Boolean} [useAlpha] - if alpha should be included in result
     * @return {String} */
    toString(useAlpha = true)      
    { 
        const toHex = (c)=> ((c=clamp(c)*255|0)<16 ? '0' : '') + c.toString(16);
        return '#' + toHex(this.r) + toHex(this.g) + toHex(this.b) + (useAlpha ? toHex(this.a) : '');
    }
    
    /** Set this color from a hex code
     * @param {String} hex - html hex code
     * @return {Color} */
    setHex(hex)
    {
        const fromHex = (c)=> clamp(parseInt(hex.slice(c,c+2),16)/255);
        this.r = fromHex(1);
        this.g = fromHex(3),
        this.b = fromHex(5);
        this.a = hex.length > 7 ? fromHex(7) : 1;
        return this;
    }
    
    /** Returns this color expressed as 32 bit RGBA value
     * @return {Number} */
    rgbaInt()  
    {
        const r = clamp(this.r)*255|0;
        const g = clamp(this.g)*255<<8;
        const b = clamp(this.b)*255<<16;
        const a = clamp(this.a)*255<<24;
        return r + g + b + a;
    }
}

///////////////////////////////////////////////////////////////////////////////
// default colors

/** Color - White
 *  @type {Color}
 *  @memberof Utilities */
const WHITE = rgb();

/** Color - Black
 *  @type {Color}
 *  @memberof Utilities */
const BLACK = rgb(0,0,0);

/** Color - Gray
 *  @type {Color}
 *  @memberof Utilities */
const GRAY = rgb(.5,.5,.5);

/** Color - Red
 *  @type {Color}
 *  @memberof Utilities */
const RED = rgb(1,0,0);

/** Color - Orange
 *  @type {Color}
 *  @memberof Utilities */
const ORANGE = rgb(1,.5,0);

/** Color - Yellow
 *  @type {Color}
 *  @memberof Utilities */
const YELLOW = rgb(1,1,0);

/** Color - Green
 *  @type {Color}
 *  @memberof Utilities */
const GREEN = rgb(0,1,0);

/** Color - Cyan
 *  @type {Color}
 *  @memberof Utilities */
const CYAN = rgb(0,1,1);

/** Color - Blue
 *  @type {Color}
 *  @memberof Utilities */
const BLUE = rgb(0,0,1);

/** Color - Purple
 *  @type {Color}
 *  @memberof Utilities */
const PURPLE = rgb(.5,0,1);

/** Color - Magenta
 *  @type {Color}
 *  @memberof Utilities */
const MAGENTA = rgb(1,0,1);

///////////////////////////////////////////////////////////////////////////////

/**
 * Timer object tracks how long has passed since it was set
 * @example
 * let a = new Timer;    // creates a timer that is not set
 * a.set(3);             // sets the timer to 3 seconds
 *
 * let b = new Timer(1); // creates a timer with 1 second left
 * b.unset();            // unsets the timer
 */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {Number} [timeLeft] - How much time left before the timer elapses in seconds */
    constructor(timeLeft) { this.time = timeLeft == undefined ? undefined : time + timeLeft; this.setTime = timeLeft; }

    /** Set the timer with seconds passed in
     *  @param {Number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0) { this.time = time + timeLeft; this.setTime = timeLeft; }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {Boolean} */
    isSet() { return this.time != undefined; }

    /** Returns true if set and has not elapsed
     * @return {Boolean} */
    active() { return time < this.time; }

    /** Returns true if set and elapsed
     * @return {Boolean} */
    elapsed() { return time >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {Number} */
    get() { return this.isSet()? time - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {Number} */
    getPercent() { return this.isSet()? percent(this.time - time, this.setTime, 0) : 0; }
    
    /** Returns this timer expressed as a string
     * @return {String} */
    toString() { if (debug) { return this.isSet() ? Math.abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }}
    
    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {Number} */
    valueOf()               { return this.get(); }
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

/** Scale of camera in world space
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let cameraScale = 32;

///////////////////////////////////////////////////////////////////////////////
// Display settings

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

/** Disables filtering for crisper pixel art if true
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let canvasPixelated = true;

/** Default font used for text rendering
 *  @type {String}
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

/** Enable to show the LittleJS splash screen be shown on startup
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let showSplashScreen = false;

/** Disables all rendering, audio, and input for servers
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let headlessMode = false;

///////////////////////////////////////////////////////////////////////////////
// WebGL settings

/** Enable webgl rendering, webgl can be disabled and removed from build (with some features disabled)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let glEnable = true;

/** Fixes slow rendering in some browsers by not compositing the WebGL canvas
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let glOverlay = true;

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2}
 *  @default Vector2(16,16)
 *  @memberof Settings */
let tileSizeDefault = vec2(16);

/** How many pixels smaller to draw tiles to prevent bleeding from neighbors
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let tileFixBleedScale = 0;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Enable physics solver for collisions between objects
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = true;

/** Default object mass for collision calcuations (how heavy objects are)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = 1;

/** How much to slow angular velocity each frame (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = 1;

/** How much to bounce when a collision occurs (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultElasticity = 0;

/** How much to slow when touching (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects along the Y axis, negative is down
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let gravity = 0;

/** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let particleEmitRateScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let gamepadsEnable = true;

/** If true, the dpad input is also routed to the left analog stick (for better accessability)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let gamepadDirectionEmulateStick = true;

/** If true the WASD keys are also routed to the direction keys (for better accessability)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let inputWASDEmulateDirection = true;

/** True if touch input is enabled for mobile devices
 *  - Touch events will be routed to mouse events
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let touchInputEnable = true;

/** True if touch gamepad should appear on mobile devices
 *  - Supports left analog stick, 4 face buttons and start button (button 9)
 *  - Must be set by end of gameInit to be activated
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = false;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = true;

/** Size of virtual gamepad for touch devices in pixels
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 99;

/** Transparency of touch gamepad overlay
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

/** Allow vibration hardware if it exists
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let vibrateEnable = true;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** All audio code can be disabled and removed from build
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let soundEnable = true;

/** Volume scale to apply to all sound, music and speech
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundVolume = .3;

/** Default range where sound no longer plays
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundDefaultRange = 40;

/** Default range percent to start tapering off sound (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundDefaultTaper = .7;

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Size of medal display
 *  @type {Vector2}
 *  @default Vector2(640,80)
 *  @memberof Settings */
let medalDisplaySize = vec2(640, 80);

/** Size of icon in medal display
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplayIconSize = 50;

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let medalsPreventUnlock = false;

///////////////////////////////////////////////////////////////////////////////
// Setters for global variables

/** Set position of camera in world space
 *  @param {Vector2} pos
 *  @memberof Settings */
function setCameraPos(pos) { cameraPos = pos; }

/** Set scale of camera in world space
 *  @param {Number} scale
 *  @memberof Settings */
function setCameraScale(scale) { cameraScale = scale; }

/** Set max size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasMaxSize(size) { canvasMaxSize = size; }

/** Set fixed size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasFixedSize(size) { canvasFixedSize = size; }

/** Disables anti aliasing for pixel art if true
 *  @param {Boolean} pixelated
 *  @memberof Settings */
function setCanvasPixelated(pixelated) { canvasPixelated = pixelated; }

/** Set default font used for text rendering
 *  @param {String} font
 *  @memberof Settings */
function setFontDefault(font) { fontDefault = font; }

/** Set if the LittleJS splash screen be shown on startup
 *  @param {Boolean} show
 *  @memberof Settings */
function setShowSplashScreen(show) { showSplashScreen = show; }

/** Set to disalbe rendering, audio, and input for servers
 *  @param {Boolean} headless
 *  @memberof Settings */
function setHeadlessMode(headless) { headlessMode = headless; }

/** Set if webgl rendering is enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGlEnable(enable) { glEnable = enable; }

/** Set to not composite the WebGL canvas
 *  @param {Boolean} overlay
 *  @memberof Settings */
function setGlOverlay(overlay) { glOverlay = overlay; }

/** Set default size of tiles in pixels
 *  @param {Vector2} size
 *  @memberof Settings */
function setTileSizeDefault(size) { tileSizeDefault = size; }

/** Set to prevent tile bleeding from neighbors in pixels
 *  @param {Number} scale
 *  @memberof Settings */
function setTileFixBleedScale(scale) { tileFixBleedScale = scale; }

/** Set if collisions between objects are enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setEnablePhysicsSolver(enable) { enablePhysicsSolver = enable; }

/** Set default object mass for collison calcuations
 *  @param {Number} mass
 *  @memberof Settings */
function setObjectDefaultMass(mass) { objectDefaultMass = mass; }

/** Set how much to slow velocity by each frame
 *  @param {Number} damp
 *  @memberof Settings */
function setObjectDefaultDamping(damp) { objectDefaultDamping = damp; }

/** Set how much to slow angular velocity each frame
 *  @param {Number} damp
 *  @memberof Settings */
function setObjectDefaultAngleDamping(damp) { objectDefaultAngleDamping = damp; }

/** Set how much to bounce when a collision occur
 *  @param {Number} elasticity
 *  @memberof Settings */
function setObjectDefaultElasticity(elasticity) { objectDefaultElasticity = elasticity; }

/** Set how much to slow when touching
 *  @param {Number} friction
 *  @memberof Settings */
function setObjectDefaultFriction(friction) { objectDefaultFriction = friction; }

/** Set max speed to avoid fast objects missing collisions
 *  @param {Number} speed
 *  @memberof Settings */
function setObjectMaxSpeed(speed) { objectMaxSpeed = speed; }

/** Set how much gravity to apply to objects along the Y axis
 *  @param {Number} newGravity
 *  @memberof Settings */
function setGravity(newGravity) { gravity = newGravity; }

/** Set to scales emit rate of particles
 *  @param {Number} scale
 *  @memberof Settings */
function setParticleEmitRateScale(scale) { particleEmitRateScale = scale; }

/** Set if gamepads are enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGamepadsEnable(enable) { gamepadsEnable = enable; }

/** Set if the dpad input is also routed to the left analog stick
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGamepadDirectionEmulateStick(enable) { gamepadDirectionEmulateStick = enable; }

/** Set if true the WASD keys are also routed to the direction keys
 *  @param {Boolean} enable
 *  @memberof Settings */
function setInputWASDEmulateDirection(enable) { inputWASDEmulateDirection = enable; }

/** Set if touch input is allowed
 *  @param {Boolean} enable
 *  @memberof Settings */
function setTouchInputEnable(enable) { touchInputEnable = enable; }

/** Set if touch gamepad should appear on mobile devices
 *  @param {Boolean} enable
 *  @memberof Settings */
function setTouchGamepadEnable(enable) { touchGamepadEnable = enable; }

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {Boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set size of virutal gamepad for touch devices in pixels
 *  @param {Number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {Number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

/** Set to allow vibration hardware if it exists
 *  @param {Boolean} enable
 *  @memberof Settings */
function setVibrateEnable(enable) { vibrateEnable = enable; }

/** Set to disable all audio code
 *  @param {Boolean} enable
 *  @memberof Settings */
function setSoundEnable(enable) { soundEnable = enable; }

/** Set volume scale to apply to all sound, music and speech
 *  @param {Number} volume
 *  @memberof Settings */
function setSoundVolume(volume)
{
    soundVolume = volume;
    if (soundEnable && !headlessMode && audioGainNode)
        audioGainNode.gain.value = volume; // update gain immediatly
}

/** Set default range where sound no longer plays
 *  @param {Number} range
 *  @memberof Settings */
function setSoundDefaultRange(range) { soundDefaultRange = range; }

/** Set default range percent to start tapering off sound
 *  @param {Number} taper
 *  @memberof Settings */
function setSoundDefaultTaper(taper) { soundDefaultTaper = taper; }

/** Set how long to show medals for in seconds
 *  @param {Number} time
 *  @memberof Settings */
function setMedalDisplayTime(time) { medalDisplayTime = time; }

/** Set how quickly to slide on/off medals in seconds
 *  @param {Number} time
 *  @memberof Settings */
function setMedalDisplaySlideTime(time) { medalDisplaySlideTime = time; }

/** Set size of medal display
 *  @param {Vector2} size
 *  @memberof Settings */
function setMedalDisplaySize(size) { medalDisplaySize = size; }

/** Set size of icon in medal display
 *  @param {Number} size
 *  @memberof Settings */
function setMedalDisplayIconSize(size) { medalDisplayIconSize = size; }

/** Set to stop medals from being unlockable
 *  @param {Boolean} preventUnlock
 *  @memberof Settings */
function setMedalsPreventUnlock(preventUnlock) { medalsPreventUnlock = preventUnlock; }

/** Set if watermark with FPS should be shown
 *  @param {Boolean} show
 *  @memberof Debug */
function setShowWatermark(show) { showWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {String} key
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
 * @example
 * // create an engine object, normally you would first extend the class with your own
 * const pos = vec2(2,3);
 * const object = new EngineObject(pos); 
 */
class EngineObject
{
    /** Create an engine object and adds it to the list of objects
     *  @param {Vector2}  [pos=(0,0)]       - World space position of the object
     *  @param {Vector2}  [size=(1,1)]      - World space size of the object
     *  @param {TileInfo} [tileInfo]        - Tile info to render object (undefined is untextured)
     *  @param {Number}   [angle]           - Angle the object is rotated by
     *  @param {Color}    [color=(1,1,1,1)] - Color to apply to tile when rendered
     *  @param {Number}   [renderOrder]     - Objects sorted by renderOrder before being rendered
     */
    constructor(pos=vec2(), size=vec2(1), tileInfo, angle=0, color=new Color, renderOrder=0)
    {
        // set passed in params
        ASSERT(isVector2(pos) && isVector2(size), 'ensure pos and size are vec2s');
        ASSERT(typeof tileInfo !== 'number' || !tileInfo, 'old style tile setup');

        /** @property {Vector2} - World space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - World space width and height of the object */
        this.size = size;
        /** @property {Vector2} - Size of object used for drawing, uses size if not set */
        this.drawSize = undefined;
        /** @property {TileInfo} - Tile info to render object (undefined is untextured) */
        this.tileInfo = tileInfo;
        /** @property {Number}  - Angle to rotate the object */
        this.angle = angle;
        /** @property {Color}   - Color to apply when rendered */
        this.color = color;
        /** @property {Color}   - Additive color to apply when rendered */
        this.additiveColor = undefined;
        /** @property {Boolean} - Should it flip along y axis when rendered */
        this.mirror = false;

        // physical properties
        /** @property {Number} [mass=objectDefaultMass]                 - How heavy the object is, static if 0 */
        this.mass         = objectDefaultMass;
        /** @property {Number} [damping=objectDefaultDamping]           - How much to slow down velocity each frame (0-1) */
        this.damping      = objectDefaultDamping;
        /** @property {Number} [angleDamping=objectDefaultAngleDamping] - How much to slow down rotation each frame (0-1) */
        this.angleDamping = objectDefaultAngleDamping;
        /** @property {Number} [elasticity=objectDefaultElasticity]     - How bouncy the object is when colliding (0-1) */
        this.elasticity   = objectDefaultElasticity;
        /** @property {Number} [friction=objectDefaultFriction]         - How much friction to apply when sliding (0-1) */
        this.friction     = objectDefaultFriction;
        /** @property {Number}  - How much to scale gravity by for this object */
        this.gravityScale = 1;
        /** @property {Number}  - Objects are sorted by render order */
        this.renderOrder = renderOrder;
        /** @property {Vector2} - Velocity of the object */
        this.velocity = vec2();
        /** @property {Number}  - Angular velocity of the object */
        this.angleVelocity = 0;
        /** @property {Number}  - Track when object was created  */
        this.spawnTime = time;
        /** @property {Array}   - List of children of this object */
        this.children = [];
        /** @property {Boolean}  - Limit object speed using linear or circular math */
        this.clampSpeedLinear = true;

        // parent child system
        /** @property {EngineObject} - Parent of object if in local space  */
        this.parent = undefined;
        /** @property {Vector2}      - Local position if child */
        this.localPos = vec2();
        /** @property {Number}       - Local angle if child  */
        this.localAngle = 0;

        // collision flags
        /** @property {Boolean} - Object collides with the tile collision */
        this.collideTiles = false;
        /** @property {Boolean} - Object collides with solid objects */
        this.collideSolidObjects = false;
        /** @property {Boolean} - Object collides with and blocks other objects */
        this.isSolid = false;
        /** @property {Boolean} - Object collides with raycasts */
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
            this.pos = this.localPos.multiply(vec2(mirror,1)).rotate(-parent.angle).add(parent.pos);
            this.angle = mirror*this.localAngle + parent.angle;
        }

        // update children
        for (const child of this.children)
            child.updateTransforms();
    }

    /** Update the object physics, called automatically by engine once each frame */
    update()
    {
        // child objects do not have physics
        if (this.parent)
            return;

        // limit max speed to prevent missing collisions
        if (this.clampSpeedLinear)
        {
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }
        else
        {
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }

        // apply physics
        const oldPos = this.pos.copy();
        this.velocity.x *= this.damping;
        this.velocity.y *= this.damping;
        if (this.mass) // dont apply gravity to static objects
            this.velocity.y += gravity * this.gravityScale;
        this.pos.x += this.velocity.x;
        this.pos.y += this.velocity.y;
        this.angle += this.angleVelocity *= this.angleDamping;

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);
        if (!enablePhysicsSolver || !this.mass) // dont do collision for static objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugOverlay && debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = .001; // necessary to push slightly outside of the collision
            for (const o of engineObjectsCollide)
            {
                // non solid objects don't collide with eachother
                if (!this.isSolid && !o.isSolid || o.destroyed || o.parent || o == this)
                    continue;

                // check collision
                if (!isOverlapping(this.pos, this.size, o.pos, o.size))
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
                    const velocity = length < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                        
                    debugOverlay && debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sizeBoth = this.size.add(o.size);
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sizeBoth.y + gravity; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sizeBoth.y;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sizeBoth.x;
                const elasticity = max(this.elasticity, o.elasticity);
                
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sizeBoth.y/2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -elasticity;
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

                        // lerp betwen elastic or inelastic based on elasticity
                        this.velocity.y = lerp(elasticity, inelastic, elastic0);
                        o.velocity.y = lerp(elasticity, inelastic, elastic1);
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

                        // lerp betwen elastic or inelastic based on elasticity
                        this.velocity.x = lerp(elasticity, inelastic, elastic0);
                        o.velocity.x = lerp(elasticity, inelastic, elastic1);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -elasticity;
                }
                debugOverlay && debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this))
            {
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedY = tileCollisionTest(vec2(oldPos.x, this.pos.y), this.size, this);
                    const isBlockedX = tileCollisionTest(vec2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX)
                    {
                        // bounce velocity
                        this.velocity.y *= -this.elasticity;

                        // set if landed on ground
                        if (this.groundObject = wasMovingDown)
                        {
                            // adjust position to slightly above nearest tile boundary
                            // this prevents gap between object and ground
                            const epsilon = .0001;
                            this.pos.y = (oldPos.y-this.size.y/2|0)+this.size.y/2+epsilon;
                        }
                        else
                        {
                            // move to previous position
                            this.pos.y = oldPos.y;
                        }
                    }
                    if (isBlockedX)
                    {
                        // move to previous position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                    debugOverlay && debugPhysics && debugRect(this.pos, this.size, '#f00');
                }
            }
        }
    }
       
    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileInfo, this.color, this.angle, this.mirror, this.additiveColor);
    }
    
    /** Destroy this object, destroy it's children, detach it's parent, and mark it for removal */
    destroy()
    { 
        if (this.destroyed)
            return;
        
        // disconnect from parent and destroy chidren
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
            child.destroy(child.parent = 0);
    }

    /** Convert from local space to world space
     *  @param {Vector2} pos - local space point */
    localToWorld(pos) { return this.pos.add(pos.rotate(-this.angle)); }

    /** Convert from world space to local space
     *  @param {Vector2} pos - world space point */
    worldToLocal(pos) { return pos.subtract(this.pos).rotate(this.angle); }

    /** Convert from local space to world space for a vector (rotation only)
     *  @param {Vector2} vec - local space vector */
    localToWorldVector(vec) { return vec.rotate(this.angle); }

    /** Convert from world space to local space for a vector (rotation only)
     *  @param {Vector2} vec - world space vector */
    worldToLocalVector(vec) { return vec.rotate(-this.angle); }
    
    /** Called to check if a tile collision should be resolved
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos      - tile where the collision occured
     *  @return {Boolean}         - true if the collision should be resolved */
    collideWithTile(tileData, pos)    { return tileData > 0; }

    /** Called to check if a object collision should be resolved
     *  @param {EngineObject} object - the object to test against
     *  @return {Boolean}            - true if the collision should be resolved
     */
    collideWithObject(object)         { return true; }

    /** How long since the object was created
     *  @return {Number} */
    getAliveTime()                    { return time - this.spawnTime; }

    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    applyAcceleration(acceleration)   { if (this.mass) this.velocity = this.velocity.add(acceleration); }

    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    applyForce(force)	              { this.applyAcceleration(force.scale(1/this.mass)); }
    
    /** Get the direction of the mirror
     *  @return {Number} -1 if this.mirror is true, or 1 if not mirrored */
    getMirrorSign() { return this.mirror ? -1 : 1; }

    /** Attaches a child to this with a given local transform
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=(0,0)]
     *  @param {Number}       [localAngle] */
    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }

    /** Removes a child from this one
     *  @param {EngineObject} child */
    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    /** Set how this object collides
     *  @param {Boolean} [collideSolidObjects] - Does it collide with solid objects?
     *  @param {Boolean} [isSolid]             - Does it collide with and block other objects? (expensive in large numbers)
     *  @param {Boolean} [collideTiles]        - Does it collide with the tile collision?
     *  @param {Boolean} [collideRaycast]      - Does it collide with raycasts? */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=true, collideRaycast=true)
    {
        ASSERT(collideSolidObjects || !isSolid, 'solid objects must be set to collide');

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
        this.collideRaycast = collideRaycast;
    }

    /** Returns string containg info about this object for debugging
     *  @return {String} */
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
        if (debug)
        {
            // show object info for debugging
            const size = vec2(max(this.size.x, .2), max(this.size.y, .2));
            const color1 = rgb(this.collideTiles?1:0, this.collideSolidObjects?1:0, this.isSolid?1:0, this.parent?.2:.5);
            const color2 = this.parent ? rgb(1,1,1,.5) : rgb(0,0,0,.8);
            drawRect(this.pos, size, color1, this.angle, false);
            drawRect(this.pos, size.scale(.8), color2, this.angle, false);
            this.parent && drawLine(this.pos, this.parent.pos, .1, rgb(0,0,1,.5), false);
        }
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

/** The size of the main canvas (and other secondary canvases) 
 *  @type {Vector2}
 *  @memberof Draw */
let mainCanvasSize = vec2();

/** Array containing texture info for batch rendering system
 *  @type {Array}
 *  @memberof Draw */
let textureInfos = [];

// Keep track of how many draw calls there were each frame for debugging
let drawCount;

///////////////////////////////////////////////////////////////////////////////

/** 
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {(Number|Vector2)} [pos=0]                - Index of tile in sheet
 * @param {(Number|Vector2)} [size=tileSizeDefault] - Size of tile in pixels
 * @param {Number} [textureIndex]                   - Texture index to use
 * @param {Number} [padding]                        - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw
 */
function tile(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
{
    if (headlessMode)
        return new TileInfo;

    // if size is a number, make it a vector
    if (typeof size === 'number')
    {
        ASSERT(size > 0);
        size = vec2(size);
    }

    // use pos as a tile index
    const textureInfo = textureInfos[textureIndex];
    ASSERT(textureInfo, 'Texture not loaded');
    const sizePadded = size.add(vec2(padding*2));
    const cols = textureInfo.size.x / sizePadded.x |0;
    if (typeof pos === 'number')
        pos = vec2(pos%cols, pos/cols|0);
    pos = vec2(pos.x*sizePadded.x+padding, pos.y*sizePadded.y+padding);

    // return a tile info object
    return new TileInfo(pos, size, textureIndex, padding); 
}

/** 
 * Tile Info - Stores info about how to draw a tile
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {Number}  [textureIndex]         - Texture index to use
     *  @param {Number}  [padding]              - How many pixels padding around tiles
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {Number} - Texture index to use */
        this.textureIndex = textureIndex;
        /** @property {Number} - How many pixels padding around tiles */
        this.padding = padding;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {Number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame == 'number');
        return this.offset(vec2(frame*(this.size.x+this.padding*2), 0));
    }

    /** Returns the texture info for this tile
    *  @return {TextureInfo}
    */
    getTextureInfo()
    { return textureInfos[this.textureIndex]; }
}

/** Texture Info - Stores info about each texture */
class TextureInfo
{
    /**
     * Create a TextureInfo, called automatically by the engine
     * @param {HTMLImageElement} image
     */
    constructor(image)
    {
        /** @property {HTMLImageElement} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = vec2(image.width, image.height);
        /** @property {WebGLTexture} - webgl texture */
        this.glTexture = glEnable && glCreateTexture(image);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    return new Vector2
    (
        (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale + cameraPos.x,
        (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale + cameraPos.y
    );
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    return new Vector2
    (
        (worldPos.x - cameraPos.x) *  cameraScale + mainCanvasSize.x/2 - .5,
        (worldPos.y - cameraPos.y) * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Get the camera's visible area in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2} pos                        - Center of the tile in world space
 *  @param {Vector2} [size=(1,1)]               - Size of the tile in world space
 *  @param {TileInfo}[tileInfo]                 - Tile info to use, untextured if undefined
 *  @param {Color}   [color=(1,1,1,1)]          - Color to modulate with
 *  @param {Number}  [angle]                    - Angle to rotate by
 *  @param {Boolean} [mirror]                   - If true image is flipped along the Y axis
 *  @param {Color}   [additiveColor=(0,0,0,0)]  - Additive color to be applied
 *  @param {Boolean} [useWebGL=glEnable]        - Use accelerated WebGL rendering
 *  @param {Boolean} [screenSpace=false]        - If true the pos and size are in screen space
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=new Color,
    angle=0, mirror, additiveColor=new Color(0,0,0,0), useWebGL=glEnable, screenSpace, context)
{
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode'); 
    ASSERT(typeof tileInfo !== 'number' || !tileInfo, 
        'this is an old style calls, to fix replace it with tile(tileIndex, tileSize)');

    const textureInfo = tileInfo && tileInfo.getTextureInfo();
    if (useWebGL)
    {
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
        }
        
        if (textureInfo)
        {
            // calculate uvs and render
            const sizeInverse = vec2(1).divide(textureInfo.size);
            const x = tileInfo.pos.x * sizeInverse.x;
            const y = tileInfo.pos.y * sizeInverse.y;
            const w = tileInfo.size.x * sizeInverse.x;
            const h = tileInfo.size.y * sizeInverse.y;
            const tileImageFixBleed = sizeInverse.scale(tileFixBleedScale);
            glSetTexture(textureInfo.glTexture);
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                x + tileImageFixBleed.x,     y + tileImageFixBleed.y, 
                x - tileImageFixBleed.x + w, y - tileImageFixBleed.y + h, 
                color.rgbaInt(), additiveColor.rgbaInt()); 
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
        showWatermark && ++drawCount;
        size = vec2(size.x, -size.y); // fix upside down sprites
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // calculate uvs and render
                const x = tileInfo.pos.x + tileFixBleedScale;
                const y = tileInfo.pos.y + tileFixBleedScale;
                const w = tileInfo.size.x - 2*tileFixBleedScale;
                const h = tileInfo.size.y - 2*tileFixBleedScale;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(textureInfo.image, x, y, w, h, -.5, -.5, 1, 1);
                context.globalAlpha = 1; // set back to full alpha
            }
            else
            {
                // if no tile info, force untextured
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
        }, screenSpace, context);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [angle]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace, context)
{ 
    drawTile(pos, size, undefined, color, angle, false, undefined, useWebGL, screenSpace, context); 
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, thickness=.1, color, useWebGL, screenSpace, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle(), useWebGL, screenSpace, context);
}

/** Draw colored polygon using passed in points
 *  @param {Array}   points - Array of Vector2 points
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawPoly(points, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{
    context.fillStyle = color.toString();
    context.beginPath();
    for (const point of screenSpace ? points : points.map(worldToScreen))
        context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
    if (lineWidth)
    {
        context.strokeStyle = lineColor.toString();
        context.lineWidth = screenSpace ? lineWidth : lineWidth*cameraScale;
        context.stroke();
    }
}

/** Draw colored ellipse using passed in point
 *  @param {Vector2} pos
 *  @param {Number}  [width=1]
 *  @param {Number}  [height=1]
 *  @param {Number}  [angle=0]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawEllipse(pos, width=1, height=1, angle=0, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{
    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        width *= cameraScale;
        height *= cameraScale;
        lineWidth *= cameraScale;
    }
    context.fillStyle = color.toString();
    context.beginPath();
    context.ellipse(pos.x, pos.y, width, height, angle, 0, 9);
    context.fill();
    if (lineWidth)
    {
        context.strokeStyle = lineColor.toString();
        context.lineWidth = lineWidth;
        context.stroke();
    }
}

/** Draw colored circle using passed in point
 *  @param {Vector2} pos
 *  @param {Number}  [radius=1]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawCircle(pos, radius=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{ drawEllipse(pos, radius, radius, 0, color, lineWidth, lineColor, screenSpace, context); }

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {Number}   angle
 *  @param {Boolean}  mirror
 *  @param {Function} drawFunction
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle, mirror, drawFunction, screenSpace, context=mainContext)
{
    if (!screenSpace)
    {
        // transform from world space to screen space
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
    }
    context.save();
    context.translate(pos.x+.5, pos.y+.5);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, -size.y);
    drawFunction(context);
    context.restore();
}

/** Enable normal or additive blend mode
 *  @param {Boolean} [additive]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function setBlendMode(additive, useWebGL=glEnable, context)
{
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    if (useWebGL)
        glAdditive = additive;
    else
    {
        if (!context)
            context = mainContext;
        context.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    }
}

/** Draw text on overlay canvas in world space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {String}  [font=fontDefault]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @param {Number}  [maxWidth]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, context, maxWidth)
{
    drawTextScreen(text, worldToScreen(pos), size*cameraScale, color, lineWidth*cameraScale, lineColor, textAlign, font, context, maxWidth);
}

/** Draw text on overlay canvas in screen space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {String}  [font=fontDefault]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @param {Number}  [maxWidth]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=fontDefault, context=overlayContext, maxWidth=undefined)
{
    context.fillStyle = color.toString();
    context.lineWidth = lineWidth;
    context.strokeStyle = lineColor.toString();
    context.textAlign = textAlign;
    context.font = size + 'px '+ font;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    pos = pos.copy();
    (text+'').split('\n').forEach(line=>
    {
        lineWidth && context.strokeText(line, pos.x, pos.y, maxWidth);
        context.fillText(line, pos.x, pos.y, maxWidth);
        pos.y += size;
    });
}

///////////////////////////////////////////////////////////////////////////////

let engineFontImage;

/** 
 * Font Image Object - Draw text on a 2D canvas by using characters in an image
 * - 96 characters (from space to tilde) are stored in an image
 * - Uses a default 8x8 font if none is supplied
 * - You can also use fonts from the main tile sheet
 * @example
 * // use built in font
 * const font = new ImageFont;
 * 
 * // draw text
 * font.drawTextScreen("LittleJS\nHello World!", vec2(200, 50));
 */
class FontImage
{
    /** Create an image font
     *  @param {HTMLImageElement} [image]    - Image for the font, if undefined default font is used
     *  @param {Vector2} [tileSize=(8,8)]    - Size of the font source tiles
     *  @param {Vector2} [paddingSize=(0,1)] - How much extra space to add between characters
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext] - context to draw to
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1), context=overlayContext)
    {
        // load default font image
        if (!engineFontImage)
            (engineFontImage = new Image).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
        this.context = context;
    }

    /** Draw text in world space using the image font
     *  @param {String}  text
     *  @param {Vector2} pos
     *  @param {Number}  [scale=.25]
     *  @param {Boolean} [center]
     */
    drawText(text, pos, scale=1, center)
    {
        this.drawTextScreen(text, worldToScreen(pos).floor(), scale*cameraScale|0, center);
    }

    /** Draw text in screen space using the image font
     *  @param {String}  text
     *  @param {Vector2} pos
     *  @param {Number}  [scale]
     *  @param {Boolean} [center]
     */
    drawTextScreen(text, pos, scale=4, center)
    {
        const context = this.context;
        context.save();
        context.imageSmoothingEnabled = !canvasPixelated;

        const size = this.tileSize;
        const drawSize = size.add(this.paddingSize).scale(scale);
        const cols = this.image.width / this.tileSize.x |0;
        (text+'').split('\n').forEach((line, i)=>
        {
            const centerOffset = center ? line.length * size.x * scale / 2 |0 : 0;
            for(let j=line.length; j--;)
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

///////////////////////////////////////////////////////////////////////////////
// Fullscreen mode

/** Returns true if fullscreen mode is active
 *  @return {Boolean}
 *  @memberof Draw */
function isFullscreen() { return !!document.fullscreenElement; }

/** Toggle fullsceen mode
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
 *  @param {String|Number} key
 *  @param {Number} [device]
 *  @return {Boolean}
 *  @memberof Input */
function keyIsDown(key, device=0)
{ 
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 1); 
}

/** Returns true if device key was pressed this frame
 *  @param {String|Number} key
 *  @param {Number} [device]
 *  @return {Boolean}
 *  @memberof Input */
function keyWasPressed(key, device=0)
{ 
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 2); 
}

/** Returns true if device key was released this frame
 *  @param {String|Number} key
 *  @param {Number} [device]
 *  @return {Boolean}
 *  @memberof Input */
function keyWasReleased(key, device=0)
{ 
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return inputData[device] && !!(inputData[device][key] & 4);
}

/** Clears all input
 *  @memberof Input */
function clearInput() { inputData = [[]]; touchGamepadButtons = []; }

/** Returns true if mouse button is down
 *  @function
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
const mouseIsDown = keyIsDown;

/** Returns true if mouse button was pressed
 *  @function
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
const mouseWasPressed = keyWasPressed;

/** Returns true if mouse button was released
 *  @function
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
const mouseWasReleased = keyWasReleased;

/** Mouse pos in world space
 *  @type {Vector2}
 *  @memberof Input */
let mousePos = vec2();

/** Mouse pos in screen space
 *  @type {Vector2}
 *  @memberof Input */
let mousePosScreen = vec2();

/** Mouse wheel delta this frame
 *  @type {Number}
 *  @memberof Input */
let mouseWheel = 0;

/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @type {Boolean}
 *  @memberof Input */
let isUsingGamepad = false;

/** Prevents input continuing to the default browser handling (false by default)
 *  @type {Boolean}
 *  @memberof Input */
let preventDefaultInput = false;

/** Returns true if gamepad button is down
 *  @param {Number} button
 *  @param {Number} [gamepad]
 *  @return {Boolean}
 *  @memberof Input */
function gamepadIsDown(button, gamepad=0)
{ return keyIsDown(button, gamepad+1); }

/** Returns true if gamepad button was pressed
 *  @param {Number} button
 *  @param {Number} [gamepad]
 *  @return {Boolean}
 *  @memberof Input */
function gamepadWasPressed(button, gamepad=0)
{ return keyWasPressed(button, gamepad+1); }

/** Returns true if gamepad button was released
 *  @param {Number} button
 *  @param {Number} [gamepad]
 *  @return {Boolean}
 *  @memberof Input */
function gamepadWasReleased(button, gamepad=0)
{ return keyWasReleased(button, gamepad+1); }

/** Returns gamepad stick value
 *  @param {Number} stick
 *  @param {Number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadStick(stick,  gamepad=0)
{ return gamepadStickData[gamepad] ? gamepadStickData[gamepad][stick] || vec2() : vec2(); }

///////////////////////////////////////////////////////////////////////////////
// Input update called by engine

// store input as a bit field for each key: 1 = isDown, 2 = wasPressed, 4 = wasReleased
// mouse and keyboard are stored together in device 0, gamepads are in devices > 0
let inputData = [[]];

function inputUpdate()
{
    if (headlessMode) return;

    // clear input when lost focus (prevent stuck keys)
    if(!(touchInputEnable && isTouchDevice) && !document.hasFocus())
        clearInput();

    // update mouse world space position
    mousePos = screenToWorld(mousePosScreen);

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
}

///////////////////////////////////////////////////////////////////////////////
// Input event handlers

function inputInit()
{
    if (headlessMode) return;

    onkeydown = (e)=>
    {
        if (!e.repeat)
        {
            isUsingGamepad = false;
            inputData[0][e.code] = 3;
            if (inputWASDEmulateDirection)
                inputData[0][remapKey(e.code)] = 3;
        }
        preventDefaultInput && e.preventDefault();
    }

    onkeyup = (e)=>
    {
        inputData[0][e.code] = 4;
        if (inputWASDEmulateDirection)
            inputData[0][remapKey(e.code)] = 4;
    }

    // handle remapping wasd keys to directions
    function remapKey(c)
    {
        return inputWASDEmulateDirection ? 
            c == 'KeyW' ? 'ArrowUp' : 
            c == 'KeyS' ? 'ArrowDown' : 
            c == 'KeyA' ? 'ArrowLeft' : 
            c == 'KeyD' ? 'ArrowRight' : c : c;
    }
    
    // mouse event handlers
    onmousedown   = (e)=>
    {
        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && audioContext.state != 'running')
            audioContext.resume();
        
        isUsingGamepad = false; 
        inputData[0][e.button] = 3; 
        mousePosScreen = mouseToScreen(e); 
        e.button && e.preventDefault();
    }
    onmouseup     = (e)=> inputData[0][e.button] = inputData[0][e.button] & 2 | 4;
    onmousemove   = (e)=> mousePosScreen = mouseToScreen(e);
    onwheel       = (e)=> mouseWheel = e.ctrlKey ? 0 : sign(e.deltaY);
    oncontextmenu = (e)=> false; // prevent right click menu
    onblur        = (e) => clearInput(); // reset input when focus is lost

    // init touch input
    if (isTouchDevice && touchInputEnable)
        touchInputInit();
}

// convert a mouse or touch event position to screen space
function mouseToScreen(mousePos)
{
    if (!mainCanvas || headlessMode)
        return vec2(); // fix bug that can occur if user clicks before page loads

    const rect = mainCanvas.getBoundingClientRect();
    return vec2(mainCanvas.width, mainCanvas.height).multiply(
        vec2(percent(mousePos.x, rect.left, rect.right), percent(mousePos.y, rect.top, rect.bottom)));
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
            v >  min ?  percent( v, min, max) : 
            v < -min ? -percent(-v, min, max) : 0;
        return vec2(deadZone(v.x), deadZone(-v.y)).clampLength();
    }

    // update touch gamepad if enabled
    if (touchGamepadEnable && isTouchDevice)
    {
        ASSERT(touchGamepadButtons, 'set touchGamepadEnable before calling init!');
        if (touchGamepadTimer.isSet())
        {
            // read virtual analog stick
            const sticks = gamepadStickData[0] || (gamepadStickData[0] = []);
            sticks[0] = vec2();
            if (touchGamepadAnalog)
                sticks[0] = applyDeadZones(touchGamepadStick);
            else if (touchGamepadStick.lengthSquared() > .3)
            {
                // convert to 8 way dpad
                sticks[0].x = Math.round(touchGamepadStick.x);
                sticks[0].y = -Math.round(touchGamepadStick.y);
                sticks[0] = sticks[0].clampLength();
            }

            // read virtual gamepad buttons
            const data = inputData[1] || (inputData[1] = []);
            for (let i=10; i--;)
            {
                const j = i == 3 ? 2 : i == 2 ? 3 : i; // fix button locations
                const wasDown = gamepadIsDown(j,0);
                data[j] = touchGamepadButtons[i] ? wasDown ? 1 : 3 : wasDown ? 4 : 0;
            }
        }
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
                isUsingGamepad ||= !i && button.pressed;
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
 *  @param {Number|Array} [pattern] - single value in ms or vibration interval array
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
const isTouchDevice = window.ontouchstart !== undefined;

// touch gamepad internal variables
let touchGamepadTimer = new Timer, touchGamepadButtons, touchGamepadStick;

// enable touch input mouse passthrough
function touchInputInit()
{
    // add non passive touch event listeners
    let handleTouch = handleTouchDefault;
    if (touchGamepadEnable)
    {
        // touch input internal variables
        handleTouch = handleTouchGamepad;
        touchGamepadButtons = [];
        touchGamepadStick = vec2();
    }
    document.addEventListener('touchstart', (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchmove',  (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchend',   (e) => handleTouch(e), { passive: false });

    // override mouse events
    onmousedown = onmouseup = ()=> 0;

    // handle all touch events the same way
    let wasTouching;
    function handleTouchDefault(e)
    {
        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && audioContext.state != 'running')
            audioContext.resume();

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        const button = 0; // all touches are left mouse button
        if (touching)
        {
            // set event pos and pass it along
            const p = vec2(e.touches[0].clientX, e.touches[0].clientY);
            mousePosScreen = mouseToScreen(p);
            wasTouching ? isUsingGamepad = touchGamepadEnable : inputData[0][button] = 3;
        }
        else if (wasTouching)
            inputData[0][button] = inputData[0][button] & 2 | 4;

        // set was touching
        wasTouching = touching;

        // prevent default handling like copy and magnifier lens
        if (document.hasFocus()) // allow document to get focus
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
            if (paused && !wasTouching)
            {
                // touch anywhere to press start when paused
                touchGamepadButtons[9] = 1;

                // call default touch handler so normal touch events still work
                handleTouchDefault(e);
                return;
            }
        }

        // get center of left and right sides
        const stickCenter = vec2(touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
        const buttonCenter = mainCanvasSize.subtract(vec2(touchGamepadSize, touchGamepadSize));
        const startCenter = mainCanvasSize.scale(.5);

        // check each touch point
        for (const touch of e.touches)
        {
            const touchPos = mouseToScreen(vec2(touch.clientX, touch.clientY));
            if (touchPos.distance(stickCenter) < touchGamepadSize)
            {
                // virtual analog stick
                touchGamepadStick = touchPos.subtract(stickCenter).scale(2/touchGamepadSize).clampLength();
            }
            else if (touchPos.distance(buttonCenter) < touchGamepadSize)
            {
                // virtual face buttons
                const button = touchPos.subtract(buttonCenter).direction();
                touchGamepadButtons[button] = 1;
            }
            else if (touchPos.distance(startCenter) < touchGamepadSize && !wasTouching)
            {
                // virtual start button in center
                touchGamepadButtons[9] = 1;
            }
        }

        // call default touch handler so normal touch events still work
        handleTouchDefault(e);
        
        // must return true so the document will get focus
        return true;
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

    const leftCenter = vec2(touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    if (touchGamepadAnalog) // draw circle shaped gamepad
    {
        context.arc(leftCenter.x, leftCenter.y, touchGamepadSize/2, 0, 9);
        context.fill();
        context.stroke();
    }
    else // draw cross shaped gamepad
    {
        for(let i=10; i--;)
        {
            const angle = i*PI/4;
            context.arc(leftCenter.x, leftCenter.y,touchGamepadSize*.6, angle + PI/8, angle + PI/8);
            i%2 && context.arc(leftCenter.x, leftCenter.y, touchGamepadSize*.33, angle, angle);
            i==1 && context.fill();
        }
        context.stroke();
    }
    
    // draw right face buttons
    const rightCenter = vec2(mainCanvasSize.x-touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    for (let i=4; i--;)
    {
        const pos = rightCenter.add(vec2().setDirection(i, touchGamepadSize/2));
        context.fillStyle = touchGamepadButtons[i] ? '#fff' : '#000';
        context.beginPath();
        context.arc(pos.x, pos.y, touchGamepadSize/4, 0,9);
        context.fill();
        context.stroke();
    }

    // set canvas back to normal
    context.restore();
}
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
let audioGainNode;

function audioInit()
{
    if (!soundEnable || headlessMode) return;
    
    // (createGain is more widely spported then GainNode construtor)
    audioGainNode = audioContext.createGain();
    audioGainNode.connect(audioContext.destination);
    audioGainNode.gain.value = soundVolume; // set starting value
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Sound Object - Stores a sound for later use and can be played positionally
 * 
 * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
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
     *  @param {Number} [range=soundDefaultRange] - World space max range of sound, will not play if camera is farther away
     *  @param {Number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     */
    constructor(zzfxSound, range=soundDefaultRange, taper=soundDefaultTaper)
    {
        if (!soundEnable || headlessMode) return;

        /** @property {Number} - World space max range of sound, will not play if camera is farther away */
        this.range = range;

        /** @property {Number} - At what percentage of range should it start tapering off */
        this.taper = taper;

        /** @property {Number} - How much to randomize frequency each time sound plays */
        this.randomness = 0;
        
        /** @property {GainNode} - Gain node for this sound */
        this.gainNode = audioContext.createGain();

        if (zzfxSound)
        {
            // generate zzfx sound now for fast playback
            const defaultRandomness = .05;
            this.randomness = zzfxSound[1] != undefined ? zzfxSound[1] : defaultRandomness;
            zzfxSound[1] = 0; // generate without randomness
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.sampleRate = zzfxR;
        }
    }

    /** Play the sound
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume] - How much to scale volume by (in addition to range fade)
     *  @param {Number}  [pitch] - How much to scale pitch by (also adjusted by this.randomness)
     *  @param {Number}  [randomnessScale] - How much to scale randomness
     *  @param {Boolean} [loop] - Should the sound loop
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false)
    {
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

        // play the sound
        const playbackRate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        return this.source = playSamples(this.sampleChannels, volume, playbackRate, pan, loop, this.sampleRate, this.gainNode);
    }

    /** Set the sound volume
     *  @param {Number}  [volume] - How much to scale volume by
     */
    setVolume(volume=1) { this.gainNode.gain.value = volume; }

    /** Stop the last instance of this sound that was played */
    stop()
    {
        if (this.source)
            this.source.stop();
        this.source = undefined;
    }
    
    /** Get source of most recent instance of this sound that was played
     *  @return {AudioBufferSourceNode}
     */
    getSource() { return this.source; }

    /** Play the sound as a note with a semitone offset
     *  @param {Number}  semitoneOffset - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    playNote(semitoneOffset, pos, volume)
    { return this.play(pos, volume, 2**(semitoneOffset/12), 0); }

    /** Get how long this sound is in seconds
     *  @return {Number} - How long the sound is in seconds (undefined if loading)
     */
    getDuration() 
    { return this.sampleChannels && this.sampleChannels[0].length / this.sampleRate; }
    
    /** Check if sound is loading, for sounds fetched from a url
     *  @return {Boolean} - True if sound is loading and not ready to play
     */
    isLoading() { return !this.sampleChannels; }
}

/** 
 * Sound Wave Object - Stores a wave sound for later use and can be played positionally
 * - this can be used to play wave, mp3, and ogg files
 * @example
 * // create a sound
 * const sound_example = new SoundWave('sound.mp3');
 * 
 * // play the sound
 * sound_example.play();
 */
class SoundWave extends Sound
{
    /** Create a sound object and cache the wave file for later use
     *  @param {String} filename - Filename of audio file to load
     *  @param {Number} [randomness] - How much to randomize frequency each time sound plays
     *  @param {Number} [range=soundDefaultRange] - World space max range of sound, will not play if camera is farther away
     *  @param {Number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering off
     *  @param {Function} [onloadCallback] - callback function to call when sound is loaded
     */
    constructor(filename, randomness=0, range, taper, onloadCallback)
    {
        super(undefined, range, taper);
        if (!soundEnable || headlessMode) return;

        this.randomness = randomness;
        fetch(filename)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(audioBuffer => 
        {
            this.sampleChannels = [];
            for (let i = audioBuffer.numberOfChannels; i--;)
                this.sampleChannels[i] = Array.from(audioBuffer.getChannelData(i));
            this.sampleRate = audioBuffer.sampleRate;
        }).then(() => onloadCallback && onloadCallback(this));
    }
}

/** Play an mp3, ogg, or wav audio from a local file or url
 *  @param {String}  filename - Location of sound file to play
 *  @param {Number}  [volume] - How much to scale volume by
 *  @param {Boolean} [loop] - True if the music should loop
 *  @return {SoundWave} - The sound object for this file
 *  @memberof Audio */
function playAudioFile(filename, volume=1, loop=false)
{
    if (!soundEnable || headlessMode) return;

    return new SoundWave(filename,0,0,0, s=>s.play(undefined, volume, 1, 1, loop));
}

/**
 * Music Object - Stores a zzfx music track for later use
 * 
 * <a href=https://keithclark.github.io/ZzFXM/>Create music with the ZzFXM tracker.</a>
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
class Music extends Sound
{
    /** Create a music object and cache the zzfx music samples for later use
     *  @param {[Array, Array, Array, Number]} zzfxMusic - Array of zzfx music parameters
     */
    constructor(zzfxMusic)
    {
        super(undefined);

        if (!soundEnable || headlessMode) return;
        this.randomness = 0;
        this.sampleChannels = zzfxM(...zzfxMusic);
        this.sampleRate = zzfxR;
    }

    /** Play the music
     *  @param {Number}  [volume=1] - How much to scale volume by
     *  @param {Boolean} [loop] - True if the music should loop
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    playMusic(volume, loop=false)
    { return super.play(undefined, volume, 1, 1, loop); }
}

/** Speak text with passed in settings
 *  @param {String} text - The text to speak
 *  @param {String} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @param {Number} [volume] - How much to scale volume by
 *  @param {Number} [rate] - How quickly to speak
 *  @param {Number} [pitch] - How much to change the pitch by
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
 *  @param {Number} semitoneOffset - How many semitones away from the root note
 *  @param {Number} [rootFrequency=220] - Frequency at semitone offset 0
 *  @return {Number} - The frequency of the note
 *  @memberof Audio */
function getNoteFrequency(semitoneOffset, rootFrequency=220)
{ return rootFrequency * 2**(semitoneOffset/12); }

///////////////////////////////////////////////////////////////////////////////

/** Play cached audio samples with given settings
 *  @param {Array}    sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {Number}   [volume] - How much to scale volume by
 *  @param {Number}   [rate] - The playback rate to use
 *  @param {Number}   [pan] - How much to apply stereo panning
 *  @param {Boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {Number}   [sampleRate=44100] - Sample rate for the sound
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=zzfxR, gainNode) 
{
    if (!soundEnable || headlessMode) return;

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
    gainNode.connect(audioGainNode);

    // connect source to stereo panner and gain
    const pannerNode = new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)});
    source.connect(pannerNode).connect(gainNode);

    // play the sound
    if (audioContext.state != 'running')
    {
        // fix stalled audio and play
        audioContext.resume().then(()=>source.start());
    }
    else
        source.start();

    // return sound
    return source;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.3.1 by Frank Force

/** Generate and play a ZzFX sound
 *  
 *  <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function zzfx(...zzfxSound) { return playSamples([zzfxG(...zzfxSound)]); }

/** Sample rate used for all ZzFX sounds
 *  @default 44100
 *  @memberof Audio */
const zzfxR = 44100; 

/** Generate samples for a ZzFX sound
 *  @param {Number}  [volume] - Volume scale (percent)
 *  @param {Number}  [randomness] - How much to randomize frequency (percent Hz)
 *  @param {Number}  [frequency] - Frequency of sound (Hz)
 *  @param {Number}  [attack] - Attack time, how fast sound starts (seconds)
 *  @param {Number}  [sustain] - Sustain time, how long sound holds (seconds)
 *  @param {Number}  [release] - Release time, how fast sound fades out (seconds)
 *  @param {Number}  [shape] - Shape of the sound wave
 *  @param {Number}  [shapeCurve] - Squarenes of wave (0=square, 1=normal, 2=pointy)
 *  @param {Number}  [slide] - How much to slide frequency (kHz/s)
 *  @param {Number}  [deltaSlide] - How much to change slide (kHz/s/s)
 *  @param {Number}  [pitchJump] - Frequency of pitch jump (Hz)
 *  @param {Number}  [pitchJumpTime] - Time of pitch jump (seconds)
 *  @param {Number}  [repeatTime] - Resets some parameters periodically (seconds)
 *  @param {Number}  [noise] - How much random noise to add (percent)
 *  @param {Number}  [modulation] - Frequency of modulation wave, negative flips phase (Hz)
 *  @param {Number}  [bitCrush] - Resamples at a lower frequency in (samples*100)
 *  @param {Number}  [delay] - Overlap sound with itself for reverb and flanger effects (seconds)
 *  @param {Number}  [sustainVolume] - Volume level for sustain (percent)
 *  @param {Number}  [decay] - Decay time, how long to reach sustain after attack (seconds)
 *  @param {Number}  [tremolo] - Trembling effect, rate controlled by repeat time (precent)
 *  @param {Number}  [filter] - Filter cutoff frequency, positive for HPF, negative for LPF (Hz)
 *  @return {Array} - Array of audio samples
 *  @memberof Audio
 */
function zzfxG
(
    // parameters
    volume = 1, randomness = .05, frequency = 220, attack = 0, sustain = 0,
    release = .1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0,
    pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0,
    bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0, filter = 0
)
{
    // LJS Note: ZZFX modded so randomness is handled by Sound class

    // init parameters
    let PI2 = PI*2, sampleRate = zzfxR,
        startSlide = slide *= 500 * PI2 / sampleRate / sampleRate,
        startFrequency = frequency *= 
            rand(1 + randomness, 1-randomness) * PI2 / sampleRate,
        b = [], t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length,

        // biquad LP/HP filter
        quality = 2, w = PI2 * abs(filter) * 2 / sampleRate,
        cos = Math.cos(w), alpha = Math.sin(w) / 2 / quality,
        a0 = 1 + alpha, a1 = -2*cos / a0, a2 = (1 - alpha) / a0,
        b0 = (1 + sign(filter) * cos) / 2 / a0, 
        b1 = -(sign(filter) + cos) / a0, b2 = b0,
        x2 = 0, x1 = 0, y2 = 0, y1 = 0;

    // scale by sample rate
    attack = attack * sampleRate + 9; // minimum attack to prevent pop
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
    for(length = attack + decay + sustain + release + delay | 0;
        i < length; b[i++] = s * volume)               // sample
    {
        if (!(++c%(bitCrush*100|0)))                   // bit crush
        {
            s = shape? shape>1? shape>2? shape>3?      // wave shape
                Math.sin(t**3) :                       // 4 noise
                clamp(Math.tan(t),1,-1):               // 3 tan
                1-(2*t/PI2%2+2)%2:                     // 2 saw
                1-4*abs(Math.round(t/PI2)-t/PI2):      // 1 triangle
                Math.sin(t);                           // 0 sin

            s = (repeatTime ?
                    1 - tremolo + tremolo*Math.sin(PI2*i/repeatTime) // tremolo
                    : 1) *
                sign(s)*(abs(s)**shapeCurve) *           // curve
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

            if (filter)                                   // apply filter
                s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
        }

        f = (frequency += slide += deltaSlide) *// frequency
            Math.cos(modulation*tm++);          // modulation
        t += f + f*noise*Math.sin(i**5);        // noise

        if (j && ++j > pitchJumpTime)           // pitch jump
        { 
            frequency += pitchJump;             // apply pitch jump
            startFrequency += pitchJump;        // also apply to start
            j = 0;                              // stop pitch jump time
        } 

        if (repeatTime && !(++r % repeatTime))  // repeat
        { 
            frequency = startFrequency;         // reset frequency
            slide = startSlide;                 // reset slide
            j = j || 1;                         // reset pitch jump time
        }
    }

    return b;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force

/** Generate samples for a ZzFM song with given parameters
 *  @param {Array} instruments - Array of ZzFX sound paramaters
 *  @param {Array} patterns - Array of pattern data
 *  @param {Array} sequence - Array of pattern indexes
 *  @param {Number} [BPM] - Playback speed of the song in BPM
 *  @return {Array} - Left and right channel sample data
 *  @memberof Audio */
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
  let beatLength = zzfxR / BPM * 60 >> 2;

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
      isSequenceEnd = sequenceIndex == sequence.length - 1;
      for (i = 2, k = outSampleOffset; i < patternChannel.length + isSequenceEnd; notFirstBeat = ++i) {

        // <channel-note>
        note = patternChannel[i];

        // stop if end, different instrument or new note
        stop = i == patternChannel.length + isSequenceEnd - 1 && isSequenceEnd ||
            instrument != (patternChannel[0] || 0) || note | 0;

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
                instrumentParameters[2] *= 2 ** ((note - 12) / 12),

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
 * LittleJS Tile Layer System
 * - Caches arrays of tiles to off screen canvas for fast rendering
 * - Unlimited numbers of layers, allocates canvases as needed
 * - Interfaces with EngineObject for collision
 * - Collision layer is separate from visible layers
 * - It is recommended to have a visible layer that matches the collision
 * - Tile layers can be drawn to using their context with canvas2d
 * - Drawn directly to the main canvas without using WebGL
 * @namespace TileCollision
 */



/** The tile collision layer array, use setTileCollisionData and getTileCollisionData to access
 *  @type {Array} 
 *  @memberof TileCollision */
let tileCollision = [];

/** Size of the tile collision layer
 *  @type {Vector2} 
 *  @memberof TileCollision */
let tileCollisionSize = vec2();

/** Clear and initialize tile collision
 *  @param {Vector2} size
 *  @memberof TileCollision */
function initTileCollision(size)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

/** Set tile collision data
 *  @param {Vector2} pos
 *  @param {Number}  [data]
 *  @memberof TileCollision */
function setTileCollisionData(pos, data=0)
{
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
}

/** Get tile collision data
 *  @param {Vector2} pos
 *  @return {Number}
 *  @memberof TileCollision */
function getTileCollisionData(pos)
{
    return pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;
}

/** Check if collision with another object should occur
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=(0,0)]
 *  @param {EngineObject} [object]
 *  @return {Boolean}
 *  @memberof TileCollision */
function tileCollisionTest(pos, size=vec2(), object)
{
    const minX = max(pos.x - size.x/2|0, 0);
    const minY = max(pos.y - size.y/2|0, 0);
    const maxX = min(pos.x + size.x/2, tileCollisionSize.x);
    const maxY = min(pos.y + size.y/2, tileCollisionSize.y);
    for (let y = minY; y < maxY; ++y)
    for (let x = minX; x < maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, vec2(x, y))))
            return true;
    }
    return false;
}

/** Return the center of first tile hit (does not return the exact intersection)
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object]
 *  @return {Vector2}
 *  @memberof TileCollision */
function tileCollisionRaycast(posStart, posEnd, object)
{
    // test if a ray collides with tiles from start to end
    // todo: a way to get the exact hit point, it must still be inside the hit tile
    const delta = posEnd.subtract(posStart);
    const totalLength = delta.length();
    const normalizedDelta = delta.normalize();
    const unit = vec2(abs(1/normalizedDelta.x), abs(1/normalizedDelta.y));
    const flooredPosStart = posStart.floor();

    // setup iteration variables
    let pos = flooredPosStart;
    let xi = unit.x * (delta.x < 0 ? posStart.x - pos.x : pos.x - posStart.x + 1);
    let yi = unit.y * (delta.y < 0 ? posStart.y - pos.y : pos.y - posStart.y + 1);

    while (true)
    {
        // check for tile collision
        const tileData = getTileCollisionData(pos);
        if (tileData && (!object || object.collideWithTile(tileData, pos)))
        {
            debugRaycast && debugLine(posStart, posEnd, '#f00', .02);
            debugRaycast && debugPoint(pos.add(vec2(.5)), '#ff0');
            return pos.add(vec2(.5));
        }

        // check if past the end
        if (xi > totalLength && yi > totalLength)
            break;

        // get coordinates of the next tile to check
        if (xi > yi)
            pos.y += sign(delta.y), yi += unit.y;
        else
            pos.x += sign(delta.x), xi += unit.x;
    }

    debugRaycast && debugLine(posStart, posEnd, '#00f', .02);
}

///////////////////////////////////////////////////////////////////////////////
// Tile Layer Rendering System

/**
 * Tile layer data object stores info about how to render a tile
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
     *  @param {Number}  [tile]      - The tile to use, untextured if undefined
     *  @param {Number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {Boolean} [mirror]    - If the tile should be mirrored along the x axis
     *  @param {Color}   [color]     - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {Number}  - The tile to use, untextured if undefined */
        this.tile      = tile;
        /** @property {Number}  - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {Boolean} - If the tile should be mirrored along the x axis */
        this.mirror    = mirror;
        /** @property {Color}   - Color of the tile */
        this.color     = color;
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

/**
 * Tile Layer - cached rendering system for tile layers
 * - Each Tile layer is rendered to an off screen canvas
 * - To allow dynamic modifications, layers are rendered using canvas 2d
 * - Some devices like mobile phones are limited to 4k texture resolution
 * - So with 16x16 tiles this limits layers to 256x256 on mobile devices
 * @extends EngineObject
 * @example
 * // create tile collision and visible tile layer
 * initTileCollision(vec2(200,100));
 * const tileLayer = new TileLayer();
 */
class TileLayer extends EngineObject
{
    /** Create a tile layer object
    *  @param {Vector2}  [position=(0,0)]     - World space position
    *  @param {Vector2}  [size=tileCollisionSize] - World space size
    *  @param {TileInfo} [tileInfo]    - Tile info for layer
    *  @param {Vector2}  [scale=(1,1)] - How much to scale this layer when rendered
    *  @param {Number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size=tileCollisionSize, tileInfo=tile(), scale=vec2(1), renderOrder=0)
    {
        super(position, size, tileInfo, 0, undefined, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this tile layer */
        this.canvas = document.createElement('canvas');
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this tile layer */
        this.context = this.canvas.getContext('2d');
        /** @property {Vector2} - How much to scale this layer when rendered */
        this.scale = scale;
        /** @property {Boolean} - If true this layer will render to overlay canvas and appear above all objects */
        this.isOverlay = false;

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
        }
    }
    
    /** Set data at a given position in the array 
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data     - Data to set
     *  @param {Boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
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
    { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; }
    
    // Tile layers are not updated
    update() {}

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(mainContext != this.context, 'must call redrawEnd() after drawing tiles');

        // flush and copy gl canvas because tile canvas does not use webgl
        !glOverlay && !this.isOverlay && glCopyToContext(mainContext);
        
        // draw the entire cached level onto the canvas
        const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y)));
        (this.isOverlay ? overlayContext : mainContext).drawImage
        (
            this.canvas, pos.x, pos.y,
            cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
        );
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
    }

    /** Call to start the redraw process
     *  - This can be used to manually update small parts of the level
     *  @param {Boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        // save current render settings
        /** @type {[HTMLCanvasElement, CanvasRenderingContext2D, Vector2, Vector2, number]} */
        this.savedRenderSettings = [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale];

        // use webgl rendering system to render the tiles if enabled
        // this works by temporally taking control of the rendering system
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainCanvasSize = this.size.multiply(this.tileInfo.size);
        cameraPos = this.size.scale(.5);
        cameraScale = this.tileInfo.size.x;

        if (clear)
        {
            // clear and set size
            mainCanvas.width  = mainCanvasSize.x;
            mainCanvas.height = mainCanvasSize.y;
        }

        // disable smoothing for pixel art
        this.context.imageSmoothingEnabled = !canvasPixelated;

        // setup gl rendering if enabled
        glPreRender();
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        ASSERT(mainContext == this.context, 'must call redrawStart() before drawing tiles');
        glCopyToContext(mainContext, true);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile grid
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if isinde a redrawStart/End block
     *  @param {Vector2} layerPos 
     *  @param {Boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        // clear out where the tile was, for full opaque tiles this can be skipped
        const s = this.tileInfo.size;
        if (clear)
        {
            const pos = layerPos.multiply(s);
            this.context.clearRect(pos.x, this.canvas.height-pos.y, s.x, -s.y);
        }

        // draw the tile if not undefined
        const d = this.getData(layerPos);
        if (d.tile != undefined)
        {
            ASSERT(mainContext == this.context, 'must call redrawStart() before drawing tiles');
            const pos = layerPos.add(vec2(.5));
            const tileInfo = tile(d.tile, s, this.tileInfo.textureIndex);
            drawTile(pos, vec2(1), tileInfo, d.color, d.direction*PI/2, d.mirror);
        }
    }

    /** Draw directly to the 2D canvas in world space (bipass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {Number}   angle
     *  @param {Boolean}  mirror
     *  @param {Function} drawFunction */
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
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

    /** Draw a tile directly onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=(1,1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=(1,1,1,1)]
     *  @param {Number}   [angle=0]
     *  @param {Boolean}  [mirror=0] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            const textureInfo = tileInfo && tileInfo.getTextureInfo();
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
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle directly onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=(1,1)]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {Number}  [angle=0] */
    drawRect(pos, size, color, angle) 
    { this.drawTile(pos, size, undefined, color, angle); }
}
/** 
 * LittleJS Particle System
 */



/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @example
 * // create a particle emitter
 * let pos = vec2(2,3);
 * let particleEmitter = new ParticleEmitter
 * (
 *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emiteCone
 *     tile(0, 16),                // tileInfo
 *     rgb(1,1,1),   rgb(0,0,0),   // colorStartA, colorStartB
 *     rgb(1,1,1,0), rgb(0,0,0,0), // colorEndA, colorEndB
 *     2, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
 *     .5, 1                // randomness, collide, additive, randomColorLinear, renderOrder
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} position - World space position of the emitter
     *  @param {Number} [angle] - Angle to emit the particles
     *  @param {Number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
     *  @param {Number} [emitTime] - How long to stay alive (0 is forever)
     *  @param {Number} [emitRate] - How many particles per second to spawn, does not emit if 0
     *  @param {Number} [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
     *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
     *  @param {Color} [colorStartA=(1,1,1,1)] - Color at start of life 1, randomized between start colors
     *  @param {Color} [colorStartB=(1,1,1,1)] - Color at start of life 2, randomized between start colors
     *  @param {Color} [colorEndA=(1,1,1,0)] - Color at end of life 1, randomized between end colors
     *  @param {Color} [colorEndB=(1,1,1,0)] - Color at end of life 2, randomized between end colors
     *  @param {Number} [particleTime]      - How long particles live
     *  @param {Number} [sizeStart]         - How big are particles at start
     *  @param {Number} [sizeEnd]           - How big are particles at end
     *  @param {Number} [speed]             - How fast are particles when spawned
     *  @param {Number} [angleSpeed]        - How fast are particles rotating
     *  @param {Number} [damping]           - How much to dampen particle speed
     *  @param {Number} [angleDamping]      - How much to dampen particle angular speed
     *  @param {Number} [gravityScale]      - How much gravity effect particles
     *  @param {Number} [particleConeAngle] - Cone for start particle angle
     *  @param {Number} [fadeRate]          - How quick to fade particles at start/end in percent of life
     *  @param {Number} [randomness]    - Apply extra randomness percent
     *  @param {Boolean} [collideTiles] - Do particles collide against tiles
     *  @param {Boolean} [additive]     - Should particles use addtive blend
     *  @param {Boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {Number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {Boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
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
        colorStartA = new Color,
        colorStartB = new Color,
        colorEndA = new Color(1,1,1,0),
        colorEndB = new Color(1,1,1,0),
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
        /** @property {Number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        this.emitSize = emitSize
        /** @property {Number} - How long to stay alive (0 is forever) */
        this.emitTime = emitTime;
        /** @property {Number} - How many particles per second to spawn, does not emit if 0 */
        this.emitRate = emitRate;
        /** @property {Number} - Local angle to apply velocity to particles from emitter */
        this.emitConeAngle = emitConeAngle;

        // color settings
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        this.colorStartA = colorStartA;
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        this.colorStartB = colorStartB;
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        this.colorEndA   = colorEndA;
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB   = colorEndB;
        /** @property {Boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {Number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {Number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {Number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {Number} - How fast are particles when spawned */
        this.speed             = speed;
        /** @property {Number} - How fast are particles rotating */
        this.angleSpeed        = angleSpeed;
        /** @property {Number} - How much to dampen particle speed */
        this.damping           = damping;
        /** @property {Number} - How much to dampen particle angular speed */
        this.angleDamping      = angleDamping;
        /** @property {Number} - How much does gravity effect particles */
        this.gravityScale      = gravityScale;
        /** @property {Number} - Cone for start particle angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {Number} - How quick to fade in particles at start/end in percent of life */
        this.fadeRate          = fadeRate;
        /** @property {Number} - Apply extra randomness percent */
        this.randomness        = randomness;
        /** @property {Boolean} - Do particles collide against tiles */
        this.collideTiles      = collideTiles;
        /** @property {Boolean} - Should particles use addtive blend */
        this.additive          = additive;
        /** @property {Boolean} - Should it be in local space of emitter */
        this.localSpace        = localSpace;
        /** @property {Number} - If non zero the partile is drawn as a trail, stretched in the drection of velocity */
        this.trailScale        = 0;
        /** @property {Function}   - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {Function}   - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {Number} - Track particle emit time */
        this.emitTimeBuffer    = 0;
    }
    
    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate * particleEmitRateScale)
            {
                const rate = 1/this.emitRate/particleEmitRateScale;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = typeof this.emitSize === 'number' ? // check if number was used
            randInCircle(this.emitSize/2)              // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5))         // box emitter
                .multiply(this.emitSize).rotate(this.angle)
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            pos = this.pos.add(pos);
            angle += this.angle;
        }

        // randomness scales each paremeter by a percentage
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
        particle.fadeRate      = this.fadeRate;
        particle.damping       = this.damping;
        particle.angleDamping  = this.angleDamping;
        particle.elasticity    = this.elasticity;
        particle.friction      = this.friction;
        particle.gravityScale  = this.gravityScale;
        particle.collideTiles  = this.collideTiles;
        particle.renderOrder   = this.renderOrder;
        particle.mirror        = !!randInt(2);

        // call particle create callaback
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
 */
class Particle extends EngineObject
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {Vector2}  position   - World space position of the particle
     * @param {TileInfo} tileInfo   - Tile info to render particles
     * @param {Number}   angle      - Angle to rotate the particle
     * @param {Color}    colorStart - Color at start of life
     * @param {Color}    colorEnd   - Color at end of life
     * @param {Number}   lifeTime   - How long to live for
     * @param {Number}   sizeStart  - Size at start of life
     * @param {Number}   sizeEnd    - Size at end of life
     * @param {Number}   fadeRate   - How quick to fade in/out
     * @param {Boolean}  additive   - Does it use additive blend mode
     * @param {Number}   trailScale - If a trail, how long to make it
     * @param {ParticleEmitter} [localSpaceEmitter] - Parent emitter if local space
     * @param {Function} [destroyCallback] - Callback when particle dies
     */
    constructor(position, tileInfo, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, fadeRate, additive, trailScale, localSpaceEmitter, destroyCallback
    )
    { 
        super(position, vec2(), tileInfo, angle); 
    
        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Calculated change in color */
        this.colorEndDelta = colorEnd.subtract(colorStart);
        /** @property {Number} - How long to live for */
        this.lifeTime = lifeTime;
        /** @property {Number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {Number} - Calculated change in size */
        this.sizeEndDelta = sizeEnd - sizeStart;
        /** @property {Number} - How quick to fade in/out */
        this.fadeRate = fadeRate;
        /** @property {Boolean} - Is it additive */
        this.additive = additive;
        /** @property {Number} - If a trail, how long to make it */
        this.trailScale = trailScale;
        /** @property {ParticleEmitter} - Parent emitter if local space */
        this.localSpaceEmitter = localSpaceEmitter;
        /** @property {Function} - Called when particle dies */
        this.destroyCallback = destroyCallback;

        // particles use circular clamped speed
        this.clampSpeedLinear = false;
    }

    /** Render the particle, automatically called each frame, sorted by renderOrder */
    render()
    {
        // modulate size and color
        const p = min((time - this.spawnTime) / this.lifeTime, 1);
        const radius = this.sizeStart + p * this.sizeEndDelta;
        const size = vec2(radius);
        const fadeRate = this.fadeRate/2;
        const color = new Color(
            this.colorStart.r + p * this.colorEndDelta.r,
            this.colorStart.g + p * this.colorEndDelta.g,
            this.colorStart.b + p * this.colorEndDelta.b,
            (this.colorStart.a + p * this.colorEndDelta.a) * 
             (p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1)); // fade alpha

        // draw the particle
        this.additive && setBlendMode(true);

        let pos = this.pos, angle = this.angle;
        if (this.localSpaceEmitter)
        {
            // in local space of emitter
            pos = this.localSpaceEmitter.pos.add(pos.rotate(-this.localSpaceEmitter.angle)); 
            angle += this.localSpaceEmitter.angle;
        }
        if (this.trailScale)
        {
            // trail style particles
            let velocity = this.velocity;
            if (this.localSpaceEmitter)
                velocity = velocity.rotate(-this.localSpaceEmitter.angle);
            const speed = velocity.length();
            if (speed)
            {
                const direction = velocity.scale(1/speed);
                const trailLength = speed * this.trailScale;
                size.y = max(size.x, trailLength);
                angle = direction.angle();
                drawTile(pos.add(direction.multiply(vec2(0,-trailLength/2))), size, this.tileInfo, color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, color, angle, this.mirror);
        this.additive && setBlendMode();
        debugParticles && debugRect(pos, size, '#f005', 0, angle);

        if (p == 1)
        {
            // destroy particle when it's time runs out
            this.color = color;
            this.size = size;
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
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
 *  @param {String} saveName
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

/** Calls a function for each medal
 *  @param {Function} callback
 *  @memberof Medals */
function medalsForEach(callback)
{ Object.values(medals).forEach(medal=>callback(medal)); }

///////////////////////////////////////////////////////////////////////////////

/** 
 * Medal - Tracks an unlockable medal 
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
     *  @param {Number} id            - The unique identifier of the medal
     *  @param {String} name          - Name of the medal
     *  @param {String} [description] - Description of the medal
     *  @param {String} [icon]        - Icon for the medal
     *  @param {String} [src]         - Image location for the medal
     */
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(id >= 0 && !medals[id]);
        
        /** @property {Number} - The unique identifier of the medal */
        this.id = id;
        
        /** @property {String} - Name of the medal */
        this.name = name;
        
        /** @property {String} - Description of the medal */
        this.description = description;
        
        /** @property {String} - Icon for the medal */
        this.icon = icon;
        
        /** @property {Boolean} - Is the medal unlocked? */
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
     *  @param {Number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const width = min(medalDisplaySize.x, mainCanvas.width);
        const x = overlayCanvas.width - width;
        const y = -medalDisplaySize.y*hidePercent;

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = new Color(.9,.9,.9).toString();
        context.strokeStyle = new Color(0,0,0).toString();
        context.lineWidth = 3;
        context.rect(x, y, width, medalDisplaySize.y);
        context.fill();
        context.stroke();
        context.clip();

        // draw the icon and text
        this.renderIcon(vec2(x+15+medalDisplayIconSize/2, y+medalDisplaySize.y/2));
        const pos = vec2(x+medalDisplayIconSize+30, y+28);
        drawTextScreen(this.name, pos, 38, new Color(0,0,0), 0, undefined, 'left');
        pos.y += 32;
        drawTextScreen(this.description, pos, 24, new Color(0,0,0), 0, undefined, 'left');
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Vector2} pos - Screen space position
     *  @param {Number} [size=medalDisplayIconSize] - Screen space size
     */
    renderIcon(pos, size=medalDisplayIconSize)
    {
        // draw the image or icon
        if (this.image)
            overlayContext.drawImage(this.image, pos.x-size/2, pos.y-size/2, size, size);
        else
            drawTextScreen(this.icon, pos, size*.7, new Color(0,0,0));
    }
 
    // Get local storage key used by the medal
    storageKey() { return medalsSaveName + '_' + this.id; }
}
/**
 * LittleJS WebGL Interface
 * - All webgl used by the engine is wrapped up here
 * - For normal stuff you won't need to see or call anything in this file
 * - For advanced stuff there are helper functions to create shaders, textures, etc
 * - Can be disabled with glEnable to revert to 2D canvas rendering
 * - Batches sprite rendering on GPU for incredibly fast performance
 * - Sprite transform math is done in the shader where possible
 * - Supports shadertoy style post processing shaders
 * @namespace WebGL
 */



/** The WebGL canvas which appears above the main canvas and below the overlay canvas
 *  @type {HTMLCanvasElement}
 *  @memberof WebGL */
let glCanvas;

/** 2d context for glCanvas
 *  @type {WebGL2RenderingContext}
 *  @memberof WebGL */
let glContext;

/** Shoule webgl be setup with antialiasing, must be set before calling engineInit
 *  @type {Boolean}
 *  @memberof WebGL */
let glAntialias = true;

// WebGL internal variables not exposed to documentation
let glShader, glActiveTexture, glArrayBuffer, glGeometryBuffer, glPositionData, glColorData, glInstanceCount, glAdditive, glBatchAdditive;

///////////////////////////////////////////////////////////////////////////////

// Initalize WebGL, called automatically by the engine
function glInit()
{
    if (!glEnable || headlessMode) return;

    // create the canvas and textures
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl2', {antialias:glAntialias});

    // some browsers are much faster without copying the gl buffer so we just overlay it instead
    const rootElement = mainCanvas.parentElement;
    glOverlay && rootElement.appendChild(glCanvas);

    // setup vertex and fragment shaders
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

    // init buffers
    const glInstanceData = new ArrayBuffer(gl_INSTANCE_BUFFER_SIZE);
    glPositionData = new Float32Array(glInstanceData);
    glColorData = new Uint32Array(glInstanceData);
    glArrayBuffer = glContext.createBuffer();
    glGeometryBuffer = glContext.createBuffer();

    // create the geometry buffer, triangle strip square
    const geometry = new Float32Array([glInstanceCount=0,0,1,0,0,1,1,1]);
    glContext.bindBuffer(gl_ARRAY_BUFFER, glGeometryBuffer);
    glContext.bufferData(gl_ARRAY_BUFFER, geometry, gl_STATIC_DRAW);
}

// Setup render each frame, called automatically by engine
function glPreRender()
{
    if (!glEnable || headlessMode) return;

    // clear and set to same size as main canvas
    glContext.viewport(0, 0, glCanvas.width=mainCanvas.width, glCanvas.height=mainCanvas.height);
    glContext.clear(gl_COLOR_BUFFER_BIT);

    // set up the shader
    glContext.useProgram(glShader);
    glContext.activeTexture(gl_TEXTURE0);
    if (textureInfos[0])
        glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = textureInfos[0].glTexture);

    // set vertex attributes
    let offset = glAdditive = glBatchAdditive = 0;
    let initVertexAttribArray = (name, type, typeSize, size)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        const stride = typeSize && gl_INSTANCE_BYTE_STRIDE; // only if not geometry
        const divisor = typeSize && 1; // only if not geometry
        const normalize = typeSize==1; // only if color
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, stride, offset);
        glContext.vertexAttribDivisor(location, divisor);
        offset += size*typeSize;
    }
    glContext.bindBuffer(gl_ARRAY_BUFFER, glGeometryBuffer);
    initVertexAttribArray('g', gl_FLOAT, 0, 2); // geometry
    glContext.bindBuffer(gl_ARRAY_BUFFER, glArrayBuffer);
    glContext.bufferData(gl_ARRAY_BUFFER, gl_INSTANCE_BUFFER_SIZE, gl_DYNAMIC_DRAW);
    initVertexAttribArray('p', gl_FLOAT, 4, 4); // position & size
    initVertexAttribArray('u', gl_FLOAT, 4, 4); // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4); // color
    initVertexAttribArray('a', gl_UNSIGNED_BYTE, 1, 4); // additiveColor
    initVertexAttribArray('r', gl_FLOAT, 4, 1); // rotation

    // build the transform matrix
    const s = vec2(2*cameraScale).divide(mainCanvasSize);
    const p = vec2(-1).subtract(cameraPos.multiply(s));
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), false,
        [
            s.x, 0,   0,   0,
            0,   s.y, 0,   0,
            1,   1,   1,   1,
            p.x, p.y, 0,   0
        ]
    );
}

/** Set the WebGl texture, called automatically if using multiple textures
 *  - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} texture
 *  @memberof WebGL */
function glSetTexture(texture)
{
    // must flush cache with the old texture to set a new one
    if (headlessMode || texture == glActiveTexture)
        return;

    glFlush();
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
}

/** Compile WebGL shader of the given type, will throw errors if in debug mode
 *  @param {String} source
 *  @param {Number} type
 *  @return {WebGLShader}
 *  @memberof WebGL */
function glCompileShader(source, type)
{
    // build the shader
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    // check for errors
    if (debug && !glContext.getShaderParameter(shader, gl_COMPILE_STATUS))
        throw glContext.getShaderInfoLog(shader);
    return shader;
}

/** Create WebGL program with given shaders
 *  @param {String} vsSource
 *  @param {String} fsSource
 *  @return {WebGLProgram}
 *  @memberof WebGL */
function glCreateProgram(vsSource, fsSource)
{
    // build the program
    const program = glContext.createProgram();
    glContext.attachShader(program, glCompileShader(vsSource, gl_VERTEX_SHADER));
    glContext.attachShader(program, glCompileShader(fsSource, gl_FRAGMENT_SHADER));
    glContext.linkProgram(program);

    // check for errors
    if (debug && !glContext.getProgramParameter(program, gl_LINK_STATUS))
        throw glContext.getProgramInfoLog(program);
    return program;
}

/** Create WebGL texture from an image and init the texture settings
 *  @param {HTMLImageElement} image
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image)
{
    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    if (image && image.width)
        glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);
    else
    {
        // create a white texture
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, 1, 1, 0, gl_RGBA, gl_UNSIGNED_BYTE, whitePixel);
    }

    // use point filtering for pixelated rendering
    const filter = canvasPixelated ? gl_NEAREST : gl_LINEAR;
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, filter);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, filter);
    return texture;
}

/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush()
{
    if (!glInstanceCount) return;

    const destBlend = glBatchAdditive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, glPositionData);
    glContext.drawArraysInstanced(gl_TRIANGLE_STRIP, 0, 4, glInstanceCount);
    if (showWatermark)
        drawCount += glInstanceCount;
    glInstanceCount = 0;
    glBatchAdditive = glAdditive;
}

/** Draw any sprites still in the buffer, copy to main canvas and clear
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 *  @param {Boolean} [forceDraw]
 *  @memberof WebGL */
function glCopyToContext(context, forceDraw=false)
{
    if (!glEnable || !glInstanceCount && !forceDraw) return;

    glFlush();

    // do not draw in overlay mode because the canvas is visible
    if (!glOverlay || forceDraw)
        context.drawImage(glCanvas, 0, 0);
}

/** Set antialiasing for webgl canvas
 *  @param {Boolean} [antialias]
 *  @memberof WebGL */
function glSetAntialias(antialias=true)
{
    ASSERT(!glCanvas, 'must be called before engineInit');
    glAntialias = antialias;
}

/** Add a sprite to the gl draw list, used by all gl draw functions
 *  @param {Number} x
 *  @param {Number} y
 *  @param {Number} sizeX
 *  @param {Number} sizeY
 *  @param {Number} angle
 *  @param {Number} uv0X
 *  @param {Number} uv0Y
 *  @param {Number} uv1X
 *  @param {Number} uv1Y
 *  @param {Number} rgba
 *  @param {Number} [rgbaAdditive=0]
 *  @memberof WebGL */
function glDraw(x, y, sizeX, sizeY, angle, uv0X, uv0Y, uv1X, uv1Y, rgba, rgbaAdditive=0)
{
    ASSERT(typeof rgba == 'number' && typeof rgbaAdditive == 'number', 'invalid color');

    // flush if there is not enough room or if different blend mode
    if (glInstanceCount >= gl_MAX_INSTANCES || glBatchAdditive != glAdditive)
        glFlush();

    let offset = glInstanceCount * gl_INDICIES_PER_INSTANCE;
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
    glInstanceCount++;
}

///////////////////////////////////////////////////////////////////////////////
// store gl constants as integers so their name doesn't use space in minifed
const
gl_ONE = 1,
gl_TRIANGLE_STRIP = 5,
gl_SRC_ALPHA = 770,
gl_ONE_MINUS_SRC_ALPHA = 771,
gl_BLEND = 3042,
gl_TEXTURE_2D = 3553,
gl_UNSIGNED_BYTE = 5121,
gl_FLOAT = 5126,
gl_RGBA = 6408,
gl_NEAREST = 9728,
gl_LINEAR = 9729,
gl_TEXTURE_MAG_FILTER = 10240,
gl_TEXTURE_MIN_FILTER = 10241,
gl_COLOR_BUFFER_BIT = 16384,
gl_TEXTURE0 = 33984,
gl_ARRAY_BUFFER = 34962,
gl_STATIC_DRAW = 35044,
gl_DYNAMIC_DRAW = 35048,
gl_FRAGMENT_SHADER = 35632,
gl_VERTEX_SHADER = 35633,
gl_COMPILE_STATUS = 35713,
gl_LINK_STATUS = 35714,
gl_UNPACK_FLIP_Y_WEBGL = 37440,

// constants for batch rendering
gl_INDICIES_PER_INSTANCE = 11,
gl_MAX_INSTANCES = 1e4,
gl_INSTANCE_BYTE_STRIDE = gl_INDICIES_PER_INSTANCE * 4, // 11 * 4
gl_INSTANCE_BUFFER_SIZE = gl_MAX_INSTANCES * gl_INSTANCE_BYTE_STRIDE;
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
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineName = 'LittleJS';

/** Version of engine
 *  @type {String}
 *  @default
 *  @memberof Engine */
const engineVersion = '1.10.6';

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
// plugin hooks

const pluginUpdateList = [], pluginRenderList = [];

/** Add a new update function for a plugin
 *  @param {Function} [updateFunction]
 *  @param {Function} [renderFunction]
 *  @memberof Engine */
function engineAddPlugin(updateFunction, renderFunction)
{
    ASSERT(!pluginUpdateList.includes(updateFunction));
    ASSERT(!pluginRenderList.includes(renderFunction));
    updateFunction && pluginUpdateList.push(updateFunction);
    renderFunction && pluginRenderList.push(renderFunction);
}

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
function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement=document.body)
{
    ASSERT(Array.isArray(imageSources), 'pass in images as array');

    // Called automatically by engine to setup render system
    function enginePreRender()
    {
        // save canvas size
        mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);

        // disable smoothing for pixel art
        mainContext.imageSmoothingEnabled = !canvasPixelated;

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
            // update object transforms even when paused
            for (const o of engineObjects)
                o.parent || o.updateTransforms();
            inputUpdate();
            pluginUpdateList.forEach(f=>f());
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
            for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / frameRate)
            {
                // increment frame and update time
                time = frame++ / frameRate;

                // update game and objects
                inputUpdate();
                gameUpdate();
                pluginUpdateList.forEach(f=>f());
                engineObjectsUpdate();

                // do post update
                debugUpdate();
                gameUpdatePost();
                inputUpdatePost();
            }

            // add the time smoothing back in
            frameTimeBufferMS += deltaSmooth;
        }

        if (!headlessMode)
        {
            // render sort then render while removing destroyed objects
            enginePreRender();
            gameRender();
            engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
            for (const o of engineObjects)
                o.destroyed || o.render();
            gameRenderPost();
            pluginRenderList.forEach(f=>f());
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

    function startEngine()
    {
        new Promise((resolve) => resolve(gameInit())).then(engineUpdate);
    }

    if (headlessMode)
    {
        startEngine();
        return;
    }

    // setup html
    const styleRoot = 
        'margin:0;overflow:hidden;' + // fill the window
        'width:100vw;height:100vh;' + // fill the window
        'display:flex;' +             // use flexbox
        'align-items:center;' +       // horizontal center
        'justify-content:center;' +   // vertical center
        'background:#000;' +          // set background color
        'user-select:none;' +         // prevent hold to select
        '-webkit-user-select:none;' + // compatibility for ios
        (!touchInputEnable ? '' :     // no touch css setttings
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
    const styleCanvas = 'position:absolute'; // allow canvases to overlap
    mainCanvas.style.cssText = overlayCanvas.style.cssText = styleCanvas;
    if (glCanvas)
        glCanvas.style.cssText = styleCanvas;
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
                clearInput();
                drawEngineSplashScreen(t+=.01);
                t>1 ? resolve() : setTimeout(updateSplash, 16);
            }
        }));
    }

    // load all of the images
    Promise.all(promises).then(startEngine);
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
 * LittleJS Module Export
 * - Export engine as a module
 */

export {

	// Engine
	engineName,
	engineVersion,
	frameRate,
	timeDelta,
	engineObjects,
	frame,
	time,
	timeReal,
	paused,
	setPaused,
	engineInit,
	engineObjectsUpdate,
	engineObjectsDestroy,
	engineObjectsCallback,
	engineObjectsRaycast,
	engineAddPlugin,

	// Globals
	debug,
	debugOverlay,
	showWatermark,

	// Debug
	ASSERT,
	debugRect,
	debugPoly,
	debugCircle,
	debugPoint,
	debugLine,
	debugOverlap,
	debugText,
	debugClear,
	debugSaveCanvas,
	debugSaveText,
	debugSaveDataURL,

	// Settings
	cameraPos,
	cameraScale,
	canvasMaxSize,
	canvasFixedSize,
	canvasPixelated,
	fontDefault,
	showSplashScreen,
	headlessMode,
	tileSizeDefault,
	tileFixBleedScale,
	enablePhysicsSolver,
	objectDefaultMass,
	objectDefaultDamping,
	objectDefaultAngleDamping,
	objectDefaultElasticity,
	objectDefaultFriction,
	objectMaxSpeed,
	gravity,
	particleEmitRateScale,
	glEnable,
	glOverlay,
	gamepadsEnable,
	gamepadDirectionEmulateStick,
	inputWASDEmulateDirection,
	touchGamepadEnable,
	touchGamepadAnalog,
	touchGamepadSize,
	touchGamepadAlpha,
	vibrateEnable,
	soundEnable,
	soundVolume,
	soundDefaultRange,
	soundDefaultTaper,
	medalDisplayTime,
	medalDisplaySlideTime,
	medalDisplaySize,
	medalDisplayIconSize,

	// Setters for globals
	setCameraPos,
	setCameraScale,
	setCanvasMaxSize,
	setCanvasFixedSize,
	setCanvasPixelated,
	setFontDefault,
	setShowSplashScreen,
	setHeadlessMode,
	setGlEnable,
	setGlOverlay,
	setTileSizeDefault,
	setTileFixBleedScale,
	setEnablePhysicsSolver,
	setObjectDefaultMass,
	setObjectDefaultDamping,
	setObjectDefaultAngleDamping,
	setObjectDefaultElasticity,
	setObjectDefaultFriction,
	setObjectMaxSpeed,
	setGravity,
	setParticleEmitRateScale,
	setTouchInputEnable,
	setGamepadsEnable,
	setGamepadDirectionEmulateStick,
	setInputWASDEmulateDirection,
	setTouchGamepadEnable,
	setTouchGamepadAnalog,
	setTouchGamepadSize,
	setTouchGamepadAlpha,
	setVibrateEnable,
	setSoundEnable,
	setSoundVolume,
	setSoundDefaultRange,
	setSoundDefaultTaper,
	setMedalDisplayTime,
	setMedalDisplaySlideTime,
	setMedalDisplaySize,
	setMedalDisplayIconSize,
	setMedalsPreventUnlock,
	setShowWatermark,
	setDebugKey,

	// Utilities
	PI,
	abs,
	min,
	max,
	sign,
	mod,
	clamp,
	percent,
	distanceWrap,
	lerpWrap,
	distanceAngle,
	lerpAngle,
	lerp,
	smoothStep,
	nearestPowerOfTwo,
	isOverlapping,
	isIntersecting,
	wave,
	formatTime,

	// Random
	rand,
	randInt,
	randSign,
	randInCircle,
	randVector,
	randColor,

	// Utility Classes
	RandomGenerator,
	Vector2,
	Color,
	Timer,
	vec2,
	rgb,
	hsl,
	isColor,

	// Default Colors
	WHITE,
	BLACK,
	GRAY,
	RED,
	ORANGE,
	YELLOW,
	GREEN,
	CYAN,
	BLUE,
	PURPLE,
	MAGENTA,

	// Draw
	textureInfos,
	tile,
	TileInfo,
	TextureInfo,
	mainCanvas,
	mainContext,
	overlayCanvas,
	overlayContext,
	mainCanvasSize,
	screenToWorld,
	worldToScreen,
	drawTile,
	drawRect,
	drawLine,
	drawPoly,
	drawEllipse,
	drawCircle,
	drawCanvas2D,
	setBlendMode,
	drawTextScreen,
	drawText,
	engineFontImage,
	FontImage,
	isFullscreen,
	toggleFullscreen,
	getCameraSize,

	// WebGL
	glCanvas,
	glContext,
	glCompileShader,
	glCopyToContext,
	glCreateProgram,
	glCreateTexture,
	glDraw,
	glFlush,
	glSetTexture,
	glSetAntialias,
	glAntialias,
	glShader, 
	glActiveTexture, 
	glArrayBuffer, 
	glGeometryBuffer, 
	glPositionData, 
	glColorData, 
	glInstanceCount, 
	glAdditive, 
	glBatchAdditive,

	// Input
	keyIsDown,
	keyWasPressed,
	keyWasReleased,
	clearInput,
	mouseIsDown,
	mouseWasPressed,
	mouseWasReleased,
	mousePos,
	mousePosScreen,
	mouseWheel,
	isUsingGamepad,
	preventDefaultInput,
	gamepadIsDown,
	gamepadWasPressed,
	gamepadWasReleased,
	gamepadStick,
	mouseToScreen,
	gamepadsUpdate,
	vibrate,
	vibrateStop,
	isTouchDevice,

	// Audio
	Sound,
	SoundWave,
	Music,
	playAudioFile,
	speak,
	speakStop,
	getNoteFrequency,
	audioContext,
	playSamples,
	zzfx,

	// Base Object
	EngineObject,

	// Tiles
	tileCollision,
	tileCollisionSize,
	initTileCollision,
	setTileCollisionData,
	getTileCollisionData,
	tileCollisionTest,
	tileCollisionRaycast,
	TileLayerData,
	TileLayer,

	// Particles
	ParticleEmitter,
	Particle,

	// Medals
	medals,
	medalsPreventUnlock,
	medalsInit,
	Medal,
};

