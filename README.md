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

**The starter project builds to a ~7645 byte zip against the 13312 byte JS13K limit** — about 57% of the budget, leaving roughly 5.6KB for your game — and that includes the whole engine: WebGL rendering, physics, particles, tile layers, sound, medals, and input.

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

`examples/starter/build.mjs` is a standalone Node script with no bundler. It runs these stages in order:

| Stage | What it does |
|---|---|
| Concatenate | Joins every file in `sourceFiles` into one `build/index.js`. No modules, no imports — everything shares one global scope. |
| Feature flags | Rewrites any subsystem disabled in `FEATURES` to a compile time constant, so the next stage can delete it. |
| Closure Compiler | `ADVANCED` mode. Renames everything and **deletes every function the game never calls**. This is what makes the engine cheap. |
| UglifyJS | A second `-c -m` pass that picks up what Closure left. |
| Roadroller | Re-encodes the JavaScript as self-extracting compressed data. The slowest stage and the biggest single win. |
| HTML inline | Wraps the result in a minimal `<!DOCTYPE html>` shell with the script inlined — one self-contained file. |
| ect zip | Zips `index.html` plus everything in `dataFiles` with `ect -9 -strip`. This zip is what you submit. |

The final readout is the size of that zip:

```
game.zip: 7645 / 13312 bytes (57.4%)
5667 bytes remaining
```

