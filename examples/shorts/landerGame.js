class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8), 0, RED);
        this.setCollision(); // make object collide
        this.angleDamping = .95;
    }

    update()
    {
        // space ship controls
        const moveInput = keyDirection();
        this.applyAngularAcceleration(moveInput.x * .002);
        const accel = this.getUp(moveInput.y*.002);
        this.applyAcceleration(accel);
    }

    // explode when it collides
    collideWithObject()
    {
        // don't explode if player is almost still and pointing up
        if (cos(this.angle) > .98)
        if (this.velocity.length() < .05)
            return true;

        // explode!
        this.destroy();
        particleEffect('explosion', this.pos, {scale: 1.5});
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.001;
    new Player(vec2(0,4));

    // create ground
    for (let i=0, y=0; i<20; ++i)
    {
        y = (y + rand(1,-1)*4) * .5;
        const pos = vec2(i*2-20, y-54);
        const color = hsl(0, 0, .5+i%.29);
        const o = new EngineObject(pos, vec2(2, 99), 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}

/* info
Land a ship on rough ground. The left and right arrow keys turn it, up
fires the engine along its nose and down pushes the other way. WASD
works as well. Come down slowly and upright, or the ship explodes.

## How it works
The ship and the ground are engine objects, and the engine's physics
moves the ship and stops it at the ground. The game only adds thrust
and decides what a touch means.

### Player
The ship is tile 8 of the tile sheet, a white shape, tinted `RED`, one
unit wide and two tall. `setCollision()` makes it collide with solid
objects.

`angleDamping = .95` is the fraction of its turning speed it keeps each
frame, so a turn dies away when the key is let go. The sideways and
falling speed have no such loss: `damping` is 1 unless it is set.

`update` runs every frame:

- `keyDirection()` returns a vector from the arrow keys, `x` for left
  and right and `y` for down and up, each -1, 0 or 1.
- `applyAngularAcceleration` adds to `angleVelocity`, the turn per
  frame in radians. Angles are clockwise, so the right key turns the
  ship to the right.
- `getUp(length)` is a vector of that length along the ship's own up,
  the way its nose points. `applyAcceleration` adds it to the velocity.
  A negative length, from the down key, points it backward.

### Landing or crashing
The engine calls `collideWithObject` when the ship touches a solid
object, and the answer says whether the physics should stop it there.
The ship is safe when it points up and is slow. `cos(this.angle)` is 1
when it points straight up, however many times it has turned around,
and above .98 it is within about .2 radians, 11 degrees, of that. Slow
is a speed below .05 units a frame, 3 units a second. Then the method
returns `true` and the ship rests on the ground.

Otherwise the ship destroys itself and `particleEffect('explosion',
...)` makes a one-shot burst at its position, 1.5 times the size the
effect is made at. Nothing starts the game again, so restart the
example for another go.

### gameInit
`gravity.y = -.001` is a tenth of Flappy Game's gravity, which gives
time to steer.

The ground is 20 columns, each 2 units wide and 99 tall so its bottom
is far out of view. The height is a random walk: each step adds a
random number from -4 to 4 to the last height and halves the sum, which
keeps neighbors close and pulls the ground back toward the middle.
`i%.29`, the remainder of `i` over .29, gives each column its own grey.
A column has `mass = 0`, so it is static.

Collision uses each object's upright box. The angle only turns the
picture, which is why the code checks the angle itself.

## Try it
- Make gravity three times as strong: `-.001` to `-.003`.
- Give the engine more push: `moveInput.y*.002` to `moveInput.y*.004`.
- Ask for a softer landing: `< .05` to `< .02`.
- Set `angleDamping` to `1` and a turn goes on until you stop it.

## See also
Space Game flies the same ship with no gravity and a camera that turns
with it. Flappy Game is the mini game before this one. Look up
`applyAcceleration`, `getUp`, `collideWithObject` and `particleEffect`.
*/
