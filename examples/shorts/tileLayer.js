function gameInit()
{
    cameraPos = vec2(16); // setup camera
    gravity.y = -.01; // enable gravity
    canvasClearColor = hsl(0,0,.2); // background color

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(32));
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (randBool(.7))
            continue;
        
        // set tile data
        const tileIndex = 11;
        const direction = randInt(4);
        const mirror = randBool();
        const color = randColor(WHITE, hsl(0,0,.2));
        const data = new TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw(); // redraw tile layer with new data
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // a burst of sparks in a random color that bounces off the tiles;
        // the options replace the effect's own settings for this burst
        particleEffect('sparks', mousePos, {scale: 2, hue: rand(),
            emitTime: .1, emitRate: 500, particleTime: 2, gravity: -.01,
            collideLevel: true, restitution: .5});
    }
}

/* info
A level made of tiles: a 32 by 32 grid where about three cells in ten
have a solid tile, each turned, mirrored and tinted at random. Click to
throw a burst of sparks that bounce off the tiles.

## How it works
A `TileCollisionLayer` is a grid of tiles drawn as one image, with a
second grid that says which cells are solid. Its position is its bottom
left corner and each cell is one world unit, so with the layer at
`vec2()` and 32 cells a side, the camera at `vec2(16)` looks at its
middle.

The two loops visit every cell, counting `pos.x` and `pos.y` down from
31 to 0. `randBool(.7)` is true 7 times in 10, and those cells are
skipped and stay empty. A cell that gets a tile takes three calls:

- `new TileLayerData(tile, direction, mirror, color)` says what to draw
  there: the tile's number in the tile sheet, a direction from 0 to 3 in
  quarter turns, whether it is mirrored, and a color to tint it with.
- `tileLayer.setData(pos, data)` puts it in the cell.
- `tileLayer.setCollisionData(pos)` marks the cell solid. Drawing and
  collision are separate, so a tile can be drawn and not solid, or solid
  and not drawn.

`tileLayer.redraw()` then draws every tile into the layer's image. The
tiles do not show until it is called, and it is only needed again when
tiles change.

### The sparks
`mouseWasPressed(0)` is true on the frame the left button goes down, and
`mousePos` is the mouse in world units. The options turn the sparks
effect into a burst that lasts a tenth of a second (`emitTime: .1`) and
whose particles live for 2 seconds. `collideLevel: true` has each
particle collide with the solid cells, keeping half its speed at a
bounce (`restitution: .5`), and `gravity` is the particles' own fall
each frame.

`gravity.y` at the top is the world's gravity, for engine objects with
a mass. There are none here yet, see Try it.

## Try it
- Change `randBool(.7)` to `randBool(.9)` for a sparser level.
- Set `tileIndex` to another tile of the sheet, from 0 to 13.
- Take out the `setCollisionData` line: the sparks fall through.
- Add a box that falls and lands on the tiles, at the end of the click:
  `new EngineObject(mousePos).setCollision();`

## See also
Tile Raycast and Maze Generator use the same layer, Platformer Game
walks on one, and Level Editor paints one. Particles shows the effects.
*/
