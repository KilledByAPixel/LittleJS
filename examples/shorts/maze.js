function generateMaze(size)
{
    const maze = [], w = size.x, h = size.y;
    maze[1 + w] = 1; // start point
    for (let k=w*h*9|0; k--;)
    {
        // get a random position on odd coordinates
        const jx = randInt(w/2-(w%2?0:2)|0)*2 + 1;
        const jy = randInt(h/2-(h%2?1:2)|0)*2 + 1;
        const j = jx + jy*w;

        // get a random direction
        const d = randSign() * (randBool() ? 1 : w);

        // check if we are not the same line or column
        if (j%w != (j+d*2)%w && (j/w|0) != ((j+d*2)/w|0))
            continue;

        // check if pos is open and the next 2 cells are closed
        if (maze[j] && !maze[j+d] && !maze[j+d*2]) 
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
cell is open, and the next two cells that way are both still wall, it
opens those two: a passage grows by one step. If not, nothing happens
and it tries again.

A passage only ever grows into wall, never into another passage. So the
open cells form a tree, with one route between any two of them and no
loops.

### generateMaze
`maze` is a plain array with one entry for each cell, the cell at x and
y being entry `x + y*w`. An entry of 1 is open and an empty entry is
wall. `maze[1 + w] = 1` opens the cell at x 1, y 1.

- The loop runs `w*h*9` times, here 3645. Most tries do nothing, so it
  takes many more tries than there are cells.
- `jx` and `jy` are random odd numbers, since `randInt(n)*2 + 1` is
  odd. Rooms sit on odd cells, and the even cells between them are the
  walls that get knocked through. This is also what leaves a wall
  around the outside.
- `d` is a step to a neighbor in the array: `1` or `-1` for right and
  left, `w` or `-w` for up and down. `randSign()` is 1 or -1 and
  `randBool()` picks between the two axes.
- The first `if` throws out a step that would wrap around. In a flat
  array, the cell after the last of a row is the first of the next row.
  A real step of two keeps either the same column, `j%w`, or the same
  row, `j/w|0`, and one that keeps neither has wrapped.
- The second `if` is the rule above. `maze[j+d]` is the wall between
  and `maze[j+d*2]` the cell beyond it.

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
- Change `w*h*9` to `w*h/4`. The loop stops early and much of the maze
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
