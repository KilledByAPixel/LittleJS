function gameInit()
{
    cameraPos = vec2(16); // setup camera
    gravity = -.01; // enable gravity

    // create tile collision and visible tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(32));

    // init the tile layer
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        if (rand() < .7)
            continue;
        
        // set tile data
        const tileIndex = 1;
        const direction = randInt(4)
        const mirror = !randInt(2);
        const color = randColor(WHITE, hsl(0,0,.2));
        const data = new TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos, 1);
    }
    tileLayer.redraw(); // redraw tile layer with new data
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // create particle emitter
        const hue = rand();
        const particleEmitter = new ParticleEmitter(
            mousePos, 0,                // emitPos, emitAngle
            0, 0.1, 500, PI,            // emitSize, emitTime, emitRate, emitCone
            tile(0, 16),                // tileIndex, tileSize
            hsl(hue,1,.5),   hsl(hue,1,1),   // colorStartA, colorStartB
            hsl(hue,1,.5,0), hsl(hue,1,1,0), // colorEndA, colorEndB
            2, .2, .2, .2, .05,         // time, sizeStart, sizeEnd, speed, angleSpeed
            .99, 1, 1, PI,              // damping, angleDamping, gravityScale, cone
            .05, .8, true, false        // fadeRate, randomness, collide, additive
        );
        particleEmitter.elasticity = .5; // bounce when it collides
        particleEmitter.trailScale = 2;  // stretch in direction of motion
    }
}