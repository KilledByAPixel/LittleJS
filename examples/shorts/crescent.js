function gameRender()
{
    // a row of moons stepping through a full lunar cycle
    const count = 9;
    for (let i = 0; i < count; i++)
    {
        const percent = i/(count-1);        // 0=new .. .5=full .. 1=new
        const x = lerp(-8, 8, percent);
        drawCrescent(vec2(x, 4), 1.9, percent, YELLOW, PI/2, false, .05, hsl(0,0,0,.5));
        drawText(percent.toFixed(2), vec2(x, 2.7), .4, WHITE);
    }

    // a large moon animating through its phases
    const percent = mod(time/4, 1);
    drawCrescent(vec2(0,-3), 8, percent, hsl(.12,.5,.1), time/4, true, .15, hsl(.6,.4,.3));
    drawCrescent(vec2(0,-3), 8, percent, hsl(.12,.5,.9), time/4, false, .15, hsl(.6,.4,.3));
}