class Cube extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.boxMesh);
        this.scale3D = vec3(.5);
        this.color = hsl(rand(),.7,.6);
        this.angleVelocity3D = randVector3(.02);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.4,.1), hsl(.7,.3,.3));
    render3D.setFog(30, 80);
    new CameraControl3D(vec3(), 40, .3, .002);

    // make a cloud of cubes sharing the same mesh
    const cubeCount = 5000;
    for (let i = cubeCount; i--;)
        new Cube(randVector3(rand(4, 30)));
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles instancing
        render3D.instancing = !render3D.instancing;
}

function gameRenderPost()
{
    const state = render3D.instancing ? 'on' : 'off';
    const text = `space: instancing (${state}) / draws: ${drawCount}`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}
