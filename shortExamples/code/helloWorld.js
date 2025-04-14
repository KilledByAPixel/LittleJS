function gameRender()
{
    // draw to overlay canvas
    drawTextScreen('Hello World', 
        mainCanvasSize.scale(.5), 80,   // position, size
        hsl(0,0,1), 6, hsl(0,0,0));     // color, outline size and color
}