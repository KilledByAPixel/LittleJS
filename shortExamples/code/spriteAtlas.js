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
        largeIcon: gameTile(vec2(1,1),128),
    };
}

function gameRender()
{
    drawRect(vec2(0,0), vec2(100), GRAY); // draw background

    // draw a sprite from the atlas
    let pos = vec2(0,0);             // world position to draw
    let angle = 0;                   // world space angle to draw the tile
    let size = vec2(15);              // world size of the tile
    let mirror = 0;                  // should tile be mirrored?
    let color = hsl(0,0,1);          // color to multiply the tile by
    drawTile(pos, size, spriteAtlas.largeIcon, color, angle, mirror);
}