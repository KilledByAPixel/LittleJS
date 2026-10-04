/*
    Little JS TypeScript Demo
    - A simple starter project
    - Shows how to use LittleJS with modules, typed by the littlejs.d.ts the package ships
*/

'use strict';

// import LittleJS module, by its npm name; index.html maps it to the build in dist
import * as LJS from 'littlejsengine';
const {tile, vec2, hsl} = LJS;

// show the LittleJS splash screen
LJS.setShowSplashScreen(true);

// each tile in tiles.png has a 1 pixel border, which stops texture bleeding
LJS.setTileDefaultPadding(1);

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
const sound_click = new LJS.Sound([1,.5]);

// medals
const medal_example = new LJS.Medal(0, 'Example Medal', 'Welcome to LittleJS!');
LJS.medalsInit('Hello World');

// game variables
let particleEmitter: LJS.ParticleEmitter;

///////////////////////////////////////////////////////////////////////////////
function gameInit(): void
{
    // create tile collision and visible tile layer from the level map
    const rows = levelMap.trim().split('\n');
    const levelSize = vec2(rows[0].length, rows.length);
    const tileLayer = new LJS.TileCollisionLayer(vec2(), levelSize);
    for (let x = levelSize.x; x--;)
    for (let y = levelSize.y; y--;)
    {
        // the first row of the map is the top of the level
        if (rows[levelSize.y - 1 - y][x] != '#')
            continue;

        // set tile data
        const pos = vec2(x, y);
        const tileIndex = 1;
        const direction = LJS.randInt(4)
        const mirror = LJS.randBool();
        const color = LJS.randColor();
        const data = new LJS.TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }

    // draw tile layer with new data
    tileLayer.redraw();

    // setup camera
    LJS.setCameraPos(vec2(16,8));
    LJS.setCameraScale(32);

    // enable gravity
    LJS.setGravity(vec2(0,-.01));

    // create a particle effect, built-in sparks twice the size, with some
    // of its settings replaced: more of them, bouncing off the tiles, and
    // carrying some of the emitter's motion as it follows the mouse;
    // particleEffect returns undefined for a name it does not know, and
    // the ! tells TypeScript that sparks is built in
    particleEmitter = LJS.particleEffect('sparks', vec2(16,9), {scale: 2,
        emitRate: 500, particleTime: 1, collideLevel: true, restitution: .3,
        velocityInheritance: .3})!;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate(): void
{
    if (LJS.mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(LJS.mousePos);

        // change particle color and set to fade out
        particleEmitter.colorStartA = LJS.randColor();
        particleEmitter.colorStartB = LJS.randColor();
        particleEmitter.colorEndA = particleEmitter.colorStartA.scale(1,0);
        particleEmitter.colorEndB = particleEmitter.colorStartB.scale(1,0);

        // unlock medals
        medal_example.unlock();
    }

    if (LJS.mouseWheel)
    {
        // zoom in and out with mouse wheel, an imported variable is set
        // through its setter
        const scale = LJS.cameraScale - LJS.sign(LJS.mouseWheel)*LJS.cameraScale/5;
        LJS.setCameraScale(LJS.clamp(scale, 10, 300));
    }

    // move particles to the mouse once it has moved
    if (LJS.mousePosScreen.x)
        particleEmitter.pos = LJS.mousePos.copy();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost(): void
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender(): void
{
    // draw a gray square in the background, inside the walls
    LJS.drawRect(vec2(16,8), vec2(30,14), hsl(0,0,.6));

    // draw the logo as a tile, standing on the floor
    LJS.drawTile(vec2(26,3.25), vec2(4.5), tile(3,128));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost(): void
{
    LJS.drawTextScreen('LittleJS with TypeScript',
        vec2(LJS.mainCanvasSize.x/2, 70), 80, // position, size
        hsl(0,0,1), 6, hsl(0,0,0));           // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);