// the two areas, a square on the left and a circle on the right
const squarePos = vec2(-7, 0), squareSize = vec2(8);
const circlePos = vec2(7, 0), circleSize = 8;

class Ball extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(rand(.5, 1.2)));
        this.velocity = randVec2(.08);
    }
    update()
    {
        // bounce off the edges of the view
        const viewSize = getCameraSize().subtract(this.size);
        const half = viewSize.scale(.5);
        if (abs(this.pos.x) > half.x && this.pos.x * this.velocity.x > 0)
            this.velocity.x *= -1;
        if (abs(this.pos.y) > half.y && this.pos.y * this.velocity.y > 0)
            this.velocity.y *= -1;

        // slow back down after a push
        if (this.velocity.length() > .08)
            this.velocity = this.velocity.scale(.98);
    }
    render() { drawCircle(this.pos, this.size.x, this.color); }
}

function gameInit()
{
    canvasClearColor = hsl(0, 0, .2);
    for (let i = 60; i--;)
        new Ball(randInCircle(10));
}

function gameUpdatePost()
{
    // gray by default, colored while inside an area
    for (const o of engineObjects)
        o.color = hsl(0, 0, .6);
    engineObjectsCallback(squarePos, squareSize,
        (o)=> o.color = hsl(.55, 1, .6));
    engineObjectsCallback(circlePos, circleSize,
        (o)=> o.color = hsl(.1, 1, .6));

    // click to push away every ball near the mouse
    if (mouseWasPressed(0))
        engineObjectsCallback(mousePos, 6, (o)=>
            o.velocity = o.pos.subtract(mousePos).normalize(.4));
}

function gameRender()
{
    // draw the areas under the balls
    drawRect(squarePos, squareSize, hsl(.55, 1, .5, .2));
    drawCircle(circlePos, circleSize, hsl(.1, 1, .5, .2));
}

function gameRenderPost()
{
    // count what is in each area
    const inSquare = engineObjectsCollect(squarePos, squareSize).length;
    const inCircle = engineObjectsCollect(circlePos, circleSize).length;
    drawText(inSquare + ' inside', squarePos.add(vec2(0, 5)), 1.5);
    drawText(inCircle + ' inside', circlePos.add(vec2(0, 5)), 1.5);
}

/* info
Sixty balls drift around the view, and two areas find the ones inside
them: a square on the left and a circle on the right. A ball turns blue
in the square and orange in the circle, and the number over each area
counts the balls in it. Click to push the balls near the mouse away.

## How it works
### Ball
Each `Ball` is an `EngineObject` with a random size and a random
velocity. Its `update` turns the velocity around at the edges of the
view, from `getCameraSize`, and slows a pushed ball back to its drift.
`render` draws it with `drawCircle`, whose size is the diameter.

### gameUpdatePost
Every ball is set gray, then `engineObjectsCallback` colors the ones in
each area. It takes the area's center, its size and a function, and
calls the function on every object in the area. The size picks the
shape: a `Vector2` is a rectangle of that full size, and a number is a
circle of that diameter, so `squareSize` makes the square and
`circleSize` the circle. This runs in `gameUpdatePost`, after the balls
have moved this frame, so the colors match where they are drawn.

A click uses the same call as a blast: every ball within a circle 6
across around `mousePos` gets a velocity pointing away from the mouse.

### gameRenderPost
`engineObjectsCollect` takes the same area and hands back a list of
the objects in it instead of calling a function, and its `length` is
the count drawn with `drawText`. Use the callback to do something to
each object, and the list to count them, sort them or keep them.

### What counts as inside
An object is in the area when its box overlaps it, so a ball counts as
soon as its edge touches the area, and the box is a little bigger than
the round ball, so it touches a corner first. With `testCenters` set,
the last argument, only an object's center is tested. Unlike a raycast,
the balls need no `setCollision`: every object is tested.

## Try it
- Test only the centers: add `engineObjects, true` after the function
  in both `engineObjectsCallback` calls. A ball now changes color when
  its middle crosses the line.
- Make the circle follow the mouse: change `const circlePos` to
  `let circlePos`, and add `circlePos = mousePos;` at the top of
  `gameUpdatePost`.
- Destroy balls in place of pushing them: change the click's function
  to `(o)=> o.destroy()`.
- Change `i = 60` to `i = 300` for a crowd.

## See also
Object Raycast finds the objects along a line, and Tile Raycast casts a
ray at a tile layer. Physics has a sensor, an object that reports what
touches it.
*/
