/*
    LittleJS Input System
    - Tracks key down, pressed, and released
    - Also tracks mouse buttons, position, and wheel
    - Supports multiple gamepads
*/

'use strict';


// input for all devices including keyboard, mouse, and gamepad. (d=1, p=2, r=4)
const inputData = [[]];
const keyIsDown      = (key, device=0)=> inputData[device] && inputData[device][key] & 1 ? 1 : 0;
const keyWasPressed  = (key, device=0)=> inputData[device] && inputData[device][key] & 2 ? 1 : 0;
const keyWasReleased = (key, device=0)=> inputData[device] && inputData[device][key] & 4 ? 1 : 0;
const clearInput     = ()=> inputData[0] = [];

// mouse input is stored with keyboard
let hadInput   = 0;
let mouseWheel = 0;
let mousePosScreen = vec2();
let mousePos = vec2();
const mouseIsDown      = keyIsDown;
const mouseWasPressed  = keyWasPressed;
const mouseWasReleased = keyWasReleased;

// input event handlers
onkeydown   = e=>
{
    if (debug && e.target != document.body) return;
    e.repeat || (inputData[usingGamepad = 0][remapKeyCode(e.keyCode)] = (hadInput = 1) + 2);
}
onkeyup     = e=>
{
    if (debug && e.target != document.body) return;
    inputData[0][remapKeyCode(e.keyCode)] = 4;
}
onmousedown = e=> (inputData[usingGamepad = 0][e.button] = (hadInput = 1) + 2, onmousemove(e));
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
const remapKeyCode = c=> copyWASDToDpad ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

////////////////////////////////////////////////////////////////////
// gamepad

let usingGamepad = 0;
const gamepadStick       = (stick,  gamepad=0)=> inputData[gamepad+1] ? inputData[gamepad+1].stickData[stick] || vec2() : vec2();
const gamepadIsDown      = (button, gamepad=0)=> keyIsDown     (button, gamepad+1);
const gamepadWasPressed  = (button, gamepad=0)=> keyWasPressed (button, gamepad+1);
const gamepadWasReleased = (button, gamepad=0)=> keyWasReleased(button, gamepad+1);

////////////////////////////////////////////////////////////////////
// update functions called by engine
function updateInput()
{
    for (const deviceInputData of inputData)
    for (const i in deviceInputData)
        deviceInputData[i]>0 && (deviceInputData[i] &= 1);
    mouseWheel = 0;
}

function updateGamepads()
{
    if (!gamepadsEnable) return;

    if (!navigator.getGamepads || !document.hasFocus() && !debug)
        return;

    // poll gamepads
    const gamepads = navigator.getGamepads();
    for (let i = gamepads.length; i--;)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        let data = inputData[i+1];
        if (!data)
        {
            data = inputData[i+1] = [];
            data.stickData = [];
        }

        if (gamepad)
        {
            // read clamp dead zone of analog sticks
            const deadZone = .3, deadZoneMax = .8;
            const applyDeadZone = (v)=> 
                v >  deadZone ?  percent( v, deadZoneMax, deadZone) : 
                v < -deadZone ? -percent(-v, deadZoneMax, deadZone) : 0;

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                data.stickData[j>>1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j+1])).clampLength();
            
            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                inputData[i+1][j] = button.pressed ? 1 + 2*!gamepadIsDown(j,i) : 4*gamepadIsDown(j,i);
                usingGamepad |= button.pressed && !i;
            }
            
            if (copyGamepadDirectionToStick)
            {
                // copy dpad to left analog stick when pressed
                if (gamepadIsDown(12,i)|gamepadIsDown(13,i)|gamepadIsDown(14,i)|gamepadIsDown(15,i))
                    data.stickData[0] = vec2(
                        gamepadIsDown(15,i) - gamepadIsDown(14,i), 
                        gamepadIsDown(12,i) - gamepadIsDown(13,i)
                    ).clampLength();
            }

            if (debugGamepads)
            {
                // gamepad debug display
                const stickScale = 2;
                const buttonScale = .5;
                const centerPos = cameraPos;
                for (let j = data.stickData.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*stickScale*2,i*stickScale*3));
                    const stickPos = drawPos.add(data.stickData[j].scale(stickScale));
                    debugCircle(drawPos, stickScale, '#fff7',0,1);
                    debugLine(drawPos, stickPos, '#f00');
                    debugPoint(stickPos, '#f00');
                }
                for (let j = gamepad.buttons.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*buttonScale*2, i*stickScale*3-stickScale-buttonScale));
                    const pressed = gamepad.buttons[j].pressed;
                    debugCircle(drawPos, buttonScale, pressed ? '#f00' : '#fff7', 0, 1);
                }
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
    ontouchstart = ontouchmove = ontouchend = e=>
    {
        e.button = 0; // all touches are left click
        hadInput || zzfx(0, hadInput = 1) ; // fix mobile audio, force it to play a sound the first time

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        if (touching)
        {
            // set event pos and pass it along
            e.x = e.touches[0].clientX;
            e.y = e.touches[0].clientY;
            wasTouching ? onmousemove(e) : onmousedown(e);
        }
        else if (wasTouching)
            wasTouching && onmouseup(e);

        // set was touching
        wasTouching = touching;

        // prevent normal mouse events from being called
        return !e.cancelable;
    }
    let wasTouching;
}