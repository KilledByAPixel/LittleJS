// use smoother textures
setCanvasPixelated(false);
setTilesPixelated(false);

function gameRender()
{
    const circleTile = tile(2, 128); // get the circle tile

    // additive blend
    setBlendMode(1);
    drawTile(vec2(-4,-2), vec2(7), circleTile, rgb(1,0,0));
    drawTile(vec2(-6, 2), vec2(7), circleTile, rgb(0,1,0));
    drawTile(vec2(-8,-2), vec2(7), circleTile, rgb(0,0,1));

    // alpha blend
    setBlendMode(0);
    drawTile(vec2(4,-2), vec2(7), circleTile, rgb(1,0,0,.5));
    drawTile(vec2(6, 2), vec2(7), circleTile, rgb(0,1,0,.5));
    drawTile(vec2(8,-2), vec2(7), circleTile, rgb(0,0,1,.5));
}