let mouseJoint, groundObject;

async function gameInit()
{
    // setup box2d
    await box2dInit();
    mouseJoint = 0;
    gravity.y = -50;
    canvasClearColor = hsl(0,0,.9);
    
    // create ground object
    groundObject = new Box2dStaticObject(vec2(-8));
    groundObject.color = GRAY;
    groundObject.addBox(vec2(100,2));

    // add some random objects
    for (let i=50; i--;)
    {
        const pos = randInCircle(5);
        const color = randColor();
        const o = new Box2dObject(pos, vec2(), 0, 0, color);
        randInt(2) ? o.addCircle(rand(1,2)) : o.addRandomPoly(rand(1,2));
    }
}

function gameUpdate()
{
    // mouse controls
    if (mouseJoint)
    {
        // update mouse joint
        mouseJoint.setTarget(mousePos);
        if (mouseWasReleased(0))
        {
            // release object
            mouseJoint = mouseJoint.destroy();
        }
    }
    else if (mouseWasPressed(0))
    {
        // grab object
        const object = box2d.pointCast(mousePos);
        if (object)
            mouseJoint = new Box2dTargetJoint(object,
                groundObject, mousePos);
    }
}

function gameRenderPost()
{
    // draw mouse joint
    mouseJoint && drawLine(mousePos, mouseJoint.getAnchorB(), .2, RED);
}

/* info
Fifty circles and odd polygons fall onto a floor and pile up, moved by
the Box2D physics plugin. Press the left mouse button on an object to
grab it, drag it around, and let go to throw it.

## How it works
Box2D is a physics library for rigid bodies: shapes that turn, stack
and push each other. The engine's own physics is simpler, upright
boxes only. The plugin wraps Box2D so its bodies are LittleJS objects.

### Starting Box2D
`await box2dInit()` loads Box2D and makes `box2d`, the plugin's global
object. Loading takes a moment, so `gameInit` is an `async` function and
waits for it. Nothing from the plugin can be used before that line.

`gravity` is the engine's usual gravity setting, but Box2D reads it in
units per second squared, and its velocities are per second. The
engine's own objects count per frame, so the numbers are much bigger
here: `-50` in place of something like `-.01`.

### Bodies and shapes
A `Box2dObject` is an `EngineObject` with a Box2D body. Its arguments
are the same as an `EngineObject`'s: position, size, tile, angle and
color. On its own a body has no shape and collides with nothing. Shapes
are added to it:

- `addBox(size)` adds a rectangle. The floor's is 100 by 2.
- `addCircle(diameter)` adds a circle.
- `addRandomPoly(diameter)` adds a polygon with random corners.

An object with no tile is drawn from its shapes, filled with its color
and outlined, which is why the size passed here is `vec2()`: it is not
used for drawing or for collision.

`Box2dObject` is dynamic, moved by the physics. `Box2dStaticObject`
never moves, and is for floors and walls. `vec2(-8)` is the floor's
position, 8 units down. It is also 8 to the left, which does not show on
a floor this wide.

`randInCircle(5)` is a random point within 5 units of the origin, and
`randInt(2)` is 0 or 1, picking the circle or the polygon.

### Grabbing with the mouse
`box2d.pointCast(mousePos)` returns the dynamic object at a point, or
nothing. When the button goes down on one, a `Box2dTargetJoint` is made.
A joint connects two bodies. This kind pulls a point of the object
toward a target, like a strong spring, and it also wants a fixed body,
which is the floor. The point it holds is where the mouse was.

Each frame while it exists, `setTarget(mousePos)` moves the target.
When the button is released the joint is destroyed.
`mouseJoint.destroy()` returns nothing, so the same line clears the
variable.

`gameRenderPost` draws a red line from the mouse to
`mouseJoint.getAnchorB()`, the held point on the object.

## Try it
- Turn gravity off: `gravity.y = -50` to `gravity.y = 0`. Nothing
  falls, and a thrown object keeps going.
- More objects: `let i=50` to `let i=200`.
- Bouncy balls only. Change the line that picks a shape to
  `o.addCircle(rand(1,2), vec2(), 1, .2, .8);`. The arguments after the
  diameter are the offset, density, friction and restitution.

## See also
Box2D Car has joints with motors and springs, Box2D Pool has contact
callbacks and sensors, and Box2D Tile Layer collides with a tile level.
Box2D Plugin in the full examples shows every kind of joint.
*/
