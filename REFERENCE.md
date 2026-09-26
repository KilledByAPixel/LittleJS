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
// a rootElement keeps its inline styles and holds the canvas, which is still sized from the window

// Engine globals
engineName            // Name of the engine: 'LittleJS'
engineVersion         // Version of the engine
frameRate             // Fixed frame rate for updates (60)
frame                 // Current update frame
time                  // Game time since start in seconds (stops when paused)
timeReal              // Real time since start in seconds (keeps running when paused; the debug speed keys scale it)
timeDelta             // Time between updates (1/60)
timeScale = 1         // Game speed, more or fewer fixed updates per second; timeDelta stays 1/60
paused                // Is the game paused? (set with setPaused)
headlessMode = false  // Run without rendering for testing/servers (set before engineInit)
engineManualStep      // Advance only via engineStep, default false; can be turned on and off while running
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

`headlessMode` must be set before `engineInit`; `engineManualStep` can be, or it can be turned
on and off later to stop and restart the loop. Input is not synthesized in headless mode, so
tests drive game state directly rather than through `keyIsDown` and friends.

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
smoothStep(percent)                           // Applies smoothstep function, percent clamped to 0-1
isPowerOfTwo(value)                           // Checks if the value is a power of two
nearestPowerOfTwo(value)                      // Smallest power of two not less than the value
isOverlapping(pointA, sizeA, pointB, sizeB)   // Checks if bounding boxes overlap
isIntersecting(start, end, pos, size)         // Checks if ray intersects box
// the collide helpers answer how far out, where isOverlapping answers whether; boxes are axis aligned and centered
// with a full size, and each returns undefined when the shapes are not touching
collideCircleCircle(posA, radiusA, posB, radiusB) // vector that moves circle A clear of circle B
collideCircleBox(pos, radius, boxPos, boxSize)    // vector that moves a circle clear of a box
collideBoxBox(posA, sizeA, posB, sizeB)           // vector that moves box A clear of box B, the shortest way out
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
                                      // the result has the default's type in TypeScript
writeSaveData(saveName, saveData)     // Write game save data to localStorage; give medalsInit a different name

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
Vector2.round()                           // Round this vector
Vector2.abs()                             // Get copy with absolute value components
Vector2.snap(grid)                        // Snap down to the grid, grid is steps per unit
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
RandomGenerator(seed)                     // Create a random number generator, reseed by setting r.seed;
                                          // a seed that is 0 as an integer uses the default seed
RandomGenerator.float(valueA=1, valueB=0) // Random float between values
RandomGenerator.int(valueA, valueB=0)     // Random integer between values
RandomGenerator.sign()                    // Randomly either -1 or 1
RandomGenerator.bool(chance=.5)           // Random boolean with given chance (0 to 1)
RandomGenerator.floatSign(valueA=1, valueB=0) // Random float between values with a random sign
RandomGenerator.angle()                   // Random angle between -PI and PI
RandomGenerator.vec2(valueA=1, valueB=0)  // Random Vector2, each component between values
RandomGenerator.direction(length=1)       // Random Vector2 with the passed in length, like randVec2
RandomGenerator.randColor(colorA=WHITE, colorB=BLACK, linear=false) // Random color between values
RandomGenerator.mutateColor(color, amount=.05, alphaAmount=0) // Copy of a color randomly diverged

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
Timer.getSetTime()                    // Get the time it was set to, 0 if not set
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
// Canvas2D draws (text, useWebGL=false) go to a canvas above every WebGL draw, whatever order they are drawn in
drawTile(pos, size, tileInfo, color=WHITE, angle=0, mirror, additiveColor)
drawRect(pos, size, color=WHITE, angle=0)
drawRectGradient(pos, size, colorTop=WHITE, colorBottom=CLEAR_WHITE, angle=0)
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
drawTextScreen(text, pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font, fontStyle, maxWidth, angle=0)

// Utility drawing functions
setAdditiveBlendMode(additive)
setShader(shader)                  // draw with a custom Shader from now on, none for the engine's own; objects set
                                   // their own, so this is for draws in gameRender and gameRenderPost
isFullscreen()
toggleFullscreen()

// Shader Object - a custom fragment shader for objects and draws, 2D or 3D
new Shader(fragmentCode)          // fragmentCode defines void mainImage(out vec4 c, vec2 uv) in the post processing
                                  // style; it gives the surface color, then the object's color and additive color
                                  // apply in 2D, and the lighting, shadows and fog in 3D
obj.shader = shader               // any EngineObject or EngineObject3D; draws that share a Shader share a batch
// names in the snippet: iChannel0 the texture, iTime, iResolution, localUV 0 to 1 across the sprite or the mesh uv,
// premultipliedTexture true for a render target or a smooth image (tilesPixelated false), whose rgb and alpha
// change together;
// in 2D untextured draws like drawRect are not shaded; a bad snippet throws with the GLSL log in debug builds;
// in 3D the shadow map is drawn without the Shader, so a snippet that cuts holes still casts the whole shadow

// Tile Info Object
TileInfo(pos, size, textureInfo, padding=0, bleed=0) // Create a tile info object
TileInfo.pos            // Top left corner of tile in pixels
TileInfo.size           // Size of tile in pixels
TileInfo.padding        // How many pixels padding around tiles
TileInfo.offset(offset) // Offset this tile by a certain amount in pixels
TileInfo.frame(frame)   // Offset this tile by a number of animation frames
TileInfo.textureInfo    // The texture info for this tile

// Sprite Animation Object - steps a tile through the frames along its row over time, paused with the game
new SpriteAnimation(tileInfo, frameCount, frameTime=.1) // first frame, how many, seconds each; loops from the start
animation.loop() .play() .pingPong()  // start over from the first frame: repeat, run once and hold the last
                                      // frame, or there and back; each returns the animation
animation.stop()        // hold the current frame, a mode call starts it again
animation.tileInfo      // the frame to draw now, read it in update or before a drawTile
animation.frame         // its index, 0 to frameCount-1
animation.isDone        // true once a play has run through
animation.speed = 1     // rate multiplier, set before starting

// Texture Info Object
TextureInfo(image, useWebGL=true, wrap=false) // Created automatically for each image
TextureInfo.image       // Image source
TextureInfo.size        // Size of the image
TextureInfo.glTexture   // WebGL texture
TextureInfo.wrap        // Whether texture is set to REPEAT (true) or CLAMP_TO_EDGE
TextureInfo.setWrap(wrap=true) // Enable or disable wrapping for this texture
await loadTexture(textureIndex, src) // Load an image after engineInit into textureInfos[textureIndex], for tile(i, size, textureIndex);
                                     // resolves to the TextureInfo, and an image that fails to load logs a warning

// Image Font Object draws text using characters in an image
ImageFont(tileInfo)     // Create a font from a tile sheet
ImageFont.drawText(text, pos, size=1, center=true, color=WHITE, useWebGL=glEnable, context)
                        // Draw text in world space, size is a character's size in world units, a number or vec2
                        // stays upright when the camera turns, glyphs snap to whole pixels
ImageFont.drawTextScreen(text, pos, size, center=true, color=WHITE, useWebGL=glEnable, context)
                        // Draw text in screen space, size in pixels is required
                        // for both, center also centers the lines of multi-line text on pos, like the engine's drawText

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
canvasMaxSize = (3840, 2160)  // The max size of the canvas in css pixels
canvasFixedSize = (0, 0)      // Fixed size of the canvas
canvasMinAspect = 0           // Min aspect ratio, fits to height (0 = disabled)
canvasMaxAspect = 0           // Max aspect ratio, fits to width (0 = disabled)
canvasPixelRatio = 1          // Scales render resolution only (undefined tracks devicePixelRatio)
getCanvasPixelRatio()         // Get the pixel ratio currently applied to the backing store
canvasClearColor = CLEAR_BLACK // Color to clear the canvas to each frame, alpha 0 does not clear
canvasColorTiles = true       // Allow tiles to be tinted when drawn
fontDefault = 'arial'         // Default font used for text rendering
canvasPixelated = false       // Use nearest neighbor canvas scaling for more pixelated look
tilesPixelated = true         // Disable filtering for crisper pixel art, when false textures get mipmaps at any size
                              // and upload premultiplied, so smooth edges do not darken
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
mainCanvasSize               // Size of the main canvas in css pixels (screen space)
backgroundCanvas             // Extra canvas composited behind the engine canvases
setBackgroundCanvas(canvas)  // Set a plugin canvas to include when combining
setCursor(cursorStyle)       // Set the CSS cursor style
isOnScreen(pos, size)        // Is a world space area visible on screen?
combineCanvases()            // Combine all canvases onto mainCanvas (for screenshots)
```

## LittleJS Audio System
- Caches sounds and music for fast playback, every play shares one decoded buffer
- Individual sound instance control with pause/resume capabilities
- Can attenuate and apply stereo panning to sounds
- Ability to play mp3, ogg, and wave files
- Route sounds or everything through effects with the audio effects plugin
- [ZzFX Sound Effect Generator](https://killedbyapixel.github.io/ZzFX)
- [ZzFXM Music System](https://keithclark.github.io/ZzFXM)

```javascript
// Sound Object
Sound(zzfxSound, randomness, range, taper, onloadCallback) // Create a zzfx sound
Sound(filename, randomness, range, taper, onloadCallback)  // Load a wave, mp3, or ogg
Sound.play(pos, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false) // Play a sound, returns SoundInstance
Sound.playLoop(pos, volume=1, pitch=1, randomnessScale=1, paused=false) // Play on a loop, like play with loop on
Sound.playMusic(volume=1, loop=true, paused=false)     // Play as music with looping
                                    // (played before the first input, a sound waits and starts once audio runs;
                                    // only the newest play of each sound waits)
Sound.playNote(semitoneOffset, pos, volume=1)          // Play as note with a semitone offset
Sound.getDuration()                                    // Get length of sound in seconds (0 if loading)
Sound.isLoaded()                                       // Check if sound is fully loaded
Sound.loadedPercent                                    // 0 until a file is decoded, then 1
Sound.output                                           // Optional node or effect to route every play through

// SoundInstance
SoundInstance.start(offset=0)     // Start or restart from a time in seconds, to seek
SoundInstance.setVolume(volume, fadeTime=0) // Change volume during playback, fading to it if given a time
SoundInstance.setRate(rate)       // Change speed and pitch during playback, like an engine loop following speed
SoundInstance.setPan(pan)         // Change stereo pan during playback (-1 left to 1 right), to follow its source
SoundInstance.stop(fadeTime=0)    // Stop with optional fade out
SoundInstance.pause()             // Pause the sound
SoundInstance.resume()            // Resume paused sound
SoundInstance.isPlaying()         // Check if currently playing
SoundInstance.isPaused()          // Check if paused or stopped, not playing
SoundInstance.getCurrentTime()    // Where it is in the sound, in the sound's own seconds whatever the rate
SoundInstance.getDuration()       // Length of the sound, the same at any rate; divide by rate for time to play
SoundInstance.getSource()         // Get AudioBufferSourceNode
SoundInstance.onendedCallback     // Called when it plays to its end, not on stop or pause; set it any time

// ZzFXM - Tiny music playing system
ZzFXMusic(zzfxMusic)                                 // Create a zzfx music object
ZzFXMusic.playMusic(volume=1, loop=true, paused=false) // Play the music, it is a Sound so play and playLoop work too

// Audio functions
speak(text, volume=1, rate=1, pitch=1, language='')  // Speak text line
speakStop()                                          // Stop all queued speech
getNoteFrequency(semitoneOffset, rootFrequency=220)  // Get frequency for musical notes

// Audio settings
soundEnable = true      // Should sound be enabled?
soundVolume = .3        // Volume scale to apply to all sound
soundDefaultRange = 40  // Default range where sound no longer plays
soundDefaultTaper = .7  // Default range percent to taper off sound (0-1)
soundPauseWhenHidden = true // Pause all sound while the page is hidden, the way the game stops; off keeps
                            // music playing in a background tab

