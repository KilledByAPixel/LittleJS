// Render3D plugin with the math3d collision helpers: balls bouncing off each other, a box and a cylinder, mouse picking

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
        // gravity, floor and walls
        const v = this.velocity3D, r = this.radius;
        v.y -= .01;
        this.pos3D = this.pos3D.add(v);
        const p = this.pos3D;
        if (p.y < r)
            p.y = r, v.y = abs(v.y) * .8;
        for (const axis of ['x', 'z'])
            if (abs(p[axis]) > 8 - r)
                p[axis] = sign(p[axis]) * (8 - r), v[axis] *= -.8;

        // push out of the box and the cylinder
        const boxHit = collideSphereBox(p, r, boxPos, boxSize);
        if (boxHit)
            this.bounce(boxHit);
        const cylinderHit = collideSphereCylinder(p, r, cylinderPos, cylinderRadius, cylinderHeight);
        if (cylinderHit)
            this.bounce(cylinderHit);
    }
    bounce(pushOut)
    {
        // move out and reflect the velocity along the push direction
        this.pos3D = this.pos3D.add(pushOut);
        const n = pushOut.normalize();
        this.velocity3D = this.velocity3D.subtract(n.scale(2 * this.velocity3D.dot(n))).scale(.8);
    }
}

let ballMesh, floorMesh, boxMesh, cylinderMesh, balls = [], picked, orbit = 0;
const boxPos = vec3(3, 1, 0), boxSize = vec3(3, 2, 3);
const cylinderPos = vec3(-3, 1.5, 0), cylinderRadius = 1.2, cylinderHeight = 3;

function gameInit()
{
    new Render3DPlugin;
    setRender3DSmoothShading(true);
    render3D.sky = buildSky(rgb(.2, .3, .6), rgb(.7, .8, .9));
    render3D.ambientColor = rgb(.4, .4, .45);
    ballMesh = buildSphere(12, 6);
    floorMesh = buildGrid(16, 16, 8, 8, undefined, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? rgb(.5, .5, .5) : rgb(.4, .4, .4), false);
    boxMesh = buildBox(boxSize);
    cylinderMesh = buildLathe([[cylinderRadius, -cylinderHeight / 2], [cylinderRadius, cylinderHeight / 2]], 16);
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
        if (picked)
        {
            // a ring around the picked ball, drawn as a line loop
            const r = picked.radius + .2;
            for (let i = 0; i < 16; ++i)
            {
                const a = i / 16 * 2 * PI, b = (i + 1) / 16 * 2 * PI;
                render3D.drawLine3D(picked.pos3D.add(vec3(Math.sin(a) * r, 0, Math.cos(a) * r)),
                    picked.pos3D.add(vec3(Math.sin(b) * r, 0, Math.cos(b) * r)), .08, YELLOW);
            }
        }
    };
}

function gameUpdate()
{
    // balls push each other apart
    for (const a of balls)
    for (const b of balls)
    {
        if (a === b) continue;
        const pushOut = collideSphereSphere(a.pos3D, a.radius, b.pos3D, b.radius);
        if (pushOut)
            a.bounce(pushOut.scale(.5));
    }

    // pick the nearest ball under the mouse, click to toss it up
    const ray = render3D.screenToRay(mousePosScreen);
    picked = undefined;
    let nearest = Infinity;
    for (const b of balls)
    {
        const t = raycastSphere(ray.pos, ray.direction, b.pos3D, b.radius);
        if (t !== undefined && t < nearest)
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
    drawTextScreen('Render3D collision - sphere, box and cylinder helpers, hover to pick, click to toss, right drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
