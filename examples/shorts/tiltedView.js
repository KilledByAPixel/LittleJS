class GameObject extends EngineObject
{
    update()
    {
        this.renderOrder = -this.pos.y; // sort by y position
    }

    render()
    {
        // adjust draw position to be at the bottom of the object
        const drawSize = this.drawSize || this.size;
        const offset = this.getUp(drawSize.y/2);
        const pos = this.pos.add(offset);
        drawTile(pos, drawSize, this.tileInfo, this.color, this.angle);
    }
}

class Player extends GameObject
{
    update()
    {
        super.update();

        // apply movement controls
        const moveInput = keyDirection().clampLength(1).scale(.2);
        this.velocity = this.velocity.add(moveInput);
        this.setCollision(); // make object collide

        // move camera with player
        cameraPos = this.pos.add(vec2(0,2));
    }
}

function gameInit()
{
    // setup level
    objectDefaultDamping = .7;
    const player = new Player(vec2(), vec2(3,1), tile(5), 0, RED);
    player.drawSize = vec2(3);

    // create background objects
    for (let i=1; i<300; ++i)
    {
        const pos = randInCircle(90);
        const size = vec2(rand(59), rand(59));
        const color = hsl(.4,.2,rand(.4,.5),.8);
        new EngineObject(pos, size, 0, 0, color, -1e5);
    }

    // create world objects
    for (let i=1; i<1e3; ++i)
    {
        const pos = randInCircle(7+i,7);
        const isRock = randBool();
        const size = vec2(isRock ? rand(2,4) : rand(1,2));
        const color = hsl(.1,isRock ? 0 : .5,rand(.2,.3));
        const o = new GameObject(pos, size, 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
        o.angle = rand(-.1,.1); // random tilt
        o.drawSize = vec2(size.x, isRock ? rand(2,4) : rand(5,10));
    }
}

/* info
A top down world drawn as if seen from an angle: things stand up from
the ground, and whatever is nearer the bottom of the screen covers what
is behind it. The arrow keys or WASD move the player among rocks and
tall posts.

## How it works
This is Top Down Game with two changes to how an object is drawn. The
physics is the same flat world of boxes. Each object has a small box on
the ground, its `size`, that it collides with, and a taller picture,
its `drawSize`, that rises from it.

### GameObject
`GameObject` is the class for everything that stands up.

Its `update` sets `renderOrder` to `-this.pos.y`. The engine draws
objects in order of `renderOrder`, lowest first, and `y` is up, so an
object lower on the screen has a higher order and is drawn later, over
the ones behind it. Setting it every frame keeps the order right as
the player moves.

Its `render` replaces the engine's drawing. `EngineObject` draws its
tile centered on `pos`. Here the picture is moved up by half its own
height, so it stands on `pos`:

- `this.drawSize || this.size` is the size to draw, the object's own
  size when no `drawSize` is set.
- `getUp(length)` is a vector of that length along the object's up,
  which leans with its `angle`. A tilted object leans from its foot.
- `drawTile(pos, size, tileInfo, color, angle)` draws it. With no tile
  it draws a rectangle.

### Player
`Player` adds the controls of Top Down Game: the keys push the
velocity, and `objectDefaultDamping = .7` in `gameInit` has every
object keep that fraction of its velocity each frame. The camera is
put 2 units above the player's position.

The player is made with a `size` of 3 by 1, the box it collides with,
and a `drawSize` of 3 by 3 for tile 5 of the tile sheet. The class has
no constructor, so `setCollision()` is called in `update`. Calling it
every frame does no harm.

### gameInit
The ground is 299 large rectangles in greens, plain `EngineObject`s
with no collision. Their color has an alpha of .8, so they show through
each other, and the last argument is a `renderOrder` of `-1e5`, far
below any `-pos.y`, which keeps them under everything.

The loop after it makes 999 things to walk around. `randBool()` picks
a rock or a post, half each. The `size` is a square, 2 to 4 units for a
rock and 1 to 2 for a post, and the `drawSize` keeps that width with a
height of 2 to 4 for a rock or 5 to 10 for a post. Each is solid and
static, and leans by up to .1 radians either way. The lean is only
drawn: collision always uses the upright box.

## Try it
- Change `-this.pos.y` to `this.pos.y`: far things draw over near ones
  and the depth falls apart.
- Lean everything more: `rand(-.1,.1)` to `rand(-.5,.5)`.
- Grow the posts: `rand(5,10)` to `rand(10,20)`.
- Make the ground solid colors: take the `,.8` out of
  `hsl(.4,.2,rand(.4,.5),.8)`.

## See also
Top Down Game is the same world seen flat. FPS Game and Ball Track Game
are two more ways to fake depth with 2D drawing. Look up `renderOrder`,
`drawSize` and `drawTile`.
*/
