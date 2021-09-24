/*
    LittleJS Input System
    - Tracks key down, pressed, and released
    - Also tracks mouse buttons, position, and wheel
    - Supports multiple gamepads
*/

'use strict';

// input for all devices including keyboard, mouse, and gamepad. (d=down, p=pressed, r=released)
const inputData = [[]];
const keyIsDown      = (key, device=0)=> inputData[device][key] && inputData[device][key].d ? 1 : 0;
const keyWasPressed  = (key, device=0)=> inputData[device][key] && inputData[device][key].p ? 1 : 0;
const keyWasReleased = (key, device=0)=> inputData[device][key] && inputData[device][key].r ? 1 : 0;
const clearInput     = ()=> inputData[0].length = 0;

// mouse input is stored with keyboard
let hadInput   = 0;
let mouseWheel = 0;
let mousePosScreen = vec2();
let mousePos = vec2();
const mouseIsDown      = keyIsDown;
const mouseWasPressed  = keyWasPressed;
const mouseWasReleased = keyWasReleased;

// handle input events
onkeydown   = e=>
{
    if (debug && e.target != document.body) return;
    e.repeat || (inputData[isUsingGamepad = 0][remapKeyCode(e.keyCode)] = {d:hadInput=1, p:1});
}
onkeyup     = e=>
{
    if (debug && e.target != document.body) return;
    const c = remapKeyCode(e.keyCode); inputData[0][c] && (inputData[0][c].d = 0, inputData[0][c].r = 1);
}
onmousedown = e=> (inputData[0][e.button] = {d:hadInput=1, p:1}, onmousemove(e));
onmouseup   = e=> inputData[0][e.button] && (inputData[0][e.button].d = 0, inputData[0][e.button].r = 1);
onmousemove = e=>
{
    if (!mainCanvas)
        return;

    // convert mouse pos to canvas space
    const rect = mainCanvas.getBoundingClientRect();
    mousePosScreen.x = mainCanvasSize.x * percent(e.x, rect.right, rect.left);
    mousePosScreen.y = mainCanvasSize.y * percent(e.y, rect.bottom, rect.top);
}
onwheel = e=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
oncontextmenu = e=> !1; // prevent right click menu
const remapKeyCode = c=> copyWASDToDpad ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

////////////////////////////////////////////////////////////////////
// gamepad

let isUsingGamepad = 0;
let gamepadCount = 0;
const gamepadStick       = (stick,  gamepad=0)=> gamepad < gamepadCount ? inputData[gamepad+1].stickData[stick] : vec2();
const gamepadIsDown      = (button, gamepad=0)=> gamepad < gamepadCount ? keyIsDown     (button, gamepad+1) : 0;
const gamepadWasPressed  = (button, gamepad=0)=> gamepad < gamepadCount ? keyWasPressed (button, gamepad+1) : 0;
const gamepadWasReleased = (button, gamepad=0)=> gamepad < gamepadCount ? keyWasReleased(button, gamepad+1) : 0;

function updateGamepads()
{
    if (!navigator.getGamepads || !gamepadsEnable)
        return;

    if (!document.hasFocus() && !debug)
        return;

    const gamepads = navigator.getGamepads();
    gamepadCount = 0;
    for(let i = 0; i < navigator.getGamepads().length; ++i)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        let data = inputData[i+1];
        if (!data)
        {
            data = inputData[i+1] = [];
            data.stickData = [vec2(), vec2()];
        }

        if (gamepad && gamepad.axes.length >= 2)
        {
            gamepadCount = i+1;

            // read analog sticks and clamp dead zone
            const deadZone = .3, deadZoneMax = .8;
            const applyDeadZone = (v)=> 
                v >  deadZone ?  percent( v, deadZoneMax, deadZone) : 
                v < -deadZone ? -percent(-v, deadZoneMax, deadZone) : 0;
            data.stickData[0] = vec2(applyDeadZone(gamepad.axes[0]), applyDeadZone(-gamepad.axes[1]));
            
            if (copyGamepadDirectionToStick)
            {
                // copy dpad to left analog stick when pressed
                if (gamepadIsDown(12,i)|gamepadIsDown(13,i)|gamepadIsDown(14,i)|gamepadIsDown(15,i))
                    data.stickData[0] = vec2(gamepadIsDown(15,i) - gamepadIsDown(14,i), gamepadIsDown(12,i) - gamepadIsDown(13,i));
            }

            // clamp stick input to unit vector
            data.stickData[0] = data.stickData[0].clampLength();
            
            // read buttons
            gamepad.buttons.map((button, j)=>
            {
                inputData[i+1][j] = button.pressed ? {d:1, p:!gamepadIsDown(j,i)} : 
                inputData[i+1][j] = {r:gamepadIsDown(j,i)}
                isUsingGamepad |= button.pressed && !i;
            });
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// touch screen input

if (touchInputEnable && window.ontouchstart !== undefined)
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
    }
    let wasTouching;
}