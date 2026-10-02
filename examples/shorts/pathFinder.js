let tileLayer, pathFinder, playerPos, path = [];

function gameInit()
{
    // make sparse obstacle field collision for demo
    const gridSize = vec2(30, 20);
    tileLayer = new TileCollisionLayer(vec2(), gridSize);

    // scatter solid tiles with small central clearing
    const center = gridSize.scale(.5);
    const wallColor = hsl(.6, .6, .5);
    for (let x = 0; x < gridSize.x; ++x)
    for (let y = 0; y < gridSize.y; ++y)
    {
        const pos = vec2(x, y);
        if (pos.distance(center) < 2 || rand() < .8)
            continue; // keep center clear
        
        const data = new TileLayerData(1, 0, false, wallColor);
        tileLayer.setCollisionData(pos, 1);
        tileLayer.setData(pos, data);
    }
    tileLayer.redraw(); 

    // create pathfinder with tile layer collision
    pathFinder = new PathFinder(tileLayer);
    //pathFinder.debug = true;

    // snap player to center tile and save pos
    const startNode = pathFinder.getNearestClearNode(center);
    playerPos = startNode.posWorld.copy();

    // setup game
    cameraPos = center;
    cameraScale = 25;
}

function gameUpdate()
{
    if (mouseIsDown(0))
        path = pathFinder.findPath(playerPos, mousePos);
}

function gameRender()
{
    // draw final path
    for (let i = 1; i < path.length; ++i)
    {
        drawCircle(path[i], .5, RED);
        drawLine(path[i - 1], path[i], .15, RED);
    }

    // draw player
    drawCircle(playerPos, .4, GREEN);
}

/* info
Finds a way through a field of random blocks with the path finder
plugin. Hold the left mouse button: a red path is drawn from the green
dot in the middle to the mouse, around the blocks, and follows the mouse
as it moves.

## How it works
### The level
`gameInit` makes a `TileCollisionLayer` of 30 by 20 cells with its
bottom left corner at `vec2()`. About one cell in five becomes a block,
except within 2 units of the center. A block is two calls:
`setCollisionData(pos, 1)` marks the cell solid and `setData` gives it a
tile to draw, tinted with `wallColor`. `redraw()` draws the layer.

### The path finder
`new PathFinder(tileLayer)` makes a path finder for that layer's grid. A
cell can be walked on when its collision data is not solid.

`getNearestClearNode(center)` returns the node of the open cell nearest
a point. A node is the path finder's record of one cell, and its
`posWorld` is the middle of that cell in world units, which is where the
player is put. `copy()` gives the player a vector of its own.

`cameraScale = 25` zooms out a little from the usual 32 pixels to a
world unit so the whole grid is in view.

### Finding a path
`pathFinder.findPath(start, end)` takes two points in world units and
returns the path as a list of points, the start first. When there is no
way through it returns an empty list. An end that is on a block is moved
to the nearest cell that can be walked on.

It searches with A*. The idea: spread out from the start one cell at a
time, always going on from the cell that looks best, where the measure
is the distance walked to reach it plus a guess of what is left to the
goal. Because of the guess the search leans toward the goal and does not
flood the whole grid. A step goes to any of the eight cells around,
a diagonal one costing a little more, and never diagonally past the
corner of a block.

That gives a path of cell to cell steps. The path finder then smooths
it, replacing runs of steps with one straight line wherever nothing is
in the way, which is why the path here has few points and crosses open
ground at any angle.

The search is run again every frame the button is held, which is fine
for a grid this small.

### Drawing
`gameRender` draws a line from each point of the path to the next and a
dot on each point after the first. The player is a green dot on top. The
`.5` and `.4` are diameters.

## Try it
- Change `mouseIsDown(0)` to `mouseWasPressed(0)` to search once per
  click.
- Take the `//` off `pathFinder.debug = true;`. The plugin then draws
  what it did for a second after each search: the blocks, the cells it
  looked at and the path. It is easiest to read with one search per
  click.
- Add `pathFinder.smoothPath = false;` under the line that makes the
  path finder, to see the path as cell to cell steps.
- Change `rand() < .8` to `rand() < .6` for twice as many blocks. A
  place that is closed off gets no path.

## See also
Maze Generator makes a level worth finding a path through, and Tile
Raycast asks whether a straight line is clear. Tile Layer explains the
layer and its tiles.
*/
