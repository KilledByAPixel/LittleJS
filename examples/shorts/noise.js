function gameRender()
{
    // scrolling 2D noise field rendered as a grid of cells
    const size = getCameraSize();
    const cell = .5;
    const cols = ceil(size.x / cell) + 1;
    const rows = ceil(size.y / cell) + 1;
    const ox = cameraPos.x - size.x / 2;
    const oy = cameraPos.y - size.y / 2;
    const scale = .3;
    const pos = vec2(), s = vec2(cell), color = hsl();
    for (let i = 0; i < cols; ++i)
    for (let j = 0; j < rows; ++j)
    {
        pos.x = ox + i * cell;
        pos.y = oy + j * cell;
        // sample each color channel with a different noise offset
        const nx = pos.x * scale + time;
        const ny = pos.y * scale;
        color.set(
            noise2D(nx,  ny       ),
            noise2D(nx,  ny + 1e3 ),
            noise2D(nx,  ny + 2e3 ));
        drawRect(pos, s, color);
    }

    // 1D noise plotted as a curve in center
    for (let i = 0; i < cols; ++i)
    {
        const x = ox + i * cell;
        const y = noise1D(x * scale + time) * 2 - 1;
        drawRect(vec2(x, y), vec2(cell, .15), YELLOW);
    }
}

/* info
The engine's two noise functions drawn so they can be seen: `noise2D`
as a field of slowly changing colors that scrolls across the view, and
`noise1D` as a yellow curve through the middle. There is nothing to
press.

## How it works
Noise is a kind of randomness that is smooth. `rand()` gives a number
with no relation to the one before it. A noise function gives the
same answer every time for the same input, and inputs that are close
together give answers that are close together. That makes it useful
for terrain, clouds and anything that should wander and not jitter.

Both functions here are value noise. Each whole number has a fixed
random value, and a point between two whole numbers gets a smooth
blend of the values on each side. `noise2D(x, y)` does the same on a
grid, blending the four corners around the point. Both return a
number from 0 to 1.

### The grid
`getCameraSize()` is the size of the view in world units. The view is
covered with squares `cell` wide, half a unit, starting from its
bottom left corner at `ox`, `oy`, with one extra row and column so
the far edges are covered.

For each square the noise is read at the square's position times
`scale`. Since the noise changes from one whole number to the next, a
`scale` of `.3` stretches one step of it over about three world
units. A smaller scale gives bigger, softer blobs.

Adding `time` to the x input moves the place the noise is read from,
one whole number a second, which is what scrolls the picture.

### Three channels
`color.set(r, g, b)` takes red, green and blue from 0 to 1, which is
the range noise returns. Each channel reads the noise at a different
y, `1e3` and `2e3` away, far enough that the three have nothing to do
with each other. With the same input for all three the picture would
be gray.

The vectors and the color are made once before the loops and reused
for every square, so the loop does not make new objects each frame.

### The curve
The second loop reads `noise1D` once per column, with the same scale
and time so it scrolls at the same speed. `* 2 - 1` moves the 0 to 1
result to the range -1 to 1, and a small yellow rectangle is drawn at
that height.

## Try it
- Change `const scale = .3;` to `.1` for larger shapes, or to `1`.
- Change `const cell = .5;` to `.25`: four times the squares and a
  finer picture.
- Scroll faster: in the line that sets `nx`, change `+ time` to
  `+ time*3`.
- Make the curve taller: change `* 2 - 1` to `* 8 - 4`.

## See also
Maze Generator and Grapple Game are other procedural examples, and
Starfield gets its fixed random values with plain arithmetic.
`RandomGenerator` is the engine's seeded random numbers.
*/
