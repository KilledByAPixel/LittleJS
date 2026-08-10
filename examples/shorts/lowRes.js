// how many pixels across the canvas is
const lowResSize = 128;

// disable canvas antialiasing to prevent blur
setCanvasPixelated(true);

// disable webgl antialiasing for low resolution
glSetAntialias(false);

function gameInit()
{
    // render to a tiny canvas that is scaled up
    canvasFixedSize = vec2(lowResSize);

    // fit 16 world units across the canvas
    cameraScale = lowResSize/16;
    canvasClearColor = hsl(.6, 1, .1);
}

function gameRender()
{
    // draw a sprite
    drawTile(vec2(0, sin(time*2)), vec2(6), tile(3,128));

    // draw orbiting circles
    for (let i = 6; i--;)
    {
        const a = i/6*2*PI + time;
        const pos = vec2(0, 5).rotate(a);
        drawCircle(pos, 2, hsl(i/6, 1, .5));
    }
}

function gameRenderPost()
{
    // draw text showing the resolution size
    drawText(lowResSize+'x'+lowResSize, vec2(0,6), 3);

    // draw text with engine and default fonts
    engineImageFont.drawText('Engine Font', vec2(0, -5), 1);
    drawText('Default Font', vec2(0, -7), 2);
}