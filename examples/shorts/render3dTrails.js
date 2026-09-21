class Comet extends EngineObject3D
{
    constructor(color, phase)
    {
        super(vec3(), buildSphere(1, 8, 4));
        this.color = color;
        this.phase = phase;
        this.softShadow = 1.5;

        // add trail as a child so it follows
        const trail = new Trail3D(vec3(), 1.5, .5, undefined,
            color, color.withAlpha(0), true);
        this.addChild(trail);
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
        // ripple the cloth in place
        for (const p of this.mesh.points)
            p.y = sin(p.x*2 - time*6)*.3*(p.x + 2);
        this.mesh.computeNormals(true);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.1), hsl(.8,.4,.2), hsl(.6,.3,.1));
    render3D.ambientColor = hsl(.6,.1,.5);
    new CameraControl3D(vec3(0,3,0), 16, .3, .002);

    // floor, flagpole, flag and the comets looping around it
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.6,.1,.2)));
    const pole = buildCylinder(.16, 6, 8).setColor(hsl(.1,.3,.4));
    new EngineObject3D(vec3(-2,3,0), pole);
    new Flag(vec3(0,4.5,0));
    for (let i = 3; i--;)
        new Comet(hsl(i/3,1,.6), i*2*PI/3);
}
