function gameInit()
{
    cameraPos = vec2(16); // setup camera
    gravity.y = -.01; // enable gravity
    canvasClearColor = hsl(0,0,.2); // background color

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(32));
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (randBool(.7))
            continue;
        
        // set tile data
        const tileIndex = 11;
        const direction = randInt(4);
        const mirror = randBool();
        const color = randColor(WHITE, hsl(0,0,.2));
        const data = new TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw(); // redraw tile layer with new data
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // a burst of sparks in a random color that bounces off the tiles;
        // the options replace the effect's own settings for this burst
        particleEffect('sparks', mousePos, {scale: 2, hue: rand(),
            emitTime: .1, emitRate: 500, particleTime: 2, gravity: -.01,
            collideLevel: true, restitution: .5});
    }
}