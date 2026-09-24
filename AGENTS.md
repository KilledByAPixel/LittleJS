# LittleJS Project - AI Agent Instructions

These instructions are for making changes in the LittleJS repo safely. Optimize for small diffs, clarity, and ease of use.

## Non-negotiable rules

- **Prefer minimal, local changes.** Do not refactor for style unless asked.
- **No new runtime dependencies.** Keep LittleJS dependency-free at runtime.
- **Do not hand-edit generated build artifacts.**
  - Treat `dist/` as generated output.
  - Make changes in `src/` (and `plugins/` when appropriate), then run the build.
- **Match surrounding style.** Follow the conventions in the files you touch.
- **Avoid breaking public APIs.** If a change could break users, call it out clearly and offer a compatible alternative.
- **Keep agent-generated working files under `.claude/`.** `docs/` is the published JSDoc API site and is fully generated — never hand-edit it, and don't regenerate it unless asked (see Documentation below). Superpowers plans go in `.claude/superpowers/plans/` and specs in `.claude/superpowers/specs/` (overrides the skill defaults). The `.claude/` folder is gitignored.

If anything in this doc conflicts with the actual repo behavior, follow the repo behavior and update this doc.

## Key resources

- `README.md` - Overview and getting started
- `REFERENCE.md` - API quick reference
- `examples/` - Working examples demonstrating engine features

## Architecture overview

LittleJS is a modular HTML5 game engine with:

- **Core engine**: `src/engine*.js` (main loop, objects, rendering, physics, input, etc.)
- **Plugins**: `plugins/*.js` (optional features like Box2D, post-processing, UI, audio helpers, etc.)
- **3D**: `plugins/math3d.js` (Vector3, Matrix4, Ray3D, 3D collision and raycasts) and `plugins/render3d.js` (the 3D renderer: meshes, the basic builders, lights, shadows, EngineObject3D, instancing) with `plugins/render3dExtras.js` after it (the other builders, HeightMap, camera controls, particles, trails, the OBJ loader: things built on the renderer that it does not need to draw), and `plugins/gltf.js` loads glTF and GLB models onto it. All are plugins in the same bundle, and `plugins/threejs.js` is the alternative that renders with Three.js.
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

### Benchmarks (`bench/`)
- Pages that run LittleJS and other engines (three.js, PixiJS and Phaser, loaded from a CDN) through the same scenes, and `all.html` runs the whole set and prints a table to copy; `bench/README.md` says how to run them and how to read the numbers
- Per frame work in a LittleJS bench page goes in a pre render hook, not gameUpdate, since the fixed timestep runs gameUpdate several times a frame below 60 fps and would count it several times over
- The GPU time comes from a timer query and only means something when the frame is at the refresh rate; a CPU bound page shows its CPU time there

