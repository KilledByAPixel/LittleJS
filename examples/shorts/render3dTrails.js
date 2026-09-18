class Comet extends EngineObject3D
{
    constructor(color, phase)
    {
        super(vec3(), buildSphere(8, 4), color);
        this.phase = phase;
        // the trail is a child so it follows, additive, fading to transparent over 1.5 seconds
        this.addChild(new Trail3D(vec3(), 1.5, .5, undefined, color, color.withAlpha(0), true));
    }
    update()
    {
        // a figure eight around the flag
        const t = time * 1.5 + this.phase;
        this.pos3D = vec3(sin(t) * 6, 3 + sin(t * 2) * 1.5, sin(t * 2) * 3);
    }
}

class Flag extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, buildGrid(4, 2.5, 16, 10, rgb(1, .3, .3)));
        this.rotation3D.x = PI / 2; // stand the grid up, its x runs out from the pole
        new EngineObject3D(pos.add(vec3(-2, -pos.y / 2, 0)), buildCylinder(.08, pos.y + 1.5, 8), rgb(.5, .4, .3));
    }
    update()
    {
        // ripple the cloth in place and re-upload it, the edge on the pole stays still
        const mesh = this.mesh;
        for (const p of mesh.points)
            p.y = sin(p.x * 2 - time * 6) * .08 * (p.x + 2);
        mesh.computeNormals(false);
        mesh.dirty = true;
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.05, .05, .15), rgb(.3, .15, .3), rgb(.05, .05, .1));
    render3D.ambientColor = rgb(.5, .5, .55); // enough that the back of the flag still reads
    new EngineObject3D(vec3(), buildGrid(30, 30, 1, 1, rgb(.2, .2, .25)));
    new Flag(vec3(0, 4.5, 0));
    for (let i = 0; i < 3; ++i)
        new Comet(hsl(i / 3, 1, .6), i * 2 * PI / 3);
    render3D.onRenderTransparent = drawRainbow;
}

function gameUpdate()
{
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x * .01 : .002;
    render3D.camera.orbit(vec3(0, 3, 0), 16, orbit, .3);
}

function drawRainbow()
{
    // a rainbow ring drawn fresh each frame, width and color change along it
    const points = [], widths = [], colors = [];
    for (let i = 0; i <= 60; ++i)
    {
        const t = i / 60, a = t * 2 * PI;
        points.push(vec3(cos(a) * 9, 1 + sin(a * 3 + time * 2), sin(a) * 9));
        widths.push(.3 + .2 * sin(a * 5 - time * 4));
        colors.push(hsl(t + time * .2, 1, .6, .8));
    }
    render3D.drawRibbon(points, widths, colors);
}

function gameRenderPost()
{
    drawTextScreen('3D trails - ribbons, trails and a waving flag, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
