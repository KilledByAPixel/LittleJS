function gameRender()
{
    // additive blending
    setBlendMode(1);
    drawCircle(vec2(-8,-2), 7, rgb(0,0,.5));
    drawCircle(vec2(-6, 2), 7, rgb(0,1,0));
    drawCircle(vec2(-4,-2), 7, rgb(1,0,0));

    // alpha blending
    setBlendMode(0);
    drawCircle(vec2(4,-2), 7, hsl(time/9    ,1,.5));
    drawCircle(vec2(8,-2), 7, hsl(time/9+1/3,1,.5,.5));
    drawCircle(vec2(6, 2), 7, hsl(time/9+2/3,1,.5,.5));
}