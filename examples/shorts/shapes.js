function gameRender()
{
    // circles and ellipses
    drawEllipse(vec2(-6,5), vec2(3,2), YELLOW, .5);
    drawCircle(vec2(0,5), 2+wave(.5), RED);
    drawEllipse(vec2(6,5), vec2(2,4), CLEAR_BLACK, .3, .5, CYAN)

    // polygon shapes
    drawRectGradient(vec2(-6,0), vec2(5,4), RED, BLUE)
    drawRegularPoly(vec2(0,0), vec2(4), 3, PURPLE, .2, WHITE, time);
    const starPath = [vec2(0,2), vec2(2,-2), vec2(-3,.5), vec2(3,.5), vec2(-2,-2), vec2(0,2)];
    drawLineList(starPath, .2, GREEN, true, vec2(6, 0));

    // rects and lines
    drawRect(vec2(0,-5), vec2(4,3), ORANGE, time);
    drawLine(vec2(-5,-7), vec2(5,-3), 1,  hsl(0,0,1,.5));
    drawLineList([vec2(5,-3), vec2(-5,-3), vec2(5,-7), vec2(-5,-7)], .2, MAGENTA);
}