// Audio globals
audioContext            // The shared Web Audio context
audioMasterGain         // Master gain node all sound routes through
setAudioMasterEffect(input, output) // Route all sound through a node or effect, or a chain's first and last; no args to remove it
audioIsRunning()        // Is the audio context running? (requires user interaction)
playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate, gainNode, offset=0, onended, output, pannerNode) // Low level sample playback
createAudioBuffer(sampleChannels, sampleRate) // Copy arrays of samples into an audio buffer
playAudioBuffer(buffer, volume=1, rate=1, pan=0, loop=false, gainNode, offset=0, onended, output, pannerNode) // Play an audio buffer, shareable between sounds
```

## LittleJS Audio Effects
- Optional plugin with Web Audio effects, each with a wet/dry mix
- Route a group of sounds with `sound.output = effect`, or everything with `setAudioMasterEffect(effect)`
- Chain effects with `effect.connect(next)`, never by assigning `effect.output`, that is the effect's own node

```javascript
AudioEffect(mix=1)                                // Base class, input and output gain nodes with a mix between
AudioEffect.input / AudioEffect.output            // Its own nodes, output feeds the master gain until connect() moves it
AudioEffect.setMix(mix, fadeTime=0)               // 0 is fully dry, 1 is fully wet
AudioEffect.connect(effectOrNode)                 // Send output into the next effect instead, returns it
AudioEffect.disconnect()                          // Stop sending output anywhere
AudioFilter(type='lowpass', frequency=1000, q=1, mix=1) // Muffle sounds, setFrequency(hz, fadeTime) to sweep
AudioReverb(duration=2, decay=2, mix=.5)          // Room or cave from generated noise, setRoom(duration, decay) to change it
AudioDelay(time=.3, feedback=.4, mix=.5)          // Echoes, setTime and setFeedback while playing
AudioDistortion(amount=.5, mix=1)                 // Overdrive, setAmount rebuilds the curve
AudioCompressor(threshold=-24, ratio=12, mix=1)   // Stops clipping on the master bus, setThreshold, setRatio
AudioFilter.node, AudioReverb.node, ...           // Each effect's wrapped Web Audio node, for anything the above doesn't cover
```

## LittleJS Input System
- Tracks keyboard down, pressed, and released
- Tracks mouse buttons, position, and wheel
- Tracks multiple analog gamepads
- Routes touch input to mouse
- Virtual gamepad for touch devices

```javascript
// Keyboard, keys are KeyboardEvent.code names like 'KeyW', 'Space' or 'ArrowUp', not characters
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
gamepadPrimary                        // Index of the primary gamepad (first one with input, until it disconnects)
// every gamepad function below defaults to gamepad=gamepadPrimary, not pad 0
gamepadIsDown(button, gamepad=gamepadPrimary)      // Is gamepad button down?
gamepadWasPressed(button, gamepad=gamepadPrimary)  // Was gamepad button pressed this frame?
gamepadWasReleased(button, gamepad=gamepadPrimary) // Was gamepad button released this frame?
gamepadStick(stick, gamepad=gamepadPrimary)        // Get gamepad analog stick value
gamepadDpad(gamepad=gamepadPrimary)                // Get gamepad dpad as a direction vector
gamepadStickCount(gamepad=gamepadPrimary)          // Get number of analog sticks
gamepadConnected(gamepad=gamepadPrimary)           // Is the gamepad connected?
gamepadVibrate(gamepad=gamepadPrimary, duration=200, strongMagnitude=1, weakMagnitude=1, startDelay=0) // Rumble,
                                                   // durations in ms, browsers stop at 5 seconds with the delay
gamepadVibrateStop(gamepad=gamepadPrimary)         // Stop gamepad vibration

// Touch Gamepad
touchGamepadEnable = false            // Is on screen touch gamepad enabled? A real gamepad in use takes over
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
inputWASDEmulateDirection = true      // Should WASD keys be routed to the direction keys? Off for two players on one
                                      // keyboard, WASD and arrows
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
- Can have color and additive color applied
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
EngineObject.destroy(immediate=false)              // Destroy this object and children, removed at the end of the frame;
                                                   // immediate cuts attached emitters off instead of letting them finish
EngineObject.collideWithTile(tileData, pos)        // Tile collision resolve check
EngineObject.collideWithObject(object, push)       // Object collision resolve check, push is 3D only
EngineObject.getAliveTime()                        // How long since object was created
EngineObject.getSpeed()                            // Length of the velocity
EngineObject.applyAcceleration(acceleration)       // Apply acceleration
EngineObject.applyForce(force)                     // Apply force
EngineObject.getMirrorSign()                       // Get mirror direction (1 or -1)
EngineObject.localToWorld(pos)                     // Convert a point from this object's space to world space
EngineObject.worldToLocal(pos)                     // Convert a world space point to this object's space
EngineObject.localToWorldVector(vec)               // Convert a direction, rotation only, and back with
                                                   // worldToLocalVector(vec)
EngineObject.isOverlappingObject(object)           // Do the two boxes overlap?
EngineObject.isOverlapping(pos, size=(0,0))        // Does its box overlap a box, or a point with no size?
EngineObject.addChild(child, localPos, localAngle) // Attach a child at an offset; localPos only exists on a child
EngineObject.attach(child)                         // Attach a child where it is, the offset worked out for it
EngineObject.removeChild(child)                    // Remove a child, it stays where it was in the world
EngineObject.setCollision(solids=true, isSolid=true, tiles=true, raycast=true) // Set collision; raycast=false
                                                   // leaves it out of engineObjectsRaycast; an object with no width
                                                   // or height is not a solid obstacle, so it blocks nothing and
                                                   // nothing blocks it
EngineObject.persistent = false                    // true skips it in engineObjectsDestroy, for things that outlive
                                                   // a level like a camera; destroy() still destroys it

// Engine Object Members
EngineObject.pos           // World space position
EngineObject.size          // World space width and height
EngineObject.drawSize      // Size of object used for drawing if set
EngineObject.tileInfo      // Tile info to render object
EngineObject.angle         // Rotation angle for rendering
EngineObject.color         // Color to apply when rendered
EngineObject.additiveColor // Additive color to apply when rendered
EngineObject.mirror        // Should it flip along y axis when rendered
EngineObject.mass          // Weight of object, static if 0: it moves by its velocity but only others collide with it
EngineObject.damping       // Fraction of velocity kept each frame, 1 keeps all, 0 stops at once
EngineObject.angleDamping  // Fraction of angular velocity kept each frame, 1 keeps all, 0 stops at once
EngineObject.restitution   // How bouncy is it when colliding (0-1)
EngineObject.friction      // Fraction of sliding speed kept each frame on the ground, 1 is no friction; the
                           // more slippery of the object and the ground is used
EngineObject.gravityScale  // How much to scale gravity by
EngineObject.renderOrder   // Objects are sorted by render order
EngineObject.velocity      // Velocity of the object, world units per frame
EngineObject.angleVelocity // Angular velocity of the object, radians per frame
EngineObject.groundObject  // What it stands on this frame, a tile layer or an object, undefined in the air; a
                           // moving platform carries its rider through velocity.x, so a controller adds to it
EngineObject.clampSpeed    // Clamp velocity to objectMaxSpeed, true by default; false for fast bullets that do not
                           // collide, since each axis is clamped on its own, which bends a fast diagonal
EngineObject.parent / children // Set by addChild, a child is placed by its parent and sits out solid collision

// Engine Object settings
enablePhysicsSolver = true    // Enable collisions, between objects and with tiles?
objectDefaultMass = 1         // Default object mass for collisions
objectDefaultDamping = 1      // Fraction of velocity kept each frame (1 keeps all)
objectDefaultAngleDamping = 1 // Fraction of angular velocity kept each frame (1 keeps all)
objectDefaultRestitution = 0  // How much to bounce when a collision occurs (0-1)
objectDefaultFriction = .8    // Fraction of sliding speed kept each frame on the ground (1 is no friction)
objectMaxSpeed = 1            // Clamp each axis of velocity, world units per frame, so fast objects don't miss
                              // collisions; each axis on its own, so a faster diagonal bends toward 45 degrees
gravity = (0,0)               // How much gravity to apply to objects, added to velocity each frame

// Engine Object functions
engineObjectsCollect(pos, size, objects=engineObjects, testCenters=false) // size is a circle's diameter or a box's
                                                           // full size, objects whose box overlaps it; testCenters
                                                           // only those whose center is inside, a little faster
engineObjectsCallback(pos, size, callbackFunction, objects=engineObjects, testCenters=false) // destroyed objects are
                                                           // left out
engineObjectsRaycast(start, end, objects=engineObjects)    // only objects with collideRaycast set, which
                                                           // setCollision turns on
engineObjectsDestroy(immediate=true) // destroy every object except the persistent ones
```

## LittleJS Tile Layer System
- Caches arrays of tiles to off screen canvas for fast rendering
- Unlimited numbers of layers, allocates canvases as needed
- Interfaces with EngineObject for collision
- Collision layer is separate from visible layers
- It is recommended to have a visible layer that matches the collision
- Tile layers made without WebGL can be drawn to using their context with Canvas2D
- Drawn with WebGL by default, or straight to the main canvas when made with useWebGL=false

```javascript

// Canvas Layer
CanvasLayer(pos, size, angle=0, renderOrder=0, canvasSize=(512,512), useWebGL=true) // Create a canvas layer object
CanvasLayer.canvas          // The canvas used by this layer
CanvasLayer.context         // The 2D context of the canvas, read it back with context.getImageData(...)
CanvasLayer.updateWebGL()   // Creates or updates WebGL texture
CanvasLayer.draw(pos, size, color=WHITE, angle=0, mirror=false, additiveColor, screenSpace=false, context)
                            // Draw the layer centered at pos

// LittleJS Layer System
TileLayer(pos, size, tileInfo, renderOrder=0, useWebGL=true) // Create a tile layer object
TileLayer.setData(layerPos, data, redraw)      // Set data at position
TileLayer.clearData(layerPos, redraw)          // Clear data at position
TileLayer.getData(layerPos)                    // Get data at position
TileLayer.debugShow = true                     // Shown by the debug overlay's 8: Debug Tiles, off to leave a layer out
TileLayer.redraw()                             // Draw to an offscreen canvas
TileLayer.redrawStart(clear=false)             // Start drawing to the layer, for updating parts of it
TileLayer.redrawEnd()                          // Finish drawing to the layer
TileLayer.drawTileData(layerPos, clear=true)   // Draw the tile, inside redrawStart/End
TileLayer.drawLayerTile(pos, size=(1,1), tileInfo, color=WHITE, angle=0, mirror, additiveColor) // Draw a tile in
                                               // layer pixels, inside redrawStart/End
TileLayer.drawLayerRect(pos, size, color, angle=0) // Draw a rectangle in layer pixels, inside redrawStart/End
TileLayer.drawRect(pos, size, color, angle)    // Draw a rectangle onto the layer canvas in world space
TileLayer.drawTile(pos, size=(1,1), tileInfo, color, angle, mirror) // Draw a tile onto the layer in world space
TileLayer.clearLayerRect(pos, size)            // Clear a rectangle in layer pixels, inside redrawStart/End
// to draw on a layer made with useWebGL=false (or with WebGL off), pass its context to drawCanvas2D:
// drawCanvas2D(pos, size, angle, mirror, drawFunction, screenSpace, layer.context)
// on a WebGL layer use drawLayerTile/drawLayerRect inside redrawStart/End, its canvas is not shown

// Tile Layer Data Object
TileLayerData(tile, direction=0, mirror=false, color=WHITE) // Create tile data object, tile from 0 like tile(),
                                                            // undefined for an empty cell
TileLayerData.clear()                                       // Clear this tile data, it draws nothing

