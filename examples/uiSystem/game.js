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
const sound_click = new Sound([1,0]);

// html menu system
//let menu;
const getMenuVisible =()=> uiMenu.visible;
const setMenuVisible =(visible)=> uiMenu.visible = visible;

let uiRoot, uiMenu;

function createUI()
{
    // setup root to attach all ui elements to
    uiRoot = new UIObject(vec2(mainCanvasSize.x/2,0));
    const uiInfo = new UIText(vec2(0,50), vec2(1e3, 70), 
        'LittleJS UI System Example\nM = Toggle menu');
    uiInfo.textColor = WHITE;
    uiInfo.lineWidth = 8;
    uiRoot.addChild(uiInfo);

    // setup example menu
    uiMenu = new UIObject(vec2(0,450));
    uiRoot.addChild(uiMenu);
    const uiBackground = new UIObject(vec2(0,0), vec2(450,550));
    uiMenu.addChild(uiBackground);

    // example large text
    const textTitle = new UIText(vec2(0,-200), vec2(500, 90), 'Test Title');
    uiMenu.addChild(textTitle);
    textTitle.textColor = YELLOW;
    textTitle.lineWidth = 4;
    textTitle.lineColor = RED;

    // example multiline text
    const textTest = new UIText(vec2(-60,-120), vec2(300, 50), 'Test Text\nSecond text line.')
    uiMenu.addChild(textTest);

    // example tile image
    const tileTest = new UITile(vec2(150,-110), vec2(110), tile(3,128))
    uiMenu.addChild(tileTest);

    // example checkbox
    const checkbox = new UICheckbox(vec2(-160,0), vec2(50));
    uiMenu.addChild(checkbox);
    checkbox.onClick = ()=>
    {
        checkbox.checked = !checkbox.checked;
        console.log('Checkbox clicked');
        sound_click.play(0,.5,checkbox.checked?4:1);
    }

    // text attached to checkbox
    const checkboxText = new UIText(vec2(200,0), vec2(300, 50), 'Test Checkbox');
    checkbox.addChild(checkboxText);

    // example button
    const button1 = new UIButton(vec2(0,90), vec2(350, 70), 'Test Button', RED, 6, CYAN);
    uiMenu.addChild(button1);
    button1.onClick = ()=>
    {
        console.log('Button 1 clicked');
        sound_click.play();
    }

    // exit button
    const button2 = new UIButton(vec2(0,190), vec2(350, 70), 'Exit Menu', RED, 6, CYAN);
    uiMenu.addChild(button2);
    button2.onClick = ()=>
    {
        console.log('Button 2 clicked');
        sound_click.play(0,.5,2);
        setMenuVisible(false);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    initUISystem();
    createUI();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // center ui
    uiRoot.pos.x = mainCanvasSize.x/2;

    // menu system
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
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);