function gameRender()
{
    // draw background rect
    drawRect(cameraPos, vec2(30), hsl(0,0,.2));

    // draw text to the overlay canvas
    drawTextOverlay('Hello World', vec2(0,3), 3);
        
    // draw a tile
    drawTile(vec2(Math.sin(time)*3,-2), vec2(7), tile(3,128));
}