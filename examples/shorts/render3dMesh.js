// a small OBJ model, the same text any modeler exports: a house with a quad roof
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
    render3D.setSky(rgb(.3, .5, .9), rgb(.8, .9, 1));
    render3D.fogStart = 20;
    render3D.fogEnd = 50;
    new EngineObject3D(vec3(), buildGrid(20, 20, 10, 10, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? rgb(.4, .55, .4) : rgb(.35, .5, .35)));
    model = new EngineObject3D(vec3(), parseOBJ(houseOBJ), rgb(.9, .7, .5));

    // drop any .obj file on the page to see it
    const stop = (e)=> e.preventDefault();
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', async (e)=>
    {
        stop(e);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        model.mesh.dispose();
        model.mesh = parseOBJ(await file.text());
        name = file.name;
        fitModel();
    });
    fitModel();
}

// scale and center the model so it sits on the floor about 4 units tall whatever its native size
function fitModel()
{
    let lo = vec3(1e9), hi = vec3(-1e9);
    for (const p of model.mesh.points)
        lo = vec3(min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)), hi = vec3(max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z));
    const size = hi.subtract(lo), scale = 4 / max(size.x, size.y, size.z);
    model.scale3D = vec3(scale);
    model.pos3D = vec3(-(lo.x + hi.x) / 2 * scale, -lo.y * scale, -(lo.z + hi.z) / 2 * scale);
}

function gameUpdate()
{
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        model.mesh.computeNormals(render3DSmoothShading); // recompute from the faces either way
    }
    model.rotation3D.y += .005;
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : 0;
    render3D.camera.orbit(vec3(0, 2, 0), 10, orbit, .35);
}

function gameRenderPost()
{
    drawTextScreen('3D mesh - ' + name + ', drop an .obj file here to load it, space toggles shading, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
