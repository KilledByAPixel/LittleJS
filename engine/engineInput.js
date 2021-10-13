/*
    LittleJS Input System
    - Tracks key down, pressed, and released
    - Also tracks mouse buttons, position, and wheel
    - Supports multiple gamepads
*/

'use strict';

// input for all devices including keyboard, mouse, and gamepad
let hadInput         = 0;
const keyIsDown      = (key, device=0)=> inputData[device] && inputData[device][key] & 1 ? 1 : 0;
const keyWasPressed  = (key, device=0)=> inputData[device] && inputData[device][key] & 2 ? 1 : 0;
const keyWasReleased = (key, device=0)=> inputData[device] && inputData[device][key] & 4 ? 1 : 0;
const clearInput     = ()=> inputData[0] = [];

// mouse input
const mouseIsDown      = keyIsDown;
const mouseWasPressed  = keyWasPressed;
const mouseWasReleased = keyWasReleased;
let mousePos           = vec2();
let mousePosScreen     = vec2();
let mouseWheel         = 0;

// gamepad input
let usingGamepad = 0;
const gamepadIsDown      = (button, gamepad=0)=> keyIsDown     (button, gamepad+1);
const gamepadWasPressed  = (button, gamepad=0)=> keyWasPressed (button, gamepad+1);
const gamepadWasReleased = (button, gamepad=0)=> keyWasReleased(button, gamepad+1);
const gamepadStick       = (stick,  gamepad=0)=> stickData[gamepad] ? stickData[gamepad][stick] || vec2() : vec2();

///////////////////////////////////////////////////////////////////////////////

// keyboard event handlers
const inputData = [[]];
onkeydown   = e=>
{
    if (debug && e.target != document.body) return;
    e.repeat || (inputData[usingGamepad = 0][remapKeyCode(e.keyCode)] = 3);
    hadInput = 1;
}
onkeyup     = e=>
{
    if (debug && e.target != document.body) return;
    inputData[0][remapKeyCode(e.keyCode)] = 4;
}
const remapKeyCode = c=> copyWASDToDpad ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

// mouse event handlers
onmousedown = e=> (inputData[usingGamepad = 0][e.button] = 3, hadInput = 1, onmousemove(e));
onmouseup   = e=> inputData[0][e.button] = 4;
onmousemove = e=>
{
    // convert mouse pos to canvas space
    if (!mainCanvas) return;
    const rect = mainCanvas.getBoundingClientRect();
    mousePosScreen.x = mainCanvasSize.x * percent(e.x, rect.right, rect.left);
    mousePosScreen.y = mainCanvasSize.y * percent(e.y, rect.bottom, rect.top);
}
onwheel = e=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
oncontextmenu = e=> !1; // prevent right click menu

///////////////////////////////////////////////////////////////////////////////
// input update called by engine

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
// gamepad input

const stickData = [];
function gamepadsUpdate()
{
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
                v >  deadZone ?  percent( v, deadZoneMax, deadZone) : 
                v < -deadZone ? -percent(-v, deadZoneMax, deadZone) : 0;

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j+1])).clampLength();
            
            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                data[j] = button.pressed ? 1 + 2*!gamepadIsDown(j,i) : 4*gamepadIsDown(j,i);
                usingGamepad |= button.pressed && !i;
            }
            
            if (copyGamepadDirectionToStick)
            {
                // copy dpad to left analog stick when pressed
                if (gamepadIsDown(12,i)|gamepadIsDown(13,i)|gamepadIsDown(14,i)|gamepadIsDown(15,i))
                    sticks[0] = vec2(
                        gamepadIsDown(15,i) - gamepadIsDown(14,i), 
                        gamepadIsDown(12,i) - gamepadIsDown(13,i)
                    ).clampLength();
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// touch screen input
const isTouchDevice = touchInputEnable && window.ontouchstart !== undefined;
if (isTouchDevice)
{
    // handle all touch events the same way
    let wasTouching;
    ontouchstart = ontouchmove = ontouchend = e=>
    {
        e.button = 0; // all touches are left click

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        if (touching)
        {
            hadInput || zzfx(0) ; // fix mobile audio, force it to play a sound the first time

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