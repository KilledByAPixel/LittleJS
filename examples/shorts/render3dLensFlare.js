let flare;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.45), hsl(.08,.7,.75));
    render3D.sunDirection = vec3(-.6, .35, -1); // low, to look toward
    render3D.sunColor = hsl(.1,.6,.95);
    render3D.shadows = true;
    render3D.shadowCenter = vec3();
    render3D.shadowRange = 40;
    new CameraControl3D(vec3(0, 2, 0), 16, .1, .003);

    // a ground and a ring of pillars for the sun to go behind
    new EngineObject3D(vec3(), buildGrid(vec2(60), 1, hsl(.3,.3,.35)));
    for (let i = 12; i--;)
    {
        const angle = i/12 * 2*PI, height = 3 + i%3*2;
        const pos = vec3(sin(angle)*9, height/2, cos(angle)*9);
        const pillar = new EngineObject3D(pos, render3D.boxMesh);
        pillar.color = hsl(.08,.2,.6);
        pillar.scale3D = vec3(1.2, height, 1.2);
    }

    // one line turns the flare on, it follows render3D.sunDirection
    flare = new LensFlare3D;
}

function gameUpdate()
{
    for (const [k, size] of [[1, .6], [2, 1], [3, 1.6]])
        keyWasPressed('Digit' + k) && (flare.flareSize = size);
    if (keyWasPressed('KeyC'))
        flare.count = flare.count < 12 ? flare.count + 4 : 3;
    if (keyWasPressed('KeyS'))
        flare.saturation = flare.saturation ? 0 : 1;
    keyWasPressed('KeyN') && ++flare.seed;
}

function gameRenderPost()
{
    const sun = (flare.visible * 100 | 0) + '%';
    const colors = flare.saturation ? 'colors' : 'one color';
    const text = `size ${flare.flareSize} (1-3) / ${flare.count} ghosts (C)` +
        ` / ${colors} (S) / N: new / sun ${sun}`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 26);
}

/* info
The sun's lens flare: a glow at the sun and a row of discs and rings
across the screen, which fades when a pillar hides the sun. Drag to look
around; 1 to 3 set its size, C its count, S its colors and N picks
another arrangement.
*/
