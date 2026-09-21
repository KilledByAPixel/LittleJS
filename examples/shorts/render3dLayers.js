class Coin extends EngineObject3D
{
    constructor(pos, after)
    {
        super(vec3(pos.x, pos.y), buildTorus(1.5, .5));
        this.color = hsl(.15,1,.5);
        this.rotation3D.x = PI/2; // face the camera
        this.angleVelocity3D = vec3(0, .04);
        this.specular = 1;
        this.renderAfter2D = after; // before or after 2D scene
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.camera.align2D = true; // follow the 2D camera
    render3D.ambientColor = hsl(0,0,.5);
    setCanvasClearColor(hsl(.6,.3,.3));

    // coins in front of and behind the 2d bars
    for (let i = 6; i--;)
        new Coin(vec2(i*4 - 10, 0), i%2 == 1);
}

function gameRender()
{
    // the 2D scene, drawn between the two 3D layers
    for (let x = -12; x <= 12; x += 2)
        drawRect(vec2(x, 0), vec2(1, 12), hsl(0,0,.4));
    drawTile(vec2(sin(time)*8, -4), vec2(3), tile(2,16));
}
