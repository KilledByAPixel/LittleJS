class Lamp extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(.4, 8, 4), undefined, color);
        this.orbitAngle = angle;
        this.unlit = true; // drawn in its own color so it reads as bright
        this.addChild(new Light3D(vec3(), 8, color)); // the light follows the lamp
    }
    update()
    {
        // circle the floor at different speeds and heights
        const a = this.orbitAngle += .01;
        this.pos3D = vec3(sin(a)*5, 2 + sin(a*3), cos(a)*5);
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.02,.02,.05), rgb(.05,.05,.1));
    render3D.lightColor = rgb(.15,.15,.2); // a dim moon so the point lights carry the scene
    render3D.ambientColor = rgb(.08,.08,.1);
    setRender3DSmoothShading(true);

    // a floor, pillars to catch the light, and three colored lamps
    new EngineObject3D(vec3(), buildGrid(vec2(24), 12, rgb(.6,.6,.65)));
    const pillar = buildCylinder(1, 3, 12);
    for (let i = 0; i < 8; ++i)
    {
        const a = i/8*2*PI;
        new EngineObject3D(vec3(sin(a)*7, 1.5, cos(a)*7), pillar, undefined, rgb(.7,.7,.7));
    }
    new EngineObject3D(vec3(0,1,0), buildBox(vec3(2)), undefined, rgb(.8,.8,.8));
    new Lamp(0, rgb(1,.4,.3));
    new Lamp(2, rgb(.3,1,.4));
    new Lamp(4, rgb(.4,.5,1));
}

function gameUpdate()
{
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,1,0), 15, orbit, .5);
}

function gameRenderPost()
{
    const text = '3D Lights\nthree point lights on the move, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
