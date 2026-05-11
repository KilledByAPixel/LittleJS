let tileLayer, pathFinder, playerPos, path = [], walls = [];

function gameInit()
{
    // Sparse obstacle field — not a maze, so string-pulling has room to demo.
    const gridSize = vec2(30, 20);
    tileLayer = new TileCollisionLayer(vec2(), gridSize);

    // Scatter ~25% solid tiles, leaving a small clearing at the center for the player.
    const center = gridSize.scale(0.5);
    for (let x = 0; x < gridSize.x; ++x)
    for (let y = 0; y < gridSize.y; ++y)
    {
        const here = vec2(x, y);
        if (here.distance(center) < 2) continue; // keep a clearing
        if (rand() < 0.25)
        {
            tileLayer.setCollisionData(here, 1);
            walls.push(here);
        }
    }

    pathFinder = new PathFinder(tileLayer);
    pathFinder.debug = true;
    pathFinder.debugTime = 0.5;

    // Snap the player to a guaranteed-clear center tile.
    playerPos = pathFinder.getNearestClearNode(center).posWorld;

    cameraPos = center;
    cameraScale = 25;
    canvasClearColor = hsl(0.6, 0.3, 0.12);
}

function gameUpdate()
{
    if (mouseWasPressed(0))
        path = pathFinder.findPath(playerPos, mousePos);
}

function gameRender()
{
    // Walls — drawn ourselves so the demo doesn't depend on tiles.png content.
    for (const w of walls)
        drawRect(w.add(vec2(0.5)), vec2(0.95), hsl(0.6, 0.6, 0.5));

    // Player.
    drawCircle(playerPos, 0.4, GREEN);

    // Final path — drawn here too so it's visible even when debug is off.
    for (let i = 1; i < path.length; ++i)
        drawLine(path[i - 1], path[i], 0.15, RED);

    // Hint.
    drawText('Click to set destination', vec2(cameraPos.x, cameraPos.y + 12), 0.6, WHITE);
}
