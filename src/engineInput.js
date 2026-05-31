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
    touchGamepadStickTouchId.length = 0; // release floating sticks so they re-anchor
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
// floating stick anchor positions and owning touch identifiers, indexed by stick (0=left, 1=right)
const touchGamepadStickAnchors = [], touchGamepadStickTouchId = [];
// device safe area insets in canvas pixels and the hidden element used to read them
let touchGamepadInsetL = 0, touchGamepadInsetR = 0, touchGamepadInsetB = 0, touchGamepadSafeAreaProbe;

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
    function onBlur() { inputClear(); } // reset input when focus is lost

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
                const mousePosScreenLast = mousePosScreen;
                mousePosScreen = mouseEventToScreen(pos);
                if (wasTouching)
                {
                    mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
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
            if (inputPreventDefault && e.cancelable && document.hasFocus())
                e.preventDefault();

            // must return true so the document will get focus
            return true;
        }

        // special handling for virtual gamepad mode
        function handleTouchGamepad(e)
        {
            // clear touch gamepad input
            touchGamepadSticks.length = 0;
            touchGamepadSticks[0] = vec2();
            touchGamepadSticks[1] = vec2();
            touchGamepadButtons.length = 0;
            isUsingGamepad = true;

            const touching = e.touches.length;
            if (touching)
            {
                touchGamepadTimer.set();
                if (touchGamepadCenterButtonSize && !wasTouching && paused)
                {
                    // touch anywhere to press start when paused
                    touchGamepadButtons[9] = 1;
                    return;
                }
            }

            // don't process touch gamepad if paused
            if (paused) return;

            // get center of left and right sides
            const stickCenter = touchGamepadStickHome();
            const buttonCenter = touchGamepadButtonCenter();
            const startCenter = mainCanvasSize.scale(.5);

            // get id and screen position of each touch
            const touchPoints = [];
            for (const touch of e.touches)
                touchPoints.push({id:touch.identifier, pos:mouseEventToScreen(vec2(touch.clientX, touch.clientY))});

            // control a floating stick: keep following the touch that grabbed it (anywhere on
            // screen) until it is released, or claim a new press inside the stick's region
            function applyFloatingStick(index, buttonIndex, regionTest)
            {
                // keep following the touch that already owns this stick, wherever it moves
                const ownerId = touchGamepadStickTouchId[index];
                let touch = ownerId !== undefined && touchPoints.find(t => t.id === ownerId);
                let reanchor = false;
                if (!touch)
                {
                    // free stick: claim a new press in the region, not the other stick's touch
                    const otherId = touchGamepadStickTouchId[index ? 0 : 1];
                    touch = touchPoints.find(t => t.id !== otherId && regionTest(t.pos));
                    reanchor = !!touch;
                }
                if (!touch)
                {
                    touchGamepadStickTouchId[index] = undefined;
                    return false;
                }
                touchGamepadStickTouchId[index] = touch.id;
                if (reanchor)
                    touchGamepadStickAnchors[index] = touch.pos;

                const delta = touch.pos.subtract(touchGamepadStickAnchors[index]);
                touchGamepadSticks[index] = delta.scale(2/touchGamepadSize).clampLength();
                touchGamepadButtons[buttonIndex] = 1; // also press a button when touching stick
                return true;
            }

            if (touchGamepadFloating)
            {
                // floating directional sticks re-anchor to wherever you press down,
                // and stay at their last position (the fixed centers until first used)
                if (!touchGamepadStickAnchors[0]) touchGamepadStickAnchors[0] = stickCenter;
                if (!touchGamepadStickAnchors[1]) touchGamepadStickAnchors[1] = buttonCenter;

                // left stick uses the whole screen if there are no face buttons, else the left half
                if (touchGamepadLeftStick)
                    applyFloatingStick(0, 10, p =>
                        !touchGamepadButtonCount || p.x < mainCanvasSize.x/2);

                // right stick uses the right half of the screen when it is enabled
                if (touchGamepadButtonCount === 1)
                {
                    if (applyFloatingStick(1, 11, p => p.x >= mainCanvasSize.x/2))
                        touchGamepadButtons[0] = 1; // the single right control also acts as button 0
                }
            }

            // check each touch point for face buttons and the center start button
            for (const {id, pos:touchPos} of touchPoints)
            {
                if (touchGamepadFloating)
                {
                    // skip a touch that is controlling a floating stick (it may have been
                    // dragged over the buttons), then handle only right-half face buttons
                    if (id === touchGamepadStickTouchId[0] || id === touchGamepadStickTouchId[1])
                        continue;
                    if (touchGamepadButtonCount < 2 || touchPos.x < mainCanvasSize.x/2)
                        continue;
                }
                else if (touchGamepadLeftStick && touchPos.x < mainCanvasSize.x/2 &&
                    stickCenter.distance(touchPos) < touchGamepadSize*2)
                {
                    // virtual left analog stick
                    const delta = touchPos.subtract(stickCenter);
                    touchGamepadSticks[0] = delta.scale(2/touchGamepadSize).clampLength();
                    touchGamepadButtons[10] = 1; // also press a button when touching stick
                    continue;
                }

                if (buttonCenter.distance(touchPos) < touchGamepadSize)
                {
                    if (!touchGamepadFloating && touchGamepadButtonCount === 1)
                    {
                        // virtual right analog stick
                        const delta = touchPos.subtract(buttonCenter);
                        touchGamepadSticks[1] = delta.scale(2/touchGamepadSize).clampLength();
                        touchGamepadButtons[11] = 1; // also press a button when touching right stick
                    }
                    // virtual face buttons
                    let button = buttonCenter.subtract(touchPos).direction();
                    button = mod(button+2, 4);
                    if (touchGamepadButtonCount === 1)
                        button = 0;
                    else if (touchGamepadButtonCount === 2)
                    {
                        const delta = buttonCenter.subtract(touchPos);
                        button = delta.x < delta.y ? 1 : 0;
                    }
                    // fix button locations (swap 2 and 3 to match gamepad layout)
                    button = button === 3 ? 2 : button === 2 ? 3 : button;
                    if (button < touchGamepadButtonCount)
                        touchGamepadButtons[button] = 1;
                }
                else if (startCenter.distance(touchPos) < touchGamepadCenterButtonSize &&
                         (!touchGamepadLeftStick ||
                          touchGamepadStickCenter(0).distance(touchPos) >= 2 * touchGamepadSize) &&
                         (!touchGamepadButtonCount ||
                          touchGamepadStickCenter(1).distance(touchPos) >= 2 * touchGamepadSize))
                {
                    // virtual start button in center
                    // require a fat-finger buffer of touchGamepadSize (the magenta debug circle
                    // radius) beyond each control, tracking the floating anchors, so drift off
                    // those controls can't accidentally fire start
                    // controls with no face buttons (touchGamepadButtonCount 0) block nothing
                    touchGamepadButtons[9] = 1;
                }
            }
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

    // update touch gamepad safe area insets
    touchGamepadUpdateSafeArea();

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
            if (debugGamepads)
            {
                // draw at the floating anchors when enabled, matching the rendered positions
                const stickCenter = touchGamepadStickCenter(0);
                const buttonCenter = touchGamepadStickCenter(1);
                const startCenter = mainCanvasSize.scale(.5);
                const hasButtons = touchGamepadButtonCount > 0;

                if (touchGamepadLeftStick)
                    debugCircle(stickCenter, 2*touchGamepadSize, 'cyan', 0, false, true);
                if (hasButtons)
                    debugCircle(buttonCenter, 2*touchGamepadSize, 'cyan', 0, false, true);
                if (touchGamepadCenterButtonSize)
                {
                    debugCircle(startCenter, 2*touchGamepadCenterButtonSize, 'cyan', 0, false, true);
                    // exclusion bubbles around controls (where start is blocked), matching the start logic
                    if (touchGamepadLeftStick)
                        debugCircle(stickCenter, 4*touchGamepadSize, 'magenta', 0, false, true);
                    if (hasButtons)
                        debugCircle(buttonCenter, 4*touchGamepadSize, 'magenta', 0, false, true);
                }
            }

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

    function touchGamepadRender()
    {
        if (!touchInputEnable || !isTouchDevice || headlessMode) return;
        if (!touchGamepadEnable || !touchGamepadTimer.isSet() && touchGamepadDisplayTime) return;

        // fade off when not touching or paused
        const alpha = touchGamepadDisplayTime ? percent(touchGamepadTimer.get(), touchGamepadDisplayTime+1, touchGamepadDisplayTime) : 1;
        if (!alpha || paused) return;

        // setup the canvas (arc calls use 9 radians as end angle - any value > 2*PI draws a full circle)
        const context = mainContext;
        context.save();
        context.globalAlpha = alpha*touchGamepadAlpha;
        context.strokeStyle = '#fff';
        context.lineWidth = 3;

        // draw an analog stick (circle or cross shaped) with a thumb dot at its offset
        function drawTouchGamepadStick(center, stick)
        {
            context.beginPath();
            if (touchGamepadAnalog)
            {
                // draw circle shaped gamepad
                context.arc(center.x, center.y, touchGamepadSize/2, 0, 9);
            }
            else
            {
                // draw cross shaped gamepad
                for (let i=10; --i;)
                {
                    const angle = i*PI/4;
                    context.arc(center.x, center.y, touchGamepadSize*.6, angle + PI/8, angle + PI/8);
                    i%2 && context.arc(center.x, center.y, touchGamepadSize*.33, angle, angle);
                }
            }
            context.stroke();

            // draw thumb dot at the input offset
            const thumb = center.add(stick.scale(touchGamepadSize/2));
            context.fillStyle = '#fff';
            context.beginPath();
            context.arc(thumb.x, thumb.y, touchGamepadSize/4, 0, 9);
            context.fill();
            context.stroke();
        }

        // draw left analog stick (at its floating anchor when enabled)
        if (touchGamepadLeftStick)
            drawTouchGamepadStick(touchGamepadStickCenter(0), touchGamepadSticks[0] ?? vec2());

        // draw right side: virtual analog stick if buttonCount===1, face buttons otherwise
        {
            const buttonCenter = touchGamepadButtonCenter();
            if (touchGamepadButtonCount === 1)
            {
                // virtual right analog stick, matching left stick (at its floating anchor when enabled)
                drawTouchGamepadStick(touchGamepadStickCenter(1), touchGamepadSticks[1] ?? vec2());
            }
            else for (let i=0; i<touchGamepadButtonCount; i++)
            {
                const j = mod(i-1, 4);
                let button = touchGamepadButtonCount > 2 ?
                    j : min(j, touchGamepadButtonCount-1);
                // fix button locations (swap 2 and 3 to match gamepad layout)
                button = button === 3 ? 2 : button === 2 ? 3 : button;
                const offset = vec2().setDirection(j, touchGamepadSize/2);
                if (touchGamepadButtonCount === 2)
                    offset.x *= -1;
                const pos = buttonCenter.add(offset);
                context.fillStyle = touchGamepadButtons[button] ? '#fff' : '#000';
                context.beginPath();
                context.arc(pos.x, pos.y, touchGamepadSize/4, 0,9);
                context.fill();
                context.stroke();
            }
        }

        // set canvas back to normal
        context.restore();
    }
}