Config at the top of `build.mjs` — `FEATURES` is covered under [Saving space](#-saving-space); the other three are:

- `DEBUG_BUILD` — keep the intermediate `.closure.js` and `.uglify.js` files so you can see what each stage produced. Useful when Closure eliminates something you needed.
- `USE_ROADROLLER` — set to `false` to skip the Roadroller stage. Much faster builds, much bigger output. Handy while iterating.
- `ROADROLLER_EXTREME` — passes `--optimize 2`. Takes over a minute and usually saves only a few bytes. Turn it on at the end of the compo, not during.

Add your own source files to the `sourceFiles` array (after the engine files) and any assets you need to load at runtime to `dataFiles`.

## 📦 Saving space

**Start by not worrying about it.** Closure Compiler in `ADVANCED` mode already deletes every engine function your game never calls, so unused features mostly cost nothing. The numbers below prove that rather than assume it.

All figures are zip bytes from `npm run build`. The starter baseline is ~7645.

Roadroller's optimizer search is not fully deterministic — repeated builds of identical source vary by about 3 bytes. Every saving below is far larger than that, so they are all real, but do not chase a 3 byte "improvement".

### Turning off engine features

The `FEATURES` block at the top of `build.mjs` is the main lever. Set one to `false` and the whole subsystem disappears from the zip:

```js
const FEATURES =
{
    webgl:   true, // WebGL renderer, disabling falls back to canvas 2D
    touch:   true, // touch input and the on screen touch gamepad
    gamepad: true, // gamepad input
    sound:   true, // all audio
};
```

Measured against the unmodified starter, all figures from `npm run build`:

| Disabled | Zip size | Saving |
|---|---:|---:|
| *(nothing — baseline)* | 7645 | — |
| `touch` | 7491 | 154 |
| `gamepad` | 7391 | 254 |
| `touch` + `gamepad` | 7237 | 408 |
| `webgl` | 6913 | **732** |
| `sound` | 6837 | **808** |
| **all four** | **5692** | **1953** |

Nearly 2KB — about 15% of the whole budget — for a silent, keyboard-and-mouse-only game.

**Why this works, and why it is a build step rather than something you set in `game.js`.** The engine declares these flags as mutable `let` bindings so their setters can change them at runtime. Closure cannot fold a mutable binding, so it has to keep *both* branches of every `if (glEnable)` — which is why the whole WebGL implementation survives even in a game that never draws with it. The build rewrites a disabled flag to `const false` and empties its setter *before* Closure runs, so the branch becomes provably dead and gets deleted.

That is also why setting `glEnable = false` in your own code does the opposite of what you would hope: it **costs 50 bytes** rather than saving any, because the flag is still mutable and now you have added an assignment. Use the `FEATURES` block instead.

**The flags only affect the built zip.** `npm start` loads `src/` directly with no build step, so the dev page always runs with everything enabled. To develop against the same configuration you ship, call the setter in `gameInit`:

```js
setGLEnable(false); // matches FEATURES.webgl = false
```

In the built zip that call compiles to nothing (the setter is empty and the flag is constant), so it costs no bytes — measured at 6908 with `webgl: false`, versus 6913 without the call.

### Removing whole source files

Beyond the flags, you can delete an unused engine file from `sourceFiles` entirely. This is sharper and riskier — nothing checks it, and `--jscomp_off=*` means Closure will not warn you, so if anything still references the file you get a `ReferenceError` at runtime rather than a build error.

Measured at an earlier 7655-byte baseline, so read the savings rather than the absolute sizes:

| Change | Saving |
|---|---:|
| Remove `engineMedals.js` | **0** — Closure already strips it |
| Stop using particles (keep the file) | 853 |
| ...then also remove `engineParticles.js` | **+0** |
| Stop using tile layers (keep the file) | 491 |
| ...then also remove `engineTileLayer.js` | **+72** |

The pattern to take from that: **the saving comes from your game not using the feature, not from deleting the file.** Once Closure can see `ParticleEmitter` is unreachable it removes all of it, and deleting the file afterwards gains nothing. Tile layers are the one exception, leaving a 72 byte residue because `engineObject.js` calls `tileCollisionTest` from inside `if (this.collideTiles)`, which Closure cannot prove unreachable. Recovering those 72 bytes is only safe if nothing enables tile collision — note the starter's own emitter passes `collide = 1`, which sets `collideTiles`, so set that to `0` first.

### Other places to look

- `USE_ROADROLLER` is already on and is doing most of the work — check its output before hand-golfing your own code.
- Every entry in `dataFiles` goes into the zip as its own file. `tiles.png` is already compressed as a PNG, so `ect` can only shave a little off it — shrinking the image itself (fewer colors, smaller dimensions, or generating art procedurally instead) is often the cheapest win available.
- Roadroller compresses repeated text well, so reusing identifiers and string fragments in your game code is cheaper than inventing new ones.

## 🔀 Migrating to main LittleJS

This is the point of the branch: build during the compo here, then port to regular LittleJS afterward. The APIs match closely enough that this list should be sufficient to do the whole conversion, including by an AI assistant given only this section.

**Use the [regular LittleJS docs](https://killedbyapixel.github.io/LittleJS/docs) as your API reference while working here.** Anything not listed below behaves the same.

### Renames — nothing to do

These were historically named differently on this branch. They have all been renamed to match `main`, verified name by name against `src/` here and against **LittleJS 1.18.24** upstream:

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
| `engineObjectsCollect` | `engineObjectsCollect` | matches (`src/engine.js:411`, `main:427`) — exported in `main`, not exported here. Present and usable here too, just not in `engineExport.js`; the build concatenates all engine sources into one scope, so a game here can call it directly. |
| `zzfxG` | `zzfxG` | matches (`src/engineAudio.js:395`, `main:362`) — exported in `main`, not exported here; same note as above. |
| `zzfxR` | `audioDefaultSampleRate` | **renamed in `main`.** A constant (`= 44100`), not a function. Rename it on port. |
| `oscillate` | `oscillate` | matches, including the `offset` and `type` parameters |
| `percentLerp`, `lineTest`, `isStringLike` | same | matches |
| `noise1D`, `noise2D` | same | matches — gradient noise, useful for procedural generation |
| `readSaveData`, `writeSaveData`, `saveText`, `saveCanvas`, `saveDataURL`, `shareURL` | same | matches |
| `LOG` | `LOG` | matches — console logging, compiled out of release builds like `ASSERT` |

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
| `wave` | `oscillate` (same waveform for the 3-argument form; gains optional `offset` and `type`) |

### Absent here, present in main — purely additive

None of these exist on this branch, so a game written here cannot be using them. Porting is a no-op; they simply become available.

- **Camera rotation** — `cameraAngle`, `setCameraAngle`
- **Pointer lock** — `pointerLockRequest`, `pointerLockExit`, `pointerLockIsActive`
- **Mouse delta** — `mouseDelta`, `mouseDeltaScreen`
- **`CanvasLayer`** — in `main`, `TileLayer` extends it; here `TileLayer` extends `EngineObject` directly
- **`TileInfo.setFullImage`**
- **`debugScreenshot`**
- **`glDeleteTexture`**, **`glSetTextureData`**, and mipmap filtering for power-of-two textures
- **All plugins** — `box2d`, `uiSystem`, `postProcess`, `newgrounds`, `drawUtilities`, `zzfxm`, `lightSystem`, `pathFinder`, `textureSheet`, `threejs`, `tweenSystem`, `medalSystem`
- **The redirectable draw target** — `main` has `drawCanvas` / `drawContext`; this branch always draws to the main canvas

The debug overlay here is also an older one: it does not show FPS or Draw Count. That is dev tooling only — `engineDebug.js` is replaced wholesale by `engineRelease.js` in release builds, so it costs nothing in the zip and has no effect on the shipped game.

### Present here, absent in main — remove these on port

| Here | On port |
|---|---|
| `glOverlay` / `setGlOverlay` | Delete. `main` removed the WebGL overlay compositing mode. |
| `medalDisplayIconSize` / `setMedalDisplayIconSize` | Delete. `main` derives the medal icon size from the display height instead of exposing a setting. |
| `class Music` (built into `engineAudio.js`) | Rename to `ZzFXMusic` and include `plugins/zzfxm.js`. The class body is otherwise identical — same constructor, same `playMusic(volume, loop)`. |
| Medals (`src/engineMedals.js`, built into the engine) | Include `plugins/medalSystem.js`. `main` moved the whole medal system out of the engine into a plugin; the API (`medalsInit`, `class Medal`) is the same, it just lives elsewhere. Kept in-engine here because it is cheap and Closure strips it entirely when unused. |
| `tileInfo.getTextureInfo()` | Becomes the property `tileInfo.textureInfo`. |
| `class FontImage` | Becomes `class ImageFont`, and **the constructor is different, not just the name**. Here: `FontImage(image, tileSize, paddingSize, context)`. In `main`: `ImageFont(tileInfo)` — it takes a `TileInfo` for the first character and derives the rest. Renaming alone would compile and then behave wrongly, so rework the call rather than find-and-replace it. |
| `isVector2`, `isNumber` | Not removed — they exist in `main`'s `engineMath.js` and behave the same, but `main`'s `engineExport.js` does not export them. A module (ESM) consumer needs another way to reach them (e.g. copy the one-line implementation into your own code) instead of importing them from the package. |

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

`main` additionally has `tileCollisionGetData` (read a cell across all layers), which does not exist here — but it is additive, so nothing needs changing on its account.

To port: create a `TileCollisionLayer` instead of the separate `initTileCollision` + `TileLayer` pair, and move every `setTileCollisionData` / `getTileCollisionData` call onto it. If your game only ever had one collision grid — which is the usual case here, since that is all this branch supports — the conversion is close to mechanical. If you were relying on the grid being global, reachable from anywhere without a reference, you will need to decide who owns the layer object. **This is the one change that cannot be done by find-and-replace, and it is worth doing first when you port.**

**Watch the constructor signature — a positional port corrupts silently instead of failing to compile.** Here:

```js
new TileLayer(position, size=tileCollisionSize, tileInfo=tile(), scale=vec2(1), renderOrder=0)
```

`main`'s `TileCollisionLayer`:

```js
new TileCollisionLayer(position, size, tileInfo=tile(), renderOrder=0, useWebGL=glEnable)
```

The 4th and 5th positional arguments mean different things: this branch's `scale` (a `Vector2`) lands in `main`'s `renderOrder` slot, and this branch's `renderOrder` (a `Number`) lands in `main`'s `useWebGL` slot — both arguments still type-check (`renderOrder` defaults to `0`, a falsy value, so `useWebGL` becomes falsy too), so nothing throws; the layer just silently gets the wrong render order, loses its scale, and never creates a WebGL texture for that layer (`main:src/engineTileLayer.js:338`). Re-check each `TileLayer`/`TileCollisionLayer` call site by hand rather than porting the arguments positionally. Also note `size` has a default here (`tileCollisionSize`), but no default in `main` — `new TileLayer(pos)` works here and throws in `main` if `size` is omitted.

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

This branch reports `engineVersion` as `1.13.1-js13k`. The `1.13.1` names the LittleJS release its engine source is **derived from**, not the current upstream release — mainline is well ahead (1.18.24 at the time of writing).

That gap is deliberate. This branch does not track mainline release for release; it stays small and selectively takes fixes, renames, and structural changes from upstream when they do not cost bytes. Everything in the migration guide above was verified name by name against 1.18.24, so the porting instructions are current even though the base revision is not.

Taken from beyond 1.13.1 so far:

- the `engineMath.js` / `engineUtilities.js` file split, matching mainline's layout
- `abs`/`min`/`max`/`sign` as aliases rather than wrapper functions
- gradient noise (`noise1D`, `noise2D`), save/share helpers (`readSaveData`, `writeSaveData`, `saveText`, `saveCanvas`, `saveDataURL`, `shareURL`), and math helpers (`percentLerp`, `lineTest`, `isStringLike`)
- `wave` renamed to `oscillate` with mainline's body
- `LOG`, compiled out of release builds
- ESM build scripts (`build.mjs`, `engineBuild.mjs`)

Not taken: the large `engineDraw`, `engineInput` and `engineWebGL` feature growth, and the plugin system. Everything above was free or near-free — Closure strips any of it a game does not call.

## 💥 [Live Demo of Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter)

## 🎮 JS13K games made with LittleJS

Many amazing JS13K games have been made using LittleJS including a few in the top 10...

- [L1ttL3 Paws](https://github.com/KilledByAPixel/JS13K2025) - Cat glider with procedural art and levels. by Frank Force
- [The Way of the Dodo](https://js13kgames.com/2024/games/the-way-of-the-dodo) - Single button flapping platformer. by repsej
- [Space Huggers](https://js13kgames.com/2021/games/space-huggers) - Roguelike platformer shoot-em-up game with procedural levels. by KilledByAPixel
- [Wendol Village](https://js13kgames.com/games/dead-again) - Warcraft inspired RTS game. by sanojian
- [Dead Again](https://js13kgames.com/games/dead-again) - Top down survival horror. by sanojian & repsej
