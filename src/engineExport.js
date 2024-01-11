/** 
 * LittleJS Module Export
 * - Export engine as a module with functions where necessary
 */

/** Set position of camera in world space
 *  @param {Vector2} pos
 *  @memberof Settings */
function setCameraPos(pos) { cameraPos = pos; }

/** Set scale of camera in world space
 *  @param {Number} scale
 *  @memberof Settings */
function setCameraScale(scale) { cameraScale = scale; }

/** Set max size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasMaxSize(size) { canvasMaxSize = size; }

/** Set fixed size of the canvas
 *  @param {Vector2} size
 *  @memberof Settings */
function setCanvasFixedSize(size) { canvasFixedSize = size; }

/** Disables anti aliasing for pixel art if true
 *  @param {Boolean} pixelated
 *  @memberof Settings */
function setCanvasPixelated(pixelated) { canvasPixelated = pixelated; }

/** Set default font used for text rendering
 *  @param {String} font
 *  @memberof Settings */
function setFontDefault(font) { fontDefault = font; }

/** Set if webgl rendering is enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGlEnable(enable) { glEnable = enable; }

/** Set to not composite the WebGL canvas
 *  @param {Boolean} overlay
 *  @memberof Settings */
function setGlOverlay(overlay) { glOverlay = overlay; }

/** Set default size of tiles in pixels
 *  @param {Vector2} size
 *  @memberof Settings */
function setTileSizeDefault(size) { tileSizeDefault = size; }

/** Set to prevent tile bleeding from neighbors in pixels
 *  @param {Number} scale
 *  @memberof Settings */
function setTileFixBleedScale(scale) { tileFixBleedScale = scale; }

/** Set if collisions between objects are enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setEnablePhysicsSolver(enable) { enablePhysicsSolver = enable; }

/** Set default object mass for collison calcuations
 *  @param {Number} mass
 *  @memberof Settings */
function setObjectDefaultMass(mass) { objectDefaultMass = mass; }

/** Set how much to slow velocity by each frame
 *  @param {Number} damping
 *  @memberof Settings */
function setObjectDefaultDamping(damp) { objectDefaultDamping = damp; }

/** Set how much to slow angular velocity each frame
 *  @param {Number} damping
 *  @memberof Settings */
function setObjectDefaultAngleDamping(damp) { objectDefaultAngleDamping = damp; }

/** Set how much to bounce when a collision occur
 *  @param {Number} elasticity
 *  @memberof Settings */
function setObjectDefaultElasticity(elasticity) { objectDefaultElasticity = elasticity; }

/** Set how much to slow when touching
 *  @param {Number} friction
 *  @memberof Settings */
function setObjectDefaultFriction(friction) { objectDefaultFriction = friction; }

/** Set max speed to avoid fast objects missing collisions
 *  @param {Number} speed
 *  @memberof Settings */
function setObjectMaxSpeed(speed) { objectMaxSpeed = speed; }

/** Set how much gravity to apply to objects along the Y axis
 *  @param {Number} gravity
 *  @memberof Settings */
function setGravity(g) { gravity = g; }

/** Set to scales emit rate of particles
 *  @param {Number} scale
 *  @memberof Settings */
function setParticleEmitRateScale(scale) { particleEmitRateScale = scale; }

/** Set if gamepads are enabled
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGamepadsEnable(enable) { gamepadsEnable = enable; }

/** Set if the dpad input is also routed to the left analog stick
 *  @param {Boolean} enable
 *  @memberof Settings */
function setGamepadDirectionEmulateStick(enable) { gamepadDirectionEmulateStick = enable; }

/** Set if true the WASD keys are also routed to the direction keys
 *  @param {Boolean} enable
 *  @memberof Settings */
function setInputWASDEmulateDirection(enable) { inputWASDEmulateDirection = enable; }

/** Set if touch gamepad should appear on mobile devices
 *  @param {Boolean} enable
 *  @memberof Settings */
function setTouchGamepadEnable(enable) { touchGamepadEnable = enable; }

