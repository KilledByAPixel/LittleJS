// loadSprite packs images into a texture sheet as they load
// it returns a tile info right away which is filled in when the image is ready

let spriteTile, animTile;

async function gameInit()
{
    // use a small sheet size so this demo spills onto a second sheet
    setTextureSheetSize(512);

    // load the whole image as a single sprite
    spriteTile = loadSprite('tiles.png');

    // load the same image again split into 16x16 frames
    // this is a 16x16 grid, frames wrap down to the next row automatically
    animTile = loadSprite('tiles.png', vec2(16));

    // wait for both images to finish packing
    await spritesReady();
}

function gameRender()
{
    // show every sheet, the second image did not fit so it made a new sheet
    for (let i = 0; i < textureSheets.length; ++i)
    {
        const sheet = textureSheets[i];
        const pos = vec2(-9 + i*8, 2);
        drawTile(pos, vec2(7), new TileInfo(vec2(), vec2(sheet.size), sheet.textureInfo));
        drawText('sheet ' + i, pos.add(vec2(0, 4.5)), 1);
    }

    // draw the sprite that was packed
    drawTile(vec2(6, 4), vec2(5), spriteTile);

    // animate by stepping through the first row of packed frames
    drawTile(vec2(6, -3), vec2(5), animTile.frame(time*8%16|0));
}
