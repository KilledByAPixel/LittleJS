function gameInit()
{
    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(28,16), 0);
    cameraPos = tileLayer.size.scale(.5); // setup camera
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // create random solid tiles away from level center
        if (rand() < .7 || cameraPos.distanceSquared(pos) < 9)
            continue;
        
        // set tile data
        const data = new TileLayerData(1);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw();
}

function gameRenderPost()
{
    // cast ray from camera center to mouse
    drawLine(cameraPos, mousePos, .1, CYAN);
    const normal = vec2();
    const hit = tileCollisionRaycast(cameraPos, mousePos, 0, normal);
    if (hit)
    {
        // draw hit tile
        const tilePos = hit.floor().add(vec2(.5));
        drawRect(tilePos, vec2(1), RED);

        // draw hit point and normal
        drawRect(hit, vec2(.2), GREEN);
        drawLine(cameraPos, hit, .1, RED);
        drawLine(hit, hit.add(normal), .1, YELLOW);
    }
}

/* info
A ray cast through a level of random tiles, from the middle of the view
to the mouse. Move the mouse: the first solid tile on the way turns red,
with a green dot where the ray enters it and a yellow line pointing out
of the side it hit.

## How it works
### The level
`gameInit` makes a `TileCollisionLayer` of 28 by 16 cells. Its position
is its bottom left corner and a cell is one world unit, so the camera is
put at half its size to look at the middle. The third argument is the
layer's tile, and the `0` there means none: with no tile a cell
draws as a plain square in its color, which is white here.

The two loops visit every cell. A cell is left empty 7 times in 10, and
always when it is within 3 units of the camera, since
`distanceSquared` is compared with 9, which is 3 squared. That keeps the
ray's start clear. Every other cell gets something to draw with
`setData` and is marked solid with `setCollisionData`. A ray only sees
the collision data. `redraw()` draws the tiles into the layer's image.

### The ray
`gameRenderPost` runs after the layer is drawn, so what it draws is on
top. `tileCollisionRaycast(posStart, posEnd, callbackObject, normal)`
walks the grid from the start toward the end one cell at a time and
stops at the first solid one.

- It returns where the ray meets that tile, or `undefined` when nothing
  is in the way. That is why the result is tested with `if (hit)`.
- The `0` is in place of a callback that can decide which tiles count.
- `normal` is a vector the function fills in: the direction the side
  that was hit faces, one unit long. It is one of left, right, up or
  down.

The point returned is nudged just inside the tile. So `hit.floor()`,
which rounds x and y down, is that tile's corner, and adding
`vec2(.5)` gives its center for the red square.

The ray ends at the mouse, so a tile beyond the mouse is not hit. The
cyan line is the whole ray and the red line is the part up to the hit.

## Try it
- Change `rand() < .7` to `rand() < .9` for fewer tiles.
- Change the `9` in `distanceSquared(pos) < 9` to `36` for a clearing
  with a radius of 6 units.
- Make the normal easier to see: `hit.add(normal.scale(3))`.
- Cast past the mouse. Replace `mousePos` in the raycast call with
  `cameraPos.add(mousePos.subtract(cameraPos).normalize(30))`, a point
  30 units from the camera in the mouse's direction. The red line then
  goes on beyond the mouse to the first tile.

## See also
Tile Layer makes the same kind of level. Object Raycast casts a ray at
engine objects in place of tiles, and Path Finder finds a way around
the tiles of a layer.
*/
