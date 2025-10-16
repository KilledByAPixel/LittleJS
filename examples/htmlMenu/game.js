/*
    Little JS HTML Menu Example Project
    - Setup a simple html menu system
    - Menu can be opened and closed
    - Pauses game when menu is visible
    - Shows several input types
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
const {vec2, hsl, tile} = LJS;

// sound effects
const sound_click = new LJS.Sound([1,.5]);

///////////////////////////////////////////////////////////////////////////////

// html menu system
const getMenuVisible = ()=> menu.style.visibility != 'hidden';
function setMenuVisible(visible)
{
    menu.style.visibility = visible ? 'visible' : 'hidden';
    LJS.setInputPreventDefault(!visible); // don't prevent default when menu is visible
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    button_test.onclick = function() { alert('Button was clicked!'); }
    button_exitMenu.onclick = function() { setMenuVisible(false); }
    input_test.onchange = function() { alert('New text: ' + this.value); }
    input_rangeTest.onchange = function() { alert('New value: ' + this.value); }
    LJS.setCanvasClearColor(hsl(0,0,.2));

    // show menu for demo
    setMenuVisible(true);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // play sound when mouse is pressed
    if (LJS.mouseWasPressed(0))
        sound_click.play(LJS.mousePos);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // open menu visibility
    if (LJS.keyWasPressed('KeyM'))
        setMenuVisible(true);

    // pause game when menu is visible
    LJS.setPaused(getMenuVisible());
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // test game rendering
    for (let i=0; i<1e3; ++i)
    {
        const time = LJS.time;
        const pos = vec2(30*LJS.sin(i+time/9),20*LJS.sin(i*i+time/9));
        LJS.drawTile(pos, vec2(2), tile(3,128), hsl(i/9,1,.4), time+i, !(i%2), hsl(i/9,1,.1,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    LJS.drawTextScreen('LittleJS HTML Menu Example\nM = Open menu', 
        vec2(LJS.mainCanvasSize.x/2, 70), 60, // position, size
        hsl(0,0,1), 6, hsl(0,0,0));           // color, outline size and color
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);