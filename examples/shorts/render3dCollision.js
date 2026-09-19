const arenaSize = 16;
const boxPos = vec3(3,1,0), boxSize = vec3(3,2,3);
const cylinderPos = vec3(-3,1.5,0), cylinderRadius = 1.2, cylinderHeight = 3;
let ballMesh, balls = [], orbit = 0;

class Ball extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, ballMesh);
        this.color = hsl(rand(),.7,.6);
        this.radius = rand(.4,.8);
        this.scale3D = vec3(this.radius*2);
        this.softShadow = this.radius*2;
        this.velocity3D = randVector3(.1);
        this.mass = 1; // falls with render3D.gravity
        this.restitution = .6;
        this.collideSolid3D = true; // balls push each other apart
    }
    update()
    {
        // bounce off the floor and walls, then the box and the cylinder
        const p = this.pos3D, r = this.radius, limit = arenaSize/2 - r;
        const inside = vec3(clamp(p.x, -limit, limit), max(p.y, r), clamp(p.z, -limit, limit));
        if (p.distance(inside))
            this.bounce(inside.subtract(p));
        const hit = collideSphereBox(this.pos3D, r, boxPos, boxSize)
            || collideSphereCylinder(this.pos3D, r, cylinderPos, cylinderRadius, cylinderHeight);
        if (hit)
            this.bounce(hit);
    }
    bounce(pushOut)
    {
        // move out and reflect off the push direction
        this.pos3D = this.pos3D.add(pushOut);
        this.velocity3D = this.velocity3D.reflect(pushOut.normalize(), this.restitution);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.gravity = vec3(0,-.01);

    // a checkerboard floor, flat so the cells stay crisp
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 8, checker));
    render3D.smoothShading = true;

    // a box, a cylinder and a dozen balls, builders take full sizes and collision takes radii
    new EngineObject3D(boxPos, buildBox(boxSize).setColor(hsl(.1,.4,.5)));
    const cylinder = buildCylinder(cylinderRadius*2, cylinderHeight, 16);
    new EngineObject3D(cylinderPos, cylinder.setColor(hsl(.6,.3,.5)));
    ballMesh = buildSphere();
    for (let i = 12; i--;)
    {
        const pos = vec3(rand(-6,6), rand(3,8), rand(-6,6));
        balls.push(new Ball(pos));
    }
}

function gameUpdate()
{
    // pick the ball under the mouse, click to toss it up
    const ray = render3D.screenToRay(mousePosScreen);
    const picked = render3D.raycastObjects(ray, balls)?.object;
    if (picked)
    {
        debugSphere3D(picked.pos3D, picked.radius*2 + .2, YELLOW);
        if (mouseWasPressed(0))
            picked.velocity3D = picked.velocity3D.add(vec3(rand(-.1,.1), .3, rand(-.1,.1)));
    }

    // right drag to orbit, the left button tosses balls
    orbit += mouseIsDown(2) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,1,0), 16, orbit, .5);
}

function gameRenderPost()
{
    const text = 'hover: pick a ball / click: toss it / right drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
