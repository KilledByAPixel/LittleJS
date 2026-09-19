const boxPos = vec3(3, 1, 0), boxSize = vec3(3, 2, 3);
const cylinderPos = vec3(-3, 1.5, 0), cylinderRadius = 1.2, cylinderHeight = 3;
let ballMesh, balls = [], picked, orbit = 0;

class Ball extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, ballMesh, undefined, hsl(rand(), .7, .6));
        this.radius = rand(.4, .8);
        this.scale3D = vec3(this.radius * 2);
        this.velocity3D = vec3(rand(-.1, .1), 0, rand(-.1, .1));
    }
    update()
    {
        // gravity, then bounce off the floor, the walls, the box and the cylinder
        const p = this.pos3D, r = this.radius;
        this.velocity3D.y -= .01;
        if (p.y < r)
            this.bounce(vec3(0, r - p.y, 0));
        if (abs(p.x) > 8 - r)
            this.bounce(vec3(sign(p.x) * (8 - r) - p.x, 0, 0));
        if (abs(p.z) > 8 - r)
            this.bounce(vec3(0, 0, sign(p.z) * (8 - r) - p.z));
        const hit = collideSphereBox(p, r, boxPos, boxSize) || collideSphereCylinder(p, r, cylinderPos, cylinderRadius, cylinderHeight);
        if (hit)
            this.bounce(hit);
    }
    bounce(pushOut)
    {
        // move out and reflect the velocity off the push direction, losing a little energy
        this.pos3D = this.pos3D.add(pushOut);
        this.velocity3D = this.velocity3D.reflect(pushOut.normalize(), .6);
    }
}

function gameInit()
{
    new Render3DPlugin;
    setRender3DSmoothShading(true);
    render3D.setSky(rgb(.2, .3, .6), rgb(.7, .8, .9));
    render3D.ambientColor = rgb(.4, .4, .45);

    // a checkerboard floor (flat for crisp cells), a box, a cylinder and a dozen balls
    new EngineObject3D(vec3(), buildGrid(vec2(16), 8, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? rgb(.5, .5, .5) : rgb(.4, .4, .4), undefined, false));
    new EngineObject3D(boxPos, buildBox(boxSize), undefined, rgb(.6, .4, .3));
    new EngineObject3D(cylinderPos, buildCylinder(cylinderRadius * 2, cylinderHeight, 16), undefined, rgb(.3, .5, .6));
    ballMesh = buildSphere();
    for (let i = 0; i < 12; ++i)
        balls.push(new Ball(vec3(rand(-6, 6), rand(3, 8), rand(-6, 6))));
    render3D.onRenderTransparent = ()=> balls.forEach(b => render3D.drawShadow(b.pos3D, b.radius * 2));
}

function gameUpdate()
{
    // balls push each other apart
    for (const a of balls)
    for (const b of balls)
        if (a !== b)
        {
            const pushOut = collideSphereSphere(a.pos3D, a.radius, b.pos3D, b.radius);
            if (pushOut)
                a.bounce(pushOut.scale(.5));
        }

    // pick the ball under the mouse by its bounding sphere, show it with a debug sphere, click to toss it up
    const ray = render3D.screenToRay(mousePosScreen);
    picked = render3D.raycastObjects(ray.origin, ray.direction, balls)?.object;
    if (picked)
    {
        debugSphere3D(picked.pos3D, picked.radius * 2 + .2, YELLOW);
        if (mouseWasPressed(0))
            picked.velocity3D = picked.velocity3D.add(vec3(rand(-.1, .1), .3, rand(-.1, .1)));
    }

    // slow orbit, right drag to turn
    orbit += mouseIsDown(2) ? -mouseDeltaScreen.x * .01 : .002;
    render3D.camera.orbit(vec3(0, 1, 0), 16, orbit, .5);
}

function gameRenderPost()
{
    drawTextScreen('3D collision - hover to pick a ball, click to toss it, right drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
