function gameRender()
{
    const nineSliceTile = tile(16);
    const threeSliceTile = tile(19);

    {
        // draw nine slice with thin border and color
        const pos = vec2(-7,4);
        const size = vec2(11+wave(.5,2), 6);
        const color = hsl(.1,.5,.9);
        const border = .5;
        drawNineSlice(pos, size, nineSliceTile, color, border);
        drawText('Nine Slice\nThin Border', pos, 1, BLACK);
    }
    {
        // draw nine slice in screen space with thick border and rotation
        const pos = vec2(700,150);
        const size = vec2(250);
        const border = 32;
        const angle = time/2;
        drawNineSliceScreen(pos, size, nineSliceTile, border, 2, angle);
        drawTextScreen('Nine Slice\nScreen Space', pos, 30, BLACK);
    } 
    {
        // draw three slice with variable border and additive color
        const pos = vec2(-7,-4);
        const size = vec2(9, 7);
        const border = 2 + wave(.2)*2;
        const additive = hsl(time/30,.5,.5);
        drawThreeSlice(pos, size, threeSliceTile, WHITE, border, additive);
        drawText('Three Slice\nVariable\nBorder', pos, 1, BLACK);
    }
    {
        // draw three slice in screen space with changing size        
        const pos = vec2(700,420);
        const size = vec2(350-wave(.3,90),120+wave(.3,60));
        drawThreeSliceScreen(pos, size, threeSliceTile);
        drawTextScreen('Three Slice\nScreen Space', pos, 30, BLACK);
    }
}