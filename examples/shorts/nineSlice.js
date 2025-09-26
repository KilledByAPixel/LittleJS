function gameRender()
{
    const nineSliceTile = tile(16);
    const threeSliceTile = tile(19);

    // draw nine slice with thin border and color
    drawNineSlice(vec2(-7,4), vec2(13, 6), nineSliceTile, hsl(.1,.5,.9), .5);
    drawTextOverlay('Nine Slice\nThin Border', vec2(-7,4), 1, BLACK);

    // draw nine slice in screen space with thick border
    drawNineSliceScreen(vec2(700,150), vec2(250), nineSliceTile);
    drawTextScreen('Nine Slice\nScreen Space', vec2(700,150), 30, BLACK);
    
    // draw three slice with thick border and additive color
    drawThreeSlice(vec2(-7,-4), vec2(9, 7), threeSliceTile, WHITE, 2, hsl(.6,1,.5));
    drawTextOverlay('Three Slice\nThick Border', vec2(-7,-4), 1, BLACK);

    // draw three slice in screen space with thick border
    drawThreeSliceScreen(vec2(700,400), vec2(300,150), threeSliceTile);
    drawTextScreen('Three Slice\nScreen Space', vec2(700,400), 30, BLACK);
}