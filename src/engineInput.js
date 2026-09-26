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

/** True if a gamepad is the most recently used input device.
 *  Equivalent to usingGamepadInput(); derived from lastInputDevice each frame.
 *  @type {boolean}
 *  @memberof Input */
let isUsingGamepad = false;

/** The most recently used input device: 'mouse' | 'keyboard' | 'gamepad'.
 *  Sticky: it holds its value while every device is idle, so a mouse-follow
 *  control (e.g. paddle = mousePos) won't snap back the instant the stick/keys
 *  are released. With several devices in play at once (e.g. keyboard to move +
 *  mouse to aim) it tracks whichever was touched last each frame, so it may
 *  alternate — that's intended; use it to pick which control drives a shared
 *  action. Updated every frame by inputUpdate().
 *  @type {'mouse'|'keyboard'|'gamepad'}
 *  @memberof Input */
let lastInputDevice = 'mouse';

/** Screen-pixel mouse movement per frame that counts as "using the mouse"
 *  (so sub-pixel hand jitter doesn't steal focus from the keyboard/gamepad).
 *  @type {number}
 *  @default
 *  @memberof Input */
let inputMouseMoveThreshold = 6;

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
const isTouchDevice = !headlessMode && typeof window != 'undefined' && window.ontouchstart !== undefined;

/** Prevents input continuing to the default browser handling
 *  This is useful to disable for html menus so the browser can handle input normally,
 *  the right click menu included; over an html text field that menu always shows
 *  - While on, the mouse's back and forward buttons don't leave the page, a game can read them as mouse 3 and 4
 *  @param {boolean} [preventDefault]
 *  @memberof Input */
function setInputPreventDefault(preventDefault=true) { inputPreventDefault = preventDefault; }

/** Set the screen-pixel mouse movement per frame that counts as using the mouse
 *  @param {number} threshold
 *  @memberof Input */
function setInputMouseMoveThreshold(threshold) { inputMouseMoveThreshold = threshold; }

/** @return {boolean} - Is the mouse the most recently used input device?    @memberof Input */
function usingMouseInput()    { return lastInputDevice === 'mouse'; }
/** @return {boolean} - Is the keyboard the most recently used input device? @memberof Input */
function usingKeyboardInput() { return lastInputDevice === 'keyboard'; }
/** @return {boolean} - Is a gamepad the most recently used input device?    @memberof Input */
function usingGamepadInput()  { return lastInputDevice === 'gamepad'; }

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

// the WASD keys and the arrows they stand in for when inputWASDEmulateDirection is on, and the arrows' aliases
const inputWASDToArrow = {KeyW:'ArrowUp', KeyS:'ArrowDown', KeyA:'ArrowLeft', KeyD:'ArrowRight'};
const inputArrowToWASD = {ArrowUp:'KeyW', ArrowDown:'KeyS', ArrowLeft:'KeyA', ArrowRight:'KeyD'};
const inputKeysHeld = new Set; // the keys physically down, since an arrow's slot is shared with its alias
let inputWasTouching = 0, inputTouchIdentifier; // the touch driving the mouse, cleared with the input so only a new touch presses
let inputLastTouchTime = -1e9; // when a touch event last came, the mouse events a browser makes from a tap follow it

// is this mouse event one the browser made from a touch, which the touch input already handled
function inputIsTouchMouseEvent(e)
{ return e.sourceCapabilities?.firesTouchEvents || performance.now() - inputLastTouchTime < 500; }

// is a real gamepad being used, a button down or a standard stick pushed, only read to hand over from the touch
// gamepad, a non standard pad's axes may rest at full deflection so they are not trusted here
function inputRealGamepadUsed()
{
    for (const gamepad of inputGetGamepads())
    {
        if (!gamepad) continue;
        for (const button of gamepad.buttons)
            if (button.pressed) return true;
        if (gamepad.mapping === 'standard')
            for (let j = 0; j < 4 && j < gamepad.axes.length; ++j)
                if (abs(gamepad.axes[j]) > .5) return true;
    }
    return false;
}

