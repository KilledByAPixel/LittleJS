let orbit = 0, title;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.65,.4,.17), hsl(.9,.25,.4), hsl(.65,.2,.12));
    render3D.shadows = true;
    render3D.ambientColor = hsl(.65,.1,.37);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.65,.1,.27)));

    // the engine font extruded, glyphs are white so the color tints them
    title = new EngineObject3D(vec3(0,4,0), buildText3D('LITTLEJS', 1.5, .6));
    title.color = hsl(.12,.9,.55);
    title.specular = .3;
    const captionMesh = buildText3D('3D TEXT\nFROM THE ENGINE FONT', .6, .3);
    const caption = new EngineObject3D(vec3(0,2.4,0), captionMesh);
    caption.color = hsl(.58,.8,.75);

    // tiles from the sheet extruded the same way, their pixel colors carry through
    for (let i = 4; i--;)
    {
        const pos = vec3(i*3 - 4.5, 1, 4.5);
        const sprite = new EngineObject3D(pos, buildExtrude(tile(i,16), vec2(2), .5));
        sprite.angleVelocity3D = vec3(0, .02);
    }
}

function gameUpdate()
{
    // sway the title so the sides catch the light, drag to orbit
    title.rotation3D.y = sin(time)*.5;
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,2,0), 16, orbit, .35);
}

function gameRenderPost()
{
    drawTextScreen('drag: orbit', vec2(mainCanvasSize.x/2, 40), 30);
}
