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
tile(pos, size=(16,16), texture=0, padding=0) // Create a tile info object

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
nearestPowerOfTwo(value)                      // Returns the nearest power of two
isOverlapping(pointA, sizeA, pointB, sizeB)   // Checks if bounding boxes overlap
isIntersecting(start, end, pos, size)         // Checks if ray intersects box
formatTime(t)                                 // Formats seconds for display 

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
Vector2.floor()                           // Floor this vector
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
Color.rgbaInt()                           // Get this color as 32 bit RGBA value
Color.toString(useAlpha=true)             // Get hex color code as a string

// Seeded random number generator
RandomGenerator(seed)                     // Create a random number generator
RandomGenerator.float(valueA=1, valueB=0) // Random float between values
RandomGenerator.int(valueA, valueB=0)     // Random integer between values
RandomGenerator.sign()                    // Randomly either -1 or 1

// Time tracking system
Timer(timeLeft)       // Create a timer object
Timer.set(timeLeft=0) // Set the timer with seconds passed in
Timer.unset()         // Unset the timer
Timer.isSet()         // Returns true if set
Timer.active()        // Returns true if set and has not elapsed
Timer.elapsed()       // Returns true if set and elapsed
Timer.get()           // Get how long since elapsed, 0 if not set
Timer.getPercent()    // Get percent elapsed, 0 if not set
Timer.toString()      // Get this timer expressed as a string
Timer.valueOf()       // Get how long since elapsed, 0 if not set
```

## LittleJS Drawing System
- Hybrid system with both Canvas2D and WebGL available
- Super fast tile sheet rendering with WebGL
- Can apply rotation, mirror, color and additive color
- Text and font rendering system with built in engine font

```javascript
// Drawing functions
drawTile(pos, size, tileInfo, color=WHITE, angle=0, mirror, additiveColor)
drawRect(pos, size, color=WHITE, angle=0)
drawRectGradient(pos, size, colorTop=WHITE, colorBottom=BLACK, angle=0)
drawTextureWrapped(pos, size, wrapCount, texture=0, color=WHITE, angle=0, additiveColor)
drawLine(posA, posB, width=.1, color=WHITE, pos=(0,0), angle=0)
drawLineList(points, width=.1, color, wrap=false, pos=(0,0), angle=0)
drawPoly(points, color=WHITE, lineWidth=0, lineColor=BLACK, pos, angle=0)
drawRegularPoly(pos, size=(1,1), sides=3, color=WHITE, lineWidth=0, lineColor=BLACK, angle=0)
drawEllipse(pos, size=(1,1), color=WHITE, angle=0, lineWidth=0, lineColor=BLACK)
drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)
drawCanvas2D(pos, size, angle=0, mirror, drawFunction, screenSpace, context)

// Text functions
drawText(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)
drawTextScreen(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)

// Utility drawing functions
setBlendMode(additive)
isFullscreen()
toggleFullscreen()

// Tile Info Object
TileInfo(pos, size, textureIndex=0, padding=0) // Create a tile info object
TileInfo.pos            // Top left corner of tile in pixels
TileInfo.size           // Size of tile in pixels
TileInfo.textureIndex   // Texture index to use
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

// Font Image Object draws text using characters in an image
FontImage(tileInfo)                                 // Create a font from a tile sheet
FontImage.drawText(text, pos, scale, center)        // Draw text in world space
FontImage.drawTextScreen(text, pos, scale, center)  // Draw text in screen space

// Camera settings
cameraPos = (0,0)        // Position of camera in world space
cameraScale = 32         // Scale of camera in world space
screenToWorld(screenPos) // Convert from screen to world space coordinates
worldToScreen(worldPos)  // Convert from world to screen space coordinates
getCameraSize()          // Get the camera's visible area in world space

// Display settings
canvasMaxSize = (1920, 1200)  // The max size of the canvas
canvasFixedSize = (0, 0)      // Fixed size of the canvas
canvasClearColor = BLACK      // Color used to clear the canvas at start of frame
fontDefault = 'arial'         // Default font used for text rendering
canvasPixelated = true        // Use nearest neighbor canvas scaling for more pixelated look
tilesPixelated = true         // Disable filtering for crisper pixel art
showSplashScreen = false      // Show the LittleJS splash screen on startup
glEnable = true               // Enable fast WebGL rendering

// Tile sheet settings
tileDefaultSize = (16,16) // Default size of tiles in pixels
tileDefaultBleed = .3     // How much smaller to draw tiles to prevent bleeding
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
Sound.getDuration()                                    // Get length of sound in seconds
Sound.isLoaded()                                       // Check if sound is currently loading
Sound.loadedPercent                                    // Get loading progress (0 to 1)

// SoundInstance
SoundInstance.setVolume(volume)   // Change volume during playback
SoundInstance.stop(fadeTime=0)    // Stop with optional fade out
SoundInstance.pause()             // Pause the sound
SoundInstance.unpause()           // Resume paused sound
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
speak(text, language='', volume=1, rate=1, pitch=1)  // Speak text line
speakStop()                                          // Stop all queued speech
getNoteFrequency(semitoneOffset, rootFrequency=220)  // Get frequency for musical notes

