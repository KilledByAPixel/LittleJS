let spriteTile, animTile;

async function gameInit()
{
    // use a small sheet size so this demo spills onto a second sheet
    setTextureSheetSize(512);

    // load the whole image as a single sprite
    spriteTile = loadSprite('tiles.png');

    // load the same image again split into 16x16 frames
    // each has a 1 pixel border in the image, the last argument skips it
    // this is a 16x16 grid, frames wrap down to the next row automatically
    animTile = loadSprite('tiles.png', vec2(16), undefined, 1);

    // wait for both images to finish packing
    await spritesReady();
}

function gameRender()
{
    // show every sheet, the second image did not fit so it made a new sheet
    for (let i = 0; i < textureSheets.length; ++i)
    {
        const sheet = textureSheets[i];
        const pos = vec2(-9 + i*8, 2);
        const size = vec2(sheet.size);
        const sheetTile = new TileInfo(vec2(), size, sheet.textureInfo);
        drawTile(pos, vec2(7), sheetTile);
        drawText('sheet ' + i, pos.add(vec2(0, 4.5)), 1);
    }

    // draw the sprite that was packed
    drawTile(vec2(6, 4), vec2(5), spriteTile);

    // animate by stepping through the first row of packed frames
    drawTile(vec2(6, -3), vec2(5), animTile.frame(time*8%16|0));
}

/* info
`loadSprite` packs images into a texture sheet as they load. It returns
a tile info right away, which is filled in when the image is ready.
This example loads the shorts' tile image twice, as one sprite and as a
grid of frames, and draws the sheets they were packed into beside the
results. There is nothing to press.

## How it works
A texture sheet is one large texture that the plugin makes and copies
each loaded image into, so a game's sprites can come from many image
files and still draw from one texture. Images are placed from left to
right in rows. When no sheet has room for an image, a new sheet is made.

### gameInit
- `setTextureSheetSize(512)` sets the width and height in pixels of the
  sheets made from now on. The default is 2048. It is small here so the
  two loads do not fit on one sheet.
- `loadSprite('tiles.png')` loads the whole image as one sprite. The
  `TileInfo` it returns is empty until the image is packed and is then
  filled in, the same object, so the variable can be kept and used.
- `loadSprite('tiles.png', vec2(16), undefined, 1)` has the arguments
  `src`, `frameSize`, `padding` and `sourcePadding`. A frame size cuts
  the image into frames of 16 pixels. `undefined` keeps the default
  padding, 1 pixel around each frame in the sheet. The last `1` says
  each frame has a 1 pixel border in the image itself, which is left
  out. The image is 288 pixels wide, so it has `288/18`, 16 frames a
  row.
- `await spritesReady()` waits until everything `loadSprite` started is
  packed. `gameInit` is `async` so it can wait, and the engine waits
  for it before the first update.

With its padding the first image takes 290 pixels each way, and the
frames take 288. Neither `290 + 288` across nor down fits in 512, so
the frames go to a second sheet.

### gameRender
`textureSheets` is the list of sheets. For each one the loop makes a
`TileInfo` that covers all of it, from `vec2()` to the sheet's `size`,
on the sheet's own `textureInfo`, and draws it 7 units wide with a
label above.

The two draws on the right use what `loadSprite` returned like any
other tile. `animTile.frame(n)` is frame `n` of the grid, and
`time*8%16|0` counts 0 to 15 at 8 frames a second, the first row. The
tile knows its grid has 16 columns, so a frame past 15 is found in the
next row.

## Try it
- Change `setTextureSheetSize(512)` to `setTextureSheetSize(1024)`:
  both loads fit on one sheet, and only `sheet 0` is drawn.
- Change `time*8%16` to `time*8%32`: the animation runs on into the
  second row, which has parts of bigger tiles and then empty frames.
- Take out the `await spritesReady();` line. It still runs, because a
  tile that is not filled in yet draws nothing.

## See also
Texture Atlas loads an image whose frames are listed in a file, and
Animation plays frames with `SpriteAnimation`. Look up `loadSprite`,
`spritesReady` and `TextureSheet`.
*/
