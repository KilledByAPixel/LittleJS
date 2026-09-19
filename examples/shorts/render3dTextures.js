let orbit = 0;

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

    // the floor repeats the bricks eight times across
    const floor = buildGrid(vec2(20), 1).scaleUVs(8);
    new EngineObject3D(vec3(), floor, makeBrickTexture());

    // tiles from the sheet on the shape builders, each stretches the tile around itself
    const shapes = [buildBox(2), buildSphere(2), buildCylinder(2, 2), buildTorus(2.4, .8)];
    for (let i = shapes.length; i--;)
    {
        const shape = new EngineObject3D(vec3(i*3.5 - 5.25, 1.5, 0), shapes[i], tile(i, 16));
        shape.angleVelocity3D = vec3(0, .01);
    }
}

function gameUpdate()
{
    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,1,0), 14, orbit, .4);
}
