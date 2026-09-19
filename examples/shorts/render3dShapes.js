class Spinner extends EngineObject3D
{
    constructor(pos, color)
    {
        super(pos);
        this.color = color;
        this.scale3D = vec3(1.5);
        this.angleVelocity3D = vec3(.01, .02);
    }
}

let spinners = [], orbit = 0;

function buildShapes()
{
    // builders use render3D.smoothShading by default
    const box = buildBox(vec3(1));
    const oct = buildLathe([[0,-1], [1,0], [0,1]], 4);
    const cylinder = buildCylinder(1, 2);
    const vase = buildLathe([[0,-1], [.4,-.2], [.7,.2], [.4,.6], [0,1]], 8);
    const sphere = buildSphere();
    const hull = buildLoft([[1,.4,.2,-.1], [0,2,.5,-.4], [-1,1,.3,-.3]]);
    const torus = buildTorus(1.4, .5);
    const cone = buildCone(1.4, 1.6);
    const capsule = buildCapsule(.8, 2);

    // create the spinners
    const meshes = 
        [box, oct, cylinder, vase, sphere, hull, torus, cone, capsule];
    spinners.forEach((s, i)=> s.mesh = meshes[i]);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.2,.4,.9), rgb(.8,.9,1));
    render3D.shadows = true;
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.lightDirection = vec3(-.5,-1,-.3).normalize();
    render3D.ambientColor = rgb(.35,.35,.4);

    // checkerboard floor
    const checker = (x, z)=> hsl(.3, .2, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, checker));

    // ring of shapes
    for (let i = 9; i--;)
    {
        const a = i/9*2*PI;
        const pos = vec3(6, 3).rotateY(a);
        const spinner = new Spinner(pos, hsl(i/9,.7,.6));
        spinners.push(spinner);
    }
    buildShapes();
}

function gameUpdate()
{
    // space toggles shading, S toggles specular
    if (keyWasPressed('Space'))
    {
        render3D.smoothShading = !render3D.smoothShading;
        buildShapes();
    }
    for (const s of spinners)
        s.specular = keyIsDown('KeyS');

    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .003;
    render3D.camera.orbit(vec3(0,1,0), 15, orbit, .4);
}

function gameRenderPost()
{
    const shading = render3D.smoothShading ? 'smooth' : 'flat';
    const text = 'space: ' + shading + ' shading / hold S: specular';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
