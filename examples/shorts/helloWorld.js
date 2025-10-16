function gameRender()
{
    // draw background gradient
    drawRectGradient(cameraPos, getCameraSize(), BLACK, WHITE);

    // draw text to the overlay canvas
    drawTextOverlay('LittleJS Engine', vec2(0,3), 3);
        
    // draw a tile
    drawTile(vec2(sin(time)*3,-2), vec2(7), tile(3,128));
}