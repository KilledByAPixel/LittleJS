function gameInit()
{
    canvasClearColor = hsl(0,0,.2);

    // create random objects with raycast collision enabled
    for (let i=20; i--;)
    {
        const pos = randInCircle(8);
        const size = vec2(rand(1,3), rand(1,3));
        const o = new EngineObject(pos, size, 0, 0, GRAY);
        o.setCollision(); // enables raycast collision
    }
}

function gameRenderPost()
{
    // cast ray from center to mouse
    const start = vec2();
    const end = mousePos;
    const hits = engineObjectsRaycast(start, end);

    // highlight hit objects
    for (const o of hits)
        drawRect(o.pos, o.size, RED);

    // draw the ray
    drawLine(start, end, .1, hits.length ? RED : CYAN);
    drawText(hits.length + ' object(s) hit', vec2(0, 8));
}

/* info
A ray cast at engine objects: a line from the middle of the view to the
mouse, and every object it crosses is drawn in red. Move the mouse. The
text at the top counts the objects hit.

## How it works
### gameInit
Twenty gray rectangles are made at random points within 8 units of the
middle, each 1 to 3 units on a side. They
are plain `EngineObject`s with no tile, which draw as rectangles of
their size and color.

`o.setCollision()` is the line that matters. A raycast only hits
objects whose `collideRaycast` is on, and `setCollision` turns it on
together with the other kinds of collision. An object without it is
passed through.

### gameRenderPost
`engineObjectsRaycast(start, end)` returns a list of every object the
line from `start` to `end` crosses, an empty list when there are none.
Unlike a tile raycast it does not stop at the first one, and the list is
in the order of the engine's object list, not by distance.

The loop draws a red rectangle over each object in the list, at its
`pos` and `size`. Then the ray is drawn, red if it hit anything
and cyan if not, and `drawText` shows the count. All of this is in
`gameRenderPost` so that it is drawn after the objects and covers them.

### The box that is tested
The test is against each object's box with its sides along the x and y
axes: its `pos` and `size`, and not its `angle`. In the engine an
object's angle turns how it is drawn, and collision uses the
upright box. The rectangles here are not turned, so what is drawn is
what the ray is tested against. See Try it for what a turn does.

## Try it
- Turn the rectangles: change `0, 0, GRAY` to `0, rand(PI), GRAY`. The
  ray still hits their upright boxes, so it can light one up while
  passing beside its drawn shape.
- Take out the `o.setCollision();` line: nothing is hit.
- Change `i=20` to `i=100` for a crowd.
- Start the ray somewhere else: change `const start = vec2();` to
  `const start = vec2(-10, 0);`

## See also
Tile Raycast casts a ray at a tile layer and gets the point and the side
that was hit. `engineObjectsCallback` and `engineObjectsCollect` find
the objects in an area in place of along a line.
*/
