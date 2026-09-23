// an example obj model, a simple house with a roof
const houseOBJ = `
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 1.2 -1
v  1 1.2 -1
v  1 1.2  1
v -1 1.2  1
v  0 2.2 -.8
v  0 2.2  .8
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
    render3D.setSky();
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 10, .4);

    // checkerboard floor and the model
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .6 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, checker));
    model = new EngineObject3D(vec3());
    model.angleVelocity3D = vec3(0, .005);
    setModel(parseOBJ(houseOBJ), hsl(.1,.6,.7));

    // drop an .obj, .glb or .gltf file on the page to see it
    const stop = (e)=> e.preventDefault();
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', async (e)=>
    {
        stop(e);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        try
        {
            if (/\.obj$/i.test(file.name))
                setModel(parseOBJ(await file.text()), hsl(.1,.6,.7));
            else
            {
                // a glb has everything in one file; a gltf needs its
                // buffers and images inside it as data uris to work dropped
                const gltf = await parseGLTF(await file.arrayBuffer());
                setModel(gltf.mesh, WHITE, gltf.textureInfo);
            }
            modelName = file.name;
        }
        catch (error) { modelName = file.name + ' failed: ' + error.message; }
    });
}

// center the model, set scale and position, and give it its color and texture
function setModel(mesh, color, textureInfo)
{
    model.setMesh(mesh.center().fit(5));
    model.pos3D = vec3(0, -mesh.getBounds().min.y);
    model.color = color;
    model.tileInfo = textureInfo &&
        new TileInfo(vec2(), textureInfo.size, textureInfo, 0, 0);
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
    const text = 'drop an .obj, .glb or .gltf file / space: toggle shading / '
        + modelName;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
