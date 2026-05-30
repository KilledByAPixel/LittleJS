function gameRender()
{
    // a row of moons stepping through a full lunar cycle
    const count = 9;
    for (let i = count; i--;)
    {
        const p = i/(count-1);
        const x = lerp(-12, 12, p);
        drawCircle(vec2(x, 6), 2.5, hsl(.6,.5,.2));
        drawCrescent(vec2(x, 6), 2.5, p, YELLOW, PI/2);
        drawText(p.toFixed(2), vec2(x, 4), .4, WHITE);
    }

    // a large moon animating through its phases
    const p = mod(time/4, 1);
    drawCrescent(vec2(0,-2), 9, p, BLACK, time/4, true,  .2, BLUE);
    drawCrescent(vec2(0,-2), 9, p, WHITE, time/4, false, .2, BLUE);
}