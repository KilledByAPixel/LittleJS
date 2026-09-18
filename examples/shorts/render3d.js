class Spinner extends EngineObject3D
{
    constructor(pos, mesh, color, speed)
    {
        super(pos, mesh, color);
        this.speed = speed;
    }
    update()
    {
        this.rotation3D.y += this.speed;
        this.rotation3D.x += this.speed / 3;
    }
}

class Glow extends EngineObject3D
{
    constructor(pos)
    {
        super(pos);
        this.transparent = true;
    }
    render3D()
    {
        // an additive soft disc facing the camera, unlit so the color reads as is
        render3D.lighting = false;
        render3D.additive = true;
        render3D.drawSoftDisc(this.pos3D, render3D.cameraForward.scale(-1), 1.5, rgb(1, .6, .2));
        render3D.lighting = true;
        render3D.additive = false;
    }
}

let floorMesh, orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    canvasClearColor = hsl(.6, .5, .7);
    render3D.fogStart = 10;
    render3D.fogEnd = 40;
    render3D.lightDirection = vec3(-.5, -1, -.3).normalize();
    render3D.ambientColor = rgb(.35, .35, .4);

    // static world: a rolling floor with color by height
    floorMesh = buildGrid(40, 40, 40, 40,
        (x, z)=> Math.sin(x / 3) * Math.cos(z / 3) * .5,
        (x, z)=> hsl(.3, .6, .35 + Math.sin(x / 3) * Math.cos(z / 3) * .1));

    // draws outside of objects go here, between the opaque and transparent stages
    render3D.onRender = ()=>
    {
        floorMesh.render();

        // a ring of engine tile billboards, unlit so the sprite colors read as is
        render3D.lighting = false;
        for (let i = 0; i < 12; ++i)
        {
            const a = i / 12 * 2 * PI + time * .2;
            const pos = vec3(Math.sin(a) * 7, 1 + Math.sin(time * 2 + i), Math.cos(a) * 7);
            render3D.drawBillboard(pos, vec2(1.5), tile(i % 4, 16), hsl(i / 12, 1, .7));
        }
        render3D.lighting = true;
    };

    // some shapes
    const octahedron = buildLathe([[0, -1], [1, 0], [0, 1]], 4);
    const cylinder = buildLathe([[.5, -1], [.5, 1]], 12, true);
    new Spinner(vec3(-4, 1.5, 0), buildBox(vec3(1.5)), RED, .01);
    new Spinner(vec3(0, 1.5, 0), octahedron, YELLOW, .02);
    new Spinner(vec3(4, 1.5, 0), cylinder, CYAN, .015);
    const ball = new EngineObject3D(vec3(0, 3.5, -3), buildSphere());
    ball.scale3D = vec3(2);
    new Glow(vec3(0, 3.5, -3));
}

function gameUpdate()
{
    // orbit the camera, drag to turn it
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.pos = vec3(Math.sin(orbit) * 12, 6, Math.cos(orbit) * 12);
    render3D.camera.lookAt(vec3(0, 1, 0));
}

function gameUpdatePost() {}
function gameRender() {}

function gameRenderPost()
{
    // a 2D label pinned to the sphere, on top of the 3D scene
    const p = render3D.worldToScreen(vec3(0, 5.5, -3));
    if (p)
        drawTextScreen('sphere', p, 30, WHITE);
    drawTextScreen('Render3D plugin - drag to orbit', vec2(mainCanvasSize.x / 2, 40), 30);
}
