/*
    LittleJS Hello World Starter Game
*/

'use strict';

// import module
import * as LittleJS from '../../build/littlejs.esm.js';
const {Color, vec2} = LittleJS;

// sound effects
const sound_click = new LittleJS.Sound([1,.5]);

// medals
const medal_example = new LittleJS.Medal(0, 'Example Medal', 'Welcome to LittleJS!');
LittleJS.medalsInit('Hello World');

// game variables
let particleEmitter: LittleJS.ParticleEmitter;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer
    LittleJS.initTileCollision(vec2(32, 16));
    const pos = vec2();
    const tileLayer = new LittleJS.TileLayer(pos, LittleJS.tileCollisionSize);

    // get level data from the tiles image
    const imageLevelDataRow = 1;
    const mainContext = LittleJS.mainContext;
    mainContext.drawImage(LittleJS.tileImage, 0, 0);
    for (pos.x = LittleJS.tileCollisionSize.x; pos.x--;)
    for (pos.y = LittleJS.tileCollisionSize.y; pos.y--;)
    {
        const imageData = mainContext.getImageData(pos.x, 16*(imageLevelDataRow+1)-pos.y-1, 1, 1).data;
        if (imageData[0])
        {
            const tileIndex = 1;
            const direction = LittleJS.randInt(4)
            const mirror = LittleJS.randInt(2) ? true : false;
            const color = LittleJS.randColor();
            const data = new LittleJS.TileLayerData(tileIndex, direction, mirror, color);
            tileLayer.setData(pos, data);
            LittleJS.setTileCollisionData(pos, 1);
        }
    }
    tileLayer.redraw();

    // move camera to center of collision
    LittleJS.setCameraPos(LittleJS.tileCollisionSize.scale(.5));

    // enable gravity
    LittleJS.setGravity(-.01);

    // create particle emitter
    const center = LittleJS.tileCollisionSize.scale(.5).add(vec2(0,9));
    particleEmitter = new LittleJS.ParticleEmitter(
        center, 0,                              // emitPos, emitAngle
        1, 0, 500, Math.PI,                     // emitSize, emitTime, emitRate, emiteCone
        0, vec2(16),                            // tileIndex, tileSize
        new Color(1,1,1),   new Color(0,0,0),   // colorStartA, colorStartB
        new Color(1,1,1,0), new Color(0,0,0,0), // colorEndA, colorEndB
        2, .2, .2, .1, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .99, 1, 1, Math.PI,   // damping, angleDamping, gravityScale, cone
        .05, .5, true, true         // fadeRate, randomness, collide, additive
    );
    particleEmitter.elasticity = .3; // bounce when it collides
    particleEmitter.trailScale = 2;  // stretch in direction of motion
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (LittleJS.mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(LittleJS.mousePos);

        // change particle color and set to fade out
        particleEmitter.colorStartA = new Color;
        particleEmitter.colorStartB = LittleJS.randColor();
        particleEmitter.colorEndA = particleEmitter.colorStartA.scale(1,0);
        particleEmitter.colorEndB = particleEmitter.colorStartB.scale(1,0);

        // unlock medals
        medal_example.unlock();
    }

    // move particles to mouse location if on screen
    if (LittleJS.mousePosScreen.x)
        particleEmitter.pos = LittleJS.mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background without using webgl
    LittleJS.drawRect(LittleJS.cameraPos, LittleJS.tileCollisionSize.add(vec2(5)), new Color(.2,.2,.2), 0, false);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    LittleJS.drawTextScreen('LittleJS with TypeScript', vec2(LittleJS.mainCanvasSize.x/2, 80), 80);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LittleJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');