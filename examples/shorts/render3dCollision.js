const arenaPos = vec3(0,8,0), arenaSize = vec3(16);
const boxPos = vec3(3,1,0), boxSize = vec3(3,2,3);
const cylinderPos = vec3(-3,1.5,0), cylinderRadius = 1, cylinderHeight = 3;
let balls = [];

class Ball extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.sphereMesh);
        this.color = hsl(rand(),.7,.6);
        this.radius = rand(.4,.8);
        this.scale3D = vec3(this.radius*2);
        this.softShadow = 1; // scaled by scale3D
        this.velocity3D = randVector3(.1);
        this.mass = 1; // enable gravity
        this.restitution = .6; // bounciness
        this.collideAsSphere3D = true;
        this.setCollision(); // enable collision
    }
    update()
    {
        // stay in the arena and bounce off stuff
        const inside = collideSphereInBox(
            this.pos3D, this.radius, arenaPos, arenaSize);
        if (inside)
            this.bounce(inside);
        const hit = collideSphereCylinder(this.pos3D, this.radius,
            cylinderPos, cylinderRadius, cylinderHeight);
        if (hit)
            this.bounce(hit);
    }
    bounce(pushOut)
    {
        // move out, and reflect off the push direction when moving into it
        const normal = pushOut.normalize();
        this.pos3D = this.pos3D.add(pushOut);
        if (this.velocity3D.dot(normal) < 0)
            this.velocity3D = this.velocity3D.reflect(normal,
                this.restitution);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.gravity.y = -.01;
    new CameraControl3D(vec3(0,1,0), 16, .5, .002);

    // checkerboard floor
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize.x), 8, checker));
    render3D.smoothShading = true;

    // make a solid box
    const box = new EngineObject3D(boxPos, render3D.boxMesh);
    box.color = hsl(0,.4,.5);
    box.scale3D = boxSize; // scales the collision too
    box.setCollision();

    // make a cylinder
    const cylinderMesh = buildCylinder(cylinderRadius*2, cylinderHeight);
    new EngineObject3D(cylinderPos, cylinderMesh.setColor(hsl(.6,.3,.5)));

    // make the balls
    for (let i = 12; i--;)
    {
        const pos = vec3(rand(-6,6), rand(3,8), rand(-6,6));
        balls.push(new Ball(pos));
    }
}

function gameUpdate()
{
    // pick the ball under the mouse
    const picked = render3D.pick(mousePosScreen, balls)?.object;
    if (picked)
    {
        debugSphere3D(picked.pos3D, picked.radius*2 + .2, YELLOW);
        if (mouseWasPressed(2)) // right click tosses it up
            picked.velocity3D = vec3(rand(-.1,.1), .5, rand(-.1,.1));
    }
}

function gameRenderPost()
{
    const text = 'hover: pick a ball / right click: toss it';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}

/* info
Twelve balls fall and bounce in an arena with a box and a cylinder in
it, off the floor, the walls, the two shapes and each other. Move the
mouse over a ball to pick it, and right click to toss it up. Drag to
turn the camera and roll the wheel to zoom.

## How it works
The example collides in two ways. The engine does the balls against each
other and against the box, because those are solid objects. The arena
and the cylinder are done by hand in the ball's `update`, with helper
functions from the 3D math plugin.

### Solid objects
- `setCollision()` on a 3D object makes it solid, and solid objects push
  each other apart in 3D. Each one collides as a box of its `size3D`,
  which starts at the size of its mesh and grows with `scale3D`.
- `collideAsSphere3D = true` has a ball collide as the sphere that fits
  that box.
- `mass = 1` makes a ball dynamic: `render3D.gravity` is added to its
  `velocity3D` every frame, and collisions move it. The box keeps the
  mass of 0 a 3D object starts with, so it never moves.
- `restitution = .6` is how much speed a ball keeps at a bounce.

`randVector3(.1)` starts each ball with a speed of .1 units per frame in
a random direction. `softShadow = 1` draws a soft disc on the floor
under it, which grows with the ball's `scale3D`.

### Collision by hand
The helpers take plain positions and sizes, not objects, and each
returns the vector that moves the sphere clear, or `undefined` when
there is no touch. They take a radius where the builders take full
sizes, so `Ball` keeps its `radius` and scales its mesh by twice that.

- `collideSphereInBox(pos, radius, boxPos, boxSize)` keeps a sphere
  inside a box. The arena is 16 units each way and centered 8 up, so its
  bottom is the floor at y 0.
- `collideSphereCylinder` takes the sphere, then the cylinder's center,
  its radius and its full height, and pushes the sphere out of a
  cylinder that stands on the y axis.

`bounce` uses the push: it moves the ball by it, and reflects the
velocity off the push's direction with `reflect(normal, restitution)`.
It reflects only when `velocity3D.dot(normal)` is below 0, when the
ball moves into the surface: a ball pushed out while already moving
away keeps going, rather than being turned back into it.
`update` runs after the engine has moved and collided every object, so
the ball is back out before it is drawn.

The cylinder on screen is only a mesh from `buildCylinder`, which takes
the diameter, hence `cylinderRadius*2`. It has no collision set.

### Picking
`render3D.pick(mousePosScreen, balls)` finds the nearest of the given
objects under a screen position and returns `{object, distance}`, or
`undefined`. Each object is tested on the triangles of its mesh.
`debugSphere3D(pos, size, color)` draws a wire sphere for one frame, in
debug builds only, and a right click sets the picked ball's velocity to
.5 upward with a little sideways.

## Try it
- Set `restitution` to `.95` and the balls keep bouncing much longer.
- Make 40 balls: `let i = 12` to `let i = 40`.
- Weaken the gravity: `-.01` to `-.002`.
- Stretch the box: `boxSize = vec3(3,2,3)` to `vec3(6,2,3)`. The
  collision follows, since it comes from `scale3D`.

## See also
3D Puzzle Game uses picking in a game, and 3D First Person walks among
solid walls. 3D Height Map and 3D Voxels are levels to collide with.
Other helpers to look up: `collideSphereBox`, `collideSphereSphere`,
`collideBoxBox3D` and `raycastSphere`.
*/
