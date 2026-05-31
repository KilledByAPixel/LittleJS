/**
 * LittleJS Input System
 * - Keyboard input with key down, pressed, and released states
 * - Mouse input with position (world and screen space), buttons, and wheel
 * - Gamepad support for multiple controllers with analog sticks and buttons
 * - Touch input mapped to mouse position and buttons
 * - Virtual on-screen gamepad for mobile devices
 * - Automatic gamepad vs keyboard/mouse detection
 * - Input event prevention for canvas focus
 * - Clipboard copy/paste support
 * @namespace Input
 */

'use strict';

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

/** True if mouse was inside the document window, set to false when mouse leaves
 *  @type {boolean}
 *  @memberof Input */
let mouseInWindow = true;

/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @type {boolean}
 *  @memberof Input */
let isUsingGamepad = false;

/** Prevents input continuing to the default browser handling (true by default)
 *  @type {boolean}
 *  @memberof Input */
let inputPreventDefault = true;

/** Primary gamepad index, automatically set to first gamepad with input
 *  @type {number}
 *  @memberof Input */
let gamepadPrimary = 0;

/** True if a touch device has been detected
 *  @memberof Input */
const isTouchDevice = !headlessMode && window.ontouchstart !== undefined;

/** Prevents input continuing to the default browser handling
 *  This is useful to disable for html menus so the browser can handle input normally
 *  @param {boolean} preventDefault
 *  @memberof Input */
function setInputPreventDefault(preventDefault=true) { inputPreventDefault = preventDefault; }

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

/** Clears all input
 *  @memberof Input */
function inputClear()
{
    inputData.length = 0;
    inputData[0] = [];
    touchGamepadButtons.length = 0;
    touchGamepadSticks.length = 0;
    touchGamepadStickPointerId.length = 0; // release floating sticks so they re-anchor
    gamepadStickData.length = 0;
    gamepadDpadData.length = 0;
}

///////////////////////////////////////////////////////////////////////////////

/** Returns true if device key is down
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyIsDown(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 1);
}

/** Returns true if device key was pressed this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasPressed(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 2);
}

/** Returns true if device key was released this frame
 *  @param {string|number} key
 *  @param {number} [device]
 *  @return {boolean}
 *  @memberof Input */
function keyWasReleased(key, device=0)
{
    ASSERT(isStringLike(key), 'key must be a number or string');
    ASSERT(device > 0 || typeof key !== 'number' || key < 3, 'use code string for keyboard');
    return !!(inputData[device]?.[key] & 4);
}

/** Returns input vector from arrow keys or WASD if enabled
 *  @param {string} [up]
 *  @param {string} [down]
 *  @param {string} [left]
 *  @param {string} [right]
 *  @return {Vector2}
 *  @memberof Input */
function keyDirection(up='ArrowUp', down='ArrowDown', left='ArrowLeft', right='ArrowRight')
{
    ASSERT(isStringLike(up),    'up key must be a string');
    ASSERT(isStringLike(down),  'down key must be a string');
    ASSERT(isStringLike(left),  'left key must be a string');
    ASSERT(isStringLike(right), 'right key must be a string');
    const k = (key)=> keyIsDown(key) ? 1 : 0;
    return vec2(k(right) - k(left), k(up) - k(down));
}

/** Returns true if mouse button is down
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseIsDown(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyIsDown(button);
}

/** Returns true if mouse button was pressed
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasPressed(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyWasPressed(button);
}

/** Returns true if mouse button was released
 *  @function
 *  @param {number} button
 *  @return {boolean}
 *  @memberof Input */
function mouseWasReleased(button)
{
    ASSERT(isNumber(button), 'mouse button must be a number');
    return keyWasReleased(button);
}

/** Returns true if gamepad button is down
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadIsDown(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyIsDown(button, gamepad+1);
}

/** Returns true if gamepad button was pressed
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasPressed(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyWasPressed(button, gamepad+1);
}

/** Returns true if gamepad button was released
 *  @param {number} button
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadWasReleased(button, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(button), 'button must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return keyWasReleased(button, gamepad+1);
}

/** Returns gamepad stick value
 *  @param {number} stick
 *  @param {number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadStick(stick, gamepad=gamepadPrimary)
{
    ASSERT(isNumber(stick), 'stick must be a number');
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadStickData[gamepad]?.[stick] ?? vec2();
}

/** Returns gamepad dpad value
 *  @param {number} [gamepad]
 *  @return {Vector2}
 *  @memberof Input */
