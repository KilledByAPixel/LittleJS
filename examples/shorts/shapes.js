function gameRender()
{
    // circles and ellipses
    drawEllipse(vec2(-6,5), vec2(4,3), YELLOW, .5);
    drawCircle(vec2(0,5), 3+oscillate(.5), RED);
    drawEllipse(vec2(6,5), vec2(2,4), CLEAR_BLACK, .3, .5, CYAN)

    // polygon shapes
    drawRectGradient(vec2(-6,0), vec2(5,4), RED, BLUE)
    drawRegularPoly(vec2(), vec2(4), 3, PURPLE, .3, WHITE, time);
    let starPath = []
    for (let i=10; i--;)
        starPath.push(vec2(0,2*(i%2?.4:1)).rotate(i/10*PI*2));
    drawPoly(starPath, BLUE, .1, GREEN, vec2(6, 0));

    // rects and lines
    drawCircleGradient(vec2(-6,-5), 4, GREEN, hsl(.3,1,.5,0));
    drawRect(vec2(0,-5), vec2(4,3+oscillate(.5)), ORANGE);
    drawLine(vec2(3,-7), vec2(8,-3), 1,  hsl(0,0,1,.5));
    const zPath = [vec2(8,-3), vec2(3,-3), vec2(8,-7), vec2(3,-7)];
    drawLineList(zPath, .4, MAGENTA);
}

/* info
The engine's shape drawing functions, ten shapes in three rows: two
ellipses and a circle, a gradient, a triangle and a star, then a round
gradient, a rectangle and lines. Two of them pulse and the triangle
spins. There is nothing to press.

## How it works
Everything is drawn in `gameRender`, again every frame. Positions and
sizes are in world units, with `vec2(0,0)` in the middle of the view and
y going up, so the row at y `5` is the top one. A shape with a position
is centered on it, and every size is a full width and height, not a
radius.

### Round shapes
- `drawEllipse(pos, size, color, angle, lineWidth, lineColor)` takes a
  size of two diameters. The yellow one is 4 by 3 and turned by `.5`
  radians.
- `drawCircle(pos, size, color, lineWidth, lineColor)` takes one number,
  the diameter. It has no angle.
- The third ellipse has `CLEAR_BLACK` as its color, which is fully see
  through, so only its outline shows: a line `.5` units wide in `CYAN`.

`oscillate(.5)` is a sine wave that goes from 0 to 1 and back, here at
half a cycle a second, read from the engine's `time`. Added to a size it
makes the circle swell from 3 to 4 and the rectangle grow in height.

### Polygons
- `drawRectGradient(pos, size, colorTop, colorBottom)` fades from the
  first color at the top to the second at the bottom.
- `drawRegularPoly(pos, size, sides, color, lineWidth, lineColor, angle)`
  draws a shape with equal sides, here 3 of them. Its angle is `time`,
  the seconds since the engine started, so it turns one radian a second.
- `drawPoly(points, color, lineWidth, lineColor, pos)` fills any list of
  points and moves it to `pos`. The loop builds a star around
  `vec2(0,0)`: ten points, each a tenth of a turn on from the last,
  2 units out for the tips and `.4` of that for the notches between.

`vec2(0,2).rotate(angle)` is how a point is put on a circle: a vector
pointing up, turned clockwise by the angle.

### Lines and the rest
- `drawCircleGradient(pos, size, colorInner, colorOuter)` fades from
  its center to its rim. The outer color is a green with an alpha
  of 0, the fourth number of `hsl`, so it fades to nothing.
- `drawRect(pos, size, color)` is the plain rectangle.
- `drawLine(posA, posB, width, color)` draws from one point to another.
  This one is a whole unit wide and half see through.
- `drawLineList(points, width, color)` joins a list of points in order,
  which makes the Z.

## Try it
- Change the `3` before `PURPLE` to `6` for a hexagon.
- In the star, change `.4` to `.8` for short points, or `.1` for thin
  ones.
- Fill the third ellipse: change its `CLEAR_BLACK` to `BLUE`.
- Add `, true` after `MAGENTA`. That is the `wrap` argument, and it
  joins the last point of the Z back to the first.

## See also
Colors for how colors are made, and Vectors for `rotate` and the other
vector math. Clock and Crescent draw pictures out of these shapes, and
Debug Drawing has shapes made for showing what the code is doing.
*/
