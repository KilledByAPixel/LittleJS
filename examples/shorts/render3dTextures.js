// paint a brick pattern using an offscreen canvas
function makeBrickTexture()
{
    const size = 64, context = createCanvasContext(size);
    context.fillStyle = hsl(.05,.4,.3);
    context.fillRect(0, 0, size, size);
    context.fillStyle = hsl(.05,.5,.5);
    for (let row = 4; row--;)
    for (let col = 5; col--;)
        context.fillRect(col*32 + (row&1)*8 - 8, row*16, 30, 14);
    return new TextureInfo(context.canvas, true, true); // wrap, so uvs repeat
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.5), hsl(.6,.5,.8));
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 14, .4, .002);

    // one texture, repeated across the floor and wrapped around shapes
    const bricks = makeBrickTexture();
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1).scaleUVs(8), bricks);
    const shapes = 
    [ buildBox(2), buildSphere(2), buildCylinder(2, 2), buildTorus(3, 1) ];
    for (let i = shapes.length; i--;)
    {
        const pos = vec3(i*3.5 - 5.25, 1.5, 0);
        const shape = new EngineObject3D(pos, shapes[i].scaleUVs(2), bricks);
        shape.angleVelocity3D = vec3(0, .01);
    }

    // a tile from the sheet on a standing quad
    const signMesh = buildGrid(vec2(5));
    const sign = new EngineObject3D(vec3(0, 2.5, -5), signMesh, tile(3, 16));
    sign.rotation3D = vec3(PI/2, PI, 0);
}

function gameUpdate()
{ 
    if (keyWasPressed('Space')) // space toggles mipmaps
        render3D.mipmaps = !render3D.mipmaps;
}

function gameRenderPost()
{
    const mipmaps = render3D.mipmaps ? 'on' : 'off';
    const text = `space: mipmaps (${mipmaps})`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 40, BLACK);
}
