class Lamp extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(.4, 8, 4));
        this.color = color;
        this.orbitAngle = angle;
        this.unlit = true; // drawn in its own color so it reads as bright
        this.addChild(new Light3D(vec3(), 8, color)); // the light follows the lamp
    }
    update()
    {
        // circle the floor, bobbing up and down
        const a = this.orbitAngle += .01;
        this.pos3D = vec3(5, 2 + sin(a*3)).rotateY(a);
    }
}


function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.03), hsl(.6,.4,.08));
    render3D.lightColor = hsl(.6,.2,.15); // a dim moon so the point lights carry the scene
    render3D.ambientColor = hsl(.6,.2,.1);
    render3D.smoothShading = true;

    // a floor, pillars to catch the light, and three colored lamps
    new EngineObject3D(vec3(), buildGrid(vec2(24), 12, hsl(0,0,.6)));
    const pillar = buildCylinder(1, 3, 12).setColor(hsl(0,0,.7));
    for (let i = 8; i--;)
        new EngineObject3D(vec3(7, 1.5).rotateY(i/8*2*PI), pillar);
    new EngineObject3D(vec3(0,1,0), buildBox(2).setColor(hsl(0,0,.8)));
    for (let i = 3; i--;)
        new Lamp(i*2, hsl(i/3,1,.6));

    // a directional light shines along its forward axis from far away, a cold fill here
    const fill = new Light3D(vec3(), 1, hsl(.6,1,.2));
    fill.directional = true;
    fill.lookAt(vec3(-1,-1,-.5));

    new CameraControl3D(vec3(0,1,0), 15, .5, .002);
}
