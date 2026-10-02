let paddle, ball;

class PhysicsObject extends EngineObject
{
    constructor(pos, size)
    {
        super(pos, size); // set object position and size
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
}

function gameInit()
{
    // setup level
    const levelSize = vec2(38, 21);    // size of play area
    cameraPos = levelSize.scale(.5);   // center camera in level
    canvasFixedSize = vec2(1280, 720); // use a 720p fixed size canvas

    // create objects
    paddle = new PhysicsObject(vec2(0,1), vec2(6,1)); // player

    const w = levelSize.x, h = levelSize.y;
    new PhysicsObject(vec2(-.5,h/2),  vec2(1,100)); // left wall
    new PhysicsObject(vec2(w+.5,h/2), vec2(1,100)); // right wall
    new PhysicsObject(vec2(w/2,h+.5), vec2(100,1)); // top wall
}

function gameUpdate()
{
    if (!ball || ball.pos.y < -1) // spawn ball
    {
        ball && ball.destroy(); // destroy old ball
        ball = new PhysicsObject(cameraPos); // create a ball
        ball.velocity = vec2(.2); // give ball some movement
        ball.restitution = 1; // make ball bounce
        ball.mass = 1; // make ball have dynamic physics
    }

    paddle.pos.x = mousePos.x; // move paddle to mouse
}

/* info
Pong for one: a ball bounces around a walled court and you keep it in
play with a paddle that follows the mouse. Miss it and a new ball starts
from the middle.

## How it works
Everything on screen is an `EngineObject`, and the engine's physics does
the bouncing. There is no drawing code either: an object with no tile
draws as a rectangle of its size.

### PhysicsObject
One small class makes the paddle, the walls and the ball.

- `super(pos, size)` places the object. The position is its center,
  and the size is in world units, one unit square when left out.
- `setCollision()` turns collision on. With no arguments the object
  collides with solid objects and is solid itself.
- `mass = 0` makes it static: nothing pushes it, and moving objects
  collide with it. That suits the walls and the paddle.

### gameInit
The court is 38 by 21 units with its bottom left corner at `vec2(0,0)`,
and the camera is put at its center. `canvasFixedSize` makes the canvas
1280 by 720 whatever the window's size, scaled to fit it.

The walls sit just outside the court, their centers half a unit past
each edge, and are 100 units long so the corners have no gaps. There is
no wall at the bottom, which is where the ball is lost.

### gameUpdate
This runs 60 times a second. When there is no ball yet, or it has gone
below the court, a new one is made at the camera's position:

- `velocity = vec2(.2)` sends it up and to the right. Velocity is in
  world units per frame, so .2 is 12 units a second on each axis.
- `restitution = 1` has it keep all its speed at a bounce.
- `mass = 1` makes it dynamic: the physics moves it and bounces it off
  the static objects.

`ball.destroy()` removes the old ball, which would otherwise fly on for
ever below the court.

The last line puts the paddle under the mouse. `mousePos` is the mouse
in world units, so no conversion is needed.

## Try it
- Make the paddle wider: `vec2(6,1)` to `vec2(12,1)`.
- Start the ball at a steeper angle with `vec2(.1,.3)`.
- Set `restitution` to `1.05`: the ball gets faster at every bounce.
- Add `gravity.y = -.005;` to `gameInit` and the ball falls in arcs.
- Color the paddle after it is made: `paddle.color = hsl(.6,1,.5);`

## See also
Breakout Game in the full examples grows this into a game with bricks,
a score and sound. Flappy Game and Lander Game are the next mini games.
*/
