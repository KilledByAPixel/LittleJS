class Wall extends EngineObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, hsl(.3,.5,.3));
        this.setCollision(); // make object collide
        this.mass = 0;
    }
    update()
    {
        this.pos.x -= .1; // move walls to the left
    }
}

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1), tile(9), 0, YELLOW);
        this.drawSize = vec2(2);
        this.setCollision(); // make object collide
    }

    update()
    {
        super.update();

        // flappy movement controls
        if (mouseWasPressed(0) || keyWasPressed('Space'))
            this.velocity = vec2(0,.2);
        this.angle = -this.velocity.y*2;
        this.pos.y = max(-50, this.pos.y);
    }

    collideWithObject(object)
    {
        // reset game
        engineObjectsDestroy();
        gameInit();
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.01;
    for (let i=100; i--;)
    {
        const h=100, y=-h/2-6+rand(9), spacing=15, gap=5;
        new Wall(vec2(14 + i*spacing,y+h + gap), vec2(3,h));
        new Wall(vec2(14 + i*spacing,y), vec2(3,h));
    }
    new Player(vec2(-7,6));
    canvasClearColor = hsl(.55,1,.8);
}

/* info
A bird falls, and each flap throws it back up. Fly it through the gaps
in the walls that come from the right. Click or press Space to flap.
Touch a wall and the game starts again.

## How it works
The bird never moves sideways and neither does the camera, which stays
at `vec2(0,0)`. The walls move left instead, which looks the same and
keeps every number small.

### Wall
A wall is an `EngineObject` with no tile, so it draws as a rectangle in
the color it is given. The arguments of `super` are the position, the
size, the tile, the angle and the color, and the two zeros are no tile
and no turn.

`setCollision()` makes it solid and `mass = 0` makes it static, so
gravity does not pull it. Its `update`, which the engine calls every
frame, moves it left by .1 units, 6 units a second.

### Player
The bird is tile 9 of the tile sheet, tinted `YELLOW`. Its size is one
unit, and that is the box it collides with. `drawSize` makes the picture
two units, so the bird can brush a wall with its edges and live.

It keeps the default mass, so the engine moves it by its velocity and
adds gravity each frame. The physics runs first and `update` after it:

- A click or Space sets the velocity to `vec2(0,.2)`. Setting it, not
  adding to it, makes every flap the same whatever the fall before it.
  `mouseWasPressed(0)` and `keyWasPressed('Space')` are true only on the
  frame the button or key goes down.
- `angle` follows the vertical speed, so the bird tips up as it rises
  and down as it falls. Angles are radians and clockwise.
- `max(-50, this.pos.y)` stops a bird that fell between two walls from
  falling for ever. It waits there for the next wall.

The engine calls `collideWithObject` when the bird touches a solid
object. It destroys every object with `engineObjectsDestroy()` and
calls `gameInit` to make them again, which is the whole restart.

### gameInit
`gravity.y = -.01` pulls down by .01 units a frame, every frame. The
loop makes 100 pairs of walls, 15 units apart, the first at `x` 14.
Each wall is 100 units tall so its far end is never seen. `y` is the
center of the lower wall, moved by `rand(9)`, a random number from 0 to
9, and the upper wall's center is one wall height and one `gap` above
it. That leaves 5 units between them.

`canvasClearColor` is the sky.

## Try it
- Widen the gaps: `gap=5` to `gap=8`.
- Flap harder with `vec2(0,.3)`.
- Speed the walls up: `this.pos.x -= .1` to `.2`.
- Change `YELLOW` to `RED` for a red bird.

## See also
Pong Game is the mini game before this one, and Lander Game the next.
Hill Glide Game uses the same bird with hills in place of walls. Look
up `EngineObject`, `setCollision` and `engineObjectsDestroy`.
*/
