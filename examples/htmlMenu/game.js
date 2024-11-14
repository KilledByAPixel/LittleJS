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

// html menu system
let menu;
const getMenuVisible =()=> menu.style.visibility != 'hidden';
const setMenuVisible =(visible)=> menu.style.visibility = visible ? '' : 'hidden';

function createUI()
{
    // top level div for the whole page
    const uiDiv = document.createElement('div');
    document.body.appendChild(uiDiv);
    uiDiv.style.position = 'absolute';
    uiDiv.style.zIndex = '1';
    uiDiv.style.width = '100%';
    uiDiv.style.height = '100%'
    uiDiv.style.display = 'flex';
    uiDiv.style.alignItems = 'center';
    uiDiv.style.justifyContent = 'center';

    // a smaller menu div
    menu = document.createElement('div');
    menu.style.gap = '20px';
    menu.style.padding = '30px';
    menu.style.display = 'flex';
    menu.style.alignItems = 'center';
    menu.style.flexDirection = 'column';
    menu.style.border = '3px solid black';
    menu.style.backgroundColor = WHITE.toString();
    setMenuVisible(false);
    uiDiv.appendChild(menu);
    const createMenuElement = (type, html, title) =>
    {
        const element = document.createElement(type);
        element.innerHTML = html;
        element.title = title;
        return menu.appendChild(element);
    }
    {
        // heading
        const text = createMenuElement('div', '<i>Test Menu</i>');
        text.style.fontSize = '30px';
    }
    {
        // text
        createMenuElement('div', 'This is an example menu using html elements.');
    }
    {
        // input
        const input = createMenuElement('input','','Input help text');
        input.value = 'Test Input';
        input.onchange = () => alert('New text: ' + input.value);
    }
    {
        // slider
        const input = createMenuElement('input','','Slider help text');
        input.type = 'range';
        input.onchange = () => alert('New slider value: ' + input.value);
    }
    {
        // button
        const button = createMenuElement('button','Test Button','Button help text');
        button.onclick = () => alert('Button was clicked!');
    }
    {
        // exit button
        const button = createMenuElement('button','Exit Menu');
        button.onclick = () => setMenuVisible(false);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    createUI();
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
    for(let i = 0; i < 100; ++i)
    {
        const pos = vec2(30*Math.sin(i+time/9),20*Math.sin(i*i+time/9));
        drawRect(pos, vec2(2), hsl(i/9,1,.4));
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
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);