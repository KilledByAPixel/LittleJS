/*
    Little JS Starter Project
    - A simple starter project for LittleJS
    - Demos all the main engine features
    - Builds to a zip file
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);
// each tile in tiles.png has a 1 pixel border, which stops texture bleeding
setTileDefaultPadding(1);

// the level, one character a cell: # is a block, a space is empty
const levelMap = `
################################
#                              #
#                              #
#   #####            #####     #
#                              #
#                              #
#          ##########          #
#                              #
#                              #
#  ####                  ####  #
#                              #
#                              #
#        ####      ####        #
#                              #
#                              #
################################`;

// sound effects
const sound_click = new Sound([1,.5]);

// medals
const medal_example = new Medal(0, 'Example Medal', 'Welcome to LittleJS!');
medalsInit('Hello World');

// game variables
let particleEmitter;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer from the level map
    const rows = levelMap.trim().split('\n');
    const levelSize = vec2(rows[0].length, rows.length);
    const tileLayer = new TileCollisionLayer(vec2(), levelSize);
    for (let x = levelSize.x; x--;)
    for (let y = levelSize.y; y--;)
    {
        // the first row of the map is the top of the level
        if (rows[levelSize.y - 1 - y][x] != '#')
            continue;

        // set tile data
        const pos = vec2(x, y);
        const tileIndex = 1;
        const direction = randInt(4)
        const mirror = randBool();
        const color = randColor();
        const data = new TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }

    // draw tile layer with new data
    tileLayer.redraw();

    // setup camera
    setCameraPos(vec2(16,8));
    setCameraScale(32);

    // enable gravity
    setGravity(vec2(0,-.01));

    // create a particle effect, built-in sparks twice the size, with some
    // of its settings replaced: more of them, bouncing off the tiles, and
    // carrying some of the emitter's motion as it follows the mouse
    particleEmitter = particleEffect('sparks', vec2(16,9), {scale: 2,
        emitRate: 500, particleTime: 1, collideLevel: true, restitution: .3,
        velocityInheritance: .3});
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(mousePos);

        // change particle color and set to fade out
        particleEmitter.colorStartA = randColor();
        particleEmitter.colorStartB = randColor();
        particleEmitter.colorEndA = particleEmitter.colorStartA.scale(1,0);
        particleEmitter.colorEndB = particleEmitter.colorStartB.scale(1,0);

        // unlock medals
        medal_example.unlock();
    }

    if (mouseWheel)
    {
        // zoom in and out with mouse wheel
        cameraScale -= sign(mouseWheel)*cameraScale/5;
        cameraScale = clamp(cameraScale, 10, 300);
    }

    // move particles to the mouse once it has moved
    if (mousePosScreen.x)
        particleEmitter.pos = mousePos.copy();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a gray square in the background, inside the walls
    drawRect(vec2(16,8), vec2(30,14), hsl(0,0,.6));

    // draw the logo as a tile, standing on the floor
    drawTile(vec2(26,3.25), vec2(4.5), tile(3,128));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    drawTextScreen('LittleJS Demo', 
        vec2(mainCanvasSize.x/2, 70), 80,   // position, size
        hsl(0,0,1), 6, hsl(0,0,0));         // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);