function gamepadDpad(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadDpadData[gamepad] ?? vec2();
}

/** Returns true if passed in gamepad is connected
 *  @param {number} [gamepad]
 *  @return {boolean}
 *  @memberof Input */
function gamepadConnected(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return !!inputData[gamepad+1];
}

/** Returns how many control sticks the passed in gamepad has
 *  @param {number} [gamepad]
 *  @return {number}
 *  @memberof Input */
function gamepadStickCount(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    return gamepadStickData[gamepad]?.length ?? 0;
}

/** Pulse a gamepad's vibration hardware using the dual-rumble effect if it exists
 *  Strong magnitude is usually the left side motor, weak magnitude is usually the right side motor
 *  @param {number} [gamepad] - gamepad index
 *  @param {number} [duration] - effect duration in ms
 *  @param {number} [strongMagnitude] - strong (left) motor intensity, 0 to 1
 *  @param {number} [weakMagnitude] - weak (right) motor intensity, 0 to 1
 *  @param {number} [startDelay] - delay in ms before the effect starts
 *  @memberof Input */
function gamepadVibrate(gamepad=gamepadPrimary, duration=200, strongMagnitude=1, weakMagnitude=1, startDelay=0)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    if (!vibrateEnable || headlessMode) return;
    const pad = navigator?.getGamepads?.()[gamepad];
    pad?.vibrationActuator?.playEffect?.('dual-rumble', {duration, strongMagnitude, weakMagnitude, startDelay});
}

/** Stop vibration on a gamepad
 *  @memberof Input */
function gamepadVibrateStop(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    if (!vibrateEnable || headlessMode) return;
    const pad = navigator?.getGamepads?.()[gamepad];
    pad?.vibrationActuator?.reset?.();
}

///////////////////////////////////////////////////////////////////////////////

/** Pulse the vibration hardware if it exists
 *  @param {number|Array} [pattern] - single value in ms or vibration interval array
 *  @memberof Input */
function vibrate(pattern=100)
{
    ASSERT(isNumber(pattern) || isArray(pattern), 'pattern must be a number or array');
    vibrateEnable && !headlessMode && navigator?.vibrate?.(pattern);
}

/** Cancel any ongoing vibration
 *  @memberof Input */
function vibrateStop() { vibrate(0); }

///////////////////////////////////////////////////////////////////////////////
// Pointer Lock

/** Request to lock the pointer, does not work on touch devices
 *  @memberof Input */
function pointerLockRequest()
{ !isTouchDevice && mainCanvas.requestPointerLock?.(); }

/** Request to unlock the pointer
 *  @memberof Input */
function pointerLockExit()
{ document.exitPointerLock?.(); }

/** Check if pointer is locked (true if locked)
 *  @return {boolean}
 *  @memberof Input */
function pointerLockIsActive()
{ return document.pointerLockElement === mainCanvas; }

///////////////////////////////////////////////////////////////////////////////
// Input variables used by engine

// input uses bit field for each key: 1=isDown, 2=wasPressed, 4=wasReleased
// mouse and keyboard stored in device 0, gamepads stored in devices > 0
const inputData = [[]];

// gamepad internal variables
const gamepadStickData = [], gamepadDpadData = [], gamepadHadInput = [];

// touch gamepad internal variables
const touchGamepadTimer = new Timer, touchGamepadButtons = [], touchGamepadSticks = [];
// floating stick anchors (stage-local CSS pixels) and owning pointer ids, indexed by stick (0=left, 1=right)
const touchGamepadStickAnchors = [], touchGamepadStickPointerId = [];
// pointerId -> control role ('L', 'R', 'face<n>', or 'start')
const touchGamepadPointerRole = new Map();
// overlay DOM elements (created lazily on touch devices) and cached SVG shapes
let touchGamepadOverlay, touchGamepadStage, touchGamepadSvg, touchGamepadSvgEls;
let touchGamepadZoneL, touchGamepadZoneR, touchGamepadZoneC;
let touchGamepadNeedRelayout = true, touchGamepadLastLayout;

