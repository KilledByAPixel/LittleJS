class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, upright)
    {
        super(pos, undefined, tileInfo); // a tile and no mesh draws a billboard
        this.size3D = vec3(2);
        this.upright = upright; // stand up, or tilt to face the camera
        this.softShadow = 2;
        this.spawnPos = pos;
        this.phase = rand(2*PI);
    }
    update()
    {
        // hover and drift in a circle
        const t = time + this.phase;
        this.pos3D = this.spawnPos.add(vec3(sin(t), sin(t*2), cos(t)).scale(.5));
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
    render3D.setSky(hsl(.65,.5,.15), hsl(.8,.4,.3), hsl(.65,.4,.1));
    render3D.setFog(15, 40);
    render3D.ambientColor = hsl(.65,.2,.45);

    // a floor, a ring of sprites from the tile sheet, and a lit box to compare
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.75,.2,.25)));
    for (let i = 12; i--;)
    {
        const pos = vec3(6, 2).rotateY(i/12*2*PI);
        const sprite = new Sprite(pos, tile(i%4, 16), i%2 == 1);
        sprite.color = hsl(i/12,.8,.7);
    }
    new EngineObject3D(vec3(0,1,0), buildBox(2).setColor(hsl(.65,.15,.65)));
}

function gameUpdate()
{
    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .003;
    render3D.camera.orbit(vec3(0,1.5,0), 13, orbit, .3);
}

function gameRenderPost()
{
    drawTextScreen('drag: orbit', vec2(mainCanvasSize.x/2, 40), 30);
}
