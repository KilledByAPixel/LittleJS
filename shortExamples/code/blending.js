function gameRender()
{
    // additive blend
    setBlendMode(1);
    drawTile(vec2(1, 3), vec2(6), tile(0), rgb(1,0,0));
    drawTile(vec2(-1,3), vec2(6), tile(0), rgb(0,0,1));

    // alpha blend
    setBlendMode(0);
    drawTile(vec2(1, -3), vec2(6), tile(0), rgb(1,0,0,.5));
    drawTile(vec2(-1,-3), vec2(6), tile(0), rgb(0,0,1,.5));
}