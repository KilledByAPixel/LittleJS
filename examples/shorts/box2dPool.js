const hitSound = new Sound([,.1,2e3,,,.01,,,,,,,,1]);
const maxHitDistance = 6;
let cueBall;

class Ball extends Box2dObject
{
    constructor(pos, number=0)
    {
        const color = hsl(number/9, 1, number? .5 : 1);
        super(pos, vec2(), 0, 0, color);
        this.number = number;

        // setup pool ball physics
        const friction = 0, restitution = .95;
        this.addCircle(1, vec2(), 1, friction, restitution);
        this.setLinearDamping(.4);
        this.setBullet(true);
        this.setFixedRotation(true);
    }
    beginContact()
    { hitSound.play(this.pos, clamp(this.getSpeed()/20)); }
    canHit()
    { return this == cueBall && this.getSpeed() < 1; }
    getHitStrength()
    { return this.getHitOffset().length()/maxHitDistance; }
    getHitOffset()
    {
        // hit from cue ball to mouse position
        const deltaPos = mousePos.subtract(this.pos);
        const length = min(deltaPos.length(), maxHitDistance);
        return deltaPos.normalize(length); 
    }
    update()
    {
        if (this.canHit() && mouseWasPressed(0))
        {
            // hit the cue ball with an instantaneous impulse
            const impulse = this.getHitOffset().scale(8);
            this.applyImpulse(impulse);
            hitSound.play(cueBall.pos, this.getHitStrength(), .5);
        }
        if (this.pocketed)
        {
            this.destroy();
            if (this == cueBall) // a new cue ball where it started
                cueBall = new Ball(vec2(-6, 0));
        }
    }
    render()
    {
        super.render();

        // draw white circle and ball number
        drawCircle(this.pos, .6, WHITE);
        const textPos = this.pos.add(vec2(0,-.06));
        if (this.number)
            drawText(this.number, textPos, .5, BLACK);
        if (this.canHit())
        {
            // draw the aim line
            const endPos = this.pos.add(this.getHitOffset());
            const width = this.getHitStrength();
            drawLine(this.pos, endPos, width, hsl(0,1,.5,.5), 
                vec2(), 0, false);
        }
    }
}

class Pocket extends Box2dStaticObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, BLACK);

        // create a sensor circle for pocket
        this.addCircle(size.x);
        this.setSensor(true);
    }
    render()
    {
        // add ball size to pocket size for drawing
        drawCircle(this.pos, this.size.x + 1, BLACK);
    }
    beginContact(other) { other.pocketed = 1; }
}

async function gameInit()
{
    // setup box2d
    await box2dInit();
    canvasClearColor = hsl(.4,.5,.5);

    // create table walls
    const groundObject = new Box2dStaticObject;
    groundObject.color = hsl(.1,1,.2);
    groundObject.addBox(vec2(100,3), vec2( 0, 8.5));
    groundObject.addBox(vec2(100,3), vec2( 0,-8.5));
    groundObject.addBox(vec2(3,100), vec2( 15,0));
    groundObject.addBox(vec2(3,100), vec2(-15,0));

    // create pockets
    for (let j=0; j<2; ++j)
    for (let i=0; i<3; ++i)
        new Pocket(vec2(i-1, j-.5).scale(13), vec2(.5));
   
    // create balls
    let number = 1;
    for (let i=5;   i--;)
    for (let j=i+1; j--;)
        new Ball(vec2(6+i*.88, j-i/2), number++);
    cueBall = new Ball(vec2(-6, 0));
}

/* info
A pool table seen from above, with Box2D doing the collisions. When the
white cue ball has nearly stopped, a red line runs from it toward the
mouse: click to hit the ball that way. A longer line is a harder hit.
Balls that reach a pocket are removed.

## How it works
`gameInit` waits for `box2dInit()`, which loads the Box2D plugin, and
then builds the table. `gravity` is never set, so it stays at zero and
nothing falls: the view is from above.

### The table
One `Box2dStaticObject` holds all four cushions. A body can have many
shapes, and `addBox(size, offset)` adds each at an offset from the
body's position. The boxes are much longer than the table, so they
overlap at the corners and leave no gaps.

The balls are racked by two loops. The outer one counts columns and the
inner one puts one more ball in each column, the column centered on the
table's middle line, which makes the triangle. Columns are `.88` apart,
a little less than a ball's width of 1, so they nest together.

### Ball
A `Ball` is a `Box2dObject` with one circle:
`addCircle(1, vec2(), 1, friction, restitution)` is a diameter of 1, no
offset, a density of 1, no friction and a restitution of `.95`, so a
ball keeps nearly all its speed in a bounce. Three more settings make
it act like a pool ball:

- `setLinearDamping(.4)` slows it steadily, as cloth would. Without it
  nothing would slow a rolling ball.
- `setBullet(true)` asks Box2D for continuous collision detection on
  this body, so a fast ball does not pass through another.
- `setFixedRotation(true)` stops the body turning.

The ball has no tile, so `super.render()` draws its circle in the
ball's color. `render` then adds a white circle and the number with
`drawText`. The cue ball is number 0, which gets white and no number.

### Hitting
`canHit` is true for the cue ball while `getSpeed()` is under 1 unit a
second. `getHitOffset` is the vector from the ball to the mouse, cut to
`maxHitDistance` at most: `normalize(length)` gives a vector in the
same direction with that length. On a click, `applyImpulse` gives the
ball a push of that vector times 8. An impulse changes the velocity at
once, by the impulse divided by the body's mass.

`getHitStrength` is the offset's length as a part of the most, 0 to 1.
It is the width of the aim line and the volume of the hit sound.

### Contacts and pockets
Box2D calls an object's `beginContact(other)` when it starts touching
another. `Ball` uses it to play a click, louder the faster the ball is
moving.

A `Pocket` is a static body with a small circle, and `setSensor(true)`
makes its shapes sensors: they report contacts and block nothing. Its
`beginContact` marks the other object `pocketed`, and that ball's
`update` then destroys it. The pocket is drawn 1 unit
wider than its sensor, the width of a ball, so a ball is taken about
when its center passes the edge of the hole.

The cue ball can be pocketed too. When it is, a new one is made where
the first started and takes its place in `cueBall`.

## Try it
- Allow harder hits: `maxHitDistance = 6` to `maxHitDistance = 12`.
- Let the balls roll longer: `setLinearDamping(.4)` to
  `setLinearDamping(.1)`.
- Dead balls: `restitution = .95` to `restitution = .5`.
- A bigger rack: `let i=5;` to `let i=7;`.

## See also
Box2D Demo covers bodies and shapes. Box2D Plugin in the full examples
has more contact callbacks, and raycasts. Sound Effects is about sounds
made with `new Sound`.
*/
