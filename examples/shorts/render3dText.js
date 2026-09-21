let title;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.4,.2), hsl(.9,.3,.4), hsl(.6,.2,.1));
    render3D.shadows = true;
    render3D.ambientColor = hsl(.6,.1,.4);
    new CameraControl3D(vec3(0,2,0), 16, .35, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.6,.1,.3)));

    // create 3d text from extruded engine font
    title = new EngineObject3D(vec3(0,5,0), buildText3D('LITTLEJS', 2, 1));
    title.color = hsl(.1,1,.6);
    title.specular = 1;
    const captionMesh = buildText3D('3D TEXT\nFROM A BITMAP FONT', 1, .5);
    const caption = new EngineObject3D(vec3(0,2,0), captionMesh);
    caption.color = hsl(.6,1,.7);

    // tiles from the sheet extruded the same way
    for (let i = 4; i--;)
    {
        const pos = vec3(i*3 - 4.5, 1, 5);
        const mesh = buildExtrude(tile(i,16), vec2(2), 1 - i*.3);
        const sprite = new EngineObject3D(pos, mesh);
        sprite.angleVelocity3D = vec3(0, .02);
    }
}

function gameUpdate()
{
    // sway the title so the sides catch the light
    title.rotation3D.y = sin(time)*.5;
}
