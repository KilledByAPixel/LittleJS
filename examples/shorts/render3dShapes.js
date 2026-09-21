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

let spinners = [];

function buildShapes()
{
    // create each type of shape mesh
    const meshes =
    [
        buildBox(vec3(1)),
        buildLathe([[0,-1], [1,0], [0,1]], 4),
        buildCylinder(1, 2),
        buildLathe([[0,-1], [.4,-.2], [.7,.2], [.4,.6], [0,1]], 8),
        buildSphere(),
        buildLoft([[1,.4,.2,-.1], [0,2,.5,-.4], [-1,1,.3,-.3]]),
        buildTorus(1.4, .5),
        buildCone(1.4, 1.6),
        buildCapsule(.8, 2)
    ];

    // make a spinner for each shape
    spinners.forEach((s, i)=> s.setMesh(meshes[i]));
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky();
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 15, .4, .003);

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
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        buildShapes();
    }
    for (const s of spinners) // S toggles specular
        s.specular = keyIsDown('KeyS');
}

function gameRenderPost()
{
    const shading = render3D.smoothShading ? 'smooth' : 'flat';
    const text = `space: shading (${shading}) / hold S: specular`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
