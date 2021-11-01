# ![LittleJS Logo](favicon.png) LittleJS - The Tiny JavaScript Game Engine That Can

## All aboard!

LittleJS is a super lightweight 2D JavaScript game engine with fast WebGL rendering. It was designed to be small, simple, and easy to use for various applications, from game jams to commercial releases. This engine has everything necessary to make high-quality games, including fast rendering, physics, particles, sound effects, music, keyboard/mouse/gamepad input handling, update/render loop, and debug tools. 🚂

![LittleJS Screenshot](examples/screenshot.jpg)

## Features

- Very small footprint with no dependencies
- Can render 10,000+ objects at 60fps, often several times more
- Object oriented system with base class engine object
- 2D physics and collision handling for axis aligned boxes
- Positional audio effects with [zzfx](https://killedbyapixel.github.io/ZzFX/) and music with [zzfxm](https://keithclark.github.io/ZzFXM/), mp3s, or wavs
- Input processing system with keyboard, mouse, gamepad, and touch support
- Engine helper functions and classes like Vector2, Color, and Timer
- Tile layer cached rendering and collision system for level data
- Particle effects system (particle editor/designer in progress)
- Medal system tracks and displays achievements with Newgrounds and OS13k integration
- Several easy to understand example projects you can build on
- Debug tools and debug rendering system
- Example projects are compatible with mobile devices
- Build system automatically combines everything, minifies, and removes unused code
- For size coding competitions like [js13kGames](https://js13kgames.com/), starter project builds to a 7KB zip
- Easily build a Windows executable with [electron](https://www.electronjs.org/) for distribution on platforms like Steam
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used to make commercial games

## [LittleJS Trailer](https://youtu.be/chuBzGjv7Ms)

## [LittleJS Trello Roadmap](https://trello.com/b/E9zf1Xak/littlejs)

## Example Starter Projects

### [Hello World](https://killedbyapixel.github.io/LittleJS/) - Clean project with only a few things to get you started
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle) - Match 3 puzzle game with HD rendering and high score tracking
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer) - Platformer/shooter with procedural generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout) - Breakout game with mouse/touch or gamepad control
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress) - Max sprite/object test and music system demo

## How to use LittleJS

It is recommended that you start by copying the [LittleJS Starter Project](https://github.com/KilledByAPixel/LittleJS/blob/main/game.js) This file is mostly empty with just a few things you can use to get started or remove. You can also download and include [engine.all.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.js) or [engine.all.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.min.js).

In order to load files like images you will need to run a small web server like http-server on npm. I prefer to use an editor that does this for me automatically like [Brackets](https://brackets.io/) or VS Code with the [Live Server plugin](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).

To startup LittleJS, you must create 5 functions and pass them to engineInit. A canvas will automatically be created and added to the document. You can use this template to get started.

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

// startup LittleJS with your game functions after the tile image is loaded
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');
```

Though not required, LittleJS is intended to be used as an object oriented system by extending the base class EngineObject with your own. This lightweight class provides many useful features including physics, collision, parent/child system, and sorted rendering. Engine objects are automatically added to the global list of objects where they will be updated and rendered until destroyed. 

Here is a template you can use to make objects that behave however you want. See the examples for a complete demonstration.

```javascript
class MyObject extends EngineObject 
{
    constructor(pos, size, tileIndex, tileSize, angle, color)
    {
        super(pos, size, tileIndex, tileSize, angle, color);
        // your object init code here
    }

    update()
    {
        super.update(); // update object physics and position
        // your object update code here
    }

    render()
    {
        super.render(); // draw object as a sprite
        // your object render code here
    }
}
```

## Engine Configuration

All engine configuration is in [engineSettings.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engineSettings.js). Here are the most important settings...

- fixedWidth and fixedHeight - use a fixed canvas resolution if set (disabled by default)
- pixelated - disable anti-aliasing for pixel art style games (enabled by default)
- audioVolume - adjust volume of sound effects, music, and speech (.3 or less recommended)
- glOverlay - fix slow rendering in some browsers by making the WebGL canvas visible instead of compositing
- glEnable - run without WebGL, though it is slower to render sprites and textured coloring is disabled

## Games Made With LittleJS

- [Space Huggers](https://github.com/KilledByAPixel/SpaceHuggers) - A more developed version of the platformer example
- Send me your games!

![LittleJS Logo](favicon.png)
