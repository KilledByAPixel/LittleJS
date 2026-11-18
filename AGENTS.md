# LittleJS Project - AI Agent Instructions

These instructions are for making changes in the LittleJS repo safely. Optimize for small diffs, clarity, and ease of use.

## Non-negotiable rules

- **Prefer minimal, local changes.** Do not refactor for style unless asked.
- **No new runtime dependencies.** Keep LittleJS dependency-free at runtime.
- **Do not hand-edit generated build artifacts.**
  - Treat `dist/` as generated output.
  - Make changes in `src/` (and `plugins/` when appropriate), then run the build.
  - **`dist/` is committed only for a release.** Build it to run the tests and the examples, and leave it out of the commit (`git add -A -- . ':(exclude)dist'`), so between releases it shows as modified in the working copy. The repo's `dist/` is the last release; a rebuild may be committed between releases with a patch version bump when there is a reason to. The live site does not use the committed one: [.github/workflows/pages.yml](.github/workflows/pages.yml) builds `dist/` from the source on every push to main and deploys the repo with it.
- **Match surrounding style.** Follow the conventions in the files you touch.
- **Avoid breaking public APIs.** If a change could break users, call it out clearly and offer a compatible alternative.
- **Keep agent-generated working files under `.claude/`.** `docs/` is the published JSDoc API site and is fully generated — never hand-edit it, and don't regenerate it unless asked (see Documentation below). Superpowers plans go in `.claude/superpowers/plans/` and specs in `.claude/superpowers/specs/` (overrides the skill defaults). The `.claude/` folder is gitignored.

If anything in this doc conflicts with the actual repo behavior, follow the repo behavior and update this doc.

## Key resources

- `README.md` - Overview and getting started. It is the GitHub front page, the npm page and the docs site's homepage, so its links are absolute and its images are listed in `docsImageFiles` in [tools/buildDocs.mjs](tools/buildDocs.mjs). Its Quick Start page loads the engine from a local file, never a CDN, and nothing else, so it runs with no server. A feature a user would pick the engine for gets a line in its feature list
- `FAQ.md` - How to do the common things, with short code. A new system a game is likely to use gets an answer there, and an answer names the examples that show it as `examples/shorts.js` lists them
- `CHANGELOG.md` - What changed in each release, newest first, with an Unreleased section on top. A change a user would notice gets a line there when it lands (New Changes, Breaking Changes, Fixes). A release renames the section to its version and date and starts a new one. The GitHub release notes are that section
- `index.html` at the root only sends the site's visitors on to `examples/`, the example browser, which is the site's front page
- `REFERENCE.md` - API quick reference
- `EDITOR.md` - How a game makes the 2D and 3D level editors its own: the hooks, and the editors' own functions a script build can call. Both editors are meant to be the base of a game's own editor, so a change to a name that page lists is a change to what games use: update the page with it. Its code blocks marked `<!-- test:name -->` are run from the file by [test/editorCustom.test.mjs](test/editorCustom.test.mjs)
- `examples/` - Working examples demonstrating engine features

## Architecture overview

LittleJS is a modular HTML5 game engine with:

- **Core engine**: `src/engine*.js` (main loop, objects, rendering, physics, input, etc.)
- **Plugins**: `plugins/*.js` (optional features like Box2D, post-processing, UI, audio helpers, etc.)
- **3D**: plugins in the same bundle
  - `plugins/math3d.js`: Vector3, Matrix4, Ray3D, 3D collision and raycasts
  - `plugins/render3d.js`: the renderer (camera, shaders, shadows, the draw pass)
  - `plugins/render3dMesh.js`: Mesh and the basic builders
  - `plugins/render3dObject.js`: EngineObject3D and its collision, InstancedMesh3D, Light3D, DirectionalLight3D
  - `plugins/render3dExtras.js`: the other builders, HeightMap, MeshCollider, camera controls, particles, trails, the OBJ loader, CSG
  - `plugins/gltf.js` (glTF and GLB), `plugins/render3dVoxels.js` (VoxelMap), `plugins/render3dLevel.js` (3D levels)
  - `plugins/render3dDebug.js` and `plugins/render3dEditor.js` (free camera, 3D level editor): debug only, stubbed in `src/engineRelease.js`
  - `plugins/threejs.js` is the alternative that renders with Three.js
- **Camera**: `plugins/camera.js`. The last live camera in `cameraList` drives the view, updated after the objects move, never while paused. [test/followCamera.test.mjs](test/followCamera.test.mjs), [test/cameraShake.test.mjs](test/cameraShake.test.mjs)
  - A camera reads input only while it drives (`cameraDriver() === this`)
  - A pointer lock a camera took is its own (`cameraLockOwner`), let go once it no longer drives unless the driver takes it on. A lock the game or the free camera took is never touched
  - Shake is core (`cameraShake` in `src/engineDraw.js`), applied around the frame's render only
- **Parallax**: `plugins/parallax.js`, `ParallaxLayer`, repeats across the view, so its image must tile. [test/browser/parallax.html](test/browser/parallax.html)
- **Tile sets**: `loadTiles` (plugins/textureSheet.js) hands back a TileInfo whose `tiles` list fills in as the images load; draws and the editor's palette read tile n from `tiles[n]` before the grid. [test/tileSet.test.mjs](test/tileSet.test.mjs), [test/browser/layers2d.html](test/browser/layers2d.html)
- **Level files**: `tileLayersLoad` reads Tiled JSON, and `tileLayersFromLDtk` makes an LDtk level a Tiled map, so the loaders and the editor have one format. `collisionLayer` takes a name. [test/ldtk.test.mjs](test/ldtk.test.mjs)
- **2D lights**: `plugins/lightSystem.js`, a lightmap and a shadow map of every `castShadow` object. [test/browser/lights2d.html](test/browser/lights2d.html), [lights2dSun.html](test/browser/lights2dSun.html), [lights2dNormals.html](test/browser/lights2dNormals.html)
  - One `DirectionalLight`, a sun, `sunDirection` toward the sun as in 3D: 13 draws a frame, 20 with a `castBackgroundShadow` caster, and no work or textures without one. With a sun the shadow map's size and the sun's must be powers of two
  - A point light with no cone and no gel multiplies by exactly 1. A TileInfo gel is read as that tile alone, unlike 3D's
  - `lightSystem.normalMaps` is opt in
