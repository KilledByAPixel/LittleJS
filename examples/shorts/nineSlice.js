function gameRender()
{
    const nineSliceTile = tile(16);
    const threeSliceTile = tile(19);

    // draw nine slice with thin border and color
    drawNineSlice(vec2(-7,4), vec2(11+wave(.5,2), 6), nineSliceTile, hsl(.1,.5,.9), .5);
    drawTextOverlay('Nine Slice\nThin Border', vec2(-7,4), 1, BLACK);

    // draw nine slice in screen space with thick border and rotation
    drawNineSliceScreen(vec2(700,150), vec2(250), nineSliceTile, 32, 2, time/2);
    drawTextScreen('Nine Slice\nScreen Space', vec2(700,150), 30, BLACK);
    
    // draw three slice with variable border and additive color
    drawThreeSlice(vec2(-7,-4), vec2(9, 7), threeSliceTile, WHITE, 2+wave(.2)*2, hsl(time/30,.5,.5));
    drawTextOverlay('Three Slice\nVariable\n Border', vec2(-7,-4), 1, BLACK);

    // draw three slice in screen space with changing size
    drawThreeSliceScreen(vec2(700,420), vec2(350-wave(.3,90),120+wave(.3,60)), threeSliceTile);
    drawTextScreen('Three Slice\nScreen Space', vec2(700,420), 30, BLACK);
}