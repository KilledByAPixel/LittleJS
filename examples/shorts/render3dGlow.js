class Orb extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(1.5));
        this.color = color;
        this.orbitAngle = angle;
        this.unlit = true; // full brightness
        this.addChild(new Light3D(vec3(), 15, color));
    }
    update()
    {
        const a = this.orbitAngle += .01;
        this.pos3D = vec3(6, 2 + sin(a*3)).rotateY(a);
    }
}

function gameInit()
{
    new Render3DPlugin;
    postProcessBloom(.5, 2, 8); // setup bloom
    render3D.setSky(hsl(.7,.5,.1), hsl(.6,.4,.2));
    render3D.lightColor = hsl(.6,.3,.2);
    render3D.ambientColor = hsl(.6,.3,.15);
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,2,0), 20, .25, .002);

    // make floor and pillars
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, hsl(0,0,.5)));
    const pillar = buildCylinder(1.5, 5).setColor(hsl(0,0,.8));
    for (let i = 6; i--;)
        new EngineObject3D(vec3(11, 2.5).rotateY(i/6*2*PI), pillar);
    for (let i = 4; i--;)
        new Orb(i*PI/2, hsl(i/4,1,.6));
}
