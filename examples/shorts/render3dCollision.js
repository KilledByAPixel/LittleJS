// Render3D plugin with the math3d collision helpers: balls bouncing off each other, a box and a cylinder, mouse picking

const boxPos = vec3(3, 1, 0), boxSize = vec3(3, 2, 3);
const cylinderPos = vec3(-3, 1.5, 0), cylinderRadius = 1.2, cylinderHeight = 3;
let ballMesh, floorMesh, boxMesh, cylinderMesh, balls = [], picked, orbit = 0;

class Ball extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, ballMesh, hsl(rand(), .7, .6));
        this.radius = rand(.4, .8);
        this.scale3D = vec3(this.radius * 2);
        this.velocity3D = vec3(rand(-.1, .1), 0, rand(-.1, .1));
    }
    update()
    {
        // gravity, then bounce off the floor, the walls, the box and the cylinder
        const v = this.velocity3D, r = this.radius;
        v.y -= .01;
        this.pos3D = this.pos3D.add(v);
        const p = this.pos3D;
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
        // move out and reflect the velocity along the push direction
        this.pos3D = this.pos3D.add(pushOut);
        const n = pushOut.normalize();
        this.velocity3D = this.velocity3D.subtract(n.scale(2 * this.velocity3D.dot(n))).scale(.8);
    }
}

function gameInit()
{
    new Render3DPlugin;
    setRender3DSmoothShading(true);
    render3D.sky = buildSky(rgb(.2, .3, .6), rgb(.7, .8, .9));
    render3D.ambientColor = rgb(.4, .4, .45);
    ballMesh = buildSphere();
    floorMesh = buildGrid(16, 16, 8, 8, undefined, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? rgb(.5, .5, .5) : rgb(.4, .4, .4), false); // flat for crisp checkers
    boxMesh = buildBox(boxSize);
    cylinderMesh = buildCylinder(cylinderRadius, cylinderHeight, 16);
    for (let i = 0; i < 12; ++i)
        balls.push(new Ball(vec3(rand(-6, 6), rand(3, 8), rand(-6, 6))));

    render3D.onRender = ()=>
    {
        floorMesh.render();
        boxMesh.render(buildMatrix(boxPos), rgb(.6, .4, .3));
        cylinderMesh.render(buildMatrix(cylinderPos), rgb(.3, .5, .6));
    };
    render3D.onRenderTransparent = ()=>
    {
        for (const b of balls)
            render3D.drawShadow(b.pos3D, b.radius);
        if (picked) // a ring under the picked ball
            render3D.drawSoftDisc(picked.pos3D.add(vec3(0, .02 - picked.radius, 0)), vec3(0, 1, 0), picked.radius + .5, YELLOW);
    };
}

function gameUpdate()
{
    // balls push each other apart
    for (const a of balls)
    for (const b of balls)
    {
        const pushOut = a !== b && collideSphereSphere(a.pos3D, a.radius, b.pos3D, b.radius);
        if (pushOut)
            a.bounce(pushOut.scale(.5));
    }

    // pick the nearest ball under the mouse, click to toss it up
    const ray = render3D.screenToRay(mousePosScreen);
    let nearest = Infinity;
    picked = undefined;
    for (const b of balls)
    {
        const t = raycastSphere(ray.pos, ray.direction, b.pos3D, b.radius);
        if (t < nearest)
            nearest = t, picked = b;
    }
    if (picked && mouseWasPressed(0))
        picked.velocity3D = picked.velocity3D.add(vec3(rand(-.1, .1), .3, rand(-.1, .1)));

    // slow orbit, right drag to turn
    orbit += mouseIsDown(2) ? mouseDeltaScreen.x * .01 : .002;
    render3D.camera.pos = vec3(Math.sin(orbit) * 14, 8, Math.cos(orbit) * 14);
    render3D.camera.lookAt(vec3(0, 1, 0));
}

function gameRenderPost()
{
    drawTextScreen('3D collision - hover to pick a ball, click to toss it, right drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
