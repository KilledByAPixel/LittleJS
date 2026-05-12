let tileLayer, pathFinder, playerPos, path = [];

function gameInit()
{
    // make sparse obstacle field collision for demo
    const gridSize = vec2(30, 20);
    tileLayer = new TileCollisionLayer(vec2(), gridSize);

    // scatter solid tiles with small central clearing
    const center = gridSize.scale(.5);
    const wallColor = hsl(.6, .6, .5);
    for (let x = 0; x < gridSize.x; ++x)
    for (let y = 0; y < gridSize.y; ++y)
    {
        const pos = vec2(x, y);
        if (pos.distance(center) < 2 || rand() < .8)
            continue; // keep center clear
        
        const data = new TileLayerData(1, 0, false, wallColor);
        tileLayer.setCollisionData(pos, 1);
        tileLayer.setData(pos, data);
    }
    tileLayer.redraw(); 

    // create pathfinder with tile layer collision
    pathFinder = new PathFinder(tileLayer);
    //pathFinder.debug = true;

    // snap player to center tile and save pos
    const startNode = pathFinder.getNearestClearNode(center);
    playerPos = startNode.posWorld.copy();

    // setup game
    cameraPos = center;
    cameraScale = 25;
}

function gameUpdate()
{
    if (mouseIsDown(0))
        path = pathFinder.findPath(playerPos, mousePos);
}

function gameRender()
{
    // draw final path
    for (let i = 1; i < path.length; ++i)
    {
        drawCircle(path[i], .5, RED);
        drawLine(path[i - 1], path[i], .15, RED);
    }

    // draw player
    drawCircle(playerPos, .4, GREEN);
}