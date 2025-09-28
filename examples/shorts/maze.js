function generateMaze(size)
{
    const maze = [], w = size.x, h = size.y;
    maze[1 + w] = 1; // start point
    for (let k=w*h*9|0; k--;)
    {
        // get a random position on odd coordinates
        const jx = randInt(w/2-(w%2?0:2)|0)*2 + 1;
        const jy = randInt(h/2-(h%2?1:2)|0)*2 + 1;
        const j = jx + jy*w;

        // get a random direction
        const d = randSign() * (randBool() ? 1 : w);

        // check if we are not the same line or column
        if (j%w != (j+d*2)%w && (j/w|0) != ((j+d*2)/w|0))
            continue;

        // check if pos is open and the next 2 cells are closed
        if (maze[j] && !maze[j+d] && !maze[j+d*2]) 
            maze[j+d] = maze[j+d*2] = 1;
    }
    return maze;
}

function gameInit()
{
    // generate maze data
    const mazeSize = vec2(27,15);
    const maze = generateMaze(mazeSize);

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, mazeSize);
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (maze[pos.x + pos.y*mazeSize.x])
            continue;

        // set tile data
        tileLayer.setData(pos, new TileLayerData(1));
    }
    tileLayer.redraw(); // redraw tile layer with new data
    cameraPos = mazeSize.scale(.5); // center camera
}