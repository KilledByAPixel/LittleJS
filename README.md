# ![LittleJS Logo](favicon.ico) LittleJS - The Tiny JavaScript Game Engine That Can!

## What's the deal with LittleJS Engine?

LittleJS is lightweight JavaScript game engine with a WebGL rendering system. The goal of this project is to be both very small and easy to use for a variety of applications from game jams prototypes to commercial releases. This engine includes everything necessary to make most games including a super fast rendering system, physics, particles, sound effects, music, keyboard/mouse/gamepad input handling, update/render loop, and debug tools.

## Features

- Small footprint with no dependencies, starter project is under 6K zipped
- Super fast tile sheet rendering system, ~50,000 sprites at 60fps
- Open Source with MIT license so it can be used to make commercial games
- Object oriented system with base class engine object
- 2D physics and collision system for axis aligned boxes
- Engine helper classes and functions like Vector2, Color, and Timer
- Sound effects audio with zzfx and music with zzfxm, mp3s, or wavs
- Input processing system with gamepad and touchscreen support
- Tile layer cached rendering and collision system
- Particle effects system
- Debug tools and debug rendering system
- Several easy to understand example projects you can build on
- All example projects are compatible with mobile devices
- A build system for size coding competitions

## [LittleJS Trello Roadmap](https://trello.com/b/E9zf1Xak/littlejs)

This is a work in progress. Very close to being done, still worning on a few things before offical release, thanks!

## Example Starter Projects

### [Hello World](https://killedbyapixel.github.io/LittleJS/) - Clean starter project
### [Puzzle Game](https://killedbyapixel.github.io/LittleJS/examples/puzzle) - Match 3 style puzzle game with HD rendering
### [Platformer](https://killedbyapixel.github.io/LittleJS/examples/platformer) - Platformer with procedural level generation and destruction
### [Breakout](https://killedbyapixel.github.io/LittleJS/examples/breakout) - Breakout style game using fixed canvas pixelized rendering
### [Stress Test](https://killedbyapixel.github.io/LittleJS/examples/stress) - Max sprite/object test and music system demo

Also check out [Space Huggers](https://github.com/KilledByAPixel/SpaceHuggers), the best demonstration of this game engine features.

![LittleJS Screenshot](screenshot.jpg)

## How to use LittleJS

It is recommended that you start by copying the [LittleJS Starter Project](https://killedbyapixel.github.io/LittleJS/) It is mostly empty with just a few things you can use to get started or remove. You can also download and include [engine.all.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.js) or [engine.all.min.js](https://github.com/KilledByAPixel/LittleJS/blob/main/engine/engine.all.min.js) for release builds.

To startup LittleJS you will call something like...

```javascript
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');
```

This will init the engine when tiles.png loads. Then call your gameInit function and other functions during the update/render loop.

For most games you will want to extend EngineObject with your own objects, something like...

```javascript
class GameObject extends EngineObject 
{
    constructor(pos, size, tileIndex, tileSize, angle, color)
    {
        super(pos, size, tileIndex, tileSize, angle, color);
        
        // object init code here
    }

    update()
    {
        super.update();
        
        // object update code here
    }

    render()
    {
        super.render();
        
        // object render code here
    }
}
```

This will create your own object class called GameObject and add it to the list of objects. It will automatically be updated and rendered until it is destroyed. You can override those functions to make the object behave however you want.
