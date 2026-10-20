let ball, camera;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.gravity.y = -.02;

    // a floor, and blocks to run around and hide behind
    const floor = new EngineObject3D(vec3(0, -.5, 0), render3D.boxMesh);
    floor.color = hsl(.3, .3, .5);
    floor.scale3D = vec3(40, 1, 40);
    floor.setCollision();
    for (let i = 16; i--;)
    {
        const pos = vec3(rand(-16, 16), 1.5, rand(-16, 16));
        const block = new EngineObject3D(pos, render3D.boxMesh);
        block.color = hsl(rand(), .5, .6);
        block.scale3D = vec3(rand(1, 4), 3, rand(1, 4));
        block.setCollision();
    }

    // the player, a ball that runs the way the camera looks
    ball = new EngineObject3D(vec3(0, 1, 0), render3D.sphereMesh);
    ball.color = hsl(0, .7, .5);
    ball.mass = 1; // gravity pulls it
    ball.collideAsSphere3D = true;
    ball.setCollision();

    // the camera on a pole behind the ball
    camera = new ThirdPersonCamera3D(ball);
}

function gameUpdate()
{
    // the keys run the way the camera faces, Space jumps
    const input = keyDirection();
    const move = vec3(input.x, 0, -input.y).clampLength(1).scale(.15)
        .rotateY(camera.yaw);
    ball.velocity3D = vec3(move.x, ball.velocity3D.y, move.z);
    if (ball.groundObject && keyWasPressed('Space'))
        ball.velocity3D.y = .4;
}

function gameRenderPost()
{
    const text = 'WASD to run, Space to jump, right drag to look';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 30);
}

/* info
A ball running around a field of blocks, seen from behind by a third
person camera. WASD or the arrow keys run, Space jumps, and dragging
with the right mouse button turns the camera.

## How it works
`new ThirdPersonCamera3D(ball)` puts the camera on a pole. The pole
starts at a pivot one unit over the ball, `pivotOffset`, goes back
`distance` units at angles `yaw` and `pitch`, and the camera sits at
its end looking at the pivot. It sets `render3D.camera` each frame,
after the objects have moved.

### The swing
With `autoSwing`, on by default, the camera swings around behind the
way the ball runs, so running sideways turns the view the way a 3D
platformer does. It swings only while the ball moves, so standing
still or jumping leaves it where it is. Turning it by hand, the right
mouse drag or a gamepad's right stick, holds the swing for a second.

### The keys
The keys move the ball the way the camera faces: the arrow vector is
turned by `camera.yaw` with `rotateY`. Its `y` is kept, so gravity
still pulls it, and Space jumps only while `groundObject` says it
stands on something.

### Walls
Run behind a block and the camera pulls in, staying in front of it so
the ball is never hidden, then eases back out when it is clear. That
is `collideWalls`, which looks along the pole with `render3D.pick`.

## Try it
- A shooter camera that turns only by hand: in `gameInit` add
  `camera.autoSwing = false;`.
- A looser swing: add `camera.swingSmoothing = 2;`.
- A longer pole, higher up: `new ThirdPersonCamera3D(ball)` to
  `new ThirdPersonCamera3D(ball, 10, .6)`.
- Let the camera go through blocks: add
  `camera.collideWalls = false;`.

## See also
3D First Person is the camera at the eye instead, and 3D Collision
orbits the camera around a point. Camera Shake shakes the view.
*/
