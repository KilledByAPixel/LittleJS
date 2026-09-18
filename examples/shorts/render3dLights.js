class Lamp extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(8, 4), color);
        this.angle3D = angle;
        this.scale3D = vec3(.4);
        this.light = new Light3D(vec3(), 8, color);
        this.addChild(this.light); // the light follows the lamp
    }
    update()
    {
        // circle the floor at different speeds and heights
        const a = this.angle3D += .01;
        this.pos3D = vec3(sin(a) * 5, 2 + sin(a * 3), cos(a) * 5);
    }
    render3D()
    {
        // an unlit glow so the lamp reads as bright
        render3D.lighting = false;
        render3D.drawMesh(this.mesh, this.getMatrix(), this.color);
        render3D.lighting = true;
    }
}

let orbit = 0, useAfter2D = false;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.02, .02, .05), rgb(.05, .05, .1));
    render3D.lightColor = rgb(.15, .15, .2); // a dim moon so the point lights carry the scene
    render3D.ambientColor = rgb(.08, .08, .1);
    setRender3DSmoothShading(true);

    // a floor, some pillars to catch the light, and three colored lamps
    new EngineObject3D(vec3(), buildGrid(24, 24, 12, 12, rgb(.6, .6, .65)));
    const pillar = buildCylinder(.5, 3, 12);
    for (let i = 0; i < 8; ++i)
    {
        const a = i / 8 * 2 * PI;
        new EngineObject3D(vec3(sin(a) * 7, 1.5, cos(a) * 7), pillar, rgb(.7, .7, .7));
    }
    new EngineObject3D(vec3(0, 1, 0), buildBox(vec3(2)), rgb(.8, .8, .8));
    new Lamp(0, rgb(1, .4, .3));
    new Lamp(2, rgb(.3, 1, .4));
    new Lamp(4, rgb(.4, .5, 1));
}

function gameUpdate()
{
    if (keyWasPressed('Space'))
        render3D.renderAfter2D = useAfter2D = !useAfter2D;
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x * .01 : .002;
    render3D.camera.orbit(vec3(0, 1, 0), 15, orbit, .5);
}

function gameRender()
{
    // a 2D sprite in the middle: under the 3D by default, on top when renderAfter2D is set
    drawTile(vec2(), vec2(4), tile(1, 16), WHITE);
}

function gameRenderPost()
{
    const order = useAfter2D ? '3D on top of 2D' : '2D on top of 3D';
    drawTextScreen('3D lights - three point lights on the move, space toggles ' + order + ', drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
