canvasClearColor = GRAY;

function gameRender()
{
    {
        // animate using multiple frames
        const pos = vec2(-5, 2*abs(Math.sin(time*2*PI)));
        const frame = (time*4)%2|0;
        drawTile(pos, vec2(7), tile(3).frame(frame), RED);
    }
    {
        // animate with stretch and squash
        const s = Math.sin(time*9)*.5;
        const size = vec2(7-s,7+s);
        const pos = vec2(5,size.y-7);
        drawTile(pos, size, tile(5), GREEN);
    }
}