- **Platforms**: `plugins/newgrounds.js` and `plugins/wavedash.js`, the same shape: a Medal subclass and a plugin with postScore, getScores, cloudSave and cloudLoad. [test/wavedash.test.mjs](test/wavedash.test.mjs)
  - `window.Wavedash` is read at each call, so off the platform everything does nothing. Its calls pass real booleans and whole numbers, since it throws on a wrong type
  - A slot's Wavedash saves and loads run one after another (`slotQueue`)
  - The Wavedash calls were playtested there; the Newgrounds cloud saves and logEvent have not been tried on the site
- **One-way collision**: `layer.setOneWay(tile, direction)` and `obj.oneWay`. [test/oneWay.test.mjs](test/oneWay.test.mjs), the Platform Physics short
  - `setOneWay` keys by the tile a cell draws, since the loaders set every collision value to 1, and turns with the cell's art. The table is `oneWayTiles`; `oneWay` is the object's field
  - It blocks only what was wholly on its far side at the start of the frame, or what stood on it then
  - Massless solids that are one way or that move (an elevator) move first, so the outcome does not depend on render order
  - An object that starts a frame inside tiles meets no tiles till it is out, the pushed rule; do not grow it back
- **Bullets**: `obj.isBullet` moves through the tiles with `engineObjectBulletSweep`, tiles asked about nearest first whatever the layer order. It stops 2e-3 off a surface, clear of the one way margin of 1e-3. A cell is solid to it when its collideWithTile takes it, asked with isHit false. [test/bullet.test.mjs](test/bullet.test.mjs)
- **Level editor**: `src/engineEditor.js`, debug only; object layers (`objectLayersAddType`, `objectLayersLoad`) ship in `src/engineTileLayer.js`. See "Level editor" below
- **Build system**: `src/engineBuild.mjs` (concatenates modules into distributable bundles)

## Repo structure and file types

### Engine source (`src/*.js`)
- Modular architecture (one subsystem per file)
- Concatenated at build time (internal source does not use ES modules)
- Code is vanilla JavaScript with type info expressed via JSDoc comments

### Build output (`dist/`)
Common outputs include:
- `littlejs.js` - Full bundle (debug features included)
- `littlejs.release.js` - Production bundle (debug stripped)
- `littlejs.esm.js` - ES module build (import/export)
- `littlejs.esm.min.js` - Minified ES module
- `littlejs.d.ts` - TypeScript definitions

Use via script tag or ES module import:
- `<script src="dist/littlejs.js"></script>`
- `import * as LJS from './dist/littlejs.esm.js'`

Prefer adding new optional features as plugins when it keeps the core simpler.

### Examples
- `examples/starter/` - Plain JavaScript global usage via `<script>` (recommended starting point)
- `examples/module/` - ES module import pattern
- `examples/typescript/` - TypeScript example usage
- `examples/shorts/*.js` - Single-file demos loaded by the shorts harness; the 3D ones are `render3d*.js`
- `examples/3d/` - The 3D plugin in one scene; `examples/threejs/` - the same idea rendered with Three.js

