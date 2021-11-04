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
const maxSize = vec2(1920, 1200);

/** Fixed size of the canvas, if enabled cavnvas size never changes
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
let fixedSize = vec2();

/** Default font used for text rendering
 *  @default
 *  @memberof Settings */
let fontDefault = 'arial';

/** Disables anti aliasing for pixel art if true
 *  @default
 *  @memberof Settings */
let pixelated = 1;

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
const tileSizeDefault = vec2(16);

/** Prevent tile bleeding from neighbors in pixels
 *  @default
 *  @memberof Settings */
const tileBleedShrinkFix = .3;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Default size of objects
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
const objectDefaultSize = vec2(1);

/** Default object mass for collison calcuations (how heavy objects are)
 *  @default
 *  @memberof Settings */
const objectDefaultMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @default
 *  @memberof Settings */
const objectDefaultDamping = .99;

/** How much to slow angular velocity each frame (0-1)
 *  @default
 *  @memberof Settings */
const objectDefaultAngleDamping = .99;

/** How much to bounce when a collision occurs (0-1)
 *  @default
 *  @memberof Settings */
const objectDefaultElasticity = 0;

/** How much to slow when touching (0-1)
 *  @default
 *  @memberof Settings */
const objectDefaultFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @default
 *  @memberof Settings */
const objectMaxSpeed = 1;

/** How much gravity to apply to objects along the Y axis, negative is down
 *  @default
 *  @memberof Settings */
let gravity = 0;

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
const glEnable = 1;

/** Fixes slow rendering in some browsers by not compositing the WebGL canvas
 *  @default
 *  @memberof Settings */
let glOverlay = 1;

///////////////////////////////////////////////////////////////////////////////
// Input settings

/** Should gamepads be allowed
 *  @default
 *  @memberof Settings */
const gamepadsEnable = 1;

/** If true, the dpad input is also routed to the left analog stick (for better accessability)
 *  @default
 *  @memberof Settings */
const gamepadDirectionEmulateStick = 1;

/** If true touch input is routed to mouse functions
 *  @default
 *  @memberof Settings */
const inputTouchEnable = 1;

/** If true the WASD keys are also routed to the direction keys (for better accessability)
 *  @default
 *  @memberof Settings */
const inputWASDEmulateDirection = 1;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** Volume scale to apply to all sound, music and speech
 *  @default
 *  @memberof Settings */
let soundVolume = .5;

/** All audio code can be disabled and removed from build
 *  @default
 *  @memberof Settings */
const soundEnable = 1;

/** Default range where sound no longer plays
 *  @default
 *  @memberof Settings */
const soundDefaultRange = 30;

/** Default range percent to start tapering off sound (0-1)
 *  @default
 *  @memberof Settings */
const soundDefaultTaper = .7;

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @default
 *  @memberof Settings */
const medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @default
 *  @memberof Settings */
const medalDisplaySlideTime = .5;

/** Width of medal display
 *  @default
 *  @memberof Settings */
const medalDisplayWidth = 640;

/** Height of medal display
 *  @default
 *  @memberof Settings */
const medalDisplayHeight = 99;

/** Size of icon in medal display
 *  @default
 *  @memberof Settings */
const medalDisplayIconSize = 80;