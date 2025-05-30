let spriteAtlas;

function gameInit()
{
    // create a table of all sprites
    const gameTile = (i, size=16)=>  tile(i, size);
    spriteAtlas =
    {
        circle:    gameTile(0),
        crate:     gameTile(1),
        icon:      gameTile(2),
        circleBig: gameTile(2, 128),
        iconBig:   gameTile(3, 128),
    };
}

function gameRender()
{
    drawRect(vec2(0,0), vec2(100), GRAY); // draw background

    // draw a sprite from the atlas
    let pos = vec2(Math.sin(time)*5,-3);// world position to draw
    let angle = 0;                      // world space angle to draw the tile
    let size = vec2(9);                 // world size of the tile
    let mirror = 0;                     // should tile be mirrored?
    let color = hsl(0,0,1);             // color to multiply the tile by
    let additiveColor = hsl(0,0,0,0);   // color to add to
    drawTile(pos, size, spriteAtlas.iconBig, color, angle, mirror, additiveColor);

    // draw more sprites from the atlas
    drawTile(vec2(-7,4), vec2(5), spriteAtlas.crate);
    drawTile(vec2( 0,4), vec2(5), spriteAtlas.circle);
    drawTile(vec2( 7,4), vec2(5), spriteAtlas.circleBig);
}