// Render3D plugin: textured billboards with alpha, glows, shadows and lines

class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, color)
    {
        super(pos);
        this.tileInfo = tileInfo;
        this.color = color;
        this.transparent = true; // draw in the transparent stage, sorted far to near
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
        // billboards are unlit and keep their own colors, the tile's alpha cuts them out
        render3D.drawBillboard(this.pos3D, vec2(2), this.tileInfo, this.color, Math.sin(time + this.phase) * .2);
    }
}

let floorMesh, sprites = [], orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.sky = buildSky(rgb(.1, .1, .3), rgb(.4, .2, .5), rgb(.1, .1, .2));
    render3D.fogColor = rgb(.4, .2, .5);
    render3D.fogStart = 15;
    render3D.fogEnd = 40;
    render3D.ambientColor = rgb(.4, .4, .5);
    floorMesh = buildGrid(30, 30, 1, 1, undefined, ()=> rgb(.25, .2, .3));

    // a ring of sprites from the tile sheet
    for (let i = 0; i < 12; ++i)
    {
        const a = i / 12 * 2 * PI;
        sprites.push(new Sprite(vec3(Math.sin(a) * 6, 2, Math.cos(a) * 6), tile(i % 4, 16), hsl(i / 12, .8, .7)));
    }

    // a lit box in the middle so lit and unlit things can be compared
    new EngineObject3D(vec3(0, 1, 0), buildBox(vec3(2)), rgb(.6, .6, .7));

    render3D.onRender = ()=> floorMesh.render();
    render3D.onRenderTransparent = ()=>
    {
        // shadows under the sprites and lines from each sprite to the center
        for (const s of sprites)
        {
            render3D.drawShadow(s.pos3D, 1);
            render3D.drawLine3D(s.pos3D, vec3(0, 2, 0), .05, s.color.withAlpha(.3));
        }

        // additive glows that face the camera
        render3D.additive = true;
        render3D.drawSoftDisc(vec3(0, 2, 0), render3D.cameraForward.scale(-1), 2, rgb(1, .8, .3));
        for (const s of sprites)
            render3D.drawSoftDisc(s.pos3D, render3D.cameraForward.scale(-1), 1.5, s.color.withAlpha(.5));
        render3D.additive = false;
    };
}

function gameUpdate()
{
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.pos = vec3(Math.sin(orbit) * 12, 5, Math.cos(orbit) * 12);
    render3D.camera.lookAt(vec3(0, 1.5, 0));
}

function gameRenderPost()
{
    drawTextScreen('Render3D billboards - sprites with alpha, glows, shadows and lines, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
