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

If anything in this doc conflicts with the actual repo behavior, follow the repo behavior and update this doc.

## Key resources

- `README.md` - Overview and getting started
- `reference.md` - API quick reference
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
isString(s)   // true if not null/undefined (has toString)
isArray(a)    // true if array
isVector2(v)  // true if valid Vector2
isColor(c)    // true if valid Color
```

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

### Debug features
- Press `Esc` to toggle debug overlay
- Number keys toggle visualizations
- `+`/`-` keys control time scale
- Debug functions: `debugRect()`, `debugCircle()`, `debugLine()`, `debugText()`