// center position for right touch pad face buttons, inset from the bottom-right safe area
function touchGamepadButtonCenter()
{
    const center = mainCanvasSize.subtract(vec2(touchGamepadSize));
    if (touchGamepadButtonCount === 2 || touchGamepadButtonCount === 3)
        center.y -= touchGamepadSize/4; // move up a bit
    center.x -= touchGamepadInsetR;
    center.y -= touchGamepadInsetB;
    return center;
}

// home (resting) position of the left touch gamepad stick, inset from the bottom-left safe area
function touchGamepadStickHome()
{
    return vec2(touchGamepadSize + touchGamepadInsetL,
        mainCanvasSize.y - touchGamepadSize - touchGamepadInsetB);
}

// effective screen center of a touch gamepad directional stick (index 0=left, 1=right)
// returns the floating anchor when enabled, otherwise the fixed home position
// the right side only floats when it is the right analog stick (touchGamepadButtonCount === 1)
function touchGamepadStickCenter(index)
{
    if (touchGamepadFloating && touchGamepadStickAnchors[index] &&
        (!index || touchGamepadButtonCount === 1))
        return touchGamepadStickAnchors[index];
    return index ? touchGamepadButtonCenter() : touchGamepadStickHome();
}

// read device safe area insets, converting the part overlapping the canvas to canvas pixels
function touchGamepadUpdateSafeArea()
{
    touchGamepadInsetL = touchGamepadInsetR = touchGamepadInsetB = 0;
    if (!touchGamepadEnable || !isTouchDevice || headlessMode)
        return;

    // a hidden probe element resolves the CSS env() safe area insets as padding
    if (!touchGamepadSafeAreaProbe)
    {
        touchGamepadSafeAreaProbe = document.createElement('div');
        touchGamepadSafeAreaProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
            'visibility:hidden;pointer-events:none;padding:' +
            'env(safe-area-inset-top) env(safe-area-inset-right) ' +
            'env(safe-area-inset-bottom) env(safe-area-inset-left)';
        document.body.appendChild(touchGamepadSafeAreaProbe);
    }

    // read the insets in css pixels
    const style = getComputedStyle(touchGamepadSafeAreaProbe);
    const cssL = parseFloat(style.paddingLeft)   || 0;
    const cssR = parseFloat(style.paddingRight)  || 0;
    const cssB = parseFloat(style.paddingBottom) || 0;
    if (!cssL && !cssR && !cssB)
        return; // no safe area insets

    // only apply the part of each inset that actually overlaps the canvas, scaled to canvas pixels
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = rect.width  ? mainCanvas.width  / rect.width  : 1;
    const scaleY = rect.height ? mainCanvas.height / rect.height : 1;
    touchGamepadInsetL = max(0, cssL - rect.left) * scaleX;
    touchGamepadInsetR = max(0, cssR - (window.innerWidth  - rect.right))  * scaleX;
    touchGamepadInsetB = max(0, cssB - (window.innerHeight - rect.bottom)) * scaleY;
}