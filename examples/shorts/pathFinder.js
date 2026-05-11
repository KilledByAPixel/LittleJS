let tileLayer, pathFinder, playerPos, path = [];

function gameInit()
{
    // make sparse obstacle field collision for demo
    const gridSize = vec2(30, 20);
    tileLayer = new TileCollisionLayer(vec2(), gridSize);

    // scatter solid tiles, leaving a small clearing at the center
    const center = gridSize.scale(0.5);
    const wallColor = hsl(0.6, 0.6, 0.5);
    for (let x = 0; x < gridSize.x; ++x)
    for (let y = 0; y < gridSize.y; ++y)
    {
        const here = vec2(x, y);
        if (here.distance(center) < 2) continue; // keep a clearing
        if (rand() < 0.25)
        {
            tileLayer.setCollisionData(here, 1);
            tileLayer.setData(here, new TileLayerData(1, 0, false, wallColor));
        }
    }
    tileLayer.redraw(); // render the wall tiles into the layer's offscreen canvas

    pathFinder = new PathFinder(tileLayer);
    pathFinder.debug = true;
    pathFinder.debugTime = 0.5;

    // snap the player to clear center tile and save pos
    const startNode = pathFinder.getNearestClearNode(center);
    ASSERT(startNode, 'no clear tile near grid center — try regenerating');
    playerPos = startNode.posWorld.copy();

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
    // (Walls render through tileLayer's built-in tile rendering.)

    // Player.
    drawCircle(playerPos, 0.4, GREEN);

    // Final path — drawn here too so it's visible even when debug is off.
    for (let i = 1; i < path.length; ++i)
        drawLine(path[i - 1], path[i], 0.15, RED);

    // Hint.
    drawText('Click to set destination', vec2(cameraPos.x, cameraPos.y + 12), 0.6, WHITE);
}
