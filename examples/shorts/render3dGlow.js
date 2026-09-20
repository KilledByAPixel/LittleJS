// the post processing plugin runs over the 3D scene too, here the built in bloom

class Orb extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(1.2, 12, 6, true));
        this.color = color;
        this.orbitAngle = angle;
        this.unlit = true; // its own color, so the bloom has something bright to find
        this.addChild(new Light3D(vec3(), 9, color));
    }
    update()
    {
        const a = this.orbitAngle += .008;
        this.pos3D = vec3(6, 2 + sin(a*3)).rotateY(a);
    }
}


function gameInit()
{
    new Render3DPlugin;
    postProcessBloom(.5, 2, 8); // threshold, strength and spread
    render3D.setSky(hsl(.7,.5,.1), hsl(.6,.4,.2));
    render3D.lightColor = hsl(.6,.3,.2);
    render3D.ambientColor = hsl(.6,.3,.15);
    render3D.smoothShading = true;

    // a dark floor and pillars for the orbs to light up
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, hsl(.6,.2,.3)));
    const pillar = buildCylinder(1.4, 5, 12).setColor(hsl(.6,.2,.4));
    for (let i = 6; i--;)
        new EngineObject3D(vec3(11, 2.5).rotateY(i/6*2*PI), pillar);
    for (let i = 4; i--;)
        new Orb(i*PI/2, hsl(i/4,1,.6));

    new CameraControl3D(vec3(0,2,0), 20, .25, .002);
}
