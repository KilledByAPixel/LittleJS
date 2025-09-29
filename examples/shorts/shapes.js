function gameRender()
{
    // polygon shapes
    for (let j=3; j<7; ++j)
    {
        let points = [];
        for (let i=0; i<j; ++i)
        {
            let angle = i * Math.PI * 2 / j;
            points.push(vec2(j*4-18,0).add(vec2(0,1).rotate(angle)));
        }
        drawPoly(points, hsl(j/4+time/9,1,.5)); // draw a regular polygon
    }

    // circles and ellipses
    drawCircle(vec2(0,5), 1+wave(.5), hsl(.15,1,.5));
    drawEllipse(vec2(-5,5), vec2(2,1), hsl(0,1,.5));
    drawEllipse(vec2(5,5), vec2(.5,2), hsl(.55,1,.5), .5);

    // rects and lines
    drawRect(vec2(0,-5), vec2(4,3), hsl(.6,1,.5), time);
    drawLine(vec2(-5,-7), vec2(5,-3), 1,  hsl(0,0,1, .5));
    drawLine(vec2(-5,-3), vec2(5,-7), .2, hsl(1,1,.5));
}