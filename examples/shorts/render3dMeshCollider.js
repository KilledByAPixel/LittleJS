let player, camera, balls = [];

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.gravity.y = -.02;

    // the level as one mesh: a floor, a ramp up to a ledge, stairs and walls
    const level = new Mesh;
    const part = (size, pos, rotation, color)=>
        level.combine(buildBox(size), buildMatrix(pos, rotation), color);
    part(vec3(30, 1, 30), vec3(0, -.5, 0), vec3(), hsl(.3, .3, .5));
    part(vec3(9, .5, 4), vec3(-4, 1.4, -6), vec3(0, 0, -.3), hsl(.1, .4, .6));
    part(vec3(6, 3, 6), vec3(-11, 1.5, -6), vec3(), hsl(.1, .3, .45));
    for (let i = 0; i < 8; ++i) // each step lower than the player's round foot
        part(vec3(1, .3 * (i + 1), 4), vec3(3 + i, .15 * (i + 1), 6),
            vec3(), hsl(.6, .3, .5 + i * .03));
    part(vec3(30, 3, 1), vec3(0, 1.5, -14.5), vec3(), hsl(0, 0, .6));
    part(vec3(1, 3, 30), vec3(14.5, 1.5, 0), vec3(), hsl(0, 0, .6));

    // seen as an object, collided with as a MeshCollider, the same mesh
    new EngineObject3D(vec3(), level);
    new MeshCollider(level);

    // the player, a capsule as tall as its box and as wide as it is across
    player = new EngineObject3D(vec3(0, 2, 0), buildBox());
    player.scale3D = vec3(.8, 1.6, .8);
    player.color = hsl(0, .7, .5);
    player.mass = 1;
    player.setCollision();

    camera = new ThirdPersonCamera3D(player);
}

function gameUpdate()
{
    // the keys run the way the camera faces, Space jumps
    const input = keyDirection();
    const move = vec3(input.x, 0, -input.y).clampLength(1).scale(.15)
        .rotateY(camera.yaw);
    player.velocity3D = vec3(move.x, player.velocity3D.y, move.z);
    if (player.groundObject && keyWasPressed('Space'))
        player.velocity3D.y = .4;

    // a ball every second over the ramp, which rolls down it
    if (frame % 60 == 0)
    {
        const pos = vec3(rand(-7, -3), 5, rand(-7, -5));
        const ball = new EngineObject3D(pos, render3D.sphereMesh);
        ball.color = hsl(rand(), .7, .6);
        ball.scale3D = vec3(.6);
        ball.collideAsSphere3D = true;
        ball.mass = 1;
        ball.groundAngle = .05; // only what is nearly flat holds it
        ball.setCollision(false, false);
        balls.push(ball);
        balls.length > 12 && balls.shift().destroy();
    }
}

function gameRenderPost()
{
    const text = 'WASD to run, Space to jump, right drag to look';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 30);
}

/* info
A small level made of one mesh: a ramp up to a ledge, stairs and walls,
which the player walks over and balls roll down. WASD or the arrow keys
run, Space jumps, and dragging with the right mouse button turns the
camera.

## How it works
`level` is one `Mesh` built from boxes with `combine`, each placed and
turned by `buildMatrix` and tinted its own color. The same mesh is used
twice: an `EngineObject3D` draws it, and `new MeshCollider(level)` makes
its triangles part of the level's collision. A collider draws nothing,
so the shape that collides need not be the one that shows: a level made
in a modeling program often has a simpler mesh for collision.

### Capsules
An object with `collideLevel`, which `setCollision` turns on, collides
with a `MeshCollider` as a capsule: as tall as its height and as wide
as its narrowest side, with a round foot. That round foot is what
climbs the stairs, each step lower than it is; a taller step would stop
the player as the walls do.

### Ground
A push off a surface within the object's `groundAngle` of level holds it
there and sets `groundObject`, which is what lets the player jump. The
player's is the default, so it stands on the ramp. The balls are
spheres, `collideAsSphere3D`, with a `groundAngle` of almost nothing, so
only the floor holds them and they slide down the ramp.

## Try it
- Make the stairs taller: change `.3 * (i + 1)` to `.6 * (i + 1)`, and
  the steps stop the player.
- Give the balls the default `groundAngle`: take out the line that sets
  it, and they stay where they land on the ramp.
- See what collides: press Escape for the debug overlay, then 1 for
  Debug Physics, and the collider's edges are drawn.

## See also
3D Third Person has the same camera on a ball on a field of blocks,
3D Height Map terrain from an image, and 3D Voxels a world of blocks.
*/