/** Set if touch gamepad should be analog stick or 8 way dpad
 *  @param {Boolean} analog
 *  @memberof Settings */
function setTouchGamepadAnalog(analog) { touchGamepadAnalog = analog; }

/** Set size of virutal gamepad for touch devices in pixels
 *  @param {Number} size
 *  @memberof Settings */
function setTouchGamepadSize(size) { touchGamepadSize = size; }

/** Set transparency of touch gamepad overlay
 *  @param {Number} alpha
 *  @memberof Settings */
function setTouchGamepadAlpha(alpha) { touchGamepadAlpha = alpha; }

/** Set to allow vibration hardware if it exists
 *  @param {Boolean} enable
 *  @memberof Settings */
function setVibrateEnable(enable) { vibrateEnable = enable; }

/** Set to disable all audio code
 *  @param {Boolean} enable
 *  @memberof Settings */
function setSoundEnable(enable) { soundEnable = enable; }

/** Set volume scale to apply to all sound, music and speech
 *  @param {Number} volume
 *  @memberof Settings */
function setSoundVolume(volume) { soundVolume = volume; }

/** Set default range where sound no longer plays
 *  @param {Number} range
 *  @memberof Settings */
function setSoundDefaultRange(range) { soundDefaultRange = range; }

/** Set default range percent to start tapering off sound
 *  @param {Number} taper
 *  @memberof Settings */
function setSoundDefaultTaper(taper) { soundDefaultTaper = taper; }

/** Set how long to show medals for in seconds
 *  @param {Number} time
 *  @memberof Settings */
function setMedalDisplayTime(time) { medalDisplayTime = time; }

/** Set how quickly to slide on/off medals in seconds
 *  @param {Number} time
 *  @memberof Settings */
function setMedalDisplaySlideTime(time) { medalDisplaySlideTime = time; }

/** Set size of medal display
 *  @param {Vector2} size
 *  @memberof Settings */
function setMedalDisplaySize(size) { medalDisplaySize = size; }

/** Set size of icon in medal display
 *  @param {Number} size
 *  @memberof Settings */
function setMedalDisplayIconSize(size) { medalDisplayIconSize = size; }

/** Set to stop medals from being unlockable
 *  @param {Boolean} preventUnlock
 *  @memberof Settings */
function setMedalsPreventUnlock(preventUnlock) { medalsPreventUnlock = preventUnlock; }

/** Set if watermark with FPS should be shown
 *  @param {Boolean} show
 *  @memberof Debug */
function setShowWatermark(show) { showWatermark = show; }

/** Set key code used to toggle debug mode, Esc by default
 *  @param {Number} key
 *  @memberof Debug */
function setDebugKey(key) { debugKey = key; }

