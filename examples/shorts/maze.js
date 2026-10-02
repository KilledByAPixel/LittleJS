function generateMaze(size)
{
    const maze = [], w = size.x, h = size.y;
    maze[1 + w] = 1; // start point
    for (let k=w*h*99; k--;)
    {
        // get a random position on odd coordinates
        const x = randInt(w/2)*2 + 1, y = randInt(h/2)*2 + 1;

        // get a random direction, and the position 2 cells that way
        const dx = randBool() ? randSign() : 0, dy = dx ? 0 : randSign();
        const x2 = x + dx*2, y2 = y + dy*2;

        // check if it is inside the outer wall
        if (x2 < 1 || y2 < 1 || x2 > w-2 || y2 > h-2)
            continue;

        // check if pos is open and the cell 2 away is closed
        const j = x + y*w, d = dx + dy*w;
        if (maze[j] && !maze[j+d*2])
            maze[j+d] = maze[j+d*2] = 1;
    }
    return maze;
}

function gameInit()
{
    // generate maze data
    const mazeSize = vec2(27,15);
    const maze = generateMaze(mazeSize);

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, mazeSize);
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (maze[pos.x + pos.y*mazeSize.x])
            continue;

        // set tile data
        tileLayer.setData(pos, new TileLayerData(1));
    }
    tileLayer.redraw(); // redraw tile layer with new data
    cameraPos = mazeSize.scale(.5); // center camera
    canvasClearColor = hsl(rand(),.3,.2); // random background color
}

/* info
A new maze each time it runs, 27 cells wide and 15 high, made by a short
function and shown with a tile layer. There is nothing to press: restart
the example for another maze.

## How it works
### The idea
The maze starts as solid wall with one open cell. Then, a great many
times, the function picks a random cell and a random direction. If the
cell is open, and the cell two steps that way is still wall, it opens
that one and the one between: a passage grows by one step. If not,
nothing happens and it tries again.

A passage only ever grows into wall, never into another passage. So the
open cells form a tree, with one route between any two of them and no
loops.

### generateMaze
`maze` is a plain array with one entry for each cell, the cell at x and
y being entry `x + y*w`. An entry of 1 is open and an empty entry is
wall. `maze[1 + w] = 1` opens the cell at x 1, y 1.

- The loop runs `w*h*99` times, here 40095. Most tries do nothing, so
  it takes many more tries than there are cells to reach every room.
- `x` and `y` are random odd numbers, since `randInt(n)*2 + 1` is odd.
  Rooms sit on odd cells, and the even cells between them are the walls
  that get knocked through.
- `dx` and `dy` are the direction: `randBool()` picks the axis and
  `randSign()`, which is 1 or -1, the way along it. `x2` and `y2` are
  the room two cells that way.
- The first `if` throws out a step that would leave the maze, which
  keeps a wall around the outside.
- The second `if` is the rule above. `j` is the cell's place in the
  array and `d` one step in it, 1 along a row and `w` to the next row,
  so `maze[j+d]` is the wall between and `maze[j+d*2]` the room beyond.

### gameInit
A `TileCollisionLayer` the size of the maze is made at `vec2()`, which
is its bottom left corner, with one world unit to a cell. The loops
visit every cell, skip the open ones, and give each wall cell tile 1 of
the tile sheet with `setData`. `redraw()` then draws the layer's image.

The camera is put at half the maze's size, its middle, and
`canvasClearColor`, the color behind everything, gets a random hue.

Only the look of the maze is set. No cell is marked solid, so nothing
would collide with these walls yet.

## Try it
- Change `w*h*99` to `w*h`. The loop stops early and much of the maze
  is still wall.
- Change the size from `vec2(27,15)` to `vec2(15,9)`. With odd numbers
  the passages reach to one cell from each edge.
- Tint the walls: change `new TileLayerData(1)` to
  `new TileLayerData(1, 0, false, hsl(pos.x/27,.7,.6))`.
- Make the walls solid by adding `tileLayer.setCollisionData(pos);`
  before the `setData` line. Then a ray or an object can hit them, as
  in Tile Raycast.

## See also
Tile Layer explains the layer and its tiles. Path Finder finds a route
through a grid like this one, and 3D First Person walks a maze that is
written out by hand.
*/
