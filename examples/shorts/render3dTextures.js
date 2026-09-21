// paint a brick pattern, any image or canvas can be a texture
function makeBrickTexture()
{
    const size = 64, canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d');
    context.fillStyle = hsl(.05,.4,.3);
    context.fillRect(0, 0, size, size);
    context.fillStyle = hsl(.05,.5,.5);
    for (let row = 4; row--;)
    for (let col = 4; col--;)
        context.fillRect(col*16 + (row&1)*8 - 8, row*16, 14, 14);
    return new TextureInfo(canvas, true, true); // wrap, so uvs past 1 repeat
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.5), hsl(.6,.5,.8));
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 14, .4, .002);

    // one texture, repeated across the floor and wrapped around each shape
    const bricks = makeBrickTexture();
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1).scaleUVs(8), bricks);
    const shapes = [buildBox(2), buildSphere(2), buildCylinder(2, 2), buildTorus(2.4, .8)];
    for (let i = shapes.length; i--;)
    {
        const shape = new EngineObject3D(vec3(i*3.5 - 5.25, 1.5, 0), shapes[i].scaleUVs(2), bricks);
        shape.angleVelocity3D = vec3(0, .01);
    }

    // a tile from the sheet on a standing quad, see through texels are dropped
    // so the shadow takes the sprite's shape
    const sign = new EngineObject3D(vec3(-4, 2.5, -5), buildGrid(vec2(5), 1), tile(3, 16));
    sign.rotation3D = vec3(PI/2, PI, 0); // stand it up with its face toward the light
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles mipmaps
        render3D.mipmaps = !render3D.mipmaps;
}

function gameRenderPost()
{
    const text = 'space: toggle mipmaps / mipmaps ' + (render3D.mipmaps ? 'on' : 'off');
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
