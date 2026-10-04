function drawArrow(origin, v, color)
{
    const tip = origin.add(v);
    drawLine(origin, tip, .1, color);
    drawCircle(tip, .3, color);
}

function gameRender()
{
    // rotating and fixed vectors
    const a = vec2(0, 2).rotate(time);
    const b = vec2(2, 0);

    // addition: chain head to tail
    let o = vec2(-7, 3);
    drawText('a + b', o.add(vec2(0,3)));
    drawArrow(o, a, RED);
    drawArrow(o.add(a), b, GREEN);
    drawArrow(o, a.add(b), YELLOW);

    // lerp: interpolate between two vectors
    o = vec2(7, 3);
    drawText('a.lerp(b, t)', o.add(vec2(0,3)));
    drawArrow(o, a, RED);
    drawArrow(o, b, GREEN);
    drawArrow(o, a.lerp(b, oscillate(.5)), YELLOW);

    // normalize: get a unit vector pointing at the mouse
    o = vec2(-7, -4);
    drawText('toMouse.normalize()', o.add(vec2(0,3)));
    const toMouse = mousePos.subtract(o);
    drawArrow(o, toMouse.normalize().scale(2), CYAN);

    // reflect: bounce a vector across a surface normal
    o = vec2(7, -4);
    drawText('a.reflect(n)', o.add(vec2(0,3)));
    drawLine(o.subtract(vec2(3,0)), o.add(vec2(3,0)), .05, GRAY);
    drawArrow(o, a, RED);
    drawArrow(o, a.reflect(vec2(0,1)), YELLOW);
}

/* info
Four pieces of vector math drawn as arrows: adding, blending, normalizing
and reflecting. The red arrow turns on its own, and the cyan arrow at the
bottom left points at the mouse.

## How it works
A `Vector2` is an x and a y, made with `vec2(x, y)`. It is used both for
a place and for a direction with a length, and the arrows here are the
second kind. The functions used here do not change the vector they are
called on. Each returns a new one, which is why they can be chained, as
in `toMouse.normalize().scale(2)`.

`drawArrow` is the example's own helper. It draws a vector `v` starting
from `origin`: a line to `origin.add(v)` and a dot there for the tip.

Two vectors are used all through:

- `a` is `vec2(0, 2)`, two units straight up, turned by `rotate(time)`.
  `rotate` turns clockwise by an angle in radians, and `time` is the
  seconds since the engine started, so `a` goes around at one radian a
  second.
- `b` is `vec2(2, 0)`, two units to the right, and stays still.

### a + b
`a.add(b)` adds the x values and the y values. Drawn head to tail, with
`b` starting from the tip of `a`, the two arrows end where the yellow sum
ends.

### a.lerp(b, t)
`lerp` returns a vector part of the way from `a` to `b`: `a` at 0 and
`b` at 1. `oscillate(.5)` goes from 0 to 1 and back once every two
seconds, so the yellow tip slides along the straight line between the
red tip and the green one.

### toMouse.normalize()
`mousePos.subtract(o)` is the vector from `o` to the mouse, and its
length is how far away the mouse is. `normalize()` keeps its direction
and makes its length 1, and `scale(2)` then makes it 2. The arrow
always points at the mouse and never changes length.

### a.reflect(n)
`reflect` bounces a vector off a surface. Its argument is the surface's
normal, a vector of length 1 pointing straight out of it. The gray line
is the surface and its normal is `vec2(0,1)`, straight up, so the yellow
arrow is the red one with its y turned around.

## Try it
- Change `rotate(time)` to `rotate(time*3)` to turn `a` faster.
- Change `b` from `vec2(2, 0)` to `vec2(3, 1)`.
- Change `oscillate(.5)` to `.5`: the yellow arrow stays half way
  between the other two.
- Change `scale(2)` to `scale(toMouse.length()/2)`. The arrow now
  reaches half way to the mouse.
- Give `reflect` a second argument, `a.reflect(vec2(0,1), .5)`. That is
  the restitution, and the bounce keeps half of its height.

## See also
Shapes uses `rotate` to build a star. Pong Game and the other mini games
use vectors for positions and velocities, and Object Raycast casts a
line from one vector to another.
*/