// Tile Collision Layer
TileCollisionLayer(pos, size, tileInfo=tile())      // Create a tile collision layer object, with no tile when no
                                                    // image is loaded, for a collision only layer
TileCollisionLayer.setCollisionData(layerPos, data=1) // Set tile collision data at a cell in the layer
TileCollisionLayer.getCollisionData(layerPos)       // Get tile collision data at a cell, 0 outside the layer
TileCollisionLayer.clearCollisionData(layerPos)     // Clear tile collision data at a cell
TileCollisionLayer.collisionTest(pos, size=(0,0), object) // Like tileCollisionTest for this layer only
TileCollisionLayer.collisionRaycast(posStart, posEnd, object, normal) // Like tileCollisionRaycast for this layer only
TileCollisionLayer.isSolid = true                   // Solid layers block objects and particles, the solidOnly tests
                                                    // skip the others
tileCollisionGetData(pos)                           // Get tile collision data at pos
tileCollisionTest(pos, size=(0,0), object)          // Check if collision should occur
tileCollisionRaycast(posStart, posEnd, object, normal, solidOnly=true) // Where the ray meets the first tile hit,
                                                    // or undefined; a normal vec2 passed in is set to the surface's
tileCollisionLayers                                 // List of all tile collision layers
tileLayersLoad(tileMapData, tileInfo=tile(), renderOrder=0, collisionLayer, draw=true) // collisionLayer is the index
                                                    // of the layer that gets collision, no tile when no image is loaded
                                                    // Load tile layers from exported data, Tiled flips and turns included;
                                                    // groups are flattened and layer indices count that flat list,
                                                    // hidden layers load with collision but are not drawn

```

## LittleJS Particle System
- Simple kinematic particle system with many parameters
- [Particle Effect Designer](https://killedbyapixel.github.io/LittleJS/examples/particles) - Editor for creating LittleJS Particle Systems

```javascript
// Particle Emitter Object
ParticleEmitter(pos, angle, emitSize, emitTime, emitRate, emitConeAngle, tileInfo, colorStartA, colorStartB,
    colorEndA, colorEndB, particleTime, sizeStart, sizeEnd, speed, angleSpeed, damping, angleDamping,
    gravityScale, particleConeAngle, fadeRate, randomness, collideTiles, additive, randomColorLinear,
    renderOrder, localSpace) // Create a particle system, speeds are per frame; collideTiles is for world space only
emitter.trailScale / velocityInheritance / restitution / friction / emitCircle // More settings, set after making it
emitter.particleCreateCallback / particleDestroyCallback / particleCollideCallback // Called with each particle
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
Tween.then(callback)           // Set onComplete, called after the last pass or loop, returns this
Tween.onComplete               // Completion callback, kept by restart, not called by stop
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
pf.maxLoop = undefined     // max A* steps per search, undefined for the cell count so a search always finishes
pf.searchGaveUp            // true when the last search stopped at maxLoop, an empty path then means it gave up
pf.smoothPath = true       // run smoothing pass on result
pf.debug = false           // draw search visualization
pf.debugTime = 1           // seconds debug visuals persist

// Main API
pf.findPath(startPos, endPos, rebuild=true) // Returns array of world positions, or empty if no path;
                                     // rebuild false reuses the grid read from the layer last time
pf.buildNodeData()                   // Read the grid from the layer again, what findPath does when rebuild is true
pf.getNearestClearNode(worldPos, searchRange=10, rebuild=true) // Snap an obstructed point to the nearest open tile
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
- A click on the UI, or a navigation press (Space, Enter, gamepad A) that activates it, is used up before objects update and `gameUpdatePost`, so read world clicks there; `gameUpdate` runs first and still sees it, so check `uiSystem.isMouseOverUI()` there; only the press is used up, `mouseIsDown` stays true while it is held, so a held action like auto fire checks `uiSystem.isMouseOverUI()` too
- See `examples/uiSystem/`, `examples/shorts/uiSystem.js` and `examples/shorts/uiSlice.js` for demos

```javascript
// Setup
const ui = new UISystemPlugin()        // Creates global uiSystem
uiSystem.defaultColor                  // Default style values used by all widgets
uiSystem.defaultLineColor              // (override before constructing widgets)
uiSystem.defaultTextColor / defaultButtonColor / defaultHoverColor / defaultDisabledColor / defaultGradientColor
uiSystem.defaultLineWidth / defaultCornerRadius / defaultTextFitScale / defaultFont
uiSystem.defaultSoundPress / defaultSoundRelease / defaultSoundClick // Sounds every widget plays
uiSystem.defaultShadowColor / defaultShadowBlur / defaultShadowOffset
uiSystem.defaultSlice                  // a TileSlice drawn in place of every widget's rectangle, tinted by its state
                                       // color, undefined for rectangles; needs the drawUtilities plugin
uiSystem.defaultHandleSlice            // a TileSlice for slider handles, undefined for the slider's own slice
obj.slice / slider.handleSlice         // the same for one widget, starting from the defaults
uiSystem.drawSlice(slice, pos, size, color=WHITE) // Draw a TileSlice to the UI context
uiSystem.nativeHeight                  // If set, UI coords are normalized to this height
uiSystem.destroyObjects()              // Remove all UI elements
uiSystem.isMouseOverUI()               // True if the mouse is over a visible hoverable UI object, or a confirm dialog is open
uiSetDebug(enable)                     // Toggle uiDebug rendering of widget bounds

// Confirm dialog
uiSystem.showConfirmDialog(text='Are you sure?', yes, no, size, exitKey='Escape') // the exit key or gamepad B answers no, the title and buttons scale with size

// Drawing helpers (use these instead of the engine's draw* during UI rendering)
uiSystem.drawRect(pos, size, color, lineWidth, lineColor, cornerRadius, gradientColor, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawTile(pos, size, tileInfo, color, angle, mirror, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawText(text, pos, size, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth, textShadow, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawLine(posA, posB, lineWidth, lineColor)

// Base widget
new UIObject(pos=vec2(), size=vec2())
UIObject.anchor                        // vec2 in [-1,1]; anchors to parent (or canvas if root) + self-pivot; default vec2()=center
UIObject.localPos                      // Position from its anchor, what the pos passed in sets; move or tween this,
                                       // nativePos is worked out from it each frame
UIObject.visible / disabled            // Hidden objects are skipped, disabled ones draw but do not respond
UIObject.text / textHeight             // The text it draws, and a fixed height per line, undefined fits it to the
                                        // size, its lines sharing the height
UIObject.navigationIndex               // Order for keyboard and gamepad navigation, undefined leaves it out
UIObject.addChild(child)               // Returns child, parents it
UIObject.removeChild(child)
UIObject.destroy()
UIObject.isHoverObject()               // True if mouse is over this object
UIObject.isInteractive()
UIObject.onClick / onPress / onRelease / onChange / onEnter / onLeave / onUpdate / onRender // Hooks
UIObject.onKeyDown(e)                  // Each key while this object is uiSystem.keyInputObject
uiSystem.keyInputObject                // The object being typed into; end typing with field.stopEditing(),
                                       // which also fires its onChange

// Widgets
new UIText(pos, size, text='', align='center', font)
new UITile(pos, size, tileInfo, color, angle=0, mirror=false)
new UIButton(pos, size, text='', color)
new UICheckbox(pos, size, checked=false, text='', color)  // .checked toggles on click
new UISlider(pos, size, value=.5, text='', color, handleColor)  // .value in [0, 1]
new UITextInput(pos, size, text='')   // .text holds current value; reads a physical keyboard, no on-screen keyboard,
                                      // IME or paste, use an HTML input for those
new UIVideo(pos, size, src, autoplay=false, loop=false, volume=1)
UIVideo.play() .pause() .stop() .setTime(time) .setVolume(volume) .setPlaybackRate(rate)
UIVideo.isPlaying() .isPaused() .isLoading() .hasEnded() .getCurrentTime() .getDuration()

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
- Shadows: set `lightSystem.shadows` and every object draws black into a shadow map that blocks the lights by its alpha, so smoke or a fading sprite casts a partial shadow; a `TileCollisionLayer` casts only from its cells with collision, and a plain floor `TileLayer` needs `castShadow = false` or it blacks out the map
- The lightmap darkens WebGL draws only, so a HUD drawn with WebGL in gameRenderPost goes dark too; draw it with `useWebGL=false` or from a plugin made after this one
- See `examples/shorts/lightShadows.js` for shadows, glass, a coin left out with castShadow and an emissive lava brick
- Must be constructed BEFORE `PostProcessPlugin` so post-process sees lit pixels
- See `examples/shorts/lightSystem.js` for a demo

```javascript
// Setup (call in gameInit, after engineInit has made the WebGL context)
new LightSystemPlugin()                       // Defaults: full-canvas lightmap, BLACK ambient
new LightSystemPlugin(vec2(512, 512))         // Lower-res lightmap (perf knob)
new LightSystemPlugin(undefined, rgb(.1,.1,.15)) // Faint moonlight ambient

// Tunables
lightSystem.enabled       = true              // Skip the render pass entirely when false
lightSystem.ambientColor  = rgb(0, 0, 0)      // Color of unlit areas

// Shadows: once a frame every object draws black into a shadow map, and each light's rays stop at them
lightSystem.shadows          = false  // on for shadows; off costs nothing
lightSystem.shadowMapSize    = 1024   // pixels across the shadow map, a square of world around the camera
lightSystem.shadowMapScale   = 2      // how many views the map spans, so casters just off screen still cast in;
                                      // raise it when lights reach further than a view past the screen
lightSystem.shadowTextureSize = 256   // pixels across each light's own shadow texture, larger is sharper; a gap
                                      // narrower than about 4*radius/shadowTextureSize between casters closes
lightSystem.shadowPassCount  = 16     // stretch passes per light, fewer is cheaper and shorter shadows
lightSystem.shadowSoftness   = .5     // light bled into a caster's near side, 0 hard, 1 most; it reaches further
                                      // in under a big light, lower it if thin walls let light in
lightSystem.shadowPass                // read only: true inside the shadow pass, so a render() can skip its text or glow
lightSystem.emissivePass              // read only: true while emissive objects draw into the lightmap
lightSystem.setShadowTransparent(on)  // in the shadow pass the draws that follow keep their color, tinting the light
                                      // through them (glass, colored smoke); nothing outside it, so call it around
                                      // the draws and set it back
light.castShadow = true               // this light's rays stop at casters; a light inside a caster is blocked
light.shadowCore = 0                  // radius around the light where casters are left out, so its lamp, torch
                                      // or the player carrying it does not block it; reach past its corners
obj.emissive = 0                      // 1 shows it at full brightness in its own colors, lit or not, between partly;
                                      // exact for solid pixels, a half alpha one shows at a quarter
obj.renderEmissive()                  // draws its glowing shape into the lightmap, render() by default; override to
                                      // glow only a part, like a robot's eyes
obj.castShadow = true                 // draws into the shadow map; false for a floor TileLayer, a background, a pickup
layer.shadowSolidOnly = true          // a TileCollisionLayer casts only from its cells with collision, as they are
                                      // drawn, so a floor in the same layer stays lit; false casts every tile
