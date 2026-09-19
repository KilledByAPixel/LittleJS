class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, color, upright)
    {
        super(pos, undefined, tileInfo, color); // a tile and no mesh draws a billboard
        this.size3D = vec3(2);
        this.upright = upright; // stand up, or tilt to face the camera
        this.softShadow = 2;
        this.spawnPos = pos.copy();
        this.phase = rand(2*PI);
    }
    update()
    {
        // hover and drift in a circle
        const t = time + this.phase;
        this.pos3D = this.spawnPos.add(vec3(sin(t)*.5, sin(t*2)*.5, cos(t)*.5));
    }
    render3D()
    {
        super.render3D(); // the billboard, unlit so it keeps its own colors
        render3D.drawLine(this.pos3D, vec3(0,3,0), .05, this.color.withAlpha(.5));
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.1,.1,.3), rgb(.4,.2,.5), rgb(.1,.1,.2));
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.ambientColor = rgb(.4,.4,.5);

    // a floor, a ring of sprites from the tile sheet, and a lit box to compare
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, rgb(.25,.2,.3)));
    for (let i = 0; i < 12; ++i)
    {
        const a = i/12*2*PI;
        new Sprite(vec3(sin(a)*6, 2, cos(a)*6), tile(i%4, 16), hsl(i/12,.8,.7), i%2 == 1);
    }
    new EngineObject3D(vec3(0,1,0), buildBox(vec3(2)), undefined, rgb(.6,.6,.7));
}

function gameUpdate()
{
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .003;
    render3D.camera.orbit(vec3(0,1.5,0), 13, orbit, .3);
}

function gameRenderPost()
{
    const text = '3D Billboards\nsprites, half upright, with shadows and lines, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
