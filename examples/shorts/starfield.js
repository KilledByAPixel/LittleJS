function gameRender()
{
    // precreate variables to avoid overhead
    const pos = vec2(), size = vec2(), color = new Color;
    for (let i=2e3; i--;)
    {
        // use math to generate random star positions
        const offset = time*(9+i**2.1%15) + i**2.3;
        pos.x = offset%70 - 35;
        pos.y = i/110 - 9;
        size.x = size.y = i%.11 + .07;
        color.set(1,1,1,Math.sin(i)**4);
        drawRect(pos, size, color);
    }
}