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
// Display settings

/** Enable applying color to tiles when using canvas2d
 *  - This is slower but should be the same as WebGL rendering
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let canvasColorTiles = true;

/** Color to clear the canvas to before render
 *  @type {Color}
 *  @memberof Draw */
let canvasClearColor = CLEAR_BLACK;

/** The max size of the canvas, centered if window is larger
 *  @type {Vector2}
 *  @default Vector2(1920,1080)
 *  @memberof Settings */
let canvasMaxSize = vec2(1920, 1080);

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

/** Fixed size of the canvas, if enabled canvas size never changes
 * - you may also need to set mainCanvasSize if using screen space coords in startup
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
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let tilesPixelated = true;

/** Default font used for text rendering
 *  @type {string}
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

/** Enable to show the LittleJS splash screen on startup
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let showSplashScreen = false;

/** Disables all rendering, audio, and input for servers
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let headlessMode = false;

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

/** Enable physics solver for collisions between objects
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = true;

/** Default object mass for collision calculations (how heavy objects are)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = 1;

/** How much to slow angular velocity each frame (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = 1;

/** How much to bounce when a collision occurs (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultRestitution = 0;

/** How much to slow when touching (0-1)
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @type {number}
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects, negative Y is down
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
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = false;

/** True if touch gamepad should have start button in the center
 *  - When the game is paused, any touch will press the button
 *  - This can function as a way to pause/unpause the game
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadCenterButton = true;

/** Number of buttons on touch gamepad (0-4), if 1 also acts as right analog stick
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadButtonCount = 4;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = true;

/** Size of virtual gamepad for touch devices in pixels
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 99;

/** Transparency of touch gamepad overlay
 *  @type {number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

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

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Size of medal display
 *  @type {Vector2}
 *  @default Vector2(640,80)
 *  @memberof Settings */
let medalDisplaySize = vec2(640, 80);

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let medalsPreventUnlock = false;

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

/** Set if tiles should be colorized when using canvas2d
 *  This can be slower but results should look nearly identical to WebGL rendering
 *  It can be enabled/disabled at any time
 *  Optimized for performance, and will use faster method if color is white or untextured
 *  @param {boolean} colorTiles
 *  @memberof Settings */
function setCanvasColorTiles(colorTiles) { canvasColorTiles = colorTiles; }

/** Set color to clear the canvas to before render
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
 *  @param {boolean} pixelated
 *  @memberof Settings */
function setTilesPixelated(pixelated) { tilesPixelated = pixelated; }

/** Set default font used for text rendering
 *  @param {string} font
 *  @memberof Settings */
function setFontDefault(font) { fontDefault = font; }

/** Set if the LittleJS splash screen should be shown on startup
 *  @param {boolean} show
 *  @memberof Settings */
function setShowSplashScreen(show) { showSplashScreen = show; }

/** Set to disable rendering, audio, and input for servers
 *  @param {boolean} headless
 *  @memberof Settings */
function setHeadlessMode(headless) { headlessMode = headless; }

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

/** Set if collisions between objects are enabled
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

/** True if touch gamepad should have start button in the center
 *  - This can function as a way to pause/unpause the game
 *  @param {boolean} enable
 *  @memberof Settings */
function setTouchGamepadCenterButton(enable) { touchGamepadCenterButton = enable; }

/** Set number of buttons on touch gamepad (0-4), if 1 also acts as right analog stick
 *  @param {number} count
 *  @memberof Settings */
function setTouchGamepadButtonCount(count) { touchGamepadButtonCount = count; }

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set size of virtual gamepad for touch devices in pixels
 *  @param {number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

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
    if (soundEnable && !headlessMode && audioMasterGain)
        audioMasterGain.gain.value = volume; // update gain immediately
}

/** Set default range where sound no longer plays
 *  @param {number} range
 *  @memberof Settings */
function setSoundDefaultRange(range) { soundDefaultRange = range; }

/** Set default range percent to start tapering off sound
 *  @param {number} taper
 *  @memberof Settings */
function setSoundDefaultTaper(taper) { soundDefaultTaper = taper; }

/** Set how long to show medals for in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplayTime(time) { medalDisplayTime = time; }

/** Set how quickly to slide on/off medals in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplaySlideTime(time) { medalDisplaySlideTime = time; }

/** Set size of medal display
 *  @param {Vector2} size
 *  @memberof Settings */
function setMedalDisplaySize(size) { medalDisplaySize = size.copy(); }

/** Set to stop medals from being unlockable
 *  @param {boolean} preventUnlock
 *  @memberof Settings */
function setMedalsPreventUnlock(preventUnlock) { medalsPreventUnlock = preventUnlock; }

/** Set if watermark with FPS should be shown
 *  @param {boolean} show
 *  @memberof Debug */
function setDebugWatermark(show) { debugWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {string} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }