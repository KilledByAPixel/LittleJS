// loadAtlas imports pre-packed atlases like TexturePacker and Aseprite exports
// frames are looked up by name and grouped into animations automatically

let atlas;

async function gameInit()
{
    // the json usually comes from a file, inline here to keep the demo self contained
    atlas = loadAtlas('tiles.png', {frames: {
        'spin_0.png': {frame: {x:0,   y:0,   w:128, h:128}},
        'spin_1.png': {frame: {x:128, y:0,   w:128, h:128}},
        'spin_2.png': {frame: {x:0,   y:128, w:128, h:128}},
        'spin_3.png': {frame: {x:128, y:128, w:128, h:128}},
        'circle.png': {frame: {x:0,   y:128, w:128, h:128}},
        'train.png':  {frame: {x:128, y:128, w:128, h:128}},
    }});

    // wait for the atlas to finish packing
    await spritesReady();
}

function gameRender()
{
    // frames are looked up by name
    drawTile(vec2(-6, 3), vec2(6), atlas.circle);
    drawTile(vec2(6, 3), vec2(6), atlas.train);

    // numbered frames like spin_0, spin_1 group into an animation automatically
    drawTile(vec2(0, -2), vec2(7), atlas.spin.frame(time*4%4|0));
}
