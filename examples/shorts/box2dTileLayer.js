let tileLayer;

async function gameInit()
{
    // setup box2d
    await box2dInit();
    cameraPos = vec2(16); // setup camera
    gravity.y = -30; // enable gravity
    canvasClearColor = hsl(0,0,.2); // background color

    // create tile layer
    const pos = vec2();
    tileLayer = new Box2dTileLayer(pos, vec2(32));
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (randBool(.7))
            continue;
        
        // set tile data
        const tileIndex = 11;
        const direction = randInt(4)
        const mirror = randBool();
        const color = randColor(WHITE, hsl(0,0,.2));
        const data = new TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw(); // redraw tile layer with new data
    tileLayer.buildCollision(); // create box2d collision from tile layer
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // clear tile that was clicked
        tileLayer.clearData(mousePos, true);
        tileLayer.clearCollisionData(mousePos);
        tileLayer.buildCollision();

        // spawn box2d object at mouse position
        const o = new Box2dObject(mousePos, vec2(), 0, 0, randColor());
        const friction = .2, restitution = .5;
        o.addCircle(rand(.5,1), vec2(), 1, friction, restitution);
    }
}