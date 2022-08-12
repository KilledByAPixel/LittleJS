/** 
 * LittleJS Input System
 * <br> - Tracks key down, pressed, and released
 * <br> - Also tracks mouse buttons, position, and wheel
 * <br> - Supports multiple gamepads
 * <br> - Virtual gamepad for touch devices with touchGamepadSize
 * @namespace Input
 */

'use strict';

/** Returns true if device key is down
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
const keyIsDown = (key, device=0)=> inputData[device] && inputData[device][key] & 1 ? 1 : 0;

/** Returns true if device key was pressed this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
const keyWasPressed = (key, device=0)=> inputData[device] && inputData[device][key] & 2 ? 1 : 0;

/** Returns true if device key was released this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
const keyWasReleased = (key, device=0)=> inputData[device] && inputData[device][key] & 4 ? 1 : 0;

/** Clears all input
 *  @memberof Input */
const clearInput = ()=> inputData = [[]];

/** Returns true if mouse button is down
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
const mouseIsDown = keyIsDown;

/** Returns true if mouse button was pressed
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
const mouseWasPressed = keyWasPressed;

/** Returns true if mouse button was released
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
 *  @memberof Input */
let mouseWheel = 0;

/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @memberof Input */
let isUsingGamepad = 0;

/** Prevents input continuing to the default browser handling (false by default)
 *  @memberof Input */
let preventDefaultInput = 0;

/** Returns true if gamepad button is down
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
const gamepadIsDown = (button, gamepad=0)=> keyIsDown(button, gamepad+1);

/** Returns true if gamepad button was pressed
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
const gamepadWasPressed = (button, gamepad=0)=> keyWasPressed(button, gamepad+1);

/** Returns true if gamepad button was released
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
const gamepadWasReleased = (button, gamepad=0)=> keyWasReleased(button, gamepad+1);

/** Returns gamepad stick value
 *  @param {Number} stick
 *  @param {Number} [gamepad=0]
 *  @return {Vector2}
 *  @memberof Input */
const gamepadStick = (stick,  gamepad=0)=> stickData[gamepad] ? stickData[gamepad][stick] || vec2() : vec2();

///////////////////////////////////////////////////////////////////////////////
// Input update called by engine

// store input as a bit field for each key: 1 = isDown, 2 = wasPressed, 4 = wasReleased
// mouse and keyboard are stored together in device 0, gamepads are in devices > 0
let inputData = [[]];

function inputUpdate()
{
    // clear input when lost focus (prevent stuck keys)
    document.hasFocus() || clearInput();

    // update mouse world space position
    mousePos = screenToWorld(mousePosScreen);

    // update gamepads if enabled
    gamepadsUpdate();
}

function inputUpdatePost()
{
    // clear input to prepare for next frame
    for (const deviceInputData of inputData)
    for (const i in deviceInputData)
        deviceInputData[i] &= 1;
    mouseWheel = 0;
}

///////////////////////////////////////////////////////////////////////////////
// Keyboard event handlers

onkeydown = (e)=>
{
    if (debug && e.target != document.body) return;
    e.repeat || (inputData[isUsingGamepad = 0][remapKeyCode(e.keyCode)] = 3);
    preventDefaultInput && e.preventDefault();
}
onkeyup = (e)=>
{
    if (debug && e.target != document.body) return;
    inputData[0][remapKeyCode(e.keyCode)] = 4;
}
const remapKeyCode = (c)=> inputWASDEmulateDirection ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

///////////////////////////////////////////////////////////////////////////////
// Mouse event handlers

onmousedown = (e)=> {inputData[isUsingGamepad = 0][e.button] = 3; onmousemove(e); e.button && e.preventDefault();}
onmouseup   = (e)=> inputData[0][e.button] = inputData[0][e.button] & 2 | 4;
onmousemove = (e)=> mousePosScreen = mouseToScreen(e);
onwheel = (e)=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
oncontextmenu = (e)=> !1; // prevent right click menu

// convert a mouse or touch event position to screen space
const mouseToScreen = (mousePos)=>
{
    if (!mainCanvas)
        return vec2(); // fix bug that can occur if user clicks before page loads

    const rect = mainCanvas.getBoundingClientRect();
    return vec2(mainCanvas.width, mainCanvas.height).multiply(
        vec2(percent(mousePos.x, rect.left, rect.right), percent(mousePos.y, rect.top, rect.bottom)));
}

///////////////////////////////////////////////////////////////////////////////
// Gamepad input

