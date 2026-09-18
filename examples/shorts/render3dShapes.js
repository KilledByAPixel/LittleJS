class Spinner extends EngineObject3D
{
    constructor(pos, color, speed)
    {
        super(pos, undefined, color);
        this.speed = speed;
        this.scale3D = vec3(1.5);
    }
    update()
    {
        this.rotation3D.y += this.speed;
        this.rotation3D.x += this.speed / 3;
    }
}

let spinners = [], orbit = 0;

function buildShapes()
{
    // every builder takes its shading from render3DSmoothShading unless told otherwise
    const meshes = [
        buildBox(vec3(1.5)),
        buildLathe([[0, -1], [1, 0], [0, 1]], 4),                          // octahedron
        buildCylinder(.5, 2),
        buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 10),  // vase
        buildSphere(),
        buildLoft([[1.2, .2, .2, -.1], [0, .7, .5, -.4], [-1, .5, .3, -.3]]), // hull, always flat
        buildTorus(.7, .25),
        buildCone(.7, 1.6),
        buildCapsule(.4, 1),
    ];
    spinners.forEach((s, i)=> { s.mesh?.dispose(); s.mesh = meshes[i]; });
}

function gameInit()
{
    new Render3DPlugin;
    render3D.shadows = true; // a shadow map from the sun, every lit opaque mesh casts and receives
    render3D.setSky(rgb(.2, .4, .9), rgb(.8, .9, 1));
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.lightDirection = vec3(-.5, -1, -.3).normalize();
    render3D.ambientColor = rgb(.35, .35, .4);

    // a checkerboard floor and a ring of shapes, buildShapes assigns their meshes
    new EngineObject3D(vec3(), buildGrid(30, 30, 15, 15, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? rgb(.35, .5, .35) : rgb(.3, .45, .3)));
    for (let i = 0; i < 9; ++i)
    {
        const a = i / 9 * 2 * PI;
        spinners.push(new Spinner(vec3(sin(a) * 6, 2.5, cos(a) * 6), hsl(i / 9, .7, .6), .01 + i * .003));
    }
    buildShapes();
    render3D.onRenderTransparent = ()=> spinners.forEach(s => render3D.drawShadow(s.pos3D, 1.5));
}

function gameUpdate()
{
    // space toggles smooth shading and rebuilds every shape, S adds specular
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        buildShapes();
    }
    render3D.specular = keyIsDown('KeyS') ? 1 : 0;

    // orbit the camera, drag to turn it
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x * .01 : .003;
    render3D.camera.orbit(vec3(0, 1, 0), 15, orbit, .4);
}

function gameRenderPost()
{
    const shading = render3DSmoothShading ? 'smooth' : 'flat';
    drawTextScreen('3D shapes - space toggles ' + shading + ' shading, hold S for specular, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