// Audio settings
soundEnable = true      // Should sound be enabled?
soundVolume = .5        // Volume scale to apply to all sound
soundDefaultRange = 40  // Default range where sound no longer plays
soundDefaultTaper = .7  // Default range percent to taper off sound (0-1)
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

// Mouse / Touch
mousePos                              // World space mouse position
mousePosScreen                        // Screen space mouse position
mouseDelta                            // World space mouse movement delta
mouseDeltaScreen                      // Screen space mouse movement delta
mouseWheel                            // Delta mouse wheel this frame    
mouseIsDown(button)                   // Is mouse button down?
mouseWasPressed(button)               // Was mouse button pressed this frame?
mouseWasReleased(button)              // Was mouse button released this frame?

// Gamepad
isUsingGamepad                        // Is user currently using gamepad?
gamepadIsDown(button, gamepad=0)      // Is gamepad button down?
gamepadWasPressed(button, gamepad=0)  // Was gamepad button pressed this frame?
gamepadWasReleased(button, gamepad=0) // Was gamepad button released this frame?
gamepadStick(stickIndex, gamepad=0)   // Get gamepad analog stick value

// Touch Gamepad
touchGamepadEnable                    // Is on screen touch gamepad enabled?
touchGamepadAnalog                    // Is touch gamepad analog or 8 way dpad?
touchGamepadSize                      // Size of touch gamepad
touchGamepadAlpha                     // Alpha of touch gamepad

// Vibration
vibrate(pattern=100)                  // Pulse the vibration hardware if it exists
vibrateStop()                         // Stop all vibration

// Input settings
gamepadsEnable = true                 // Should gamepads be allowed?
gamepadDirectionEmulateStick = true   // Should dpad be routed to the left analog stick?
inputWASDEmulateDirection = true      // Should WASD keys be routed to the direction keys?
vibrateEnable = true                  // Allow vibration hardware if it exists?
touchGamepadEnable = false            // Should touch gamepad appear on mobile devices?
touchGamepadAnalog = true             // Should touch gamepad be analog or 8 way dpad?
touchGamepadSize = 99                 // Size of virtual gamepad for touch devices
touchGamepadAlpha = .3                // Transparency of touch gamepad overlay
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
TileLayer(pos, size, tileInfo, scale)          // Create a tile layer object
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

// Confirm dialog
uiSystem.showConfirmDialog(text='Are you sure?', yes, no, size, exitKey='Escape')

// Drawing helpers (use these instead of the engine's draw* during UI rendering)
uiSystem.drawRect(pos, size, color, lineWidth, lineColor, cornerRadius, gradientColor, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawTile(pos, size, tileInfo, color, angle, mirror, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawText(text, pos, size, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth, textShadow, shadowColor, shadowBlur, shadowOffset)
uiSystem.drawLine(posA, posB, lineWidth, lineColor)

// Base widget
new UIObject(pos=vec2(), size=vec2())
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

## LittleJS Box2D Physics
- Optional plugin wrapping the Box2D physics engine (via box2d.wasm.js)
- Drop-in replacement for engine objects: `Box2dObject extends EngineObject`
- Joints, raycasting, polygon/circle/edge fixtures
- See `examples/box2d/` for a full demo

```javascript
// Setup (call once before engineInit)
await box2dInit()              // Loads the WASM and creates global box2d / Box2dPlugin
box2dSetDebug(true)            // Toggle debug rendering of physics shapes
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
medal.storageKey()                   // localStorage key for this medal

medals                               // Global { [id]: Medal } map
medalsInit(saveName)                 // Restore unlocked state from localStorage under saveName
medalsForEach(callback)              // Iterate all registered medals
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
- Optional plugin: nine-slice and three-slice helpers for scalable UI panels
- World-space (WebGL or 2D) and screen-space (always 2D) variants
- See `examples/shorts/nineSlice.js` and `examples/shorts/threeSlice.js`

```javascript
// Nine-slice — 3x3 tile grid scaled to fit
drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)

// Three-slice — 1x3 tile strip (corner / side / center) rotated around the box
drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
```

## LittleJS Debugging System
- Press Escape key to toggle debug overlay
- Number keys toggle debug functions
- +/- keys apply time scale to update
- Debug primitive rendering system
- Debug functions are only active in debug builds

```javascript
ASSERT(assert, output) // Asserts if the expression is false
debugRect(pos, size, color='#fff', time=0, angle=0, fill) // Draw debug rectangle
debugCircle(pos, size, color='#fff', time=0, fill)        // Draw debug circle
debugPoint(pos, color, time, angle)                         // Draw debug point
debugLine(posA, posB, color, width=.1, time)                // Draw debug line
debugText(text, pos, size=1, color='#fff', time=0, angle=0) // Draw debug text
debugOverlap(pA, sA, pB, sB, color) // Draw a debug overlap between two boxes
debugClear()                     // Clear all debug primitives
saveCanvas(canvas, filename)     // Save canvas to a file
saveText(text, filename)         // Save text to a file 
saveDataURL(dataURL, filename)   // Save url to a file

// Debug settings
debug                // Is debug enabled?
debugPointSize = .5  // Size to render debug points by default
debugKey = 'Escape'  // Key code used to toggle debug mode
debugOverlay         // Is the debug overlay is active?
debugWatermark       // Should watermark with FPS appear in debug mode?
```

[LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) Copyright 2021 Frank Force

![LittleJS Logo](examples/favicon.png)