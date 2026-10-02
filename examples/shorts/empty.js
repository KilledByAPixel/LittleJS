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
    drawText('LittleJS Engine', vec2(0,6), 3);
}

/* info
A template to start from: the five functions the engine calls, each empty
but for a comment, and one line of text so there is something to see.

## How it works
The example browser starts the engine and hands it these five functions.
In a project of your own you pass them to `engineInit` yourself.

- `gameInit` runs once, after the engine has started and the tile sheet
  has loaded. Make the level and the objects here.
- `gameUpdate` runs 60 times a second, before the engine updates its
  objects and their physics. Read the input and move things here.
- `gameUpdatePost` runs after the objects have updated, which is the
  place to move the camera to something that moved this frame.
- `gameRender` runs once a frame before the objects are drawn, so what it
  draws is behind them.
- `gameRenderPost` runs after the objects are drawn, so what it draws is
  in front of them. The text is drawn here.

A function you do not need can be left out of a short.

## Try it
- Change the text, or its size from `3` to `5`.
- Add an object to `gameInit`, the train from the tile sheet:
  `new EngineObject(vec2(), vec2(4), tile(3,128));`
- Then add `drawRect(vec2(), vec2(6), RED);` to `gameRender`. The red
  square is behind the train. Move that line to `gameRenderPost` and it
  covers the train.

## See also
Hello World draws a little more, and Starter in the full examples is the
same template as a project with its own page.
*/
