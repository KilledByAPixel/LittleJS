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

let model, orbit = 0, name = 'house';

function gameInit()
{
    new Render3DPlugin;
    render3D.shadows = true;
    render3D.setSky(rgb(.3,.5,.9), rgb(.8,.9,1));
    render3D.fogStart = 20;
    render3D.fogEnd = 50;
    const checker = (x, z)=> (floor(x/2) + floor(z/2)) & 1 ? rgb(.4,.55,.4) : rgb(.35,.5,.35);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, checker));
    model = new EngineObject3D(vec3(), undefined, undefined, rgb(.9,.7,.5));
    model.angleVelocity3D = vec3(0, .005, 0);
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
        name = file.name;
    });
}

// center the model, make it 4 units across, and stand it on the floor
function setModel(mesh)
{
    model.mesh?.dispose();
    model.mesh = mesh.center().fit(4);
    model.pos3D = vec3(0, -mesh.getBounds().min.y, 0);
}

function gameUpdate()
{
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        model.mesh.computeNormals(render3DSmoothShading);
    }
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : 0;
    render3D.camera.orbit(vec3(0,2,0), 10, orbit, .35);
}

function gameRenderPost()
{
    const text = '3D Mesh: ' + name + '\ndrop an .obj file here, space: shading, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
