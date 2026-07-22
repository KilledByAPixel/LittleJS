// loadSprite packs images into a texture sheet as they load
// it returns a tile info right away which is filled in when the image is ready

let spriteTile, animTile;

async function gameInit()
{
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
    // show the sheet that both images were packed into
    const sheet = textureSheets[0];
    drawTile(vec2(-8), vec2(9), new TileInfo(vec2(), vec2(sheet.size), sheet.textureInfo));
    drawTextScreen('packed sheet', vec2(190, 60), 30);

    // draw the sprite that was packed
    drawTile(vec2(6, 4), vec2(5), spriteTile);

    // animate by stepping through all 256 packed frames
    drawTile(vec2(6, -3), vec2(5), animTile.frame(time*8%256|0));
}