### Short examples (`examples/shorts/*.js`)
Short examples are special:
- Pure JS code file, no HTML
- No imports, do not use LJS namespace - engine APIs are available globally
- Override hooks: `gameInit()`, `gameUpdate()`, `gameUpdatePost()`, `gameRender()`, `gameRenderPost()`
- Lines stay within 80 columns, and colors are written with `hsl(...)`, never `rgb(...)`
- Each short is listed in `examples/shorts.js` with a name, a short description and search keywords

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
- Meshes come in two forms. The builders make triangle strips: every strip repeats its first point, the odd triangles read the other way, and the pass draws with `frontFace(CW)`. `addTriangles` and the model loaders make indexed lists, `mesh.indices` over vertices held once, listed counter clockwise from the front like a strip's first triangle. On upload, `mesh.getTriangles()` gives the GPU an indexed list either way, turning a strip into its real triangles so the joins cost nothing, and `bufferCount` counts indices. `toIndexed()` turns a strip mesh into the list form, which combine and addStrip do on their own when the forms meet. A `dynamicDraw` mesh keeps that layout, so a dirty upload only rewrites the vertex values. A builder that knows which strip entries are one vertex sets `mesh.vertexKeys`, and the upload skips the search; `buildGrid` does for a smooth grid. Back faces are culled unless `mesh.doubleSided` is set, which the open builders (`buildGrid`, `buildRibbon`, an uncapped lathe) do themselves
- Draw state lives on `render3D` (`additive`, `emissive`, `specular`, `receiveShadow`, `shader`, ...), listed in `RENDER3D_STATE_FIELDS` and written out by hand in `render3DCaptureBatchState`, `render3DApplyBatchState` and `render3DStateChanged`, which are the batch key: a change flushes the pending batch, and a new field goes in all four. The stage loop sets it from each object's flags through `render3DSetObjectState` and resets it before every callback, so an object's flag is never read at draw time by anything else
- An `EngineObject3D` keeps its world matrix and rebuilds it only when its position, rotation, scale or its parent's matrix changed; plugin code reads it through `render3DObjectMatrix(o)` and never changes it, and `getMatrix()` hands out a copy
- 3D draws only work inside the 3D pass (an object's `render3D()` or `render3D.onRenderOpaque` / `onRenderTransparent`); asserts belong outside the pass, since the pass has a try/finally that hands the GL state back to 2D
- Lighting: `render3D.sunDirection` points toward the sun, a `DirectionalLight3D` shines from its position toward the origin, `emissive` is a number (0 lit, 1 its own color, above 1 overbright), and `rotation3D` is Euler pitch, yaw, roll applied roll, pitch, yaw. All of it matches three.js, and REFERENCE.md has a "Coming from three.js" section to keep in step
- Custom shaders: `Shader` (core, `src/engineDraw.js`) holds a `mainImage` snippet in the post-process style; each renderer wraps it with its own program on the first draw (`glShaderProgram` in 2D, `render3DFragmentSource` and `render3DShaderProgram` in 3D). The 3D fragment source is one function for the plugin's own program and every snippet's, so they cannot drift, and the promised snippet names are macros in `RENDER3D_SNIPPET_NAMES`. With no Shader set, rendering must stay pixel-identical

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
- **ASSERT and LOG are stripped in release builds** - Don't rely on side effects
- **Don't modify constant colors** - `WHITE`, `BLACK`, `RED`, etc. are frozen; use `.copy()` first
- **Time variables are global** - `time`, `frame` update automatically each frame
- **Fixed 60 FPS timestep** - Physics runs at 60 FPS regardless of display refresh rate
- **WebGL is enabled by default** - Set `glEnable = false` before `engineInit()` for Canvas2D only
- **Tile coordinates are bottom-left origin** - Y increases upward in world space
- **Every export must appear in REFERENCE.md** - [test/reference.test.mjs](test/reference.test.mjs) fails on a name that is exported but not mentioned, so a new API comes with its REFERENCE line
- **Files are stored with LF endings** - with `core.autocrlf` on, a working copy may be CRLF, so an edit script normalizes `
` to `
` before matching and writes LF back, or the whole file shows as changed
- **An instance divisor stays on a slot only while its array is enabled** - in Firefox, a plain draw that reads a constant attribute through a slot whose divisor is set makes the next instanced draw on that slot read garbage; Chrome does not care, so test the 3D plugin in Firefox too. `render3DDrawInstanced` sets the divisors with the arrays and clears both after
- **Canvas2D and WebGL line ends differ on purpose** - the main canvas strokes with round caps and joins (set in `engineUpdateCanvas`), which look better, suit text, and stop sharp corners spiking far out; WebGL outlines use square ends and mitered joins for speed. Don't "fix" either to match the other
- **A Shader on a 2D untextured draw does nothing** - `drawRect` carries its color in the additive slot with a zero tint, so the snippet's output multiplies away; draw a white tile instead

## Developer workflows

### Build
```bash
npm run build
```

### Testing
```bash
npm test
```

- Tests target `dist/littlejs.esm.js` — rebuild with `npm run build` after changing source.
- [test/setup.mjs](test/setup.mjs) stubs minimal DOM and enables headless mode. Most tests shouldn't call `engineInit` or `render()`, or assume `time` advances — construct objects directly instead.
- To test time-driven logic (timers, cooldowns, spawns), call `setEngineManualStep(true)` before `engineInit`, then advance with `engineStep(frames)`. See [test/engineStep.test.mjs](test/engineStep.test.mjs). Call `engineInit` once per file at module scope: `frame` and `time` are module globals and monotonic, and `node --test` gives each test file its own process.
- Zero test dependencies — uses Node's built-in `node --test`. Match the style in [test/](test/) when adding new ones.
- [test/render3d.test.mjs](test/render3d.test.mjs) covers the 3D plugins headless: builder geometry and winding, draw state and batching decisions, collision and cameras. Nothing that needs a GPU (culling, lighting, a compiled shader) can be tested there; check that in headless Chrome with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) through playwright-core, and never open a visible browser window. Firefox renders WebGL differently enough to matter, and its `--headless` mode runs pages without a window too, though its screenshot leaves the WebGL canvas out; have the page read its own pixels with `readPixels` and post them to a local server. Those harnesses live under `.claude/` and are not part of the repo.
- CI runs build + test on every push/PR ([.github/workflows/test.yml](.github/workflows/test.yml)).

### Documentation
```bash
npm run build-docs
```

- Generates the JSDoc site into `docs/` from `src/` and `plugins/`, with `README.md` as the homepage. Tooling lives in [tools/](tools/).
- **This is not part of the normal workflow — do not run it after editing source.** It takes ~17s, rewrites ~100 files, and produces a large diff. The docs do not need to be current on every change. The repo owner asks for it when they want it.
- It is worth *suggesting* when a major feature or new plugin lands, after a significant rework, or before a release. A plugin that never gets regenerated never appears on the site at all — `textureSheet` and `threejs` were both missing from the published docs for exactly that reason.
- CI does not run it. `jsdoc` and `clean-jsdoc-theme` are devDependencies.
- Before a release: bump the version in both `package.json` and `src/engine.js` (`engineVersion`), run the build so `dist/` carries it, then the docs. Also bump the `?x.y.z` cache busters in `examples/starter/index.html` and `examples/shorts/base.html`, and the `littlejsengine` range in `examples/vite-starter/package.json` on a major release.
- jsdoc exits non-zero on the TypeScript-flavored JSDoc used across the engine (tuples like `[Vector2, Vector2, number]`, predicates like `a is Array<any>`) which it cannot parse but which `dist/littlejs.d.ts` needs for precise types. The script verifies the generated output instead of the exit code — don't "fix" those JSDoc types to silence the errors. No spelling satisfies both tools: what jsdoc accepts in place of a tuple (`Array<Vector2|number>`, or a record type) throws the positions away, and a type predicate has no jsdoc-legal form at all.
- `checkJSDocMessages` in [tools/buildDocs.mjs](tools/buildDocs.mjs) counts those expected errors into one line and **fails the build on any other jsdoc message**, so a real tag problem cannot hide among them. If a new message is deliberate, widen the check there rather than letting the build print it on every run.

### Debug features
- Press `Esc` to toggle debug overlay
- Number keys toggle visualizations
- `+`/`-` keys control time scale
- Debug functions: `debugRect()`, `debugCircle()`, `debugLine()`, `debugText()`, and in 3D `debugBox3D()`, `debugSphere3D()`, `debugLine3D()`, `debugPoint3D()`