///////////////////////////////////////////////////////////////////////////////
// Input system functions used by engine

function inputInit()
{
    if (headlessMode) return;

    // add event listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('wheel', onMouseWheel, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('blur', onBlur);

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

        // try to prevent default browser handling of input
        if (!inputPreventDefault || !e.cancelable || !document.hasFocus()) return;

        // don't break browser shortcuts
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // don't interfere with user typing into UI fields
        if (isTextInput(e.target) || isTextInput(document.activeElement)) return;

        // fix browser setting "Search for text when you start typing"
        const printable = typeof e.key === 'string' && e.key.length === 1;

        // prevent arrow key and other default keys from messing with stuff
        const preventDefaultKeys = 
        [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', // scrolling
            'Space',        // page down scroll
            'Tab',          // focus navigation
            'Backspace',    // browser back
        ];
        if (preventDefaultKeys.includes(e.code) || printable)
            e.preventDefault();
                    
        function isTextInput(element)
        {
            const tag = element?.tagName;
            const editable = element?.isContentEditable;
            return editable || ['INPUT','TEXTAREA','SELECT'].includes(tag);
        }
    }
    function onKeyUp(e)
    {
        inputData[0][e.code] = (inputData[0][e.code]&2) | 4;
        if (inputWASDEmulateDirection)
            inputData[0][remapKey(e.code)] = 4;
    }
    function remapKey(k)
    {
        // handle remapping wasd keys to directions
        return inputWASDEmulateDirection ?
            k === 'KeyW' ? 'ArrowUp' :
            k === 'KeyS' ? 'ArrowDown' :
            k === 'KeyA' ? 'ArrowLeft' :
            k === 'KeyD' ? 'ArrowRight' : k : k;
    }
    function onMouseDown(e)
    {
        if (isTouchDevice && touchInputEnable) return;

        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        isUsingGamepad = false;
        inputData[0][e.button] = 3;

        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));

        if (inputPreventDefault && e.cancelable && document.hasFocus())
            e.preventDefault();
    }
    function onMouseUp(e)
    {
        if (isTouchDevice && touchInputEnable) return;

        inputData[0][e.button] = (inputData[0][e.button]&2) | 4;
    }
    function onMouseMove(e)
    {
        mouseInWindow = true;
        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));

        // when pointer is locked use movementX/Y for delta
        const movement = pointerLockIsActive() ?
            vec2(e.movementX, e.movementY) :
            mousePosScreen.subtract(mousePosScreenLast);
        mouseDeltaScreen = mouseDeltaScreen.add(movement);
    }
    function onMouseLeave() { mouseInWindow = false; } // mouse moved off window
    function onMouseWheel(e)
    {
        // accumulate so multiple wheel events in one frame are not lost
        if (!e.ctrlKey)
            mouseWheel += sign(e.deltaY);
        if (inputPreventDefault && e.cancelable && document.hasFocus())
            e.preventDefault(); // prevent page scrolling
    }
    function onContextMenu(e) { e.preventDefault(); } // prevent right click menu
    function onBlur()
    {
        inputClear();
        // release any held virtual gamepad controls so they don't stick
        touchGamepadPointerRole.clear();
        touchGamepadButtons.length = 0;
        touchGamepadSticks.length = 0;
        touchGamepadStickPointerId.length = 0;
    }

    // enable touch input mouse passthrough
    function touchInputInit()
    {
        // add non passive touch event listeners
        document.addEventListener('touchstart', (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchmove',  (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchend',   (e)=> handleTouch(e), { passive: false });

        // handle all touch events the same way
        let wasTouching;
        function handleTouch(e)
        {
            if (!touchInputEnable) return;

            // fix stalled audio requiring user interaction
            if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
                audioContext.resume();

            // touches that landed on a virtual gamepad zone are owned by the gamepad
            // (handled by its own pointer listeners) and must not drive the game mouse
            const isGamepadTouch = (t)=> t.target === touchGamepadZoneL ||
                t.target === touchGamepadZoneR || t.target === touchGamepadZoneC;
            const gameTouches = [];
            for (const t of e.touches)
                if (!isGamepadTouch(t)) gameTouches.push(t);

            // check if touching and pass to mouse events
            const touching = gameTouches.length;
            const button = 0; // all touches are left mouse button
            if (touching)
            {
                // set event pos and pass it along
                const pos = vec2(gameTouches[0].clientX, gameTouches[0].clientY);
                const mousePosScreenLast = mousePosScreen;
                mousePosScreen = mouseEventToScreen(pos);
                if (wasTouching)
                    mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
                else
                {
                    inputData[0][button] = 3;
                    isUsingGamepad = false; // a passthrough tap is mouse-style input
                }
            }
            else if (wasTouching)
                inputData[0][button] = inputData[0][button] & 2 | 4;

            // set was touching
            wasTouching = touching;

            // prevent default handling like copy, magnifier lens, and scrolling
            if (inputPreventDefault && e.cancelable && document.hasFocus())
                e.preventDefault();

            // must return true so the document will get focus
            return true;
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
}

function inputUpdate()
{
    if (headlessMode) return;

    // clear input when lost focus (prevent stuck keys)
    if (!(touchInputEnable && isTouchDevice) && !document.hasFocus())
        inputClear();

    // update mouse world space position and delta
    mousePos = screenToWorld(mousePosScreen);
    mouseDelta = screenToWorldDelta(mouseDeltaScreen);

    // build the touch gamepad overlay lazily once enabled on a touch device
    touchGamepadInit();

    // update gamepads if enabled
    gamepadsUpdate();
        
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
        };

        // update touch gamepad if enabled
        if (touchGamepadEnable && isTouchDevice)
        {
            if (!touchGamepadTimer.isSet()) return;

            // read virtual analog stick
            gamepadPrimary = 0; // touch gamepad uses index 0
            const sticks = gamepadStickData[0] ?? (gamepadStickData[0] = []);
            const dpad = gamepadDpadData[0] ?? (gamepadDpadData[0] = vec2());
            sticks.length = 0; // only report sticks that are enabled
            dpad.set();
            if (touchGamepadLeftStick)
            {
                sticks[0] = vec2();
                const leftTouchStick = touchGamepadSticks[0] ?? vec2();
                if (touchGamepadAnalog)
                    sticks[0] = applyDeadZones(leftTouchStick);
                else if (leftTouchStick.lengthSquared() > .3)
                {
                    // convert to 8 way dpad
                    const x = clamp(round(leftTouchStick.x), -1, 1);
                    const y = clamp(round(leftTouchStick.y), -1, 1);
                    dpad.set(x, -y);
                    sticks[0] = dpad.clampLength(); // clamp to circle
                }
            }
            if (touchGamepadButtonCount === 1)
            {
                const rightTouchStick = touchGamepadSticks[1] ?? vec2();
                sticks[1] = applyDeadZones(rightTouchStick);
            }

            // read virtual gamepad buttons
            const data = inputData[1] ?? (inputData[1] = []);
            for (let i=12; i--;)
            {
                const wasDown = gamepadIsDown(i,0);
                data[i] = touchGamepadButtons[i] ? wasDown ? 1 : 3 : wasDown ? 4 : 0;

                // haptic tap when a face button or start button is first pressed (3 = newly down)
                // skip stick touches (10, 11) and the dual-stick button 0 so movement doesn't buzz
                if (touchGamepadVibration && data[i] === 3 &&
                    (i === 9 || (i < touchGamepadButtonCount && touchGamepadButtonCount !== 1)))
                    vibrate(touchGamepadVibration);
            }

            // disable normal gamepads when touch gamepad is active
            return;
        }

        // return if gamepads are disabled or not supported
        try {
            // protect against getGamepads disallowed security error 
            if (!gamepadsEnable || !navigator?.getGamepads)
                return;
        } catch(e) {
            return;
        }

        // only poll gamepads when focused or in debug mode
        if (!debug && !document.hasFocus()) return;

        // poll gamepads
        const maxGamepads = 8;
        const gamepads = navigator.getGamepads();
        const gamepadCount = min(maxGamepads, gamepads.length);
        for (let i=0; i<gamepadCount; ++i)
        {
            // get or create gamepad data
            const gamepad = gamepads[i];
            if (!gamepad)
            {
                // clear gamepad data if not connected
                inputData[i+1] = undefined;
                gamepadStickData[i] = undefined;
                gamepadDpadData[i] = undefined;
                gamepadHadInput[i] = undefined;
                continue;
            }

            const data = inputData[i+1] ?? (inputData[i+1] = []);
            const sticks = gamepadStickData[i] ?? (gamepadStickData[i] = []);
            const dpad = gamepadDpadData[i] ?? (gamepadDpadData[i] = vec2());

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = applyDeadZones(vec2(gamepad.axes[j],gamepad.axes[j+1]));

            // read buttons
            let hadInput = false;
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                const wasDown = gamepadIsDown(j,i);
                data[j] = button.pressed ? wasDown ? 1 : 3 : wasDown ? 4 : 0;

                // check for any input on this gamepad, analog must be full press
                if (button.pressed && (!button.value || button.value > .9))
                    hadInput = true;
            }
            
            // set new primary gamepad if current is not connected
            if (hadInput)
            {
                gamepadHadInput[i] = true;
                if (!gamepadHadInput[gamepadPrimary])
                    gamepadPrimary = i;
                isUsingGamepad ||= (gamepadPrimary === i);
            }

            if (gamepad.mapping === 'standard')
            {
                // get dpad buttons (standard mapping)
                dpad.set(
                    (gamepadIsDown(15,i)&&1) - (gamepadIsDown(14,i)&&1),
                    (gamepadIsDown(12,i)&&1) - (gamepadIsDown(13,i)&&1));
            }

            // copy dpad to left analog stick when pressed
            if (gamepadDirectionEmulateStick && (dpad.x || dpad.y))
                sticks[0] = dpad.clampLength();
        }

        // disable touch gamepad if using real gamepad
        touchGamepadEnable && isUsingGamepad && touchGamepadTimer.unset();
    }
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

