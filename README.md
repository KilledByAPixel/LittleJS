# LittleJS - The Tiny Fast JavaScript Game Engine

<div align="center">
    
![LittleJS Screenshot](examples/logo.png)

[![NPM Package][npm]][npm-url]
[![Build Size][build-size]][build-size-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![DeepScan][deepscan]][deepscan-url]
[![Discord][discord]][discord-url]

</div>

## 🚂 All aboard!

LittleJS is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance.
Its small footprint is packed with a comprehensive feature set including hybrid rendering, physics, particles, sound, and input handling.
The code is clean and well documented with some fun examples to get you started right away. Choo-Choo!

<div align="center">

## [Demo](https://killedbyapixel.github.io/LittleJS/examples/starter/) | [Docs](https://killedbyapixel.github.io/LittleJS/docs) | [Trailer](https://youtu.be/chuBzGjv7Ms) | [Discord](https://discord.gg/zb7hcGkyZe) | [Tutorial](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/breakoutTutorial/README.md) | [FAQ](https://github.com/KilledByAPixel/LittleJS/blob/main/FAQ.md)

</div>

![LittleJS Screenshot](examples/screenshot.jpg)

## About LittleJS Engine

LittleJS is a small but powerful game engine with many features and no dependencies.

### ✨ Graphics

