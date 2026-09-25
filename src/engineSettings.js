/**
 * LittleJS Engine Settings
 * - All settings for the engine are here
 * @namespace Settings
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Camera settings

/** Position of camera in world space
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let cameraPos = vec2();

/** Rotation angle of camera in world space
 *  @type {number}
 *  @default
 *  @memberof Settings */
let cameraAngle = 0;

/** Scale of camera in world space
 *  @type {number}
 *  @default
 *  @memberof Settings */
let cameraScale = 32;

///////////////////////////////////////////////////////////////////////////////
// Time settings

/** Scale applied to engine time, can be used for slow motion or fast forward
 *  - 1 is normal speed, 2 is double speed, 0.5 is half speed
 *  - 0 freezes the game like a pause without setting the paused flag, gameUpdatePost and input still run
 *  - Should be >= 0; stacks multiplicatively with the debug +/- shortcut
 *  @type {number}
 *  @default
 *  @memberof Settings */
let timeScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Display settings

/** Enable applying color to tiles when using canvas2d
 *  - This is slower but should be the same as WebGL rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasColorTiles = true;

/** Color to clear the canvas to before render, does not clear if alpha is 0
 *  @type {Color}
 *  @memberof Settings */
let canvasClearColor = CLEAR_BLACK;

/** The max size of the canvas in css pixels, centered if window is larger
 *  - Not affected by canvasPixelRatio, the backing store may be larger than this
 *  @type {Vector2}
 *  @default Vector2(3840,2160)
 *  @memberof Settings */
let canvasMaxSize = vec2(3840, 2160);

/** Minimum aspect ratio of the canvas (width/height), unused if 0
 *  Can be used with canvasMaxAspect to limit aspect ratio
 *  @type {number}
 *  @default
 *  @memberof Settings */
let canvasMinAspect = 0;

/** Maximum aspect ratio of the canvas (width/height), unused if 0
 *  Can be used with canvasMinAspect to limit aspect ratio
 *  @type {number}
 *  @default
 *  @memberof Settings */
let canvasMaxAspect = 0;

/** Fixed size of the canvas in css pixels, if enabled canvas size never changes
 * - canvasPixelRatio still applies, it only scales the backing store
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let canvasFixedSize = vec2();

/** Use nearest canvas scaling for more pixelated look
 *  - If enabled sets css image-rendering:pixelated
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasPixelated = false;

/** Disables texture filtering for crisper pixel art
 *  - Leave true for pixel art so sprites stay sharp when scaled (uses NEAREST filtering)
 *  - Set false for smooth/high-resolution art to enable bilinear filtering and mipmaps
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let tilesPixelated = true;

/** Scale factor applied to the canvas resolution for sharper rendering
 *  Pass 1 for no scaling, a number for an explicit ratio, or undefined to track devicePixelRatio each frame.
 *  - Only the backing store scales, so this changes sharpness and nothing else
 *  - mainCanvasSize, cameraScale, mousePos and screen space stay in css pixels,
 *    so the same code draws the same size at any ratio
 *  - Pixel art usually looks best left at 1 or set to whole numbers,
 *    a fractional ratio samples texels unevenly
 *  @type {number|undefined}
 *  @default
 *  @memberof Settings */
let canvasPixelRatio = 1;

/** Default font used for text rendering
 *  @type {string}
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

/** Enable to show the LittleJS splash screen on startup, must be set before engineInit
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let showSplashScreen = false;

/** Disables all rendering, audio, and input for servers, must be set before engineInit
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let headlessMode = false;

/** Disables the automatic requestAnimationFrame loop so the engine only
 *  advances when engineStep is called, for tests and frame-stepping tools
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let engineManualStep = false;

///////////////////////////////////////////////////////////////////////////////
// WebGL settings

/** Enable WebGL accelerated rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let glEnable = true;

/** How many sided poly to use when drawing circles and ellipses with WebGL
 *  @type {number}
 *  @default
 *  @memberof Settings */
let glCircleSides = 32;

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2}
 *  @default Vector2(16,16)
 *  @memberof Settings */
let tileDefaultSize = vec2(16);

/** Default padding pixels around tiles
 *  @type {number}
 *  @default
 *  @memberof Settings */
let tileDefaultPadding = 0;

/** Default amount of pixels smaller to draw tiles to prevent neighbor bleeding
 *  @type {number}
 *  @default
 *  @memberof Settings */
