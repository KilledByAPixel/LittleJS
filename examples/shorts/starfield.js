function gameRender()
{
    setBlendMode(1)
    for(let i=2e3; i--;)
    {
        // use math to generate random star positions
        const offset = time*(9+i**2.1%15) + i**2.3;
        const pos = vec2(offset%70-35, i/120-8);
        const size = vec2(i%.11+.07)
        const color = hsl(0, 0, Math.sin(i)**4);
        drawRect(pos, size, color);
    }
}