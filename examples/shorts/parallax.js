function gameInit()
{
    canvasClearColor = hsl(.6,.4,.8);
    cameraScale = 24;

    // the far layers are lighter and higher, follow the camera more,
    // and draw first
    const hue = rand();
    for (let i = 3; i--;)
    {
        const far = i/2;
        const top = hsl(hue, .4, .35 + far*.3);
        const bottom = hsl(hue, .5, .15 + far*.2);
        new ParallaxLayer(vec2(0, far*4 - 4), vec2(40, 20), .3 + far*.5,
            -1 - i, parallaxMountains(top, bottom));
    }
}

function gameUpdate()
{
    const look = mousePosScreen.subtract(mainCanvasSize.scale(.5));
    cameraPos = vec2(time*4 + look.x*.02, -look.y*.005);
}

function gameRenderPost()
{
    // the world itself, ground and posts 5 units apart, in front of it all
    drawRect(vec2(cameraPos.x, -28), vec2(1e3, 40), hsl(.3,.4,.25));
    const first = floor(cameraPos.x/5 - 10)*5;
    for (let x = first; x < first + 105; x += 5)
        drawRect(vec2(x, -7), vec2(.4, 2), hsl(.08,.5,.3));
}

/* info
Three ranges of mountains from the parallax plugin. Each follows the
camera by its own amount and repeats across the view, so the far ones
pass slowly. The camera drifts along and the mouse looks around.
*/
