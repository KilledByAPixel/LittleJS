// post processing with your own shader code: a line of GLSL that bends
// the picture in a wave, run over every pixel of the frame; c is the
// pixel's color and uv where it is on the screen, from 0 to 1

const wave = `
    uv.x += sin(uv.y * 20. + iTime * 3.) * .01;
    c = texture(iChannel0, uv);`;

function gameInit()
{
    new PostProcessPlugin(postProcessEffects(wave));
}

function gameRender()
{
    drawRect(vec2(), vec2(99), GRAY);
    drawTile(vec2(sin(time)*3, 0), vec2(12), tile(3,128));
}