let tileDefaultBleed = 0;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Enable physics solver for collisions, between objects and with tiles
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = true;

/** Default object mass for collision calculations (how heavy objects are)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** Fraction of velocity objects keep each frame, 1 keeps all of it, 0 stops at once
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = 1;

/** Fraction of angular velocity objects keep each frame, 1 keeps all of it, 0 stops at once
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = 1;

/** How much to bounce when a collision occurs (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultRestitution = 0;

/** Fraction of sliding speed objects keep each frame on the ground, 1 is no friction, 0 stops at once
 *  - The more slippery of an object and its ground is used
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions, in world units per frame on each axis
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects, negative Y is down, in world units per frame per frame
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
let gravity = vec2();

/** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let particleEmitRateScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadsEnable = true;

/** If true, the dpad input is also routed to the left analog stick (for better accessibility)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadDirectionEmulateStick = true;

/** If true, axes that do not rest near center are ignored on gamepads without
 *  standard mapping. Steering wheels and flight sticks report pedal and throttle
 *  axes that rest at full deflection, which otherwise reads as a stick held down.
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let gamepadAxisFilterEnable = true;

/** If true the WASD keys are also routed to the direction keys (for better accessibility)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let inputWASDEmulateDirection = true;

/** True if touch input is enabled for mobile devices
 *  - Touch events will be routed to mouse events
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchInputEnable = true;

/** True if touch gamepad should appear on mobile devices
 *  - Supports left analog stick, 4 face buttons and start button (button 9)
 *  - setTouchGamepadRightStick(true) for a right analog stick in place of the face buttons
 *  - Analog stick buttons 10 and 11 are also activated when virtual sticks are touched
 *  - Rendered as a full-viewport HTML/SVG overlay, so controls may sit outside the game canvas
 *  - It is gamepad 0 once touched; a real gamepad being used takes over and hides it until the screen is touched again
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = false;

/** True if touches outside the gamepad controls should still drive mouse/touch input
 *  - When false (the default), enabling the touch gamepad suppresses touch-to-mouse input entirely
 *  - Set true to also pass touches outside the controls through to the game as mouse/touch input
 *  - Touches on the gamepad controls never drive the mouse regardless of this setting
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadPassthrough = false;

/** Size of center button if touch gamepad should have start button in the center
 *  - Prevents activating when pressed near virtual stick or face buttons
 *  - When the game is paused, any touch will press the button
 *  - Measured in viewport CSS pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadCenterButtonSize = 0;

/** Number of buttons on the right side of the touch gamepad (0-4), using gamepad buttons 0-3
 *  - A count of 1 is a single large button (the size of a stick)
 *  - Ignored when touchGamepadRightStick is set (the right side is a stick instead)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadButtonCount = 4;

/** True if the touch gamepad should have a left analog stick (or dpad)
 *  - When false, the left side is face buttons (touchGamepadLeftButtonCount) or nothing
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadLeftStick = true;

/** Number of buttons on the left side of the touch gamepad (0-4), using gamepad buttons 4-7
 *  - Only used when touchGamepadLeftStick is false (otherwise the left side is a stick)
 *  - A count of 1 is a single large button (the size of a stick)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadLeftButtonCount = 0;

/** True if the touch gamepad right side should be an analog stick (or dpad) instead of face buttons
 *  - When set, touchGamepadButtonCount is ignored and the right side is a stick
 *  - Uses an analog stick when touchGamepadAnalog is true, otherwise an 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadRightStick = false;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = true;

/** True if touch gamepad directional controls should float to where you press
 *  - Only affects analog sticks and dpads, not face buttons
 *  - Directional controls re-anchor to where you press within the bottom ~60% of their screen half; the top ~40% passes through to the game
 *  - The right side floats only when it acts as the right analog stick (touchGamepadRightStick is set)
 *  - A center button (touchGamepadCenterButtonSize) still works since it ignores touches near the sticks
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadFloating = false;

/** Size of virtual gamepad for touch devices in viewport CSS pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 100;

/** Transparency of touch gamepad overlay
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

/** How long to display the touch gamepad on screen in seconds, set to 0 to always display
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadDisplayTime = 3;

/** Duration in ms to vibrate when a touch gamepad face button or start button is pressed
 *  - Set to 0 to disable, also requires vibrateEnable and hardware support (ignored on iOS)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadVibration = 0;

/** Allow vibration hardware if it exists
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let vibrateEnable = true;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** All audio code can be disabled and removed from build
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let soundEnable = true;

/** Volume scale to apply to all sound, music and speech
 *  Use setSoundVolume to also update the audio master gain immediately
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundVolume = .3;

/** Default range where sound no longer plays
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundDefaultRange = 40;

/** Default range percent to start tapering off sound (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let soundDefaultTaper = .7;

/** Pause all sound while the page is hidden, and pick up where it was when it shows again
 *  - A hidden page stops the game, so without this a looping sound plays on over a frozen game
 *  - Turn it off to keep music playing in a background tab
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let soundPauseWhenHidden = true;

///////////////////////////////////////////////////////////////////////////////
// Setters for global variables

/** Set position of camera in world space
 *  @param {Vector2} pos
 *  @memberof Settings */
