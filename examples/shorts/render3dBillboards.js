class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, color)
    {
        // create a billboard object with no mesh
        super(pos, undefined, tileInfo, color);
        this.size3D = vec3(2);
        this.softShadow = 2;
        this.phase = rand(2*PI);
        this.pixelated = true; // hard edged pixels
    }
    update()
    {
        // bob up and down
        const t = time + this.phase;
        this.pos3D.y = 2 + sin(t*2) * .5;
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.65,.5,.15), hsl(.8,.4,.3), hsl(.65,.4,.1));
    render3D.setFog(15, 40);
    render3D.ambientColor = hsl(.6,.2,.5);
    new CameraControl3D(vec3(), 15, .5, .003);

    // floor and cube for comparison
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.8,.2,.3)));
    new EngineObject3D(vec3(0,2,0), buildBox(2).setColor(hsl(0,0,.7)));

    // ring of sprites from the tile sheet
    for (let i = 12; i--;)
    {
        const pos = vec3(7, 2).rotateY(i/12*2*PI);
        const color = hsl(i/12,.8,.7);
        new Sprite(pos, tile(i%4, 16), color);
    }
}
