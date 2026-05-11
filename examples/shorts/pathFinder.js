let tileLayer, pathFinder, playerPos, path = [];

function gameInit()
{
    // make sparse obstacle field collision for demo
    const gridSize = vec2(30, 20);
    tileLayer = new TileCollisionLayer(vec2(), gridSize);

    // scatter solid tiles with a small central clearing
    const center = gridSize.scale(0.5);
    const wallColor = hsl(0.6, 0.6, 0.5);
    for (let x = 0; x < gridSize.x; ++x)
    for (let y = 0; y < gridSize.y; ++y)
    {
        const here = vec2(x, y);
        if (here.distance(center) < 2)
            continue; // keep center clear
        if (rand() < 0.25)
        {
            const data = new TileLayerData(1, 0, false, wallColor);
            tileLayer.setCollisionData(here, 1);
            tileLayer.setData(here, data);
        }
    }
    tileLayer.redraw(); 

    // create the pathfinder with the tile layer collision
    pathFinder = new PathFinder(tileLayer);
    //pathFinder.debug = true;

    // snap the player to center tile and save pos
    const startNode = pathFinder.getNearestClearNode(center);
    ASSERT(startNode, 'no clear tile near grid center — try regenerating');
    playerPos = startNode.posWorld.copy();

    // setup the game
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
    // draw the player
    drawCircle(playerPos, 0.4, GREEN);

    // draw the final path
    for (let i = 1; i < path.length; ++i)
    {
        drawCircle(path[i], 0.5, RED);
        drawLine(path[i - 1], path[i], 0.15, RED);
    }
}
