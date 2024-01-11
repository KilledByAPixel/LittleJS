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

/** Scale of camera in world space
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let cameraScale = 32;

///////////////////////////////////////////////////////////////////////////////
// Display settings

/** The max size of the canvas, centered if window is larger
 *  @type {Vector2}
 *  @default Vector2(1920,1200)
 *  @memberof Settings */
let canvasMaxSize = vec2(1920, 1200);

/** Fixed size of the canvas, if enabled canvas size never changes
 * - you may also need to set mainCanvasSize if using screen space coords in startup
 *  @type {Vector2}
 *  @default Vector2()
 *  @memberof Settings */
let canvasFixedSize = vec2();

/** Disables filtering for crisper pixel art if true
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let canvasPixelated = 1;

/** Default font used for text rendering
 *  @type {String}
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

///////////////////////////////////////////////////////////////////////////////
// WebGL settings

/** Enable webgl rendering, webgl can be disabled and removed from build (with some features disabled)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let glEnable = 1;

/** Fixes slow rendering in some browsers by not compositing the WebGL canvas
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let glOverlay = 1;

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2}
 *  @default Vector2(16,16)
 *  @memberof Settings */
let tileSizeDefault = vec2(16);

/** Prevent tile bleeding from neighbors in pixels
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let tileFixBleedScale = .3;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Enable physics solver for collisions between objects
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = 1;

/** Default object mass for collison calcuations (how heavy objects are)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = 1;

/** How much to slow angular velocity each frame (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = 1;

/** How much to bounce when a collision occurs (0-1)
 *  @type {Number}
 *  @default 0
 *  @memberof Settings */
let objectDefaultElasticity = 0;

/** How much to slow when touching (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects along the Y axis, negative is down
 *  @type {Number}
 *  @default 0
 *  @memberof Settings */
let gravity = 0;

/** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let particleEmitRateScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let gamepadsEnable = 1;

/** If true, the dpad input is also routed to the left analog stick (for better accessability)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let gamepadDirectionEmulateStick = 1;

/** If true the WASD keys are also routed to the direction keys (for better accessability)
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let inputWASDEmulateDirection = 1;

/** True if touch gamepad should appear on mobile devices
 *  - Supports left analog stick, 4 face buttons and start button (button 9)
 *  - Must be set by end of gameInit to be activated
 *  @type {Boolean}
 *  @default 0
 *  @memberof Settings */
let touchGamepadEnable = 0;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = 1;

/** Size of virutal gamepad for touch devices in pixels
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 99;

/** Transparency of touch gamepad overlay
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

/** Allow vibration hardware if it exists
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let vibrateEnable = 1;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** All audio code can be disabled and removed from build
 *  @type {Boolean}
 *  @default
 *  @memberof Settings */
let soundEnable = 1;

/** Volume scale to apply to all sound, music and speech
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundVolume = .5;

/** Default range where sound no longer plays
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundDefaultRange = 40;

/** Default range percent to start tapering off sound (0-1)
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let soundDefaultTaper = .7;

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Size of medal display
 *  @type {Vector2}
 *  @default Vector2(640,80)
 *  @memberof Settings */
let medalDisplaySize = vec2(640, 80);

/** Size of icon in medal display
 *  @type {Number}
 *  @default
 *  @memberof Settings */
let medalDisplayIconSize = 50;

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @type {Boolean}
 *  @default 0
 *  @memberof Settings */
let medalsPreventUnlock;