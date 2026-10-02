# LittleJS Changelog

What changed in each release, newest first. Releases before 1.20.0 are on the
[GitHub releases page](https://github.com/KilledByAPixel/LittleJS/releases).

## Unreleased

Nothing yet.

## 1.24.0 - 2026-10-02

### New Demos

- [3D Lens Flare](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Lens%20Flare) - Now with hexagons, and flares on lamps as well as the sun
- [Text](https://killedbyapixel.github.io/LittleJS/examples/?example=Text) - What drawText can do: sizes, outlines, alignment, fonts, rows and text placed in pixels
- [Physics](https://killedbyapixel.github.io/LittleJS/examples/?example=Physics) - The engine's own objects falling, bouncing, sliding and floating, and a sensor
- [Random](https://killedbyapixel.github.io/LittleJS/examples/?example=Random) - Random numbers, and a seeded generator that gives the same result every time

### New Changes

- Every short example has a write-up in the example browser: what it shows, how its code works, things to try in the editor and where to look next, with links to the docs and to other examples
- Lens flares on lights: `light.addFlare()` gives a `Light3D` a lens flare of its own and returns it, `light.flare` is the flare, and it goes with the light; a `DirectionalLight3D` can have one too, far away like the sun's
- Lens flares in the 3D level editor: a level's Light has a `lensFlare` property, and the Scene box has a Lens flare checkbox for the sun's, saved in the level's scene block
- Lens flares have three more shapes, `hex`, `streak` and `star`; `flare.shapes` says what the ghosts are picked from, `glowSize` and `ghostSize` scale its parts, and an element may be a tile of the game's own (`tileInfo`), turned (`angle`) and wider than tall
- 3D picking is triangle accurate: `render3D.pick`, `engineObjectsRaycast3D` and clicks in the 3D level editor hit a mesh on its triangles, not the box around it
- LDtk levels load: `tileLayersFromLDtk(ldtk, level)` makes a level of an LDtk project a Tiled map for `tileLayersLoad` and `objectLayersLoad`, with its tile, auto and IntGrid layers, its entities as objects and their fields as properties
- A Tiled tileset with a margin or a spacing, a sheet with gaps between its tiles, is read where its tiles are
- The 3D Example has lens flares, on the sun and on each orb
- CHANGELOG.md lists what changed in each release, and the site's root goes to the example browser

### Breaking Changes

- ZzFXM, the tracker music plugin, is removed: it was made for the js13k size limit. A game with a song in that format includes ZzFXM itself and hands its samples to a `Sound`
- 3D picking hits only the faces that are drawn: a mesh seen from inside is no longer hit unless it is `doubleSided`
- `LensFlare3D`: `getSunScreenPos` is now `getScreenPos` and `isSunHidden` is now `isHidden`, since a flare may be a light's; `visible` is 0 while the sun is off the screen; a flare pointed at a light is destroyed with it
- The repository's `dist/` is now the last release, not the latest source: it is committed only for a release, and the site is built from the source

### Fixes

- A lens flare that is off the screen, or of a light that is off, no longer looks for what hides it every frame
- Shorts: the lander lands upright after a full turn, the maze reaches its top row and works at even sizes, a pocketed cue ball comes back, the 3D Voxels player floats in water, and more that writing them up turned up

## 1.23.1 - 2026-10-02

### New Changes

- 3D sprites are batched: an object with a tile and no mesh, or a `drawBillboard`, that is not transparent is drawn as one instanced batch with the other sprites of its sheet, its clear pixels cut out, so many sprites cost little; transparent and additive sprites still draw sorted, one by one
- A level's block map works in a game with no images: it shows plain colored blocks, where it used to fail
- glTF: emission stronger than 1 from Blender is read (`KHR_materials_emissive_strength`), a texture is smooth or pixelated as its sampler says whatever the game's tiles are, and a model with basis textures says they are not read
- The 2D level editor keeps the last 100 undo steps, as the 3D one does
- The npm package and the release zip include REFERENCE.md and EDITOR.md
- EDITOR.md says how to keep a level as a script for a game opened from disk, and what changing the editors' own tools takes
- The deprecated names from 1.20 are kept until 1.25 at least

### Fixes

- A UI button pressed and released inside one frame was clicked twice
- `drawRegularPoly`, and circles with `setGLCircleSides`, hung on a side count that was not a whole number
- 2D level editor: a click on an object no longer rewrites its position with rounding noise and adds an undo step; applying saved edits to a file that gained an object layer leaves that layer alone; a level whose url has a `%20` in it matches its file again
- 3D level editor: saves of a prefab are written in the order they were asked for when `onSave` is async, a prefab edit that was undone no longer comes back after a reload, and objects a game's tool adds without ids get ids
- An attached prefab inside another prefab is placed where it belongs, and its collision box follows parts that are turned
- `levelEditor.onSave` may be an async function in TypeScript too
- A `Sound` made while sound is off counts as loaded, so a loading screen that waits for sounds finishes
- A tween callback that throws no longer leaves the tween system allocating on every update
- The build and the docs build leave `dist/` and `docs/` untouched when a step fails

## 1.23.0 - 2026-10-01

### New Demos

- [3D Prefab Maker](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Prefab%20Maker) - Build a prefab in the level editor and save it for a game to place
- [3D Level Editor](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Level%20Editor) - Now makes prefabs, flattens and paints terrain, and fills boxes of blocks
- [Parallax](https://killedbyapixel.github.io/LittleJS/examples/?example=Parallax) - Rebuilt on the new parallax plugin, with ranges of mountains that repeat as the camera goes by

### New Changes

- 3D prefabs: a prefab is a small level placed many times. `level3DAddPrefab('House', data)` makes it a type, a level places it like a Box, and `level3DSpawn` places one from code; each part is a solid object of its own, or with `attached` the parts move with the instance as one body, for a vehicle or a creature
- The 3D level editor is the prefab editor too: Ctrl+G makes the selection a prefab, Enter opens one to edit it alone and every instance follows, Ctrl+Shift+G unpacks one, and the panel exports a prefab to a file and loads one from a file; prefabs can hold prefabs, and are saved in the level
- Make the level editors your own: `levelEditor.addKey`, `addButton` and `addTool` add a key, a panel button and a mouse tool of your game's own, `onOpen`, `onUpdate`, `onDraw`, `onPanel` and `onSave` are called by the editors, and `levelEditor.edit2D` and `edit3D` are the edit functions, each change an undo step. The same calls work in the 2D and the 3D editor
- Or extend it: `class MyEditor extends LevelEditor` with the hooks as methods, then `setLevelEditor(new MyEditor)`. Release builds take all of it and call none of it, so a game needs no guards
- New guide, [EDITOR.md](https://github.com/KilledByAPixel/LittleJS/blob/main/EDITOR.md): how to turn the built-in editors into an editor for your own game, written for people and AI assistants, with every example tested
- Added the Parallax plugin: a `ParallaxLayer` follows the camera by a part of its movement and repeats across the view, so a level of any width has a background; it draws mountains by default, or anything you draw into it
- Touch has a mouse wheel: a pinch of two fingers turns `mouseWheel`, so what zooms with the wheel zooms with a pinch, and `touchPinch` reads it by itself
- 3D level editor: the Terrain tool has a flatten brush and a paint brush that colors the ground, the Blocks tool fills a box with a drag and resizes its map, and the Move handles can follow an object's own axes (L)
- A `LensFlare3D` can be a light's flare: set `flare.light` and it sits at the lamp, in its color, hidden by what is in front of it
- The example browser has Prev and Next buttons, to go through the examples on a phone
- `Sound.range` can be set after a sound is made, and 3D sounds use it
- Size: the full build is about 122 KB gzipped, up from 119 KB; a bundler like Vite leaves out the plugins you don't use
- Fixes: a `SpriteAnimator` clip that ends and switches clips reads the new clip, glass and water blocks no longer hide the sun's lens flare, 3D particles appear at once like 2D ones, a spotlight that casts shadows lights no wider than its shadow map, the 3D editor's Scene box no longer undoes a field edited just before, and the example browser always shows the example picked last; the test suite grew from 1724 to 1848 tests

### Upgrade Notes

- With two fingers down the touch screen pinches: the second finger lets go of the button the first one pressed. A game that uses two fingers its own way calls `setTouchPinchWheel(false)` to get the old behavior back
- A `ParticleEmitter3D` makes its first particle at once, where it used to wait one emit interval
- A spotlight set as `render3D.shadowLight` has its cone capped at 1.35 radians, what its shadow map covers
- `levelEditor.onRestart`, `onPlayFrom` and `onTile` are set the same way as before, but they are now empty methods when a game has not set them, so `if (levelEditor.onRestart)` is always true; nothing in a game needs to read them
- The Parallax short moved to the plugins section, and the platformer example uses the plugin for its mountains
- These names changed in 1.20 and the old ones still work for now: `collideTiles` is now `collideLevel`, and `Box2dWeldJoint.setSpringDampingRatio` is now `setDampingRatio`

## 1.22.0 - 2026-10-01

### New Demos

- [Particle Effects](https://killedbyapixel.github.io/LittleJS/examples/?example=Particle%20Effects) - Every built-in particle effect, one line each
- [Particle Options](https://killedbyapixel.github.io/LittleJS/examples/?example=Particle%20Options) - One effect, and what each option does to it
- [3D Lens Flare](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Lens%20Flare) - The sun flares across the screen and hides behind pillars
- [3D First Person](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20First%20Person) - Now with a night, and a flashlight that casts the shadows
- [3D Level Editor](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Level%20Editor) - Now paints blocks, sculpts terrain and sets the sky, sun and fog
- [Tween Advanced](https://killedbyapixel.github.io/LittleJS/examples/?example=Tween%20Advanced) - Every tween feature in labeled rows
- [Particle Designer](https://killedbyapixel.github.io/LittleJS/examples/particles/) - Rebuilt on the effects library, with a 3D preview

### New Changes

- Added the Particle Effects plugin: `particleEffect('fire', pos)` plays one of 24 built-in effects in one line, and `particleEffect3D` plays the same effect in 3D; the options scale it, turn its hue, change its saturation, swap in your own tile, or replace any setting, like `{emitTime: .5}` for a burst
- The built-in effects are fire, torch, smoke, steam, explosion, sparks, hit, dust, debris, sparkle, magic, heal, poison, portal, rain, snow, leaves, bubbles, fireflies, trail, muzzle, blood, confetti and splash, each sized to fit a one unit object and drawn with shapes the plugin makes itself, so they need no image
- The Particle Designer is rebuilt on the plugin: the built-in effects are its presets, Save Library writes the file `particleEffectsLoad` reads so a game plays your effects by name, and it previews an effect in 2D or 3D with the same options a game passes
- `ParticleEmitter` has `scale`, which grows a whole effect, and `gravity`, its own fall; `ParticleEmitter3D` has `gravityScale` and `emitFlat`, which makes its spawn area a disc or a flat sheet
- 3D level editor: the Blocks tool (B) paints a level's block map, the Terrain tool (T) sculpts its terrain with a brush, and the Scene box sets its sky, sun, fog and shadows; all three are saved in the level's JSON, undo and autosave with the rest, and `level3DLoad` makes them with no game code
- Spotlights: a `Light3D` with a `coneAngle` shines along its own forward, with `coneSoftness` for where the fade starts, and `render3D.shadowLight` makes one spotlight cast the shadows in place of the sun, for a flashlight in the dark
- Added `LensFlare3D`, the sun's lens flare: a glow at the sun and a row of discs and rings across the screen, with its size, count, brightness and colors to set, fading out when something hides the sun
- 2D lights glow like the 3D ones: `light.glow` and `glowFalloff` on a `Light` of the light system
- Built-in post processing effects: `postProcessEffects` joins scanlines, noise, vignette, curve, chromatic, glow and a 3D outline into one shader, with your own GLSL as a piece too
- A texture can be smooth or pixelated on its own: `TextureInfo` takes `pixelated`, and `setPixelated` changes it
- Textures the engine sizes itself, like the shadow maps, fall back to the largest size a device supports; `glClampTextureSize` does the same for your own
- Faster: particles draw about 30% faster, `InstancedMesh3D` moves many instances with `setTransforms` and uploads less, the 3D draw state is checked with one number per draw, and ZzFX 1.4.0 generates sounds faster
- `render3D.playSound` hears a sound with no range of its own out to `render3D.soundDefaultRange`, 100 units
- Added a browser smoke suite, `npm run test:browser`: real WebGL in headless Chrome checks 2D draws, shaders, the 3D pass, spotlights, the lens flare, a lost and restored context, and that every short runs
- Size: the full build is about 119 KB gzipped, up from 108 KB; a bundler like Vite leaves out the plugins you don't use
- Fixes: post process feedback keeps the previous frame again, `loadGLTF` follows redirects and takes blob and data urls, overlapping Saves in the level editors write in order, and a scene `leave` that throws no longer blocks later switches; the test suite grew from 1562 to 1724 tests

### Upgrade Notes

- A sound with no range of its own is now heard to 100 units when played with `render3D.playSound`, where it was 40; pass a range to `new Sound`, or set `render3D.soundDefaultRange`, to change it. 2D sounds are unchanged
- `particleEffect3D` and the particle designer's files use the plugin's effect format; an effect saved by the older designer still loads and keeps its tile
- The light system writes the sizes it could make back to `shadowMapSize`, `shadowTextureSize` and `textureSize` when a device can not make the size asked for
- The engine's own soft textures, the light glow and the particle shapes, are smooth even when `tilesPixelated` is on
- The Tween System and Stress Test full examples are gone, the Tween Advanced short covers tweens
- These names changed in 1.20 and the old ones still work for now: `collideTiles` is now `collideLevel`, and `Box2dWeldJoint.setSpringDampingRatio` is now `setDampingRatio`

## 1.21.0 - 2026-09-29

### New Demos

- [3D Level Editor](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Level%20Editor) - Place boxes, lights and coins, then walk around
- [3D Materials](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Materials) - Bricks from a normal map made in code, a polished ball reflecting the sky, and glowing windows
- [3D Ambient Occlusion](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Ambient%20Occlusion) - Creases and corners darkened from the new depth texture, side by side with plain
- [3D Water](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Water) - Rain on a pool, its waves a cellular automaton, reflecting the sky
- [Scenes](https://killedbyapixel.github.io/LittleJS/examples/?example=Scenes) - A title, a game with a pause overlay and game over, switched with `setScene`
- [Animation](https://killedbyapixel.github.io/LittleJS/examples/?example=Animation) - Sprite animation, with clips switched by name
- [3D Lights](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Lights) - The lamps now glow

### New Changes

- Added the 3D Level Editor, in debug builds only: press 0 on the debug overlay in a game that loaded a 3D level to pause it and place, move, rotate and scale its objects with handles, grid and ground snapping, undo, autosave, Save back to the level's JSON file and Reset to file
- 3D levels: `level3DAddType`, `level3DAddMesh` and `level3DLoad` make a level's objects from plain JSON, with Box, Sphere, Cylinder and Light built in
- Added a free camera, in debug builds only: press C on the debug overlay to fly around the running game while it reads no keyboard or mouse (`inputCapture`)
- 3D materials: `normalMap` and `normalScale` bend the surface with no tangents needed, `normalMapFromHeight` makes a normal map in code, `shininess` sets the highlight's size, `reflectivity` reflects the sky with a Fresnel edge, and `emissiveMap` with `emissiveMapColor` makes parts of a surface glow; glTF models bring their normal and emissive textures
- Turned boxes collide as turned: a box with a `rotation3D` collides as the box you see, so ramps, tilted platforms and turned walls just work, and the 3D box helpers take an optional rotation
- Standing in 3D: resting on another object sets `groundObject`, and `groundAngle` (45 degrees by default) is the steepest slope an object stands on without sliding
- The 2D physics settings work in 3D: `damping`, `angleDamping`, `friction` on the ground (a moving platform carries what rides it) and `clampSpeed`
- Added `render3D.depthTexture`: the post process shader gets the 3D depth as `iChannel2` and reads it with `sceneDepth(uv)`, for ambient occlusion, fog and outlines
- `Light3D` has a soft hazy `glow`, with `glowFalloff` for how fast it fades
- 3D particles have the 2D emitter's callbacks, `particleCreateCallback`, `particleUpdateCallback`, `particleCollideCallback` and `particleDestroyCallback`, and `collideLevel` to bounce off height maps and voxel maps
- Added a loading screen: after the splash, startup waits for the images, `gameInit` and everything loaded while it runs, and shows a loading bar if that takes more than half a second; `setLoadingScreen` draws your own, and `engineAddLoad` adds anything else you load
- Added the Scene plugin: `setScene` and `getScene` switch between scenes with enter, leave, update and render hooks, clearing all but persistent objects
- Added `setEngineVariableStep`: one update per display frame with `timeDelta` the frame's time, and frame times are smoothed to whole display frames in both modes
- `SpriteAnimation.play(onEnd)` calls back when a play ends, and `SpriteAnimator` switches a character's clips by name
- A mesh with `dynamicDraw` uploads faster, and `levelEditor.paletteTiles` picks the tiles the 2D level editor's palette shows
- Size: the full build is about 107 KB gzipped, up from 100 KB; a bundler like Vite leaves out the plugins you don't use
- Fixes: three external review passes and their fixes, and the test suite grew from 1313 to 1562 tests

### Upgrade Notes

- `clampSpeed` now only holds an object to `objectMaxSpeed` (1 unit a frame per axis) while it collides, with solids, or with tiles or the level while it has a mass, in 2D and 3D; something that does not collide, like a bullet you move yourself, now moves at its full speed instead of being slowed
- In 3D, colliding objects are now held to `objectMaxSpeed`; set `clampSpeed = false` on fast colliding things, as in 2D
- In 3D, an object standing on something now slows by `friction`, 0.8 by default; set `friction = 1` for none
- In 3D, `damping` now slows objects with no mass too, and `angleDamping` slows `angleVelocity3D`; both are 1 by default, so nothing changes unless you set them
- A turned 3D solid now collides as turned, so a spinning solid sweeps what it touches; sprites still collide upright
- `engineObjectsCollect3D` finds a turned object by its turned box
- The game loop now starts once `gameInit` and everything loaded while it ran are done, sounds from files included; call `setLoadingScreen()` to turn the loading screen off
- These names changed in 1.20 and the old ones still work until 1.22: `collideTiles` is now `collideLevel`, and `Box2dWeldJoint.setSpringDampingRatio` is now `setDampingRatio`

## 1.20.0 - 2026-09-28

### New Demos

- [3D Voxels](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Voxels) - Walk, jump, dig and build in a little Minecraft style world
- [3D Mesh Operations](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Mesh%20Operations) - Bevels, CSG cuts, mirror and spin
- [3D Sync 2D](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Sync%202D) - A 2D platformer with 2D physics and tile collision, drawn in 3D
- [3D Mesh](https://killedbyapixel.github.io/LittleJS/examples/?example=3D%20Mesh) - Load an OBJ or glTF model, or drop one in
- [Level Editor](https://killedbyapixel.github.io/LittleJS/examples/?example=Level%20Editor) - Paint a level and place objects, then play it
- [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer/) - Press Esc then 0 to open the level editor on a real game
- [Light Shadows](https://killedbyapixel.github.io/LittleJS/examples/?example=Light%20Shadows) - Lights blocked by walls and tinted by glass
- [Particle Designer](https://killedbyapixel.github.io/LittleJS/examples/particles/) - Reworked, with an effect library, presets and code export
- [Tweakables](https://killedbyapixel.github.io/LittleJS/examples/?example=Tweakables) - Change values live from a debug panel
- [UI Tile Slice](https://killedbyapixel.github.io/LittleJS/examples/?example=UI%20Tile%20Slice) - UI styled with nine-slice and tile art

### New Changes

- Added the Level Editor, in debug builds only: press 0 on the debug overlay to pause the game and paint its Tiled tile layers, with stamps, fill, selections, undo and redo, then Escape to play and edit again
- The level editor places objects too: `objectLayersAddType` names your object classes, `objectLayersLoad` makes them from a Tiled object layer, and their properties are edited in the panel
- It saves straight back to the level's Tiled JSON file where the browser allows it (Chrome and Edge), autosaves every change, and has `levelEditor` hooks for restart, play from the mouse, resizing and your own tile rules
- Added the Tweakables plugin: `tweak()` puts any value on a debug panel (press 9) with sliders, checkboxes, colors and buttons
- Added `VoxelMap`, a grid of blocks drawn in chunks with hidden faces left out, per face tiles, see-through and blending blocks, corner shading, collision and a grid raycast for digging and building
- Level collision in 3D: objects with `collideLevel` land on and are stopped by height maps and voxel maps, `groundObject` says what they stand on, and `FirstPersonCamera3D` can jump (`jumpSpeed`) and set its `eyeHeight`
- `HeightMap` is now an object that draws itself, with world space lookups wherever it is placed
- Mesh operations: bevels and chamfers on the box, cylinder and cone builders, `mirror` and `spin`, and CSG `union`, `subtract` and `intersect`
- Added the glTF plugin: `loadGLTF` and `parseGLTF` load .gltf and .glb models with textures, node animations, WebP images and glass
- `InstancedMesh3D` keeps a set of instances on the GPU and draws them as one call, meshes upload as indexed triangle lists, and particles and objects allocate nothing per frame
- 3D lighting: the sky lights the scene from above and below, and `Light3D` point lights make specular highlights
- `sync2D` 3D objects start at their 3D position, so a 2D game with 3D looks just works
- Light System: lights are blocked by shadow casters, colored glass tints what passes through, and `emissive` objects glow in the dark
- Added `drawScreenSpace`, a setting that makes the draw functions default to screen space, for HUDs or a 3D game's 2D overlay
- `TileSlice` draws a tile as a nine-slice, three-slice or plain box, and the UI system can style its widgets with tile art
- Tiled maps keep their flipped and turned tiles, and the debug overlay's new Debug Tiles view (key 8) shows each tile layer's bounds and collision
- The particle designer was rebuilt with an effect library, presets, grouped settings and code export, and `particleUpdateCallback` runs for each particle
- The Newgrounds plugin was rewritten: medals unlock on the server, leaderboards work for guests too, and it uses the browser's WebCrypto with no dependencies
- The example tile sheets now have a 1 pixel border around each tile, with `setTileDefaultPadding(1)`, and the starter builds its level from a string you can edit
- Release builds no longer evaluate assert arguments, and `RandomGenerator` gives unrelated values for nearby seeds
- Size: the core engine is about 36 KB gzipped and every build includes the plugins; a bundler like Vite leaves out the ones you don't use, so a small 2D game is about 26 KB and a lit 3D scene about 47 KB
- Fixes: fifteen review passes fixed hundreds of bugs across the engine and plugins, the engine and plugins type check clean, and the test suite grew from 570 to 1313 tests

### Upgrade Notes

- These names changed in 1.20 and the old ones still work until 1.22:
  - `collideTiles` is now `collideLevel`
  - `Box2dWeldJoint.setSpringDampingRatio` and `getSpringDampingRatio` are now `setDampingRatio` and `getDampingRatio`
  - `NewgroundsPlugin.logView()` does nothing, since the view is logged on start
  - `drawNineSliceScreen` and `drawThreeSliceScreen` take a color after the start tile, before the border size; a number there still reads the old order
- `setCollision()` now turns on level collision for 3D objects
- A `HeightMap` draws itself, so remove any separate object you made to draw its mesh, and `terrain.size` is now `terrain.mapSize`
- A flat `buildGrid` is flat shaded unless you pass `smooth`
- The example tile sheets changed layout; if you copied `tiles.png` from an example, use it with `setTileDefaultPadding(1)`
