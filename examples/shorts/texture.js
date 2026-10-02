function gameRender()
{
    // show the full texture
    let pos = vec2();         // world position to draw
    let size = vec2(15);      // world size to draw it at
    let color = hsl(0,0,1);   // color to multiply the tile by
    let tilePos  = vec2();    // top left corner in pixels
    let tileSize = vec2(288); // source size in pixels
    let tileInfo = new TileInfo(tilePos, tileSize); // tile info

    // draw background
    drawRect(pos, size, GRAY);

    // draw the tile
    drawTile(pos, size, tileInfo, color);
}

/* info
One draw call shows the whole tile sheet on a gray square. Each argument
of the draw has a variable of its own, so each can be changed to see
what it does. There is nothing to press.

## How it works
A texture is an image the engine has loaded. The example browser loads
one for the shorts, `tiles.png`, which is 288 pixels on each side. A
`TileInfo` says which part of a texture to draw.

- `new TileInfo(pos, size)` takes the top left corner of the part and
  its size, both in pixels of the image. Here the corner is `vec2()`,
  the image's own top left corner, and the size is the whole image.
  With no texture given it uses the first one loaded.
- `drawTile(pos, size, tileInfo, color)` draws that part centered on
  `pos` and stretched to `size`. These two are in world units, not
  pixels, so the image is 15 units wide however many pixels it has.
- `color` multiplies every pixel of the tile. `hsl(0,0,1)` is white,
  which leaves the image as it is.
- `drawRect(pos, size, color)` draws a plain rectangle. It has the same
  position and size and is drawn first, so the texture is drawn over it
  and the gray shows wherever the image is see-through.

The variables are made again every frame, since `gameRender` is called
once a frame. That costs little, and it is why a value like `time` can
go straight into one of them.

## Try it
- Set `tilePos` to `vec2(131,131)` and `tileSize` to `vec2(128)`: the
  part drawn is now the big train logo alone.
- Change `color` to `hsl(.6,1,.5)`: white pixels turn blue and black
  ones stay black, because the color is multiplied in.
- Change `size` to `vec2(15,8)`: the image and the gray rectangle are
  both squashed, since they share the variable.

## See also
Sprite Atlas cuts the same sheet into tiles with `tile`, Texture
Wrapped repeats it, and Texture Sheet loads more images.
*/
