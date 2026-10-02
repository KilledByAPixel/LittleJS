let box2DTileLayer;

async function gameInit()
{
    // setup box2d
    await box2dInit();
    cameraPos = vec2(16); // setup camera
    gravity.y = -30; // enable gravity
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
    box2DTileLayer = new Box2dTileLayer(tileLayer);
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // clear tile that was clicked
        box2DTileLayer.tileLayer.clearData(mousePos, true);
        box2DTileLayer.tileLayer.clearCollisionData(mousePos);
        box2DTileLayer.buildCollision();

        // spawn box2d object at mouse position
        const o = new Box2dObject(mousePos, vec2(), 0, 0, randColor());
        const friction = .2, restitution = .5;
        o.addCircle(rand(.5,1), vec2(), 1, friction, restitution);
    }
}

/* info
The level of the Tile Layer example with Box2D physics in it: a 32 by
32 grid of random tiles. Click to drop a ball at the mouse, and if the
click is on a tile, the tile is removed first. The balls roll and
bounce through the tiles.

## How it works
### The tile layer
After `await box2dInit()` has loaded Box2D, `gameInit` builds a
`TileCollisionLayer` the usual way. Its corner is at `vec2()` and each
cell is one world unit, so the camera at `vec2(16)` looks at its
middle. `randBool(.7)` is true 7 times in 10, and those cells are
skipped. Every other cell gets a `TileLayerData`, which is a tile
index, a direction in quarter turns, a mirror flag and a color, and is
marked solid with `setCollisionData(pos)`. `redraw()` draws the tiles
into the layer's image.

`gravity.y = -30` is in Box2D's units, per second squared, not the
engine's per frame.

### Box2dTileLayer
Box2D knows nothing of tile layers. `new Box2dTileLayer(tileLayer)`
makes a static Box2D body for the layer and gives it box shapes that
cover the solid cells. It does not make a box for each cell: a run of
solid cells along a row becomes one wide box, and the box grows upward
while the rows above are solid across the same width. Fewer, bigger
boxes are less work for Box2D.

The shapes are built from the collision data, not from what is drawn.
A cell is solid when its collision data is above 0.

### Clicking
On a click three things happen to the cell under the mouse:

- `clearData(mousePos, true)` empties the cell's tile, and `true`
  redraws that cell.
- `clearCollisionData(mousePos)` marks it not solid.
- `buildCollision()` throws away the body's shapes and makes them again
  from the collision data. The shapes are a copy, so this has to be
  called whenever solid cells change.

`mousePos` is in world units. It works as a cell position here because
the layer is at the origin with cells of one unit.

Then a ball is made: a `Box2dObject` with no tile, so it is drawn from
its shape in the random color, and
`addCircle(diameter, offset, density, friction, restitution)` with a
diameter from `.5` to 1. A restitution of `.5` keeps half the speed in
a bounce.

## Try it
- A sparser level: `randBool(.7)` to `randBool(.9)`.
- Bouncier balls: `restitution = .5` to `restitution = .9`.
- Boxes in place of balls. Change the `addCircle` line to
  `o.addBox(vec2(rand(.5,1)), vec2(), 0, 1, friction, restitution);`.
  `addBox` takes a size, an offset and an angle before the density.
- Put `//` before `box2DTileLayer.buildCollision();`. A clicked tile
  disappears and the balls still bounce off where it was.

## See also
Tile Layer explains the layer and its data. Box2D Demo covers bodies
and shapes, and Platformer Game walks on a tile layer with the engine's
own physics.
*/