- Super fast sprite and tile map rendering engine with WebGL
- Update and render 100,000+ sprites at a solid 60fps
- Apply [Shadertoy](https://www.shadertoy.com) compatible shaders for post-processing effects
- Robust particle effect system and [effect design tool](https://killedbyapixel.github.io/LittleJS/examples/particles/)

### 🔊 Audio

- Positional sound effects with wave files, mp3s, or ZzFX
- Use [ZzFX](https://killedbyapixel.github.io/ZzFX/) sound effect generator to play sounds without asset files
- Music with mp3, ogg, wave, or [ZzFXM](https://keithclark.github.io/ZzFXM/)

### 🎮 Input

- Comprehensive input handling for keyboard, mouse, gamepad, and touch
- On screen touch gamepad designed for mobile devices

### 💥 Physics

- Robust arcade physics system with collision handling
- Very fast collision and raycasting for tile maps
- Full Box2d support using [super fast wasm build of box2d.js](https://github.com/kripken/box2d.js/)

### 🚀 Flexibility

- Compatible with all modern web browsers and on mobile devices
- Support for TypeScript and Modules with example projects for both
- Ideal for size coding competitions like [js13kGames](https://js13kgames.com/), [starter project builds to a 7KB zip](https://github.com/KilledByAPixel/LittleJS/tree/js13k)
- Builds to an executable with [Electron](https://www.electronjs.org/) for distribution on Windows, macOS, and Linux
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used for anything you want forever

### 🛠️ And more...

- Node.js build system
- 2D vector math library
- Debug primitive rendering system
- Particle effects system and design tool
- Bitmap font rendering and includes a built in engine font
- Medal system tracks and displays achievements with Newgrounds integration

## How to use LittleJS

To get started download the latest LittleJS package from GitHub or install via npm: ```npm install littlejsengine```

*You will need to run a local web server to run LittleJS games!*

This is because web browsers just have protection from loading local files. You may see a console error like "The image element contains cross-origin data." Don't panic, it's easy to fix! If you are using [Visual Studio Code](https://code.visualstudio.com/) there is a [Live Preview Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server) that will handle this for you automatically. Another option is to setup a simple local web server like [http-server](https://www.npmjs.com/package/http-server) via npm.

- Learn how to make a simple game from scratch with [The Breakout Tutorial.](https://github.com/KilledByAPixel/LittleJS/tree/main/examples/breakoutTutorial)
- [LittleJS Engine Quick Reference Sheet](https://github.com/KilledByAPixel/LittleJS/blob/main/reference.md) - This cheat sheet can help you get started.
- [Watch this GitNation talk](https://youtu.be/_dXKU0WgAj8?si=ZDXLYAFDWp54hrGT) to hear more about LittleJS works and get some tips on how to use it.
- Join our vibrant community on [Discord](https://discord.gg/zb7hcGkyZe) to get help, share your projects, and collaborate with others!
- [Check out The Little JS FAQ for more help getting started](https://github.com/KilledByAPixel/LittleJS/blob/main/FAQ.md), and let us know if there's anything you'd like to see added.

## Examples

These demos are for both learning and using as starter projects to create your own games.

- [Starter Project](https://killedbyapixel.github.io/LittleJS/examples/starter/) - Clean example with only a few things to get you started
- [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout/) - Block breaking game with post-processing effects
- [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle/) - Match 3 puzzle game with HD rendering and high score tracking
- [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer/) - Platformer/shooter with level data from [Tiled Editor](https://github.com/mapeditor/tiled)
- [Box2D Demo](https://killedbyapixel.github.io/LittleJS/examples/box2d/) - Box2D plugin demonstration and testbed
- [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress/) - Max sprite/object test and music system demo
- [Particle System Designer](https://killedbyapixel.github.io/LittleJS/examples/particles/) - Particle system editor and visualizer
- [All Examples](https://killedbyapixel.github.io/LittleJS/examples/) - Links to all the example projects on one page

## Builds

To easily include LittleJS in your game, you can use one of the pre-built js files.

- [littlejs.js](https://github.com/KilledByAPixel/LittleJS/blob/main/dist/littlejs.js) - The full game engine with debug mode available
- [littlejs.release.js](https://github.com/KilledByAPixel/LittleJS/blob/main/dist/littlejs.release.js) - The engine optimized for release builds
- [littlejs.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/dist/littlejs.min.js) - The engine in release mode and minified
- [littlejs.esm.js](https://github.com/KilledByAPixel/LittleJS/blob/main/dist/littlejs.esm.js) - The engine exported as a module with debug mode available
- [littlejs.esm.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/dist/littlejs.esm.min.js) - The engine exported as a minified module in release mode

To rebuild the engine you must first run ```npm install``` to setup the necessary npm dependencies. Then call ```npm run build``` to build the engine.

The starter example project includes a node js file [build.js](https://github.com/KilledByAPixel/LittleJS/blob/main/examples/starter/build.js) that compresses everything into a tiny zip file using Google Closure, UglifyJS, and ECT Zip.

Debug builds of LittleJS have a special menu that can be opened by pressing the Esc key.

## Games Made With LittleJS

Here are a few of the amazing games people made using LittleJS...

- [Space Huggers](https://www.newgrounds.com/portal/view/819609) - Rogulike platformer shoot-em-up game with procedural levels. by [KilledByAPixel](https://frankforce.com/)
- [Undergrowth](https://undergrowth.squidband.uk/) - An interactive music videogame for the band Squid. by [KilledByAPixel](https://frankforce.com/)
- [The Way of the Dodo](https://js13kgames.com/2024/games/the-way-of-the-dodo) - Single button platformer. JS13k 5th place winner! by [repsej](https://github.com/repsej)
- [204Snake!](https://www.newgrounds.com/portal/view/960100) - A unique puzzle game that combines 2048 with snake. LittleJS Jam 1st place winner! by [Sodoj](https://sodoj.itch.io/) and [Shai-P](https://shai-p.itch.io/)
- [GATOR](https://www.newgrounds.com/portal/view/960757) - Retro platformer shooter game where you rescue animals. LittleJS Jam 2nd place winner! by [eoinmcg](https://eoinmcg.itch.io/)
- [A Hedgehog's search](https://willsm1111.itch.io/a-hedgehogs-search) - Adventure game staring a hedgehog. LittleJS Jam 3rd place winner! by [willsm1111](https://willsm1111.itch.io/)
- [Wendol Village](https://js13kgames.com/2024/games/wendol-village) - Warcraft inspired RTS game. by [sanojian](https://github.com/sanojian)
- [Dead Again](https://js13kgames.com/entries/dead-again) - Top down survial horror. by [sanojian & repsej](https://github.com/sanojian/js13k_2022)
- [Isletopia](https://store.steampowered.com/app/1861260/Isletopia) - Relaxing strategy game of greenifying barren islands. by [Gamex Studio](https://x.com/gamesgamex)
- [Tetrimals](https://nixn.itch.io/tetrimals) - A puzzle game mixing Tetris with animals. by [nixn](https://nixn.itch.io/)
- [Watch the Pups](https://ma5a.itch.io/watch-the-pups) - The aim of the game is to take care of some puppies. by [masa](https://ma5a.itch.io/)
- [LittleJS Game Jam Results](https://itch.io/jam/littlejs-game-jam/results) - Check out all the games from the first LittleJS Game Jam!

![LittleJS Logo](examples/favicon.png)

[npm]: https://img.shields.io/npm/v/littlejsengine
[npm-url]: https://www.npmjs.com/package/littlejsengine
[build-size]: https://img.shields.io/bundlephobia/minzip/littlejsengine
[build-size-url]: https://bundlephobia.com/result?p=littlejsengine
[npm-downloads]: https://img.shields.io/npm/dw/littlejsengine
[npmtrends-url]: https://www.npmtrends.com/littlejsengine
[deepscan]: https://deepscan.io/api/teams/22950/projects/26229/branches/831487/badge/grade.svg
[deepscan-url]: https://deepscan.io/dashboard#view=project&tid=22950&pid=26229&bid=831487
[discord]: https://img.shields.io/discord/939926111469568050
[discord-url]: https://discord.gg/zb7hcGkyZe
