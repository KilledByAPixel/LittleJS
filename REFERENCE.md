# LittleJS Engine Quick Reference Sheet

## This cheat sheet contains all LittleJS essentials.
- [LittleJS on GitHub](https://github.com/KilledByAPixel/LittleJS) - Official LittleJS website with more info
- [LittleJS Documentation](https://killedbyapixel.github.io/LittleJS/docs) - LittleJS documentation browser
- [Particle System Designer](https://killedbyapixel.github.io/LittleJS/examples/particles) - Editor for LittleJS Particle Systems
- [Sound Effect Designer](https://killedbyapixel.github.io/ZzFX) - Tool for creating ZzFX sound effects
- [Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter) - Simple LittleJS demo to start with

## LittleJS Setup

To start LittleJS, you need to create a few functions and pass them to engineInit.

```javascript
// Start up LittleJS engine with your callback functions
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources=[], rootElement=document.body)

// Engine globals
engineName            // Name of the engine: 'LittleJS'
engineVersion         // Version of the engine
frameRate             // Fixed frame rate for updates (60)
frame                 // Current update frame
time                  // Game time since start in seconds (stops when paused)
timeReal              // Real time since start in seconds (keeps running when paused)
timeDelta             // Time between updates (1/60)
timeScale = 1         // Scales deltaTime applied to the game
paused                // Is the game paused? (set with setPaused)
headlessMode = false  // Run without rendering for testing/servers (set before engineInit)
engineManualStep      // Advance only via engineStep, default false (set before engineInit)
engineStep(frames=1)  // Advance the engine manually, needs engineManualStep
```

### Headless testing

`headlessMode` disables rendering, audio, and input. `engineManualStep` additionally
stops the engine driving itself with `requestAnimationFrame`, so it only advances when
you call `engineStep`. Together they make time-driven game logic deterministic and testable —
`Timer`, time-based spawns, cooldowns, and physics all advance exactly as many frames as you
ask for. `engineStep` drives the real update loop, so `timeScale` scales fixed updates per
step just as it does under `requestAnimationFrame`: at `timeScale = .5`, ten steps run five
fixed updates. Leave `timeScale` at 1 when you want frame counts to match exactly.

```javascript
setHeadlessMode(true);        // no rendering, audio, or input
setEngineManualStep(true);    // no requestAnimationFrame loop
await engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);

// In manual step mode engineInit runs gameInit but no update frame, so this
// is where you assert on what initialization produced.
engineStep();                 // advance exactly one fixed update
engineStep(600);              // advance 10 seconds of game time at 60fps (timeScale 1)

// engineStep respects paused, exactly as the normal update loop does
setPaused(true);
engineStep(5);                // gameUpdatePost runs, time and frame do not advance
```

Both settings must be set before `engineInit`. Input is not synthesized in headless
mode, so tests drive game state directly rather than through `keyIsDown` and friends.

`engineStep` is synchronous and does not yield — every frame runs back to back before
it returns. That is what makes it deterministic, and in headless mode it is what you
want. Outside headless mode each step also renders, so a large count blocks the tab
and throws away every frame but the last. To advance a lot of time while staying
responsive, chunk it yourself and let the browser paint between chunks:

```javascript
// advance 10 minutes of game time without freezing the tab
let remaining = 36000;
(function chunk()
{
    engineStep(min(remaining, 60));
    if ((remaining -= 60) > 0)
        requestAnimationFrame(chunk);
})();
```

## LittleJS Utilities Classes and Functions
- General purpose math library
- Vector2 - Fast, simple, easy 2D vector class
- Color - Holds a rgba color with some math functions
- Timer - Tracks time automatically
- RandomGenerator - Seeded random number generator

```javascript

// Object Constructors
vec2(x=0, y=x)                                // Create a 2D vector with Vector or floats
rgb(r=1, g=1, b=1, a=1)                       // Create a color object with RGBA values
hsl(h=0, s=0, l=1, a=1)                       // Create a color object with HSLA values
tile(index=0, size=(16,16), texture=0, padding=0, bleed=0) // Create a tile info object
tileInfo.frame(n)                             // Tile offset by n animation frames
tileInfo.setColumns(columns)                  // Frames per row, so frame() wraps to the next row

// Helper functions 
abs(value)                                    // Get absolute value
min(...values)                                // Get lowest of values
max(...values)                                // Get highest of values
sign(value)                                   // Get the sign of value
mod(dividend, divisor=1)                      // Get remainder of division
clamp(value, min=0, max=1)                    // Clamps between values
percent(value, valueA, valueB)                // Get percentage between values
lerp(valueA, valueB, percent)                 // Linearly interpolates between values
percentLerp(value, percentA, percentB, lerpA, lerpB) // Lerp that remaps the percent
distanceWrap(valueA, valueB, wrapSize=1)      // Signed wrapped distance between values
lerpWrap(valueA, valueB, percent, wrapSize=1) // Linearly interpolates with wrapping
distanceAngle(angleA, angleB)                 // Signed wrapped distance between angles
lerpAngle(angleA, angleB, percent)            // Linearly interpolates with wrapping
smoothStep(percent)                           // Applies smoothstep function
isPowerOfTwo(value)                           // Checks if the value is a power of two
nearestPowerOfTwo(value)                      // Returns the nearest power of two
isOverlapping(pointA, sizeA, pointB, sizeB)   // Checks if bounding boxes overlap
isIntersecting(start, end, pos, size)         // Checks if ray intersects box
oscillate(frequency=1, amplitude=1, t=time, offset=0, type=0) // Oscillating wave
lineTest(posStart, posEnd, testFunction, normal) // Step along a line until test passes
formatTime(t)                                 // Formats seconds for display

// Math aliases (prefer over Math.X)
PI, abs, floor, ceil, round, min, max, sign, hypot, log2, sin, cos, tan, atan2

// Type checking helpers
isNumber(n)     // Is it a number and not NaN?
isStringLike(s) // Can it be converted to a string?
isArray(a)      // Is it an array?
isVector2(v)    // Is it a valid Vector2?
isColor(c)      // Is it a valid Color?

// Utility functions
noise1D(x)                            // Smooth 1D value noise (0 to 1)
noise2D(x, y)                         // Smooth 2D value noise (0 to 1)
fetchJSON(url)                        // Fetch and parse a JSON file (async)
shareURL(title, url, callback)        // Share a URL via the navigator share API
readSaveData(saveName, defaultSaveData) // Read game save data from localStorage, default must be an object
writeSaveData(saveName, saveData)     // Write game save data to localStorage

// Random functions
rand(valueA=1, valueB=0)             // Random float between values
randInt(valueA, valueB=0)            // Random integer between values
randBool(chance=.5)                  // Random boolean with given chance (0 to 1)
randSign()                           // Randomly either -1 or 1
randVec2(length=1)                   // Random Vector2 with the passed in length
randInCircle(radius=1, minRadius=0)  // Random Vector2 within a circle
randColor(colorA, colorB, linear)    // Random color between values

// 2D vector math
Vector2(x=0, y=0)                         // Create a 2D vector
Vector2.copy()                            // Copy this vector    
Vector2.set(x=0, y=0)                     // Set this vector's components
Vector2.setFrom(v)                        // Set this vector from another vector
Vector2.add(v)                            // Add a vector
Vector2.subtract(v)                       // Subtract a vector
Vector2.multiply(v)                       // Multiply by a vector 
Vector2.divide(v)                         // Divide by a vector
Vector2.scale(s)                          // Scale by a float
Vector2.length()                          // Get length 
Vector2.lengthSquared()                   // Get length squared
Vector2.distance(v)                       // Get distance to vector
Vector2.distanceSquared(v)                // Get distance to vector squared
Vector2.normalize(length=1)               // Normalize this vector to length
Vector2.clampLength(length=1)             // Clamp this vector to length
Vector2.dot(v)                            // Dot product with vector
Vector2.cross(v)                          // Cross product with vector
Vector2.reflect(normal, restitution=1)    // Reflect off a surface normal
Vector2.floor()                           // Floor this vector
Vector2.abs()                             // Get copy with absolute value components
Vector2.snap(grid)                        // Snap to the nearest grid increment
Vector2.mod(divisor=1)                    // Get modulo of each component
Vector2.area()                            // Get area covered by this vector as a rectangle
Vector2.lerp(v, percent)                  // Interpolate between vectors
Vector2.arrayCheck(arraySize)             // Check if in bounds of array size
Vector2.angle()                           // Angle of this vector, up is 0
Vector2.setAngle(angle=0, length=1)       // Set angle and length
Vector2.rotate(angle)                     // Rotate by angle
Vector2.setDirection(direction, length=1) // Set integer direction (0-3) and length
Vector2.direction()                       // Get integer direction (0-3)
Vector2.toString(digits=3)                // Get string representation

// RGBA color object
Color(r=1, g=1, b=1, a=1)                 // Create an RGBA color
Color.copy()                              // Copy this color
Color.set(r=1, g=1, b=1, a=1)             // Set this color's values
Color.setFrom(c)                          // Set this color from another color
Color.add(c)                              // Add a color
Color.subtract(c)                         // Subtract a color
Color.multiply(c)                         // Multiply by a color
Color.divide(c)                           // Divide by a color
Color.scale(scale, alphaScale=scale)      // Scale by a float
Color.clamp()                             // Clamp this color
Color.lerp(c, percent)                    // Interpolate between colors
Color.setHSLA(h=0, s=0, l=1, a=1)         // Set the color from HSLA values
Color.HSLA()                              // Get the color in HSLA format
Color.mutate(amount=.05, alphaAmount=0)   // Randomly diverge from this color
Color.setHex(hex)                         // Set this color from a hex code
Color.setAlpha(a=1)                       // Set the alpha of this color
Color.withAlpha(a=1)                      // Get a copy of this color with the alpha set
Color.rgbaInt()                           // Get this color as 32 bit RGBA value
Color.toString(useAlpha=true)             // Get hex color code as a string

// Color constants (frozen, use .copy() to modify)
WHITE, BLACK, GRAY, CLEAR_WHITE, CLEAR_BLACK
RED, ORANGE, YELLOW, GREEN, CYAN, BLUE, PURPLE, MAGENTA

// Seeded random number generator
RandomGenerator(seed)                     // Create a random number generator
RandomGenerator.float(valueA=1, valueB=0) // Random float between values
RandomGenerator.int(valueA, valueB=0)     // Random integer between values
RandomGenerator.sign()                    // Randomly either -1 or 1

// Time tracking system
Timer(timeLeft, useRealTime=false)    // Create a timer object
Timer.set(timeLeft=0)                 // Set the timer with seconds passed in
Timer.setUseRealTime(useRealTime=true) // Keep running while the game is paused
Timer.unset()                         // Unset the timer
Timer.isSet()                         // Returns true if set
Timer.active()                        // Returns true if set and has not elapsed
Timer.elapsed()                       // Returns true if set and elapsed
Timer.get()                           // Get how long since elapsed, 0 if not set
Timer.getPercent()                    // Get percent elapsed, 0 if not set
Timer.toString()                      // Get this timer expressed as a string
Timer.valueOf()                       // Get how long since elapsed, 0 if not set
```

## LittleJS Drawing System
- Hybrid system with both Canvas2D and WebGL available
- Super fast tile sheet rendering with WebGL
- Can apply rotation, mirror, color and additive color
- Text and font rendering system with built in engine font

```javascript
// Drawing functions
// Most also accept optional trailing params: useWebGL=glEnable, screenSpace=false, context
drawTile(pos, size, tileInfo, color=WHITE, angle=0, mirror, additiveColor)
drawRect(pos, size, color=WHITE, angle=0)
drawRectGradient(pos, size, colorTop=WHITE, colorBottom=BLACK, angle=0)
drawTextureWrapped(pos, size, wrapCount, texture=0, color=WHITE, angle=0, additiveColor)
drawLine(posA, posB, width=.1, color=WHITE, pos=(0,0), angle=0)
drawLineList(points, width=.1, color=WHITE, wrap=false, pos=(0,0), angle=0)
drawPoly(points, color=WHITE, lineWidth=0, lineColor=BLACK, pos, angle=0)
drawRegularPoly(pos, size=(1,1), sides=3, color=WHITE, lineWidth=0, lineColor=BLACK, angle=0)
drawEllipse(pos, size=(1,1), color=WHITE, angle=0, lineWidth=0, lineColor=BLACK)
drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)
drawEllipseGradient(pos, size=(1,1), colorInner=WHITE, colorOuter=CLEAR_WHITE, angle=0)
drawCircleGradient(pos, size=1, colorInner=WHITE, colorOuter=CLEAR_WHITE)
drawCanvas2D(pos, size, angle=0, mirror=false, drawFunction, screenSpace=false, context)

// Text functions
drawText(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font, fontStyle, maxWidth, angle=0)
drawTextScreen(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font, fontStyle, maxWidth, angle=0)

// Utility drawing functions
setAdditiveBlendMode(additive)
isFullscreen()
toggleFullscreen()

// Tile Info Object
TileInfo(pos, size, textureInfo, padding=0, bleed=0) // Create a tile info object
TileInfo.pos            // Top left corner of tile in pixels
TileInfo.size           // Size of tile in pixels
TileInfo.padding        // How many pixels padding around tiles
TileInfo.offset(offset) // Offset this tile by a certain amount in pixels
TileInfo.frame(frame)   // Offset this tile by a number of animation frames
TileInfo.textureInfo    // The texture info for this tile

// Texture Info Object
TextureInfo(image, useWebGL=true, wrap=false) // Created automatically for each image
TextureInfo.image       // Image source
TextureInfo.size        // Size of the image
TextureInfo.glTexture   // WebGL texture
TextureInfo.wrap        // Whether texture is set to REPEAT (true) or CLAMP_TO_EDGE
TextureInfo.setWrap(wrap=true) // Enable or disable wrapping for this texture

// Image Font Object draws text using characters in an image
ImageFont(tileInfo)                                 // Create a font from a tile sheet
ImageFont.drawText(text, pos, scale, center)        // Draw text in world space
ImageFont.drawTextScreen(text, pos, scale, center)  // Draw text in screen space

// Camera settings
cameraPos = (0,0)        // Position of camera in world space
cameraAngle = 0          // Rotation angle of camera in world space
cameraScale = 32         // Scale of camera in world space
screenToWorld(screenPos) // Convert from screen to world space coordinates
worldToScreen(worldPos)  // Convert from world to screen space coordinates
screenToWorldDelta(screenDelta) // Convert a screen space delta to world space
worldToScreenDelta(worldDelta)  // Convert a world space delta to screen space
screenToWorldTransform(screenPos, screenSize, screenAngle=0) // Convert a whole transform
getCameraSize()          // Get the camera's visible area in world space
cameraFit(center, size, worldMargin, screenInset) // Fit the camera to a world space rectangle

// Display settings
canvasMaxSize = (1920, 1080)  // The max size of the canvas
canvasFixedSize = (0, 0)      // Fixed size of the canvas
canvasMinAspect = 0           // Min aspect ratio, fits to height (0 = disabled)
canvasMaxAspect = 0           // Max aspect ratio, fits to width (0 = disabled)
canvasPixelRatio = 1          // Scales canvas resolution (use devicePixelRatio for HD)
canvasClearColor = BLACK      // Color used to clear the canvas at start of frame
canvasColorTiles = true       // Allow tiles to be tinted when drawn
fontDefault = 'arial'         // Default font used for text rendering
canvasPixelated = false       // Use nearest neighbor canvas scaling for more pixelated look
tilesPixelated = true         // Disable filtering for crisper pixel art
showSplashScreen = false      // Show the LittleJS splash screen on startup
glEnable = true               // Enable fast WebGL rendering

// Tile sheet settings
tileDefaultSize = (16,16) // Default size of tiles in pixels
tileDefaultPadding = 0    // Default padding around tiles in pixels
tileDefaultBleed = 0      // How much smaller to draw tiles to prevent bleeding

// Canvas and context globals
mainCanvas / mainContext     // The main 2D canvas and its context
drawContext                  // Context currently being drawn to
glCanvas / glContext         // The WebGL canvas and context
mainCanvasSize               // Size of the main canvas in pixels
backgroundCanvas             // Extra canvas composited behind the engine canvases
setBackgroundCanvas(canvas)  // Set a plugin canvas to include when combining
setCursor(cursorStyle)       // Set the CSS cursor style
isOnScreen(pos, size)        // Is a world space area visible on screen?
combineCanvases()            // Combine all canvases onto mainCanvas (for screenshots)
```

## LittleJS Audio System
- Caches sounds and music for fast playback with frame-spread loading
- Individual sound instance control with pause/resume capabilities
- Can attenuate and apply stereo panning to sounds
- Ability to play mp3, ogg, and wave files with loading progress tracking
- [ZzFX Sound Effect Generator](https://killedbyapixel.github.io/ZzFX)
- [ZzFXM Music System](https://keithclark.github.io/ZzFXM)

```javascript
// Sound Object
Sound(zzfxSound, randomness, range, taper)             // Create a zzfx sound
Sound(filename, randomness, range, taper)              // Load a wave, mp3, or ogg
Sound.play(pos, volume=1, pitch=1, randomness=1, loop=false, paused=false) // Play a sound, returns SoundInstance
Sound.playMusic(volume=1, loop=true)                   // Play as music with looping
Sound.playNote(semitoneOffset, pos, volume=1)          // Play as note with a semitone offset
Sound.getDuration()                                    // Get length of sound in seconds (0 if loading)
Sound.isLoaded()                                       // Check if sound is fully loaded
Sound.loadedPercent                                    // Get loading progress (0 to 1)

// SoundInstance
SoundInstance.setVolume(volume)   // Change volume during playback
SoundInstance.stop(fadeTime=0)    // Stop with optional fade out
SoundInstance.pause()             // Pause the sound
SoundInstance.resume()            // Resume paused sound
SoundInstance.isPlaying()         // Check if currently playing
SoundInstance.isPaused()          // Check if paused
SoundInstance.isStopped()         // Check if stopped
SoundInstance.getCurrentTime()    // Get current playback position
SoundInstance.getDuration()       // Get total duration
SoundInstance.getSource()         // Get AudioBufferSourceNode

// ZzFXM - Tiny music playing system
ZzFXMusic(zzfxMusic)                                 // Create a zzfx music object
ZzFXMusic.playMusic(volume=1, loop=true)             // Play the music

// Audio functions
speak(text, volume=1, rate=1, pitch=1, language='')  // Speak text line
speakStop()                                          // Stop all queued speech
getNoteFrequency(semitoneOffset, rootFrequency=220)  // Get frequency for musical notes

// Audio settings
soundEnable = true      // Should sound be enabled?
soundVolume = .3        // Volume scale to apply to all sound
soundDefaultRange = 40  // Default range where sound no longer plays
soundDefaultTaper = .7  // Default range percent to taper off sound (0-1)

// Audio globals
audioContext            // The shared Web Audio context
audioMasterGain         // Master gain node all sound routes through
audioIsRunning()        // Is the audio context running? (requires user interaction)
playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate, gainNode, offset=0, onended) // Low level sample playback
createAudioBuffer(sampleChannels, sampleRate) // Copy arrays of samples into an audio buffer
playAudioBuffer(buffer, volume=1, rate=1, pan=0, loop=false, gainNode, offset=0, onended) // Play an audio buffer, shareable between sounds
```

## LittleJS Input System
- Tracks keyboard down, pressed, and released
- Tracks mouse buttons, position, and wheel
- Tracks multiple analog gamepads
- Routes touch input to mouse
- Virtual gamepad for touch devices

```javascript
// Keyboard
keyIsDown(key)                        // Is key down?
keyWasPressed(key)                    // Was key pressed this frame?
keyWasReleased(key)                   // Was key released this frame?
keyDirection(up, down, left, right)   // Get input vector from arrow keys or wasd
inputClear()                          // Clear all input state
inputClearKey(key)                    // Clear input state for a specific key

// Mouse / Touch
mousePos                              // World space mouse position
mousePosScreen                        // Screen space mouse position
mouseDelta                            // World space mouse movement delta
mouseDeltaScreen                      // Screen space mouse movement delta
mouseWheel                            // Delta mouse wheel this frame    
mouseIsDown(button)                   // Is mouse button down?
mouseWasPressed(button)               // Was mouse button pressed this frame?
mouseWasReleased(button)              // Was mouse button released this frame?
mouseInWindow                         // Is the mouse inside the window?
isTouchDevice                         // Is this a touch capable device?

// Pointer Lock
pointerLockRequest()                  // Request pointer lock on the canvas
pointerLockExit()                     // Exit pointer lock
pointerLockIsActive()                 // Is pointer lock currently active?

// Last input device (most recently used)
lastInputDevice                       // 'mouse' | 'keyboard' | 'gamepad' (sticky while idle)
usingMouseInput()                     // Is the mouse the most recently used device?
usingKeyboardInput()                  // Is the keyboard the most recently used device?
usingGamepadInput()                   // Is a gamepad the most recently used device?

// Gamepad
isUsingGamepad                        // Is a gamepad the most recently used device? (= usingGamepadInput())
gamepadPrimary                        // Index of the primary gamepad (most recently used)
gamepadIsDown(button, gamepad=0)      // Is gamepad button down?
gamepadWasPressed(button, gamepad=0)  // Was gamepad button pressed this frame?
gamepadWasReleased(button, gamepad=0) // Was gamepad button released this frame?
gamepadStick(stickIndex, gamepad=0)   // Get gamepad analog stick value
gamepadDpad(gamepad=0)                // Get gamepad dpad as a direction vector
gamepadStickCount(gamepad=0)          // Get number of analog sticks
gamepadConnected(gamepad=0)           // Is the gamepad connected?
gamepadVibrate(gamepad=0, duration=200, strongMagnitude=1, weakMagnitude=1) // Rumble
gamepadVibrateStop(gamepad=0)         // Stop gamepad vibration

// Touch Gamepad
touchGamepadEnable = false            // Is on screen touch gamepad enabled?
touchGamepadAnalog = true             // Is touch gamepad analog or 8 way dpad?
touchGamepadSize = 100                // Size of touch gamepad
touchGamepadAlpha = .3                // Alpha of touch gamepad
touchGamepadPassthrough = false       // Also route touches outside the gamepad to mouse?
touchGamepadButtonCount = 4           // Number of right side buttons (0-4)
touchGamepadCenterButtonSize = 0      // Size of center start button (0 = disabled)
touchGamepadLeftStick = true          // Show analog stick on the left side?
touchGamepadLeftButtonCount = 0       // Number of left side buttons (when left stick is off)
touchGamepadRightStick = false        // Use a stick instead of buttons on the right side?
touchGamepadFloating = false          // Directional controls float to where you press?
touchGamepadDisplayTime = 3           // Seconds to display when unused (0 = always show)
touchGamepadVibration = 0             // Vibrate duration in ms on button press (0 = off)

// Vibration
vibrate(pattern=100)                  // Pulse the vibration hardware if it exists
vibrateStop()                         // Stop all vibration

// Input settings
gamepadsEnable = true                 // Should gamepads be allowed?
gamepadDirectionEmulateStick = true   // Should dpad be routed to the left analog stick?
gamepadAxisFilterEnable = true        // Ignore axes that don't rest near center (steering wheels)
inputWASDEmulateDirection = true      // Should WASD keys be routed to the direction keys?
inputPreventDefault = true            // Should input events prevent default browser handling?
inputMouseMoveThreshold = 6           // Screen-px mouse movement per frame that counts as mouse use
vibrateEnable = true                  // Allow vibration hardware if it exists?
touchInputEnable = true               // Should touch input route to mouse events?
```

## LittleJS Object System
- Top level object class used by the engine
- Automatically adds self to object list
- Will be updated and rendered each frame
- Renders as a sprite from a tile sheet by default
- Can have color and addtive color applied
- 2D Physics and collision system
- Sorted by renderOrder before drawing
- Objects can have children in local space
- Parents are updated before children
- Call destroy() to get rid of objects

```javascript
// Engine Object
EngineObject(pos, size=(1,1), tileInfo, angle=0, color, renderOrder=0)
EngineObject.update()                              // Update object, called automatically
EngineObject.render()                              // Render object, called automatically
EngineObject.destroy()                             // Destroy this object and children
EngineObject.collideWithTile(tileData, pos)        // Tile collision resolve check
EngineObject.collideWithObject(object)             // Object collision resolve check
EngineObject.getAliveTime()                        // How long since object was created
EngineObject.applyAcceleration(acceleration)       // Apply acceleration
EngineObject.applyForce(force)                     // Apply force
EngineObject.getMirrorSign()                       // Get mirror direction (1 or -1)
EngineObject.addChild(child, localPos, localAngle) // Attach a child
EngineObject.removeChild(child)                    // Remove a child
EngineObject.setCollision(solids, isSolid, tiles)  // Set collision

// Engine Object Members
EngineObject.pos           // World space position
EngineObject.size          // World space width and height
EngineObject.drawSize      // Size of object used for drawing if set
EngineObject.tileInfo      // Tile info to render object
EngineObject.angle         // Rotation angle for rendering
EngineObject.color         // Color to apply when rendered
EngineObject.additiveColor // Additive color to apply when rendered
EngineObject.mirror        // Should it flip along y axis when rendered
EngineObject.mass          // Weight of object, static if 0
EngineObject.damping       // How much to slow velocity each frame (0-1)
EngineObject.angleDamping  // How much to slow rotation each frame (0-1)
EngineObject.restitution   // How bouncy is it when colliding (0-1)
EngineObject.friction      // How much friction when sliding (0-1)
EngineObject.gravityScale  // How much to scale gravity by
EngineObject.renderOrder   // Objects are sorted by render order
EngineObject.velocity      // Velocity of the object
EngineObject.angleVelocity // Angular velocity of the object

// Engine Object settings
enablePhysicsSolver = true    // Enable collisions between objects?
objectDefaultMass = 1         // Default object mass for collisions
objectDefaultDamping = 1      // How much to slow velocity by each frame (0-1)
objectDefaultAngleDamping = 1 // How much to slow angular velocity each frame (0-1)
objectDefaultRestitution = 0  // How much to bounce when a collision occurs (0-1)
objectDefaultFriction = .8    // How much to slow when touching (0-1)
objectMaxSpeed = 1            // Clamp max speed to avoid fast objects missing collisions
gravity = (0,0)               // How much gravity to apply to objects

// Engine Object functions
engineObjectsCollect(pos, size, objects=engineObjects)
engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects)
engineObjectsRaycast(start, end, objects=engineObjects)
engineObjectsDestroy()
```

## LittleJS Tile Layer System
- Caches arrays of tiles to off screen canvas for fast rendering
- Unlimited numbers of layers, allocates canvases as needed
- Interfaces with EngineObject for collision
- Collision layer is separate from visible layers
- It is recommended to have a visible layer that matches the collision
- Tile layers can be drawn to using their context with Canvas2d
- Drawn directly to the main canvas without using WebGL

```javascript

// Canvas Layer
CanvasLayer(pos, size)      // Create a canvas layer object
CanvasLayer.canvas          // The canvas used by this layer
CanvasLayer.context         // The 2D context of the canvas
CanvasLayer.getImageData()  // Get image data from canvas
CanvasLayer.updateWebGL()   // Creates or updates WebGL texture

// LittleJS Layer System
TileLayer(pos, size, tileInfo, renderOrder=0, useWebGL=true) // Create a tile layer object
TileLayer.setData(layerPos, data, redraw)      // Set data at position
TileLayer.clearData(layerPos, redraw)          // Clear data at position
TileLayer.getData(layerPos)                    // Get data at position
TileLayer.redraw()                             // Draw to an offscreen canvas
TileLayer.drawTileData(layerPos, clear=true)   // Draw the tile
TileLayer.drawRect(pos, size, color, angle)    // Draw a rectangle to 2D canvas
TileLayer.drawTile(pos, size=(1,1), tileInfo, color, angle, mirror) // Draw tile
TileLayer.drawCanvas2D(pos, size, angle, mirror, drawFunction)      // Draw to 2D canvas

// Tile Layer Data Object
TileLayerData(tile, direction=0, mirror=false, color=WHITE) // Create tile data object
TileLayerData.clear()                                       // Clear this tile data

// Tile Collision Layer
TileCollisionLayer(pos, size, tileInfo=tile())      // Create a tile collision layer object
TileCollisionLayer.setCollisionData(pos, data=1)    // Set tile collision data at pos
tileCollisionGetData(pos)                           // Get tile collision data at pos
tileCollisionTest(pos, size=(0,0), object)          // Check if collision should occur
tileCollisionRaycast(posStart, posEnd, object)      // Return the center of tile if hit
tileCollisionLayers                                 // List of all tile collision layers
tileLayersLoad(tileMapData, tileInfo)               // Load tile layers from exported data

```

## LittleJS Particle System
- Simple kinematic particle system with many parameters
- [Particle Effect Designer](https://killedbyapixel.github.io/LittleJS/examples/particles) - Editor for creating LittleJS Particle Systems

```javascript
// Particle Emitter Object
ParticleEmitter(pos, angle, ...settings) // Create a particle system
ParticleEmitter.emitParticle()           // Spawn one particle

// Particle Settings
particleEmitRateScale = 1 // Scales particles emit rate
```

## LittleJS Tween System
- Animate numbers, Vector2, Color, or any value with a `.lerp(other, percent)` method
- Pauses with the game by default; opt-in real-time mode keeps tweens running while paused
- Easing curves with looping, ping-pong, and chained completion callbacks
- Auto-registers via `engineAddPlugin` — no setup needed
- See `examples/tweenSystem` for a full visual demo

```javascript
// Tween a property by dot-path (common case)
tweenProperty(target, propertyPath, start, end, duration=1, options)

// Tween via custom callback
new Tween(callback, start=0, end=1, duration=1, options)
Tween.setEase(easeFn)          // Set easing curve, returns this
Tween.then(callback)           // Completion callback, returns this
Tween.loop(count=Infinity)     // Repeat n times, returns this
Tween.pingPong(count=Infinity) // Bounce between endpoints, returns this
Tween.pause()                  // Pause this tween
Tween.resume()                 // Resume a paused tween
Tween.restart()                // Reset to start and replay
Tween.stop()                   // Remove from active list
Tween.isActive()               // True if running and not paused
Tween.getPercent()             // Progress 0..1
Tween.getValue()               // Current interpolated value

// Easing curves — pass to setEase or options.ease
Ease.LINEAR, Ease.SINE, Ease.CIRC, Ease.EXPO
Ease.BACK, Ease.ELASTIC, Ease.SPRING, Ease.BOUNCE
Ease.POWER(n)                  // Returns x => x**n
Ease.BEZIER(x1, y1, x2, y2)    // CSS cubic-bezier solver

// Direction modifiers — wrap a curve to flip its direction
Ease.OUT(curve)                // Reverse to ease-out
Ease.IN_OUT(curve)             // Symmetric S-curve
Ease.IN(curve)                 // No-op (curves are already ease-in)
Ease.PIECEWISE(...curves)      // Run different curves over equal sections

// Tween options
options.ease         // Easing function (default Ease.LINEAR)
options.useRealTime  // Advance even when game is paused (default false)
options.paused       // Start in paused state (default false)

// Global helper
tweenStopAll()                 // Stop every active tween (e.g. on level reset)
```

## LittleJS PathFinding System
- A* pathfinding on a grid
- Works with a TileCollisionLayer or a bare grid with custom walkability
- Optional path smoothing (corner cleanup + string-pull line-of-sight)
- See `examples/shorts/pathFinder.js` for a demo

```javascript
// Construct from a TileCollisionLayer or a Vector2 grid size
const pf = new PathFinder(tileCollisionLayer);
const pf = new PathFinder(vec2(50, 50));
pf.isWalkable = (x, y) => myGrid[y*50 + x] === 0; // bare grid: provide your own

// Tunables (set freely)
pf.heuristicWeight = 1     // > 1 = greedier search, faster but less optimal
pf.maxLoop = 500           // max A* iterations per findPath
pf.smoothPath = true       // run smoothing pass on result
pf.debug = false           // draw search visualization
pf.debugTime = 2           // seconds debug visuals persist

// Main API
pf.findPath(startPos, endPos)        // Returns array of world positions, or empty if no path
pf.isLineClear(startPos, endPos)     // True if a straight line passes through walkable tiles
pf.getNearestClearNode(worldPos, searchRange=10) // Snap an obstructed point to the nearest open tile
pf.isWalkable(x, y)                  // Override for custom walkability
pf.getCost(x, y)                     // Override for weighted tiles (0 = clear)

// Conversion helpers
pf.worldToTile(worldPos)             // Vector2 -> tile coords
pf.tileToWorld(x, y)                 // tile coords -> Vector2 (tile center)
pf.getNode(x, y)                     // Get PathFinderNode at tile coords
```

## LittleJS UI System
- Standalone UI plugin with buttons, text, sliders, checkboxes, text input, video, and auto-layout
- Auto-registers via `engineAddPlugin` — `new UISystemPlugin()` is all you need
- Keyboard listener only attached while a UITextInput is being edited
- See `examples/uiSystem/` and `examples/shorts/uiSystem.js` for demos

```javascript
// Setup
const ui = new UISystemPlugin()        // Creates global uiSystem
uiSystem.defaultColor                  // Default style values used by all widgets
uiSystem.defaultLineColor              // (override before constructing widgets)
uiSystem.defaultLineWidth
uiSystem.defaultButtonColor
uiSystem.defaultHoverColor
uiSystem.defaultFont
uiSystem.nativeHeight                  // If set, UI coords are normalized to this height
uiSystem.destroyObjects()              // Remove all UI elements
uiSetDebug(enable)                     // Toggle uiDebug rendering of widget bounds

// Confirm dialog
uiSystem.showConfirmDialog(text='Are you sure?', yes, no, size, exitKey='Escape')

// Drawing helpers (use these instead of the engine's draw* during UI rendering)
uiSystem.drawRect(pos, size, color, lineWidth, lineColor, cornerRadius, gradientColor, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawTile(pos, size, tileInfo, color, angle, mirror, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawText(text, pos, size, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth, textShadow, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawLine(posA, posB, lineWidth, lineColor)

// Base widget
new UIObject(pos=vec2(), size=vec2())
UIObject.anchor                        // vec2 in [-1,1]; anchors to parent (or canvas if root) + self-pivot; default vec2()=center
UIObject.addChild(child)               // Returns child, parents it
UIObject.removeChild(child)
UIObject.destroy()
UIObject.isHoverObject()               // True if mouse is over this object
UIObject.isInteractive()
UIObject.onClick / onPress / onRelease / onChange / onEnter / onLeave / onUpdate / onRender // Hooks

// Widgets
new UIText(pos, size, text='', align='center', font)
new UITile(pos, size, tileInfo, color, angle=0, mirror=false)
new UIButton(pos, size, text='', color)
new UICheckbox(pos, size, checked=false, text='', color)  // .checked toggles on click
new UISlider(pos, size, value=.5, text='', color, handleColor)  // .value in [0, 1]
new UITextInput(pos, size, text='')   // .text holds current value
new UIVideo(pos, size, src, autoplay=false, loop=false, volume=1)

// Auto-layout container — arranges children into a grid
new UILayout(pos, columns=1, gap=10, padding=10, transparent=false)
UILayout.addChild(child)               // Triggers relayout
UILayout.relayout()                    // Call manually if you mutate a child's size
```

## LittleJS Light System
- 2D dynamic lighting overlay
- Lights are first-class EngineObjects (the `Light` class) that draw soft falloff blobs
- Lights accumulate ADDITIVELY in the lightmap (red + blue = magenta)
- The lightmap is MULTIPLIED with the scene during composite — draw your world at full brightness and the lightmap handles the darkening
- Any EngineObject can override `renderLight()` to additively contribute to the lightmap (lava tiles, weapon flashes, glowing crystals, etc.)
- Must be constructed BEFORE `PostProcessPlugin` so post-process sees lit pixels
- See `examples/shorts/lightSystem.js` for a demo

```javascript
// Setup
new LightSystemPlugin()                       // Defaults: full-canvas lightmap, BLACK ambient
new LightSystemPlugin(vec2(512, 512))         // Lower-res lightmap (perf knob)
new LightSystemPlugin(undefined, rgb(.1,.1,.15)) // Faint moonlight ambient

// Tunables
lightSystem.enabled       = true              // Skip the render pass entirely when false
lightSystem.ambientColor  = rgb(0, 0, 0)      // Color of unlit areas

// Lights are EngineObjects — auto-register, destroy() to remove
new Light(pos, radius, color=WHITE, fadeRange=radius)
//   pos       Vector2  World space position
//   radius    number   Total extent in world units
//   color     Color    Light color; alpha modulates intensity
//   fadeRange number   Width of the soft edge (0 = hard disc, radius = fully soft blob)

// Per-object lightmap contribution hook (on every EngineObject)
class LavaTile extends EngineObject {
    renderLight() {
        // Called during the lightmap pass with additive blending active.
        // drawRect / drawTile / drawCircle all land in the lightmap.
        drawRect(this.pos, vec2(3), rgb(1, 0.4, 0));
    }
}
```

## LittleJS Post Processing
- Optional plugin that applies a full screen WebGL shader to the rendered output
- Shadertoy style uniforms: iTime, iResolution, iChannel0
- See `examples/shorts/postProcess.js` for a demo

```javascript
new PostProcessPlugin(shaderCode, includeMainCanvas=false, feedbackTexture=false)
postProcess                    // Global instance created by the plugin
```

## LittleJS 3D Math
- Optional plugin with `Vector3` and `Matrix4` for 3D games and plugins
- Right handed, Y up, camera looks down -Z, angles in radians
- Used by the Render3D plugin, but has no rendering dependencies

```javascript
// Vectors
vec3(x, y, z)                  // vec3() is zero, vec3(s) fills all, vec3(x, y) has z=0
isVector3(v)                   // true if v is a Vector3
randVector3(length=1, coneAngle=PI) // random direction, uniform over the sphere or a cone around +Y
v.add(v2) v.subtract(v2) v.multiply(v2) v.divide(v2) v.scale(s)
v.dot(v2) v.cross(v2) v.length() v.lengthSquared() v.distance(v2) v.distanceSquared(v2)
v.normalize(length=1) v.clampLength(length=1) v.lerp(v2, percent) // percent is clamped like lerp
v.rotate(axis, angle)          // turned around a unit axis, counter clockwise when the axis points at you
v.rotateX(angle) v.rotateY(angle) v.rotateZ(angle) // turned around one axis, the way rotation3D turns things
v.reflect(normal, restitution=1) // bounce off a surface, 0 slides along it
v.abs() v.floor() v.round() v.snap(grid) v.copy() v.set(x, y, z) v.setFrom(v2) v.isValid() v.toString(digits=3)

// Matrices - m.m is a column major Float32Array(16), the order WebGL wants, so it goes to a shader as is
// euler is vec3(pitch, yaw, roll) in radians: applied to points as roll (Z), then pitch (X), then yaw (Y)
// +pitch looks up, +yaw turns left for something facing -Z, +roll rolls counter clockwise around Z
Matrix4.translation(v) Matrix4.rotation(euler) Matrix4.scaling(v)   // new Matrix4 or Matrix4.identity() is the identity
Matrix4.perspective(fov, aspect, near, far)    // fov is vertical, radians
Matrix4.orthographic(left, right, bottom, top, near, far)
Matrix4.lookAt(eye, target, up)                // transform of an object at eye facing target, invert it for the view
                                               // matrix of a camera there
m.multiply(m2)                 // m = m * m2, m2 is applied to points first
m.translate(v) m.rotate(euler) m.scale(v)      // append a transform, returns self
m.invert() m.transpose()       // in place, return self
m.copy() m.transformPoint(v) m.transformDirection(v) m.getTranslation() // or v.transform(m), v.transformDirection(m)
buildMatrix(pos, rotation, scale)              // translate * rotate * scale, any arg optional

// Collision - boxes are axis aligned and centered with full size, spheres and cylinders take a radius, cylinders stand
// on Y
isPointInBox3D(point, pos, size)               // true if point is in the box, boundary inclusive
isOverlapping3D(posA, sizeA, posB, sizeB)      // box vs box, touching edges do not overlap; no sizeB tests a point
collideSphereSphere(posA, radiusA, posB, radiusB)          // push A out of B, or undefined
collideSphereBox(pos, radius, boxPos, boxSize)             // push a sphere out of a box, or undefined
collideSphereCylinder(pos, radius, cylinderPos, cylinderRadius, cylinderHeight) // push a sphere out of a cylinder,
                                                                                // or undefined
collideBoxBox(posA, sizeA, posB, sizeB)        // minimum translation vector for A, or undefined
// raycasts return the distance t where the hit is ray.getPosition(t), so scale direction and t scales too
new Ray3D(origin, direction)                   // a start and a direction, what screenToRay returns
ray.getPosition(distance)                      // the point a distance along it, distance is what the raycasts return
raycastSphere(ray, pos, radius)                // distance t to the sphere, or undefined
raycastPlane(ray, planePos, planeNormal)       // distance t to the plane, or undefined
raycastBox(ray, pos, size)                     // distance t to the box, or undefined
```

## LittleJS 3D Rendering
- Optional plugin in the dist bundle like the others, draws meshes, billboards (flat pictures that turn to face the
  camera), lines and particles into the engine's WebGL canvas, under the 2D layer by default
- Requires the 3D Math plugin. One shader: directional, ambient and point lights, specular, fog, shadows, textures,
  vertex colors
- EngineObject3D extends EngineObject, so update, destroy, timers, children and renderOrder all work; the 2D pos is
  ignored by rendering
- The 3D pass is the part of the frame that draws 3D, and it draws in two rounds: the opaque stage for solid things
  first, then the transparent stage for see-through things; every object and callback runs with the draw state set from
  the object's flags
- 3D draws only work inside the 3D pass, from an object's `render3D()` or from `onRenderOpaque` / `onRenderTransparent`;
  drawing from `gameRender` asserts, and anything that fades (soft discs, soft shadows) must be in the transparent stage
- Builders and draws take full sizes (diameters) like buildBox and drawCircle; collision helpers and lights take radii
- A texture comes before its tint like drawTile, except where per vertex colors are part of the geometry (drawStrip,
  drawRibbon)
- Y is up and -Z is forward, so the ground is the XZ plane: 2D input maps to it as vec3(move.x, 0, -move.y), forward for
  a yaw is vec3(-sin(yaw), 0, -cos(yaw)) and right is vec3(cos(yaw), 0, -sin(yaw))
- Below, a comment that says `e.g.` marks the value on that line as an example, not the default
- See the `examples/shorts/render3d*.js` demos - features: render3dShapes, render3dBillboards, render3dHeightMap
  terrain, render3dCollision with picking, render3dLights, render3dParticles, render3dTrails, render3dText,
  render3dMesh for OBJ loading, render3dLayers for 3D layers in a 2D scene; games: render3dDodgeGame, render3dRacerGame,
  render3dPuzzleGame

```javascript
// Setup (call in gameInit)
new Render3DPlugin()                  // creates global render3D, renders automatically before gameRender

// A first 3D scene
function gameInit()
{
    new Render3DPlugin();                                // draws itself every frame, before gameRender
    render3D.setSky();                                   // dome colors, also sets the fog color
    new EngineObject3D(vec3(), buildGrid(vec2(20), 20)); // the ground is the XZ plane, Y is up
    new EngineObject3D(vec3(0, 1, 0), buildBox(), undefined, RED);
    render3D.camera.orbit(vec3(0, 1, 0), 12, 0, .4);     // or set camera.pos and camera.lookAt(target)
}

// Camera
render3D.camera.pos = vec3(0, 5, 10) // Camera3D: pos (0, 0, 10), rotation (pitch, yaw, roll), fov PI/3, near .1,
                                     // far 1000
render3D.camera.orthographic = 20     // visible height in world units with no perspective, so distance does not
                                      // shrink things; 0 is the normal perspective view; near and far still clip
render3D.camera.lookAt(target)        // set the rotation to face a target now, clears roll
render3D.camera.orbit(target, distance, yaw, pitch=.5) // put the camera on an orbit looking at the target
render3D.camera.follow(target, offset, percent=1) // chase camera: ease toward target + offset and look at it, percent
                                                  // is how far it moves each call, so call it every frame, from
                                                  // gameUpdatePost once the target has moved
render3D.camera.align2D = true        // lock to the 2D camera so the z=0 plane matches world space
render3D.camera.forward() .right() .up() // the camera's axes as it is right now; render3D.cameraRight .cameraUp
                                         // .cameraForward are this frame's, read only
render3D.viewMatrix .projectionMatrix .viewProjection .shadowMatrix // this frame's, rebuilt by updateMatrices()
render3D.camera.getMatrix() .getViewMatrix() .getProjectionMatrix(aspect) // built from the camera as it is now
render3D.worldToScreen(pos)           // Vector3 -> screen pixels, undefined when behind the camera
render3D.worldToClip(pos)             // Vector3 -> -1 to 1 across and up the screen, z is depth; undefined when behind
                                      // the camera
render3D.screenToRay(screenPos)       // Ray3D under a screen point, always returns one
render3D.screenToGround(screenPos, groundHeight=0) // where that ray meets a flat ground plane, or undefined;
                                                   // terrain has HeightMap.raycast
render3D.raycastObjects(ray, objects)              // {object, distance} of the nearest object whose bounding sphere
                                                    // the ray hits, around its mesh or a sprite's size3D
render3D.playSound(sound, pos3D, volume, pitch, randomnessScale, loop) // like sound.play(pos): quieter with
                                                // distance from the camera, panned by side
render3D.isSphereVisible(center, radius) // the same is-it-on-screen test drawMesh uses, for skipping your own draws

// Lights and fog, read at each draw
render3D.lightDirection = vec3(.5, -1, .3).normalize()  // direction the light travels
render3D.lightColor = rgb(1, .95, .9) // e.g., WHITE by default
render3D.ambientColor = rgb(.3, .3, .3)
render3D.fogColor = undefined         // uses canvasClearColor when undefined
render3D.fogStart = 20; render3D.fogEnd = 100 // e.g., both 0 by default which is no fog; measured by camera distance,
                                              // fogEnd 0 disables fog
render3D.gravity = vec3(0, -.01, 0) // e.g., vec3() by default so nothing falls; objects with a mass fall by this each
                                    // frame, times their gravityScale, and slow by their damping, which is 1 by
                                    // default for no slowing
new Light3D(pos3D, radius, color) // point light, an EngineObject3D; the 8 nearest the camera light the frame, alpha
                                  // scales brightness so alpha 0 is an off switch, brightness drops off fast so a
                                  // small radius needs a bright color

// Shadows - one shadow map from the directional light; lit opaque objects and draws on the default side of the 2D scene
// cast and receive
render3D.shadows = true // off by default and free when off, soft shadows (drawSoftShadow) still work alongside
render3D.shadowMapSize = 1024         // pixels across the shadow map, rebuilt when it changes
render3D.shadowRange = 40             // world size the map covers around shadowCenter, smaller is sharper
render3D.shadowCenter = undefined // Vector3 center of the shadowed area, read each frame; undefined follows the camera
render3D.shadowBias = .003 // raise if lit surfaces get speckled with their own shadow, lower if shadows float away
                           // from their casters
render3D.shadowSoftness = 1           // how far to blur the shadow edge, in shadow map pixels

// Sky
render3D.setSky(topColor, horizonColor, bottomColor) // dome colors straight up, level and straight down; sets
                                                     // render3D.sky and fogColor
render3D.setFog(fogStart, fogEnd, fogColor) // the fog distances and color at once, no color keeps the current one
render3D.sky = buildSky(topColor, horizonColor, bottomColor, sides, rings) // or set a dome yourself

// Draw state, read at each draw; the pass sets it from each object's flags before render3D() and resets it before each
// callback, so set it inside those, or use the object flags below
render3D.lighting = true              // false draws plain vertex color times texture
render3D.additive = false             // additive blending in the transparent stage
render3D.specular = 0                 // Phong highlight strength, the shiny spot where the light reflects
render3D.receiveShadow = true         // false keeps the next draws out of the shadow map's darkening
render3D.cullBackFaces = false // off by default so one sided meshes like grids and ribbons do not vanish; true skips
                               // faces pointing away, faster for closed meshes
render3D.depthTest = true; render3D.depthWrite = true // the transparent stage turns depth writes off, so see-through
                                                      // draws never hide each other

// The pass
render3D.onRenderOpaque = ()=> {} // after the opaque objects: world geometry drawn outside of objects, also called for
                                  // the shadow map
render3D.onRenderTransparent = ()=> {} // after the transparent objects: billboards, glows and soft shadows drawn
                                       // outside of objects
render3D.queueTransparent(pos, draw)   // sort your own transparent draw in with the rest, draws now when sorting is off
render3D.isRendering render3D.shadowPass // read only: inside the 3D pass, and inside the shadow map part of it
render3D.sortTransparent = true // transparent draws sort far to near so alpha and additive mix, false keeps object
                                // order
render3D.frustumCulling = true // drawMesh skips meshes whose bounding sphere is outside the frustum, the wedge of
                               // space the camera can see
render3D.renderAfter2D = false // true draws the 3D scene on top of the 2D scene instead of under it; objects that do
                               // not set their own renderAfter2D follow this
render3D.smoothShading = true  // default for every builder's smooth argument, flat by default;
                               // meshes already built keep the normals they have

// Objects - EngineObject with a 3D transform, drawn by the 3D pass
new EngineObject3D(pos3D, mesh, tileInfo, color) // a tileInfo with no mesh draws a sprite billboard of size3D in the
                                                 // transparent stage, already transparent without setting the flag;
                                                 // size3D.z is ignored for sprites
obj.pos3D obj.rotation3D obj.scale3D // Vector3, rotation is (pitch, yaw, roll); change them in place or assign new ones
obj.velocity3D obj.angleVelocity3D // added to pos3D and rotation3D by the engine after update, no super.update() needed
obj.mass = 1 // objects start with no mass and stay put; with a mass render3D.gravity, gravityScale and damping act on
             // velocity3D, and damping is 1 by default for no slowing
obj.size3D                              // full size for engineObjectsCollect3D and sprites
obj.collideSolid3D = true               // push apart from other solid objects as balls the size of the largest side,
                                        // heavier objects move less, mass 0 stays put, velocities bounce by restitution
obj.softShadow = 2                      // a soft shadow of that diameter under the object on render3D.softShadowHeight
obj.upright = true                      // a sprite stands on world up instead of tilting toward the camera
obj.sync2D = true // copy the 2D pos and angle into pos3D and rotation3D each frame, set mass for 2D physics
obj.mesh obj.tileInfo obj.color         // what to draw and how
obj.transparent = true                  // draw in the transparent stage, blended, sorted far to near, no depth writes
obj.additive = true                     // additive blending, implies the transparent stage
obj.unlit = true                        // draw with lighting off, for lamps and glowing things
obj.specular = .5                       // highlight strength
obj.castShadow = false                  // keep it out of the shadow map; sprites and cut out textures cast their
                                        // outline, unlit and additive objects never cast
obj.receiveShadow = false               // draw it without the shadow map's darkening
obj.cullBackFaces = true                // skip faces pointing away from the camera, faster for closed meshes
obj.renderOrder                         // sorts the opaque stage
obj.renderAfter2D = true // this object on top of the 2D scene, or false for under it; undefined follows
                         // render3D.renderAfter2D
// the layer under the 2D scene and the layer over it are drawn separately with their own depth, so neither hides the
// other; the sky, callbacks and debug primitives draw with the default side
obj.getMatrix() // buildMatrix(pos3D, rotation3D, scale3D), composed with an EngineObject3D parent's
obj.getWorldPos3D()                     // world position, pos3D is local when parented
obj.getForward3D() .getRight3D() .getUp3D() // the object's axes in the world, forward is -Z
engineObjectsCollect3D(pos, size, objects) // the EngineObject3D objects whose boxes overlap a box, size a vec3 or a
                                           // number
engineObjectsCallback3D(pos, size, callback, objects)
obj.lookAt(target)                      // turn -Z toward a point: sets pitch and yaw, clears roll
obj.render3D() // override for custom drawing, the draw state is already set from the flags; render() is empty
// children attached with addChild follow an EngineObject3D parent's 3D transform, pos3D is then local; addChild's 2D
// offset arguments do nothing in 3D

// Draw right now, no object needed - only inside render3D() or a pass callback, drawing elsewhere asserts; strips batch
// into one draw per texture and state
render3D.drawBox(pos, size, color, rotation)              // size is a vec3 or a number, untextured
render3D.drawSphere(pos, size, color)                     // size is the diameter, untextured
render3D.drawMesh(mesh, matrix, tileInfo, color) // any mesh, one draw call; tileInfo can be a TextureInfo for the whole
                                                 // texture
render3D.drawBillboard(pos, size, tileInfo, color, angle, upright) // camera facing quad, unlit, size is a Vector2;
                                                                   // upright stands on world up
// list points counter clockwise as seen from the front, or the face points away and cullBackFaces hides it
render3D.drawQuad(a, b, c, d, tileInfo, color)            // corners in loop order, a is the texture's top left
render3D.drawTriangle(a, b, c, color)
render3D.drawLine(posA, posB, width, color)               // camera facing ribbon, unlit
render3D.drawRibbon(points, width, color, tileInfo, side) // strip along a path, unlit, two sided; width and color one
                                                          // or per point, texture runs along it, side faces the camera
                                                          // unless given
// soft discs and shadows fade to transparent, so draw them from a transparent object or onRenderTransparent
render3D.drawSoftDisc(pos, size, color, normal, sides) // fades to transparent at the rim, unlit, faces the camera
                                                       // unless a normal is given
render3D.drawSoftShadow(pos, size, floorHeight, color, lift) // soft blob shadow under pos, unlit; floorHeight can be
                                                             // (x, z)=> y to follow terrain
render3D.softShadowHeight = 0                             // floor for objects with a softShadow: a height, a HeightMap,
                                                          // or (x, z)=> y
// strip order, counter clockwise as seen from the front: the first three points make a triangle, then every extra
// point makes another with the two before it, so the shape is walked in pairs
render3D.drawStrip(points, normals, uvs, colors, tileInfo) // a raw triangle strip; normals, uvs and colors are one
                                                           // value or one per point
render3D.drawStripUnlit(points, normals, uvs, colors, tileInfo) // same with lighting off
render3D.flush()                                          // draw what is pending, automatic when needed
render3D.bake(()=> { ...draws... })                       // returns the strips drawn inside as a Mesh

// Debug primitives - like debugRect and friends, drawn on top of the scene in debug builds
debugBox3D(pos, size, color, time, rotation)
debugSphere3D(pos, size, color, time)
debugLine3D(posA, posB, color, width, time)
debugPoint3D(pos, color, time, size)

// Meshes - triangle strips, sent to the GPU on first render, drawn by matrix; dispose a mesh you stop using to free its
// GPU buffer
const mesh = new Mesh
mesh.addStrip(points, normals, uvs, colors) // one strip in strip order, counter clockwise from the front; normals, uvs
                                            // and colors are one value or one per point; extra strips in one mesh are
                                            // joined by an invisible flat triangle, so they do not look connected
mesh.addQuad(a, b, c, d, color, uvs) // corners in loop order, counter clockwise seen from the front; color and uvs one
                                     // or per corner
mesh.combine(otherMesh, matrix, color)        // append a transformed, tinted copy: many shapes in one draw call
mesh.transform(matrix)                        // move every vertex in place
mesh.flipNormals()                            // turn it inside out, for rooms and domes seen from within
mesh.setColor(color)                          // every vertex color
mesh.computeNormals(smooth=false)             // derive normals from the triangles
mesh.getBounds()                              // {min, max} around the vertices
mesh.center() mesh.fit(size) // move the bounds onto the origin, scale the largest extent to size; both edit in place
                             // and return the mesh
mesh.render(matrix, tileInfo, color)          // one draw call with the current draw state
mesh.dispose()                                // free the GPU buffer, the CPU data stays
mesh.points mesh.normals mesh.uvs mesh.colors // the vertex arrays, one entry per strip vertex
mesh.dirty = true; mesh.upload() // re-upload edited arrays on the next draw, or upload now; upload also measures
                                 // mesh.radius; transform, setColor and computeNormals set dirty themselves
mesh.vertexCount mesh.radius                  // vertices, and the bounding sphere for culling and picking
mesh.computeRadius()                          // measure mesh.radius now, without uploading

// Shape builders - return a Mesh centered on the origin, sizes are full sizes, smooth defaults to the plugin setting
buildBox(size=1)                              // a vec3 or a number, six faces with uvs, always flat
buildSphere(size=1, sides=12, rings=6, smooth)
buildCylinder(size=1, height=1, sides=12, smooth, capped=true)
buildCone(size=1, height=1, sides=12, smooth, capped=true)      // point up
buildCapsule(size=1, height=1, sides=12, rings=4, smooth) // total height including the rounded ends, at least the size
buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth) // size is the diameter of the whole donut, outside edge
                                                               // to outside edge; it lies flat in the XZ plane like a
                                                               // coin on a table, so rotation3D.x = PI/2 stands it up
buildLathe(profile, sides=12, smooth, capped=true) // spins an outline around the Y axis like a vase on a wheel; profile
                                                   // is [[radius, y], ...] bottom to top, a closed profile is a ring
buildRibbon(points, width=1, color, closed, up) // lit quads along a path, for roads and tracks; width and color one or
                                                // per point
buildGrid(size=vec2(1), segments=1, color, heightFunction, smooth) // XZ plane; segments a number or vec2,
                                                                    // height is (x, z)=> y
// color is a Color or (x, z)=> Color, where x and z are positions on the mesh itself with (0, 0) at its center; it is
// called per vertex when smooth and once per cell center when flat, so a checker needs cell sized steps: with
// buildGrid(vec2(30), 15) the cells are 2 units, so (x, z)=> (floor(x/2) + floor(z/2)) & 1 ? GRAY : WHITE
buildLoft(stations) // a hull from diamond shaped cross sections, the stations: [[z, width, top, bottom, sideHeight],
                    // ...] nose first at the largest z, always flat; sideHeight is 0 to 1, where the side corners sit
                    // between the bottom and the top
buildSky(topColor, horizonColor, bottomColor, sides, rings) // dome colored by height, set as render3D.sky
buildExtrude(pixels, size, depth) // 3D sprite: each solid pixel of a tileInfo given thickness, like a block model,
                                  // colors kept; or rows of pixels (Color, truthy for white, falsy for empty)
buildText3D(text, size, depth, font) // extruded glyphs from an ImageFont, the white engine font by default so the
                                     // object color tints it; centered, faces +Z, a new mesh each call

// Height map terrain - from a 2D array [row][column] of 0-1 heights or an image's red channel; row 0 is the far edge at
// -Z, column 0 the left edge at -X
const terrain = new HeightMap(heights, size=vec2(1), height=1, colors) // heights and colors take the array, an image or
                                                                      // a canvas
terrain.buildMesh(smooth)                     // one vertex per sample, centered on the origin
terrain.getHeight(x, z)                       // world height of the drawn mesh there, to stand things on it
terrain.getNormal(x, z)                       // surface normal there, to tilt things to the slope
terrain.raycast(ray)               // distance along a ray to the ground or undefined, for clicking on terrain
terrain.getColor(x, z)                        // nearest sample color
terrain.rows terrain.columns                  // samples along Z and X

// OBJ meshes - v, vt, vn and f lines, convex polygons, no materials
parseOBJ(text, smooth)                        // Mesh from OBJ text, smooth normals when the file has none
await loadOBJ(url, smooth) // fetch then parse, in an async gameInit; chain .center().fit(size) for models of unknown
                           // units

// Particles - the 3D twin of ParticleEmitter, camera facing billboards sorted with everything transparent
new ParticleEmitter3D(pos3D, emitSize, emitTime, emitRate, emitConeAngle, tileInfo,
    colorStartA, colorStartB, colorEndA, colorEndB, particleTime, sizeStart, sizeEnd,
    speed, damping, gravity, fadeRate, randomness, additive)
// particles shoot out along the emitter's own up axis, so rotation3D aims the spray; emitSize is a sphere diameter or a
// vec3 box; speeds are per frame, sizes are world units, gravity changes velocity y per frame so it is negative to fall
// emitConeAngle is the half angle around that direction, PI is every direction; damping multiplies velocity each frame,
// 1 by default for no slowing; fadeRate is the fraction of life spent fading, half in and half out; randomness is extra
// randomness on speed, size and life
// an emitter with an emitTime destroys itself once its last particle is gone, so a burst is fire and forget
// untextured particles are soft round dots, textured ones are billboards of the tile
emitter.trailTime = .2 // draw each particle as a ribbon along its last .2 seconds instead, the texture stretches along
                       // it
emitter.emitParticle()  // fire one particle now, on top of the emit rate

// Trails - a ribbon through where the object has been, parent it to something that moves
new Trail3D(pos3D, lifeTime, width, tileInfo, color, colorEnd, additive) // thins and fades from head to tail over
                                                                         // lifeTime seconds
trail.side // Vector3 for which way the ribbon lies flat, recorded with each sample; undefined turns it to face the
           // camera
trail.clear()                                 // forget the trail, for when the object teleports
```

## LittleJS Three.js Integration
- Optional plugin that renders a three.js scene on a canvas behind the LittleJS canvas
- You load three.js yourself (import map or bundler) and pass the module in
- Aligned camera mode locks the 3D camera to the 2D camera so the z=0 plane matches world space
- Recommended: `setGLEnable(false)` before engineInit so three.js owns the only WebGL context
- Keep `canvasClearColor` transparent (the default) so the 3D scene shows through, set the background with `threeJS.scene.background`
- Do not call `renderer.setPixelRatio`, the plugin manages canvas size and DPR
- See `examples/threejs/` for a side scroller and a 3D platformer demo

```javascript
// Setup (call in gameInit), THREE is the three.js module you loaded
new ThreeJSPlugin(THREE, cameraFOV=60) // creates global threeJS, renders automatically
threeJS.scene                  // three.js scene, add lights and meshes here
threeJS.camera                 // three.js perspective camera
threeJS.cameraAlign2D = true   // lock camera to the LittleJS 2D camera (default)
threeJS.alignCamera2D()        // align manually, called automatically when locked

// Objects - littlejs physics drives a three.js mesh
new ThreeJSObject(pos, size, mesh, z=0) // adds mesh to the scene, syncs transform
obj.mesh                       // the three.js object3d
obj.z                          // mesh height above the 2D plane
obj.syncMesh()                 // copy the 2D transform to the mesh
```

## LittleJS Box2D Physics
- Optional plugin wrapping the Box2D physics engine (via box2d.wasm.js)
- Drop-in replacement for engine objects: `Box2dObject extends EngineObject`
- Joints, raycasting, polygon/circle/edge fixtures
- See `examples/box2d/` for a full demo

```javascript
// Setup (call once before engineInit)
await box2dInit()              // Loads the WASM and creates global box2d / Box2dPlugin
box2dSetDebug(true)            // Toggle debug rendering of physics shapes (box2dDebug)
box2d.setGravity(vec2(0,-20))  // World gravity

// Bodies — extend EngineObject, integrate with physics
new Box2dObject(pos, size, tileInfo, angle, color, bodyType)   // Dynamic by default
new Box2dStaticObject(pos, size, tileInfo, angle, color)       // Immovable
new Box2dKinematicObject(pos, size, tileInfo, angle, color)    // Moves but ignores forces
new Box2dTileLayer(pos, tileLayer)                             // Static collision from a TileLayer

// Common fixture setup (call from constructor or after creation)
obj.addBox(size, offset, angle, density, friction, restitution, isSensor)
obj.addCircle(diameter, offset, density, friction, restitution, isSensor)
obj.addPoly(points, offset, angle, density, friction, restitution, isSensor)
obj.addEdgeList(points, offset, angle, density, friction, restitution, isSensor)
obj.setFilterData(categoryBits, maskBits, groupIndex)

// Forces and motion
obj.applyForce(force, pos)             // Force in Newtons at world pos (sustained)
obj.applyAcceleration(accel, pos)      // Δvelocity = accel per call (mass-independent, matches EngineObject)
obj.applyImpulse(impulse, pos)         // Δvelocity = impulse / mass (instantaneous; use for one-shot hits)
obj.applyTorque(torque)
obj.applyAngularAcceleration(accel)    // Δangular velocity = accel per call (mass-independent)
obj.applyAngularImpulse(impulse)       // Δangular velocity = impulse / inertia (instantaneous)
obj.setLinearVelocity(vel)
obj.setAngularVelocity(av)
obj.setAwake(awake=true)
obj.setMassData(mass, localCenter, I)
obj.getMass() / getCenterOfMass() / getInertia()

// Raycasting
box2d.raycast(startPos, endPos, filterCallback?) // Returns Box2dRaycastResult or undefined

// Joints — all extend Box2dJoint
new Box2dTargetJoint(object, targetPos)        // Drag toward a point (mouse-follow)
new Box2dDistanceJoint(objectA, objectB, anchorA, anchorB)
new Box2dPinJoint(objectA, objectB, anchor)
new Box2dRopeJoint(objectA, objectB, anchorA, anchorB, maxLength)
new Box2dRevoluteJoint(objectA, objectB, anchor)
new Box2dPrismaticJoint(objectA, objectB, anchor, axis)
new Box2dWheelJoint(objectA, objectB, anchor, axis)
new Box2dWeldJoint(objectA, objectB, anchor)
new Box2dFrictionJoint(objectA, objectB, anchor)
new Box2dPulleyJoint(objectA, objectB, groundA, groundB, anchorA, anchorB, ratio)
new Box2dMotorJoint(objectA, objectB)
new Box2dGearJoint(jointA, jointB, ratio)
```

## LittleJS Medals & Newgrounds
- Achievement/medal system with on-screen popup, save/restore via localStorage
- Optional Newgrounds integration: syncs medals and scoreboards when hosted on Newgrounds
- See `examples/shorts/medals.js` for a demo

```javascript
// Medals
new Medal(id, name, description='', icon='🏆', src)  // src is optional image url
medal.unlock()                       // Mark unlocked, save, and queue the popup
medal.unlocked                       // True after unlock

medals                               // Global { [id]: Medal } map
medalsInit(saveName)                 // Restore unlocked state from localStorage under saveName
medalsForEach(callback)              // Iterate all registered medals
medalsReset()                        // Lock all medals and persist the cleared catalog
medalsPreventUnlock                  // Block unlocks (testing / debug)

// Display tuning
medalDisplayTime / setMedalDisplayTime(seconds)
medalDisplaySlideTime / setMedalDisplaySlideTime(seconds)
medalDisplaySize / setMedalDisplaySize(vec2)

// Newgrounds integration (only used when hosted on Newgrounds)
await newgrounds                     // The global is set by NewgroundsPlugin
new NewgroundsPlugin(app_id, cipher) // Auto-fetches medals and scoreboards
newgrounds.unlockMedal(id)           // Server-side unlock
newgrounds.postScore(id, value)      // Submit to a scoreboard
newgrounds.getScores(id, user, social, skip, limit)
newgrounds.logView()                 // Track a page view
new NewgroundsMedal(id, name, description, icon)
```

## LittleJS Drawing Utilities
- Optional plugin: nine-slice and three-slice helpers for scalable UI panels, plus a crescent shape
- World-space (WebGL or 2D) and screen-space (always 2D) variants
- See `examples/shorts/nineSlice.js` and `examples/shorts/crescent.js`

```javascript
// Nine-slice — 3x3 tile grid scaled to fit
drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)

// Three-slice — 1x3 tile strip (corner / side / center) rotated around the box
drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)

// Crescent — moon-phase shape (percent: 0=new, .25=first quarter, .5=full, .75=last quarter)
drawCrescent(pos, size=1, percent=0, color=WHITE, angle=0, invert=false, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace, context)
getCrescentPoints(pos, size=1, percent=0, angle=0, invert=false, sides=glCircleSides) // crescent points for drawPoly
```

## LittleJS Texture Sheets
- Optional plugin: packs images into texture sheets at runtime and returns a TileInfo
- Sheets are created and filled automatically, there is nothing to set up first
- Frames are packed into a contiguous row so `tileInfo.frame(n)` works
- See `examples/shorts/textureSheet.js`

```javascript
loadSprite(src, frameSize, padding=1, sourcePadding=0) // Load an image and pack it, returns a TileInfo
loadAtlas(imageSrc, jsonSrc, padding=1) // Load a TexturePacker or Aseprite atlas, returns name->TileInfo object
parseAtlas(data)                      // Parse atlas json into named frame groups, used by loadAtlas
spritesReady()                        // Promise resolved when all sprites are packed
textureSheets                         // Array of TextureSheet created by loadSprite
new TextureSheet(size=2048)           // A texture that images are packed into
sheet.tryAdd(imageSize, frameSize, padding, sourcePadding) // Reserve a spot, returns a TileInfo
sheet.drawImage(image, tileInfo, update=true) // Draw an image into a reserved spot
sheet.updateTexture()                 // Upload batched images to WebGL

// Settings
textureSheetSize = 2048   // Size in pixels of texture sheets created by loadSprite
textureSheetPadding = 1   // Default padding around each frame packed by loadSprite

// Load a sprite and an animation, then wait for both
async function gameInit()
{
    playerTile = loadSprite('player.png');
    runTile = loadSprite('run.png', vec2(16));
    await spritesReady();
}
```

## LittleJS Debugging System
- Press Escape key to toggle debug overlay
- Number keys toggle debug functions
- +/- keys apply time scale to update
- Debug primitive rendering system
- Debug functions are only active in debug builds

```javascript
ASSERT(assert, output) // Asserts if the expression is false
LOG(...output)         // Logs output to the console (stripped from release builds)
debugRect(pos, size, color='#fff', time=0, angle=0, fill) // Draw debug rectangle
debugCircle(pos, size, color='#fff', time=0, fill)        // Draw debug circle
debugPoint(pos, color, time, angle)                         // Draw debug point
debugLine(posA, posB, color, width=.1, time)                // Draw debug line
debugPoly(pos, points, color=WHITE, time=0, angle=0, fill)  // Draw debug polygon
debugText(text, pos, size=1, color='#fff', time=0, angle=0) // Draw debug text
debugOverlap(pA, sA, pB, sB, color) // Draw a debug overlap between two boxes
debugClear()                     // Clear all debug primitives
debugScreenshot()                // Save a screenshot at the end of this frame
debugShowErrors()                // Show full page error message when an error occurs
debugVideoCaptureStart()         // Start capturing a video of the canvas
debugVideoCaptureStop()          // Stop capturing and save the video to disk
debugVideoCaptureIsActive()      // Is video currently being captured?
saveCanvas(canvas, filename='screenshot', type='image/png') // Save canvas to a file
saveText(text, filename='text', type='text/plain')          // Save text to a file
saveDataURL(dataURL, filename='download')                   // Save url to a file

// Debug settings
debug                // Is debug enabled?
debugPointSize = .5  // Size to render debug points by default
debugKey = 'Escape'  // Key code used to toggle debug mode
debugOverlay         // Is the debug overlay is active?
debugWatermark       // Should watermark with FPS appear in debug mode?
```

[LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) Copyright 2021 Frank Force

![LittleJS Logo](examples/favicon.png)