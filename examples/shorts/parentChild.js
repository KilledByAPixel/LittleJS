class Spinner extends EngineObject
{
    constructor(size, color, spinSpeed)
    {
        super(vec2(), size, 0, 0, color);
        this.spinSpeed = spinSpeed;
    }
    update()
    {
        // rotate self: parent will carry children along
        if (this.parent)
            this.localAngle += this.spinSpeed;
        else
            this.angle += this.spinSpeed;
    }
}

function gameInit()
{
    canvasClearColor = hsl(.6,.3,.1);

    // root: a slow rotating bar at the origin
    const root = new Spinner(vec2(8, .5), YELLOW, .005);

    // child: offset from the root, spins faster
    const child = new Spinner(vec2(3, .3), RED, .02);
    root.addChild(child, vec2(4, 0));

    // grandchild: offset from the child, spins fastest
    const grandchild = new Spinner(vec2(1, .2), CYAN, .04);
    child.addChild(grandchild, vec2(1.5, 0));
}

/* info
Three bars joined end to end, each turning on the one before: a slow
yellow bar in the middle of the view, a red bar on its end and a small
cyan bar on the end of that. There is nothing to press.

## How it works
An `EngineObject` can have children. A child keeps a position and an
angle relative to its parent, `localPos` and `localAngle`, and every
frame the engine works out its `pos` and `angle` in the world from
those and from where the parent is. Parents are done before their
children, so a chain of any length follows along.

### Spinner
The class is an object that turns itself in `update`, which the engine
calls for every object 60 times a second. `spinSpeed` is in radians per
update, so the root's `.005` is `.3` radians a second.

Which angle it changes depends on whether it has a parent:

- With no parent it changes `angle`, its angle in the world.
- With a parent it changes `localAngle`. Its `angle` is set by the
  engine every frame from the parent, so a change made to that would be
  written over.

`super(vec2(), size, 0, 0, color)` makes each bar at `vec2(0,0)` with no
tile and no angle. A bar with no tile draws as a rectangle of its size
and color.

### gameInit
`parent.addChild(child, localPos, localAngle)` attaches one object to
another. The position is in the parent's own space, measured from the
parent's center and turning with it:

- The root is 8 units long, so `vec2(4, 0)` puts the child's center on
  the root's end.
- The child is 3 long, so `vec2(1.5, 0)` puts the grandchild on the
  child's end.

Each bar's angle in the world is its own `localAngle` added to its
parent's angle. The red bar is carried around by the yellow one and
turns on top of that, and the cyan bar adds its own turning to both.

A child is moved only by its parent: the engine runs no physics for an
object that has one.

## Try it
- Change the child's `.02` to `-.02` to turn it the other way.
- Attach the child at the middle of the root: `vec2(4, 0)` to
  `vec2(0, 0)`.
- Give the grandchild a starting angle, a third argument to `addChild`:
  `child.addChild(grandchild, vec2(1.5, 0), PI/2);`
- Stop the root: change `.005` to `0`. The other two keep turning.

## See also
Space Game and Clock turn things with angles. `attach` adds a child
where it already is in the world, and `removeChild` lets one go. The
3D objects have the same `addChild`, as 3D First Person uses for the
lights on its lamps.
*/
