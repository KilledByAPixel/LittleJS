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
        if (rand() < .7)
            continue;
        
        // set tile data
        const tileIndex = 1;
        const direction = randInt(4)
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
        // create particle emitter to test the collision
        const hue = rand();
        const particleEmitter = new ParticleEmitter(
            mousePos, 0,
            0, 0.1, 500, PI,
            tile(0, 16),
            hsl(hue,1,.5),   hsl(hue,1,1),
            hsl(hue,1,.5,0), hsl(hue,1,1,0),
            2, .2, .2, .2, .05,
            .99, 1, 1, PI,
            .05, .8, true
        );
        particleEmitter.restitution = .5; // bounce when it collides
        particleEmitter.trailScale = 2;  // stretch as it moves
    }
}