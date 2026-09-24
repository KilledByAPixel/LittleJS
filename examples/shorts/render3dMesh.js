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

const modelSize = 5;
let model, modelName = 'house';

function gameInit()
{
    new Render3DPlugin;
    // a gray sky and ground, so the lighting adds no hue of its own
    // and the model's colors show as they are
    render3D.setSky(hsl(0, 0, .6), hsl(0, 0, .85), hsl(0, 0, .4));
    render3D.shadows = true;
    // the shadow map covers just the model, so it is sharp at this distance
    render3D.shadowMapSize = 2048;
    render3D.shadowRange = modelSize * 2;
    render3D.shadowCenter = vec3(0, modelSize/2, 0);
    new CameraControl3D(vec3(0,1,0), 10, .4);

    // checkerboard floor and the model
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .6 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, checker));
    setModel(parseOBJ(houseOBJ));

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
                setModel(parseOBJ(await file.text()));
            else
            {
                // a glb has everything in one file; a gltf needs its
                // buffers and images inside it as data uris to work dropped
                setModel(await parseGLTF(await file.arrayBuffer()));
            }
            modelName = file.name;
        }
        catch (error) { modelName = file.name + ' failed: ' + error.message; }
    });
}

// show a Mesh or a GLTFModel: centered, scaled to size, standing on the floor
function setModel(loaded)
{
    model?.destroy(true);
    loaded.center().fit(modelSize);
    const pos = vec3(0, -loaded.getBounds().min.y, 0);
    if (loaded instanceof GLTFModel)
        model = loaded.createObject(pos); // a child per part, windows and all
    else
        model = new EngineObject3D(pos, loaded, undefined, hsl(.1,.6,.7));
    model.angleVelocity3D = vec3(0, .005);
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        for (const o of [model, ...model.children])
            o.mesh?.computeNormals(render3D.smoothShading);
    }
}

function gameRenderPost()
{
    const text = 'drop an .obj, .glb or .gltf file / space: toggle shading / '
        + modelName;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
