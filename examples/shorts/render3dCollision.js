const arenaSize = 16;
const boxPos = vec3(3,1,0), boxSize = vec3(3,2,3);
const cylinderPos = vec3(-3,1.5,0), cylinderRadius = 1, cylinderHeight = 3;
let balls = [];

class Ball extends EngineObject3D
{
    constructor(pos, mesh)
    {
        super(pos, mesh);
        this.color = hsl(rand(),.7,.6);
        this.radius = rand(.4,.8);
        this.scale3D = vec3(this.radius*2);
        this.softShadow = 1; // scaled by size3D
        this.velocity3D = randVector3(.1);
        this.mass = 1; // enable gravity
        this.restitution = .6; // bounciness
        this.collideAsSphere3D = true;
        this.setCollision(); // enable collision
    }
    update()
    {
        // bounce off the floor, walls, box, and cylinder
        const p = this.pos3D, r = this.radius, limit = arenaSize/2 - r;
        const inside = vec3
        (
            clamp(p.x, -limit, limit), 
            max(p.y, r), 
            clamp(p.z, -limit, limit)
        );
        if (p.distance(inside))
            this.bounce(inside.subtract(p));
        const hit = collideSphereCylinder(p, r, 
            cylinderPos, cylinderRadius, cylinderHeight);
        if (hit)
            this.bounce(hit);
    }
    bounce(pushOut)
    {
        // move out and reflect off the push direction
        const normal = pushOut.normalize();
        this.pos3D = this.pos3D.add(pushOut);
        this.velocity3D = this.velocity3D.reflect(normal, this.restitution);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.gravity = vec3(0,-.01);
    new CameraControl3D(vec3(0,1,0), 16, .5, .002);

    // checkerboard floor, built before smooth shading is enabled
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 8, checker));
    render3D.smoothShading = true;

    // make a solid box
    const boxMesh = buildBox(boxSize).setColor(hsl(0,.4,.5));
    const box = new EngineObject3D(boxPos, boxMesh);
    box.size3D = boxSize;
    box.setCollision();

    // make a cylinder
    const cylinderMesh = buildCylinder(cylinderRadius*2, cylinderHeight);
    new EngineObject3D(cylinderPos, cylinderMesh.setColor(hsl(.6,.3,.5)));

    // make the balls
    const ballMesh = buildSphere();
    for (let i = 12; i--;)
    {
        const pos = vec3(rand(-6,6), rand(3,8), rand(-6,6));
        balls.push(new Ball(pos, ballMesh));
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
