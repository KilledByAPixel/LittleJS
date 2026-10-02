class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2), tile(9), 0, RED);
        this.damping = 1; // disable damping
        this.clampSpeed = false; // disable speed clamping
    }

    update()
    {
        // check ground height
        const h = getGroundHeight(this.pos.x);
        if (this.pos.y < h + this.size.y/2)
        {
            // clamp to ground and reflect velocity
            this.pos.y = h + this.size.y/2;
            const h2 = getGroundHeight(this.pos.x+.1);
            const n = vec2((h-h2)/.1, 1).normalize();
            this.velocity = this.velocity.reflect(n,0);
        }

        // apply movement controls
        if (mouseIsDown(0) || keyIsDown('Space'))
            this.applyAcceleration(vec2(0,-.05));
        this.velocity.x = max(this.velocity.x,.4);
        this.angle = this.velocity.angle() - PI/2;

        // move camera with player
        cameraPos = vec2(this.pos.x+9,5);
    }
}

function getGroundHeight(x)
{
    return sin(x/4)*2 + sin(x/17);
}

function gameInit()
{
    gravity.y = -.01;
    new Player(vec2(0,5));
}

function gameRender()
{
    // background gradient
    drawRectGradient(cameraPos, vec2(32), WHITE, BLUE);

    // draw ground as a series of thin rectangles
    const h = 100, w = 20;
    const pos = vec2();
    const sizeTop = vec2(.4);
    const size = vec2(.2,h);
    const color = hsl();
    for (let x=cameraPos.x-w; x<cameraPos.x+w; x+=.1)
    {
        pos.x = x;
        pos.y = getGroundHeight(x);
        drawRect(pos, sizeTop, BLACK);
        pos.y -= h/2;
        color.setHSLA(.2+.2*oscillate(.2,1,x), .7, .5);
        drawRect(pos, size, color);
    }
}

/* info
A bird slides over rolling hills, in the style of Tiny Wings. Hold the
mouse button or Space to dive. Dive down a slope to pick up speed and
let go before the next rise, and the hill throws the bird into the air.

## How it works
The hills are not objects and nothing here uses the engine's collision.
The ground is one function, and the bird is kept on top of it by hand.

### getGroundHeight
The height of the ground at any `x` is two sine waves added together:
`sin(x/4)*2` makes hills that rise and fall by 2 units about every 25,
and `sin(x/17)` is a slow swell under them. Both the physics and the
drawing ask this function, so they always agree.

### Player
The bird is tile 9 of the tile sheet, tinted `RED`, two units across.
It never calls `setCollision`. `damping = 1` has it keep all of its
velocity each frame, and `clampSpeed = false` asks the engine not to
hold its speed to `objectMaxSpeed`. Both only say what is already so
here: 1 is the default `damping`, and the engine puts that limit on
colliding objects only.

The engine has already moved the bird by its velocity and added gravity
when `update` runs:

1. If the bird's bottom edge is under the ground, it is put back on
  the ground. The slope there comes from a second height .1 units to
  the right, and `vec2((h-h2)/.1, 1).normalize()` is the normal, the
  direction straight out of the hill.
2. `velocity.reflect(n, 0)` bounces the velocity off that normal. The
  second argument is the restitution, and 0 takes away the part of the
  speed going into the hill and keeps the part along it. That is a
  slide.
3. While the button or Space is held, `applyAcceleration` adds .05
  downward each frame, five times gravity.
4. `max(this.velocity.x, .4)` keeps the bird moving right at .4 units a
  frame or more, so it can not stall on a hill.
5. `velocity.angle()` is the direction of travel, clockwise from up.
  Taking a quarter turn off it, `PI/2`, makes 0 mean moving right, the
  way the tile is drawn.

The last line puts the camera 9 units ahead of the bird at a fixed
height, so the bird stays in the left half of the view.

### gameRender
`drawRectGradient` fills the view with a square that goes from `WHITE`
at the top to `BLUE` at the bottom, centered on the camera.

The ground is drawn as thin columns, one every .1 units across 20 units
each side of the camera. For each, a black square at the ground height
makes the outline, and a rectangle .2 wide and 100 tall under it is the
earth. `oscillate(.2, 1, x)` is a wave from 0 to 1 that takes 5 units
of `x` to repeat, and it moves the hue between .2 and .4 for the
stripes.

`pos`, `size` and `color` are made once before the loop and changed
inside it, so no new vectors or colors are made for each column.

## Try it
- Make the hills taller: `sin(x/4)*2` to `sin(x/4)*3`.
- Dive harder with `vec2(0,-.1)`.
- Change `reflect(n,0)` to `reflect(n,.5)`: the bird bounces off the
  hills.
- Let the bird slow down more: `max(this.velocity.x,.4)` to `.2`.

## See also
Flappy Game uses the same bird with engine collision. Vectors shows
`reflect` and `normalize`, and Grapple Game is another game of
momentum. Look up `drawRectGradient` and `oscillate`.
*/
