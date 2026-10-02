class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2), tile(5), 0, RED);
        this.setCollision(); // make object collide
        this.renderOrder = 1; // render player on top
    }

    update()
    {
        // apply movement controls
        const moveInput = keyDirection().clampLength(1).scale(.2);
        this.velocity = this.velocity.add(moveInput);

        // smoothly follow player with lerp
        cameraPos = cameraPos.lerp(this.pos, .1);
    }
}

function gameInit()
{
    // setup level
    canvasClearColor = hsl(.3,.2,.6);
    objectDefaultDamping = .7;
    new Player;

    // create collision objects
    for (let i=300; i--;)
    {
        const pos = randInCircle(15+i,7);
        const size = vec2(rand(4,9),rand(4,9));
        const color = hsl(.1,.5,rand(.2));
        const o = new EngineObject(pos, size, 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}

/* info
A world seen from straight above. The arrow keys or WASD move the
player in any direction among 300 solid blocks, and the camera glides
after it.

## How it works
There is no gravity here, since `gravity` is zero unless a game sets
it. With nothing pulling down, the engine's box collision is all a top
down game needs.

### Player
The player is tile 5 of the tile sheet, tinted `RED`, two units across.
`setCollision()` makes it collide with the solid blocks. `renderOrder`
is 1 and the blocks keep the default of 0. Objects draw in that order,
lowest first, so the player draws over a block.

`update` runs every frame:

- `keyDirection()` returns a vector from the keys, `x` for left and
  right and `y` for down and up. With up and right held it is `vec2(1,1)`,
  which is longer than 1, and `clampLength(1)` shortens it so moving
  diagonally is no faster. `scale(.2)` makes it the push for one frame.
- The push is added to the velocity, and the engine moves the object
  by its velocity and stops it at anything solid.
- `cameraPos.lerp(this.pos, .1)` is the point a tenth of the way from
  the camera to the player. Doing that every frame closes a tenth of
  what is left each time, so the camera moves fast when it is far
  behind and settles gently.

### Damping
Adding a push every frame would make the player faster and faster.
`objectDefaultDamping = .7` is what stops that: each object keeps that
fraction of its velocity every frame, so the speed levels off while a
key is held and dies away quickly after.

The setting is copied into an object's `damping` when the object is
made, which is why it is set before `new Player`.

### The blocks
Each block is a plain `EngineObject` drawn as a rectangle, 4 to 9 units
on a side, in a dark brown from `hsl`. `setCollision()` makes it solid
and `mass = 0` makes it static, so the player can not push it.

`randInCircle(15+i, 7)` picks a random point inside a circle whose
radius grows with `i`, and never closer to the middle than 7 units.
That leaves the start clear and spreads the blocks thinner farther out.

## Try it
- Skate on ice: `objectDefaultDamping = .7` to `.95`.
- Move with twice the push: `scale(.2)` to `scale(.4)`.
- Change the `.1` in the `lerp` to `.02` for a lazy camera, or to `1`
  to lock it to the player.
- Give the blocks a random hue: `hsl(.1,.5,rand(.2))` to
  `hsl(rand(),.5,.3)`.

## See also
Tilted View Game turns this into a view from an angle. Camera Mouse
Drag moves the camera by hand, and Vectors shows `lerp`. Look up
`clampLength`, `objectDefaultDamping` and `renderOrder`.
*/
