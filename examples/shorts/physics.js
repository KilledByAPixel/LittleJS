// a box with its own bounce and friction, the two numbers that say how it
// lands and how it slides
class Box extends EngineObject
{
    constructor(pos, color, restitution=0, friction=.8)
    {
        super(pos, vec2(1.5), 0, 0, color);
        this.setCollision(); // collide with solid objects, and be solid
        this.restitution = restitution;
        this.friction = friction;
    }
    update()
    {
        // space pushes every box toward the mouse
        if (keyWasPressed('Space'))
            this.velocity = this.velocity.add(
                mousePos.subtract(this.pos).normalize(.3));
    }
}

// a balloon: gravity pulls it up, and it rests against the ceiling
class Balloon extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1.2), 0, 0, hsl(.9,.8,.65));
        this.setCollision();
        this.gravityScale = -.3; // a third of gravity, the other way
        this.restitution = .4;
    }
}

// a sensor: it stops nothing, and lights up while a box is inside it
class Sensor extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(4), 0, 0, hsl(.5,.8,.5,.2));
        this.setCollision(true, false); // notice solid objects, block none
        this.mass = 0;
        this.litTime = -1;
    }
    collideWithObject(object)
    {
        this.litTime = time; // something is in it this frame
        return false; // no push, so the object goes on through
    }
    render()
    {
        this.color.a = time - this.litTime < .1 ? .6 : .2;
        super.render();
    }
}

function gameInit()
{
    gravity.y = -.02; // added to every velocity each frame
    cameraScale = 30;

    // the floor, the ceiling and two walls: solid, with no mass, so static
    const walls = [[vec2(0,-8), vec2(34,1)], [vec2(0,8), vec2(34,1)],
        [vec2(-16,0), vec2(1,16)], [vec2(16,0), vec2(1,16)]];
    for (const [pos, size] of walls)
    {
        const wall = new EngineObject(pos, size, 0, 0, hsl(0,0,.4));
        wall.setCollision();
        wall.mass = 0;
        wall.friction = 0; // so each box's own friction counts, see below
    }

    // three boxes dropped from the same height: no bounce, some, and a lot
    new Box(vec2(-11, 4), hsl(0,.8,.6), 0);
    new Box(vec2(-8, 4), hsl(.08,.8,.6), .5);
    new Box(vec2(-5, 4), hsl(.15,.8,.6), .9);

    // three boxes on the floor that slide differently when pushed
    new Box(vec2(2, -6.5), hsl(.3,.6,.5), 0, .5);
    new Box(vec2(5, -6.5), hsl(.4,.6,.5), 0, .8);
    new Box(vec2(8, -6.5), hsl(.5,.6,.5), 0, .97);
    new Balloon(vec2(12, -6));
    new Sensor(vec2(-2, -2));
}

function gameUpdate()
{
    // click to drop a box with a random bounce and friction
    if (mouseWasPressed(0))
        new Box(mousePos, hsl(rand(),.8,.6), rand(), rand(.5,1));
}

function gameRender()
{
    drawText('restitution 0, .5 and .9', vec2(-8, 6), .7);
    drawText('friction .5, .8 and .97, space pushes toward the mouse',
        vec2(5, -4.5), .7);
    drawText('sensor', vec2(-2, .5), .7);
    drawText('gravityScale -.3', vec2(12, 4.5), .7);
}

/* info
The engine's own physics, which every `EngineObject` with a mass gets
for free: three boxes fall and bounce by their restitution, three slide
by their friction when Space pushes them, a balloon floats up to the
ceiling, and a sensor lights up when a box passes through it. Click to
drop a box of your own.

## How it works
An `EngineObject` with a mass is moved by the engine every frame: its
velocity is added to its position, gravity is added to its velocity,
and if it collides it is pushed out of whatever it hit. The numbers
below are all fields of the object, set once in a constructor.

### Box
- `super(pos, size, tile, angle, color)` makes a 1.5 unit square. With
  no tile it draws as a rectangle of its color.
- `setCollision()` turns collision on: the box collides with solid
  objects and is solid itself. Two objects only collide when at least
  one of them is solid.
- `restitution` is how much of its speed a bounce keeps, 0 to 1. The
  three dropped boxes stop dead, bounce half as high and bounce nearly
  as high as they fell.
- `friction` is the fraction of its sliding speed an object keeps each
  frame while it stands on something, so 1 is no friction and 0 stops
  it at once. `.8` is the default. A pair uses the higher of the two
  frictions, so the floor is given 0 and each box's own number decides.

`update` is called every frame. Space pushes each box toward the mouse:
`mousePos.subtract(this.pos)` is the vector from the box to the mouse,
`normalize(.3)` keeps its direction and makes its length .3, and that
is added to the velocity, which is in units per frame.

### Balloon
`gravityScale` multiplies gravity for one object. A negative one falls
up: the balloon rises, bounces off the ceiling and comes to rest
against it, standing on it upside down.

### Sensor
`setCollision(true, false)` has it collide with solid objects without
being solid, and `mass = 0` makes it static, so nothing moves it. The
engine calls `collideWithObject(object)` on both objects of a pair that
overlap, once a frame, and when either returns `false` there is no
push: the box passes through. The sensor only notes the time, and its
`render` draws it brighter for a tenth of a second after that.

### gameInit
The walls are objects with `mass = 0`: static, so gravity leaves them
and the moving boxes land on them. `gravity.y = -.02` is in units per
frame, added every frame, so a box that fell for a second is moving
1.2 units a frame.

## Try it
- Change `gravity.y = -.02` to `-.005` for a slow fall.
- Change the balloon's `gravityScale` to `-1`: it hits the ceiling hard.
- Give the dropped boxes a spin: add `this.angleVelocity = .05;` in the
  `Box` constructor. The angle only turns the picture, and the box
  still collides as an upright square.
- Change `return false` in the sensor to `return true`: it is solid
  now, and boxes land on it.

## See also
Pong Game and Flappy Game are games made from these objects. Parent /
Child attaches objects together, Tile Layer has collision with a level,
and Box2D Demo is the plugin for physics with real shapes and joints.
*/