function setCameraPos(pos) { cameraPos = pos.copy(); }

/** Set angle of camera in world space
 *  @param {number} angle
 *  @memberof Settings */
function setCameraAngle(angle) { cameraAngle = angle; }

/** Set scale of camera in world space
 *  @param {number} scale
 *  @memberof Settings */
function setCameraScale(scale) { cameraScale = scale; }

/** Set scale applied to engine time
 *  - 0 freezes the game like a pause, gameUpdatePost and input still run so the game can set it back
 *  @param {number} scale - 0 or more
 *  @memberof Settings */
function setTimeScale(scale)
{
    ASSERT(scale >= 0, 'time scale must be 0 or more');
    timeScale = max(0, scale); // a negative scale would build a debt of time the game then waits out
}

/** Set if tiles should be colorized when using canvas2d
 *  This can be slower but results should look nearly identical to WebGL rendering
 *  It can be enabled/disabled at any time
 *  Optimized for performance, and will use faster method if color is white or untextured
 *  @param {boolean} colorTiles
 *  @memberof Settings */
function setCanvasColorTiles(colorTiles) { canvasColorTiles = colorTiles; }

/** Set color to clear the canvas to before render, does not clear if alpha is 0
 *  @param {Color} color
 *  @memberof Settings */
function setCanvasClearColor(color) { canvasClearColor = color.copy(); }

/** Set max size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasMaxSize(size) { canvasMaxSize = size.copy(); }

/** Set minimum aspect ratio of the canvas (width/height), unused if 0
 *  @param {number} aspect
 *  @memberof Settings */
function setCanvasMinAspect(aspect) { canvasMinAspect = aspect; }

/** Set maximum aspect ratio of the canvas (width/height), unused if 0
 *  @param {number} aspect
 *  @memberof Settings */
function setCanvasMaxAspect(aspect) { canvasMaxAspect = aspect; }

/** Set fixed size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasFixedSize(size) { canvasFixedSize = size.copy(); }

/** Use nearest scaling algorithm for canvas for more pixelated look
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setCanvasPixelated(pixelated)
{
    canvasPixelated = pixelated;
    if (mainCanvas)
        mainCanvas.style.imageRendering = pixelated ? 'pixelated' : '';
    if (glCanvas)
        glCanvas.style.imageRendering = pixelated ? 'pixelated' : '';
}

/** Disables texture filtering for crisper pixel art
 *  - Leave true for pixel art; set false for smooth/high-resolution art
 *  - Set it before engineInit, a texture already loaded keeps the filtering it was made with
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setTilesPixelated(pixelated) { tilesPixelated = pixelated; }

/** Set the canvas pixel ratio, scales the render resolution for sharper output
 *  Pass a number for an explicit ratio, or call with no argument to track devicePixelRatio each frame.
 *  - The canvas stays the same size on screen and everything draws the same
 *    size, it just renders at a higher resolution so nothing looks blurry
 *  - Game code is unaffected, it always works in css pixels
 *  @param {number} [pixelRatio]
 *  @example
 *  // render at native resolution, capped so phones don't pay for 3x
 *  setCanvasPixelRatio(min(devicePixelRatio, 2));
 *  @memberof Settings */
function setCanvasPixelRatio(pixelRatio) { canvasPixelRatio = pixelRatio; }

