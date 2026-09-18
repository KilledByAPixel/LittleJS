// Render3D plugin: shape builders, lighting, fog, sky and the shading toggle

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

let floorMesh, spinners = [], orbit = 0;

function buildShapes()
{
    // every builder takes the shading from render3DSmoothShading unless told otherwise
    const meshes = [
        buildBox(vec3(1.5)),
        buildLathe([[0, -1], [1, 0], [0, 1]], 4),                 // octahedron
        buildLathe([[.5, -1], [.5, 1]], 12),                      // cylinder
        buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 10), // vase
        buildSphere(),
        buildLoft([[1.2, .2, .2, -.1], [0, .7, .5, -.4], [-1, .5, .3, -.3]]), // hull, always flat
    ];
    spinners.forEach((s, i)=> { s.mesh?.dispose(); s.mesh = meshes[i]; });
    floorMesh?.dispose();
    floorMesh = buildGrid(30, 30, 30, 30, (x, z)=> Math.sin(x / 3) * Math.cos(z / 3) * .4,
        (x, z)=> hsl(.3, .5, .35 + Math.sin(x / 3) * Math.cos(z / 3) * .1));
}

function gameInit()
{
    new Render3DPlugin;
    render3D.sky = buildSky(rgb(.2, .4, .9), rgb(.8, .9, 1));
    render3D.fogColor = rgb(.8, .9, 1);
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.lightDirection = vec3(-.5, -1, -.3).normalize();
    render3D.ambientColor = rgb(.35, .35, .4);

    // a ring of shapes, meshes are assigned by buildShapes
    for (let i = 0; i < 6; ++i)
    {
        const a = i / 6 * 2 * PI;
        const spinner = new Spinner(vec3(Math.sin(a) * 5, 1.5, Math.cos(a) * 5), undefined, hsl(i / 6, .7, .6), .01 + i * .004);
        spinner.scale3D = vec3(1.5);
        spinners.push(spinner);
    }
    buildShapes();

    // draw the floor outside of objects, in the opaque stage
    render3D.onRender = ()=> floorMesh.render();

    // shadows go in the transparent stage
    render3D.onRenderTransparent = ()=>
    {
        for (const s of spinners)
            render3D.drawShadow(s.pos3D, 1.5, Math.sin(s.pos3D.x / 3) * Math.cos(s.pos3D.z / 3) * .4);
    };
}

function gameUpdate()
{
    // space toggles smooth shading and rebuilds every shape
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        buildShapes();
    }
    render3D.specular = keyIsDown('KeyS') ? 1 : 0;

    // orbit the camera, drag to turn it
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.pos = vec3(Math.sin(orbit) * 12, 6, Math.cos(orbit) * 12);
    render3D.camera.lookAt(vec3(0, 1, 0));
}

function gameRenderPost()
{
    const shading = render3DSmoothShading ? 'smooth' : 'flat';
    drawTextScreen('Render3D shapes - space toggles ' + shading + ' shading, hold S for specular, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
