# LittleJS Engine - Special Js13k Branch

<div align="center">

![LittleJS Screenshot](examples/logo.png)

</div>

## 🚂 All aboard!

LittleJS is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance. Its small footprint is packed with a comprehensive feature set including rendering, physics, particles, sound, and input handling. The code is very clean and well documented with many examples to get you started quickly.

## 🤝 Js13k + LittleJS

A size-optimized fork of LittleJS for size coding competitions like [JS13K](https://js13kgames.com/). It exists so the main line engine can keep growing while this version stays small enough to keep minifying.

**The starter builds to a ~7650 byte zip against the 13312 byte limit** — 57% of the budget, with the whole engine included: WebGL rendering, physics, particles, tile layers, sound, medals and input. Turning off features you do not use frees up nearly 2KB more.

Games written here are meant to port back to regular LittleJS after the compo — see [Migrating to main LittleJS](#-migrating-to-main-littlejs).

## 🚀 Quick start

```bash
git clone -b js13k https://github.com/KilledByAPixel/LittleJS.git
cd LittleJS
npm install
npm start
```

Open **http://localhost:8000/examples/starter/**, edit `examples/starter/game.js`, reload. When you want a compo-ready zip:

```bash
npm run build
```

That writes `examples/starter/game.zip` and prints the size against the limit, failing with a non-zero exit code if you go over.

**Use `npm start` rather than opening `index.html` directly** — over `file://` the browser treats `tiles.png` as cross-origin, so the WebGL texture upload throws a `SecurityError` and nothing renders. `serve.js` is a dependency-free static server that exists only to avoid that. Set `PORT` to change the port.

`npm run build:engine` generates the `dist/` bundles and TypeScript definitions. You do not need it to make a game.

## 🔧 How the build works

`examples/starter/build.mjs` is a plain Node script, no bundler:

| Stage | What it does |
|---|---|
| Concatenate | Joins `sourceFiles` into one file. No modules — everything shares one global scope. |
| Feature flags | Rewrites anything disabled in `FEATURES` to a compile time constant so the next stage can delete it. |
| Closure Compiler | `ADVANCED` mode. Renames everything and deletes every function the game never calls. |
| UglifyJS | A second `-c -m` pass. |
| Roadroller | Re-encodes the JavaScript as self-extracting compressed data. Slowest stage, biggest win. |
| ect zip | Zips the inlined HTML plus `dataFiles`. This is what you submit. |

Also at the top of `build.mjs`: `DEBUG_BUILD` keeps the intermediate files so you can see what each stage produced, `USE_ROADROLLER` turns off the slow stage while iterating, and `ROADROLLER_EXTREME` passes `--optimize 2` (a minute of work for a few bytes — save it for the end).

Add your own files to `sourceFiles`, and runtime assets to `dataFiles`.

## 📦 Saving space

**Start by not worrying about it.** Closure in `ADVANCED` mode already deletes every engine function your game never calls, so unused features mostly cost nothing.

What it *cannot* delete is code behind a feature flag. The engine declares those as mutable `let` bindings so their setters work, and Closure has to keep both branches of every `if (glEnable)` — which is why the whole WebGL implementation survives in a game that never draws with it. The `FEATURES` block fixes that by rewriting a disabled flag to `const false` and emptying its setter before Closure runs:

```js
const FEATURES =
{
    webgl:   true, // WebGL renderer, disabling falls back to canvas 2D
    touch:   true, // touch input and the on screen touch gamepad
    gamepad: true, // gamepad input
    sound:   true, // all audio
};
```

| Disabled | Saving |
|---|---:|
| `touch` | 154 |
| `gamepad` | 254 |
| `webgl` | **733** |
| `sound` | **808** |
| all four | **1953** |

Nearly 2KB, about 15% of the budget, for a silent keyboard-and-mouse game.

Two things worth knowing:

- **Setting `glEnable = false` in your own code costs 50 bytes instead of saving any** — the flag is still mutable, and you have added an assignment. Use `FEATURES`.
- **`FEATURES` only affects the built zip.** `npm start` loads `src/` directly, so the dev page always has everything on. To develop against what you ship, call the setter in `gameInit` — `setGLEnable(false)` compiles to nothing in the build.

Beyond that you can delete an unused engine file from `sourceFiles`, but the saving comes from your game not using the feature, not from deleting the file: once Closure sees `ParticleEmitter` is unreachable it removes all of it, and dropping the file afterwards gains nothing. The exception is `engineTileLayer.js`, which leaves a 72 byte residue because `engineObject.js` calls `tileCollisionTest` inside `if (this.collideTiles)`. Nothing warns you if you remove a file something still references — you get a `ReferenceError` at runtime, not a build error.

Finally: every entry in `dataFiles` goes in the zip. `tiles.png` is already PNG-compressed so `ect` can only shave a little — shrinking the image, or generating art procedurally, is often the cheapest win left.

## 🔀 Migrating to main LittleJS

Build during the compo here, port to regular LittleJS after. **Use the [regular LittleJS docs](https://killedbyapixel.github.io/LittleJS/docs) as your API reference** — the names match, and anything not listed below behaves the same. This list is meant to be enough to do the whole conversion from, including by an AI assistant given only this section.

Verified name by name against **LittleJS 1.18.24**.

### Absent here — purely additive, nothing to do

Pointer lock, `mouseDelta`/`mouseDeltaScreen`, `CanvasLayer` (here `TileLayer` extends `EngineObject` directly), `TileInfo.setFullImage`, `debugScreenshot`, `glDeleteTexture`/`glSetTextureData`, the redirectable draw target (`drawCanvas`/`drawContext`), and all plugins. A game written here cannot be using any of them, so they simply become available.

### Present here — change these on port

| Here | On port |
|---|---|
| `glOverlay` / `setGlOverlay` | Delete — `main` removed WebGL overlay compositing. |
| `medalDisplayIconSize` / `setMedalDisplayIconSize` | Delete — `main` derives the icon size from the display height. |
| `class Music` | Rename to `ZzFXMusic` and include `plugins/zzfxm.js`. Same constructor, same `playMusic(volume, loop)`. |
| Medals (built into the engine) | Include `plugins/medalSystem.js`. Same `medalsInit` and `Medal` API, different file. |
| `tileInfo.getTextureInfo()` | Becomes the property `tileInfo.textureInfo`. |
| `class FontImage` | Becomes `ImageFont`, and **the constructor changed too**: `FontImage(image, tileSize, paddingSize, context)` here versus `ImageFont(tileInfo)` in `main`. Renaming alone compiles and then misbehaves — rework the call. |
| `zzfxR` | Renamed to `audioDefaultSampleRate`. |
| `isVector2`, `isNumber` | Still exist in `main` but are not exported, so an ESM consumer needs another way to reach them. |

### Tile collision — the one part that is real work

This branch has a **single global collision grid**; `main` has **`TileCollisionLayer` objects** that each own their collision data:

```js
// here                                    // main
initTileCollision(vec2(w, h));             const layer = new TileCollisionLayer(pos, size);
setTileCollisionData(pos, data);           layer.setCollisionData(pos, data);
getTileCollisionData(pos);                 layer.getCollisionData(pos);
const layer = new TileLayer(pos, size);    // visuals and collision are the same object
```

Create a `TileCollisionLayer` instead of the `initTileCollision` + `TileLayer` pair and move the data calls onto it. If your game had one grid — the usual case, since it is all this branch supports — that is close to mechanical. If you relied on the grid being reachable from anywhere without a reference, you need to decide who owns the layer.

The free functions `tileCollisionTest` and `tileCollisionRaycast` **survive unchanged**; `main` only adds an optional trailing `solidOnly=true`. One nuance: `tileCollisionTest` returns a `Boolean` here and the hit layer (or `undefined`) in `main`, so truthiness tests are fine but `=== true` is not.

**Three things port silently wrong if you are not careful:**

- **Constructor argument order.** Here `TileLayer(position, size, tileInfo, scale, renderOrder)`; in `main` `TileCollisionLayer(position, size, tileInfo, renderOrder, useWebGL)`. The 4th and 5th arguments mean different things and both still type-check, so nothing throws — the layer just gets the wrong render order, loses its scale, and never creates a WebGL texture. Re-check each call site by hand. Also `size` has a default here and none in `main`.
- **`layer.isOverlay`** is js13k-only. A layer drawn above all objects loses that on port; use `renderOrder` or the overlay canvas instead.
- **`layer.scale`** works here but is a dead parameter in `main` — accepted and never used. A non-unit scale is silently ignored after porting.

### Behavior differences

- **Keyboard `preventDefault` is gone**, matching `main`. What remains is `inputPreventDefault && e.button && e.preventDefault()` on mousedown, and since `e.button` is `0` for the primary button the flag only ever suppresses middle and right clicks. If you relied on it to stop arrow keys scrolling the page, call `preventDefault` in your own key handler.
- **Touch events always `preventDefault` here.** `main` guards its touch handler with `inputPreventDefault` as well, so `setInputPreventDefault(false)` starts releasing touch events after you port.
- **ZzFX with a non-zero `attack` sounds very slightly different** — this branch adds a fixed 9-sample ramp, `main` replaces it. About 0.2ms; inaudible but real. Sounds with the default `attack` of 0 are identical.
- **`main` has extra ZzFX wave shapes** (shape 5 and the `shape > 4` curve branch). Anything you write here plays the same there.
- **`Sound.stop()` takes no fade time here**; `main` accepts a `fadeTime`.

### Version

`engineVersion` is `1.13.1-js13k` — the release the source is *derived from*, not the current upstream (1.18.24). The gap is deliberate: this branch does not track mainline release for release, it takes fixes, renames and structural changes selectively when they do not cost bytes. The migration notes above are current regardless, verified against 1.18.24.

Not taken from upstream: the large `engineDraw` / `engineInput` / `engineWebGL` feature growth, and the plugin system.

## 💥 [Live Demo of Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter)
## 🛠️ [Main LittleJS Repo](https://killedbyapixel.github.io/LittleJS)
## 🧙 [LittleJS13k Wizard](https://github.com/eoinmcg/create-js13k-littlejs) by [eoinmcg](https://github.com/eoinmcg)

## 🎮 JS13K games made with LittleJS

Many amazing JS13K games have been made using LittleJS, including a few in the top 10...

- [Space Huggers](https://js13kgames.com/2021/games/space-huggers) - Roguelike platformer shoot-em-up game with procedural levels. by KilledByAPixel
- [Black Cat Squadron](https://js13kgames.com/games/black-cat-squadron) - One button shooter based on a WW2 Navy squadron. by repsej
- [L1ttL3 Paws](https://js13kgames.com/2025/games/l1ttl3-paws) - Cat glider with procedural art and levels. by Frank Force
- [The Way of the Dodo](https://js13kgames.com/2024/games/the-way-of-the-dodo) - Single button flapping platformer. by repsej
- [KleptoKitty](https://js13kgames.com/games/kleptokitty) - Cat themed heist puzzle. by eoinmcg
- [Wendol Village](https://js13kgames.com/games/dead-again) - Warcraft inspired RTS game. by sanojian
- [Dead Again](https://js13kgames.com/games/dead-again) - Top down survival horror. by sanojian & repsej
