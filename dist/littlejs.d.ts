declare module "littlejsengine" {
    /**
     * LittleJS - The Tiny Fast JavaScript Game Engine
     * MIT License - Copyright 2021 Frank Force
     *
     * Engine Features
     * - Object oriented system with base class engine object
     * - Base class object handles update, physics, collision, rendering, etc
     * - Engine helper classes and functions like Vector2, Color, and Timer
     * - Super fast rendering system for tile sheets
     * - Sound effects audio with zzfx and music with zzfxm
     * - Input processing system with gamepad and touchscreen support
     * - Tile layer rendering and collision system
     * - Particle effect system
     * - Medal system tracks and displays achievements
     * - Debug tools and debug rendering system
     * - Post processing effects
     * - Call engineInit() to start it up!
     * @namespace Engine
     */
    /** Name of engine
     *  @type {string}
     *  @default
     *  @memberof Engine */
    export const engineName: string;
    /** Version of engine
     *  @type {string}
     *  @default
     *  @memberof Engine */
    export const engineVersion: string;
    /** Frames per second to update
     *  @type {number}
     *  @default
     *  @memberof Engine */
    export const frameRate: number;
    /** How many seconds each frame lasts, engine uses a fixed time step
     *  @type {number}
     *  @default 1/60
     *  @memberof Engine */
    export const timeDelta: number;
    /** Array containing all engine objects
     *  @type {Array<EngineObject>}
     *  @memberof Engine */
    export let engineObjects: Array<EngineObject>;
    /** Current update frame, used to calculate time
     *  @type {number}
     *  @memberof Engine */
    export let frame: number;
    /** Current engine time since start in seconds
     *  @type {number}
     *  @memberof Engine */
    export let time: number;
    /** Actual clock time since start in seconds (not affected by pause or frame rate clamping)
     *  @type {number}
     *  @memberof Engine */
    export let timeReal: number;
    /** Is the game paused? Causes time and objects to not be updated
     *  @type {boolean}
     *  @default false
     *  @memberof Engine */
    export let paused: boolean;
    /** Set if game is paused
     *  @param {boolean} isPaused
     *  @memberof Engine */
    export function setPaused(isPaused: boolean): void;
    /** Startup LittleJS engine with your callback functions
     *  @param {Function|function():Promise} gameInit - Called once after the engine starts up
     *  @param {Function} gameUpdate - Called every frame before objects are updated
     *  @param {Function} gameUpdatePost - Called after physics and objects are updated, even when paused
     *  @param {Function} gameRender - Called before objects are rendered, for drawing the background
     *  @param {Function} gameRenderPost - Called after objects are rendered, useful for drawing UI
     *  @param {Array<string>} [imageSources=[]] - List of images to load
     *  @param {HTMLElement} [rootElement] - Root element to attach to, the document body by default
     *  @memberof Engine */
    export function engineInit(gameInit: Function | (() => Promise<any>), gameUpdate: Function, gameUpdatePost: Function, gameRender: Function, gameRenderPost: Function, imageSources?: Array<string>, rootElement?: HTMLElement): Promise<void>;
    /** Update each engine object, remove destroyed objects, and update time
     *  @memberof Engine */
    export function engineObjectsUpdate(): void;
    /** Destroy and remove all objects
     *  @memberof Engine */
    export function engineObjectsDestroy(): void;
    /** Collects all object within a given area
     *  @param {Vector2} [pos]                 - Center of test area, or undefined for all objects
     *  @param {Vector2|number} [size]         - Radius of circle if float, rectangle size if Vector2
     *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
     *  @return {Array<EngineObject>}                        - List of collected objects
     *  @memberof Engine */
    export function engineObjectsCollect(pos?: Vector2, size?: Vector2 | number, objects?: Array<EngineObject>): Array<EngineObject>;
    /** Triggers a callback for each object within a given area
     *  @param {Vector2} [pos]                 - Center of test area, or undefined for all objects
     *  @param {Vector2|number} [size]         - Radius of circle if float, rectangle size if Vector2
     *  @param {Function} [callbackFunction]   - Calls this function on every object that passes the test
     *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
     *  @memberof Engine */
    export function engineObjectsCallback(pos?: Vector2, size?: Vector2 | number, callbackFunction?: Function, objects?: Array<EngineObject>): void;
    /** Return a list of objects intersecting a ray
     *  @param {Vector2} start
     *  @param {Vector2} end
     *  @param {Array<EngineObject>} [objects=engineObjects] - List of objects to check
     *  @return {Array<EngineObject>} - List of objects hit
     *  @memberof Engine */
    export function engineObjectsRaycast(start: Vector2, end: Vector2, objects?: Array<EngineObject>): Array<EngineObject>;
    /** Add a new update function for a plugin
     *  @param {Function} [updateFunction]
     *  @param {Function} [renderFunction]
     *  @memberof Engine */
    export function engineAddPlugin(updateFunction?: Function, renderFunction?: Function): void;
    /**
     * LittleJS Debug System
     * - Press Esc to show debug overlay with mouse pick
     * - Number keys toggle debug functions
     * - +/- apply time scale
     * - Debug primitive rendering
     * - Save a 2d canvas as a png image
     * @namespace Debug
     */
    /** True if debug is enabled
     *  @type {boolean}
     *  @default
     *  @memberof Debug */
    export const debug: boolean;
    /** True if the debug overlay is active, always false in release builds
     *  @type {boolean}
     *  @default
     *  @memberof Debug */
    export let debugOverlay: boolean;
    /** True if watermark with FPS should be shown, false in release builds
     *  @type {boolean}
     *  @default
     *  @memberof Debug */
    export let showWatermark: boolean;
    /** Asserts if the expression is false, does not do anything in release builds
     *  @param {boolean} assert
     *  @param {Object} [output] - error message output
     *  @memberof Debug */
    export function ASSERT(assert: boolean, output?: any): void;
    /** Draw a debug rectangle in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=Vector2()]
     *  @param {string}  [color]
     *  @param {number}  [time]
     *  @param {number}  [angle]
     *  @param {boolean} [fill]
     *  @memberof Debug */
    export function debugRect(pos: Vector2, size?: Vector2, color?: string, time?: number, angle?: number, fill?: boolean): void;
    /** Draw a debug poly in world space
     *  @param {Vector2} pos
     *  @param {Array<Vector2>} points
     *  @param {string}  [color]
     *  @param {number}  [time]
     *  @param {number}  [angle]
     *  @param {boolean} [fill]
     *  @memberof Debug */
    export function debugPoly(pos: Vector2, points: Array<Vector2>, color?: string, time?: number, angle?: number, fill?: boolean): void;
    /** Draw a debug circle in world space
     *  @param {Vector2} pos
     *  @param {number}  [radius]
     *  @param {string}  [color]
     *  @param {number}  [time]
     *  @param {boolean} [fill]
     *  @memberof Debug */
    export function debugCircle(pos: Vector2, radius?: number, color?: string, time?: number, fill?: boolean): void;
    /** Draw a debug point in world space
     *  @param {Vector2} pos
     *  @param {string}  [color]
     *  @param {number}  [time]
     *  @param {number}  [angle]
     *  @memberof Debug */
    export function debugPoint(pos: Vector2, color?: string, time?: number, angle?: number): void;
    /** Draw a debug line in world space
     *  @param {Vector2} posA
     *  @param {Vector2} posB
     *  @param {string}  [color]
     *  @param {number}  [thickness]
     *  @param {number}  [time]
     *  @memberof Debug */
    export function debugLine(posA: Vector2, posB: Vector2, color?: string, thickness?: number, time?: number): void;
    /** Draw a debug combined axis aligned bounding box in world space
     *  @param {Vector2} pA - position A
     *  @param {Vector2} sA - size A
     *  @param {Vector2} pB - position B
     *  @param {Vector2} sB - size B
     *  @param {string}  [color]
     *  @memberof Debug */
    export function debugOverlap(pA: Vector2, sA: Vector2, pB: Vector2, sB: Vector2, color?: string): void;
    /** Draw a debug axis aligned bounding box in world space
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [size]
     *  @param {string}  [color]
     *  @param {number}  [time]
     *  @param {number}  [angle]
     *  @param {string}  [font]
     *  @memberof Debug */
    export function debugText(text: string, pos: Vector2, size?: number, color?: string, time?: number, angle?: number, font?: string): void;
    /** Clear all debug primitives in the list
     *  @memberof Debug */
    export function debugClear(): void;
    /** Trigger debug system to take a screenshot
     *  @memberof Debug */
    export function debugScreenshot(): void;
    /** Save a canvas to disk
     *  @param {HTMLCanvasElement} canvas
     *  @param {string}            [filename]
     *  @param {string}            [type]
     *  @memberof Debug */
    export function debugSaveCanvas(canvas: HTMLCanvasElement, filename?: string, type?: string): void;
    /** Save a text file to disk
     *  @param {string}     text
     *  @param {string}     [filename]
     *  @param {string}     [type]
     *  @memberof Debug */
    export function debugSaveText(text: string, filename?: string, type?: string): void;
    /** Save a data url to disk
     *  @param {string}     dataURL
     *  @param {string}     filename
     *  @memberof Debug */
    export function debugSaveDataURL(dataURL: string, filename: string): void;
    /** Show error as full page of red text
     *  @memberof Debug */
    export function debugShowErrors(): void;
    /** Check if video capture is active
     *  @memberof Debug */
    export function debugVideoCaptureIsActive(): boolean;
    /** Start capturing video
     *  @memberof Debug */
    export function debugVideoCaptureStart(): void;
    /** Stop capturing video and save to disk
     *  @memberof Debug */
    export function debugVideoCaptureStop(): void;
    /**
     * LittleJS Engine Settings
     * - All settings for the engine are here
     * @namespace Settings
     */
    /** Position of camera in world space
     *  @type {Vector2}
     *  @default Vector2()
     *  @memberof Settings */
    export let cameraPos: Vector2;
    /** Scale of camera in world space
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let cameraScale: number;
    /** The max size of the canvas, centered if window is larger
     *  @type {Vector2}
     *  @default Vector2(1920,1080)
     *  @memberof Settings */
    export let canvasMaxSize: Vector2;
    /** Fixed size of the canvas, if enabled canvas size never changes
     * - you may also need to set mainCanvasSize if using screen space coords in startup
     *  @type {Vector2}
     *  @default Vector2()
     *  @memberof Settings */
    export let canvasFixedSize: Vector2;
    /** Use nearest neighbor canvas scaling for more pixelated look
     *  - Must be set before startup to take effect
     *  - If enabled sets css image-rendering:pixelated
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let canvasPixelated: boolean;
    /** Disables texture filtering for crisper pixel art
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let tilesPixelated: boolean;
    /** Default font used for text rendering
     *  @type {string}
     *  @default
     *  @memberof Settings */
    export let fontDefault: string;
    /** Enable to show the LittleJS splash screen be shown on startup
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let showSplashScreen: boolean;
    /** Disables all rendering, audio, and input for servers
     *  - Must be set before startup to take effect
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let headlessMode: boolean;
    /** Default size of tiles in pixels
     *  @type {Vector2}
     *  @default Vector2(16,16)
     *  @memberof Settings */
    export let tileSizeDefault: Vector2;
    /** How many pixels smaller to draw tiles to prevent bleeding from neighbors
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let tileFixBleedScale: number;
    /** Enable physics solver for collisions between objects
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let enablePhysicsSolver: boolean;
    /** Default object mass for collision calculations (how heavy objects are)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectDefaultMass: number;
    /** How much to slow velocity by each frame (0-1)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectDefaultDamping: number;
    /** How much to slow angular velocity each frame (0-1)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectDefaultAngleDamping: number;
    /** How much to bounce when a collision occurs (0-1)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectDefaultRestitution: number;
    /** How much to slow when touching (0-1)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectDefaultFriction: number;
    /** Clamp max speed to avoid fast objects missing collisions
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let objectMaxSpeed: number;
    /** How much gravity to apply to objects, negative Y is down
     *  @type {Vector2}
     *  @default
     *  @memberof Settings */
    export let gravity: Vector2;
    /** Scales emit rate of particles, useful for low graphics mode (0 disables particle emitters)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let particleEmitRateScale: number;
    /** Enable webgl rendering, webgl can be disabled and removed from build (with some features disabled)
     *  - Must be set before startup to take effect
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let glEnable: boolean;
    /** Fixes slow rendering in some browsers by not compositing the WebGL canvas
     *  - Must be set before startup to take effect
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let glOverlay: boolean;
    /** Should gamepads be allowed
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let gamepadsEnable: boolean;
    /** If true, the dpad input is also routed to the left analog stick (for better accessability)
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let gamepadDirectionEmulateStick: boolean;
    /** If true the WASD keys are also routed to the direction keys (for better accessability)
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let inputWASDEmulateDirection: boolean;
    /** True if touch gamepad should appear on mobile devices
     *  - Supports left analog stick, 4 face buttons and start button (button 9)
     *  - Must be set before startup to take effect
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let touchGamepadEnable: boolean;
    /** True if touch gamepad should be analog stick or false to use if 8 way dpad
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let touchGamepadAnalog: boolean;
    /** Size of virtual gamepad for touch devices in pixels
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let touchGamepadSize: number;
    /** Transparency of touch gamepad overlay
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let touchGamepadAlpha: number;
    /** Allow vibration hardware if it exists
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let vibrateEnable: boolean;
    /** All audio code can be disabled and removed from build
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let soundEnable: boolean;
    /** Volume scale to apply to all sound, music and speech
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let soundVolume: number;
    /** Default range where sound no longer plays
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let soundDefaultRange: number;
    /** Default range percent to start tapering off sound (0-1)
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let soundDefaultTaper: number;
    /** How long to show medals for in seconds
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let medalDisplayTime: number;
    /** How quickly to slide on/off medals in seconds
     *  @type {number}
     *  @default
     *  @memberof Settings */
    export let medalDisplaySlideTime: number;
    /** Size of medal display
     *  @type {Vector2}
     *  @default Vector2(640,80)
     *  @memberof Settings */
    export let medalDisplaySize: Vector2;
    /** Set position of camera in world space
     *  @param {Vector2} pos
     *  @memberof Settings */
    export function setCameraPos(pos: Vector2): void;
    /** Set scale of camera in world space
     *  @param {number} scale
     *  @memberof Settings */
    export function setCameraScale(scale: number): void;
    /** Set max size of the canvas
     *  @param {Vector2} size
     *  @memberof Settings */
    export function setCanvasMaxSize(size: Vector2): void;
    /** Set fixed size of the canvas
     *  @param {Vector2} size
     *  @memberof Settings */
    export function setCanvasFixedSize(size: Vector2): void;
    /** Use nearest neighbor scaling algorithm for canvas for more pixelated look
     *  @param {boolean} pixelated
     *  @memberof Settings */
    export function setCanvasPixelated(pixelated: boolean): void;
    /** Disables texture filtering for crisper pixel art
     *  @param {boolean} pixelated
     *  @memberof Settings */
    export function setTilesPixelated(pixelated: boolean): void;
    /** Set default font used for text rendering
     *  @param {string} font
     *  @memberof Settings */
    export function setFontDefault(font: string): void;
    /** Set if the LittleJS splash screen be shown on startup
     *  @param {boolean} show
     *  @memberof Settings */
    export function setShowSplashScreen(show: boolean): void;
    /** Set to disable rendering, audio, and input for servers
     *  @param {boolean} headless
     *  @memberof Settings */
    export function setHeadlessMode(headless: boolean): void;
    /** Set if webgl rendering is enabled
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setGlEnable(enable: boolean): void;
    /** Set to not composite the WebGL canvas
     *  @param {boolean} overlay
     *  @memberof Settings */
    export function setGlOverlay(overlay: boolean): void;
    /** Set default size of tiles in pixels
     *  @param {Vector2} size
     *  @memberof Settings */
    export function setTileSizeDefault(size: Vector2): void;
    /** Set to prevent tile bleeding from neighbors in pixels
     *  @param {number} scale
     *  @memberof Settings */
    export function setTileFixBleedScale(scale: number): void;
    /** Set if collisions between objects are enabled
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setEnablePhysicsSolver(enable: boolean): void;
    /** Set default object mass for collision calculations
     *  @param {number} mass
     *  @memberof Settings */
    export function setObjectDefaultMass(mass: number): void;
    /** Set how much to slow velocity by each frame
     *  @param {number} damp
     *  @memberof Settings */
    export function setObjectDefaultDamping(damp: number): void;
    /** Set how much to slow angular velocity each frame
     *  @param {number} damp
     *  @memberof Settings */
    export function setObjectDefaultAngleDamping(damp: number): void;
    /** Set how much to bounce when a collision occur
     *  @param {number} restitution
     *  @memberof Settings */
    export function setObjectDefaultRestitution(restitution: number): void;
    /** Set how much to slow when touching
     *  @param {number} friction
     *  @memberof Settings */
    export function setObjectDefaultFriction(friction: number): void;
    /** Set max speed to avoid fast objects missing collisions
     *  @param {number} speed
     *  @memberof Settings */
    export function setObjectMaxSpeed(speed: number): void;
    /** Set how much gravity to apply to objects
     *  @param {Vector2} newGravity
     *  @memberof Settings */
    export function setGravity(newGravity: Vector2): void;
    /** Set to scales emit rate of particles
     *  @param {number} scale
     *  @memberof Settings */
    export function setParticleEmitRateScale(scale: number): void;
    /** Set if touch input is allowed
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setTouchInputEnable(enable: boolean): void;
    /** Set if gamepads are enabled
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setGamepadsEnable(enable: boolean): void;
    /** Set if the dpad input is also routed to the left analog stick
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setGamepadDirectionEmulateStick(enable: boolean): void;
    /** Set if true the WASD keys are also routed to the direction keys
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setInputWASDEmulateDirection(enable: boolean): void;
    /** Set if touch gamepad should appear on mobile devices
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setTouchGamepadEnable(enable: boolean): void;
    /** Set if touch gamepad should be analog stick or 8 way dpad
     *  @param {boolean} analog
     *  @memberof Settings */
    export function setTouchGamepadAnalog(analog: boolean): void;
    /** Set size of virtual gamepad for touch devices in pixels
     *  @param {number} size
     *  @memberof Settings */
    export function setTouchGamepadSize(size: number): void;
    /** Set transparency of touch gamepad overlay
     *  @param {number} alpha
     *  @memberof Settings */
    export function setTouchGamepadAlpha(alpha: number): void;
    /** Set to allow vibration hardware if it exists
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setVibrateEnable(enable: boolean): void;
    /** Set to disable all audio code
     *  @param {boolean} enable
     *  @memberof Settings */
    export function setSoundEnable(enable: boolean): void;
    /** Set volume scale to apply to all sound, music and speech
     *  @param {number} volume
     *  @memberof Settings */
    export function setSoundVolume(volume: number): void;
    /** Set default range where sound no longer plays
     *  @param {number} range
     *  @memberof Settings */
    export function setSoundDefaultRange(range: number): void;
    /** Set default range percent to start tapering off sound
     *  @param {number} taper
     *  @memberof Settings */
    export function setSoundDefaultTaper(taper: number): void;
    /** Set how long to show medals for in seconds
     *  @param {number} time
     *  @memberof Settings */
    export function setMedalDisplayTime(time: number): void;
    /** Set how quickly to slide on/off medals in seconds
     *  @param {number} time
     *  @memberof Settings */
    export function setMedalDisplaySlideTime(time: number): void;
    /** Set size of medal display
     *  @param {Vector2} size
     *  @memberof Settings */
    export function setMedalDisplaySize(size: Vector2): void;
    /** Set to stop medals from being unlockable
     *  @param {boolean} preventUnlock
     *  @memberof Settings */
    export function setMedalsPreventUnlock(preventUnlock: boolean): void;
    /** Set if watermark with FPS should be shown
     *  @param {boolean} show
     *  @memberof Debug */
    export function setShowWatermark(show: boolean): void;
    /** Set key code used to toggle debug mode, Esc by default
     *  @param {string} key
     *  @memberof Debug */
    export function setDebugKey(key: string): void;
    /**
     * LittleJS Utility Classes and Functions
     * - General purpose math library
     * - Vector2 - fast, simple, easy 2D vector class
     * - Color - holds a rgba color with some math functions
     * - Timer - tracks time automatically
     * - RandomGenerator - seeded random number generator
     * @namespace Utilities
     */
    /** A shortcut to get Math.PI
     *  @type {number}
     *  @default Math.PI
     *  @memberof Utilities */
    export const PI: number;
    /** Returns absolute value of value passed in
     *  @param {number} value
     *  @return {number}
     *  @memberof Utilities */
    export function abs(value: number): number;
    /** Returns lowest of two values passed in
     *  @param {number} valueA
     *  @param {number} valueB
     *  @return {number}
     *  @memberof Utilities */
    export function min(valueA: number, valueB: number): number;
    /** Returns highest of two values passed in
     *  @param {number} valueA
     *  @param {number} valueB
     *  @return {number}
     *  @memberof Utilities */
    export function max(valueA: number, valueB: number): number;
    /** Returns the sign of value passed in
     *  @param {number} value
     *  @return {number}
     *  @memberof Utilities */
    export function sign(value: number): number;
    /** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
     *  @param {number} dividend
     *  @param {number} [divisor]
     *  @return {number}
     *  @memberof Utilities */
    export function mod(dividend: number, divisor?: number): number;
    /** Clamps the value between max and min
     *  @param {number} value
     *  @param {number} [min]
     *  @param {number} [max]
     *  @return {number}
     *  @memberof Utilities */
    export function clamp(value: number, min?: number, max?: number): number;
    /** Returns what percentage the value is between valueA and valueB
     *  @param {number} value
     *  @param {number} valueA
     *  @param {number} valueB
     *  @return {number}
     *  @memberof Utilities */
    export function percent(value: number, valueA: number, valueB: number): number;
    /** Returns signed wrapped distance between the two values passed in
     *  @param {number} valueA
     *  @param {number} valueB
     *  @param {number} [wrapSize]
     *  @returns {number}
     *  @memberof Utilities */
    export function distanceWrap(valueA: number, valueB: number, wrapSize?: number): number;
    /** Linearly interpolates between values passed in with wrapping
     *  @param {number} percent
     *  @param {number} valueA
     *  @param {number} valueB
     *  @param {number} [wrapSize]
     *  @returns {number}
     *  @memberof Utilities */
    export function lerpWrap(percent: number, valueA: number, valueB: number, wrapSize?: number): number;
    /** Returns signed wrapped distance between the two angles passed in
     *  @param {number} angleA
     *  @param {number} angleB
     *  @returns {number}
     *  @memberof Utilities */
    export function distanceAngle(angleA: number, angleB: number): number;
    /** Linearly interpolates between the angles passed in with wrapping
     *  @param {number} percent
     *  @param {number} angleA
     *  @param {number} angleB
     *  @returns {number}
     *  @memberof Utilities */
    export function lerpAngle(percent: number, angleA: number, angleB: number): number;
    /** Linearly interpolates between values passed in using percent
     *  @param {number} percent
     *  @param {number} valueA
     *  @param {number} valueB
     *  @return {number}
     *  @memberof Utilities */
    export function lerp(percent: number, valueA: number, valueB: number): number;
    /** Applies smoothstep function to the percentage value
     *  @param {number} percent
     *  @return {number}
     *  @memberof Utilities */
    export function smoothStep(percent: number): number;
    /** Returns the nearest power of two not less then the value
     *  @param {number} value
     *  @return {number}
     *  @memberof Utilities */
    export function nearestPowerOfTwo(value: number): number;
    /** Returns true if two axis aligned bounding boxes are overlapping
     *  @param {Vector2} posA          - Center of box A
     *  @param {Vector2} sizeA         - Size of box A
     *  @param {Vector2} posB          - Center of box B
     *  @param {Vector2} [sizeB=(0,0)] - Size of box B, a point if undefined
     *  @return {boolean}              - True if overlapping
     *  @memberof Utilities */
    export function isOverlapping(posA: Vector2, sizeA: Vector2, posB: Vector2, sizeB?: Vector2): boolean;
    /** Returns true if a line segment is intersecting an axis aligned box
     *  @param {Vector2} start - Start of raycast
     *  @param {Vector2} end   - End of raycast
     *  @param {Vector2} pos   - Center of box
     *  @param {Vector2} size  - Size of box
     *  @return {boolean}      - True if intersecting
     *  @memberof Utilities */
    export function isIntersecting(start: Vector2, end: Vector2, pos: Vector2, size: Vector2): boolean;
    /** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
     *  @param {number} [frequency] - Frequency of the wave in Hz
     *  @param {number} [amplitude] - Amplitude (max height) of the wave
     *  @param {number} [t=time]    - Value to use for time of the wave
     *  @return {number}            - Value waving between 0 and amplitude
     *  @memberof Utilities */
    export function wave(frequency?: number, amplitude?: number, t?: number): number;
    /** Formats seconds to mm:ss style for display purposes
     *  @param {number} t - time in seconds
     *  @return {string}
     *  @memberof Utilities */
    export function formatTime(t: number): string;
    /** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
     *  @param {string} url - URL of JSON file
     *  @return {Promise<object>}
     *  @memberof Utilities */
    export function fetchJSON(url: string): Promise<object>;
    /** Random global functions
     *  @namespace Random */
    /** Returns a random value between the two values passed in
     *  @param {number} [valueA]
     *  @param {number} [valueB]
     *  @return {number}
     *  @memberof Random */
    export function rand(valueA?: number, valueB?: number): number;
    /** Returns a floored random value between the two values passed in
     *  The upper bound is exclusive. (If 2 is passed in, result will be 0 or 1)
     *  @param {number} valueA
     *  @param {number} [valueB]
     *  @return {number}
     *  @memberof Random */
    export function randInt(valueA: number, valueB?: number): number;
    /** Randomly returns either -1 or 1
     *  @return {number}
     *  @memberof Random */
    export function randSign(): number;
    /** Returns a random Vector2 within a circular shape
     *  @param {number} [radius]
     *  @param {number} [minRadius]
     *  @return {Vector2}
     *  @memberof Random */
    export function randInCircle(radius?: number, minRadius?: number): Vector2;
    /** Returns a random Vector2 with the passed in length
     *  @param {number} [length]
     *  @return {Vector2}
     *  @memberof Random */
    export function randVec2(length?: number): Vector2;
    /** Returns a random color between the two passed in colors, combine components if linear
     *  @param {Color}   [colorA=(1,1,1,1)]
     *  @param {Color}   [colorB=(0,0,0,1)]
     *  @param {boolean} [linear]
     *  @return {Color}
     *  @memberof Random */
    export function randColor(colorA?: Color, colorB?: Color, linear?: boolean): Color;
    /**
     * Seeded random number generator
     * - Can be used to create a deterministic random number sequence
     * @example
     * let r = new RandomGenerator(123); // random number generator with seed 123
     * let a = r.float();                // random value between 0 and 1
     * let b = r.int(10);                // random integer between 0 and 9
     * r.seed = 123;                     // reset the seed
     * let c = r.float();                // the same value as a
     */
    export class RandomGenerator {
        /** Create a random number generator with the seed passed in
         *  @param {number} [seed] - Starting seed or engine default seed */
        constructor(seed?: number);
        /** @property {number} - random seed */
        seed: number;
        /** Returns a seeded random value between the two values passed in
        *  @param {number} [valueA]
        *  @param {number} [valueB]
        *  @return {number} */
        float(valueA?: number, valueB?: number): number;
        /** Returns a floored seeded random value the two values passed in
        *  @param {number} valueA
        *  @param {number} [valueB]
        *  @return {number} */
        int(valueA: number, valueB?: number): number;
        /** Randomly returns either -1 or 1 deterministically
        *  @return {number} */
        sign(): number;
        /** Returns a seeded random value between the two values passed in with a random sign
        *  @param {number} [valueA]
        *  @param {number} [valueB]
        *  @return {number} */
        floatSign(valueA?: number, valueB?: number): number;
        /** Returns a random angle between -PI and PI
        *  @return {number} */
        angle(): number;
        /** Returns a seeded vec2 with size between the two values passed in
        *  @param {number} valueA
        *  @param {number} [valueB]
        *  @return {Vector2} */
        vec2(valueA?: number, valueB?: number): Vector2;
    }
    /**
     * 2D Vector object with vector math library
     * - Functions do not change this so they can be chained together
     * @example
     * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
     * let b = new Vector2;       // vector with coordinates (0, 0)
     * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
     * let d = a.add(b).scale(5); // operators can be chained
     */
    export class Vector2 {
        /** Create a 2D vector with the x and y passed in, can also be created with vec2()
         *  @param {number} [x] - X axis location
         *  @param {number} [y] - Y axis location */
        constructor(x?: number, y?: number);
        /** @property {number} - X axis location */
        x: number;
        /** @property {number} - Y axis location */
        y: number;
        /** Sets values of this vector and returns self
         *  @param {number} [x] - X axis location
         *  @param {number} [y] - Y axis location
         *  @return {Vector2} */
        set(x?: number, y?: number): Vector2;
        /** Returns a new vector that is a copy of this
         *  @return {Vector2} */
        copy(): Vector2;
        /** Returns a copy of this vector plus the vector passed in
         *  @param {Vector2} v - other vector
         *  @return {Vector2} */
        add(v: Vector2): Vector2;
        /** Returns a copy of this vector minus the vector passed in
         *  @param {Vector2} v - other vector
         *  @return {Vector2} */
        subtract(v: Vector2): Vector2;
        /** Returns a copy of this vector times the vector passed in
         *  @param {Vector2} v - other vector
         *  @return {Vector2} */
        multiply(v: Vector2): Vector2;
        /** Returns a copy of this vector divided by the vector passed in
         *  @param {Vector2} v - other vector
         *  @return {Vector2} */
        divide(v: Vector2): Vector2;
        /** Returns a copy of this vector scaled by the vector passed in
         *  @param {number} s - scale
         *  @return {Vector2} */
        scale(s: number): Vector2;
        /** Returns the length of this vector
         * @return {number} */
        length(): number;
        /** Returns the length of this vector squared
         * @return {number} */
        lengthSquared(): number;
        /** Returns the distance from this vector to vector passed in
         * @param {Vector2} v - other vector
         * @return {number} */
        distance(v: Vector2): number;
        /** Returns the distance squared from this vector to vector passed in
         * @param {Vector2} v - other vector
         * @return {number} */
        distanceSquared(v: Vector2): number;
        /** Returns a new vector in same direction as this one with the length passed in
         * @param {number} [length]
         * @return {Vector2} */
        normalize(length?: number): Vector2;
        /** Returns a new vector clamped to length passed in
         * @param {number} [length]
         * @return {Vector2} */
        clampLength(length?: number): Vector2;
        /** Returns the dot product of this and the vector passed in
         * @param {Vector2} v - other vector
         * @return {number} */
        dot(v: Vector2): number;
        /** Returns the cross product of this and the vector passed in
         * @param {Vector2} v - other vector
         * @return {number} */
        cross(v: Vector2): number;
        /** Returns a copy this vector reflected by the surface normal
         * @param {Vector2} normal - surface normal (should be normalized)
         * @param {number} restitution - how much to bounce, 1 is perfect bounce, 0 is no bounce
         * @return {Vector2} */
        reflect(normal: Vector2, restitution?: number): Vector2;
        /** Returns the clockwise angle of this vector, up is angle 0
         * @return {number} */
        angle(): number;
        /** Sets this vector with clockwise angle and length passed in
         * @param {number} [angle]
         * @param {number} [length]
         * @return {Vector2} */
        setAngle(angle?: number, length?: number): Vector2;
        /** Returns copy of this vector rotated by the clockwise angle passed in
         * @param {number} angle
         * @return {Vector2} */
        rotate(angle: number): Vector2;
        /** Set the integer direction of this vector, corresponding to multiples of 90 degree rotation (0-3)
         * @param {number} [direction]
         * @param {number} [length] */
        setDirection(direction?: number, length?: number): Vector2;
        /** Returns the integer direction of this vector, corresponding to multiples of 90 degree rotation (0-3)
         * @return {number} */
        direction(): number;
        /** Returns a copy of this vector that has been inverted
         * @return {Vector2} */
        invert(): Vector2;
        /** Returns a copy of this vector absolute values
         * @return {Vector2} */
        abs(): Vector2;
        /** Returns a copy of this vector with each axis floored
         * @return {Vector2} */
        floor(): Vector2;
        /** Returns new vec2 with modded values
        *  @param {number} [divisor]
        *  @return {Vector2} */
        mod(divisor?: number): Vector2;
        /** Returns the area this vector covers as a rectangle
         * @return {number} */
        area(): number;
        /** Returns a new vector that is p percent between this and the vector passed in
         * @param {Vector2} v - other vector
         * @param {number}  percent
         * @return {Vector2} */
        lerp(v: Vector2, percent: number): Vector2;
        /** Returns true if this vector is within the bounds of an array size passed in
         * @param {Vector2} arraySize
         * @return {boolean} */
        arrayCheck(arraySize: Vector2): boolean;
        /** Returns this vector expressed as a string
         * @param {number} digits - precision to display
         * @return {string} */
        toString(digits?: number): string;
        /** Checks if this is a valid vector
         * @return {boolean} */
        isValid(): boolean;
    }
    /**
     * Color object (red, green, blue, alpha) with some helpful functions
     * @example
     * let a = new Color;              // white
     * let b = new Color(1, 0, 0);     // red
     * let c = new Color(0, 0, 0, 0);  // transparent black
     * let d = rgb(0, 0, 1);         // blue using rgb color
     * let e = hsl(.3, 1, .5);         // green using hsl color
     */
    export class Color {
        /** Create a color with the rgba components passed in, white by default
         *  @param {number} [r] - red
         *  @param {number} [g] - green
         *  @param {number} [b] - blue
         *  @param {number} [a] - alpha*/
        constructor(r?: number, g?: number, b?: number, a?: number);
        /** @property {number} - Red */
        r: number;
        /** @property {number} - Green */
        g: number;
        /** @property {number} - Blue */
        b: number;
        /** @property {number} - Alpha */
        a: number;
        /** Sets values of this color and returns self
         *  @param {number} [r] - red
         *  @param {number} [g] - green
         *  @param {number} [b] - blue
         *  @param {number} [a] - alpha
         *  @return {Color} */
        set(r?: number, g?: number, b?: number, a?: number): Color;
        /** Returns a new color that is a copy of this
         * @return {Color} */
        copy(): Color;
        /** Returns a copy of this color plus the color passed in
         * @param {Color} c - other color
         * @return {Color} */
        add(c: Color): Color;
        /** Returns a copy of this color minus the color passed in
         * @param {Color} c - other color
         * @return {Color} */
        subtract(c: Color): Color;
        /** Returns a copy of this color times the color passed in
         * @param {Color} c - other color
         * @return {Color} */
        multiply(c: Color): Color;
        /** Returns a copy of this color divided by the color passed in
         * @param {Color} c - other color
         * @return {Color} */
        divide(c: Color): Color;
        /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
         * @param {number} scale
         * @param {number} [alphaScale=scale]
         * @return {Color} */
        scale(scale: number, alphaScale?: number): Color;
        /** Returns a copy of this color clamped to the valid range between 0 and 1
         * @return {Color} */
        clamp(): Color;
        /** Returns a new color that is p percent between this and the color passed in
         * @param {Color}  c - other color
         * @param {number} percent
         * @return {Color} */
        lerp(c: Color, percent: number): Color;
        /** Sets this color given a hue, saturation, lightness, and alpha
         * @param {number} [h] - hue
         * @param {number} [s] - saturation
         * @param {number} [l] - lightness
         * @param {number} [a] - alpha
         * @return {Color} */
        setHSLA(h?: number, s?: number, l?: number, a?: number): Color;
        /** Returns this color expressed in hsla format
         * @return {Array<number>} */
        HSLA(): Array<number>;
        /** Returns a new color that has each component randomly adjusted
         * @param {number} [amount]
         * @param {number} [alphaAmount]
         * @return {Color} */
        mutate(amount?: number, alphaAmount?: number): Color;
        /** Returns this color expressed as a hex color code
         * @param {boolean} [useAlpha] - if alpha should be included in result
         * @return {string} */
        toString(useAlpha?: boolean): string;
        /** Set this color from a hex code
         * @param {string} hex - html hex code
         * @return {Color} */
        setHex(hex: string): Color;
        /** Returns this color expressed as 32 bit RGBA value
         * @return {number} */
        rgbaInt(): number;
        /** Checks if this is a valid color
         * @return {boolean} */
        isValid(): boolean;
    }
    /**
     * Timer object tracks how long has passed since it was set
     * @example
     * let a = new Timer;    // creates a timer that is not set
     * a.set(3);             // sets the timer to 3 seconds
     *
     * let b = new Timer(1); // creates a timer with 1 second left
     * b.unset();            // unset the timer
     */
    export class Timer {
        /** Create a timer object set time passed in
         *  @param {number} [timeLeft] - How much time left before the timer elapses in seconds */
        constructor(timeLeft?: number);
        time: number;
        setTime: number;
        /** Set the timer with seconds passed in
         *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
        set(timeLeft?: number): void;
        /** Unset the timer */
        unset(): void;
        /** Returns true if set
         * @return {boolean} */
        isSet(): boolean;
        /** Returns true if set and has not elapsed
         * @return {boolean} */
        active(): boolean;
        /** Returns true if set and elapsed
         * @return {boolean} */
        elapsed(): boolean;
        /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
         * @return {number} */
        get(): number;
        /** Get percentage elapsed based on time it was set to, returns 0 if not set
         * @return {number} */
        getPercent(): number;
        /** Returns this timer expressed as a string
         * @return {string} */
        toString(): string;
        /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
         * @return {number} */
        valueOf(): number;
    }
    /**
     * Create a 2d vector, can take 1 or 2 scalar values
     * @param {number} [x]
     * @param {number} [y] - if y is undefined, x is used for both
     * @return {Vector2}
     * @example
     * let a = vec2(0, 1); // vector with coordinates (0, 1)
     * a = vec2(5);        // set a to (5, 5)
     * b = vec2();         // set b to (0, 0)
     * @memberof Utilities
     */
    export function vec2(x?: number, y?: number): Vector2;
    /**
     * Create a color object with RGBA values, white by default
     * @param {number} [r=1] - red
     * @param {number} [g=1] - green
     * @param {number} [b=1] - blue
     * @param {number} [a=1] - alpha
     * @return {Color}
     * @memberof Utilities
     */
    export function rgb(r?: number, g?: number, b?: number, a?: number): Color;
    /**
     * Create a color object with HSLA values, white by default
     * @param {number} [h=0] - hue
     * @param {number} [s=0] - saturation
     * @param {number} [l=1] - lightness
     * @param {number} [a=1] - alpha
     * @return {Color}
     * @memberof Utilities
     */
    export function hsl(h?: number, s?: number, l?: number, a?: number): Color;
    /**
     * Check if object is a valid Color
     * @param {any} c
     * @return {boolean}
     * @memberof Utilities
     */
    export function isColor(c: any): boolean;
    /** Color - White #ffffff
     *  @type {Color}
     *  @memberof Utilities */
    export const WHITE: Color;
    /** Color - Black #000000
     *  @type {Color}
     *  @memberof Utilities */
    export const BLACK: Color;
    /** Color - Gray #808080
     *  @type {Color}
     *  @memberof Utilities */
    export const GRAY: Color;
    /** Color - Red #ff0000
     *  @type {Color}
     *  @memberof Utilities */
    export const RED: Color;
    /** Color - Orange #ff8000
     *  @type {Color}
     *  @memberof Utilities */
    export const ORANGE: Color;
    /** Color - Yellow #ffff00
     *  @type {Color}
     *  @memberof Utilities */
    export const YELLOW: Color;
    /** Color - Green #00ff00
     *  @type {Color}
     *  @memberof Utilities */
    export const GREEN: Color;
    /** Color - Cyan #00ffff
     *  @type {Color}
     *  @memberof Utilities */
    export const CYAN: Color;
    /** Color - Blue #0000ff
     *  @type {Color}
     *  @memberof Utilities */
    export const BLUE: Color;
    /** Color - Purple #8000ff
     *  @type {Color}
     *  @memberof Utilities */
    export const PURPLE: Color;
    /** Color - Magenta #ff00ff
     *  @type {Color}
     *  @memberof Utilities */
    export const MAGENTA: Color;
    /** Array containing texture info for batch rendering system
     *  @type {Array<TextureInfo>}
     *  @memberof Draw */
    export let textureInfos: Array<TextureInfo>;
    /**
     * Create a tile info object using a grid based system
     * - This can take vecs or floats for easier use and conversion
     * - If an index is passed in, the tile size and index will determine the position
     * @param {Vector2|number} [pos=0]                - Index of tile in sheet
     * @param {Vector2|number} [size=tileSizeDefault] - Size of tile in pixels
     * @param {number} [textureIndex]                   - Texture index to use
     * @param {number} [padding]                        - How many pixels padding around tiles
     * @return {TileInfo}
     * @example
     * tile(2)                       // a tile at index 2 using the default tile size of 16
     * tile(5, 8)                    // a tile at index 5 using a tile size of 8
     * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
     * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
     * @memberof Draw
     */
    export function tile(pos?: Vector2 | number, size?: Vector2 | number, textureIndex?: number, padding?: number): TileInfo;
    /**
     * Tile Info - Stores info about how to draw a tile
     */
    export class TileInfo {
        /** Create a tile info object
         *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
         *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
         *  @param {number}  [textureIndex]         - Texture index to use
         *  @param {number}  [padding]              - How many pixels padding around tiles
         */
        constructor(pos?: Vector2, size?: Vector2, textureIndex?: number, padding?: number);
        /** @property {Vector2} - Top left corner of tile in pixels */
        pos: Vector2;
        /** @property {Vector2} - Size of tile in pixels */
        size: Vector2;
        /** @property {number} - Texture index to use */
        textureIndex: number;
        /** @property {number} - How many pixels padding around tiles */
        padding: number;
        /** Returns a copy of this tile offset by a vector
        *  @param {Vector2} offset - Offset to apply in pixels
        *  @return {TileInfo}
        */
        offset(offset: Vector2): TileInfo;
        /** Returns a copy of this tile offset by a number of animation frames
        *  @param {number} frame - Offset to apply in animation frames
        *  @return {TileInfo}
        */
        frame(frame: number): TileInfo;
        /** Returns the texture info for this tile
        *  @return {TextureInfo}
        */
        getTextureInfo(): TextureInfo;
    }
    /** Texture Info - Stores info about each texture */
    export class TextureInfo {
        /**
         * Create a TextureInfo, called automatically by the engine
         * @param {HTMLImageElement} image
         */
        constructor(image: HTMLImageElement);
        /** @property {HTMLImageElement} - image source */
        image: HTMLImageElement;
        /** @property {Vector2} - size of the image */
        size: Vector2;
        /** @property {Vector2} - inverse of the size, cached for rendering */
        sizeInverse: Vector2;
        /** @property {WebGLTexture} - webgl texture */
        glTexture: WebGLTexture;
    }
    /**
     * LittleJS Drawing System
     * - Hybrid system with both Canvas2D and WebGL available
     * - Super fast tile sheet rendering with WebGL
     * - Can apply rotation, mirror, color and additive color
     * - Font rendering system with built in engine font
     * - Many useful utility functions
     *
     * LittleJS uses a hybrid rendering solution with the best of both Canvas2D and WebGL.
     * There are 3 canvas/contexts available to draw to...
     * mainCanvas - 2D background canvas, non WebGL stuff like tile layers are drawn here.
     * glCanvas - Used by the accelerated WebGL batch rendering system.
     * overlayCanvas - Another 2D canvas that appears on top of the other 2 canvases.
     *
     * The WebGL rendering system is very fast with some caveats...
     * - Switching blend modes (additive) or textures causes another draw call which is expensive in excess
     * - Group additive rendering together using renderOrder to mitigate this issue
     *
     * The LittleJS rendering solution is intentionally simple, feel free to adjust it for your needs!
     * @namespace Draw
     */
    /** The primary 2D canvas visible to the user
     *  @type {HTMLCanvasElement}
     *  @memberof Draw */
    export let mainCanvas: HTMLCanvasElement;
    /** 2d context for mainCanvas
     *  @type {CanvasRenderingContext2D}
     *  @memberof Draw */
    export let mainContext: CanvasRenderingContext2D;
    /** A canvas that appears on top of everything the same size as mainCanvas
     *  @type {HTMLCanvasElement}
     *  @memberof Draw */
    export let overlayCanvas: HTMLCanvasElement;
    /** 2d context for overlayCanvas
     *  @type {CanvasRenderingContext2D}
     *  @memberof Draw */
    export let overlayContext: CanvasRenderingContext2D;
    /** The size of the main canvas (and other secondary canvases)
     *  @type {Vector2}
     *  @memberof Draw */
    export let mainCanvasSize: Vector2;
    /** Convert from screen to world space coordinates
     *  @param {Vector2} screenPos
     *  @return {Vector2}
     *  @memberof Draw */
    export function screenToWorld(screenPos: Vector2): Vector2;
    /** Convert from world to screen space coordinates
     *  @param {Vector2} worldPos
     *  @return {Vector2}
     *  @memberof Draw */
    export function worldToScreen(worldPos: Vector2): Vector2;
    /** Draw textured tile centered in world space, with color applied if using WebGL
     *  @param {Vector2} pos                        - Center of the tile in world space
     *  @param {Vector2} [size=(1,1)]               - Size of the tile in world space
     *  @param {TileInfo}[tileInfo]                 - Tile info to use, untextured if undefined
     *  @param {Color}   [color=(1,1,1,1)]          - Color to modulate with
     *  @param {number}  [angle]                    - Angle to rotate by
     *  @param {boolean} [mirror]                   - If true image is flipped along the Y axis
     *  @param {Color}   [additiveColor]            - Additive color to be applied if any
     *  @param {boolean} [useWebGL=glEnable]        - Use accelerated WebGL rendering
     *  @param {boolean} [screenSpace=false]        - If true the pos and size are in screen space
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
     *  @memberof Draw */
    export function drawTile(pos: Vector2, size?: Vector2, tileInfo?: TileInfo, color?: Color, angle?: number, mirror?: boolean, additiveColor?: Color, useWebGL?: boolean, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw colored rect centered on pos
     *  @param {Vector2} pos
     *  @param {Vector2} [size=(1,1)]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [angle]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
     *  @memberof Draw */
    export function drawRect(pos: Vector2, size?: Vector2, color?: Color, angle?: number, useWebGL?: boolean, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw colored line between two points
     *  @param {Vector2} posA
     *  @param {Vector2} posB
     *  @param {number}  [thickness]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
     *  @memberof Draw */
    export function drawLine(posA: Vector2, posB: Vector2, thickness?: number, color?: Color, useWebGL?: boolean, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw colored polygon using passed in points
     *  @param {Array<Vector2>}   points - Array of Vector2 points
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth=0]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     *  @memberof Draw */
    export function drawPoly(points: Array<Vector2>, color?: Color, lineWidth?: number, lineColor?: Color, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw colored ellipse using passed in point
     *  @param {Vector2} pos
     *  @param {number}  [width=1]
     *  @param {number}  [height=1]
     *  @param {number}  [angle=0]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth=0]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     *  @memberof Draw */
    export function drawEllipse(pos: Vector2, width?: number, height?: number, angle?: number, color?: Color, lineWidth?: number, lineColor?: Color, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw colored circle using passed in point
     *  @param {Vector2} pos
     *  @param {number}  [radius=1]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth=0]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     *  @memberof Draw */
    export function drawCircle(pos: Vector2, radius?: number, color?: Color, lineWidth?: number, lineColor?: Color, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw directly to a 2d canvas context in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {number}   angle
     *  @param {boolean}  mirror
     *  @param {Function} drawFunction
     *  @param {boolean} [screenSpace=false]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     *  @memberof Draw */
    export function drawCanvas2D(pos: Vector2, size: Vector2, angle: number, mirror: boolean, drawFunction: Function, screenSpace?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw text on main canvas in world space
     *  Automatically splits new lines into rows
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [size]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {CanvasTextAlign}  [textAlign='center']
     *  @param {string}  [font=fontDefault]
     *  @param {number}  [maxWidth]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     *  @memberof Draw */
    export function drawText(text: string, pos: Vector2, size?: number, color?: Color, lineWidth?: number, lineColor?: Color, textAlign?: CanvasTextAlign, font?: string, maxWidth?: number, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Draw text on overlay canvas in world space
     *  Automatically splits new lines into rows
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [size]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {CanvasTextAlign}  [textAlign='center']
     *  @param {string}  [font=fontDefault]
     *  @param {number}  [maxWidth]
     *  @memberof Draw */
    export function drawTextOverlay(text: string, pos: Vector2, size?: number, color?: Color, lineWidth?: number, lineColor?: Color, textAlign?: CanvasTextAlign, font?: string, maxWidth?: number): void;
    /** Draw text on overlay canvas in screen space
     *  Automatically splits new lines into rows
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [size]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [lineWidth]
     *  @param {Color}   [lineColor=(0,0,0,1)]
     *  @param {CanvasTextAlign}  [textAlign]
     *  @param {string}  [font=fontDefault]
     *  @param {number}  [maxWidth]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
     *  @memberof Draw */
    export function drawTextScreen(text: string, pos: Vector2, size?: number, color?: Color, lineWidth?: number, lineColor?: Color, textAlign?: CanvasTextAlign, font?: string, maxWidth?: number, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Enable normal or additive blend mode
     *  @param {boolean} [additive]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
     *  @memberof Draw */
    export function setBlendMode(additive?: boolean, useWebGL?: boolean, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /** Combines all LittleJS canvases onto the main canvas and clears them
     *  This is necessary for things like saving a screenshot
     *  @memberof Draw */
    export function combineCanvases(): void;
    export let engineFontImage: any;
    /**
     * Font Image Object - Draw text on a 2D canvas by using characters in an image
     * - 96 characters (from space to tilde) are stored in an image
     * - Uses a default 8x8 font if none is supplied
     * - You can also use fonts from the main tile sheet
     * @example
     * // use built in font
     * const font = new FontImage;
     *
     * // draw text
     * font.drawTextScreen("LittleJS\nHello World!", vec2(200, 50));
     */
    export class FontImage {
        /** Create an image font
         *  @param {HTMLImageElement} [image]    - Image for the font, if undefined default font is used
         *  @param {Vector2} [tileSize=(8,8)]    - Size of the font source tiles
         *  @param {Vector2} [paddingSize=(0,1)] - How much extra space to add between characters
         *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext] - context to draw to
         */
        constructor(image?: HTMLImageElement, tileSize?: Vector2, paddingSize?: Vector2, context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D);
        image: any;
        tileSize: Vector2;
        paddingSize: Vector2;
        context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        /** Draw text in world space using the image font
         *  @param {string}  text
         *  @param {Vector2} pos
         *  @param {number}  [scale=.25]
         *  @param {boolean} [center]
         */
        drawText(text: string, pos: Vector2, scale?: number, center?: boolean): void;
        /** Draw text in screen space using the image font
         *  @param {string}  text
         *  @param {Vector2} pos
         *  @param {number}  [scale]
         *  @param {boolean} [center]
         */
        drawTextScreen(text: string, pos: Vector2, scale?: number, center?: boolean): void;
    }
    /** Returns true if fullscreen mode is active
     *  @return {boolean}
     *  @memberof Draw */
    export function isFullscreen(): boolean;
    /** Toggle fullscreen mode
     *  @memberof Draw */
    export function toggleFullscreen(): void;
    /** Set the cursor style
     *  @param {string}  cursorStyle - CSS cursor style (auto, none, crosshair, etc)
     *  @memberof Draw */
    export function setCursor(cursorStyle?: string): void;
    /** Get the camera's visible area in world space
     *  @return {Vector2}
     *  @memberof Draw */
    export function getCameraSize(): Vector2;
    /**
     * LittleJS WebGL Interface
     * - All webgl used by the engine is wrapped up here
     * - For normal stuff you won't need to see or call anything in this file
     * - For advanced stuff there are helper functions to create shaders, textures, etc
     * - Can be disabled with glEnable to revert to 2D canvas rendering
     * - Batches sprite rendering on GPU for incredibly fast performance
     * - Sprite transform math is done in the shader where possible
     * - Supports shadertoy style post processing shaders
     * @namespace WebGL
     */
    /** The WebGL canvas which appears above the main canvas and below the overlay canvas
     *  @type {HTMLCanvasElement}
     *  @memberof WebGL */
    export let glCanvas: HTMLCanvasElement;
    /** 2d context for glCanvas
     *  @type {WebGL2RenderingContext}
     *  @memberof WebGL */
    export let glContext: WebGL2RenderingContext;
    /** Compile WebGL shader of the given type, will throw errors if in debug mode
     *  @param {String} source
     *  @param {Number} type
     *  @return {WebGLShader}
     *  @memberof WebGL */
    export function glCompileShader(source: string, type: number): WebGLShader;
    /** Draw any sprites still in the buffer and copy to main canvas
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
     *  @param {boolean} [forceDraw]
     *  @memberof WebGL */
    export function glCopyToContext(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, forceDraw?: boolean): void;
    /** Create WebGL program with given shaders
     *  @param {String} vsSource
     *  @param {String} fsSource
     *  @return {WebGLProgram}
     *  @memberof WebGL */
    export function glCreateProgram(vsSource: string, fsSource: string): WebGLProgram;
    /** Create WebGL texture from an image and init the texture settings
     *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} [image]
     *  @return {WebGLTexture}
     *  @memberof WebGL */
    export function glCreateTexture(image?: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas): WebGLTexture;
    /** Set WebGL texture data from an image
     *  @param {WebGLTexture} texture
     *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} image
     *  @memberof WebGL */
    export function glSetTextureData(texture: WebGLTexture, image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas): void;
    /** Add a sprite to the gl draw list, used by all gl draw functions
     *  @param {Number} x
     *  @param {Number} y
     *  @param {Number} sizeX
     *  @param {Number} sizeY
     *  @param {Number} [angle]
     *  @param {Number} [uv0X]
     *  @param {Number} [uv0Y]
     *  @param {Number} [uv1X]
     *  @param {Number} [uv1Y]
     *  @param {Number} [rgba=-1] - white is -1
     *  @param {Number} [rgbaAdditive=0] - black is 0
     *  @memberof WebGL */
    export function glDraw(x: number, y: number, sizeX: number, sizeY: number, angle?: number, uv0X?: number, uv0Y?: number, uv1X?: number, uv1Y?: number, rgba?: number, rgbaAdditive?: number): void;
    /** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
     *  @memberof WebGL */
    export function glFlush(): void;
    /** Set the WebGl texture, called automatically if using multiple textures
     *  - This may also flush the gl buffer resulting in more draw calls and worse performance
     *  @param {WebGLTexture} texture
     *  @memberof WebGL */
    export function glSetTexture(texture: WebGLTexture): void;
    /** Set anti-aliasing for webgl canvas
     *  @param {boolean} [antialias]
     *  @memberof WebGL */
    export function glSetAntialias(antialias?: boolean): void;
    /** Clear the canvas and setup the viewport
     *  @memberof WebGL */
    export function glClearCanvas(): void;
    /** Should webgl be setup with anti-aliasing? must be set before calling engineInit
     *  @type {boolean}
     *  @memberof WebGL */
    export let glAntialias: boolean;
    export let glShader: any;
    export let glActiveTexture: any;
    export let glArrayBuffer: any;
    export let glGeometryBuffer: any;
    export let glPositionData: any;
    export let glColorData: any;
    export let glInstanceCount: any;
    export let glAdditive: any;
    export let glBatchAdditive: any;
    /**
     * LittleJS Input System
     * - Tracks keyboard down, pressed, and released
     * - Tracks mouse buttons, position, and wheel
     * - Tracks multiple analog gamepads
     * - Touch input is handled as mouse input
     * - Virtual gamepad for touch devices
     * @namespace Input
     */
    /** Returns true if device key is down
     *  @param {string|number} key
     *  @param {number} [device]
     *  @return {boolean}
     *  @memberof Input */
    export function keyIsDown(key: string | number, device?: number): boolean;
    /** Returns true if device key was pressed this frame
     *  @param {string|number} key
     *  @param {number} [device]
     *  @return {boolean}
     *  @memberof Input */
    export function keyWasPressed(key: string | number, device?: number): boolean;
    /** Returns true if device key was released this frame
     *  @param {string|number} key
     *  @param {number} [device]
     *  @return {boolean}
     *  @memberof Input */
    export function keyWasReleased(key: string | number, device?: number): boolean;
    /** Returns input vector from arrow keys or WASD if enabled
     *  @return {Vector2}
     *  @memberof Input */
    export function keyDirection(up?: string, down?: string, left?: string, right?: string): Vector2;
    /** Clears all input
     *  @memberof Input */
    export function clearInput(): void;
    /** Returns true if mouse button is down
     *  @function
     *  @param {number} button
     *  @return {boolean}
     *  @memberof Input */
    export function mouseIsDown(button: number): boolean;
    /** Returns true if mouse button was pressed
     *  @function
     *  @param {number} button
     *  @return {boolean}
     *  @memberof Input */
    export function mouseWasPressed(button: number): boolean;
    /** Returns true if mouse button was released
     *  @function
     *  @param {number} button
     *  @return {boolean}
     *  @memberof Input */
    export function mouseWasReleased(button: number): boolean;
    /** Mouse pos in world space
     *  @type {Vector2}
     *  @memberof Input */
    export let mousePos: Vector2;
    /** Mouse pos in screen space
     *  @type {Vector2}
     *  @memberof Input */
    export let mousePosScreen: Vector2;
    /** Mouse wheel delta this frame
     *  @type {number}
     *  @memberof Input */
    export let mouseWheel: number;
    /** Returns true if user is using gamepad (has more recently pressed a gamepad button)
     *  @type {boolean}
     *  @memberof Input */
    export let isUsingGamepad: boolean;
    /** Prevents input continuing to the default browser handling (true by default)
     *  @type {boolean}
     *  @memberof Input */
    export let inputPreventDefault: boolean;
    /** Prevents input continuing to the default browser handling
     *  This is useful to disable for html menus so the browser can handle input normally
     *  @param {boolean} preventDefault
     *  @memberof Input */
    export function setInputPreventDefault(preventDefault: boolean): void;
    /** Returns true if gamepad button is down
     *  @param {number} button
     *  @param {number} [gamepad]
     *  @return {boolean}
     *  @memberof Input */
    export function gamepadIsDown(button: number, gamepad?: number): boolean;
    /** Returns true if gamepad button was pressed
     *  @param {number} button
     *  @param {number} [gamepad]
     *  @return {boolean}
     *  @memberof Input */
    export function gamepadWasPressed(button: number, gamepad?: number): boolean;
    /** Returns true if gamepad button was released
     *  @param {number} button
     *  @param {number} [gamepad]
     *  @return {boolean}
     *  @memberof Input */
    export function gamepadWasReleased(button: number, gamepad?: number): boolean;
    /** Returns gamepad stick value
     *  @param {number} stick
     *  @param {number} [gamepad]
     *  @return {Vector2}
     *  @memberof Input */
    export function gamepadStick(stick: number, gamepad?: number): Vector2;
    export function gamepadsUpdate(): void;
    /** Pulse the vibration hardware if it exists
     *  @param {number|Array} [pattern] - single value in ms or vibration interval array
     *  @memberof Input */
    export function vibrate(pattern?: number | any[]): void;
    /** Cancel any ongoing vibration
     *  @memberof Input */
    export function vibrateStop(): void;
    /** True if a touch device has been detected
     *  @memberof Input */
    export const isTouchDevice: boolean;
    /**
     * Sound Object - Stores a sound for later use and can be played positionally
     *
     * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
     * @example
     * // create a sound
     * const sound_example = new Sound([.5,.5]);
     *
     * // play the sound
     * sound_example.play();
     */
    export class Sound {
        /** Create a sound object and cache the zzfx samples for later use
         *  @param {Array}  zzfxSound - Array of zzfx parameters, ex. [.5,.5]
         *  @param {number} [range=soundDefaultRange] - World space max range of sound
         *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
         */
        constructor(zzfxSound: any[], range?: number, taper?: number);
        /** @property {number} - World space max range of sound */
        range: number;
        /** @property {number} - At what percentage of range should it start tapering */
        taper: number;
        /** @property {number} - How much to randomize frequency each time sound plays */
        randomness: any;
        sampleChannels: any[][];
        sampleRate: number;
        /** Play the sound
         *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
         *  @param {number}  [volume] - How much to scale volume by (in addition to range fade)
         *  @param {number}  [pitch] - How much to scale pitch by (also adjusted by this.randomness)
         *  @param {number}  [randomnessScale] - How much to scale randomness
         *  @param {boolean} [loop] - Should the sound loop
         *  @return {AudioBufferSourceNode} - The audio source node
         */
        play(pos?: Vector2, volume?: number, pitch?: number, randomnessScale?: number, loop?: boolean): AudioBufferSourceNode;
        gainNode: GainNode;
        source: AudioBufferSourceNode;
        /** Set the sound volume of the most recently played instance of this sound
         *  @param {number}  [volume] - How much to scale volume by
         */
        setVolume(volume?: number): void;
        /** Stop the last instance of this sound that was played */
        stop(): void;
        /** Get source of most recent instance of this sound that was played
         *  @return {AudioBufferSourceNode}
         */
        getSource(): AudioBufferSourceNode;
        /** Play the sound as a note with a semitone offset
         *  @param {number}  semitoneOffset - How many semitones to offset pitch
         *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
         *  @param {number}  [volume=1] - How much to scale volume by (in addition to range fade)
         *  @return {AudioBufferSourceNode} - The audio source node
         */
        playNote(semitoneOffset: number, pos?: Vector2, volume?: number): AudioBufferSourceNode;
        /** Get how long this sound is in seconds
         *  @return {number} - How long the sound is in seconds (undefined if loading)
         */
        getDuration(): number;
        /** Check if sound is loading, for sounds fetched from a url
         *  @return {boolean} - True if sound is loading and not ready to play
         */
        isLoading(): boolean;
    }
    /**
     * Sound Wave Object - Stores a wave sound for later use and can be played positionally
     * - this can be used to play wave, mp3, and ogg files
     * @example
     * // create a sound
     * const sound_example = new SoundWave('sound.mp3');
     *
     * // play the sound
     * sound_example.play();
     */
    export class SoundWave extends Sound {
        /** Create a sound object and cache the wave file for later use
         *  @param {string} filename - Filename of audio file to load
         *  @param {number} [randomness] - How much to randomize frequency each time sound plays
         *  @param {number} [range=soundDefaultRange] - World space max range of sound
         *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
         *  @param {Function} [onloadCallback] - callback function to call when sound is loaded
         */
        constructor(filename: string, randomness?: number, range?: number, taper?: number, onloadCallback?: Function);
        /** @property {Function} - callback function to call when sound is loaded */
        onloadCallback: Function;
        /** Loads a sound from a URL and decodes it into sample data. Must be used with await!
        *  @param {string} filename
        *  @return {Promise<void>} */
        loadSound(filename: string): Promise<void>;
    }
    /** Play an mp3, ogg, or wav audio from a local file or url
     *  @param {string}  filename - Location of sound file to play
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {boolean} [loop] - True if the music should loop
     *  @return {SoundWave} - The sound object for this file
     *  @memberof Audio */
    export function playAudioFile(filename: string, volume?: number, loop?: boolean): SoundWave;
    /** Speak text with passed in settings
     *  @param {string} text - The text to speak
     *  @param {string} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
     *  @param {number} [volume] - How much to scale volume by
     *  @param {number} [rate] - How quickly to speak
     *  @param {number} [pitch] - How much to change the pitch by
     *  @return {SpeechSynthesisUtterance} - The utterance that was spoken
     *  @memberof Audio */
    export function speak(text: string, language?: string, volume?: number, rate?: number, pitch?: number): SpeechSynthesisUtterance;
    /** Stop all queued speech
     *  @memberof Audio */
    export function speakStop(): void;
    /** Get frequency of a note on a musical scale
     *  @param {number} semitoneOffset - How many semitones away from the root note
     *  @param {number} [rootFrequency=220] - Frequency at semitone offset 0
     *  @return {number} - The frequency of the note
     *  @memberof Audio */
    export function getNoteFrequency(semitoneOffset: number, rootFrequency?: number): number;
    /** Play cached audio samples with given settings
     *  @param {Array}    sampleChannels - Array of arrays of samples to play (for stereo playback)
     *  @param {number}   [volume] - How much to scale volume by
     *  @param {number}   [rate] - The playback rate to use
     *  @param {number}   [pan] - How much to apply stereo panning
     *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
     *  @param {number}   [sampleRate=44100] - Sample rate for the sound
     *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing
     *  @return {AudioBufferSourceNode} - The audio node of the sound played
     *  @memberof Audio */
    export function playSamples(sampleChannels: any[], volume?: number, rate?: number, pan?: number, loop?: boolean, sampleRate?: number, gainNode?: GainNode): AudioBufferSourceNode;
    /** Generate and play a ZzFX sound
     *
     *  <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
     *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
     *  @return {AudioBufferSourceNode} - The audio node of the sound played
     *  @memberof Audio */
    export function zzfx(...zzfxSound: any[]): AudioBufferSourceNode;
    /** Generate samples for a ZzFX sound
     *  @param {number}  [volume] - Volume scale (percent)
     *  @param {number}  [randomness] - How much to randomize frequency (percent Hz)
     *  @param {number}  [frequency] - Frequency of sound (Hz)
     *  @param {number}  [attack] - Attack time, how fast sound starts (seconds)
     *  @param {number}  [sustain] - Sustain time, how long sound holds (seconds)
     *  @param {number}  [release] - Release time, how fast sound fades out (seconds)
     *  @param {number}  [shape] - Shape of the sound wave
     *  @param {number}  [shapeCurve] - Squareness of wave (0=square, 1=normal, 2=pointy)
     *  @param {number}  [slide] - How much to slide frequency (kHz/s)
     *  @param {number}  [deltaSlide] - How much to change slide (kHz/s/s)
     *  @param {number}  [pitchJump] - Frequency of pitch jump (Hz)
     *  @param {number}  [pitchJumpTime] - Time of pitch jump (seconds)
     *  @param {number}  [repeatTime] - Resets some parameters periodically (seconds)
     *  @param {number}  [noise] - How much random noise to add (percent)
     *  @param {number}  [modulation] - Frequency of modulation wave, negative flips phase (Hz)
     *  @param {number}  [bitCrush] - Resamples at a lower frequency in (samples*100)
     *  @param {number}  [delay] - Overlap sound with itself for reverb and flanger effects (seconds)
     *  @param {number}  [sustainVolume] - Volume level for sustain (percent)
     *  @param {number}  [decay] - Decay time, how long to reach sustain after attack (seconds)
     *  @param {number}  [tremolo] - Trembling effect, rate controlled by repeat time (percent)
     *  @param {number}  [filter] - Filter cutoff frequency, positive for HPF, negative for LPF (Hz)
     *  @return {Array} - Array of audio samples
     *  @memberof Audio
     */
    export function zzfxG(volume?: number, randomness?: number, frequency?: number, attack?: number, sustain?: number, release?: number, shape?: number, shapeCurve?: number, slide?: number, deltaSlide?: number, pitchJump?: number, pitchJumpTime?: number, repeatTime?: number, noise?: number, modulation?: number, bitCrush?: number, delay?: number, sustainVolume?: number, decay?: number, tremolo?: number, filter?: number): any[];
    /** Sample rate used for all ZzFX sounds
     *  @default 44100
     *  @memberof Audio */
    export const zzfxR: 44100;
    /**
     * LittleJS Audio System
     * - <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX Sound Effects</a> - ZzFX Sound Effect Generator
     * - <a href=https://keithclark.github.io/ZzFXM/>ZzFXM Music</a> - ZzFXM Music System
     * - Caches sounds and music for fast playback
     * - Can attenuate and apply stereo panning to sounds
     * - Ability to play mp3, ogg, and wave files
     * - Speech synthesis functions
     * @namespace Audio
     */
    /** Audio context used by the engine
     *  @type {AudioContext}
     *  @memberof Audio */
    export let audioContext: AudioContext;
    /**
     * LittleJS Object System
     */
    /**
     * LittleJS Object Base Object Class
     * - Top level object class used by the engine
     * - Automatically adds self to object list
     * - Will be updated and rendered each frame
     * - Renders as a sprite from a tilesheet by default
     * - Can have color and additive color applied
     * - 2D Physics and collision system
     * - Sorted by renderOrder
     * - Objects can have children attached
     * - Parents are updated before children, and set child transform
     * - Call destroy() to get rid of objects
     *
     * The physics system used by objects is simple and fast with some caveats...
     * - Collision uses the axis aligned size, the object's rotation angle is only for rendering
     * - Objects are guaranteed to not intersect tile collision from physics
     * - If an object starts or is moved inside tile collision, it will not collide with that tile
     * - Collision for objects can be set to be solid to block other objects
     * - Objects may get pushed into overlapping other solid objects, if so they will push away
     * - Solid objects are more performance intensive and should be used sparingly
     * @example
     * // create an engine object, normally you would first extend the class with your own
     * const pos = vec2(2,3);
     * const object = new EngineObject(pos);
     */
    export class EngineObject {
        /** Create an engine object and adds it to the list of objects
         *  @param {Vector2}  [pos=(0,0)]       - World space position of the object
         *  @param {Vector2}  [size=(1,1)]      - World space size of the object
         *  @param {TileInfo} [tileInfo]        - Tile info to render object (undefined is untextured)
         *  @param {number}   [angle]           - Angle the object is rotated by
         *  @param {Color}    [color=(1,1,1,1)] - Color to apply to tile when rendered
         *  @param {number}   [renderOrder]     - Objects sorted by renderOrder before being rendered
         */
        constructor(pos?: Vector2, size?: Vector2, tileInfo?: TileInfo, angle?: number, color?: Color, renderOrder?: number);
        /** @property {Vector2} - World space position of the object */
        pos: Vector2;
        /** @property {Vector2} - World space width and height of the object */
        size: Vector2;
        /** @property {Vector2} - Size of object used for drawing, uses size if not set */
        drawSize: any;
        /** @property {TileInfo} - Tile info to render object (undefined is untextured) */
        tileInfo: TileInfo;
        /** @property {number} - Angle to rotate the object */
        angle: number;
        /** @property {Color} - Color to apply when rendered */
        color: Color;
        /** @property {Color} - Additive color to apply when rendered */
        additiveColor: any;
        /** @property {boolean} - Should it flip along y axis when rendered */
        mirror: boolean;
        /** @property {number} [mass=objectDefaultMass] - How heavy the object is, static if 0 */
        mass: number;
        /** @property {number} [damping=objectDefaultDamping] - How much to slow down velocity each frame (0-1) */
        damping: number;
        /** @property {number} [angleDamping=objectDefaultAngleDamping] - How much to slow down rotation each frame (0-1) */
        angleDamping: number;
        /** @property {number} [restitution=objectDefaultRestitution] - How bouncy the object is when colliding (0-1) */
        restitution: number;
        /** @property {number} [friction=objectDefaultFriction] - How much friction to apply when sliding (0-1) */
        friction: number;
        /** @property {number} - How much to scale gravity by for this object */
        gravityScale: number;
        /** @property {number} - Objects are sorted by render order */
        renderOrder: number;
        /** @property {Vector2} - Velocity of the object */
        velocity: Vector2;
        /** @property {number} - Angular velocity of the object */
        angleVelocity: number;
        /** @property {number} - Track when object was created  */
        spawnTime: number;
        /** @property {Array<EngineObject>} - List of children of this object */
        children: any[];
        /** @property {boolean} - Limit object speed along x and y axis */
        clampSpeed: boolean;
        /** @property {EngineObject} - Object we are standing on, if any  */
        groundObject: EngineObject | TileCollisionLayer;
        /** @property {EngineObject} - Parent of object if in local space  */
        parent: any;
        /** @property {Vector2} - Local position if child */
        localPos: Vector2;
        /** @property {number} - Local angle if child  */
        localAngle: number;
        /** @property {boolean} - Object collides with the tile collision */
        collideTiles: boolean;
        /** @property {boolean} - Object collides with solid objects */
        collideSolidObjects: boolean;
        /** @property {boolean} - Object collides with and blocks other objects */
        isSolid: boolean;
        /** @property {boolean} - Object collides with raycasts */
        collideRaycast: boolean;
        /** Update the object transform, called automatically by engine even when paused */
        updateTransforms(): void;
        /** Update the object physics, called automatically by engine once each frame */
        update(): void;
        /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
        render(): void;
        /** Destroy this object, destroy its children, detach it's parent, and mark it for removal */
        destroy(): void;
        destroyed: number;
        /** Convert from local space to world space
         *  @param {Vector2} pos - local space point */
        localToWorld(pos: Vector2): Vector2;
        /** Convert from world space to local space
         *  @param {Vector2} pos - world space point */
        worldToLocal(pos: Vector2): Vector2;
        /** Convert from local space to world space for a vector (rotation only)
         *  @param {Vector2} vec - local space vector */
        localToWorldVector(vec: Vector2): Vector2;
        /** Convert from world space to local space for a vector (rotation only)
         *  @param {Vector2} vec - world space vector */
        worldToLocalVector(vec: Vector2): Vector2;
        /** Called to check if a tile collision should be resolved
         *  @param {number}  tileData - the value of the tile at the position
         *  @param {Vector2} pos      - tile where the collision occurred
         *  @return {boolean}         - true if the collision should be resolved */
        collideWithTile(tileData: number, pos: Vector2): boolean;
        /** Called to check if a object collision should be resolved
         *  @param {EngineObject} object - the object to test against
         *  @return {boolean}            - true if the collision should be resolved
         */
        collideWithObject(object: EngineObject): boolean;
        /** How long since the object was created
         *  @return {number} */
        getAliveTime(): number;
        /** Apply acceleration to this object (adjust velocity, not affected by mass)
         *  @param {Vector2} acceleration */
        applyAcceleration(acceleration: Vector2): void;
        /** Apply force to this object (adjust velocity, affected by mass)
         *  @param {Vector2} force */
        applyForce(force: Vector2): void;
        /** Get the direction of the mirror
         *  @return {number} -1 if this.mirror is true, or 1 if not mirrored */
        getMirrorSign(): number;
        /** Attaches a child to this with a given local transform
         *  @param {EngineObject} child
         *  @param {Vector2}      [localPos=(0,0)]
         *  @param {number}       [localAngle] */
        addChild(child: EngineObject, localPos?: Vector2, localAngle?: number): void;
        /** Removes a child from this one
         *  @param {EngineObject} child */
        removeChild(child: EngineObject): void;
        /** Set how this object collides
         *  @param {boolean} [collideSolidObjects] - Does it collide with solid objects?
         *  @param {boolean} [isSolid]             - Does it collide with and block other objects? (expensive in large numbers)
         *  @param {boolean} [collideTiles]        - Does it collide with the tile collision?
         *  @param {boolean} [collideRaycast]      - Does it collide with raycasts? */
        setCollision(collideSolidObjects?: boolean, isSolid?: boolean, collideTiles?: boolean, collideRaycast?: boolean): void;
        /** Returns string containing info about this object for debugging
         *  @return {string} */
        toString(): string;
        /** Render debug info for this object  */
        renderDebugInfo(): void;
    }
    /**
     * LittleJS Tile Layer System
     * - Caches arrays of tiles to off screen canvas for fast rendering
     * - Unlimited numbers of layers, allocates canvases as needed
     * - Tile layers can be drawn to using their context with canvas2d
     * - Drawn directly to the main canvas without using WebGL
     * - Tile layers can also have collision with EngineObjects
     * @namespace TileCollision
     */
    /** Keep track of all tile layers with collision
     *  @type {Array<TileCollisionLayer>}
     *  @memberof TileCollision */
    export let tileCollisionLayers: Array<TileCollisionLayer>;
    /** Get tile collision data for a given cell in the grid
    *  @param {Vector2} pos
    *  @return {number}
    *  @memberof TileCollision */
    export function tileCollisionGetData(pos: Vector2): number;
    /** Check if a tile layer collides with another object
     *  @param {Vector2}      pos
     *  @param {Vector2}      [size=(0,0)]
     *  @param {EngineObject} [object] - An object or undefined for generic test
     *  @param {boolean}      [solidOnly] - Only check solid layers if true
     *  @return {TileCollisionLayer}
     *  @memberof TileCollision */
    export function tileCollisionTest(pos: Vector2, size?: Vector2, object?: EngineObject, solidOnly?: boolean): TileCollisionLayer;
    /** Return the center of first tile hit, undefined if nothing was hit.
     *  This does not return the exact intersection, but the center of the tile hit.
     *  @param {Vector2}      posStart
     *  @param {Vector2}      posEnd
     *  @param {EngineObject} [object] - An object or undefined for generic test
     *  @param {boolean}      [solidOnly=true] - Only check solid layers if true
     *  @return {Vector2}
     *  @memberof TileCollision */
    export function tileCollisionRaycast(posStart: Vector2, posEnd: Vector2, object?: EngineObject, solidOnly?: boolean): Vector2;
    /**
     * Load tile layers from exported data
     *  @param {object}   tileMapData - Level data from exported data
     *  @param {TileInfo} [tileInfo] - Default tile info (used for size and texture)
     *  @param {number}   [renderOrder] - Render order of the top layer
     *  @param {boolean}  [draw] - Should the layer be drawn automatically
     *  @return {Array<TileCollisionLayer>}
     *  @memberof TileCollision */
    export function tileCollisionLoad(tileMapData: object, tileInfo?: TileInfo, renderOrder?: number, draw?: boolean): Array<TileCollisionLayer>;
    /**
     * Tile layer data object stores info about how to draw a tile
     * @example
     * // create tile layer data with tile index 0 and random orientation and color
     * const tileIndex = 0;
     * const direction = randInt(4)
     * const mirror = randInt(2);
     * const color = randColor();
     * const data = new TileLayerData(tileIndex, direction, mirror, color);
     */
    export class TileLayerData {
        /** Create a tile layer data object, one for each tile in a TileLayer
         *  @param {number}  [tile]      - The tile to use, untextured if undefined
         *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
         *  @param {boolean} [mirror]    - If the tile should be mirrored along the x axis
         *  @param {Color}   [color]     - Color of the tile */
        constructor(tile?: number, direction?: number, mirror?: boolean, color?: Color);
        /** @property {number}  - The tile to use, untextured if undefined */
        tile: number;
        /** @property {number}  - Integer direction of tile, in 90 degree increments */
        direction: number;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        mirror: boolean;
        /** @property {Color}   - Color of the tile */
        color: Color;
        /** Set this tile to clear, it will not be rendered */
        clear(): void;
    }
    /**
     * Tile Layer - cached rendering system for tile layers
     * - Each Tile layer is rendered to an off screen canvas
     * - To allow dynamic modifications, layers are rendered using canvas 2d
     * - Some devices like mobile phones are limited to 4k texture resolution
     * - For with 16x16 tiles this limits layers to 256x256 on mobile devices
     * @extends EngineObject
     * @example
     * const tileLayer = new TileLayer(vec2(), vec2(200,100));
     */
    export class TileLayer extends EngineObject {
        /** Create a tile layer object
        *  @param {Vector2}  [position=(0,0)] - World space position
        *  @param {Vector2}  [size=(1,1)]     - World space size
        *  @param {TileInfo} [tileInfo]       - Default tile info for layer (used for size and texture)
        *  @param {Vector2}  [scale=(1,1)]    - How much to scale this layer when rendered
        *  @param {number}   [renderOrder]    - Objects are sorted by renderOrder
        */
        constructor(position?: Vector2, size?: Vector2, tileInfo?: TileInfo, scale?: Vector2, renderOrder?: number);
        /** @property {HTMLCanvasElement} - The canvas used by this tile layer */
        canvas: OffscreenCanvas;
        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this tile layer */
        context: OffscreenCanvasRenderingContext2D;
        /** @property {Vector2} - How much to scale this layer when rendered */
        scale: Vector2;
        /** @property {boolean} - If true this layer will render to overlay canvas and appear above all objects */
        isOverlay: boolean;
        /** @property {WebGLTexture} - Texture if using webgl for this layer */
        glTexture: WebGLTexture;
        data: TileLayerData[];
        /** Draw all the tile data to an offscreen canvas
         *  - This may be slow in some browsers but only needs to be done once */
        redraw(): void;
        /** Call to start the redraw process
         *  - This can be used to manually update small parts of the level
         *  @param {boolean} [clear] - Should it clear the canvas before drawing */
        redrawStart(clear?: boolean): void;
        /** Call to end the redraw process */
        redrawEnd(): void;
        /** Draw the tile at a given position in the tile grid
         *  This can be used to clear out tiles when they are destroyed
         *  Tiles can also be redrawn if inside a redrawStart/End block
         *  @param {Vector2} layerPos
         *  @param {boolean} [clear] - should the old tile be cleared out
         */
        drawTileData(layerPos: Vector2, clear?: boolean): void;
        /** Draw directly to the 2D canvas in world space (bypass webgl)
         *  @param {Vector2}  pos
         *  @param {Vector2}  size
         *  @param {number}   angle
         *  @param {boolean}  mirror
         *  @param {Function} drawFunction */
        drawCanvas2D(pos: Vector2, size: Vector2, angle: number, mirror: boolean, drawFunction: Function): void;
        /** Set data at a given position in the array
         *  @param {Vector2}       layerPos - Local position in array
         *  @param {TileLayerData} data     - Data to set
         *  @param {boolean}       [redraw] - Force the tile to redraw if true */
        setData(layerPos: Vector2, data: TileLayerData, redraw?: boolean): void;
        /** Get data at a given position in the array
         *  @param {Vector2} layerPos - Local position in array
         *  @return {TileLayerData} */
        getData(layerPos: Vector2): TileLayerData;
        /** Draw a tile directly onto the layer canvas in world space
         *  @param {Vector2}  pos
         *  @param {Vector2}  [size=(1,1)]
         *  @param {TileInfo} [tileInfo]
         *  @param {Color}    [color=(1,1,1,1)]
         *  @param {number}   [angle=0]
         *  @param {boolean}  [mirror=0] */
        drawTile(pos: Vector2, size?: Vector2, tileInfo?: TileInfo, color?: Color, angle?: number, mirror?: boolean): void;
        /** Draw a rectangle directly onto the layer canvas in world space
         *  @param {Vector2} pos
         *  @param {Vector2} [size=(1,1)]
         *  @param {Color}   [color=(1,1,1,1)]
         *  @param {number}  [angle=0] */
        drawRect(pos: Vector2, size?: Vector2, color?: Color, angle?: number): void;
        /** Create or update the webgl texture for this layer
         *  @param {boolean} [enable] - enable webgl rendering and update the texture */
        useWebGL(enable?: boolean): void;
    }
    /**
     * Tile Collision Layer - a tile layer with collision
     * - adds collision data and functions to TileLayer
     * - there can be multiple tile collision layers
     * - tile collison layers should not overlap each other
     * @extends TileLayer
     */
    export class TileCollisionLayer extends TileLayer {
        /** Create a tile layer object
        *  @param {Vector2}  [position=(0,0)] - World space position
        *  @param {Vector2}  [size=(0,0)]     - World space size
        *  @param {TileInfo} [tileInfo]       - Tile info for layer
        *  @param {number}   [renderOrder]    - Objects are sorted by renderOrder
        */
        constructor(position?: Vector2, size?: Vector2, tileInfo?: TileInfo, renderOrder?: number);
        /** @property {Array<number>} - The tile collision grid */
        collisionData: any[];
        /** Clear and initialize tile collision to new size
        *  @param {Vector2} size - width and height of tile collision 2d grid */
        initCollision(size: Vector2): void;
        /** Set tile collision data for a given cell in the grid
        *  @param {Vector2} pos
        *  @param {number}  [data] */
        setCollisionData(pos: Vector2, data?: number): void;
        /** Get tile collision data for a given cell in the grid
        *  @param {Vector2} pos
        *  @return {number} */
        getCollisionData(pos: Vector2): number;
        /** Check if collision with another object should occur
        *  @param {Vector2}      pos
        *  @param {Vector2}      [size=(0,0)]
        *  @param {EngineObject} [object]
        *  @return {boolean} */
        collisionTest(pos: Vector2, size?: Vector2, object?: EngineObject): boolean;
        /** Return the center of first tile hit, undefined if nothing was hit.
        *  This does not return the exact intersection, but the center of the tile hit.
        *  @param {Vector2}      posStart
        *  @param {Vector2}      posEnd
        *  @param {EngineObject} [object]
        *  @return {Vector2} */
        collisionRaycast(posStart: Vector2, posEnd: Vector2, object?: EngineObject): Vector2;
    }
    /**
     * LittleJS Particle System
     */
    /**
     * Particle Emitter - Spawns particles with the given settings
     * @extends EngineObject
     * @example
     * // create a particle emitter
     * let pos = vec2(2,3);
     * let particleEmitter = new ParticleEmitter
     * (
     *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emitCone
     *     tile(0, 16),                // tileInfo
     *     rgb(1,1,1),   rgb(0,0,0),   // colorStartA, colorStartB
     *     rgb(1,1,1,0), rgb(0,0,0,0), // colorEndA, colorEndB
     *     2, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
     *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate,
     *     .5, 1                // randomness, collide, additive, randomColorLinear, renderOrder
     * );
     */
    export class ParticleEmitter extends EngineObject {
        /** Create a particle system with the given settings
         *  @param {Vector2} position - World space position of the emitter
         *  @param {Number} [angle] - Angle to emit the particles
         *  @param {Number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
         *  @param {Number} [emitTime] - How long to stay alive (0 is forever)
         *  @param {Number} [emitRate] - How many particles per second to spawn, does not emit if 0
         *  @param {Number} [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
         *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
         *  @param {Color} [colorStartA=(1,1,1,1)] - Color at start of life 1, randomized between start colors
         *  @param {Color} [colorStartB=(1,1,1,1)] - Color at start of life 2, randomized between start colors
         *  @param {Color} [colorEndA=(1,1,1,0)] - Color at end of life 1, randomized between end colors
         *  @param {Color} [colorEndB=(1,1,1,0)] - Color at end of life 2, randomized between end colors
         *  @param {Number} [particleTime]      - How long particles live
         *  @param {Number} [sizeStart]         - How big are particles at start
         *  @param {Number} [sizeEnd]           - How big are particles at end
         *  @param {Number} [speed]             - How fast are particles when spawned
         *  @param {Number} [angleSpeed]        - How fast are particles rotating
         *  @param {Number} [damping]           - How much to dampen particle speed
         *  @param {Number} [angleDamping]      - How much to dampen particle angular speed
         *  @param {Number} [gravityScale]      - How much gravity effect particles
         *  @param {Number} [particleConeAngle] - Cone for start particle angle
         *  @param {Number} [fadeRate]          - How quick to fade particles at start/end in percent of life
         *  @param {Number} [randomness]    - Apply extra randomness percent
         *  @param {boolean} [collideTiles] - Do particles collide against tiles
         *  @param {boolean} [additive]     - Should particles use additive blend
         *  @param {boolean} [randomColorLinear] - Should color be randomized linearly or across each component
         *  @param {Number} [renderOrder] - Render order for particles (additive is above other stuff by default)
         *  @param {boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
         */
        constructor(position: Vector2, angle?: number, emitSize?: number | Vector2, emitTime?: number, emitRate?: number, emitConeAngle?: number, tileInfo?: TileInfo, colorStartA?: Color, colorStartB?: Color, colorEndA?: Color, colorEndB?: Color, particleTime?: number, sizeStart?: number, sizeEnd?: number, speed?: number, angleSpeed?: number, damping?: number, angleDamping?: number, gravityScale?: number, particleConeAngle?: number, fadeRate?: number, randomness?: number, collideTiles?: boolean, additive?: boolean, randomColorLinear?: boolean, renderOrder?: number, localSpace?: boolean);
        /** @property {Number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        emitSize: number | Vector2;
        /** @property {Number} - How long to stay alive (0 is forever) */
        emitTime: number;
        /** @property {Number} - How many particles per second to spawn, does not emit if 0 */
        emitRate: number;
        /** @property {Number} - Local angle to apply velocity to particles from emitter */
        emitConeAngle: number;
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        colorStartA: Color;
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        colorStartB: Color;
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        colorEndA: Color;
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        colorEndB: Color;
        /** @property {boolean} - Should color be randomized linearly or across each component */
        randomColorLinear: boolean;
        /** @property {Number} - How long particles live */
        particleTime: number;
        /** @property {Number} - How big are particles at start */
        sizeStart: number;
        /** @property {Number} - How big are particles at end */
        sizeEnd: number;
        /** @property {Number} - How fast are particles when spawned */
        speed: number;
        /** @property {Number} - How fast are particles rotating */
        angleSpeed: number;
        /** @property {Number} - Cone for start particle angle */
        particleConeAngle: number;
        /** @property {Number} - How quick to fade in particles at start/end in percent of life */
        fadeRate: number;
        /** @property {Number} - Apply extra randomness percent */
        randomness: number;
        /** @property {boolean} - Should particles use additive blend */
        additive: boolean;
        /** @property {boolean} - Should it be in local space of emitter */
        localSpace: boolean;
        /** @property {Number} - If non zero the particle is drawn as a trail, stretched in the direction of velocity */
        trailScale: number;
        /** @property {Function}   - Callback when particle is destroyed */
        particleDestroyCallback: any;
        /** @property {Function}   - Callback when particle is created */
        particleCreateCallback: any;
        /** @property {Number} - Track particle emit time */
        emitTimeBuffer: number;
        /** Spawn one particle
         *  @return {Particle} */
        emitParticle(): Particle;
    }
    /**
     * Particle Object - Created automatically by Particle Emitters
     * @extends EngineObject
     */
    export class Particle extends EngineObject {
        /**
         * Create a particle with the passed in settings
         * Typically this is created automatically by a ParticleEmitter
         * @param {Vector2}  position   - World space position of the particle
         * @param {TileInfo} tileInfo   - Tile info to render particles
         * @param {Number}   angle      - Angle to rotate the particle
         * @param {Color}    colorStart - Color at start of life
         * @param {Color}    colorEnd   - Color at end of life
         * @param {Number}   lifeTime   - How long to live for
         * @param {Number}   sizeStart  - Size at start of life
         * @param {Number}   sizeEnd    - Size at end of life
         * @param {Number}   fadeRate   - How quick to fade in/out
         * @param {boolean}  additive   - Does it use additive blend mode
         * @param {Number}   trailScale - If a trail, how long to make it
         * @param {ParticleEmitter} [localSpaceEmitter] - Parent emitter if local space
         * @param {Function} [destroyCallback] - Callback when particle dies
         */
        constructor(position: Vector2, tileInfo: TileInfo, angle: number, colorStart: Color, colorEnd: Color, lifeTime: number, sizeStart: number, sizeEnd: number, fadeRate: number, additive: boolean, trailScale: number, localSpaceEmitter?: ParticleEmitter, destroyCallback?: Function);
        /** @property {Color} - Color at start of life */
        colorStart: Color;
        /** @property {Color} - Calculated change in color */
        colorEndDelta: Color;
        /** @property {Number} - How long to live for */
        lifeTime: number;
        /** @property {Number} - Size at start of life */
        sizeStart: number;
        /** @property {Number} - Calculated change in size */
        sizeEndDelta: number;
        /** @property {Number} - How quick to fade in/out */
        fadeRate: number;
        /** @property {boolean} - Is it additive */
        additive: boolean;
        /** @property {Number} - If a trail, how long to make it */
        trailScale: number;
        /** @property {ParticleEmitter} - Parent emitter if local space */
        localSpaceEmitter: ParticleEmitter;
        /** @property {Function} - Called when particle dies */
        destroyCallback: Function;
    }
    /**
     * LittleJS Medal System
     * - Tracks and displays medals
     * - Saves medals to local storage
     * - Newgrounds integration
     * @namespace Medals
     */
    /** List of all medals
     *  @type {Object}
     *  @memberof Medals */
    export const medals: any;
    /** Set to stop medals from being unlockable (like if cheats are enabled)
     *  @type {boolean}
     *  @default
     *  @memberof Settings */
    export let medalsPreventUnlock: boolean;
    /** Initialize medals with a save name used for storage
     *  - Call this after creating all medals
     *  - Checks if medals are unlocked
     *  @param {String} saveName
     *  @memberof Medals */
    export function medalsInit(saveName: string): void;
    /**
     * Medal - Tracks an unlockable medal
     * @example
     * // create a medal
     * const medal_example = new Medal(0, 'Example Medal', 'More info about the medal goes here.', '🎖️');
     *
     * // initialize medals
     * medalsInit('Example Game');
     *
     * // unlock the medal
     * medal_example.unlock();
     */
    export class Medal {
        /** Create a medal object and adds it to the list of medals
         *  @param {Number} id            - The unique identifier of the medal
         *  @param {String} name          - Name of the medal
         *  @param {String} [description] - Description of the medal
         *  @param {String} [icon]        - Icon for the medal
         *  @param {String} [src]         - Image location for the medal
         */
        constructor(id: number, name: string, description?: string, icon?: string, src?: string);
        /** @property {Number} - The unique identifier of the medal */
        id: number;
        /** @property {String} - Name of the medal */
        name: string;
        /** @property {String} - Description of the medal */
        description: string;
        /** @property {String} - Icon for the medal */
        icon: string;
        /** @property {boolean} - Is the medal unlocked? */
        unlocked: boolean;
        image: HTMLImageElement;
        /** Unlocks a medal if not already unlocked */
        unlock(): void;
        /** Render a medal
         *  @param {Number} [hidePercent] - How much to slide the medal off screen
         */
        render(hidePercent?: number): void;
        /** Render the icon for a medal
         *  @param {Vector2} pos - Screen space position
         *  @param {Number} size - Screen space size
         */
        renderIcon(pos: Vector2, size: number): void;
        storageKey(): string;
    }
    /**
     * LittleJS Newgrounds API
     * - NewgroundsMedal extends Medal with Newgrounds API functionality
     * - Call new NewgroundsPlugin() to setup Newgrounds
     * - Uses CryptoJS for encryption if optional cipher is provided
     * - Keeps connection alive and logs views
     * - Functions to interact with scoreboards
     * - Functions to unlock medals
     */
    /** Global Newgrounds object
     *  @type {NewgroundsPlugin}
     *  @memberof Medal */
    export let newgrounds: NewgroundsPlugin;
    /**
     * Newgrounds API object
     */
    export class NewgroundsPlugin {
        /** Create the global newgrounds object
         *  @param {string} app_id     - The newgrounds App ID
         *  @param {string} [cipher]   - The encryption Key (AES-128/Base64)
         *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher
         *  @example
         *  // create the newgrounds object, replace the app id with your own
         *  const app_id = 'your_app_id_here';
         *  new NewgroundsPlugin(app_id);
         */
        constructor(app_id: string, cipher?: string, cryptoJS?: any);
        app_id: string;
        cipher: string;
        cryptoJS: any;
        host: string;
        session_id: string;
        medals: any;
        scoreboards: any;
        /** Send message to unlock a medal by id
         * @param {number} id - The medal id */
        unlockMedal(id: number): any;
        /** Send message to post score
         * @param {number} id    - The scoreboard id
         * @param {number} value - The score value */
        postScore(id: number, value: number): any;
        /** Get scores from a scoreboard
         * @param {number} id       - The scoreboard id
         * @param {string} [user]   - A user's id or name
         * @param {number} [social] - If true, only social scores will be loaded
         * @param {number} [skip]   - Number of scores to skip before start
         * @param {number} [limit]  - Number of scores to include in the list
         * @return {Object}         - The response JSON object
         */
        getScores(id: number, user?: string, social?: number, skip?: number, limit?: number): any;
        /** Send message to log a view */
        logView(): any;
        /** Send a message to call a component of the Newgrounds API
         * @param {string}  component    - Name of the component
         * @param {Object}  [parameters] - Parameters to use for call
         * @param {boolean} [async]      - If true, don't wait for response before continuing
         * @return {Object}              - The response JSON object
         */
        call(component: string, parameters?: any, async?: boolean): any;
    }
    /**
     * Newgrounds medal auto unlocks in newgrounds API
     * @extends Medal
     */
    export class NewgroundsMedal extends Medal {
    }
    /**
     * LittleJS Post Processing Plugin
     * - Supports shadertoy style post processing shaders
     * - call new new PostProcessPlugin() to setup post processing
     * - can be enabled to pass other canvases through a final shader
     */
    /** Global Post Process plugin object
     *  @type {PostProcessPlugin} */
    export let postProcess: PostProcessPlugin;
    /**
     * UI System Global Object
     */
    export class PostProcessPlugin {
        /** Create global post processing shader
        *  @param {string} shaderCode
        *  @param {boolean} [includeOverlay]
         *  @example
         *  // create the post process plugin object
         *  new PostProcessPlugin(shaderCode);
         */
        constructor(shaderCode: string, includeOverlay?: boolean);
        /** @property {WebGLProgram} - Shader for post processing */
        shader: WebGLProgram;
        /** @property {WebGLTexture} - Texture for post processing */
        texture: WebGLTexture;
        /** @property {boolean} - Should overlay canvas be included in post processing */
        includeOverlay: boolean;
    }
    /**
     * LittleJS ZzFXM Plugin
     */
    /**
     * Music Object - Stores a zzfx music track for later use
     *
     * <a href=https://keithclark.github.io/ZzFXM/>Create music with the ZzFXM tracker.</a>
     * @example
     * // create some music
     * const music_example = new Music(
     * [
     *     [                         // instruments
     *       [,0,400]                // simple note
     *     ],
     *     [                         // patterns
     *         [                     // pattern 1
     *             [                 // channel 0
     *                 0, -1,        // instrument 0, left speaker
     *                 1, 0, 9, 1    // channel notes
     *             ],
     *             [                 // channel 1
     *                 0, 1,         // instrument 0, right speaker
     *                 0, 12, 17, -1 // channel notes
     *             ]
     *         ],
     *     ],
     *     [0, 0, 0, 0], // sequence, play pattern 0 four times
     *     90            // BPM
     * ]);
     *
     * // play the music
     * music_example.play();
     */
    export class ZzFXMusic extends Sound {
        /** Create a music object and cache the zzfx music samples for later use
         *  @param {[Array, Array, Array, number]} zzfxMusic - Array of zzfx music parameters
         */
        constructor(zzfxMusic: [any[], any[], any[], number]);
        sampleChannels: any[];
        /** Play the music
         *  @param {number}  [volume=1] - How much to scale volume by
         *  @param {boolean} [loop] - True if the music should loop
         *  @return {AudioBufferSourceNode} - The audio source node
         */
        playMusic(volume?: number, loop?: boolean): AudioBufferSourceNode;
    }
    /**
     * LittleJS User Interface Plugin
     * - call new UISystemPlugin() to setup the UI system
     * - Nested Menus
     * - Text
     * - Buttons
     * - Checkboxes
     * - Images
     */
    /** Global UI system plugin object
     *  @type {UISystemPlugin} */
    export let uiSystem: UISystemPlugin;
    /**
     * UI System Global Object
     */
    export class UISystemPlugin {
        /** Create the global UI system object
         *  @param {CanvasRenderingContext2D} [context]
         *  @example
         *  // create the ui plugin object
         *  new UISystemPlugin;
         */
        constructor(context?: CanvasRenderingContext2D);
        /** @property {Color} - Default fill color for UI elements */
        defaultColor: Color;
        /** @property {Color} - Default outline color for UI elements */
        defaultLineColor: Color;
        /** @property {Color} - Default text color for UI elements */
        defaultTextColor: Color;
        /** @property {Color} - Default button color for UI elements */
        defaultButtonColor: Color;
        /** @property {Color} - Default hover color for UI elements */
        defaultHoverColor: Color;
        /** @property {number} - Default line width for UI elements */
        defaultLineWidth: number;
        /** @property {string} - Default font for UI elements */
        defaultFont: string;
        /** @property {Array<UIObject>} - List of all UI elements */
        uiObjects: any[];
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - Context to render UI elements to */
        uiContext: CanvasRenderingContext2D;
        /** Draw a rectangle to the UI context
        *  @param {Vector2} pos
        *  @param {Vector2} size
        *  @param {Color}   [color=uiSystem.defaultColor]
        *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
        *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
        drawRect(pos: Vector2, size: Vector2, color?: Color, lineWidth?: number, lineColor?: Color): void;
        /** Draw a line to the UI context
        *  @param {Vector2} posA
        *  @param {Vector2} posB
        *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
        *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
        drawLine(posA: Vector2, posB: Vector2, lineWidth?: number, lineColor?: Color): void;
        /** Draw a tile to the UI context
        *  @param {Vector2}  pos
        *  @param {Vector2}  size
        *  @param {TileInfo} tileInfo
        *  @param {Color}    [color=uiSystem.defaultColor]
        *  @param {number}   [angle]
        *  @param {boolean}  [mirror] */
        drawTile(pos: Vector2, size: Vector2, tileInfo: TileInfo, color?: Color, angle?: number, mirror?: boolean): void;
        /** Draw text to the UI context
        *  @param {string}  text
        *  @param {Vector2} pos
        *  @param {Vector2} size
        *  @param {Color}   [color=uiSystem.defaultColor]
        *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
        *  @param {Color}   [lineColor=uiSystem.defaultLineColor]
        *  @param {string}  [align]
        *  @param {string}  [font=uiSystem.defaultFont] */
        drawText(text: string, pos: Vector2, size: Vector2, color?: Color, lineWidth?: number, lineColor?: Color, align?: string, font?: string): void;
    }
    /**
     * UI Object - Base level object for all UI elements
     */
    export class UIObject {
        /** Create a UIObject
         *  @param {Vector2}  [pos=(0,0)]
         *  @param {Vector2}  [size=(1,1)]
         */
        constructor(pos?: Vector2, size?: Vector2);
        /** @property {Vector2} - Local position of the object */
        localPos: Vector2;
        /** @property {Vector2} - Screen space position of the object */
        pos: Vector2;
        /** @property {Vector2} - Screen space size of the object */
        size: Vector2;
        /** @property {Color} */
        color: Color;
        /** @property {Color} */
        lineColor: Color;
        /** @property {Color} */
        textColor: Color;
        /** @property {Color} */
        hoverColor: Color;
        /** @property {number} */
        lineWidth: number;
        /** @property {string} */
        font: string;
        /** @property {number} - override for text height */
        textHeight: any;
        /** @property {boolean} */
        visible: boolean;
        /** @property {Array<UIObject>} */
        children: any[];
        /** @property {UIObject} */
        parent: any;
        /** Add a child UIObject to this object
         *  @param {UIObject} child
         */
        addChild(child: UIObject): void;
        /** Remove a child UIObject from this object
         *  @param {UIObject} child
         */
        removeChild(child: UIObject): void;
        /** Update the object, called automatically by plugin once each frame */
        update(): void;
        mouseIsOver: boolean;
        mouseIsHeld: boolean;
        /** Render the object, called automatically by plugin once each frame */
        render(): void;
        /** Called when the mouse enters the object */
        onEnter(): void;
        /** Called when the mouse leaves the object */
        onLeave(): void;
        /** Called when the mouse is pressed while over the object */
        onPress(): void;
        /** Called when the mouse is released while over the object */
        onRelease(): void;
        /** Called when the state of this object changes */
        onChange(): void;
    }
    /**
     * UIText - A UI object that displays text
     * @extends UIObject
     */
    export class UIText extends UIObject {
        /** Create a UIText object
         *  @param {Vector2} [pos]
         *  @param {Vector2} [size]
         *  @param {string}  [text]
         *  @param {string}  [align]
         *  @param {string}  [font=uiSystem.defaultFont]
         */
        constructor(pos?: Vector2, size?: Vector2, text?: string, align?: string, font?: string);
        /** @property {string} */
        text: string;
        /** @property {string} */
        align: string;
    }
    /**
     * UITile - A UI object that displays a tile image
     * @extends UIObject
     */
    export class UITile extends UIObject {
        /** Create a UITile object
         *  @param {Vector2}  [pos]
         *  @param {Vector2}  [size]
         *  @param {TileInfo} [tileInfo]
         *  @param {Color}    [color=WHITE]
         *  @param {number}   [angle]
         *  @param {boolean}  [mirror]
         */
        constructor(pos?: Vector2, size?: Vector2, tileInfo?: TileInfo, color?: Color, angle?: number, mirror?: boolean);
        /** @property {TileInfo} - Tile image to use */
        tileInfo: TileInfo;
        /** @property {number} - Angle to rotate in radians */
        angle: number;
        /** @property {boolean} - Should it be mirrored? */
        mirror: boolean;
    }
    /**
     * UIButton - A UI object that acts as a button
     * @extends UIObject
     */
    export class UIButton extends UIObject {
        /** Create a UIButton object
         *  @param {Vector2} [pos]
         *  @param {Vector2} [size]
         *  @param {string}  [text]
         *  @param {Color}   [color=uiSystem.defaultButtonColor]
         */
        constructor(pos?: Vector2, size?: Vector2, text?: string, color?: Color);
        /** @property {string} */
        text: string;
    }
    /**
     * UICheckbox - A UI object that acts as a checkbox
     * @extends UIObject
     */
    export class UICheckbox extends UIObject {
        /** Create a UICheckbox object
         *  @param {Vector2} [pos]
         *  @param {Vector2} [size]
         *  @param {boolean} [checked]
         */
        constructor(pos?: Vector2, size?: Vector2, checked?: boolean);
        /** @property {boolean} */
        checked: boolean;
    }
    /**
     * UIScrollbar - A UI object that acts as a scrollbar
     * @extends UIObject
     */
    export class UIScrollbar extends UIObject {
        /** Create a UIScrollbar object
         *  @param {Vector2} [pos]
         *  @param {Vector2} [size]
         *  @param {number}  [value]
         *  @param {string}  [text]
         *  @param {Color}   [color=uiSystem.defaultButtonColor]
         *  @param {Color}   [handleColor=WHITE]
         */
        constructor(pos?: Vector2, size?: Vector2, value?: number, text?: string, color?: Color, handleColor?: Color);
        /** @property {number} */
        value: number;
        /** @property {string} */
        text: string;
        handleColor: Color;
    }
    /**
     * LittleJS Box2D Physics Plugin
     * - Box2dObject extends EngineObject with Box2D physics
     * - Call box2dInit() before engineInit() to enable
     * - You will also need to include box2d.wasm.js
     * - Uses a super fast web assembly port of Box2D
     * - More info: https://github.com/kripken/box2d.js
     * - Functions to create polygon, circle, and edge shapes
     * - Contact begin and end callbacks
     * - Wraps b2Vec2 type to/from Vector2
     * - Raycasting and querying
     * - Every type of joint
     * - Debug physics drawing
     * @namespace Box2D
     */
    /** Global Box2d Plugin object
     *  @type {Box2dPlugin}
     *  @memberof Box2D */
    export let box2d: Box2dPlugin;
    /** Enable Box2D debug drawing
     *  @type {boolean}
     *  @default
     *  @memberof Box2D */
    export let box2dDebug: boolean;
    /** Enable Box2D debug drawing
     *  @param {boolean} enable
     *  @memberof Box2D */
    export function box2dSetDebug(enable: boolean): void;
    /** Box2d Init - Call with await before starting LittleJS to init box2d
     *  @return {Promise<Box2dPlugin>}
     *  @memberof Box2D */
    export function box2dInit(): Promise<Box2dPlugin>;
    /**
     * Box2D Global Object
     * - Wraps Box2d world and provides global functions
     */
    export class Box2dPlugin {
        /** Create the global UI system object
         *  @param {Object} instance */
        constructor(instance: any);
        instance: any;
        world: any;
        /** @property {number} - Velocity iterations per update*/
        velocityIterations: number;
        /** @property {number} - Position iterations per update*/
        positionIterations: number;
        /** @property {number} - Static, zero mass, zero velocity, may be manually moved */
        bodyTypeStatic: any;
        /** @property {number} - Kinematic, zero mass, non-zero velocity set by user, moved by solver */
        bodyTypeKinematic: any;
        /** @property {number} - Dynamic, positive mass, non-zero velocity determined by forces, moved by solver */
        bodyTypeDynamic: any;
        /** Step the physics world simulation
         *  @param {number} [frames] */
        step(frames?: number): void;
        /** raycast and return a list of all the results
         *  @param {Vector2} start
         *  @param {Vector2} end */
        raycastAll(start: Vector2, end: Vector2): any[];
        /** raycast and return the first result
         *  @param {Vector2} start
         *  @param {Vector2} end */
        raycast(start: Vector2, end: Vector2): any;
        /** box aabb cast and return all the objects
         *  @param {Vector2} pos
         *  @param {Vector2} size */
        boxCastAll(pos: Vector2, size: Vector2): any[];
        /** box aabb cast and return the first object
         *  @param {Vector2} pos
         *  @param {Vector2} size */
        boxCast(pos: Vector2, size: Vector2): undefined;
        /** circle cast and return all the objects
         *  @param {Vector2} pos
         *  @param {number} diameter */
        circleCastAll(pos: Vector2, diameter: number): any[];
        /** circle cast and return the first object
         *  @param {Vector2} pos
         *  @param {number} diameter */
        circleCast(pos: Vector2, diameter: number): any;
        /** point cast and return the first object
         *  @param {Vector2} pos
         *  @param {boolean} dynamicOnly */
        pointCast(pos: Vector2, dynamicOnly?: boolean): undefined;
        /** draws a fixture
         *  @param {Object} fixture
         *  @param {Vector2} pos
         *  @param {number} angle
         *  @param {Color} [color]
         *  @param {Color} [outlineColor]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawFixture(fixture: any, pos: Vector2, angle: number, color?: Color, outlineColor?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** draws a circle
         *  @param {Vector2} pos
         *  @param {number} radius
         *  @param {Color} [color]
         *  @param {Color} [outlineColor]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawCircle(pos: Vector2, radius: number, color?: Color, outlineColor?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** draws a polygon
         *  @param {Vector2} pos
         *  @param {number} angle
         *  @param {Array<Vector2>} points
         *  @param {Color} [color]
         *  @param {Color} [outlineColor]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawPoly(pos: Vector2, angle: number, points: Array<Vector2>, color?: Color, outlineColor?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** draws a line
         *  @param {Vector2} pos
         *  @param {number} angle
         *  @param {Vector2} posA
         *  @param {Vector2} posB
         *  @param {Color} [color]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawLine(pos: Vector2, angle: number, posA: Vector2, posB: Vector2, color?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** performs a fill or stroke as a helper to the other draw functions
         *  @param {Color} [color]
         *  @param {Color} [outlineColor]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawFillStroke(color?: Color, outlineColor?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** converts a box2d vec2 to a Vector2
         *  @param {Object} v */
        vec2From(v: any): Vector2;
        /** converts a box2d vec2 pointer to a Vector2
         *  @param {Object} v */
        vec2FromPointer(v: any): Vector2;
        /** converts a Vector2 to a box2 vec2
         *  @param {Vector2} v */
        vec2dTo(v: Vector2): any;
        /** checks if a box2d object is null
         *  @param {Object} o */
        isNull(o: any): boolean;
        /** casts a box2d object to its correct type
         *  @param {Object} o */
        castObjectType(o: any): any;
    }
    /**
     * Box2D Object - extend with your own custom physics objects
     * - A LittleJS object with Box2D physics
     * - Each object has a Box2D body which can have multiple fixtures and joints
     * - Provides interface for Box2D body and fixture functions
     * @extends EngineObject
     */
    export class Box2dObject extends EngineObject {
        /** Create a LittleJS object with Box2d physics
         *  @param {Vector2}  [pos]
         *  @param {Vector2}  [size]
         *  @param {TileInfo} [tileInfo]
         *  @param {number}   [angle]
         *  @param {Color}    [color]
         *  @param {number}   [bodyType]
         *  @param {number}   [renderOrder] */
        constructor(pos?: Vector2, size?: Vector2, tileInfo?: TileInfo, angle?: number, color?: Color, bodyType?: number, renderOrder?: number);
        body: any;
        outlineColor: Color;
        /** Draws all this object's fixtures
         *  @param {Color}  [color]
         *  @param {Color}  [outlineColor]
         *  @param {number} [lineWidth]
         *  @param {CanvasRenderingContext2D} [context] */
        drawFixtures(color?: Color, outlineColor?: Color, lineWidth?: number, context?: CanvasRenderingContext2D): void;
        /** Called when a contact begins
         *  @param {Box2dObject} otherObject */
        beginContact(otherObject: Box2dObject): void;
        /** Called when a contact ends
         *  @param {Box2dObject} otherObject */
        endContact(otherObject: Box2dObject): void;
        /** Add a shape fixture to the body
         *  @param {Object} shape
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addShape(shape: any, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add a box shape to the body
         *  @param {Vector2} [size]
         *  @param {Vector2} [offset]
         *  @param {number}  [angle]
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addBox(size?: Vector2, offset?: Vector2, angle?: number, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add a polygon shape to the body
         *  @param {Array<Vector2>} points
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addPoly(points: Array<Vector2>, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add a regular polygon shape to the body
         *  @param {number}  [diameter]
         *  @param {number}  [sides]
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addRegularPoly(diameter?: number, sides?: number, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add a random polygon shape to the body
         *  @param {number}  [diameter]
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addRandomPoly(diameter?: number, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add a circle shape to the body
         *  @param {number}  [diameter]
         *  @param {Vector2} [offset]
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addCircle(diameter?: number, offset?: Vector2, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add an edge shape to the body
         *  @param {Vector2} point1
         *  @param {Vector2} point2
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addEdge(point1: Vector2, point2: Vector2, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any;
        /** Add an edge loop to the body, an edge loop connects the end points
         *  @param {Array<Vector2>} points
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addEdgeLoop(points: Array<Vector2>, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any[];
        /** Add an edge list to the body
         *  @param {Array<Vector2>} points
         *  @param {number}  [density]
         *  @param {number}  [friction]
         *  @param {number}  [restitution]
         *  @param {boolean} [isSensor] */
        addEdgeList(points: Array<Vector2>, density?: number, friction?: number, restitution?: number, isSensor?: boolean): any[];
        /** Gets the center of mass
         *  @return {Vector2} */
        getCenterOfMass(): Vector2;
        /** Gets the linear velocity
         *  @return {Vector2} */
        getLinearVelocity(): Vector2;
        /** Gets the angular velocity
         *  @return {Vector2} */
        getAngularVelocity(): Vector2;
        /** Gets the mass
         *  @return {number} */
        getMass(): number;
        /** Gets the rotational inertia
         *  @return {number} */
        getInertia(): number;
        /** Check if this object is awake
         *  @return {boolean} */
        getIsAwake(): boolean;
        /** Gets the physics body type
         *  @return {number} */
        getBodyType(): number;
        /** Sets the position and angle
         *  @param {Vector2} pos
         *  @param {number} angle */
        setTransform(pos: Vector2, angle: number): void;
        /** Sets the position
         *  @param {Vector2} pos */
        setPosition(pos: Vector2): void;
        /** Sets the angle
         *  @param {number} angle */
        setAngle(angle: number): void;
        /** Sets the linear velocity
         *  @param {Vector2} velocity */
        setLinearVelocity(velocity: Vector2): void;
        /** Sets the angular velocity
         *  @param {number} angularVelocity */
        setAngularVelocity(angularVelocity: number): void;
        /** Sets the linear damping
         *  @param {number} damping */
        setLinearDamping(damping: number): void;
        /** Sets the angular damping
         *  @param {number} damping */
        setAngularDamping(damping: number): void;
        /** Sets the gravity scale
         *  @param {number} [scale] */
        setGravityScale(scale?: number): void;
        /** Should this body be treated like a bullet for continuous collision detection?
         *  @param {boolean} [isBullet] */
        setBullet(isBullet?: boolean): void;
        /** Set the sleep state of the body
         *  @param {boolean} [isAwake] */
        setAwake(isAwake?: boolean): void;
        /** Set the physics body type
         *  @param {number} type */
        setBodyType(type: number): void;
        /** Set whether the body is allowed to sleep
         *  @param {boolean} [isAllowed] */
        setSleepingAllowed(isAllowed?: boolean): void;
        /** Set whether the body can rotate
         *  @param {boolean} [isFixed] */
        setFixedRotation(isFixed?: boolean): void;
        /** Set the center of mass of the body
         *  @param {Vector2} center */
        setCenterOfMass(center: Vector2): void;
        /** Set the mass of the body
         *  @param {number} mass */
        setMass(mass: number): void;
        /** Set the moment of inertia of the body
         *  @param {number} momentOfInertia */
        setMomentOfInertia(momentOfInertia: number): void;
        /** Reset the mass, center of mass, and moment */
        resetMassData(): void;
        /** Set the mass data of the body
         *  @param {Vector2} [localCenter]
         *  @param {number}  [mass]
         *  @param {number}  [momentOfInertia] */
        setMassData(localCenter?: Vector2, mass?: number, momentOfInertia?: number): void;
        /** Set the collision filter data for this body
         *  @param {number} [categoryBits]
         *  @param {number} [ignoreCategoryBits]
         *  @param {number} [groupIndex] */
        setFilterData(categoryBits?: number, ignoreCategoryBits?: number, groupIndex?: number): void;
        /** Set if this body is a sensor
         *  @param {boolean} [isSensor] */
        setSensor(isSensor?: boolean): void;
        /** Apply force to this object
         *  @param {Vector2} force
         *  @param {Vector2} [pos] */
        applyForce(force: Vector2, pos?: Vector2): void;
        /** Apply acceleration to this object
         *  @param {Vector2} acceleration
         *  @param {Vector2} [pos] */
        applyAcceleration(acceleration: Vector2, pos?: Vector2): void;
        /** Apply torque to this object
         *  @param {number} torque */
        applyTorque(torque: number): void;
        /** Apply angular acceleration to this object
         *  @param {number} acceleration */
        applyAngularAcceleration(acceleration: number): void;
        /** Check if this object has any fixtures
         *  @return {boolean} */
        hasFixtures(): boolean;
        /** Get list of fixtures for this object
         *  @return {Array<Object>} */
        getFixtureList(): Array<any>;
        /** Check if this object has any joints
         *  @return {boolean} */
        hasJoints(): boolean;
        /** Get list of joints for this object
         *  @return {Array<Object>} */
        getJointList(): Array<any>;
    }
    /**
     * Box2D Raycast Result
     * - Holds results from a box2d raycast queries
     * - Automatically created by box2d raycast functions
     */
    export class Box2dRaycastResult {
        /** Create a raycast result
         *  @param {Object}  fixture
         *  @param {Vector2} point
         *  @param {Vector2} normal
         *  @param {number}  fraction */
        constructor(fixture: any, point: Vector2, normal: Vector2, fraction: number);
        /** @property {Box2dObject} - The box2d object */
        object: any;
        /** @property {Object} - The fixture that was hit */
        fixture: any;
        /** @property {Vector2} - The hit point */
        point: Vector2;
        /** @property {Vector2} - The hit normal */
        normal: Vector2;
        /** @property {number} - Distance fraction at the point of intersection */
        fraction: number;
    }
    /**
     * Box2D Joint
     * - Base class for Box2D joints
     * - A joint is used to connect objects together
     */
    export class Box2dJoint {
        /** Create a box2d joint, the base class is not intended to be used directly
         *  @param {Object} jointDef */
        constructor(jointDef: any);
        box2dJoint: any;
        /** Destroy this joint */
        destroy(): void;
        /** Get the first object attached to this joint
         *  @return {Box2dObject} */
        getObjectA(): Box2dObject;
        /** Get the second object attached to this joint
         *  @return {Box2dObject} */
        getObjectB(): Box2dObject;
        /** Get the first anchor for this joint in world coordinates
         *  @return {Vector2} */
        getAnchorA(): Vector2;
        /** Get the second anchor for this joint in world coordinates
         *  @return {Vector2} */
        getAnchorB(): Vector2;
        /** Get the reaction force on bodyB at the joint anchor given a time step
         *  @param {number} time
         *  @return {Vector2} */
        getReactionForce(time: number): Vector2;
        /** Get the reaction torque on bodyB in N*m given a time step
         *  @param {number} time
         *  @return {number} */
        getReactionTorque(time: number): number;
        /** Check if the connected bodies should collide
         *  @return {boolean} */
        getCollideConnected(): boolean;
        /** Check if either connected body is active
         *  @return {boolean} */
        isActive(): boolean;
    }
    /**
     * Box2D Target Joint, also known as a mouse joint
     * - Used to make a point on a object track a specific world point target
     * - This a soft constraint with a max force
     * - This allows the constraint to stretch and without applying huge forces
     * @extends Box2dJoint
     */
    export class Box2dTargetJoint extends Box2dJoint {
        /** Create a target joint
         *  @param {Box2dObject} object
         *  @param {Box2dObject} fixedObject
         *  @param {Vector2} worldPos */
        constructor(object: Box2dObject, fixedObject: Box2dObject, worldPos: Vector2);
        /** Set the target point in world coordinates
         *  @param {Vector2} pos */
        setTarget(pos: Vector2): void;
        /** Get the target point in world coordinates
         *  @return {Vector2} */
        getTarget(): Vector2;
        /** Sets the maximum force in Newtons
         *  @param {number} force */
        setMaxForce(force: number): void;
        /** Gets the maximum force in Newtons
         *  @return {number} */
        getMaxForce(): number;
        /** Sets the joint frequency in Hertz
         *  @param {number} hz */
        setFrequency(hz: number): void;
        /** Gets the joint frequency in Hertz
         *  @return {number} */
        getFrequency(): number;
    }
    /**
     * Box2D Distance Joint
     * - Constrains two points on two objects to remain at a fixed distance
     * - You can view this as a massless, rigid rod
     * @extends Box2dJoint
     */
    export class Box2dDistanceJoint extends Box2dJoint {
        /** Create a distance joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchorA
         *  @param {Vector2} anchorB
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchorA: Vector2, anchorB: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Set the length of the joint
         *  @param {number} length */
        setLength(length: number): void;
        /** Get the length of the joint
         *  @return {number} */
        getLength(): number;
        /** Set the frequency in Hertz
         *  @param {number} hz */
        setFrequency(hz: number): void;
        /** Get the frequency in Hertz
         *  @return {number} */
        getFrequency(): number;
        /** Set the damping ratio
         *  @param {number} ratio */
        setDampingRatio(ratio: number): void;
        /** Get the damping ratio
         *  @return {number} */
        getDampingRatio(): number;
    }
    /**
     * Box2D Pin Joint
     * - Pins two objects together at a point
     * @extends Box2dDistanceJoint
     */
    export class Box2dPinJoint extends Box2dDistanceJoint {
        /** Create a pin joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} [pos]
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, pos?: Vector2, collide?: boolean);
    }
    /**
     * Box2D Rope Joint
     * - Enforces a maximum distance between two points on two objects
     * @extends Box2dJoint
     */
    export class Box2dRopeJoint extends Box2dJoint {
        /** Create a rope joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchorA
         *  @param {Vector2} anchorB
         *  @param {number} extraLength
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchorA: Vector2, anchorB: Vector2, extraLength?: number, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Set the max length of the joint
         *  @param {number} length */
        setMaxLength(length: number): void;
        /** Get the max length of the joint
         *  @return {number} */
        getMaxLength(): number;
    }
    /**
     * Box2D Revolute Joint
     * - Constrains two objects to share a point while they are free to rotate around the point
     * - The relative rotation about the shared point is the joint angle
     * - You can limit the relative rotation with a joint limit
     * - You can use a motor to drive the relative rotation about the shared point
     * - A maximum motor torque is provided so that infinite forces are not generated
     * @extends Box2dJoint
     */
    export class Box2dRevoluteJoint extends Box2dJoint {
        /** Create a revolute joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchor
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchor: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Get the reference angle, objectB angle minus objectA angle in the reference state
         *  @return {number} */
        getReferenceAngle(): number;
        /** Get the current joint angle
         *  @return {number} */
        getJointAngle(): number;
        /** Get the current joint angle speed in radians per second
         *  @return {number} */
        getJointSpeed(): number;
        /** Is the joint limit enabled?
         *  @return {boolean} */
        isLimitEnabled(): boolean;
        /** Enable/disable the joint limit
         *  @param {boolean} [enable] */
        enableLimit(enable?: boolean): any;
        /** Get the lower joint limit
         *  @return {number} */
        getLowerLimit(): number;
        /** Get the upper joint limit
         *  @return {number} */
        getUpperLimit(): number;
        /** Set the joint limits
         *  @param {number} min
         *  @param {number} max */
        setLimits(min: number, max: number): any;
        /** Is the joint motor enabled?
         *  @return {boolean} */
        isMotorEnabled(): boolean;
        /** Enable/disable the joint motor
         *  @param {boolean} [enable] */
        enableMotor(enable?: boolean): any;
        /** Set the motor speed
         *  @param {number} speed */
        setMotorSpeed(speed: number): any;
        /** Get the motor speed
         *  @return {number} */
        getMotorSpeed(): number;
        /** Set the motor torque
         *  @param {number} torque */
        setMaxMotorTorque(torque: number): any;
        /** Get the max motor torque
         *  @return {number} */
        getMaxMotorTorque(): number;
        /** Get the motor torque given a time step
         *  @param {number} time
         *  @return {number} */
        getMotorTorque(time: number): number;
    }
    /**
     * Box2D Gear Joint
     * - A gear joint is used to connect two joints together
     * - Either joint can be a revolute or prismatic joint
     * - You specify a gear ratio to bind the motions together
     * @extends Box2dJoint
     */
    export class Box2dGearJoint extends Box2dJoint {
        /** Create a gear joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Box2dJoint} joint1
         *  @param {Box2dJoint} joint2
         *  @param {ratio} [ratio] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, joint1: Box2dJoint, joint2: Box2dJoint, ratio?: ratio);
        joint1: Box2dJoint;
        joint2: Box2dJoint;
        /** Get the first joint
         *  @return {Box2dJoint} */
        getJoint1(): Box2dJoint;
        /** Get the second joint
         *  @return {Box2dJoint} */
        getJoint2(): Box2dJoint;
        /** Set the gear ratio
         *  @param {number} ratio */
        setRatio(ratio: number): any;
        /** Get the gear ratio
         *  @return {number} */
        getRatio(): number;
    }
    /**
     * Box2D Prismatic Joint
     * - Provides one degree of freedom: translation along an axis fixed in objectA
     * - Relative rotation is prevented
     * - You can use a joint limit to restrict the range of motion
     * - You can use a joint motor to drive the motion or to model joint friction
     * @extends Box2dJoint
     */
    export class Box2dPrismaticJoint extends Box2dJoint {
        /** Create a prismatic joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchor
         *  @param {Vector2} worldAxis
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchor: Vector2, worldAxis?: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Get the local joint axis relative to bodyA
         *  @return {Vector2} */
        getLocalAxisA(): Vector2;
        /** Get the reference angle
         *  @return {number} */
        getReferenceAngle(): number;
        /** Get the current joint translation
         *  @return {number} */
        getJointTranslation(): number;
        /** Get the current joint translation speed
         *  @return {number} */
        getJointSpeed(): number;
        /** Is the joint limit enabled?
         *  @return {boolean} */
        isLimitEnabled(): boolean;
        /** Enable/disable the joint limit
         *  @param {boolean} [enable] */
        enableLimit(enable?: boolean): any;
        /** Get the lower joint limit
         *  @return {number} */
        getLowerLimit(): number;
        /** Get the upper joint limit
         *  @return {number} */
        getUpperLimit(): number;
        /** Set the joint limits
         *  @param {number} min
         *  @param {number} max */
        setLimits(min: number, max: number): any;
        /** Is the motor enabled?
         *  @return {boolean} */
        isMotorEnabled(): boolean;
        /** Enable/disable the joint motor
         *  @param {boolean} [enable] */
        enableMotor(enable?: boolean): any;
        /** Set the motor speed
         *  @param {number} speed */
        setMotorSpeed(speed: number): any;
        /** Get the motor speed
         *  @return {number} */
        getMotorSpeed(): number;
        /** Set the maximum motor force
         *  @param {number} force */
        setMaxMotorForce(force: number): any;
        /** Get the maximum motor force
         *  @return {number} */
        getMaxMotorForce(): number;
        /** Get the motor force given a time step
         *  @param {number} time
         *  @return {number} */
        getMotorForce(time: number): number;
    }
    /**
     * Box2D Wheel Joint
     * - Provides two degrees of freedom: translation along an axis fixed in objectA and rotation
     * - You can use a joint limit to restrict the range of motion
     * - You can use a joint motor to drive the motion or to model joint friction
     * - This joint is designed for vehicle suspensions
     * @extends Box2dJoint
     */
    export class Box2dWheelJoint extends Box2dJoint {
        /** Create a wheel joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchor
         *  @param {Vector2} worldAxis
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchor: Vector2, worldAxis?: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Get the local joint axis relative to bodyA
         *  @return {Vector2} */
        getLocalAxisA(): Vector2;
        /** Get the current joint translation
         *  @return {number} */
        getJointTranslation(): number;
        /** Get the current joint translation speed
         *  @return {number} */
        getJointSpeed(): number;
        /** Is the joint motor enabled?
         *  @return {boolean} */
        isMotorEnabled(): boolean;
        /** Enable/disable the joint motor
         *  @param {boolean} [enable] */
        enableMotor(enable?: boolean): any;
        /** Set the motor speed
         *  @param {number} speed */
        setMotorSpeed(speed: number): any;
        /** Get the motor speed
         *  @return {number} */
        getMotorSpeed(): number;
        /** Set the maximum motor torque
         *  @param {number} torque */
        setMaxMotorTorque(torque: number): any;
        /** Get the max motor torque
         *  @return {number} */
        getMaxMotorTorque(): number;
        /** Get the motor torque for a time step
         *  @return {number} */
        getMotorTorque(time: any): number;
        /** Set the spring frequency in Hertz
         *  @param {number} hz */
        setSpringFrequencyHz(hz: number): any;
        /** Get the spring frequency in Hertz
         *  @return {number} */
        getSpringFrequencyHz(): number;
        /** Set the spring damping ratio
         *  @param {number} ratio */
        setSpringDampingRatio(ratio: number): any;
        /** Get the spring damping ratio
         *  @return {number} */
        getSpringDampingRatio(): number;
    }
    /**
     * Box2D Weld Joint
     * - Glues two objects together
     * @extends Box2dJoint
     */
    export class Box2dWeldJoint extends Box2dJoint {
        /** Create a weld joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchor
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchor: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Get the reference angle
         *  @return {number} */
        getReferenceAngle(): number;
        /** Set the frequency in Hertz
         *  @param {number} hz */
        setFrequency(hz: number): any;
        /** Get the frequency in Hertz
         *  @return {number} */
        getFrequency(): number;
        /** Set the damping ratio
         *  @param {number} ratio */
        setSpringDampingRatio(ratio: number): any;
        /** Get the damping ratio
         *  @return {number} */
        getSpringDampingRatio(): number;
    }
    /**
     * Box2D Friction Joint
     * - Used to apply top-down friction
     * - Provides 2D translational friction and angular friction
     * @extends Box2dJoint
     */
    export class Box2dFrictionJoint extends Box2dJoint {
        /** Create a friction joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} anchor
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, anchor: Vector2, collide?: boolean);
        /** Get the local anchor point relative to objectA's origin
         *  @return {Vector2} */
        getLocalAnchorA(): Vector2;
        /** Get the local anchor point relative to objectB's origin
         *  @return {Vector2} */
        getLocalAnchorB(): Vector2;
        /** Set the maximum friction force
         *  @param {number} force */
        setMaxForce(force: number): void;
        /** Get the maximum friction force
         *  @return {number} */
        getMaxForce(): number;
        /** Set the maximum friction torque
         *  @param {number} torque */
        setMaxTorque(torque: number): void;
        /** Get the maximum friction torque
         *  @return {number} */
        getMaxTorque(): number;
    }
    /**
     * Box2D Pulley Joint
     * - Connects to two objects and two fixed ground points
     * - The pulley supports a ratio such that: length1 + ratio * length2 <= constant
     * - The force transmitted is scaled by the ratio
     * @extends Box2dJoint
     */
    export class Box2dPulleyJoint extends Box2dJoint {
        /** Create a pulley joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB
         *  @param {Vector2} groundAnchorA
         *  @param {Vector2} groundAnchorB
         *  @param {Vector2} anchorA
         *  @param {Vector2} anchorB
         *  @param {number}  [ratio]
         *  @param {boolean} [collide] */
        constructor(objectA: Box2dObject, objectB: Box2dObject, groundAnchorA: Vector2, groundAnchorB: Vector2, anchorA: Vector2, anchorB: Vector2, ratio?: number, collide?: boolean);
        /** Get the first ground anchor
         *  @return {Vector2} */
        getGroundAnchorA(): Vector2;
        /** Get the second ground anchor
         *  @return {Vector2} */
        getGroundAnchorB(): Vector2;
        /** Get the current length of the segment attached to objectA
         *  @return {number} */
        getLengthA(): number;
        /** Get the current length of the segment attached to objectB
         *  @return {number} */
        getLengthB(): number;
        /** Get the pulley ratio
         *  @return {number} */
        getRatio(): number;
        /** Get the current length of the segment attached to objectA
         *  @return {number} */
        getCurrentLengthA(): number;
        /** Get the current length of the segment attached to objectB
         *  @return {number} */
        getCurrentLengthB(): number;
    }
    /**
     * Box2D Motor Joint
     * - Controls the relative motion between two objects
     * - Typical usage is to control the movement of a object with respect to the ground
     * @extends Box2dJoint
     */
    export class Box2dMotorJoint extends Box2dJoint {
        /** Create a motor joint
         *  @param {Box2dObject} objectA
         *  @param {Box2dObject} objectB */
        constructor(objectA: Box2dObject, objectB: Box2dObject);
        /** Set the target linear offset, in frame A, in meters.
         *  @param {Vector2} offset */
        setLinearOffset(offset: Vector2): void;
        /** Get the target linear offset, in frame A, in meters.
         *  @return {Vector2} */
        getLinearOffset(): Vector2;
        /** Set the target angular offset
         *  @param {number} offset */
        setAngularOffset(offset: number): void;
        /** Get the target angular offset
         *  @return {number} */
        getAngularOffset(): number;
        /** Set the maximum friction force
         *  @param {number} force */
        setMaxForce(force: number): void;
        /** Get the maximum friction force
         *  @return {number} */
        getMaxForce(): number;
        /** Set the maximum torque
         *  @param {number} torque */
        setMaxTorque(torque: number): void;
        /** Get the maximum torque
         *  @return {number} */
        getMaxTorque(): number;
        /** Set the position correction factor in the range [0,1]
         *  @param {number} factor */
        setCorrectionFactor(factor: number): void;
        /** Get the position correction factor in the range [0,1]
         *  @return {number} */
        getCorrectionFactor(): number;
    }
}
