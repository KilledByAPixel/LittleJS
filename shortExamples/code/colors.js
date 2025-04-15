function gameRender()
{
    // color constants
    drawRect(vec2(-8, 5), vec2(3), RED);
    drawRect(vec2(-4, 5), vec2(3), YELLOW);
    drawRect(vec2(-0, 5), vec2(3), GREEN);
    drawRect(vec2( 4, 5), vec2(3), BLUE);
    drawRect(vec2( 8, 5), vec2(3), WHITE);
    
    // rgb and hsl color
    drawRect(vec2(-8, 0), vec2(3), new Color(1,0,0));
    drawRect(vec2(-4, 0), vec2(3), rgb(0,1,1));
    drawRect(vec2(-0, 0), vec2(3), hsl(0,1,.5));
    drawRect(vec2( 4, 0), vec2(3), hsl(.6,.5,.5));
    drawRect(vec2( 8, 0), vec2(3), hsl(0,0,1));

    // color lerpping
    for(let i=5; i--;)
    {
        const color1 = RED;
        const color2 = YELLOW;
        const color = color1.lerp(color2, i/4);
        drawRect(vec2(-8+i*4, -5), vec2(3), color);
    }
}