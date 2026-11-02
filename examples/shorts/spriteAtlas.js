let spriteAtlas;

function gameInit()
{
    // create a table of all sprites
    const gameTile = (i, size=16)=>  tile(i, size);
    spriteAtlas =
    {
        circle:    gameTile(0),
        crate:     gameTile(1),
        icon:      gameTile(2),
        circleBig: gameTile(2, 128),
        iconBig:   gameTile(3, 128),
    };
    canvasClearColor = GRAY;
}

function gameRender()
{
    // draw a sprite from the atlas
    let pos = vec2(sin(time)*5,-3);// world position
    let angle = 0;                 // world space angle
    let size = vec2(9);            // world space size
    let mirror = 0;                // should tile be mirrored?
    let color = hsl(0,0,1);        // color to multiply by
    let additive = hsl(0,0,0,0);   // color to add to
    drawTile(pos, size, spriteAtlas.iconBig, color, angle, mirror, additive);

    // draw more sprites from the atlas
    drawTile(vec2(-7,4), vec2(5), spriteAtlas.crate);
    drawTile(vec2( 0,4), vec2(5), spriteAtlas.circle);
    drawTile(vec2( 7,4), vec2(5), spriteAtlas.circleBig);
}

/* info
A table of named tiles, made once, and four sprites drawn from it: three
in a row and one below that slides from side to side. There is nothing
to press.

## How it works
A sprite atlas here is a plain object that maps a name to a `TileInfo`,
the part of the tile sheet to draw. The rest of the code then says
`spriteAtlas.crate` and never a tile number, so a sprite that moves in
the sheet is changed in one place.

### gameInit
`tile(index, size)` makes the `TileInfo` for one cell of the sheet cut
into a grid. `index` counts cells from 0 at the top left, along each
row, and `size` is a cell's size in pixels, 16 when left out. The same
sheet is read with two grids here: at 16 pixels, cells 0, 1 and 2 are
the small sprites, and at 128 pixels, cells 2 and 3 are the big ones.

`gameTile` only passes its arguments on. It is where a game would put
its own default size or texture.

The table is made in `gameInit` and not at the top of the file because
`tile` works out a cell's place from the texture's size, so the texture
must be loaded first. `canvasClearColor` is the color the canvas is
cleared to before each frame is drawn.

### gameRender
The first `drawTile` has every argument as a variable, in the order
`drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor)`:

- `pos` and `size` are in world units. `sin(time)*5` moves the sprite
  between x `-5` and `5`.
- `color` multiplies the tile's pixels, and white changes nothing.
- `angle` is in radians.
- `mirror` flips the tile left to right.
- `additive` is added to each pixel after the multiply. Here it is
  black with no alpha, which adds nothing.

The other three draws pass only a position, a size and a tile, and the
rest take their defaults.

## Try it
- Set `mirror` to `1` to flip the sliding sprite.
- Set `angle` to `time` to spin it.
- Change `additive` to `hsl(0,1,.5,0)`: red is added to every pixel.
- Change `spriteAtlas.iconBig` to `spriteAtlas.icon`: the 16 pixel
  sprite, stretched to the same 9 units.

## See also
Texture draws the whole sheet, Animation steps through tiles over time,
and Texture Atlas loads a table like this one from a file. Look up
`tile` and `TileInfo`.
*/
