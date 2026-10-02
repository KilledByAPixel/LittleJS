const effects = [
    ['old TV', postProcessTV({curve: .1})],
    ['scanlines', postProcessScanlines(.4)],
    ['static noise', postProcessNoise(.15)],
    ['vignette', postProcessVignette(1, 1)],
    ['CRT curve', postProcessCurve(.15)],
    ['chromatic aberration', postProcessChromatic(.01)],
    ['glow', postProcessGlow(.5, 2, 8)],
    ['your own code', 'c.rgb = c.gbr;'],
    ['none', ''],
];
let current = 0;

function gameInit()
{
    new PostProcessPlugin(postProcessEffects(effects[0][1]));
}

function gameUpdate()
{
    if (!mouseWasPressed(0) && !keyWasPressed('Space'))
        return;
    current = (current + 1) % effects.length;
    postProcess.setShaderCode(postProcessEffects(effects[current][1]));
}

function gameRender()
{
    // a scene with color and bright spots for the effects to work on
    drawRect(vec2(), vec2(99), hsl(.6,.3,.25));
    for (let i = 0; i < 12; ++i)
    {
        const a = i/12*PI*2 + time/2;
        drawCircle(vec2(cos(a), sin(a)).scale(7), 2, hsl(i/12,.8,.6));
    }
    drawTile(vec2(0, sin(time)), vec2(6), tile(3,128));
}

function gameRenderPost()
{
    // screen text is on the 2D canvas, the effects leave the words alone
    const name = effects[current][0], y = mainCanvasSize.y - 50;
    drawTextScreen(name + '  ·  click for the next',
        vec2(mainCanvasSize.x/2, y), 30, WHITE, 4);
}

/* info
The built in post effects, one after another: click or press space for
the next. Each is a piece of shader code with its settings in, and
`postProcessEffects` joins pieces into one shader.
*/