// let go of every keyboard key, for when something else takes the keyboard, like a text field
function inputClearKeyboard()
{
    const keys = inputData[0];
    for (const key in keys)
        isNaN(+key) && (keys[key] = 0); // mouse buttons are numbers, keys are codes
    inputKeysHeld.clear();
}

/** Clears all input
 *  @memberof Input */
function inputClear()
{
    // empty every device but keep which gamepad slots exist, so gamepadConnected still reads true through a
    // clear, like the one every frame while the window is unfocused; a disconnect clears its slot in the poll
    for (let i = inputData.length; i--;)
        if (!i || inputData[i]) inputData[i] = [];
    inputKeysHeld.clear();
    inputWasTouching = 0;
    // release the touch gamepad, a finger still on it has to lift before it can take a control again
    touchGamepadPointerRole.clear();
    touchGamepadButtons.length = 0;
    touchGamepadButtonsPressed.length = 0;
    touchGamepadSticks.length = 0;
    touchGamepadStickPointerId.length = 0; // release floating sticks so they re-anchor
    gamepadStickData.length = 0;
    gamepadDpadData.length = 0;
    // gamepadButtonsLast and gamepadAxisCentered describe the pads, not input, so they are kept:
    // a button held through the clear reads as down, not newly pressed, and axes stay trusted
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
    ASSERT(typeof key !== 'string' || key.length > 1, "keys are codes like 'KeyW' or 'Space', not characters");
    ASSERT(device > 0 || typeof key !== 'number' || key < 5, 'use code string for keyboard');
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
    ASSERT(typeof key !== 'string' || key.length > 1, "keys are codes like 'KeyW' or 'Space', not characters");
    ASSERT(device > 0 || typeof key !== 'number' || key < 5, 'use code string for keyboard');
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
    ASSERT(typeof key !== 'string' || key.length > 1, "keys are codes like 'KeyW' or 'Space', not characters");
    ASSERT(device > 0 || typeof key !== 'number' || key < 5, 'use code string for keyboard');
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
    return gamepadDpadData[gamepad]?.copy() ?? vec2(); // a copy, the poller keeps its own
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
 *  @param {number} [duration] - effect duration in ms, browsers limit it and the delay to 5 seconds together
 *  @param {number} [strongMagnitude] - strong (left) motor intensity, 0 to 1
 *  @param {number} [weakMagnitude] - weak (right) motor intensity, 0 to 1
 *  @param {number} [startDelay] - delay in ms before the effect starts
 *  @memberof Input */
function gamepadVibrate(gamepad=gamepadPrimary, duration=200, strongMagnitude=1, weakMagnitude=1, startDelay=0)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    ASSERT(strongMagnitude >= 0 && strongMagnitude <= 1 && weakMagnitude >= 0 && weakMagnitude <= 1,
        'rumble magnitudes must be 0 to 1');
    ASSERT(duration >= 0 && startDelay >= 0 && duration + startDelay <= 5e3,
        'browsers limit a rumble and its delay to 5 seconds');
    if (!vibrateEnable || headlessMode) return;
    const pad = inputGetGamepads()[gamepad];
    // a browser refuses a rumble it can not play by rejecting, which is nothing to report
    pad?.vibrationActuator?.playEffect?.('dual-rumble', {duration, strongMagnitude, weakMagnitude, startDelay})
        ?.catch?.(()=> {});
}

/** Stop vibration on a gamepad
 *  @param {number} [gamepad] - gamepad index
 *  @memberof Input */
function gamepadVibrateStop(gamepad=gamepadPrimary)
{
    ASSERT(isNumber(gamepad), 'gamepad must be a number');
    if (!vibrateEnable || headlessMode) return;
    const pad = inputGetGamepads()[gamepad];
    pad?.vibrationActuator?.reset?.();
}

