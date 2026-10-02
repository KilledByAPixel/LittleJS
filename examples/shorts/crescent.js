function gameRender()
{
    // a row of moons stepping through a full lunar cycle
    const count = 9;
    for (let i = count; i--;)
    {
        const p = i/(count-1);
        const x = lerp(-12, 12, p);
        drawCircle(vec2(x, 6), 2.5, hsl(.6,.5,.2));
        drawCrescent(vec2(x, 6), 2.5, p, YELLOW, PI/2);
        drawText(p.toFixed(2), vec2(x, 4), .4, WHITE);
    }

    // a large moon animating through its phases
    const p = mod(time/4, 1);
    drawCrescent(vec2(0,-2), 9, p, BLACK, time/4, true,  .2, BLUE);
    drawCrescent(vec2(0,-2), 9, p, WHITE, time/4, false, .2, BLUE);
}

/* info
The phases of the moon as a shape. A row of nine small moons steps
through one whole cycle, and a large one below runs through it every 4
seconds while it turns. There is nothing to press.

## How it works
`drawCrescent(pos, size, percent, color, angle, invert, lineWidth,
lineColor)` draws the lit part of a moon. `size` is the diameter of the
whole disk. `percent` is the phase over one cycle: 0 is new, with
nothing lit, .25 is the first quarter, a half disk, .5 is full, .75 is
the last quarter, and 1 is new again. It wraps, so 1.25 is the same as
.25.

The shape is a polygon. Its outside is half of the disk's circle, and
its inside is half of an ellipse that goes from bulging one way to
bulging the other as the phase goes on. The lit width grows evenly with
the phase, which is simpler than what the real moon does.

### The row
The loop gives each moon a phase `p` from 0 to 1 in steps of an eighth,
and `lerp(-12, 12, p)` spreads them from x -12 to 12. Each is drawn in
three parts:

- `drawCircle` draws the whole disk in dark blue, the same diameter of
  2.5, for the unlit part.
- `drawCrescent` draws the lit part in `YELLOW` over it. At an angle of
  0 the lit side faces up while the moon waxes and down while it wanes.
  The angle `PI/2` is a quarter turn, which puts it at the side.
- `drawText` writes the phase below, with two decimals from
  `p.toFixed(2)`.

The first and last moons are both new, so only their dark disks show.

### The large moon
`mod(time/4, 1)` is the part of `time/4` after the point, so `p` goes
from 0 to 1 every 4 seconds and starts over. The angle is `time/4`
radians, which turns the moon slowly.

It is drawn with two calls that differ in the `invert` argument. With
`invert` true, `drawCrescent` draws the unlit part of the disk instead
of the lit part, here in `BLACK`. The second call draws the lit part in
`WHITE`. Together they fill the disk, with no circle needed under them.
Both have an outline `.2` wide in `BLUE`, the last two arguments.

`getCrescentPoints` returns the same polygon as a list of points, for
when the shape is needed for something other than drawing it.

## Try it
- Draw only the quarters: `const count = 9;` to `const count = 5;`.
- Set the row's angle to 0: `YELLOW, PI/2` to `YELLOW, 0`.
- Hold the large moon at the first quarter: `mod(time/4, 1)` to `.25`.
  It still turns.
- Take out the first of the two large `drawCrescent` lines. The unlit
  part is then not drawn at all.

## See also
Shapes has the other shape functions, `drawPoly` among them, which
this one draws with. Clock is drawn from the time of day.
*/
