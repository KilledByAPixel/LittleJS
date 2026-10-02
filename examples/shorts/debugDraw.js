class BounceObject extends EngineObject
{
    constructor(pos, size, tile)
    {
        super(pos, size, tile);
        this.velocity = vec2(.1);
    }

    update()
    {
        // show debug info
        debugText('Debug Text', this.pos.add(vec2(0,3)), 1, WHITE);
        debugRect(this.pos, this.size, RED);
        const trianglePoints = [vec2(-2,-1), vec2(0,2), vec2(2,-1)];
        debugPoly(mousePos, trianglePoints, YELLOW);
        debugLine(this.pos, mousePos, BLUE);

        // bounce off screen edges
        const cameraSize = getCameraSize();
        if (abs(this.pos.x) > cameraSize.x/2)
        {
            debugCircle(this.pos, 3, GREEN, 1);
            this.velocity.x = -this.velocity.x;
        }
        if (abs(this.pos.y) > cameraSize.y/2)
        {
            debugCircle(this.pos, 3, GREEN, 1);
            this.velocity.y = -this.velocity.y;
        }
    }
}

function gameInit()
{
    canvasClearColor = GRAY;
    new BounceObject(vec2(), vec2(5), tile(3,128));
}

/* info
The debug draw functions, which put shapes and text on screen from
anywhere in the code. A logo bounces around the view with a red box
around it and a label above it, a blue line joins it to the mouse, a
yellow triangle follows the mouse, and a green circle marks each
bounce for a second. Move the mouse to move the line and the triangle.

## How it works
The normal draw functions draw at once, so they are called from
`gameRender` or an object's `render`. The debug functions can be
called at any time, here from an object's `update`.
Each call adds a shape to a list, and the engine draws the list over
everything else at the end of the frame.

They exist only in debug builds of the engine. In a release build
every one of them is an empty function, so the calls can stay in the
code and cost nothing.

### The calls
- `debugText(text, pos, size, color)` draws text centered on a
  position, here 3 units above the object.
- `debugRect(pos, size, color)` draws the outline of a rectangle,
  given its center and size. With the object's own `pos` and `size` it
  shows exactly the box the engine uses for the object.
- `debugPoly(pos, points, color)` draws the outline through a list of
  points. The points are measured from `pos`, so one triangle can be
  drawn anywhere, here at `mousePos`, the mouse in world units.
- `debugLine(posA, posB, color)` draws a line between two points. Its
  color comes before its width, unlike `drawLine`.
- `debugCircle(pos, size, color, time)` draws a circle outline, and
  its size is the diameter.

### How long a shape stays
Every debug function takes a `time` in seconds, 0 when left out. A
shape with a time of 0 is drawn for one frame, which suits the calls
here that run every frame. The circles pass `1`, so each stays for a
second after the bounce that made it, long after the object has moved
on. That is what makes these useful for events that are over in one
frame, like a hit or a raycast.

### The object
`BounceObject` is an `EngineObject` with a tile, so the engine draws
it and moves it by its `velocity` each frame: `vec2(.1)` is a tenth
of a unit per frame on both axes. `update` is called once a frame.
`getCameraSize()` is the size of the view in world units, and the view
is centered on `vec2(0,0)`, so the object's center has left it when
the absolute value of `pos.x` or `pos.y` is more than half that size.
The velocity on that axis is then turned around.

## Try it
- Give the rectangle a time: in the `debugRect` call, add `, .5`
  after `RED`. Half a second of boxes trails behind the object.
- Make the line thicker: add `, .5` after `BLUE`.
- Fill and spin the triangle: add `, 0, time, true` after `YELLOW`.
  The arguments are the time, the angle and whether to fill.
- Change the velocity from `vec2(.1)` to `vec2(.3,.1)`.

## See also
Click the example, then press Escape for the debug overlay, which has
more views built from the same drawing. Tweakables is the other debug
tool for tuning a game while it runs, and Shapes has the normal draw
functions.
*/
