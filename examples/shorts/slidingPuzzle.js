const gridSize = vec2(4,3);
const pieceSize = vec2(5,4);
let emptyGridPos = vec2();

class PuzzlePiece extends EngineObject
{
    constructor(gridPos, size)
    {
        const x = gridPos.x, y = gridPos.y;
        const color = hsl(.5 + x/(gridSize.x-1)/3, 1, .4 + y/(gridSize.y-1)/3);
        super(gridPos.multiply(size), size, 0, 0, color);
        this.gridPos = gridPos;
        this.text = x + y*gridSize.x;
        this.moveTimer = new Timer;
        this.lastPos = this.pos;
    }

    update()
    {
        const deltaX = emptyGridPos.x - this.gridPos.x;
        const deltaY = emptyGridPos.y - this.gridPos.y;
        if (mouseWasPressed(0))
        if (this.isOverlapping(mousePos))
        if (abs(deltaX) + abs(deltaY) === 1)
        {
            // swap with empty space when clicked on
            this.lastPos = this.pos;
            this.pos = emptyGridPos.multiply(this.size);
            [emptyGridPos, this.gridPos] = [this.gridPos, emptyGridPos];
            this.moveTimer.set(.2);
        }
    }

    render()
    {
        const movePercent = this.moveTimer.getPercent();
        const pos = this.lastPos.lerp(this.pos, movePercent);
        drawRect(pos, this.size, this.color);
        drawText(this.text, pos, 2.5, BLACK);
    }
}

function gameInit()
{
    // create puzzle pieces
    for (let x=gridSize.x; x--;)
    for (let y=gridSize.y; y--;)
        (x||y) && new PuzzlePiece(vec2(x,y), pieceSize);

    // center camera on grid
    cameraPos = gridSize.subtract(vec2(1)).multiply(pieceSize).scale(.5);
}

/* info
A sliding puzzle: eleven numbered pieces on a grid of 4 by 3, with one
cell empty. Click a piece beside the empty cell and it slides into it.

The pieces start in order and nothing checks for a win, so it is a toy
to build on: see Try it.

## How it works
The puzzle keeps two kinds of position. A grid position is a cell,
like `vec2(2,1)`, and the rules use those. A world position is where a
piece is drawn, the grid position times `pieceSize`, 5 units wide and 4
tall. `emptyGridPos` is the one cell with no piece, `vec2(0,0)` at the
start.

### PuzzlePiece
Each piece is an `EngineObject`, so the engine calls its `update` and
`render` every frame.

The constructor works out a color from the cell with `hsl`: the hue
goes from .5 to about .83 across the columns, and the lightness rises
with the rows. `super` then places the object at its world position.
The piece keeps its cell in `gridPos`, its number in `text`, a `Timer`
for the slide and `lastPos`, where the slide starts from.

### update
A piece moves when three things are true on the same frame:

- `mouseWasPressed(0)`: the left button went down.
- `this.isOverlapping(mousePos)`: the mouse is on this piece. With one
  argument the method tests a point against the object's box, and
  `mousePos` is the mouse in world units.
- `abs(deltaX) + abs(deltaY) === 1`: the empty cell is one step away,
  left, right, up or down, and not diagonal.

The move remembers the old position, sets `pos` to the empty cell's
place in the world, and swaps the two grid positions in one line with
a destructuring assignment. `moveTimer.set(.2)` starts a timer of a
fifth of a second.

### render
A piece with its own `render` draws itself, and the engine's rectangle
is not drawn. The object's `pos` jumps to the new cell at once, and it
is the drawing that slides: `moveTimer.getPercent()` goes from 0 to 1
while the timer runs, and `lastPos.lerp(this.pos, percent)` is the
point that far along the way. A timer that was never set gives 0, and
then `lastPos` is the piece's place.

`drawRect` draws the piece and `drawText` its number. The 2.5 is the
text's height in world units, and text is centered on its position.

### gameInit
The two loops make a piece for every cell but one: `(x||y)` is false
only when both are 0, the empty cell. The camera goes to the middle of
the grid, half way between the centers of the first and last piece.

## Try it
- Make the grid bigger: `vec2(4,3)` to `vec2(5,4)`.
- Slow the slide down: `set(.2)` to `set(.5)`.
- Leave a gap between pieces: in `drawRect`, change `this.size` to
  `this.size.scale(.9)`.

## See also
Timers shows more of `Timer`, and Tween is another way to move
something over time. Puzzle Game in the full examples is a whole game
on a grid, and 3D Puzzle Game pushes blocks on one.
*/
