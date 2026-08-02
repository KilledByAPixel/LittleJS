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
- `examples/shorts/*.js` - Single-file demos loaded by the shorts harness

### Short examples (`examples/shorts/*.js`)
Short examples are special:
- Pure JS code file, no HTML
- No imports, do not use LJS namespace - engine APIs are available globally
- Override hooks: `gameInit()`, `gameUpdate()`, `gameUpdatePost()`, `gameRender()`, `gameRenderPost()`

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
isColor(c)    // true if valid Color
```

### Math aliases
Engine source exposes short aliases for common `Math.*` calls — prefer them
over `Math.X` in engine and plugin code:
```javascript
abs, floor, ceil, round, min, max, sign, hypot, log2, sin, cos, tan, atan2, PI
```
For things without an alias (e.g. `Math.trunc`, `Math.SQRT2`), use `Math.*` as normal.

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
- CI runs build + test on every push/PR ([.github/workflows/test.yml](.github/workflows/test.yml)).

### Documentation
```bash
npm run build-docs
```

- Generates the JSDoc site into `docs/` from `src/` and `plugins/`, with `README.md` as the homepage. Tooling lives in [tools/](tools/).
- **This is not part of the normal workflow — do not run it after editing source.** It takes ~17s, rewrites ~100 files, and produces a large diff. The docs do not need to be current on every change. The repo owner asks for it when they want it.
- It is worth *suggesting* when a major feature or new plugin lands, after a significant rework, or before a release. A plugin that never gets regenerated never appears on the site at all — `textureSheet` and `threejs` were both missing from the published docs for exactly that reason.
- CI does not run it. `jsdoc` and `clean-jsdoc-theme` are devDependencies.
- jsdoc exits non-zero on the TypeScript-flavored JSDoc used across the engine (tuples like `[Vector2, Vector2, number]`, predicates like `a is Array<any>`) which it cannot parse but which `dist/littlejs.d.ts` needs for precise types. The script verifies the generated output instead of the exit code — don't "fix" those JSDoc types to silence the errors.

### Debug features
- Press `Esc` to toggle debug overlay
- Number keys toggle visualizations
- `+`/`-` keys control time scale
- Debug functions: `debugRect()`, `debugCircle()`, `debugLine()`, `debugText()`
