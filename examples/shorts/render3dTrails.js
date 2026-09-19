class Comet extends EngineObject3D
{
    constructor(color, phase)
    {
        super(vec3(), buildSphere(1, 8, 4));
        this.color = color;
        this.phase = phase;
        this.softShadow = 1.5;
        // the trail is a child so it follows, additive, fading over 1.5 seconds
        this.addChild(new Trail3D(vec3(), 1.5, .5, undefined, color, color.withAlpha(0), true));
    }
    update()
    {
        // a figure eight around the flag
        const t = time*1.5 + this.phase;
        this.pos3D = vec3(sin(t)*6, 3 + sin(t*2)*1.5, sin(t*2)*3);
    }
}

class Flag extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, buildGrid(vec2(4,2.5), vec2(16,10), hsl(0,.7,.6)));
        this.rotation3D.x = PI/2; // stand the grid up
        const pole = buildCylinder(.16, pos.y + 1.5, 8).setColor(hsl(.08,.3,.4));
        new EngineObject3D(pos.add(vec3(-2,-pos.y/2)), pole);
    }
    update()
    {
        // ripple the cloth in place, computeNormals marks it for re-upload
        for (const p of this.mesh.points)
            p.y = sin(p.x*2 - time*6)*.08*(p.x + 2);
        this.mesh.computeNormals(false);
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.65,.5,.1), hsl(.85,.35,.22), hsl(.65,.3,.07));
    render3D.ambientColor = hsl(.65,.05,.52);
    render3D.onRenderTransparent = drawRainbow;
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.65,.1,.22)));
    new Flag(vec3(0,4.5,0));
    for (let i = 3; i--;)
        new Comet(hsl(i/3,1,.6), i*2*PI/3);
}

function gameUpdate()
{
    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,3,0), 16, orbit, .3);
}

function drawRainbow()
{
    // a rainbow ring drawn fresh each frame, width and color change along it
    const points = [], widths = [], colors = [];
    for (let i = 0; i <= 60; ++i)
    {
        const t = i/60, a = t*2*PI;
        points.push(vec3(cos(a)*9, 1 + sin(a*3 + time*2), sin(a)*9));
        widths.push(.3 + .2*sin(a*5 - time*4));
        colors.push(hsl(t + time*.2, 1, .6, .8));
    }
    render3D.drawRibbon(points, widths, colors);
}

function gameRenderPost()
{
    drawTextScreen('drag: orbit', vec2(mainCanvasSize.x/2, 40), 30);
}
