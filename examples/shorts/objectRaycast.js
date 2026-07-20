function gameInit()
{
    canvasClearColor = hsl(0,0,.2);

    // create random objects with raycast collision enabled
    for (let i=20; i--;)
    {
        const pos = randInCircle(8);
        const size = vec2(rand(1,3), rand(1,3));
        const o = new EngineObject(pos, size, 0, rand(PI), GRAY);
        o.setCollision(); // enables raycast collision
    }
}

function gameRenderPost()
{
    // cast ray from center to mouse
    const start = vec2();
    const end = mousePos;
    const hits = engineObjectsRaycast(start, end);

    // highlight hit objects
    for (const o of hits)
        drawRect(o.pos, o.size, RED, o.angle);

    // draw the ray
    drawLine(start, end, .1, hits.length ? RED : CYAN);
    drawText(hits.length + ' object(s) hit', vec2(0, 8));
}