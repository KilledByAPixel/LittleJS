function gameRender()
{
    // scrolling 2D noise field rendered as a grid of cells
    const size = getCameraSize();
    const cell = .5;
    const cols = ceil(size.x / cell) + 1;
    const rows = ceil(size.y / cell) + 1;
    const ox = cameraPos.x - size.x / 2;
    const oy = cameraPos.y - size.y / 2;
    const scale = .3;
    const pos = vec2(), s = vec2(cell), color = rgb();
    for (let i = 0; i < cols; ++i)
    for (let j = 0; j < rows; ++j)
    {
        pos.x = ox + i * cell;
        pos.y = oy + j * cell;
        const n = noise2D(pos.x * scale + time, pos.y * scale);
        color.set(n, n, n);
        drawRect(pos, s, color);
    }

    // 1D noise plotted as a curve along the top
    const top = cameraPos.y + size.y / 2 - 1.5;
    for (let i = 0; i < cols; ++i)
    {
        const x = ox + i * cell;
        const y = top + noise1D(x * scale + time) * 2 - 1;
        drawRect(vec2(x, y), vec2(cell, .15), YELLOW);
    }

    drawText('noise2D field (scrolling) + noise1D curve', vec2(0, size.y/2 - .5), .8);
}
