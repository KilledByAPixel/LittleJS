// thousands of tumbling cubes, all of them in one draw call
const cubeCount = 5000;
let orbit = 0;

class Cube extends EngineObject3D
{
    constructor(pos, mesh)
    {
        super(pos, mesh);
        this.color = hsl(rand(),.7,.6);
        this.angleVelocity3D = randVector3(.02);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.4,.1), hsl(.7,.3,.3));
    render3D.setFog(30, 80);
    render3D.ambientColor = hsl(.6,.2,.3);

    // a cloud of cubes sharing one mesh
    const cube = buildBox(.6);
    for (let i = cubeCount; i--;)
        new Cube(randVector3(rand(4, 30)), cube);
}

function gameUpdate()
{
    // space toggles instancing, watch the draw calls change
    if (keyWasPressed('Space'))
        render3D.instancing = !render3D.instancing;
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(), 40, orbit, .3);
}

function gameRenderPost()
{
    const state = render3D.instancing ? 'on' : 'off';
    const text = 'space: toggle instancing / instancing ' + state + ' / draw calls: ' + drawCount;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}
