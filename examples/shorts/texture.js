function gameRender()
{
    // show the full texture
    let pos = vec2();         // world position to draw
    let size = vec2(15);      // world size of the tile
    let color = hsl(0,0,1);   // color to multiply the tile by
    let tilePos  = vec2();    // top left corner in pixels
    let tileSize = vec2(256); // source size in pixels
    let tileInfo = new TileInfo(tilePos, tileSize); // tile info

    // draw background
    drawRect(pos, size, GRAY);

    // draw the tile
    drawTile(pos, size, tileInfo, color);
}