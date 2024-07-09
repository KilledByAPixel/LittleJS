/*
    Little JS Electron Demo
    - A simple starter project
    - Builds to an executable with Electron
*/

'use strict';

// sound effects
const sound_click = new Sound([1,.5]);

// medals
const medal_example = new Medal(0, 'Example Medal', 'Welcome to LittleJS!');
medalsInit('Hello World');

// game variables
let particleEmiter;

// show the LittleJS splash screen
setShowSplashScreen(true);

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer
    initTileCollision(vec2(32, 16));
    const pos = vec2();
    const tileLayer = new TileLayer(pos, tileCollisionSize);

    // get level data from the tiles image
    const imageLevelDataRow = 1;
    const tileImage = textureInfos[0].image;
    mainContext.drawImage(tileImage, 0, 0);
    for (pos.x = tileCollisionSize.x; pos.x--;)
    for (pos.y = tileCollisionSize.y; pos.y--;)
    {
        const imageData = mainContext.getImageData(pos.x, 16*(imageLevelDataRow+1)-pos.y-1, 1, 1).data;
        if (imageData[0])
        {
            const tileIndex = 1;
            const direction = randInt(4)
            const mirror = randInt(2);
            const color = randColor();
            const data = new TileLayerData(tileIndex, direction, mirror, color);
            tileLayer.setData(pos, data);
            setTileCollisionData(pos, 1);
        }
    }
    tileLayer.redraw();

    // move camera to center of collision
    cameraPos = tileCollisionSize.scale(.5);

    // enable gravity
    gravity = -.01;

    // create particle emitter
    particleEmiter = new ParticleEmitter(
        vec2(16), 0,                            // emitPos, emitAngle
        1, 0, 500, PI,                          // emitSize, emitTime, emitRate, emiteCone
        tile(0, 16),                            // tileIndex, tileSize
        new Color(1,1,1),   new Color(0,0,0),   // colorStartA, colorStartB
        new Color(1,1,1,0), new Color(0,0,0,0), // colorEndA, colorEndB
        2, .2, .2, .1, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .99, 1, 1, PI,        // damping, angleDamping, gravityScale, cone
        .05, .5, 1, 1         // fadeRate, randomness, collide, additive
    );
    particleEmiter.elasticity = .3; // bounce when it collides
    particleEmiter.trailScale = 2;  // stretch in direction of motion
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(mousePos);

        // change particle color and set to fade out
        particleEmiter.colorStartA = new Color;
        particleEmiter.colorStartB = randColor();
        particleEmiter.colorEndA = particleEmiter.colorStartA.scale(1,0);
        particleEmiter.colorEndB = particleEmiter.colorStartB.scale(1,0);

        // unlock medals
        medal_example.unlock();
    }

    // move particles to mouse location if on screen
    if (mousePosScreen.x)
        particleEmiter.pos = mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background without using webgl
    drawRect(cameraPos, tileCollisionSize.add(vec2(5)), new Color(.2,.2,.2), 0, 0);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    drawTextScreen('LittleJS Electron Demo', vec2(mainCanvasSize.x/2, 80), 80);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);