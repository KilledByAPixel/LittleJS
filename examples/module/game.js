/*
    Little JS Module Demo
    - A simple starter project
    - Shows how to use LittleJS with modules
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
const {tile, vec2, hsl} = LJS;

// show the LittleJS splash screen
LJS.setShowSplashScreen(true);

// fix texture bleeding by shrinking tile slightly
LJS.setTileFixBleedScale(.5);

// sound effects
const sound_click = new LJS.Sound([1,.5]);

// medals
const medal_example = new LJS.Medal(0, 'Example Medal', 'Welcome to LittleJS!');
LJS.medalsInit('Hello World');

// game variables
let particleEmitter;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer
    const pos = vec2();
    const tileLayer = new LJS.TileCollisionLayer(pos, vec2(32,16));

    // get level data from the tiles image
    const mainContext = LJS.mainContext;
    const tileImage = LJS.textureInfos[0].image;
    mainContext.drawImage(tileImage, 0, 0);
    const imageData = mainContext.getImageData(0,0,tileImage.width,tileImage.height).data;
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if this pixel is set
        const i = pos.x + tileImage.width*(15 + tileLayer.size.y - pos.y);
        if (!imageData[4*i])
            continue;
        
        // set tile data
        const tileIndex = 1;
        const direction = LJS.randInt(4)
        const mirror = !LJS.randInt(2);
        const color = LJS.randColor();
        const data = new LJS.TileLayerData(tileIndex, direction, mirror, color);
        tileLayer.setData(pos, data);
        tileLayer.setCollisionData(pos);
    }

    // draw tile layer with new data
    tileLayer.redraw();

    // move camera to center of collision
    LJS.setCameraPos(tileLayer.size.scale(.5));
    LJS.setCameraScale(32);

    // enable gravity
    LJS.setGravity(vec2(0,-.01));

    // create particle emitter
    particleEmitter = new LJS.ParticleEmitter(
        vec2(16,9), 0,              // emitPos, emitAngle
        0, 0, 500, 3.14,            // emitSize, emitTime, rate, cone
        tile(0, 16),                // tileIndex, tileSize
        hsl(1,1,1),   hsl(0,0,0),   // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0), // colorEndA, colorEndB
        1, .2, .2, .1, .05, // time, sizeStart, sizeEnd, speed, angleSpeed
        .99, 1, 1, 3.14,    // damping, angleDamping, gravityScale, cone
        .05, .5, true, true // fadeRate, randomness, collide, additive
    );
    particleEmitter.restitution = .3; // bounce when it collides
    particleEmitter.trailScale = 2;   // stretch as it moves
    particleEmitter.velocityInheritance = .3; // inherit emitter velocity
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
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

    // move particles to mouse location if on screen
    if (LJS.mousePosScreen.x)
        particleEmitter.pos = LJS.mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background
    LJS.drawRect(vec2(16,8), vec2(20,14), hsl(0,0,.6));
    
    // draw the logo as a tile
    LJS.drawTile(vec2(21,5), vec2(4.5), tile(3,128));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    LJS.drawTextScreen('LittleJS with Modules', vec2(LJS.mainCanvasSize.x/2, 80), 80);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);