// the gamepads the browser reports, none when it has no gamepad support or refuses the page them, which it
// does by throwing a SecurityError from the call, as the spec says, for a page not allowed gamepads
function inputGetGamepads()
{
    try { return navigator?.getGamepads?.() || []; }
    catch (e) { return []; }
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

/** Request to lock the pointer, for a mouse; a device with only touch refuses it
 *  @memberof Input */
function pointerLockRequest()
{
    // newer browsers return a promise that rejects when the lock is refused, like just after Esc left it,
    // or on a phone; a touchscreen laptop's mouse can still lock
    try { /** @type {any} */ (mainCanvas.requestPointerLock?.())?.catch?.(()=>{}); }
    catch { }
}

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
// per gamepad, each button's raw pressed state from the last poll, kept through inputClear and cleared on
// disconnect, so a button held through a clear reads as down and not newly pressed
const gamepadButtonsLast = [];
// per gamepad, how many consecutive frames each axis has rested inside the
// dead zone, used to tell stick axes from axes that rest at full deflection
const gamepadAxisCentered = [];
// how long an axis must rest inside the dead zone before it counts as a stick
const gamepadAxisCenteredFrames = 15;

// touch gamepad internal variables
const touchGamepadTimer = new Timer(undefined, true), touchGamepadButtons = [], touchGamepadSticks = [];
// buttons pressed since the last poll, so a tap that lifts before the poll still counts
const touchGamepadButtonsPressed = [];
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
    addEventListener('blur', onBlur); // the window's, the browser fires blur there and it does not bubble to the document

    // init touch input, its handler checks touchInputEnable itself, so turning it on later works too
    if (isTouchDevice)
        touchInputInit();

    function onKeyDown(e)
    {
        // fix stalled audio requiring user interaction, a keyboard only game has no other gesture
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        // keys typed into an html text field are the player's typing, not game input;
        // a key already down still releases on keyup, which only lets go of keys that are down
        const typing = isTextInput(e.target) || isTextInput(document.activeElement);
        if (!e.repeat && !typing)
        {
            inputKeysHeld.add(e.code);
            // an arrow its alias already holds down is not pressed again, like its release waits for both
            if (!(inputWASDEmulateDirection && inputKeysHeld.has(inputArrowToWASD[e.code]) && inputData[0][e.code] & 1))
                inputData[0][e.code] = 3;
            // an alias presses its arrow's slot too, unless the arrow itself already holds it down
            const remap = remapKey(e.code);
            if (remap !== e.code && !(inputData[0][remap] & 1))
                inputData[0][remap] = 3;
        }

        // try to prevent default browser handling of input
        if (!inputPreventDefault || !e.cancelable || !document.hasFocus()) return;

        // don't break browser shortcuts
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // don't interfere with user typing into UI fields
        if (typing) return;

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
    }
    // true if an event is on an HTML control on the page, which handles it itself
    function isOnControl(e)
    {
        const target = /** @type {HTMLElement} */ (e.target);
        return !!target?.closest?.('input,textarea,select,button,a,label,[contenteditable]');
    }
    function isTextInput(element)
    {
        // a field that takes typing or arrow keys, not an input that is really a button, checkbox or slider,
        // which would otherwise keep every key from the game after it was clicked
        const tag = element?.tagName;
        if (tag === 'INPUT')
            return !['button','checkbox','color','file','image','radio','range','reset','submit'].includes(element.type);
        return !!element?.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT';
    }
    function onKeyUp(e)
    {
        inputKeysHeld.delete(e.code);
        // the key's own slot and the arrow slot an alias shares, each released only once nothing holds it:
        // an arrow held with its alias stays down until both are let go; a slot not down was never pressed as far
        // as the game knows (held since before focus or through a clear), so it is not released either
        // the alias is released whatever the setting is now, emulation turned off while W is held still lets go of
        // the ArrowUp it pressed
        const remap = inputWASDToArrow[e.code] || e.code;
        for (const key of remap === e.code ? [e.code] : [e.code, remap])
            if (!inputKeysHeld.has(key) && !(inputWASDEmulateDirection && inputKeysHeld.has(inputArrowToWASD[key])))
                if (inputData[0][key] & 1)
                    inputData[0][key] = (inputData[0][key]&2) | 4;

        // a Mac sends no keyup for a key let go while Cmd is held, so letting go of Cmd lets go of every key
        if (e.key === 'Meta')
            for (const code of [...inputKeysHeld])
                onKeyUp({code});
    }
    function remapKey(k)
    {
        // handle remapping wasd keys to directions
        return inputWASDEmulateDirection && inputWASDToArrow[k] || k;
    }
    function onMouseDown(e)
    {
        // a mouse on a touchscreen laptop works, only the mouse events a tap makes are left to the touch input
        if (touchInputEnable && inputIsTouchMouseEvent(e)) return;

        // fix stalled audio requiring user interaction
        if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
            audioContext.resume();

        inputData[0][e.button] = 3;

        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));
        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));

        // a click on an HTML form control on the page is left to it, so it can take focus, place the caret or drag
        if (inputPreventDefault && e.cancelable && document.hasFocus() && !isOnControl(e))
        {
            // this keeps focus where it is, so a click outside a text field lets it go, or it keeps the keys
            const active = /** @type {HTMLElement} */ (document.activeElement);
            isTextInput(active) && !active.contains(/** @type {Node} */ (e.target)) && active.blur();
            e.preventDefault();
        }
    }
    function onMouseUp(e)
    {
        if (touchInputEnable && inputIsTouchMouseEvent(e)) return;

        // released only if it was pressed, like a key or a touch
        if (inputData[0][e.button] & 1)
            inputData[0][e.button] = (inputData[0][e.button]&2) | 4;

        // the mouse's back and forward buttons would leave the page, like Backspace would
        if (inputPreventDefault && e.cancelable && (e.button === 3 || e.button === 4))
            e.preventDefault();
    }
    function onMouseMove(e)
    {
        mouseInWindow = true;
        const mousePosScreenLast = mousePosScreen;
        mousePosScreen = mouseEventToScreen(vec2(e.x,e.y));

        // when pointer is locked use movementX/Y for delta, css pixels scaled to canvas units the way
        // mouseEventToScreen maps positions, so the delta matches the unlocked one with canvasFixedSize
        let movement;
        if (pointerLockIsActive())
        {
            const rect = mainCanvas.getBoundingClientRect();
            movement = vec2(e.movementX * mainCanvasSize.x / rect.width, e.movementY * mainCanvasSize.y / rect.height);
        }
        else
            movement = mousePosScreen.subtract(mousePosScreenLast);
        mouseDeltaScreen = mouseDeltaScreen.add(movement);
    }
    function onMouseLeave() { mouseInWindow = false; } // mouse moved off window
    function onMouseWheel(e)
    {
        // accumulate so multiple wheel events in one frame are not lost
        // a text area, list or field on the page scrolls itself, and the game does not take that wheel
        const target = /** @type {HTMLElement} */ (e.target);
        if (target?.closest?.('input,textarea,select,[contenteditable]'))
            return;
        if (!e.ctrlKey)
            mouseWheel += sign(e.deltaY);
        if (inputPreventDefault && e.cancelable && document.hasFocus())
            e.preventDefault(); // prevent page scrolling
    }
    function onContextMenu(e)
    {
        // prevent right click menu, but a text field keeps its copy and paste menu
        if (inputPreventDefault && !isTextInput(e.target))
            e.preventDefault();
    }
    function onBlur()
    {
        // inputClear also releases any held virtual gamepad controls so they don't stick
        inputClear();
    }

    // enable touch input mouse passthrough
    function touchInputInit()
    {
        // add non passive touch event listeners
        document.addEventListener('touchstart', (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchmove',  (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchend',   (e)=> handleTouch(e), { passive: false });
        document.addEventListener('touchcancel', (e)=> handleTouch(e), { passive: false }); // the browser ended it

        // handle all touch events the same way
        function handleTouch(e)
        {
            if (!touchInputEnable)
            {
                // turned off mid touch, the finger that drove the mouse lets go of it
                if (inputWasTouching && (inputData[0][0] & 1))
                    inputData[0][0] = inputData[0][0] & 2 | 4;
                inputWasTouching = 0;
                return;
            }
            inputLastTouchTime = performance.now();

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
                    // only a game finger coming down presses, not one held through a clear, and it drives the mouse
                    const pressTouch = !inputWasTouching && e.type == 'touchstart' &&
                        [...e.changedTouches].find(t=> !isGamepadTouch(t));
                    const touch = pressTouch || gameTouches[0];

                    // set event pos and pass it along
                    const pos = vec2(touch.clientX, touch.clientY);
                    const mousePosScreenLast = mousePosScreen;
                    mousePosScreen = mouseEventToScreen(pos);
                    if (inputWasTouching && touch.identifier === inputTouchIdentifier)
                        mouseDeltaScreen = mouseDeltaScreen.add(mousePosScreen.subtract(mousePosScreenLast));
                    else if (pressTouch)
                        inputData[0][button] = 3;
                    inputTouchIdentifier = touch.identifier;
                }
                else if (inputWasTouching && (inputData[0][button] & 1))
                    inputData[0][button] = inputData[0][button] & 2 | 4; // released only if it was pressed

                // set was touching
                inputWasTouching = touching;
            }

            // prevent default handling like copy, magnifier lens, and scrolling, but a tap on an HTML control is
            // left to it, cancelling a touch would also take away a button's click or a slider's drag
            if (inputPreventDefault && e.cancelable && document.hasFocus() && !isOnControl(e))
            {
                // like a mouse click, a tap outside a focused text field lets it go, the cancel keeps focus where it is
                const active = /** @type {HTMLElement} */ (document.activeElement);
                e.type == 'touchstart' && isTextInput(active) && !active.contains(/** @type {Node} */ (e.target)) && active.blur();
                e.preventDefault();
            }

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
        return vec2(px*mainCanvasSize.x, py*mainCanvasSize.y);
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

    // update most recently used input device
    updateLastInputDevice();

    function updateLastInputDevice()
    {
        // mouse: any button held or moved
        const mouseActive = mouseIsDown(0) || mouseIsDown(1) || mouseIsDown(2) || mouseDeltaScreen.length() > inputMouseMoveThreshold;

        // gamepad: any button held or stick moved
        let gamepadActive = false;
        for (let s = gamepadStickCount(); s-- && !gamepadActive;)
            gamepadActive = gamepadStick(s).lengthSquared() > .2;
        for (let b = 17; b-- && !gamepadActive;)
            gamepadActive = gamepadIsDown(b);

        // keyboard: any non-mouse key down
        let keyboardActive = false;
        for (const k in inputData[0])
            if (isNaN(+k) && (inputData[0][k] & 1))
            {
                keyboardActive = true;
                break;
            }

        // update the last input
        if (gamepadActive)
            lastInputDevice = 'gamepad';
        else if (mouseActive)
            lastInputDevice = 'mouse';
        else if (keyboardActive)
            lastInputDevice = 'keyboard';

        // set flag if gamepad is last device
        isUsingGamepad = lastInputDevice === 'gamepad';
    }

    // gamepads are updated by engine every frame automatically
    function gamepadsUpdate()
    {
        const deadZoneMin=.3, deadZoneMax=.8;
        const applyDeadZones = (v)=>
        {
            const deadZone = (v)=>
                v > deadZoneMin ? percent(v, deadZoneMin, deadZoneMax) :
                v < -deadZoneMin ? -percent(-v, deadZoneMin, deadZoneMax) : 0;
            return vec2(deadZone(v.x), deadZone(-v.y)).clampLength();
        };

        // the touch gamepad owns gamepad 0 once touched, until a real gamepad is used: that one takes over and the
        // touch gamepad hides until the screen is touched again
        if (touchGamepadEnable && isTouchDevice && touchGamepadTimer.isSet() && gamepadsEnable && inputRealGamepadUsed())
            touchGamepadTimer.unset();
        if (touchGamepadEnable && isTouchDevice && touchGamepadTimer.isSet())
        {
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
            // a press latched since the last poll counts even when the finger already lifted,
            // then it reads pressed and released at once, like a quick key tap
            const data = inputData[1] ?? (inputData[1] = []);
            for (let i=12; i--;)
            {
                const wasDown = gamepadIsDown(i,0), isDown = touchGamepadButtons[i];
                const pressed = touchGamepadButtonsPressed[i] || isDown && !wasDown;
                data[i] = isDown ? pressed ? 3 : 1 : pressed ? 6 : wasDown ? 4 : 0;

                // haptic tap when a face button or start button is first pressed
                // skip stick touches (10, 11) so movement doesn't buzz
                if (touchGamepadVibration && (data[i] & 2) &&
                    (i === 9 || touchGamepadIsFaceButton(i)))
                    vibrate(touchGamepadVibration);
            }
            touchGamepadButtonsPressed.length = 0;
            gamepadButtonsLast[0] = undefined; // a real gamepad 0 starts fresh when it takes over again

            // real gamepads are not read while the touch gamepad is in use
            return;
        }

        // only poll gamepads when focused or in debug mode;
        // what the last poll saw is forgotten meanwhile, a button let go while away is not released on return
        if (gamepadsEnable && !debug && !document.hasFocus())
            return void (gamepadButtonsLast.length = 0);

        // poll gamepads; every slot is visited and a slot with no gamepad is cleared, so a refused or
        // vanished gamepad does not leave its buttons held, even past the end of a shorter array
        // like the one Firefox returns after the highest numbered gamepad disconnects
        const maxGamepads = 8;
        const gamepads = gamepadsEnable ? inputGetGamepads() : []; // disabled lets go of them like unplugged
        for (let i=0; i<maxGamepads; ++i)
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
                gamepadAxisCentered[i] = undefined;
                gamepadButtonsLast[i] = undefined;
                continue;
            }

            const data = inputData[i+1] ?? (inputData[i+1] = []);
            const buttonsLast = gamepadButtonsLast[i] ?? (gamepadButtonsLast[i] = []);
            const sticks = gamepadStickData[i] ?? (gamepadStickData[i] = []);
            const dpad = gamepadDpadData[i] ?? (gamepadDpadData[i] = vec2());

            // read analog sticks
            // gamepads without standard mapping (steering wheels, flight sticks)
            // can report axes that rest at full deflection instead of center,
            // which would otherwise read as a stick held down forever, so only
            // trust an axis once it has rested inside the dead zone for a moment
            const isStandard = gamepad.mapping === 'standard';
            const centered = gamepadAxisCentered[i] ?? (gamepadAxisCentered[i] = []);
            const readAxis = (j)=>
            {
                const v = gamepad.axes[j];
                if (isStandard && j < 4)
                    return v; // spec guarantees axes 0-3 are the two sticks
                if (!gamepadAxisFilterEnable)
                    return v;

                // once an axis has proven it rests at center it stays trusted,
                // otherwise moving it would immediately disqualify it again
                const frames = centered[j] | 0;
                if (frames > gamepadAxisCenteredFrames)
                    return v;
                centered[j] = abs(v) < deadZoneMin ? frames + 1 : 0;
                return 0;
            };
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = applyDeadZones(vec2(readAxis(j), readAxis(j+1)));

            // read buttons; a stick pushed past halfway counts as input too, after the dead zone and the
            // axis filter, so a controller can become the primary one by moving and a noisy axis cannot
            let hadInput = sticks.some(stick=> stick.lengthSquared() > .25);
            for (let j = gamepad.buttons.length; j--;)
            {
                // compare with the raw state of the last poll, not the input data an inputClear may have emptied
                const button = gamepad.buttons[j];
                const wasDown = buttonsLast[j];
                buttonsLast[j] = button.pressed;
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

    if (paused)
    {
        // the gamepad is hidden while paused, so its side zones must not capture
        // touches - otherwise they silently steal taps from menus and dialogs
        for (const zone of touchGamepadSideZones) zone.style.display = 'none';
        if (touchGamepadCenterButtonSize)
        {
            // any touch presses start
            setZone(touchGamepadZoneC, 'inset:0');
            touchGamepadZoneC.style.display = '';
        }
        else
            touchGamepadZoneC.style.display = 'none';
    }
    else
    {
        // position each side zone (left/right differ only by which edge they hug)
        for (let side = 0; side < 2; side++)
        {
            const zone = touchGamepadSideZones[side], edge = side ? 'right' : 'left';
            zone.style.display = touchGamepadSideHasControl(side) ? '' : 'none';
            if (touchGamepadFloating && touchGamepadSideStick(side))
            {
                // bottom 60% grabs the stick; the top 40% passes through. A side with no
                // control on the other side uses the full width (matching the hit-test)
                const width = touchGamepadSideHasControl(side ? 0 : 1) ? '50%' : '100%';
                setZone(zone, `${edge}:0;bottom:0;width:${width};height:60%`);
            }
            else // fixed, and face buttons which never float: a compact box hugging the corner control
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
            if (touchGamepadStartBlockSide(side))
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
            // just disabled: hide the overlay and release any held controls, and the gamepad slot they
            // fed, which nothing else rewrites while real gamepads are off
            touchGamepadOverlay.style.display = 'none';
            touchGamepadPointerRole.clear();
            touchGamepadButtons.length = 0;
            touchGamepadButtonsPressed.length = 0;
            touchGamepadSticks.length = 0;
            touchGamepadStickPointerId.length = 0;
            inputData[1] = undefined;
            gamepadStickData[0] = gamepadDpadData[0] = undefined;
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

    // fade out when idle (always show when displayTime is 0, or while debugging), a control held is in use,
    // its release sets the timer the fade counts from
    const fade = touchGamepadDisplayTime && !touchGamepadPointerRole.size ?
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

    // center start button first, a floating stick's region always covers it; blocked within 2*size of a fixed
    // control so drift off a control can't accidentally fire start (matches the original exclusion logic)
    if (touchGamepadCenterButtonSize && vec2(W/2, H/2).distance(p) < touchGamepadCenterButtonSize &&
        !touchGamepadStartBlockedAt(p, W, H))
        return {role:'start'};

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
}

// true if a press is too near a fixed control for the start button, a floating stick has no fixed place
function touchGamepadStartBlockedAt(p, W, H)
{
    for (let side = 0; side < 2; side++)
        if (touchGamepadStartBlockSide(side) && touchGamepadSideCenter(side, W, H).distance(p) < 2*touchGamepadSize)
            return true;
    return false;
}
function touchGamepadStartBlockSide(side)
{ return touchGamepadSideHasControl(side) && !(touchGamepadFloating && touchGamepadSideStick(side)); }

function touchGamepadPointerDown(e, zone)
{
    // a mouse on a touchscreen laptop clicks the game, the zones are there even while the gamepad is hidden
    if (!touchGamepadEnable || e.pointerType === 'mouse') return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    touchGamepadTimer.set();

    // resume audio on first interaction
    if (soundEnable && !headlessMode && audioContext && !audioIsRunning())
        audioContext.resume();

    // while paused, any touch is the start button; a control belongs to the first finger on it until that
    // finger lifts, so a second finger landing on the same one neither takes it over nor lets it go
    if (paused)
    {
        if (touchGamepadCenterButtonSize && !touchGamepadButtons[9])
        {
            touchGamepadButtons[9] = touchGamepadButtonsPressed[9] = 1;
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
        if (touchGamepadStickPointerId[side] !== undefined) return; // another finger has the stick
        touchGamepadStickAnchors[side] = touchGamepadFloating ? p : touchGamepadSideCenter(side, W, H);
        touchGamepadStickPointerId[side] = e.pointerId;
        touchGamepadPointerRole.set(e.pointerId, 'stick'+side);
        touchGamepadNeedRelayout = true; // base may have re-anchored
        touchGamepadApplyStick(side, p);
        touchGamepadButtonsPressed[touchGamepadStickOut(side) ? 11 : 10] = 1; // the stick's own press, latched
    }
    else if (hit.role === 'face')
    {
        if (touchGamepadButtons[hit.btn]) return; // another finger holds the button
        touchGamepadButtons[hit.btn] = touchGamepadButtonsPressed[hit.btn] = 1;
        touchGamepadPointerRole.set(e.pointerId, 'face'+hit.btn);
    }
    else // 'start'
    {
        if (touchGamepadButtons[9]) return;
        touchGamepadButtons[9] = touchGamepadButtonsPressed[9] = 1;
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