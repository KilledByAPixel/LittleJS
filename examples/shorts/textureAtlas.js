canvasClearColor = GRAY;
let atlas;

async function gameInit()
{
    // the json usually comes from a file, inline here to keep it self contained
    atlas = loadAtlas('tiles.png', {frames: {
        'spin_0.png': {frame: {x:1,   y:1,   w:16,  h:16}},
        'spin_1.png': {frame: {x:19,  y:1,   w:16,  h:16}},
        'spin_2.png': {frame: {x:37,  y:1,   w:16,  h:16}},
        'spin_3.png': {frame: {x:55,  y:1,   w:16,  h:16}},
        'circle.png': {frame: {x:1,   y:131, w:128, h:128}},
        'train.png':  {frame: {x:131, y:131, w:128, h:128}},
    }});

    // wait for the atlas to finish packing
    await spritesReady();
}

function gameRender()
{
    // frames are looked up by name
    drawTile(vec2(-6, 3), vec2(6), atlas.circle);
    drawTile(vec2(6, 3), vec2(6), atlas.train);

    // numbered frames like spin_0, spin_1 group into an animation automatically
    drawTile(vec2(0, -4), vec2(6), atlas.spin.frame(time*4%4|0));
}

/* info
`loadAtlas` imports pre-packed atlases like TexturePacker and Aseprite
exports: an image, and JSON that says where each frame is in it. Frames
are looked up by name and grouped into animations automatically. This
example draws two named frames and one animation. There is nothing to
press.

## How it works
### gameInit
`loadAtlas(imageSrc, jsonSrc)` takes the image's path and the JSON,
which is a file's path or data already parsed. A packing tool writes
that file. Here the data is written in the code, with the shorts' tile
image as the atlas.

Each entry of `frames` has a name and a `frame`: a rectangle in the
image in pixels, `x` and `y` its top left corner and `w` and `h` its
size. The four `spin` frames are the first four 16 pixel tiles of the
top row, 18 pixels apart since each tile has a pixel of padding on
every side. The other two are 128 pixel tiles lower down.

`loadAtlas` returns an object that is empty at first. When the image
has loaded, each frame is copied into a texture sheet, the same kind
`loadSprite` uses, and the object gets a `TileInfo` for it:

- A frame is named by its entry with the file extension taken off, so
  `'circle.png'` is `atlas.circle`.
- Names that end in numbers that follow each other, like `spin_0` to
  `spin_3`, become one entry, `atlas.spin`, when the frames are the
  same size. Its frames are reached with `atlas.spin.frame(n)`.

`await spritesReady()` waits for that. It matters here: until the atlas
is filled in, `atlas.spin` is undefined and `atlas.spin.frame` would
throw.

### gameRender
`drawTile` takes an atlas entry like any other tile. `time*4%4|0`
counts 0 to 3 at 4 frames a second, so the bottom sprite steps through
the four `spin` frames.

## Try it
- Add a fifth frame after `spin_3`, the next tile along the row,
  `'spin_4.png': {frame: {x:73,  y:1,   w:16,  h:16}},` and change
  `time*4%4` to `time*4%5`.
- Rename `'train.png'` to `'logo.png'` and draw `atlas.logo` in place
  of `atlas.train`: the names are whatever the JSON says.

## See also
Texture Sheet packs images that have no JSON with `loadSprite`, Sprite
Atlas makes a table of tiles by hand, and Animation plays frames with
`SpriteAnimation`. Look up `loadAtlas` and `parseAtlas`.
*/
