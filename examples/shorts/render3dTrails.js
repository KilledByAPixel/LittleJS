class Comet extends EngineObject3D
{
    constructor(color, phase)
    {
        super(vec3(), buildSphere(1, 8, 4));
        this.color = color;
        this.phase = phase;
        this.softShadow = 1.5;
        // the trail is a child so it follows, additive, fading over 1.5 seconds
        this.addChild(new Trail3D(vec3(), 1.5, .5, undefined,
            color, color.withAlpha(0), true));
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
    }
    update()
    {
        // ripple the cloth in place, computeNormals marks it for re-upload
        for (const p of this.mesh.points)
            p.y = sin(p.x*2 - time*6)*.08*(p.x + 2);
        this.mesh.computeNormals(false);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.1), hsl(.8,.4,.2), hsl(.6,.3,.1));
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.onRenderTransparent = drawRainbow;
    new CameraControl3D(vec3(0,3,0), 16, .3, .002);

    // floor, flagpole, flag and the comets looping around it
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.6,.1,.2)));
    const pole = buildCylinder(.16, 6, 8).setColor(hsl(.1,.3,.4));
    new EngineObject3D(vec3(-2,3,0), pole);
    new Flag(vec3(0,4.5,0));
    for (let i = 3; i--;)
        new Comet(hsl(i/3,1,.6), i*2*PI/3);
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
