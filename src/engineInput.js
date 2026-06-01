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
// pointerId -> control role ('stick0', 'stick1', 'face<n>', or 'start')
const touchGamepadPointerRole = new Map();
// overlay DOM elements (created lazily on touch devices) and cached SVG shapes
let touchGamepadOverlay, touchGamepadStage, touchGamepadSvg, touchGamepadSvgEls;
let touchGamepadSideZones = [], touchGamepadZoneC;
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

            // when the touch gamepad is enabled it owns touch input: suppress the
            // touch->mouse passthrough entirely unless touchGamepadPassthrough is set
            // (its own zones drive gameplay via pointer events)
            if (!touchGamepadEnable || touchGamepadPassthrough)
            {
                // touches that landed on a virtual gamepad zone are owned by the gamepad
                // (handled by its own pointer listeners) and must not drive the game mouse
                const isGamepadTouch = (t)=>
                    touchGamepadSideZones.includes(t.target) || t.target === touchGamepadZoneC;
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
            }

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
            // a side is either a stick or buttons - setting both is ambiguous
            ASSERT(!touchGamepadLeftStick || !touchGamepadLeftButtonCount,
                'set touchGamepadLeftStick or touchGamepadLeftButtonCount, not both');
            ASSERT(!touchGamepadRightStick || !touchGamepadButtonCount,
                'set touchGamepadRightStick or touchGamepadButtonCount, not both');

            if (!touchGamepadTimer.isSet()) return;

            // read virtual analog stick
            gamepadPrimary = 0; // touch gamepad uses index 0
            const sticks = gamepadStickData[0] ?? (gamepadStickData[0] = []);
            const dpad = gamepadDpadData[0] ?? (gamepadDpadData[0] = vec2());
            sticks.length = 0; // only report sticks that are enabled
            dpad.set();
            // read each side's directional stick (analog, or quantized to an 8 way dpad)
            for (let side = 0; side < 2; side++)
            {
                if (!touchGamepadSideStick(side)) continue;
                const out = touchGamepadStickOut(side);
                sticks[out] = vec2();
                const touchStick = touchGamepadSticks[side] ?? vec2();
                if (touchGamepadAnalog)
                    sticks[out] = applyDeadZones(touchStick);
                else if (touchStick.lengthSquared() > .3)
                {
                    const x = clamp(round(touchStick.x), -1, 1);
                    const y = clamp(round(touchStick.y), -1, 1);
                    sticks[out] = vec2(x, -y).clampLength(); // clamp to circle
                    if (!out) dpad.set(x, -y); // the primary (stick 0) also drives the dpad vector
                }
            }

            // read virtual gamepad buttons
            const data = inputData[1] ?? (inputData[1] = []);
            for (let i=12; i--;)
            {
                const wasDown = gamepadIsDown(i,0);
                data[i] = touchGamepadButtons[i] ? wasDown ? 1 : 3 : wasDown ? 4 : 0;

                // haptic tap when a face button or start button is first pressed (3 = newly down)
                // skip stick touches (10, 11) so movement doesn't buzz
                if (touchGamepadVibration && data[i] === 3 &&
                    (i === 9 || touchGamepadIsFaceButton(i)))
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
    touchGamepadSideZones[0] = makeZone(); // left
    touchGamepadSideZones[1] = makeZone(); // right
    touchGamepadZoneC = makeZone(); // center/start, appended last so it sits above the sides

    addEventListener('resize', ()=> touchGamepadNeedRelayout = true);
    document.body.appendChild(overlay);
    touchGamepadNeedRelayout = true;
}

// stage-local size in CSS pixels (excludes safe-area insets)
function touchGamepadStageRect() { return touchGamepadStage.getBoundingClientRect(); }

