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
    canvasClearColor = GRAY;
}

function gameRender()
{
    // draw a sprite from the atlas
    let pos = vec2(Math.sin(time)*5,-3);// world position
    let angle = 0;                      // world space angle
    let size = vec2(9);                 // world space size
    let mirror = 0;                     // should tile be mirrored?
    let color = hsl(0,0,1);             // color to multiply by
    let additive = hsl(0,0,0,0);        // color to add to
    drawTile(pos, size, spriteAtlas.iconBig, color, angle, mirror, additive);

    // draw more sprites from the atlas
    drawTile(vec2(-7,4), vec2(5), spriteAtlas.crate);
    drawTile(vec2( 0,4), vec2(5), spriteAtlas.circle);
    drawTile(vec2( 7,4), vec2(5), spriteAtlas.circleBig);
}