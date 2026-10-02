class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8), 0, CYAN);
        this.damping = .97;
        this.angleDamping = .95;
        this.shootTimer = new Timer;
    }

    update()
    {
        // space ship controls
        const moveInput = keyDirection();
        this.applyAngularAcceleration(moveInput.x * .005);
        const accel = vec2().setAngle(this.angle, moveInput.y*.02);
        this.applyAcceleration(accel);
        if (!this.shootTimer.active())
        if (keyIsDown('Space') || mouseIsDown(0))
        {
            // shoot bullet
            const pos = this.pos.add(vec2(0,1).rotate(this.angle));
            const bullet = new EngineObject(pos, vec2(.2,.5), 0, this.angle);
            bullet.velocity = this.getUp(.5);
            bullet.velocity = bullet.velocity.add(this.velocity);
            bullet.update = ()=> bullet.getAliveTime() > 2 && bullet.destroy();
            this.shootTimer.set(.1);
        }

        // move camera with player
        cameraPos = this.pos;
        cameraAngle = this.angle;
    }
}

function gameInit()
{
    new Player(vec2(0,4));
}

function gameRender()
{
    // draw wrapped starfield with parallax
    const range = 32, halfRange = range/2;

    // precreate variables to avoid overhead
    const pos = vec2(), size = vec2(), color = hsl();
    const x = cameraPos.x, y = cameraPos.y;
    for (let i=1e3; i--;)
    {
        // use math to generate random star positions
        const parallax = i%.13-1;
        pos.x = mod(i**2.1 + x*parallax, range) + x - halfRange;
        pos.y = mod(i**3.1 + y*parallax, range) + y - halfRange;
        size.x = size.y = i%.07 + .03;
        color.a = .1+i%.9;
        drawRect(pos, size, color);
    }
}

/* info
A ship in open space with a field of stars that never ends. The left
and right arrow keys turn the ship, up fires the engine and down
reverses it, and WASD works as well. Hold Space or the mouse button to
shoot. The camera turns with the ship, so the ship always points up the
screen and the stars wheel around it.

## How it works

### Player
The ship is tile 8 of the tile sheet, a white shape, tinted `CYAN`, one
unit wide and two tall. It has no collision: there is nothing to hit.

- `damping = .97` is the fraction of its velocity it keeps each frame.
  Without thrust the ship coasts and slowly stops.
- `angleDamping = .95` does the same for its turning speed.
- `shootTimer` is a `Timer` that spaces the shots.

In `update`, `keyDirection()` gives -1, 0 or 1 for left and right in
`x` and for down and up in `y`. `applyAngularAcceleration` adds to the
turning speed. `vec2().setAngle(angle, length)` makes a vector of that
length pointing along the angle, where 0 is up and angles go clockwise,
so the thrust is along the ship's nose. `applyAcceleration` adds it to
the velocity.

### Shooting
A shot is fired when the timer is not running and Space or the left
button is held. `keyIsDown` and `mouseIsDown` stay true for as long as
the key or button is held, and `shootTimer.set(.1)` starts a tenth of a
second during which `active()` is true, so holding fires ten shots a
second.

A bullet is a plain `EngineObject`, a white rectangle turned to the
ship's angle:

- It starts one unit ahead of the ship's center, at its nose:
  `vec2(0,1).rotate(this.angle)` is one unit up, turned with the ship.
- Its velocity is `getUp(.5)`, half a unit a frame along the ship's
  up, added to the ship's own velocity.
- Its `update` is replaced with a function that destroys the bullet
  once `getAliveTime()`, the seconds since it was made, passes 2.
  Without that the bullets would pile up for ever.

### The camera
`cameraPos` and `cameraAngle` are set from the ship at the end of
`update`. The camera's angle turns the whole view, which is all it
takes to keep the ship upright on screen.

### The starfield
`gameRender` draws 1000 stars and stores none of them. Each star's
place is worked out from its number `i` every frame:

- `i**2.1` and `i**3.1` are large numbers that have nothing to do with
  each other, and `mod(..., range)` wraps them into 0 to 32. That is a
  fixed, random looking place in a square 32 units wide.
- Adding `x - halfRange` centers that square on the camera, so there
  are always stars in view. A star that leaves one side of the square
  comes back in on the other.
- `parallax` is `i%.13-1`, the remainder of `i` over .13 less one, a
  number from -1 to -.87. At -1 a star stays put in the world as the
  camera moves. Nearer -.87 it is carried along a little, so it crosses
  the screen more slowly and looks farther away.
- The same remainder trick gives each star a size from .03 to .1 units
  and an alpha from .1 to 1.

`pos`, `size` and `color` are made once and changed for each star.
`hsl()` with no arguments is white.

## Try it
- Fire faster: `shootTimer.set(.1)` to `set(.02)`.
- Change `cameraAngle = this.angle` to `cameraAngle = 0`: the view
  holds still and the ship turns in it.
- Set `damping` to `1` and the ship never slows down on its own.
- Deepen the parallax: `i%.13-1` to `i%.5-1`.

## See also
Lander Game flies the same ship under gravity. Starfield is another
field of stars, and Timers shows more of `Timer`. Look up
`cameraAngle`, `setAngle` and `mod`.
*/
