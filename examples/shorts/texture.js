function gameRender()
{
    // show the full texture
    let pos = vec2(0,0);             // world position to draw
    let size = vec2(15);             // world size of the tile
    let color = hsl(0,0,1);          // color to multiply the tile by
    let tilePos  = vec2(0,0);        // top left corner of tile in pixels
    let tileSize = vec2(256);        // size of tile in pixels
    let tileInfo = new TileInfo(tilePos, tileSize); // tile info
    drawRect(pos, size, GRAY);       // draw background
    drawTile(pos, size, tileInfo, color);
}