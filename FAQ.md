# LittleJS Frequently Asked Questions

Welcome to the LittleJS FAQ!
This document addresses common questions and issues to help developers get started and troubleshoot their projects.
If you don’t find an answer here, feel free to ask the community or check the documentation.

Getting Started
- [What is LittleJS, and how is it different from other JavaScript game engines?](#what-is-littlejs-and-how-is-it-different-from-other-javascript-game-engines)
- [How do I set up a basic LittleJS project?](#how-do-i-set-up-a-basic-littlejs-project)
- [How do I use LittleJS as an ES module?](#how-do-i-use-littlejs-as-an-es-module)
- [How do I use LittleJS with TypeScript?](#how-do-i-use-littlejs-with-typescript)
- [Why do I see a blank screen when I run my game?](#why-do-i-see-a-blank-screen-when-i-run-my-game)
- [Do I need a local server to run LittleJS games, and how do I set one up?](#do-i-need-a-local-server-to-run-littlejs-games-and-how-do-i-set-one-up)
- [How does the camera and world coordinate systems work?](#how-does-the-camera-and-world-coordinate-systems-work)
- [How do I use Vite with LittleJS?](#how-do-i-use-vite-with-littlejs)
- [How do I use Box2D with Vite?](#how-do-i-use-box2d-with-vite)
- [How do I build and publish my game?](#how-do-i-build-and-publish-my-game)

Graphics and Sound
- [How do I load and add images to my game?](#how-do-i-load-and-add-images-to-my-game)
- [What is the tile function and how do tile indexes work?](#what-is-the-tile-function-and-how-do-tile-indexes-work)
- [Can I add and switch between multiple sprites for a game object?](#can-i-add-and-switch-between-multiple-sprites-for-a-game-object)
- [There are thin lines around my sprites sometimes, how can I fix that?](#there-are-thin-lines-around-my-sprites-sometimes-how-can-i-fix-that)
- [How do I handle animations in LittleJS?](#how-do-i-handle-animations-in-littlejs)
- [How do I control the camera in LittleJS?](#how-do-i-control-the-camera-in-littlejs)
- [How do I use post-processing shaders?](#how-do-i-use-post-processing-shaders)
- [How do I play sounds in LittleJS?](#how-do-i-play-sounds-in-littlejs)
- [If I load several images, how do I control which is used?](#if-i-load-several-images-how-do-i-control-which-is-used)
- [How can I check if an object is on screen?](#how-can-i-check-if-an-object-is-on-screen)

Gameplay and Programming
- [How do I add keyboard or mouse input to my game?](#how-do-i-add-keyboard-or-mouse-input-to-my-game)
- [How does touch input work on mobile?](#how-does-touch-input-work-on-mobile)
- [How do I create and update game objects?](#how-do-i-create-and-update-game-objects)
- [How can I load a 2D level map?](#how-can-i-load-a-2d-level-map)
- [Can I use physics with LittleJS?](#can-i-use-physics-with-littlejs)
- [How do I add particle effects to my game?](#how-do-i-add-particle-effects-to-my-game)
- [How do I save and load game state?](#how-do-i-save-and-load-game-state)
- [How do I use the medals (achievements) system?](#how-do-i-use-the-medals-achievements-system)

Debugging and Development
- [How do I debug my game in LittleJS?](#how-do-i-debug-my-game-in-littlejs)

---

## Getting Started
### What is LittleJS, and how is it different from other JavaScript game engines?

LittleJS is a lightweight, high-performance JavaScript game engine designed for simplicity and speed.
It offers a hybrid rendering system that combines the advantages of WebGL and 2D Canvas.
Unlike larger, feature-heavy engines, LittleJS focuses on 2D games and providing a comprehensive set of simple, easy to use features.
LittleJS is perfect for developers who want a minimal yet powerful engine to bring their 2D game ideas to life without the complexity of larger frameworks.

### How do I set up a basic LittleJS project?

Download the LittleJS repository via GitHub or npm.
Include one of the LittleJS builds from the dist folder.
Several examples are included for you to build on.
The most basic example is just an empty project.

[Empty Example HTML file:](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/empty/index.html)
```html
<!DOCTYPE html><head>
<title>LittleJS Hello World Demo</title>
<meta charset=utf-8>
</head><body>

<script src=../../dist/littlejs.js></script>
<script src=game.js></script>
```

[Empty Example JavaScript file:](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/empty/game.js)
```javascript
/*
    Little JS Hello World Demo
    - Just prints "Hello World!"
    - A good starting point for new projects
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // called once after the engine starts up
    // setup the game
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // called every frame at 60 frames per second
    // handle input and update the game state
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // called after physics and objects are updated
    // setup camera and prepare for render
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // called before objects are rendered
    // draw any background effects that appear behind objects
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // called after objects are rendered
    // draw effects or hud that appear above all objects
    drawTextScreen('Hello World!', mainCanvasSize.scale(.5), 80);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
```

### How do I use LittleJS as an ES module?

If you're using a bundler (Vite, Rollup, webpack, etc.) or just want to use native ES modules, install via npm and import what you need:

```
npm install littlejsengine
```

```javascript
import { engineInit, drawText, vec2 } from 'littlejsengine';

function gameRenderPost() {
    drawText('Hello!', vec2(0,0), 4);
}

engineInit(undefined, undefined, undefined, undefined, gameRenderPost, ['tiles.png']);
```

You can also import everything under a namespace:

```javascript
import * as LJS from 'littlejsengine';
LJS.drawText('Hello!', LJS.vec2(0,0), 4);
```

See [examples/module/](examples/module/) for a full working example, and the Vite section below for setting up a build tool around it.

### How do I use LittleJS with TypeScript?

LittleJS ships with type definitions in `dist/littlejs.d.ts`, which the npm package wires up automatically. Install via npm and you get type checking with no extra setup:

```
npm install littlejsengine
```

```typescript
import { engineInit, drawText, vec2 } from 'littlejsengine';

function gameRenderPost(): void {
    drawText('Hello!', vec2(0,0), 4);
}

engineInit(undefined, undefined, undefined, undefined, gameRenderPost, ['tiles.png']);
```

See [examples/typescript/](examples/typescript/) for a complete TypeScript project with `tsconfig.json`. You can also adapt the Vite starter — Vite supports TypeScript out of the box, just rename `src/main.js` to `src/main.ts` and update the `index.html` script reference.

### Why do I see a blank screen when I run my game?

If you are seeing a blank screen, first try opening the dev tools console (F12 in most browsers).
This will show you any errors that occur and allows stepping through code to help debug.
A common issue is the image data failing to load with a message like "The image element contains cross-origin data, and may not be loaded."
This is probably because the game was loaded directly without using a web server!

### Do I need a local server to run LittleJS games, and how do I set one up?

Yes, this is a necessary step because web browsers just have protection from loading local files which includes images.
So any JavaScript projects that load images like games must be opened from a local web server.
Don't panic though, it's very easy to fix! 

If you are using [Visual Studio Code](https://code.visualstudio.com/) there is a [Live Preview Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server) that will handle this for you automatically.

Another option is to setup a simple local web server like [http-server](https://www.npmjs.com/package/http-server) via npm.

### How does the camera and world coordinate systems work?

LittleJS drawing functions are all handled in world coordinates by default.
The conversion from world to screen is determined by the camera position and scale as well as the canvas size in pixels.
Camera scale determines how many screen pixels equals 1 world unit while the cameraPosition is the offset in world units.
There is also a function you can use called getCameraSize() to get the viewable camera window in world coordinates.

### How do I use Vite with LittleJS?

There is an official [Vite](https://vite.dev) starter template in `examples/vite-starter`. The fastest way to start a new project from it is with [degit](https://github.com/Rich-Harris/degit):

```
npx degit KilledByAPixel/LittleJS/examples/vite-starter my-game
cd my-game
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173/`) — open it and you should see the LittleJS logo tile and "LittleJS + Vite" text.

Key things the template sets up for you:
- `base: './'` in `vite.config.js` so the build works on GitHub Pages, itch.io, and other subdirectory hosts without further config.
- Assets in `public/` (like `tiles.png`) are served at the site root in dev and copied to the build output, so `engineInit(..., ['tiles.png'])` works in both modes without a separate import.
- A `public/.nojekyll` marker so GitHub Pages serves Vite's `_`-prefixed chunk files correctly.
- A full page reload on save instead of partial HMR, since LittleJS has engine-level global state (canvas, WebGL, input listeners, the RAF loop) that doesn't survive a module hot swap. The relevant line in `src/main.js` is `if (import.meta.hot) import.meta.hot.accept(() => location.reload())`.

Requires Node 20.19+ or 22.12+ (Vite 7 requirement). Other community projects like [Michael Haynie's LittleJS Jam project](https://github.com/michael-dean-haynie/littlejs-game-jam-2024) are good real-world references for more elaborate Vite setups.

### How do I use Box2D with Vite?

Box2D ships as two separate files in the npm package: `box2d.wasm.js` (the Emscripten loader, ~300KB) and `box2d.wasm.wasm` (the binary, ~167KB). Both live in `node_modules/littlejsengine/dist/`.

The catch: `box2d.wasm.js` fetches the `.wasm` from **its own script directory** using `document.currentScript.src`. That means the two files have to be served side by side, and `box2d.wasm.js` has to be loaded as a classic `<script>` tag — not a module, no `defer`, no `async` — so `document.currentScript` resolves correctly.

**To add Box2D to the Vite starter:**

1. Copy both files into `public/`:

```
public/
  box2d.wasm.js
  box2d.wasm.wasm
```

2. Add a script tag to `index.html` *before* your module script:

```html
<script src=./box2d.wasm.js></script>
<script src=./src/main.js type=module></script>
```

Vite may print an informational warning during build that the classic script can't be bundled without `type=module` — this is expected and harmless. The classic-script form is exactly what's needed so Emscripten can read `document.currentScript.src` to locate the `.wasm` file.

3. Await `box2dInit()` in `main.js` before `engineInit`:

```javascript
import { box2dInit, engineInit } from 'littlejsengine';

await box2dInit();
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
```

To avoid copying the files by hand on every fresh install, add a `postinstall` script to `package.json`:

```json
"scripts": {
  "postinstall": "node -e \"['box2d.wasm.js','box2d.wasm.wasm'].forEach(f=>require('fs').copyFileSync('node_modules/littlejsengine/dist/'+f,'public/'+f))\""
}
```

Then `npm install` keeps `public/box2d.wasm.*` in sync with whatever version of `littlejsengine` you have installed. Add them to `.gitignore` if you don't want the binaries in your repo.

### How do I build and publish my game?

It depends on how your project is set up:

**Plain script-tag projects** (like `examples/starter`) are already deployable as-is. For production, swap the debug bundle for a release build to strip asserts and shrink the file:

```html
<!-- During development -->
<script src=dist/littlejs.js></script>

<!-- For production: stripped asserts, smaller -->
<script src=dist/littlejs.release.js></script>

<!-- Smallest: minified release -->
<script src=dist/littlejs.min.js></script>
```

Then zip up your game folder for itch.io or push to GitHub Pages.

**Vite / module projects** — run `npm run build` and deploy the output `dist/` folder.

**For GitHub Pages**, use relative asset paths (the Vite starter sets `base: './'` in `vite.config.js` for this), and include an empty `.nojekyll` file in your output so files starting with `_` aren't ignored by Jekyll.

**For itch.io**, zip your build output and upload as an HTML5 game. Tick "This file will be played in the browser" in the upload settings.

**For size coding competitions** like js13kGames, see the [js13k branch](https://github.com/KilledByAPixel/LittleJS/tree/js13k) which provides a build that fits in 7KB zipped.

---

## Graphics and Sound

### How do I load and add images to my game?

First you need to load an image file. For LittleJS this is typically done on startup via a parameter to engineInit that is a list of images to load. The engine will ensure that the images are all loaded before starting. Each source image can be up to 4096x4096 in size so most games only need one texture, though it's possible to load as many as you need.

```javascript
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
```

LittleJS works best when your tile sheet is broken up into grids of tiles because the rendering system can be batched up. To draw a tile from a source image you can call drawTile and pass in TileInfo object. Another common approach is to create an EngineObject and set its tileInfo, it will automatically be rendered.

```javascript
drawTile(vec2(21,5), vec2(4.5), tile(3,128));
```

Once loaded, the underlying images are available via `textureInfos[0].image`, `textureInfos[1].image`, etc. This is useful for tasks like reading pixel data to generate a level — see [examples/module/game.js](examples/module/game.js) for an example that reads tile data directly from an image.

### What is the tile function and how do tile indexes work?

The tile function is a very useful function that takes a tile index and size and returns a TileInfo object which can be passed to functions like drawTile. It works by using the tileIndex multiplied by the tileSize to get the coordinates for the TileInfo. It's also possible to pass in padding for sheets that are set up for it.

### Can I add and switch between multiple sprites for a game object?

You can set the object's tileInfo to a new sprite, or just call drawTile directly with any sprite.

```javascript 
this.tileInfo = tile(3, 32);
```

### There are thin lines around my sprites sometimes, how can I fix that?

That's called tile bleeding — pixels from one tile blend into a neighboring tile when sampling at sub-pixel positions. Two ways to fix it:

1. Call `setTileDefaultBleed(.5)` (or pass a `bleed` parameter to `tile()` / the `TileInfo` constructor). This shrinks each tile slightly when sampling. A value around `.5` usually eliminates the issue with no noticeable visual difference. Smaller values like `.1` are sometimes enough.

2. Add 1 pixel of padding around each sprite in your spritesheet, then pass that padding to `tile(index, size, texture, padding)` so the engine accounts for it.

### How do I handle animations in LittleJS?

You can use the TileInfo.frame function passing in the number of animation frames to offset the sprite.
It sounds kind of weird at first but imagine your sprites are all aligned on a grid with frames of animations being next to eachother.
This allows easily indexing into those animations from the base sprite location.
For example to animate the player sprite you might do something like this...

```javascript 
this.tileInfo = spriteAtlas.player.frame(animationFrame);
```

### How do I control the camera in LittleJS?

LittleJS uses a world space rendering system, so objects can move independently of the camera.
The camera is easy to control using cameraPosition and cameraScale, which indicate the world space position and how many pixels is equivalent to one world unit.
The default cameraScale is 32 while the default cameraPosition is just the origin.
It is also possible to draw using screen space pixel coordinates by passing in true as the screenSpace parameter to most drawing functions.

```javascript
setCameraPos(vec2(22,5)); // move camera to world position (22,5)
setCameraScale(20);  // zoom camera to 20 pixels per world unit
```

### How do I use post-processing shaders?

LittleJS supports Shadertoy-style fragment shaders as a final pass on the rendered output via the post-process plugin. Create the plugin with your shader source before `engineInit`:

```javascript
const shader = `
void mainImage(out vec4 c, vec2 p) {
    vec2 uv = p / iResolution.xy;
    c = texture(iChannel0, uv);
    c.rgb *= 1.0 - distance(uv, vec2(0.5)) * 0.7; // vignette
}`;

new PostProcessPlugin(shader);
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
```

The shader gets these uniforms automatically:

- `iChannel0` (`sampler2D`) — the rendered game frame
- `iResolution` (`vec3`) — canvas width, height, and `1`
- `iTime` (`float`) — seconds since engine start

The constructor also accepts a `feedbackTexture: true` argument for effects that need the previous frame (motion trails, etc.). See [plugins/postProcess.js](plugins/postProcess.js) and the [Breakout example](https://killedbyapixel.github.io/LittleJS/examples/breakout/) for working post-process effects.

### How do I play sounds in LittleJS?

Sounds can either be generated on startup using ZzFX or loaded from a wave or mp3 file.
[ZzFX sounds can be created using the sound designer app.](https://killedbyapixel.github.io/ZzFX/)
Once loaded sounds can be played by calling Sound.play with some parameters to control how it is played.

```javascript
const sound_click = new Sound([1,.5]); // create a ZzFX sound
const sound_jump = new Sound('jump.mp3'); // load an mp3 sound
sound_click.play(pos, volume, pitch); // play a sound
```

### If I load several images, how do I control which is used?

There is just an optional parameter you can pass to the tile function or to TileInfo called textureIndex. It defaults to 0 so if you only have one texture, you may not have noticed it. If you set to another number will select another texture in list. Something to keep in mind for large games is that changing the target texture will require WebGL to flush the render batch which can cause slowdown if it is done many times per frame.

```javascript
function tile(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
```

### How can I check if an object is on screen?

You can use the isOverlapping function to check the object against the camera. For culling you maybe want to enlarge the object size slightly to account for attached objects or rotation, I usually do this.size.scale(2).

```javascript
if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
    return;
```

---

## Gameplay and Programming

### How do I add keyboard or mouse input to my game?

LittleJS provides input handling functions for keyboard, mouse, and gamepads. Touch input is also routed to the mouse. There are functions for isDown, wasPressed, and wasReleased. Input can only be checked during the update and should not be called from render functions.

```javascript
if (keyIsDown('ArrowLeft')) // Left arrow key
   obj.x -= 5;
if (mouseWasReleased(0)) // Left mouse button
   console.log('Mouse clicked at:', mousePos);
if (gamepadWasPressed(0)) // Gamepad button 0
   console.log('Gamepad pressed, stick is:', gamepadStick(0));
```

Keyboard keys are identified by `KeyboardEvent.code` strings (e.g. `'KeyA'`, `'Space'`, `'ArrowUp'`, `'Enter'`). See the [MDN code reference](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values) for the full list.

### How does touch input work on mobile?

Touch input is routed to the mouse functions automatically — `mouseIsDown(0)`, `mouseWasPressed(0)`, and `mousePos` all work with a finger tap on the canvas. Games written for mouse usually work on mobile without code changes.

For games that need movement and multiple buttons, enable the built-in on-screen gamepad:

```javascript
setTouchGamepadEnable(true);
```

Once enabled, an analog stick and face buttons appear on touch devices, and the regular gamepad input functions (`gamepadIsDown`, `gamepadStick`) work normally — so the same code can drive both a physical gamepad and the touch overlay. Customization helpers like `setTouchGamepadSize`, `setTouchGamepadAnalog`, `setTouchGamepadButtonCount`, and `setTouchGamepadAlpha` let you tune the appearance.

You can also branch behavior on `isTouchDevice` if you need to detect touch hardware explicitly.

### How do I create and update game objects?

LittleJS can be used as an object oriented system by extending the base class [EngineObject](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineObject.js) with your own. This lightweight class provides many useful features including physics, collision, parent/child system, and sorted rendering. These objects are added to the global list of objects where they will automatically be updated and rendered until destroyed.

Here is a template you can use to make objects that behave however you want. See the examples for a complete demonstration.

```javascript
class MyObject extends EngineObject 
{
    constructor(pos, size, tileInfo)
    {
        super(pos, size, tileInfo);
        // setup object
    }

    update()
    {
        // update object physics and position
        super.update(); 
    }

    render()
    {
        // draw object as a sprite
        super.render();
    }
}

// spawn one of those objects
const object = new MyObject(pos, size, tileInfo);
```

Common things you'll do on an `EngineObject`:

- `this.setCollision()` — opt in to tile collision and object-object collision
- `this.tileInfo = tile(7, 16)` — swap the sprite at runtime
- `this.velocity = vec2(.1, 0)` — physics is applied automatically each frame
- `this.gravityScale = 0` — disable gravity for this object (e.g. UI or floating objects)
- `this.destroy()` — remove from the world (calls cleanup on children too)

### How can I load a 2D level map?

There are two parts that work together to make 2D level maps in LittleJS.
The tileCollision system is an array of values that correspond to each tile in the map.
The built in physics system can resolve collisions against this tile map very quickly.
For the visual side of things, there is a class called TileLayer which can be used in conjunction with tileCollision.
The TileLayer system works by pre-rendering the entire level to a texture so it can be drawn extremely fast each frame.
It is also possible to have multiple TileLayers for foreground and background layers.
[The platformer example shows a basic example of how to load data that was exported from an external editor.](https://killedbyapixel.github.io/LittleJS/examples/platformer/)

### Can I use physics with LittleJS?

Yes! LittleJS comes with a robust game physics system included and [also a plugin using Box2D.](https://killedbyapixel.github.io/LittleJS/examples/box2d/)
The platformer example includes a character object class that can be used as a starting point for advanced platforming physics.

### How do I add particle effects to my game?

[There is a particle system designer that is useful for experimenting with particle designs.](https://killedbyapixel.github.io/LittleJS/examples/particles/)

You can create a particle system in code using the ParticleEmitter object.

```javascript
// fire particle system
new ParticleEmitter(
    pos, 0,                         // pos, angle
    1, .1, 100, PI,                 // emitSize, emitTime, emitRate, emiteCone
    0,                              // tileInfo
    rgb(1,.5,.1), rgb(1,.1,.1),     // colorStartA, colorStartB
    rgb(1,.5,.1,0), rgb(1,.1,.1,0), // colorEndA, colorEndB
    .7, .8, .2, .2, .05,  // time, sizeStart, sizeEnd, speed, angleSpeed
    .9, 1, -.2, PI, .05,  // damp, angleDamp, gravity, particleCone, fade
    .5, 0, 1, 0, 1e9      // randomness, collide, additive, colorLinear, renderOrder
);
```

### How do I save and load game state?

LittleJS has built-in helpers for localStorage-backed save data — no need to roll your own JSON serialization:

```javascript
// Read save data, falling back to defaults if nothing is saved yet
const saveData = readSaveData('MyGame', { highScore: 0, level: 1 });

// Write save data
writeSaveData('MyGame', { highScore: 99999, level: 5 });
```

The `saveName` should be unique per game so multiple LittleJS games on the same host don't collide. The data object must be JSON-serializable (no functions, no circular references). Under the hood these are thin wrappers around `localStorage` + `JSON.stringify` / `JSON.parse`.

### How do I use the medals (achievements) system?

LittleJS includes a medals plugin for tracking unlockable achievements with toast notifications:

```javascript
// Create medals — each needs a unique id, optional emoji icon
const medal_firstWin = new Medal(0, 'First Win', 'Win your first match', '🏆');
const medal_perfect  = new Medal(1, 'Perfect Score', 'Score 100%', '⭐');

// Initialize medals — saveName persists unlocks to localStorage
medalsInit('MyGame');

// Unlock a medal (shows notification, persists across sessions)
medal_firstWin.unlock();
```

You can pass an image URL as the fifth argument to `Medal` instead of an emoji icon. The `saveName` you pass to `medalsInit` is used to track which medals have been unlocked in localStorage, so unlocks persist across sessions.

The plugin also supports [Newgrounds](https://www.newgrounds.com) integration via `newgrounds.io` for hosted leaderboards and cloud-synced achievements. See [plugins/medalSystem.js](plugins/medalSystem.js) for details.

---

## Debugging and Development

### How do I debug my game in LittleJS?

In addition to your browser's built in developer mode, LittleJS has its own debug view.
Press the Esc key to show the debug menu. From here there are several options that can be accessed via the number keys.

You can also press + or - to adjust game speed to help with debugging, or just for fun!

---

## Contribute to the FAQ
If you have additional questions or think something should be added to this FAQ, please open an issue or pull request on the [LittleJS GitHub repository](https://github.com/KilledByAPixel/LittleJS).

---

Happy coding with LittleJS! 🎮🚂💨