obj.renderShadow()                    // draws the shadow shape, render() by default, screen space draws skipped;
                                      // a figure draws a blob at its feet
                                      // to stay lit; additive draws add black so glows cast nothing; WebGL draws only

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
- Shadertoy style uniforms: iTime, iResolution, iChannel0 (the frame just drawn), and iChannel1 (the previous
  frame's output) when feedbackTexture is set, for trails and echoes
- See `examples/shorts/postProcess.js` for a demo

```javascript
new PostProcessPlugin(shaderCode, includeMainCanvas=false, feedbackTexture=false) // call in gameInit; with no
                               // shaderCode the image passes through unchanged
postProcess                    // Global instance created by the plugin
postProcessBloom(threshold=.6, strength=1, size=6, includeMainCanvas=false) // set up a ready made bloom effect, so
                               // bright colors and lights glow; threshold is where the glow starts, and the 2D canvas
                               // is left out so HUD text stays crisp; a wider glow takes more samples to stay smooth,
                               // and past a size of 32 it would take hundreds, so that is as wide as it goes
postProcessBloomShader(threshold, strength, size) // its shader code, to pass to PostProcessPlugin or build on
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
randInSphere(radius=1, minRadius=0) // random point inside a sphere, even through its volume, like randInCircle
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
Matrix4.translation(v) Matrix4.rotation(euler, out) Matrix4.scaling(v)   // new Matrix4 or Matrix4.identity() is the identity
Matrix4.perspective(fov, aspect, near, far)    // fov is vertical, radians
Matrix4.orthographic(left, right, bottom, top, near, far)
Matrix4.lookAt(eye, target, up)                // transform of an object at eye facing target, invert it for the view
                                               // matrix of a camera there
m.multiply(m2)                 // m = m * m2, m2 is applied to points first
m.translate(v) m.rotate(euler) m.scale(v)      // append a transform, returns self
m.invert() m.transpose()       // in place, return self
m.copy() m.transformPoint(v) m.transformDirection(v) m.getTranslation() // or v.transform(m), v.transformDirection(m)
m.getScale() m.getRotation()   // the scale and the vec3(pitch, yaw, roll) back out of a transform, a mirror is a negative x
buildMatrix(pos, rotation, scale, out)         // translate * rotate * scale, any arg optional; out is written into
                                               // instead of a new matrix, for a loop that builds many each frame

// Collision - boxes are axis aligned and centered with full size, spheres and cylinders take a radius, cylinders stand
// on Y
isPointInBox3D(point, pos, size)               // true if point is in the box, boundary inclusive
isOverlapping3D(posA, sizeA, posB, sizeB)      // box vs box, touching edges do not overlap; no sizeB tests a point
collideSphereSphere(posA, radiusA, posB, radiusB)          // push A out of B, or undefined
collideSphereBox(pos, radius, boxPos, boxSize)             // push a sphere out of a box, or undefined
collideSphereInBox(pos, radius, boxPos, boxSize)           // push a sphere back inside a box, for rooms and arenas
collideSphereCylinder(pos, radius, cylinderPos, cylinderRadius, cylinderHeight) // push a sphere out of a cylinder,
                                                                                // or undefined
collideBoxBox3D(posA, sizeA, posB, sizeB)      // push A out of B the shortest way, or undefined; the 3D twin of
                                               // collideBoxBox
// raycasts return the distance t where the hit is ray.getPosition(t), so scale direction and t scales too
new Ray3D(origin, direction)                   // a start and a direction, what screenToRay returns
ray.getPosition(distance)                      // the point a distance along it, distance is what the raycasts return
raycastSphere(ray, pos, radius)                // distance t to the sphere, or undefined; a ray that starts
                                               // inside a sphere or a box is already there and gets back 0
raycastPlane(ray, planePos, planeNormal)       // distance t to the plane, or undefined
raycastBox(ray, pos, size)                     // distance t to the box, or undefined
```

## LittleJS 3D Rendering
- Optional plugin in the dist bundle like the others, draws meshes, billboards (flat pictures that turn to face the
  camera), lines and particles into the engine's WebGL canvas, under the 2D layer by default
- Requires the 3D Math plugin. One shader: directional, ambient and point lights, specular, fog, shadows, textures,
  vertex colors; any object or draw can bring its own Shader on top of it, see render3D.shader
- EngineObject3D extends EngineObject, so update, destroy, timers, children and renderOrder all work; the 2D pos is
  ignored by rendering
- The 3D pass is the part of the frame that draws 3D, and it draws in two rounds: the opaque stage for solid things
  first, then the transparent stage for see-through things; every object and callback runs with the draw state set from
  the object's flags
- 3D draws only work inside the 3D pass, from an object's `render3D()` or from `onRenderOpaque` / `onRenderTransparent`;
  drawing from `gameRender` asserts, and anything that fades (soft discs, soft shadows) must be in the transparent stage
- Builders and draws take full sizes (diameters) like buildBox and drawCircle; collision helpers and lights take radii
- Textures sample through mipmaps in 3D so floors do not shimmer in the distance, crisp up close when tilesPixelated
  is on; render3D.mipmaps = false keeps each texture's own filtering, and 2D sprites always do
- The 3D scene is on the engine's WebGL canvas, so the post processing plugin shades it too: call postProcessBloom()
  after new Render3DPlugin to make lights glow, see the render3dGlow demo
- Opaque draws drop texels under half alpha, so cut out art like a fence or a leafy tree works and its shadow matches;
  see through draws blend instead, set obj.transparent for a sprite that fades
- A texture comes before its tint like drawTile, except where per vertex colors are part of the geometry (drawStrip,
  drawRibbon)
- Y is up and -Z is forward, so the ground is the XZ plane: 2D input maps to it as vec3(move.x, 0, -move.y), forward for
  a yaw is vec3(-sin(yaw), 0, -cos(yaw)) and right is vec3(cos(yaw), 0, -sin(yaw))
- Below, `name = value` shows a value to set; when that is not the default, the comment says what the default is,
  or `e.g.` marks it as an example
- See the `examples/shorts/render3d*.js` demos - features: render3dBasics to start, render3dShapes,
  render3dBillboards, render3dHeightMap terrain, render3dCollision with picking, render3dFirstPerson for a walking
  camera, render3dLights, render3dParticles, render3dTrails, render3dDraw for immediate drawing, render3dText,
  render3dMesh for OBJ loading, render3dLayers for 3D layers in a 2D scene, render3dInstancing, render3dTextures,
  render3dGlow, render3dShaders; games: render3dDodgeGame, render3dRacingGame, render3dPuzzleGame; and `examples/3d`
  is a full example with all of it in one scene

```javascript
// Setup (call in gameInit)
new Render3DPlugin;                  // creates global render3D, renders automatically before gameRender

// A first 3D scene
function gameInit()
{
    new Render3DPlugin;                                  // draws itself every frame, before gameRender
    render3D.setSky();                                   // dome colors, also sets the fog color
    new EngineObject3D(vec3(), buildGrid(vec2(20), 20)); // the ground is the XZ plane, Y is up
    new EngineObject3D(vec3(0, 1, 0), buildBox(), undefined, RED);
    render3D.camera.orbit(vec3(0, 1, 0), 12, 0, .4);     // or set camera.pos and camera.lookAt(target)
}

// Camera
render3D.camera.pos = vec3(0, 5, 10) // Camera3D: pos (0, 0, 10), rotation (pitch, yaw, roll), fov PI/3, near .1,
                                     // far 1000, which can be Infinity for a perspective view
render3D.camera.orthographic = 20     // visible height in world units with no perspective, so distance does not
                                      // shrink things; 0 is the normal perspective view; near and far still clip,
                                      // and far must be a real distance here, Infinity is perspective only
render3D.camera.lookAt(target)        // set the rotation to face a target now, clears roll
render3D.camera.orbit(target, distance, yaw, pitch=.5) // put the camera on an orbit looking at the target
new CameraControl3D(target, distance, pitch=.4, idleSpin=0) // an object that orbits the camera around its pos3D:
                               // drag to turn, wheel to zoom; fields for dragButton, dragSpeed, zoomSpeed, zoomRange,
                               // pitchRange, yaw and idleSpin; destroy it to hand the camera back
new FirstPersonCamera3D(pos3D, yaw, pitch) // mouse look and WASD or arrows to move, the camera at its pos3D;
                               // click captures the mouse, Esc lets it go; each defaults to where the camera is now,
                               // so it takes over without a jump; fields for moveSpeed, lookSpeed, pitchRange,
                               // lockPointer, and fly to move the way it looks instead of walking level; give it a
                               // size3D and setCollision() to walk into solids, destroy it to hand the camera back
render3D.camera.follow(target, offset, percent=1) // chase camera: ease toward target + offset and look at it, percent
                                                  // is how far it moves each call, so call it every frame, from
                                                  // gameUpdatePost once the target has moved
render3D.camera.align2D = true        // lock to the 2D camera so the z=0 plane matches world space, false by default
render3D.camera.getForward() .getRight() .getUp() // the camera's axes as it is right now; render3D.cameraRight
                                                  // .cameraUp .cameraForward are this frame's, read only
render3D.viewMatrix .projectionMatrix .viewProjection .shadowMatrix // this frame's, rebuilt by updateMatrices()
render3D.camera.getMatrix() .getViewMatrix() .getProjectionMatrix(aspect) // built from the camera as it is now
render3D.worldToScreen(pos, canvasSize) // Vector3 -> screen pixels, undefined when behind the camera; the opposite
                                      // of screenToRay and it takes the same canvas, so the two agree
render3D.worldToClip(pos)             // Vector3 -> -1 to 1 across and up the screen, z is depth; undefined when behind
                                      // the camera
render3D.screenToRay(screenPos, canvasSize)  // Ray3D under a screen point, always returns one; canvasSize
                                     // defaults to the main canvas, and both of these bring the matrices up to
                                     // date for it, so worldToScreen keeps agreeing with them
render3D.screenToGround(screenPos, groundHeight=0, canvasSize) // where that ray meets a flat ground plane, or
                                                   // undefined; terrain has HeightMap.raycast
render3D.pick(screenPos or ray, objects)           // {object, distance} of the nearest object hit, the box of its mesh
                                                   // or a sprite's size3D; a screen position goes through screenToRay
render3D.playSound(sound, pos3D, volume, pitch, randomnessScale, loop, paused) // like sound.play(pos): quieter with
                                                // distance from the camera, panned by side
render3D.playSoundLoop(sound, pos3D, volume, pitch, randomnessScale) // the same on a loop; its volume and pan
                                                // are set when it starts
render3D.isSphereVisible(center, radius) // the same is-it-on-screen test drawMesh uses, for skipping your own draws

// Lights and fog, read at each draw
render3D.sunDirection = vec3(-.3, 1, .5) // toward the sun, where its light comes from, like a directional Light3D;
                                         // any length, it is normalized for you; the sun is the one light that
                                         // casts shadows
render3D.sunColor = hsl(.08, 1, .95) // e.g., WHITE by default
render3D.ambientColor = hsl(0, 0, .3)  // from above once ambientGroundColor is set
render3D.ambientGroundColor = undefined // set, ambient blends from it on faces pointing down to ambientColor on
                                        // faces pointing up, the way a sky and a ground light a scene; setSky sets both
render3D.fogColor = undefined         // uses canvasClearColor when undefined
render3D.fogStart = 20; render3D.fogEnd = 100 // e.g., both 0 by default which is no fog; measured by camera distance,
                                              // fogEnd 0 disables fog; additive draws fade out with distance instead
                                              // of taking the fog color, since adding it would brighten them
render3D.gravity = vec3(0, -.01, 0) // e.g., vec3() by default so nothing falls; objects with a mass fall by this each
                                    // frame, times their gravityScale, and slow by their damping, which is 1 by
                                    // default for no slowing
new Light3D(pos3D, radius, color, intensity=1) // point light, an EngineObject3D; it drops off fast, so a small
                                  // radius wants an intensity above 1; an alpha, intensity or radius of 0 is off
light.intensity = 2               // brightness, multiplies the color, above 1 is brighter than white
new DirectionalLight3D(pos3D, color, intensity=1) // a Light3D that shines from far away with no falloff, from its
                                  // position toward the origin like a three.js DirectionalLight; moving it or
                                  // its parent swings the light, so parent it to a sun mesh and it follows
// 8 lights reach the shader each frame: every directional light first, then the point lights nearest the camera;
// a light switched off by its alpha, intensity or radius is left out so it cannot take a slot from one that is on;
// none of them cast shadows, only the sun does; each makes its own highlight when specular is set

// Shadows - one shadow map from the sun; lit opaque objects and draws on the default side of the 2D scene
// cast and receive
render3D.shadows = true // off by default and free when off, soft shadows (drawSoftShadow) still work alongside
render3D.shadowMapSize = 1024         // pixels across the shadow map, rebuilt when it changes
render3D.shadowRange = 40             // world size the map covers around shadowCenter, smaller is sharper
                                      // it is a square facing the light, so ~1.5x an area's width covers it
render3D.shadowCenter = undefined // Vector3 center of the shadowed area, read each frame; undefined follows the camera
render3D.shadowBias = .003 // raise if lit surfaces get speckled with their own shadow, lower if shadows float away
                           // from their casters
render3D.shadowSoftness = 1           // how far to blur the shadow edge, in shadow map pixels

// Sky
render3D.setSky(topColor, horizonColor, bottomColor, ambient=.5) // dome colors straight up, level and straight
                                                     // down; sets render3D.sky, fogColor to the horizon, and the
                                                     // ambient light to the top color from above and the bottom
                                                     // color from below, both times ambient; 0 leaves ambient dark
render3D.setFog(fogStart, fogEnd, fogColor) // the fog distances and color at once, no color keeps the current one
render3D.sky = buildSky(topColor, horizonColor, bottomColor, sides, rings) // or set a dome yourself

// Draw state, read at each draw; the pass sets it from each object's flags before render3D() and resets it before each
// callback, so set it inside those, or use the object flags below
render3D.lighting = true              // false draws plain vertex color times texture, as billboards and lines do
render3D.emissive = 0                 // how much a surface lights itself, set from each object's emissive
render3D.additive = false             // additive blending in the transparent stage
render3D.specular = 0                 // Phong highlight strength, the shiny spot where the sun and each
                                      // Light3D reflect: 1 adds a light's full color at its peak, more burns
                                      // out; the size of the spot is fixed
render3D.receiveShadow = true         // false keeps the next draws out of the shadow map's darkening
render3D.shader = undefined           // a Shader for the next draws, set from each object's shader; with emissive 1
                                      // the snippet's color is final, so it can light itself from these 3D names:
                                      // worldPos, worldNormal, cameraPos, sunDirection (toward the sun), sunColor,
                                      // ambientColor, ambientGroundColor, lightCount, lights[i] (xyz position, or
                                      // direction toward a directional one, w radius, negative when directional),
                                      // lightColors[i] (rgb, a strength) and shadow(), the sun shadow 0 to 1 here
render3D.cullBackFaces render3D.mirrored // set from each mesh as it draws: its doubleSided, and whether its
                               // transform mirrors it; strips leave both off
render3D.depthTest = true; render3D.depthWrite = true // the transparent stage turns depth writes off, so see-through
                                                      // draws never hide each other

// The pass
render3D.onRenderOpaque = ()=> {} // after the opaque objects: world geometry drawn outside of objects, also called for
                                  // the shadow map
render3D.onRenderTransparent = ()=> {} // after the transparent objects: billboards, glows and soft shadows drawn
                                       // outside of objects
render3D.queueTransparent(pos, draw)   // sort your own transparent draw in with the rest, draws now when sorting is off
render3D.isRendering render3D.shadowPass // read only: inside the 3D pass, and inside the shadow map part of it
render3D.sortTransparent = true // transparent draws sort far to near by depth along the view, right for an
                                // orthographic camera too, so alpha and additive mix; false keeps object order
render3D.frustumCulling = true // drawMesh skips meshes whose bounding sphere is outside the frustum, the wedge of
                               // space the camera can see
render3D.mipmaps = true        // textures sample through mipmaps so they do not shimmer far away, false keeps each
                               // texture's own filtering like 2D; magnification follows tilesPixelated either way
obj.pixelated = true           // false by default; keep one object's texture pixels hard edged, no mipmaps or blending
                               // between them, for pixel art that should not blur or bleed into its neighbors
render3D.anisotropy = 4        // sharper textures seen at an angle, 1 to 16, 1 is off; needs mipmaps
render3D.instancing = true     // every use of a mesh in the opaque stage is one draw call however many there are,
                               // mesh.instanced = false keeps one mesh drawing in object order instead
new InstancedMesh3D(mesh, count, tileInfo, color) // many copies of a mesh as one draw with their transforms kept on the
                                  // GPU: an instance costs nothing per frame until it changes, for big sets that
                                  // mostly stay put; an EngineObject3D whose flags cover the whole set
set.setMatrixAt(i, matrix)        // place an instance, in world space, the object's own transform does not move them
set.setColorAt(i, color)          // color one, they start in the object's color; getMatrixAt(i) reads one back
set.count = 500                   // draw the first 500 of the count it was made with
render3D.renderAfter2D = false // true draws the 3D scene on top of the 2D scene instead of under it; objects that do
                               // not set their own renderAfter2D follow this
render3D.smoothShading = true  // default for every builder's smooth argument, false (flat) by default;
                               // meshes already built keep the normals they have

// Objects - EngineObject with a 3D transform, drawn by the 3D pass
new EngineObject3D(pos3D, mesh, tileInfo, color) // a tileInfo with no mesh draws a sprite billboard of size3D in the
                                                 // transparent stage, already transparent without setting the flag;
                                                 // size3D.z does not change how a sprite draws, only how it collides;
                                                 // a whole TextureInfo is kept as the
                                                 // tile covering it, so obj.tileInfo is always a TileInfo as it is in 2D
obj.pos3D obj.rotation3D obj.scale3D // Vector3, rotation is (pitch, yaw, roll); change them in place or assign new ones
obj.velocity3D obj.angleVelocity3D // added to pos3D and rotation3D by the engine before update, like the 2D physics,
                                   // no super.update() needed; angleVelocity3D is not damped, angleDamping is 2D only
obj.updatePhysics()                // moves it and pushes it out of solids; bounce off anything else in update, which
                                   // runs once every object has moved, so the fix lands before the frame draws
obj.mass = 1 // objects start with no mass and stay put; with a mass render3D.gravity, gravityScale and damping act on
             // velocity3D, damped first and gravity added after as in 2D, and damping is 1 by default for no slowing
obj.size3D                              // full size for engineObjectsCollect3D, solid collision and
                                        // sprites, which it also picks by, a mesh is picked by its own box;
                                        // starts at the size of the mesh's box, 1 with no mesh; the box is
                                        // centered on pos3D, so center() a mesh whose origin is not its middle;
                                        // scale3D and a parent's scale grow it
obj.setCollision(solids, isSolid)       // the same flags as in 2D, but the collision happens in 3D against size3D;
                                        // isSolid needs solids, an object cannot block without colliding;
                                        // a 3D object has no 2D size, so it is never an obstacle in a 2D scene;
                                        // both objects of a pair need solids, and a pair where neither one blocks
                                        // passes through, so movers hit the level without shoving each other;
                                        // heavier objects move less and each bounces by its own restitution; mass 0
                                        // stays put and keeps its velocity, a wall the other bounces off;
                                        // the tile and raycast halves are 2D only and default off here;
                                        // a sync2D object collides in 2D instead, against the 2D size, so set that
                                        // as well as size3D; a child rides with its parent so it sits solid collision
                                        // out, the same rule as in 2D; the solid box is axis aligned in the world,
                                        // rotation3D is ignored as angle is in 2D, so give a turned wall a size3D
                                        // along the world axes
obj.collideAsSphere3D = true              // collide as the sphere that fits size3D instead of the box, false by default
obj.collideWithObject(object, push)     // called when it touches a solid object, both objects are asked and either
                                        // returning false leaves the push and the bounce to you; push is what it
                                        // takes to move this one clear, it is undefined in 2D
obj.softShadow = 2                      // 0 by default; a soft shadow of that diameter under the object on
                                        // render3D.softShadowHeight; scale3D and a parent's scale grow it, so set it
                                        // for the unscaled object
obj.upright = true                      // a sprite stands on world up instead of tilting toward the camera, false by
                                        // default
                                        // a sprite also turns with rotation3D.z, like a 2D object turns with angle
obj.sync2D = true // false by default; copy the 2D pos and angle into pos3D and rotation3D each frame; the 2D physics only run for a
                  // sync2D object, so set its mass to have them move it
// these inherited EngineObject fields are 2D only and do nothing on a 3D object: angle, angleVelocity,
// angleDamping, additiveColor, drawSize, mirror, clampSpeed, friction, groundObject; sync2D is the one way in
obj.mesh obj.tileInfo obj.color         // what to draw and how
obj.setMesh(mesh)                       // draw a different mesh and free the GPU buffer of the one it replaces, for
                                        // text and terrain built again as things change; a mesh another object is
                                        // still drawing is left alone, so shared builders are safe
obj.transparent = true                  // draw in the transparent stage, blended, sorted far to near, no depth writes;
                                        // false by default, true for a sprite
obj.additive = true                     // additive blending, implies the transparent stage, false by default
obj.emissive = 1                        // 0 by default; how much it lights itself: 0 lit, 1 its own color for lamps and glowing
                                        // things, between partly self lit, above 1 brighter for bloom; still casts
obj.specular = .5                       // highlight strength, 0 is none and 1 is full, as render3D.specular; 0 by default
obj.castShadow = false                  // true by default, false keeps it out of the shadow map; sprites and cut out
                                        // textures cast their outline, an object faded below half its alpha casts
                                        // nothing, a see through one casts only when textured, additive never casts
obj.receiveShadow = false               // true by default, false draws it without the shadow map's darkening
obj.renderOrder                         // sorts the opaque stage; instanced meshes draw as batches, so set
                                        // mesh.instanced = false on a mesh whose order matters
obj.renderAfter2D = true // this object on top of the 2D scene, or false for under it; undefined follows
                         // render3D.renderAfter2D
// the layer under the 2D scene and the layer over it are drawn separately with their own depth, so neither hides the
// other; the sky, callbacks and debug primitives draw with the default side
obj.getMatrix() // buildMatrix(pos3D, rotation3D, scale3D), or localMatrix when set, composed with an EngineObject3D
                // parent's
obj.localMatrix // a Matrix4 from the parent used in place of pos3D, rotation3D and scale3D, for a pose they cannot
                // hold; glTF animations pose parts with it and it stays after they stop, set it to undefined to move a
                // part by pos3D again; undefined by default
obj.getWorldPos3D()                     // world position, pos3D is local when parented
obj.getForward3D() .getRight3D() .getUp3D() // the object's axes in the world, forward is -Z
engineObjectsCollect3D(pos, size, objects, testCenters) // the EngineObject3D objects whose boxes overlap a sphere,
                                           // size a number (diameter, 0 for a point), or a box, size a vec3;
                                           // testCenters as in 2D
engineObjectsCallback3D(pos, size, callback, objects, testCenters)
engineObjectsRaycast3D(ray, objects)       // every object along the ray, nearest first, like engineObjectsRaycast in
                                           // 2D; the ray has no end, use render3D.pick for just the nearest one
obj.lookAt(target)                      // turn -Z toward a world space point: sets pitch and yaw, clears roll;
                                        // a child aims through its parent, since its rotation3D is local
obj.render3D() // override for custom drawing, the draw state is already set from the flags; render() is empty
// children attached with addChild follow an EngineObject3D parent's 3D transform, pos3D is then local; addChild's 2D
// offset arguments do nothing in 3D; attach keeps a child where it is and works its pos3D, rotation3D and scale3D out,
// and removeChild leaves it where it was in the world, both as close as those three values can get under a shear,
// and exactly for a child with a localMatrix

// Draw right now, no object needed - only inside render3D() or a pass callback, drawing elsewhere asserts; strips batch
// into one draw per texture and state
render3D.drawBox(pos, size, color, rotation)              // size is a vec3 or a number, untextured
render3D.drawSphere(pos, size, color)                     // size is the diameter, untextured
render3D.boxMesh render3D.sphereMesh                      // the size 1 meshes those use, for any box or sphere
                                                          // object so they all draw in one batch; set scale3D and
                                                          // color on the object, editing the mesh changes them all
render3D.planeMesh render3D.planeMeshDoubleSided          // a size 1 square facing +Y, seen from above only, or seen
                                                          // and lit from both sides for signs and cards; stand it
                                                          // up with rotation3D, size it with scale3D
render3D.billboardMesh                                    // a size 1 square facing +Z with the tile across it, what a
                                                          // ParticleEmitter3D draws its particles as instances of
render3D.drawMesh(mesh, matrix, tileInfo, color) // any mesh, batched with its other uses; tileInfo can be a TextureInfo
                                                 // for the whole texture, uvs past 1 repeat when it wraps
render3D.drawBillboard(pos, size, tileInfo, color, angle, upright) // camera facing quad, unlit, size is a Vector2;
                                                                   // upright stands on world up
// list points counter clockwise as seen from the front, or the face points away and a culling mesh hides it
render3D.drawQuad(a, b, c, d, tileInfo, color)            // corners in loop order, a is the texture's top left
render3D.drawTriangle(a, b, c, color)
render3D.drawLine(posA, posB, width, color)               // camera facing ribbon, unlit
render3D.drawRibbon(points, width, tileInfo, color, side) // strip along a path, unlit, two sided; width and color one
                                                          // or per point, texture runs along it, side faces the camera
                                                          // unless given; a path ending where it starts joins as a loop
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

// Debug primitives - like debugRect and friends, drawn on top of the scene in debug builds; debugClear clears them too
debugBox3D(pos, size, color, time, rotation)
debugSphere3D(pos, size, color, time)
debugLine3D(posA, posB, color, width, time)
debugPoint3D(pos, color, time, size)

// Meshes - triangle strips, sent to the GPU on first render, drawn by matrix; dispose a mesh you stop using to free
// its GPU buffer, or use obj.setMesh to swap the mesh of an object and free the old one in a single call
const mesh = new Mesh
mesh.addStrip(points, normals, uvs, colors) // one strip in strip order, counter clockwise from the front; normals, uvs
                                            // and colors are one value or one per point; extra strips in one mesh are
                                            // joined by an invisible flat triangle, so they do not look connected
mesh.addQuad(a, b, c, d, color, uvs) // corners in loop order, counter clockwise seen from the front; color and uvs one
                                     // or per corner
mesh.addTriangles(points, indices, normals, uvs, colors) // triangles over their own vertices, the form a model file
                                     // comes in: each vertex once, three indices per triangle counter clockwise from
                                     // the front; the mesh becomes indexed, a strip already in it is welded first
mesh.toIndexed()                     // turn a strip mesh into the indexed form in place, each distinct vertex once
mesh.indices                         // the triangles of an indexed mesh, undefined for a strip; either form draws the same
mesh.combine(otherMesh, matrix, color)        // append a transformed, tinted copy, to build one shape out of several;
                                              // matrix can be a vec3 when the part only needs moving into place
mesh.scaleUVs(scale)                          // repeat a wrapping texture across the mesh, a vec2 or a number
mesh.transform(matrix)                        // move every vertex in place, a mirror turns the faces too
mesh.flipNormals()                            // turn it inside out, for rooms and domes seen from within
mesh.setColor(color)                          // every vertex color
mesh.computeNormals(smooth=false)             // derive normals from the triangles
mesh.getBounds()                              // {min, max} around the vertices
mesh.center() mesh.fit(size) // move the bounds onto the origin, scale the largest extent to size; both edit in place
                             // and return the mesh
mesh.render(matrix, tileInfo, color)          // draw it now with the current draw state
mesh.dispose()                                // free the GPU buffer now, the CPU data stays; optional, a mesh
                                              // that is garbage collected frees its buffer anyway, some time later
mesh.points mesh.normals mesh.uvs mesh.colors // the vertex arrays, one entry per strip vertex, or per vertex of an
                                 // indexed mesh; building one by hand you can fill points alone, the rest fall
                                 // back to up, zero and white
mesh.instanced = false           // draw this mesh one call per use, in object order, instead of batching it
mesh.doubleSided = true          // draw both sides, each lit as the side seen; off, the default, skips faces pointing
                                 // away, faster for closed shapes; buildGrid, buildRibbon and open lathes turn it
                                 // on, and combine keeps it on if any part had it
mesh.dirty = true; mesh.upload() // re-upload edited arrays on the next draw, or upload now; upload also measures
                                 // mesh.radius; every method that edits a mesh sets dirty itself
mesh.dynamicDraw = true          // set once for a mesh whose values change every frame, a water surface or a
                                 // cloth: it keeps its GPU layout, so a dirty upload only rewrites the vertices;
                                 // the strip must keep the same points in the same order, a new point count asserts
mesh.vertexCount mesh.radius mesh.bounds      // vertices, the bounding sphere for culling, and the box for picking
mesh.computeRadius()                          // measure mesh.radius now, without uploading
mesh.getTriangles()                           // {vertices, indices}: the strip as the indexed triangle list upload sends,
                                              // its distinct vertices and real triangles, for an exporter or a check; an
                                              // indexed mesh gives its own, read clockwise as the pass draws

// Shape builders - return a Mesh centered on the origin, sizes are full sizes, smooth defaults to the plugin setting
buildBox(size=1)                              // a vec3 or a number, six faces with uvs, always flat
buildSphere(size=1, sides=16, rings=8, smooth)
buildCylinder(size=1, height=1, sides=16, smooth, capped=true)
buildCone(size=1, height=1, sides=16, smooth, capped=true)      // point up
buildCapsule(size=1, height=1, sides=16, rings=4, smooth) // total height including the rounded ends, at least the size
buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth) // size is the diameter of the whole donut, outside edge
                                                               // to outside edge; it lies flat in the XZ plane like a
                                                               // coin on a table, so rotation3D.x = PI/2 stands it up
buildLathe(profile, sides=16, smooth, capped=true) // spins an outline around the Y axis like a vase on a wheel; profile
                                                   // is [[radius, y], ...] bottom to top, a closed profile is a ring;
                                                   // an uncapped end makes it doubleSided, so its inside shows;
                                                   // smooth, an end on the axis within 45 degrees of level is a
                                                   // round pole like a sphere's, a steeper one a point like a cone's
buildRibbon(points, width=1, color, closed, up) // lit quads along a path, for roads and tracks; width and color one or
                                                // per point; doubleSided, so it shows from below too
buildGrid(size=vec2(1), segments=1, color, heightFunction, smooth) // XZ plane; size and segments a number or vec2,
                                                                    // height is (x, z)=> y; doubleSided, turn it
                                                                    // off for ground only seen from above
// color is a Color or (x, z)=> Color, where x and z are positions on the mesh itself with (0, 0) at its center; it is
// called per vertex when smooth and once per cell center when flat, so a checker needs cell sized steps: with
// buildGrid(vec2(30), 15) the cells are 2 units, so (x, z)=> (floor(x/2) + floor(z/2)) & 1 ? GRAY : WHITE
buildLoft(stations) // a hull from diamond shaped cross sections, the stations: [[z, width, top, bottom, sideHeight],
                    // ...] nose first at the largest z, always flat; sideHeight is 0 to 1, where the side corners sit
                    // between the bottom and the top; the other order would build the hull inside out, so it asserts
buildSky(topColor, horizonColor, bottomColor, sides, rings) // dome colored by height, set as render3D.sky
buildExtrude(pixels, size, depth) // 3D sprite: each solid pixel of a tileInfo given thickness, like a block model,
                                  // colors kept; or rows of pixels (Color, truthy for white, falsy for empty)
buildText3D(text, size, depth, font) // extruded glyphs from an ImageFont, the white engine font by default so the
                                     // object color tints it; centered, faces +Z, a new mesh each call; newlines
                                     // stack downward with a gap, since extruded lines that touch overlap at an angle

// Height map terrain - from a 2D array [row][column] of 0-1 heights or an image's red channel; row 0 is the far edge at
// -Z, column 0 the left edge at -X
const terrain = new HeightMap(heights, size=vec2(1), height=1, colors) // heights and colors take the array, an image or
                                                                      // a canvas
terrain.buildMesh(smooth)                     // one vertex per sample, centered on the origin
terrain.getHeight(pos3D) or (x, z)            // world height of the drawn mesh there, to stand things on it
terrain.getNormal(pos3D) or (x, z)            // surface normal there, to tilt things to the slope
terrain.raycast(ray)                          // distance along a ray to where it crosses the ground, or undefined,
                                              // for clicking; exact, a hill the ray only grazes is still hit, and a
                                              // ray starting underneath crosses on its way out
terrain.getColor(pos3D) or (x, z)             // nearest sample color
terrain.rows terrain.columns                  // samples along Z and X

// OBJ meshes - v, vt, vn and f lines, convex polygons, no materials
parseOBJ(text, smooth)                        // Mesh from OBJ text, smooth normals when the file has none
await loadOBJ(url, smooth) // fetch then parse, in an async gameInit; chain .center().fit(size) for models of unknown
                           // units

// glTF models - the glTF plugin, .gltf with its files beside it or .glb in one file; meshes with their node placement,
// vertex colors, material colors and base color textures, and node animations; no skins or morph targets, and no
// Draco or meshopt compressed geometry, which throws saying so
const model = await loadGLTF(url)   // a GLTFModel, in an async gameInit; or await parseGLTF(data, baseUrl) on bytes or
                                     // JSON you already have
model.parts                          // one GLTFPart per primitive of every node: name, mesh in model space, color,
                                     // textureInfo when the material has one and WebGL is on, transparent for a
                                     // blending material or glass (KHR_materials_transmission), which comes in
                                     // as a faint tint of its color, and unlit for KHR_materials_unlit; the uvs
                                     // are the set the texture's texCoord names, moved by KHR_texture_transform
model.mesh, model.textureInfo        // everything as one Mesh tinted by its materials, and its texture when every
                                     // part uses the same one; a model mixing plain and textured parts, or using
                                     // several textures or unlit parts, draws right through createObject
model.createObject(pos3D)            // a GLTFObject, an EngineObject3D with a child per part, each with its own
                                     // texture and blending, so windows and other see through parts show, and
                                     // emissive 1 for an unlit one; move and turn the root and the parts follow
model.animations                     // one GLTFAnimation each: name, duration in seconds, and the channels that
                                     // move, turn and scale nodes; model.getAnimation(nameOrNumber) finds one
object.play(animation=0, loop=true, speed=1) // play one on a GLTFObject by name or number, its parts move with it;
                                     // speed below 0 plays it backward, and one that does not loop holds its end
object.stop()                        // hold the pose where it is; object.setAnimationTime(t) poses it at a time
object.animation .animationTime .animationSpeed .animationLoop .animationPlaying
model.getPose(animation, time)       // one Matrix4 per part, how far it moved from its resting place
model.dispose()                      // free the part meshes, the combined mesh and the textures of a model that
                                     // is done with; destroy the objects createObject made first
// colors come in converted from glTF's linear values, a NEAREST sampler makes a part pixelated, sparse accessors
// are read, and object.parts is what an animation poses
model.center().fit(size)             // move the model's bounds onto the origin and scale its largest extent to
                                     // size, every part together, like Mesh.center and fit; getBounds and
                                     // transform(matrix) as well

// Particles - the 3D twin of ParticleEmitter, camera facing billboards sorted with everything transparent
new ParticleEmitter3D(pos3D, emitSize, emitTime, emitRate, emitConeAngle, tileInfo,
    colorStartA, colorStartB, colorEndA, colorEndB, particleTime, sizeStart, sizeEnd,
    speed, damping, gravity, fadeRate, randomness, additive)
// particles shoot out along the emitter's own up axis, so rotation3D aims the spray; emitSize is a sphere diameter or a
// vec3 box; speeds are per frame, sizes are world units, gravity changes velocity y per frame so it is negative to
// fall, and it is the emitter's own number rather than render3D.gravity, so an effect falls the same wherever it is used
// emitConeAngle is the half angle around that direction, PI is every direction; damping multiplies velocity each frame,
// 1 by default for no slowing; fadeRate is the fraction of life spent fading, half in and half out; randomness is extra
// randomness on speed, size and life
// an emitter with an emitTime destroys itself once its last particle is gone, so a burst is fire and forget
// untextured particles are soft round dots, textured ones are billboards of the tile
emitter.trailTime = .2 // 0 by default; draw each particle as a ribbon along its last .2 seconds instead, the texture stretches along
                       // it
// scale3D on the emitter, its own or a parent's, grows the whole effect: spawn area, sizes, speed and fall
emitter.angleSpeed = .05; emitter.angleDamping = 1 // tumble each particle in the camera plane, either way from a random
                       // start, damped each frame; 0 is no spin, which is the default, and the 2D emitter takes these
                       // as constructor arguments instead
emitter.emitParticle()  // fire one particle now, on top of the emit rate
emitter.particleCount   // how many are alive; they live in emitter.particleData, 21 floats each, owned by the
                        // emitter and drawn as one instanced batch of render3D.billboardMesh, so nothing else touches them

// Trails - a ribbon through where the object has been, parent it to something that moves
new Trail3D(pos3D, lifeTime, width, tileInfo, color, colorEnd, additive) // thins and fades from head to tail over
                                                                         // lifeTime seconds; Infinity keeps every
                                                                         // sample at full width, a path that only
                                                                         // grows, and destroy() then takes it at once
trail.side // Vector3 for which way the ribbon lies flat, recorded with each sample; undefined turns it to face the
           // camera
// the samples are world space, so width is a world width and scale3D does nothing to a trail; a Light3D's radius is
// a world distance too, so scale3D does nothing there either
trail.clear()                                 // forget the trail, for when the object teleports
```

### Coming from three.js
- The same conventions: right handed, Y up, cameras and objects face -Z, column major matrices, angles in radians
- rotation3D is vec3(pitch, yaw, roll), applied roll then pitch then yaw, which is three.js Euler order 'YXZ'
- Traps when porting code over:
  - Vector3 methods return a new vector; three.js add, normalize and multiplyScalar change the vector itself, so ported
    code that relies on that quietly computes the wrong thing
  - Builders take diameters and full sizes; three.js SphereGeometry, CylinderGeometry and TorusGeometry take radii
  - camera.fov is in radians, a three.js PerspectiveCamera fov is in degrees
  - A plane lies in XZ facing +Y, a three.js PlaneGeometry stands in XY facing +Z
  - Directional lights point toward where their light comes from, like three.js: render3D.sunDirection, and a
    DirectionalLight3D shines from its position toward the origin
  - Colors are plain 0 to 1 values with no color management, and a point light fades out by a radius, not by
    physical intensity units

```javascript
// three.js                               LittleJS 3D
scene.add(mesh)                           // new EngineObject3D(pos3D, mesh), or render3D.drawMesh each frame
mesh.position .rotation .scale            // obj.pos3D .rotation3D .scale3D
parent.add(child)                         // parent.addChild(child), and child.pos3D is then local
parent.attach(child)                      // parent.attach(child), kept where it is; remove(child) is removeChild(child)
new THREE.BoxGeometry(w, h, d)            // buildBox(vec3(w, h, d)), or render3D.boxMesh with scale3D
new THREE.SphereGeometry(r)               // buildSphere(r*2), or render3D.sphereMesh with scale3D
new THREE.PlaneGeometry(w, h)             // render3D.planeMesh with scale3D, lying flat
new THREE.InstancedMesh(geometry, m, n)   // new InstancedMesh3D(mesh, n) with setMatrixAt and setColorAt, but its
                                          // instances are in world space, the object's transform does not move them;
                                          // objects and drawMesh batch by themselves too, rebuilt each frame
material.color, material.map              // obj.color, and a TileInfo or TextureInfo as obj.tileInfo
material.side = THREE.DoubleSide          // mesh.doubleSided = true
material.emissiveIntensity                // obj.emissive
material.transparent, blending            // obj.transparent, obj.additive
new THREE.ShaderMaterial({fragmentShader}) // obj.shader = new Shader(code), a mainImage snippet the engine wraps;
                                          // set emissive = 1 for the snippet to do its own lighting
new THREE.AmbientLight(color)             // render3D.ambientColor
new THREE.HemisphereLight(sky, ground)    // render3D.ambientColor and ambientGroundColor, which setSky sets from its colors
new THREE.DirectionalLight(color)         // new DirectionalLight3D(pos3D, color), it shines from its position the
                                          // same way; or render3D.sunDirection and sunColor, the one that shadows
new THREE.PointLight(color, i, distance)  // new Light3D(pos3D, radius, color, intensity)
light.castShadow, light.shadow.camera     // render3D.shadows, shadowRange and shadowCenter
scene.fog = new THREE.Fog(c, near, far)   // render3D.setFog(near, far, c)
scene.background                          // render3D.setSky(topColor, horizonColor, bottomColor)
OrbitControls                             // new CameraControl3D(target, distance)
PointerLockControls                       // new FirstPersonCamera3D
new THREE.Raycaster()                     // render3D.screenToRay, pick and engineObjectsRaycast3D
OBJLoader                                 // loadOBJ(url) or parseOBJ(text)
GLTFLoader                                // loadGLTF(url): model.createObject(pos) is the scene as objects, model.mesh
                                          // is everything as one Mesh
mixer.clipAction(clip).play()             // object.play(name) on the object createObject made, node animation only,
                                          // no skinned characters
EffectComposer and UnrealBloomPass        // postProcessBloom()
renderer.render(scene, camera)            // nothing to do, the engine draws every frame and handles resizing
position.setUsage(THREE.DynamicDrawUsage) // mesh.dynamicDraw = true once, then mesh.dirty = true when the points
                                          // move, like position.needsUpdate = true
geometry.dispose()                        // optional here, a collected mesh frees its buffer; mesh.dispose()
                                          // frees it now, and setMesh frees the mesh it replaces
```

## LittleJS Three.js Integration
- Optional plugin that renders a three.js scene on a canvas behind the LittleJS canvas
- You load three.js yourself (import map or bundler) and pass the module in
- Aligned camera mode locks the 3D camera to the 2D camera so the z=0 plane matches world space
- Recommended: `setGLEnable(false)` before engineInit so three.js owns the only WebGL context
- Keep `canvasClearColor` transparent (the default) so the 3D scene shows through, set the background with `threeJS.scene.background`
- Do not call `renderer.setPixelRatio`, the plugin manages canvas size and DPR
- See `examples/threejs/` for a 3D platformer demo

```javascript
// Setup (call in gameInit), THREE is the three.js module you loaded
new ThreeJSPlugin(THREE, cameraFOV=60) // creates global threeJS, renders automatically
threeJS.scene                  // three.js scene, add lights and meshes here
threeJS.camera                 // three.js perspective camera
threeJS.cameraAlign2D = true   // lock camera to the LittleJS 2D camera (default)
threeJS.alignCamera2D()        // align manually, called automatically when locked
threeJS.cameraNear / cameraFar // near and far planes while aligned, set these rather than camera.near/far

// Objects - littlejs physics drives a three.js mesh
new ThreeJSObject(pos, size, mesh, z=0) // adds mesh to the scene, syncs transform
obj.mesh                       // the three.js object3d
obj.z                          // mesh height above the 2D plane
obj.syncMesh()                 // copy the 2D transform to the mesh
```

## LittleJS Box2D Physics
- Optional plugin wrapping the Box2D physics engine (via box2d.wasm.js)
- Drop-in replacement for engine objects: `Box2dObject extends EngineObject`; Box2D moves it, so pos and angle are
  read only, move it with `setPosition`, `setAngle` or `setTransform` and push it with velocities and forces
- Joints, raycasting, polygon/circle/edge fixtures
- Angular values are clockwise like `angle`: angular velocity, torque, joint angles and limits, motor speeds
- See `examples/box2d/` for a full demo

```javascript
// Setup (call once, awaited in gameInit)
await box2dInit()              // Loads the WASM and creates global box2d / Box2dPlugin
box2dSetDebug(true)            // Toggle debug rendering of physics shapes (box2dDebug)
setGravity(vec2(0,-20))        // World gravity is the engine's gravity, copied into the world every step; Box2D
                               // reads it as units per second squared, its velocities are per second, not per frame

// Bodies — extend EngineObject, integrate with physics
new Box2dObject(pos, size, tileInfo, angle, color, bodyType, renderOrder) // Dynamic by default
new Box2dStaticObject(pos, size, tileInfo, angle, color, renderOrder)     // Immovable
new Box2dKinematicObject(pos, size, tileInfo, angle, color, renderOrder)  // Moves but ignores forces
new Box2dTileLayer(tileLayer)                                  // Static collision from a TileCollisionLayer, built now
b.buildCollision(friction=.2, restitution=0)                   // Build it again after changing the collision data
obj.beginContact(otherObject, fixture, otherFixture) // override; fixture is which of this object's shapes touched,
obj.endContact(otherObject, fixture, otherFixture)   // as addBox and the others returned it, like a foot sensor
// In beginContact/endContact the world is stepping: destroys and setTransform, setBodyType and setMassData
// wait until after the step, and creating objects, fixtures or joints there is not allowed

// Common fixture setup (call from constructor or after creation)
obj.addBox(size, offset, angle, density, friction, restitution, isSensor)
obj.addCircle(diameter, offset, density, friction, restitution, isSensor)
obj.addPoly(points, density, friction, restitution, isSensor)      // points are local to the body, 3 to 8 of
                                                                   // them, not all in a line
obj.addEdgeList(points, density, friction, restitution, isSensor)
obj.setFilterData(categoryBits=1, ignoreCategoryBits=0, groupIndex=0) // collides with every category not ignored,
                                                                    // applies to the fixtures the body has now

// Forces and motion
obj.applyForce(force, pos)             // Force in Newtons at world pos (sustained)
obj.applyAcceleration(accel, pos)      // Δvelocity = accel per call (mass-independent like EngineObject, per second)
obj.applyImpulse(impulse, pos)         // Δvelocity = impulse / mass (instantaneous; use for one-shot hits)
obj.applyTorque(torque)
obj.applyAngularAcceleration(accel)    // Δangular velocity = accel per call (mass-independent)
obj.applyAngularImpulse(impulse)       // Δangular velocity = impulse / inertia (instantaneous)
obj.setLinearVelocity(vel)
obj.setAngularVelocity(av)
obj.setAwake(awake=true)
obj.setFixedRotation(isFixed=true)     // Stop the body from rotating
obj.setBullet(isBullet=true)           // Continuous collision for fast bodies, so they don't pass through thin ones
obj.setSensor(isSensor=true)           // The fixtures it has now detect contacts without colliding
obj.setLinearDamping(damping)          // Box2D's damping, 0 is none, larger slows it faster
obj.setAngularDamping(damping)
obj.setGravityScale(scale=1)
obj.setMassData(localCenter, mass, momentOfInertia) // undefined leaves that one as it is, inertia is about the
                                                    // center of mass
obj.getMass() / getCenterOfMass() / getInertia() // the center of mass in world space, setMassData takes a local one

// Raycasting and queries
box2d.raycast(start, end, includeSensors=false)    // Returns the closest Box2dRaycastResult or undefined; sensors
                                                   // are passed through unless includeSensors
box2d.raycastAll(start, end, includeSensors=false) // Every Box2dRaycastResult along the ray, nearest first
box2d.boxCast(pos, size, includeSensors=false) / boxCastAll(pos, size, includeSensors=false) // An object, or all
                               // of them, whose shapes overlap the box; sensors are passed through unless included
box2d.circleCast(pos, diameter, includeSensors=false) / circleCastAll(pos, diameter, includeSensors=false) // The
                               // nearest object, or all of them, whose position is in the circle, wherever its shapes
                               // are; objects of only sensors are passed over unless included
box2d.pointCast(pos, dynamicOnly=true, includeSensors=false) // The object with a shape under the point, sensors
                               // passed through unless included, so a pickup radius does not grab from afar

// Joints — all extend Box2dJoint; a joint goes along with either of its objects, check joint.isDestroyed()
// before using a kept one, joint.isActive() is false then
new Box2dTargetJoint(object, fixedObject, worldPos) // Drag toward a point (mouse-follow)
new Box2dDistanceJoint(objectA, objectB, anchorA, anchorB)
new Box2dPinJoint(objectA, objectB, pos=objectA.pos) // pins the two together at pos, turning freely; a revolute joint
new Box2dRopeJoint(objectA, objectB, anchorA, anchorB, extraLength=0) // max length is the anchors' distance
                                                                    // plus extraLength
new Box2dRevoluteJoint(objectA, objectB, anchor)
new Box2dPrismaticJoint(objectA, objectB, anchor, axis)
new Box2dWheelJoint(objectA, objectB, anchor, axis)
new Box2dWeldJoint(objectA, objectB, anchor)
new Box2dFrictionJoint(objectA, objectB, anchor)
new Box2dPulleyJoint(objectA, objectB, groundA, groundB, anchorA, anchorB, ratio)
new Box2dMotorJoint(objectA, objectB)
new Box2dGearJoint(objectA, objectB, joint1, joint2, ratio=1) // turns objectB of each joint, which must be dynamic
```

## LittleJS Medals & Newgrounds
- Achievement/medal system with on-screen popup, save/restore via localStorage
- Optional Newgrounds plugin for medals held on the server and for scoreboards
- While a player is logged in to Newgrounds, the server holds their NewgroundsMedals: they unlock once it confirms and
  the local save leaves them alone; a plain Medal is never touched, and once the session is lost, at load or later,
  the game plays as not logged in
- Without a session the medal and scoreboard lists still come in, so the medals get their names and icons; unlocking
  on the server and posting a score need a logged in player, and an unlock earned while not logged in stays local
- See `examples/shorts/medals.js` for a demo

```javascript
// Medals
new Medal(id, name, description='', icon='🏆', src)  // src is optional image url
medal.unlock()                       // Mark unlocked, save, and queue the popup; the promise it returns is optional
                                     // and resolves with whether the medal is unlocked, right away unless a server
                                     // has to confirm
medal.unlocked                       // True once unlocked; for a logged in NewgroundsMedal, once the server confirms
medal.isLocal()                      // true while the local save holds the medal; false for a NewgroundsMedal while a
                                     // player is logged in to Newgrounds, whose server holds it

medals                               // Global { [id]: Medal } map
medalsInit(saveName)                 // Restore unlocked state from localStorage under saveName, a different name
                                     // from the game's own save data or each overwrites the other; skipping
                                     // NewgroundsMedals while logged in; call it after making the medals, since it
                                     // drops saved medals that do not exist (called before any, each medal reads its
                                     // own unlock as it is made); still needed with Newgrounds, before or after
medalsForEach(callback)              // Iterate all registered medals
medalsReset()                        // Lock all medals and persist the cleared catalog; NewgroundsMedals while logged
                                     // in are left alone
medalsPreventUnlock                  // Block unlocks (testing / debug)

// Display tuning
medalDisplayTime / setMedalDisplayTime(seconds)
medalDisplaySlideTime / setMedalDisplaySlideTime(seconds)
medalDisplaySize / setMedalDisplaySize(vec2)

// Newgrounds in a game: the App ID, the cipher and every medal and scoreboard id come from the project's API Tools page
const medal_win = new NewgroundsMedal(81234, 'Win', 'Beat the game'); // its id on Newgrounds
const boardId = 14567;               // a scoreboard id
async function gameInit()
{
    medalsInit('My Game');
    new NewgroundsPlugin('12345:AbCdEfGh', 'cipherFromApiTools=='); // the cipher only with encryption on
    const response = await newgrounds.getScores(boardId, undefined, false, 0, 10, 'A'); // top 10 of all time
    const scores = response?.result?.data?.scores || []; // each with user.name, value and formatted_value
}
// later, in game code
medal_win.unlock();
newgrounds.postScore(boardId, score);

// Newgrounds plugin (a session only comes from the Newgrounds host)
new NewgroundsMedal(id, name, description, icon, src) // when logged in, unlock() asks the server and the medal only
                                     // unlocks and shows once it confirms; await the promise for the outcome
new NewgroundsPlugin(app_id, cipher) // sets the newgrounds global, logs a view and fetches the lists; with the app's
                                     // cipher, medal unlocks and posted scores are encrypted by the browser's own
                                     // WebCrypto, so the page has to be https or localhost and no library is needed
await newgrounds.ready               // resolves once the session is checked and the lists are in, empty if the server
                                     // could not be reached; needed before reading the lists, user, a NewgroundsMedal's
                                     // server fields and, when logged in, its unlocked state
newgrounds.session_id                // the player's session id, null when not logged in or once the session is lost
newgrounds.user                      // the logged in player once ready, with id, name, url, supporter; null otherwise
newgrounds.medals                    // the server's medal list once ready; each NewgroundsMedal takes its name, image,
                                     // value, difficulty and description with " (value)" added
newgrounds.scoreboards               // the server's scoreboard list once ready, each with its id and name
newgrounds.postScore(id, value)      // needs a logged in player and a whole number; result.data.success says if it
                                     // posted; an answer that the session is gone drops it, like a failed session check
await newgrounds.getScores(id, user, social, skip, limit, period) // the scores are in result.data.scores; period
                                     // 'D' today (the server default), 'W', 'M', 'Y', 'A' all time; a user or social
                                     // narrows it down, and without either it is the whole board even when logged in
newgrounds.unlockMedal(id)           // low level request only, the medal is not changed; games call medal.unlock()
newgrounds.pendingUnlocks            // advanced: the unlocks in flight or waiting to be resent, with their promises
newgrounds.resendUnlocks()           // advanced: send the ones whose request did not reach the server again now, as
                                     // the minute's session check does; one the server refused is not resent
```

## LittleJS Drawing Utilities
- Optional plugin: nine-slice and three-slice helpers for scalable UI panels, plus a crescent shape
- World-space (WebGL or 2D) and screen-space (2D by default, useWebGL for WebGL) variants
- See `examples/shorts/nineSlice.js`, `examples/shorts/uiSlice.js` and `examples/shorts/crescent.js`

```javascript
// Nine-slice — 3x3 tile grid scaled to fit
drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawNineSliceScreen(pos, size, startTile, color=WHITE, borderSize=32, additiveColor, extraSpace=2, angle=0, useWebGL=false, context)

// Three-slice — 1x3 tile strip (corner / side / center) rotated around the box
drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawThreeSliceScreen(pos, size, startTile, color=WHITE, borderSize=32, additiveColor, extraSpace=2, angle=0, useWebGL=false, context)

// TileSlice — a tile kept as a box style: slices 9 is a nine-slice, 3 a three-slice, 1 the whole tile stretched
new TileSlice(tileInfo, slices=9, borderSize, extraSpace) // borderSize and extraSpace default to the draw's own
slice.draw(pos, size, color=WHITE, additiveColor, angle=0, useWebGL=glEnable, screenSpace=false, context)
slice.drawScreen(pos, size, color=WHITE, additiveColor, angle=0, useWebGL=false, context)

// Crescent — moon-phase shape (percent: 0=new, .25=first quarter, .5=full, .75=last quarter)
drawCrescent(pos, size=1, percent=0, color=WHITE, angle=0, invert=false, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace, context)
                                      // lit side up at angle 0, invert draws the unlit part
getCrescentPoints(pos, size=1, percent=0, angle=0, invert=false, sides=glCircleSides) // crescent points for drawPoly
```

## LittleJS Texture Sheets
- Optional plugin: packs images into texture sheets at runtime and returns a TileInfo
- Sheets are created and filled automatically, there is nothing to set up first
- Grid images keep their layout, frames wrap to the next row, and `tileInfo.frame(n)` follows them; a tile layer or
  ImageFont made from one counts its tiles the same way
- See `examples/shorts/textureSheet.js`

```javascript
loadSprite(src, frameSize, padding=1, sourcePadding=0) // Load an image and pack it, returns a TileInfo
loadAtlas(imageSrc, jsonSrc, padding=1) // Load a TexturePacker or Aseprite atlas, returns name->TileInfo object
parseAtlas(data)                      // Parse atlas json into named frame groups, used by loadAtlas
spritesReady()                        // Promise resolved when all sprites are packed
textureSheets                         // Array of TextureSheet created by loadSprite
new TextureSheet(size=2048)           // A texture that images are packed into
sheet.tryAdd(imageSize, frameSize, padding, sourcePadding) // Reserve a spot, returns a TileInfo
sheet.drawImage(image, tileInfo, update=true, sourcePadding=0) // Draw an image into a reserved spot
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
- Number keys toggle debug functions while the overlay is open: 1 physics, 2 particles, 3 gamepads, 4 raycasts,
  5 screenshot, 6 video capture, 7 sound, 8 tiles (each tile layer's bounds, the collision values on screen, and the
  tiles under the mouse; pressing 8 again steps through the layers one at a time, then off)
- +/- keys apply time scale to update while the overlay is open
- setDebugKeysAlways(true) lets the number and +/- keys work with the overlay closed, for a game that does not use them
- Debug primitive rendering system
- Debug functions are only active in debug builds

```javascript
ASSERT(assert, output) // Asserts if the expression is false
LOG(...output)         // Logs output to the console (stripped from release builds)
debugRect(pos, size, color=WHITE, time=0, angle=0, fill)    // Draw debug rectangle
debugCircle(pos, size, color=WHITE, time=0, fill)           // Draw debug circle
debugPoint(pos, color, time, angle)                         // Draw debug point
debugLine(posA, posB, color, width=.1, time)                // Draw debug line
debugPoly(pos, points, color=WHITE, time=0, angle=0, fill)  // Draw debug polygon
debugText(text, pos, size=1, color=WHITE, time=0, angle=0)  // Draw debug text
debugOverlap(pA, sA, pB, sB, color) // Draw a debug overlap between two boxes
debugClear()                     // Clear all debug primitives
debugScreenshot()                // Save a screenshot at the end of this frame
debugShowErrors()                // Show full page error message when an error occurs
debugVideoCaptureStart()         // Start capturing a video of the canvas
debugVideoCaptureStop()          // Stop capturing and save the video to disk
debugVideoCaptureIsActive()      // Is video currently being captured?
createCanvasContext(width, height=width, willReadFrequently=false) // Offscreen canvas to draw into, returns its
                                                    // 2D context; the canvas is context.canvas
saveCanvas(canvas, filename='screenshot', type='image/png') // Save canvas to a file
saveText(text, filename='text', type='text/plain')          // Save text to a file
saveDataURL(url, filename='download', revokeTime)           // Save url to a file, revokeTime is ms before
                                                            // URL.revokeObjectURL frees an object url

// Debug settings
debug                // Is debug enabled?
debugPointSize = .5  // Size to render debug points by default
debugKey = 'Escape'  // Key code used to toggle debug mode
debugKeysAlways = false // The number and +/- keys work with the overlay closed too, setDebugKeysAlways(enable=true)
debugOverlay         // Is the debug overlay active? setDebugOverlay(show=true) opens or closes it from code
debugWatermark       // Should watermark with FPS appear in debug mode?
```

[LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) Copyright 2021 Frank Force

![LittleJS Logo](examples/favicon.png)