function gameRender()
{
    // circles and ellipses
    drawEllipse(vec2(-6,5), vec2(3,2), YELLOW, .5);
    drawCircle(vec2(0,5), 2+oscillate(.5), RED);
    drawEllipse(vec2(6,5), vec2(2,4), CLEAR_BLACK, .3, .5, CYAN)

    // polygon shapes
    drawRectGradient(vec2(-6,0), vec2(5,4), RED, BLUE)
    drawRegularPoly(vec2(), vec2(4), 3, PURPLE, .3, WHITE, time);
    let starPath = []
    for (let i=10; i--;)
        starPath.push(vec2(0,2*(i%2?.4:1)).rotate(i/10*PI*2));
    drawPoly(starPath, BLUE, .1, GREEN, vec2(6, 0));

    // rects and lines
    drawRect(vec2(0,-5), vec2(4,3), ORANGE, time);
    drawLine(vec2(-5,-7), vec2(5,-3), 1,  hsl(0,0,1,.5));
    const zPath = [vec2(5,-3), vec2(-5,-3), vec2(5,-7), vec2(-5,-7)];
    drawLineList(zPath, .4, MAGENTA);
}