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
    if(!(touchInputEnable && isTouchDevice) && !document.hasFocus())
        inputClear();

    // update mouse world space position
    mousePos = screenToWorld(mousePosScreen);
    mouseDelta = mouseDeltaScreen.multiply(vec2(1,-1)).rotate(-cameraAngle);

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
    document.addEventListener('wheel', onMouseWheel);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('blur', onBlur);
    document.addEventListener('mouseleave', onMouseLeave);

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
    function remapKey(c)
    {
        // handle remapping wasd keys to directions
        return inputWASDEmulateDirection ?
            c === 'KeyW' ? 'ArrowUp' :
            c === 'KeyS' ? 'ArrowDown' :
            c === 'KeyA' ? 'ArrowLeft' :
            c === 'KeyD' ? 'ArrowRight' : c : c;
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
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
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
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
        mouseDeltaScreen = mouseDeltaScreen.add(vec2(e.movementX, e.movementY));
    }
    function onMouseWheel(e) { mouseWheel = e.ctrlKey ? 0 : sign(e.deltaY); }
    function onContextMenu(e) { e.preventDefault(); } // prevent right click menu
    function onBlur() { inputClear(); } // reset input when focus is lost
    function onMouseLeave()
    {
        // set mouse position and delta when leaving canvas
        mousePosScreen = vec2(-1);
        mouseDeltaScreen = vec2(0);
    }
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
            sticks[0].x = Math.round(touchGamepadStick.x);
            sticks[0].y = -Math.round(touchGamepadStick.y);
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
    let center = vec2(mainCanvasSize.x-touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    if (touchGamepadButtonCount <= 2)
        center.x += touchGamepadSize/2;
    return center;
}

// enable touch input mouse passthrough
function touchInputInit()
{
    // add non passive touch event listeners
    let handleTouch = handleTouchDefault;
    document.addEventListener('touchstart', (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchmove',  (e) => handleTouch(e), { passive: false });
    document.addEventListener('touchend',   (e) => handleTouch(e), { passive: false });

    // handle all touch events the same way
    let wasTouching;
    function handleTouchDefault(e)
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
            const lastMousePosScreen = mousePosScreen;
            mousePosScreen = mouseEventToScreen(pos);
            if (wasTouching)
            {
                mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(lastMousePosScreen));
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
            if (paused && !wasTouching)
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
            else if (startCenter.distance(touchPos) < touchGamepadSize && !wasTouching)
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
        let j = mod(i-1, 4);
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