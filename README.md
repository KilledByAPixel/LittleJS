# ![LittleJS Logo](favicon.ico) LittleJS - The Tiny JavaScript Game Engine That Can!

## Hello!

LittleJS is lightweight 2D JavaScript game engine with a WebGL rendering system. The goal of this project is to be both very small and easy to use for a variety of applications from game jams prototypes to commercial releases. This engine includes everything necessary to make most games including a super fast rendering system, physics, particles, sound effects, music, keyboard/mouse/gamepad input handling, update/render loop, and debug tools. 🚂

## Features

- Very small footprint with no dependencies
- Super fast tile sheet rendering system, ~50,000 sprites at 60fps
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
- Open Source with the [MIT license](https://github.com/KilledByAPixel/LittleJS/blob/main/LICENSE) so it can be used to make commercial games

## [LittleJS Trello Roadmap](https://trello.com/b/E9zf1Xak/littlejs)

## Example Starter Projects

### [Hello World](https://killedbyapixel.github.io/LittleJS/) - Clean starter project
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle) - Match 3 style puzzle game with HD rendering
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer) - Platformer with procedural level generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout) - Breakout style game using pixelized 720p rendering
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress) - Max sprite/object test and music system demo

Also check out [Space Huggers](https://github.com/KilledByAPixel/SpaceHuggers), the best demonstration of this game engine features.

![LittleJS Screenshot](screenshot.jpg)

## How to use LittleJS

It is recommended that you start by copying the [LittleJS Starter Project](https://github.com/KilledByAPixel/LittleJS/blob/main/game.js) It is mostly empty with just a few things you can use to get started or remove. You can also download and include [engine.all.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.js) or [engine.all.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.min.js).

To startup LittleJS call engineInit like this...

```javascript
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');
```

This will init the engine when tiles.png loads. Then call your gameInit function and other functions during the update/render loop.

For most games you will want to extend EngineObject with your own objects, something like this...

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
        super.update();
        
        // your object update code here
    }

    render()
    {
        super.render();
        
        // your object render code here
    }
}
```

This will create your own object class called GameObject and the constructor will add it to the list of objects. Engine objects are automatically updated and rendered until they are destroyed. You can override those functions to make the object behave however you want. You can also draw sprites without using objects. See the examples for a complete demonstration.

## Engine Configuration

All engine settings are listed in [engineConfig.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engineConfig.js). Here are the most important settings...

- fixedWidth and fixedHeight - use a fixed canvas resolution, if not set uses native screen resolution
- pixelated - disable blending in several places for pixel art style games
- glOverlay - fix slow rendering in some browsers by not compositing the WebGL canvas
- glEnable - run without WebGL but textured coloring is disabled and it is much slower
