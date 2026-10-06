# LittleJS Changelog

What changed in each release, newest first. Releases before 1.20.0 are on the
[GitHub releases page](https://github.com/KilledByAPixel/LittleJS/releases).

## Unreleased

### New Changes

- 3D environment maps: `render3D.environment` is a cube map that reflective surfaces reflect, sharp at a high shininess and blurred at a low one, and `render3D.skyBox` draws one as the sky; `makeCubeMap` paints one in code from a color for each direction and `loadCubeMap` loads six images. A cube map made with no faces captures the scene around a point (`capture`), the way three.js's CubeCamera does, and an object's `environment` reflects one of its own. A 3D level's scene block may name a sky box and an environment as six image urls each, which the 3D editor's Scene box edits. An object's `roughness`, 0 a mirror to 1 matte, sets its shininess the way glTF and three.js measure it, and a glTF material's roughnessFactor is read into it, so a loaded model's highlights and reflections are as sharp as its file says; a part whose material has none is matte, its shininess 1 where it was 16, which shows only with specular or reflectivity set The 3D Reflections short shows a chrome sphere reflecting the scene around it under a sky painted in code
- A skinned glTF model bends about a fifth faster: the skin writes the GPU data as it bends, so the upload sends it without packing it again, and its joints' matrices are worked out with no garbage
- The level editors autosave a big map or 3D level once the edits stop for a moment, where every stroke on a 512 by 512 map wrote megabytes; a small one is saved after every stroke as before, and anything waiting is written when the editor closes, the page hides, the map is saved or another one loads
- The FAQ and REFERENCE say how far a world can go and how long a game can run before 32-bit floats on the GPU run out of precision
- The TypeScript example is typed by the shipped littlejs.d.ts in strict mode and imports 'littlejsengine' as an npm game does, an import map giving the browser the build; the Vite starter installs 1.25, where its lock held 1.18.19
- A Shader's or a post process's code comes after the engine's own in the shader, so a define in it can not rewrite the engine's names, where a #define of one, the vertex color say, changed what was drawn; the 3D shader drops see through texels at the end, after the normal map and texture reads that need the pixels around them
- Examples: the raycaster walks on a phone, shorts sized for the example browser fill any window, the starter, module and TypeScript examples match again, 3D shorts share one mesh among objects of the same shape, as the instancing one teaches, and smaller fixes
- Object collision with many solids is far faster: a mover checks only the solids near it, found through a grid, where it checked every one; 2000 movers went from about 1.3 s a frame to 12 ms in a test, and every contact resolves exactly as before, in the same order, but for a solid moved during physics by something other than its own update (a collision callback moving a third object, a lift's updatePhysics moving a crate), which is found where it went from the next update on
- Input: a key, button or tap released and pressed again in one frame reads as both, where the release was lost, and a keydown the browser does not mark as a repeat for a key already held does not press it again
- Canvas2D draws a texture smooth or pixelated as its own setting says, as WebGL does; the main canvas starts each frame with no alpha, filter or shadow a game left on it; toggleFullscreen refused by the browser leaves no error in the console
- A tile layer's shadow is cast by its solid cells only, not by negative markers; a color with a NaN in it is black as text in a release build too; glDeleteTexture leaves the engine holding nothing of the texture
- A tween whose callback throws no longer stops the other tweens moving that update, its error coming out after them
- glTF: parseGLTF takes the bytes as a typed array or a Node Buffer too, and an accessor off its values' alignment, or a sparse one past its buffer, says so by name where it threw a bare RangeError
- Matrix4.getRotation is exact just short of straight up or down, where it was off by up to 5e-4; getNearestClearNode searches each ring alone, the same node found
- A tinted drawTextureWrapped on Canvas2D bakes its tint once and keeps it for an image, where it baked the whole image on every draw (a canvas, which a game may draw into, is still baked at every draw), and draws smooth or pixelated as its texture says
- Level editor: a Save whose file was written is not taken for a failed one when what follows throws, which downloaded a copy; layers a game makes in code again and again no longer pile up in it; a map shrunk from the top drops a point or rectangle on its top edge
- Docs: align2D with any canvas size, an exported prefab names the prefabs inside it, a large time scale costs as many updates, the engineStep example, and Box2D: the EngineObject physics fields a Box2dObject leaves unused, and why a world made again does not step as a fresh one
- A medal unlocked before medalsInit stays unlocked and is saved when it is called, where the save it loaded took it back; a later medalsInit with another save name starts from that save

### Breaking Changes

- The built in video capture is removed: key 8 on the debug overlay, `debugVideoCaptureStart`, `debugVideoCaptureStop` and `debugVideoCaptureIsActive`. A screen recorder does it better, and the FAQ shows how to save a game frame by frame at an exact 60 fps with `setEngineManualStep` and `engineStep`
- Node 22.12 or later for the package's build and tests, the version CI runs; a game in the browser needs no Node at all
- The Electron example is removed, with Electron and electron-packager from the dev dependencies: a game for the desktop sets up Electron or another wrapper itself, loading its index.html as any page
- render3d.js is in three files: `render3d.js`, the renderer, then `render3dMesh.js`, meshes and the basic builders, and `render3dObject.js`, EngineObject3D, instancing and lights; nothing changes for a game on a build in `dist`, one that loads the plugins one by one adds the two after `render3d.js`

### Fixes

- Tile collision stops an object against a wall or a ceiling, as it already did on a floor, where it went back to where it was the frame before and stopped short by up to a frame's move, a gap that never closed for a game setting its velocity every frame; a bounce starts from the tile too, and a box landing with its top on a grid line no longer snaps into the tile above it
- A 3D particle emitter that outlives a scaled or turned parent keeps the parent's scale and turn, where it kept only its place and its particles fell at a quarter of the speed under a parent scaled by four; a particle's create callback reads the emitter's scale when it is emitted by hand before the first update or from inside another callback
- A UI object moved to another parent or detached in its own update is updated once that update, where it could be updated twice

## 1.25.0 - 2026-10-04

### New Changes

- glTF skinned animation: a rigged character plays its animations, its mesh bent by its joints each frame, the four strongest of up to eight a vertex, on the CPU, so shadows, picking and custom shaders work with it; `object.play(name, loop, speed, blend)` cross-fades from the pose it is in over `blend` seconds, and `object.getJointMatrix(name)` gives a joint's place to hang a sword on a hand
- Tilt shift and depth of field post effects: `postProcessTiltShift(focus, size, blur)` keeps a band across the screen sharp, in 2D or 3D, and `postProcessDepthOfField(focus, range, blur)` keeps what is at a distance sharp, reading the 3D depth, with the edges of what is in focus kept crisp; the new 3D Focus Blur example focuses either with the mouse
- `postProcess.values`: a game's own values for the post process shader, set every frame, and any effect setting may name one in place of a number, to change it live without making the shader again, all but glow's size; the shader is made at the first render, so values set right after the plugin is made are in it
- The 3D Mesh example steps through a dropped model's animations with two buttons or the arrow keys, each cross-faded from the one before

### Breaking Changes

- The names deprecated in 1.20 are gone: `collideTiles` is `collideLevel`, the weld joint's `setSpringDampingRatio` and `getSpringDampingRatio` are `setDampingRatio` and `getDampingRatio` (the wheel joint keeps its own), and `NewgroundsPlugin.logView()`, which did nothing, is removed
- `drawNineSliceScreen` and `drawThreeSliceScreen` take only the order since 1.20, a color after the tile and then the border size; a number in the color's place asserts in a debug build

### Fixes

- REFERENCE says where the draw functions' parameter orders differ, and has a section on what functions give back: what each raycast returns, overlaps and collide helpers, not found, how a failed load is reported and how each kind of thing is ended; the FAQ lists the global names a game's own top level declarations clash with in a script build
- REFERENCE has a section on units and directions (angles in radians, clockwise in 2D, what is per frame and what is in seconds), says which vector and color methods give a copy, and names parameters as the code does; the Box2D shape methods, the vector helpers and a few others say what they return
- In a browser with no audio, a zzfx sound and the page hiding do nothing, where they threw
- A resume of the audio the browser refuses is caught, where it showed as an uncaught error in the console
- `debug`, `debugOverlay` and `debugWatermark` are `false` in a release build, as their types say, where they were 0
- `Box2dPinJoint`'s docs say its point defaults to objectA's position, which the d.ts showed as objectB's
- TypeScript: `tileLayersLoad` and `objectLayersLoad` take a `TiledMap`, `level3DLoad` a `Level3D`, the types' defaults and properties are records, a tool's `pos` and `ray` and `onPlayFrom`'s position are typed, `levelEditor.open` and `close` return nothing, `Sound` takes a zzfx array as numbers, and `fetchJSON` gives `any`, as JSON is, so its result goes straight into any of them
- A JSON, glTF or particle effect file that fails to read names the file, and says when it is a web page, as a dev server sends for a mistyped path, where it gave only "Unexpected token '<'"; an OBJ file with no faces warns, naming the file
- In a release build `levelEditor.edit2D` is there and changes nothing, where it was undefined and a call on it threw, so a game needs no guard around it
- A shader that fails to build on a device says why in the console in a release build too, where the screen stayed blank with no message: when the engine's own fails, the game draws with Canvas2D, a game's `Shader` that fails draws as if it had none, and a post process that fails leaves the frame as it is
- The post process depth is read at full precision, where phones with Mali and Adreno GPUs read it at 11 bits and the outline drew false lines on flat ground; the outline draws nothing with no depth texture, and nothing wrong at the sky of a camera with no far plane, where both gave NaN pixels; a value or a setting may not be named as a GLSL word or a name the shader uses, which was a compile error or a value silently hidden; a setting below .01 keeps its digits
- The 3D shader gives a mesh flattened to nothing on an axis no normal, where it was NaN, keeps the reflection's Fresnel term from NaN specks where a surface is seen head on, and treats fog that starts where it ends, and a shininess of 0, as defined
- `lineTest`, and the tile raycasts on it, from a whole x or y heading down the grid start in the cell they head into, where they tested the cell behind first and could hit at the start
- A particle whose `gravityScale` makes it rise lands on a ceiling, where its ground was the way the world's gravity points
- `readSaveData` takes only an object from storage, where a stored string was spread into its letters
- Faster where a game grows: path smoothing on a winding path checks lines from each corner, not each cell, a tween stopped among many no longer searches the list, a CSG cut leaves what is far from it alone, so a mesh cut many times does not grow slower to cut, and a paint stroke in the level editor draws the cells it changed, the whole layer only for a game's `onTile` or its own `onRedraw`
- Examples: the breakout tutorial runs at every step, the platformer's debug explosion is on B, not the dodge key, the Box2D example's smoke rises and its explosion falls off, the raycaster has no fisheye, the 3D Mesh viewer's normals leave a rigged model alone, positions are copied where they were shared, and a list of smaller fixes across the shorts
- An object whose child's update throws leaves the engine's list of children being updated as it was, where each throw kept them on it for good
- Level editor: a turned or mirrored stamp turns or mirrors its objects too, each object's rotation with it, a box placed from the corner that becomes its own, a polygon's points and a tile object's image mirrored

## 1.24.3 - 2026-10-03

### Fixes

- TypeScript: the d.ts keeps `undefined` where a value may be missing, so a game in strict mode can write `render3D.shader = undefined` and is told `light.flare`, `levelEditor.edit3D` or `uiSystem.keyInputObject` may be undefined; a game not in strict mode reads the same types as before
- `box2d.boxCast` and `boxCastAll` say that they test each shape's bounding box, which can find an object near the corner of a turned box or a circle that the box does not touch
- An image that failed to load gives tiles of no size, which draw nothing, where `tile()` gave NaN places in release builds and stopped debug builds at an assert; a texture slot never given an image still asserts in debug
- A release build says when a sound, a `loadSprite` or a `loadAtlas` fails to load, as it did for textures and tile sets
- A `Box2dObject` keeps one `pos` for life, moved in place each step as an EngineObject's is, so a camera holding it follows the body
- `drawRectGradient` takes no size, as its docs say
- A release build going on past an error logs each new error, not only the first, and an error every tick no longer runs the game at the screen's refresh rate
- Under pointer lock a click is a press wherever the locked mouse was left, a letterbox bar too
- A gamepad with no sticks keeps the one its d-pad stands in for, where its stick count flickered
- A zzfx `Sound` made in a browser with no audio counts as loaded and plays nothing, where it threw
- `glCompileShader`, `glCreateProgram` and `glCreateTexture` are typed as giving undefined with no WebGL
- A release build going on past an error clears that frame's input, where a key press whose action threw was pressed again every frame
- `loadSprite`, `loadTiles` and `loadAtlas` forget a load whose file failed, so loading it again tries again, where a failure once was kept for the session
- glTF: a file the model names in subfolders is found when what is in its folder was dropped, not the folder, and a file found by its name alone may have capitals in it, where both said the file was not among those given; the 3D Mesh short keeps a dropped folder's name when other files come with it

## 1.24.2 - 2026-10-03

### New Changes

- Tile sets from separate images: `loadTiles(['grass.png', 'brick.png', 'props.png'], 16)` packs tile images, or several tile sheets, into the texture sheets as one tile set, numbered in the order given, for `tileLayersLoad`, tile layers and the level editor's palette; an image that is not whole tiles gives the whole tiles in it, and a map's tileset margin or spacing does not replace the set
- Spotlight gels: `light.gel` is a picture the shadow casting spotlight shines through, cast along its beam in its colors, like a slide or stained glass; with none a scene draws exactly as before. The 3D First Person flashlight has one on G
- Less garbage each frame: objects are sorted only when one is out of render order and the destroyed taken out only when there are some, an object with mass that collides with nothing copies no position, and outlines and regular polygons are made into kept vectors, about 98 fewer for each outlined circle; a 3D pick makes no vectors for an object it misses
- `Mesh.computeNormals(true)` is 5 to 7 times faster, the same normals to the last bit: a 960 point flag in 0.24 ms where it took 1.8, so a mesh can be bent every frame
- `loadSprite`, `loadTiles` and `loadAtlas` give back what the first load did when the same image is loaded again with the same settings, packed once
- A release build goes on past an error in a frame, logging the first, where one error froze the game for good; a debug build stops and shows it as before

### Fixes

- A Tiled property named as a method of the object it is for, like `update`, is left out, where it replaced the method; a debug build says so
- `noise2D` stays noise however far out y is, where past about 24 million every row was one value; it gives the same values as before everywhere else
- Medals: the save keeps the unlock of a medal the game has not made this time, and a medal made after `medalsInit` reads its unlock, so a medal made late or behind a flag is never lost; `medalsReset` locks those too
- Older browsers: the engine starts with no `OffscreenCanvas` (Safari before 16.4), drawing into a canvas element in its place, and so do the textures it makes itself (normal maps from heights, particle shapes, light glows, lens flares, glTF's white texture), and uses neither `Array.prototype.at` nor `Object.hasOwn` (Safari before 15.4); the example browser's markdown has no lookbehind, which Safari before 16.4 could not read
- On an iPhone the silent switch mutes the game, as it does a ringtone, and the player's music plays on beside it; `setSoundIgnoreSilentSwitch(true)` has the game play through the switch as media does (Safari 16.4 and up)
- Level editor: the brush, its ghost and the palette read a tile past the end of a sheet as nothing, as the layer draws it, where a collision value picked up with the right button asserted every frame; the palette of a tile set filled in after it was first shown shows its tiles
- A light's flare looks past four lamps around it to what is behind them, where the fourth counted as hidden
- A click or tap in the bars around a letterboxed canvas presses nothing, where it pressed whatever was at the canvas edge
- `showConfirmDialog` while one is open gives the one open, where a second broke UI navigation in release builds
- The level editor's cut, copy and stamps keep an object's name, size, turn and visibility, where a paste made a bare point; objects moved with a selection or stamped land on their place to the digit, not a hair off
- The 3D editor's terrain paint rounds no heights, and a sculpt stroke rounds only those it changed
- A `UISlider` let go in the frame it moves takes that last place
- A gamepad of fewer buttons put in the slot of another holds none of the other's buttons; a gamepad axis that reads NaN is centered, where it failed an assert in debug builds
- `UITextInput` takes a keydown with no key, as autofill sends, where it threw
- `parseOBJ` reads a comment after a face, carriage return line ends and a line carried on with a backslash, and a release build leaves out a face of a vertex the file does not have
- `tileLayersFromLDtk` keeps a tile layer with no tiles as an empty layer, so a level of one loads and the editor can paint it
- Level editor: a property set in the box keeps its place and a `file` or `object` property its type; a save leaves out the object layer made for a first object that was undone; a new object layer's id is past every layer's
- 3D editor: taking a prefab out of the level takes its instances out of the game; a level's parts are saved in one order, so a level reloaded from its autosave saves the same
- `writeSaveData` asserts its data is an object, which `readSaveData` reads back, and returns whether it was written, false when storage is full or unavailable
- `parseAtlas` warns of two sprites with one name; `nearestPowerOfTwo` is never less than its value and is 1 for a value of 1 or less; a particle effect's name cut to 60 characters ends with no space
- A tile layer's raycast toward a point far beyond the layer walks only across the layer, where a ray to a far constant took seconds
- `debugShowErrors` shows a message as text, so a file name with markup in it can not add elements to the page
- Canvas2D tints clamp the color to 0 to 1, as WebGL does
- glTF: the keys of the files given may start with ./ or / or use backslashes, a uri above them is refused, and an accessor that reaches past its buffer is refused before its floats are made
- A level whose prefab holds itself, several times over, loads at once with that prefab left out where it holds itself, in place of making thousands of objects
- Small malformed files no longer make a loader run on: an Aseprite tag past its frames keeps to them, a glTF node reached twice and an accessor of millions with no buffer are refused, an LDtk level of millions of cells is refused and a tile or entity with no place is passed by
- LDtk: an IntGrid layer whose rule tiles are on another tileset keeps its values for collision, its tiles left out with a warning
- A collision layer named that no layer has says so in release builds too
- A light's lens flare: its lamp is a mesh around the light that the ray meets near the light and that is thin, so a globe or a lamp post is its own fixture, while a room or a level mesh hides the light, even one close behind its wall
- VoxelMap: the inside of a doubleSided face is split along the same diagonal as its outside, so it shows no seam
- glTF: `parseGLTF(data, baseUrl, files)` finds the `.bin` and image files a `.gltf` names among files given, like a drop's, from the model's own folder, or by the file name alone when only one file has it; a file it can not find is named in the error, and an image that can not be read in a warning; the 3D Mesh example takes a `.gltf` dropped with its files or in its folder, and frees the model it replaces
- Example browser: after the arrow keys move through the list, Enter keeps the example they went to, and Escape in the search clears it without also closing the list
- 3D levels: a color that is not a string, and a number that is NaN or Infinity (1e999 in JSON), are read as the default, in place of an assert or a NaN
- `tileLayersLoad` says so when a map is not a whole number of cells across and down, has no layers, or a layer's tiles do not fill it, in release builds too, in place of running on; every layer is checked before any is made. A game that relied on a release build loading such a map anyway now gets the error
- A tile past the end of a sheet read by its columns draws nothing, as an LDtk IntGrid layer's values past the art did in the level editor, which asserted
- A tween that loops or ping pongs with a duration of 0 or less, possible in release builds, ends its loops

### New Demos

- [Custom Editor](https://killedbyapixel.github.io/LittleJS/examples/?example=Custom%20Editor) - A level editor made for one game: a class of its own with a tool that lays out rooms by a drag, a button, a key and an overlay

## 1.24.1 - 2026-10-02

### New Changes

- A VoxelMap block type can be `doubleSided`, its faces shown from inside the block too, so the surface of water shows from under it
- 3D Voxels: the player goes under water and walks on the bottom, in place of floating at the surface
- `tileLayersLoad`'s `collisionLayer` may be a layer's name
- `light.addFlare` takes the flare's color too
- LDtk: an IntGrid layer is always a hidden layer of its values under its own name, its rule tiles in layers over it named with tiles, so `tileLayersLoad(map, tileInfo, 0, 'Collisions')` is solid where the values say, whatever the tiles stack or fade; a project of several worlds loads; a project with no tileset entry keeps its tiles
- The example browser has a new look, in the dark colors of the docs site: a slim top bar in place of the title, the demo at 16:9, and the example list as rows under their headings. A handle between the code and its write-up drags to give one the other's space, by touch and the arrow keys too, and is remembered; a double click puts the quarter back. On a phone the example's name, between Prev and Next, opens a full screen picker with the search. The Screenshot button is gone. A button in the top bar switches between dark and light, the choice shared with the docs site

### Breaking Changes

- LDtk: an IntGrid layer with tiles is now a hidden layer of its values under its own name, its tiles in layers named with tiles over it, so the layer indices and names of such a level move; name the collision layer, `tileLayersLoad(map, tileInfo, 0, 'Collisions')`, in place of an index

### Fixes

- Box2D: `addRegularPoly` with a side count that is not a whole number no longer hangs, as the engine's own polygons do not since 1.23.1
- The level editor's tile palette no longer asserts on a Tiled tileset with a margin or a spacing
- LDtk: a see-through tile keeps its opacity, in a layer of its own; a layer whose tileset is another size is left out with a warning, in place of being read as stacks; a missing level says so in release builds too
- A Tiled tileset's margin and spacing count from where the game's sheet starts, so a sheet inside an atlas keeps its place
- 2D level editor: applying an autosave of another size leaves an object layer it does not know about as the file has it, and an autosave whose tiles do not fit its size no longer resizes the map
- A light's lens flare is hidden by a room or a level mesh around it, seen from outside: only a lamp, a mesh around the light no wider than half its radius, is passed by
- Example browser: Enter on a focused example selects it, a heading named in a write-up is no longer a link that does nothing, blocked or broken saved preferences no longer stop the page, and the handle drags with the main button only
- 3D level editor: a broken autosave no longer blocks every edit until Drop, and one older than the last edits, which storage had no room for, says so as the 2D editor does

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
- LDtk levels load: `tileLayersFromLDtk(ldtk, level)` makes a level of an LDtk project a Tiled map for `tileLayersLoad` and `objectLayersLoad`, with its tile, auto and IntGrid layers, tiles stacked in a cell and see-through tiles, its entities as objects and their fields as properties
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
- 3D level editor: an edit of a level's scene, or its undo, no longer takes away a sun lens flare that an earlier level's scene gave the game
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
- A `Timer` set to a time below zero reads as done
- `UIVideo` lets go of its video when it is destroyed
- A texture atlas tag with no frames no longer drops the groups after it
- `setAdditiveBlendMode` works in headless mode
- The release build's `levelEditor` has `keys`, `buttons` and `tools`, as the debug one does

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