/** Get the pixel ratio currently applied to the canvas backing store
 *  - Resolves canvasPixelRatio, falling back to devicePixelRatio when it is undefined
 *  - Game code works in css pixels so this is rarely needed, it is for sizing
 *    render targets and viewports that must match the backing store
 *  @return {number}
 *  @memberof Settings */
function getCanvasPixelRatio() { return canvasPixelRatio ?? (devicePixelRatio || 1); }

/** Set default font used for text rendering
 *  @param {string} font
 *  @memberof Settings */
function setFontDefault(font) { fontDefault = font; }

/** Set if the LittleJS splash screen should be shown on startup, must be set before engineInit
 *  @param {boolean} show
 *  @memberof Settings */
function setShowSplashScreen(show) { showSplashScreen = show; }

/** Set to disable rendering, audio, and input for servers, must be set before engineInit
 *  @param {boolean} headless
 *  @memberof Settings */
function setHeadlessMode(headless) { headlessMode = headless; }

/** Set if the engine only advances when engineStep is called
 *  Must be set before engineInit
 *  @param {boolean} [enable]
 *  @memberof Settings */
function setEngineManualStep(enable=true) { engineManualStep = enable; }

/** Set if WebGL rendering is enabled
 *  @param {boolean} enable
 *  @memberof Settings */
function setGLEnable(enable)
{
    if (enable && !glCanBeEnabled)
    {
        console.warn('Can not enable WebGL if it was disabled on start.');
        return;
    }
    glEnable = enable;
    if (glCanvas) // hide glCanvas if WebGL is disabled
        glCanvas.style.display = enable ? '' : 'none';
}

/** Set how many sided polygons to use when drawing circles and ellipses with WebGL
 *  @param {number} sides
 *  @memberof Settings */
function setGLCircleSides(sides) { glCircleSides = sides; }

/** Set default size of tiles in pixels
 *  @param {Vector2} size
 *  @memberof Settings */
function setTileDefaultSize(size) { tileDefaultSize = size.copy(); }

/** Default padding pixels around tiles
 *  @param {number} padding
 *  @memberof Settings */
function setTileDefaultPadding(padding) { tileDefaultPadding = padding; }

/** Default amount of pixels smaller to draw tiles to prevent neighbor bleeding
 *  @param {number} bleed
 *  @memberof Settings */
function setTileDefaultBleed(bleed) { tileDefaultBleed = bleed; }

/** Set if collisions are enabled, between objects and with tiles
 *  @param {boolean} enable
 *  @memberof Settings */
function setEnablePhysicsSolver(enable) { enablePhysicsSolver = enable; }

/** Set default object mass for collision calculations
 *  @param {number} mass
 *  @memberof Settings */
function setObjectDefaultMass(mass) { objectDefaultMass = mass; }

/** Set how much to slow velocity by each frame
 *  @param {number} damp
 *  @memberof Settings */
function setObjectDefaultDamping(damp) { objectDefaultDamping = damp; }

/** Set how much to slow angular velocity each frame
 *  @param {number} damp
 *  @memberof Settings */
function setObjectDefaultAngleDamping(damp) { objectDefaultAngleDamping = damp; }

/** Set how much to bounce when a collision occurs
 *  @param {number} restitution
 *  @memberof Settings */
function setObjectDefaultRestitution(restitution) { objectDefaultRestitution = restitution; }

/** Set how much to slow when touching
 *  @param {number} friction
 *  @memberof Settings */
function setObjectDefaultFriction(friction) { objectDefaultFriction = friction; }

/** Set max speed to avoid fast objects missing collisions
 *  @param {number} speed
 *  @memberof Settings */
function setObjectMaxSpeed(speed) { objectMaxSpeed = speed; }

/** Set how much gravity to apply to objects
 *  @param {Vector2} newGravity
 *  @memberof Settings */
function setGravity(newGravity) { gravity = newGravity.copy(); }

/** Set to scales emit rate of particles
 *  @param {number} scale
 *  @memberof Settings */
function setParticleEmitRateScale(scale) { particleEmitRateScale = scale; }

/** Set if gamepads are enabled
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadsEnable(enable) { gamepadsEnable = enable; }

/** Set if the dpad input is also routed to the left analog stick
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadDirectionEmulateStick(enable) { gamepadDirectionEmulateStick = enable; }

/** Set if axes that do not rest near center are ignored on non-standard gamepads
 *  @param {boolean} enable
 *  @memberof Settings */
