// use smooth blending
setCanvasPixelated(false);
setTilesPixelated(false);

function gameRender()
{
    const circleTile = tile(2, 128); // get the circle tile

    // additive blend
    setBlendMode(1);
    drawTile(vec2(-8,-2), vec2(7), circleTile, rgb(0,0,.5), 0, false, rgb(0,0,.5));
    drawTile(vec2(-6, 2), vec2(7), circleTile, rgb(0,1,0));
    drawTile(vec2(-4,-2), vec2(7), circleTile, rgb(1,0,0));

    // alpha blend
    setBlendMode(0);
    drawTile(vec2(4,-2), vec2(7), circleTile, hsl(time/9    ,1,.5), 0, false, hsl(1,1,.5));
    drawTile(vec2(8,-2), vec2(7), circleTile, hsl(time/9+1/3,1,.5,.5));
    drawTile(vec2(6, 2), vec2(7), circleTile, hsl(time/9+2/3,1,.5,.5));
}