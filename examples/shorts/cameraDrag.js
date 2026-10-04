function gameInit()
{
    // create some objects
    for (let i=500; i--;)
    {
        const pos = randInCircle(100);
        const size = vec2(rand(2,9),rand(2,9));
        const color = randColor();
        const angle = rand(PI);
        new EngineObject(pos, size, 0, angle, color);
    }
}

function gameUpdate()
{
    // drag camera with mouse
    if (mouseIsDown(0))
        cameraPos = cameraPos.subtract(mouseDelta);

    // zoom camera with mouse wheel
    cameraScale = clamp(cameraScale*1.2**-mouseWheel, 1, 1e3);
}

/* info
A field of 500 colored rectangles to look around in. Hold the left mouse
button and drag to move the camera, and turn the mouse wheel to zoom.

## How it works
### gameInit
The loop makes 500 objects with
`new EngineObject(pos, size, tileInfo, angle, color)`. The `0` for the
tile means no tile, and an object with no tile draws as a rectangle of
its size and color. The engine keeps and draws every object, so the
example has no render function.

- `randInCircle(100)` is a random point inside a circle with a radius of
  100 units around `vec2(0,0)`.
- `rand(2,9)` is a random number between 2 and 9, one for the width and
  one for the height.
- `randColor()` picks each of red, green and blue at random.
- `rand(PI)` is a random angle between 0 and half a turn. Angles are in
  radians.

### gameUpdate
The camera is two settings. `cameraPos` is the point in the world at the
middle of the view, and `cameraScale` is how many pixels one world unit
covers, 32 until it is changed.

`mouseDelta` is how far the mouse moved this frame, in world units.
Subtracting it from `cameraPos` while the button is held moves the
camera the other way, so the point of the world under the mouse stays
under it. That is what makes it feel like dragging the world. Because
the delta is in world units it is right at any zoom.

`mouseWheel` is how far the wheel turned this frame, 0 when it did not.
`1.2**-mouseWheel` makes each step multiply the scale by 1.2 or divide
it by 1.2, so zooming is by a part of the scale it has, not by a fixed
amount, and feels the same close up and far out. A fast turn of many
steps at once still only multiplies, so the scale can not reach 0.
`clamp` keeps the result between 1 and 1000 pixels a unit.

## Try it
- Drag with the right button instead: `mouseIsDown(2)`.
- Change `1.2` to `1.5` for bigger zoom steps.
- Change the limits from `1, 1e3` to `10, 100` so the view can not zoom
  as far in or out.
- Make more objects: change `i=500` to `i=5000`.

## See also
Input shows the rest of the mouse and keyboard. Top Down Game, Platformer
Game and Space Game set `cameraPos` to follow the player, and Light
System uses `mouseWheel` to change a light's size.
*/
