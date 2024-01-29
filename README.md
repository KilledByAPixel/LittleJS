# ![LittleJS Logo](examples/favicon.png) LittleJS - The Tiny JavaScript Game Engine That Can

[![NPM Package][npm]][npm-url]
[![Build Size][build-size]][build-size-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![DeepScan][deepscan]][deepscan-url]
[![Discord][discord]][discord-url]

## 🚂 All aboard!

LittleJS is a lightweight open source HTML5 game engine designed for modern web development.
It's small footprint is packed with a comprehensive feature set, including hybrid rendering, physics, particles, sound effects, music, input handling, and debug tools.
The code is very clean and well documented with some fun examples to get you started. Choo-Choo! 🚂

<div align="center">

## [Demo](https://killedbyapixel.github.io/LittleJS/examples/starter/) | [Docs](https://killedbyapixel.github.io/LittleJS/docs) | [Trailer](https://youtu.be/chuBzGjv7Ms) | [Discord](https://discord.gg/zb7hcGkyZe) | [Tutorial](https://github.com/KilledByAPixel/LittleJS/tree/main/examples/breakoutTutorial)

</div>

![LittleJS Screenshot](examples/screenshot.jpg)

## About LittleJS

LittleJS is a small but powerful game engine with many features and no depenencies.

### ✨ Graphics

