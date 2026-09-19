class Coin extends EngineObject3D
{
    constructor(pos, above)
    {
        // a 3D coin at a 2D position, z=0 is the 2D plane when the camera is aligned
        super(vec3(pos.x, pos.y, 0), buildTorus(1.5, .5), undefined, YELLOW);
        this.rotation3D.x = PI/2; // face the camera
        this.angleVelocity3D = vec3(0, .04, 0);
        this.renderAfter2D = above; // in front of the 2D scene, or behind it
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.camera.align2D = true; // follow the 2D camera so world units match
    render3D.ambientColor = rgb(.5,.5,.5);
    render3D.specular = 1;
    canvasClearColor = hsl(.6,.3,.3);

    // coins behind the bars and coins in front of them
    for (let i = 0; i < 6; ++i)
        new Coin(vec2(i*4 - 10, 0), i % 2 == 1);
}

function gameRender()
{
    // the 2D scene, drawn between the two 3D layers
    for (let x = -12; x <= 12; x += 2)
        drawRect(vec2(x, 0), vec2(1, 12), hsl(0,0,.4));
    drawTile(vec2(sin(time)*8, -4), vec2(3), tile(2,16));
}

function gameRenderPost()
{
    const text = '3D Layers\n3D coins behind and in front of a 2D scene';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
