function gameRender()
{
    // a row of moons stepping through a full lunar cycle
    const count = 9;
    for (let i = 0; i < count; i++)
    {
        const percent = i/(count-1);        // 0=new .. .5=full .. 1=new
        const x = lerp(-8, 8, percent);
        drawCrescent(vec2(x, 4), .9, percent, YELLOW, 0, false, .05, hsl(0,0,0,.5));
        drawText(percent.toFixed(2), vec2(x, 2.7), .4, WHITE);
    }

    // a large moon animating continuously through its phases
    const percent = mod(time/4, 1);
    drawCrescent(vec2(0,-3), 4, percent, hsl(.12,.5,.8), time/8, false, .15, hsl(.6,.4,.3));
    drawText('percent: ' + percent.toFixed(2), vec2(0,-8.7), .7, WHITE);
}