export {
	// Setters for global variables
	setCameraPos,
	setCameraScale,
	setCanvasMaxSize,
	setCanvasFixedSize,
	setCanvasPixelated,
	setFontDefault,
	setGlEnable,
	setGlOverlay,
	setTileSizeDefault,
	setTileFixBleedScale,
	setEnablePhysicsSolver,
	setObjectDefaultMass,
	setObjectDefaultDamping,
	setObjectDefaultAngleDamping,
	setObjectDefaultElasticity,
	setObjectDefaultFriction,
	setObjectMaxSpeed,
	setGravity,
	setParticleEmitRateScale,
	setGamepadsEnable,
	setGamepadDirectionEmulateStick,
	setInputWASDEmulateDirection,
	setTouchGamepadEnable,
	setTouchGamepadAnalog,
	setTouchGamepadSize,
	setTouchGamepadAlpha,
	setVibrateEnable,
	setSoundEnable,
	setSoundVolume,
	setSoundDefaultRange,
	setSoundDefaultTaper,
	setMedalDisplayTime,
	setMedalDisplaySlideTime,
	setMedalDisplaySize,
	setMedalDisplayIconSize,
	setMedalsPreventUnlock,
	setShowWatermark,
	setDebugKey,

	// Settings
	canvasMaxSize,
	canvasFixedSize,
	canvasPixelated,
	fontDefault,
	tileSizeDefault,
	tileFixBleedScale,
	enablePhysicsSolver,
	objectDefaultMass,
	objectDefaultDamping,
	objectDefaultAngleDamping,
	objectDefaultElasticity,
	objectDefaultFriction,
	objectMaxSpeed,
	gravity,
	particleEmitRateScale,
	cameraPos,
	cameraScale,
	glEnable,
	glOverlay,
	gamepadsEnable,
	gamepadDirectionEmulateStick,
	inputWASDEmulateDirection,
	touchGamepadEnable,
	touchGamepadAnalog,
	touchGamepadSize,
	touchGamepadAlpha,
	vibrateEnable,
	soundEnable,
	soundVolume,
	soundDefaultRange,
	soundDefaultTaper,
	medalDisplayTime,
	medalDisplaySlideTime,
	medalDisplaySize,
	medalDisplayIconSize,
	
	// Globals
	debug,
	showWatermark,

	// Debug
	ASSERT,
	debugRect,
	debugCircle,
	debugPoint,
	debugLine,
	debugAABB,
	debugText,
	debugClear,
	debugSaveCanvas,

	// Utilities
	PI,
	abs,
	min,
	max,
	sign,
	mod,
	clamp,
	percent,
	distanceWrap,
	lerpWrap,
	distanceAngle,
	lerpAngle,
	lerp,
	smoothStep,
	nearestPowerOfTwo,
	isOverlapping,
	wave,
	formatTime,

	// Random
	rand,
	randInt,
	randSign,
	randInCircle,
	randVector,
	randColor,

	// Utility Classes
	RandomGenerator,
	Vector2,
	Color,
	Timer,
	vec2,
	rgb,
	hsl,

	// Base
	EngineObject,

	// Draw
	tileImage,
	mainCanvas,
	mainContext,
	overlayCanvas,
	overlayContext,
	mainCanvasSize,
	screenToWorld,
	worldToScreen,
	drawTile,
	drawRect,
	drawTileScreenSpace,
	drawRectScreenSpace,
	drawLine,
	drawCanvas2D,
	setBlendMode,
	drawTextScreen,
	drawText,
	engineFontImage,
	FontImage,
	isFullscreen,
	toggleFullscreen,

	// Input
	keyIsDown,
	keyWasPressed,
	keyWasReleased,
	clearInput,
	mouseIsDown,
	mouseWasPressed,
	mouseWasReleased,
	mousePos,
	mousePosScreen,
	mouseWheel,
	isUsingGamepad,
	preventDefaultInput,
	gamepadIsDown,
	gamepadWasPressed,
	gamepadWasReleased,
	gamepadStick,
	mouseToScreen,
	gamepadsUpdate,
	vibrate,
	vibrateStop,
	isTouchDevice,

	// Audio
	Sound,
	Music,
	playAudioFile,
	speak,
	speakStop,
	getNoteFrequency,
	audioContext,
	playSamples,
	zzfx,

	// Tiles
	tileCollision,
	tileCollisionSize,
	initTileCollision,
	setTileCollisionData,
	getTileCollisionData,
	tileCollisionTest,
	tileCollisionRaycast,
	TileLayerData,
	TileLayer,

	// Particles
	ParticleEmitter,
	Particle,

	// Medals
	medals,
	medalsPreventUnlock,
	medalsInit,
	newgroundsInit,
	Medal,
	Newgrounds,

	// WebGL
	glCanvas,
	glContext,
	glSetBlendMode,
	glSetTexture,
	glCompileShader,
	glCreateProgram,
	glCreateTexture,
	glInitPostProcess,

	// Engine
	engineName,
	engineVersion,
	frameRate,
	timeDelta,
	engineObjects,
	frame,
	time,
	timeReal,
	paused,
	setPaused,
	engineInit,
	engineObjectsUpdate,
	engineObjectsDestroy,
	engineObjectsCallback,
};