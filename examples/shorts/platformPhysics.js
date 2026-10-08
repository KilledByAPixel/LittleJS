let player, layer;

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(.8, 1.6), undefined, 0, hsl(0, .8, .5));
        this.setCollision();
    }

    update()
    {
        // run, Up to jump, hold Down to drop through a platform
        const input = keyDirection();
        this.dropping = input.y < 0;
        this.velocity.x += input.x * (this.groundObject ? .06 : .01);
        if (this.groundObject && input.y > 0)
            this.velocity.y = .5;
        // follow it, keeping the view over the level, 42 units across
        const w = min(getCameraSize().x/2, 21);
        cameraPos = vec2(clamp(this.pos.x, w, 42 - w), 7);
    }

    // asked about a one way tile only when it would land on it
    collideWithTile(data, pos)
    {
        const tile = layer.getData(pos)?.tile;
        return !(this.dropping && layer.oneWayTiles.has(tile));
    }

    // and the same for a one way object
    collideWithObject(object)
    { return !(this.dropping && object.oneWay); }
}

class Lift extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(3, .5), undefined, 0, hsl(.55, .6, .5));
        this.setCollision();
        this.mass = 0; // not moved by others, it moves by its velocity
        this.oneWay = vec2(0, 1); // jumped up through, stood on
    }

    update() { this.velocity.y = cos(time) * .06; }
}

function gameInit()
{
    gravity.y = -.03;
    canvasClearColor = hsl(.6, .3, .6);

    // the level, tile 10 the brick ground and tile 1 the platforms
    layer = new TileCollisionLayer(vec2(), vec2(42, 16));
    const put = (x, y, tile, direction=0)=>
    {
        const color = tile == 1 ? hsl(.1, .7, .6) : hsl(0, 0, .6);
        const data = new TileLayerData(tile, direction, false, color);
        layer.setData(vec2(x, y), data);
        layer.setCollisionData(vec2(x, y));
    };
    for (let x = 0; x < 30; ++x)
        put(x, 0, 10);
    for (let y = 1; y < 4; ++y)
        put(0, y, 10), put(41, y, 10); // walls at the ends
    for (let x = 0; x < 6; ++x)
        put(x + 3, 4, 1), put(x + 6, 7, 1), put(x + 16, 9, 1);

    // tile 1 is one way: passed through going up, landed on from above
    layer.setOneWay(1);

    // the same tile turned a quarter clockwise is passed going right,
    // a door walked through from the left that stops you from the right
    for (let y = 1; y < 7; ++y)
        put(14, y, 1, 1);
    layer.redraw();

    // an ice floor, a layer of its own with a slippery friction
    const ice = new TileCollisionLayer(vec2(30, 0), vec2(12, 1));
    const iceColor = hsl(.55, .6, .8);
    for (let x = 0; x < 12; ++x)
    {
        ice.setData(vec2(x, 0), new TileLayerData(1, 0, false, iceColor));
        ice.setCollisionData(vec2(x, 0));
    }
    ice.friction = .98;
    ice.redraw();

    // a heavy crate to push and a bouncy ball
    const crate = new EngineObject(vec2(18, 2), vec2(2), tile(1), 0,
        hsl(.08, .5, .35));
    crate.setCollision(true, true);
    crate.mass = 3;
    const ball = new EngineObject(vec2(21, 6), vec2(1), tile(0),
        0, hsl(.3, .8, .5));
    ball.setCollision(true, true);
    ball.restitution = .9;
    ball.friction = .99;

    new Lift(vec2(26, 5));
    player = new Player(vec2(2, 2));
}

/* info
A small level that shows the platform physics: platforms you jump up
through and land on, a door you can walk through one way, a lift, a
crate to push, a bouncy ball and an ice floor. The arrow keys or WASD
run and Up jumps. Hold Down to drop through a platform.

## How it works
Everything here is the engine's own physics. The game code only reads
the keys, builds the level and sets a few numbers on the objects.

### The player
The player is an `EngineObject` with no tile, so it draws as a red
rectangle, and `setCollision()` makes it collide with the level's tiles
and with solid objects. Its `update` reads `keyDirection()`, adds to
`velocity.x` to run, a lot on the ground and a little in the air, and
sets `velocity.y` to jump, but only when `groundObject`, what it stands
on, is set.

### One way platforms
The level is a `TileCollisionLayer`. Tile 10, the bricks, is the
ground and tile 1, drawn orange, is the platforms.
`layer.setOneWay(1)` makes every cell that draws tile 1 one way: passed
through moving up, and solid only to what was wholly above it before it
moved. So the player jumps up through a platform and lands on top of
it.

The one way follows the tile's art. The door at x 14 is the same tile
turned a quarter clockwise, `put(14, y, 1, 1)`, so its way is turned
too and points right: walk into it from the left and you go through,
come back from the right and it stops you. The platforms above the
lift are the way back over it.

### Dropping through
`collideWithTile` is asked whether a tile it touches should stop it.
For a one way tile it is asked only when the tile would stop it, when
it lands, so returning `false` there drops it through. The player does
that while Down is held, for the tiles in `layer.oneWayTiles`, the
tiles made one way. `collideWithObject` does the same for the lift.

### The lift
A solid object can be one way too, with `oneWay = vec2(0, 1)`. The lift
has `mass = 0`, so nothing pushes it around, and moves only by its own
`velocity`, which `update` sets from `cos(time)`, so it goes up and down
smoothly. It carries what stands on it, and you can jump up through it
from below.

### The crate and the ball
`setCollision(true, true)` makes an object collide and also be solid,
so other objects bump into it. The crate has a `mass` of 3, three times
the player's, so it is slow to push and the player is slowed by it.
The ball has a `restitution` of .9, how much speed it keeps when it
bounces, so it keeps bouncing, and a `friction` of .99, so it rolls far.

### Ice
Friction is the share of sideways speed kept each frame on the ground,
and the more slippery of the object and what it stands on is used. The
ice is a second `TileCollisionLayer` with a `friction` of .98, so on it
the player keeps sliding after the keys are let go. A layer's
`restitution` works the same way, for a bouncy floor.

## Try it
- Make the platforms solid: remove `layer.setOneWay(1);`.
- Make the door one way to the left: in `put(14, y, 1, 1)` change the
  last 1 to 3, three quarter turns.
- Make the ice a trampoline: add `ice.restitution = 1;`.
- Make the crate light: `crate.mass = 3;` to `crate.mass = .3;`.
- Make the lift faster: `.06` to `.12`.

## See also
Platformer Game is the smallest platformer, and Platforming Game in the
full examples a whole game. Physics shows more of the engine's
collision between objects. Look up `setOneWay`, `oneWay`,
`collideWithTile` and `restitution`.
*/
