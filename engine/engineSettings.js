/**
 *  LittleJS Engine Settings
 *  @namespace Settings
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Display settings

/** The max width of the canvas, centered if window is larger
 *  @default
 *  @memberof Settings */
const maxWidth = 1920;

/** The max height of the canvas, centered if window is larger
 *  @default
 *  @memberof Settings */
const maxHeight = 1200; // up to 1080p and 16:10

/** Fixed witdh, if enabled cavnvas size never changes
 *  @default
 *  @memberof Settings */
let fixedWidth = 0;

/** Fixed height, if enabled cavnvas size never changes
 *  @default
 *  @memberof Settings */
let fixedHeight = 0;

/** Fit to canvas to window by adding space on top or bottom if necessary
 *  @default
 *  @memberof Settings */
let fixedFitToWindow = 1;

/** Default font used for text rendering
 *  @default
 *  @memberof Settings */
let defaultFont = 'arial';

///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings

/** Default size of tiles in pixels
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
const defaultTileSize = vec2(16);

/** Prevent tile bleeding from neighbors in pixels
 *  @default
 *  @memberof Settings */
const tileBleedShrinkFix = .3;

/** Use crisp pixels for pixel art if true
 *  @default
 *  @memberof Settings */
let pixelated = 1;

///////////////////////////////////////////////////////////////////////////////
// Object settings

/** Default size of objects
 *  @type {Vector2} 
 *  @default
 *  @memberof Settings */
const defaultObjectSize = vec2(1);

/** Default object mass for collison calcuations (how heavy objects are)
 *  @default
 *  @memberof Settings */
const defaultObjectMass = 1;

/** How much to slow velocity by each frame (0-1)
 *  @default
 *  @memberof Settings */
const defaultObjectDamping = .99;

/** How much to slow angular velocity each frame (0-1)
 *  @default
 *  @memberof Settings */
const defaultObjectAngleDamping = .99;

/** How much to bounce when a collision occurs (0-1)
 *  @default
 *  @memberof Settings */
const defaultObjectElasticity = 0;

/** How much to slow when touching (0-1)
 *  @default
 *  @memberof Settings */
const defaultObjectFriction = .8;

/** Clamp max speed to avoid fast objects missing collisions
 *  @default
 *  @memberof Settings */
const maxObjectSpeed = 1;

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
let cameraScale = max(defaultTileSize.x, defaultTileSize.y);

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

/** If true touch input is routed to mouse functions
 *  @default
 *  @memberof Settings */
const touchInputEnable = 1;

/** Allow players to use dpad as analog stick
 *  @default
 *  @memberof Settings */
const copyGamepadDirectionToStick = 1;

/** allow players to use WASD as direction keys
 *  @default
 *  @memberof Settings */
const copyWASDToDpad = 1;

///////////////////////////////////////////////////////////////////////////////
// Audio settings

/** All audio code can be disabled and removed from build
 *  @default
 *  @memberof Settings */
const soundEnable = 1;

/** Volume scale to apply to all sound, music and speech
 *  @default
 *  @memberof Settings */
let audioVolume = .5;

/** Default range where sound no longer plays
 *  @default
 *  @memberof Settings */
const defaultSoundRange = 30;

/** Default range percent to start tapering off sound (0-1)
 *  @default
 *  @memberof Settings */
const defaultSoundTaper = .7;

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