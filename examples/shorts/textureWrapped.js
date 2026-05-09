function gameInit()
{
    canvasClearColor = BLACK;
}

function gameRender()
{
    // 1. Static background tile across most of the view.
    drawTextureWrapped(vec2(0, 0), vec2(40, 30), vec2(8, 6));

    // 2. Rotating, fewer wraps — verifies rotation around `pos`.
    drawTextureWrapped(vec2(-10, 0), vec2(6, 6), vec2(2, 2),
        0, WHITE, time);

    // 3. Red-tinted, also rotating — verifies the tint path
    //    (WebGL: per-vertex color attribute; Canvas2D: bakeTintedImage).
    drawTextureWrapped(vec2(10, 0), vec2(6, 6), vec2(2, 2),
        0, RED, -time);

    // 4. Animated wrap count — texture appears to zoom in/out.
    const wraps = 2 + sin(time) * 1.5;
    drawTextureWrapped(vec2(0, -10), vec2(12, 4), vec2(wraps, wraps));

    // labels
    drawText('drawTextureWrapped',  vec2(0,  10), 1.5, WHITE);
    drawText('rotating',            vec2(-10, 4), 0.7, WHITE);
    drawText('rotating + tinted',   vec2(10,  4), 0.7, WHITE);
    drawText('animated wrap count', vec2(0,  -7), 0.7, WHITE);
}
