/**
 * LittleJS Engine Settings
 * @namespace Settings
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Display settings

/** The max size of the canvas, centered if window is larger
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
let canvasMaxSize = vec2(1920, 1200);

/** Fixed size of the canvas, if enabled canvas size never changes
 * - you may also need to set mainCanvasSize if using screen space coords in startup
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
let canvasFixedSize = vec2();

/** Disables anti aliasing for pixel art if true
 *  @default
 *  @memberof Settings */
let cavasPixelated = 1;

/** Default font used for text rendering
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
let tileSizeDefault = vec2(16);

/** Prevent tile bleeding from neighbors in pixels
 *  @default
 *  @memberof Settings */
let tileFixBleedScale = .3;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Default size of objects
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
let objectDefaultSize = vec2(1);

/** Enable physics solver for collisions between objects
 *  @default
 *  @memberof Settings */
let enablePhysicsSolver = 1;

/** Default object mass for collison calcuations (how heavy objects are)
 *  @default
 *  @memberof Settings */
let objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @default
 *  @memberof Settings */
let objectDefaultDamping = .99;

/** How much to slow angular velocity each frame (0-1)
 *  @default
 *  @memberof Settings */
let objectDefaultAngleDamping = .99;

/** How much to bounce when a collision occurs (0-1)
 *  @default
 *  @memberof Settings */
let objectDefaultElasticity = 0;

/** How much to slow when touching (0-1)
 *  @default
 *  @memberof Settings */
let objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @default
 *  @memberof Settings */
let objectMaxSpeed = 1;

/** How much gravity to apply to objects along the Y axis, negative is down
 *  @default
 *  @memberof Settings */
let gravity = 0;

/** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
 *  @default
 *  @memberof Settings */
let particleEmitRateScale = 1;

///////////////////////////////////////////////////////////////////////////////
// Camera settings

/** Position of camera in world space
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
let cameraPos = vec2();

/** Scale of camera in world space
 *  @default
 *  @memberof Settings */
let cameraScale = max(tileSizeDefault.x, tileSizeDefault.y);

///////////////////////////////////////////////////////////////////////////////
// WebGL settings

/** Enable webgl rendering, webgl can be disabled and removed from build (with some features disabled)
 *  @default
 *  @memberof Settings */
let glEnable = 1;

/** Fixes slow rendering in some browsers by not compositing the WebGL canvas
 *  @default
 *  @memberof Settings */
let glOverlay = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @default
 *  @memberof Settings */
let gamepadsEnable = 1;

/** If true, the dpad input is also routed to the left analog stick (for better accessability)
 *  @default
 *  @memberof Settings */
let gamepadDirectionEmulateStick = 1;

/** If true the WASD keys are also routed to the direction keys (for better accessability)
 *  @default
 *  @memberof Settings */
let inputWASDEmulateDirection = 1;

/** True if touch gamepad should appear on mobile devices
 *  <br> - Supports left analog stick, 4 face buttons and start button (button 9)
 *  <br> - Must be set by end of gameInit to be activated
 *  @default
 *  @memberof Settings */
let touchGamepadEnable = 0;

/** True if touch gamepad should be analog stick or false to use if 8 way dpad
 *  @default
 *  @memberof Settings */
let touchGamepadAnalog = 1;

/** Size of virutal gamepad for touch devices in pixels
 *  @default
 *  @memberof Settings */
let touchGamepadSize = 80;

/** Transparency of touch gamepad overlay
 *  @default
 *  @memberof Settings */
let touchGamepadAlpha = .3;

/** Allow vibration hardware if it exists
 *  @default
 *  @memberof Settings */
let vibrateEnable = 1;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** Volume scale to apply to all sound, music and speech
 *  @default
 *  @memberof Settings */
let soundVolume = .5;

/** All audio code can be disabled and removed from build
 *  @default
 *  @memberof Settings */
let soundEnable = 1;

/** Default range where sound no longer plays
 *  @default
 *  @memberof Settings */
let soundDefaultRange = 30;

/** Default range percent to start tapering off sound (0-1)
 *  @default
 *  @memberof Settings */
let soundDefaultTaper = .7;

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Width of medal display
 *  @default
 *  @memberof Settings */
let medalDisplayWidth = 640;

/** Height of medal display
 *  @default
 *  @memberof Settings */
let medalDisplayHeight = 80;

/** Size of icon in medal display
 *  @default
 *  @memberof Settings */
let medalDisplayIconSize = 50;