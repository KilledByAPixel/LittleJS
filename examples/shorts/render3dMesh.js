// a small OBJ model, the text any modeler exports: a house with a quad roof
const houseOBJ = `
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 1.2 -1
v  1 1.2 -1
v  1 1.2  1
v -1 1.2  1
v  0 2.2 -1.2
v  0 2.2  1.2
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
f 1 2 3 4
f 5 8 10 9
f 7 6 9 10
f 5 9 6
f 7 10 8
`;

let model, modelName = 'house';

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.7,.6), hsl(.6,.6,.9));
    render3D.setFog(20, 50);
    render3D.shadows = true;
    new CameraControl3D(vec3(0,2,0), 10, .35); // no idle spin, the model is for inspecting

    // checkerboard floor and the model
    const checker = (x, z)=> hsl(.3, .2, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, checker));
    model = new EngineObject3D(vec3());
    model.color = hsl(.1,.6,.7);
    model.angleVelocity3D = vec3(0, .005);
    setModel(parseOBJ(houseOBJ));

    // drop any .obj file on the page to see it
    const stop = (e)=> e.preventDefault();
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', async (e)=>
    {
        stop(e);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        setModel(parseOBJ(await file.text()));
        modelName = file.name;
    });
}

// center the model, make it 4 units across, and stand it on the floor
function setModel(mesh)
{
    model.setMesh(mesh.center().fit(4)); // frees the model it replaces
    model.pos3D = vec3(0, -mesh.getBounds().min.y);
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        model.mesh.computeNormals(render3D.smoothShading);
    }
}

function gameRenderPost()
{
    const text = 'drop an .obj file here / space: toggle shading / ' + modelName;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
