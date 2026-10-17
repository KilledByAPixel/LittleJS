let player, crates, crateTimer;
const playerStart = vec2(0, -7);

class Player extends Box2dObject
{
    constructor(pos)
    {
        super(pos, vec2(), 0, 0, hsl(.55, 1, .6));
        this.addBox(vec2(.8, 1.2), vec2(), 0, 1, .6);
        this.setFixedRotation();         // stay upright
        this.setSleepingAllowed(false);  // so preSolve is always called
        this.onGround = false;
    }

    update()
    {
        // set by preSolve during the last physics step
        const onGround = this.onGround;
        this.onGround = false;

        // run, jump from the ground, and start over after a fall
        const move = keyDirection(), velocity = this.getLinearVelocity();
        if (move.x)
            velocity.x = move.x * 8;
        const jump = keyWasPressed('Space') || keyWasPressed('ArrowUp') ||
            keyWasPressed('KeyW');
        if (onGround && jump)
            velocity.y = 16;
        this.setLinearVelocity(velocity);
        if (this.pos.y < -15)
        {
            this.setTransform(playerStart, 0);
            this.setLinearVelocity(vec2());
        }
    }

    preSolve(other, fixture, otherFixture, contact)
    {
        // hold down to drop through a one way ledge
        if (other.oneWay && keyDirection().y < 0)
            contact.enabled = false;

        // a surface pushing up from below is ground
        if (contact.enabled && contact.normal.y > .7)
            this.onGround = true;
    }
}

class Conveyor extends Box2dStaticObject
{
    constructor(pos, width, speed)
    {
        super(pos, vec2(), 0, 0, hsl(0, 0, .3));
        this.width = width;
        this.addBox(vec2(width, .6), vec2(), 0, 1, 1);
        this.setSurfaceSpeed(speed); // its top runs right when positive
    }

    render()
    {
        // stripes moving with the belt's surface
        super.render();
        for (let i = 0; i < this.width; ++i)
        {
            const x = mod(time * this.surfaceSpeed + i, this.width);
            const pos = this.pos.add(vec2(x - this.width/2, 0));
            drawRect(pos, vec2(.15, .5), hsl(.13, 1, .5));
        }
    }
}

function makeLedge(pos)
{
    const ledge = new Box2dStaticObject(pos, vec2(), 0, 0, hsl(.3,.5,.5));
    ledge.addBox(vec2(5, .4));
    ledge.oneWay = vec2(0, 1); // jumped up through, landed on
}

async function gameInit()
{
    await box2dInit();
    gravity.y = -40;
    canvasClearColor = hsl(.6, .3, .15);

    // the floor, two belts running opposite ways, and ledges to climb
    const floor = new Box2dStaticObject(vec2(0, -9), vec2(), 0, 0, GRAY);
    floor.addBox(vec2(36, 2));
    new Conveyor(vec2(-6, -4.5), 16, 4);
    new Conveyor(vec2(-2, 2), 14, -4);
    makeLedge(vec2(9, -5.5));
    makeLedge(vec2(12, -2.5));
    makeLedge(vec2(9, .5));
    makeLedge(vec2(-12, 5));

    player = new Player(playerStart);
    crates = [];
    crateTimer = new Timer(1.5);
}

function gameUpdate()
{
    // drop a crate on the top belt now and then, keeping only the newest
    if (crateTimer.elapsed())
    {
        crateTimer.set(1.5);
        const color = hsl(.08, .6, rand(.3, .5));
        const crate = new Box2dObject(vec2(4, 8), vec2(), 0, 0, color);
        crate.addBox(vec2(1), vec2(), 0, 1, .6);
        crates.push(crate);
        crates.length > 12 && crates.shift().destroy();
    }
}

function gameUpdatePost()
{
    // fit the level on screen
    setCameraScale(min(mainCanvasSize.x / 38, mainCanvasSize.y / 22));
}

function gameRenderPost()
{
    const text = 'arrows move, up jumps, down drops through a ledge';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
A small platformer on Box2D: jump up through the green ledges and stand
on them, hold down to drop back through, and ride the striped conveyor
belts. Crates fall on the top belt every second and a half, ride it to
its end, drop onto the lower belt, and ride that one the other way.

## How it works
### One way ledges
`oneWay` on a Box2D object makes it a platform that is only solid from
one side, set the same way as on the engine's own objects:
`vec2(0, 1)` means things pass through going up. When something first
touches a ledge, the plugin decides once: from above, it lands, and
from anywhere else it passes through until they stop touching. So the
player can jump up from under a ledge, and lands on it on the way down.
What passes through calls no `beginContact` or `endContact`.

### Conveyor belts
`setSurfaceSpeed(speed)` makes any Box2D object a conveyor belt: its
surface runs around it clockwise at that speed, in world units per
second, and friction carries what touches it. Across the top, clockwise
is to the right, so the lower belt, at 4, carries things right and the
upper one, at -4, left. Each belt's box has a friction of 1, the last
argument of `addBox`, so things get up to speed quickly.

The belt does not move, only its surface, so `render` draws yellow
stripes to show it. `mod(time * this.surfaceSpeed + i, this.width)` is
where stripe `i` is along the belt, wrapping from its end to its start.

### The player
`Player` is a `Box2dObject` with a box shape. `setFixedRotation()`
keeps it upright. Its `update` sets the speed directly: 8 units a
second left or right while a direction is held, and 16 up for a jump.
Box2D's speeds are per second, not per frame as the engine's are. With
no direction held the speed is left alone, so friction slows the player
on the floor, and a belt carries it along.

### preSolve
`preSolve(other, fixture, otherFixture, contact)` is called every
physics step for each thing the player touches, before Box2D works out
the collision, and it does two jobs here.

- Holding down while touching a ledge sets `contact.enabled = false`.
  They pass through each other until they stop touching, so letting go
  of down halfway through does not snap the player back on top.
- `contact.normal` is the direction the other surface pushes the
  player. Pointing mostly up, `normal.y > .7`, the player is on the
  ground and can jump. A ledge it is passing through never gets here.

`update` reads `onGround` and clears it, and the next step's
`preSolve` sets it again while the player still stands on something.

Box2D lets a body that stops moving fall asleep, and it skips a
sleeping body's collisions, so `preSolve` would not be called.
`setSleepingAllowed(false)` keeps the player awake.

### The level
The floor, the belts and the ledges are `Box2dStaticObject`s, which
never move. A `Timer` drops a crate on the top belt every 1.5 seconds,
and the oldest is destroyed once there are more than 12.
`setCameraScale` in `gameUpdatePost` fits 38 by 22 units on screen.

## Try it
- Jump higher: `velocity.y = 16` to `velocity.y = 20`.
- Make the floor a belt too: add `floor.setSurfaceSpeed(-3);` after
  `floor.addBox(vec2(36, 2));`. Stand still and it carries you left.
- Delete the `setSleepingAllowed(false)` line and stand still on a
  ledge for a moment. The player falls asleep, then down does not drop
  through and up does not jump, until a step left or right wakes it.

## See also
Platform Physics has one way platforms with the engine's own physics,
and Platformer Game is a whole game. Box2D Demo covers bodies and
shapes, and Box2D Pool has contact callbacks.
*/
