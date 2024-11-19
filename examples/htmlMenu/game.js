/*
    Little JS HTML Menu Example Project
    - Setup a simple html menu system
    - Menu can be toggled
    - Pauses game when menu is visible
    - Shows several input types
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);

// sound effects
const sound_click = new Sound([1,.5]);

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // show menu for demo
    setMenuVisible(true);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // play sound when mouse is pressed
    if (mouseWasPressed(0))
        sound_click.play(mousePos);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // pause game when menu is visible
    const menuVisible = getMenuVisible();
    paused = menuVisible;

    // toggle menu visibility
    if (keyWasPressed('KeyM'))
        setMenuVisible(!menuVisible);
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // test game rendering
    drawRect(vec2(), vec2(1e3), hsl(0,0,.2));
    for(let i=0; i<1e3; ++i)
    {
        const pos = vec2(30*Math.sin(i+time/9),20*Math.sin(i*i+time/9));
        drawTile(pos, vec2(2), tile(3,128), hsl(i/9,1,.4), time+i, !(i%2), hsl(i/9,1,.1,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    drawTextScreen('LittleJS HTML Menu Example\nM = Toggle menu', 
        vec2(mainCanvasSize.x/2, 70), 60,   // position, size
        hsl(0,0,1), 6, hsl(0,0,0));         // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);