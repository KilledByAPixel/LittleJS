function gameRender()
{
    // additive blending
    setAdditiveBlendMode();
    drawCircle(vec2(-8,-2), 7, hsl(2/3,1,.25));
    drawCircle(vec2(-6, 2), 7, hsl(1/3,1,.5));
    drawCircle(vec2(-4,-2), 7, hsl(0,1,.5));

    // alpha blending
    setAdditiveBlendMode(false);
    drawCircle(vec2(4,-2), 7, hsl(time/9    ,1,.5));
    drawCircle(vec2(8,-2), 7, hsl(time/9+1/3,1,.5,.5));
    drawCircle(vec2(6, 2), 7, hsl(time/9+2/3,1,.5,.5));
}