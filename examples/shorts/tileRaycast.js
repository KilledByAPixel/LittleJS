function gameInit()
{
    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(28,16), 0);
    cameraPos = tileLayer.size.scale(.5); // setup camera
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // create random solid tiles away from level center
        if (rand() < .7 || cameraPos.distanceSquared(pos) < 9)
            continue;
        
        // set tile data
        const data = new TileLayerData(1);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw();
}

function gameRenderPost()
{
    // cast ray from camera center to mouse
    drawLine(cameraPos, mousePos, .1, CYAN);
    const normal = vec2();
    const hit = tileCollisionRaycast(cameraPos, mousePos, 0, normal);
    if (hit)
    {
        // draw hit tile
        const tilePos = hit.floor().add(vec2(.5));
        drawRect(tilePos, vec2(1), RED);

        // draw hit point and normal
        drawRect(hit, vec2(.2), GREEN);
        drawLine(cameraPos, hit, .1, RED);
        drawLine(hit, hit.add(normal), .1, YELLOW);
    }
}