const stickData = [];
function gamepadsUpdate()
{
    if (touchGamepadEnable && touchGamepadTimer.isSet())
    {
        // read virtual analog stick
        const sticks = stickData[0] || (stickData[0] = []);
        sticks[0] = vec2(touchGamepadStick.x, -touchGamepadStick.y); // flip vertical

        // read virtual gamepad buttons
        const data = inputData[1] || (inputData[1] = []);
        for (let i=10; i--;)
        {
            const j = i == 3 ? 2 : i == 2 ? 3 : i; // fix button locations
            data[j] = touchGamepadButtons[i] ? 1 + 2*!gamepadIsDown(j,0) : 4*gamepadIsDown(j,0);
        }
    }

    if (!gamepadsEnable || !navigator.getGamepads || !document.hasFocus() && !debug)
        return;

    // poll gamepads
    const gamepads = navigator.getGamepads();
    for (let i = gamepads.length; i--;)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        const data = inputData[i+1] || (inputData[i+1] = []);
        const sticks = stickData[i] || (stickData[i] = []);

        if (gamepad)
        {
            // read clamp dead zone of analog sticks
            const deadZone = .3, deadZoneMax = .8;
            const applyDeadZone = (v)=> 
                v >  deadZone ?  percent( v, deadZone, deadZoneMax) : 
                v < -deadZone ? -percent(-v, deadZone, deadZoneMax) : 0;

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j+1])).clampLength();
            
            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                data[j] = button.pressed ? 1 + 2*!gamepadIsDown(j,i) : 4*gamepadIsDown(j,i);
                isUsingGamepad |= !i && button.pressed;
                touchGamepadEnable && touchGamepadTimer.unset(); // disable touch gamepad if using real gamepad
            }

            if (gamepadDirectionEmulateStick)
            {
                // copy dpad to left analog stick when pressed
                const dpad = vec2(gamepadIsDown(15,i) - gamepadIsDown(14,i), gamepadIsDown(12,i) - gamepadIsDown(13,i));
                if (dpad.lengthSquared())
                    sticks[0] = dpad.clampLength();
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Pulse the vibration hardware if it exists
 *  @param {Number} [pattern=100] - a single value in miliseconds or vibration interval array
 *  @memberof Input */
const vibrate = (pattern)=> vibrateEnable && Navigator.vibrate && Navigator.vibrate(pattern);

/** Cancel any ongoing vibration
 *  @memberof Input */
const vibrateStop = ()=> vibrate(0);

///////////////////////////////////////////////////////////////////////////////
// Touch input

/** True if a touch device has been detected
 *  @const {boolean}
 *  @memberof Input */
const isTouchDevice = window.ontouchstart !== undefined;

// try to enable touch mouse
if (isTouchDevice)
{
    // handle all touch events the same way
    let wasTouching, hadTouchInput;
    ontouchstart = ontouchmove = ontouchend = (e)=>
    {
        e.button = 0; // all touches are left click

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        if (touching)
        {
            hadTouchInput || zzfx(0, hadTouchInput=1) ; // fix mobile audio, force it to play a sound the first time

            // set event pos and pass it along
            e.x = e.touches[0].clientX;
            e.y = e.touches[0].clientY;
            wasTouching ? onmousemove(e) : onmousedown(e);
        }
        else if (wasTouching)
            onmouseup(e);

        // set was touching
        wasTouching = touching;

        // prevent normal mouse events from being called
        return !e.cancelable;
    }
}

///////////////////////////////////////////////////////////////////////////////
// touch gamepad, virtual on screen gamepad emulator for touch devices

// touch input internal variables
let touchGamepadTimer = new Timer, touchGamepadButtons = [], touchGamepadStick = vec2();

// create the touch gamepad, called automatically by the engine
function touchGamepadCreate()
{
    if (!touchGamepadEnable || !isTouchDevice)
        return;

    ontouchstart = ontouchmove = ontouchend = (e)=> 
    {
        if (!touchGamepadEnable)
            return;

        // clear touch gamepad input
        touchGamepadStick = vec2();
        touchGamepadButtons = [];
            
        const touching = e.touches.length;
        if (touching)
        {
            touchGamepadTimer.isSet() || zzfx(0) ; // fix mobile audio, force it to play a sound the first time

            // set that gamepad is active
            isUsingGamepad = 1;
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
                if (touchGamepadAnalog)
                    touchGamepadStick = touchPos.subtract(stickCenter).scale(2/touchGamepadSize).clampLength();
                else
                {
                    // 8 way dpad
                    const angle = touchPos.subtract(stickCenter).angle();
                    touchGamepadStick.setAngle((angle * 4 / PI + 8.5 | 0) * PI / 4);
                }
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
    }
}

// render the touch gamepad, called automatically by the engine
function touchGamepadRender()
{
    if (!touchGamepadEnable || !touchGamepadTimer.isSet())
        return;
    
    // fade off when not touching or paused
    const alpha = percent(touchGamepadTimer.get(), 4, 3);
    if (!alpha || paused)
        return;

    // setup the canvas
    overlayContext.save();
    overlayContext.globalAlpha = alpha*touchGamepadAlpha;
    overlayContext.strokeStyle = '#fff';
    overlayContext.lineWidth = 3;

    // draw left analog stick
    overlayContext.fillStyle = touchGamepadStick.lengthSquared() > 0 ? '#fff' : '#000';
    overlayContext.beginPath();

    const leftCenter = vec2(touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    if (touchGamepadAnalog)
    {
        overlayContext.arc(leftCenter.x, leftCenter.y, touchGamepadSize/2, 0, 9);
        overlayContext.fill();
        overlayContext.stroke();
    }
    else // draw cross shaped gamepad
    {
        for(let i=10; i--;)
        {
            const angle = i*PI/4;
            overlayContext.arc(leftCenter.x, leftCenter.y,touchGamepadSize*.6, angle + PI/8, angle + PI/8);
            i%2 && overlayContext.arc(leftCenter.x, leftCenter.y, touchGamepadSize*.33, angle, angle);
            i==1 && overlayContext.fill();
        }
        overlayContext.stroke();
    }
    
    // draw right face buttons
    const rightCenter = vec2(mainCanvasSize.x-touchGamepadSize, mainCanvasSize.y-touchGamepadSize);
    for (let i=4; i--;)
    {
        const pos = rightCenter.add((new Vector2).setAngle(i*PI/2, touchGamepadSize/2));
        overlayContext.fillStyle = touchGamepadButtons[i] ? '#fff' : '#000';
        overlayContext.beginPath();
        overlayContext.arc(pos.x, pos.y, touchGamepadSize/4, 0,9);
        overlayContext.fill();
        overlayContext.stroke();
    }

    // set canvas back to normal
    overlayContext.restore();
}