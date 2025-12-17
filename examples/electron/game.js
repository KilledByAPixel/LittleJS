/*
    Little JS Starter Project
    - A simple starter project for LittleJS
    - Demos all the main engine features
    - Builds to a zip file
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);

// sound effects
const sound_click = new Sound([1,.5]);

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    setCanvasClearColor(GRAY);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(mousePos);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw the logo as a tile
    drawTile(vec2(sin(time)*4, 0), vec2(10), tile(3,128));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    drawTextScreen('LittleJS\nElectron Demo', 
        vec2(mainCanvasSize.x/2, 100), 80, // position, size
        hsl(0,0,1), 6, hsl(0,0,0));       // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);