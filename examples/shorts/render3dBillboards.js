// Render3D plugin: textured billboards with alpha, shadows and lines, all sorted far to near

class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, color)
    {
        super(pos, undefined, color, tileInfo);
        this.transparent = true; // draw in the transparent stage so the tile's alpha blends
        this.spawnPos = pos.copy();
        this.phase = rand(2 * PI);
    }
    update()
    {
        // hover up and down, drift in a circle
        const t = time + this.phase;
        this.pos3D = this.spawnPos.add(vec3(Math.sin(t) * .5, Math.sin(t * 2) * .5, Math.cos(t) * .5));
    }
    render3D()
    {
        // billboards are unlit and keep their own colors
        render3D.drawBillboard(this.pos3D, vec2(2), this.tileInfo, this.color, Math.sin(time + this.phase) * .2);
        render3D.drawShadow(this.pos3D, 1);
        render3D.drawLine3D(this.pos3D, vec3(0, 3, 0), .05, this.color.withAlpha(.5));
    }
}

let floorMesh, orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.sky = buildSky(rgb(.1, .1, .3), rgb(.4, .2, .5), rgb(.1, .1, .2));
    render3D.fogColor = rgb(.4, .2, .5);
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.ambientColor = rgb(.4, .4, .5);
    floorMesh = buildGrid(30, 30, 1, 1, undefined, ()=> rgb(.25, .2, .3));

    // a ring of sprites from the tile sheet and a lit box to compare against
    for (let i = 0; i < 12; ++i)
    {
        const a = i / 12 * 2 * PI;
        new Sprite(vec3(Math.sin(a) * 6, 2, Math.cos(a) * 6), tile(i % 4, 16), hsl(i / 12, .8, .7));
    }
    new EngineObject3D(vec3(0, 1, 0), buildBox(vec3(2)), rgb(.6, .6, .7));
    render3D.onRender = ()=> floorMesh.render();
}

function gameUpdate()
{
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.pos = vec3(Math.sin(orbit) * 12, 5, Math.cos(orbit) * 12);
    render3D.camera.lookAt(vec3(0, 1.5, 0));
}

function gameRenderPost()
{
    drawTextScreen('3D billboards - sprites with alpha, shadows and lines, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