- Super fast sprite and tile map rendering engine with WebGL
- Update and render over 10,000 objects at a solid 60fps
- Robust particle effect system and [design tool](https://killedbyapixel.github.io/LittleJS/examples/particles/)
- Apply [Shadertoy](https://www.shadertoy.com) compatible shaders for post processinge effects

### 🔊 Audio

- Positional sound effects with wave or [ZzFX](https://killedbyapixel.github.io/ZzFX/) sound effect generator
- Music with mp3, ogg, wave, or [ZzFXM](https://keithclark.github.io/ZzFXM/)

### 🎮 Input

- Comprehensive input processing system for keyboard, mouse, gamepad, and touch
- On screen touch gamepad designed for mobile devices

### 💥 Physics

- 2D physics engine with collision handling for axis aligned boxes
- Very fast collision and raycasting for tile maps

### 🚀 Flexability

- Compatible with all modern web bowsers and on mobile devices
- Support for TypeScript and Modules with example projects for both
- Ideal for size coding competitions like [js13kGames](https://js13kgames.com/), [a special example project builds to a 7KB zip file](https://killedbyapixel.github.io/LittleJS/examples/js13k)
- Builds to a Windows executable with [Electron](https://www.electronjs.org/) for distribution on PC platforms like Steam
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used for anything you want forever

### 🛠️ And more...

- Node.js build system
- 2D vector math library
- Debug primitive rendering system
- Particle effects system and design tool
- Bitmap font rendering and includes a built in engine font
- Medal system tracks and displays achievements with Newgrounds integration

## Demos

### [Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter/) - Clean example with only a few things to get you started
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle/) - Match 3 puzzle game with HD rendering and high score tracking
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer/) - Platformer/shooter with procedural generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout/) - Breakout game with post processing effect
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress/) - Max sprite/object test and music system demo
### [Particle System Designer](https://killedbyapixel.github.io/LittleJS/examples/particles/) - Particle system editor and visualizer

## How to use LittleJS

To use LittleJS download the latest package from GitHub or call ```npm install littlejsengine```. This package contains the engine and several small examples.

[You can use the empty example template as a starting point.](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/empty/game.js) This file contains just the minimal setup to start the engine. You can also download and include [littlejs.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.js) or [littlejs.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.min.js).

If your game loads any files like images you will need to run a local web server. Some editors can do this automatically like [Visual Studio Code](https://code.visualstudio.com/) with the [Live Server plugin](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer). You can also use [http-server](https://www.npmjs.com/package/http-server) via npm.

[The Breakout Tutorial](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/breakoutTutorial) is provided to demonstrate how to make a simple game from scratch. [The tutorial is also available on YouTube.](https://youtu.be/tSwDx-NWTXE?si=bkjMa8-7AN2Wg5MO)

## Builds

To easily include LittleJS in your game, you can use one of the 3 pre-built js files. These are also built automatically by the build scripts.

- [littlejs.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.js) - The full game engine with debug mode available
- [littlejs.release.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.release.js) - The engine optimized for release builds
- [littlejs.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.min.js) - The engine in release mode and minified

LittleJS can also be imported as a module. There are two module flavors that are automatically built.

- [littlejs.esm.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.esm.js) - The engine exported as a module with debug mode available
- [littlejs.esm.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/build/littlejs.esm.min.js) - The engine exported as a minified module in release mode

To rebuild the engine you must first run ```npm install``` to setup the necessary npm dependencies. Then call ```npm run build``` to build the engine.

The starter example project also includes a node js file [build.js](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/starter/build.js) that compresses everything into a tiny zip file using Google Closure, UglifyJS, and ECT Zip.

## Engine Source Code

This engine is made with simplicity in mind using clean easy to read code.
There are only a few core files used by the entire engine.

- [engine.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engine.js) - Top level engine init, update, and render
- [engineSettings.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineSettings.js) - Global engine settings
- [engineObject.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineObject.js) - Base object class and physics
- [engineDraw.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineDraw.js) - Code for canvas drawing and text
- [engineAudio.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineAudio.js) - Spacial sound effects, and zzfx sound generator
- [engineInput.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineInput.js) - Input for keyboard, mouse, touch, and gamepad
- [engineUtilities.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineUtilities.js) - Vector2, Color, and Timer clases and math functions

Optional Components, these components are built to synergize with the rest of the engine but are not required.

- [engineTileLayer.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineTileLayer.js) - Tile layer rendering and collision
- [engineParticles.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineParticles.js) - Particle system with fast rendering and collision
- [engineWebGL.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineWebGL.js) - Super fast rendering with WebGL and post processing
- [engineMedals.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineMedals.js) - Achievement tracker with Newgrounds integration
- [engineDebug.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineDebug.js) - Debug rendering system and information overlay
- [engineExport.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineExport.js) - Included when exporting engine as a module
- [engineBuild.js](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineBuild.js) - Node script used to build the engine

## LittleJS Setup

To start LittleJS, you must create 5 functions and pass them to engineInit. A canvas will automatically be created and added to the document. 

```javascript
function gameInit()
{
    // called once after the engine starts up
    // setup the game
}

function gameUpdate()
{
    // called every frame at 60 frames per second
    // handle input and update the game state
}

function gameUpdatePost()
{
    // called after physics and objects are updated
    // setup camera and prepare for render
}

function gameRender()
{
    // called before objects are rendered
    // draw any background effects that appear behind objects
}

function gameRenderPost()
{
    // called after objects are rendered
    // draw effects or hud that appear above all objects
}

// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');
```

## LittleJS Objects

Though not required, LittleJS is intended to be used as an object oriented system by extending the base class [EngineObject](https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineObject.js) with your own. This lightweight class provides many useful features including physics, collision, parent/child system, and sorted rendering. Engine objects are automatically added to the global list of objects where they will be updated and rendered until destroyed. 

Here is a template you can use to make objects that behave however you want. See the examples for a complete demonstration.

```javascript
class MyObject extends EngineObject 
{
    constructor(pos, size, tileIndex, tileSize, angle)
    {
        super(pos, size, tileIndex, tileSize, angle);
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
```

## Debugging

Debug builds of LittleJS have a special menu that can be opened by pressing the Esc key.

- Esc: Debug Overlay
- 1: Debug Physics
- 2: Debug Particles
- 3: Debug Gamepads
- 4: Debug Raycasts
- 5: Save Screenshot

## Games Made With LittleJS

Here are a few of the amazing games people are making with LittleJS.

- [Space Huggers](https://www.newgrounds.com/portal/view/819609) - Run and gun platformer with procedural levels
- [Undergrowth](https://undergrowth.squidband.uk/) - An interactive music videogame for the band Squid
- [Space Huggers - JS13K Edition](https://github.com/KilledByAPixel/SpaceHuggers) - Original js13k game with source code
- [Isletopia](https://store.steampowered.com/app/1861260/Isletopia) - Relaxing strategy game of greenifying barren islands
- [Dead Again](https://js13kgames.com/entries/dead-again) - Top down survial horror by [sanojian & repsej](https://github.com/sanojian/js13k_2022)
- [Hel's Trial](https://js13kgames.com/entries/hels-trial) - Turn based RPG by [Sebastian Dorn](https://github.com/sebadorn/js13k-2022-death)
- [Bit Butcher](https://js13kgames.com/entries/bit-butcher) - Survival crafting game by [Deathray Games](https://github.com/deathraygames/bit-butcher)
- [Necrotic Commander](https://js13kgames.com/entries/necrotic-commander) - Tower defense game by [Daniel Jeffery](https://github.com/d-jeffery/NecroticCommander)
- [Boxing up Bamboo](https://patrickgh3.itch.io/boxing-up-bamboo) - A challenging puzzle game by [Patrick Traynor](https://cwpat.me/about)
- [Samurai Sam](https://dev.js13kgames.com/2023/games/samurai-sam) - A Fruit Ninja inspired game by [John Edvard](https://reitgames.com)
- Send me your games!

![LittleJS Logo](examples/favicon.png)

[npm]: https://img.shields.io/npm/v/littlejsengine
[npm-url]: https://www.npmjs.com/package/littlejsengine
[build-size]: https://badgen.net/bundlephobia/minzip/littlejsengine?1
[build-size-url]: https://bundlephobia.com/result?p=littlejsengine
[npm-downloads]: https://img.shields.io/npm/dw/littlejsengine
[npmtrends-url]: https://www.npmtrends.com/littlejsengine
[deepscan]: https://deepscan.io/api/teams/22950/projects/26229/branches/831487/badge/grade.svg
[deepscan-url]: https://deepscan.io/dashboard#view=project&tid=22950&pid=26229&bid=831487
[discord]: https://img.shields.io/discord/939926111469568050
[discord-url]: https://discord.gg/zb7hcGkyZe
