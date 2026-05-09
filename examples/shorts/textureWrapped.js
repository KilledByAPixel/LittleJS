function gameRender()
{
    // draw a wrapped texture
    drawTextureWrapped(vec2(-6, 2), vec2(12, 6), vec2(3, 2));

    // draw red tinted wrapped and rotating
    drawTextureWrapped(vec2(9, 2), vec2(6, 6), vec2(2), 0, RED, time);

    // animated wrap count
    const wraps = 2 - sin(time);
    drawTextureWrapped(vec2(0, -5), vec2(12, 4), vec2(wraps, 1/16));
}