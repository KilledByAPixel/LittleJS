# LittleJS - The Tiny Fast JavaScript Game Engine
## Special Js13k Branch

<div align="center">

![LittleJS Screenshot](examples/logo.png)

</div>

## 🚂 All aboard!

LittleJS is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance.
Its small footprint is packed with a comprehensive feature set including hybrid rendering, physics, particles, sound, and input handling.
The code is clean and well documented with some fun examples to get you started right away. Choo-Choo!

## 🙌 Js13k + LittleJS

This is a size-optimized fork of the LittleJS engine, designed specifically for size coding competitions like [JS13K](https://js13kgames.com/).
It exists so the main line LittleJS engine can keep evolving while this version stays small enough to keep minifying.
Changes from `main` are ported over selectively: correctness fixes and API renames are taken, features that would cost bytes are not.

**The starter project builds to a 7655 byte zip against the 13312 byte JS13K limit** — about 57% of the budget, leaving roughly 5.6KB for your game — and that includes the whole engine: WebGL rendering, physics, particles, tile layers, sound, medals, and input.

A game written here is meant to port back to regular LittleJS after the compo. See [Migrating to main LittleJS](#-migrating-to-main-littlejs) for exactly what differs.

## 🚀 Quick start

```bash
git clone -b js13k https://github.com/KilledByAPixel/LittleJS.git
cd LittleJS
npm install
npm start
```

Then open **http://localhost:8000/examples/starter/**.

Edit `examples/starter/game.js` and reload the page to see your changes. When you want a compo-ready zip:

```bash
npm run build
```

That produces `examples/starter/game.zip` and prints the size against the 13312 byte limit. The build fails with a non-zero exit code if you go over budget.

**Use `npm start` rather than opening `index.html` directly.** Over `file://` the browser treats `tiles.png` as cross-origin, so uploading it as a WebGL texture throws a `SecurityError` and nothing renders. The dev server (`serve.js`) is a dependency-free static file server that exists only to avoid that. Set `PORT` to use a different port.

There is also `npm run build:engine`, which generates the `dist/` bundles (`littlejs.js`, `littlejs.min.js`, ESM builds, and TypeScript definitions). You do not need it to make a game — it produces a standalone `littlejs.js` you can load with a `<script src>` tag (the package has no `main`/`types`/`exports` field, so `dist/` is not resolvable as an npm dependency).

## 🔧 How the build works

`examples/starter/build.js` is a standalone Node script with no bundler. It runs these stages in order:

| Stage | What it does |
|---|---|
| Concatenate | Joins every file in `sourceFiles` into one `build/index.js`. No modules, no imports — everything shares one global scope. |
| Closure Compiler | `ADVANCED` mode. Renames everything and **deletes every function the game never calls**. This is what makes the engine cheap. |
| UglifyJS | A second `-c -m` pass that picks up what Closure left. |
| Roadroller | Re-encodes the JavaScript as self-extracting compressed data. The slowest stage and the biggest single win. |
| HTML inline | Wraps the result in a minimal `<!DOCTYPE html>` shell with the script inlined — one self-contained file. |
| ect zip | Zips `index.html` plus everything in `dataFiles` with `ect -9 -strip`. This zip is what you submit. |

The final readout is the size of that zip:

```
game.zip: 7655 / 13312 bytes (57.5%)
5657 bytes remaining
```

Three toggles at the top of `build.js`:

- `DEBUG_BUILD` — keep the intermediate `.closure.js` and `.uglify.js` files so you can see what each stage produced. Useful when Closure eliminates something you needed.
- `USE_ROADROLLER` — set to `false` to skip the Roadroller stage. Much faster builds, much bigger output. Handy while iterating.
- `ROADROLLER_EXTREME` — passes `--optimize 2`. Takes over a minute and usually saves only a few bytes. Turn it on at the end of the compo, not during.

Add your own source files to the `sourceFiles` array (after the engine files) and any assets you need to load at runtime to `dataFiles`.

## 📦 Saving space

**Start by not worrying about it.** Closure Compiler in `ADVANCED` mode already deletes every engine function your game never calls, so unused features mostly cost nothing. The numbers below prove that rather than assume it.

All figures are zip bytes from `npm run build`, measured against the unmodified starter at **7655 bytes**. The build is deterministic: four builds of unmodified source all produced exactly 7655 bytes, so the noise floor is 0 and every difference below is real.

| Change | Zip size | Saving |
|---|---:|---:|
| *(unmodified starter)* | 7655 | — |
| Remove `engineMedals.js` from `sourceFiles` | 7655 | **0** |
| Stop using particles, keep `engineParticles.js` | 6802 | 853 |
| ...and also remove `engineParticles.js` | 6802 | **+0** |
| Stop using tile layers, keep `engineTileLayer.js` | 7164 | 491 |
| ...and also remove `engineTileLayer.js` | 7092 | **+72** |
| Disable and remove WebGL (see below) | 6692 | **963** |

Read that table as two separate things: how much a *feature* costs your game, and how much *deleting the file* buys you on top.

- **Medals cost nothing.** The starter never calls `medalsInit`, and `engineMedals.js` only hooks into the engine from inside that function. Closure already removes all of it. Deleting the file from `sourceFiles` changed the zip by literally zero bytes.
- **Particles are the same story.** Removing the starter's emitter saved 853 bytes, but that saving comes entirely from Closure noticing `ParticleEmitter` is now unreachable. Removing the file afterwards saved nothing further.
- **Tile layers leave a 72 byte residue.** `engineObject.js` calls `tileCollisionTest` from inside `if (this.collideTiles)`, which Closure cannot prove is unreachable, so a little of `engineTileLayer.js` survives even in a game that never uses it. Removing the file recovers those 72 bytes — but only if *nothing* enables tile collision, or you will get a `ReferenceError` at runtime. Note the starter's own particle emitter passes `collide = 1`, which sets `collideTiles`; set it to `0` first.
- **WebGL is the one that actually pays.** 963 bytes, and it is the only entry worth real effort.

### Disabling WebGL

Rendering falls back to canvas 2D, which is slower and drops additive blending, but it is a big chunk of the budget. It takes three steps:

1. Delete `` `../../src/engineWebGL.js` `` from `sourceFiles` in `build.js`.
2. Set `glEnable = false` at the top of `game.js`, before `engineInit`.
3. In the same place, stub the symbols other engine files still reference unconditionally:

```js
glEnable = false;
let glCanvas, glAdditive;
function glInit() {}
function glPreRender() {}
function glClearCanvas() {}
function glSetTexture(t) {}
function glCreateTexture(i) {}
function glCopyToContext(c, f) {}
function glDraw(x, y, sx, sy, a, u0x, u0y, u1x, u1y, rgba, rgbaAdditive) {}
```

Step 3 is not optional. `engine.js` calls `glInit`, `glPreRender` and `glCopyToContext` unconditionally, and `engineDraw.js` / `engineTileLayer.js` reference the rest, so dropping the file without stubs throws on startup. The stubs are empty and Closure strips them; they are there to keep the names defined.

Two things measured while working this out, so you do not repeat them:

- **Setting `glEnable = false` without removing the file costs you 50 bytes** (7705 vs 7655). Closure cannot fold the flag, so it keeps both render paths *and* the whole WebGL implementation. Do the whole thing or none of it.
- Also changing the default to `let glEnable = false;` in `engineSettings.js` gains nothing further (6693 vs 6692). Not worth touching an engine file for.

### Other places to look

- `USE_ROADROLLER` is already on and is doing most of the work — check its output before hand-golfing your own code.
- Every entry in `dataFiles` goes into the zip as its own file. `tiles.png` is already compressed as a PNG, so `ect` can only shave a little off it — shrinking the image itself (fewer colors, smaller dimensions, or generating art procedurally instead) is often the cheapest win available.
- Roadroller compresses repeated text well, so reusing identifiers and string fragments in your game code is cheaper than inventing new ones.

## 🔀 Migrating to main LittleJS

This is the point of the branch: build during the compo here, then port to regular LittleJS afterward. The APIs match closely enough that this list should be sufficient to do the whole conversion, including by an AI assistant given only this section.

**Use the [regular LittleJS docs](https://killedbyapixel.github.io/LittleJS/docs) as your API reference while working here.** Anything not listed below behaves the same.

### Renames — nothing to do

These were historically named differently on this branch. They have all been renamed to match `main`, verified against `src/` and against `main`'s definitions:

| This branch | main LittleJS | Notes |
|---|---|---|
| `inputClear` | `inputClear` | matches |
| `inputClearKey` | `inputClearKey` | matches |
| `inputPreventDefault` | `inputPreventDefault` | matches, defaults to `true` in both |
| `setInputPreventDefault` | `setInputPreventDefault` | matches |
| `mouseEventToScreen` | `mouseEventToScreen` | matches (internal — not exported on either branch) |
| `setGLEnable` | `setGLEnable` | matches |
| `clampSpeed` | `clampSpeed` | matches |
| `restitution` | `restitution` | matches |
| `getPaused` | `getPaused` | matches |
| `applyAngularAcceleration` | `applyAngularAcceleration` | matches |
| `audioMasterGain` | `audioMasterGain` | matches (internal — not exported on either branch) |

`getPaused` and `applyAngularAcceleration` were *added* here to match `main` rather than renamed, so they are new either way.

If you are upgrading a game started on an older revision of this branch, apply these find-and-replaces first — after that, the table above applies:

| Old name on this branch | Current name |
|---|---|
| `clearInput` | `inputClear` |
| `preventDefaultInput` | `inputPreventDefault` (and note the default flipped from `false` to `true`) |
| `mouseToScreen` | `mouseEventToScreen` |
| `setGlEnable` | `setGLEnable` |
| `clampSpeedLinear` | `clampSpeed` |
| `elasticity` | `restitution` |
| `audioGainNode` | `audioMasterGain` |

### Absent here, present in main — purely additive

None of these exist on this branch, so a game written here cannot be using them. Porting is a no-op; they simply become available.

- **Camera rotation** — `cameraAngle`, `setCameraAngle`
- **Pointer lock** — `pointerLockRequest`, `pointerLockExit`, `pointerLockIsActive`
- **Mouse delta** — `mouseDelta`, `mouseDeltaScreen`
- **`CanvasLayer`** — in `main`, `TileLayer` extends it; here `TileLayer` extends `EngineObject` directly
- **`TileInfo.setFullImage`**
- **`debugScreenshot`**
- **`glDeleteTexture`**, **`glSetTextureData`**, and mipmap filtering for power-of-two textures
- **All plugins** — `box2d`, `uiSystem`, `postProcess`, `newgrounds`, `drawUtilities`, `zzfxm`
- **The redirectable draw target** — `main` has `drawCanvas` / `drawContext`; this branch always draws to the main canvas
- **`engineObjectsCollect`**
- **`zzfxG`**, **`zzfxR`**

The debug overlay here is also an older one: it does not show FPS or Draw Count. That is dev tooling only — `engineDebug.js` is replaced wholesale by `engineRelease.js` in release builds, so it costs nothing in the zip and has no effect on the shipped game.

### Present here, absent in main — remove these on port

| Here | On port |
|---|---|
| `glOverlay` / `setGlOverlay` | Delete. `main` removed the WebGL overlay compositing mode. |
| `medalDisplayIconSize` / `setMedalDisplayIconSize` | Delete. `main` derives the medal icon size from the display height instead of exposing a setting. |
| `class Music` (built into `engineAudio.js`) | Rename to `ZzFXMusic` and include `plugins/zzfxm.js`. The class body is otherwise identical — same constructor, same `playMusic(volume, loop)`. |
| `tileInfo.getTextureInfo()` | Becomes the property `tileInfo.textureInfo`. |
| `isVector2`, `isNumber` | Not removed — they exist in `main`'s `engineUtilities.js` and behave the same, but `main`'s `engineExport.js` does not export them. A module (ESM) consumer needs another way to reach them (e.g. copy the one-line implementation into your own code) instead of importing them from the package. |

### Tile collision — the one part that is real work

Everything above is find-and-replace. This is not.

This branch keeps a **single global collision grid**:

```js
initTileCollision(vec2(width, height));   // one grid for the whole game
setTileCollisionData(pos, data);
getTileCollisionData(pos);
tileCollisionTest(pos, size, object);
tileCollisionRaycast(posStart, posEnd, object);

const layer = new TileLayer(pos, size);   // visuals, separate from collision
layer.setData(layerPos, data, redraw);    // redraw defaults to false
layer.redraw();
```

`main` replaced that with **`TileCollisionLayer` objects**, where each layer owns its own collision data and registers itself in a `tileCollisionLayers` list:

```js
const layer = new TileCollisionLayer(pos, size); // visuals AND collision together
layer.setCollisionData(pos, data);
layer.getCollisionData(pos);
layer.collisionTest(pos, size, object);
layer.collisionRaycast(posStart, posEnd, object);
```

**The free functions `tileCollisionTest` and `tileCollisionRaycast` survive the port unchanged.** `main` keeps both names and only *adds* an optional trailing `solidOnly=true` parameter, so existing call sites still compile and behave the same — they just iterate every registered layer instead of the one global grid. The only nuance is the return value of `tileCollisionTest`: a `Boolean` here, the hit `TileCollisionLayer` (or `undefined`) in `main`. Truthiness tests, which is how it is normally used, are unaffected.

`main` additionally has `tileCollisionGetData` (read a cell across all layers) and `tileCollisionLoad` (build a layer from tilemap data); neither exists here, but both are additive, so nothing needs changing on their account.

To port: create a `TileCollisionLayer` instead of the separate `initTileCollision` + `TileLayer` pair, and move every `setTileCollisionData` / `getTileCollisionData` call onto it. If your game only ever had one collision grid — which is the usual case here, since that is all this branch supports — the conversion is close to mechanical. If you were relying on the grid being global, reachable from anywhere without a reference, you will need to decide who owns the layer object. **This is the one change that cannot be done by find-and-replace, and it is worth doing first when you port.**

**Watch the constructor signature — a positional port corrupts silently instead of failing to compile.** Here:

```js
new TileLayer(position, size=tileCollisionSize, tileInfo=tile(), scale=vec2(1), renderOrder=0)
```

`main`'s `TileCollisionLayer`:

```js
new TileCollisionLayer(position, size, tileInfo=tile(), renderOrder=0, useWebGL=glEnable)
```

The 4th and 5th positional arguments mean different things: this branch's `scale` (a `Vector2`) lands in `main`'s `renderOrder` slot, and this branch's `renderOrder` (a `Number`) lands in `main`'s `useWebGL` slot — both arguments still type-check (a truthy `Vector2` counts as "enable WebGL"), so nothing throws; the layer just silently gets the wrong render order and scale is lost. Re-check each `TileLayer`/`TileCollisionLayer` call site by hand rather than porting the arguments positionally. Also note `size` has a default here (`tileCollisionSize`), but no default in `main` — `new TileLayer(pos)` works here and throws in `main` if `size` is omitted.

Two more TileLayer members do not survive the port:

- **`layer.isOverlay`** (`src/engineTileLayer.js:191,238,246`) is js13k-only — `main` has no equivalent on `CanvasLayer` or `TileLayer`. A game that sets `layer.isOverlay = true` to draw a foreground layer above all objects loses that behavior silently on port; you will need another way to layer your draws (e.g. `renderOrder`, or drawing to the overlay canvas directly).
- **`layer.scale`** is stored and used here (it scales the rendered image), but in `main` it is accepted by the constructor and never stored or used again — a dead parameter. A non-unit scale renders correctly here and is silently ignored after porting; setting `layer.scale` after construction is a no-op in `main`.

### Behavior differences worth knowing

- **Keyboard `preventDefault` is gone.** On older revisions of this branch, setting `preventDefaultInput = true` suppressed the browser's default handling of *keyboard* events. That `preventDefault` call has been removed to match `main`. What remains is a single mousedown guard, `inputPreventDefault && e.button && e.preventDefault()` — and because `e.button` is `0` for the primary button, the flag only ever suppresses **middle and right clicks**, never a left click and never a key. `main` has the identical line, so this is not a porting difference; it just means the flag does far less than its name suggests. If your game relied on it to stop arrow keys scrolling the page, call `preventDefault` yourself in your own key handler.
- **Touch events always `preventDefault` here.** `main` guards its touch handler with `if (inputPreventDefault && document.hasFocus())`; this branch only checks `document.hasFocus()`. So `setInputPreventDefault(false)` does not release touch events here, and will start doing so after you port.
- **ZzFX sounds with an explicit non-zero `attack` will sound very slightly different.** This branch adds a fixed 9-sample ramp (`attack*sampleRate + 9`); `main` uses `attack*sampleRate || 9`, which drops that ramp once you set an attack. The difference is 9 samples, about 0.2 ms at 44.1 kHz — inaudible in practice, but it is a real waveform change. Sounds that leave `attack` at its default of 0 are identical.
- **`main` has extra ZzFX wave shapes.** Shape 5 (square with duty cycle) and the `shape > 4` shape-curve branch exist only in `main`. Anything you write here will play the same there.
- **`Sound.stop()` takes no fade time here.** `main` accepts a `fadeTime` argument for a volume ramp; here it stops immediately.

### Version

This branch reports `engineVersion` as `1.13.1-js13k`; it tracks LittleJS `1.13.1`.

## 💥 [Live Demo of Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter)

## 🎮 JS13K games made with LittleJS

Many amazing JS13K games have been made using LittleJS including a few in the top 10...

- [L1ttL3 Paws](https://github.com/KilledByAPixel/JS13K2025) - Cat glider with procedural art and levels. by Frank Force
- [The Way of the Dodo](https://js13kgames.com/2024/games/the-way-of-the-dodo) - Single button flapping platformer. by repsej
- [Space Huggers](https://js13kgames.com/2021/games/space-huggers) - Roguelike platformer shoot-em-up game with procedural levels. by KilledByAPixel
- [Wendol Village](https://js13kgames.com/games/dead-again) - Warcraft inspired RTS game. by sanojian
- [Dead Again](https://js13kgames.com/games/dead-again) - Top down survival horror. by sanojian & repsej
