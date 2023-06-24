// This file contains exports neessary when LittleJS is used as a module

// setters for all variables that devs will need to modify
const setCameraPos =                    (v)=> cameraPos = v;
const setCameraScale =                  (v)=> cameraScale = v;
const setRandSeed =                     (v)=> randSeed = v;
const setCanvasMaxSize =                (v)=> canvasMaxSize = v;
const setCanvasFixedSize =              (v)=> canvasFixedSize = v;
const setCavasPixelated =               (v)=> cavasPixelated = v;
const setFontDefault =                  (v)=> fontDefault = v;
const setTileSizeDefault =              (v)=> tileSizeDefault = v;
const setTileFixBleedScale =            (v)=> tileFixBleedScale = v;
const setObjectDefaultSize =            (v)=> objectDefaultSize = v;
const setEnablePhysicsSolver =          (v)=> enablePhysicsSolver = v;
const setObjectDefaultMass =            (v)=> objectDefaultMass = v;
const setObjectDefaultDamping =         (v)=> objectDefaultDamping = v;
const setObjectDefaultAngleDamping =    (v)=> objectDefaultAngleDamping = v;
const setObjectDefaultElasticity =      (v)=> objectDefaultElasticity = v;
const setObjectDefaultFriction =        (v)=> objectDefaultFriction = v;
const setObjectMaxSpeed =               (v)=> objectMaxSpeed = v;
const setGravity =                      (v)=> gravity = v;
const setParticleEmitRateScale =        (v)=> particleEmitRateScale = v;
const setGlEnable =                     (v)=> glEnable = v;
const setGlOverlay =                    (v)=> glOverlay = v;
const setGamepadsEnable =               (v)=> gamepadsEnable = v;
const setGamepadDirectionEmulateStick = (v)=> gamepadDirectionEmulateStick = v;
const setInputWASDEmulateDirection =    (v)=> inputWASDEmulateDirection = v;
const setTouchGamepadEnable =           (v)=> touchGamepadEnable = v;
const setTouchGamepadAnalog =           (v)=> touchGamepadAnalog = v;
const setTouchGamepadSize =             (v)=> touchGamepadSize = v;
const setTouchGamepadAlpha =            (v)=> touchGamepadAlpha = v;
const setVibrateEnable =                (v)=> vibrateEnable = v;
const setSoundVolume =                  (v)=> soundVolume = v;
const setSoundEnable =                  (v)=> soundEnable = v;
const setSoundDefaultRange =            (v)=> soundDefaultRange = v;
const setSoundDefaultTaper =            (v)=> soundDefaultTaper = v;
const setMedalDisplayTime =             (v)=> medalDisplayTime = v;
const setMedalDisplaySlideTime =        (v)=> medalDisplaySlideTime = v;
const setMedalDisplayWidth =            (v)=> medalDisplayWidth = v;
const setMedalDisplayHeight =           (v)=> medalDisplayHeight = v;
const setMedalDisplayIconSize =         (v)=> medalDisplayIconSize = v;
const setMedalsPreventUnlock =          (v)=> medalsPreventUnlock = v;
const setDebugPointSize =               (v)=> debugPointSize = v;
const setShowWatermark =                (v)=> showWatermark = v;
const setGodMode =                      (v)=> godMode = v;

// This is a full list of everything in engine.all
export {
	// Custom methods
	setCameraPos,
	setCameraScale,
	setRandSeed,
	setCanvasMaxSize,
	setCanvasFixedSize,
	setCavasPixelated,
	setFontDefault,
	setTileSizeDefault,
	setTileFixBleedScale,
	setObjectDefaultSize,
	setEnablePhysicsSolver,
	setObjectDefaultMass,
	setObjectDefaultDamping,
	setObjectDefaultAngleDamping,
	setObjectDefaultElasticity,
	setObjectDefaultFriction,
	setObjectMaxSpeed,
	setGravity,
	setParticleEmitRateScale,
	setGlEnable,
	setGlOverlay,
	setGamepadsEnable,
	setGamepadDirectionEmulateStick,
	setInputWASDEmulateDirection,
	setTouchGamepadEnable,
	setTouchGamepadAnalog,
	setTouchGamepadSize,
	setTouchGamepadAlpha,
	setVibrateEnable,
	setSoundVolume,
	setSoundEnable,
	setSoundDefaultRange,
	setSoundDefaultTaper,
	setMedalDisplayTime,
	setMedalDisplaySlideTime,
	setMedalDisplayWidth,
	setMedalDisplayHeight,
	setMedalDisplayIconSize,
	setMedalsPreventUnlock,
	setDebugPointSize,
	setShowWatermark,
	setGodMode,

	// Settings
	canvasMaxSize,
	canvasFixedSize,
	cavasPixelated,
	fontDefault,
	tileSizeDefault,
	tileFixBleedScale,
	objectDefaultSize,
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
	soundVolume,
	soundEnable,
	soundDefaultRange,
	soundDefaultTaper,
	medalDisplayTime,
	medalDisplaySlideTime,
	medalDisplayWidth,
	medalDisplayHeight,
	medalDisplayIconSize,
	
	// Globals
	debug,
	debugPointSize,
	showWatermark,
	godMode,
	// Debug
	//debugPrimitives,
	//debugOverlay,
	//debugPhysics,
	//debugRaycast,
	//debugParticles,
	//debugGamepads,
	//debugMedals,
	//debugTakeScreenshot,
	//downloadLink,
	//ASSERT,
	debugRect,
	debugCircle,
	debugPoint,
	debugLine,
	debugAABB,
	debugText,
	debugClear,
	debugSaveCanvas,
	//debugInit,
	//debugUpdate,
	//debugRender,

	// Utilities
	PI,
	abs,
	min,
	max,
	sign,
	mod,
	clamp,
	percent,
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
	randSeed, // Add get/set
	randSeeded,

	// More utilities
	vec2,
	Vector2,
	colorRGBA,
	colorHSLA,
	Color,
	Timer,

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
	//inputData,
	//inputUpdate,
	//inputUpdatePost,
	// onkeydown,
	// onkeyup,
	//remapKeyCode,
	// onmousedown,
	// onmouseup,
	// onmousemove,
	// onwheel,
	// oncontextmenu,
	mouseToScreen,
	//stickData,
	gamepadsUpdate,
	vibrate,
	vibrateStop,
	isTouchDevice,
	//touchGamepadTimer,
	touchGamepadCreate,
	touchGamepadRender,

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
	//zzfxR,
	//zzfxG,
	//zzfxM,

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
	newgrounds,
	medalsInit,
	Medal,
	//medalsRender,
	Newgrounds,
	//CryptoJS,

	// WebGL
	glCanvas,
	glContext,
	//glInit,
	glSetBlendMode,
	glSetTexture,
	glCompileShader,
	glCreateProgram,
	glCreateTexture,
	//glPreRender,
	//glFlush,
	//glCopyToContext,
	//glDraw,
	glInitPostProcess,
	//glRenderPostProcess,

	// Engine
	engineName,
	engineVersion,
	frameRate,
	timeDelta,
	engineObjects,
	//engineObjectsCollide,
	frame,
	time,
	timeReal,
	paused,
	//frameTimeLastMS,
	//averageFPS,
	//drawCount,
	//styleBody,
	//styleCanvas,
	engineInit,
	//enginePreRender,
	//engineObjectsUpdate,
	engineObjectsDestroy,
	engineObjectsCallback,
};
