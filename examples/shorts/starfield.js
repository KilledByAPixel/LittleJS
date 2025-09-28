function gameRender()
{
    setBlendMode(1);
    // precreate variables to avoid overhead
    let pos = vec2(), size = vec2(), color = WHITE;
    for(let i=2e3; i--;)
    {
        // use math to generate random star positions
        const offset = time*(9+i**2.1%15) + i**2.3;
        pos.x = offset%70-35;
        pos.y = i/120-8;
        size.x = size.y = i%.11+.07;
        color.setHSLA(0, 0, Math.sin(i)**4);
        drawRect(pos, size, color);
    }
    setBlendMode(0);
}