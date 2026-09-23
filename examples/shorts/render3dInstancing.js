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

    // make a cloud of cubes sharing the same mesh, batched again each frame
    const cubeCount = 5000;
    for (let i = cubeCount; i--;)
        new Cube(randVector3(rand(4, 30)));

    // a shell of many more cubes kept on the GPU, they cost nothing until moved
    const shell = new InstancedMesh3D(render3D.boxMesh, 20000);
    for (let i = 0; i < shell.count; ++i)
    {
        const pos = randVector3(rand(35, 60)), rotation = randVector3(PI);
        shell.setMatrixAt(i, buildMatrix(pos, rotation, vec3(.4)));
        shell.setColorAt(i, hsl(rand(), .4, .5));
    }
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
    const note = '5000 cubes batched each frame, 20000 more kept on the GPU';
    drawTextScreen(note, vec2(mainCanvasSize.x/2, 75), 20);
}