function inputRender()
{
    touchGamepadRender();
}

///////////////////////////////////////////////////////////////////////////////
// Touch gamepad - full-viewport HTML/SVG overlay driven by Pointer Events

const touchGamepadSvgNS = 'http://www.w3.org/2000/svg';

// build the overlay DOM once; no-op if already built, disabled, headless, or non-touch
function touchGamepadInit()
{
    if (touchGamepadOverlay || !touchGamepadEnable || !isTouchDevice || headlessMode ||
        !document.body) // body may not exist yet; retry on a later frame
        return;

    // full-viewport overlay; only the input zones receive pointer events. The
    // env() padding insets the stage out of notches / home indicators natively.
    const overlay = touchGamepadOverlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:50;pointer-events:none;opacity:0;' +
        'touch-action:none;user-select:none;-webkit-user-select:none;' +
        '-webkit-touch-callout:none;transition:opacity .2s;box-sizing:border-box;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left)';

    // stage fills the padded (safe-area) content box; all controls live inside it
    const stage = touchGamepadStage = document.createElement('div');
    stage.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none';
    overlay.appendChild(stage);

    // svg draws every visual and never blocks input
    const svg = touchGamepadSvg = document.createElementNS(touchGamepadSvgNS, 'svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
        'pointer-events:none;overflow:visible;fill:none;stroke:#fff;stroke-width:3';
    stage.appendChild(svg);

    // invisible input zones (left stick, right buttons/stick, center start)
    const makeZone = ()=>
    {
        const z = document.createElement('div');
        z.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none';
        z.addEventListener('pointerdown', e=> touchGamepadPointerDown(e, z));
        z.addEventListener('pointermove', e=> touchGamepadPointerMove(e));
        z.addEventListener('pointerup', e=> touchGamepadPointerUp(e));
        z.addEventListener('pointercancel', e=> touchGamepadPointerUp(e));
        stage.appendChild(z);
        return z;
    };
    touchGamepadZoneL = makeZone();
    touchGamepadZoneR = makeZone();
    touchGamepadZoneC = makeZone(); // appended last so it sits above L/R in the center

    addEventListener('resize', ()=> touchGamepadNeedRelayout = true);
    document.body.appendChild(overlay);
    touchGamepadNeedRelayout = true;
}

// stage-local size in CSS pixels (excludes safe-area insets)
function touchGamepadStageRect() { return touchGamepadStage.getBoundingClientRect(); }

// left stick resting center (stage-local CSS pixels)
function touchGamepadStickHome(W, H)
{ return vec2(touchGamepadSize, H - touchGamepadSize); }

// right cluster center (stage-local CSS pixels)
function touchGamepadButtonCenter(W, H)
{
    let y = H - touchGamepadSize;
    if (touchGamepadButtonCount === 2 || touchGamepadButtonCount === 3)
        y -= touchGamepadSize/4; // nudge up a bit
    return vec2(W - touchGamepadSize, y);
}

// effective center of a directional stick: floating anchor when active, else home
function touchGamepadStickCenter(index, W, H)
{
    if (touchGamepadFloating && touchGamepadStickAnchors[index] &&
        (!index || touchGamepadButtonCount === 1))
        return touchGamepadStickAnchors[index];
    return index ? touchGamepadButtonCenter(W, H) : touchGamepadStickHome(W, H);
}

// position the input zones for the current mode and rebuild the SVG visuals
function touchGamepadRelayout()
{
    if (!touchGamepadOverlay) return;
    const r = touchGamepadStageRect();
    const W = r.width, H = r.height, S = touchGamepadSize;
    const setZone = (z, css)=> z.style.cssText =
        'position:absolute;pointer-events:auto;touch-action:none;' + css;

    if (paused && touchGamepadCenterButtonSize)
    {
        // while paused, any touch presses start
        setZone(touchGamepadZoneC, 'inset:0');
        touchGamepadZoneL.style.display = 'none';
        touchGamepadZoneR.style.display = 'none';
        touchGamepadZoneC.style.display = '';
    }
    else
    {
        touchGamepadZoneL.style.display = touchGamepadLeftStick ? '' : 'none';
        touchGamepadZoneR.style.display = touchGamepadButtonCount > 0 ? '' : 'none';
        touchGamepadZoneC.style.display = touchGamepadCenterButtonSize ? '' : 'none';

        if (touchGamepadFloating)
        {
            // bottom 60% of each half grabs the stick; the top 40% passes through
            setZone(touchGamepadZoneL, 'left:0;bottom:0;width:50%;height:60%');
            setZone(touchGamepadZoneR, 'right:0;bottom:0;width:50%;height:60%');
        }
        else
        {
            // fixed: compact boxes hugging each corner control
            setZone(touchGamepadZoneL, `left:0;bottom:0;width:${3*S}px;height:${3*S}px`);
            setZone(touchGamepadZoneR, `right:0;bottom:0;width:${3*S}px;height:${3*S}px`);
        }
        const c = touchGamepadCenterButtonSize;
        setZone(touchGamepadZoneC,
            `left:50%;top:50%;width:${2*c}px;height:${2*c}px;transform:translate(-50%,-50%)`);
    }

    touchGamepadBuildSvg(W, H);
    touchGamepadNeedRelayout = false;
}

// (re)build the SVG shapes for the current layout; dynamic bits update per-frame
function touchGamepadBuildSvg(W, H)
{
    const svg = touchGamepadSvg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const els = touchGamepadSvgEls = { face: [] };
    const S = touchGamepadSize;
    const circle = (cx, cy, rr, fill)=>
    {
        const c = document.createElementNS(touchGamepadSvgNS, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', rr);
        if (fill) c.setAttribute('fill', fill);
        svg.appendChild(c);
        return c;
    };
    const cross = (ctr)=>
    {
        // plus-shaped dpad outline centered at ctr
        const a = S*.18, b = S*.5, x = ctr.x, y = ctr.y;
        const p = document.createElementNS(touchGamepadSvgNS, 'path');
        p.setAttribute('d',
            `M ${x-a} ${y-b} H ${x+a} V ${y-a} H ${x+b} V ${y+a} H ${x+a} ` +
            `V ${y+b} H ${x-a} V ${y+a} H ${x-b} V ${y-a} H ${x-a} Z`);
        svg.appendChild(p);
    };

    // left directional stick (thumb dot updates per-frame)
    if (touchGamepadLeftStick)
    {
        const ctr = touchGamepadStickCenter(0, W, H);
        if (touchGamepadAnalog) circle(ctr.x, ctr.y, S/2); else cross(ctr);
        els.leftThumb = circle(ctr.x, ctr.y, S/4, '#fff');
    }

    // right side: a second analog stick (buttonCount===1) or face buttons
    if (touchGamepadButtonCount === 1)
    {
        const ctr = touchGamepadStickCenter(1, W, H);
        circle(ctr.x, ctr.y, S/2);
        els.rightThumb = circle(ctr.x, ctr.y, S/4, '#fff');
    }
    else
    {
        const bc = touchGamepadButtonCenter(W, H);
        for (let i = 0; i < touchGamepadButtonCount; i++)
        {
            const j = mod(i-1, 4);
            let button = touchGamepadButtonCount > 2 ? j : min(j, touchGamepadButtonCount-1);
            button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
            const offset = vec2().setDirection(j, S/2);
            if (touchGamepadButtonCount === 2) offset.x *= -1;
            const pos = bc.add(offset);
            els.face[button] = circle(pos.x, pos.y, S/4, '#000');
        }
    }
}

// per-frame: fade the overlay and move the thumbs / set pressed states
function touchGamepadRender()
{
    if (!touchGamepadOverlay || headlessMode) return;

    // hide and bail if disabled at runtime (overlay stays in the DOM for reuse)
    // display:none also takes the input zones out of hit-testing so touches are
    // not silently captured away from the game while disabled
    if (!touchGamepadEnable || !isTouchDevice)
    {
        if (touchGamepadOverlay.style.display !== 'none')
        {
            // just disabled: hide the overlay and release any held controls
            touchGamepadOverlay.style.display = 'none';
            touchGamepadPointerRole.clear();
            touchGamepadButtons.length = 0;
            touchGamepadSticks.length = 0;
            touchGamepadStickPointerId.length = 0;
        }
        return;
    }
    touchGamepadOverlay.style.display = '';

    // relayout when the paused state or any layout-affecting setting changes
    const layout = [touchGamepadButtonCount, touchGamepadLeftStick, touchGamepadAnalog,
        touchGamepadSize, touchGamepadFloating, touchGamepadCenterButtonSize, paused].join();
    if (layout !== touchGamepadLastLayout)
    {
        touchGamepadLastLayout = layout;
        touchGamepadNeedRelayout = true;
    }
    // relayout before the visibility bail-out so the paused full-screen start zone applies
    if (touchGamepadNeedRelayout) touchGamepadRelayout();

    // fade out when idle (always show when displayTime is 0)
    const fade = touchGamepadDisplayTime ?
        percent(touchGamepadTimer.get(), touchGamepadDisplayTime+1, touchGamepadDisplayTime) : 1;
    const visible = touchGamepadTimer.isSet() && fade > 0 && !paused;
    touchGamepadOverlay.style.opacity = visible ? fade*touchGamepadAlpha : 0;
    if (!visible) return;

    const r = touchGamepadStageRect();
    const W = r.width, H = r.height, S = touchGamepadSize;
    const els = touchGamepadSvgEls;
    if (!els) return;

    if (touchGamepadLeftStick && els.leftThumb)
    {
        const ctr = touchGamepadStickCenter(0, W, H);
        const t = ctr.add((touchGamepadSticks[0] ?? vec2()).scale(S/2));
        els.leftThumb.setAttribute('cx', t.x);
        els.leftThumb.setAttribute('cy', t.y);
    }
    if (touchGamepadButtonCount === 1 && els.rightThumb)
    {
        const ctr = touchGamepadStickCenter(1, W, H);
        const t = ctr.add((touchGamepadSticks[1] ?? vec2()).scale(S/2));
        els.rightThumb.setAttribute('cx', t.x);
        els.rightThumb.setAttribute('cy', t.y);
    }
    for (let i = 0; i < els.face.length; i++)
        if (els.face[i])
            els.face[i].setAttribute('fill', touchGamepadButtons[i] ? '#fff' : '#000');
}

// convert a pointer event to stage-local CSS pixels
function touchGamepadEventPos(e)
{
    const r = touchGamepadStageRect();
    return vec2(e.clientX - r.left, e.clientY - r.top);
}

// set a directional stick from a stage-local point and flag its stick-touch button
function touchGamepadApplyStick(index, p)
{
    const delta = p.subtract(touchGamepadStickAnchors[index]);
    touchGamepadSticks[index] = delta.scale(2/touchGamepadSize).clampLength();
    touchGamepadButtons[index ? 11 : 10] = 1;
    if (index === 1)
        touchGamepadButtons[0] = 1; // single right control also acts as button 0
}

// pick a face button from a stage-local point, or -1 if outside the cluster
function touchGamepadFaceButtonAt(p, W, H)
{
    const bc = touchGamepadButtonCenter(W, H);
    if (bc.distance(p) >= touchGamepadSize) return -1;
    let button = mod(bc.subtract(p).direction()+2, 4);
    if (touchGamepadButtonCount === 2)
    {
        const d = bc.subtract(p);
        button = d.x < d.y ? 1 : 0;
    }
    button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
    return button < touchGamepadButtonCount ? button : -1;
}

function touchGamepadPointerDown(e, zone)
{
    if (!touchGamepadEnable) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    touchGamepadTimer.set();
    isUsingGamepad = true;

    // resume audio on first interaction
    if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
        audioContext.resume();

    // while paused, any touch is the start button
    if (paused)
    {
        if (touchGamepadCenterButtonSize)
        {
            touchGamepadButtons[9] = 1;
            touchGamepadPointerRole.set(e.pointerId, 'start');
        }
        return;
    }

    const r = touchGamepadStageRect();
    const W = r.width, H = r.height;
    const p = vec2(e.clientX - r.left, e.clientY - r.top);

    if (zone === touchGamepadZoneC)
    {
        touchGamepadButtons[9] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'start');
    }
    else if (zone === touchGamepadZoneL)
    {
        if (!touchGamepadLeftStick) return;
        touchGamepadStickAnchors[0] = touchGamepadFloating ? p : touchGamepadStickHome(W, H);
        touchGamepadStickPointerId[0] = e.pointerId;
        touchGamepadPointerRole.set(e.pointerId, 'L');
        touchGamepadNeedRelayout = true; // base may have re-anchored
        touchGamepadApplyStick(0, p);
    }
    else if (zone === touchGamepadZoneR)
    {
        if (touchGamepadButtonCount === 1)
        {
            touchGamepadStickAnchors[1] = touchGamepadFloating ? p : touchGamepadButtonCenter(W, H);
            touchGamepadStickPointerId[1] = e.pointerId;
            touchGamepadPointerRole.set(e.pointerId, 'R');
            touchGamepadNeedRelayout = true;
            touchGamepadApplyStick(1, p);
        }
        else
        {
            const btn = touchGamepadFaceButtonAt(p, W, H);
            if (btn >= 0)
            {
                touchGamepadButtons[btn] = 1;
                touchGamepadPointerRole.set(e.pointerId, 'face'+btn);
            }
        }
    }
}

function touchGamepadPointerMove(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const p = touchGamepadEventPos(e);
    if (role === 'L') touchGamepadApplyStick(0, p);
    else if (role === 'R') touchGamepadApplyStick(1, p);
    // face buttons & start are held until release (no slide-between this pass)
}

function touchGamepadPointerUp(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    touchGamepadPointerRole.delete(e.pointerId);
    if (role === 'L')
    {
        touchGamepadStickPointerId[0] = undefined;
        touchGamepadSticks[0] = vec2();
        delete touchGamepadButtons[10];
    }
    else if (role === 'R')
    {
        touchGamepadStickPointerId[1] = undefined;
        touchGamepadSticks[1] = vec2();
        delete touchGamepadButtons[11];
        delete touchGamepadButtons[0];
    }
    else if (role === 'start')
        delete touchGamepadButtons[9];
    else // 'face<n>'
        delete touchGamepadButtons[+role.slice(4)];
    touchGamepadTimer.set();
}