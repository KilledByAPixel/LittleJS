function gameRender()
{
    // draw background
    for (let i=12; i--;)
    {
        const a = i/6*PI;
        const pos = vec2(0,7).rotate(a);
        drawRect(pos, vec2(.5,1), hsl(i/12,1,.5), a);
    }

    // get current time
    const d = Date().slice(16,24);
    const s = d.slice(6,8)|0;
    const m = d.slice(3,5)|0;
    const h = (d.slice(0,2)|0) + m/60;

    // draw clock hands
    drawLine(vec2(0,0), vec2(0,4).rotate(h/12*2*PI),  1);
    drawLine(vec2(0,0), vec2(0,6).rotate(m/60*2*PI), .4);
    drawLine(vec2(0,0), vec2(0,8).rotate(s/60*2*PI), .1);
}