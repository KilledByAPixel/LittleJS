# ![LittleJS Logo](favicon.ico) LittleJS - The Tiny JavaScript Game Engine That Can

## All aboard!

LittleJS is lightweight 2D JavaScript game engine with a super fast WebGL rendering system. The goal of this project is to be small, simple, and easy to use for a variety of applications from size coding game jams to commercial releases. This engine has everything necessary for most games including super fast rendering, physics, particles, sound effects, music, keyboard/mouse/gamepad input handling, update/render loop, and debug tools. 🚂

![LittleJS Screenshot](examples/screenshot.jpg)

## Features

- Very small footprint with no dependencies
- Super fast tile sheet rendering system can easily draw 10,000+ sprites at 60fps, several times more on a powerful machine
- Object oriented system with base class engine object
- 2D physics and collision handling for axis aligned boxes
- Engine helper functions and classes like Vector2, Color, and Timer
- Sound effects with [zzfx](https://killedbyapixel.github.io/ZzFX/) and music with [zzfxm](https://keithclark.github.io/ZzFXM/), mp3s, or wavs
- Input processing system with keyboard, mouse, gamepad, and touch support
- Tile layer cached rendering and collision system for level data
- Particle effects system (particle editor/designer in progress)
- Several easy to understand example projects you can build on
- Debug tools and debug rendering system
- All example projects are compatible with mobile devices
- Build system automatically combines everything, minifies, and removes unused code
- For size coding competitions like [js13kGames](https://js13kgames.com/), starter project builds to a 6k zip
- You can build as a native Windows App with [electron](https://www.electronjs.org/) for distribution on platforms like Steam
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used to make commercial games

## [LittleJS Trailer](https://youtu.be/chuBzGjv7Ms)

## [LittleJS Trello Roadmap](https://trello.com/b/E9zf1Xak/littlejs)

## Example Starter Projects

### [Hello World](https://killedbyapixel.github.io/LittleJS/) - Clean project with only a few things to get you started
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle) - Match 3 puzzle game with HD rendering and high score tracking
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer) - Platformer/shooter with procedural generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout) - Breakout style game using pixelized 720p rendering
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress) - Max sprite/object test and music system demo

## How to use LittleJS

It is recommended that you start by copying the [LittleJS Starter Project](https://github.com/KilledByAPixel/LittleJS/blob/main/game.js) It is mostly empty with just a few things you can use to get started or remove. You can also download and include [engine.all.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.js) or [engine.all.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.min.js).

To startup LittleJS, you must create 5 functions and call engineInit. A canvas will automatically be created and added to the document. You can use this template to get started.

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

For most games you will want to extend EngineObject with your own objects. This will create an object class called GameObject and the constructor automatically adds it to the list of objects. Engine objects are automatically updated and rendered until they are destroyed.

You can override these functions to make objects behave however you want. See the examples for a complete demonstration.

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

All engine settings are listed in [engineConfig.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engineConfig.js). Here are the most important settings...

- fixedWidth and fixedHeight - use a fixed canvas resolution, if not set uses native screen resolution
- pixelated - disable blending in several places for pixel art style games
- glOverlay - fix slow rendering in some browsers by not compositing the WebGL canvas
- glEnable - run without WebGL but textured coloring is disabled and it is much slower
- audioVolume - adjust volume of sounds and music

## Games Made With LittleJS

- [Space Huggers](https://github.com/KilledByAPixel/SpaceHuggers) - A more developed version of the platformer example
- Send me your games!

![LittleJS Logo](favicon.ico)