### Benchmarks
- They live in the [webgl-engine-bench](https://github.com/KilledByAPixel/webgl-engine-bench) repo; its `littlejs-bench/` pages measure a change to the engine. They load a copy of `dist/littlejs.release.js` kept in that folder, copied over after a build. Its README says how to run them and how to read the numbers
- Per frame work in a LittleJS bench page goes in a pre render hook, not gameUpdate, since the fixed timestep runs gameUpdate several times a frame below 60 fps
- The GPU time comes from a timer query and only means something when the frame is at the refresh rate; a CPU bound page shows its CPU time there

### Short examples (`examples/shorts/*.js`)
Short examples are special:
- Pure JS code file, no HTML
- No imports, do not use LJS namespace - engine APIs are available globally
- Override hooks: `gameInit()`, `gameUpdate()`, `gameUpdatePost()`, `gameRender()`, `gameRenderPost()`
- Lines stay within 80 columns, and colors are written with `hsl(...)`, never `rgb(...)`, but in `colors.js`, which shows the color functions side by side
- Each short is listed in `examples/shorts.js` with a name, a short description and search keywords
- The example browser sets `setTileDefaultPadding(1)` for every short, since `tiles.png` has a 1 pixel border around each tile, so a short does not set it; one copied into a project of its own needs that line
- A short ends with its write-up: a block comment whose first line is `/* info`, the last thing in the file and its only block comment. The example browser takes it off the code and shows it in the info box (`splitExampleInfo`, `renderExampleInfo` in `examples/shorts.js`)
  - It is markdown: headings, paragraphs, one level lists, code, bold, italic, links. The text can not contain `*/`
  - It says what the example shows, then `## How it works`, `## Try it` and `## See also`, as `helloWorld.js` and `pongGame.js` do. What a short is about goes there and not in a comment at its top
  - A code span links to the docs entry of a name the docs' index knows. See also names examples exactly as `examples/shorts.js` lists them, since the names become links
  - Every engine name it mentions is checked in the source, and every Try it edit is run
  - A full example, which is a folder, has its write-up in `fullExampleInfo` in `examples/shorts.js`, under `## What it shows` and sometimes `## See also`
  - [test/docs.r5.test.mjs](test/docs.r5.test.mjs) checks the form, [test/exampleBrowser.test.mjs](test/exampleBrowser.test.mjs) the split and the markdown

## Coding conventions

### Factory functions vs constructors
Prefer factory functions for core types:
- `vec2(x, y)` not `new Vector2(x, y)`
- `rgb(r, g, b, a)` or `hsl(h, s, l, a)` not `new Color(...)`
- `tile(index, size)` for tile info

Use constructors for game objects and complex types:
- `new EngineObject(pos, size)`
- `new ParticleEmitter(...)`
- `new Sound(zzfxParams)`
- `new Timer(duration)`

### Naming
- `camelCase` for variables and functions
- `PascalCase` for classes
- `UPPER_CASE` for constants that are truly constant (like `PI`)

### Code style
- Use JSDoc with `@memberof` grouping (namespaces: Engine, Math, Draw, Input, Audio, Debug, Settings, etc.)
- Prefer single-line comments: `// comment`
- Use `ASSERT(condition, 'error message')` for validation (stripped in release)
- Use `LOG(...)` for debug output (stripped in release)

### Type checking
Use built-in type helpers for validation:
```javascript
isNumber(n)   // true if number and not NaN
isStringLike(s) // true if stringifiable (has toString returning a string)
isArray(a)    // true if array
isVector2(v)  // true if valid Vector2
isVector3(v)  // true if valid Vector3 (3D math plugin)
isColor(c)    // true if valid Color
```

[test/dts.test.mjs](test/dts.test.mjs) caps how many `any` types the d.ts has, so a new one is typed instead; lower the ceiling when a change takes some away. A JSDoc `{Object}` is `any` there: describe the shape with a `@typedef`, as `ParticleEffect` and `Level3D` do. An optional parameter in a function type is written as an arrow type, `(cell: Vector2, mirror?: boolean) => boolean`, since `function(boolean=)` comes out required.

A field that starts as `undefined` reaches `dist/littlejs.d.ts` as `any`, because tsc infers field types from their assignments. Give it a `@type` tag beside its `@property` tag, the way `fogColor` and `obj.shader` do:
```javascript
/** @property {Shader|undefined} - Custom shader to render with
 *  @type {Shader|undefined} */
this.shader = undefined;
```

### Math aliases
Engine source exposes short aliases for common `Math.*` calls — prefer them
over `Math.X` in engine and plugin code:
```javascript
abs, floor, ceil, round, min, max, sign, hypot, log2, sin, cos, tan, atan2, PI
```
For things without an alias (e.g. `Math.trunc`, `Math.SQRT2`), use `Math.*` as normal.

### 3D plugin conventions
The 3D API mirrors the 2D one, so the same rules hold unless a 3D reason overrides them:
- Argument order follows 2D: `tileInfo` before `color`, and `EngineObject3D(pos3D, mesh, tileInfo, color)` like `EngineObject(pos, size, tileInfo, angle, color)`
- Builders, draws and objects take full sizes (diameters), like `drawCircle`; the math helpers (`collideSphereBox`, `raycastSphere`) and `Light3D` take a radius, and the parameter says which
- The `3D` suffix goes on fields that have a 2D counterpart (`pos3D`, `size3D`, `velocity3D`), on classes with a 2D namesake (`Camera3D`, `Light3D`, `ParticleEmitter3D`) and on functions where nothing in the name says 3D (`isOverlapping3D`, `collideBoxBox3D`); `Mesh`, `HeightMap` and `raycastSphere` need none
- Meshes come in three forms; the upload sends an indexed list for each:
  - Triangle strips, from the builders: every strip repeats its first point, the odd triangles read the other way, and the pass draws with `frontFace(CW)`
  - Indexed lists, from `addTriangles` and the model loaders: `mesh.indices`, counter clockwise from the front. `toIndexed()` turns a strip mesh into this form
  - `setVertexData`, for big generated meshes: the GPU layout itself (`RENDER3D_VERTEX_FLOATS` floats a vertex, `meshWriteVertex`) with no points; every method that reads or edits points asserts on it. [test/meshVertexData.test.mjs](test/meshVertexData.test.mjs)
  - Back faces are culled unless `mesh.doubleSided` is set, which the open builders do themselves
- Mesh operations (`mirror`, `spin`, CSG) return a new mesh and never change their inputs, since builder meshes like `render3D.boxMesh` are shared
- CSG (`union`, `subtract`, `intersect`, in render3dExtras.js): parts that overlap must be joined with `union`, not `combine`. The weld after a cut merges points within the 1e-5 epsilon only, since a point moved farther leaves its plane and the next cut splits it again
- Draw state lives on `render3D` (`additive`, `emissive`, `specular`, `receiveShadow`, `shader`, ...):
  - A new field goes in `RENDER3D_STATE_FIELDS`, `render3DCaptureBatchState`, `render3DApplyBatchState` and `render3DStateChanged` (the batch key, written out by hand), in `render3D.drawState` and the `Render3DDrawState` typedef, and gets an accessor
  - Code on the per draw path must not set a field and set it back, or every draw pays the full compare (`render3D.stateVersion`)
  - The stage loop sets it from each object's flags through `render3DSetObjectState` and resets it before every callback, so an object's flag is never read at draw time by anything else
- Level collision in 3D: `HeightMap`, `VoxelMap` and `MeshCollider` join `render3DLevel` when made and leave it on destroy. An object with `collideLevel` (on by default in 3D `setCollision`) and a mass is resolved against them in `updatePhysics`, through each one's `levelCollide3D(o, oldPos, wasOn, fromOther)`, which sets `groundObject`. The details are in the comments beside the code; these are the rules a change must keep, and the tests that hold them:
  - **One slope rule, HeightMap and MeshCollider.** Ground steeper than `groundAngle` is not ground: `groundObject` is not set, so a jump can not climb it, and the body is pushed out along the normal, so it slides. A face steeper than both `groundAngle` and about 45 degrees is a wall where it rises past the body's step, and stops only the part of a move into it; a curb or a stair riser under the step is climbed. [test/meshCollider.test.mjs](test/meshCollider.test.mjs), [test/fullPass13.test.mjs](test/fullPass13.test.mjs) to 17
  - **HeightMap wall rule** (`wallAhead`, `faceNormal`, the ring of side samples in `levelCollide3D`): skipped whole on a map whose `steepestFace`, kept by `rebuild`, is not steep enough to be a wall, so rolling ground pays nothing. The sweep's raycast looks no further than the move
  - **HeightMap edge**: no rule. A body that comes onto a map from off its edge is set on the ground; a game keeps its bodies on the map
  - **MeshCollider V rule** (`meshColliderResolve`): frozen. Any change is the owner's decision and must pass [test/meshColliderShapes.test.mjs](test/meshColliderShapes.test.mjs), which any change to a MeshCollider runs
  - **Order of shapes** (`render3DCollideLevel`): the shape stood on last frame first, with wasOn, then every other without it, then, only when none grounded the body, the others with wasOn and fromOther, so the result is the same in any list order. [test/levelCollideOrders.test.mjs](test/levelCollideOrders.test.mjs)
  - **Lifts**: a level shape moved by its velocity moves before the rest (`engineObjectsMovesFirst`) and lands a body relative to its own speed; one moved by pos3D is no lift
  - **Solids** (render3dObject.js): a push within the standing object's `groundAngle` of up, off a box's face, is turned straight up and sets `groundObject`. A stack holds in any list order by what each box stood on last frame (`render3DGroundLast`) and by one pushed up lifting what stands on it (`render3DRidersLift`). The door rule: a body squeezed between a still wall and a fixed solid that moves ends in the door, never in the wall (`render3DSettleFixed`, `render3DInAtStart`). The follow-down (`render3DFollowSolid`) keeps a body on the ground walking down a leaning box, and runs only near one
  - **Callbacks have the last word.** A `collideWithObject` that moves, attaches, destroys or turns off a body ends that pair with no push. It is asked through `render3DCollideAsk` from three places, the pair loop, `render3DSettleFixed` and the follow-down's `ask`: a check added to one is added to the other two, the cause of most regressions in passes 37 to 41
  - Level collision takes an object as its upright box, while solid boxes turn with `rotation3D`. VoxelMap's pos3D is its corner and a cell is one unit; HeightMap's pos3D is its center; both stay upright and unscaled. A test that makes a HeightMap as a plain lookup destroys it, or it catches the bodies of the tests after it
- Billboards are lit as billboards by a flag on the batch (`instanceBillboard`, `streamBillboard`), never by setting a draw state field and setting it back. An opaque one is an instance of `render3D.billboardMesh`; one that blends goes in the stream in its sorted place. [test/browser/billboardLighting.html](test/browser/billboardLighting.html), [test/billboardInstancing.test.mjs](test/billboardInstancing.test.mjs)
- Picking: `render3D.pick`, `engineObjectsRaycast3D` and the editor go through `render3DRaycastObject`. A mesh is hit on the triangles the pass draws, so not from inside unless `doubleSided`; nothing is cached. A glTF model or attached prefab is hit through its parts and given back with `hit.part`; an InstancedMesh3D is never hit. [test/pickTriangles.test.mjs](test/pickTriangles.test.mjs)
- An object drawn through internal parts (a `GLTFObject`'s, an attached `Prefab3D`'s, a `VoxelMap`'s transparent child) hands them its draw settings by a `drawOwner` link (`render3DShareSettings`). A new draw field an owner should hand on goes in `RENDER3D_PART_SETTINGS` and is read through `render3DSetting`
- Plugin code reads an object's world matrix through `render3DObjectMatrix(o)` and never changes it; `getMatrix()` hands out a copy
- 3D draws only work inside the 3D pass (an object's `render3D()` or `render3D.onRenderOpaque` / `onRenderTransparent`); asserts belong outside the pass, since the pass has a try/finally that hands the GL state back to 2D
- **Pixel identity.** A scene that uses none of these draws pixel for pixel as before, and a change must keep that: a light with no cone or gel, a material with no maps, and no `Shader` set (a snippet without `mainNormal` or vertex code gets the old sources to the byte). The shadow map's axes must not change, or old shadows would move. `.claude/gel/identity.mjs` and `.claude/materials/check.mjs` (not in the repo) compare builds
- Lighting: `render3D.sunDirection` points toward the sun, a `DirectionalLight3D` shines from its position toward the origin, `emissive` is a number (0 lit, 1 its own color, above 1 overbright), and `rotation3D` is Euler pitch, yaw, roll applied roll, pitch, yaw. All of it matches three.js, and REFERENCE.md has a "Coming from three.js" section to keep in step
- Spotlights: a `Light3D` with a `coneAngle` shines along its own forward (`getForward3D`, -Z). `render3D.shadowLight` makes one the shadow caster, one caster at a time. [test/browser/spotLight.html](test/browser/spotLight.html)
- Lens flare: `LensFlare3D` (render3dExtras.js) draws in the 2D pass, its `render()`. Its size is `flareSize`, since `size` is the 2D size. `light.addFlare()` makes one for a Light3D; `light.flare` is that flare or undefined and takes no true or false. A level's Light has `lensFlare`, not `flare`. [test/browser/lensFlare.html](test/browser/lensFlare.html)
- Materials: `normalMap`, `shininess`, `reflectivity`, `emissiveMap` and `emissiveMapColor` are draw state like `specular`; `roughness` is an accessor over `shininess`
- Texture units in the 3D pass: material maps 2 and 3, a spotlight's gel 4, the environment 5, the sky box 6, set by `render3DSetMapUnits` at the pass start, white when unused
- Environment maps: a `CubeMap` (`makeCubeMap`, `loadCubeMap`, or `capture(pos3D)` from the scene) for `render3D.environment`, `render3D.skyBox` and an object's `environment`. `loadCubeMap` mirrors each image and swaps +x and -x, so a sky box set shows as three.js does. A cube being captured (`render3D.capturingCube`) is not bound, drawn or reflected, since that is a feedback loop. [test/browser/environment.html](test/browser/environment.html)
- Custom shaders: `Shader` (core, `src/engineDraw.js`) holds a `mainImage` snippet; each renderer wraps it with its own program (`glShaderProgram` in 2D, `render3DFragmentSource` and `render3DShaderProgram` in 3D)
  - The 3D fragment source is one function for the plugin's own program and every snippet's, so they cannot drift. The promised snippet names are macros in `RENDER3D_SNIPPET_NAMES`
  - Optional: `mainNormal(inout vec3 n)`, and `vertexCode` with `mainVertex(inout vec3 pos, inout vec3 normal)`, run by the shadow depth program too. Uniforms are set by `setUniform`. [test/browser/shaderUniforms.html](test/browser/shaderUniforms.html)
  - An InstancedMesh3D's `setDataAt` data rides vertex slot 8, enabled with its divisor only in `render3DDrawInstanced`. [test/instanceData.test.mjs](test/instanceData.test.mjs)

### Level editor
The editor paints a game's tile layers and edits its object layers while the game is held still, saving Tiled JSON (the engine loop holds it while an editor is open, whatever the game sets `paused` to, `enginePausedNow`):
- **Where it lives.** `src/engineEditor.js`, in the `engineDebugFiles` build list with `plugins/tweakables.js`, so only the debug bundle has it; `src/engineRelease.js` stubs every name core code calls
- **The map is the source of truth.** The editor changes the Tiled map object the game passed to `tileLayersLoad` in place, and mirrors each change onto what the game made from it. Saves and autosaves come from the map, never from the live layers. A game that loads the same map object again, as a restart does, gets the edits
- **An async `onRestart`** is waited on till its promise settles, the only thing that ends the wait (`editorRestartRunning`, `editor3DRestartRunning`). Both editors refuse edits meanwhile; Play and Escape close the editor with no `onPlayFrom`. This is the owner's rule, and a new case that lets go of the wait is his call
- **Every edit goes through one path, so undo, autosave and the game stay in line.**
  - A tile: `editorPaint(layer, cell, gid)`. Objects: `editorChangeObjects(layer, (list)=> ...)`, which edits a copy of the layer's object list
  - Both add to the current stroke. `editorStrokeEnd()` makes it one undo and autosaves it; `editorStrokeCancel()` takes it back with no undo
  - A big edit (fill, clear, undo) runs inside `editorBulkEdit` so each layer redraws once
  - `editorResize` is an undo entry of its own, and the game makes its layers again through `onRestart`, without which a level can not be resized
- **Input.** Letter shortcuts are in `editorKeys` and `editorCtrlKeys`, read by the key's printed letter (`e.key`); an action that returns `false` did nothing and leaves the key to the browser. Digits, Space and the mouse come through the engine's input in `editorUpdate`
- **Adding a tool or key:** add it to `editorKeys` (and a button in `editorPanelInit` when it needs one), make the edit through `editorPaint` or `editorChangeObjects`, end with `editorStrokeEnd()`, and add it to `editorHelpLines` and, when it depends on what is held, `editorHint`
- **Adding an object property type:** `editorPropertyEditable` and `editorPropertiesUpdate` make its input, `editorObjectSetProperty` writes it as a Tiled property, and `objectLayersProperties` reads it back when objects are made
- **Game hooks.** `levelEditor`, an instance of `LevelEditor`, is the public API of both editors (see EDITOR.md). [test/editorExtend.test.mjs](test/editorExtend.test.mjs); `examples/platformer` sets all of them
  - The hooks (`onTile`, `onRestart`, `onPlayFrom`) and the moments (`onOpen`, `onClose`, `onUpdate`, `onDraw`, `onPanel`, `onSave`) are empty methods of the class, set on the instance or overridden by a class given to `setLevelEditor`. Whether a hook is given is asked with `editorHas(name)`, never by reading it
  - `addKey`, `addButton` and `addTool` keep what the game added on the instance. `edit2D` (`editorEdit2D`) and `edit3D` (`editor3DEdit`) are the edit functions a game calls
  - The 3D editor is the core's `editorOther`, so no core code names the plugin. `src/engineRelease.js` has the same class doing nothing, so a game needs no guards
  - `objectLayersAddType(name, make, defaults, tileInfo)` names the object types, with a string since minified builds rename classes
- **Save and autosave.** The 3D editor follows the same rules
  - A file Save wrote becomes the record's baseline (`editorSetBaseline`), for Reset to file. A download does not, and neither does a file of another name
  - A picked file of the same name may be a copy, so after a Save the autosave stays (`hash`, `savedHash`) until a reload finds the file has the edits
  - Autosaves live in `localStorage`, one entry per map. A file that changed under an autosave waits for Apply or Drop; an autosave is never dropped but by Drop
- **Tests.** `test/editor.test.mjs`, `test/editorObjects.test.mjs` and `test/objectLayers.test.mjs` run headless on `test/vmEngine.mjs`; headless mode skips `inputUpdatePost`, so their `step()` clears the pressed keys by hand, and the panel is never made. The panel and drawing are checked in headless Chrome on the platformer, with scripts under `.claude/editorcheck` (not in the repo): drags are paced, since a whole drag inside one slow SwiftShader frame reads as a click

### 3D level editor
The 3D editor places and moves a 3D level's objects while the game is held still, as the 2D editor's is, saving plain JSON:
- **Where it lives.** `plugins/render3dLevel.js` is a normal plugin with `level3DAddType`, `level3DAddMesh` and `level3DLoad`; `plugins/render3dEditor.js` is in `engineDebugFiles` after `src/engineEditor.js`, and `src/engineRelease.js` stubs what other files call of it
- **The level is the source of truth.** The editor changes the level object the game gave `level3DLoad` in place, and brings what the game made in line
  - What the editor makes (objects, the block map, the terrain) joins the list `level3DLoad` returned for that level (`editor3DLevelLists`), so the game's own unloading takes them. This is the owner's rule: the editor has no rule of its own for when to destroy them
  - An object that only moved, turned or changed size is moved where it is; one whose type or properties changed is made again, since constructors take the properties
- **Every edit goes through one path.** `editor3DChange((list)=> ...)` edits a copy of the object list, `editor3DStrokeEnd()` makes the changes since one undo and autosaves, `editor3DStrokeCancel()` takes them back
- **Level parts.** The scene, the blocks, the terrain and the prefabs are the level's parts, `editor3DLevelPartNames`, changed through `editor3DChangePart(name, change)`. A new kind of level content is a new name there and a branch in `editor3DSetPart` that shows it. `editor3DLevelParts` hands out shared copies: copy one again before changing it
- **The view and input.** The editor draws with `editor3DCamera`, swapped in and out around the render, so the game's update always has its own camera. `inputCapture(true)` makes the game read no keys or mouse. Tool keys are read by position (`KeyW`), in `editor3DKeys`; Ctrl shortcuts by the letter the key prints, in `editor3DCtrlKeys`
- **The file.** `{littlejs3D: 1, objects: [{id, type, pos, rotation, scale, properties}]}`: rotation in degrees, a Color a hex string, a vector an array, and rotation, scale and any property left out when it is the default
- **The scene block.** `scene: {sky, ambient, sunDirection, sunColor, fog, fogColor, shadows, lensFlare, skyBox, environment}`, applied by `level3DSceneApply`, edited through `editor3DChangeScene`. [test/level3DScene.test.mjs](test/level3DScene.test.mjs), [test/browser/editorScene.html](test/browser/editorScene.html)
  - A key left out or wrong stays as the game set it. No physics settings go here (gravity is the game's)
  - A level does not carry its scene into the next: `level3DSceneUndo` puts back only a field still holding the block's value, so what the game set itself stays
- **The block map** is `voxels: {pos, size, blocks}`, blocks as runs of a count and a type along x, then y, then z (`level3DVoxelsEncode`), made a `VoxelMap` (`level3DVoxelMap`). **The terrain** is `terrain: {pos, size, height, color, heights, paint}`, made a `HeightMap` (`level3DTerrainMap`), at most 129 samples a side (`LEVEL3D_TERRAIN_SAMPLES`) since sculpting rebuilds the whole mesh
- **Painting and sculpting** change the game's map as they go, and `editor3DStrokeEnd` writes the result into the level (`editor3DVoxelStore`, `editor3DTerrainStore`); undo goes by the level (`editor3DVoxelShow`, `editor3DTerrainShow`)
- **Types.** A class is made with `new make(pos3D, properties)`, so it needs a constructor of its own that takes the position: one that hands every argument on to `EngineObject3D` would hand it the properties as its mesh. A constructor may put its body away from the position given; that offset is kept (`level3DBaseOffset`, `level3DOffsetOf`, `editor3DBoxOffset`). The loader reads a value of the wrong type as the default and does not set a property the type has no default for
- **Prefabs.** `level3DAddPrefab(name, {objects, attached})` makes a small level a type; its instance is a `Prefab3D`, a handle that makes its `parts` the first time it is placed. [test/level3DPrefab.test.mjs](test/level3DPrefab.test.mjs), [test/editor3DPrefab.test.mjs](test/editor3DPrefab.test.mjs)
  - Parts are objects of their own in the world, since a child does not collide in 3D, or, attached, the handle's children with their collision off
  - The level keeps an instance by its prefab's origin, while an attached handle sits at the middle of its parts' box: the editor goes by `editor3DPos(object)`, never by the handle's `pos3D`
  - Edit prefab (`editor3DPrefabEnter`, `editor3DPrefabBack`) loads a prefab as a level of its own. The level's maps are put away, not destroyed (`editor3DMapsPutAway`), so a game holding the HeightMap or VoxelMap `level3DLoad` gave it still has the live one
- **Autosave.** A level whose autosave is over `EDITOR_AUTOSAVE_WAIT_SIZE` characters waits a second after the last edit, and `editor3DAutosaveFlush` writes what waits on close, a hidden page, another level loading and entering a prefab
- **Adding a tool or key:** add it to `editor3DKeys`, make the edit through `editor3DChange`, end with `editor3DStrokeEnd()`, and add it to `editor3DHelpLines` and `editor3DHint`
- **Tests.** Headless: `test/level3D*.test.mjs`, `test/editor3D*.test.mjs` and `test/inputCapture.test.mjs`. The panel and drawing are checked in headless Chrome on the 3D Level Editor short, with scripts under `.claude/editor3d` (not in the repo)

### Global variables
- Engine time: `time`, `timeReal`, `frame`, `timeDelta`
- Camera: `cameraPos`, `cameraScale`, `cameraAngle`
- Input: `mousePos`, `mousePosScreen`, `mouseWheel`
- State: `paused`, `debug`, `debugOverlay`
- Settings are in `engineSettings.js` with corresponding setter functions

## Common patterns

### Game structure
```javascript
function gameInit() { }       // Called once after engine starts
function gameUpdate() { }     // Called every frame for game logic
function gameUpdatePost() { } // Called after physics, even when paused
function gameRender() { }     // Called before objects render
function gameRenderPost() { } // Called after objects render

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
```

### Creating objects
```javascript
class Player extends EngineObject {
    constructor(pos) {
        super(pos, vec2(1), tile(0, 16));
        this.setCollision();
    }
    update() {
        super.update();
        // custom logic
    }
}
```

### Common drawing functions
```javascript
drawRect(pos, size, color)              // solid rectangle
drawTile(pos, size, tileInfo, color)    // sprite from tile sheet
drawText(text, pos, size, color)        // text rendering
drawLine(posA, posB, thickness, color)  // line between points
drawEllipse(pos, size, color)           // filled ellipse
```

## Common pitfalls

- **New public APIs must be added to `src/engineExport.js`** - Variables and functions added to engine source files are accessible in script-tag builds automatically, but the ESM build (`littlejs.esm.js`) and TypeScript definitions (`littlejs.d.ts`) only include what's listed in `engineExport.js`. Plugin exports go in `plugins/pluginExport.js`. Forgetting this means ESM/TS users can't access the new API.
- **Every export must appear in REFERENCE.md** - [test/reference.test.mjs](test/reference.test.mjs) fails on a name that is exported but not mentioned, so a new API comes with its REFERENCE line
- **ASSERT and LOG are stripped in release builds** - Don't rely on side effects
- **Don't modify constant colors** - `WHITE`, `BLACK`, `RED`, etc. are frozen; use `.copy()` first
- **Time variables are global** - `time`, `frame` update automatically each frame
- **2D object collision goes through a grid from `engineCollideGridMin` solids** - `engineCollideGridWalk` hands a mover the solids near it in the list order checking every pair would. It must resolve exactly what every pair does: [test/collideGrid.test.mjs](test/collideGrid.test.mjs) runs a scene both ways and compares every value. A solid moved during physics by anything but its own update or a collision callback on it, such as a callback moving a third object, is not followed until the next update
- **3D solids use a grid too**, from three times `engineCollideGridMin`: `render3DSolidGrid`, walked by `render3DGridWalk` in list order. [test/collideGrid3D.test.mjs](test/collideGrid3D.test.mjs)
- **Fixed 60 FPS timestep** - Physics runs at 60 FPS regardless of display refresh rate. `setEngineVariableStep(true)` opts into one update per display frame with `timeDelta` the frame's time; per-frame values (velocity, gravity, damping, particle speeds) are not scaled, while values in seconds follow real time. Each frame's delta is first smoothed to whole display frames (`engineSmoothDelta`); deltas that do not fit whole frames of one length, like a variable refresh display, pass through as they are
- **A second finger is a pinch, not a second press** - with `touchPinchWheel` on (the default) two fingers turn `mouseWheel` by `touchPinch`, the mouse is between them and the button the first finger pressed lets go; a game with its own use for two fingers calls `setTouchPinchWheel(false)`
- **WebGL is enabled by default** - Set `glEnable = false` before `engineInit()` for Canvas2D only
- **Tile coordinates are bottom-left origin** - Y increases upward in world space
- **A plugin freezes on `engineFrozenTick`, not on `paused` alone** - the loop holds the game while paused, at a time scale of 0 and while a level editor is open; a plugin update that moves the game (Box2D's step, the camera, scenes, shake) returns when `paused || engineFrozenTick`, which a game's own plugin reads as `engineIsFrozen()`, and the touch gamepad hides under an open editor
- **A plugin runs nothing as it loads** - a bundler keeps such a statement, and everything it touches, in every game. Make a plugin's table with a function whose call is marked `/* @__PURE__ */` in the declaration (`const level3DTypes = /* @__PURE__ */ level3DBuiltInTypes();`), and mark a constant made by a call or `new` the same way. An array or object of calls is made in a marked arrow function called at once, as `BOX_WORLD_AXES` is. [test/treeShake.test.mjs](test/treeShake.test.mjs) fails on a statement at a plugin's top level, the tween system's hook the one allowed, and on an unmarked constant made by `new` or a call
- **Files are stored with LF endings** - with `core.autocrlf` on, a working copy may be CRLF, so an edit script normalizes `\r\n` to `\n` before matching and writes LF back, or the whole file shows as changed
- **An instance divisor stays on a slot only while its array is enabled** - in Firefox, a plain draw that reads a constant attribute through a slot whose divisor is set makes the next instanced draw on that slot read garbage; Chrome does not care, so test the 3D plugin in Firefox too. `render3DDrawInstanced` sets the divisors with the arrays and clears both after
- **Canvas2D and WebGL line ends differ on purpose** - the main canvas strokes with round caps and joins (set in `engineUpdateCanvas`); WebGL outlines use square ends and mitered joins for speed. Don't "fix" either to match the other
- **A Shader on a 2D untextured draw does nothing** - `drawRect` carries its color in the additive slot with a zero tint, so the snippet's output multiplies away; draw a white tile instead
- **Engine and plugin draws pass screenSpace themselves** - the draw and debug functions default it to the game's `drawScreenSpace` setting, so a call in `src/` or `plugins/` that leaves it out would move to the screen when a game turns the setting on; pass `false` for world space; a new function or method with a screenSpace parameter defaults it to `drawScreenSpace`; [test/screenSpace.test.mjs](test/screenSpace.test.mjs) checks both

## Review passes

Forty one review passes ran on the code after 1.30.1, and from about pass 30 most of what a pass found was in code an earlier pass had added. These rules are the owner's, from 2026-11-17, so the passes converge:

- **Fix only High and Medium**, by the fixed bar: High is a normal game written as the docs show that breaks; Medium is one that hits it in ordinary play and is noticeably wrong. A Low, an unusual setup or two conditions at once, gets a doc line or nothing
- **A fix that adds a mechanism is the owner's call**: a new rule, table, pass over the objects or check on a hot path. Say what it costs in lines and per frame, and what the plain alternative, a documented limit, would be. The default fix makes the code smaller
- **Before cutting or changing a rule, switch it off and run the tests**, to see what depends on it, and before adding one, look for the simple principle: the door rule is three lines where the crush rule it replaced was forty
- **Measure each pass against the last pushed build**: the size of `dist/littlejs.min.js`, and the time of a physics update in 2D, in a 3D pile of solids and on a HeightMap. A pass that makes either worse says so
- **Before a full pass, review the diff since the last push** as one change
- A new test is checked by putting the bug back: it must fail

### Known limits

Decided, documented where a user reads them, and not to be reported or fixed again without the owner:

- Arcade stacks of more than two or three boxes with mass, and a row of three pushed into a wall, depend on list order; Box2D is for stacking
- A gap closed all the way on a body, or a lift into a ceiling, can squeeze it into or through a solid; the door rule covers a door and a wall with room left
- Stepping off a level box onto another a little lower falls for a frame; the follow-down is only for leaning boxes
- A crest between a level shape and a solid hops; a V made of two MeshColliders gets no V rule; a walk across a steep V into one side bobs
- A body walking onto a HeightMap from off its edge is set on the ground however high the edge; a VoxelMap's blocks have no step
- A 2D body that starts a frame inside tiles, made, moved or grown there, meets no tiles till it is out, so one grown into the floor falls through; one grown on a one way platform falls through it
- A long chain of CSG cuts can drop part of a face
- An async `onRestart` is waited on till it settles, both editors refusing edits meanwhile; one that never settles blocks restarts till a reload
- Object property defaults are numbers, text, true or false, Colors, vectors, and lists and plain objects of those; a default of a class is copied and takes only its own fields from a level

## Developer workflows

### Build
```bash
npm run build
```

### Testing
```bash
npm test
```

- Most tests import `dist/littlejs.esm.js`. A test that needs engine internals or DOM events loads the script build `dist/littlejs.js` through `loadEngine()` in [test/vmEngine.mjs](test/vmEngine.mjs), where `run(code)` can read internals and reassign engine functions. Rebuild with `npm run build` after changing source.
  - Inside a `run(\`...\`)` template literal a regex backslash is lost, so write `[0-9]`, not `\d`
  - The vm has its own `JSON` and realm, as in a browser: compare a value read back from `run` after `JSON.stringify` in the vm and `JSON.parse` outside
- [test/setup.mjs](test/setup.mjs) stubs minimal DOM and enables headless mode. Most tests shouldn't call `engineInit` or `render()`, or assume `time` advances — construct objects directly instead.
- To test time-driven logic (timers, cooldowns, spawns), call `setEngineManualStep(true)` before `engineInit`, then advance with `engineStep(frames)`. See [test/engineStep.test.mjs](test/engineStep.test.mjs). Call `engineInit` once per file at module scope: `frame` and `time` are module globals and monotonic, and `node --test` gives each test file its own process.
- Zero test dependencies — uses Node's built-in `node --test`. Match the style in [test/](test/) when adding new ones.
- [test/render3d.test.mjs](test/render3d.test.mjs) covers the 3D plugins headless: builder geometry and winding, draw state and batching decisions, collision and cameras. Nothing that needs a GPU (culling, lighting, a compiled shader) can be tested there; check that in headless Chrome with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) through playwright-core, and **never open a visible browser window**. Firefox renders WebGL differently enough to matter; its `--headless` screenshot leaves the WebGL canvas out, so have the page read its own pixels with `readPixels` and post them to a local server. Those harnesses live under `.claude/` and are not part of the repo.
- `npm run test:browser` is the browser smoke suite in [test/browser/](test/browser/): real WebGL in headless Chrome with the software renderer, no window and no dependency ([run.mjs](test/browser/run.mjs) drives the machine's Chrome over its DevTools socket with Node 22's WebSocket).
  - Its pages read real pixels. Each page covers one render path, and its name says which (`draw2d`, `canvas2d`, `lights2dSun`, `draw3d`, `editors`, `audio`, ...). `draw2d` runs again on the release and minified builds (`pageRuns`)
  - Every short runs 10 frames with no error or failed assert, and every full example but the Three.js one 30 (`example.html`). A new short is covered once it is listed in `examples/shorts.js`
  - A page has one check for each thing that can break on its own; a check that only says again what another says does not earn its place
  - A page writes `{checks: [{name, ok, detail}]}` into `<pre id=result>` through [smoke.js](test/browser/smoke.js), steps the engine by hand (`setEngineManualStep`), and reads the WebGL canvas right after a step. `smokeSheet(...colors)` makes a sheet of plain tiles to hand `engineInit`
  - `npm run test:browser draw3d render3dWater` runs only the pages or shorts named, by page name or short file name without `.js`; a name it does not know is skipped without a word
  - Without Chrome it skips, and fails where `CI` is set
  - **The run is kept light on a machine someone is working at, and must stay so:** one Chrome and 4 tabs at a time, at below normal priority, one run at a time by a lock file, stopped after 5 minutes, about a minute on a quiet machine. More tabs are no faster, and the software renderer takes every core of each Chrome started. Never start a second Chrome or sweep the tab count to time it
- CI runs build + test + the browser smoke suite on every push/PR ([.github/workflows/test.yml](.github/workflows/test.yml)), on a build of the source, not the committed `dist/`.

### Documentation
```bash
npm run build-docs
```

- Generates the JSDoc site into `docs/` from `src/` and `plugins/`, with `README.md` as the homepage. `tools/docs/` is the site's own jsdoc template: `publish.js` the entry jsdoc calls and `render.js` the pure part that turns doclets into pages, tested by [test/docsTemplate.test.mjs](test/docsTemplate.test.mjs).
  - A symbol with no namespace in its `memberof` chain is internal and is not on the site
  - A class or typedef name documented twice fails the build, since types link by short name
  - A `@memberof` on a method is a build warning
  - Namespaces are listed in the order `CORE_NAMESPACES` and `PLUGIN_NAMESPACES` give in render.js, a new one at the end of Plugins
- **This is not part of the normal workflow — do not run it after editing source.** It takes ~17s, rewrites ~100 files, and produces a large diff. The docs do not need to be current on every change. The repo owner asks for it when they want it.
- It is worth *suggesting* when a major feature or new plugin lands, after a significant rework, or before a release. A plugin that never gets regenerated never appears on the site at all.
- CI does not run it. `jsdoc` is a devDependency; the template has no others.
- Before a release: bump the version in both `package.json` and `src/engine.js` (`engineVersion`), run the build so `dist/` carries it, then the docs, name the changelog's Unreleased section for the version, and commit `dist/` and `docs/` with it: the release commit is the one that carries `dist/`. That, with screenshots, notes and the zip (`npm run build-release`), is for a minor or major release; a patch (1.24.1) is only the version bump, the changelog's section and `dist/` built and committed, for npm, with no zip and no docs. Also bump the `littlejsengine` range in `examples/vite-starter/package.json` and its lock on a minor or major release, so a project started from it gets the engine the docs describe.
- jsdoc exits non-zero on the TypeScript-flavored JSDoc used across the engine (tuples like `[Vector2, Vector2, number]`, records like `{color?: Color}`, predicates like `a is Array<any>`, a grouped function type like `(function(number): Matrix4)|undefined`), which `dist/littlejs.d.ts` needs for precise types. The script verifies the generated output instead of the exit code — don't "fix" those JSDoc types to silence the errors. No spelling satisfies both tools.
- `checkJSDocMessages` in [tools/buildDocs.mjs](tools/buildDocs.mjs) counts those expected errors into one line and **fails the build on any other jsdoc message**, so a real tag problem cannot hide among them. If a new message is deliberate, widen the check there rather than letting the build print it on every run.

### Debug features
- Press `Esc` to toggle debug overlay
- Number keys toggle visualizations; `9` shows the tweakables panel and `0` opens the level editor, the 3D one when the game loaded a 3D level, after which `Esc` switches between playing and editing until the editor's Exit. A debug plugin adds a line to the overlay's key list through `debugOverlayKeys`
- `C` on the debug overlay is the free camera of a 3D game: the mouse looks, WASD and QE fly, the game runs on under it and reads no keyboard or mouse (`inputCapture`)
- `+`/`-` keys control time scale
- Debug functions: `debugRect()`, `debugCircle()`, `debugLine()`, `debugText()`, and in 3D `debugBox3D()`, `debugSphere3D()`, `debugLine3D()`, `debugPoint3D()`
