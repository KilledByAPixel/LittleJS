function gameRender()
{
    // draw background gradient
    drawRectGradient(cameraPos, getCameraSize(), BLACK, WHITE);

    // draw text
    drawText('LittleJS Engine', vec2(0,3), 3);
        
    // draw a tile
    drawTile(vec2(sin(time)*3,-2), vec2(7), tile(3,128));
}

/* info
The smallest LittleJS program that shows something: a gradient
background, a line of text and a tile that slides from side to side.
There is nothing to press, it only draws.

## How it works
The example browser starts the engine for you and calls the functions
you define. `gameRender` is called once a frame, before the engine draws
its objects, so everything here is drawn again every frame.

Positions and sizes are in world units, not pixels. The camera starts
at `vec2(0,0)` and y goes up, so the text at `vec2(0,3)` is above the
middle of the view and the tile at y `-2` is below it.

- `drawRectGradient(pos, size, colorTop, colorBottom)` fills a rectangle
  that fades from one color to the other. Centered on `cameraPos` and
  as big as `getCameraSize()`, it covers the whole view.
- `drawText(text, pos, size)` draws text centered on a position, its
  size in world units.
- `drawTile(pos, size, tileInfo)` draws a piece of the tile sheet, the
  image the examples share. `tile(3,128)` is tile number 3 of the sheet
  cut into 128 pixel tiles, counted from 0 at the top left.

`time` is the seconds since the engine started, so `sin(time)*3` swings
between -3 and 3 and the tile moves with it.

## Try it
- Change the text, or its size from `3` to `5`.
- Swap `BLACK` and `WHITE`, or use a color of your own like
  `hsl(.6,1,.5)`.
- Make the tile bigger: change `vec2(7)` to `vec2(12)`.
- Add `, WHITE, time` after the tile in the `drawTile` call to spin it:
  the arguments after the tile are its color and its angle.

## See also
Shapes, Colors and Texture, further down the list.
*/
