let orbit = 0, title;

function gameInit()
{
    new Render3DPlugin;
    render3D.shadows = true;
    render3D.setSky(rgb(.1,.1,.25), rgb(.5,.3,.4), rgb(.1,.1,.15));
    render3D.ambientColor = rgb(.35,.35,.4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, rgb(.25,.25,.3)));

    // the engine font extruded, glyphs are white so the color tints them
    title = new EngineObject3D(vec3(0,4,0), buildText3D('LITTLEJS', 1.5, .6), undefined, rgb(1,.8,.2));
    title.specular = .3;
    const caption = buildText3D('3D TEXT\nFROM THE ENGINE FONT', .6, .3);
    new EngineObject3D(vec3(0,2.4,0), caption, undefined, rgb(.5,.8,1));

    // tiles from the sheet extruded the same way, their pixel colors carry through
    for (let i = 0; i < 4; ++i)
    {
        const sprite = new EngineObject3D(vec3(i*3 - 4.5, 1, 4.5), buildExtrude(tile(i,16), vec2(2), .5));
        sprite.angleVelocity3D = vec3(0, .02 + i*.01, 0);
    }
}

function gameUpdate()
{
    title.rotation3D.y = sin(time)*.5; // sway so the sides catch the light
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,2,0), 16, orbit, .35);
}

function gameRenderPost()
{
    const text = '3D Text\nextruded from the engine font and the tile sheet, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