// per-side touch gamepad config (side 0 = left, 1 = right) - the left and right
// sides behave identically, differing only in position and gamepad button indices
function touchGamepadSideStick(side)
{ return side ? touchGamepadRightStick : touchGamepadLeftStick; }
function touchGamepadSideButtonCount(side)
{ return side ? touchGamepadButtonCount : touchGamepadLeftButtonCount; }
// gamepad button index a side's buttons start at (right 0-3, left 4-7)
function touchGamepadSideButtonBase(side)
{ return side ? 0 : 4; }
// output stick index for a side: the right stick uses stick 0 when there is no left stick
function touchGamepadStickOut(side)
{ return side && touchGamepadLeftStick ? 1 : 0; }
// true if the side has any control (a stick or at least one button)
function touchGamepadSideHasControl(side)
{ return touchGamepadSideStick(side) || touchGamepadSideButtonCount(side) > 0; }

// true if gamepad button index i is an active touch gamepad face/single button
function touchGamepadIsFaceButton(i)
{
    for (let side = 0; side < 2; side++)
    {
        const base = touchGamepadSideButtonBase(side);
        if (!touchGamepadSideStick(side) &&
            i >= base && i < base + touchGamepadSideButtonCount(side))
            return true;
    }
    return false;
}

// center of a side's controls in stage-local CSS pixels (stick rest / button cluster)
// returns the floating stick anchor when that side is an active floating stick
function touchGamepadSideCenter(side, W, H)
{
    if (touchGamepadFloating && touchGamepadSideStick(side) && touchGamepadStickAnchors[side])
        return touchGamepadStickAnchors[side];
    let y = H - touchGamepadSize;
    const count = touchGamepadSideButtonCount(side);
    if (!touchGamepadSideStick(side) && (count === 2 || count === 3))
        y -= touchGamepadSize/4; // nudge a 2/3 button cluster up a bit
    return vec2(side ? W - touchGamepadSize : touchGamepadSize, y);
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
        for (const zone of touchGamepadSideZones) zone.style.display = 'none';
        touchGamepadZoneC.style.display = '';
    }
    else
    {
        // position each side zone (left/right differ only by which edge they hug)
        for (let side = 0; side < 2; side++)
        {
            const zone = touchGamepadSideZones[side], edge = side ? 'right' : 'left';
            zone.style.display = touchGamepadSideHasControl(side) ? '' : 'none';
            if (touchGamepadFloating)
            {
                // bottom 60% grabs the control; the top 40% passes through. A side with no
                // control on the other side uses the full width (matching the hit-test)
                const width = touchGamepadSideHasControl(side ? 0 : 1) ? '50%' : '100%';
                setZone(zone, `${edge}:0;bottom:0;width:${width};height:60%`);
            }
            else // fixed: a compact box hugging the corner control
                setZone(zone, `${edge}:0;bottom:0;width:${3*S}px;height:${3*S}px`);
        }
        touchGamepadZoneC.style.display = touchGamepadCenterButtonSize ? '' : 'none';
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
    const els = touchGamepadSvgEls = { face: [], thumb: [] };
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

    // draw each side: a directional stick, a single large button, or face buttons
    for (let side = 0; side < 2; side++)
    {
        const count = touchGamepadSideButtonCount(side);
        const base = touchGamepadSideButtonBase(side);
        const ctr = touchGamepadSideCenter(side, W, H);
        if (touchGamepadSideStick(side))
        {
            // directional stick (circle or cross) with a thumb dot that moves per-frame
            if (touchGamepadAnalog) circle(ctr.x, ctr.y, S/2); else cross(ctr);
            els.thumb[side] = circle(ctr.x, ctr.y, S/4, '#fff');
        }
        else if (count === 1)
            els.face[base] = circle(ctr.x, ctr.y, S/2, '#000'); // single large button
        else for (let i = 0; i < count; i++)
        {
            const j = mod(i-1, 4);
            let button = count > 2 ? j : min(j, count-1);
            button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
            const offset = vec2().setDirection(j, S/2);
            if (count === 2) offset.x *= -1;
            // left side mirrors the right layout's positions, keeping indices in order
            // (e.g. 2 buttons -> button 4 at bottom, button 5 at left)
            if (!side) offset.x *= -1;
            const pos = ctr.add(offset);
            els.face[base + button] = circle(pos.x, pos.y, S/4, '#000');
        }
    }

    // debug: draw the proximity hit regions the hit-test actually uses
    if (debug && debugGamepads) touchGamepadBuildDebug(W, H);
}