function setGamepadAxisFilterEnable(enable) { gamepadAxisFilterEnable = enable; }

/** Set if true the WASD keys are also routed to the direction keys
 *  @param {boolean} enable
 *  @memberof Settings */
function setInputWASDEmulateDirection(enable) { inputWASDEmulateDirection = enable; }

/** Set if touch input is allowed
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchInputEnable(enable) { touchInputEnable = enable; }

/** Set if touch gamepad should appear on mobile devices
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadEnable(enable) { touchGamepadEnable = enable; }

/** Set if touches outside the gamepad controls should still drive mouse/touch input
 *  @param {boolean} passthrough
 *  @memberof Settings */
function setTouchGamepadPassthrough(passthrough) { touchGamepadPassthrough = passthrough; }

/** Set if touch gamepad should have start button in the center
 *  - Set size to enable the center button
 *  - When the game is paused, any touch will press the button
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadCenterButtonSize(size) { touchGamepadCenterButtonSize = size; }

/** Set number of buttons on the right side of the touch gamepad (0-4, gamepad buttons 0-3)
 *  @param {number} count
 *  @memberof Settings */
function setTouchGamepadButtonCount(count)
{
    touchGamepadButtonCount = count;
    if (count > 0)
        touchGamepadRightStick = false;
}

/** Set if the touch gamepad should have a left analog stick (or dpad)
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadLeftStick(enable)
{
    touchGamepadLeftStick = enable;
    if (enable)
        touchGamepadLeftButtonCount = 0;
}

/** Set number of buttons on the left side of the touch gamepad (0-4, gamepad buttons 4-7)
 *  - Only used when touchGamepadLeftStick is false
 *  @param {number} count
 *  @memberof Settings */
function setTouchGamepadLeftButtonCount(count)
{
    touchGamepadLeftButtonCount = count;
    if (count > 0)
        touchGamepadLeftStick = false;
}

/** Set if the touch gamepad right side is an analog stick (or dpad) instead of face buttons
 *  @param {boolean} rightStick
 *  @memberof Settings */
function setTouchGamepadRightStick(rightStick)
{
    touchGamepadRightStick = rightStick;
    if (rightStick)
        touchGamepadButtonCount = 0;
}

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set if touch gamepad directional controls should float to where you press
 *  @param {boolean} floating
 *  @memberof Settings */
function setTouchGamepadFloating(floating) { touchGamepadFloating = floating; }

/** Set size of virtual gamepad for touch devices in pixels
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

/** Set how long to display the touch gamepad on screen in seconds, set to 0 to always display
 *  @param {number} time
 *  @memberof Settings */
function setTouchGamepadDisplayTime(time) { touchGamepadDisplayTime = time; }

/** Set duration in ms to vibrate when a touch gamepad face or start button is pressed (0 disables)
 *  @param {number} ms
 *  @memberof Settings */
function setTouchGamepadVibration(ms) { touchGamepadVibration = ms; }

/** Set to allow vibration hardware if it exists
 *  @param {boolean} enable
 *  @memberof Settings */
function setVibrateEnable(enable) { vibrateEnable = enable; }

/** Set to disable all audio code
 *  @param {boolean} enable
 *  @memberof Settings */
function setSoundEnable(enable) { soundEnable = enable; }

/** Set volume scale to apply to all sound, music and speech
 *  @param {number} volume
 *  @memberof Settings */
function setSoundVolume(volume)
{
    soundVolume = volume;
    if (!headlessMode && audioMasterGain)
        audioMasterGain.gain.value = volume; // update gain immediately, sound off or not
}

/** Set default range where sound no longer plays
 *  @param {number} range
 *  @memberof Settings */
function setSoundDefaultRange(range) { soundDefaultRange = range; }

/** Set default range percent to start tapering off sound
 *  @param {number} taper
 *  @memberof Settings */
function setSoundDefaultTaper(taper) { soundDefaultTaper = taper; }

/** Set if all sound pauses while the page is hidden
 *  @param {boolean} pause
 *  @memberof Settings */
function setSoundPauseWhenHidden(pause) { soundPauseWhenHidden = pause; }

/** Set if watermark with FPS should be shown
 *  @param {boolean} show
 *  @memberof Debug */
function setDebugWatermark(show) { debugWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {string} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }