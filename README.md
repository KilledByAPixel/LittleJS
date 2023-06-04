# ![LittleJS Logo](favicon.png) LittleJS - The Tiny JavaScript Game Engine That Can

## All aboard!

LittleJS is a super lightweight JavaScript game engine with a fast hybrid rendering system. It provides a comprehensive set of tools including rendering, physics, particles, sound effects, music, input handling, and debug tools. The code is very clean and well documented with a variety of examples to get you started. Choo-Choo! 🚂
<div align="center">
  
## [Documentation](https://killedbyapixel.github.io/LittleJS/docs) | [Trailer](https://youtu.be/chuBzGjv7Ms) | [Discord](https://discord.gg/zb7hcGkyZe)
</div>

![LittleJS Screenshot](examples/screenshot.jpg)

## Examples

### [Hello World](https://killedbyapixel.github.io/LittleJS/) - Clean project with only a few things to get you started
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle) - Match 3 puzzle game with HD rendering and high score tracking
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer) - Platformer/shooter with procedural generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout) - Breakout game with post processing effect
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress) - Max sprite/object test and music system demo
### [Particle System Designer](https://killedbyapixel.github.io/LittleJS/examples/particles) - Particle system editor and visualizer

## Features

- Very small footprint with no dependencies
- Can update and render 10,000+ objects at 60fps, often many times more
- Object oriented system with fast 2D physics and collision handling for axis aligned boxes
- Positional audio effects with [ZzFX](https://killedbyapixel.github.io/ZzFX/) and music with [ZzFXM](https://keithclark.github.io/ZzFXM/), mp3s, or wavs
- Input processing system with keyboard, mouse, gamepad, and touch support
- Particle effects system (particle editor/designer in progress)
- Medal system tracks and displays achievements with Newgrounds and OS13k integration
- Several easy to understand example projects you can build on
- Apply [Shadertoy](https://www.shadertoy.com) compatible shaders for post processinge effects
- Debug tools and debug rendering system
- [Full documentation](https://killedbyapixel.github.io/LittleJS/docs) automatically generated from the source code block tags with [JSDoc](https://github.com/jsdoc/jsdoc)
- Build system automatically combines everything, minifies, and removes unused code
- For size coding competitions like [js13kGames](https://js13kgames.com/), starter project builds to a 7KB zip file
- Easily build a Windows executable with [Electron](https://www.electronjs.org/) for distribution on platforms like Steam
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used for anything you want

## Builds

To easily include LittleJS in your game, you can use one of the 3 pre-built js files. These are also built automatically by the build scripts.

- [engine.all.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.js) - The full game engine with debug mode available
- [engine.all.release.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.release.js) - The engine optimized for release builds
- [engine.all.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.min.js) - The engine in release mode and minified

The hello world example includes a batch file [build.bat](https://github.com/KilledByAPixel/LittleJS/blob/main/build.bat) that compresses everything into a tiny zip file using Google Closure, UglifyJS, Roadroller, and ECT. You must run [buildSetup.bat](https://github.com/KilledByAPixel/LittleJS/blob/main/buildSetup.bat) to install the necessary npm dependencies.

## Debugging

Debug builds of LittleJS have a special menu that can be opened by pressing ~, the tilde key.

- ~: Debug Overlay
- 1: Debug Physics
- 2: Debug Particles
- 3: Debug Gamepads
- 4: God Mode
- 5: Save Screenshot

## Games Made With LittleJS

- [Space Huggers](https://www.newgrounds.com/portal/view/819609) - Run and gun platformer with procedural levels
- [Undergrowth](https://undergrowth.squidband.uk/) - An interactive music videogame for the band Squid
- [Space Huggers - JS13K Edition](https://github.com/KilledByAPixel/SpaceHuggers) - Original js13k game with source code
- [Isletopia](https://store.steampowered.com/app/1861260/Isletopia) - Relaxing strategy game of greenifying barren islands
- [Dead Again](https://js13kgames.com/entries/dead-again) - Top down survial horror by [sanojian & repsej](https://github.com/sanojian/js13k_2022)
- [Hel's Trial](https://js13kgames.com/entries/hels-trial) - Turn based RPG by [Sebastian Dorn](https://github.com/sebadorn/js13k-2022-death)
- [Bit Butcher](https://js13kgames.com/entries/bit-butcher) - Survival crafting game by [Deathray Games](https://github.com/deathraygames/bit-butcher)
- [Necrotic Commander](https://js13kgames.com/entries/necrotic-commander) - Tower defense game by [Daniel Jeffery](https://github.com/d-jeffery/NecroticCommander)
- [Boxing up Bamboo](https://patrickgh3.itch.io/boxing-up-bamboo) - A challenging puzzle game by [Patrick Traynor](https://cwpat.me/about)
- Send me your games!

![LittleJS Logo](favicon.png)