// draw debug outlines of the touch control hit regions into the overlay svg
function touchGamepadBuildDebug(W, H)
{
    const S = touchGamepadSize, svg = touchGamepadSvg;
    const shape = (tag, attrs, stroke)=>
    {
        const el = document.createElementNS(touchGamepadSvgNS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', 2);
        el.setAttribute('fill', 'none');
        svg.appendChild(el);
    };
    const ring = (c, rr, stroke)=> shape('circle', {cx:c.x, cy:c.y, r:rr}, stroke);

    // green line: the left/right split that assigns a stick press to a side
    shape('line', {x1:W/2, y1:0, x2:W/2, y2:H}, '#0f0');

    // cyan: where each side's control can be grabbed
    for (let side = 0; side < 2; side++)
    {
        if (touchGamepadSideStick(side))
        {
            if (touchGamepadFloating)
            {
                // grab region: this side's half (or the full width if the other side is empty)
                const top = H*.4, full = !touchGamepadSideHasControl(side ? 0 : 1);
                const x = full ? 0 : (side ? W/2 : 0);
                shape('rect', {x, y:top, width:full ? W : W/2, height:H-top}, '#0ff');
            }
            else
                ring(touchGamepadSideCenter(side, W, H), 2*S, '#0ff');
        }
        else if (touchGamepadSideButtonCount(side) >= 1)
            ring(touchGamepadSideCenter(side, W, H), S, '#0ff'); // face / single-button radius
    }

    // yellow: start button radius; magenta: where start is blocked (near a control)
    if (touchGamepadCenterButtonSize)
    {
        ring(vec2(W/2, H/2), touchGamepadCenterButtonSize, '#ff0');
        for (let side = 0; side < 2; side++)
            if (touchGamepadSideHasControl(side))
                ring(touchGamepadSideCenter(side, W, H), 2*S, '#f0f');
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

    // relayout when the paused state, a layout setting, or the debug view changes
    const dbg = debug && debugGamepads;
    const layout = [touchGamepadButtonCount, touchGamepadLeftButtonCount, touchGamepadLeftStick,
        touchGamepadRightStick, touchGamepadAnalog, touchGamepadSize, touchGamepadFloating,
        touchGamepadCenterButtonSize, paused, dbg].join();
    if (layout !== touchGamepadLastLayout)
    {
        touchGamepadLastLayout = layout;
        touchGamepadNeedRelayout = true;
    }
    // relayout before the visibility bail-out so the paused full-screen start zone applies
    if (touchGamepadNeedRelayout) touchGamepadRelayout();

    // fade out when idle (always show when displayTime is 0, or while debugging)
    const fade = touchGamepadDisplayTime ?
        percent(touchGamepadTimer.get(), touchGamepadDisplayTime+1, touchGamepadDisplayTime) : 1;
    const visible = dbg || (touchGamepadTimer.isSet() && fade > 0 && !paused);
    touchGamepadOverlay.style.opacity = !visible ? 0 : dbg ? 1 : fade*touchGamepadAlpha;
    if (!visible) return;

    const r = touchGamepadStageRect();
    const W = r.width, H = r.height, S = touchGamepadSize;
    const els = touchGamepadSvgEls;
    if (!els) return;

    for (let side = 0; side < 2; side++)
        if (touchGamepadSideStick(side) && els.thumb[side])
        {
            const ctr = touchGamepadSideCenter(side, W, H);
            const t = ctr.add((touchGamepadSticks[side] ?? vec2()).scale(S/2));
            els.thumb[side].setAttribute('cx', t.x);
            els.thumb[side].setAttribute('cy', t.y);
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
// (stick 0 press = button 10, stick 1 press = button 11, following the output index)
function touchGamepadApplyStick(side, p)
{
    const delta = p.subtract(touchGamepadStickAnchors[side]);
    touchGamepadSticks[side] = delta.scale(2/touchGamepadSize).clampLength();
    touchGamepadButtons[touchGamepadStickOut(side) ? 11 : 10] = 1;
}

// pick a side's gamepad button index from a stage-local point, or -1 if outside the cluster
function touchGamepadFaceButtonAt(side, p, W, H)
{
    const count = touchGamepadSideButtonCount(side);
    const base = touchGamepadSideButtonBase(side);
    const bc = touchGamepadSideCenter(side, W, H);
    if (bc.distance(p) >= touchGamepadSize) return -1;
    if (count === 1) return base; // single large button
    const d = bc.subtract(p);
    if (!side) d.x *= -1; // left side mirrors the right layout's positions horizontally
    let button = count === 2 ? (d.x < d.y ? 1 : 0) : mod(d.direction()+2, 4);
    button = button === 3 ? 2 : button === 2 ? 3 : button; // match gamepad layout
    return button < count ? base + button : -1;
}

// pick which control a stage-local press activates, by priority then proximity,
// independent of which zone element captured it - so overlapping zones on small
// screens resolve to the nearest control instead of whichever zone is topmost
// returns {role:'stick', side} or {role:'face', btn} or {role:'start'} or undefined
function touchGamepadControlAt(p, W, H)
{
    const S = touchGamepadSize;
    const leftHalf = p.x < W/2;
    const floatTop = H*.4; // floating grab region is the bottom 60% of the screen

    // check each side (left first for priority); a side is a stick or buttons
    for (let side = 0; side < 2; side++)
    {
        const onHalf = side ? !leftHalf : leftHalf;
        if (touchGamepadSideStick(side))
        {
            // a side with no control on the other side uses the full width
            const otherControl = touchGamepadSideHasControl(side ? 0 : 1);
            const grab = touchGamepadFloating ?
                (!otherControl || onHalf) && p.y > floatTop :
                onHalf && touchGamepadSideCenter(side, W, H).distance(p) < 2*S;
            if (grab) return {role:'stick', side};
        }
        else if (touchGamepadSideButtonCount(side) >= 1)
        {
            const btn = touchGamepadFaceButtonAt(side, p, W, H);
            if (btn >= 0) return {role:'face', btn};
        }
    }

    // center start button, blocked within 2*size of a control so drift off a
    // control can't accidentally fire start (matches the original exclusion logic)
    if (touchGamepadCenterButtonSize)
    {
        for (let side = 0; side < 2; side++)
            if (touchGamepadSideHasControl(side) &&
                touchGamepadSideCenter(side, W, H).distance(p) < 2*S)
                return;
        if (vec2(W/2, H/2).distance(p) < touchGamepadCenterButtonSize)
            return {role:'start'};
    }
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

    // choose the control by proximity/priority, not by which zone captured the touch
    const hit = touchGamepadControlAt(p, W, H);
    if (!hit) return;
    if (hit.role === 'stick')
    {
        const side = hit.side;
        touchGamepadStickAnchors[side] = touchGamepadFloating ? p : touchGamepadSideCenter(side, W, H);
        touchGamepadStickPointerId[side] = e.pointerId;
        touchGamepadPointerRole.set(e.pointerId, 'stick'+side);
        touchGamepadNeedRelayout = true; // base may have re-anchored
        touchGamepadApplyStick(side, p);
    }
    else if (hit.role === 'face')
    {
        touchGamepadButtons[hit.btn] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'face'+hit.btn);
    }
    else // 'start'
    {
        touchGamepadButtons[9] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'start');
    }
}

function touchGamepadPointerMove(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const p = touchGamepadEventPos(e);
    if (role === 'stick0' || role === 'stick1')
        touchGamepadApplyStick(role === 'stick1' ? 1 : 0, p);
    // face buttons & start are held until release (no slide-between this pass)
}

function touchGamepadPointerUp(e)
{
    const role = touchGamepadPointerRole.get(e.pointerId);
    if (!role) return;
    touchGamepadPointerRole.delete(e.pointerId);
    if (role === 'stick0' || role === 'stick1')
    {
        const side = role === 'stick1' ? 1 : 0;
        touchGamepadStickPointerId[side] = undefined;
        touchGamepadSticks[side] = vec2();
        delete touchGamepadButtons[touchGamepadStickOut(side) ? 11 : 10];
    }
    else if (role === 'start')
        delete touchGamepadButtons[9];
    else // 'face<n>'
        delete touchGamepadButtons[+role.slice(4)];
    touchGamepadTimer.set();
}