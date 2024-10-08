/** 
 * LittleJS Input System
 * - Tracks keyboard down, pressed, and released
 * - Tracks mouse buttons, position, and wheel
 * - Tracks multiple analog gamepads
 * - Touch input is handled as mouse input
 * - Virtual gamepad for touch devices
 * @namespace Input
 */

'use strict';

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
function clearInput() { inputData = [[]]; }

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
        if (debug && e.target != document.body) return;
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
        if (debug && e.target != document.body) return;
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
            wasTouching ? isUsingGamepad = false : inputData[0][button] = 3;
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
            if (paused)
            {
                // touch anywhere to press start when paused
                touchGamepadButtons[9] = 1;
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
            else if (touchPos.distance(startCenter) < touchGamepadSize)
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