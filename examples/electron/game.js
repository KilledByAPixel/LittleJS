/*
    Little JS Starter Project
    - A simple starter project for LittleJS
    - Demos all the main engine features
    - Builds to a zip file
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);

// fix texture bleeding by shrinking tile slightly
setTileFixBleedScale(.5);

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
    // create tile collision and visible tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(32,16));

    // get level data from the tiles image
    const tileImage = textureInfos[0].image;
    mainContext.drawImage(tileImage,0,0);
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

    // create particle emitter
    particleEmitter = new ParticleEmitter(
        vec2(16,9), 0,              // emitPos, emitAngle
        0, 0, 500, PI,              // emitSize, emitTime, rate, cone
        tile(0, 16),                // tileIndex, tileSize
        hsl(1,1,1),   hsl(0,0,0),   // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0), // colorEndA, colorEndB
        2, .2, .2, .1, .05,         // time, sizeStart, sizeEnd, speed, angleSpeed
        .99, 1, 1, PI,              // damping, angleDamping, gravityScale, cone
        .05, .5, true, true         // fadeRate, randomness, collide, additive
    );
    particleEmitter.restitution = .3; // bounce when it collides
    particleEmitter.trailScale = 2;  // stretch as it moves
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

    // move particles to mouse location if on screen
    if (mousePosScreen.x)
    {
        particleEmitter.pos = mousePos;
        particleEmitter.velocity = mouseDelta.scale(.3*timeDelta);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background
    drawRect(vec2(16,8), vec2(20,14), hsl(0,0,.6));
    
    // draw the logo as a tile
    drawTile(vec2(21,5), vec2(4.5), tile(3,128));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    drawTextScreen('LittleJS Demo', 
        vec2(mainCanvasSize.x/2, 70), 80,   // position, size
        hsl(0,0,1), 6, hsl(0,0,0));         // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);